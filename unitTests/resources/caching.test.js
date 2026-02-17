require('../testUtils');
const assert = require('assert');
const { setupTestDBPath } = require('../testUtils');
const { table } = require('#src/resources/databases');
const { Resource } = require('#src/resources/Resource');
const { setMainIsWorker } = require('#js/server/threads/manageThreads');
const { transaction } = require('#src/resources/transaction');
const { RequestTarget } = require('#src/resources/RequestTarget');
describe('Caching', () => {
	let CachingTable,
		IndexedCachingTable,
		CachingTableStaleWhileRevalidate,
		Source,
		sourceRequests = 0,
		sourceResponses = 0;
	let events = [];
	let timer = 0;
	let return_value = true;
	let return_error;
	before(async function () {
		setupTestDBPath();
		setMainIsWorker(true); // TODO: Should be default until changed
		CachingTable = table({
			table: 'CachingTable',
			database: 'test',
			attributes: [{ name: 'id', isPrimaryKey: true }, { name: 'name' }],
		});
		IndexedCachingTable = table({
			table: 'IndexedCachingTable',
			database: 'test',
			attributes: [
				{ name: 'id', isPrimaryKey: true },
				{ name: 'name', indexed: true },
			],
		});
		Source = class extends Resource {
			get() {
				let expiresAt = Date.now() + 2;
				console.log('Expiration at: ' + expiresAt);
				this.getContext().expiresAt = expiresAt;
				return new Promise((resolve, reject) => {
					setTimeout(() => {
						sourceRequests++;
						if (return_error) {
							let error = new Error('test source error');
							error.statusCode = return_error;
							reject(error);
						}
						resolve(
							return_value && {
								id: this.getId(),
								name: 'name ' + this.getId(),
							}
						);
					}, timer);
				});
			}
		};

		CachingTable.sourcedFrom({
			get(id) {
				return new Promise((resolve) => {
					sourceRequests++;
					setTimeout(() => {
						sourceResponses++;
						resolve(
							return_value && {
								id,
								name: 'name ' + id,
							}
						);
					}, timer);
				});
			},
		});
		IndexedCachingTable.sourcedFrom(Source);
		let subscription = await CachingTable.subscribe({});

		subscription.on('data', (event) => {
			events.push(event);
		});
		CachingTableStaleWhileRevalidate = class extends CachingTable {
			allowStaleWhileRevalidate(entry, id) {
				return true;
			}
		};
	});
	it('Has isCaching flag', async function () {
		assert(CachingTable.isCaching);
		assert(IndexedCachingTable.isCaching);
		assert(!Source.isCaching);
	});
	it('Can load cached data', async function () {
		sourceRequests = 0;
		events = [];
		CachingTable.setTTLExpiration(0.01);
		await CachingTable.invalidate(23);
		let result = await CachingTable.get(23);
		assert.equal(result.id, 23);
		assert.equal(result.name, 'name ' + 23);
		assert.equal(sourceRequests, 1);
		await new Promise((resolve) => setTimeout(resolve, 5));
		let target23 = new RequestTarget();
		target23.id = 23;
		result = await CachingTable.get(target23);
		assert.equal(target23.loadedFromSource, false);
		assert.equal(result.id, 23);
		assert.equal(sourceRequests, 1);
		// let it expire
		await new Promise((resolve) => setTimeout(resolve, 10));
		result = await CachingTable.get(target23);
		assert.equal(result.id, 23);
		assert.equal(result.name, 'name ' + 23);
		assert.equal(sourceRequests, 2);
		if (events.length > 0) console.log(events);
		//assert.equal(events.length, 0);
		await CachingTable.put(23, { name: 'expires in past' }, { expiresAt: 0 });
		result = await CachingTable.get(target23);
		assert.equal(sourceRequests, 3);
		assert.equal(target23.loadedFromSource, true);
	});

	it('Cache stampede is handled', async function () {
		try {
			CachingTable.setTTLExpiration(0.01);
			await new Promise((resolve) => setTimeout(resolve, 15));
			CachingTable.setTTLExpiration(40);
			await new Promise((resolve) => setTimeout(resolve, 5));
			sourceRequests = 0;
			events = [];
			timer = 10;
			CachingTable.get(23);
			while (sourceRequests === 0) {
				await new Promise((resolve) => setTimeout(resolve, 1));
			}
			await CachingTable.primaryStore.committed; // wait for the record to update to updating status
			CachingTable.get(23);
			let result = await CachingTable.get(23);
			assert.equal(result.id, 23);
			assert.equal(result.name, 'name ' + 23);
			assert(sourceRequests <= 1);
		} finally {
			timer = 0;
		}
	});
	it('Cache invalidation triggers updates', async function () {
		CachingTable.setTTLExpiration(0.005);
		await new Promise((resolve) => setTimeout(resolve, 10));
		CachingTable.setTTLExpiration(50);
		let result = await CachingTable.get(23);
		assert.equal(result.id, 23);
		assert.equal(result.name, 'name ' + 23);
		sourceRequests = 0;
		events = [];
		CachingTable.invalidate(23);
		await new Promise((resolve) => setTimeout(resolve, 20));
		let target23 = new RequestTarget();
		target23.id = 23;
		result = await CachingTable.get(target23);
		assert.equal(target23.loadedFromSource, true);
		await new Promise((resolve) => setTimeout(resolve, 10));
		assert.equal(result.id, 23);
		assert.equal(sourceRequests, 1);
		if (events.length > 2) console.log(events);
		assert(events.length <= 2);

		sourceRequests = 0;
		events = [];
		CachingTable.invalidate(23); // show not load from cache
		await new Promise((resolve) => setTimeout(resolve, 20));
		assert.equal(sourceRequests, 0);
		assert.equal(events.length, 1);

		await new Promise((resolve) => setTimeout(resolve, 20));
		result = await CachingTable.get(23);
		await new Promise((resolve) => setTimeout(resolve, 10));
		assert.equal(result.id, 23);
		assert.equal(sourceRequests, 1);
		assert(events.length <= 2);
	});

	it('Handles distinct eviction time', async function () {
		CachingTable.setTTLExpiration({
			expiration: 0.005,
			eviction: 0.01,
		});
		CachingTable.invalidate(23); // reset the entry
		await new Promise((resolve) => setTimeout(resolve, 10));
		await CachingTable.get(23);
		sourceRequests = 0;
		events = [];
		await new Promise((resolve) => setTimeout(resolve, 10));
		let result = CachingTable.primaryStore.getSync(23);
		assert(result); // should exist in database even though it is expired
		await new Promise((resolve) => setTimeout(resolve, 20));
		result = CachingTable.primaryStore.getSync(23);
		assert(!result); // should be evicted and no longer exist in database
	});

	it('Allows stale-while-revalidate', async function () {
		CachingTable.setTTLExpiration({
			expiration: 0.005,
			eviction: 0.01,
		});
		CachingTable.invalidate(23); // reset the entry
		await new Promise((resolve) => setTimeout(resolve, 10));
		await CachingTable.get(23);
		sourceRequests = 0;
		sourceResponses = 0;
		events = [];
		await new Promise((resolve) => setTimeout(resolve, 10));
		// should be stale but not evicted
		let result = await CachingTableStaleWhileRevalidate.get(23);
		assert(result); // should exist in database even though it is stale
		assert.equal(sourceRequests, 1); // the source request should be started
		assert.equal(sourceResponses, 0); // the source request should not be completed yet
		await new Promise((resolve) => setTimeout(resolve, 5));
		assert.equal(sourceResponses, 1); // the source request should be completed
		result = await CachingTableStaleWhileRevalidate.primaryStore.get(23);
		assert.equal(sourceRequests, 1); // should be cached again
		assert(result);
	});

	it('Caching directives', async function () {
		CachingTable.setTTLExpiration({
			expiration: 0.005,
			eviction: 0.01,
		});
		CachingTable.invalidate(23); // reset the entry
		await new Promise((resolve) => setTimeout(resolve, 10));
		await CachingTable.get(23);
		sourceRequests = 0;
		sourceResponses = 0;
		events = [];
		await new Promise((resolve) => setTimeout(resolve, 10));
		// should be stale but not evicted
		let result = await CachingTable.get(23, { onlyIfCached: true });
		assert(result); // should exist in database even though it is stale
		assert.equal(sourceRequests, 0); // the source request should not be started
		assert.equal(sourceResponses, 0); // the source request should not be completed yet
		result = await CachingTable.get(23);
		assert(result); // should exist now
		assert.equal(sourceRequests, 1);
		assert.equal(sourceResponses, 1);
	});

	it('Source returns undefined', async function () {
		try {
			IndexedCachingTable.setTTLExpiration(0.005);
			await new Promise((resolve) => setTimeout(resolve, 10));
			sourceRequests = 0;
			events = [];
			return_value = undefined;
			let result = await IndexedCachingTable.get(29);
			assert.equal(result, undefined);
			assert.equal(sourceRequests, 1);
			result = await IndexedCachingTable.get(29);
			assert.equal(result, undefined);
		} finally {
			return_value = true;
		}
	});
	it('Source throw error', async function () {
		try {
			IndexedCachingTable.setTTLExpiration(0.005);
			await new Promise((resolve) => setTimeout(resolve, 10));
			sourceRequests = 0;
			events = [];
			return_error = 500;
			let returned_error;
			let result;
			try {
				result = await IndexedCachingTable.get(30);
			} catch (error) {
				returned_error = error;
			}
			assert.equal(returned_error?.message, 'test source error while resolving record 30 for IndexedCachingTable');
			assert.equal(sourceRequests, 1);

			IndexedCachingTable.setTTLExpiration({
				expiration: 0.005,
				eviction: 0.01,
			});
			return_error = false;
			IndexedCachingTable.invalidate(23); // reset the entry
			await IndexedCachingTable.get(23);
			sourceRequests = 0;
			sourceResponses = 0;
			events = [];
			await new Promise((resolve) => setTimeout(resolve, 10));
			// should be stale but not evicted
			return_error = 504;
			result = await IndexedCachingTable.get(23, { staleIfError: true });
			assert(result); // should return stale value despite error
			assert.equal(sourceRequests, 1); // the source request should be started
		} finally {
			return_error = false;
		}
	});
	it('Can load cached indexed data', async function () {
		sourceRequests = 0;
		events = [];
		IndexedCachingTable.setTTLExpiration(0.005);
		let result = await IndexedCachingTable.get(23);
		assert.equal(result.id, 23);
		assert.equal(result.name, 'name ' + 23);
		assert.equal(sourceRequests, 1);
		await new Promise((resolve) => setTimeout(resolve, 10));
		let results = [];
		for await (let record of IndexedCachingTable.search({ conditions: [{ attribute: 'name', value: 'name 23' }] })) {
			results.push(record);
		}
		assert.equal(results.length, 1);
		result = await IndexedCachingTable.get(23);
		assert.equal(result.id, 23);
		assert.equal(sourceRequests, 2);
		// let it expire
		await new Promise((resolve) => setTimeout(resolve, 10));
		result = await IndexedCachingTable.get(23);
		assert.equal(result.id, 23);
		assert.equal(result.name, 'name ' + 23);
		assert.equal(sourceRequests, 3);
		assert.equal(events.length, 0);
		result = await IndexedCachingTable.get(23);
		console.log(result.getExpiresAt());
	});

	it('Bigger stampede is handled', async function () {
		this.timeout(5000);
		try {
			timer = 2;
			CachingTable.setTTLExpiration(100); // don't evict during this test since it will clear the history
			let i = 0;
			sourceRequests = 0;
			let results = [];
			let interval = setInterval(async () => {
				i++;
				if (i % 16 == 1) CachingTable.invalidate(23);
				else {
					// clearing the cache kind of emulates what another thread would see
					if (i % 4 == 0) CachingTable.primaryStore.cache.clear();
					let raw_result = CachingTable.get(23);
					let result = await raw_result;
					results.push(result);
				}
			}, 1);
			await new Promise((resolve) => setTimeout(resolve, 3000));
			clearInterval(interval);
			for (let result of results) {
				assert.equal(result.name, 'name 23');
			}
			assert(sourceRequests <= 600);
			await new Promise((resolve) => setTimeout(resolve, 300));

			let history = await CachingTable.getHistoryOfRecord(23);
			if (history.length < 40) {
				console.log({ sourceRequests, i, history_length: history.length });
			}
			assert(history.length > 40);
			for (let entry of history) {
				assert(entry.localTime > 1);
			}
		} finally {
			timer = 0;
		}
	});
});
