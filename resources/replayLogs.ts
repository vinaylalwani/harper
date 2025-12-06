import { RocksDatabase, Transaction } from '@harperdb/rocksdb-js';
import { readAuditEntry } from './auditStore.ts';
import { tables } from './databases.ts';
import { Resource } from './Resource.ts';
import type { Context } from './ResourceInterface.ts';
import { recordUpdater } from './RecordEncoder.ts';
import * as logger from '../utility/logging/harper_logger.js';
import { INVALIDATED } from './Table.ts';
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
						const record = auditEntry.getValue(primaryStore);
						if (lastTimestamp !== timestamp) {
							lastTimestamp = timestamp;
							try {
								transaction?.transaction?.commitSync();
							} catch (error) {
								logger.error('Error committing replay transaction', error);
							}
							transaction = new DatabaseTransaction();
							transaction.store = primaryStore;
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
								const rocksTransaction = new Transaction(primaryStore.store);
								primaryStore.putSync(Symbol.for('structures'), asBinary(auditEntry.getBinaryValue(primaryStore)), {
									transaction: rocksTransaction,
								});
								rocksTransaction.commitSync();
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
		// we never actually release the lock because we only want to ever run one time
		// rootStore.unlock('replayLogs');
	});
}
function asBinary(buffer) {
	return { ['\x10binary-data\x02']: buffer };
}
