import Papa from 'papaparse';
import { PatchFieldKey, RawFixtureInput, findHeaderRowIndex, splitUniverseAddress } from '@elexprep/shared';

/**
 * Turns a plain grid of cells into the header+rows shape the rest of this module works with —
 * scores each row for how header-like it looks (see findHeaderRowIndex) rather than assuming
 * row 0, since real-world exports (a Wysiwyg CSV, or text/table data lifted from a CAD PDF) often
 * have title/metadata rows before the real header. Shared by parseWysiwygCsv below and by the
 * OneDrive CAD-PDF fallback (oneDrive/patchPdfExtract.ts), which both end up with a plain
 * string[][] grid from very different sources.
 */
export function rowsToHeaderMappedRows(allRows: string[][]): { headers: string[]; rows: Record<string, string>[] } {
  const headerRowIndex = findHeaderRowIndex(allRows);
  const headerRow = (allRows[headerRowIndex] ?? []).map((h) => (h ?? '').trim());
  const rows = allRows
    .slice(headerRowIndex + 1)
    .filter((r) => r.some((c) => (c ?? '').trim() !== ''))
    .map((r) => {
      const obj: Record<string, string> = {};
      headerRow.forEach((h, i) => {
        if (h) obj[h] = (r[i] ?? '').trim();
      });
      return obj;
    });
  return { headers: headerRow.filter(Boolean), rows };
}

/**
 * Real patch exports (e.g. CAST Wysiwyg's patch report) often have a few title/metadata rows
 * before the real column header row, plus blank rows and "Type: X" sub-group marker rows mixed
 * in with the data further down — so the header row can't just be assumed to be row 1. Shared
 * between the manual CSV upload flow (routes/patch.ts) and the OneDrive auto-detect flow
 * (oneDrive/patchDetect.ts) — both end up parsing the same Wysiwyg-shaped export.
 */
export function parseWysiwygCsv(text: string): { headers: string[]; rows: Record<string, string>[] } {
  const raw = Papa.parse<string[]>(text, { skipEmptyLines: false });
  return rowsToHeaderMappedRows(raw.data as string[][]);
}

function toInt(v: string | undefined | null): number | null {
  if (v === undefined || v === null || v.trim() === '') return null;
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : null;
}

/** Applies a saved/overridden column mapping to parsed CSV rows, producing the fixture inputs
 * ready for the destructive replace-all-fixtures transaction — shared by the manual upload
 * import and the OneDrive auto-detect approval flow, which both end at the same place. */
export function buildFixturesFromRows(
  rows: Record<string, string>[],
  m: Partial<Record<PatchFieldKey, string>>
): RawFixtureInput[] {
  const fixtures: RawFixtureInput[] = [];
  for (const row of rows) {
    const address = m.address ? toInt(row[m.address]) : null;
    const fixtureType = m.fixtureType ? (row[m.fixtureType] ?? '').trim() : '';
    if (address === null || !fixtureType) continue;
    // Some patch software (e.g. Wysiwyg) exports a single "universe.address" column instead
    // of two separate ones — split it when that mapping is used, otherwise fall back to the
    // separately-mapped universe/address columns.
    const mainSplit = m.mainUniverseAddress ? splitUniverseAddress(row[m.mainUniverseAddress]) : null;
    const pixSplit = m.pixUniverseAddress ? splitUniverseAddress(row[m.pixUniverseAddress]) : null;
    fixtures.push({
      address,
      fixtureType,
      mainUniverse: mainSplit ? mainSplit.universe : m.mainUniverse ? toInt(row[m.mainUniverse]) : null,
      mainAddress: mainSplit ? mainSplit.address : m.mainAddress ? toInt(row[m.mainAddress]) : null,
      pixUniverse: pixSplit ? pixSplit.universe : m.pixUniverse ? toInt(row[m.pixUniverse]) : null,
      pixAddress: pixSplit ? pixSplit.address : m.pixAddress ? toInt(row[m.pixAddress]) : null,
      mode: m.mode ? row[m.mode] ?? null : null,
      location: m.location ? row[m.location] ?? null : null,
      ipAddress: m.ipAddress ? row[m.ipAddress] ?? null : null,
      subnetMask: m.subnetMask ? row[m.subnetMask] ?? null : null,
      notes: m.notes ? row[m.notes] ?? null : null,
      raw: row,
    });
  }
  return fixtures;
}
