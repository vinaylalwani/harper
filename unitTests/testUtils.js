const assert = require('node:assert');

function assertErrorSync(test_func, args, error_object, message) {
	let error;
	let result;
	try {
		result = test_func.apply(null, args);
	} catch (e) {
		error = e;
	}

	assert.deepStrictEqual(error, error_object, message);
	return result;
}

module.exports = { assertErrorSync };
