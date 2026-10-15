import crypto from 'crypto';

/**
 * Reads the rigging from a plot PDF's own text layer (no AI), from either or both of:
 *
 * - a rigging points table (Name, X, Y, Capacity, Load, Position, Notes, and sometimes the hoist
 *   type), on any page and over several pages;
 * - the rigging plan itself: each motor symbol's name label with its "X: 1.5m, Y: -3.6m",
 *   "Capacity" and "Load" labels beside it, which is all some plots have.
 *
 * Points from both are merged by name (the table wins where they differ). Points with a
 * Position are grouped into trusses by it; the rest by where they hang (a line of points at the
 * same Y is one truss). The outer points plus a small overhang give each truss's length, and a
 * cable pick on (or nearest) a truss gives where its loom comes up.
 */

export interface TextItem {
  str: string;
  /** PDF user-space position of the text's origin. */
  x: number;
  y: number;
  /** Text height, when known (bigger usually means a name label). */
  h?: number;
}

export interface RiggingPoint {
  name: string;
  xM: number;
  yM: number;
  capacityKg: number | null;
  loadKg: number | null;
  /** The truss it's on, from the table, or worked out from where it hangs. */
  position: string;
  cablePick: boolean;
  notes: string;
  /** The hoist's rating when the plot says (a "1T" label, a "500kg Hoist" type column). */
  hoistKg: number | null;
  /** Where it was read: a table, the plan's labels, or both. */
  source: 'TABLE' | 'PLAN' | 'BOTH';
}

export interface PlotTruss {
  position: string;
  /** False when the plot doesn't name it and the name was made up from where it hangs. */
  named: boolean;
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
// Measured on Elex's own WYSIWYG template (BOTM HQ3): 9 m trusses on outer points 7 m apart, with
// fixtures hanging 0.5 m beyond the outer points, so 1 m each end.
export const TRUSS_OVERHANG_M = 1;

/** Points within this much of each other in Y hang on the same truss. */
const SAME_TRUSS_Y_M = 0.3;
/** A cable pick belongs to the nearest truss within this much in Y. */
const PICK_REACH_Y_M = 1.5;

const COLUMNS = {
  name: ['name', 'point', 'point name', 'id', 'label', 'motor', 'hoist id'],
  x: ['x', 'x (m)', 'x m', 'pos x', 'x position'],
  y: ['y', 'y (m)', 'y m', 'pos y', 'y position'],
  capacity: ['capacity', 'swl', 'wll', 'point capacity', 'max load', 'capacity (kg)'],
  load: ['load', 'weight', 'point load', 'load (kg)'],
  position: ['position', 'truss', 'pos', 'hang', 'hanging position'],
  notes: ['notes', 'note', 'comments', 'comment'],
  type: ['type', 'hoist', 'hoist type', 'motor type', 'model'],
} as const;
type Column = keyof typeof COLUMNS;

const near = (a: number, b: number, tol = 3) => Math.abs(a - b) <= tol;
const num = (s: string) => Number(s.replace(',', '.'));

/** "5.50m", "5.5 m", "5500mm", "5.5" (metres when no unit). */
export const metres = (s: string) => {
  const m = s.trim().match(/^(-?\d+(?:[.,]\d+)?)\s*(mm|cm|m)?$/i);
  if (!m) return null;
  const v = num(m[1]);
  const unit = (m[2] ?? 'm').toLowerCase();
  return unit === 'mm' ? v / 1000 : unit === 'cm' ? v / 100 : v;
};

/** "180.00 kg", "180kg", "0.5t", "1 T", "1.77 kN" in kilograms. */
export const kilos = (s: string) => {
  const m = s.trim().match(/(-?\d+(?:[.,]\d+)?)\s*(kg|kgs|t|tonne|tonnes|ton|kn)\b/i);
  if (!m) return null;
  const v = num(m[1]);
  const unit = m[2].toLowerCase();
  return unit === 'kn' ? Math.round(v * 101.97) : unit.startsWith('t') ? v * 1000 : v;
};

const CABLE_PICK = /cable\s*pick|^c\.?p\.?\s*[-.]?\s*\d+$/i;
/** A hoist rating written by a point: "1T", "500kg", "1 tonne", "0.5t hoist". */
const RATING = /^(?:\d+(?:[.,]\d+)?\s*(?:t|tonne|ton|kg)(?:\s*(?:hoist|motor|chain hoist))?|(?:half|quarter)\s*(?:t|tonne|ton))$/i;
const ratingKg = (s: string) => (/half/i.test(s) ? 500 : /quarter/i.test(s) ? 250 : kilos(s));

const clean = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ').replace(/[:.]$/, '');

/**
 * Finds a rigging points table on one page's text items. Works whether the page is upright or
 * rotated (a rotated sheet's rows share x instead of y), by reading the header row's layout.
 */
export function parseRiggingPoints(items: TextItem[]): RiggingPoint[] {
  const clean_ = items.filter((i) => i.str.trim());
  const nameHeads = clean_.filter((i) => (COLUMNS.name as readonly string[]).includes(clean(i.str)));
  for (const nameItem of nameHeads) {
    for (const rowAxis of ['x', 'y'] as const) {
      const colAxis = rowAxis === 'x' ? 'y' : 'x';
      const headerRow = clean_.filter((i) => near(i[rowAxis], nameItem[rowAxis]));
      const cols = new Map<Column, number>();
      for (const h of headerRow) {
        const key = clean(h.str);
        for (const [col, names] of Object.entries(COLUMNS) as [Column, readonly string[]][]) {
          if (names.includes(key) && !cols.has(col)) cols.set(col, h[colAxis]);
        }
      }
      cols.set('name', nameItem[colAxis]);
      // A rigging table has X and Y, and capacity, load or position: a patch table doesn't.
      if (!(cols.has('x') && cols.has('y') && (cols.has('capacity') || cols.has('load') || cols.has('position')))) continue;
      const colList = [...cols.entries()];
      const nearestCol = (v: number) => colList.reduce((best, c) => (Math.abs(c[1] - v) < Math.abs(best[1] - v) ? c : best))[0];
      // Only rows on the far side of the header from it (a table reads away from its header).
      const dir = Math.sign(
        clean_.filter((i) => !headerRow.includes(i) && metres(i.str) !== null).reduce((n, i) => n + (i[rowAxis] - nameItem[rowAxis]), 0) || (rowAxis === 'x' ? 1 : -1)
      );

      const rows = new Map<number, TextItem[]>();
      for (const it of clean_) {
        if (headerRow.includes(it)) continue;
        if (Math.sign(it[rowAxis] - nameItem[rowAxis]) !== dir) continue;
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
        if (xM === null || yM === null || !name || name.length > 24) continue;
        const positionRaw = text('position');
        const notes = text('notes');
        const type = text('type');
        const cablePick = CABLE_PICK.test(`${positionRaw} ${notes} ${type}`) || CABLE_PICK.test(name);
        points.push({
          name,
          xM,
          yM,
          capacityKg: kilos(text('capacity')),
          loadKg: kilos(text('load')),
          position: positionRaw.replace(/cable\s*pick/i, '').trim(),
          cablePick,
          notes: [notes, type].filter(Boolean).join(' '),
          hoistKg: type ? kilos(type) ?? (RATING.test(type) ? ratingKg(type) : null) : null,
          source: 'TABLE',
        });
      }
      if (points.length) return points;
    }
  }
  return [];
}

const COORD = /x\s*[:=]?\s*(-?\d+(?:[.,]\d+)?)\s*(mm|m)?\s*[,;/]?\s*y\s*[:=]?\s*(-?\d+(?:[.,]\d+)?)\s*(mm|m)?/i;
const X_ONLY = /^x\s*[:=]\s*(-?\d+(?:[.,]\d+)?)\s*(mm|m)?$/i;
const Y_ONLY = /^y\s*[:=]\s*(-?\d+(?:[.,]\d+)?)\s*(mm|m)?$/i;
const CAPACITY = /^(?:capacity|swl|wll)\s*[:=]?\s*(.+)$/i;
const LOAD = /^(?:load|weight)\s*[:=]?\s*(.+)$/i;
/** A point's name: "LX-1", "CP2", "M 12", "SR-3A", "Motor 4", "V1". */
const POINT_NAME = /^(?:[a-z]{1,5}\s?[-.]?\s?\d{1,3}[a-z]?|(?:motor|hoist|point|pick|mp|dh)\s*[-.]?\s*\d{1,3}[a-z]?)$/i;

const toM = (v: string, unit: string | undefined) => (unit?.toLowerCase() === 'mm' ? num(v) / 1000 : num(v));

/**
 * Reads a rigging plan's labels: every "X: …, Y: …" label belongs to the point name nearest it,
 * and each point's capacity, load and any hoist rating are the matching labels nearest it.
 */
export function parsePlanLabels(items: TextItem[]): RiggingPoint[] {
  const all = items.filter((i) => i.str.trim());
  const dist = (a: TextItem, b: TextItem) => Math.hypot(a.x - b.x, a.y - b.y);
  // A label's own font size sets how far its parts may sit from it.
  const reach = (it: TextItem) => Math.max(60, (it.h ?? 10) * 7);

  const coords: { at: TextItem; x: number; y: number }[] = [];
  const used = new Set<TextItem>();
  for (const it of all) {
    const m = it.str.match(COORD);
    if (m) {
      coords.push({ at: it, x: toM(m[1], m[2]), y: toM(m[3], m[4]) });
      used.add(it);
    }
  }
  // "X: 1.5m" and "Y: -3.6m" as two separate labels.
  for (const xi of all.filter((i) => X_ONLY.test(i.str.trim()) && !used.has(i))) {
    const yi = all.filter((i) => Y_ONLY.test(i.str.trim()) && !used.has(i)).sort((a, b) => dist(a, xi) - dist(b, xi))[0];
    if (!yi || dist(xi, yi) > reach(xi)) continue;
    const mx = xi.str.trim().match(X_ONLY)!;
    const my = yi.str.trim().match(Y_ONLY)!;
    coords.push({ at: xi, x: toM(mx[1], mx[2]), y: toM(my[1], my[2]) });
    used.add(xi);
    used.add(yi);
  }
  if (!coords.length) return [];

  const names = all.filter((i) => !used.has(i) && POINT_NAME.test(i.str.trim()));
  // Nearest name to each coordinate label, closest pairs first, each name used once.
  const pairs = coords
    .flatMap((c) => names.map((n) => ({ c, n, d: dist(c.at, n) })))
    .filter((p) => p.d <= reach(p.c.at) * 1.5)
    .sort((a, b) => a.d - b.d);
  const takenC = new Set<(typeof coords)[number]>();
  const takenN = new Set<TextItem>();
  const points: (RiggingPoint & { at: TextItem })[] = [];
  for (const p of pairs) {
    if (takenC.has(p.c) || takenN.has(p.n)) continue;
    takenC.add(p.c);
    takenN.add(p.n);
    const name = p.n.str.trim();
    points.push({
      at: p.n,
      name,
      xM: Math.round(p.c.x * 1000) / 1000,
      yM: Math.round(p.c.y * 1000) / 1000,
      capacityKg: null,
      loadKg: null,
      position: '',
      cablePick: CABLE_PICK.test(name),
      notes: '',
      hoistKg: null,
      source: 'PLAN',
    });
  }
  // Capacity, load, a hoist rating and a "Cable Pick" note go to the nearest point.
  const nearestPoint = (it: TextItem) => points.reduce<(typeof points)[number] | null>((best, p) => (!best || dist(p.at, it) < dist(best.at, it) ? p : best), null);
  for (const it of all) {
    if (used.has(it) || takenN.has(it)) continue;
    const s = it.str.trim();
    const p = nearestPoint(it);
    if (!p || dist(p.at, it) > reach(p.at) * 1.5) continue;
    const cap = s.match(CAPACITY);
    const load = s.match(LOAD);
    if (cap && p.capacityKg === null) p.capacityKg = kilos(cap[1]);
    else if (load && p.loadKg === null) p.loadKg = kilos(load[1]);
    else if (RATING.test(s) && p.hoistKg === null) p.hoistKg = ratingKg(s);
    else if (/cable\s*pick/i.test(s)) p.cablePick = true;
  }
  return points.map(({ at: _at, ...p }) => p);
}

/** Table points first; plan points fill in what the table doesn't have. */
export function mergePoints(table: RiggingPoint[], plan: RiggingPoint[]): RiggingPoint[] {
  const key = (n: string) => n.toLowerCase().replace(/[\s.-]+/g, '');
  const out = new Map<string, RiggingPoint>();
  for (const p of table) if (!out.has(key(p.name))) out.set(key(p.name), p);
  for (const p of plan) {
    const t = out.get(key(p.name));
    if (!t) out.set(key(p.name), p);
    else
      out.set(key(p.name), {
        ...t,
        capacityKg: t.capacityKg ?? p.capacityKg,
        loadKg: t.loadKg ?? p.loadKg,
        hoistKg: t.hoistKg ?? p.hoistKg,
        cablePick: t.cablePick || p.cablePick,
        source: 'BOTH',
      });
  }
  return [...out.values()];
}

/** "Truss at Y -3.6 m" for a line of points the plot doesn't name. */
const unnamed = (y: number) => `Truss at Y ${Math.round(y * 10) / 10} m`;

/**
 * Points into trusses. Points with a Position keep it; the rest are grouped by where they hang
 * (joining a named truss at the same Y when there is one). Cable picks without a Position go to
 * the nearest truss. Returns the points with every position filled in, and the trusses.
 */
export function groupIntoTrusses(input: RiggingPoint[]): { points: RiggingPoint[]; trusses: PlotTruss[] } {
  const points = input.map((p) => ({ ...p }));
  const motors = points.filter((p) => !p.cablePick);
  const named = new Map<string, number[]>();
  for (const p of motors) if (p.position) named.set(p.position, [...(named.get(p.position) ?? []), p.yM]);
  const namedY = [...named.entries()].map(([position, ys]) => ({ position, y: ys.reduce((a, b) => a + b, 0) / ys.length }));
  const loose = motors.filter((p) => !p.position).sort((a, b) => a.yM - b.yM);
  let clusterY: number | null = null;
  let clusterName = '';
  for (const p of loose) {
    const match = namedY.find((n) => Math.abs(n.y - p.yM) <= SAME_TRUSS_Y_M);
    if (match) {
      p.position = match.position;
      continue;
    }
    if (clusterY === null || Math.abs(p.yM - clusterY) > SAME_TRUSS_Y_M) {
      clusterY = p.yM;
      clusterName = unnamed(p.yM);
    }
    p.position = clusterName;
  }
  const trusses = trussesFromPoints(points, new Set(named.keys()));
  // Picks the plot doesn't place go with the nearest truss.
  for (const pick of points.filter((p) => p.cablePick && !trusses.some((t) => t.position.toLowerCase() === p.position.toLowerCase()))) {
    const t = [...trusses].sort((a, b) => Math.abs(a.yM - pick.yM) - Math.abs(b.yM - pick.yM))[0];
    if (t && Math.abs(t.yM - pick.yM) <= PICK_REACH_Y_M) pick.position = t.position;
  }
  return { points, trusses: trussesFromPoints(points, new Set(named.keys())) };
}

/** Rigging points to trusses: one per Position, spanning its outer points plus the overhang. */
export function trussesFromPoints(points: RiggingPoint[], namedPositions?: Set<string>): PlotTruss[] {
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
      named: namedPositions ? namedPositions.has(position) : true,
      points: list.sort((a, b) => a.xM - b.xM).map((p) => p.name),
      fromXM: from,
      toXM: to,
      yM: Math.round((list.reduce((n, p) => n + p.yM, 0) / list.length) * 100) / 100,
      lengthM: Math.round((to - from) * 100) / 100,
      pickXM: pick?.xM ?? null,
      pickOffsetM: pickOffsetM === null ? null : Math.round(pickOffsetM * 100) / 100,
    });
  }
  return trusses.sort((a, b) => a.position.localeCompare(b.position, undefined, { numeric: true }));
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

/** The whole PDF: every page's tables and plan labels, merged. */
export async function readPlotGeometry(data: Uint8Array): Promise<PlotGeometry> {
  // pdf.js ships as ESM only and this server is CommonJS, so it's loaded with a real dynamic
  // import (which TypeScript would otherwise rewrite to require()).
  const pdfjs = await (new Function('p', 'return import(p)') as (p: string) => Promise<PdfJs>)('pdfjs-dist/legacy/build/pdf.mjs');
  const doc = await pdfjs.getDocument({ data, isEvalSupported: false, useSystemFonts: false }).promise;
  let table: RiggingPoint[] = [];
  let plan: RiggingPoint[] = [];
  const tablePages: number[] = [];
  const planPages: number[] = [];
  let lxPanelFound = false;
  let anyText = false;
  try {
    for (let n = 1; n <= doc.numPages; n++) {
      const page = await doc.getPage(n);
      const content = await page.getTextContent();
      const items: TextItem[] = [];
      for (const it of content.items) {
        if (!('str' in it)) continue;
        items.push({ str: it.str, x: it.transform[4], y: it.transform[5], h: Math.hypot(it.transform[2], it.transform[3]) || undefined });
      }
      if (items.some((i) => i.str.trim())) anyText = true;
      if (items.some((i) => /\bLX\s*PANEL\b/i.test(i.str))) lxPanelFound = true;
      const t = parseRiggingPoints(items);
      if (t.length) {
        table = mergePoints(table, t);
        tablePages.push(n);
      }
      const p = parsePlanLabels(items);
      if (p.length) {
        plan = mergePoints(plan, p);
        planPages.push(n);
      }
    }
  } finally {
    await doc.destroy();
  }
  const { points, trusses } = groupIntoTrusses(mergePoints(table, plan));
  const notes: string[] = [];
  if (!anyText) notes.push('This PDF has no text to read (it may be a scan or have its text turned into outlines). Type the truss sizes in.');
  else if (!points.length) notes.push('No rigging points were found on this plot: no points table, and no motor labels with X and Y beside them. Type the truss sizes in, or ask the designer for the point list.');
  else {
    const from = [tablePages.length ? `the points table (page ${tablePages.join(', ')})` : '', planPages.length ? `the rigging plan's labels (page ${planPages.join(', ')})` : ''].filter(Boolean);
    notes.push(`${points.filter((p) => !p.cablePick).length} motors and ${points.filter((p) => p.cablePick).length} cable picks read from ${from.join(' and ')}.`);
    notes.push(`Truss lengths are taken as ${TRUSS_OVERHANG_M} m past the outer rigging points at each end.`);
    if (trusses.some((t) => !t.named)) notes.push('Some trusses aren\'t named on the plot, so they are named by where they hang. Link each to its patch position on the Rigging (beta) tab.');
  }
  if (lxPanelFound) notes.push('The plot marks the LX PANEL: measure the run from each cable pick to it and type it in as the distance to dimmer city.');
  notes.push('Trim height is not on the plot: the rules default is used unless you type one in.');
  return { points, trusses, lxPanelFound, notes };
}

/** Bumped whenever the reader changes what it reports, so plots read before are read again. */
export const PLOT_READER_VERSION = 3;

/** The cache key for a plot: its content plus the reader version. */
export function hashBytes(data: Uint8Array) {
  return `${crypto.createHash('sha256').update(data).digest('hex')}:v${PLOT_READER_VERSION}`;
}
