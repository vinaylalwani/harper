/**
 * The response object from `delete_transaction_logs_before` operation API.
 */
export class DeleteTransactionLogsBeforeResults {
	start_timestamp?: number;
	end_timestamp?: number;
	transactions_deleted: number;

	/**
	 * @param {number} startTimestamp
	 * @param {number} endTimestamp
	 * @param {number} transactionsDeleted
	 */
	constructor(startTimestamp?: number, endTimestamp?: number, transactionsDeleted = 0) {
		this.start_timestamp = startTimestamp;
		this.end_timestamp = endTimestamp;
		this.transactions_deleted = transactionsDeleted;
	}
}
