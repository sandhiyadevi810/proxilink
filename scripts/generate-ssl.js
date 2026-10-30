/**
 * ProxiLink – Automated SSL/TLS Self-Signed Certificate Generator
 * Creates self-signed SSL certificates for HTTPS Secure Context
 * (Required by modern browsers for Web Bluetooth and WebRTC outside localhost).
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { networkInterfaces } = require('os');
const selfsigned = require('selfsigned');

const SSL_DIR = path.join(__dirname, '..', 'ssl');
const KEY_PATH = path.join(SSL_DIR, 'server.key');
const CERT_PATH = path.join(SSL_DIR, 'server.cert');

async function generateCertificates() {
  console.log('[SSL Generator] Preparing ProxiLink HTTPS certificates...');

  if (!fs.existsSync(SSL_DIR)) {
    fs.mkdirSync(SSL_DIR, { recursive: true });
  }

  // Collect all local IPv4 addresses to embed as Subject Alternative Names (SAN)
  const nets = networkInterfaces();
  const altNames = [
    { type: 2, value: 'localhost' },
    { type: 7, ip: '127.0.0.1' }
  ];

  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) {
        altNames.push({ type: 7, ip: net.address });
      }
    }
  }

  const attrs = [
    { name: 'commonName', value: 'ProxiLink Local Offline Authority' },
    { name: 'countryName', value: 'IN' },
    { name: 'organizationName', value: 'ProxiLink Platform' },
    { shortName: 'OU', value: 'Offline Wireless Mesh' }
  ];

  console.log('[SSL Generator] Generating 2048-bit RSA key pair and x509 certificate...');
  const pems = await selfsigned.generate(attrs, {
    keySize: 2048,
    days: 365,
    algorithm: 'sha256'
  });

  fs.writeFileSync(KEY_PATH, pems.private, { mode: 0o600 });
  fs.writeFileSync(CERT_PATH, pems.cert, { mode: 0o644 });

  console.log(`[SSL Generator] Private key written to: ${KEY_PATH}`);
  console.log(`[SSL Generator] Certificate written to: ${CERT_PATH}`);
  console.log('[SSL Generator] Setup complete! You can now start ProxiLink with HTTPS=true.');
}

if (require.main === module) {
  generateCertificates().catch(err => {
    console.error('[SSL Generator Error]', err);
    process.exit(1);
  });
}

module.exports = generateCertificates;
