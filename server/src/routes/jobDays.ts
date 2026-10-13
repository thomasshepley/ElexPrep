import { Router } from 'express';
import { prisma, logActivity } from '../db';
import { requireRole } from '../auth';
import { requirePermission } from '../permissions';

/**
 * A job's day-by-day overview "blocks" - distinct from JobScheduleItem (the hourly entries
 * within a day): a JobDay can exist before any hourly item does, letting an admin drag crew
 * onto a day before there's anything else scheduled on it. Structural add/remove of a day is
 * admin-only (mirrors jobSchedule.ts); assigning/unassigning crew to a day uses the same
 * delegatable manageCrewAssignments permission as job-level crew attribution, since it's the
 * same underlying capability at finer grain. Reads are open to anyone who can see the job.
 */
export const jobDaysRouter = Router();

export const dayInclude = {
  crewAssignments: {
    include: {
      jobCrewAssignment: {
        include: { crewProfile: { include: { user: { select: { displayName: true } } } } },
      },
    },
  },
} as const;

type DayRow = {
  id: string;
  date: Date;
  crewAssignments: {
    id: string;
    jobCrewAssignment: {
      id: string;
      role: string;
      crewProfileId: string;
      crewProfile: { color: string | null; user: { displayName: string } };
    };
  }[];
};

export function toDayDto(day: DayRow) {
  return {
    id: day.id,
    date: day.date.toISOString(),
    crew: day.crewAssignments.map((ca) => ({
      id: ca.id,
      jobCrewAssignmentId: ca.jobCrewAssignment.id,
      crewProfileId: ca.jobCrewAssignment.crewProfileId,
      displayName: ca.jobCrewAssignment.crewProfile.user.displayName,
      role: ca.jobCrewAssignment.role,
      color: ca.jobCrewAssignment.crewProfile.color,
    })),
  };
}

const MAX_AUTO_POPULATED_DAYS = 366;

/**
 * The first time anyone looks at a job's days with none added yet, fills them in from the
 * job's own effective date range (its own startsAt/endsAt override, falling back to the linked
 * Current RMS opportunity's dates - the same fallback already used for the "When" card, see
 * routes/crewPortal.ts) - so a multi-day job shows its full run without the admin having to
 * add every day one at a time. Only acts while the day list is completely empty, so it never
 * undoes a deliberate removal of a day that's still there alongside others, and a sane cap
 * guards against a garbage date range (e.g. a bad Current RMS sync) creating a year of rows.
 */
export async function autoPopulateDaysFromOpportunity(jobId: string) {
  const existingCount = await prisma.jobDay.count({ where: { jobId } });
  if (existingCount > 0) return;

  const job = await prisma.job.findUnique({
    where: { id: jobId },
    select: { startsAt: true, endsAt: true, currentRmsOpportunityId: true },
  });
  if (!job) return;

  const rmsId = job.currentRmsOpportunityId ? Number(job.currentRmsOpportunityId) : NaN;
  const opp = Number.isFinite(rmsId) ? await prisma.currentRmsOpportunity.findUnique({ where: { rmsId } }) : null;
  const start = job.startsAt ?? opp?.startsAt ?? null;
  const end = job.endsAt ?? opp?.endsAt ?? null;
  if (!start || !end) return;

  const startKey = start.toISOString().slice(0, 10);
  const endKey = end.toISOString().slice(0, 10);
  if (startKey > endKey) return;

  const dates: Date[] = [];
  let cursor = new Date(`${startKey}T00:00:00.000Z`);
  const last = new Date(`${endKey}T00:00:00.000Z`);
  while (cursor <= last && dates.length <= MAX_AUTO_POPULATED_DAYS) {
    dates.push(cursor);
    cursor = new Date(cursor.getTime() + 24 * 60 * 60 * 1000);
  }
  if (dates.length === 0 || dates.length > MAX_AUTO_POPULATED_DAYS) return;

  // No skipDuplicates - SQLite's connector doesn't support it in this Prisma version. Safe
  // without it anyway: the existingCount === 0 guard above means this only ever runs against
  // a genuinely empty day list.
  await prisma.jobDay.createMany({ data: dates.map((date) => ({ jobId, date })) });
}

jobDaysRouter.get('/:jobId/days', async (req, res) => {
  await autoPopulateDaysFromOpportunity(req.params.jobId);
  const days = await prisma.jobDay.findMany({
    where: { jobId: req.params.jobId },
    include: dayInclude,
    orderBy: { date: 'asc' },
  });
  res.json(days.map(toDayDto));
});

jobDaysRouter.post('/:jobId/days', requireRole('ADMIN'), async (req, res) => {
  const { jobId } = req.params;
  const { date } = req.body ?? {};
  const parsed = typeof date === 'string' ? new Date(date) : null;
  if (!parsed || Number.isNaN(parsed.getTime())) return res.status(400).json({ error: 'date is required' });
  const existing = await prisma.jobDay.findUnique({
    where: { jobId_date: { jobId, date: parsed } },
    include: dayInclude,
  });
  if (existing) return res.status(200).json(toDayDto(existing));
  const day = await prisma.jobDay.create({ data: { jobId, date: parsed }, include: dayInclude });
  await logActivity('job_day.create', parsed.toISOString(), jobId, req.user?.id);
  res.status(201).json(toDayDto(day));
});

jobDaysRouter.delete('/:jobId/days/:id', requireRole('ADMIN'), async (req, res) => {
  const day = await prisma.jobDay.findUnique({
    where: { id: req.params.id },
    include: { crewAssignments: true },
  });
  if (!day || day.jobId !== req.params.jobId) return res.status(404).json({ error: 'Day not found' });
  if (day.crewAssignments.length > 0) {
    return res.status(409).json({ error: "Unassign this day's crew first" });
  }
  const dayStart = day.date;
  const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
  const itemCount = await prisma.jobScheduleItem.count({
    where: { jobId: req.params.jobId, startsAt: { gte: dayStart, lt: dayEnd } },
  });
  if (itemCount > 0) {
    return res.status(409).json({ error: `Remove this day's ${itemCount} schedule ${itemCount === 1 ? 'entry' : 'entries'} first` });
  }
  await prisma.jobDay.delete({ where: { id: day.id } });
  await logActivity('job_day.delete', dayStart.toISOString(), req.params.jobId, req.user?.id);
  res.status(204).end();
});

jobDaysRouter.post('/:jobId/days/:dayId/crew', requirePermission('manageCrewAssignments'), async (req, res) => {
  const { jobId, dayId } = req.params;
  const { jobCrewAssignmentId } = req.body ?? {};
  if (!jobCrewAssignmentId || typeof jobCrewAssignmentId !== 'string') {
    return res.status(400).json({ error: 'jobCrewAssignmentId is required' });
  }
  const day = await prisma.jobDay.findUnique({ where: { id: dayId } });
  if (!day || day.jobId !== jobId) return res.status(404).json({ error: 'Day not found' });
  const assignment = await prisma.jobCrewAssignment.findUnique({ where: { id: jobCrewAssignmentId } });
  if (!assignment || assignment.jobId !== jobId) return res.status(404).json({ error: 'Crew assignment not found on this job' });
  const existing = await prisma.jobDayCrewAssignment.findUnique({
    where: { jobDayId_jobCrewAssignmentId: { jobDayId: dayId, jobCrewAssignmentId } },
  });
  if (existing) return res.status(200).json({ id: existing.id });
  const created = await prisma.jobDayCrewAssignment.create({ data: { jobDayId: dayId, jobCrewAssignmentId } });
  await logActivity('job_day.assign_crew', assignment.id, jobId, req.user?.id);
  res.status(201).json({ id: created.id });
});

// One person's rate for one day (a travel or half day). Blank clears it back to their job rate.
// Read back through the Crew tab (routes/jobCrewAssignments.ts), never the day DTO, which crew see.
jobDaysRouter.put('/:jobId/days/:dayId/crew/:id', requirePermission('manageCrewAssignments'), async (req, res) => {
  const row = await prisma.jobDayCrewAssignment.findUnique({ where: { id: req.params.id }, include: { jobDay: { select: { jobId: true } } } });
  if (!row || row.jobDayId !== req.params.dayId || row.jobDay.jobId !== req.params.jobId) return res.status(404).json({ error: 'Not found' });
  const raw = req.body?.dayRate;
  const cleaned = raw == null ? '' : String(raw).replace(/[£,\s]/g, '');
  if (cleaned && (!Number.isFinite(Number(cleaned)) || Number(cleaned) < 0)) return res.status(400).json({ error: 'dayRate must be a number' });
  await prisma.jobDayCrewAssignment.update({ where: { id: row.id }, data: { dayRate: cleaned || null } });
  await logActivity('job_day.crew_rate', cleaned || '(cleared)', req.params.jobId, req.user?.id);
  res.json({ id: row.id, dayRate: cleaned || null });
});

jobDaysRouter.delete('/:jobId/days/:dayId/crew/:id', requirePermission('manageCrewAssignments'), async (req, res) => {
  const row = await prisma.jobDayCrewAssignment.findUnique({ where: { id: req.params.id }, include: { jobDay: { select: { jobId: true } } } });
  if (!row || row.jobDayId !== req.params.dayId || row.jobDay.jobId !== req.params.jobId) return res.status(404).json({ error: 'Not found' });
  await prisma.jobDayCrewAssignment.delete({ where: { id: row.id } });
  await logActivity('job_day.unassign_crew', row.id, req.params.jobId, req.user?.id);
  res.status(204).end();
});
