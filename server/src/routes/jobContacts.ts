import { Router } from 'express';
import { prisma, logActivity } from '../db';
import { requireRole } from '../auth';

/**
 * Venue/client/production contacts worth having on hand for a job - name, role, phone/email,
 * notes. Same visibility posture as JobDocument/JobSchedulePanel: reads open to any signed-in
 * staff account (and crew assigned to the job, via crewPortal.ts's own read endpoint), writes
 * admin-only.
 */
export const jobContactsRouter = Router();

jobContactsRouter.get('/:jobId/contacts', async (req, res) => {
  const contacts = await prisma.jobContact.findMany({
    where: { jobId: req.params.jobId },
    orderBy: { createdAt: 'asc' },
  });
  res.json(contacts);
});

jobContactsRouter.post('/:jobId/contacts', requireRole('ADMIN'), async (req, res) => {
  const { name, role, phone, email, notes } = req.body ?? {};
  if (!name || typeof name !== 'string') return res.status(400).json({ error: 'name is required' });
  const contact = await prisma.jobContact.create({
    data: {
      jobId: req.params.jobId,
      name,
      role: role || null,
      phone: phone || null,
      email: email || null,
      notes: notes || null,
    },
  });
  await logActivity('job_contact.create', name, req.params.jobId, req.user?.id);
  res.status(201).json(contact);
});

jobContactsRouter.put('/:jobId/contacts/:id', requireRole('ADMIN'), async (req, res) => {
  const existing = await prisma.jobContact.findUnique({ where: { id: req.params.id } });
  if (!existing || existing.jobId !== req.params.jobId) return res.status(404).json({ error: 'Contact not found' });
  const { name, role, phone, email, notes } = req.body ?? {};
  const contact = await prisma.jobContact.update({
    where: { id: existing.id },
    data: {
      ...(name !== undefined ? { name } : {}),
      ...(role !== undefined ? { role: role || null } : {}),
      ...(phone !== undefined ? { phone: phone || null } : {}),
      ...(email !== undefined ? { email: email || null } : {}),
      ...(notes !== undefined ? { notes: notes || null } : {}),
    },
  });
  res.json(contact);
});

jobContactsRouter.delete('/:jobId/contacts/:id', requireRole('ADMIN'), async (req, res) => {
  const existing = await prisma.jobContact.findUnique({ where: { id: req.params.id } });
  if (!existing || existing.jobId !== req.params.jobId) return res.status(404).json({ error: 'Contact not found' });
  await prisma.jobContact.delete({ where: { id: existing.id } });
  await logActivity('job_contact.delete', existing.name, req.params.jobId, req.user?.id);
  res.status(204).end();
});
