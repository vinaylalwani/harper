'use strict';

const chai = require('chai');
const sinon = require('sinon');
const { expect } = chai;
const sinon_chai = require('sinon-chai');
chai.use(sinon_chai);
chai.use(require('chai-integer'));
const rewire = require('rewire');
const fs = require('fs-extra');
const path = require('path');
const test_util = require('../test_utils');
const env_mangr = require('../../utility/environment/environmentManager');
const hdb_terms = require('../../utility/hdbTerms');
const pm2_utils = require('../../utility/processManagement/processManagement');
const nats_config = require('../../server/nats/utility/natsConfig');
const child_process = require('child_process');
const settings_test_file = require('../settingsTestFile');
const { Worker } = require('node:worker_threads');
let run_rw;

describe('Test run module', () => {
	const sandbox = sinon.createSandbox();
	const log_notify_stub = sandbox.stub().callsFake(() => {});
	const log_error_stub = sandbox.stub().callsFake(() => {});
	const log_info_stub = sandbox.stub().callsFake(() => {});
	const log_fatal_stub = sandbox.stub().callsFake(() => {});
	const log_trace_stub = sandbox.stub().callsFake(() => {});
	const logger_fake = {
		notify: log_notify_stub,
		error: log_error_stub,
		info: log_info_stub,
		fatal: log_fatal_stub,
		trace: log_trace_stub,
	};
	let log_rw;
	let console_log_stub;
	let console_error_stub;
	let get_prob_stub;
	let fake_spawn = {
		on: () => {},
		stdout: {
			on: () => {},
		},
		stderr: {
			on: () => {},
		},
		pid: 1234789,
	};

	before(() => {
		settings_test_file.buildFile();

		get_prob_stub = sandbox.stub(env_mangr, 'get');
		get_prob_stub.withArgs('rootPath').returns('unit-test');
		get_prob_stub.withArgs('logging_root').returns('unit-test');
		sandbox.stub(child_process, 'spawn').returns(fake_spawn);
		sandbox.stub(pm2_utils, 'startAllServices').resolves();
		sandbox.stub(pm2_utils, 'startService').resolves();
		sandbox.stub(pm2_utils, 'startClusteringProcesses').resolves();
		sandbox.stub(process, 'exit');
		console_log_stub = sandbox.stub(console, 'log');
		console_error_stub = sandbox.stub(console, 'error');
		sandbox.stub(fs, 'writeFile');
		test_util.preTestPrep();
		run_rw = rewire('../../bin/run');
		log_rw = run_rw.__set__('hdbLogger', logger_fake);
		sandbox.stub(nats_config, 'generateNatsConfig');
		env_mangr.setProperty(hdb_terms.CONFIG_PARAMS.LOGGING_ROTATION_ENABLED, false);
	});

	after(() => {
		settings_test_file.deleteFile();
		sandbox.resetHistory();
		sandbox.restore();
		log_rw();
		rewire('../../bin/run');
	});

	describe('Test run function', () => {
		it('Test that a user thread can access harperdb as a module', async () => {
			// Unfortunately this test is probably only get to test source version, but problems have occurred built version
			const worker = new Worker(__dirname + '/user-thread.js');
			return new Promise((resolve) => {
				worker.on('message', (message) => {
					expect(message.hasResource).to.be.true;
					expect(message.hasServer).to.be.true;
					resolve();
				});
			});
		});
	});

	describe('Test writeLicenseFromVars function', () => {
		let fs_mkdirpSync_spy;
		let fs_writeFileSync_spy;
		let rw_writeLicenseFromVars;
		const LICENSE_PATH = path.join(test_util.getMockTestPath(), 'keys/.license');
		let assignCMDENVVariables_stub = sandbox.stub();

		before(() => {
			sandbox.resetHistory();
			fs.removeSync(LICENSE_PATH);
			fs_mkdirpSync_spy = sandbox.spy(fs, 'mkdirpSync');
			fs_writeFileSync_spy = sandbox.spy(fs, 'writeFileSync');
			rw_writeLicenseFromVars = run_rw.__get__('writeLicenseFromVars');
			run_rw.__set__('assignCMDENVVariables', assignCMDENVVariables_stub);
		});

		afterEach(() => {
			fs.removeSync(LICENSE_PATH);
			sandbox.resetHistory();
		});

		it('test happy path', () => {
			assignCMDENVVariables_stub.returns({
				HARPERDB_FINGERPRINT: 'the fingerprint',
				HARPERDB_LICENSE: 'the best license ever',
			});

			rw_writeLicenseFromVars();
			expect(console_error_stub.callCount).to.equal(0);
			expect(log_error_stub.callCount).to.equal(0);

			expect(assignCMDENVVariables_stub.callCount).to.eq(1);
			expect(assignCMDENVVariables_stub.firstCall.args[0]).to.have.members([
				'HARPERDB_FINGERPRINT',
				'HARPERDB_LICENSE',
			]);
			expect(assignCMDENVVariables_stub.firstCall.exception).to.eq(undefined);
			expect(assignCMDENVVariables_stub.firstCall.returnValue).to.eql({
				HARPERDB_FINGERPRINT: 'the fingerprint',
				HARPERDB_LICENSE: 'the best license ever',
			});

			expect(fs_mkdirpSync_spy.callCount).to.eql(1);
			expect(fs_writeFileSync_spy.callCount).to.eql(2);
			expect(fs_writeFileSync_spy.firstCall.exception).to.eql(undefined);
			expect(fs_writeFileSync_spy.firstCall.args[0]).to.include('.license/060493.ks');
			expect(fs_writeFileSync_spy.firstCall.args[1]).to.equal('the fingerprint');
			expect(fs_writeFileSync_spy.secondCall.exception).to.eql(undefined);
			expect(fs_writeFileSync_spy.secondCall.args[0]).to.include('.license');
			expect(fs_writeFileSync_spy.secondCall.args[1]).to.equal('the best license ever');
		});

		it('test no license', () => {
			assignCMDENVVariables_stub.returns({
				HARPERDB_FINGERPRINT: 'the fingerprint',
			});

			rw_writeLicenseFromVars();
			expect(console_error_stub.callCount).to.equal(0);
			expect(log_error_stub.callCount).to.equal(0);

			expect(assignCMDENVVariables_stub.callCount).to.eq(1);
			expect(assignCMDENVVariables_stub.firstCall.args[0]).to.have.members([
				'HARPERDB_FINGERPRINT',
				'HARPERDB_LICENSE',
			]);
			expect(assignCMDENVVariables_stub.firstCall.exception).to.eq(undefined);
			expect(assignCMDENVVariables_stub.firstCall.returnValue).to.eql({ HARPERDB_FINGERPRINT: 'the fingerprint' });

			expect(fs_mkdirpSync_spy.callCount).to.eql(0);
			expect(fs_writeFileSync_spy.callCount).to.eql(0);
		});

		it('test no fingerprint', () => {
			assignCMDENVVariables_stub.returns({
				HARPERDB_LICENSE: 'the license',
			});

			rw_writeLicenseFromVars();
			expect(console_error_stub.callCount).to.equal(0);
			expect(log_error_stub.callCount).to.equal(0);

			expect(assignCMDENVVariables_stub.callCount).to.eq(1);
			expect(assignCMDENVVariables_stub.firstCall.args[0]).to.have.members([
				'HARPERDB_FINGERPRINT',
				'HARPERDB_LICENSE',
			]);
			expect(assignCMDENVVariables_stub.firstCall.exception).to.eq(undefined);
			expect(assignCMDENVVariables_stub.firstCall.returnValue).to.eql({ HARPERDB_LICENSE: 'the license' });

			expect(fs_mkdirpSync_spy.callCount).to.eql(0);
			expect(fs_writeFileSync_spy.callCount).to.eql(0);
		});

		it('test writefile errors', () => {
			assignCMDENVVariables_stub.returns({
				HARPERDB_FINGERPRINT: 'the fingerprint',
				HARPERDB_LICENSE: 'the license',
			});

			fs_writeFileSync_spy.restore();
			let fs_writeFileSync_stub = sandbox.stub(fs, 'writeFileSync').throws('fail!');

			rw_writeLicenseFromVars();
			expect(console_error_stub.callCount).to.equal(1);
			expect(log_error_stub.callCount).to.equal(1);

			expect(assignCMDENVVariables_stub.callCount).to.eq(1);
			expect(assignCMDENVVariables_stub.firstCall.args[0]).to.have.members([
				'HARPERDB_FINGERPRINT',
				'HARPERDB_LICENSE',
			]);
			expect(assignCMDENVVariables_stub.firstCall.exception).to.eq(undefined);
			expect(assignCMDENVVariables_stub.firstCall.returnValue).to.eql({
				HARPERDB_LICENSE: 'the license',
				HARPERDB_FINGERPRINT: 'the fingerprint',
			});

			expect(fs_mkdirpSync_spy.callCount).to.eql(1);
			expect(fs_writeFileSync_stub.callCount).to.eql(1);
			expect(fs_writeFileSync_stub.firstCall.exception.name).to.eql('fail!');
		});
	});

	it('Test startupLog', () => {
		sandbox.resetHistory();
		run_rw.startupLog(new Map());
		const test_values = [
			'Worker Threads',
			'Root Path',
			'Debugging',
			'Logging',
			'Default',
			'Operations API',
			'MQTT',
			'Replication',
		];
		test_values.forEach((value) => expect(console_log_stub.args[0][0]).to.include(value));
	});
});
