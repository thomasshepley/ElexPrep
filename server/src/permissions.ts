import { NextFunction, Request, Response } from 'express';
import { prisma } from './db';
import { AuthedUser, Role } from './auth';

/**
 * Granular capabilities an admin can delegate to the USER role, beyond its fixed baseline.
 * ADMIN implicitly has every permission; SIGNAGE has none (it's hardcoded read-only elsewhere).
 * All default to false: introducing this system must not silently change existing behavior —
 * every one of these previously required ADMIN outright, so an admin has to opt in to delegate.
 */
export const PERMISSION_KEYS = [
  'createJobs',
  'deleteJobs',
  'publishJobs',
  'viewActivityLog',
  'linkCurrentRms',
  'manageCrewAssignments',
] as const;

export type PermissionKey = (typeof PERMISSION_KEYS)[number];
export type RolePermissions = Record<PermissionKey, boolean>;

export const PERMISSION_LABELS: Record<PermissionKey, string> = {
  createJobs: 'Create new jobs',
  deleteJobs: 'Delete jobs',
  publishJobs: "Publish/unpublish jobs (toggle a job's public visibility)",
  viewActivityLog: 'View the activity log',
  linkCurrentRms: 'Link or unlink a job to a Current RMS opportunity',
  manageCrewAssignments: 'Attribute crew members to a job (add/remove/edit their role on it)',
};

export const DEFAULT_PERMISSIONS: RolePermissions = {
  createJobs: false,
  deleteJobs: false,
  publishJobs: false,
  viewActivityLog: false,
  linkCurrentRms: false,
  manageCrewAssignments: false,
};

const SETTING_KEY = 'rolePermissions';

export async function loadRolePermissions(): Promise<RolePermissions> {
  const row = await prisma.appSetting.findUnique({ where: { key: SETTING_KEY } });
  const stored = row ? (JSON.parse(row.valueJson) as Partial<RolePermissions>) : {};
  return { ...DEFAULT_PERMISSIONS, ...stored };
}

export async function saveRolePermissions(patch: Partial<RolePermissions>): Promise<RolePermissions> {
  const merged = { ...(await loadRolePermissions()), ...patch };
  await prisma.appSetting.upsert({
    where: { key: SETTING_KEY },
    create: { key: SETTING_KEY, valueJson: JSON.stringify(merged) },
    update: { valueJson: JSON.stringify(merged) },
  });
  return merged;
}

/** What a signed-in user's permissions resolve to for the "who am I" response. */
export async function resolvePermissionsForRole(role: Role): Promise<RolePermissions> {
  if (role === 'ADMIN') {
    return Object.fromEntries(PERMISSION_KEYS.map((k) => [k, true])) as RolePermissions;
  }
  if (role === 'SIGNAGE') {
    return Object.fromEntries(PERMISSION_KEYS.map((k) => [k, false])) as RolePermissions;
  }
  return loadRolePermissions();
}

export async function authedUserWithPermissions(user: AuthedUser) {
  return { ...user, permissions: await resolvePermissionsForRole(user.role) };
}

/**
 * Route guard for a delegatable capability: ADMIN always passes, SIGNAGE never does, USER
 * passes only if an admin has toggled the corresponding permission on.
 */
export function requirePermission(key: PermissionKey) {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) return res.status(401).json({ error: 'Not signed in' });
    if (req.user.role === 'ADMIN') return next();
    if (req.user.role !== 'USER') return res.status(403).json({ error: 'Insufficient permissions' });
    const perms = await loadRolePermissions();
    if (!perms[key]) return res.status(403).json({ error: 'Insufficient permissions' });
    next();
  };
}
