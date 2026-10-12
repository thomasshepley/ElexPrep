import { Router } from 'express';
import { prisma, logActivity } from '../db';
import { requireRole } from '../auth';
import { notifyDiscussionMessage } from '../notifications';
import { resolvePermissionsForUser } from '../permissions';

/**
 * A job's discussion thread - staff side (ADMIN/USER). The crew side lives in crewPortal.ts at
 * /me/jobs/:jobId/discussion, scoped to the caller's own assignment; this router has no such
 * per-caller scoping since any staff account can already see any job. Reads are open to any
 * signed-in staff account (mirrors jobSchedule.ts's reasoning); posting is explicitly
 * ADMIN/USER-only so a SIGNAGE account can't post into a job's thread.
 */
export const jobDiscussionRouter = Router();

interface MessageRow {
  id: string;
  jobId: string;
  authorUserId: string;
  body: string;
  createdAt: Date;
  editedAt: Date | null;
  deletedAt: Date | null;
  deletedByName: string | null;
  authorUser: { displayName: string; role: string };
}

function toMessageDto(m: MessageRow) {
  return {
    id: m.id,
    jobId: m.jobId,
    authorUserId: m.authorUserId,
    authorName: m.authorUser.displayName,
    authorRole: m.authorUser.role,
    // A moderator-removed message never sends its original text to clients - only the
    // placeholder metadata (see JobDiscussionThread.tsx's rendering of deletedByName).
    body: m.deletedAt ? '' : m.body,
    createdAt: m.createdAt,
    editedAt: m.editedAt,
    deletedAt: m.deletedAt,
    deletedByName: m.deletedByName,
  };
}

const MESSAGE_INCLUDE = { authorUser: { select: { displayName: true, role: true } } } as const;

jobDiscussionRouter.get('/:jobId/discussion', async (req, res) => {
  const [job, messages] = await Promise.all([
    prisma.job.findUnique({ where: { id: req.params.jobId }, select: { discussionLocked: true } }),
    prisma.jobDiscussionMessage.findMany({
      where: { jobId: req.params.jobId },
      include: MESSAGE_INCLUDE,
      orderBy: { createdAt: 'asc' },
    }),
  ]);
  if (!job) return res.status(404).json({ error: 'Job not found' });
  res.json({ locked: job.discussionLocked, messages: messages.map(toMessageDto) });
});

jobDiscussionRouter.post('/:jobId/discussion', requireRole('ADMIN', 'USER'), async (req, res) => {
  const { body } = req.body ?? {};
  if (!body || typeof body !== 'string' || !body.trim()) return res.status(400).json({ error: 'body is required' });
  const job = await prisma.job.findUnique({ where: { id: req.params.jobId }, select: { name: true, discussionLocked: true } });
  if (!job) return res.status(404).json({ error: 'Job not found' });
  if (job.discussionLocked) {
    const perms = await resolvePermissionsForUser(req.user!.id, req.user!.role);
    if (!perms.moderateDiscussion) return res.status(403).json({ error: 'This discussion is locked' });
  }

  const message = await prisma.jobDiscussionMessage.create({
    data: { jobId: req.params.jobId, authorUserId: req.user!.id, body: body.trim() },
    include: MESSAGE_INCLUDE,
  });
  await logActivity('job_discussion.create', req.params.jobId, req.params.jobId, req.user!.id);
  await notifyDiscussionMessage(req.params.jobId, job.name, req.user!.id, req.user!.displayName, message.body);
  res.status(201).json(toMessageDto(message));
});

// Only the author can edit their own message - unlike delete, there's no moderator-edit path.
jobDiscussionRouter.put('/:jobId/discussion/:messageId', requireRole('ADMIN', 'USER'), async (req, res) => {
  const { body } = req.body ?? {};
  if (!body || typeof body !== 'string' || !body.trim()) return res.status(400).json({ error: 'body is required' });
  const message = await prisma.jobDiscussionMessage.findUnique({ where: { id: req.params.messageId } });
  if (!message || message.jobId !== req.params.jobId || message.deletedAt) return res.status(404).json({ error: 'Message not found' });
  if (message.authorUserId !== req.user!.id) return res.status(403).json({ error: 'You can only edit your own messages' });

  const updated = await prisma.jobDiscussionMessage.update({
    where: { id: message.id },
    data: { body: body.trim(), editedAt: new Date() },
    include: MESSAGE_INCLUDE,
  });
  await logActivity('job_discussion.edit', req.params.jobId, req.params.jobId, req.user!.id);
  res.json(toMessageDto(updated));
});

// Deleting your own message is a hard delete (nothing worth auditing). Deleting someone
// else's message needs the (delegatable) moderateDiscussion permission - ADMIN always has
// it, a USER account only if granted - and soft-deletes it instead, leaving a "removed by"
// placeholder in the thread as the audit trail.
jobDiscussionRouter.delete('/:jobId/discussion/:messageId', requireRole('ADMIN', 'USER'), async (req, res) => {
  const message = await prisma.jobDiscussionMessage.findUnique({ where: { id: req.params.messageId } });
  if (!message || message.jobId !== req.params.jobId || message.deletedAt) return res.status(404).json({ error: 'Message not found' });
  if (message.authorUserId === req.user!.id) {
    await prisma.jobDiscussionMessage.delete({ where: { id: message.id } });
  } else {
    const perms = await resolvePermissionsForUser(req.user!.id, req.user!.role);
    if (!perms.moderateDiscussion) return res.status(403).json({ error: 'Insufficient permissions' });
    await prisma.jobDiscussionMessage.update({
      where: { id: message.id },
      data: { deletedAt: new Date(), deletedByName: req.user!.displayName },
    });
  }
  await logActivity('job_discussion.delete', req.params.jobId, req.params.jobId, req.user!.id);
  res.status(204).end();
});

// Lock toggle: same moderateDiscussion permission as removing someone else's message -
// ADMIN always has it, a USER account only if granted. While locked, only a
// moderateDiscussion account can post a new message.
jobDiscussionRouter.put('/:jobId/discussion-lock', requireRole('ADMIN', 'USER'), async (req, res) => {
  const perms = await resolvePermissionsForUser(req.user!.id, req.user!.role);
  if (!perms.moderateDiscussion) return res.status(403).json({ error: 'Insufficient permissions' });
  const { locked } = req.body ?? {};
  if (typeof locked !== 'boolean') return res.status(400).json({ error: 'locked must be a boolean' });
  const job = await prisma.job.update({ where: { id: req.params.jobId }, data: { discussionLocked: locked }, select: { discussionLocked: true } });
  await logActivity(locked ? 'job_discussion.lock' : 'job_discussion.unlock', req.params.jobId, req.params.jobId, req.user!.id);
  res.json({ locked: job.discussionLocked });
});
