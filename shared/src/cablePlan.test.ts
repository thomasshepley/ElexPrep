import { test } from 'node:test';
import assert from 'node:assert/strict';
import { coverWithStock, DEFAULT_CABLE_RULES, fixtureTypeKey, matchFixtureProfile, normaliseCableRules, planCables, planPosition, type FixtureProfileLike, type PositionInput } from './cablePlan';
import { SEED_FIXTURE_PROFILES } from './cableFixtures';

const profiles: FixtureProfileLike[] = SEED_FIXTURE_PROFILES.map((p) => ({ ...p, typeKey: fixtureTypeKey(p.displayName) }));

function fixtures(type: string, from: number, to: number, universe: number) {
  const profile = matchFixtureProfile(type, profiles);
  return Array.from({ length: to - from + 1 }, (_, i) => ({ address: from + i, type, universe, profile }));
}

// The DS truss from the BOTM 2026 HQ3 plot (Cable Calculator Plan, section 5).
const ds: PositionInput = {
  name: 'DS',
  kind: 'TRUSS',
  lengthM: 8,
  distanceM: 12,
  pickOffsetM: 1.5,
  fixtures: [...fixtures('Diablo S', 105, 110, 1), ...fixtures('MAC Aura XB', 207, 210, 2), ...fixtures('Strike Array 2', 406, 410, 2)],
};

test('stock rounding: shortest single length, else fewest pieces', () => {
  assert.deepEqual(coverWithStock(23.6, [5, 10, 15, 20, 25, 30]), [25]);
  assert.deepEqual(coverWithStock(35, [5, 10, 15, 20, 25, 30]), [30, 5]);
  assert.deepEqual(coverWithStock(61, [5, 10, 15, 20, 25, 30]), [30, 30, 5]);
  assert.deepEqual(coverWithStock(0.4, [1, 2, 3, 5]), [1]);
});

test('profiles match patch names without the maker', () => {
  assert.equal(matchFixtureProfile('MAC Aura XB', profiles)?.displayName, 'Martin MAC Aura XB');
  assert.equal(matchFixtureProfile('BMFL Spot', profiles)?.displayName, 'Robe BMFL Spot');
  assert.equal(matchFixtureProfile('Strike Array 2', profiles)?.displayName, 'Chauvet Strike Array 2');
  assert.equal(matchFixtureProfile('Unknown Thing', profiles), null);
});

test('worked example: DS truss', () => {
  const p = planPosition(ds, DEFAULT_CABLE_RULES);
  assert.equal(p.fixtureCount, 15);
  assert.equal(p.circuits.value, 16, '15 fixtures plus one spare');
  assert.equal(p.socaCount.value, 3);
  assert.equal(p.loomRunM.value, 23.6, '6 m trim + 10% swag + 12 m + 3 m + 2 m');
  assert.deepEqual(p.socaLengthM.value, [25]);
  assert.deepEqual(p.socas.map((s) => s.extensionM), [[], [], [5]], 'one 5 m extension for the far fan-out');
  assert.deepEqual(p.socas.map((s) => s.fanout), ['TRUE1', 'TRUE1', 'TRUE1']);
  assert.deepEqual(p.socas.map((s) => s.circuitsUsed), [6, 6, 3]);
  // DMX from distro: one line per universe (6 and 9 devices), cut like the loom.
  assert.equal(p.data.policy, 'DMX_FROM_DISTRO');
  assert.deepEqual(p.data.lines.map((l) => [l.universe, l.devices, l.lengthM]), [[1, 6, [25]], [2, 9, [25]]]);
  assert.equal(p.jumpers.power.reduce((n, j) => n + j.count, 0), 15);
  assert.ok(p.assumed.some((a) => a.includes('Trim')), 'trim is marked as assumed');
});

test('worked example with a node per truss: one node, one 25 m Cat', () => {
  const p = planPosition(ds, { ...DEFAULT_CABLE_RULES, dataPolicy: 'NODE_PER_TRUSS' });
  assert.equal(p.data.node?.value, 1);
  assert.deepEqual(p.data.catLengthM, [25]);
  assert.equal(p.data.lines.length, 2);
});

test('a 16A fixture on a soca makes that spider 16A and says why', () => {
  const pos: PositionInput = { name: 'LX1', kind: 'TRUSS', lengthM: 10, fixtures: [...fixtures('MAC Aura XB', 1, 3, 1), ...fixtures('SGM Q-7', 4, 5, 1)] };
  const p = planPosition(pos, DEFAULT_CABLE_RULES);
  assert.equal(p.socas[0].fanout, 'CEE16');
  assert.deepEqual(p.socas[0].forced16A, ['SGM Q-7']);
  assert.ok(p.flags.some((f) => f.includes('mixes TRUE1')));
  assert.ok(p.flags.some((f) => f.includes('inrush')) === false);
});

test('unknown fixtures are flagged, DMX splits past the per-line limit', () => {
  const pos: PositionInput = { name: 'Floor', kind: 'FLOOR', fixtures: Array.from({ length: 20 }, (_, i) => ({ address: i + 1, type: 'Mystery Par', universe: 3, profile: null })) };
  const p = planPosition(pos, DEFAULT_CABLE_RULES);
  assert.ok(p.flags[0].includes('Mystery Par'));
  assert.equal(p.loomRunM.value, 17, 'floor: no drop, 12 m default + 3 + 2');
  assert.deepEqual(p.data.lines.map((l) => l.devices), [16, 4]);
});

test('chaining on a power thru when allowed', () => {
  const pos: PositionInput = { name: 'Wash', kind: 'TRUSS', lengthM: 12, trimM: 7, distanceM: 10, fixtures: fixtures('Chauvet Rogue R2X Wash', 1, 10, 1) };
  const off = planPosition(pos, DEFAULT_CABLE_RULES);
  const on = planPosition(pos, { ...DEFAULT_CABLE_RULES, allowChainWhenThru: true });
  assert.equal(off.circuits.value, 11);
  // 8 per line cap, and 8 x 344 W = 2752 W fits under 16A x 0.8 x 230 = 2944 W: two lines, plus a spare.
  assert.equal(on.circuits.value, 3);
});

test('job totals, motors in their own rigging section, phases', () => {
  const us: PositionInput = { ...ds, name: 'US', distanceM: 13, motors: 4 }; // 24.6 m, still 25 m stock
  const result = planCables([{ ...ds, motors: 4 }, us], DEFAULT_CABLE_RULES, ['MAC Viper Profile 501']);
  const qty = (label: string) => result.totals.find((t) => t.label === label)?.quantity ?? 0;
  assert.equal(qty('Socapex 16A 25 m'), 6);
  assert.equal(qty('Socapex 16A 5 m'), 2);
  assert.equal(qty('Socapex to 6 x TRUE1 spider'), 6);
  assert.equal(qty('5-pin DMX 25 m'), 4);
  const rigging = result.totals.filter((t) => t.section === 'RIGGING');
  assert.deepEqual(rigging.map((t) => [t.label, t.quantity]), [['Motor cable 25 m', 8], ['Motor controller (8-way)', 1]]);
  assert.equal(result.totals.at(-1)?.section, 'RIGGING', 'rigging listed after the lighting pack');
  assert.equal(result.distro.socaOuts, 6);
  assert.equal(result.distro.circuits, 30);
  assert.deepEqual(result.unplaced, ['MAC Viper Profile 501']);
});

test('stored rules are cleaned over the defaults', () => {
  const r = normaliseCableRules({ socaLengthsM: [30, 5, 'x' as unknown as number, 10], utilisation: 7, dataPolicy: 'NODE_PER_TRUSS' });
  assert.deepEqual(r.socaLengthsM, [5, 10, 30]);
  assert.equal(r.utilisation, DEFAULT_CABLE_RULES.utilisation);
  assert.equal(r.dataPolicy, 'NODE_PER_TRUSS');
});
