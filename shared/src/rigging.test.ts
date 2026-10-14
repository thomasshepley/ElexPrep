import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_RIG_SETTINGS, hoistReactions, solveRig, type Rig, type TrussLoad } from './rigging';

const near = (a: number, b: number, tol: number, msg?: string) => assert.ok(Math.abs(a - b) <= tol, `${msg ?? ''} expected ${b} ± ${tol}, got ${a}`);
const udl = (from: number, to: number, w: number) => {
  const pts = [];
  const n = Math.round((to - from) / 0.01);
  for (let i = 0; i < n; i++) pts.push({ x: from + (i + 0.5) * 0.01, kg: w * 0.01 });
  return pts;
};

test('reactions always add up to the load, for every method', () => {
  const loads = [{ x: -0.6, kg: 20 }, { x: 1.1, kg: 33 }, { x: 4.4, kg: 12 }, { x: 7.9, kg: 40 }];
  for (const xs of [[0, 8], [0, 4, 8], [0, 2, 5, 8]]) {
    for (const cont of [false, true]) {
      const r = hoistReactions(xs, loads, cont);
      near(r.reduce((a, b) => a + b, 0), 105, 1e-6, `${xs.length} hoists ${cont}`);
    }
  }
});

test('a point load mid-span of two hoists: half each', () => {
  assert.deepEqual(hoistReactions([0, 6], [{ x: 3, kg: 100 }], false), [50, 50]);
});

test('cantilever: P(L+a)/L on the outer hoist, -Pa/L on the inner', () => {
  const [r1, r2] = hoistReactions([1, 7], [{ x: 0, kg: 60 }], false);
  near(r1, (60 * 7) / 6, 1e-9);
  near(r2, -(60 * 1) / 6, 1e-9);
});

test('continuous beam: two equal spans under a UDL give 18.75 / 62.5 / 18.75 percent', () => {
  const r = hoistReactions([0, 5, 10], udl(0, 10, 10), true);
  near(r[0] / 100, 0.1875, 0.001);
  near(r[1] / 100, 0.625, 0.001);
  near(r[2] / 100, 0.1875, 0.001);
});

test('continuous beam: three equal spans give 13.3 / 36.7 / 36.7 / 13.3 percent', () => {
  const r = hoistReactions([0, 4, 8, 12], udl(0, 12, 10), true).map((v) => v / 120);
  [0.1333, 0.3667, 0.3667, 0.1333].forEach((want, i) => near(r[i], want, 0.001));
});

// The research's worked example: 8 m Prolyte H30V on four hoists, fifteen 23.2 kg fixtures at the
// centres of fifteen equal slots along the truss.
function worked(method: 'tributary' | 'continuous' | 'envelope'): Rig {
  const loads: TrussLoad[] = Array.from({ length: 15 }, (_, i) => ({ kind: 'point', x: (i + 0.5) * (8 / 15), kg: 23.2, label: `Fixture ${i + 1}`, source: 'fixture' }));
  const hoist = { id: 'h', name: 'Lodestar 500 kg', ratedKg: 500, hoistClass: 'D8+', bodyKg: 35, chainKgPerM: 1.2, chainM: 11.67 };
  const points = [-3.5, -1.5, 1.5, 3.5].map((x, i) => ({ id: `P${i + 1}`, name: `P${i + 1}`, x, y: 0, kind: 'hoist' as const, capacityKg: 180, hoist }));
  return {
    trusses: [
      {
        id: 'T',
        name: 'LX1',
        lengthM: 8,
        originX: -4,
        y: 0,
        profile: { id: 'h30v', name: 'Prolyte H30V', kgPerM: 6.3, spanTable: [{ spanM: 6, udlKgPerM: 322 }, { spanM: 8, udlKgPerM: 194 }], cantileverRatio: 1 / 6 },
        hoists: [0.5, 2.5, 5.5, 7.5].map((x, i) => ({ pointId: `P${i + 1}`, x })),
        loads,
      },
    ],
    points,
    settings: { ...DEFAULT_RIG_SETTINGS, method, marginPct: 0, riggingAllowanceKg: 2 },
  };
}

test('worked example: tributary about 79 / 120 kg, continuous about 61 / 138 kg on the truss', () => {
  const trib = solveRig(worked('tributary')).points.map((p) => p.trussReactionKg);
  const cont = solveRig(worked('continuous')).points.map((p) => p.trussReactionKg);
  near(trib[0], 79, 2, 'tributary outer');
  near(trib[1], 120, 2, 'tributary inner');
  near(cont[0], 61, 0.5, 'continuous outer');
  near(cont[1], 138, 0.5, 'continuous inner');
  near(trib.reduce((a, b) => a + b, 0), 15 * 23.2 + 8 * 6.3, 0.2, 'everything accounted for');
});

test('worked example point loads: hoist and rigging added, the envelope takes the larger', () => {
  const env = solveRig(worked('envelope'));
  const inner = env.points[1];
  // 35 kg body + 14 kg chain + 2 kg rigging on top of the larger (continuous) reaction.
  near(inner.pointLoadKg, inner.byMethod.continuous + 35 + 14 + 2, 0.3);
  assert.equal(inner.trussReactionKg, Math.max(inner.byMethod.tributary, inner.byMethod.continuous));
  assert.equal(inner.state, 'over', 'over the 180 kg point by the envelope');
  assert.ok(env.trusses[0].indeterminate);
});

test('margin, states, unknown capacity, uplift and the hoist rating', () => {
  const rig = worked('tributary');
  rig.settings.marginPct = 10;
  rig.points[0].capacityKg = null;
  const res = solveRig(rig);
  assert.equal(res.points[0].state, 'unknown');
  near(res.points[1].pointLoadKg, res.points[1].staticKg * 1.1, 0.2);
  assert.ok(res.points[1].contributions.some((c) => c.source === 'margin'));

  // A heavy load on a long cantilever lifts the inner hoist.
  const lift: Rig = {
    trusses: [{ id: 'T', name: 'T', lengthM: 6, originX: 0, y: 0, profile: null, hoists: [{ pointId: 'A', x: 2 }, { pointId: 'B', x: 6 }], loads: [{ kind: 'point', x: 0, kg: 100, label: 'Big thing', source: 'fixture' }] }],
    points: [
      { id: 'A', name: 'A', x: 2, y: 0, kind: 'hoist', capacityKg: 500 },
      { id: 'B', name: 'B', x: 6, y: 0, kind: 'hoist', capacityKg: 500 },
    ],
    settings: DEFAULT_RIG_SETTINGS,
  };
  const r = solveRig(lift);
  assert.equal(r.points[1].state, 'uplift');
  assert.equal(r.trusses[0].cantilevers[0].lengthM, 2);
});

test('span check against the profile table, with the 0.85 switch', () => {
  const rig = worked('tributary');
  const t = solveRig(rig).trusses[0];
  assert.equal(t.spans.length, 3);
  // 3 m middle span: the table starts at 6 m, so the 6 m figure is used (conservative for a shorter span).
  assert.equal(t.spans[1].allowableKg, 322 * 3);
  rig.settings.trussFactor085 = true;
  assert.equal(solveRig(rig).trusses[0].spans[1].allowableKg, Math.round(322 * 3 * 0.85 * 10) / 10);
  // Cantilevers 0.5 m against a sixth of the 2 m end span (0.33 m): flagged.
  assert.equal(solveRig(rig).trusses[0].cantilevers[0].ok, false);
});

test('direct loads (a cable drop at a pick) count on the point, not a truss', () => {
  const r = solveRig({
    trusses: [],
    points: [{ id: 'CP', name: 'CP-1', x: 5.5, y: -3.6, kind: 'cablePick', capacityKg: 180, directLoads: [{ kg: 50, label: 'Cable drop', source: 'cable' }] }],
    settings: DEFAULT_RIG_SETTINGS,
  });
  assert.equal(r.points[0].appliedKg, 50);
  assert.equal(r.points[0].pointLoadKg, 55, 'no rigging allowance on a pick, plus 10%');
});
