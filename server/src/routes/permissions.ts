import { Router } from 'express';
import { requireRole } from '../auth';
import { logActivity } from '../db';
import {
  PERMISSION_KEYS,
  PERMISSION_LABELS,
  loadRolePermissions,
  saveRolePermissions,
  type PermissionKey,
} from '../permissions';

export const permissionsRouter = Router();

permissionsRouter.use(requireRole('ADMIN'));

permissionsRouter.get('/', async (_req, res) => {
  const permissions = await loadRolePermissions();
  res.json({ permissions, keys: PERMISSION_KEYS, labels: PERMISSION_LABELS });
});

permissionsRouter.put('/', async (req, res) => {
  const { permissions } = req.body ?? {};
  if (!permissions || typeof permissions !== 'object') {
    return res.status(400).json({ error: 'permissions object is required' });
  }
  const patch: Partial<Record<PermissionKey, boolean>> = {};
  for (const key of PERMISSION_KEYS) {
    if (key in permissions) patch[key] = Boolean(permissions[key]);
  }
  const merged = await saveRolePermissions(patch);
  await logActivity('permissions.update', JSON.stringify(patch), undefined, req.user?.id);
  res.json({ permissions: merged });
});
