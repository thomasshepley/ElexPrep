import { Router } from 'express';
import { prisma } from '../db';

export const activityRouter = Router();

activityRouter.get('/', async (req, res) => {
  const jobId = typeof req.query.jobId === 'string' ? req.query.jobId : undefined;
  const entries = await prisma.activityLogEntry.findMany({
    where: jobId ? { jobId } : undefined,
    orderBy: { createdAt: 'desc' },
    take: 200,
  });
  res.json(entries);
});
