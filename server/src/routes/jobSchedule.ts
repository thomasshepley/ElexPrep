import { Router } from 'express';
import { prisma, logActivity } from '../db';
import { requireRole } from '../auth';

/**
 * A job's day schedule - timed entries (load-in, soundcheck, doors, show, get-out, ...)
 * rendered as a timeline on both the admin job detail page and the crew portal's "Why"
 * section. Reads are open to any signed-in staff account (mirrors jobCurrentRmsRouter's
 * reasoning: anyone who can see the job should see its schedule); writes are admin-only, same
 * as the rest of this job's structural setup.
 */
export const jobScheduleRouter = Router();

jobScheduleRouter.get('/:jobId/schedule', async (req, res) => {
  const items = await prisma.jobScheduleItem.findMany({
    where: { jobId: req.params.jobId },
    orderBy: { startsAt: 'asc' },
  });
  res.json(items);
});

jobScheduleRouter.post('/:jobId/schedule', requireRole('ADMIN'), async (req, res) => {
  const { title, startsAt, endsAt, notes } = req.body ?? {};
  if (!title || typeof title !== 'string') return res.status(400).json({ error: 'title is required' });
  if (!startsAt) return res.status(400).json({ error: 'startsAt is required' });
  const item = await prisma.jobScheduleItem.create({
    data: {
      jobId: req.params.jobId,
      title,
      startsAt: new Date(startsAt),
      endsAt: endsAt ? new Date(endsAt) : null,
      notes: notes || null,
    },
  });
  await logActivity('job_schedule.create', title, req.params.jobId, req.user?.id);
  res.status(201).json(item);
});

jobScheduleRouter.put('/:jobId/schedule/:id', requireRole('ADMIN'), async (req, res) => {
  const existing = await prisma.jobScheduleItem.findUnique({ where: { id: req.params.id } });
  if (!existing || existing.jobId !== req.params.jobId) return res.status(404).json({ error: 'Schedule item not found' });
  const { title, startsAt, endsAt, notes } = req.body ?? {};
  const item = await prisma.jobScheduleItem.update({
    where: { id: existing.id },
    data: {
      ...(title !== undefined ? { title } : {}),
      ...(startsAt !== undefined ? { startsAt: new Date(startsAt) } : {}),
      ...(endsAt !== undefined ? { endsAt: endsAt ? new Date(endsAt) : null } : {}),
      ...(notes !== undefined ? { notes: notes || null } : {}),
    },
  });
  await logActivity('job_schedule.update', item.title, req.params.jobId, req.user?.id);
  res.json(item);
});

jobScheduleRouter.delete('/:jobId/schedule/:id', requireRole('ADMIN'), async (req, res) => {
  const existing = await prisma.jobScheduleItem.findUnique({ where: { id: req.params.id } });
  if (!existing || existing.jobId !== req.params.jobId) return res.status(404).json({ error: 'Schedule item not found' });
  await prisma.jobScheduleItem.delete({ where: { id: existing.id } });
  await logActivity('job_schedule.delete', existing.title, req.params.jobId, req.user?.id);
  res.status(204).end();
});
