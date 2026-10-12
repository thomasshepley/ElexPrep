/**
 * Pure location-color resolution logic, shared by the server's PDF renderer today and
 * usable by a future web-side print-queue preview without pulling in Prisma. The
 * Prisma-backed loading/seeding functions (loadLocationColorMap, seedDefaultLocationColorsIfEmpty,
 * seedNewDefaultLocationColorsIfMissing) stay server-only - see server/src/pdf/locationColors.ts.
 */

/** Used for any location with no matching rule - same look as the original fixed black bar. */
export const DEFAULT_LOCATION_COLOR = '#1a1a1a';

export type LocationColorPattern = 'SOLID' | 'DIAGONAL_STRIPES' | 'RAINBOW';

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
  // For items whose location isn't any one place - e.g. a cable run spanning the whole venue -
  // a solid or striped bar would misleadingly suggest one specific spot. `color` here is unused
  // (RAINBOW always draws its own fixed color band) but kept non-empty since the column isn't
  // nullable.
  { location: 'Everywhere', color: '#1a1a1a', pattern: 'RAINBOW' },
];

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

/** Converts a DB-shaped color rule row into a lowercased-key map entry. */
export function toLocationColorMapEntry(r: LocationColorRuleLike): [string, ResolvedLocationColor] {
  return [
    r.location.toLowerCase().trim(),
    {
      color: r.color,
      pattern: r.pattern === 'DIAGONAL_STRIPES' ? 'DIAGONAL_STRIPES' : r.pattern === 'RAINBOW' ? 'RAINBOW' : 'SOLID',
      secondaryColor: r.secondaryColor,
    },
  ];
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
