import { encryptBuffer, decryptBuffer } from './crewDocCrypto';

/**
 * Encrypts a single secret string (a third-party API key or OAuth client secret) at rest
 * using the same AES-256-GCM scheme as crew documents/bank details (see crewDocCrypto.ts) -
 * these settings previously sat as plain text in AppSetting.valueJson, which is a real
 * exposure for the Current RMS API key and OneDrive client secret (either one hands over
 * read access to the whole company CRM or file store) if the SQLite file is ever copied out
 * un-backed-up or a backup leaks. The `enc1:` marker tells a legacy plaintext value (from
 * before this existed) apart from an encrypted one, so an upgrade reads an old plaintext
 * secret correctly and simply re-encrypts it the next time that setting is saved - no
 * migration step needed.
 */
const MARKER = 'enc1:';

export function encryptSecret(plain: string): string {
  if (!plain) return '';
  const { ciphertext, iv, authTag } = encryptBuffer(Buffer.from(plain, 'utf8'));
  const payload = JSON.stringify({ iv, authTag, c: ciphertext.toString('base64') });
  return MARKER + Buffer.from(payload, 'utf8').toString('base64');
}

export function decryptSecret(stored: string): string {
  if (!stored) return '';
  if (!stored.startsWith(MARKER)) return stored;
  try {
    const payload = JSON.parse(Buffer.from(stored.slice(MARKER.length), 'base64').toString('utf8')) as {
      iv: string;
      authTag: string;
      c: string;
    };
    return decryptBuffer(Buffer.from(payload.c, 'base64'), payload.iv, payload.authTag).toString('utf8');
  } catch {
    // Corrupted value or CREW_DOC_ENCRYPTION_KEY changed/missing - fail closed (treat as not
    // configured) rather than throw and take down a sync poll or settings page load.
    return '';
  }
}
