/**
 * Physical label sheet geometry, measured directly from Elex's existing Word/PowerPoint
 * label templates (Midge_Fixture_Labels.docx, Midge_Truss_Spikess.docx, Midge_Cable_Labels.docx,
 * Wu_Lyf_PAL.pptx) by reading each shape's absolute page position/size out of the underlying XML.
 * All dimensions are in inches. Treat these as the starting point for print calibration —
 * printers/stock vary by a few mm, so the app exposes a per-template X/Y nudge in settings.
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

const FIXTURE_GRID_COLS = [0.06, 2.80, 5.55];
const FIXTURE_GRID_ROWS = [0.41, 2.36, 4.31, 6.26, 8.21, 10.16];
const FIXTURE_CELL_W = 2.681;
const FIXTURE_CELL_H = 1.949;

function buildGridCells(cols: number[], rows: number[], w: number, h: number): CellGeometry[] {
  const cells: CellGeometry[] = [];
  for (const y of rows) {
    for (const x of cols) {
      cells.push({ x, y, w, h });
    }
  }
  return cells;
}

/** 3x6 die-cut A4 stock, all 6 rows — kept only as the source grid for the placeholder Rack
 * layout below (no real Rack template has been supplied yet). */
export const GRID_18_SHEET: SheetGeometry = {
  pageWidthIn: 8.27,
  pageHeightIn: 11.69,
  landscape: false,
  cells: buildGridCells(FIXTURE_GRID_COLS, FIXTURE_GRID_ROWS, FIXTURE_CELL_W, FIXTURE_CELL_H),
};

/**
 * Fixture and Truss/Spike labels share the exact same physical die-cut stock, printed on the
 * same printer — which cuts off the bottom row in practice for both, so these sheets stop at
 * 5 rows (15 cells) rather than 6.
 */
export const FIXTURE_TRUSS_SPIKE_SHEET: SheetGeometry = {
  pageWidthIn: 8.27,
  pageHeightIn: 11.69,
  landscape: false,
  cells: buildGridCells(FIXTURE_GRID_COLS, FIXTURE_GRID_ROWS.slice(0, -1), FIXTURE_CELL_W, FIXTURE_CELL_H),
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

/** No rack label template was supplied yet — reuse the fixture/truss-spike stock as a placeholder. */
export const RACK_SHEET: SheetGeometry = GRID_18_SHEET;
