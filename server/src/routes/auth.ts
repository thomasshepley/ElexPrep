import { NextFunction, Request, Response, Router } from 'express';
import rateLimit from 'express-rate-limit';
import { IMAGE_KINDS, acceptDiskUpload, randomUploadName, sendStoredUpload } from '../uploadSafety';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { prisma, logActivity } from '../db';
import { uploadDir } from './jobs';
import {
  MIN_PASSWORD_LENGTH,
  SESSION_COOKIE,
  burnPasswordCheck,
  createSession,
  revokeOtherSessions,
  destroySession,
  hashPassword,
  isAdminRole,
  toAuthedUser,
  verifyPassword,
} from '../auth';
import { authedUserWithPermissions } from '../permissions';
import { isDevelopmentLockdownEnabled, isFullLockdownEnabled } from '../lockdownMode';
import { verifyTotpToken } from '../totp';
import { decryptTotpSecret, consumeBackupCode } from '../twoFactor';
import { createPendingLogin, checkPendingLogin, consumePendingLogin } from '../pendingTotpLogins';

export const authRouter = Router();

const avatarsDir = path.join(uploadDir, 'avatars');
fs.mkdirSync(avatarsDir, { recursive: true });
const avatarUpload = multer({
  storage: multer.diskStorage({
    destination: avatarsDir,
    filename: (_req, _file, cb) => cb(null, randomUploadName()),
  }),
  fileFilter: (_req, file, cb) => cb(null, file.mimetype.startsWith('image/')),
  limits: { fileSize: 5 * 1024 * 1024 },
});

// COOKIE_SECURE opts in for HTTPS deployments; left off by default since a common
// deployment here is a LAN/home box over plain HTTP, where a secure cookie would silently
// never get set by the browser.
const COOKIE_OPTS = {
  httpOnly: true,
  sameSite: 'lax' as const,
  path: '/',
  secure: process.env.COOKIE_SECURE === 'true',
};

// Slows down password-guessing without needing external state (per-process, resets on
// restart) - generous enough not to lock out someone who just mistypes a few times.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many attempts - wait a while and try again' },
});

authRouter.get('/status', async (_req, res) => {
  const userCount = await prisma.user.count();
  res.json({ needsSetup: userCount === 0 });
});

/** First-run only: creates the initial admin account while no users exist. */
// Serialises first-run setup within this (single) server process, so two simultaneous visitors
// can't both see "no users yet" and both become the initial admin.
let setupLock: Promise<unknown> = Promise.resolve();

authRouter.post('/setup', async (req, res) => {
  const { username, password, displayName } = req.body ?? {};
  if (typeof username !== 'string' || typeof password !== 'string' || !username || !password) {
    return res.status(400).json({ error: 'username and password are required' });
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    return res.status(400).json({ error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` });
  }
  const run = setupLock.then(async () => {
    if ((await prisma.user.count()) > 0) return null;
    return prisma.user.create({
      data: {
        username,
        displayName: typeof displayName === 'string' && displayName ? displayName : username,
        passwordHash: await hashPassword(password),
        role: 'ADMIN',
      },
    });
  });
  setupLock = run.catch(() => {});
  const user = await run;
  if (!user) return res.status(403).json({ error: 'Setup already completed' });
  const session = await createSession(user.id);
  res.cookie(SESSION_COOKIE, session.id, { ...COOKIE_OPTS, expires: session.expiresAt });
  await logActivity('auth.setup', `Initial admin ${username} created`, undefined, user.id);
  res.status(201).json(await authedUserWithPermissions(toAuthedUser(user)));
});

authRouter.post('/login', loginLimiter, async (req, res) => {
  const { username, password } = req.body ?? {};
  if (typeof username !== 'string' || typeof password !== 'string' || !username || !password) {
    return res.status(400).json({ error: 'username and password are required' });
  }
  const user = await prisma.user.findUnique({ where: { username } });
  if (!user) await burnPasswordCheck(password);
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    // Logged either way (user not found vs. wrong password look identical here) - an admin
    // reviewing the activity log for a compromise attempt cares that someone tried this
    // username from this IP, not which specific reason it failed for.
    await logActivity('auth.login_failed', username, undefined, user?.id);
    return res.status(401).json({ error: 'Incorrect username or password' });
  }

  if (user.role !== 'WEBMASTER' && (await isFullLockdownEnabled())) {
    return res.status(503).json({ error: 'The site is in lockdown mode - try again shortly' });
  }
  if (!isAdminRole(user.role) && (await isDevelopmentLockdownEnabled())) {
    return res.status(503).json({ error: 'The site is locked down for development - try again shortly' });
  }

  if (user.totpEnabled) {
    const pendingToken = createPendingLogin(user.id);
    await logActivity('auth.login_password_ok_awaiting_2fa', username, undefined, user.id);
    return res.json({ requiresTotp: true, pendingToken });
  }

  const session = await createSession(user.id);
  res.cookie(SESSION_COOKIE, session.id, { ...COOKIE_OPTS, expires: session.expiresAt });
  await logActivity('auth.login', username, undefined, user.id);
  res.json(await authedUserWithPermissions(toAuthedUser(user)));
});

const totpVerifyLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many attempts - wait a while and try again' },
});

/** The second step of logging in to a 2FA-enabled account - pendingToken proves the password
 * step already succeeded (see /login above); this only ever creates a session once a correct
 * TOTP code or an unused backup code is also supplied. */
authRouter.post('/login/verify-2fa', totpVerifyLimiter, async (req, res) => {
  const { pendingToken, code, backupCode } = req.body ?? {};
  if (typeof pendingToken !== 'string' || !pendingToken || (!code && !backupCode)) {
    return res.status(400).json({ error: 'pendingToken and code (or backupCode) are required' });
  }
  if ((code !== undefined && typeof code !== 'string') || (backupCode !== undefined && typeof backupCode !== 'string')) {
    return res.status(400).json({ error: 'code and backupCode must be strings' });
  }
  const pending = checkPendingLogin(pendingToken);
  if (!pending) return res.status(401).json({ error: 'That login attempt has expired - sign in again' });

  const user = await prisma.user.findUnique({ where: { id: pending.userId } });
  if (!user || !user.totpEnabled) return res.status(401).json({ error: 'That login attempt has expired - sign in again' });

  const secret = decryptTotpSecret(user);
  const ok = code ? !!secret && verifyTotpToken(secret, code) : await consumeBackupCode(user.id, backupCode);
  if (!ok) {
    await logActivity('auth.login_2fa_failed', user.username, undefined, user.id);
    return res.status(401).json({ error: 'Incorrect code' });
  }

  if (user.role !== 'WEBMASTER' && (await isFullLockdownEnabled())) {
    return res.status(503).json({ error: 'The site is in lockdown mode - try again shortly' });
  }
  if (!isAdminRole(user.role) && (await isDevelopmentLockdownEnabled())) {
    return res.status(503).json({ error: 'The site is locked down for development - try again shortly' });
  }

  consumePendingLogin(pendingToken);
  const session = await createSession(user.id);
  res.cookie(SESSION_COOKIE, session.id, { ...COOKIE_OPTS, expires: session.expiresAt });
  await logActivity(backupCode ? 'auth.login_2fa_backup_code' : 'auth.login_2fa_verified', user.username, undefined, user.id);
  res.json(await authedUserWithPermissions(toAuthedUser(user)));
});

authRouter.post('/logout', async (req, res) => {
  const token = req.cookies?.[SESSION_COOKIE];
  if (token) await destroySession(token);
  res.clearCookie(SESSION_COOKIE, COOKIE_OPTS);
  res.status(204).end();
});

authRouter.get('/me', async (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Not signed in' });
  res.json(await authedUserWithPermissions(req.user));
});

authRouter.put('/me', async (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Not signed in' });
  const { displayName, password, currentPassword, prefs } = req.body ?? {};

  const data: Record<string, unknown> = {};
  if (displayName !== undefined) {
    if (typeof displayName !== 'string' || !displayName.trim()) return res.status(400).json({ error: 'displayName must be a non-empty string' });
    data.displayName = displayName;
  }
  if (prefs !== undefined) {
    if (typeof prefs !== 'object' || prefs === null || Array.isArray(prefs)) return res.status(400).json({ error: 'prefs must be an object' });
    data.prefsJson = JSON.stringify(prefs);
  }
  // A forced reset only allows the password change itself (authMiddleware's gate exempts this
  // whole /auth prefix, so it's enforced here instead).
  if (req.user.mustChangePassword && password === undefined) {
    return res.status(403).json({ error: 'You must set a new password before continuing' });
  }
  if (password !== undefined) {
    if (typeof password !== 'string' || typeof currentPassword !== 'string') {
      return res.status(400).json({ error: 'password and currentPassword must be strings' });
    }
    if (password.length < MIN_PASSWORD_LENGTH) {
      return res.status(400).json({ error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` });
    }
    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    if (!user || !currentPassword || !(await verifyPassword(currentPassword, user.passwordHash))) {
      return res.status(403).json({ error: 'Current password is incorrect' });
    }
    data.passwordHash = await hashPassword(password);
    // Satisfies an admin-forced reset (see cli.ts's force-password-reset) the moment they
    // actually change it - no separate "I'm done" step needed.
    data.mustChangePassword = false;
  }

  const updated = await prisma.user.update({ where: { id: req.user.id }, data });
  if (password !== undefined) {
    await revokeOtherSessions(req.user.id, req.cookies?.[SESSION_COOKIE]);
    await logActivity('auth.password_change', updated.username, undefined, updated.id);
  }
  res.json(await authedUserWithPermissions(toAuthedUser(updated)));
});

function requireSignedIn(req: Request, res: Response, next: NextFunction) {
  if (!req.user) return res.status(401).json({ error: 'Not signed in' });
  next();
}

// requireSignedIn runs before multer so an anonymous request never gets a file written to disk.
authRouter.post('/me/avatar', requireSignedIn, avatarUpload.single('avatar'), async (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Not signed in' });
  if (!req.file) return res.status(400).json({ error: 'avatar file is required' });
  await acceptDiskUpload(req.file, IMAGE_KINDS);
  const existing = await prisma.user.findUnique({ where: { id: req.user.id } });
  const updated = await prisma.user.update({ where: { id: req.user.id }, data: { avatarPath: req.file.filename } });
  if (existing?.avatarPath) await fs.promises.unlink(path.join(avatarsDir, existing.avatarPath)).catch(() => {});
  await logActivity('user.avatar_upload', req.file.originalname, undefined, req.user.id);
  res.json(await authedUserWithPermissions(toAuthedUser(updated)));
});

authRouter.delete('/me/avatar', async (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Not signed in' });
  const existing = await prisma.user.findUnique({ where: { id: req.user.id } });
  const updated = await prisma.user.update({ where: { id: req.user.id }, data: { avatarPath: null } });
  if (existing?.avatarPath) await fs.promises.unlink(path.join(avatarsDir, existing.avatarPath)).catch(() => {});
  res.json(await authedUserWithPermissions(toAuthedUser(updated)));
});

/** Any signed-in account can view any other account's avatar (same posture as a job logo once
 * public) - there's nothing sensitive in a profile picture, and showing crew/staff avatars
 * next to their name elsewhere needs this to work for users other than yourself. */
authRouter.get('/users/:id/avatar', async (req, res) => {
  if (!req.user) return res.status(401).end();
  const user = await prisma.user.findUnique({ where: { id: req.params.id } });
  if (!user?.avatarPath) return res.status(404).end();
  await sendStoredUpload(res, path.join(avatarsDir, user.avatarPath), `avatar${path.extname(user.avatarPath)}`);
});
