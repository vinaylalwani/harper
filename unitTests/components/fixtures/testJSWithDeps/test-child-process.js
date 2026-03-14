// Simple child process that stays alive until killed
// Used for testing process reuse functionality

let isRunning = true;

process.on('SIGTERM', () => {
	isRunning = false;
	process.exit(0);
});

// Keep process alive
const interval = setInterval(() => {
	if (!isRunning) {
		clearInterval(interval);
	}
}, 100);

console.log('Child process started with PID:', process.pid);
