import crypto from 'crypto';
import { Request, Response, Router } from 'express';
import rateLimit from 'express-rate-limit';
import { prisma, logActivity } from '../db';
import { burnPasswordCheck, isAdminRole, requireRole, verifyPassword, type Role } from '../auth';
import { requirePermission } from '../permissions';
import { isDevelopmentLockdownEnabled, isFullLockdownEnabled } from '../lockdownMode';
import { verifyTotpToken } from '../totp';
import { consumeBackupCode, decryptTotpSecret } from '../twoFactor';
import { getPrepConfig, savePrepConfig } from '../prep/config';
import { emitBayEvent, openPrepStream } from '../prep/events';
import { getSourceLines, invalidateSourceLines } from '../prep/lines';
import {
  adjustLine,
  applyScan,
  buildPrepView,
  forgetUnknownCode,
  prepStatuses,
  reopenPrep,
  resolveFlag,
  setCasePacked,
  signOff,
  transportArrived,
  type Actor,
  type ScanSource,
} from '../prep/service';

/**
 * Prep bays: the TV screen at each bay, the crew member signed in on it, and the scans that
 * come from its hardware scanner or a paired phone.
 *
 * Who is acting: a bay screen is signed in as a prep or signage account, and a crew member
 * signs in on top of that (X-Prep-Operator) - that person is the one recorded, and they only
 * see jobs they are on. A phone uses its own login. Admins can act from anywhere.
 */
export const prepRouter = Router();

const BAY_HEADER = 'x-prep-bay';
const OPERATOR_HEADER = 'x-prep-operator';

const newToken = () => crypto.randomBytes(24).toString('base64url');

/** Roles a bay screen itself may be signed in as. */
const KIOSK_ROLES: Role[] = ['SIGNAGE', 'USER', 'ADMIN'];

async function bayFromRequest(req: Request) {
  const token = (req.header(BAY_HEADER) ?? (typeof req.query.bay === 'string' ? req.query.bay : '')).trim();
  if (!token) return null;
  const bay = await prisma.screenDevice.findUnique({ where: { token } });
  if (bay && (!bay.lastSeenAt || Date.now() - bay.lastSeenAt.getTime() > 30_000)) {
    await prisma.screenDevice.update({ where: { id: bay.id }, data: { lastSeenAt: new Date() } });
  }
  return bay;
}

async function endOperatorSession(id: string, deviceId: string, reason: string) {
  await prisma.prepOperatorSession.update({ where: { id }, data: { endedAt: new Date() } });
  emitBayEvent(deviceId, 'operator', { reason });
}

/** The crew member signed in on this bay, or null (signing them out if they have gone idle). */
async function activeOperator(req: Request, bayId: string | null) {
  const token = req.header(OPERATOR_HEADER)?.trim();
  if (!token || !bayId) return null;
  const session = await prisma.prepOperatorSession.findUnique({ where: { token }, include: { user: true } });
  if (!session || session.endedAt || session.deviceId !== bayId) return null;
  const { operatorIdleMinutes } = await getPrepConfig();
  if (Date.now() - session.lastActiveAt.getTime() > operatorIdleMinutes * 60_000) {
    await endOperatorSession(session.id, session.deviceId, 'idle');
    return null;
  }
  return session;
}

async function touchOperator(sessionId: string) {
  await prisma.prepOperatorSession.update({ where: { id: sessionId }, data: { lastActiveAt: new Date() } }).catch(() => {});
}

interface ActorContext {
  actor: Actor;
  role: Role;
  operatorSessionId: string | null;
  bay: Awaited<ReturnType<typeof bayFromRequest>>;
}

/** Who this request acts as: the bay's signed-in crew member, else the logged-in account itself
 * (a phone or an office admin). A signage login on its own cannot act. */
async function actorFor(req: Request): Promise<ActorContext | null> {
  const bay = await bayFromRequest(req);
  const op = await activeOperator(req, bay?.id ?? null);
  if (op) {
    return { actor: { userId: op.user.id, name: op.user.displayName, deviceId: bay!.id }, role: op.user.role as Role, operatorSessionId: op.id, bay };
  }
  const user = req.user!;
  if (user.role === 'SIGNAGE') return null;
  return { actor: { userId: user.id, name: user.displayName, deviceId: bay?.id ?? null }, role: user.role, operatorSessionId: null, bay };
}

/** Admins prep any job; everyone else only the jobs they are on (USER accounts also public jobs). */
async function canPrepJob(userId: string, role: Role, jobId: string): Promise<boolean> {
  if (isAdminRole(role)) return true;
  const assigned = await prisma.jobCrewAssignment.findFirst({ where: { jobId, crewProfile: { userId } }, select: { id: true } });
  if (assigned) return true;
  if (role === 'USER') {
    const job = await prisma.job.findUnique({ where: { id: jobId }, select: { isPublic: true } });
    return Boolean(job?.isPublic);
  }
  return false;
}

async function jobsForPrep(userId: string, role: Role) {
  const assigned = await prisma.jobCrewAssignment.findMany({ where: { crewProfile: { userId } }, select: { jobId: true } });
  const where = isAdminRole(role)
    ? {}
    : role === 'USER'
      ? { OR: [{ isPublic: true }, { id: { in: assigned.map((a) => a.jobId) } }] }
      : { id: { in: assigned.map((a) => a.jobId) } };
  const weekAgo = new Date(Date.now() - 7 * 86_400_000);
  const jobs = await prisma.job.findMany({
    where: { AND: [where, { OR: [{ endsAt: null }, { endsAt: { gte: weekAgo } }] }] },
    select: { id: true, name: true, venue: true, startsAt: true, endsAt: true },
    orderBy: [{ startsAt: 'asc' }, { name: 'asc' }],
    take: 60,
  });
  const statuses = await prepStatuses(jobs.map((j) => j.id));
  return jobs.map((j) => ({ ...j, prep: statuses.get(j.id) ?? null }));
}

/** Pulls the actor and checks they may prep :jobId, answering the request if not. */
async function requirePrepAccess(req: Request, res: Response): Promise<ActorContext | null> {
  const ctx = await actorFor(req);
  if (!ctx) {
    res.status(403).json({ error: 'Sign in on the screen first' });
    return null;
  }
  if (!(await canPrepJob(ctx.actor.userId, ctx.role, req.params.jobId))) {
    res.status(404).json({ error: 'not found' });
    return null;
  }
  if (ctx.operatorSessionId) await touchOperator(ctx.operatorSessionId);
  return ctx;
}

// Operators going idle are signed out even if the screen stops asking, so the TV updates.
setInterval(async () => {
  try {
    const { operatorIdleMinutes } = await getPrepConfig();
    const stale = await prisma.prepOperatorSession.findMany({
      where: { endedAt: null, lastActiveAt: { lt: new Date(Date.now() - operatorIdleMinutes * 60_000) } },
      select: { id: true, deviceId: true },
    });
    for (const s of stale) await endOperatorSession(s.id, s.deviceId, 'idle');
  } catch {
    // Next sweep will try again.
  }
}, 60_000).unref();

// ---------------------------------------------------------------------------------------------
// Bay screen
// ---------------------------------------------------------------------------------------------

/** Bay names, for a new screen to pick which bay it is. */
prepRouter.get('/bays', requireRole(...KIOSK_ROLES), async (_req, res) => {
  const bays = await prisma.screenDevice.findMany({ select: { id: true, name: true }, orderBy: { name: 'asc' } });
  res.json(bays);
});

prepRouter.post('/bays/:id/claim', requireRole(...KIOSK_ROLES), async (req, res) => {
  const bay = await prisma.screenDevice.findUnique({ where: { id: req.params.id } });
  if (!bay) return res.status(404).json({ error: 'not found' });
  await prisma.screenDevice.update({ where: { id: bay.id }, data: { lastSeenAt: new Date() } });
  await logActivity('prep.bay_claimed', `${bay.name} claimed by ${req.user!.displayName}`, undefined, req.user!.id);
  res.json({ id: bay.id, name: bay.name, token: bay.token });
});

function publicConfig(c: Awaited<ReturnType<typeof getPrepConfig>>) {
  return { scannerPrefix: c.scannerPrefix, scannerSuffix: c.scannerSuffix, sound: c.sound, operatorIdleMinutes: c.operatorIdleMinutes };
}

/** This screen's bay: its name, the job it shows and who is signed in. */
prepRouter.get('/bay', requireRole(...KIOSK_ROLES), async (req, res) => {
  const bay = await bayFromRequest(req);
  if (!bay) return res.status(404).json({ error: 'This screen is not set up as a bay' });
  const op = await activeOperator(req, bay.id);
  res.json({
    id: bay.id,
    name: bay.name,
    token: bay.token,
    currentJobId: bay.currentJobId,
    operator: op ? { id: op.user.id, displayName: op.user.displayName, role: op.user.role, avatarPath: op.user.avatarPath, signedInAt: op.createdAt } : null,
    config: publicConfig(await getPrepConfig()),
  });
});

prepRouter.put('/bay/job', requireRole(...KIOSK_ROLES), async (req, res) => {
  const ctx = await actorFor(req);
  if (!ctx?.bay) return res.status(403).json({ error: 'Sign in on the screen first' });
  const jobId = req.body?.jobId === null ? null : String(req.body?.jobId ?? '');
  if (jobId && !(await canPrepJob(ctx.actor.userId, ctx.role, jobId))) return res.status(404).json({ error: 'not found' });
  await prisma.screenDevice.update({ where: { id: ctx.bay.id }, data: { currentJobId: jobId || null } });
  if (ctx.operatorSessionId) await touchOperator(ctx.operatorSessionId);
  emitBayEvent(ctx.bay.id, 'bay', { currentJobId: jobId || null });
  res.json({ currentJobId: jobId || null });
});

const operatorLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many attempts - wait a while and try again' },
});

/**
 * The crew sign-in on a bay screen. The same checks as the main login (password, lockdown,
 * two-factor), but it creates a bay operator session rather than replacing the screen's own
 * login, so signing out on the TV never signs the TV itself out.
 */
prepRouter.post('/operator/login', requireRole(...KIOSK_ROLES), operatorLoginLimiter, async (req, res) => {
  const bay = await bayFromRequest(req);
  if (!bay) return res.status(400).json({ error: 'This screen is not set up as a bay' });
  const { username, password, code, backupCode } = req.body ?? {};
  if (typeof username !== 'string' || typeof password !== 'string' || !username || !password) {
    return res.status(400).json({ error: 'Username and password are required' });
  }
  const user = await prisma.user.findUnique({ where: { username: username.trim() } });
  if (!user) await burnPasswordCheck(password);
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    await logActivity('prep.operator_login_failed', `${username} on ${bay.name}`, undefined, user?.id);
    return res.status(401).json({ error: 'Incorrect username or password' });
  }
  if (user.role === 'SIGNAGE') return res.status(403).json({ error: 'Sign in with your own account, not a screen account' });
  if (user.role !== 'WEBMASTER' && (await isFullLockdownEnabled())) return res.status(503).json({ error: 'The site is in lockdown mode - try again shortly' });
  if (!isAdminRole(user.role) && (await isDevelopmentLockdownEnabled())) return res.status(503).json({ error: 'The site is locked down for development - try again shortly' });
  if (user.mustChangePassword) return res.status(403).json({ error: 'Set a new password in the portal before signing in here' });
  if (user.totpEnabled) {
    if (!code && !backupCode) return res.json({ requiresTotp: true });
    const secret = decryptTotpSecret(user);
    const ok = typeof code === 'string' && code ? !!secret && verifyTotpToken(secret, code) : typeof backupCode === 'string' && (await consumeBackupCode(user.id, backupCode));
    if (!ok) {
      await logActivity('prep.operator_2fa_failed', `${user.username} on ${bay.name}`, undefined, user.id);
      return res.status(401).json({ error: 'Incorrect code' });
    }
  }
  // One person per bay: a new sign-in ends whoever was there.
  const previous = await prisma.prepOperatorSession.findMany({ where: { deviceId: bay.id, endedAt: null }, select: { id: true } });
  if (previous.length) await prisma.prepOperatorSession.updateMany({ where: { id: { in: previous.map((p) => p.id) } }, data: { endedAt: new Date() } });
  const session = await prisma.prepOperatorSession.create({ data: { token: newToken(), deviceId: bay.id, userId: user.id } });
  // The job on screen stays only if the new person may see it.
  if (bay.currentJobId && !(await canPrepJob(user.id, user.role as Role, bay.currentJobId))) {
    await prisma.screenDevice.update({ where: { id: bay.id }, data: { currentJobId: null } });
  }
  await logActivity('prep.operator_login', `${user.displayName} signed in on ${bay.name}`, undefined, user.id);
  emitBayEvent(bay.id, 'operator', { reason: 'login' });
  res.json({ token: session.token, operator: { id: user.id, displayName: user.displayName, role: user.role, avatarPath: user.avatarPath, signedInAt: session.createdAt } });
});

prepRouter.post('/operator/logout', requireRole(...KIOSK_ROLES), async (req, res) => {
  const bay = await bayFromRequest(req);
  const op = await activeOperator(req, bay?.id ?? null);
  if (op) {
    await endOperatorSession(op.id, op.deviceId, 'logout');
    await logActivity('prep.operator_logout', `${op.user.displayName} signed out on ${bay!.name}`, undefined, op.user.id);
  }
  res.status(204).end();
});

/** "Still here": resets the idle timer. */
prepRouter.post('/operator/ping', requireRole(...KIOSK_ROLES), async (req, res) => {
  const bay = await bayFromRequest(req);
  const op = await activeOperator(req, bay?.id ?? null);
  if (!op) return res.status(401).json({ error: 'Signed out' });
  await touchOperator(op.id);
  res.status(204).end();
});

/** Jobs the signed-in crew member (or phone user) can prep. */
prepRouter.get('/operator/jobs', async (req, res) => {
  const ctx = await actorFor(req);
  if (!ctx) return res.status(403).json({ error: 'Sign in on the screen first' });
  res.json(await jobsForPrep(ctx.actor.userId, ctx.role));
});

/** Phone pairing: what bay a scanned pairing code belongs to and the job it is showing. */
prepRouter.get('/pair', async (req, res) => {
  if (req.user!.role === 'SIGNAGE') return res.status(403).json({ error: 'Sign in with your own account to scan' });
  const bay = await bayFromRequest(req);
  if (!bay) return res.status(404).json({ error: 'That pairing code is not a bay' });
  let job: { id: string; name: string } | null = null;
  if (bay.currentJobId && (await canPrepJob(req.user!.id, req.user!.role, bay.currentJobId))) {
    job = await prisma.job.findUnique({ where: { id: bay.currentJobId }, select: { id: true, name: true } });
  }
  res.json({ bay: { id: bay.id, name: bay.name }, job, config: publicConfig(await getPrepConfig()) });
});

/** Live updates: ?job= follows one job's prep, ?bay= (a bay token) follows that bay. */
prepRouter.get('/stream', async (req, res) => {
  const jobId = typeof req.query.job === 'string' && req.query.job ? req.query.job : null;
  const bay = await bayFromRequest(req);
  if (jobId) {
    const ctx = await actorFor(req);
    const allowed = (bay && bay.currentJobId === jobId) || (ctx && (await canPrepJob(ctx.actor.userId, ctx.role, jobId)));
    if (!allowed) return res.status(404).json({ error: 'not found' });
  }
  if (!jobId && !bay) return res.status(400).json({ error: 'job or bay is required' });
  openPrepStream(res, { jobId, bayId: bay?.id ?? null });
});

// ---------------------------------------------------------------------------------------------
// One job's prep
// ---------------------------------------------------------------------------------------------

prepRouter.get('/jobs/:jobId/view', async (req, res) => {
  const bay = await bayFromRequest(req);
  // A bay with nobody signed in still shows its job's progress, read-only.
  if (!(bay && bay.currentJobId === req.params.jobId)) {
    const ctx = await actorFor(req);
    if (!ctx || !(await canPrepJob(ctx.actor.userId, ctx.role, req.params.jobId))) return res.status(404).json({ error: 'not found' });
  }
  if (req.query.fresh === '1') invalidateSourceLines(req.params.jobId);
  const view = await buildPrepView(req.params.jobId);
  if (!view) return res.status(404).json({ error: 'not found' });
  res.json(view);
});

/** The "job changed" alert: what the Current RMS sync saw added, removed or re-quantified. */
prepRouter.get('/jobs/:jobId/diff', async (req, res) => {
  const bay = await bayFromRequest(req);
  if (!(bay && bay.currentJobId === req.params.jobId)) {
    const ctx = await actorFor(req);
    if (!ctx || !(await canPrepJob(ctx.actor.userId, ctx.role, req.params.jobId))) return res.status(404).json({ error: 'not found' });
  }
  const job = await prisma.job.findUnique({ where: { id: req.params.jobId }, select: { rmsItemsDiffJson: true, rmsItemsDiffAt: true } });
  res.json({ diff: job?.rmsItemsDiffJson ? JSON.parse(job.rmsItemsDiffJson) : null, diffAt: job?.rmsItemsDiffAt ?? null });
});

prepRouter.post('/jobs/:jobId/diff/acknowledge', async (req, res) => {
  const ctx = await requirePrepAccess(req, res);
  if (!ctx) return;
  await prisma.job.update({ where: { id: req.params.jobId }, data: { rmsItemsDiffJson: null, rmsItemsDiffAt: null } });
  res.status(204).end();
});

const SOURCES: ScanSource[] = ['HID', 'PHONE', 'MANUAL'];

prepRouter.post('/jobs/:jobId/scan', async (req, res) => {
  const ctx = await requirePrepAccess(req, res);
  if (!ctx) return;
  const code = typeof req.body?.code === 'string' ? req.body.code.trim() : '';
  if (!code || code.length > 200) return res.status(400).json({ error: 'code is required' });
  const source: ScanSource = SOURCES.includes(req.body?.source) ? req.body.source : 'HID';
  const result = await applyScan(req.params.jobId, code, source, ctx.actor);
  res.json(result);
});

prepRouter.post('/jobs/:jobId/lines', async (req, res) => {
  const ctx = await requirePrepAccess(req, res);
  if (!ctx) return;
  const { lineKey, delta, short, shortNote } = req.body ?? {};
  if (typeof lineKey !== 'string' || !lineKey) return res.status(400).json({ error: 'lineKey is required' });
  if (delta !== undefined && delta !== 1 && delta !== -1) return res.status(400).json({ error: 'delta must be 1 or -1' });
  if (short !== undefined && (typeof short !== 'number' || short < 0)) return res.status(400).json({ error: 'short must be a number' });
  if (shortNote !== undefined && shortNote !== null && typeof shortNote !== 'string') return res.status(400).json({ error: 'shortNote must be text' });
  const result = await adjustLine(req.params.jobId, lineKey, { delta, short, shortNote }, ctx.actor);
  if ('error' in result) return res.status(409).json(result);
  res.json(result);
});

prepRouter.post('/jobs/:jobId/cases/:caseId', async (req, res) => {
  const ctx = await requirePrepAccess(req, res);
  if (!ctx) return;
  const updated = await setCasePacked(req.params.jobId, req.params.caseId, Boolean(req.body?.packed), ctx.actor);
  if (!updated) return res.status(404).json({ error: 'not found' });
  res.json({ id: updated.id, packed: Boolean(updated.packedAt) });
});

prepRouter.post('/jobs/:jobId/sign-off', async (req, res) => {
  const ctx = await requirePrepAccess(req, res);
  if (!ctx) return;
  const result = await signOff(req.params.jobId, ctx.actor);
  if ('error' in result) return res.status(409).json(result);
  res.json(result);
});

prepRouter.post('/jobs/:jobId/transport', async (req, res) => {
  const ctx = await requirePrepAccess(req, res);
  if (!ctx) return;
  const result = await transportArrived(req.params.jobId, ctx.actor);
  if ('error' in result) return res.status(409).json(result);
  res.json(result);
});

const adminActor = (req: Request): Actor => ({ userId: req.user!.id, name: req.user!.displayName });

prepRouter.post('/jobs/:jobId/reopen', requireRole('ADMIN'), async (req, res) => {
  const result = await reopenPrep(req.params.jobId, adminActor(req));
  if ('error' in result) return res.status(409).json(result);
  res.json(result);
});

prepRouter.post('/jobs/:jobId/resolve-flag', requireRole('ADMIN'), async (req, res) => {
  const result = await resolveFlag(req.params.jobId, adminActor(req));
  if ('error' in result) return res.status(409).json(result);
  res.json(result);
});

/** The full scan log for a job's latest prep (admin). */
prepRouter.get('/jobs/:jobId/scans', requireRole('ADMIN'), async (req, res) => {
  const scans = await prisma.scanEvent.findMany({ where: { jobId: req.params.jobId }, orderBy: { createdAt: 'desc' }, take: 500 });
  const users = await prisma.user.findMany({ where: { id: { in: [...new Set(scans.map((s) => s.userId).filter((x): x is string => !!x))] } }, select: { id: true, displayName: true } });
  const names = new Map(users.map((u) => [u.id, u.displayName]));
  res.json(scans.map((s) => ({ ...s, by: s.userId ? names.get(s.userId) ?? null : null })));
});

// ---------------------------------------------------------------------------------------------
// Admin: settings, bays, barcodes
// ---------------------------------------------------------------------------------------------

prepRouter.get('/admin/config', requirePermission('managePrepSettings'), async (_req, res) => {
  res.json(await getPrepConfig());
});

prepRouter.put('/admin/config', requirePermission('managePrepSettings'), async (req, res) => {
  const patch = { ...(req.body ?? {}) } as Record<string, unknown>;
  // Writing to Current RMS stays with full admins.
  if (patch.rmsWriteBack !== undefined && !isAdminRole(req.user!.role)) return res.status(403).json({ error: 'Only admins can change Current RMS write-back' });
  const result = await savePrepConfig(patch);
  if (typeof result === 'string') return res.status(400).json({ error: result });
  await logActivity('prep.config_updated', JSON.stringify(patch).slice(0, 300), undefined, req.user!.id);
  res.json(result);
});

/** Every bay with its job, who is signed in and how far the prep has got. */
prepRouter.get('/admin/bays', requireRole('ADMIN'), async (_req, res) => {
  const bays = await prisma.screenDevice.findMany({
    orderBy: { name: 'asc' },
    include: { currentJob: { select: { id: true, name: true } }, operatorSessions: { where: { endedAt: null }, include: { user: { select: { displayName: true } } } } },
  });
  const out = [];
  for (const b of bays) {
    let progress: { pulled: number; required: number; status: string | null; flagged: boolean } | null = null;
    if (b.currentJobId) {
      try {
        const view = await buildPrepView(b.currentJobId);
        if (view) {
          progress = {
            pulled: view.totals.pulled,
            required: view.totals.required,
            status: view.session?.status ?? null,
            flagged: Boolean(view.session?.flaggedAt && !view.session.flagResolvedAt),
          };
        }
      } catch {
        progress = null;
      }
    }
    out.push({
      id: b.id,
      name: b.name,
      token: b.token,
      lastSeenAt: b.lastSeenAt,
      job: b.currentJob,
      operator: b.operatorSessions[0] ? { name: b.operatorSessions[0].user.displayName, since: b.operatorSessions[0].createdAt } : null,
      progress,
    });
  }
  res.json(out);
});

prepRouter.post('/admin/bays', requireRole('ADMIN'), async (req, res) => {
  const name = typeof req.body?.name === 'string' ? req.body.name.trim().slice(0, 60) : '';
  if (!name) return res.status(400).json({ error: 'name is required' });
  const bay = await prisma.screenDevice.create({ data: { name, token: newToken() } });
  await logActivity('prep.bay_created', name, undefined, req.user!.id);
  res.status(201).json(bay);
});

prepRouter.put('/admin/bays/:id', requireRole('ADMIN'), async (req, res) => {
  const name = typeof req.body?.name === 'string' ? req.body.name.trim().slice(0, 60) : '';
  if (!name) return res.status(400).json({ error: 'name is required' });
  const bay = await prisma.screenDevice.update({ where: { id: req.params.id }, data: { name } });
  emitBayEvent(bay.id, 'bay', {});
  res.json(bay);
});

/** New pairing code: screens and phones paired with the old one have to be set up again. */
prepRouter.post('/admin/bays/:id/new-token', requireRole('ADMIN'), async (req, res) => {
  emitBayEvent(req.params.id, 'bay', { reset: true });
  const bay = await prisma.screenDevice.update({ where: { id: req.params.id }, data: { token: newToken(), currentJobId: null } });
  await prisma.prepOperatorSession.updateMany({ where: { deviceId: bay.id, endedAt: null }, data: { endedAt: new Date() } });
  await logActivity('prep.bay_token_reset', bay.name, undefined, req.user!.id);
  res.json(bay);
});

prepRouter.post('/admin/bays/:id/sign-out', requireRole('ADMIN'), async (req, res) => {
  const sessions = await prisma.prepOperatorSession.findMany({ where: { deviceId: req.params.id, endedAt: null } });
  for (const s of sessions) await endOperatorSession(s.id, s.deviceId, 'admin');
  res.status(204).end();
});

prepRouter.delete('/admin/bays/:id', requireRole('ADMIN'), async (req, res) => {
  emitBayEvent(req.params.id, 'bay', { reset: true });
  const bay = await prisma.screenDevice.delete({ where: { id: req.params.id } });
  await logActivity('prep.bay_deleted', bay.name, undefined, req.user!.id);
  res.status(204).end();
});

prepRouter.get('/admin/aliases', requirePermission('managePrepSettings'), async (_req, res) => {
  res.json(await prisma.barcodeAlias.findMany({ orderBy: { updatedAt: 'desc' }, take: 500 }));
});

/** Scans nobody could match, newest first, one row per code - the list to teach from. */
prepRouter.get('/admin/unknown-codes', requirePermission('managePrepSettings'), async (_req, res) => {
  const scans = await prisma.scanEvent.findMany({ where: { result: 'UNKNOWN' }, orderBy: { createdAt: 'desc' }, take: 300 });
  const known = new Set((await prisma.barcodeAlias.findMany({ where: { code: { in: scans.map((s) => s.code) } }, select: { code: true } })).map((a) => a.code));
  const seen = new Map<string, { code: string; jobId: string; lastAt: Date; count: number }>();
  for (const s of scans) {
    if (known.has(s.code)) continue;
    const e = seen.get(s.code);
    if (e) e.count++;
    else seen.set(s.code, { code: s.code, jobId: s.jobId, lastAt: s.createdAt, count: 1 });
  }
  const jobs = await prisma.job.findMany({ where: { id: { in: [...new Set([...seen.values()].map((s) => s.jobId))] } }, select: { id: true, name: true } });
  const jobNames = new Map(jobs.map((j) => [j.id, j.name]));
  res.json([...seen.values()].map((s) => ({ ...s, jobName: jobNames.get(s.jobId) ?? null })));
});

/** Teach: this code is a unit (ASSET) or a bulk barcode (PRODUCT) of the product on a job's line. */
prepRouter.post('/admin/aliases', requirePermission('managePrepSettings'), async (req, res) => {
  const { code, kind, jobId, lineKey } = req.body ?? {};
  if (typeof code !== 'string' || !code.trim()) return res.status(400).json({ error: 'code is required' });
  if (kind !== 'ASSET' && kind !== 'PRODUCT') return res.status(400).json({ error: 'kind must be ASSET or PRODUCT' });
  if (typeof jobId !== 'string' || typeof lineKey !== 'string') return res.status(400).json({ error: 'jobId and lineKey are required' });
  const { lines } = await getSourceLines(jobId, { fresh: true });
  const line = lines.find((l) => l.key === lineKey);
  if (!line?.productId) return res.status(400).json({ error: 'That line has no Current RMS product to link to' });
  const data = { kind, rmsProductId: line.productId, rmsStockLevelId: null, label: line.name, source: 'TAUGHT' };
  const alias = await prisma.barcodeAlias.upsert({ where: { code: code.trim() }, create: { code: code.trim(), ...data }, update: data });
  forgetUnknownCode(alias.code);
  await logActivity('prep.barcode_taught', `${alias.code} = ${alias.label} (${kind === 'ASSET' ? 'one unit' : 'bulk barcode'})`, jobId, req.user!.id);
  res.status(201).json(alias);
});

prepRouter.delete('/admin/aliases/:id', requirePermission('managePrepSettings'), async (req, res) => {
  const alias = await prisma.barcodeAlias.delete({ where: { id: req.params.id } });
  forgetUnknownCode(alias.code);
  res.status(204).end();
});

/** For the job page: this job's prep state and any missing-kit flag. */
prepRouter.get('/jobs/:jobId/status', requireRole('ADMIN'), async (req, res) => {
  const view = await buildPrepView(req.params.jobId);
  if (!view) return res.status(404).json({ error: 'not found' });
  res.json({ session: view.session, totals: view.totals, source: view.source });
});
