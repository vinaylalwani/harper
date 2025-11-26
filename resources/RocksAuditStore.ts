import { type TransactionLog, RocksDatabase, TransactionLogReader } from '@harperdb/rocksdb-js';
export class RocksAuditStore {
	log: TransactionLog;
	readLogs?: TransactionLogReader[]; // whatever the type of the read logger
	rootStore: RocksDatabase;
	constructor(rootDatabase: RocksDatabase) {
		this.log = rootDatabase.useLog(0);
		this.logReader = new TransactionLogReader(this.log);
		this.rootStore = rootDatabase;
	}

	/**
	 * Translate a put to an addEntry
	 * @param suggestedKey - ignored, only used by LMDB
	 * @param entry
	 * @param txnId
	 */
	put(suggestedKey: any, entry: Buffer, options: any) {
		this.log.addEntry(entry, options.transaction.id);
	}
	putSync(suggestedKey: any, value: any, options: any) {
		if (typeof suggestedKey === 'symbol') {
			this.rootStore.putSync(suggestedKey, value, options);
		} else {
			this.log.addEntry(value, options.transaction.id);
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

	/**
	 * Get all entries matching the range, from all the transaction logs, sorted by timestamp
	 * @param options
	 */
	getRange(options: { start?: number; end?: number; log?: string; onlyKeys: boolean } = {}): Iterable<any> {
		if (!this.readLogs) {
			this.readLogs = this.rootStore
				.listLogs()
				.map((logName) => new TransactionLogReader(this.rootStore.useLog(logName)));
		}
		if (options.log) {
			return this.readLogs.find((readLog) => readLog.name === options.log)?.query(options);
		}
		const onlyKeys = options.onlyKeys;
		const iterators = this.readLogs.map((log) => log.query(options)[Symbol.iterator]());
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
