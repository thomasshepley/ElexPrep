import { Router } from 'express';
import { prisma } from '../db';
import { requirePermission } from '../permissions';

export const activityRouter = Router();

activityRouter.get('/', requirePermission('viewActivityLog'), async (req, res) => {
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
  const nameById = new Map(users.map((u) => [u.id, u.displayName]));
  const jobById = new Map(jobs.map((j) => [j.id, j.name]));
  res.json(
    entries.map((e) => ({
      ...e,
      userName: e.userId ? nameById.get(e.userId) ?? '(deleted user)' : null,
      jobName: e.jobId ? jobById.get(e.jobId) ?? '(deleted job)' : null,
    }))
  );
});
