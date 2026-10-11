import { prisma } from '../db';

/**
 * Scaffold for the Microsoft Graph / OneDrive integration — mirrors currentRms/config.ts's
 * shape and storage pattern. Real Azure app-registration credentials (a client-credentials
 * flow app registered against the company's Microsoft 365 tenant, with
 * Files.Read.All/Sites.Read.All application permissions granted) haven't been supplied yet,
 * so `enabled` stays false and every call into client.ts fails with a clear
 * OneDriveNotConfiguredError until they are. Everything downstream (matching, browsing,
 * sharing, CAD auto-detection) is written against the real Graph API shape so flipping this on
 * with real credentials is the only step left — no further code changes.
 */
export interface OneDriveConfig {
  enabled: boolean;
  tenantId: string;
  clientId: string;
  clientSecret: string;
  /** The library root everything is matched under, e.g. "Projects" -> Projects/<year>/<job>. */
  rootFolderPath: string;
  /** The OneDrive/SharePoint drive to browse — a user's OneDrive id, or a SharePoint site's
   * document library drive id. Left blank until configured. */
  driveId: string;
  lastTestError: string | null;
}

export const DEFAULT_ONE_DRIVE_CONFIG: OneDriveConfig = {
  enabled: false,
  tenantId: '',
  clientId: '',
  clientSecret: '',
  rootFolderPath: 'Projects',
  driveId: '',
  lastTestError: null,
};

const SETTING_KEY = 'oneDriveConfig';

export async function getOneDriveConfig(): Promise<OneDriveConfig> {
  const row = await prisma.appSetting.findUnique({ where: { key: SETTING_KEY } });
  if (!row) return { ...DEFAULT_ONE_DRIVE_CONFIG };
  return { ...DEFAULT_ONE_DRIVE_CONFIG, ...JSON.parse(row.valueJson) };
}

export async function saveOneDriveConfig(config: OneDriveConfig): Promise<void> {
  await prisma.appSetting.upsert({
    where: { key: SETTING_KEY },
    create: { key: SETTING_KEY, valueJson: JSON.stringify(config) },
    update: { valueJson: JSON.stringify(config) },
  });
}

/** Public-facing config shape — never echoes the client secret back to the browser. */
export function toPublicOneDriveConfig(config: OneDriveConfig) {
  const { clientSecret, ...rest } = config;
  return { ...rest, hasClientSecret: clientSecret.length > 0 };
}
