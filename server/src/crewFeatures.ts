import { prisma } from './db';
import { CREW_FEATURE_KEYS, DEFAULT_CREW_FEATURES, type CrewFeatures } from '@elexprep/shared';

const SETTING_KEY = 'crewPortalDefaults';

/** The company-wide baseline every job starts from, configurable in Settings. */
export async function loadDefaultCrewFeatures(): Promise<CrewFeatures> {
  const row = await prisma.appSetting.findUnique({ where: { key: SETTING_KEY } });
  if (!row) return { ...DEFAULT_CREW_FEATURES };
  const stored = JSON.parse(row.valueJson) as Partial<CrewFeatures>;
  return { ...DEFAULT_CREW_FEATURES, ...stored };
}

export async function saveDefaultCrewFeatures(patch: Partial<CrewFeatures>): Promise<CrewFeatures> {
  const merged = { ...(await loadDefaultCrewFeatures()), ...patch };
  await prisma.appSetting.upsert({
    where: { key: SETTING_KEY },
    create: { key: SETTING_KEY, valueJson: JSON.stringify(merged) },
    update: { valueJson: JSON.stringify(merged) },
  });
  return merged;
}

function parseOverride(crewFeaturesJson: string | null): Partial<CrewFeatures> | null {
  if (!crewFeaturesJson) return null;
  try {
    return JSON.parse(crewFeaturesJson) as Partial<CrewFeatures>;
  } catch {
    return null;
  }
}

/** A specific job's effective crew features: the global default with that job's own override
 * (if any) merged on top. */
export async function resolveCrewFeatures(job: { crewFeaturesJson: string | null }): Promise<CrewFeatures> {
  const base = await loadDefaultCrewFeatures();
  const override = parseOverride(job.crewFeaturesJson);
  return override ? { ...base, ...override } : base;
}

export function normalizeCrewFeaturesPatch(input: unknown): Partial<CrewFeatures> {
  if (!input || typeof input !== 'object') return {};
  const out: Partial<CrewFeatures> = {};
  for (const key of CREW_FEATURE_KEYS) {
    const value = (input as Record<string, unknown>)[key];
    if (typeof value === 'boolean') out[key] = value;
  }
  return out;
}
