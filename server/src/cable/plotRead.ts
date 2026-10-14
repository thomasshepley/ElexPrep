import crypto from 'crypto';

/**
 * Reads truss geometry from a plot PDF's own text layer (no AI): the "Rigging Points" table that
 * Elex's WYSIWYG template prints (Name, X, Y, Capacity, Load, Position, Notes, in metres),
 * including the cable picks. Points are grouped into trusses by their Position; the outer points
 * plus a small overhang give the truss length, and the cable pick on the same position gives
 * where the loom comes up.
 */

export interface TextItem {
  str: string;
  /** PDF user-space position of the text's origin. */
  x: number;
  y: number;
}

export interface RiggingPoint {
  name: string;
  xM: number;
  yM: number;
  capacityKg: number | null;
  loadKg: number | null;
  position: string;
  cablePick: boolean;
  notes: string;
}

export interface PlotTruss {
  position: string;
  points: string[];
  fromXM: number;
  toXM: number;
  yM: number;
  lengthM: number;
  /** Cable pick on this position, when the table has one. */
  pickXM: number | null;
  /** Along the truss, from the pick to the nearer end. */
  pickOffsetM: number | null;
}

export interface PlotGeometry {
  points: RiggingPoint[];
  trusses: PlotTruss[];
  /** The plan marks the house LX panel (a usable dimmer city). */
  lxPanelFound: boolean;
  notes: string[];
}

/** How far a truss is taken to run past its outermost rigging points, each end. */
export const TRUSS_OVERHANG_M = 0.5;

const HEADERS = ['name', 'x', 'y', 'capacity', 'load', 'position', 'notes'] as const;
type Column = (typeof HEADERS)[number];

const near = (a: number, b: number, tol = 3) => Math.abs(a - b) <= tol;
const metres = (s: string) => {
  const m = s.replace(',', '.').match(/^(-?\d+(?:\.\d+)?)\s*m$/i);
  return m ? Number(m[1]) : null;
};
const kg = (s: string) => {
  const m = s.replace(',', '.').match(/^(-?\d+(?:\.\d+)?)\s*kg$/i);
  return m ? Number(m[1]) : null;
};

/**
 * Finds the rigging points table on one page's text items. Works whether the page is upright or
 * rotated (a rotated sheet's rows share x instead of y), by reading the header row's layout.
 */
export function parseRiggingPoints(items: TextItem[]): RiggingPoint[] {
  const clean = items.filter((i) => i.str.trim());
  const names = clean.filter((i) => i.str.trim().toLowerCase() === 'name');
  for (const nameItem of names) {
    for (const rowAxis of ['x', 'y'] as const) {
      const colAxis = rowAxis === 'x' ? 'y' : 'x';
      const headerRow = clean.filter((i) => near(i[rowAxis], nameItem[rowAxis]));
      const cols = new Map<Column, number>();
      for (const h of headerRow) {
        const key = h.str.trim().toLowerCase() as Column;
        if ((HEADERS as readonly string[]).includes(key) && !cols.has(key)) cols.set(key, h[colAxis]);
      }
      if (!(cols.has('x') && cols.has('y') && cols.has('position'))) continue;
      const colList = [...cols.entries()];
      const nearestCol = (v: number) => colList.reduce((best, c) => (Math.abs(c[1] - v) < Math.abs(best[1] - v) ? c : best))[0];

      // Group everything else into rows along the row axis.
      const rows = new Map<number, TextItem[]>();
      for (const it of clean) {
        if (headerRow.includes(it)) continue;
        const key = [...rows.keys()].find((k) => near(k, it[rowAxis])) ?? it[rowAxis];
        if (!rows.has(key)) rows.set(key, []);
        rows.get(key)!.push(it);
      }
      const points: RiggingPoint[] = [];
      for (const row of rows.values()) {
        const cells = new Map<Column, string[]>();
        for (const it of row.sort((a, b) => a[colAxis] - b[colAxis])) {
          const c = nearestCol(it[colAxis]);
          if (!cells.has(c)) cells.set(c, []);
          cells.get(c)!.push(it.str.trim());
        }
        const text = (c: Column) => (cells.get(c) ?? []).join(' ').trim();
        const xM = metres(text('x'));
        const yM = metres(text('y'));
        const name = text('name');
        if (xM === null || yM === null || !name) continue;
        const positionRaw = text('position');
        const notes = text('notes');
        const cablePick = /cable\s*pick/i.test(`${positionRaw} ${notes}`);
        points.push({
          name,
          xM,
          yM,
          capacityKg: kg(text('capacity')),
          loadKg: kg(text('load')),
          position: positionRaw.replace(/cable\s*pick/i, '').trim(),
          cablePick,
          notes,
        });
      }
      if (points.length) return points;
    }
  }
  return [];
}

/** Rigging points to trusses: one per Position, spanning its outer points plus the overhang. */
export function trussesFromPoints(points: RiggingPoint[]): PlotTruss[] {
  const byPosition = new Map<string, RiggingPoint[]>();
  for (const p of points) {
    if (p.cablePick || !p.position) continue;
    const key = p.position;
    if (!byPosition.has(key)) byPosition.set(key, []);
    byPosition.get(key)!.push(p);
  }
  const trusses: PlotTruss[] = [];
  for (const [position, list] of byPosition) {
    const xs = list.map((p) => p.xM);
    const from = Math.min(...xs) - TRUSS_OVERHANG_M;
    const to = Math.max(...xs) + TRUSS_OVERHANG_M;
    const pick = points.find((p) => p.cablePick && p.position.toLowerCase() === position.toLowerCase());
    let pickOffsetM: number | null = null;
    if (pick) pickOffsetM = pick.xM > to ? pick.xM - to : pick.xM < from ? from - pick.xM : 0;
    trusses.push({
      position,
      points: list.map((p) => p.name),
      fromXM: from,
      toXM: to,
      yM: Math.round((list.reduce((n, p) => n + p.yM, 0) / list.length) * 100) / 100,
      lengthM: Math.round((to - from) * 100) / 100,
      pickXM: pick?.xM ?? null,
      pickOffsetM: pickOffsetM === null ? null : Math.round(pickOffsetM * 100) / 100,
    });
  }
  return trusses.sort((a, b) => a.position.localeCompare(b.position));
}

interface PdfJs {
  getDocument(opts: { data: Uint8Array; isEvalSupported: boolean; useSystemFonts: boolean }): {
    promise: Promise<{
      numPages: number;
      getPage(n: number): Promise<{ getTextContent(): Promise<{ items: ({ str: string; transform: number[] } | { type: string })[] }> }>;
      destroy(): Promise<void>;
    }>;
  };
}

/** Reads every page of a PDF; stops at the first page with a rigging points table. */
export async function readPlotGeometry(data: Uint8Array): Promise<PlotGeometry> {
  // pdf.js ships as ESM only and this server is CommonJS, so it's loaded with a real dynamic
  // import (which TypeScript would otherwise rewrite to require()).
  const pdfjs = await (new Function('p', 'return import(p)') as (p: string) => Promise<PdfJs>)('pdfjs-dist/legacy/build/pdf.mjs');
  const doc = await pdfjs.getDocument({ data, isEvalSupported: false, useSystemFonts: false }).promise;
  let points: RiggingPoint[] = [];
  let lxPanelFound = false;
  let anyText = false;
  try {
    for (let n = 1; n <= doc.numPages; n++) {
      const page = await doc.getPage(n);
      const content = await page.getTextContent();
      const items: TextItem[] = [];
      for (const it of content.items) {
        if (!('str' in it)) continue;
        items.push({ str: it.str, x: it.transform[4], y: it.transform[5] });
      }
      if (items.some((i) => i.str.trim())) anyText = true;
      if (items.some((i) => /\bLX\s*PANEL\b/i.test(i.str))) lxPanelFound = true;
      if (!points.length && items.some((i) => /rigging\s*points/i.test(i.str))) points = parseRiggingPoints(items);
    }
  } finally {
    await doc.destroy();
  }
  const notes: string[] = [];
  if (!anyText) notes.push('This PDF has no text to read (it may be a scan or have its text turned into outlines). Type the truss sizes in.');
  else if (!points.length) notes.push('No Rigging Points table was found on this plot. Type the truss sizes in, or ask the designer for the point list.');
  else notes.push(`Truss lengths are taken as ${TRUSS_OVERHANG_M} m past the outer rigging points at each end.`);
  if (lxPanelFound) notes.push('The plot marks the LX PANEL: measure the run from each cable pick to it and type it in as the distance to dimmer city.');
  notes.push('Trim height is not on the plot: the rules default is used unless you type one in.');
  return { points, trusses: trussesFromPoints(points), lxPanelFound, notes };
}

export function hashBytes(data: Uint8Array) {
  return crypto.createHash('sha256').update(data).digest('hex');
}
