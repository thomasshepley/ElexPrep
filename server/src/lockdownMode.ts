import { prisma } from './db';

// Kept as the original setting key name ("maintenanceMode") for backward compatibility with
// already-deployed instances that have this row set - only the exported function names and
// the fact that there's now a second, stricter tier alongside it are new.
const DEVELOPMENT_LOCKDOWN_KEY = 'maintenanceMode';
const FULL_LOCKDOWN_KEY = 'fullLockdownMode';

async function readFlag(key: string): Promise<boolean> {
  const row = await prisma.appSetting.findUnique({ where: { key } });
  if (!row) return false;
  try {
    return JSON.parse(row.valueJson).enabled === true;
  } catch {
    return false;
  }
}

async function writeFlag(key: string, enabled: boolean): Promise<void> {
  await prisma.appSetting.upsert({
    where: { key },
    create: { key, valueJson: JSON.stringify({ enabled, changedAt: new Date().toISOString() }) },
    update: { valueJson: JSON.stringify({ enabled, changedAt: new Date().toISOString() }) },
  });
}

/**
 * Two independently-toggleable lockdown tiers, both controlled only by WEBMASTER (see the
 * Webmaster page's site-controls section and the admin CLI's lockdown/unlock and
 * full-lockdown/full-unlock commands) and checked in both authMiddleware (continuing
 * sessions) and routes/auth.ts (fresh logins):
 *
 * - Development lockdown: everyone except ADMIN/WEBMASTER is locked out - the original
 *   "emergency full-stop" behavior (DEPLOY.md's `lockdown`/`unlock`), for planned maintenance
 *   or an incident where admins still need to keep working.
 * - Full lockdown: everyone except WEBMASTER is locked out, ADMIN included - a stricter tier
 *   for when even admin accounts shouldn't be trusted, or the site needs to go fully dark
 *   except for the one account that can always get back in.
 */
export async function isDevelopmentLockdownEnabled(): Promise<boolean> {
  return readFlag(DEVELOPMENT_LOCKDOWN_KEY);
}

export async function setDevelopmentLockdown(enabled: boolean): Promise<void> {
  return writeFlag(DEVELOPMENT_LOCKDOWN_KEY, enabled);
}

export async function isFullLockdownEnabled(): Promise<boolean> {
  return readFlag(FULL_LOCKDOWN_KEY);
}

export async function setFullLockdown(enabled: boolean): Promise<void> {
  return writeFlag(FULL_LOCKDOWN_KEY, enabled);
}
