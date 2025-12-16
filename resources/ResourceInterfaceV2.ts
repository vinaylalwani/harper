import type { RecordObject } from './RecordEncoder.ts';
import { RequestTarget } from './RequestTarget.ts';
import {
	RequestTargetOrId,
	ResourceInterface,
	Subscription,
	SubscriptionRequest,
	UpdatableRecord,
} from './ResourceInterface.ts';

// @ts-expect-error We changed the interface in v2 with breaking changes (by flipping target and newRecord/record)
export interface ResourceInterfaceV2<Record extends object = any> extends ResourceInterface<Record> {
	get?(
		target?: RequestTargetOrId
	):
		| (Record & Partial<RecordObject>)
		| Promise<Record & Partial<RecordObject>>
		| AsyncIterable<Record & Partial<RecordObject>>
		| Promise<AsyncIterable<Record & Partial<RecordObject>>>;
	search?(target: RequestTarget): AsyncIterable<Record & Partial<RecordObject>>;

	create?(
		target: RequestTargetOrId,
		newRecord: Partial<Record & RecordObject>
	): void | (Record & Partial<RecordObject>) | Promise<Record & Partial<RecordObject>>;
	post?(
		target: RequestTargetOrId,
		newRecord: Partial<Record & RecordObject>
	): void | (Record & Partial<RecordObject>) | Promise<Record & Partial<RecordObject>>;

	put?(
		target: RequestTargetOrId,
		record: Record & RecordObject
	): void | (Record & Partial<RecordObject>) | Promise<void | (Record & Partial<RecordObject>)>;
	patch?(
		target: RequestTargetOrId,
		record: Partial<Record & RecordObject>
	): void | (Record & Partial<RecordObject>) | Promise<void | (Record & Partial<RecordObject>)>;
	update?(updates: Record & RecordObject, fullUpdate: true): ResourceInterface<Record & Partial<RecordObject>>;
	update?(
		updates: Partial<Record & RecordObject>,
		fullUpdate?: boolean
	):
		| ResourceInterface<Record & Partial<RecordObject>>
		| Promise<ResourceInterface<Record & Partial<RecordObject>> | UpdatableRecord<Record & Partial<RecordObject>>>;

	delete?(target: RequestTargetOrId): boolean | Promise<boolean>;

	invalidate(target: RequestTargetOrId): void | Promise<void>;

	publish?(target: RequestTargetOrId, record: Record): void;
	subscribe?(request: SubscriptionRequest): Promise<Subscription<Record & RecordObject>>;

	doesExist(): boolean;
	wasLoadedFromSource(): boolean | void;
}
