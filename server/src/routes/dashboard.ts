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

  // "This week": every job day from today for seven days, with who's working it and that day's
  // timed entries, so the home screen answers "what's on and who's on it" without opening jobs.
  const weekStart = new Date();
  weekStart.setUTCHours(0, 0, 0, 0);
  const weekEnd = new Date(weekStart.getTime() + 7 * 24 * 60 * 60 * 1000);
  const jobIds = jobs.map((j) => j.id);
  const jobById = new Map(jobs.map((j) => [j.id, j]));
  const [days, items, failedPrints] = await Promise.all([
    prisma.jobDay.findMany({
      where: { jobId: { in: jobIds }, date: { gte: weekStart, lt: weekEnd } },
      include: {
        crewAssignments: {
          include: { jobCrewAssignment: { include: { crewProfile: { include: { user: { select: { displayName: true } } } } } } },
        },
      },
      orderBy: { date: 'asc' },
    }),
    prisma.jobScheduleItem.findMany({
      where: { jobId: { in: jobIds }, startsAt: { gte: new Date(weekStart.getTime() - 12 * 60 * 60 * 1000), lt: new Date(weekEnd.getTime() + 12 * 60 * 60 * 1000) } },
      orderBy: { startsAt: 'asc' },
      select: { id: true, jobId: true, title: true, startsAt: true, endsAt: true },
    }),
    prisma.printJob.findMany({
      where: { jobId: { in: jobIds }, status: 'FAILED', createdAt: { gte: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000) } },
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: { id: true, jobId: true, labelType: true, error: true, createdAt: true },
    }),
  ]);

  const thisWeek = days.map((d) => ({
    id: d.id,
    date: d.date,
    jobId: d.jobId,
    jobName: jobById.get(d.jobId)?.name ?? '',
    venue: jobById.get(d.jobId)?.venue ?? null,
    crew: d.crewAssignments.map((a) => ({
      id: a.jobCrewAssignment.crewProfileId,
      name: a.jobCrewAssignment.crewProfile.user.displayName,
      role: a.jobCrewAssignment.role,
      color: resolveCrewColor(a.jobCrewAssignment.crewProfileId, a.jobCrewAssignment.crewProfile.color),
    })),
    // Loose window either side of the stored midnight; the browser keeps only the entries that
    // fall on this day in its own time zone.
    items: items
      .filter((i) => i.jobId === d.jobId && Math.abs(i.startsAt.getTime() - (d.date.getTime() + 12 * 60 * 60 * 1000)) < 24 * 60 * 60 * 1000)
      .map(({ id, title, startsAt, endsAt }) => ({ id, title, startsAt, endsAt })),
  }));

  res.json({
    orders,
    thisWeek,
    failedPrints: failedPrints.map((p) => ({ ...p, jobName: jobById.get(p.jobId)?.name ?? '' })),
  });
});
