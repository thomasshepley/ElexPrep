/**
 * Physical label sheet geometry. All dimensions are in inches. Treat these as the starting
 * point for print calibration - printers/stock vary by a few mm, so the app exposes a
 * per-template X/Y nudge in settings.
 */

export interface Point {
  x: number;
  y: number;
}

export interface CellGeometry extends Point {
  w: number;
  h: number;
}

export interface SheetGeometry {
  pageWidthIn: number;
  pageHeightIn: number;
  landscape: boolean;
  cells: CellGeometry[];
}

/**
 * Fixture and Truss/Spike labels: genuine Avery L7161 stock (63.5 x 46.6mm, 3 columns x 6
 * rows, A4 portrait) - read directly from Avery's own blank Word template (table cell
 * widths/row heights and page margins out of the underlying XML; the template's own
 * `Blank_MP1_panelN` bookmark naming confirms it as an authentic unmodified Avery file, the
 * same convention seen in Avery's PAL sheet template). Columns are very slightly asymmetric
 * in Avery's own file (2.5in / 2.4847in / 2.4847in) - kept as-is rather than rounded to a
 * single uniform width, since the renderer already scales each label's content to its own
 * cell's actual width (see genericRenderer.ts), the same technique PAL_SHEET's own
 * slightly-wider right column relies on.
 *
 * This replaces an earlier, substantially-off calibration (originally sourced from Elex's own
 * Midge_Fixture_Labels.docx) whose ~6-7% error in row pitch compounded down the sheet - bad
 * enough by row 6 that it was worked around by simply not printing that row at all. The
 * correct geometry below fits all 6 rows on the page with margin to spare, so that workaround
 * is removed.
 */
const FIXTURE_COLS: { x: number; w: number }[] = [
  { x: 0.3403, w: 2.5 },
  { x: 2.9549, w: 2.4847 },
  { x: 5.5542, w: 2.4847 },
];
const FIXTURE_ROW_H = 1.8326;
const FIXTURE_ROWS_Y = [0.3472, 2.1799, 4.0125, 5.8451, 7.6778, 9.5104];

function buildFixtureGridCells(rows: number[]): CellGeometry[] {
  const cells: CellGeometry[] = [];
  for (const y of rows) {
    for (const col of FIXTURE_COLS) {
      cells.push({ x: col.x, y, w: col.w, h: FIXTURE_ROW_H });
    }
  }
  return cells;
}

export const FIXTURE_TRUSS_SPIKE_SHEET: SheetGeometry = {
  pageWidthIn: 8.27,
  pageHeightIn: 11.69,
  landscape: false,
  cells: buildFixtureGridCells(FIXTURE_ROWS_Y),
};

/** Cable label stock: single column of contiguous strips, each name printed twice (wrap-round flag). */
export const CABLE_SHEET: SheetGeometry = {
  pageWidthIn: 8.27,
  pageHeightIn: 11.69,
  landscape: false,
  cells: Array.from({ length: 16 }, (_, i) => ({
    x: 0.05,
    y: 0.2 + i * 0.713,
    w: 6.17,
    h: 0.713,
  })),
};

/** A DMX cable label is printed 1/3 narrower than a standard cable label, with a center cut line. */
export const DMX_CABLE_WIDTH_FACTOR = 2 / 3;

/** PAL case label sheet: 2x2 landscape, each cell has a location bar + content block + logo slot. */
export const PAL_SHEET: SheetGeometry = {
  pageWidthIn: 10.83,
  pageHeightIn: 7.5,
  landscape: true,
  cells: [
    { x: 0.01, y: 0.07, w: 5.30, h: 3.75 },
    { x: 5.51, y: 0.07, w: 5.33, h: 3.75 },
    { x: 0.01, y: 3.82, w: 5.32, h: 3.68 },
    { x: 5.51, y: 3.81, w: 5.33, h: 3.68 },
  ],
};

export interface PalCellLayout {
  logo: CellGeometry;
  locationBar: CellGeometry;
  content: CellGeometry;
}

/**
 * Sub-regions inside a single PAL cell, relative to that cell's own top-left origin. The logo
 * banner spans the full cell width edge-to-edge (w matches PAL_SHEET's reference cell width,
 * which the renderer scales proportionally for the slightly-wider right-column cells).
 */
export const PAL_CELL_LAYOUT: PalCellLayout = {
  logo: { x: 0, y: 0, w: 5.30, h: 0.70 },
  locationBar: { x: 0, y: 0.72, w: 5.30, h: 0.67 },
  content: { x: 0, y: 1.40, w: 5.30, h: 2.12 },
};

/** No rack label template was supplied yet - reuse the fixture/truss-spike stock as a placeholder. */
export const RACK_SHEET: SheetGeometry = FIXTURE_TRUSS_SPIKE_SHEET;

/**
 * Avery 105x148-R: a blank Avery mail-merge template for 4 landscape labels (105mm tall x
 * 148mm wide each) on one A4 landscape sheet, measured from Avery's own .docx template
 * (table cell/row geometry; the document's stated page margins don't self-consistently add
 * up with its table width, so the nominal 105/148mm product dimensions are trusted as the
 * authoritative label size instead, centered on a standard A4 landscape page). This is a
 * second, alternate sheet for PAL content - printed on plain A4 with Avery's self-adhesive
 * stock through an ordinary office printer - distinct from PAL_SHEET above, which is
 * calibrated against Elex's existing die-cut label stock fed through the dedicated label
 * printer. Reuses PAL_SHEET's own element template (see labelElements.ts's PAL entry) rather
 * than needing a separate one: the two sheets' cell aspect ratios are close enough (1.413:1
 * vs 1.410:1) that the existing proportional layout carries over directly, just scaled up to
 * the physically larger Avery label.
 */
const MM_PER_IN = 25.4;
const PAL_AVERY_CELL_W = 148 / MM_PER_IN;
const PAL_AVERY_CELL_H = 105 / MM_PER_IN;
const PAL_AVERY_PAGE_W = 297 / MM_PER_IN; // A4 long edge
const PAL_AVERY_PAGE_H = 210 / MM_PER_IN; // A4 short edge
const PAL_AVERY_MARGIN_X = (PAL_AVERY_PAGE_W - 2 * PAL_AVERY_CELL_W) / 2;

export const PAL_AVERY_SHEET: SheetGeometry = {
  pageWidthIn: PAL_AVERY_PAGE_W,
  pageHeightIn: PAL_AVERY_PAGE_H,
  landscape: true,
  cells: [
    { x: PAL_AVERY_MARGIN_X, y: 0, w: PAL_AVERY_CELL_W, h: PAL_AVERY_CELL_H },
    { x: PAL_AVERY_MARGIN_X + PAL_AVERY_CELL_W, y: 0, w: PAL_AVERY_CELL_W, h: PAL_AVERY_CELL_H },
    { x: PAL_AVERY_MARGIN_X, y: PAL_AVERY_CELL_H, w: PAL_AVERY_CELL_W, h: PAL_AVERY_CELL_H },
    { x: PAL_AVERY_MARGIN_X + PAL_AVERY_CELL_W, y: PAL_AVERY_CELL_H, w: PAL_AVERY_CELL_W, h: PAL_AVERY_CELL_H },
  ],
};
