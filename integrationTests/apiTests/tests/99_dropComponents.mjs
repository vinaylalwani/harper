import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { testData } from '../config/envConfig.mjs';
import { timestamp } from '../utils/timestamp.mjs';
import { restartServiceHttpWorkersWithTimeout } from '../utils/restart.mjs';
import { req } from '../utils/request.mjs';

// Intended for temporary use to drop all test components created during testing
describe('99. Drop all test components', () => {
	beforeEach(timestamp);

	let components = [];

	it('Get list of components', async () => {
		const response = await req().send({ operation: 'get_components' }).expect(200);

		// get_components returns { entries: [...] } where each entry has a 'name' field
		components = (response.body.entries || []).map((entry) => entry.name);
		console.log(`Found ${components.length} components to drop:`, components);
	});

	it('Drop all components', async () => {
		if (components.length === 0) {
			console.log('No components to drop');
			return;
		}

		for (const component of components) {
			console.log(`Dropping component: ${component}`);
			await req()
				.send({ operation: 'drop_component', project: component })
				.expect((r) => {
					const message = JSON.stringify(r.body);
					assert.ok(
						message.includes(`Successfully dropped: ${component}`) || message.includes('does not exist'),
						r.text
					);
				})
				.expect(200);
		}
	});

	it('Restart Service: http workers after component cleanup', () => {
		return restartServiceHttpWorkersWithTimeout(testData.restartTimeout);
	});
});
