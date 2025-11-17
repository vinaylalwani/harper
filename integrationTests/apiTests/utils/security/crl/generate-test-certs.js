#!/usr/bin/env node

/**
 * Generate test certificates for CRL integration testing
 * This script generates a complete test CA and certificates for CRL testing
 * Similar to the OCSP test certificate generation but with CRL distribution points
 */

const fs = require('node:fs');
const path = require('node:path');
const { execSync } = require('node:child_process');

const OUTPUT_DIR = path.join(__dirname, 'generated');
const CRL_PORT = process.env.CRL_PORT || 8889;
const CRL_HOST = process.env.CRL_HOST || 'localhost';

function generateTestCA() {
	console.log('Generating test CA for CRL testing...');

	const caKeyPath = path.join(OUTPUT_DIR, 'harper-ca.key');
	const caCertPath = path.join(OUTPUT_DIR, 'harper-ca.crt');

	// Generate CA key
	execSync(`openssl genpkey -algorithm ED25519 -out ${caKeyPath}`);

	// Generate CA certificate
	execSync(
		`openssl req -new -x509 -key ${caKeyPath} -out ${caCertPath} -days 365 -subj "/CN=Harper Test CA/O=Harper CRL Test"`
	);

	console.log('Test CA generated successfully');
	return { caKeyPath, caCertPath };
}

function generateClientCerts(caKeyPath, caCertPath) {
	console.log('\nGenerating client certificates...');

	// Generate valid client certificate
	const validKeyPath = path.join(OUTPUT_DIR, 'client-valid.key');
	const validCsrPath = path.join(OUTPUT_DIR, 'client-valid.csr');
	const validCertPath = path.join(OUTPUT_DIR, 'client-valid.crt');
	const validChainPath = path.join(OUTPUT_DIR, 'client-valid-chain.crt');

	execSync(`openssl genpkey -algorithm ED25519 -out ${validKeyPath}`);
	execSync(`openssl req -new -key ${validKeyPath} -out ${validCsrPath} -subj "/CN=Valid CRL Client/O=Harper CRL Test"`);

	// Create extensions for valid client cert with CRL distribution point
	const validExtensions = `[v3_client]
basicConstraints = CA:FALSE
keyUsage = digitalSignature, keyEncipherment
extendedKeyUsage = clientAuth
crlDistributionPoints = URI:http://${CRL_HOST}:${CRL_PORT}/test.crl`;

	const validExtFile = path.join(OUTPUT_DIR, 'client-valid.ext');
	fs.writeFileSync(validExtFile, validExtensions);

	execSync(
		`openssl x509 -req -in ${validCsrPath} -CA ${caCertPath} -CAkey ${caKeyPath} -out ${validCertPath} -days 30 -extensions v3_client -extfile ${validExtFile} -CAcreateserial`
	);

	// Create certificate chain (client cert + CA)
	const validCertContent = fs.readFileSync(validCertPath, 'utf8');
	const caCertContent = fs.readFileSync(caCertPath, 'utf8');
	fs.writeFileSync(validChainPath, validCertContent + caCertContent);

	// Generate revoked client certificate
	const revokedKeyPath = path.join(OUTPUT_DIR, 'client-revoked.key');
	const revokedCsrPath = path.join(OUTPUT_DIR, 'client-revoked.csr');
	const revokedCertPath = path.join(OUTPUT_DIR, 'client-revoked.crt');
	const revokedChainPath = path.join(OUTPUT_DIR, 'client-revoked-chain.crt');

	execSync(`openssl genpkey -algorithm ED25519 -out ${revokedKeyPath}`);
	execSync(
		`openssl req -new -key ${revokedKeyPath} -out ${revokedCsrPath} -subj "/CN=Revoked CRL Client/O=Harper CRL Test"`
	);

	// Create extensions for revoked client cert with CRL distribution point
	const revokedExtensions = `[v3_client]
basicConstraints = CA:FALSE
keyUsage = digitalSignature, keyEncipherment
extendedKeyUsage = clientAuth
crlDistributionPoints = URI:http://${CRL_HOST}:${CRL_PORT}/test.crl`;

	const revokedExtFile = path.join(OUTPUT_DIR, 'client-revoked.ext');
	fs.writeFileSync(revokedExtFile, revokedExtensions);

	execSync(
		`openssl x509 -req -in ${revokedCsrPath} -CA ${caCertPath} -CAkey ${caKeyPath} -out ${revokedCertPath} -days 30 -extensions v3_client -extfile ${revokedExtFile} -CAcreateserial`
	);

	// Create certificate chain (client cert + CA)
	const revokedCertContent = fs.readFileSync(revokedCertPath, 'utf8');
	fs.writeFileSync(revokedChainPath, revokedCertContent + caCertContent);

	console.log('Client certificates generated successfully');

	return {
		valid: { keyPath: validKeyPath, certPath: validCertPath, chainPath: validChainPath },
		revoked: { keyPath: revokedKeyPath, certPath: revokedCertPath, chainPath: revokedChainPath },
	};
}

function generateCRL(caKeyPath, caCertPath, validCertPath, revokedCertPath) {
	console.log('\nGenerating CRL...');

	// Create index.txt file for CRL generation
	const indexPath = path.join(OUTPUT_DIR, 'index.txt');
	const serialPath = path.join(OUTPUT_DIR, 'crlnumber');
	const crlPath = path.join(OUTPUT_DIR, 'test.crl');

	// Initialize files
	fs.writeFileSync(serialPath, '01\n');

	// Get serial numbers of both certificates
	const validSerial = execSync(`openssl x509 -in ${validCertPath} -noout -serial`)
		.toString()
		.trim()
		.replace('serial=', '');

	const revokedSerial = execSync(`openssl x509 -in ${revokedCertPath} -noout -serial`)
		.toString()
		.trim()
		.replace('serial=', '');

	// Format date for OpenSSL index.txt (YYMMDDHHMMSSZ format)
	const now = new Date();
	const revocationDate = now.toISOString().replace(/[-:T]/g, '').slice(2, 14) + 'Z';
	const expiryDate =
		new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().replace(/[-:T]/g, '').slice(2, 14) + 'Z';

	// Add BOTH certificates to index.txt - one valid, one revoked
	// OpenSSL format: Status<TAB>ExpiryDate<TAB>RevocationDate<TAB>SerialNumber<TAB>FileName<TAB>DistinguishedName
	const validEntry = `V\t${expiryDate}\t\t${validSerial}\tunknown\t/CN=Valid CRL Client/O=Harper CRL Test\n`;
	const revokedEntry = `R\t${expiryDate}\t${revocationDate}\t${revokedSerial}\tunknown\t/CN=Revoked CRL Client/O=Harper CRL Test\n`;
	fs.writeFileSync(indexPath, validEntry + revokedEntry);

	// Create minimal openssl config for CRL generation
	const configContent = `
[ca]
default_ca = test_ca

[test_ca]
dir = ${OUTPUT_DIR}
database = ${indexPath}
crlnumber = ${serialPath}
certificate = ${caCertPath}
private_key = ${caKeyPath}
default_md = sha256
default_crl_days = 30
crl = ${OUTPUT_DIR}/test.crl
`;

	const configPath = path.join(OUTPUT_DIR, 'openssl.conf');
	fs.writeFileSync(configPath, configContent);

	// Generate CRL
	execSync(`openssl ca -config ${configPath} -gencrl -out ${crlPath}`);

	console.log('CRL generated successfully');
	return crlPath;
}

function generateCRLCerts() {
	// Create output directory
	if (!fs.existsSync(OUTPUT_DIR)) {
		fs.mkdirSync(OUTPUT_DIR, { recursive: true });
	}

	try {
		console.log('Generating CRL test certificates...');

		// Generate test CA
		const { caKeyPath, caCertPath } = generateTestCA();

		// Generate client certificates
		const clientCerts = generateClientCerts(caKeyPath, caCertPath);

		// Generate CRL with both valid and revoked certificates
		generateCRL(caKeyPath, caCertPath, clientCerts.valid.certPath, clientCerts.revoked.certPath);

		console.log('\n✅ All CRL test certificates generated successfully!');
		console.log('Generated files:');
		console.log('  - harper-ca.crt (Test CA certificate)');
		console.log('  - harper-ca.key (Test CA private key)');
		console.log('  - client-valid-chain.crt (Valid client certificate chain)');
		console.log('  - client-revoked-chain.crt (Revoked client certificate chain)');
		console.log('  - test.crl (Certificate Revocation List)');
	} catch (error) {
		console.error('Error generating CRL certificates:', error);
		process.exit(1);
	}
}

// Run if called directly
if (require.main === module) {
	generateCRLCerts();
}

module.exports = { generateCRLCerts };
