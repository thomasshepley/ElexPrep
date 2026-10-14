import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_CABLE_SPECS,
  DEFAULT_PACK_SETTINGS,
  DEFAULT_TRUNK_SETTINGS,
  buildManifest,
  classifyCable,
  matchFixtureCase,
  matchItemRule,
  planCableTrunks,
  planTruckPack,
  type CaseSpecLike,
  type ManifestLine,
  type VehicleLike,
} from './truckPack';

const caseSpec = (id: string, l: number, w: number, h: number, kg: number, extra: Partial<CaseSpecLike> = {}): CaseSpecLike => ({
  id,
  name: id,
  lengthMm: l,
  widthMm: w,
  heightMm: h,
  emptyKg: kg,
  maxStack: 2,
  canGoOnTop: true,
  canRotate: true,
  category: 'FIXTURES',
  holds: 2,
  ...extra,
});
const line = (key: string, caseId: string, cases: number, kgEach: number, category: ManifestLine['category'] = 'FIXTURES'): ManifestLine => ({
  key,
  label: key,
  caseId,
  cases,
  kgEach,
  category,
  contents: '',
  source: 'MANUAL',
});
const van: VehicleLike = { id: 'van', name: 'Van', lengthMm: 4000, widthMm: 2000, heightMm: 2150, payloadKg: 1000 };
const truck: VehicleLike = { id: 'truck', name: '7.5 t', lengthMm: 6100, widthMm: 2350, heightMm: 2400, payloadKg: 2500 };
const artic: VehicleLike = { id: 'artic', name: 'Artic', lengthMm: 13620, widthMm: 2460, heightMm: 2700, payloadKg: 24000 };

test('cases of the same kind stack up to their limit and the roof', () => {
  const trunk = caseSpec('trunk', 1240, 640, 780, 36, { maxStack: 3, category: 'CABLE' });
  const r = planTruckPack([line('t', 'trunk', 6, 120, 'CABLE')], [trunk], [artic], DEFAULT_PACK_SETTINGS, { vehicleId: 'artic' });
  const p = r.packs[0];
  assert.equal(p.cases, 6);
  // Triple stacked: 3 x 780 = 2,340 mm under a 2,700 mm roof.
  assert.deepEqual(p.stacks.map((s) => s.cases.length), [3, 3]);
  // In a 2,150 mm Luton only two fit under the roof.
  const r2 = planTruckPack([line('t', 'trunk', 6, 120, 'CABLE')], [trunk], [{ ...van, payloadKg: 5000 }], DEFAULT_PACK_SETTINGS);
  assert.ok(r2.packs[0].stacks.every((s) => s.cases.length <= 2));
  assert.equal(r2.packs[0].stacks.length, 3);
});

test('a case that may not be stacked stands alone', () => {
  const desk = caseSpec('desk', 1500, 900, 500, 70, { maxStack: 1, canGoOnTop: false, category: 'CONTROL' });
  const r = planTruckPack([line('d', 'desk', 2, 70, 'CONTROL')], [desk], [truck], DEFAULT_PACK_SETTINGS);
  assert.equal(r.packs[0].stacks.length, 2);
  assert.ok(r.packs[0].stacks.every((s) => s.cases.length === 1));
});

test('the smallest vehicle that takes the whole load is chosen, by space and by weight', () => {
  const c = caseSpec('c', 1200, 600, 900, 40);
  // 8 cases, double stacked: 4 stacks of 1200 x 600 fit a Luton floor (4.0 x 2.0 m).
  const light = planTruckPack([line('a', 'c', 8, 80)], [c], [artic, truck, van], DEFAULT_PACK_SETTINGS);
  assert.equal(light.smallestId, 'van');
  // Same cases, too heavy for the van's 1,000 kg payload.
  const heavy = planTruckPack([line('a', 'c', 8, 200)], [c], [artic, truck, van], DEFAULT_PACK_SETTINGS);
  assert.equal(heavy.smallestId, 'truck');
  assert.equal(heavy.checks.find((x) => x.vehicleId === 'van')!.reason, 'Too heavy');
});

test('stacks never overlap and stay inside the load space', () => {
  const a = caseSpec('a', 1200, 600, 900, 40);
  const b = caseSpec('b', 800, 600, 700, 30, { category: 'RIGGING' });
  const t = caseSpec('t', 1240, 640, 780, 36, { maxStack: 3, category: 'CABLE' });
  const r = planTruckPack([line('a', 'a', 17, 70), line('b', 'b', 9, 60, 'RIGGING'), line('t', 't', 11, 150, 'CABLE')], [a, b, t], [artic], DEFAULT_PACK_SETTINGS);
  const s = r.packs[0].stacks;
  assert.equal(r.packs[0].cases, 37);
  for (const x of s) {
    assert.ok(x.xMm >= 0 && x.yMm >= 0 && x.xMm + x.lengthMm <= artic.lengthMm && x.yMm + x.widthMm <= artic.widthMm);
    assert.ok(x.heightMm <= artic.heightMm - DEFAULT_PACK_SETTINGS.clearanceMm);
    for (const y of s) {
      if (x === y) continue;
      const overlap = x.xMm < y.xMm + y.lengthMm && y.xMm < x.xMm + x.lengthMm && x.yMm < y.yMm + y.widthMm && y.yMm < x.yMm + x.widthMm;
      assert.ok(!overlap, `${x.id} overlaps ${y.id}`);
    }
  }
});

test('what is needed first at the venue is loaded last, by the doors', () => {
  const a = caseSpec('fx', 1200, 600, 900, 40);
  const m = caseSpec('motor', 600, 600, 800, 22, { category: 'RIGGING' });
  const r = planTruckPack([line('m', 'motor', 4, 80, 'RIGGING'), line('f', 'fx', 8, 70)], [a, m], [artic], DEFAULT_PACK_SETTINGS);
  const s = r.packs[0].stacks;
  const lastFixture = Math.max(...s.filter((x) => x.category === 'FIXTURES').map((x) => x.step));
  const firstRigging = Math.min(...s.filter((x) => x.category === 'RIGGING').map((x) => x.step));
  assert.ok(firstRigging > lastFixture, 'rigging goes in after the fixtures');
  // Steps run from the cab back.
  for (let i = 1; i < s.length; i++) assert.ok(s[i].xMm >= s[i - 1].xMm);
});

test('a narrow case needed early never slips into a gap by the cab', () => {
  const fx = caseSpec('fx', 1200, 1000, 900, 40, { canRotate: false });
  const truss = caseSpec('truss', 3000, 290, 290, 19, { category: 'RIGGING', canRotate: false, maxStack: 6 });
  // Two fixture cases leave a 460 mm strip down the side that a truss section would fit in.
  const r = planTruckPack([line('f', 'fx', 2, 70), line('t', 'truss', 1, 19, 'RIGGING')], [fx, truss], [artic], DEFAULT_PACK_SETTINGS);
  const t = r.packs[0].stacks.find((x) => x.category === 'RIGGING')!;
  const lastFx = Math.max(...r.packs[0].stacks.filter((x) => x.category === 'FIXTURES').map((x) => x.xMm));
  assert.ok(t.xMm >= lastFx);
});

test('heavier cases go at the bottom and a lighter smaller case may top up a stack', () => {
  const big = caseSpec('big', 1200, 600, 900, 40, { maxStack: 2 });
  const small = caseSpec('small', 600, 600, 600, 20, { maxStack: 3 });
  const r = planTruckPack([line('big', 'big', 1, 120), line('small', 'small', 1, 30)], [big, small], [truck], DEFAULT_PACK_SETTINGS);
  const s = r.packs[0].stacks;
  assert.equal(s.length, 1, 'the small case goes on the big one');
  assert.equal(s[0].cases[0].caseId, 'big');
  assert.equal(s[0].cases[1].caseId, 'small');
  // Not when mixing is off.
  const r2 = planTruckPack([line('big', 'big', 1, 120), line('small', 'small', 1, 30)], [big, small], [truck], { ...DEFAULT_PACK_SETTINGS, mixedStacking: false });
  assert.equal(r2.packs[0].stacks.length, 2);
});

test('wheel arches narrow the floor of a van', () => {
  const wide = caseSpec('wide', 1600, 600, 600, 20, { canRotate: false, maxStack: 1 });
  const archVan: VehicleLike = { id: 'sprinter', name: 'Sprinter', lengthMm: 4300, widthMm: 1780, heightMm: 1950, payloadKg: 1200, arch: { fromMm: 2300, toMm: 3300, clearWidthMm: 1350 } };
  const r = planTruckPack([line('w', 'wide', 4, 30)], [wide], [archVan], DEFAULT_PACK_SETTINGS);
  for (const s of r.packs[0].stacks) {
    const overArch = s.xMm < 3300 && s.xMm + s.lengthMm > 2300;
    if (overArch) assert.ok(s.yMm >= (1780 - 1350) / 2 - 1 && s.yMm + s.widthMm <= 1780 - (1780 - 1350) / 2 + 1);
  }
});

test('a case taller than the doors is never packed', () => {
  const tall = caseSpec('tall', 1000, 600, 1500, 30);
  const r = planTruckPack([line('t', 'tall', 1, 30)], [tall], [{ ...van, doorHeightMm: 1400 }], DEFAULT_PACK_SETTINGS);
  assert.equal(r.packs[0]?.unplaced?.[0]?.reason ?? r.checks[0].reason, 'Taller than the doors');
});

test('a load too big for one vehicle splits across several', () => {
  const c = caseSpec('c', 1200, 600, 900, 40);
  const r = planTruckPack([line('a', 'c', 40, 100)], [c], [van, truck], DEFAULT_PACK_SETTINGS);
  assert.equal(r.smallestId, null);
  assert.ok(r.split);
  assert.equal(r.packs.reduce((n, p) => n + p.cases, 0), 40);
  assert.ok(r.packs.every((p) => p.kg <= p.payloadKg));
});

test('the centre of weight is reported and an uneven load flagged', () => {
  const c = caseSpec('c', 1200, 600, 900, 40, { canRotate: false });
  // One heavy case sits against the left wall at the cab.
  const r = planTruckPack([line('a', 'c', 1, 400)], [c], [truck], DEFAULT_PACK_SETTINGS);
  const p = r.packs[0];
  assert.ok(p.cog!.yPct < 40);
  assert.ok(p.flags.some((f) => /left side/.test(f)));
});

test('cable names are read for type and length', () => {
  assert.deepEqual(classifyCable('Socapex 16A 20m'), { kind: 'SOCA', lengthM: 20 });
  assert.deepEqual(classifyCable('5-pin DMX 10 m'), { kind: 'DMX', lengthM: 10 });
  assert.deepEqual(classifyCable('Socapex to 6 x TRUE1 spider'), { kind: 'SPIDER', lengthM: null });
  assert.deepEqual(classifyCable('Cat6 etherCON 50 m'), { kind: 'CAT', lengthM: 50 });
  assert.deepEqual(classifyCable('Motor cable 20 m'), { kind: 'MOTOR', lengthM: 20 });
  assert.equal(classifyCable('Robe MegaPointe'), null);
  assert.equal(classifyCable('DMX node (8-port)'), null);
});

test('cable trunks are counted by weight or by space, whichever is more', () => {
  const t = { ...DEFAULT_TRUNK_SETTINGS, caseId: 'trunk' };
  // Ten 20 m socas (226 kg) go in one trunk; twenty (452 kg) need two, by weight.
  assert.equal(planCableTrunks([{ name: 'Socapex 20m', kind: 'SOCA', lengthM: 20, quantity: 10 }], DEFAULT_CABLE_SPECS, t)[0].trunks, 1);
  const [soca] = planCableTrunks([{ name: 'Socapex 20m', kind: 'SOCA', lengthM: 20, quantity: 20 }], DEFAULT_CABLE_SPECS, t);
  assert.equal(soca.trunks, 2);
  assert.equal(soca.limitedBy, 'weight');
  assert.equal(soca.cableKg, 452);
  // DMX is light, so space decides: 2,000 m of 6.5 mm cable.
  const [dmx] = planCableTrunks([{ name: 'DMX 10m', kind: 'DMX', lengthM: 10, quantity: 200 }], DEFAULT_CABLE_SPECS, t);
  assert.equal(dmx.limitedBy, 'space');
  assert.ok(dmx.trunks >= 1);
});

test('the manifest uses the case rules, the fixture case and the item rules', () => {
  const cases = [caseSpec('2way', 1200, 600, 900, 40), caseSpec('trunk', 1240, 640, 780, 36, { category: 'CABLE' }), caseSpec('motor', 600, 600, 800, 22, { category: 'RIGGING' })];
  const m = buildManifest({
    kit: [
      { name: 'Robe MegaPointe', quantity: 7 },
      { name: 'CM Lodestar 500kg', quantity: 4 },
      { name: 'Socapex 16A 20m', quantity: 6 },
      { name: 'Labour', quantity: 3 },
      { name: 'Mystery box', quantity: 1 },
    ],
    source: 'PICKLIST',
    fixtures: [{ displayName: 'Robe MegaPointe', aliases: null, weightKg: 22, clampKg: 1, caseId: '2way' }],
    caseRules: [{ name: 'MegaPointe', unitsPerCase: 2 }],
    itemRules: [
      { id: 'r1', match: 'lodestar', caseId: 'motor', unitsPerCase: 1, itemKg: 59, ignore: false, category: null },
      { id: 'r2', match: 'labour', caseId: null, unitsPerCase: 1, itemKg: 0, ignore: true, category: null },
    ],
    cases,
    cableSpecs: DEFAULT_CABLE_SPECS,
    trunk: { ...DEFAULT_TRUNK_SETTINGS, caseId: 'trunk' },
  });
  const fx = m.lines.find((l) => l.key.startsWith('fx:'))!;
  assert.equal(fx.cases, 4, '7 MegaPointes at 2 per case');
  assert.equal(m.lines.find((l) => l.key.startsWith('item:'))!.cases, 4);
  assert.equal(m.lines.find((l) => l.key === 'trunk:SOCA')!.cases, 1);
  assert.deepEqual(m.ignored.map((i) => i.name), ['Labour']);
  assert.deepEqual(m.unknown.map((i) => i.name), ['Mystery box']);
});

test('names match with or without the maker and with different spacing', () => {
  const f = [{ displayName: 'Martin MAC Aura XB', aliases: 'Aura XB', weightKg: 6.5, clampKg: 1, caseId: 'x' }];
  assert.ok(matchFixtureCase('MAC Aura XB', f));
  assert.ok(matchFixtureCase('Aura XB', f));
  assert.equal(matchFixtureCase('Aura', f), null);
  assert.ok(matchItemRule('Global Truss F34 3.0m', [{ match: 'f34 3m' }]));
  assert.ok(matchItemRule('F34 Truss 3 m', [{ match: 'f34 3m' }]));
  assert.equal(matchItemRule('F34 Truss 2m', [{ match: 'f34 3m' }]), null);
});

test('a drawbar fills the truck first, then its trailer, under one payload', () => {
  const c = caseSpec('c', 1200, 600, 900, 40, { maxStack: 3 });
  const drawbar: VehicleLike = { id: 'db', name: 'Drawbar', lengthMm: 7700, widthMm: 2480, heightMm: 2950, payloadKg: 18000, trailer: { lengthMm: 7700, widthMm: 2480, heightMm: 2950 } };
  const truckOnly: VehicleLike = { ...drawbar, id: 'rigid', trailer: null };
  // 40 stacks three high: one 7.7 m body takes 24 (four across, six rows), the pair 48.
  const lines = [line('a', 'c', 120, 60)];
  const one = planTruckPack(lines, [c], [truckOnly], DEFAULT_PACK_SETTINGS, { vehicleId: 'rigid' }).packs[0];
  assert.ok(!one.fits);
  const two = planTruckPack(lines, [c], [drawbar], DEFAULT_PACK_SETTINGS, { vehicleId: 'db' }).packs[0];
  assert.ok(two.fits);
  assert.equal(two.bodies.length, 2);
  assert.ok(two.stacks.some((s) => s.body === 1));
  for (const s of two.stacks.filter((x) => x.body === 1)) assert.ok(s.xMm + s.lengthMm <= 7700);
  // Steps carry on from the truck into the trailer.
  const lastTruck = Math.max(...two.stacks.filter((x) => x.body === 0).map((x) => x.step));
  assert.ok(two.stacks.filter((x) => x.body === 1).every((x) => x.step > lastTruck));
  // One payload covers both: too heavy for it, cases stay off.
  const heavy = planTruckPack([line('a', 'c', 120, 160)], [c], [drawbar], DEFAULT_PACK_SETTINGS, { vehicleId: 'db' }).packs[0];
  assert.ok(heavy.overweight && heavy.kg <= 18000);
});

test('vehicles are ordered by their whole load space, trailer included', () => {
  const c = caseSpec('c', 1200, 600, 900, 40, { maxStack: 3 });
  const artic: VehicleLike = { id: 'artic', name: 'Artic', lengthMm: 13620, widthMm: 2460, heightMm: 2700, payloadKg: 24000 };
  const drawbar: VehicleLike = { id: 'db', name: 'Drawbar', lengthMm: 7700, widthMm: 2480, heightMm: 2950, payloadKg: 18000, trailer: { lengthMm: 7700, widthMm: 2480, heightMm: 2950 } };
  const r = planTruckPack([line('a', 'c', 1, 60)], [c], [drawbar, artic], DEFAULT_PACK_SETTINGS);
  assert.deepEqual(r.checks.map((x) => x.vehicleId), ['artic', 'db']);
});
