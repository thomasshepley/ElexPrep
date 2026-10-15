import { PDFParse } from 'pdf-parse';
import { findHeaderRowIndex } from '@elexprep/shared';
import { rowsToHeaderMappedRows } from '../patchCsv';

// Vocabulary a real patch table's header row is expected to contain (normalized - see
// normalizeHeaderCell). A "Combined" CAD export bundles the patch table alongside a legend, a
// rigging-point schedule, title blocks and revision notes, all on separate pages - several of
// those also render as something table-shaped, so picking "the first table-like thing found"
// (the old behaviour) just as easily grabs the rigging schedule or the legend instead of the
// patch table. Scoring the header row against this vocabulary is what tells them apart: a
// rigging schedule's header ("Name, X, Y, Capacity, Load, Position, Notes") only matches
// "position", nowhere near a real patch header's score. Only used to score getTable()'s
// structural results below - the text-extraction path (the common case - see
// extractPatchRowsFromText) identifies the right page by how many real patch rows it parses,
// which is a stronger, self-validating signal than matching header words.
const PATCH_HEADER_KEYWORDS = [
  'spot',
  'patch',
  'type',
  'position',
  'fixture',
  'address',
  'universe',
  'channel',
  'mode',
  'dmx',
  'data',
  'circuit',
  'dimmer',
];
const MIN_HEADER_SCORE = 2;

/** Strips whitespace and lowercases - CAD-exported PDFs routinely come back from text
 * extraction with stray spaces inside words ("S pot", "Fixt ure Opt ions") because of how the
 * font is kerned/subset, so comparing word-for-word would miss real header cells. */
function normalizeHeaderCell(cell: string): string {
  return cell.toLowerCase().replace(/\s+/g, '');
}

/** How many of a candidate header row's cells look like patch-table column names. */
function scoreHeaderRow(cells: string[]): number {
  let score = 0;
  for (const cell of cells) {
    const normalized = normalizeHeaderCell(cell);
    if (!normalized) continue;
    if (PATCH_HEADER_KEYWORDS.some((k) => normalized.includes(k) || k.includes(normalized))) score++;
  }
  return score;
}

// Common lighting stage-position shorthand - deliberately a closed vocabulary rather than
// "any short all-caps word", since a fixture type can legitimately end in a short all-caps
// token too (e.g. a model line ending "...XB"/"...FX"). Matching only these known codes means
// a type like that is left whole rather than having its last word wrongly sliced off as a
// position; the cost is that a venue's own non-standard position codes (a truss number, a
// cue-ish label) won't be split out of the type - they fall back into `type` untouched, which
// is the same "leave it for the human reviewing the import" outcome as today.
const POSITION_CODES = new Set(['US', 'DS', 'SR', 'SL', 'USR', 'USL', 'DSR', 'DSL', 'CTR', 'OP', 'PS', 'FOH', 'N/A']);

interface ParsedPatchRow {
  spot: string;
  patch: string;
  type: string;
  position: string;
  fixtureOptions: string;
  dataCount: string;
}

/**
 * Parses one line of a patch table's row text into its fields, anchored from both ends rather
 * than split by column position - this family of CAD patch export (Spot, Patch/universe.address,
 * Type, Position, Fixture Options, # Data per row) turns out to come back from PDF text
 * extraction as a single unbroken string per row (no per-cell gaps wide enough to detect - see
 * the module doc comment), so there's no column x-position to split on at all; regex anchors on
 * the two unambiguous, format-distinctive fields (a leading integer Spot, a `universe.address`
 * Patch) and the trailing integer (# Data) are what make this reliable instead of guessing at
 * word boundaries in free text. Returns null for a line that isn't a real patch row (a "Type: X"
 * section-heading line, a title/metadata line, or an unaddressed fixture with no Spot/Patch at
 * all - the last of those can't become a Fixture anyway, which needs an address).
 */
export function parsePatchDataLine(line: string): ParsedPatchRow | null {
  let remainder = line.trim();
  if (!remainder) return null;

  const dataMatch = remainder.match(/(\d+)\s*$/);
  if (!dataMatch) return null;
  const dataCount = dataMatch[1];
  remainder = remainder.slice(0, dataMatch.index).trim();

  const spotMatch = remainder.match(/^(\d+)\s+/);
  if (!spotMatch) return null;
  const spot = spotMatch[1];
  remainder = remainder.slice(spotMatch[0].length);

  const patchMatch = remainder.match(/^(\d+\.\d+)\s+/);
  if (!patchMatch) return null;
  const patch = patchMatch[1];
  remainder = remainder.slice(patchMatch[0].length);

  // Fixture Options reliably starts at the first "word:" (Mode:, Channels:, Colour Mode:, ...)
  // - every sample of this field across real exports carries at least one such label.
  const optionsMatch = remainder.match(/\b\w+:/);
  let typeAndPosition = remainder;
  let fixtureOptions = '';
  if (optionsMatch && optionsMatch.index !== undefined) {
    typeAndPosition = remainder.slice(0, optionsMatch.index).trim();
    fixtureOptions = remainder.slice(optionsMatch.index).trim();
  }

  let type = typeAndPosition;
  let position = '';
  const posMatch = typeAndPosition.match(/\s(N\/A|[A-Z]{1,4})$/);
  if (posMatch && posMatch.index !== undefined && POSITION_CODES.has(posMatch[1])) {
    position = posMatch[1];
    type = typeAndPosition.slice(0, posMatch.index).trim();
  }

  if (!type) return null;
  return { spot, patch, type, position, fixtureOptions, dataCount };
}

const PATCH_ROW_HEADERS = ['Spot', 'Patch', 'Type', 'Position', 'Fixture Options', '# Data'] as const;

function toRowRecord(r: ParsedPatchRow): Record<string, string> {
  return {
    Spot: r.spot,
    Patch: r.patch,
    Type: r.type,
    Position: r.position,
    'Fixture Options': r.fixtureOptions,
    '# Data': r.dataCount,
  };
}

// A page only counts as "the patch table" once it has several real rows on it, not just one -
// one stray line elsewhere that happens to start with a number and contain a decimal doesn't
// make that page a patch table. Low enough that even a small point fixture plot still passes.
const MIN_QUALIFYING_ROWS = 3;

/** Scans every page's plain text for patch rows and keeps whichever page(s) actually have
 * several - self-validating, since a page that isn't the patch table essentially never
 * produces multiple lines matching the Spot+Patch+trailing-count shape (verified against a
 * real "Combined" export's title/legend/rigging/revision pages, which all score 0). Handles a
 * patch table spanning more than one page by merging every qualifying page's rows together. */
export function extractPatchRowsFromText(pages: { text: string }[]): Record<string, string>[] {
  const rows: Record<string, string>[] = [];
  for (const page of pages) {
    const pageRows = page.text
      .split(/\r?\n/)
      .map(parsePatchDataLine)
      .filter((r): r is ParsedPatchRow => r !== null);
    if (pageRows.length >= MIN_QUALIFYING_ROWS) rows.push(...pageRows.map(toRowRecord));
  }
  return rows;
}

/**
 * Best-effort extraction of a patch table out of a CAD PDF, for the auto-import fallback used
 * when a job's OneDrive "Patch" folder has no CSV (see oneDrive/patchDetect.ts and
 * routes/patch.ts's /onedrive-files/read). Tries two strategies, in order:
 *
 * 1. pdf-parse's structural table detection (getTable), for PDFs where the patch table is
 *    actually drawn with a ruled/grid-aligned border - scored against PATCH_HEADER_KEYWORDS so
 *    a "Combined" export's other tables (a rigging schedule, a legend) don't get mistaken for
 *    the patch table just for being table-shaped.
 * 2. Row-pattern text extraction (extractPatchRowsFromText) for the much more common case of a
 *    table laid out with zebra-striped row shading instead of literal grid lines, which
 *    getTable() can't see at all (it only looks at vector line/rectangle operators that form a
 *    grid, not fill colour) - and which, in practice, PDF text extraction returns as one
 *    unbroken string per row rather than separately-positioned cells (no gap between "columns"
 *    wide enough for gap-based cell splitting to find, at least in the exports this has been
 *    tested against), so this parses each row's text directly instead of trying to split it by
 *    column position.
 *
 * Both are inherently approximate - a table rendered as an image rather than real text, or an
 * export whose row shape doesn't match parsePatchDataLine's anchors at all, will defeat this.
 * That's expected and acceptable: unlike the CSV path, a PDF-sourced result is never applied
 * automatically (see the `source` field on PatchImportCandidate) - it always lands in the same
 * PENDING review state for a human to check before anything touches the job's fixtures.
 * Returns empty headers/rows (not an error) when nothing patch-table-shaped could be found.
 */
export async function extractPatchTableFromPdf(buffer: Buffer): Promise<{ headers: string[]; rows: Record<string, string>[] }> {
  // A copy in its own ArrayBuffer: small Buffers sit in Node's shared pool, which pdf.js can't
  // transfer to its worker ("Cannot transfer object of unsupported type").
  const parser = new PDFParse({ data: new Uint8Array(buffer) });
  try {
    const tableResult = await parser.getTable().catch(() => null);
    const tableCandidates = [
      ...(tableResult?.mergedTables ?? []),
      ...(tableResult?.pages.flatMap((p) => p.tables) ?? []),
    ].filter((t) => t.length > 1);
    let bestTable: (typeof tableCandidates)[number] | null = null;
    let bestTableScore = 0;
    for (const table of tableCandidates) {
      const score = scoreHeaderRow(table[findHeaderRowIndex(table)] ?? []);
      if (score > bestTableScore) {
        bestTableScore = score;
        bestTable = table;
      }
    }
    if (bestTable && bestTableScore >= MIN_HEADER_SCORE) {
      const parsed = rowsToHeaderMappedRows(bestTable);
      if (parsed.rows.length > 0) return parsed;
    }

    const textResult = await parser.getText({});
    const rows = extractPatchRowsFromText(textResult.pages);
    if (rows.length > 0) return { headers: [...PATCH_ROW_HEADERS], rows };

    return { headers: [], rows: [] };
  } finally {
    await parser.destroy();
  }
}
