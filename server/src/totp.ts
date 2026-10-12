import crypto from 'crypto';

/**
 * A minimal RFC 4226 (HOTP) / RFC 6238 (TOTP) implementation using only Node's built-in
 * crypto module - deliberately no otplib/speakeasy dependency, the same "right-sized, not an
 * enterprise dependency" posture as crewDocCrypto.ts. SHA-1/6-digit/30-second-step is the
 * universal default every authenticator app (Google Authenticator, Authy, 1Password, etc.)
 * assumes, so those aren't made configurable.
 */
const DIGITS = 6;
const PERIOD_SECONDS = 30;
const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32Encode(buffer: Buffer): string {
  let bits = '';
  for (const byte of buffer) bits += byte.toString(2).padStart(8, '0');
  let out = '';
  for (let i = 0; i + 5 <= bits.length; i += 5) {
    out += BASE32_ALPHABET[parseInt(bits.slice(i, i + 5), 2)];
  }
  const remainder = bits.length % 5;
  if (remainder > 0) {
    const lastChunk = bits.slice(bits.length - remainder).padEnd(5, '0');
    out += BASE32_ALPHABET[parseInt(lastChunk, 2)];
  }
  return out;
}

export function base32Decode(encoded: string): Buffer {
  const clean = encoded.toUpperCase().replace(/[^A-Z2-7]/g, '');
  let bits = '';
  for (const char of clean) {
    const value = BASE32_ALPHABET.indexOf(char);
    if (value === -1) continue;
    bits += value.toString(2).padStart(5, '0');
  }
  const bytes: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    bytes.push(parseInt(bits.slice(i, i + 8), 2));
  }
  return Buffer.from(bytes);
}

/** A fresh random secret, 160 bits (20 bytes) - RFC 4226's recommended minimum. */
export function generateTotpSecret(): string {
  return base32Encode(crypto.randomBytes(20));
}

function hotp(secret: Buffer, counter: number): string {
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeBigUInt64BE(BigInt(counter));
  const hmac = crypto.createHmac('sha1', secret).update(counterBuffer).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const binary =
    ((hmac[offset] & 0x7f) << 24) | ((hmac[offset + 1] & 0xff) << 16) | ((hmac[offset + 2] & 0xff) << 8) | (hmac[offset + 3] & 0xff);
  return String(binary % 10 ** DIGITS).padStart(DIGITS, '0');
}

export function generateTotpToken(secretBase32: string, at: number = Date.now()): string {
  const counter = Math.floor(at / 1000 / PERIOD_SECONDS);
  return hotp(base32Decode(secretBase32), counter);
}

/** Accepts the current time step and one step either side, to tolerate ordinary clock drift
 * between the server and the user's phone without widening the window enough to meaningfully
 * help an attacker guessing codes. */
export function verifyTotpToken(secretBase32: string, token: string, at: number = Date.now()): boolean {
  const cleaned = token.trim();
  if (!/^\d{6}$/.test(cleaned)) return false;
  const counter = Math.floor(at / 1000 / PERIOD_SECONDS);
  const secret = base32Decode(secretBase32);
  for (const delta of [0, -1, 1]) {
    if (hotp(secret, counter + delta) === cleaned) return true;
  }
  return false;
}

export function buildOtpauthUrl(secretBase32: string, accountLabel: string, issuer = 'ELEX Portal'): string {
  const label = encodeURIComponent(`${issuer}:${accountLabel}`);
  const params = new URLSearchParams({
    secret: secretBase32,
    issuer,
    algorithm: 'SHA1',
    digits: String(DIGITS),
    period: String(PERIOD_SECONDS),
  });
  return `otpauth://totp/${label}?${params.toString()}`;
}
