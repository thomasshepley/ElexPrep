import crypto from 'crypto';

/**
 * AES-256-GCM via Node's built-in crypto - right-sized for a small company's internal tool,
 * not an enterprise KMS (see the plan). The key lives in CREW_DOC_ENCRYPTION_KEY (64 hex chars
 * = 32 bytes), checked lazily at first use rather than a hard startup crash, since most routes
 * never touch it and a misconfigured key shouldn't take down the whole server.
 */
const ALGORITHM = 'aes-256-gcm';

function loadKey(): Buffer {
  const raw = process.env.CREW_DOC_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error('CREW_DOC_ENCRYPTION_KEY is not set - crew document upload/download is unavailable');
  }
  const key = Buffer.from(raw, 'hex');
  if (key.length !== 32) {
    throw new Error('CREW_DOC_ENCRYPTION_KEY must be 32 bytes, encoded as 64 hex characters');
  }
  return key;
}

export function encryptBuffer(plaintext: Buffer): { ciphertext: Buffer; iv: string; authTag: string } {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, loadKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return { ciphertext, iv: iv.toString('base64'), authTag: cipher.getAuthTag().toString('base64') };
}

export function decryptBuffer(ciphertext: Buffer, ivB64: string, authTagB64: string): Buffer {
  const decipher = crypto.createDecipheriv(ALGORITHM, loadKey(), Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(authTagB64, 'base64'));
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}
