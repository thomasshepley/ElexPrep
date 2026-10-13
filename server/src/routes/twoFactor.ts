import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { prisma, logActivity } from '../db';
import { verifyPassword } from '../auth';
import { generateTotpSecret, verifyTotpToken, buildOtpauthUrl } from '../totp';
import { encryptTotpSecret, regenerateBackupCodes, countRemainingBackupCodes } from '../twoFactor';

/**
 * Self-service two-factor management - any signed-in role (ADMIN/USER/SIGNAGE/CREW) can
 * enroll their own account, matching the "crew login" half of the security ask as much as the
 * admin half. Nothing here is mandatory/enforced yet (see routes/auth.ts's login flow for the
 * part that actually gates login once a user has opted in) - this is the self-enrollment
 * surface.
 */
export const twoFactorRouter = Router();

const sensitiveActionLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many attempts - wait a while and try again' },
});

twoFactorRouter.get('/status', async (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Not signed in' });
  const user = await prisma.user.findUnique({ where: { id: req.user.id } });
  if (!user) return res.status(404).json({ error: 'not found' });
  res.json({
    enabled: user.totpEnabled,
    verifiedAt: user.totpVerifiedAt,
    backupCodesRemaining: user.totpEnabled ? await countRemainingBackupCodes(user.id) : 0,
  });
});

/** Generates a new secret but does NOT persist it - an abandoned setup (closed the tab before
 * entering a code) leaves the account exactly as it was. The client must prove it can produce
 * a valid code for this exact secret via /confirm before anything is saved. */
twoFactorRouter.post('/setup', async (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Not signed in' });
  const secret = generateTotpSecret();
  res.json({ secret, otpauthUrl: buildOtpauthUrl(secret, req.user.username) });
});

twoFactorRouter.post('/confirm', sensitiveActionLimiter, async (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Not signed in' });
  const { secret, code } = req.body ?? {};
  if (!secret || !code) return res.status(400).json({ error: 'secret and code are required' });
  if (!verifyTotpToken(secret, code)) return res.status(400).json({ error: 'Incorrect code - check the time on your device and try again' });

  const encrypted = encryptTotpSecret(secret);
  await prisma.user.update({
    where: { id: req.user.id },
    data: { ...encrypted, totpEnabled: true, totpVerifiedAt: new Date() },
  });
  const backupCodes = await regenerateBackupCodes(req.user.id);
  await logActivity('auth.2fa_enabled', req.user.username, undefined, req.user.id);
  res.json({ backupCodes });
});

twoFactorRouter.post('/disable', sensitiveActionLimiter, async (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Not signed in' });
  const { password } = req.body ?? {};
  const user = await prisma.user.findUnique({ where: { id: req.user.id } });
  if (!user || !password || !(await verifyPassword(password, user.passwordHash))) {
    return res.status(403).json({ error: 'Current password is incorrect' });
  }
  await prisma.$transaction([
    prisma.user.update({
      where: { id: req.user.id },
      data: { totpEnabled: false, totpSecretCiphertext: null, totpSecretIv: null, totpSecretAuthTag: null, totpVerifiedAt: null },
    }),
    prisma.backupCode.deleteMany({ where: { userId: req.user.id } }),
  ]);
  await logActivity('auth.2fa_disabled', req.user.username, undefined, req.user.id);
  res.status(204).end();
});

twoFactorRouter.post('/backup-codes/regenerate', sensitiveActionLimiter, async (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Not signed in' });
  const { password } = req.body ?? {};
  const user = await prisma.user.findUnique({ where: { id: req.user.id } });
  if (!user || !password || !(await verifyPassword(password, user.passwordHash))) {
    return res.status(403).json({ error: 'Current password is incorrect' });
  }
  if (!user.totpEnabled) return res.status(400).json({ error: 'Two-factor authentication is not enabled' });
  const backupCodes = await regenerateBackupCodes(req.user.id);
  await logActivity('auth.2fa_backup_codes_regenerated', req.user.username, undefined, req.user.id);
  res.json({ backupCodes });
});
