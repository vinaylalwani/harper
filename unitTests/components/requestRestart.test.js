const { describe, it } = require('mocha');
const { requestRestart, restartNeeded } = require('#src/components/requestRestart');
const assert = require('node:assert/strict');

describe('requestRestart', () => {
	it('should update the shared buffer', () => {
		assert.strictEqual(restartNeeded(), false);
		requestRestart();
		assert.strictEqual(restartNeeded(), true);
	});
});
