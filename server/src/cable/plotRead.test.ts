import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { parseRiggingPoints, readPlotGeometry, trussesFromPoints, type TextItem } from './plotRead';

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
      ['DS', 8, -3.6, 1.5],
      ['US', 8, -6.6, 1.5],
    ]
  );
});

const botm = process.env.BOTM_PDF;
test('reads the real BOTM plot when BOTM_PDF points at it', { skip: !botm || !fs.existsSync(botm ?? '') }, async () => {
  const geo = await readPlotGeometry(new Uint8Array(fs.readFileSync(path.resolve(botm!))));
  assert.equal(geo.lxPanelFound, true);
  assert.deepEqual(geo.trusses.map((t) => [t.position, t.lengthM, t.pickOffsetM]), [['DS', 8, 1.5], ['US', 8, 1.5]]);
});
