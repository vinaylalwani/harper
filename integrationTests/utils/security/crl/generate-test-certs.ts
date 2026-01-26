/**
 * Generate test certificates for CRL integration testing
 * This module generates a complete test CA and certificates for CRL testing
 * Similar to the OCSP test certificate generation but with CRL distribution points
 */

import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

/**
 * Generate CRL test certificates
 *
 * @param outputDir - Directory where certificates will be generated
 * @param crlHost - Hostname for CRL distribution point URL
 * @param crlPort - Port for CRL distribution point URL
 */
export function generateCrlCertificates(outputDir: string, crlHost: string, crlPort: number): void {
	console.log('Generating CRL test certificates...');

	// Generate test CA
	console.log('Generating test CA for CRL testing...');

	const caKeyPath = path.join(outputDir, 'harper-ca.key');
	const caCertPath = path.join(outputDir, 'harper-ca.crt');

	execSync(`openssl genpkey -algorithm ED25519 -out ${caKeyPath}`);
	execSync(
		`openssl req -new -x509 -key ${caKeyPath} -out ${caCertPath} -days 365 -subj "/CN=Harper Test CA/O=Harper CRL Test"`
	);

	console.log('Test CA generated successfully');

	// Generate client certificates
	console.log('\nGenerating client certificates...');

	// Generate valid client certificate
	const validKeyPath = path.join(outputDir, 'client-valid.key');
	const validCsrPath = path.join(outputDir, 'client-valid.csr');
	const validCertPath = path.join(outputDir, 'client-valid.crt');
	const validChainPath = path.join(outputDir, 'client-valid-chain.crt');

	execSync(`openssl genpkey -algorithm ED25519 -out ${validKeyPath}`);
	execSync(`openssl req -new -key ${validKeyPath} -out ${validCsrPath} -subj "/CN=Valid CRL Client/O=Harper CRL Test"`);

	// Create extensions for valid client cert with CRL distribution point
	const validExtensions = `[v3_client]
basicConstraints = CA:FALSE
keyUsage = digitalSignature, keyEncipherment
extendedKeyUsage = clientAuth
crlDistributionPoints = URI:http://${crlHost}:${crlPort}/test.crl`;

	const validExtFile = path.join(outputDir, 'client-valid.ext');
	fs.writeFileSync(validExtFile, validExtensions);

	execSync(
		`openssl x509 -req -in ${validCsrPath} -CA ${caCertPath} -CAkey ${caKeyPath} -out ${validCertPath} -days 30 -extensions v3_client -extfile ${validExtFile} -CAcreateserial`
	);

	// Create certificate chain (client cert + CA)
	const validCertContent = fs.readFileSync(validCertPath, 'utf8');
	const caCertContent = fs.readFileSync(caCertPath, 'utf8');
	fs.writeFileSync(validChainPath, validCertContent + caCertContent);

	// Generate revoked client certificate
	const revokedKeyPath = path.join(outputDir, 'client-revoked.key');
	const revokedCsrPath = path.join(outputDir, 'client-revoked.csr');
	const revokedCertPath = path.join(outputDir, 'client-revoked.crt');
	const revokedChainPath = path.join(outputDir, 'client-revoked-chain.crt');

	execSync(`openssl genpkey -algorithm ED25519 -out ${revokedKeyPath}`);
	execSync(
		`openssl req -new -key ${revokedKeyPath} -out ${revokedCsrPath} -subj "/CN=Revoked CRL Client/O=Harper CRL Test"`
	);

	// Create extensions for revoked client cert with CRL distribution point
	const revokedExtensions = `[v3_client]
basicConstraints = CA:FALSE
keyUsage = digitalSignature, keyEncipherment
extendedKeyUsage = clientAuth
crlDistributionPoints = URI:http://${crlHost}:${crlPort}/test.crl`;

	const revokedExtFile = path.join(outputDir, 'client-revoked.ext');
	fs.writeFileSync(revokedExtFile, revokedExtensions);

	execSync(
		`openssl x509 -req -in ${revokedCsrPath} -CA ${caCertPath} -CAkey ${caKeyPath} -out ${revokedCertPath} -days 30 -extensions v3_client -extfile ${revokedExtFile} -CAcreateserial`
	);

	// Create certificate chain (client cert + CA)
	const revokedCertContent = fs.readFileSync(revokedCertPath, 'utf8');
	fs.writeFileSync(revokedChainPath, revokedCertContent + caCertContent);

	console.log('Client certificates generated successfully');

	// Generate CRL
	console.log('\nGenerating CRL...');

	// Create index.txt file for CRL generation
	const indexPath = path.join(outputDir, 'index.txt');
	const serialPath = path.join(outputDir, 'crlnumber');
	const crlPath = path.join(outputDir, 'test.crl');

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
dir = ${outputDir}
database = ${indexPath}
crlnumber = ${serialPath}
certificate = ${caCertPath}
private_key = ${caKeyPath}
default_md = sha256
default_crl_days = 30
crl = ${outputDir}/test.crl
`;

	const configPath = path.join(outputDir, 'openssl.conf');
	fs.writeFileSync(configPath, configContent);

	// Generate CRL
	execSync(`openssl ca -config ${configPath} -gencrl -out ${crlPath}`);

	console.log('CRL generated successfully');
	console.log('\n✅ All CRL test certificates generated successfully!');
	console.log('Generated files:');
	console.log('  - harper-ca.crt (Test CA certificate)');
	console.log('  - harper-ca.key (Test CA private key)');
	console.log('  - client-valid-chain.crt (Valid client certificate chain)');
	console.log('  - client-revoked-chain.crt (Revoked client certificate chain)');
	console.log('  - test.crl (Certificate Revocation List)');
}
