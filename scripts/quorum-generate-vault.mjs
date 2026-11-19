// Generates the RSA-OAEP 4096 key pair used to encrypt provider keys in the browser.
// Writes a wrangler "secret bulk" JSON file (mode 0600) to the path given. Never prints key material.
import { writeFileSync } from 'node:fs';
const out = process.argv[2];
if (!out) throw new Error('Usage: node scripts/quorum-generate-vault.mjs <output.json>');
const pair = await crypto.subtle.generateKey({ name: 'RSA-OAEP', modulusLength: 4096, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['encrypt', 'decrypt']);
const priv = await crypto.subtle.exportKey('jwk', pair.privateKey), pub = await crypto.subtle.exportKey('jwk', pair.publicKey);
const recipientId = 'quorum-' + new Date().toISOString().slice(0, 10) + '-' + crypto.randomUUID().slice(0, 8);
writeFileSync(out, JSON.stringify({ QUORUM_KEY_PRIVATE_JWK: JSON.stringify(priv), QUORUM_KEY_PUBLIC_JWK: JSON.stringify({ kty: pub.kty, n: pub.n, e: pub.e }), QUORUM_KEY_RECIPIENT_ID: recipientId }), { mode: 0o600 });
console.log('Vault key pair generated (recipient ' + recipientId + ').');
