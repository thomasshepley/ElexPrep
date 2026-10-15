import { prisma } from '../db';
import { encryptSecret, decryptSecret } from '../secretCrypto';

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
  const stored = JSON.parse(row.valueJson);
  return { ...DEFAULT_CURRENT_RMS_CONFIG, ...stored, apiKey: decryptSecret(stored.apiKey ?? '') };
}

export async function saveCurrentRmsConfig(config: CurrentRmsConfig): Promise<void> {
  const stored = { ...config, apiKey: encryptSecret(config.apiKey) };
  await prisma.appSetting.upsert({
    where: { key: SETTING_KEY },
    create: { key: SETTING_KEY, valueJson: JSON.stringify(stored) },
    update: { valueJson: JSON.stringify(stored) },
  });
}

/** Public-facing config shape - never echoes the API key back to the browser. */
export function toPublicConfig(config: CurrentRmsConfig) {
  const { apiKey, ...rest } = config;
  return { ...rest, hasApiKey: apiKey.length > 0 };
}
