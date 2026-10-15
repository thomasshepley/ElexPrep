import { Router } from 'express';
import { prisma, logActivity } from '../db';
import { requireRole } from '../auth';
import { requirePermission } from '../permissions';
import { roleKey } from '../crewRates';

/**
 * Day rates per role - the portal-wide defaults (Crew settings page, admin only) and each
 * job's own rates (the job's Crew tab, manageCrewAssignments). See crewRates.ts for where they
 * sit in the fallback order. A PUT with a blank rate removes that role's rate.
 */
export const globalRoleRatesRouter = Router();
export const jobRoleRatesRouter = Router();

function parse(body: unknown): { role: string; dayRate: string } | { error: string } {
  const { role, dayRate } = (body ?? {}) as { role?: unknown; dayRate?: unknown };
  if (typeof role !== 'string' || !role.trim()) return { error: 'role is required' };
  if (role.trim().length > 80) return { error: 'role is too long' };
  const cleaned = dayRate == null ? '' : String(dayRate).replace(/[£,\s]/g, '');
  if (cleaned && (!Number.isFinite(Number(cleaned)) || Number(cleaned) < 0)) return { error: 'dayRate must be a number' };
  return { role: role.trim().replace(/\s+/g, ' '), dayRate: cleaned };
}

async function setRate(jobId: string | null, role: string, dayRate: string) {
  const key = roleKey(role);
  // findFirst rather than upsert: SQLite treats NULL jobIds as distinct in the unique index.
  const existing = await prisma.roleRate.findFirst({ where: { jobId, roleKey: key } });
  if (!dayRate) {
    if (existing) await prisma.roleRate.delete({ where: { id: existing.id } });
    return null;
  }
  if (existing) return prisma.roleRate.update({ where: { id: existing.id }, data: { role, dayRate } });
  return prisma.roleRate.create({ data: { jobId, role, roleKey: key, dayRate } });
}

globalRoleRatesRouter.get('/', requireRole('ADMIN'), async (_req, res) => {
  res.json(await prisma.roleRate.findMany({ where: { jobId: null }, orderBy: { role: 'asc' } }));
});

globalRoleRatesRouter.put('/', requireRole('ADMIN'), async (req, res) => {
  const parsed = parse(req.body);
  if ('error' in parsed) return res.status(400).json(parsed);
  const row = await setRate(null, parsed.role, parsed.dayRate);
  await logActivity('role_rate.global', `${parsed.role}: ${parsed.dayRate || '(removed)'}`, undefined, req.user!.id);
  res.json(row);
});

jobRoleRatesRouter.get('/:jobId/role-rates', async (req, res) => {
  res.json(await prisma.roleRate.findMany({ where: { jobId: req.params.jobId }, orderBy: { role: 'asc' } }));
});

jobRoleRatesRouter.put('/:jobId/role-rates', requirePermission('manageCrewAssignments'), async (req, res) => {
  const parsed = parse(req.body);
  if ('error' in parsed) return res.status(400).json(parsed);
  const row = await setRate(req.params.jobId, parsed.role, parsed.dayRate);
  await logActivity('role_rate.job', `${parsed.role}: ${parsed.dayRate || '(removed)'}`, req.params.jobId, req.user!.id);
  res.json(row);
});
