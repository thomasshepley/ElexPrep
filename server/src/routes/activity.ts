import { Router } from 'express';
import { prisma } from '../db';
import { requireRole } from '../auth';

export const activityRouter = Router();

// Webmaster-exclusive, not a delegatable permission - an ADMIN granting this to a USER would
// otherwise be a way to indirectly regain it.
const PAGE_SIZE = 100;
// Prisma cuids as they appear inside free-text details ("Assign Crew cmv722s250…").
const CUID_PATTERN = /\bc[a-z0-9]{24}\b/g;

/**
 * Turns ids embedded in detail strings into names a person can read: users, crew, jobs, job days
 * (as their date) and crew assignments (as the crew member). Unknown ids are left as they are.
 */
async function resolveIds(details: (string | null)[]): Promise<Map<string, string>> {
  const ids = [...new Set(details.flatMap((d) => (d ? d.match(CUID_PATTERN) ?? [] : [])))];
  const names = new Map<string, string>();
  if (ids.length === 0) return names;
  const where = { id: { in: ids } };
  const [users, crew, jobs, days, assignments] = await Promise.all([
    prisma.user.findMany({ where, select: { id: true, displayName: true } }),
    prisma.crewProfile.findMany({ where, select: { id: true, user: { select: { displayName: true } } } }),
    prisma.job.findMany({ where, select: { id: true, name: true } }),
    prisma.jobDay.findMany({ where, select: { id: true, date: true } }),
    prisma.jobCrewAssignment.findMany({ where, select: { id: true, crewProfile: { select: { user: { select: { displayName: true } } } } } }),
  ]);
  for (const u of users) names.set(u.id, u.displayName);
  for (const c of crew) names.set(c.id, c.user.displayName);
  for (const j of jobs) names.set(j.id, j.name);
  for (const d of days)
    names.set(d.id, d.date.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Europe/London' }).replace(',', ''));
  for (const a of assignments) names.set(a.id, a.crewProfile.user.displayName);
  return names;
}

// Webmaster-exclusive, not a delegatable permission - an ADMIN granting this to a USER would
// otherwise be a way to indirectly regain it. Newest first, a page at a time: pass the previous
// page's nextCursor as ?before= to continue.
activityRouter.get('/', requireRole('WEBMASTER'), async (req, res) => {
  const jobId = typeof req.query.jobId === 'string' ? req.query.jobId : undefined;
  const before = typeof req.query.before === 'string' ? req.query.before : undefined;
  const cursor = before ? await prisma.activityLogEntry.findUnique({ where: { id: before }, select: { id: true } }) : null;
  const entries = await prisma.activityLogEntry.findMany({
    where: jobId ? { jobId } : undefined,
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: PAGE_SIZE + 1,
    ...(cursor ? { cursor: { id: cursor.id }, skip: 1 } : {}),
  });
  const page = entries.slice(0, PAGE_SIZE);
  const userIds = [...new Set(page.map((e) => e.userId).filter((id): id is string => !!id))];
  const jobIds = [...new Set(page.map((e) => e.jobId).filter((id): id is string => !!id))];
  const [users, jobs, idNames] = await Promise.all([
    prisma.user.findMany({ where: { id: { in: userIds } } }),
    prisma.job.findMany({ where: { id: { in: jobIds } }, select: { id: true, name: true } }),
    resolveIds(page.map((e) => e.detail)),
  ]);
  const userById = new Map(users.map((u) => [u.id, u]));
  const jobById = new Map(jobs.map((j) => [j.id, j.name]));
  res.json({
    entries: page.map((e) => ({
      ...e,
      detail: e.detail ? e.detail.replace(CUID_PATTERN, (id) => idNames.get(id) ?? id) : e.detail,
      userName: e.userId ? userById.get(e.userId)?.displayName ?? '(deleted user)' : null,
      userRole: e.userId ? userById.get(e.userId)?.role ?? null : null,
      userIsProjectManager: e.userId ? userById.get(e.userId)?.isProjectManager ?? false : false,
      jobName: e.jobId ? jobById.get(e.jobId) ?? '(deleted job)' : null,
    })),
    nextCursor: entries.length > PAGE_SIZE ? page[page.length - 1].id : null,
  });
});
