import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { prisma, logActivity } from '../db';
import {
  MIN_PASSWORD_LENGTH,
  SESSION_COOKIE,
  createSession,
  destroySession,
  hashPassword,
  toAuthedUser,
  verifyPassword,
} from '../auth';
import { authedUserWithPermissions } from '../permissions';
import { verifyTotpToken } from '../totp';
import { decryptTotpSecret, consumeBackupCode } from '../twoFactor';
import { createPendingLogin, checkPendingLogin, consumePendingLogin } from '../pendingTotpLogins';

export const authRouter = Router();

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
authRouter.post('/setup', async (req, res) => {
  const userCount = await prisma.user.count();
  if (userCount > 0) return res.status(403).json({ error: 'Setup already completed' });
  const { username, password, displayName } = req.body ?? {};
  if (!username || !password) return res.status(400).json({ error: 'username and password are required' });
  if (password.length < MIN_PASSWORD_LENGTH) {
    return res.status(400).json({ error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` });
  }
  const user = await prisma.user.create({
    data: {
      username,
      displayName: displayName || username,
      passwordHash: hashPassword(password),
      role: 'ADMIN',
    },
  });
  const session = await createSession(user.id);
  res.cookie(SESSION_COOKIE, session.id, { ...COOKIE_OPTS, expires: session.expiresAt });
  await logActivity('auth.setup', `Initial admin ${username} created`, undefined, user.id);
  res.status(201).json(await authedUserWithPermissions(toAuthedUser(user)));
});

authRouter.post('/login', loginLimiter, async (req, res) => {
  const { username, password } = req.body ?? {};
  if (!username || !password) return res.status(400).json({ error: 'username and password are required' });
  const user = await prisma.user.findUnique({ where: { username } });
  if (!user || !verifyPassword(password, user.passwordHash)) {
    // Logged either way (user not found vs. wrong password look identical here) - an admin
    // reviewing the activity log for a compromise attempt cares that someone tried this
    // username from this IP, not which specific reason it failed for.
    await logActivity('auth.login_failed', username, undefined, user?.id);
    return res.status(401).json({ error: 'Incorrect username or password' });
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
  if (!pendingToken || (!code && !backupCode)) {
    return res.status(400).json({ error: 'pendingToken and code (or backupCode) are required' });
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

  const data: Record<string, string> = {};
  if (displayName !== undefined) data.displayName = displayName;
  if (prefs !== undefined) data.prefsJson = JSON.stringify(prefs);
  if (password !== undefined) {
    if (password.length < MIN_PASSWORD_LENGTH) {
      return res.status(400).json({ error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` });
    }
    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    if (!user || !currentPassword || !verifyPassword(currentPassword, user.passwordHash)) {
      return res.status(403).json({ error: 'Current password is incorrect' });
    }
    data.passwordHash = hashPassword(password);
  }

  const updated = await prisma.user.update({ where: { id: req.user.id }, data });
  res.json(await authedUserWithPermissions(toAuthedUser(updated)));
});
