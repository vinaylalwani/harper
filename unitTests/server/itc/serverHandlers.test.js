'use strict';

const chai = require('chai');
const sinon = require('sinon');
const rewire = require('rewire');
const { expect } = chai;
const sinon_chai = require('sinon-chai').default;
chai.use(sinon_chai);
const harper_logger = require('#js/utility/logging/harper_logger');
const user_schema = require('#src/security/user');
const harperBridge = require('#js/dataLayer/harperBridge/harperBridge');
const server_itc_handlers = rewire('#js/server/itc/serverHandlers');

describe('Test hdbChildIpcHandler module', () => {
	const TEST_ERR = 'The roof is on fire';
	const sandbox = sinon.createSandbox();
	let log_error_stub;
	let log_info_stub;
	let log_trace_stub;
	let log_warn_stub;
	let log_debug_stub;

	before(() => {
		log_error_stub = sandbox.stub(harper_logger, 'error');
		log_info_stub = sandbox.stub(harper_logger, 'info');
		log_trace_stub = sandbox.stub(harper_logger, 'trace');
		log_warn_stub = sandbox.stub(harper_logger, 'warn');
		log_debug_stub = sandbox.stub(harper_logger, 'debug');
	});

	after(() => {
		sandbox.restore();
	});

	afterEach(() => {
		sandbox.resetHistory();
	});

	describe('Test user event handler function', () => {
		let user_handler;

		before(() => {
			user_handler = server_itc_handlers.__get__('userHandler');
		});

		it('Test User Handler log error upon setUsersWithRolesCache failure', async () => {
			const setUserStub = sandbox.stub(user_schema, 'setUsersWithRolesCache').throws({ name: TEST_ERR });
			const test_event = {
				type: 'user',
				message: { originator: 12345 },
			};
			await user_handler(test_event);
			expect(log_error_stub.args[0][0].name).to.equal(TEST_ERR);
			setUserStub.restore();
		});

		it('Test User Handler calls setUsersWithRolesCache on valid event', async () => {
			const setUserStub = sandbox.stub(user_schema, 'setUsersWithRolesCache').resolves();
			const resetReadTxnStub = sandbox.stub(harperBridge, 'resetReadTxn');
			const test_event = {
				type: 'user',
				message: { originator: 12345 },
			};
			await user_handler(test_event);
			expect(setUserStub).to.have.been.calledOnce;
			setUserStub.restore();
			resetReadTxnStub.restore();
		});

		it('Test User Handler logs error on invalid event (missing type)', async () => {
			const test_event = {
				message: { originator: 12345 },
			};
			await user_handler(test_event);
			expect(log_error_stub).to.have.been.called;
		});

		it('Test User Handler logs error on invalid event (missing message)', async () => {
			const test_event = {
				type: 'user',
			};
			await user_handler(test_event);
			expect(log_error_stub).to.have.been.called;
		});

		it('Test User Handler addListener functionality', async () => {
			const setUserStub = sandbox.stub(user_schema, 'setUsersWithRolesCache').resolves();
			const resetReadTxnStub = sandbox.stub(harperBridge, 'resetReadTxn');
			let listenerCalled = false;
			user_handler.addListener(() => {
				listenerCalled = true;
			});
			const test_event = {
				type: 'user',
				message: { originator: 12345 },
			};
			await user_handler(test_event);
			expect(listenerCalled).to.be.true;
			setUserStub.restore();
			resetReadTxnStub.restore();
		});
	});

	describe('Test schema event handler function', () => {
		let schema_handler;
		let cleanLmdbMapStub;
		let resetReadTxnStub;
		let resetDatabasesStub;
		let originalCleanLmdbMap;
		let originalResetDatabases;

		before(() => {
			schema_handler = server_itc_handlers.__get__('schemaHandler');
			originalCleanLmdbMap = server_itc_handlers.__get__('cleanLmdbMap');
			originalResetDatabases = server_itc_handlers.__get__('resetDatabases');
		});

		beforeEach(() => {
			// Create stub function for cleanLmdbMap
			cleanLmdbMapStub = sandbox.stub().resolves();
			server_itc_handlers.__set__('cleanLmdbMap', cleanLmdbMapStub);

			resetReadTxnStub = sandbox.stub(harperBridge, 'resetReadTxn');

			// Mock resetDatabases to return a mock database object
			resetDatabasesStub = sandbox.stub().returns({
				testdb: {
					testtable: {
						put: sandbox.stub().resolves(),
					},
				},
			});
			server_itc_handlers.__set__('resetDatabases', resetDatabasesStub);
		});

		afterEach(() => {
			server_itc_handlers.__set__('cleanLmdbMap', originalCleanLmdbMap);
			server_itc_handlers.__set__('resetDatabases', originalResetDatabases);
			resetReadTxnStub.restore();
		});

		it('Test Schema Handler logs error on invalid event (missing type)', async () => {
			const test_event = {
				message: { originator: 12345, operation: 'create_table', schema: 'test' },
			};
			await schema_handler(test_event);
			expect(log_error_stub).to.have.been.called;
		});

		it('Test Schema Handler logs error on invalid event (missing message)', async () => {
			const test_event = {
				type: 'schema',
			};
			await schema_handler(test_event);
			expect(log_error_stub).to.have.been.called;
		});

		it('Test Schema Handler processes valid schema event', async () => {
			const test_event = {
				type: 'schema',
				message: {
					originator: 12345,
					operation: 'create_table',
					schema: 'test',
				},
			};
			await schema_handler(test_event);
			expect(cleanLmdbMapStub).to.have.been.calledWith(test_event.message);
			expect(resetReadTxnStub).to.have.been.called;
			expect(resetDatabasesStub).to.have.been.called;
		});

		it('Test Schema Handler calls syncSchemaMetadata with database and table', async () => {
			const mockPut = sandbox.stub().resolves();
			resetDatabasesStub.returns({
				testdb: {
					testtable: {
						put: mockPut,
					},
				},
			});
			const test_event = {
				type: 'schema',
				message: {
					originator: 12345,
					operation: 'create_table',
					schema: 'test',
					database: 'testdb',
					table: 'testtable',
				},
			};
			await schema_handler(test_event);
			expect(mockPut).to.have.been.calledWith(Symbol.for('write-verify'), null);
		});
	});

	describe('Test componentStatusRequestHandler function', () => {
		let component_status_handler;

		before(() => {
			component_status_handler = server_itc_handlers.__get__('componentStatusRequestHandler');
		});

		it('Test componentStatusRequestHandler logs error on invalid event (missing type)', async () => {
			const test_event = {
				message: { originator: 1, requestId: 'req-123' },
			};
			await component_status_handler(test_event);
			expect(log_error_stub).to.have.been.called;
		});

		it('Test componentStatusRequestHandler logs error on invalid event (missing message)', async () => {
			const test_event = {
				type: 'component_status_request',
			};
			await component_status_handler(test_event);
			expect(log_error_stub).to.have.been.called;
		});

		it('Test componentStatusRequestHandler logs error on invalid event (missing originator)', async () => {
			const test_event = {
				type: 'component_status_request',
				message: { requestId: 'req-123' },
			};
			await component_status_handler(test_event);
			expect(log_error_stub).to.have.been.called;
		});

		it('Test componentStatusRequestHandler processes valid event without error', async () => {
			// Reset stubs to track calls for this test
			sandbox.resetHistory();

			const test_event = {
				type: 'component_status_request',
				message: { originator: 1, requestId: 'req-456' },
			};
			await component_status_handler(test_event);

			// The handler should have logged a trace message indicating it received the request
			expect(log_trace_stub).to.have.been.called;
			// For a valid event, it should NOT log an error (unless threads infrastructure is missing)
			// If threads.sendToThread returns false or doesn't exist, it falls back to broadcast
			// Either way, it shouldn't throw - just log appropriate messages
		});
	});
});
