import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { groupIntoTrusses, mergePoints, parsePlanLabels, parseRiggingPoints, readPlotGeometry, trussesFromPoints, type TextItem } from './plotRead';

// The BOTM 2026 HQ3 point list as pdf.js reports it: the sheet is rotated, so a table row shares
// x and its columns run along y.
const row = (x: number, cells: [number, string][]): TextItem[] => cells.map(([y, str]) => ({ x, y, str }));
const items: TextItem[] = [
  { x: 59, y: 222, str: 'Rigging Points' },
  ...row(111, [[29, 'Name'], [99, 'X'], [159, 'Y'], [205, 'Capacity'], [289, 'Load'], [358, 'Position'], [439, 'Notes']]),
  ...row(141, [[19, 'CP-1'], [103, '5.50m'], [153, '-3.60m'], [191, '180.00 kg'], [267, '55.00 kg'], [341, 'DS Cable Pick']]),
  ...row(156, [[19, 'CP-2'], [103, '5.50m'], [153, '-6.60m'], [191, '180.00 kg'], [267, '55.00 kg'], [341, 'US Cable Pick']]),
  ...[
    ['LX-1', '3.50m', '-6.60m', 'US'],
    ['LX-2', '1.50m', '-6.60m', 'US'],
    ['LX-3', '-1.50m', '-6.60m', 'US'],
    ['LX-4', '-3.50m', '-6.60m', 'US'],
    ['LX-5', '3.50m', '-3.60m', 'DS'],
    ['LX-6', '1.50m', '-3.60m', 'DS'],
    ['LX-7', '-1.50m', '-3.60m', 'DS'],
    ['LX-8', '-3.50m', '-3.60m', 'DS'],
  ].flatMap(([n, x, y, pos], i) => row(171 + i * 15, [[19, n], [103, x], [153, y], [191, '180.00 kg'], [267, '50.00 kg'], [341, pos]])),
];

test('reads the rotated rigging points table and builds the trusses', () => {
  const points = parseRiggingPoints(items);
  assert.equal(points.length, 10);
  const cp1 = points.find((p) => p.name === 'CP-1')!;
  assert.deepEqual([cp1.xM, cp1.yM, cp1.cablePick, cp1.position, cp1.capacityKg], [5.5, -3.6, true, 'DS', 180]);
  const trusses = trussesFromPoints(points);
  assert.deepEqual(
    trusses.map((t) => [t.position, t.lengthM, t.yM, t.pickOffsetM]),
    [
      ['DS', 9, -3.6, 1],
      ['US', 9, -6.6, 1],
    ]
  );
});

// The BOTM rigging plan (page 5), as pdf.js reports it: a name label per motor, with its
// coordinates, capacity and load labels beside it, and no truss names anywhere.
const label = (x: number, y: number, str: string, h = 7): TextItem => ({ x, y, str, h });
const planItems: TextItem[] = [
  label(765, 1056, 'A - Overview', 18),
  label(362, 1051, 'Loads shown include the following:'),
  ...[
    ['LX-8', 301, 169, '-3.5', '-3.6', 44],
    ['LX-7', 301, 337, '-1.5', '-3.6', 123],
    ['LX-6', 301, 588, '1.5', '-3.6', 123],
    ['LX-5', 301, 755, '3.5', '-3.6', 64],
    ['LX-4', 552, 169, '-3.5', '-6.6', 39],
    ['LX-3', 552, 337, '-1.5', '-6.6', 110],
    ['LX-2', 552, 588, '1.5', '-6.6', 110],
    ['LX-1', 552, 755, '3.5', '-6.6', 51],
    ['CP-1', 301, 922, '5.5', '-3.6', 55],
    ['CP-2', 552, 922, '5.5', '-6.6', 55],
  ].flatMap(([n, x, y, px, py, load]) => [
    label(x as number, y as number, n as string, 14),
    label((x as number) + 44, (y as number) - 26, `X: ${px}m, Y: ${py}m`, 11),
    label((x as number) + 15, (y as number) + 36, 'Capacity: 180 kg'),
    label((x as number) + 28, (y as number) + 44, `Load: ${load} kg`),
  ]),
];

test('reads motors off the rigging plan when there is no points table', () => {
  const points = parsePlanLabels(planItems);
  assert.equal(points.length, 10);
  const lx6 = points.find((p) => p.name === 'LX-6')!;
  assert.deepEqual([lx6.xM, lx6.yM, lx6.capacityKg, lx6.loadKg, lx6.cablePick], [1.5, -3.6, 180, 123, false]);
  assert.ok(points.find((p) => p.name === 'CP-2')!.cablePick);
  // No positions on the plan: lines of points at the same Y become trusses, picks join the nearest.
  const { points: placed, trusses } = groupIntoTrusses(points);
  assert.deepEqual(
    trusses.map((t) => [t.position, t.named, t.points.length, t.lengthM, t.pickOffsetM]),
    [
      ['Truss at Y -3.6 m', false, 4, 9, 1],
      ['Truss at Y -6.6 m', false, 4, 9, 1],
    ]
  );
  assert.equal(placed.find((p) => p.name === 'CP-1')!.position, 'Truss at Y -3.6 m');
});

test('the table names the trusses and the plan fills in what the table lacks', () => {
  const table = parseRiggingPoints(items).map((p) => (p.name === 'LX-6' ? { ...p, loadKg: null } : p));
  const merged = mergePoints(table, parsePlanLabels(planItems));
  assert.equal(merged.length, 10);
  assert.equal(merged.find((p) => p.name === 'LX-6')!.loadKg, 123);
  const { trusses } = groupIntoTrusses(merged);
  assert.deepEqual(trusses.map((t) => [t.position, t.named]), [['DS', true], ['US', true]]);
});

test('separate X and Y labels, hoist ratings and points the table leaves without a position', () => {
  const pts = parsePlanLabels([
    label(100, 100, 'M1', 12),
    label(100, 115, 'X: 2m'),
    label(130, 115, 'Y: 4m'),
    label(100, 128, '1T'),
    label(400, 100, 'M2', 12),
    label(400, 115, 'X: 6000mm'),
    label(430, 115, 'Y: 4000mm'),
  ]);
  assert.deepEqual(pts.map((p) => [p.name, p.xM, p.yM, p.hoistKg]), [['M1', 2, 4, 1000], ['M2', 6, 4, null]]);
  // One named truss at Y 4: a loose point at the same Y joins it.
  const { trusses } = groupIntoTrusses([...pts.map((p) => (p.name === 'M1' ? { ...p, position: 'Mid' } : p))]);
  assert.deepEqual(trusses.map((t) => [t.position, t.points]), [['Mid', ['M1', 'M2']]]);
});

test('a patch table is not mistaken for rigging points', () => {
  const patch: TextItem[] = [
    ...row(100, [[20, 'Name'], [80, 'Address'], [140, 'Universe'], [200, 'Position']]),
    ...row(115, [[20, 'Spot 1'], [80, '1'], [140, '2'], [200, 'US']]),
  ];
  assert.equal(parseRiggingPoints(patch).length, 0);
});

const botm = process.env.BOTM_PDF;
test('reads the real BOTM plot when BOTM_PDF points at it', { skip: !botm || !fs.existsSync(botm ?? '') }, async () => {
  const geo = await readPlotGeometry(new Uint8Array(fs.readFileSync(path.resolve(botm!))));
  assert.equal(geo.lxPanelFound, true);
  assert.deepEqual(geo.trusses.map((t) => [t.position, t.lengthM, t.pickOffsetM]), [['DS', 9, 1], ['US', 9, 1]]);
  // The table and the plan both carry all ten points.
  assert.equal(geo.points.length, 10);
  assert.ok(geo.points.every((p) => p.source === 'BOTH'));
});
