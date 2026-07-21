/**
 * Real-world patch exports (e.g. Wysiwyg patch reports) often have a few title/metadata rows
 * before the actual column header row, plus "Type: X" sub-group marker rows interspersed with
 * data further down. This scores each row's likelihood of being the real header row so callers
 * don't have to assume it's always row 1 — a header row is mostly-full of short text labels,
 * whereas metadata rows are sparse and data rows are mostly numeric.
 */
export function findHeaderRowIndex(rows: string[][], scanLimit = 40): number {
  let bestIndex = 0;
  let bestScore = -1;
  const limit = Math.min(rows.length, scanLimit);
  for (let i = 0; i < limit; i++) {
    const row = rows[i] ?? [];
    const nonEmpty = row.map((c) => (c ?? '').trim()).filter((c) => c !== '');
    if (nonEmpty.length < 2) continue;
    const dataLike = nonEmpty.filter((c) => /^-?\d+(\.\d+)?$/.test(c) || /^type:/i.test(c));
    const score = nonEmpty.length - dataLike.length * 0.5;
    if (score > bestScore) {
      bestScore = score;
      bestIndex = i;
    }
  }
  return bestIndex;
}

/**
 * Splits a combined "universe.address" cell (e.g. "3.109" -> universe 3, address 109), the
 * notation some patch software uses for a single DMX patch column instead of two separate ones.
 */
export function splitUniverseAddress(value: string | undefined | null): { universe: number | null; address: number | null } {
  if (!value) return { universe: null, address: null };
  const match = value.trim().match(/^(\d+)\.(\d+)$/);
  if (!match) return { universe: null, address: null };
  return { universe: Number(match[1]), address: Number(match[2]) };
}
