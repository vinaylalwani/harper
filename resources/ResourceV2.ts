import { _assignPackageExport } from '../globals.js';
import type { RecordObject } from './RecordEncoder.js';
import { Resource } from './Resource.ts';
import { RequestTargetOrId } from './ResourceInterface.ts';

/**
 * This is the main class that can be extended for any resource in HarperDB and provides the essential reusable
 * uniform interface for interacting with data, defining the API for providing data (data sources) and for consuming
 * data. This interface is used pervasively in HarperDB and is implemented by database tables and can be used to define
 * sources for caching, real-data sources for messaging protocols, and RESTful endpoints, as well as any other types of
 * data aggregation, processing, or monitoring.
 *
 * This base Resource class provides a set of static methods that are main entry points for querying and updating data
 * in resources/tables. The static methods provide the default handling of arguments, context, and ensuring that
 * internal actions are wrapped in a transaction. The base Resource class intended to be extended, and the instance
 * methods can be overridden to provide specific implementations of actions like get, put, post, delete, and subscribe.
 */
export class ResourceV2<Record extends object = any> extends Resource<Record> {
	static loadAsInstance: boolean = false;

	get?(
		target?: RequestTargetOrId
	):
		| (Record & Partial<RecordObject>)
		| Promise<Record & Partial<RecordObject>>
		| AsyncIterable<Record & Partial<RecordObject>>
		| Promise<AsyncIterable<Record & Partial<RecordObject>>>;

	search?(target: RequestTargetOrId): AsyncIterable<Record & Partial<RecordObject>>;

	// @ts-expect-error We swapped the order of target and newRecord.
	create?(
		target: RequestTargetOrId,
		newRecord: Partial<Record & RecordObject>
	): void | (Record & Partial<RecordObject>) | Promise<Record & Partial<RecordObject>>;

	// @ts-expect-error In v2, we're adjusting the types.
	post(
		target: RequestTargetOrId,
		newRecord: Partial<Record & RecordObject>
	): void | (Record & Partial<RecordObject>) | Promise<Record & Partial<RecordObject>> {
		return super.post(target, newRecord);
	}

	// @ts-expect-error We swapped the order of target and record.
	put?(
		target: RequestTargetOrId,
		record: Record & RecordObject
	): void | (Record & Partial<RecordObject>) | Promise<void | (Record & Partial<RecordObject>)>;

	// @ts-expect-error We swapped the order of target and record.
	patch?(
		target: RequestTargetOrId,
		record: Partial<Record & RecordObject>
	): void | (Record & Partial<RecordObject>) | Promise<void | (Record & Partial<RecordObject>)>;

	delete?(target: RequestTargetOrId): boolean | Promise<boolean>;
	invalidate?(target: RequestTargetOrId): void | Promise<void>;

	publish?(target: RequestTargetOrId, record: Record): void;
}

_assignPackageExport('ResourceV2', ResourceV2);
