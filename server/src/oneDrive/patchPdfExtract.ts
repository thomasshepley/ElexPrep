import { PDFParse } from 'pdf-parse';
import { rowsToHeaderMappedRows } from '../patchCsv';

// A control character that should never appear in real patch data, used as a safe column
// marker for the text-extraction fallback below.
const CELL_SEPARATOR = '\u0001';

/**
 * Best-effort extraction of a patch table out of a CAD PDF, for the auto-import fallback used
 * when a job's OneDrive "Patch" folder has no CSV (see oneDrive/patchDetect.ts and
 * routes/patch.ts's /onedrive-scan). Tries two strategies, in order:
 *
 * 1. pdf-parse's structural table detection (getTable), which works when the PDF actually has
 *    ruled/grid-aligned table content.
 * 2. Column-aware text extraction (getText with a cell separator inserted wherever two text runs
 *    on the same line have a wide horizontal gap between them) for CAD exports that lay out a
 *    table without literal grid lines.
 *
 * Both are inherently approximate — irregular spacing, wrapped cells, or a table rendered as an
 * image rather than real text will defeat this. That's expected and acceptable: unlike the CSV
 * path, a PDF-sourced result is never applied automatically (see the `source` field on
 * PatchImportCandidate) — it always lands in the same PENDING review state for a human to check
 * before anything touches the job's fixtures. Returns empty headers/rows (not an error) when
 * nothing table-shaped could be found at all.
 */
export async function extractPatchTableFromPdf(buffer: Buffer): Promise<{ headers: string[]; rows: Record<string, string>[] }> {
  const parser = new PDFParse({ data: buffer });
  try {
    const tableResult = await parser.getTable().catch(() => null);
    const bestTable =
      tableResult?.mergedTables.find((t) => t.length > 1) ??
      tableResult?.pages.flatMap((p) => p.tables).find((t) => t.length > 1);
    if (bestTable) {
      const parsed = rowsToHeaderMappedRows(bestTable);
      if (parsed.rows.length > 0) return parsed;
    }

    // pageJoiner: '' suppresses pdf-parse's default "-- N of M --" footer marker, which
    // otherwise leaks into the extracted text as a bogus trailing line/row on every page.
    const textResult = await parser.getText({ cellSeparator: CELL_SEPARATOR, cellThreshold: 8, pageJoiner: '' });
    const grid = textResult.text
      .split(/\r?\n/)
      .map((line) => line.split(CELL_SEPARATOR).map((cell) => cell.trim()).filter((cell) => cell !== ''))
      .filter((row) => row.length > 0);
    return rowsToHeaderMappedRows(grid);
  } finally {
    await parser.destroy();
  }
}
