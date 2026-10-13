import type { Role } from '../api/client';

/** Mirrors server/src/auth.ts's isAdminRole - treats WEBMASTER as ADMIN-equivalent for any
 * check that's really about "elevated staff access" rather than literally the ADMIN role. */
export function isAdminRole(role: Role | null | undefined): boolean {
  return role === 'ADMIN' || role === 'WEBMASTER';
}
