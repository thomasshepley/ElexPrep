/**
 * Rigging loads calculator: how much hangs on every hoist and venue point, against what the
 * point may carry. Pure and deterministic, like the cable calculator, so it runs in tests, in
 * the browser while a fixture is dragged, and on the server for a stored record.
 *
 * A hung truss is a beam: everything on it pushes down, the hoists hold it up. Two hoists split
 * the load by the lever rule (exact). Three or more are statically indeterminate (the split
 * depends on trim), so two answers are worked out: tributary (each span treated as simply
 * supported) and continuous beam (three-moment equation, all hoists dead level), and the
 * envelope takes the larger at each hoist. Loads are static; a fixed safety margin is added on
 * top. This is a planning estimate, never a structural sign-off.
 */

export type RigMethod = 'tributary' | 'continuous' | 'envelope';
export type LoadSource = 'truss' | 'fixture' | 'cable' | 'accessory' | 'other';
export type PointKind = 'hoist' | 'deadHang' | 'cablePick';
export type PointState = 'ok' | 'warning' | 'over' | 'unknown' | 'uplift';

export interface TrussLoadPoint {
  kind: 'point';
  /** Metres along the truss from its start. */
  x: number;
  kg: number;
  label: string;
  source: LoadSource;
  /** Lets the screen move this load (a fixture id). */
  ref?: string;
}

export interface TrussLoadUdl {
  kind: 'udl';
  from: number;
  to: number;
  kgPerM: number;
  label: string;
  source: LoadSource;
}

export type TrussLoad = TrussLoadPoint | TrussLoadUdl;

export interface HoistModelLike {
  id: string;
  name: string;
  ratedKg: number;
  /** D8, D8+, C1 */
  hoistClass: string;
  bodyKg: number;
  chainKgPerM: number;
  /** Chain in the bag: the full length is used, which is conservative. */
  chainM: number;
}

export interface RigPoint {
  id: string;
  name: string;
  /** Plan position, metres. */
  x: number;
  y: number;
  kind: PointKind;
  /** Venue point capacity (SWL). */
  capacityKg?: number | null;
  capacitySource?: 'PLOT' | 'VENUE' | 'MANUAL' | null;
  hoist?: HoistModelLike | null;
  /** Weight hanging straight off the point that isn't on a truss (e.g. the cable drop at a pick). */
  directLoads?: { kg: number; label: string; source: LoadSource }[];
}

export interface TrussProfileLike {
  id: string;
  name: string;
  kgPerM: number;
  /** Allowable uniformly distributed payload per metre by span (single span, two supports). */
  spanTable: { spanM: number; udlKgPerM: number }[];
  /** Longest cantilever as a share of the adjacent span. */
  cantileverRatio: number;
}

export interface RigTruss {
  id: string;
  name: string;
  lengthM: number;
  /** Plan position of the truss's start (x) and its line (y), metres. */
  originX: number;
  y: number;
  profile?: TrussProfileLike | null;
  hoists: { pointId: string; x: number }[];
  loads: TrussLoad[];
}

export interface RigSettings {
  method: RigMethod;
  /** Added on top of every static point load, percent. */
  marginPct: number;
  warnAtPct: number;
  overAtPct: number;
  /** Sling, shackle and motor control cable per point, kg. */
  riggingAllowanceKg: number;
  /** BS 7905-2 / ANSI E1.2-2006 factor on the truss span check. */
  trussFactor085: boolean;
}

export const DEFAULT_RIG_SETTINGS: RigSettings = {
  method: 'envelope',
  marginPct: 10,
  warnAtPct: 80,
  overAtPct: 100,
  riggingAllowanceKg: 3,
  trussFactor085: false,
};

export interface Rig {
  trusses: RigTruss[];
  points: RigPoint[];
  settings: RigSettings;
}

export interface PointResult {
  pointId: string;
  name: string;
  kind: PointKind;
  /** What the truss puts on the hook, by the chosen method. */
  trussReactionKg: number;
  byMethod: { tributary: number; continuous: number };
  breakdown: { truss: number; fixtures: number; cable: number; accessories: number; rigging: number; hoist: number; direct: number };
  /** Applied weight: truss reaction plus anything hung straight off the point, before motor and margin. */
  appliedKg: number;
  /** Before the margin: applied + hoist (body and chain) + rigging allowance. */
  staticKg: number;
  /** The headline: static total plus the safety margin. */
  pointLoadKg: number;
  capacityKg: number | null;
  capacitySource: RigPoint['capacitySource'] | null;
  utilisation: number | null;
  state: PointState;
  hoistRatedKg: number | null;
  overHoistRating: boolean;
  contributions: { label: string; kg: number; source: LoadSource | 'rigging' | 'hoist' | 'margin' }[];
  trussId: string | null;
}

export interface SpanCheck {
  from: string;
  to: string;
  lengthM: number;
  /** Payload on the span (everything except the truss's own weight). */
  loadKg: number;
  allowableKg: number | null;
  ok: boolean | null;
}

export interface TrussResult {
  trussId: string;
  name: string;
  hungKg: number;
  selfKg: number;
  spans: SpanCheck[];
  cantilevers: { end: 'start' | 'end'; lengthM: number; maxM: number | null; ok: boolean | null }[];
  indeterminate: boolean;
  /** The heaviest single item on the most loaded hoist: the first thing to move. */
  suggestion: string | null;
  notes: string[];
}

export interface RigResult {
  points: PointResult[];
  trusses: TrussResult[];
  totals: { hungKg: number; points: number; heaviest: { name: string; kg: number } | null; overCount: number; warningCount: number; unknownCount: number };
  notes: string[];
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/** Point loads standing in for a UDL, fine enough that the lever rule and beam maths are exact to well under 0.1 percent. */
function udlToPoints(load: TrussLoadUdl, cuts: number[]): TrussLoadPoint[] {
  const from = Math.min(load.from, load.to);
  const to = Math.max(load.from, load.to);
  if (to <= from || load.kgPerM === 0) return [];
  // Never let a slice straddle a hoist, so each slice belongs to one span.
  const edges = [from, ...cuts.filter((c) => c > from && c < to), to];
  const out: TrussLoadPoint[] = [];
  for (let i = 0; i < edges.length - 1; i++) {
    const a = edges[i];
    const b = edges[i + 1];
    const n = Math.max(1, Math.ceil((b - a) / 0.02));
    const step = (b - a) / n;
    for (let k = 0; k < n; k++) out.push({ kind: 'point', x: a + step * (k + 0.5), kg: load.kgPerM * step, label: load.label, source: load.source });
  }
  return out;
}

/** Simply supported span reactions for one point load. */
function simpleSpan(P: number, x: number, xa: number, xb: number): [number, number] {
  const L = xb - xa;
  return [(P * (xb - x)) / L, (P * (x - xa)) / L];
}

/**
 * Hoist reactions for a set of point loads. `continuous` solves the three-moment equation over
 * the interior hoists; otherwise interior moments are zero (tributary: each span on its own).
 * Loads beyond the outer hoists hang on the cantilever: their moment acts at the outer hoist in
 * both methods, which is what can lift the next hoist in (a negative reaction).
 */
export function hoistReactions(hoistXs: number[], loads: { x: number; kg: number }[], continuous: boolean): number[] {
  const n = hoistXs.length;
  const R = new Array(n).fill(0);
  if (n === 0) return R;
  const total = loads.reduce((s, l) => s + l.kg, 0);
  if (n === 1) {
    R[0] = total;
    return R;
  }
  const xs = hoistXs;
  const first = xs[0];
  const last = xs[n - 1];
  // End moments from the cantilevers (hogging, negative).
  const M = new Array(n).fill(0);
  for (const l of loads) {
    if (l.x < first) {
      M[0] -= l.kg * (first - l.x);
      R[0] += l.kg;
    } else if (l.x > last) {
      M[n - 1] -= l.kg * (l.x - last);
      R[n - 1] += l.kg;
    }
  }
  const spanLoads: { x: number; kg: number }[][] = Array.from({ length: n - 1 }, () => []);
  for (const l of loads) {
    if (l.x < first || l.x > last) continue;
    let i = 0;
    while (i < n - 2 && l.x > xs[i + 1]) i++;
    spanLoads[i].push(l);
  }
  if (continuous && n >= 3) {
    // Clapeyron: M[i-1] L1 + 2 M[i] (L1 + L2) + M[i+1] L2 = -(left span term) - (right span term)
    const m = n - 2;
    const a = new Array(m).fill(0);
    const b = new Array(m).fill(0);
    const c = new Array(m).fill(0);
    const d = new Array(m).fill(0);
    for (let k = 0; k < m; k++) {
      const i = k + 1;
      const L1 = xs[i] - xs[i - 1];
      const L2 = xs[i + 1] - xs[i];
      a[k] = L1;
      b[k] = 2 * (L1 + L2);
      c[k] = L2;
      let rhs = 0;
      for (const l of spanLoads[i - 1]) {
        const dist = l.x - xs[i - 1];
        rhs -= (l.kg * dist * (L1 * L1 - dist * dist)) / L1;
      }
      for (const l of spanLoads[i]) {
        const dist = xs[i + 1] - l.x;
        rhs -= (l.kg * dist * (L2 * L2 - dist * dist)) / L2;
      }
      if (k === 0) rhs -= L1 * M[0];
      if (k === m - 1) rhs -= L2 * M[n - 1];
      d[k] = rhs;
    }
    // Thomas algorithm.
    for (let k = 1; k < m; k++) {
      const w = a[k] / b[k - 1];
      b[k] -= w * c[k - 1];
      d[k] -= w * d[k - 1];
    }
    const sol = new Array(m).fill(0);
    sol[m - 1] = d[m - 1] / b[m - 1];
    for (let k = m - 2; k >= 0; k--) sol[k] = (d[k] - c[k] * sol[k + 1]) / b[k];
    for (let k = 0; k < m; k++) M[k + 1] = sol[k];
  }
  for (let i = 0; i < n - 1; i++) {
    const L = xs[i + 1] - xs[i];
    for (const l of spanLoads[i]) {
      const [ra, rb] = simpleSpan(l.kg, l.x, xs[i], xs[i + 1]);
      R[i] += ra;
      R[i + 1] += rb;
    }
    // End moments on this span (continuous interior moments, or the cantilever moments).
    const corr = (M[i + 1] - M[i]) / L;
    R[i] += corr;
    R[i + 1] -= corr;
  }
  return R;
}

function interpolateUdl(table: { spanM: number; udlKgPerM: number }[], span: number): number | null {
  const t = [...table].filter((r) => r.spanM > 0 && r.udlKgPerM > 0).sort((a, b) => a.spanM - b.spanM);
  if (t.length === 0) return null;
  if (span <= t[0].spanM) return t[0].udlKgPerM;
  // Beyond the longest published span the maker gives no figure: say so rather than guess.
  if (span > t[t.length - 1].spanM + 1e-9) return null;
  for (let i = 0; i < t.length - 1; i++) {
    if (span >= t[i].spanM && span <= t[i + 1].spanM) {
      const f = (span - t[i].spanM) / (t[i + 1].spanM - t[i].spanM);
      return t[i].udlKgPerM + f * (t[i + 1].udlKgPerM - t[i].udlKgPerM);
    }
  }
  return t[t.length - 1].udlKgPerM;
}

function stateFor(util: number | null, reaction: number, s: RigSettings): PointState {
  if (reaction < -0.05) return 'uplift';
  if (util === null) return 'unknown';
  if (util * 100 >= s.overAtPct) return 'over';
  if (util * 100 >= s.warnAtPct) return 'warning';
  return 'ok';
}

const bucketOf = (source: LoadSource): keyof PointResult['breakdown'] =>
  source === 'truss' ? 'truss' : source === 'fixture' ? 'fixtures' : source === 'cable' ? 'cable' : 'accessories';

/** Works out every point and truss on the rig. */
export function solveRig(rig: Rig): RigResult {
  const s = rig.settings;
  const notes: string[] = [];
  const pointById = new Map(rig.points.map((p) => [p.id, p]));
  const reactions = new Map<string, { trib: number; cont: number; parts: Map<string, { kg: number; source: LoadSource }>; trussId: string }>();
  const trussResults: TrussResult[] = [];

  for (const t of rig.trusses) {
    const hoists = [...t.hoists].filter((h) => pointById.has(h.pointId)).sort((a, b) => a.x - b.x);
    const tNotes: string[] = [];
    const xs = hoists.map((h) => h.x);
    const loads: TrussLoad[] = [...t.loads];
    if (t.profile && t.lengthM > 0) loads.push({ kind: 'udl', from: 0, to: t.lengthM, kgPerM: t.profile.kgPerM, label: `${t.profile.name} self-weight`, source: 'truss' });
    const points: TrussLoadPoint[] = loads.flatMap((l) => (l.kind === 'point' ? [l] : udlToPoints(l, xs)));
    const selfKg = points.filter((p) => p.source === 'truss').reduce((n, p) => n + p.kg, 0);
    const hungKg = points.reduce((n, p) => n + p.kg, 0);
    if (!t.profile) tNotes.push('No truss profile chosen: its own weight is not included');
    if (hoists.length === 0) {
      tNotes.push('No hoists on this truss yet');
      trussResults.push({ trussId: t.id, name: t.name, hungKg: round1(hungKg), selfKg: round1(selfKg), spans: [], cantilevers: [], indeterminate: false, suggestion: null, notes: tNotes });
      continue;
    }

    // Each load's share, kept per label so the breakdown can say what is on each hoist.
    const byLabel = new Map<string, { source: LoadSource; pts: { x: number; kg: number }[] }>();
    for (const p of points) {
      const key = p.label;
      if (!byLabel.has(key)) byLabel.set(key, { source: p.source, pts: [] });
      byLabel.get(key)!.pts.push({ x: p.x, kg: p.kg });
    }
    const tribTotal = new Array(hoists.length).fill(0);
    const contTotal = new Array(hoists.length).fill(0);
    const partsPerHoist = hoists.map(() => new Map<string, { kg: number; source: LoadSource }>());
    for (const [label, { source, pts }] of byLabel) {
      const tr = hoistReactions(xs, pts, false);
      const co = hoistReactions(xs, pts, true);
      tr.forEach((v, i) => (tribTotal[i] += v));
      co.forEach((v, i) => (contTotal[i] += v));
      const chosen = s.method === 'continuous' ? co : s.method === 'tributary' ? tr : co.map((v, i) => (Math.abs(v) > Math.abs(tr[i]) ? v : tr[i]));
      chosen.forEach((v, i) => partsPerHoist[i].set(label, { kg: v, source }));
    }
    hoists.forEach((h, i) => {
      const prev = reactions.get(h.pointId);
      if (prev) {
        // A point shared by two trusses (a corner) carries both.
        prev.trib += tribTotal[i];
        prev.cont += contTotal[i];
        for (const [k, v] of partsPerHoist[i]) prev.parts.set(`${t.name}: ${k}`, v);
      } else reactions.set(h.pointId, { trib: tribTotal[i], cont: contTotal[i], parts: partsPerHoist[i], trussId: t.id });
    });

    // Span and cantilever checks.
    const factor = s.trussFactor085 ? 0.85 : 1;
    const spans: SpanCheck[] = [];
    for (let i = 0; i < hoists.length - 1; i++) {
      const a = xs[i];
      const b = xs[i + 1];
      const L = b - a;
      const loadKg = points.filter((p) => p.source !== 'truss' && p.x >= a && p.x < b).reduce((n, p) => n + p.kg, 0);
      const udl = t.profile ? interpolateUdl(t.profile.spanTable, L) : null;
      const allowableKg = udl === null ? null : udl * L * factor;
      spans.push({
        from: pointById.get(hoists[i].pointId)!.name,
        to: pointById.get(hoists[i + 1].pointId)!.name,
        lengthM: round1(L * 100) / 100,
        loadKg: round1(loadKg),
        allowableKg: allowableKg === null ? null : round1(allowableKg),
        ok: allowableKg === null ? null : loadKg <= allowableKg,
      });
      if (t.profile && udl === null) tNotes.push(`${round1(L)} m span is beyond ${t.profile.name}'s published table`);
    }
    const cantilevers: TrussResult['cantilevers'] = [];
    const startCant = xs[0];
    const endCant = t.lengthM - xs[xs.length - 1];
    const ratio = t.profile?.cantileverRatio ?? null;
    if (startCant > 0.01) {
      const adj = xs.length > 1 ? xs[1] - xs[0] : null;
      const maxM = ratio && adj ? adj * ratio : null;
      cantilevers.push({ end: 'start', lengthM: round1(startCant * 100) / 100, maxM: maxM === null ? null : round1(maxM * 100) / 100, ok: maxM === null ? null : startCant <= maxM + 1e-9 });
    }
    if (endCant > 0.01) {
      const adj = xs.length > 1 ? xs[xs.length - 1] - xs[xs.length - 2] : null;
      const maxM = ratio && adj ? adj * ratio : null;
      cantilevers.push({ end: 'end', lengthM: round1(endCant * 100) / 100, maxM: maxM === null ? null : round1(maxM * 100) / 100, ok: maxM === null ? null : endCant <= maxM + 1e-9 });
    }
    const indeterminate = hoists.length >= 3;
    if (indeterminate) tNotes.push('On three or more hoists the split depends on how level the truss is trimmed: check on site with load cells');

    // What to move: the heaviest single fixture on the busiest hoist.
    let suggestion: string | null = null;
    const busiest = (s.method === 'tributary' ? tribTotal : contTotal).reduce((bi, v, i, arr) => (v > arr[bi] ? i : bi), 0);
    const heavy = [...partsPerHoist[busiest].entries()].filter(([, v]) => v.source === 'fixture').sort((a, b) => b[1].kg - a[1].kg)[0];
    if (heavy) suggestion = `${heavy[0]} puts ${round1(heavy[1].kg)} kg on ${pointById.get(hoists[busiest].pointId)!.name}, the busiest point on this truss`;

    trussResults.push({ trussId: t.id, name: t.name, hungKg: round1(hungKg), selfKg: round1(selfKg), spans, cantilevers, indeterminate, suggestion, notes: tNotes });
  }

  const results: PointResult[] = rig.points.map((p) => {
    const r = reactions.get(p.id);
    const trib = r?.trib ?? 0;
    const cont = r?.cont ?? 0;
    const reaction = s.method === 'tributary' ? trib : s.method === 'continuous' ? cont : Math.max(trib, cont);
    const breakdown = { truss: 0, fixtures: 0, cable: 0, accessories: 0, rigging: 0, hoist: 0, direct: 0 };
    const contributions: PointResult['contributions'] = [];
    for (const [label, v] of r?.parts ?? []) {
      breakdown[bucketOf(v.source)] += v.kg;
      contributions.push({ label, kg: v.kg, source: v.source });
    }
    // The envelope picks the larger method per point; scale the parts so they add up to it.
    const partsSum = contributions.reduce((n, c) => n + c.kg, 0);
    if (Math.abs(partsSum) > 1e-6 && Math.abs(partsSum - reaction) > 1e-6) {
      const f = reaction / partsSum;
      for (const c of contributions) c.kg *= f;
      for (const k of ['truss', 'fixtures', 'cable', 'accessories'] as const) breakdown[k] *= f;
    }
    for (const d of p.directLoads ?? []) {
      breakdown.direct += d.kg;
      contributions.push({ label: d.label, kg: d.kg, source: d.source });
    }
    const appliedKg = reaction + breakdown.direct;
    const hoistKg = p.hoist ? p.hoist.bodyKg + p.hoist.chainKgPerM * p.hoist.chainM : 0;
    if (p.hoist) {
      breakdown.hoist = hoistKg;
      contributions.push({ label: `${p.hoist.name} (body and ${p.hoist.chainM} m chain)`, kg: hoistKg, source: 'hoist' });
    }
    const rigging = p.kind === 'hoist' || p.kind === 'deadHang' ? s.riggingAllowanceKg : 0;
    if (rigging) {
      breakdown.rigging = rigging;
      contributions.push({ label: 'Rigging allowance (sling, shackle, control cable)', kg: rigging, source: 'rigging' });
    }
    const staticKg = appliedKg + hoistKg + rigging;
    const margin = (staticKg * s.marginPct) / 100;
    if (margin) contributions.push({ label: `Safety margin (+${s.marginPct}%)`, kg: margin, source: 'margin' });
    const pointLoadKg = staticKg + margin;
    const capacityKg = p.capacityKg && p.capacityKg > 0 ? p.capacityKg : null;
    const utilisation = capacityKg ? pointLoadKg / capacityKg : null;
    // A hoist only lifts what hangs below its hook: the truss reaction and rigging, not its own body.
    const onHook = appliedKg + rigging;
    return {
      pointId: p.id,
      name: p.name,
      kind: p.kind,
      trussReactionKg: round1(reaction),
      byMethod: { tributary: round1(trib), continuous: round1(cont) },
      breakdown: Object.fromEntries(Object.entries(breakdown).map(([k, v]) => [k, round1(v)])) as PointResult['breakdown'],
      appliedKg: round1(appliedKg),
      staticKg: round1(staticKg),
      pointLoadKg: round1(pointLoadKg),
      capacityKg,
      capacitySource: p.capacitySource ?? null,
      utilisation: utilisation === null ? null : Math.round(utilisation * 1000) / 1000,
      state: stateFor(utilisation, reaction, s),
      hoistRatedKg: p.hoist?.ratedKg ?? null,
      overHoistRating: Boolean(p.hoist && onHook * (1 + s.marginPct / 100) > p.hoist.ratedKg),
      contributions: contributions.map((c) => ({ ...c, kg: round1(c.kg) })).sort((a, b) => b.kg - a.kg),
      trussId: r?.trussId ?? null,
    };
  });

  const hungKg = trussResults.reduce((n, t) => n + t.hungKg, 0) + rig.points.reduce((n, p) => n + (p.directLoads ?? []).reduce((m, d) => m + d.kg, 0), 0);
  const heaviest = results.reduce<PointResult | null>((best, r) => (!best || r.pointLoadKg > best.pointLoadKg ? r : best), null);
  if (rig.trusses.some((t) => t.hoists.length >= 3)) {
    notes.push(
      s.method === 'envelope'
        ? 'Trusses on three or more hoists: each point shows the larger of the tributary and continuous-beam answers'
        : `Trusses on three or more hoists use the ${s.method === 'tributary' ? 'tributary' : 'continuous-beam'} method`
    );
  }
  notes.push(`Static loads plus a ${s.marginPct}% safety margin. No dynamic forces, technician weight, bridles, wind or truss deflection.`);
  return {
    points: results,
    trusses: trussResults,
    totals: {
      hungKg: round1(hungKg),
      points: results.length,
      heaviest: heaviest ? { name: heaviest.name, kg: heaviest.pointLoadKg } : null,
      overCount: results.filter((r) => r.state === 'over' || r.state === 'uplift').length,
      warningCount: results.filter((r) => r.state === 'warning').length,
      unknownCount: results.filter((r) => r.state === 'unknown').length,
    },
    notes,
  };
}

/** The line every rigging view and export carries. */
export const RIGGING_DISCLAIMER =
  'Planning estimate. Static loads plus a safety margin; no dynamic forces or technician weight. Subject to approval by the venue and a competent rigger.';
