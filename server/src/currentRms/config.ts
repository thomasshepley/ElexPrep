import { prisma } from '../db';

export interface CurrentRmsConfig {
  enabled: boolean;
  subdomain: string;
  apiKey: string;
  pollMinutes: number;
  lastSyncedAt: string | null;
  lastSyncError: string | null;
}

export const DEFAULT_CURRENT_RMS_CONFIG: CurrentRmsConfig = {
  enabled: false,
  subdomain: '',
  apiKey: '',
  pollMinutes: 15,
  lastSyncedAt: null,
  lastSyncError: null,
};

const SETTING_KEY = 'currentRmsConfig';

export async function getCurrentRmsConfig(): Promise<CurrentRmsConfig> {
  const row = await prisma.appSetting.findUnique({ where: { key: SETTING_KEY } });
  if (!row) return { ...DEFAULT_CURRENT_RMS_CONFIG };
  return { ...DEFAULT_CURRENT_RMS_CONFIG, ...JSON.parse(row.valueJson) };
}

export async function saveCurrentRmsConfig(config: CurrentRmsConfig): Promise<void> {
  await prisma.appSetting.upsert({
    where: { key: SETTING_KEY },
    create: { key: SETTING_KEY, valueJson: JSON.stringify(config) },
    update: { valueJson: JSON.stringify(config) },
  });
}

/** Public-facing config shape - never echoes the API key back to the browser. */
export function toPublicConfig(config: CurrentRmsConfig) {
  const { apiKey, ...rest } = config;
  return { ...rest, hasApiKey: apiKey.length > 0 };
}
