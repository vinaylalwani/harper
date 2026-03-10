import type { RocksDatabase } from '@harperfast/rocksdb-js';
import type { Database, RootDatabase } from 'lmdb';

export interface LMDBDatabase extends Database {
	customIndex?: any;
	isIndexing?: boolean;
	indexNulls?: boolean;
}

export interface LMDBRootDatabase extends RootDatabase {
	auditStore?: LMDBRootDatabase;
	databaseName?: string;
	dbisDb?: LMDBDatabase;
	isLegacy?: boolean;
	needsDeletion?: boolean;
	path?: string;
	status?: 'open' | 'closed';
}

export interface RocksDatabaseEx extends RocksDatabase {
	customIndex?: any;
	env: Record<string, any>;
	isLegacy?: boolean;
	isIndexing?: boolean;
	indexNulls?: boolean;
	getEntry?: (id: string | number | (string | number)[] | Buffer, options?: any) => { value: any };
}

export interface RocksRootDatabase extends RocksDatabaseEx {
	auditStore?: RocksDatabaseEx;
	databaseName?: string;
	dbisDb?: RocksDatabaseEx;
}

export type DBI =
	| LMDBDatabase
	| (RocksDatabase & {
			customIndex?: any;
			isIndexing?: boolean;
			indexNulls?: boolean;
			rootStore?: RocksRootDatabase;
	  });
