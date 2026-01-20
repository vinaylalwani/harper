const path = require('node:path');
const { isMainThread } = require('node:worker_threads');
const env = require('#js/utility/environment/environmentManager');
const terms = require('#src/utility/hdbTerms');
const { resetDatabases } = require('#src/resources/databases');
const fs = require('fs-extra');
const { stringify } = require('yaml');
const { setHdbBasePath } = require('#js/utility/environment/environmentManager');

const UNIT_TEST_DIR = __dirname;
const ENV_DIR_NAME = 'testEnv';
const ENV_DIR_PATH = path.join(UNIT_TEST_DIR, ENV_DIR_NAME);

async function tearDownMockDB(envs = undefined, partial_teardown = false) {
	try {
		if (envs !== undefined) {
			await Promise.all(envs.map((table) => table.delete())).catch();
		}

		delete global.hdb_schema;
		global.lmdb_map = undefined;
		if (!partial_teardown) {
			await fs.remove(ENV_DIR_PATH);
		}
	} catch (err) {}
}

function setupTestDBPath() {
	const lmdbPath = path.join(UNIT_TEST_DIR, ENV_DIR_NAME, process.pid.toString());
	// TODO: Setting the "root" path some more; should clean this up!
	env.setProperty(terms.HDB_SETTINGS_NAMES.HDB_ROOT_KEY, lmdbPath);
	env.setProperty(terms.CONFIG_PARAMS.DATABASES, { data: { path: lmdbPath }, dev: { path: lmdbPath } });
	resetDatabases();
	if (isMainThread) {
		process.on('exit', () => tearDownMockDB());
	}
	return lmdbPath;
}

function createTestSandbox() {
	// TODO: Seems like we're setting the "root" path over and over again
	// We should clean this up and make it so you only have to set it once
	const lmdbPath = setupTestDBPath(); // we set it in here
	process.env.ROOTPATH = lmdbPath; // setting it again
	setHdbBasePath(lmdbPath); // also setting the root path
	const storagePath = path.join(lmdbPath, 'database');
	process.env.STORAGE_PATH = storagePath; // another "root-ish" path we have to set
	const bootPropsPath = path.join(lmdbPath, terms.HDB_HOME_DIR_NAME);
	fs.mkdirpSync(storagePath);
	fs.writeFileSync(
		path.join(lmdbPath, 'harperdb-config.yaml'),
		stringify({
			rootPath: lmdbPath,
			logging: {
				path: path.join(lmdbPath, 'logs'),
				file: false,
				stdStreams: false,
				auditLog: false,
			},
			localStudio: {},
			operationsApi: {},
			http: {},
			storage: { writeAsync: false },
		})
	);
	fs.mkdirpSync(bootPropsPath);
	fs.writeFileSync(
		path.join(bootPropsPath, terms.BOOT_PROPS_FILE_NAME),
		`settings_path = ${lmdbPath}/harperdb-config.yaml`
	);
	return lmdbPath;
}

function cleanupTestSandbox() {
	return tearDownMockDB();
}

module.exports = {
	setupTestDBPath,
	createTestSandbox,
	cleanupTestSandbox,
};
