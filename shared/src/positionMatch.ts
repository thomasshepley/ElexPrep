/**
 * Matching a patch's position names to the trusses a CAD plot names, which rarely agree word for
 * word: "US Truss", "Upstage" and "US" are one truss; "LX 1", "LX-1" and "LX1 Truss" are another.
 * Used by the cable calculator and the rigging calculator alike.
 */

const SYNONYMS: [RegExp, string][] = [
  [/\bup\s*stage\b/g, 'us'],
  [/\bdown\s*stage\b/g, 'ds'],
  [/\b(?:mid|centre|center)\s*stage\b/g, 'ms'],
  [/\bstage\s*left\b/g, 'sl'],
  [/\bstage\s*right\b/g, 'sr'],
  [/\bfront\s*of\s*house\b/g, 'foh'],
  [/\bfrt\b/g, 'front'],
  [/\b(?:centre|center|ctr)\b/g, 'centre'],
  [/\bmid\b/g, 'ms'],
];
/** Words that say what kind of thing it is, not which one. */
const NOISE = new Set(['truss', 'trusses', 'position', 'pos', 'bar', 'pipe', 'the', 'lighting', 'lx', 'rig', 'flown']);

/** A position name reduced to what identifies it: "Main: US Truss" and "upstage" both give "us". */
export function positionKey(name: string): string {
  let s = (name.split(':').pop() ?? name).toLowerCase();
  s = s.replace(/[_\-./()]+/g, ' ');
  for (const [re, to] of SYNONYMS) s = s.replace(re, to);
  // "lx 1" and "lx1" are the same; so are "truss 3" and "t3".
  s = s.replace(/\b([a-z]{1,4})\s+(\d+)\b/g, '$1$2');
  const tokens = s.split(/\s+/).filter(Boolean);
  const kept = tokens.filter((t) => !NOISE.has(t));
  // "LX1" alone keeps its letters; "LX US" drops the LX.
  return (kept.length ? kept : tokens).sort().join(' ');
}

export function positionsMatch(a: string, b: string) {
  return positionKey(a) === positionKey(b);
}

/**
 * Where a position sits front to back, when its name says: FOH, then DS, MS, US (and the like),
 * or its number (LX1 is downstage of LX2, as in UK theatres). Null when the name doesn't say.
 */
export function depthRank(name: string): { family: 'stage' | 'number'; rank: number } | null {
  const key = positionKey(name);
  const stage: Record<string, number> = { foh: 0, front: 1, ds: 1, ms: 2, centre: 2, us: 3, back: 4, rear: 4, upstage: 3 };
  if (key in stage) return { family: 'stage', rank: stage[key] };
  const m = key.match(/^(?:[a-z]{0,6})(\d{1,2})$/);
  return m ? { family: 'number', rank: Number(m[1]) } : null;
}

export interface PositionToPair {
  name: string;
  /** Linked by hand to this plot truss (wins over everything). */
  plotTruss?: string | null;
  /** Worth pairing automatically when it's the only one left (a truss with fixtures on it). */
  candidate: boolean;
}

/**
 * Which plot truss each patch position is: a hand-made link first, then a matching name, then,
 * when exactly one position and one plot truss are left over, those two together.
 */
export type PairHow = 'linked' | 'name' | 'only one left' | 'by depth';

/**
 * `depthOf` gives, for plot trusses the plot doesn't name, how far each is from the drawing's
 * origin front to back (|Y|). Plots put the origin at the downstage centre, so the nearest is the
 * most downstage: positions whose names give their order (DS, MS, US or LX1, LX2) are paired with
 * them in that order when the numbers agree.
 */
export function pairPositions(positions: PositionToPair[], plotTrusses: string[], depthOf: Record<string, number> = {}): Map<string, { truss: string; how: PairHow }> {
  const out = new Map<string, { truss: string; how: PairHow }>();
  const taken = new Set<string>();
  for (const p of positions) {
    if (p.plotTruss && plotTrusses.includes(p.plotTruss)) {
      out.set(p.name, { truss: p.plotTruss, how: 'linked' });
      taken.add(p.plotTruss);
    }
  }
  for (const p of positions) {
    if (out.has(p.name) || p.plotTruss === '') continue;
    const t = plotTrusses.find((x) => !taken.has(x) && positionsMatch(p.name, x));
    if (t) {
      out.set(p.name, { truss: t, how: 'name' });
      taken.add(t);
    }
  }
  const leftPositions = positions.filter((p) => !out.has(p.name) && p.candidate && p.plotTruss !== '');
  const leftTrusses = plotTrusses.filter((t) => !taken.has(t));
  if (leftPositions.length === 1 && leftTrusses.length === 1) {
    out.set(leftPositions[0].name, { truss: leftTrusses[0], how: 'only one left' });
    return out;
  }
  // Front to back, when every leftover position says where it is and every leftover truss is one
  // the plot doesn't name.
  const ranked = leftPositions.map((p) => ({ p, d: depthRank(p.name) }));
  const unnamedLeft = leftTrusses.filter((t) => depthOf[t] !== undefined);
  if (
    ranked.length > 1 &&
    ranked.length === unnamedLeft.length &&
    ranked.every((r) => r.d) &&
    new Set(ranked.map((r) => r.d!.family)).size === 1 &&
    new Set(ranked.map((r) => r.d!.rank)).size === ranked.length
  ) {
    const byDepth = [...unnamedLeft].sort((a, b) => depthOf[a] - depthOf[b]);
    ranked.sort((a, b) => a.d!.rank - b.d!.rank).forEach((r, i) => out.set(r.p.name, { truss: byDepth[i], how: 'by depth' }));
  }
  return out;
}
