import { RocksDatabase, Transaction as RocksTransaction } from '@harperdb/rocksdb-js';
import { readAuditEntry } from './auditStore.ts';
import { Resource } from './Resource.ts';
import type { Context } from './ResourceInterface.ts';
import * as logger from '../utility/logging/harper_logger.js';
import { DatabaseTransaction } from './DatabaseTransaction.ts';

export function replayLogs(rootStore: RocksDatabase, tables: any): Promise<void> {
	return new Promise((resolve, reject) => {
		const acquired = rootStore.tryLock('replayLogs', async () => {
			resolve();
		});
		if (!acquired) return;
		const tableById = new Map<number, typeof Resource>();
		for (const tableName in tables) {
			const table = tables[tableName];
			tableById.set(table.tableId, table);
		}
		rootStore.listLogs().forEach((logName) => {
			// replay each log
			try {
				const log = rootStore.useLog(logName);
				let transaction: DatabaseTransaction;
				let lastTimestamp = 0;
				for (const { timestamp, data } of log.query({ start: 0, readUncommitted: true })) {
					try {
						const auditEntry = readAuditEntry(data);
						const { type, tableId, nodeId, recordId, version, residencyId, expiresAt, originatingOperation, user } =
							auditEntry;
						const Table = tableById.get(tableId);
						const context: Context = { nodeId, alreadyLogged: true, version, expiresAt, user };
						const { primaryStore, auditStore } = Table;
						const tableInstance = Table.getResource(null, context, {});
						// TODO: If this throws an error due to being unable to access structures, we need to iterate through
						// other transaction logs to get the latest structure. Ultimately we may have to skip records
						const record = auditEntry.getValue(primaryStore);
						if (lastTimestamp !== timestamp) {
							lastTimestamp = timestamp;
							try {
								transaction?.transaction?.commitSync();
							} catch (error) {
								logger.error('Error committing replay transaction', error);
							}
							transaction = new DatabaseTransaction();
							transaction.db = primaryStore;
							transaction.timestamp = timestamp;
						}
						context.transaction = transaction;
						const options = { context, residencyId, nodeId, originatingOperation, replay: true };

						switch (type) {
							case 'put':
								tableInstance._writeUpdate(recordId, record, true, options);
								break;
							case 'patch':
								tableInstance._writeUpdate(recordId, record, false, options);
								break;
							case 'delete':
								tableInstance._writeDelete(recordId, options);
								break;
							case 'invalidate':
								tableInstance._writeInvalidate(recordId, record, options);
								break;
							case 'structures': {
								const rocksTransaction = new RocksTransaction(primaryStore.store);
								const structuresAsBinary = auditEntry.getBinaryValue(primaryStore);
								const updatedStructures = structuresAsBinary
									? primaryStore.decoder.decode(structuresAsBinary)
									: undefined;
								const existingStructures = primaryStore.getSync(Symbol.for('structures'), {
									transaction: rocksTransaction,
								});
								if (existingStructures) {
									if (existingStructures instanceof Array) {
										if (updatedStructures.length < existingStructures.length) {
											logger.warn(
												`Found ${existingStructures.length} structures in audit store, but ${updatedStructures.length} in replay log. Using ${updatedStructures.length} structures.`
											);
										}
									} else {
										if (existingStructures.get('named').length > updatedStructures.get('named').length) {
											logger.warn(
												`Found named ${existingStructures.length} structures in audit store, but ${updatedStructures.length} in replay log. Using named ${updatedStructures.length} structures.`
											);
										}
										if (existingStructures.get('typed').length > updatedStructures.get('typed').length) {
											logger.warn(
												`Found named ${existingStructures.length} structures in audit store, but ${updatedStructures.length} in replay log. Using named ${updatedStructures.length} structures.`
											);
										}
									}
								}
								primaryStore.putSync(Symbol.for('structures'), asBinary(structuresAsBinary), {
									transaction: rocksTransaction,
								});
								rocksTransaction.commitSync();
								primaryStore.decoder.structure = updatedStructures;
							}
						}
					} catch (err) {
						logger.error(`Error writing from replay of log ${logName}`, err, {
							timestamp,
						});
					}
				}
				try {
					transaction?.transaction?.commitSync();
				} catch (error) {
					logger.error('Error committing replay transaction', error);
				}
			} catch (err) {
				logger.error(`Error reading replay from log ${logName}`, err);
			}
		});
		console.log('Replay complete');
		// we never actually release the lock because we only want to ever run one time
		// rootStore.unlock('replayLogs');
	});
}
function asBinary(buffer) {
	return { ['\x10binary-data\x02']: buffer };
}
