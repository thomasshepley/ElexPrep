import { Router } from 'express';
import { prisma, logActivity } from '../db';
import { requireRole } from '../auth';
import { notifyDiscussionMessage } from '../notifications';
import { resolvePermissionsForUser } from '../permissions';
import { ensureJobGroups, GROUP_VISIBILITIES, pickGroup, toGroupDto } from '../discussionGroups';

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
  authorUser: { displayName: string; role: string; isProjectManager: boolean };
}

function toMessageDto(m: MessageRow) {
  return {
    id: m.id,
    jobId: m.jobId,
    authorUserId: m.authorUserId,
    authorName: m.authorUser.displayName,
    authorRole: m.authorUser.role,
    authorIsProjectManager: m.authorUser.isProjectManager,
    // A moderator-removed message never sends its original text to clients - only the
    // placeholder metadata (see JobDiscussionThread.tsx's rendering of deletedByName).
    body: m.deletedAt ? '' : m.body,
    createdAt: m.createdAt,
    editedAt: m.editedAt,
    deletedAt: m.deletedAt,
    deletedByName: m.deletedByName,
  };
}

const MESSAGE_INCLUDE = { authorUser: { select: { displayName: true, role: true, isProjectManager: true } } } as const;

// ?groupId= picks the chat group (General when absent); staff can see every group.
jobDiscussionRouter.get('/:jobId/discussion', async (req, res) => {
  const job = await prisma.job.findUnique({ where: { id: req.params.jobId }, select: { discussionLocked: true } });
  if (!job) return res.status(404).json({ error: 'Job not found' });
  const groups = await ensureJobGroups(req.params.jobId);
  const group = pickGroup(groups, req.query.groupId);
  const [messages, counts] = await Promise.all([
    prisma.jobDiscussionMessage.findMany({ where: { jobId: req.params.jobId, groupId: group.id }, include: MESSAGE_INCLUDE, orderBy: { createdAt: 'asc' } }),
    prisma.jobDiscussionMessage.groupBy({ by: ['groupId'], where: { jobId: req.params.jobId, deletedAt: null }, _count: { _all: true } }),
  ]);
  const countBy = new Map(counts.map((c) => [c.groupId, c._count._all]));
  res.json({
    locked: job.discussionLocked,
    groupId: group.id,
    groups: groups.map((g) => ({ ...toGroupDto(g, { includeMembers: true }), messageCount: countBy.get(g.id) ?? 0 })),
    messages: messages.map(toMessageDto),
  });
});

jobDiscussionRouter.post('/:jobId/discussion', requireRole('ADMIN', 'USER'), async (req, res) => {
  const { body, groupId } = req.body ?? {};
  if (!body || typeof body !== 'string' || !body.trim()) return res.status(400).json({ error: 'body is required' });
  if (body.length > 5000) return res.status(400).json({ error: 'Message is too long' });
  const job = await prisma.job.findUnique({ where: { id: req.params.jobId }, select: { name: true, discussionLocked: true } });
  if (!job) return res.status(404).json({ error: 'Job not found' });
  if (job.discussionLocked) {
    const perms = await resolvePermissionsForUser(req.user!.id, req.user!.role);
    if (!perms.moderateDiscussion) return res.status(403).json({ error: 'This discussion is locked' });
  }
  const group = pickGroup(await ensureJobGroups(req.params.jobId), groupId);

  const message = await prisma.jobDiscussionMessage.create({
    data: { jobId: req.params.jobId, authorUserId: req.user!.id, body: body.trim(), groupId: group.id },
    include: MESSAGE_INCLUDE,
  });
  await logActivity('job_discussion.create', req.params.jobId, req.params.jobId, req.user!.id);
  await notifyDiscussionMessage(req.params.jobId, job.name, req.user!.id, req.user!.displayName, message.body, group.id);
  res.status(201).json(toMessageDto(message));
});

function parseGroupInput(body: unknown, partial: boolean) {
  const { name, color, visibility, memberAssignmentIds } = (body ?? {}) as Record<string, unknown>;
  const out: { name?: string; color?: string | null; visibility?: string; memberAssignmentIds?: string[] } = {};
  if (name !== undefined || !partial) {
    if (typeof name !== 'string' || !name.trim()) return { error: 'name is required' };
    if (name.trim().length > 40) return { error: 'name is too long (40 characters max)' };
    out.name = name.trim();
  }
  if (color !== undefined) {
    if (color !== null && (typeof color !== 'string' || !/^#[0-9a-f]{6}$/i.test(color))) return { error: 'color must be a #rrggbb hex' };
    out.color = color as string | null;
  }
  if (visibility !== undefined) {
    if (!(GROUP_VISIBILITIES as readonly string[]).includes(visibility as string)) return { error: 'visibility must be EVERYONE or MEMBERS' };
    out.visibility = visibility as string;
  }
  if (memberAssignmentIds !== undefined) {
    if (!Array.isArray(memberAssignmentIds) || memberAssignmentIds.some((id) => typeof id !== 'string')) return { error: 'memberAssignmentIds must be a list of ids' };
    out.memberAssignmentIds = memberAssignmentIds as string[];
  }
  return { value: out };
}

async function setMembers(jobId: string, groupId: string, assignmentIds: string[]) {
  const valid = await prisma.jobCrewAssignment.findMany({ where: { jobId, id: { in: assignmentIds } }, select: { id: true } });
  await prisma.$transaction([
    prisma.discussionGroupMember.deleteMany({ where: { groupId } }),
    prisma.discussionGroupMember.createMany({ data: valid.map((a) => ({ groupId, jobCrewAssignmentId: a.id })) }),
  ]);
}

// Chat groups: admins create, rename, recolour, change who can see, and delete (not General).
jobDiscussionRouter.post('/:jobId/discussion/groups', requireRole('ADMIN'), async (req, res) => {
  const parsed = parseGroupInput(req.body, false);
  if ('error' in parsed) return res.status(400).json({ error: parsed.error });
  const groups = await ensureJobGroups(req.params.jobId);
  if (groups.length >= 30) return res.status(400).json({ error: 'A job can have up to 30 chat groups' });
  const { name, color, visibility, memberAssignmentIds } = parsed.value;
  const group = await prisma.discussionGroup.create({
    data: { jobId: req.params.jobId, name: name!, color: color ?? null, visibility: visibility ?? 'EVERYONE', order: groups.length },
  });
  if (memberAssignmentIds) await setMembers(req.params.jobId, group.id, memberAssignmentIds);
  await logActivity('job_discussion.group_create', name!, req.params.jobId, req.user!.id);
  res.status(201).json({ id: group.id });
});

jobDiscussionRouter.put('/:jobId/discussion/groups/:groupId', requireRole('ADMIN'), async (req, res) => {
  const group = await prisma.discussionGroup.findFirst({ where: { id: req.params.groupId, jobId: req.params.jobId } });
  if (!group) return res.status(404).json({ error: 'Group not found' });
  const parsed = parseGroupInput(req.body, true);
  if ('error' in parsed) return res.status(400).json({ error: parsed.error });
  const { name, color, visibility, memberAssignmentIds } = parsed.value;
  await prisma.discussionGroup.update({
    where: { id: group.id },
    data: { ...(name !== undefined ? { name } : {}), ...(color !== undefined ? { color } : {}), ...(visibility !== undefined ? { visibility } : {}) },
  });
  if (memberAssignmentIds) await setMembers(req.params.jobId, group.id, memberAssignmentIds);
  await logActivity('job_discussion.group_update', name ?? group.name, req.params.jobId, req.user!.id);
  res.json({ id: group.id });
});

jobDiscussionRouter.delete('/:jobId/discussion/groups/:groupId', requireRole('ADMIN'), async (req, res) => {
  const group = await prisma.discussionGroup.findFirst({ where: { id: req.params.groupId, jobId: req.params.jobId } });
  if (!group) return res.status(404).json({ error: 'Group not found' });
  if (group.isDefault) return res.status(400).json({ error: "General can't be deleted - rename it instead" });
  await prisma.discussionGroup.delete({ where: { id: group.id } });
  await logActivity('job_discussion.group_delete', group.name, req.params.jobId, req.user!.id);
  res.status(204).end();
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
