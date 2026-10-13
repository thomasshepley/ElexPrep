import { prisma } from './db';

/**
 * Which Current RMS charge lines count towards a job's crew margin. Service lines that aren't
 * labour (delivery, collection) would otherwise inflate "charged for crew". A portal-wide list
 * of line names is always left out (seeded with the Mainland UK delivery and collection lines);
 * a job can leave out any other line, or put back one the list would drop.
 */
const SETTING_KEY = 'crewMarginExcludedLineNames';
export const DEFAULT_EXCLUDED_LINE_NAMES = ['Delivery (Mainland UK)', 'Collection (Mainland UK)'];

export function lineNameKey(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}

export async function loadExcludedLineNames(): Promise<string[]> {
  const setting = await prisma.appSetting.findUnique({ where: { key: SETTING_KEY } });
  if (!setting) return DEFAULT_EXCLUDED_LINE_NAMES;
  try {
    const names = JSON.parse(setting.valueJson) as unknown;
    return Array.isArray(names) ? names.filter((n): n is string => typeof n === 'string') : DEFAULT_EXCLUDED_LINE_NAMES;
  } catch {
    return DEFAULT_EXCLUDED_LINE_NAMES;
  }
}

export async function saveExcludedLineNames(names: string[]): Promise<string[]> {
  const seen = new Set<string>();
  const clean = names
    .map((n) => n.trim())
    .filter((n) => n && n.length <= 200 && !seen.has(lineNameKey(n)) && seen.add(lineNameKey(n)))
    .slice(0, 100);
  await prisma.appSetting.upsert({
    where: { key: SETTING_KEY },
    create: { key: SETTING_KEY, valueJson: JSON.stringify(clean) },
    update: { valueJson: JSON.stringify(clean) },
  });
  return clean;
}

export type LineExclusion = 'job' | 'portal' | null;

/** Why a line is left out: the job said so, the portal list says so, or (null) it counts. */
export function lineExclusion(
  lineKey: string,
  name: string,
  overrides: Map<string, boolean>,
  excludedNames: Set<string>
): { excluded: boolean; by: LineExclusion; onPortalList: boolean } {
  const onPortalList = excludedNames.has(lineNameKey(name));
  const override = overrides.get(lineKey);
  if (override === true) return { excluded: true, by: 'job', onPortalList };
  if (override === false) return { excluded: false, by: null, onPortalList };
  return onPortalList ? { excluded: true, by: 'portal', onPortalList } : { excluded: false, by: null, onPortalList };
}
