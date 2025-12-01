import { type TransactionLog, RocksDatabase } from '@harperdb/rocksdb-js';
export class RocksAuditStore {
	log: TransactionLog;
	nodeLogs?: TransactionLog[]; // whatever the type of the read logger
	rootStore: RocksDatabase;
	reusableIterable = true; // flag indicating that iterable can be reused to resume iterating through audit log
	constructor(rootDatabase: RocksDatabase) {
		this.log = rootDatabase.useLog('local');
		this.rootStore = rootDatabase;
	}

	/**
	 * Translate a put to an addEntry
	 * @param suggestedKey - ignored, only used by LMDB
	 * @param entry
	 * @param txnId
	 */
	put(suggestedKey: any, entry: Buffer, options: any) {
		const nodeId = options.nodeId;
		const log = nodeId ? (this.nodeLogs[nodeId] ?? this.loadLogs()[nodeId]) : this.log;
		log.addEntry(entry, options.transaction.id);
	}

	putSync(suggestedKey: any, value: any, options: any) {
		if (typeof suggestedKey === 'symbol') {
			this.rootStore.putSync(suggestedKey, value, options);
		} else {
			const nodeId = options.nodeId;
			const log = nodeId ? (this.nodeLogs[nodeId] ?? this.loadLogs()[nodeId]) : this.log;
			log.addEntry(value, options.transaction.id);
		}
	}
	get(key: any) {
		return this.getSync(key);
	}
	getSync(key: any) {
		if (typeof key === 'number') {
			// this a request for a transaction log entry by a timestamp
			for (const entry of this.getRange({ start: key, end: key })) {
				return entry.value;
			}
		} else {
			// Harper puts some metadata in the database, we will just put this in the root store instead
			return this.rootStore.getSync(key);
		}
	}
	getEntry() {
		throw new Error('Not implemented');
	}
	loadLogs() {
		this.nodeLogs = [];
		for (const logName of this.rootStore.listLogs()) {
			const nodeId = server.replication.exportIdMapping()?.[logName] ?? 0;
			this.nodeLogs[nodeId] ??= this.rootStore.useLog(logName);
		}
		return this.nodeLogs;
	}

	/**
	 * Get all entries matching the range, from all the transaction logs, sorted by timestamp
	 * @param options
	 */
	getRange(options: { start?: number; end?: number; log?: string; onlyKeys: boolean } = {}): Iterable<any> {
		if (options.log) {
			const matchName = (readLog) => readLog.name === options.log;
			const log = this.nodeLogs.find(matchName) || this.loadLogs().find(matchName);
			return log?.query(options);
		}
		const onlyKeys = options.onlyKeys;
		const iterators = (this.nodeLogs || this.loadLogs()).map((log) => log.query(options)[Symbol.iterator]());
		// get the earliest entry from each iterator
		const nextEntries = iterators.map((iterator) => iterator.next());
		const aggregateIterator = {
			next() {
				let earliest: any;
				let earliestIndex = -1;
				for (let i = 0; i < nextEntries.length; i++) {
					const result = nextEntries[i];
					// skip any that are done
					if (result.done) {
						// remove the entry from the list, so we don't keep hitting it
						nextEntries.splice(i--, 1);
						continue;
					}
					// find the earliest one that is not done
					const next = result.value;
					if (!earliest || earliest.timestamp < next.timestamp) {
						earliest = next;
						earliestIndex = i;
					}
				}
				if (earliestIndex >= 0) {
					// replace the entry with the next one from the iterator we pulled from
					nextEntries[earliestIndex] = iterators[earliestIndex].next();
					return {
						value: onlyKeys ? earliest.timestamp : { key: earliest.timestamp, value: earliest.data },
						done: false,
					};
				} // else we are done
				return { value: undefined, done: true };
			},
		};
		return {
			[Symbol.iterator]() {
				return aggregateIterator;
			},
			[Symbol.asyncIterator]() {
				return aggregateIterator;
			},
		};
	}
	getKeys(options) {
		return []; // TODO: implement this
		options.onlyKeys = true;
		return this.getRange(options);
	}
}
