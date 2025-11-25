const { describe, it, beforeEach, afterEach } = require('mocha');
const assert = require('node:assert/strict');
const sinon = require('sinon');
const { ComponentStatus } = require('#src/components/status/ComponentStatus');
const { COMPONENT_STATUS_LEVELS } = require('#src/components/status/types');

describe('ComponentStatus', () => {
	let clock;

	beforeEach(() => {
		// Use fake timers to control Date objects
		clock = sinon.useFakeTimers();
	});

	afterEach(() => {
		clock.restore();
	});

	describe('constructor', () => {
		it('should create a ComponentStatus with all parameters', () => {
			const error = new Error('Test error');
			const status = new ComponentStatus('error', 'Component failed', error);

			assert.equal(status.status, 'error');
			assert.equal(status.message, 'Component failed');
			assert.equal(status.error, error);
			assert.ok(status.lastChecked instanceof Date);
			assert.equal(status.lastChecked.getTime(), 0); // fake timer starts at 0
		});

		it('should create a ComponentStatus without optional parameters', () => {
			const status = new ComponentStatus('healthy');

			assert.equal(status.status, 'healthy');
			assert.equal(status.message, undefined);
			assert.equal(status.error, undefined);
			assert.ok(status.lastChecked instanceof Date);
		});

		it('should accept string as error', () => {
			const status = new ComponentStatus('error', 'Component failed', 'String error');

			assert.equal(status.error, 'String error');
		});
	});

	describe('updateStatus', () => {
		it('should update status and message', () => {
			const status = new ComponentStatus('loading', 'Starting up');

			// Advance time
			clock.tick(1000);

			status.updateStatus('healthy', 'All good');

			assert.equal(status.status, 'healthy');
			assert.equal(status.message, 'All good');
			assert.equal(status.lastChecked.getTime(), 1000);
		});

		it('should clear error when status is not ERROR', () => {
			const error = new Error('Test error');
			const status = new ComponentStatus('error', 'Failed', error);

			status.updateStatus('healthy', 'Recovered');

			assert.equal(status.error, undefined);
		});

		it('should keep error when status remains ERROR', () => {
			const error = new Error('Test error');
			const status = new ComponentStatus('error', 'Failed', error);

			status.updateStatus('error', 'Still failed');

			assert.equal(status.error, error);
		});

		it('should update without message', () => {
			const status = new ComponentStatus('loading');

			status.updateStatus('healthy');

			assert.equal(status.status, 'healthy');
			assert.equal(status.message, undefined);
		});
	});

	describe('markHealthy', () => {
		it('should set status to healthy with custom message', () => {
			const status = new ComponentStatus('loading');

			clock.tick(1000);
			status.markHealthy('Everything is fine');

			assert.equal(status.status, COMPONENT_STATUS_LEVELS.HEALTHY);
			assert.equal(status.message, 'Everything is fine');
			assert.equal(status.lastChecked.getTime(), 1000);
		});

		it('should set status to healthy with default message', () => {
			const status = new ComponentStatus('error');

			status.markHealthy();

			assert.equal(status.status, COMPONENT_STATUS_LEVELS.HEALTHY);
			assert.equal(status.message, 'Component is healthy');
		});

		it('should clear error when marking healthy', () => {
			const status = new ComponentStatus('error', 'Failed', new Error('Test'));

			status.markHealthy();

			assert.equal(status.error, undefined);
		});
	});

	describe('markError', () => {
		it('should set status to error with Error object', () => {
			const status = new ComponentStatus('healthy');
			const error = new Error('Something went wrong');

			clock.tick(1000);
			status.markError(error, 'Custom error message');

			assert.equal(status.status, COMPONENT_STATUS_LEVELS.ERROR);
			assert.equal(status.error, error);
			assert.equal(status.message, 'Custom error message');
			assert.equal(status.lastChecked.getTime(), 1000);
		});

		it('should set status to error with string error', () => {
			const status = new ComponentStatus('healthy');

			status.markError('String error message');

			assert.equal(status.status, COMPONENT_STATUS_LEVELS.ERROR);
			assert.equal(status.error, 'String error message');
			assert.equal(status.message, 'String error message');
		});

		it('should use error message when no custom message provided', () => {
			const status = new ComponentStatus('healthy');
			const error = new Error('Error from exception');

			status.markError(error);

			assert.equal(status.message, 'Error from exception');
		});
	});

	describe('markWarning', () => {
		it('should set status to warning with message', () => {
			const status = new ComponentStatus('healthy');

			clock.tick(1000);
			status.markWarning('Performance degraded');

			assert.equal(status.status, COMPONENT_STATUS_LEVELS.WARNING);
			assert.equal(status.message, 'Performance degraded');
			assert.equal(status.lastChecked.getTime(), 1000);
		});

		it('should clear error when marking warning', () => {
			const status = new ComponentStatus('error', 'Failed', new Error('Test'));

			status.markWarning('Recovered with warnings');

			assert.equal(status.error, undefined);
		});
	});

	describe('markLoading', () => {
		it('should set status to loading with custom message', () => {
			const status = new ComponentStatus('unknown');

			clock.tick(1000);
			status.markLoading('Initializing connection');

			assert.equal(status.status, COMPONENT_STATUS_LEVELS.LOADING);
			assert.equal(status.message, 'Initializing connection');
			assert.equal(status.lastChecked.getTime(), 1000);
		});

		it('should set status to loading with default message', () => {
			const status = new ComponentStatus('unknown');

			status.markLoading();

			assert.equal(status.status, COMPONENT_STATUS_LEVELS.LOADING);
			assert.equal(status.message, 'Component is loading');
		});
	});

	describe('status check methods', () => {
		it('should correctly identify healthy status', () => {
			const healthyStatus = new ComponentStatus('healthy');
			const errorStatus = new ComponentStatus('error');

			assert.equal(healthyStatus.isHealthy(), true);
			assert.equal(errorStatus.isHealthy(), false);
		});

		it('should correctly identify error status', () => {
			const errorStatus = new ComponentStatus('error');
			const healthyStatus = new ComponentStatus('healthy');

			assert.equal(errorStatus.hasError(), true);
			assert.equal(healthyStatus.hasError(), false);
		});

		it('should correctly identify loading status', () => {
			const loadingStatus = new ComponentStatus('loading');
			const healthyStatus = new ComponentStatus('healthy');

			assert.equal(loadingStatus.isLoading(), true);
			assert.equal(healthyStatus.isLoading(), false);
		});

		it('should correctly identify warning status', () => {
			const warningStatus = new ComponentStatus('warning');
			const healthyStatus = new ComponentStatus('healthy');

			assert.equal(warningStatus.hasWarning(), true);
			assert.equal(healthyStatus.hasWarning(), false);
		});
	});

	describe('getSummary', () => {
		it('should return summary with message', () => {
			const status = new ComponentStatus('error', 'Database connection failed');

			assert.equal(status.getSummary(), 'ERROR: Database connection failed');
		});

		it('should return summary without message', () => {
			const status = new ComponentStatus('healthy');

			assert.equal(status.getSummary(), 'HEALTHY');
		});

		it('should handle all status levels', () => {
			const statusLevels = ['healthy', 'warning', 'error', 'loading', 'unknown'];

			for (const level of statusLevels) {
				const status = new ComponentStatus(level, 'Test message');
				assert.equal(status.getSummary(), `${level.toUpperCase()}: Test message`);
			}
		});
	});

	describe('status transitions', () => {
		it('should transition through multiple states correctly', () => {
			const status = new ComponentStatus('unknown');

			// Unknown -> Loading
			clock.tick(1000);
			status.markLoading('Starting up');
			assert.equal(status.status, 'loading');
			assert.equal(status.lastChecked.getTime(), 1000);

			// Loading -> Healthy
			clock.tick(1000);
			status.markHealthy('Started successfully');
			assert.equal(status.status, 'healthy');
			assert.equal(status.lastChecked.getTime(), 2000);

			// Healthy -> Warning
			clock.tick(1000);
			status.markWarning('High memory usage');
			assert.equal(status.status, 'warning');
			assert.equal(status.lastChecked.getTime(), 3000);

			// Warning -> Error
			clock.tick(1000);
			status.markError(new Error('Out of memory'), 'Component crashed');
			assert.equal(status.status, 'error');
			assert.equal(status.lastChecked.getTime(), 4000);
			assert.ok(status.error);

			// Error -> Healthy (recovery)
			clock.tick(1000);
			status.markHealthy('Recovered after restart');
			assert.equal(status.status, 'healthy');
			assert.equal(status.lastChecked.getTime(), 5000);
			assert.equal(status.error, undefined); // Error should be cleared
		});
	});
});
