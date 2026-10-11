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
  'deleteJobs',
  'publishJobs',
  'viewActivityLog',
  'linkCurrentRms',
  'onboardJobs',
  'manageOneDrive',
  'manageCrewAssignments',
  'manageCrewApplications',
  'moderateDiscussion',
] as const;

export type PermissionKey = (typeof PERMISSION_KEYS)[number];
export type RolePermissions = Record<PermissionKey, boolean>;

export const PERMISSION_LABELS: Record<PermissionKey, string> = {
  deleteJobs: 'Delete jobs',
  publishJobs: "Publish/unpublish jobs (toggle a job's public visibility)",
  viewActivityLog: 'View the activity log',
  linkCurrentRms: 'Link or unlink a job to a Current RMS opportunity',
  onboardJobs: 'Onboard a Current RMS Quote/Order into a portal job (the only way jobs are created)',
  manageOneDrive: "Link a job's OneDrive folder and choose which files/folders crew can see",
  manageCrewAssignments: 'Attribute crew members to a job (add/remove/edit their role on it)',
  manageCrewApplications: 'Review freelance crew applications (approve/reject, view compliance documents)',
  moderateDiscussion: "Delete other people's messages in a job's discussion thread",
};

export const DEFAULT_PERMISSIONS: RolePermissions = {
  deleteJobs: false,
  publishJobs: false,
  viewActivityLog: false,
  linkCurrentRms: false,
  onboardJobs: false,
  manageOneDrive: false,
  manageCrewAssignments: false,
  manageCrewApplications: false,
  moderateDiscussion: false,
};

const SETTING_KEY = 'rolePermissions';

/** The shared baseline every USER account starts from (see settings/Permissions page). */
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

/** A specific USER account's override on top of the role baseline — null means none set (every
 * key falls back to loadRolePermissions()). Lets one USER have different capabilities from
 * another, rather than every USER account sharing one identical policy. */
export async function loadUserPermissionOverride(userId: string): Promise<Partial<RolePermissions> | null> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { permissionsJson: true } });
  if (!user?.permissionsJson) return null;
  try {
    return JSON.parse(user.permissionsJson) as Partial<RolePermissions>;
  } catch {
    return null;
  }
}

/** patch === null clears the override entirely (the user reverts to the plain role baseline);
 * otherwise it's merged onto whatever override already existed, same merge-patch shape
 * saveRolePermissions uses for the role baseline itself. */
export async function saveUserPermissionOverride(userId: string, patch: Partial<RolePermissions> | null): Promise<RolePermissions> {
  if (patch === null) {
    await prisma.user.update({ where: { id: userId }, data: { permissionsJson: null } });
  } else {
    const existing = (await loadUserPermissionOverride(userId)) ?? {};
    await prisma.user.update({ where: { id: userId }, data: { permissionsJson: JSON.stringify({ ...existing, ...patch }) } });
  }
  return resolvePermissionsForUser(userId, 'USER');
}

/** What a given account's permissions actually resolve to: ADMIN is always everything, SIGNAGE
 * is always nothing, USER is the role baseline with that specific account's override (if any)
 * merged on top. */
export async function resolvePermissionsForUser(userId: string, role: Role): Promise<RolePermissions> {
  if (role === 'ADMIN') {
    return Object.fromEntries(PERMISSION_KEYS.map((k) => [k, true])) as RolePermissions;
  }
  if (role === 'SIGNAGE') {
    return Object.fromEntries(PERMISSION_KEYS.map((k) => [k, false])) as RolePermissions;
  }
  const base = await loadRolePermissions();
  const override = await loadUserPermissionOverride(userId);
  return override ? { ...base, ...override } : base;
}

export async function authedUserWithPermissions(user: AuthedUser) {
  return { ...user, permissions: await resolvePermissionsForUser(user.id, user.role) };
}

/**
 * Route guard for a delegatable capability: ADMIN always passes, SIGNAGE never does, USER
 * passes only if its effective permissions (role baseline + its own override) have this key on.
 */
export function requirePermission(key: PermissionKey) {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) return res.status(401).json({ error: 'Not signed in' });
    if (req.user.role === 'ADMIN') return next();
    if (req.user.role !== 'USER') return res.status(403).json({ error: 'Insufficient permissions' });
    const perms = await resolvePermissionsForUser(req.user.id, req.user.role);
    if (!perms[key]) return res.status(403).json({ error: 'Insufficient permissions' });
    next();
  };
}
