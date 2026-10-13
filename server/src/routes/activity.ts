import { Router } from 'express';
import { prisma } from '../db';
import { requireRole } from '../auth';

export const activityRouter = Router();

// Webmaster-exclusive, not a delegatable permission - an ADMIN granting this to a USER would
// otherwise be a way to indirectly regain it.
activityRouter.get('/', requireRole('WEBMASTER'), async (req, res) => {
  const jobId = typeof req.query.jobId === 'string' ? req.query.jobId : undefined;
  const entries = await prisma.activityLogEntry.findMany({
    where: jobId ? { jobId } : undefined,
    orderBy: { createdAt: 'desc' },
    take: 200,
  });
  const userIds = [...new Set(entries.map((e) => e.userId).filter((id): id is string => !!id))];
  const jobIds = [...new Set(entries.map((e) => e.jobId).filter((id): id is string => !!id))];
  const [users, jobs] = await Promise.all([
    prisma.user.findMany({ where: { id: { in: userIds } } }),
    prisma.job.findMany({ where: { id: { in: jobIds } }, select: { id: true, name: true } }),
  ]);
  const userById = new Map(users.map((u) => [u.id, u]));
  const jobById = new Map(jobs.map((j) => [j.id, j.name]));
  res.json(
    entries.map((e) => ({
      ...e,
      userName: e.userId ? userById.get(e.userId)?.displayName ?? '(deleted user)' : null,
      userRole: e.userId ? userById.get(e.userId)?.role ?? null : null,
      userIsProjectManager: e.userId ? userById.get(e.userId)?.isProjectManager ?? false : false,
      jobName: e.jobId ? jobById.get(e.jobId) ?? '(deleted job)' : null,
    }))
  );
});
