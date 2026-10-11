import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { NextFunction, Request, Response } from 'express';
import { prisma } from './db';

export type Role = 'ADMIN' | 'USER' | 'SIGNAGE' | 'CREW';

export interface AuthedUser {
  id: string;
  username: string;
  displayName: string;
  role: Role;
  prefs: Record<string, unknown>;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthedUser;
    }
  }
}

export const SESSION_COOKIE = 'elexprep_session';
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
export const MIN_PASSWORD_LENGTH = 8;

export function hashPassword(password: string): string {
  return bcrypt.hashSync(password, 10);
}

export function verifyPassword(password: string, hash: string): boolean {
  return bcrypt.compareSync(password, hash);
}

export async function createSession(userId: string): Promise<{ id: string; expiresAt: Date }> {
  const id = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await prisma.session.create({ data: { id, userId, expiresAt } });
  return { id, expiresAt };
}

export async function destroySession(id: string) {
  await prisma.session.deleteMany({ where: { id } });
}

export function toAuthedUser(u: {
  id: string;
  username: string;
  displayName: string;
  role: string;
  prefsJson: string;
}): AuthedUser {
  let prefs: Record<string, unknown> = {};
  try {
    prefs = JSON.parse(u.prefsJson);
  } catch {
    // corrupted prefs shouldn't lock the account out
  }
  return { id: u.id, username: u.username, displayName: u.displayName, role: u.role as Role, prefs };
}

// The one deliberate, narrow write exception for the otherwise read-only SIGNAGE role: prep
// crew tick items off directly on the prep-bay TV as they pull them. Everything else SIGNAGE
// touches stays GET-only.
const SIGNAGE_WRITE_ALLOWLIST = [/^\/api\/jobs\/[^/]+\/current-rms\/pick-list\/[^/]+\/prepped$/];

// The crew portal (routes/crewPortal.ts) is entirely self-service: every path here only ever
// returns the logged-in crew member's own data (profile, their jobs, a job's Who/What/When/
// Where/Why — schedule, documents, plots, kit list, prep requests) — nothing takes another
// crew member's id from the client, and every /me/jobs/:jobId/* handler re-checks the caller
// is actually assigned to that job before touching its data. Notifications are likewise
// self-scoped to req.user.id in every handler (routes/notifications.ts), so they're safe to
// allow here too. Everything else stays a hard 403 rather than silently falling through to
// whatever a plain USER could do.
const CREW_ALLOWLIST = [
  /^\/api\/auth\/me$/,
  /^\/api\/crew\/me$/,
  /^\/api\/crew\/me\/jobs$/,
  /^\/api\/crew\/me\/jobs\/[^/]+(\/.*)?$/,
  /^\/api\/notifications(\/.*)?$/,
];

/**
 * Resolves the session cookie to req.user, then gates every /api route except health
 * and the auth endpoints themselves. SIGNAGE accounts are read-only (aside from the one
 * allowlisted exception above): any other non-GET request from one is rejected, so a
 * compromised prep-bay TV login can't mutate anything else. CREW accounts are locked out of
 * everything except auth/me until the crew portal (a later milestone) gives them somewhere
 * to go — see CREW_ALLOWLIST.
 */
export async function authMiddleware(req: Request, res: Response, next: NextFunction) {
  const token = req.cookies?.[SESSION_COOKIE];
  if (token) {
    const session = await prisma.session.findUnique({ where: { id: token }, include: { user: true } });
    if (session && session.expiresAt > new Date()) {
      req.user = toAuthedUser(session.user);
    }
  }

  // Only API routes are session-gated — static assets and the SPA shell must load so the
  // login page itself can render. /api/agent/* authenticates with its own static token
  // (see routes/agent.ts), not a session.
  if (!req.path.startsWith('/api/')) return next();
  if (req.path === '/api/health' || req.path.startsWith('/api/auth/') || req.path.startsWith('/api/agent/')) {
    return next();
  }
  // The one public write in the whole app: submitting a crew application needs no login (the
  // applicant doesn't have an account yet — that's the point). Every other path under this
  // prefix (list/approve/reject/documents) stays behind the normal auth + permission check
  // below, matched by not being this exact path/method.
  if (req.path === '/api/crew-applications' && req.method === 'POST') return next();
  if (!req.user) return res.status(401).json({ error: 'Not signed in' });
  if (req.user.role === 'SIGNAGE' && req.method !== 'GET') {
    const allowed = SIGNAGE_WRITE_ALLOWLIST.some((re) => re.test(req.path));
    if (!allowed) return res.status(403).json({ error: 'Signage accounts are view-only' });
  }
  if (req.user.role === 'CREW') {
    const allowed = CREW_ALLOWLIST.some((re) => re.test(req.path));
    if (!allowed) return res.status(403).json({ error: 'The crew portal is not available yet' });
  }
  next();
}

export function requireRole(...roles: Role[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    next();
  };
}
