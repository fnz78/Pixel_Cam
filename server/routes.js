import express from 'express';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { encrypt, decrypt } from './encryption.js';

const router = express.Router();
let DB_PATH = process.env.PERSISTENT_DIR
  ? path.join(process.env.PERSISTENT_DIR, 'db.json')
  : path.resolve('server/db.json');

// Ensure db.json file database structure exists
const initDb = () => {
  try {
    const dir = path.dirname(DB_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  } catch (err) {
    console.warn(`⚠️ Warning: Failed to create persistent directory at "${DB_PATH}". Falling back to local directory. Error:`, err.message);
    DB_PATH = path.resolve('server/db.json');
    const localDir = path.dirname(DB_PATH);
    if (!fs.existsSync(localDir)) {
      fs.mkdirSync(localDir, { recursive: true });
    }
  }

  if (!fs.existsSync(DB_PATH)) {
    fs.writeFileSync(DB_PATH, JSON.stringify({ shares: {} }, null, 2));
  }
};

initDb();

const readDb = () => {
  try {
    const data = fs.readFileSync(DB_PATH, 'utf8');
    return JSON.parse(data);
  } catch (err) {
    console.error('Failed to read database file:', err);
    return { shares: {} };
  }
};

const writeDb = (db) => {
  try {
    fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
  } catch (err) {
    console.error('Failed to write database file:', err);
  }
};

// API Endpoint to securely share a polaroid card (At-rest AES-256-GCM encryption)
router.post('/share', (req, res) => {
  const { imageDataUrl, caption } = req.body;

  if (!imageDataUrl || typeof imageDataUrl !== 'string') {
    return res.status(400).json({ error: 'Image data is required and must be a string' });
  }

  // Validate imageDataUrl format (must be a valid PNG/JPEG/WEBP base64 data URL)
  const dataUrlRegex = /^data:image\/(png|jpeg|jpg|webp);base64,([A-Za-z0-9+/=]+)$/;
  if (!dataUrlRegex.test(imageDataUrl)) {
    return res.status(400).json({ error: 'Invalid image data url format' });
  }

  // Validate optional caption (max length 50)
  if (caption !== undefined && (typeof caption !== 'string' || caption.length > 50)) {
    return res.status(400).json({ error: 'Caption must be a string and not exceed 50 characters' });
  }

  try {
    // 1. Serialize data
    const payload = JSON.stringify({
      imageDataUrl,
      caption: caption || ''
    });

    // 2. Encrypt
    const encryptedData = encrypt(payload);

    // 3. Generate secure random share ID (16 hex chars)
    const shareId = crypto.randomBytes(8).toString('hex');

    // 4. Save hex ciphertext metadata to database
    const db = readDb();
    if (!db.shares) {
      db.shares = {};
    }

    db.shares[shareId] = {
      ciphertext: encryptedData.ciphertext,
      iv: encryptedData.iv,
      tag: encryptedData.tag,
      createdAt: new Date().toISOString()
    };
    writeDb(db);

    res.json({ id: shareId });
  } catch (err) {
    console.error('Share failed:', err);
    res.status(500).json({ error: 'Failed to share image securely' });
  }
});

// API Endpoint to retrieve and decrypt a shared polaroid
router.get('/share/:id', (req, res) => {
  const shareId = req.params.id;

  // Validate share ID format (16 hex chars)
  if (!/^[a-f0-9]{16}$/.test(shareId)) {
    return res.status(404).json({ error: 'Shared Polaroid not found' });
  }

  const db = readDb();

  // Guard against prototype pollution and check if the share exists
  if (!db.shares || !Object.prototype.hasOwnProperty.call(db.shares, shareId)) {
    return res.status(404).json({ error: 'Shared Polaroid not found' });
  }

  const share = db.shares[shareId];

  try {
    // Decrypt the payload
    const decryptedPayload = decrypt({
      ciphertext: share.ciphertext,
      iv: share.iv,
      tag: share.tag
    });

    // Send the decrypted JSON data back
    const data = JSON.parse(decryptedPayload);
    res.json(data);
  } catch (err) {
    console.error('Decryption failed for share:', shareId, err);
    res.status(500).json({ error: 'Failed to decrypt shared content. Key might be invalid.' });
  }
});

export default router;
