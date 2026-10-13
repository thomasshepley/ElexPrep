import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { NextFunction, Request, Response } from 'express';
import { prisma } from './db';
import { isDevelopmentLockdownEnabled, isFullLockdownEnabled } from './lockdownMode';

/// WEBMASTER sits above ADMIN - it passes every requireRole/requirePermission check regardless
/// of which roles are listed (see requireRole/permissions.ts below), on top of its own
/// exclusive access to the bug-report Webmaster page. Deliberately not offered anywhere in the
/// web UI's role pickers (routes/users.ts's create/update allowlists never include it) - the
/// only way to grant it is the server-side admin CLI (server/src/cli.ts), a channel an ADMIN
/// account has no access to.
export type Role = 'ADMIN' | 'USER' | 'SIGNAGE' | 'CREW' | 'WEBMASTER';

/** Treats WEBMASTER as ADMIN-equivalent for any check that's really about "elevated staff
 * access" (job visibility, settings pages, admin-only panels) rather than literally the ADMIN
 * role value - use this instead of a raw `role === 'ADMIN'` comparison wherever WEBMASTER
 * should see/do the same thing an ADMIN can. */
export function isAdminRole(role: string | null | undefined): boolean {
  return role === 'ADMIN' || role === 'WEBMASTER';
}

export interface AuthedUser {
  id: string;
  username: string;
  displayName: string;
  role: Role;
  prefs: Record<string, unknown>;
  avatarPath: string | null;
  mustChangePassword: boolean;
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

// Async so a burst of login attempts can't block the event loop for everyone else.
export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

// Compared against when a username doesn't exist, so "no such user" takes as long as "wrong
// password" and response timing doesn't reveal which usernames are real.
const DUMMY_HASH = bcrypt.hashSync('timing-equaliser-not-a-real-password', 10);
export async function burnPasswordCheck(password: string): Promise<void> {
  await bcrypt.compare(password, DUMMY_HASH);
}

export async function createSession(userId: string): Promise<{ id: string; expiresAt: Date }> {
  const id = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await prisma.session.create({ data: { id, userId, expiresAt } });
  // Opportunistic cleanup - cheap with the expiresAt index, and logins are rare enough.
  await prisma.session.deleteMany({ where: { expiresAt: { lt: new Date() } } });
  return { id, expiresAt };
}

/** After a password change: sign the account out everywhere except (optionally) the session
 * that made the change. */
export async function revokeOtherSessions(userId: string, keepSessionId?: string) {
  await prisma.session.deleteMany({ where: { userId, ...(keepSessionId ? { id: { not: keepSessionId } } : {}) } });
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
  avatarPath?: string | null;
  mustChangePassword?: boolean;
}): AuthedUser {
  let prefs: Record<string, unknown> = {};
  try {
    prefs = JSON.parse(u.prefsJson);
  } catch {
    // corrupted prefs shouldn't lock the account out
  }
  return {
    id: u.id,
    username: u.username,
    displayName: u.displayName,
    role: u.role as Role,
    prefs,
    avatarPath: u.avatarPath ?? null,
    mustChangePassword: u.mustChangePassword ?? false,
  };
}

// The one deliberate, narrow write exception for the otherwise read-only SIGNAGE role: prep
// crew tick items off directly on the prep-bay TV as they pull them. Everything else SIGNAGE
// touches stays GET-only.
const SIGNAGE_WRITE_ALLOWLIST = [/^\/api\/jobs\/[^/]+\/current-rms\/pick-list\/[^/]+\/prepped$/];

// The crew portal (routes/crewPortal.ts) is entirely self-service: every path here only ever
// returns the logged-in crew member's own data (profile, their jobs, a job's Who/What/When/
// Where/Why - schedule, documents, plots, kit list, prep requests) - nothing takes another
// crew member's id from the client, and every /me/jobs/:jobId/* handler re-checks the caller
// is actually assigned to that job before touching its data. Notifications are likewise
// self-scoped to req.user.id in every handler (routes/notifications.ts), so they're safe to
// allow here too. Everything else stays a hard 403 rather than silently falling through to
// whatever a plain USER could do.
const CREW_ALLOWLIST = [
  /^\/api\/auth\/me$/,
  /^\/api\/auth\/me\/avatar$/,
  /^\/api\/auth\/users\/[^/]+\/avatar$/,
  /^\/api\/2fa(\/.*)?$/,
  /^\/api\/crew\/me$/,
  /^\/api\/crew\/me\/bank-details$/,
  /^\/api\/crew\/me\/rate-lines(\/.*)?$/,
  /^\/api\/crew\/me\/jobs$/,
  /^\/api\/crew\/me\/jobs\/[^/]+(\/.*)?$/,
  /^\/api\/notifications(\/.*)?$/,
  /^\/api\/bug-reports$/,
];

/**
 * Resolves the session cookie to req.user, then gates every /api route except health
 * and the auth endpoints themselves. SIGNAGE accounts are read-only (aside from the one
 * allowlisted exception above): any other non-GET request from one is rejected, so a
 * compromised prep-bay TV login can't mutate anything else. CREW accounts are locked out of
 * everything except auth/me until the crew portal (a later milestone) gives them somewhere
 * to go - see CREW_ALLOWLIST.
 */
export async function authMiddleware(req: Request, res: Response, next: NextFunction) {
  const token = req.cookies?.[SESSION_COOKIE];
  if (token) {
    const session = await prisma.session.findUnique({ where: { id: token }, include: { user: true } });
    if (session && session.expiresAt > new Date()) {
      req.user = toAuthedUser(session.user);
    }
  }

  // Only API routes are session-gated - static assets and the SPA shell must load so the
  // login page itself can render. /api/agent/* authenticates with its own static token
  // (see routes/agent.ts), not a session.
  if (!req.path.startsWith('/api/')) return next();
  if (
    req.path === '/api/health' ||
    req.path === '/api/version' ||
    req.path.startsWith('/api/auth/') ||
    req.path.startsWith('/api/agent/')
  ) {
    return next();
  }
  // The one public write in the whole app: submitting a crew application needs no login (the
  // applicant doesn't have an account yet - that's the point). Every other path under this
  // prefix (list/approve/reject/documents) stays behind the normal auth + permission check
  // below, matched by not being this exact path/method.
  if (req.path === '/api/crew-applications' && req.method === 'POST') return next();
  // Same reasoning for the onboarding flow: the initial name-only request, and the invitee's
  // later lookup/completion of their own approved invite by its one-time token, both happen
  // before any account exists. Listing/approving/rejecting invites stays admin-only below.
  if (req.path === '/api/onboarding' && req.method === 'POST') return next();
  if (/^\/api\/onboarding\/invite\/[^/]+(\/complete)?$/.test(req.path)) return next();
  if (!req.user) return res.status(401).json({ error: 'Not signed in' });
  // Two lockdown tiers (see lockdownMode.ts), checked against every API call including one
  // from a session that was already live when lockdown was switched on, not just new logins
  // (those are stopped separately in routes/auth.ts). Full lockdown is checked first since
  // it's the stricter tier - if both happen to be on, its message is the more accurate one.
  if (req.user.role !== 'WEBMASTER' && (await isFullLockdownEnabled())) {
    return res.status(503).json({ error: 'The site is in lockdown mode - try again shortly' });
  }
  if (!isAdminRole(req.user.role) && (await isDevelopmentLockdownEnabled())) {
    return res.status(503).json({ error: 'The site is locked down for development - try again shortly' });
  }
  // A forced reset is enforced here, not just by the SPA: until the password is changed (via
  // PUT /api/auth/me, exempt above), the account can't touch anything else.
  if (req.user.mustChangePassword) {
    return res.status(403).json({ error: 'You must set a new password before continuing' });
  }
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
    if (!req.user) return res.status(403).json({ error: 'Insufficient permissions' });
    if (req.user.role === 'WEBMASTER') return next();
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    next();
  };
}
