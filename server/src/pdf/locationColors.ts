import { prisma } from '../db';
import { DEFAULT_LOCATION_COLOR_RULES, LocationColorMap, toLocationColorMapEntry } from '@elexprep/shared';

export {
  DEFAULT_LOCATION_COLOR,
  DEFAULT_LOCATION_COLOR_RULES,
  LocationColorPattern,
  ResolvedLocationColor,
  LocationColorMap,
  RAINBOW_BAND_COLORS,
  resolveLocationColor,
  contrastingTextIsWhite,
  hexToRgbFractions,
} from '@elexprep/shared';

/** Seeds the house-standard colors on first run only - never overwrites existing rules. */
export async function seedDefaultLocationColorsIfEmpty() {
  const count = await prisma.locationColorRule.count({ where: { jobId: null } });
  if (count > 0) return;
  await prisma.locationColorRule.createMany({
    data: DEFAULT_LOCATION_COLOR_RULES,
  });
}

/**
 * The count-based seed above only ever fires on a totally empty table, so installs that were
 * seeded before Spare/Rigging existed in DEFAULT_LOCATION_COLOR_RULES would never pick them up.
 * This tops up just those specific, newly-introduced defaults if missing - never touches or
 * overwrites any rule (default or user-added) that already exists.
 */
export async function seedNewDefaultLocationColorsIfMissing(locations: string[]) {
  const existing = await prisma.locationColorRule.findMany({ where: { jobId: null }, select: { location: true } });
  const have = new Set(existing.map((r) => r.location.toLowerCase().trim()));
  const missing = DEFAULT_LOCATION_COLOR_RULES.filter(
    (r) => locations.includes(r.location) && !have.has(r.location.toLowerCase().trim())
  );
  if (missing.length > 0) await prisma.locationColorRule.createMany({ data: missing });
}

/**
 * Loads the global default color rules plus, when jobId is given, that job's own overrides
 * layered on top - so a job with unique location names (e.g. "Cube North", "Entrance Arch
 * Top") can define its own bar colors without touching the shared defaults, and can even
 * override a global location name (e.g. "Floor") for just that job.
 */
export async function loadLocationColorMap(jobId?: string | null): Promise<LocationColorMap> {
  const [globalRules, jobRules] = await Promise.all([
    prisma.locationColorRule.findMany({ where: { jobId: null } }),
    jobId ? prisma.locationColorRule.findMany({ where: { jobId } }) : Promise.resolve([]),
  ]);
  const map: LocationColorMap = new Map(globalRules.map(toLocationColorMapEntry));
  for (const r of jobRules) {
    const [key, value] = toLocationColorMapEntry(r);
    map.set(key, value);
  }
  return map;
}
