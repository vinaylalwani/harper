import { RocksDatabase, type IteratorOptions } from '@harperfast/rocksdb-js';
import { Id } from './ResourceInterface.ts';
import { MAXIMUM_KEY } from 'ordered-binary';
export class RocksIndexStore {
	#store: RocksDatabase;
	constructor(store: RocksDatabase) {
		this.#store = store;
	}

	/**
	 * Translate a put with indexed value and primary key to an underlying put
	 * @param indexedValue - ignored, only used by LMDB
	 * @param primaryKey
	 * @param txnId
	 */
	put(indexedValue: any, primaryKey: Id, options: any) {
		return this.#store.putSync([indexedValue, primaryKey], null, options);
	}

	putSync(indexedValue: any, primaryKey: Id, options: any) {
		return this.#store.putSync([indexedValue, primaryKey], null, options);
	}

	remove(indexedValue: any, primaryKey: Id, options: any) {
		return this.#store.removeSync([indexedValue, primaryKey], null, options);
	}

	removeSync(indexedValue: any, primaryKey: Id, options: any) {
		return this.#store.removeSync([indexedValue, primaryKey], null, options);
	}

	getValuesCount(indexedValue: any) {
		return this.#store.getKeysCount({ start: indexedValue, end: [indexedValue, MAXIMUM_KEY] });
	}

	getKeysCount() {
		return this.#store.getKeysCount();
	}

	/**
	 * Get all entries matching the range
	 * @param options
	 */
	getRange(options: IteratorOptions): Iterable<any> {
		let { start, end, exclusiveStart, inclusiveEnd, reverse } = options;
		if ((reverse ? !exclusiveStart : exclusiveStart) && start !== undefined) {
			start = [start, MAXIMUM_KEY];
		}
		if ((reverse ? !inclusiveEnd : inclusiveEnd) && end !== undefined) {
			end = [end, MAXIMUM_KEY];
		}
		const translatedOptions = { ...options, start, end };
		return this.#store.getRange(translatedOptions).map(({ key }) => {
			return { key: key[0], value: key.length > 2 ? key.slice(1) : key[1] };
		});
	}
}
