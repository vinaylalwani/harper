import type { Database } from 'lmdb';
import type { Context, Id, ResourceInterface, ResourceStaticInterface } from './ResourceInterface.ts';
import type { DBI } from './DatabaseInterface.ts';

export interface TableInterface<Record extends object = any> extends ResourceInterface<Record> {
	attributes: Attribute[];
	auditStore: Database;
	databaseName: string;
	databasePath: string;
	expirationMS: number;
	indexingOperations?: Promise<void>;
	indices: {};
	origin?: string;
	primaryKey: string;
	primaryStore: Database;
	replicate?: boolean;
	schemaVersion?: number;
	source?: new () => ResourceInterface;
	splitSegments?: boolean;
	tableName: string;
	Transaction: TableInterface;

	getExpiresAt(): number;
	getUpdatedTime(): number;
}

export interface Attribute {
	assignCreatedTime?: boolean;
	assignUpdatedTime?: boolean;
	computed?: unknown;
	dbi: DBI;
	elements?: Attribute;
	expiresAt?: boolean;
	indexed?: unknown;
	indexingPID?: number;
	isPrimaryKey?: boolean;
	key: string;
	lastIndexedKey: string;
	name: string;
	nullable?: boolean;
	properties?: Array<Attribute>;
	relationship?: unknown;
	resolve?: (id: Id) => any;
	type: 'ID' | 'Int' | 'Float' | 'Long' | 'String' | 'Boolean' | 'Date' | 'Bytes' | 'Any' | 'BigInt' | 'Blob' | string;
}

export interface Index {
	clear: () => Promise<void>;
	clearAsync?: () => void;
	customIndex?: {
		index: (id: Id, value: unknown, existingValue?: unknown, options?: unknown) => void;
		propertyResolver: (value: unknown, context: Context, entry: unknown) => unknown;
	};
	drop: () => void;
	getRange: (options: { start: boolean; values: boolean; end: number; snapshot: boolean }) => void;
	getValues: (key: Id) => Id[];
	indexNulls: boolean;
	isIndexing: boolean;
	prefetch?: (valuesToPrefetch, noop) => void;
	put: (valueToAdd, id: Id, options?: unknown) => unknown;
	remove: (valueToRemove, id: Id, options?: unknown) => void;
}

export interface TableStaticInterface<Record extends object = any> extends ResourceStaticInterface<Record> {
	new (identifier?: Id, source?: TableInterface<Record> & TableStaticInterface<Record>): TableInterface<Record>;

	attributes: Attribute[];
	audit: boolean;
	auditStore: Database;
	createdTimeProperty: Attribute;
	databaseName: string;
	databasePath: string;
	dbisDB: DBI;
	expirationMS: number;
	getResidencyById: (id: Id) => number | void;
	indexingOperation?: Promise<void>;
	indices: Map<string, Index>;
	intermediateSource: boolean;
	name: string;
	origin?: string;
	primaryKey: string;
	primaryStore: Database;
	propertyResolvers: any;
	replicate: boolean;
	schemaDefined: boolean;
	schemaVersion?: number;
	sealed: boolean;
	source?: TableInterface<Record> & TableStaticInterface<Record>;
	sourceOptions?: ExpirationOptions & IntermediateSourceOptions;
	splitSegments: boolean;
	tableId: number;
	tableName: string;
	updatedTimeProperty: Attribute;
	userResolvers: any;

	cleanup(): void;
	clear(): unknown;
	dropTable(): Promise<void>;
	evict(id: Id, existingRecord: unknown, existingVersion: unknown): unknown;
	operation(operation: unknown, context: Context): unknown;

	addAttributes(attributesToAdd: Attribute[]): Promise<void>;
	updatedAttributes(): void;
	coerceId(id: Id): Id;
	enableAuditing(value?: boolean): void;
	getAuditSize(): number;
	getRecordCount(options?: {
		exactCount?: boolean;
	}): Promise<number | { recordCount: number; estimatedRange: number[] }>;
	getResource(target: any, request: Context, resourceOptions: any): Promise<TableInterface>;
	getSize(): number;
	getNewId(): Id;
	isCaching(): boolean;
	getStorageStats(): { available: number; free: number; size: number };
	removeAttributes(names: string[]): Promise<void>;
	setTTLExpiration(expiration: ExpirationParam): void;
	sourcedFrom(
		source: TableInterface<Record> & TableStaticInterface<Record>,
		options?: ExpirationOptions & IntermediateSourceOptions
	): void;
}

export type ExpirationParam = number | ExpirationOptions;
export type ExpirationOptions = { expiration: number; eviction?: number; scanInterval?: number };
export type IntermediateSourceOptions = { intermediateSource?: boolean };
