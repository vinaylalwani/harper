'use strict';

const rewire = require('rewire');
const lmdb_process_rows = rewire('#js/dataLayer/harperBridge/lmdbBridge/lmdbUtility/lmdbProcessRows');
const validate_hash_function = lmdb_process_rows.__get__('validateHash');
const validate_attribute_function = lmdb_process_rows.__get__('validateAttribute');
const process_rows_function = lmdb_process_rows.__get__('processRows');
const hdb_terms = require('#src/utility/hdbTerms');
const MOCK_UUID_VALUE = 'cool-uuid-value';

const { TEST_WRITE_OPS_ERROR_MSGS } = require('../../../../commonTestErrors');
const testUtils = require('../../../../testUtils.js');
const assert = require('assert');

const HASH_ATTRIBUTE_NAME = 'id';
const RECORD = {
	id: 1,
	name: 'Kyle',
	age: 46,
};

const INSERT_OBJECT_TEST = {
	operation: 'insert',
	schema: 'dev',
	table: 'dog',
	records: [
		{
			name: 'Harper',
			breed: 'Mutt',
			id: '8',
			age: 5,
		},
		{
			name: 'Penny',
			breed: 'Mutt',
			id: '9',
			age: 5,
			height: 145,
		},
		{
			name: 'David',
			breed: 'Mutt',
			id: '12',
		},
		{
			name: 'Rob',
			breed: 'Mutt',
			id: '10',
			age: 5,
			height: 145,
		},
	],
};

const ATTRIBUTES_TEST = ['name', 'breed', 'id', 'age', 'height'];

const NO_HASH_VALUE_ERROR = testUtils.generateHDBError(TEST_WRITE_OPS_ERROR_MSGS.RECORD_MISSING_HASH_ERR, 400);
const EMPTY_ATTRIBUTE_NAME_ERROR = testUtils.generateHDBError(TEST_WRITE_OPS_ERROR_MSGS.ATTR_NAME_NULLISH_ERR, 400);

const LONG_CHAR_TEST =
	'z2xFuWBiQgjAAAzgAK80e35FCuFzNHpicBWzsWZW055mFHwBxdU5yE5KlTQRzcZ04UlBTdhzDrVn1k1fuQCN9' +
	'faotQUlygf8Hv3E89f2v3KRzAX5FylEKwv4GJpSoZbXpgJ1mhmOjGUCAh3sipI5rVV0yvz6dbkXOw7xE5XlCHBRnc3T6BVyHIlUmFdlBowy' +
	'vAy7MT49mg6wn5yCqPEPFkcva2FNRYSNxljmu1XxN65mTKiTw2lvM0Yl2o0';

describe('Test lmdbProcessRows module', () => {
	let uuid_stub;

	before(() => {
		uuid_stub = lmdb_process_rows.__set__('uuid', {
			v4: () => {
				return MOCK_UUID_VALUE;
			},
		});
	});

	after(() => {
		uuid_stub();
	});
	describe('Test validateHash function', () => {
		it('test record with no hash attribute value entry when updating', () => {
			let test_record = testUtils.deepClone(RECORD);
			delete test_record[HASH_ATTRIBUTE_NAME];
			testUtils.assertErrorSync(
				validate_hash_function,
				[test_record, HASH_ATTRIBUTE_NAME, hdb_terms.OPERATIONS_ENUM.UPDATE],
				NO_HASH_VALUE_ERROR,
				'test no id attribute'
			);

			let test_record2 = testUtils.deepClone(RECORD);
			test_record2[HASH_ATTRIBUTE_NAME] = null;
			testUtils.assertErrorSync(
				validate_hash_function,
				[test_record2, HASH_ATTRIBUTE_NAME, hdb_terms.OPERATIONS_ENUM.UPDATE],
				NO_HASH_VALUE_ERROR,
				'test null id value'
			);

			let test_record3 = testUtils.deepClone(RECORD);
			test_record3[HASH_ATTRIBUTE_NAME] = undefined;
			testUtils.assertErrorSync(
				validate_hash_function,
				[test_record3, HASH_ATTRIBUTE_NAME, hdb_terms.OPERATIONS_ENUM.UPDATE],
				NO_HASH_VALUE_ERROR,
				'test undefined id value'
			);

			let test_record4 = testUtils.deepClone(RECORD);
			test_record4[HASH_ATTRIBUTE_NAME] = '';
			testUtils.assertErrorSync(
				validate_hash_function,
				[test_record4, HASH_ATTRIBUTE_NAME, hdb_terms.OPERATIONS_ENUM.UPDATE],
				NO_HASH_VALUE_ERROR,
				'test empty string id value'
			);
		});

		it('test record with no hash attribute entry when inserting', () => {
			let test_record = testUtils.deepClone(RECORD);
			delete test_record[HASH_ATTRIBUTE_NAME];
			testUtils.assertErrorSync(
				validate_hash_function,
				[test_record, HASH_ATTRIBUTE_NAME, hdb_terms.OPERATIONS_ENUM.INSERT],
				undefined,
				'test no id attribute'
			);

			assert(test_record.hasOwnProperty(HASH_ATTRIBUTE_NAME) === true);
			assert.deepStrictEqual(test_record[HASH_ATTRIBUTE_NAME], MOCK_UUID_VALUE);

			let test_record2 = testUtils.deepClone(RECORD);
			test_record2[HASH_ATTRIBUTE_NAME] = null;
			testUtils.assertErrorSync(
				validate_hash_function,
				[test_record2, HASH_ATTRIBUTE_NAME, hdb_terms.OPERATIONS_ENUM.INSERT],
				undefined,
				'test null id value'
			);

			assert(test_record2.hasOwnProperty(HASH_ATTRIBUTE_NAME) === true);
			assert.deepStrictEqual(test_record2[HASH_ATTRIBUTE_NAME], MOCK_UUID_VALUE);

			let test_record3 = testUtils.deepClone(RECORD);
			test_record3[HASH_ATTRIBUTE_NAME] = undefined;
			testUtils.assertErrorSync(
				validate_hash_function,
				[test_record3, HASH_ATTRIBUTE_NAME, hdb_terms.OPERATIONS_ENUM.INSERT],
				undefined,
				'test undefined id value'
			);

			assert(test_record3.hasOwnProperty(HASH_ATTRIBUTE_NAME) === true);
			assert.deepStrictEqual(test_record3[HASH_ATTRIBUTE_NAME], MOCK_UUID_VALUE);

			let test_record4 = testUtils.deepClone(RECORD);
			test_record4[HASH_ATTRIBUTE_NAME] = undefined;
			testUtils.assertErrorSync(
				validate_hash_function,
				[test_record4, HASH_ATTRIBUTE_NAME, hdb_terms.OPERATIONS_ENUM.INSERT],
				undefined,
				'test empty string id value'
			);

			assert(test_record4.hasOwnProperty(HASH_ATTRIBUTE_NAME) === true);
			assert.deepStrictEqual(test_record4[HASH_ATTRIBUTE_NAME], MOCK_UUID_VALUE);
		});

		it('Test error is thrown if hash is over max size', () => {
			let test_record = testUtils.deepClone(RECORD);
			test_record[HASH_ATTRIBUTE_NAME] = LONG_CHAR_TEST;

			testUtils.assertErrorSync(
				validate_hash_function,
				[test_record, HASH_ATTRIBUTE_NAME, hdb_terms.OPERATIONS_ENUM.INSERT],
				testUtils.generateHDBError(TEST_WRITE_OPS_ERROR_MSGS.HASH_VAL_LENGTH_ERR, 400),
				'test id value too long'
			);
		});

		it('Test happy path', () => {
			let test_record = testUtils.deepClone(RECORD);

			testUtils.assertErrorSync(
				validate_hash_function,
				[test_record, HASH_ATTRIBUTE_NAME, hdb_terms.OPERATIONS_ENUM.INSERT],
				undefined,
				'all good with insert'
			);

			let test_record2 = testUtils.deepClone(RECORD);
			test_record2[HASH_ATTRIBUTE_NAME] = 'coolid';
			testUtils.assertErrorSync(
				validate_hash_function,
				[test_record2, HASH_ATTRIBUTE_NAME, hdb_terms.OPERATIONS_ENUM.INSERT],
				undefined,
				'all good with insert'
			);
		});
	});

	describe('test validateAttribute function', () => {
		it('test attribute name too long', () => {
			testUtils.assertErrorSync(
				validate_attribute_function,
				[LONG_CHAR_TEST],
				testUtils.generateHDBError(TEST_WRITE_OPS_ERROR_MSGS.ATTR_NAME_LENGTH_ERR(LONG_CHAR_TEST), 400),
				'attribute name too long'
			);
		});

		it('test empty attribute names', () => {
			testUtils.assertErrorSync(validate_attribute_function, [], EMPTY_ATTRIBUTE_NAME_ERROR);
			testUtils.assertErrorSync(validate_attribute_function, [null], EMPTY_ATTRIBUTE_NAME_ERROR);
			testUtils.assertErrorSync(validate_attribute_function, [undefined], EMPTY_ATTRIBUTE_NAME_ERROR);
			testUtils.assertErrorSync(validate_attribute_function, [''], EMPTY_ATTRIBUTE_NAME_ERROR);
		});

		it('test happy path', () => {
			testUtils.assertErrorSync(validate_attribute_function, [HASH_ATTRIBUTE_NAME], undefined);
		});
	});

	describe('Test processRows', () => {
		it('test happy path', () => {
			let insert_obj = testUtils.deepClone(INSERT_OBJECT_TEST);

			testUtils.assertErrorSync(process_rows_function, [insert_obj, ATTRIBUTES_TEST, HASH_ATTRIBUTE_NAME], undefined);
		});
	});
});
