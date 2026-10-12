import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { prisma } from './db';
import { encryptBuffer, decryptBuffer } from './crewDocCrypto';

const BACKUP_CODE_COUNT = 10;

export function encryptTotpSecret(secretBase32: string) {
  const { ciphertext, iv, authTag } = encryptBuffer(Buffer.from(secretBase32, 'utf8'));
  return { totpSecretCiphertext: ciphertext.toString('base64'), totpSecretIv: iv, totpSecretAuthTag: authTag };
}

export function decryptTotpSecret(user: { totpSecretCiphertext: string | null; totpSecretIv: string | null; totpSecretAuthTag: string | null }): string | null {
  if (!user.totpSecretCiphertext || !user.totpSecretIv || !user.totpSecretAuthTag) return null;
  const plaintext = decryptBuffer(Buffer.from(user.totpSecretCiphertext, 'base64'), user.totpSecretIv, user.totpSecretAuthTag);
  return plaintext.toString('utf8');
}

/** Human-friendly format (XXXX-XXXX, excluding visually ambiguous characters) rather than a
 * raw hex string - these get written down or typed by hand when an authenticator is lost. */
function generateBackupCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I
  const bytes = crypto.randomBytes(8);
  let code = '';
  for (let i = 0; i < 8; i++) code += alphabet[bytes[i] % alphabet.length];
  return `${code.slice(0, 4)}-${code.slice(4)}`;
}

/** Replaces this user's entire backup-code set and returns the new plaintext codes - the
 * only time they're ever available in plaintext; only bcrypt hashes are persisted. */
export async function regenerateBackupCodes(userId: string): Promise<string[]> {
  const codes = Array.from({ length: BACKUP_CODE_COUNT }, generateBackupCode);
  await prisma.$transaction([
    prisma.backupCode.deleteMany({ where: { userId } }),
    prisma.backupCode.createMany({
      data: codes.map((code) => ({ userId, codeHash: bcrypt.hashSync(code, 10) })),
    }),
  ]);
  return codes;
}

export async function countRemainingBackupCodes(userId: string): Promise<number> {
  return prisma.backupCode.count({ where: { userId, usedAt: null } });
}

/** Checks `code` against this user's unused backup codes and marks the match consumed.
 * Each code works exactly once - a second attempt with the same code fails like a wrong one. */
export async function consumeBackupCode(userId: string, code: string): Promise<boolean> {
  const normalized = code.trim().toUpperCase();
  const candidates = await prisma.backupCode.findMany({ where: { userId, usedAt: null } });
  for (const candidate of candidates) {
    if (bcrypt.compareSync(normalized, candidate.codeHash)) {
      await prisma.backupCode.update({ where: { id: candidate.id }, data: { usedAt: new Date() } });
      return true;
    }
  }
  return false;
}
