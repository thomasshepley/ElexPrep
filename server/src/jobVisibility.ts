import { NextFunction, Request, Response } from 'express';
import { prisma } from './db';
import { isAdminRole } from './auth';

/**
 * Mounted once at /api/jobs/:jobId (index.ts) so every job sub-resource - documents, plots,
 * contacts, discussion, print queue, schedule, days, crew - follows the same rule as the job
 * itself: admins see everything, everyone else only public jobs. A private job answers 404, not
 * 403, so its existence isn't leaked either.
 */
export async function requireJobVisible(req: Request, res: Response, next: NextFunction) {
  if (isAdminRole(req.user?.role)) return next();
  const job = await prisma.job.findUnique({ where: { id: req.params.jobId }, select: { isPublic: true } });
  if (!job || !job.isPublic) return res.status(404).json({ error: 'not found' });
  next();
}

export async function isJobVisibleTo(jobId: string, role: string | null | undefined): Promise<boolean> {
  if (isAdminRole(role)) return true;
  const job = await prisma.job.findUnique({ where: { id: jobId }, select: { isPublic: true } });
  return Boolean(job?.isPublic);
}
