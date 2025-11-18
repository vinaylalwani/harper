'use strict';
const assert = require('assert');

const { Headers, appendHeader, mergeHeaders } = require('../../../ts-build/server/serverHelpers/Headers');
describe('Test Headers', () => {
	describe(`Create and modify headers`, function () {
		it('should handle headers', async function () {
			const headers = new Headers();
			assert.equal(Array.from(headers).length, 0);
			assert.equal(headers.get('NaMe'), undefined);
			assert.equal(headers.has('NaMe'), false);
			headers.set('nAmE', 'value');
			assert.equal(headers.get('NaMe'), 'value');
			assert.equal(headers.has('NaMe'), true);
			headers.setIfNone('name', 'value changed');
			assert.equal(headers.get('NaMe'), 'value');
			assert.equal(headers.has('NAME'), true);
			headers.append('naMe', 'value2');
			assert.deepEqual(headers.get('NaMe'), ['value', 'value2']);
			assert.equal(Array.from(headers).length, 1);
		});
		it('should handle append with commas', async function () {
			const headers = new Headers();
			headers.append('name-with-commas', 'value', true);
			headers.append('name-with-commas', 'value2', true);
			appendHeader(headers, 'name-with-commas', 'value3', true);
			assert.equal(headers.get('name-with-commas'), 'value, value2, value3');
		});
		it('should handle append with commas on a Map', async function () {
			const headers = new Map();
			appendHeader(headers, 'name-with-commas', 'value', true);
			appendHeader(headers, 'name-with-commas', 'value2', true);
			appendHeader(headers, 'name-with-commas', 'value3', true);
			assert.equal(headers.get('name-with-commas'), 'value, value2, value3');
		});
		it('construct headers from object', async function () {
			const headers = new Headers({ name: 'value', name2: 'value2' });
			assert.equal(headers.get('name'), 'value');
			assert.equal(headers.get('name2'), 'value2');
		});
		it('construct headers from Map and merge', async function () {
			let map = new Map();
			map.set('name', 'value');
			map.set('name2', 'value2');
			let headers = new Headers(map);
			assert.equal(headers.get('name'), 'value');
			assert.equal(headers.get('name2'), 'value2');
			headers = mergeHeaders(headers, new Headers({ name2: 'value3', name3: 'value4' }));
			assert.equal(headers.get('name'), 'value');
			assert.equal(headers.get('name2'), 'value2');
			assert.equal(headers.get('name3'), 'value4');
		});
		it('should handle multiple Set-Cookie headers correctly', async function () {
			const headers = new Headers();
			headers.append('Set-Cookie', 'session=abc123');
			headers.append('Set-Cookie', 'user=john');

			// Verify internal storage
			assert.deepEqual(headers.get('Set-Cookie'), ['session=abc123', 'user=john']);

			// Verify serialization - should return TWO separate entries, not one entry with an array
			const serialized = Array.from(headers);
			assert.equal(serialized.length, 2, 'Should have 2 separate header entries');
			assert.deepEqual(serialized[0], ['Set-Cookie', 'session=abc123']);
			assert.deepEqual(serialized[1], ['Set-Cookie', 'user=john']);
		});
		it('should handle mixed headers with multiple Set-Cookie', async function () {
			const headers = new Headers();
			headers.set('Content-Type', 'text/html');
			headers.append('Set-Cookie', 'cookie1=value1');
			headers.append('Set-Cookie', 'cookie2=value2');
			headers.set('X-Custom', 'test');

			const serialized = Array.from(headers);
			assert.equal(serialized.length, 4, 'Should have 4 header entries total');

			// Find all Set-Cookie headers in serialized output
			const setCookies = serialized.filter(([name]) => name === 'Set-Cookie');
			assert.equal(setCookies.length, 2, 'Should have 2 separate Set-Cookie entries');
			assert.deepEqual(setCookies[0], ['Set-Cookie', 'cookie1=value1']);
			assert.deepEqual(setCookies[1], ['Set-Cookie', 'cookie2=value2']);
		});
		it('should keep non-Set-Cookie headers with arrays merged (not split)', async function () {
			const headers = new Headers();
			// Other headers with multiple values should stay as arrays (to be comma-separated)
			headers.append('Accept', 'text/html');
			headers.append('Accept', 'application/json');
			headers.append('Set-Cookie', 'session=abc');
			headers.append('Set-Cookie', 'user=john');

			const serialized = Array.from(headers);

			// Accept should be a single entry with an array value
			const acceptHeaders = serialized.filter(([name]) => name === 'Accept');
			assert.equal(acceptHeaders.length, 1, 'Accept should be a single entry');
			assert.deepEqual(acceptHeaders[0], ['Accept', ['text/html', 'application/json']]);

			// Set-Cookie should be split into multiple entries
			const setCookies = serialized.filter(([name]) => name === 'Set-Cookie');
			assert.equal(setCookies.length, 2, 'Set-Cookie should be split into 2 entries');
			assert.deepEqual(setCookies[0], ['Set-Cookie', 'session=abc']);
			assert.deepEqual(setCookies[1], ['Set-Cookie', 'user=john']);
		});
	});
});
