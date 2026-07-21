import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { prisma, logActivity } from '../db';
import {
  SESSION_COOKIE,
  createSession,
  destroySession,
  hashPassword,
  toAuthedUser,
  verifyPassword,
} from '../auth';

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
// restart) — generous enough not to lock out someone who just mistypes a few times.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many attempts — wait a while and try again' },
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
  res.status(201).json(toAuthedUser(user));
});

authRouter.post('/login', loginLimiter, async (req, res) => {
  const { username, password } = req.body ?? {};
  if (!username || !password) return res.status(400).json({ error: 'username and password are required' });
  const user = await prisma.user.findUnique({ where: { username } });
  if (!user || !verifyPassword(password, user.passwordHash)) {
    return res.status(401).json({ error: 'Incorrect username or password' });
  }
  const session = await createSession(user.id);
  res.cookie(SESSION_COOKIE, session.id, { ...COOKIE_OPTS, expires: session.expiresAt });
  await logActivity('auth.login', username, undefined, user.id);
  res.json(toAuthedUser(user));
});

authRouter.post('/logout', async (req, res) => {
  const token = req.cookies?.[SESSION_COOKIE];
  if (token) await destroySession(token);
  res.clearCookie(SESSION_COOKIE, COOKIE_OPTS);
  res.status(204).end();
});

authRouter.get('/me', (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Not signed in' });
  res.json(req.user);
});

authRouter.put('/me', async (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Not signed in' });
  const { displayName, password, currentPassword, prefs } = req.body ?? {};

  const data: Record<string, string> = {};
  if (displayName !== undefined) data.displayName = displayName;
  if (prefs !== undefined) data.prefsJson = JSON.stringify(prefs);
  if (password !== undefined) {
    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    if (!user || !currentPassword || !verifyPassword(currentPassword, user.passwordHash)) {
      return res.status(403).json({ error: 'Current password is incorrect' });
    }
    data.passwordHash = hashPassword(password);
  }

  const updated = await prisma.user.update({ where: { id: req.user.id }, data });
  res.json(toAuthedUser(updated));
});
