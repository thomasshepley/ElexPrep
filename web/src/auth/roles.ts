import type { AuthedUser, PermissionKey, Role } from '../api/client';

/** Mirrors server/src/auth.ts's isAdminRole - treats WEBMASTER as ADMIN-equivalent for any
 * check that's really about "elevated staff access" rather than literally the ADMIN role. */
export function isAdminRole(role: Role | null | undefined): boolean {
  return role === 'ADMIN' || role === 'WEBMASTER';
}

/** Mirrors server/src/permissions.ts's requirePermission: admins always, USER per its resolved
 * permissions, everyone else never. */
export function hasPermission(user: AuthedUser | null | undefined, key: PermissionKey): boolean {
  if (!user) return false;
  if (isAdminRole(user.role)) return true;
  return user.role === 'USER' && Boolean(user.permissions?.[key]);
}
