import { Router } from 'express';
import { prisma, logActivity } from '../db';
import { requireRole } from '../auth';
import { setDevelopmentLockdown, setFullLockdown } from '../lockdownMode';

/** Webmaster-only toggles for the two lockdown tiers (see lockdownMode.ts). Each revokes the
 * sessions it's about to lock out so the effect is immediate, not just blocking future logins. */
export const lockdownRouter = Router();

lockdownRouter.use(requireRole('WEBMASTER'));

lockdownRouter.post('/development', async (req, res) => {
  const { enabled } = req.body ?? {};
  if (typeof enabled !== 'boolean') return res.status(400).json({ error: 'enabled must be a boolean' });
  await setDevelopmentLockdown(enabled);
  if (enabled) {
    await prisma.session.deleteMany({ where: { user: { role: { notIn: ['ADMIN', 'WEBMASTER'] } } } });
  }
  await logActivity(enabled ? 'lockdown.development_enabled' : 'lockdown.development_disabled', undefined, undefined, req.user!.id);
  res.status(204).end();
});

lockdownRouter.post('/full', async (req, res) => {
  const { enabled } = req.body ?? {};
  if (typeof enabled !== 'boolean') return res.status(400).json({ error: 'enabled must be a boolean' });
  await setFullLockdown(enabled);
  if (enabled) {
    await prisma.session.deleteMany({ where: { user: { role: { not: 'WEBMASTER' } } } });
  }
  await logActivity(enabled ? 'lockdown.full_enabled' : 'lockdown.full_disabled', undefined, undefined, req.user!.id);
  res.status(204).end();
});
