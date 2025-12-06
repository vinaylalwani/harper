import { RocksDatabase, type IteratorOptions } from '@harperdb/rocksdb-js';
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

	/**
	 * Get all entries matching the range
	 * @param options
	 */
	getRange(options: IteratorOptions): Iterable<any> {
		const { end } = options;
		const translatedOptions = { ...options, end: end ? [end, MAXIMUM_KEY] : end };
		return this.#store.getRange(translatedOptions).map(({ key }) => {
			return { key: key[0], value: key[1] };
		});
	}
}
