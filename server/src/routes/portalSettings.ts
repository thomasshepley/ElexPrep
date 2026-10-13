import { NextFunction, Request, Response, Router } from 'express';
import { isAdminRole, requireRole } from '../auth';
import { resolvePermissionsForUser } from '../permissions';
import { logActivity } from '../db';
import { loadDefaultCrewFeatures, saveDefaultCrewFeatures, normalizeCrewFeaturesPatch } from '../crewFeatures';

/** Company-wide crew-portal defaults (Settings -> Crew Portal). Reading them is harmless (no
 * secrets) and needed by anyone who can onboard a job or edit a job's crew features, so GET is
 * delegatable to either of those capabilities; only changing the baseline itself stays
 * ADMIN-only. */
async function canReadDefaults(req: Request, res: Response, next: NextFunction) {
  if (!req.user) return res.status(401).json({ error: 'Not signed in' });
  if (isAdminRole(req.user.role)) return next();
  if (req.user.role !== 'USER') return res.status(403).json({ error: 'Insufficient permissions' });
  const perms = await resolvePermissionsForUser(req.user.id, req.user.role);
  if (!perms.onboardJobs && !perms.manageCrewAssignments) return res.status(403).json({ error: 'Insufficient permissions' });
  next();
}

export const portalSettingsRouter = Router();

portalSettingsRouter.get('/crew-features-default', canReadDefaults, async (_req, res) => {
  res.json(await loadDefaultCrewFeatures());
});

portalSettingsRouter.put('/crew-features-default', requireRole('ADMIN'), async (req, res) => {
  const patch = normalizeCrewFeaturesPatch(req.body);
  const updated = await saveDefaultCrewFeatures(patch);
  await logActivity('portal_settings.crew_features_default', JSON.stringify(patch), undefined, req.user?.id);
  res.json(updated);
});
