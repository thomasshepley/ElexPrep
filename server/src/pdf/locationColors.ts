import { prisma } from '../db';

/** Used for any location with no matching rule — same look as the original fixed black bar. */
export const DEFAULT_LOCATION_COLOR = '#1a1a1a';

export const DEFAULT_LOCATION_COLOR_RULES: { location: string; color: string }[] = [
  { location: 'Floor', color: '#1FA34C' },
  { location: 'Downstage', color: '#D32F2F' },
  { location: 'Mid Stage', color: '#F57C00' },
  { location: 'Upstage', color: '#F5C400' },
  { location: 'SR Dimmers', color: '#7B1FA2' },
];

/** Seeds the five house-standard colors on first run only — never overwrites existing rules. */
export async function seedDefaultLocationColorsIfEmpty() {
  const count = await prisma.locationColorRule.count({ where: { jobId: null } });
  if (count > 0) return;
  await prisma.locationColorRule.createMany({
    data: DEFAULT_LOCATION_COLOR_RULES,
  });
}

export type LocationColorMap = Map<string, string>;

/**
 * Loads the global default color rules plus, when jobId is given, that job's own overrides
 * layered on top — so a job with unique location names (e.g. "Cube North", "Entrance Arch
 * Top") can define its own bar colors without touching the shared defaults, and can even
 * override a global location name (e.g. "Floor") for just that job.
 */
export async function loadLocationColorMap(jobId?: string | null): Promise<LocationColorMap> {
  const [globalRules, jobRules] = await Promise.all([
    prisma.locationColorRule.findMany({ where: { jobId: null } }),
    jobId ? prisma.locationColorRule.findMany({ where: { jobId } }) : Promise.resolve([]),
  ]);
  const map: LocationColorMap = new Map(globalRules.map((r) => [r.location.toLowerCase().trim(), r.color]));
  for (const r of jobRules) map.set(r.location.toLowerCase().trim(), r.color);
  return map;
}

export function resolveLocationColor(map: LocationColorMap, location: string | null | undefined): string {
  if (!location) return DEFAULT_LOCATION_COLOR;
  return map.get(location.toLowerCase().trim()) ?? DEFAULT_LOCATION_COLOR;
}

/** Simple relative-luminance check so text stays legible against any admin-picked color. */
export function contrastingTextIsWhite(hex: string): boolean {
  const clean = hex.replace('#', '');
  if (clean.length !== 6) return true;
  const r = parseInt(clean.slice(0, 2), 16) / 255;
  const g = parseInt(clean.slice(2, 4), 16) / 255;
  const b = parseInt(clean.slice(4, 6), 16) / 255;
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return luminance < 0.55;
}

export function hexToRgbFractions(hex: string): { r: number; g: number; b: number } {
  const clean = hex.replace('#', '');
  const valid = /^[0-9a-fA-F]{6}$/.test(clean) ? clean : '1a1a1a';
  return {
    r: parseInt(valid.slice(0, 2), 16) / 255,
    g: parseInt(valid.slice(2, 4), 16) / 255,
    b: parseInt(valid.slice(4, 6), 16) / 255,
  };
}
