import { prisma } from './db';

const SETTING_KEY = 'maintenanceMode';

/**
 * An emergency full-stop switch, set by the admin CLI's `lockdown`/`unlock` commands (see
 * cli.ts). While enabled, every account except ADMIN is locked out - both continuing to use
 * an existing session (checked in auth.ts's authMiddleware) and logging in fresh (checked in
 * routes/auth.ts's /login) - so a suspected compromise or an in-progress incident can be shut
 * down to "only admins can touch anything" in one command, without having to individually
 * reason about every role/permission combination in the moment.
 */
export async function isMaintenanceModeEnabled(): Promise<boolean> {
  const row = await prisma.appSetting.findUnique({ where: { key: SETTING_KEY } });
  if (!row) return false;
  try {
    return JSON.parse(row.valueJson).enabled === true;
  } catch {
    return false;
  }
}

export async function setMaintenanceMode(enabled: boolean): Promise<void> {
  await prisma.appSetting.upsert({
    where: { key: SETTING_KEY },
    create: { key: SETTING_KEY, valueJson: JSON.stringify({ enabled, changedAt: new Date().toISOString() }) },
    update: { valueJson: JSON.stringify({ enabled, changedAt: new Date().toISOString() }) },
  });
}
