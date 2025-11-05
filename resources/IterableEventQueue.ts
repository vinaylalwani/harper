import { EventEmitter } from 'events';

export class IterableEventQueue<Record extends object = any> extends EventEmitter {
	resolveNext: null | ((args: { value: Record }) => void) = null;
	queue: any[];
	hasDataListeners: boolean;
	drainCloseListener: boolean;
	currentDrainResolver: null | ((draining: boolean) => void) = null;
	[Symbol.asyncIterator](): AsyncIterator<Record> {
		const iterator = new EventQueueIterator<Record>();
		iterator.queue = this;
		// @ts-expect-error The EventQueueIterator is acceptable as an AsyncIterator
		return iterator;
	}
	push(message: Record) {
		this.send(message);
	}
	send(message: Record) {
		if (this.resolveNext) {
			this.resolveNext({ value: message });
			this.resolveNext = null;
		} else if (this.hasDataListeners) {
			this.emit('data', message);
		} else {
			if (!this.queue) this.queue = [];
			this.queue.push(message);
		}
	}
	getNextMessage() {
		const message = this.queue?.shift();
		if (!message) this.emit('drained');
		return message;
	}

	/**
	 * Wait for the queue to be drained, resolving to true to continue or false if the queue was closed before draining.
	 */
	waitForDrain(): Promise<boolean> {
		return new Promise((resolve) => {
			if (!this.queue || this.queue.length === 0) resolve(true);
			else {
				this.once('drained', () => resolve(true));
				this.currentDrainResolver = resolve;
				if (!this.drainCloseListener) {
					this.drainCloseListener = true;
					this.on('close', () => {
						this.currentDrainResolver?.(false);
					});
				}
			}
		});
	}
	on(eventName: 'data' | string, listener: ((data: Record) => void) | any) {
		if (eventName === 'data' && !this.hasDataListeners) {
			this.hasDataListeners = true;
			while (this.queue?.length > 0) listener(this.queue.shift());
		}
		return super.on(eventName, listener);
	}
}

class EventQueueIterator<Record extends object = any> implements AsyncIterator<Record> {
	queue: IterableEventQueue<Record>;
	push(message: Record) {
		this.queue.send(message);
	}
	// @ts-expect-error TypeScript is wrong, the JS engine accepts MaybePromise<...>
	next(): { value: Record } | Promise<{ value: Record }> {
		const message = this.queue.getNextMessage();
		if (message) {
			return {
				value: message,
			};
		} else {
			return new Promise((resolve) => (this.queue.resolveNext = resolve));
		}
	}
	// @ts-expect-error TypeScript is wrong, the JS engine accepts MaybePromise<...>
	return(value: Record): { value: Record, done: true } {
		this.queue.emit('close');
		return {
			value,
			done: true,
		};
	}
	// @ts-expect-error TypeScript is wrong, the JS engine accepts MaybePromise<...>
	throw(error) {
		this.queue.emit('close', error);
		return {
			done: true,
			value: undefined,
		};
	}
}
