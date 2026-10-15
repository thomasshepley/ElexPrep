import fs from 'fs';
import path from 'path';
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { prisma, logActivity } from '../db';
import { requireRole, verifyPassword } from '../auth';
import { verifyTotpToken } from '../totp';
import { decryptTotpSecret } from '../twoFactor';
import { getVersionInfo, parseChangelog } from '../version';

/**
 * Updating the site from the Webmaster page. The app can't run git or Docker itself (it lives
 * in a container, deliberately without the Docker socket), so it only drops a one-word request
 * into the shared ops folder; scripts/update-agent.sh on the host carries it out and writes its
 * progress back there. See DEPLOY.md, "Updating from the Webmaster page".
 */
export const siteUpdateRouter = Router();
siteUpdateRouter.use(requireRole('WEBMASTER'));

/** data/ops on the host, /data/ops in the container. */
export const opsDir =
  process.env.OPS_DIR ?? (process.env.UPLOADS_DIR ? path.join(path.dirname(process.env.UPLOADS_DIR), 'ops') : path.resolve(__dirname, '../../ops'));

const read = (name: string, max = 200_000) => {
  try {
    const s = fs.readFileSync(path.join(opsDir, name), 'utf8');
    return s.length > max ? s.slice(-max) : s;
  } catch {
    return null;
  }
};
const mtime = (name: string) => {
  try {
    return fs.statSync(path.join(opsDir, name)).mtime;
  } catch {
    return null;
  }
};

const INFO_KEYS = new Set([
  'action',
  'result',
  'maintenance',
  'branch',
  'upstream',
  'behind',
  'ahead',
  'dirty',
  'currentVersion',
  'incomingVersion',
  'head',
  'fromVersion',
  'toVersion',
  'startedAt',
  'finishedAt',
  'by',
]);

function readInfo(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of (read('info') ?? '').split('\n')) {
    const i = line.indexOf('=');
    if (i <= 0) continue;
    const k = line.slice(0, i).trim();
    if (INFO_KEYS.has(k)) out[k] = line.slice(i + 1).trim().slice(0, 200);
  }
  return out;
}

const newer = (a: string, b: string) => {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d) return d > 0;
  }
  return false;
};

/** An update that has said "updating" for this long has died with its agent. */
const STALE_MS = 60 * 60 * 1000;

function status() {
  const current = getVersionInfo().version;
  const agentSeen = mtime('agent');
  const state = (read('state') ?? 'idle').trim() || 'idle';
  const info = readInfo();
  const stateAt = mtime('state');
  const busy = (state === 'checking' || state === 'updating') && !!stateAt && Date.now() - stateAt.getTime() < STALE_MS;
  const pendingAt = mtime('request');
  const incomingChangelog = parseChangelog(read('incoming-changelog.md') ?? '').filter((e) => newer(e.version, current));
  return {
    installed: Boolean(agentSeen),
    agentSeenAt: agentSeen,
    currentVersion: current,
    state: busy ? state : state === 'checking' || state === 'updating' ? 'failed' : state,
    stale: !busy && (state === 'checking' || state === 'updating'),
    busy,
    stateAt,
    info,
    pendingSince: pendingAt,
    log: (read('log', 60_000) ?? '').split('\n').slice(-200).join('\n'),
    incoming: (read('incoming') ?? '')
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
      .slice(0, 60)
      .map((l) => ({ sha: l.slice(0, l.indexOf(' ')), subject: l.slice(l.indexOf(' ') + 1) })),
    incomingChangelog,
    history: (read('history') ?? '')
      .split('\n')
      .filter(Boolean)
      .slice(-10)
      .reverse()
      .map((l) => {
        const [at, request, result, from, to, by] = l.split(' ');
        return { at, maintenance: request === 'update-maintenance', result, from, to, by: by === '-' ? null : by };
      }),
  };
}

function writeRequest(word: 'check' | 'update' | 'update-maintenance', by: string) {
  fs.mkdirSync(opsDir, { recursive: true });
  // Written under another name then moved, so the agent never sees half a request.
  fs.writeFileSync(path.join(opsDir, 'request-by.tmp'), by.replace(/[^\w .@-]/g, '').slice(0, 80));
  fs.renameSync(path.join(opsDir, 'request-by.tmp'), path.join(opsDir, 'request-by'));
  fs.writeFileSync(path.join(opsDir, 'request.tmp'), `${word}\n`);
  fs.renameSync(path.join(opsDir, 'request.tmp'), path.join(opsDir, 'request'));
}

siteUpdateRouter.get('/', (_req, res) => {
  res.json(status());
});

function refuseIfBusy(res: import('express').Response) {
  const s = status();
  if (!s.installed) return res.status(409).json({ error: 'The update agent isn\'t set up on the server yet: see DEPLOY.md, "Updating from the Webmaster page".' }), true;
  if (s.busy) return res.status(409).json({ error: s.state === 'updating' ? 'An update is already running' : 'A check is already running' }), true;
  if (s.pendingSince && Date.now() - s.pendingSince.getTime() < 2 * 60 * 1000) return res.status(409).json({ error: 'A request is already waiting for the server to pick it up' }), true;
  return false;
}

siteUpdateRouter.post('/check', async (req, res) => {
  if (refuseIfBusy(res)) return;
  writeRequest('check', req.user!.username);
  await logActivity('site.update_check', undefined, undefined, req.user!.id);
  res.status(202).json(status());
});

const updateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many attempts - wait a while and try again' },
});

/** Runs the update. Asks for the password again (and the 2FA code when it's on): rebuilding the live site deserves more than an open tab. */
siteUpdateRouter.post('/update', updateLimiter, async (req, res) => {
  const { maintenance, password, code } = req.body ?? {};
  if (typeof password !== 'string' || !password) return res.status(400).json({ error: 'Enter your password to update the site' });
  const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    await logActivity('site.update_refused', 'wrong password', undefined, req.user!.id);
    return res.status(403).json({ error: 'That password is not right' });
  }
  if (user.totpEnabled) {
    const secret = decryptTotpSecret(user);
    if (!secret || typeof code !== 'string' || !verifyTotpToken(secret, code.replace(/\s+/g, ''))) {
      await logActivity('site.update_refused', 'wrong 2FA code', undefined, req.user!.id);
      return res.status(403).json({ error: 'Enter the current code from your authenticator app' });
    }
  }
  if (refuseIfBusy(res)) return;
  writeRequest(maintenance === true ? 'update-maintenance' : 'update', user.username);
  await logActivity('site.update_requested', maintenance === true ? 'with the maintenance page' : 'without the maintenance page', undefined, req.user!.id);
  res.status(202).json(status());
});
