import { EventEmitter, once } from 'node:events';
import { type Server } from '../server/Server.ts';
import { EntryHandler, type EntryHandlerEventMap, type onEntryEventHandler } from './EntryHandler.ts';
import { OptionsWatcher, OptionsWatcherEventMap } from './OptionsWatcher.ts';
import { loggerWithTag } from '../utility/logging/harper_logger.js';
import type { Resources } from '../resources/Resources.ts';
import type { FileAndURLPathConfig } from './Component.ts';
import { FilesOption } from './deriveGlobOptions.ts';
import { requestRestart } from './requestRestart.ts';

export class MissingDefaultFilesOptionError extends Error {
	constructor() {
		super('No default files option exists. Ensure `files` is specified in config.yaml');
		this.name = 'MissingDefaultFilesOptionError';
	}
}

/**
 * This class is what is passed to the `handleApplication` function of an extension.
 *
 * It is imperative that the instance is "ready" before its passed to the `handleApplication` function
 * so that the developer can immediately start using `scope.options`, etc.
 *
 */
export class Scope extends EventEmitter {
	#configFilePath: string;
	#directory: string;
	#name: string;
	#entryHandler?: EntryHandler;
	#entryHandlers: EntryHandler[];
	#logger: any;

	options: OptionsWatcher;
	resources: Resources;
	server: Server;
	ready: Promise<any[]>;

	constructor(name: string, directory: string, configFilePath: string, resources: Resources, server: Server) {
		super();

		this.#name = name;
		this.#directory = directory;
		this.#configFilePath = configFilePath;
		this.#logger = loggerWithTag(this.#name);

		this.resources = resources;
		this.server = server;

		this.#entryHandlers = [];

		this.ready = once(this, 'ready');

		// Create the options instance for the scope immediately
		this.options = new OptionsWatcher(name, configFilePath, this.#logger)
			.on('error', this.#handleError.bind(this))
			.on('change', this.#optionsWatcherChangeListener.bind(this)())
			.on('ready', this.#handleOptionsWatcherReady.bind(this));
	}

	get logger(): any {
		return this.#logger;
	}

	get name(): string {
		return this.#name;
	}

	get directory(): string {
		return this.#directory;
	}

	get configFilePath(): string {
		return this.#configFilePath;
	}

	#handleOptionsWatcherReady(): void {
		// This previously created the default entry handler immediately, but now we wait for the user to call `handleEntry`
		// The issue was that since the component loader was awaiting `scope.ready()` and then calling `pluginModule.handleApplication(scope)`,
		// the default entry handler could start receiving events before the plugin provided its own handler.
		// We could make the user call `await scope.ready()` in their `handleApplication` function, but that could lead to the same issue and it'd
		// be harder for the user to understand why.

		this.emit('ready');
	}

	#handleError(error: unknown): void {
		this.emit('error', error);
	}

	close() {
		for (const entryHandler of this.#entryHandlers) {
			entryHandler.close();
		}

		this.options.close();

		this.emit('close');

		this.removeAllListeners();

		return this;
	}

	#createEntryHandler(config: FilesOption | FileAndURLPathConfig): EntryHandler {
		const entryHandler = new EntryHandler(this.#name, this.#directory, config, this.#logger)
			.on('error', this.#handleError.bind(this))
			.on('add', this.#defaultEntryHandlerListener('add'))
			.on('change', this.#defaultEntryHandlerListener('change'))
			.on('unlink', this.#defaultEntryHandlerListener('unlink'))
			.on('addDir', this.#defaultEntryHandlerListener('addDir'))
			.on('unlinkDir', this.#defaultEntryHandlerListener('unlinkDir'));

		this.#entryHandlers.push(entryHandler);

		return entryHandler;
	}

	#defaultEntryHandlerListener(event: keyof EntryHandlerEventMap) {
		// eslint-disable-next-line @typescript-eslint/no-this-alias
		const scope = this;
		return function (this: EntryHandler) {
			if (this.listenerCount('all') > 0 || this.listenerCount(event) > 1) {
				return;
			}

			scope.requestRestart();
		};
	}

	#optionsWatcherChangeListener() {
		// eslint-disable-next-line @typescript-eslint/no-this-alias
		const scope = this;
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		return function handleOptionsWatcherChange(
			this: OptionsWatcher,
			// eslint-disable-next-line @typescript-eslint/no-unused-vars
			...[key, _, config]: OptionsWatcherEventMap['change']
		) {
			if (key[0] === 'files' || key[0] === 'urlPath') {
				// TODO: validate options

				// If not entry handler exists then likely the config did not have `files` initially
				// Now, it does, so create a default entry handler.
				if (!scope.#entryHandler) {
					scope.#entryHandler = scope.#createEntryHandler(config as FileAndURLPathConfig);
					return;
				}

				// Otherwise, if an entry handler exists, update it with the new config
				scope.#entryHandler.update(config as FileAndURLPathConfig);

				return;
			}

			// If the user isn't handling option changes, request a restart
			if (this.listenerCount('change') > 1) {
				return;
			}

			scope.#logger.debug(`Options changed: ${key.join('.')}, requesting restart`);
			scope.requestRestart();
		};
	}

	#getFilesOption(): FileAndURLPathConfig | undefined {
		const config = this.options.getAll();
		if (
			config &&
			typeof config === 'object' &&
			config !== null &&
			!Array.isArray(config) &&
			'files' in config /*&& validate config.files*/
		) {
			return {
				files: config.files as FilesOption,
				urlPath: config.urlPath as string | undefined,
			};
		}
		return undefined;
	}

	handleEntry(files: FilesOption | FileAndURLPathConfig, handler: onEntryEventHandler): Promise<EntryHandler>;
	handleEntry(handler: onEntryEventHandler): Promise<EntryHandler>;
	handleEntry(): Promise<EntryHandler>;
	async handleEntry(
		filesOrHandler?: FilesOption | FileAndURLPathConfig | onEntryEventHandler,
		handler?: onEntryEventHandler
	): Promise<EntryHandler> {
		// Track async operations from handlers
		const pendingOperations = new Set<Promise<void>>();

		// Wrapper to track async handler results
		const wrapHandler = (originalHandler: onEntryEventHandler): onEntryEventHandler => {
			return (entry) => {
				const result = originalHandler(entry);
				// Check if the handler returned a Promise
				if (result && typeof result === 'object' && 'then' in result && typeof result.then === 'function') {
					const tracked = (result as Promise<any>)
						.catch((error) => {
							// Log error with full details but don't let it break the tracking
							this.#logger.error?.('Error in async entry handler:', error);
						})
						.finally(() => pendingOperations.delete(tracked));
					pendingOperations.add(tracked);
				}
			};
		};

		let entryHandler: EntryHandler;

		// No arguments
		if (filesOrHandler === undefined) {
			// If entry handler already exists, return it
			if (this.#entryHandler) {
				entryHandler = this.#entryHandler;
			} else {
				// Otherwise, try to create a default entry handler using the files option
				const filesOption = this.#getFilesOption();
				if (filesOption) {
					this.#entryHandler = this.#createEntryHandler(filesOption);
					entryHandler = this.#entryHandler;
				} else {
					this.emit('error', new MissingDefaultFilesOptionError());
					return;
				}
			}
		}
		// Provided a handler function
		else if (typeof filesOrHandler === 'function') {
			const wrapped = wrapHandler(filesOrHandler);

			// If an entry handler already exists, return it with the handler attached
			if (this.#entryHandler) {
				entryHandler = this.#entryHandler.on('all', wrapped);
			} else {
				// Otherwise, try to create a default entry handler using the files option
				const filesOption = this.#getFilesOption();
				if (filesOption) {
					this.#entryHandler = this.#createEntryHandler(filesOption);
					// And attach the handler to it
					entryHandler = this.#entryHandler.on('all', wrapped);
				} else {
					this.emit('error', new MissingDefaultFilesOptionError());
					return;
				}
			}
		}
		// otherwise this is a custom config entry handler
		else {
			entryHandler = this.#createEntryHandler(filesOrHandler);
			if (handler) {
				entryHandler.on('all', wrapHandler(handler));
			}
		}

		// Wait for the entry handler to complete its initial scan
		await entryHandler.ready;

		// Wait for all async operations triggered during the initial scan to complete
		if (pendingOperations.size > 0) {
			await Promise.all(pendingOperations);
		}

		return entryHandler;
	}

	requestRestart() {
		this.#logger.debug(`Restart requested from ${this.name} scope for ${this.directory}`);
		requestRestart();
	}
}
