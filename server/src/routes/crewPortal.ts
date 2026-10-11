import { Router } from 'express';
import path from 'path';
import { prisma, logActivity } from '../db';
import { requireRole } from '../auth';
import { getCurrentRmsConfig } from '../currentRms/config';
import { fetchPickListSnapshot } from '../currentRms/sync';
import { plotsDir } from './plots';
import { uploadDir } from './jobs';
import { notifyLabelRequestSubmitted, notifyDiscussionMessage } from '../notifications';

/**
 * Self-service data for a logged-in CREW account: their own profile, the jobs they're
 * assigned to, and (for the job detail page) the Who/What/When/Where a crew member needs.
 * Everything here is scoped to the caller's own CrewProfile — there is no way to pass
 * someone else's id and see their data, since every query starts from req.user.id, not from
 * a client-supplied id. Mounted at /api/crew, BEFORE the admin-only roster router (routes/
 * crew.ts) at the same prefix, so these specific paths are tried first and everything else
 * (the bare list/CRUD routes) falls through to the admin router unchanged.
 */
export const crewPortalRouter = Router();

async function ownProfile(userId: string) {
  return prisma.crewProfile.findUnique({ where: { userId } });
}

/**
 * Resolves the caller's own profile + their assignment to jobId, or null if either doesn't
 * exist — the shared "are you actually on this job" check every /me/jobs/:jobId/* sub-route
 * below needs before touching that job's data at all.
 */
async function requireAssignedJob(userId: string, jobId: string) {
  const profile = await ownProfile(userId);
  if (!profile) return null;
  const assignment = await prisma.jobCrewAssignment.findUnique({
    where: { jobId_crewProfileId: { jobId, crewProfileId: profile.id } },
    include: { job: true },
  });
  return assignment ? { profile, assignment } : null;
}

// requireRole('CREW') is applied per-route below, not as a router-wide `.use()` — a router-wide
// guard would run (and reject with 403) for EVERY request under /api/crew/*, including ones
// that don't match any route here, which would stop them from ever falling through to the
// admin-only roster router mounted after this one at the same prefix.
crewPortalRouter.get('/me', requireRole('CREW'), async (req, res) => {
  const profile = await ownProfile(req.user!.id);
  if (!profile) return res.status(404).json({ error: 'No crew profile found for this account' });
  res.json({
    id: profile.id,
    displayName: req.user!.displayName,
    phone: profile.phone,
    skills: profile.skills,
    dayRate: profile.dayRate,
  });
});

crewPortalRouter.get('/me/jobs', requireRole('CREW'), async (req, res) => {
  const profile = await ownProfile(req.user!.id);
  if (!profile) return res.status(404).json({ error: 'No crew profile found for this account' });

  const assignments = await prisma.jobCrewAssignment.findMany({
    where: { crewProfileId: profile.id },
    include: { job: true },
  });
  const opportunities = await loadOpportunitiesFor(assignments.map((a) => a.job));

  const jobs = assignments
    .map((a) => {
      const opp = opportunities.get(a.job.currentRmsOpportunityId ?? '');
      return {
        jobId: a.jobId,
        jobName: a.job.name,
        venue: a.job.venue,
        role: a.role,
        startsAt: opp?.startsAt ?? null,
        endsAt: opp?.endsAt ?? null,
      };
    })
    // Dated jobs first (soonest first), undated jobs after, so a crew member's upcoming work
    // reads top-to-bottom like a schedule even though not every job has RMS-synced dates yet.
    .sort((a, b) => {
      if (a.startsAt && b.startsAt) return new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime();
      if (a.startsAt) return -1;
      if (b.startsAt) return 1;
      return a.jobName.localeCompare(b.jobName);
    });
  res.json(jobs);
});

crewPortalRouter.get('/me/jobs/:jobId', requireRole('CREW'), async (req, res) => {
  const profile = await ownProfile(req.user!.id);
  if (!profile) return res.status(404).json({ error: 'No crew profile found for this account' });

  const assignment = await prisma.jobCrewAssignment.findUnique({
    where: { jobId_crewProfileId: { jobId: req.params.jobId, crewProfileId: profile.id } },
    include: { job: true },
  });
  // Not assigned to this job -> treat it exactly like "doesn't exist" rather than leaking
  // whether the job itself exists to crew who have no business seeing it.
  if (!assignment) return res.status(404).json({ error: 'Job not found' });

  const [opp, otherCrew] = await Promise.all([
    assignment.job.currentRmsOpportunityId
      ? prisma.currentRmsOpportunity.findUnique({ where: { rmsId: Number(assignment.job.currentRmsOpportunityId) } })
      : Promise.resolve(null),
    prisma.jobCrewAssignment.findMany({
      where: { jobId: req.params.jobId },
      include: { crewProfile: { include: { user: { select: { displayName: true } } } } },
    }),
  ]);

  res.json({
    jobId: assignment.jobId,
    who: {
      you: { role: assignment.role },
      others: otherCrew
        .filter((c) => c.crewProfileId !== profile.id)
        .map((c) => ({ displayName: c.crewProfile.user.displayName, role: c.role })),
    },
    what: {
      jobName: assignment.job.name,
      description: opp?.subject ?? null,
    },
    when: {
      startsAt: opp?.startsAt ?? null,
      endsAt: opp?.endsAt ?? null,
    },
    where: {
      venue: assignment.job.venue,
    },
  });
});

crewPortalRouter.get('/me/jobs/:jobId/schedule', requireRole('CREW'), async (req, res) => {
  const found = await requireAssignedJob(req.user!.id, req.params.jobId);
  if (!found) return res.status(404).json({ error: 'Job not found' });
  const items = await prisma.jobScheduleItem.findMany({
    where: { jobId: req.params.jobId },
    orderBy: { startsAt: 'asc' },
  });
  res.json(items);
});

crewPortalRouter.get('/me/jobs/:jobId/documents', requireRole('CREW'), async (req, res) => {
  const found = await requireAssignedJob(req.user!.id, req.params.jobId);
  if (!found) return res.status(404).json({ error: 'Job not found' });
  const documents = await prisma.jobDocument.findMany({
    where: { jobId: req.params.jobId },
    orderBy: { createdAt: 'desc' },
  });
  res.json(documents);
});

crewPortalRouter.get('/me/jobs/:jobId/documents/:docId/file', requireRole('CREW'), async (req, res) => {
  const found = await requireAssignedJob(req.user!.id, req.params.jobId);
  if (!found) return res.status(404).end();
  const document = await prisma.jobDocument.findUnique({ where: { id: req.params.docId } });
  if (!document || document.jobId !== req.params.jobId) return res.status(404).end();
  res.setHeader('Content-Type', document.mimeType);
  res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(document.originalName)}"`);
  res.sendFile(path.join(uploadDir, 'job-documents', document.fileName));
});

crewPortalRouter.get('/me/jobs/:jobId/plots', requireRole('CREW'), async (req, res) => {
  const found = await requireAssignedJob(req.user!.id, req.params.jobId);
  if (!found) return res.status(404).json({ error: 'Job not found' });
  const plots = await prisma.plot.findMany({ where: { jobId: req.params.jobId }, orderBy: { createdAt: 'desc' } });
  res.json(plots);
});

crewPortalRouter.get('/me/jobs/:jobId/plots/:plotId/file', requireRole('CREW'), async (req, res) => {
  const found = await requireAssignedJob(req.user!.id, req.params.jobId);
  if (!found) return res.status(404).end();
  const plot = await prisma.plot.findUnique({ where: { id: req.params.plotId } });
  if (!plot || plot.jobId !== req.params.jobId) return res.status(404).end();
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(plot.originalName)}"`);
  res.sendFile(path.join(plotsDir, plot.fileName));
});

/**
 * Kit list, no pricing — reuses fetchPickListSnapshot (the same pricing-free {id, name,
 * quantity} shape the pick-list-diff alert already uses), not the admin/signage pick-list
 * endpoint, which spreads the full raw Current RMS item (including whatever price fields the
 * account's response carries) into its response.
 */
crewPortalRouter.get('/me/jobs/:jobId/kit-list', requireRole('CREW'), async (req, res) => {
  const found = await requireAssignedJob(req.user!.id, req.params.jobId);
  if (!found) return res.status(404).json({ error: 'Job not found' });
  if (!found.assignment.job.currentRmsOpportunityId) return res.json({ items: [] });
  try {
    const config = await getCurrentRmsConfig();
    if (!config.enabled) return res.json({ items: [] });
    const items = await fetchPickListSnapshot(config, Number(found.assignment.job.currentRmsOpportunityId));
    res.json({ items });
  } catch {
    res.json({ items: [] });
  }
});

/**
 * The "request to prep system" form: a crew member builds a label with the same type + content
 * fields the admin's ad hoc label creator uses (see web's LabelTypeForm, shared by both), but
 * it lands as a PENDING CrewLabelRequest, not directly in the print queue or Labels tab — an
 * admin/staff member has to approve it first (routes/crewLabelRequests.ts), at which point it
 * becomes a real AdHocLabel attributed back to this crew member.
 */
const REQUESTABLE_LABEL_TYPES = ['TRUSS_SPIKE_POSITION', 'TRUSS_SPIKE_TIP', 'TRUSS_SPIKE_SACN', 'CABLE', 'PAL', 'RACK'];

crewPortalRouter.post('/me/jobs/:jobId/label-requests', requireRole('CREW'), async (req, res) => {
  const found = await requireAssignedJob(req.user!.id, req.params.jobId);
  if (!found) return res.status(404).json({ error: 'Job not found' });
  const { labelType, content, quantity } = req.body ?? {};
  if (!labelType || !REQUESTABLE_LABEL_TYPES.includes(labelType)) {
    return res.status(400).json({ error: 'A valid labelType is required' });
  }
  if (!content || typeof content !== 'object') return res.status(400).json({ error: 'content is required' });

  const request = await prisma.crewLabelRequest.create({
    data: {
      jobId: req.params.jobId,
      crewProfileId: found.profile.id,
      labelType,
      contentJson: JSON.stringify(content),
      quantity: Number.isFinite(quantity) && quantity > 0 ? quantity : 1,
    },
  });
  await logActivity('crew_label_request.create', labelType, req.params.jobId, req.user!.id);
  await notifyLabelRequestSubmitted(req.params.jobId, found.assignment.job.name, req.user!.displayName, labelType);
  res.status(201).json({ ...request, content: JSON.parse(request.contentJson) });
});

function toDiscussionMessageDto(m: {
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

// Same thread staff see on the job's Discussion tab (routes/jobDiscussion.ts), scoped here to
// a job the caller is actually assigned to.
crewPortalRouter.get('/me/jobs/:jobId/discussion', requireRole('CREW'), async (req, res) => {
  const found = await requireAssignedJob(req.user!.id, req.params.jobId);
  if (!found) return res.status(404).json({ error: 'Job not found' });
  const messages = await prisma.jobDiscussionMessage.findMany({
    where: { jobId: req.params.jobId },
    include: { authorUser: { select: { displayName: true, role: true } } },
    orderBy: { createdAt: 'asc' },
  });
  res.json(messages.map(toDiscussionMessageDto));
});

crewPortalRouter.post('/me/jobs/:jobId/discussion', requireRole('CREW'), async (req, res) => {
  const found = await requireAssignedJob(req.user!.id, req.params.jobId);
  if (!found) return res.status(404).json({ error: 'Job not found' });
  const { body } = req.body ?? {};
  if (!body || typeof body !== 'string' || !body.trim()) return res.status(400).json({ error: 'body is required' });

  const message = await prisma.jobDiscussionMessage.create({
    data: { jobId: req.params.jobId, authorUserId: req.user!.id, body: body.trim() },
    include: { authorUser: { select: { displayName: true, role: true } } },
  });
  await logActivity('job_discussion.create', req.params.jobId, req.params.jobId, req.user!.id);
  await notifyDiscussionMessage(req.params.jobId, found.assignment.job.name, req.user!.id, req.user!.displayName, message.body);
  res.status(201).json(toDiscussionMessageDto(message));
});

/** Batch-loads the (at most a handful of) distinct linked opportunities a crew member's jobs reference. */
async function loadOpportunitiesFor(jobs: { currentRmsOpportunityId: string | null }[]) {
  const ids = [...new Set(jobs.map((j) => j.currentRmsOpportunityId).filter((id): id is string => Boolean(id)))].map(Number);
  if (ids.length === 0) return new Map<string, { startsAt: Date | null; endsAt: Date | null }>();
  const opps = await prisma.currentRmsOpportunity.findMany({ where: { rmsId: { in: ids } } });
  return new Map(opps.map((o) => [String(o.rmsId), { startsAt: o.startsAt, endsAt: o.endsAt }]));
}
