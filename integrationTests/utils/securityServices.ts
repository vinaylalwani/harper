/**
 * Security Services Utilities for Integration Tests
 *
 * This module provides utilities for managing OCSP responders, CRL servers,
 * and certificate generation for security-related integration tests.
 */

import { spawn, type ChildProcess } from 'node:child_process';
import { createServer, type Server } from 'node:http';
import { join } from 'node:path';
import { readFileSync } from 'node:fs';

export interface OcspResponderContext {
	process: ChildProcess;
	port: number;
	certsPath: string;
}

export interface CrlServerContext {
	server: Server;
	port: number;
	certsPath: string;
}

/**
 * Start an OpenSSL OCSP responder process
 *
 * @param port - Port number for the OCSP responder
 * @param certsPath - Path to directory containing certificates and index.txt
 * @returns Promise resolving to OcspResponderContext
 */
export async function startOcspResponder(port: number, certsPath: string): Promise<OcspResponderContext> {
	return new Promise((resolve, reject) => {
		const proc = spawn(
			'openssl',
			[
				'ocsp',
				'-port',
				String(port),
				'-text',
				'-index',
				join(certsPath, 'index.txt'),
				'-CA',
				join(certsPath, 'harper-ca.crt'),
				'-rkey',
				join(certsPath, 'ocsp.key'),
				'-rsigner',
				join(certsPath, 'ocsp.crt'),
				'-nrequest',
				'100',
			],
			{
				cwd: certsPath,
				stdio: ['ignore', 'pipe', 'pipe'],
			}
		);

		let timeout: NodeJS.Timeout | null = setTimeout(() => {
			timeout = null;
			// OCSP responder typically doesn't output a "ready" message
			// so we'll just wait a reasonable amount of time
			resolve({
				process: proc,
				port,
				certsPath,
			});
		}, 2000);

		proc.stdout?.on('data', (data) => {
			// Log OCSP responder output for debugging
			if (process.env.DEBUG_OCSP) {
				console.log('OCSP responder:', data.toString());
			}
		});

		proc.stderr?.on('data', (data) => {
			// Log errors for debugging
			if (process.env.DEBUG_OCSP) {
				console.error('OCSP responder error:', data.toString());
			}
		});

		proc.on('error', (error) => {
			if (timeout) {
				clearTimeout(timeout);
				reject(new Error(`Failed to start OCSP responder: ${error.message}`));
			}
		});

		proc.on('exit', (code) => {
			if (timeout) {
				clearTimeout(timeout);
				reject(new Error(`OCSP responder exited with code ${code} before starting`));
			}
		});
	});
}

/**
 * Stop an OCSP responder process
 *
 * @param ctx - OCSP responder context
 */
export async function stopOcspResponder(ctx: OcspResponderContext): Promise<void> {
	return new Promise((resolve) => {
		const timeout = setTimeout(() => {
			// Force kill if graceful shutdown doesn't work
			ctx.process.kill('SIGKILL');
			resolve();
		}, 5000);

		ctx.process.on('exit', () => {
			clearTimeout(timeout);
			resolve();
		});

		ctx.process.kill('SIGTERM');
	});
}

/**
 * Start a Node.js HTTP server to serve CRL files
 *
 * @param port - Port number for the CRL server
 * @param certsPath - Path to directory containing test.crl
 * @returns Promise resolving to CrlServerContext
 */
export async function startCrlServer(port: number, certsPath: string): Promise<CrlServerContext> {
	return new Promise((resolve, reject) => {
		const server = createServer((req, res) => {
			if (req.url === '/test.crl') {
				try {
					const crl = readFileSync(join(certsPath, 'test.crl'));
					res.writeHead(200, {
						'Content-Type': 'application/pkix-crl',
						'Cache-Control': 'no-cache',
					});
					res.end(crl);
				} catch (error) {
					res.writeHead(500);
					res.end('Internal Server Error');
				}
			} else if (req.url === '/health') {
				res.writeHead(200, { 'Content-Type': 'text/plain' });
				res.end('OK');
			} else {
				res.writeHead(404);
				res.end('Not Found');
			}
		});

		server.on('error', reject);

		server.listen(port, () => {
			resolve({
				server,
				port,
				certsPath,
			});
		});
	});
}

/**
 * Stop a CRL server
 *
 * @param ctx - CRL server context
 */
export async function stopCrlServer(ctx: CrlServerContext): Promise<void> {
	return new Promise((resolve) => {
		ctx.server.close(() => resolve());
	});
}

// Re-export certificate generation functions
export { generateOcspCertificates } from './security/ocsp/generate-test-certs.ts';

export { generateCrlCertificates } from './security/crl/generate-test-certs.ts';
