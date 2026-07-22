import { prisma } from '../db';

/** Used for any location with no matching rule — same look as the original fixed black bar. */
export const DEFAULT_LOCATION_COLOR = '#1a1a1a';

export type LocationColorPattern = 'SOLID' | 'DIAGONAL_STRIPES';

export const DEFAULT_LOCATION_COLOR_RULES: {
  location: string;
  color: string;
  pattern?: LocationColorPattern;
  secondaryColor?: string;
}[] = [
  { location: 'Floor', color: '#1FA34C' },
  { location: 'Downstage', color: '#D32F2F' },
  { location: 'Mid Stage', color: '#F57C00' },
  { location: 'Upstage', color: '#F5C400' },
  { location: 'SR Dimmers', color: '#7B1FA2' },
  // Hazard-stripe conventions: red/white for spares, yellow/black for rigging.
  { location: 'Spare', color: '#D32F2F', pattern: 'DIAGONAL_STRIPES', secondaryColor: '#FFFFFF' },
  { location: 'Rigging', color: '#F5C400', pattern: 'DIAGONAL_STRIPES', secondaryColor: '#1a1a1a' },
];

/** Seeds the house-standard colors on first run only — never overwrites existing rules. */
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
 * This tops up just those specific, newly-introduced defaults if missing — never touches or
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

export interface ResolvedLocationColor {
  color: string;
  pattern: LocationColorPattern;
  secondaryColor?: string | null;
}

const FALLBACK_COLOR: ResolvedLocationColor = { color: DEFAULT_LOCATION_COLOR, pattern: 'SOLID' };

export type LocationColorMap = Map<string, ResolvedLocationColor>;

interface LocationColorRuleLike {
  location: string;
  color: string;
  pattern: string;
  secondaryColor: string | null;
}

function toMapEntry(r: LocationColorRuleLike): [string, ResolvedLocationColor] {
  return [
    r.location.toLowerCase().trim(),
    {
      color: r.color,
      pattern: r.pattern === 'DIAGONAL_STRIPES' ? 'DIAGONAL_STRIPES' : 'SOLID',
      secondaryColor: r.secondaryColor,
    },
  ];
}

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
  const map: LocationColorMap = new Map(globalRules.map(toMapEntry));
  for (const r of jobRules) {
    const [key, value] = toMapEntry(r);
    map.set(key, value);
  }
  return map;
}

export function resolveLocationColor(map: LocationColorMap, location: string | null | undefined): ResolvedLocationColor {
  if (!location) return FALLBACK_COLOR;
  return map.get(location.toLowerCase().trim()) ?? FALLBACK_COLOR;
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
