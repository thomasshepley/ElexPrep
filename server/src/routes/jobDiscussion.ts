import { Router } from 'express';
import { prisma, logActivity } from '../db';
import { requireRole } from '../auth';
import { notifyDiscussionMessage } from '../notifications';

/**
 * A job's discussion thread — staff side (ADMIN/USER). The crew side lives in crewPortal.ts at
 * /me/jobs/:jobId/discussion, scoped to the caller's own assignment; this router has no such
 * per-caller scoping since any staff account can already see any job. Reads are open to any
 * signed-in staff account (mirrors jobSchedule.ts's reasoning); posting is explicitly
 * ADMIN/USER-only so a SIGNAGE account can't post into a job's thread.
 */
export const jobDiscussionRouter = Router();

function toMessageDto(m: {
  id: string;
  jobId: string;
  authorUserId: string;
  body: string;
  createdAt: Date;
  authorUser: { displayName: string; role: string };
}) {
  return {
    id: m.id,
    jobId: m.jobId,
    authorUserId: m.authorUserId,
    authorName: m.authorUser.displayName,
    authorRole: m.authorUser.role,
    body: m.body,
    createdAt: m.createdAt,
  };
}

jobDiscussionRouter.get('/:jobId/discussion', async (req, res) => {
  const messages = await prisma.jobDiscussionMessage.findMany({
    where: { jobId: req.params.jobId },
    include: { authorUser: { select: { displayName: true, role: true } } },
    orderBy: { createdAt: 'asc' },
  });
  res.json(messages.map(toMessageDto));
});

jobDiscussionRouter.post('/:jobId/discussion', requireRole('ADMIN', 'USER'), async (req, res) => {
  const { body } = req.body ?? {};
  if (!body || typeof body !== 'string' || !body.trim()) return res.status(400).json({ error: 'body is required' });
  const job = await prisma.job.findUnique({ where: { id: req.params.jobId }, select: { name: true } });
  if (!job) return res.status(404).json({ error: 'Job not found' });

  const message = await prisma.jobDiscussionMessage.create({
    data: { jobId: req.params.jobId, authorUserId: req.user!.id, body: body.trim() },
    include: { authorUser: { select: { displayName: true, role: true } } },
  });
  await logActivity('job_discussion.create', req.params.jobId, req.params.jobId, req.user!.id);
  await notifyDiscussionMessage(req.params.jobId, job.name, req.user!.id, req.user!.displayName, message.body);
  res.status(201).json(toMessageDto(message));
});
