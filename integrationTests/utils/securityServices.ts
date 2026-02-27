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
import type { OcspCertificates } from './security/ocsp/generate-test-certs.ts';
import type { CrlCertificates } from './security/crl/generate-test-certs.ts';

export interface OcspResponderContext {
	process: ChildProcess;
	port: number;
	certsPath: string;
	certs: OcspCertificates;
}

export interface CrlServerContext {
	server: Server;
	port: number;
	certsPath: string;
	certs: CrlCertificates;
}

/**
 * Start an OpenSSL OCSP responder process
 *
 * Note: Uses predetermined port selection rather than port 0 auto-allocation.
 * OCSP URLs must be embedded in certificates at generation time, so we need to know
 * the port before generating certificates. While we could parse the bound port from
 * OpenSSL's stdout, certificates must be generated before starting the responder
 * (it requires index.txt and CA cert at startup), creating a timing conflict.
 *
 * @param certsPath - Path to directory containing certificates and index.txt
 * @param port - Port number for the OCSP responder (default: 0 for random selection)
 * @param certs - Certificate paths
 * @returns Promise resolving to OcspResponderContext with actual port number
 */
export async function startOcspResponder(
	certsPath: string,
	port: number,
	certs: OcspCertificates
): Promise<OcspResponderContext> {
	// Select predetermined random port to avoid timing conflict with cert generation
	if (port === 0) {
		port = 50000 + Math.floor(Math.random() * 10000);
	}
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
				certs,
			});
		}, 2000);

		// stdio is piped, so stdout/stderr are always defined
		proc.stdout.on('data', (data) => {
			// Log OCSP responder output for debugging
			if (process.env.DEBUG_OCSP) {
				console.log('OCSP responder:', data.toString());
			}
		});

		proc.stderr.on('data', (data) => {
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

		// Use 'close' instead of 'exit' to ensure all stdio streams are fully flushed
		// and closed before handling the error - this prevents race conditions where we
		// might reject before all error output has been captured
		proc.on('close', (code) => {
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

		ctx.process.on('close', () => {
			clearTimeout(timeout);
			resolve();
		});

		ctx.process.kill('SIGTERM');
	});
}

/**
 * Start a Node.js HTTP server to serve CRL files
 *
 * Starts an HTTP server on an auto-allocated port (or specified port) to serve CRL files.
 * Returns the actual port number so certificates can be generated with the correct URL.
 *
 * @param certsPath - Path to directory containing test.crl
 * @param port - Port number for the CRL server
 * @param certs - Certificate paths
 * @returns Promise resolving to CrlServerContext with actual port number
 */
export async function startCrlServer(
	certsPath: string,
	port: number,
	certs: CrlCertificates
): Promise<CrlServerContext> {
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
				} catch {
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
			const address = server.address();
			if (!address || typeof address === 'string') {
				reject(new Error('Server did not bind to a network port'));
				return;
			}
			resolve({
				server,
				port: address.port,
				certsPath,
				certs,
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

// Re-export certificate generation functions and types
export { generateOcspCertificates, type OcspCertificates } from './security/ocsp/generate-test-certs.ts';

export { generateCrlCertificates, type CrlCertificates } from './security/crl/generate-test-certs.ts';

/**
 * Setup CRL server with automatic port allocation and retry on conflict
 *
 * This function handles the complete setup flow:
 * 1. Pick a random port from high range (50000-60000)
 * 2. Generate certificates with CRL Distribution Point URL containing that port
 * 3. Start the CRL server on that port
 * 4. Retry with a new port if EADDRINUSE conflict occurs
 *
 * We must generate certificates before starting the server because:
 * - CRL Distribution Point URLs are embedded in certificates at generation time
 * - The CRL server needs the test.crl file to exist when it starts serving
 *
 * Note: Uses 127.0.0.1 by default rather than Harper's loopback address because
 * this setup happens before Harper is allocated a loopback address from the pool.
 * Using 127.0.0.1 is safe since conflicts are prevented by random port selection.
 *
 * @param certsPath - Path to directory for certificate generation and storage
 * @param hostname - Hostname to use in CRL URLs (default: '127.0.0.1')
 * @param maxRetries - Maximum number of port allocation attempts (default: 5)
 * @returns Promise resolving to CrlServerContext with the successfully bound port
 */
export async function setupCrlServerWithCerts(
	certsPath: string,
	hostname: string = '127.0.0.1',
	maxRetries: number = 5
): Promise<CrlServerContext> {
	for (let attempt = 0; attempt < maxRetries; attempt++) {
		const port = 50000 + Math.floor(Math.random() * 10000);

		try {
			// Generate certificates with CRL URL containing this port
			const { generateCrlCertificates } = await import('./security/crl/generate-test-certs.ts');
			const certs = generateCrlCertificates(certsPath, hostname, port);

			// Start CRL server on the same port with certificates
			return startCrlServer(certsPath, port, certs);
		} catch (error: any) {
			if (error.code === 'EADDRINUSE' && attempt < maxRetries - 1) {
				// Port conflict - retry with new random port
				continue;
			}
			// Non-retryable error or max retries exceeded
			throw new Error(`Failed to setup CRL server after ${attempt + 1} attempts: ${error.message}`);
		}
	}
	throw new Error(`Failed to setup CRL server after ${maxRetries} attempts`);
}

/**
 * Setup OCSP responder with automatic port allocation and retry on conflict
 *
 * This function handles the complete setup flow:
 * 1. Pick a random port from high range (50000-60000)
 * 2. Generate certificates with OCSP responder URL containing that port
 * 3. Start the OCSP responder on that port
 * 4. Retry with a new port if startup fails (port conflict or other issues)
 *
 * We must generate certificates before starting the responder because:
 * - OCSP responder URLs are embedded in certificates at generation time
 * - The OCSP responder needs index.txt, CA cert, and signing certs at startup
 *
 * Note: Uses 127.0.0.1 by default rather than Harper's loopback address because
 * this setup happens before Harper is allocated a loopback address from the pool.
 * Using 127.0.0.1 is safe since conflicts are prevented by random port selection.
 *
 * @param certsPath - Path to directory for certificate generation and storage
 * @param hostname - Hostname to use in OCSP URLs (default: '127.0.0.1')
 * @param maxRetries - Maximum number of port allocation attempts (default: 5)
 * @returns Promise resolving to OcspResponderContext with the successfully bound port
 */
export async function setupOcspResponderWithCerts(
	certsPath: string,
	hostname: string = '127.0.0.1',
	maxRetries: number = 5
): Promise<OcspResponderContext> {
	for (let attempt = 0; attempt < maxRetries; attempt++) {
		const port = 50000 + Math.floor(Math.random() * 10000);

		try {
			// Generate certificates with OCSP URL containing this port
			const { generateOcspCertificates } = await import('./security/ocsp/generate-test-certs.ts');
			const certs = generateOcspCertificates(certsPath, hostname, port);

			// Start OCSP responder on the same port with certificates
			return startOcspResponder(certsPath, port, certs);
		} catch (error: any) {
			if (attempt < maxRetries - 1) {
				// Startup failed - retry with new random port
				// Common causes: port conflict, OpenSSL startup errors
				continue;
			}
			// Max retries exceeded
			throw new Error(`Failed to setup OCSP responder after ${attempt + 1} attempts: ${error.message}`);
		}
	}
	throw new Error(`Failed to setup OCSP responder after ${maxRetries} attempts`);
}
