import { Router } from 'express';
import { resolveCrewColor } from '@elexprep/shared';
import { prisma } from '../db';
import { isAdminRole } from '../auth';

/**
 * Admin home: every visible job with its dates (the job's own, falling back to the linked Current
 * RMS opportunity's) and order value where there is one, for the dashboard list and calendar.
 * Same visibility rule as jobsRouter's GET / - a different view of the same job list, not a
 * separate permission boundary.
 */
export const dashboardRouter = Router();

dashboardRouter.get('/', async (req, res) => {
  const isAdmin = isAdminRole(req.user?.role);
  const jobs = await prisma.job.findMany({
    where: isAdmin ? {} : { isPublic: true },
    include: {
      crewAssignments: { include: { crewProfile: { include: { user: { select: { displayName: true } } } } } },
    },
  });

  const oppIds = [...new Set(jobs.filter((j) => j.currentRmsOpportunityId).map((j) => Number(j.currentRmsOpportunityId)))];
  const opportunities = await prisma.currentRmsOpportunity.findMany({ where: { rmsId: { in: oppIds } } });
  const oppById = new Map(opportunities.map((o) => [String(o.rmsId), o]));

  const orders = jobs
    .map((j) => {
      const opp = j.currentRmsOpportunityId ? oppById.get(j.currentRmsOpportunityId) : undefined;
      const crew = j.crewAssignments.map((a) => ({
        id: a.crewProfileId,
        name: a.crewProfile.user.displayName,
        role: a.role,
        color: resolveCrewColor(a.crewProfileId, a.crewProfile.color),
      }));
      return {
        jobId: j.id,
        jobName: j.name,
        venue: j.venue,
        status: opp?.status ?? null,
        // Job Settings dates override the opportunity's, matching the crew job page.
        startsAt: j.startsAt ?? opp?.startsAt ?? null,
        endsAt: j.endsAt ?? opp?.endsAt ?? null,
        value: opp?.value ?? null,
        crewCount: crew.length,
        crew,
      };
    })
    .sort((a, b) => {
      if (a.startsAt && b.startsAt) return new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime();
      if (a.startsAt) return -1;
      if (b.startsAt) return 1;
      return a.jobName.localeCompare(b.jobName);
    });

  res.json({ orders });
});
