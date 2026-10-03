import test from 'node:test';
import assert from 'node:assert/strict';
import { encrypt, decrypt } from '../server/encryption.js';

test('AES-256-GCM Encryption & Decryption round-trip', () => {
  const originalText = JSON.stringify({ imageDataUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', caption: 'Test Polaroid' });
  
  const encrypted = encrypt(originalText);
  
  assert.ok(encrypted.ciphertext, 'Ciphertext should be present');
  assert.ok(encrypted.iv, 'IV should be present');
  assert.ok(encrypted.tag, 'Auth tag should be present');
  
  const decrypted = decrypt(encrypted);
  assert.equal(decrypted, originalText, 'Decrypted text must match original payload');
});

test('Encryption produces different IVs for same plaintext', () => {
  const text = 'test-payload';
  const enc1 = encrypt(text);
  const enc2 = encrypt(text);

  assert.notEqual(enc1.iv, enc2.iv, 'IVs should be unique per encryption');
  assert.equal(decrypt(enc1), text);
  assert.equal(decrypt(enc2), text);
});
