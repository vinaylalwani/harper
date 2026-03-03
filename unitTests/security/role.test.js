'use strict';

const testUtils = require('../testUtils.js');
testUtils.preTestPrep();

const assert = require('node:assert');
const sinon = require('sinon');
const rewire = require('rewire');

const role_rw = rewire('#js/security/role');

const sandbox = sinon.createSandbox();

describe('security/role.js', () => {
	afterEach(() => {
		sandbox.restore();
	});

	describe('getRoleByName()', () => {
		function stubSearch(result) {
			const stub = sandbox.stub().resolves(result);
			role_rw.__set__('pSearchSearchByValue', stub);
			return stub;
		}

		it('should pass correct search parameters', async () => {
			const stub = stubSearch([{ id: 'test', role: 'test' }]);

			await role_rw.getRoleByName('readonly_role');

			assert.strictEqual(stub.callCount, 1);
			const searchObj = stub.firstCall.args[0];
			assert.strictEqual(searchObj.schema, 'system');
			assert.strictEqual(searchObj.table, 'hdb_role');
			assert.strictEqual(searchObj.attribute, 'role');
			assert.strictEqual(searchObj.value, 'readonly_role');
			assert.deepStrictEqual(searchObj.get_attributes, ['*']);
		});

		it('should return null when search returns null', async () => {
			stubSearch(null);

			const result = await role_rw.getRoleByName('nonexistent_role');
			assert.strictEqual(result, null);
		});

		it('should return null when search returns undefined', async () => {
			stubSearch(undefined);

			const result = await role_rw.getRoleByName('nonexistent_role');
			assert.strictEqual(result, null);
		});
	});
});
