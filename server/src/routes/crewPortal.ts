import { Router } from 'express';
import path from 'path';
import { resolveCrewColor } from '@elexprep/shared';
import { prisma, logActivity } from '../db';
import { requireRole } from '../auth';
import { getCurrentRmsConfig } from '../currentRms/config';
import { fetchPickListSnapshot } from '../currentRms/sync';
import { plotsDir } from './plots';
import { uploadDir } from './jobs';
import { notifyLabelRequestSubmitted, notifyDiscussionMessage } from '../notifications';
import { encryptBankDetails, decryptBankDetails, parseBankDetails } from '../bankDetails';
import { resolveCrewFeatures } from '../crewFeatures';
import { findSharedCadPdf } from '../oneDrive/cad';
import { listJobShares, isItemSharedWithJob } from '../oneDrive/shares';
import { streamOneDriveFile } from '../oneDrive/client';
import { getOneDriveConfig } from '../oneDrive/config';
import { applyStreamHeaders, sendStoredUpload } from '../uploadSafety';
import { autoPopulateDaysFromOpportunity, dayInclude, toDayDto } from './jobDays';
import { scheduleItemInclude, toScheduleItemDto } from './jobSchedule';
import { buildIcs, type IcsEvent } from '../calendar/ics';
import { crewCanSee, ensureJobGroups, pickGroup, toGroupDto } from '../discussionGroups';
import {
  MESSAGE_INCLUDE,
  checkReplyTarget,
  discussionImageUpload,
  discussionUploadsDir,
  notificationText,
  parseMessageInput,
  removeDiscussionImage,
  storeDiscussionImage,
  toMessageDto,
} from '../discussionMessages';

/**
 * Self-service data for a logged-in CREW account: their own profile, the jobs they're
 * assigned to, and (for the job detail page) the Who/What/When/Where a crew member needs.
 * Everything here is scoped to the caller's own CrewProfile - there is no way to pass
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
 * exist - the shared "are you actually on this job" check every /me/jobs/:jobId/* sub-route
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

/** The crew view of a job - freelancers, plus staff who are also on that job's crew (every
 * /me/jobs route still starts from the caller's own crew profile and assignment). */
const crewView = requireRole('CREW', 'ADMIN', 'USER');

// requireRole('CREW') is applied per-route below, not as a router-wide `.use()` - a router-wide
// guard would run (and reject with 403) for EVERY request under /api/crew/*, including ones
// that don't match any route here, which would stop them from ever falling through to the
// admin-only roster router mounted after this one at the same prefix.
crewPortalRouter.get('/me', crewView, async (req, res) => {
  const profile = await ownProfile(req.user!.id);
  if (!profile) return res.status(404).json({ error: 'No crew profile found for this account' });
  res.json({
    id: profile.id,
    displayName: req.user!.displayName,
    phone: profile.phone,
    skills: profile.skills,
    certifications: profile.certifications,
    notes: profile.notes,
    dayRate: profile.dayRate,
    gender: profile.gender,
    address: profile.address,
    pronouns: profile.pronouns,
    instagramUrl: profile.instagramUrl,
    facebookUrl: profile.facebookUrl,
    otherLinkUrl: profile.otherLinkUrl,
    hasBankDetails: profile.bankDetailsCiphertext !== null,
  });
});

// Self-service profile edit - deliberately excludes dayRate (admin-set compensation data,
// superseded by the crew member's own rate card - see the rate-lines routes below) and
// displayName/password (already handled by the role-agnostic /api/auth/me). A crew member can
// only ever touch their own row here: there's no id in the request, it's always ownProfile(req.user.id).
crewPortalRouter.put('/me', requireRole('CREW'), async (req, res) => {
  const profile = await ownProfile(req.user!.id);
  if (!profile) return res.status(404).json({ error: 'No crew profile found for this account' });
  const { phone, skills, certifications, notes, gender, address, pronouns, instagramUrl, facebookUrl, otherLinkUrl, bankDetails } = req.body ?? {};

  let bankPatch: { bankDetailsCiphertext: string; bankDetailsIv: string; bankDetailsAuthTag: string } | undefined;
  if (bankDetails !== undefined) {
    try {
      const parsed = parseBankDetails(bankDetails);
      if (parsed) {
        const enc = encryptBankDetails(parsed);
        bankPatch = { bankDetailsCiphertext: enc.ciphertext, bankDetailsIv: enc.iv, bankDetailsAuthTag: enc.authTag };
      }
    } catch (err) {
      return res.status(400).json({ error: (err as Error).message });
    }
  }

  const updated = await prisma.crewProfile.update({
    where: { id: profile.id },
    data: {
      ...(phone !== undefined ? { phone: phone || null } : {}),
      ...(skills !== undefined ? { skills: skills || null } : {}),
      ...(certifications !== undefined ? { certifications: certifications || null } : {}),
      ...(notes !== undefined ? { notes: notes || null } : {}),
      ...(gender !== undefined ? { gender: gender || null } : {}),
      ...(address !== undefined ? { address: address || null } : {}),
      ...(pronouns !== undefined ? { pronouns: pronouns || null } : {}),
      ...(instagramUrl !== undefined ? { instagramUrl: instagramUrl || null } : {}),
      ...(facebookUrl !== undefined ? { facebookUrl: facebookUrl || null } : {}),
      ...(otherLinkUrl !== undefined ? { otherLinkUrl: otherLinkUrl || null } : {}),
      ...bankPatch,
    },
  });
  await logActivity('crew.selfUpdate', req.user!.displayName, undefined, req.user!.id);
  res.json({
    id: updated.id,
    displayName: req.user!.displayName,
    phone: updated.phone,
    skills: updated.skills,
    certifications: updated.certifications,
    notes: updated.notes,
    dayRate: updated.dayRate,
    gender: updated.gender,
    address: updated.address,
    pronouns: updated.pronouns,
    instagramUrl: updated.instagramUrl,
    facebookUrl: updated.facebookUrl,
    otherLinkUrl: updated.otherLinkUrl,
    hasBankDetails: updated.bankDetailsCiphertext !== null,
  });
});

// A crew member viewing their own bank details - no admin gate needed since it's their own
// data, but still logged the same as every other bank-details read.
crewPortalRouter.get('/me/bank-details', requireRole('CREW'), async (req, res) => {
  const profile = await ownProfile(req.user!.id);
  if (!profile) return res.status(404).json({ error: 'No crew profile found for this account' });
  if (!profile.bankDetailsCiphertext || !profile.bankDetailsIv || !profile.bankDetailsAuthTag) {
    return res.status(404).json({ error: 'No bank details on file' });
  }
  const details = decryptBankDetails(profile.bankDetailsCiphertext, profile.bankDetailsIv, profile.bankDetailsAuthTag);
  await logActivity('crew.bankDetails.view', req.user!.displayName, undefined, req.user!.id);
  res.json(details);
});

// Self-service rate card - mirrors routes/crew.ts's admin rate-line CRUD, scoped to the
// caller's own profile. See CrewRateLine's schema comment for the model itself.
crewPortalRouter.get('/me/rate-lines', requireRole('CREW'), async (req, res) => {
  const profile = await ownProfile(req.user!.id);
  if (!profile) return res.status(404).json({ error: 'No crew profile found for this account' });
  const lines = await prisma.crewRateLine.findMany({ where: { crewProfileId: profile.id }, orderBy: { order: 'asc' } });
  res.json(lines);
});

crewPortalRouter.post('/me/rate-lines', requireRole('CREW'), async (req, res) => {
  const profile = await ownProfile(req.user!.id);
  if (!profile) return res.status(404).json({ error: 'No crew profile found for this account' });
  const { label, amount } = req.body ?? {};
  if (!label || !amount) return res.status(400).json({ error: 'label and amount are required' });
  const count = await prisma.crewRateLine.count({ where: { crewProfileId: profile.id } });
  const line = await prisma.crewRateLine.create({ data: { crewProfileId: profile.id, label, amount, order: count } });
  await logActivity('crew.rateLine.selfCreate', `${label}: ${amount}`, undefined, req.user!.id);
  res.status(201).json(line);
});

crewPortalRouter.put('/me/rate-lines/:lineId', requireRole('CREW'), async (req, res) => {
  const profile = await ownProfile(req.user!.id);
  if (!profile) return res.status(404).json({ error: 'No crew profile found for this account' });
  const existing = await prisma.crewRateLine.findUnique({ where: { id: req.params.lineId } });
  if (!existing || existing.crewProfileId !== profile.id) return res.status(404).json({ error: 'Rate line not found' });
  const { label, amount } = req.body ?? {};
  const line = await prisma.crewRateLine.update({
    where: { id: existing.id },
    data: { ...(label !== undefined ? { label } : {}), ...(amount !== undefined ? { amount } : {}) },
  });
  await logActivity('crew.rateLine.selfUpdate', `${line.label}: ${line.amount}`, undefined, req.user!.id);
  res.json(line);
});

crewPortalRouter.delete('/me/rate-lines/:lineId', requireRole('CREW'), async (req, res) => {
  const profile = await ownProfile(req.user!.id);
  if (!profile) return res.status(404).json({ error: 'No crew profile found for this account' });
  const existing = await prisma.crewRateLine.findUnique({ where: { id: req.params.lineId } });
  if (!existing || existing.crewProfileId !== profile.id) return res.status(404).json({ error: 'Rate line not found' });
  await prisma.crewRateLine.delete({ where: { id: existing.id } });
  await logActivity('crew.rateLine.selfDelete', existing.label, undefined, req.user!.id);
  res.status(204).end();
});

crewPortalRouter.get('/me/jobs', crewView, async (req, res) => {
  const profile = await ownProfile(req.user!.id);
  if (!profile) return res.status(404).json({ error: 'No crew profile found for this account' });

  const assignments = await prisma.jobCrewAssignment.findMany({
    where: { crewProfileId: profile.id },
    include: {
      job: {
        include: {
          crewAssignments: { include: { crewProfile: { include: { user: { select: { displayName: true } } } } } },
        },
      },
    },
  });
  const opportunities = await loadOpportunitiesFor(assignments.map((a) => a.job));

  // Each job's next day this person is booked on (from today), with the earliest entry they're
  // on that day as the call time and who else is working it - feeds the "Your next call" hero.
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const upcomingDays = await prisma.jobDayCrewAssignment.findMany({
    where: { jobCrewAssignmentId: { in: assignments.map((a) => a.id) }, jobDay: { date: { gte: today } } },
    include: {
      jobDay: {
        include: {
          crewAssignments: { include: { jobCrewAssignment: { include: { crewProfile: { include: { user: { select: { displayName: true } } } } } } } },
        },
      },
    },
    orderBy: { jobDay: { date: 'asc' } },
  });
  const nextDayByAssignment = new Map<string, (typeof upcomingDays)[number]['jobDay']>();
  for (const d of upcomingDays) if (!nextDayByAssignment.has(d.jobCrewAssignmentId)) nextDayByAssignment.set(d.jobCrewAssignmentId, d.jobDay);
  // Someone on a job but not booked onto any particular day is on all of it: their next call is
  // the job's next day with a call time.
  const bookedAny = new Set(
    (await prisma.jobDayCrewAssignment.findMany({ where: { jobCrewAssignmentId: { in: assignments.map((a) => a.id) } }, select: { jobCrewAssignmentId: true } })).map((r) => r.jobCrewAssignmentId)
  );
  const unbooked = assignments.filter((a) => !bookedAny.has(a.id));
  if (unbooked.length) {
    const jobCallDays = await prisma.jobDay.findMany({
      where: { jobId: { in: unbooked.map((a) => a.jobId) }, date: { gte: today }, callTime: { not: null } },
      include: { crewAssignments: { include: { jobCrewAssignment: { include: { crewProfile: { include: { user: { select: { displayName: true } } } } } } } } },
      orderBy: { date: 'asc' },
    });
    for (const a of unbooked) {
      const day = jobCallDays.find((d) => d.jobId === a.jobId);
      if (day) nextDayByAssignment.set(a.id, day);
    }
  }
  const nextDays = [...nextDayByAssignment.entries()];
  const dayItems = nextDays.length
    ? await prisma.jobScheduleItem.findMany({
        where: {
          OR: nextDays.map(([, day]) => ({
            jobId: day.jobId,
            startsAt: { gte: new Date(day.date.getTime() - 12 * 3600_000), lt: new Date(day.date.getTime() + 36 * 3600_000) },
          })),
        },
        include: { crewAssignments: { select: { jobCrewAssignmentId: true } } },
        orderBy: { startsAt: 'asc' },
      })
    : [];

  const jobs = assignments
    .map((a) => {
      const opp = opportunities.get(a.job.currentRmsOpportunityId ?? '');
      const day = nextDayByAssignment.get(a.id);
      const items = day ? dayItems.filter((i) => i.jobId === a.jobId && Math.abs(i.startsAt.getTime() - (day.date.getTime() + 12 * 3600_000)) < 24 * 3600_000) : [];
      const mine = items.filter((i) => i.crewAssignments.some((c) => c.jobCrewAssignmentId === a.id));
      return {
        jobId: a.jobId,
        jobName: a.job.name,
        venue: a.job.venue,
        address: a.job.address,
        role: a.role,
        nextDay: day
          ? {
              date: day.date,
              name: day.name,
              callTime: day.callTime,
              wrapTime: day.wrapTime,
              items: (mine.length ? mine : items).map((i) => ({ title: i.title, startsAt: i.startsAt, endsAt: i.endsAt })),
              others: day.crewAssignments
                .filter((c) => c.jobCrewAssignmentId !== a.id)
                .map((c) => ({ name: c.jobCrewAssignment.crewProfile.user.displayName, role: c.jobCrewAssignment.role })),
            }
          : null,
        // The job's own dates override the opportunity's (see Job Settings), same as the
        // crew job page below.
        startsAt: a.job.startsAt ?? opp?.startsAt ?? null,
        endsAt: a.job.endsAt ?? opp?.endsAt ?? null,
        // The full crew roster for this job (not just the caller), so the crew schedule
        // calendar can show per-crew swatches for everyone working the same day.
        crew: a.job.crewAssignments.map((ca) => ({
          id: ca.crewProfileId,
          name: ca.crewProfile.user.displayName,
          role: ca.role,
          color: resolveCrewColor(ca.crewProfileId, ca.crewProfile.color),
        })),
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

crewPortalRouter.get('/me/jobs/:jobId', crewView, async (req, res) => {
  const profile = await ownProfile(req.user!.id);
  if (!profile) return res.status(404).json({ error: 'No crew profile found for this account' });

  const assignment = await prisma.jobCrewAssignment.findUnique({
    where: { jobId_crewProfileId: { jobId: req.params.jobId, crewProfileId: profile.id } },
    include: { job: { include: { projectManager: { select: { id: true, displayName: true, avatarPath: true } } } } },
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
      projectManager: assignment.job.projectManager
        ? { userId: assignment.job.projectManager.id, displayName: assignment.job.projectManager.displayName, hasAvatar: Boolean(assignment.job.projectManager.avatarPath) }
        : null,
      others: otherCrew
        .filter((c) => c.crewProfileId !== profile.id)
        .map((c) => ({ displayName: c.crewProfile.user.displayName, role: c.role })),
    },
    what: {
      jobName: assignment.job.name,
      description: assignment.job.description ?? opp?.subject ?? null,
    },
    when: {
      startsAt: assignment.job.startsAt ?? opp?.startsAt ?? null,
      endsAt: assignment.job.endsAt ?? opp?.endsAt ?? null,
    },
    where: {
      venue: assignment.job.venue,
      address: assignment.job.address,
    },
  });
});

crewPortalRouter.get('/me/jobs/:jobId/schedule', crewView, async (req, res) => {
  const found = await requireAssignedJob(req.user!.id, req.params.jobId);
  if (!found) return res.status(404).json({ error: 'Job not found' });
  const features = await resolveCrewFeatures(found.assignment.job);
  if (!features.schedule) return res.json([]);
  const items = await prisma.jobScheduleItem.findMany({
    where: { jobId: req.params.jobId },
    include: scheduleItemInclude,
    orderBy: { startsAt: 'asc' },
  });
  res.json(items.map(toScheduleItemDto));
});

// Read-only mirror of the admin day-blocks overview (routes/jobDays.ts) - same data, same
// per-job "schedule" visibility toggle as /schedule above, but no write endpoints: a crew
// member can see which days exist and who else is working each one, never add/remove a day or
// drag themselves (or anyone else) onto one.
crewPortalRouter.get('/me/jobs/:jobId/days', crewView, async (req, res) => {
  const found = await requireAssignedJob(req.user!.id, req.params.jobId);
  if (!found) return res.status(404).json({ error: 'Job not found' });
  const features = await resolveCrewFeatures(found.assignment.job);
  if (!features.schedule) return res.json([]);
  await autoPopulateDaysFromOpportunity(req.params.jobId);
  const days = await prisma.jobDay.findMany({
    where: { jobId: req.params.jobId },
    include: dayInclude,
    orderBy: { date: 'asc' },
  });
  res.json(days.map(toDayDto));
});

// "Add to calendar": the days this person is booked on (all-day) plus the entries they're on,
// falling back to the job's own dates when no days are set up yet.
crewPortalRouter.get('/me/jobs/:jobId/calendar.ics', crewView, async (req, res) => {
  const found = await requireAssignedJob(req.user!.id, req.params.jobId);
  if (!found) return res.status(404).json({ error: 'Job not found' });
  const { assignment } = found;
  const job = assignment.job;
  const location = job.address ?? job.venue;
  const events: IcsEvent[] = [];

  const days = await prisma.jobDay.findMany({
    where: { jobId: job.id, crewAssignments: { some: { jobCrewAssignmentId: assignment.id } } },
    orderBy: { date: 'asc' },
  });
  for (const d of days) {
    events.push({ uid: `day-${d.id}@elex-portal`, summary: `${job.name} (${assignment.role})`, allDay: d.date.toISOString().slice(0, 10), location });
  }
  const items = await prisma.jobScheduleItem.findMany({
    where: { jobId: job.id, crewAssignments: { some: { jobCrewAssignmentId: assignment.id } } },
    orderBy: { startsAt: 'asc' },
  });
  for (const i of items) {
    events.push({ uid: `entry-${i.id}@elex-portal`, summary: `${i.title} - ${job.name}`, start: i.startsAt, end: i.endsAt, location, description: i.notes });
  }
  if (events.length === 0) {
    const opp = (await loadOpportunitiesFor([job])).get(job.currentRmsOpportunityId ?? '');
    const startsAt = job.startsAt ?? opp?.startsAt ?? null;
    const endsAt = job.endsAt ?? opp?.endsAt ?? null;
    if (startsAt) events.push({ uid: `job-${job.id}@elex-portal`, summary: `${job.name} (${assignment.role})`, start: startsAt, end: endsAt, location });
  }

  const safeName = job.name.replace(/[^A-Za-z0-9 _-]+/g, '').trim() || 'job';
  res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${safeName}.ics"`);
  res.send(buildIcs(job.name, events));
});

crewPortalRouter.get('/me/jobs/:jobId/documents', crewView, async (req, res) => {
  const found = await requireAssignedJob(req.user!.id, req.params.jobId);
  if (!found) return res.status(404).json({ error: 'Job not found' });
  const features = await resolveCrewFeatures(found.assignment.job);
  if (!features.documents) return res.json([]);
  const documents = await prisma.jobDocument.findMany({
    where: { jobId: req.params.jobId },
    orderBy: { createdAt: 'desc' },
  });
  res.json(documents);
});

crewPortalRouter.get('/me/jobs/:jobId/documents/:docId/file', crewView, async (req, res) => {
  const found = await requireAssignedJob(req.user!.id, req.params.jobId);
  if (!found) return res.status(404).end();
  const features = await resolveCrewFeatures(found.assignment.job);
  if (!features.documents) return res.status(404).end();
  const document = await prisma.jobDocument.findUnique({ where: { id: req.params.docId } });
  if (!document || document.jobId !== req.params.jobId) return res.status(404).end();
  await sendStoredUpload(res, path.join(uploadDir, 'job-documents', document.fileName), document.originalName);
});

crewPortalRouter.get('/me/jobs/:jobId/contacts', crewView, async (req, res) => {
  const found = await requireAssignedJob(req.user!.id, req.params.jobId);
  if (!found) return res.status(404).json({ error: 'Job not found' });
  const features = await resolveCrewFeatures(found.assignment.job);
  if (!features.contacts) return res.json([]);
  const contacts = await prisma.jobContact.findMany({
    where: { jobId: req.params.jobId },
    orderBy: { createdAt: 'asc' },
  });
  res.json(contacts);
});

crewPortalRouter.get('/me/jobs/:jobId/plots', crewView, async (req, res) => {
  const found = await requireAssignedJob(req.user!.id, req.params.jobId);
  if (!found) return res.status(404).json({ error: 'Job not found' });
  const features = await resolveCrewFeatures(found.assignment.job);
  if (!features.plots) return res.json([]);
  const plots = await prisma.plot.findMany({ where: { jobId: req.params.jobId }, orderBy: { createdAt: 'desc' } });
  res.json(plots);
});

crewPortalRouter.get('/me/jobs/:jobId/plots/:plotId/file', crewView, async (req, res) => {
  const found = await requireAssignedJob(req.user!.id, req.params.jobId);
  if (!found) return res.status(404).end();
  const features = await resolveCrewFeatures(found.assignment.job);
  if (!features.plots) return res.status(404).end();
  const plot = await prisma.plot.findUnique({ where: { id: req.params.plotId } });
  if (!plot || plot.jobId !== req.params.jobId) return res.status(404).end();
  await sendStoredUpload(res, path.join(plotsDir, plot.fileName), plot.originalName);
});

/**
 * OneDrive-sourced CAD/files for the crew CAD section: the auto-detected first PDF in the
 * job's matched "CAD" folder (always surfaced once a folder's linked - see oneDrive/cad.ts),
 * plus anything else an admin has explicitly shared with crew via the Files tab. Both are
 * scaffolded against the Graph API and return empty/null until OneDrive is actually
 * configured with real Azure credentials (see oneDrive/config.ts).
 */
crewPortalRouter.get('/me/jobs/:jobId/onedrive', crewView, async (req, res) => {
  const found = await requireAssignedJob(req.user!.id, req.params.jobId);
  if (!found) return res.status(404).json({ error: 'Job not found' });
  const features = await resolveCrewFeatures(found.assignment.job);
  if (!features.plots) return res.json({ cadPdf: null, shared: [] });
  const [cadPdf, shared] = await Promise.all([
    findSharedCadPdf(found.assignment.job).catch(() => null),
    listJobShares(req.params.jobId),
  ]);
  res.json({ cadPdf, shared });
});

/** Streams a OneDrive item's bytes through our own auth, rather than handing the crew member a
 * raw Graph URL - scaffolded; throws a clear "not configured" error until real credentials are
 * wired in (see oneDrive/client.ts). */
crewPortalRouter.get('/me/jobs/:jobId/onedrive/:itemId/file', crewView, async (req, res) => {
  const found = await requireAssignedJob(req.user!.id, req.params.jobId);
  if (!found) return res.status(404).end();
  const { itemId } = req.params;
  const cadPdf = await findSharedCadPdf(found.assignment.job).catch(() => null);
  const isSharedCad = cadPdf?.itemId === itemId;
  const isExplicitlyShared = isSharedCad ? true : await isItemSharedWithJob(req.params.jobId, itemId);
  if (!isExplicitlyShared) return res.status(404).end();
  try {
    const config = await getOneDriveConfig();
    const { stream, contentType, fileName } = await streamOneDriveFile(config, itemId);
    applyStreamHeaders(res, contentType, fileName);
    stream.pipe(res);
  } catch (err) {
    res.status(502).json({ error: (err as Error).message });
  }
});

/**
 * Kit list, no pricing - reuses fetchPickListSnapshot (the same pricing-free {id, name,
 * quantity} shape the pick-list-diff alert already uses), not the admin/signage pick-list
 * endpoint, which spreads the full raw Current RMS item (including whatever price fields the
 * account's response carries) into its response.
 */
crewPortalRouter.get('/me/jobs/:jobId/kit-list', crewView, async (req, res) => {
  const found = await requireAssignedJob(req.user!.id, req.params.jobId);
  if (!found) return res.status(404).json({ error: 'Job not found' });
  const features = await resolveCrewFeatures(found.assignment.job);
  if (!features.kitList) return res.json({ items: [] });
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
 * it lands as a PENDING CrewLabelRequest, not directly in the print queue or Labels tab - an
 * admin/staff member has to approve it first (routes/crewLabelRequests.ts), at which point it
 * becomes a real AdHocLabel attributed back to this crew member.
 */
const REQUESTABLE_LABEL_TYPES = ['TRUSS_SPIKE_POSITION', 'TRUSS_SPIKE_TIP', 'TRUSS_SPIKE_SACN', 'CABLE', 'PAL', 'RACK'];

crewPortalRouter.post('/me/jobs/:jobId/label-requests', crewView, async (req, res) => {
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

// Same thread staff see on the job's Discussion tab (routes/jobDiscussion.ts), scoped here to
// a job the caller is actually assigned to. Crew have no moderateDiscussion permission, so
// `locked` here only ever disables the compose box - there's no unlock control on this side.
crewPortalRouter.get('/me/jobs/:jobId/discussion', crewView, async (req, res) => {
  const found = await requireAssignedJob(req.user!.id, req.params.jobId);
  if (!found) return res.status(404).json({ error: 'Job not found' });
  const features = await resolveCrewFeatures(found.assignment.job);
  if (!features.discussion) return res.json({ locked: false, groups: [], groupId: null, messages: [] });
  // Only the groups this person may see; a members-only group they aren't in is never named.
  const groups = (await ensureJobGroups(req.params.jobId)).filter((g) => crewCanSee(g, found.assignment.id));
  const group = pickGroup(groups, req.query.groupId);
  const messages = await prisma.jobDiscussionMessage.findMany({
    where: { jobId: req.params.jobId, groupId: group.id },
    include: MESSAGE_INCLUDE,
    orderBy: { createdAt: 'asc' },
  });
  res.json({
    locked: found.assignment.job.discussionLocked,
    groupId: group.id,
    groups: groups.map((g) => toGroupDto(g, { includeMembers: false })),
    messages: messages.map(toMessageDto),
  });
});

crewPortalRouter.post('/me/jobs/:jobId/discussion', crewView, discussionImageUpload.single('image'), async (req, res) => {
  const found = await requireAssignedJob(req.user!.id, req.params.jobId);
  if (!found) return res.status(404).json({ error: 'Job not found' });
  const features = await resolveCrewFeatures(found.assignment.job);
  if (!features.discussion) return res.status(403).json({ error: 'Discussion is not enabled for this job' });
  if (found.assignment.job.discussionLocked) return res.status(403).json({ error: 'This discussion is locked' });
  const input = parseMessageInput(req.body, Boolean(req.file));
  if ('error' in input) return res.status(400).json({ error: input.error });
  const groupId = input.groupId;
  const groups = (await ensureJobGroups(req.params.jobId)).filter((g) => crewCanSee(g, found.assignment.id));
  if (groupId && !groups.some((g) => g.id === groupId)) return res.status(404).json({ error: 'Group not found' });
  const group = pickGroup(groups, groupId);
  const replyError = await checkReplyTarget(req.params.jobId, group.id, input.replyToId);
  if (replyError) return res.status(400).json({ error: replyError });
  const image = req.file ? await storeDiscussionImage(req.file) : null;

  const message = await prisma.jobDiscussionMessage.create({
    data: { jobId: req.params.jobId, authorUserId: req.user!.id, body: input.text, groupId: group.id, replyToId: input.replyToId, ...image },
    include: MESSAGE_INCLUDE,
  });
  await logActivity('job_discussion.create', req.params.jobId, req.params.jobId, req.user!.id);
  await notifyDiscussionMessage(req.params.jobId, found.assignment.job.name, req.user!.id, req.user!.displayName, notificationText(message.body, Boolean(image)), group.id);
  res.status(201).json(toMessageDto(message));
});

// An attached image, only from a chat group this person can see.
crewPortalRouter.get('/me/jobs/:jobId/discussion/:messageId/attachment', crewView, async (req, res) => {
  const found = await requireAssignedJob(req.user!.id, req.params.jobId);
  if (!found) return res.status(404).end();
  const features = await resolveCrewFeatures(found.assignment.job);
  if (!features.discussion) return res.status(404).end();
  const message = await prisma.jobDiscussionMessage.findUnique({ where: { id: req.params.messageId } });
  if (!message || message.jobId !== req.params.jobId || message.deletedAt || !message.attachmentPath) return res.status(404).end();
  const groups = (await ensureJobGroups(req.params.jobId)).filter((g) => crewCanSee(g, found.assignment.id));
  if (!groups.some((g) => g.id === message.groupId)) return res.status(404).end();
  await sendStoredUpload(res, path.join(discussionUploadsDir, message.attachmentPath), message.attachmentName ?? 'image');
});

// A crew member can edit or delete only their own message - no moderation permission applies
// on this side, matching routes/jobDiscussion.ts's staff-side moderateDiscussion check.
crewPortalRouter.put('/me/jobs/:jobId/discussion/:messageId', crewView, async (req, res) => {
  const found = await requireAssignedJob(req.user!.id, req.params.jobId);
  if (!found) return res.status(404).json({ error: 'Job not found' });
  const message = await prisma.jobDiscussionMessage.findUnique({ where: { id: req.params.messageId } });
  if (!message || message.jobId !== req.params.jobId || message.deletedAt) return res.status(404).json({ error: 'Message not found' });
  if (message.authorUserId !== req.user!.id) return res.status(403).json({ error: 'You can only edit your own messages' });
  const input = parseMessageInput(req.body, Boolean(message.attachmentPath));
  if ('error' in input) return res.status(400).json({ error: input.error });

  const updated = await prisma.jobDiscussionMessage.update({
    where: { id: message.id },
    data: { body: input.text, editedAt: new Date() },
    include: MESSAGE_INCLUDE,
  });
  await logActivity('job_discussion.edit', req.params.jobId, req.params.jobId, req.user!.id);
  res.json(toMessageDto(updated));
});

crewPortalRouter.delete('/me/jobs/:jobId/discussion/:messageId', crewView, async (req, res) => {
  const found = await requireAssignedJob(req.user!.id, req.params.jobId);
  if (!found) return res.status(404).json({ error: 'Job not found' });
  const message = await prisma.jobDiscussionMessage.findUnique({ where: { id: req.params.messageId } });
  if (!message || message.jobId !== req.params.jobId || message.deletedAt) return res.status(404).json({ error: 'Message not found' });
  if (message.authorUserId !== req.user!.id) return res.status(403).json({ error: 'You can only delete your own messages' });
  await prisma.jobDiscussionMessage.delete({ where: { id: message.id } });
  await removeDiscussionImage(message.attachmentPath);
  await logActivity('job_discussion.delete', req.params.jobId, req.params.jobId, req.user!.id);
  res.status(204).end();
});

/** Batch-loads the (at most a handful of) distinct linked opportunities a crew member's jobs reference. */
async function loadOpportunitiesFor(jobs: { currentRmsOpportunityId: string | null }[]) {
  const ids = [...new Set(jobs.map((j) => j.currentRmsOpportunityId).filter((id): id is string => Boolean(id)))].map(Number);
  if (ids.length === 0) return new Map<string, { startsAt: Date | null; endsAt: Date | null }>();
  const opps = await prisma.currentRmsOpportunity.findMany({ where: { rmsId: { in: ids } } });
  return new Map(opps.map((o) => [String(o.rmsId), { startsAt: o.startsAt, endsAt: o.endsAt }]));
}
