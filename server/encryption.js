import crypto from 'crypto';
import dotenv from 'dotenv';

dotenv.config();

// Derives a secure 32-byte key from the environment secret
const getSecretKey = () => {
  const secret = process.env.ENCRYPTION_KEY || 'default-fallback-secure-key-32-character-long!';
  return crypto.createHash('sha256').update(secret).digest();
};

/**
 * Encrypts a string using AES-256-GCM.
 * @param {string} text Plaintext to encrypt
 * @returns {object} Object containing ciphertext, iv, and tag in hex format
 */
export function encrypt(text) {
  const iv = crypto.randomBytes(12);
  const key = getSecretKey();
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  
  const tag = cipher.getAuthTag().toString('hex');
  
  return {
    ciphertext: encrypted,
    iv: iv.toString('hex'),
    tag: tag
  };
}

/**
 * Decrypts an encrypted payload using AES-256-GCM.
 * @param {object} encryptedObj Object containing hex-encoded ciphertext, iv, and tag
 * @returns {string} Decrypted plaintext string
 */
export function decrypt(encryptedObj) {
  const { ciphertext, iv, tag } = encryptedObj;
  const key = getSecretKey();
  
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'hex'));
  decipher.setAuthTag(Buffer.from(tag, 'hex'));
  
  let decrypted = decipher.update(ciphertext, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  
  return decrypted;
}
