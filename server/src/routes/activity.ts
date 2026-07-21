import { Router } from 'express';
import { prisma } from '../db';
import { requireRole } from '../auth';

export const activityRouter = Router();

activityRouter.get('/', requireRole('ADMIN'), async (req, res) => {
  const jobId = typeof req.query.jobId === 'string' ? req.query.jobId : undefined;
  const entries = await prisma.activityLogEntry.findMany({
    where: jobId ? { jobId } : undefined,
    orderBy: { createdAt: 'desc' },
    take: 200,
  });
  const userIds = [...new Set(entries.map((e) => e.userId).filter((id): id is string => !!id))];
  const users = await prisma.user.findMany({ where: { id: { in: userIds } } });
  const nameById = new Map(users.map((u) => [u.id, u.displayName]));
  res.json(entries.map((e) => ({ ...e, userName: e.userId ? nameById.get(e.userId) ?? '(deleted user)' : null })));
});
