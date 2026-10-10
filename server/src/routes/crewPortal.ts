import { Router } from 'express';
import { prisma } from '../db';
import { requireRole } from '../auth';

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

/** Batch-loads the (at most a handful of) distinct linked opportunities a crew member's jobs reference. */
async function loadOpportunitiesFor(jobs: { currentRmsOpportunityId: string | null }[]) {
  const ids = [...new Set(jobs.map((j) => j.currentRmsOpportunityId).filter((id): id is string => Boolean(id)))].map(Number);
  if (ids.length === 0) return new Map<string, { startsAt: Date | null; endsAt: Date | null }>();
  const opps = await prisma.currentRmsOpportunity.findMany({ where: { rmsId: { in: ids } } });
  return new Map(opps.map((o) => [String(o.rmsId), { startsAt: o.startsAt, endsAt: o.endsAt }]));
}
