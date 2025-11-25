const { platform } = require('node:os');

module.exports = {
	createReuseportFd: undefined,
};

if (platform() !== 'win32') {
	module.exports = { createReuseportFd: require('node-unix-socket').createReuseportFd };
}
