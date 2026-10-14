import { prisma } from '../db';

/** Company-wide prep-bay settings (Settings > Prep bays). */
export interface PrepConfig {
  /** Characters a hardware scanner is set to send before each code, so a scan can never be
   * mistaken for typing. Empty means none (scans are then told apart by typing speed). */
  scannerPrefix: string;
  /** The key the scanner sends after each code. */
  scannerSuffix: 'Enter' | 'Tab';
  /** A crew member signed in on a bay screen is signed out after this many idle minutes. */
  operatorIdleMinutes: number;
  /** Beep on scans (the screen still flashes with sound off). */
  sound: boolean;
  /**
   * Current RMS write-back: OFF sends nothing, DRY_RUN records what would be sent in the
   * activity log, LIVE marks scanned kit prepared and books it out when transport arrives.
   */
  rmsWriteBack: 'OFF' | 'DRY_RUN' | 'LIVE';
}

export const DEFAULT_PREP_CONFIG: PrepConfig = {
  scannerPrefix: '',
  scannerSuffix: 'Enter',
  operatorIdleMinutes: 20,
  sound: true,
  rmsWriteBack: 'OFF',
};

const KEY = 'prepConfig';

export async function getPrepConfig(): Promise<PrepConfig> {
  const row = await prisma.appSetting.findUnique({ where: { key: KEY } });
  if (!row) return { ...DEFAULT_PREP_CONFIG };
  try {
    return { ...DEFAULT_PREP_CONFIG, ...JSON.parse(row.valueJson) };
  } catch {
    return { ...DEFAULT_PREP_CONFIG };
  }
}

/** Validates and saves a partial update, returning the stored result or an error message. */
export async function savePrepConfig(patch: Record<string, unknown>): Promise<PrepConfig | string> {
  const next = await getPrepConfig();
  if (patch.scannerPrefix !== undefined) {
    if (typeof patch.scannerPrefix !== 'string' || patch.scannerPrefix.length > 4) return 'scannerPrefix must be up to 4 characters';
    next.scannerPrefix = patch.scannerPrefix;
  }
  if (patch.scannerSuffix !== undefined) {
    if (patch.scannerSuffix !== 'Enter' && patch.scannerSuffix !== 'Tab') return 'scannerSuffix must be Enter or Tab';
    next.scannerSuffix = patch.scannerSuffix;
  }
  if (patch.operatorIdleMinutes !== undefined) {
    const n = Number(patch.operatorIdleMinutes);
    if (!Number.isInteger(n) || n < 1 || n > 720) return 'operatorIdleMinutes must be a whole number from 1 to 720';
    next.operatorIdleMinutes = n;
  }
  if (patch.sound !== undefined) {
    if (typeof patch.sound !== 'boolean') return 'sound must be true or false';
    next.sound = patch.sound;
  }
  if (patch.rmsWriteBack !== undefined) {
    if (!['OFF', 'DRY_RUN', 'LIVE'].includes(patch.rmsWriteBack as string)) return 'rmsWriteBack must be OFF, DRY_RUN or LIVE';
    next.rmsWriteBack = patch.rmsWriteBack as PrepConfig['rmsWriteBack'];
  }
  const valueJson = JSON.stringify(next);
  await prisma.appSetting.upsert({ where: { key: KEY }, create: { key: KEY, valueJson }, update: { valueJson } });
  return next;
}
