import { Router } from 'express';
import { requireRole } from '../auth';
import { logActivity, prisma } from '../db';
import {
  PERMISSION_KEYS,
  PERMISSION_LABELS,
  loadRolePermissions,
  saveRolePermissions,
  loadUserPermissionOverride,
  saveUserPermissionOverride,
  resolvePermissionsForUser,
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

// Per-user overrides on top of the role baseline above - lets one USER account have different
// capabilities from another, rather than every USER sharing one identical policy.
permissionsRouter.get('/users/:id', async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.params.id } });
  if (!user) return res.status(404).json({ error: 'User not found' });
  const [permissions, override] = await Promise.all([
    resolvePermissionsForUser(user.id, user.role as 'ADMIN' | 'USER' | 'SIGNAGE' | 'CREW'),
    loadUserPermissionOverride(user.id),
  ]);
  res.json({ permissions, override, keys: PERMISSION_KEYS, labels: PERMISSION_LABELS });
});

permissionsRouter.put('/users/:id', async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.params.id } });
  if (!user) return res.status(404).json({ error: 'User not found' });
  if (user.role !== 'USER') return res.status(400).json({ error: 'Only USER accounts can have permission overrides' });

  const { permissions } = req.body ?? {};
  let patch: Partial<Record<PermissionKey, boolean>> | null = null;
  if (permissions !== null) {
    if (!permissions || typeof permissions !== 'object') {
      return res.status(400).json({ error: 'permissions object or null is required' });
    }
    patch = {};
    for (const key of PERMISSION_KEYS) {
      if (key in permissions) patch[key] = Boolean(permissions[key]);
    }
  }
  const merged = await saveUserPermissionOverride(user.id, patch);
  await logActivity('permissions.userOverride', `${user.username}: ${patch ? JSON.stringify(patch) : 'cleared'}`, undefined, req.user?.id);
  res.json({ permissions: merged });
});
