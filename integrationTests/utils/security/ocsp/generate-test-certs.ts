/**
 * Generate test certificates for OCSP integration testing
 * This module generates a complete test CA and certificates for OCSP testing
 */

import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

/**
 * Certificate paths returned by OCSP certificate generation
 */
export interface OcspCertificates {
	/** Path to CA certificate */
	ca: string;
	/** Valid client certificate paths */
	valid: {
		/** Path to valid client certificate chain (cert + CA) */
		cert: string;
		/** Path to valid client private key */
		key: string;
	};
	/** Revoked client certificate paths */
	revoked: {
		/** Path to revoked client certificate chain (cert + CA) */
		cert: string;
		/** Path to revoked client private key */
		key: string;
	};
	/** OCSP responder certificate paths */
	ocsp: {
		/** Path to OCSP responder certificate */
		cert: string;
		/** Path to OCSP responder private key */
		key: string;
	};
	/** Path to OCSP index.txt database file */
	index: string;
}

/**
 * Generate OCSP test certificates
 *
 * @param outputDir - Directory where certificates will be generated
 * @param ocspHost - Hostname for OCSP responder URL
 * @param ocspPort - Port for OCSP responder URL
 * @returns Object containing paths to all generated certificates
 */
export function generateOcspCertificates(outputDir: string, ocspHost: string, ocspPort: number): OcspCertificates {
	// Generate test CA
	console.log('Generating test CA for OCSP testing...');

	const caKeyPath = path.join(outputDir, 'harper-ca.key');
	const caCertPath = path.join(outputDir, 'harper-ca.crt');

	execSync(`openssl genpkey -algorithm ED25519 -out ${caKeyPath}`);
	execSync(
		`openssl req -new -x509 -key ${caKeyPath} -out ${caCertPath} -days 365 -subj "/CN=Harper Test CA/O=Harper OCSP Test"`
	);

	console.log('Test CA generated successfully');

	// Generate OCSP responder certificate
	console.log('\nGenerating OCSP responder certificate...');
	const ocspKeyPath = path.join(outputDir, 'ocsp.key');
	const ocspCertPath = path.join(outputDir, 'ocsp.crt');

	execSync(`openssl genpkey -algorithm ED25519 -out ${ocspKeyPath}`);
	execSync(
		`openssl req -new -key ${ocspKeyPath} -out ${outputDir}/ocsp.csr -subj "/CN=OCSP Responder/O=Harper OCSP Test"`
	);

	// OCSP responder extensions
	const ocspExt = `[v3_ocsp]
basicConstraints = CA:FALSE
keyUsage = nonRepudiation, digitalSignature, keyEncipherment
extendedKeyUsage = OCSPSigning
subjectKeyIdentifier = hash
authorityKeyIdentifier = keyid,issuer`;

	fs.writeFileSync(path.join(outputDir, 'ocsp.ext'), ocspExt);

	execSync(
		`openssl x509 -req -in ${outputDir}/ocsp.csr -CA ${caCertPath} -CAkey ${caKeyPath} -CAcreateserial -out ${ocspCertPath} -days 365 -extensions v3_ocsp -extfile ${outputDir}/ocsp.ext`
	);
	console.log('OCSP responder certificate created');

	// Create OCSP chain (combine OCSP cert + CA cert for cross-platform compatibility)
	// Use fs APIs instead of shell commands for Windows support
	const ocspChain = fs.readFileSync(ocspCertPath, 'utf8') + fs.readFileSync(caCertPath, 'utf8');
	fs.writeFileSync(path.join(outputDir, 'ocsp-chain.crt'), ocspChain);

	// Generate client certificates
	console.log('\nGenerating client certificates...');

	// Valid client certificate
	const validKeyPath = path.join(outputDir, 'client-valid.key');
	const validCertPath = path.join(outputDir, 'client-valid.crt');

	execSync(`openssl genpkey -algorithm ED25519 -out ${validKeyPath}`);

	const clientExt = `[v3_client]
basicConstraints = CA:FALSE
keyUsage = nonRepudiation, digitalSignature, keyEncipherment
extendedKeyUsage = clientAuth
subjectAltName = DNS:client.local
authorityInfoAccess = OCSP;URI:http://${ocspHost}:${ocspPort},caIssuers;URI:http://${ocspHost}:${ocspPort}/ca.crt`;

	fs.writeFileSync(path.join(outputDir, 'client.ext'), clientExt);

	execSync(
		`openssl req -new -key ${validKeyPath} -out ${outputDir}/client-valid.csr -subj "/CN=Valid Client/O=Harper OCSP Test"`
	);
	execSync(
		`openssl x509 -req -in ${outputDir}/client-valid.csr -CA ${caCertPath} -CAkey ${caKeyPath} -CAcreateserial -out ${validCertPath} -days 365 -extensions v3_client -extfile ${outputDir}/client.ext`
	);

	// Create chain for valid cert (combine client cert + CA cert)
	const validChain = fs.readFileSync(validCertPath, 'utf8') + fs.readFileSync(caCertPath, 'utf8');
	fs.writeFileSync(path.join(outputDir, 'client-valid-chain.crt'), validChain);

	// Revoked client certificate
	const revokedKeyPath = path.join(outputDir, 'client-revoked.key');
	const revokedCertPath = path.join(outputDir, 'client-revoked.crt');

	execSync(`openssl genpkey -algorithm ED25519 -out ${revokedKeyPath}`);
	execSync(
		`openssl req -new -key ${revokedKeyPath} -out ${outputDir}/client-revoked.csr -subj "/CN=Revoked Client/O=Harper OCSP Test"`
	);
	execSync(
		`openssl x509 -req -in ${outputDir}/client-revoked.csr -CA ${caCertPath} -CAkey ${caKeyPath} -CAcreateserial -out ${revokedCertPath} -days 365 -extensions v3_client -extfile ${outputDir}/client.ext`
	);

	// Create chain for revoked cert (combine client cert + CA cert)
	const revokedChain = fs.readFileSync(revokedCertPath, 'utf8') + fs.readFileSync(caCertPath, 'utf8');
	fs.writeFileSync(path.join(outputDir, 'client-revoked-chain.crt'), revokedChain);

	console.log('Client certificates created');

	// Create OCSP database
	console.log('\nSetting up OCSP database...');

	// Create index file
	const validSerial = execSync(`openssl x509 -in ${validCertPath} -noout -serial`).toString().trim().split('=')[1];
	const revokedSerial = execSync(`openssl x509 -in ${revokedCertPath} -noout -serial`).toString().trim().split('=')[1];

	const indexContent = `V\t${new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().replace(/[-:]/g, '').slice(0, -5)}Z\t\t${validSerial}\tunknown\t/CN=Valid Client/O=Harper OCSP Test
R\t${new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().replace(/[-:]/g, '').slice(0, -5)}Z\t${new Date().toISOString().replace(/[-:]/g, '').slice(0, -5)}Z\t${revokedSerial}\tunknown\t/CN=Revoked Client/O=Harper OCSP Test`;

	const indexPath = path.join(outputDir, 'index.txt');
	fs.writeFileSync(indexPath, indexContent);
	fs.writeFileSync(path.join(outputDir, 'index.txt.attr'), 'unique_subject = no\n');

	console.log('\nAll certificates generated successfully!');

	return {
		ca: caCertPath,
		valid: {
			cert: path.join(outputDir, 'client-valid-chain.crt'),
			key: validKeyPath,
		},
		revoked: {
			cert: path.join(outputDir, 'client-revoked-chain.crt'),
			key: revokedKeyPath,
		},
		ocsp: {
			cert: ocspCertPath,
			key: ocspKeyPath,
		},
		index: indexPath,
	};
}
