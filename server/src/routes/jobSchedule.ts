import { Router } from 'express';
import { prisma, logActivity } from '../db';
import { requireRole } from '../auth';
import { requirePermission } from '../permissions';

/**
 * A job's day schedule - timed entries (load-in, soundcheck, doors, show, get-out, ...)
 * rendered as a timeline on both the admin job detail page and the crew portal's "Why"
 * section. Reads are open to any signed-in staff account (mirrors jobCurrentRmsRouter's
 * reasoning: anyone who can see the job should see its schedule); structural writes (title/
 * time/color/add/remove) are admin-only, same as the rest of this job's structural setup.
 * Assigning crew to a specific entry ("task") uses the same delegatable manageCrewAssignments
 * permission as day- and job-level crew attribution, since it's the same capability at an even
 * finer grain.
 */
export const jobScheduleRouter = Router();

export const scheduleItemInclude = {
  crewAssignments: {
    include: {
      jobCrewAssignment: {
        include: { crewProfile: { include: { user: { select: { displayName: true } } } } },
      },
    },
  },
} as const;

type ScheduleItemRow = {
  id: string;
  jobId: string;
  title: string;
  startsAt: Date;
  endsAt: Date | null;
  notes: string | null;
  color: string | null;
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

export function toScheduleItemDto(item: ScheduleItemRow) {
  return {
    id: item.id,
    jobId: item.jobId,
    title: item.title,
    startsAt: item.startsAt.toISOString(),
    endsAt: item.endsAt ? item.endsAt.toISOString() : null,
    notes: item.notes,
    color: item.color,
    crew: item.crewAssignments.map((ca) => ({
      id: ca.id,
      jobCrewAssignmentId: ca.jobCrewAssignment.id,
      crewProfileId: ca.jobCrewAssignment.crewProfileId,
      displayName: ca.jobCrewAssignment.crewProfile.user.displayName,
      role: ca.jobCrewAssignment.role,
      color: ca.jobCrewAssignment.crewProfile.color,
    })),
  };
}

/** Ensures a JobDay exists for the given instant and that jobCrewAssignmentId is linked to it -
 * dragging someone onto a task auto-assigns them to that task's day too, so the day-blocks
 * overview and the crew-margin day count both stay consistent with real task assignments. The
 * caller (the web client) resolves `date` the same way DayBlocksColumn does for a day-block
 * drop (local midnight in the browser's own timezone), so this always lands on the exact same
 * JobDay row a day-block drag onto that date would. */
export async function ensureDayCrewAssignment(jobId: string, date: Date, jobCrewAssignmentId: string) {
  let day = await prisma.jobDay.findUnique({ where: { jobId_date: { jobId, date } } });
  if (!day) day = await prisma.jobDay.create({ data: { jobId, date } });
  const existing = await prisma.jobDayCrewAssignment.findUnique({
    where: { jobDayId_jobCrewAssignmentId: { jobDayId: day.id, jobCrewAssignmentId } },
  });
  if (!existing) await prisma.jobDayCrewAssignment.create({ data: { jobDayId: day.id, jobCrewAssignmentId } });
}

jobScheduleRouter.get('/:jobId/schedule', async (req, res) => {
  const items = await prisma.jobScheduleItem.findMany({
    where: { jobId: req.params.jobId },
    include: scheduleItemInclude,
    orderBy: { startsAt: 'asc' },
  });
  res.json(items.map(toScheduleItemDto));
});

jobScheduleRouter.post('/:jobId/schedule', requireRole('ADMIN'), async (req, res) => {
  const { title, startsAt, endsAt, notes, color } = req.body ?? {};
  if (!title || typeof title !== 'string') return res.status(400).json({ error: 'title is required' });
  if (!startsAt) return res.status(400).json({ error: 'startsAt is required' });
  const item = await prisma.jobScheduleItem.create({
    data: {
      jobId: req.params.jobId,
      title,
      startsAt: new Date(startsAt),
      endsAt: endsAt ? new Date(endsAt) : null,
      notes: notes || null,
      color: color || null,
    },
    include: scheduleItemInclude,
  });
  await logActivity('job_schedule.create', title, req.params.jobId, req.user?.id);
  res.status(201).json(toScheduleItemDto(item));
});

jobScheduleRouter.put('/:jobId/schedule/:id', requireRole('ADMIN'), async (req, res) => {
  const existing = await prisma.jobScheduleItem.findUnique({ where: { id: req.params.id } });
  if (!existing || existing.jobId !== req.params.jobId) return res.status(404).json({ error: 'Schedule item not found' });
  const { title, startsAt, endsAt, notes, color } = req.body ?? {};
  const item = await prisma.jobScheduleItem.update({
    where: { id: existing.id },
    data: {
      ...(title !== undefined ? { title } : {}),
      ...(startsAt !== undefined ? { startsAt: new Date(startsAt) } : {}),
      ...(endsAt !== undefined ? { endsAt: endsAt ? new Date(endsAt) : null } : {}),
      ...(notes !== undefined ? { notes: notes || null } : {}),
      ...(color !== undefined ? { color: color || null } : {}),
    },
    include: scheduleItemInclude,
  });
  await logActivity('job_schedule.update', item.title, req.params.jobId, req.user?.id);
  res.json(toScheduleItemDto(item));
});

jobScheduleRouter.delete('/:jobId/schedule/:id', requireRole('ADMIN'), async (req, res) => {
  const existing = await prisma.jobScheduleItem.findUnique({ where: { id: req.params.id } });
  if (!existing || existing.jobId !== req.params.jobId) return res.status(404).json({ error: 'Schedule item not found' });
  await prisma.jobScheduleItem.delete({ where: { id: existing.id } });
  await logActivity('job_schedule.delete', existing.title, req.params.jobId, req.user?.id);
  res.status(204).end();
});

jobScheduleRouter.post('/:jobId/schedule/:id/crew', requirePermission('manageCrewAssignments'), async (req, res) => {
  const { jobId, id } = req.params;
  const { jobCrewAssignmentId, dayDate } = req.body ?? {};
  if (!jobCrewAssignmentId || typeof jobCrewAssignmentId !== 'string') {
    return res.status(400).json({ error: 'jobCrewAssignmentId is required' });
  }
  const item = await prisma.jobScheduleItem.findUnique({ where: { id } });
  if (!item || item.jobId !== jobId) return res.status(404).json({ error: 'Schedule item not found' });
  const assignment = await prisma.jobCrewAssignment.findUnique({ where: { id: jobCrewAssignmentId } });
  if (!assignment || assignment.jobId !== jobId) return res.status(404).json({ error: 'Crew assignment not found on this job' });

  const parsedDay = typeof dayDate === 'string' ? new Date(dayDate) : null;
  if (parsedDay && !Number.isNaN(parsedDay.getTime())) {
    await ensureDayCrewAssignment(jobId, parsedDay, jobCrewAssignmentId);
  }

  const existing = await prisma.jobScheduleItemCrewAssignment.findUnique({
    where: { scheduleItemId_jobCrewAssignmentId: { scheduleItemId: id, jobCrewAssignmentId } },
  });
  if (existing) return res.status(200).json({ id: existing.id });
  const created = await prisma.jobScheduleItemCrewAssignment.create({ data: { scheduleItemId: id, jobCrewAssignmentId } });
  await logActivity('job_schedule.assign_crew', assignment.id, jobId, req.user?.id);
  res.status(201).json({ id: created.id });
});

jobScheduleRouter.delete('/:jobId/schedule/:id/crew/:crewRowId', requirePermission('manageCrewAssignments'), async (req, res) => {
  const row = await prisma.jobScheduleItemCrewAssignment.findUnique({ where: { id: req.params.crewRowId } });
  if (!row || row.scheduleItemId !== req.params.id) return res.status(404).json({ error: 'Not found' });
  await prisma.jobScheduleItemCrewAssignment.delete({ where: { id: row.id } });
  await logActivity('job_schedule.unassign_crew', row.id, req.params.jobId, req.user?.id);
  res.status(204).end();
});
