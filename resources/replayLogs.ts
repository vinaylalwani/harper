import { RocksDatabase, TransactionLogReader } from '@harperdb/rocksdb-js';
import { readAuditEntry } from './auditStore.ts';
import { tables } from './databases.ts';
import { Resource } from './Resource.ts';
import { recordUpdater } from './RecordEncoder.ts';
import * as logger from '../utility/logging/harper_logger.js';
import { INVALIDATED } from './Table.ts';

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
				for (const { timestamp, data } of log.query({ start: 0, readUncommitted: true })) {
					try {
						const auditEntry = readAuditEntry(data);
						const { type, tableId, nodeId, recordId, version, residencyId, expiresAt, originatingOperation, user } =
							auditEntry;
						const table = tableById.get(tableId);
						const context = { nodeId, alreadyLogged: true, version };
						const { primaryStore, auditStore } = table;
						const record = auditEntry.getValue(primaryStore);
						const update = recordUpdater(primaryStore, tableId, auditStore);
						primaryStore.transactionSync((transaction) => {
							const options = { transaction, context, residencyId, expiresAt, originatingOperation };

							switch (type) {
								case 'put':
								case 'patch':
								case 'delete':
									update(recordId, record, null, version, 0, false, options);
									break;
								case 'invalidate':
									update(recordId, record, null, version, INVALIDATED, false, options);
									break;
								case 'structures':
									primaryStore.putSync(
										Symbol.for('structures'),
										asBinary(auditEntry.getBinaryValue(primaryStore)),
										options
									);
							}
						});
					} catch (err) {
						logger.error(`Error writing from replay of log ${logName}`, err, {
							timestamp,
						});
					}
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
