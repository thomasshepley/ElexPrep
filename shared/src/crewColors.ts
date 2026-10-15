/**
 * A small, visually distinct categorical palette for per-crew-member swatches on the schedule
 * calendar - a different concern from locationColors.ts (which tags stage areas, not people),
 * so it gets its own small palette rather than reusing that one.
 */
export const CREW_COLOR_PALETTE = [
  '#E53935',
  '#8E24AA',
  '#3949AB',
  '#1E88E5',
  '#00897B',
  '#43A047',
  '#F9A825',
  '#EF6C00',
  '#6D4C41',
  '#546E7A',
  '#D81B60',
  '#00ACC1',
];

/** Stable per-person color when no admin override is set, derived from the crew profile's id so
 * it's consistent across sessions/renders without needing a database write - every crew member
 * gets a distinct swatch with zero setup. */
export function defaultCrewColor(crewProfileId: string): string {
  let hash = 0;
  for (let i = 0; i < crewProfileId.length; i++) {
    hash = (hash * 31 + crewProfileId.charCodeAt(i)) >>> 0;
  }
  return CREW_COLOR_PALETTE[hash % CREW_COLOR_PALETTE.length];
}

/** The color actually used for a crew member's swatch: their admin-set override if it's a valid
 * hex color, otherwise the stable default derived from their id. */
export function resolveCrewColor(crewProfileId: string, color: string | null | undefined): string {
  return color && /^#[0-9a-fA-F]{6}$/.test(color) ? color : defaultCrewColor(crewProfileId);
}
