import { test } from 'node:test';
import assert from 'node:assert/strict';
import { depthRank, pairPositions, positionKey, positionsMatch } from './positionMatch';

test('position names match however they are written', () => {
  for (const [a, b] of [
    ['US', 'US Truss'],
    ['Upstage', 'US'],
    ['Main: DS', 'Downstage truss'],
    ['LX 1', 'LX-1'],
    ['LX1 Truss', 'lx1'],
    ['Mid', 'Midstage'],
    ['SL Boom', 'Stage Left Boom'],
    ['FOH', 'Front of House Truss'],
  ])
    assert.ok(positionsMatch(a, b), `${a} = ${b}`);
  for (const [a, b] of [
    ['US', 'DS'],
    ['LX1', 'LX2'],
    ['SL', 'SR'],
  ])
    assert.ok(!positionsMatch(a, b), `${a} != ${b}`);
  assert.equal(positionKey('LX US'), 'us');
  assert.equal(positionKey('LX1'), 'lx1');
});

test('pairing: links first, then names, then the only two left', () => {
  const pos = [
    { name: 'Upstage', candidate: true },
    { name: 'Downstage', candidate: true },
    { name: 'Truss A', candidate: true },
  ];
  const m = pairPositions(pos, ['US', 'DS', 'Truss at Y -9 m']);
  assert.deepEqual(Object.fromEntries([...m].map(([k, v]) => [k, `${v.truss} (${v.how})`])), {
    Upstage: 'US (name)',
    Downstage: 'DS (name)',
    'Truss A': 'Truss at Y -9 m (only one left)',
  });
  // A hand link wins, and an empty link means "not on the plot".
  const m2 = pairPositions([{ name: 'Upstage', candidate: true, plotTruss: 'DS' }, { name: 'Downstage', candidate: true, plotTruss: '' }], ['US', 'DS']);
  assert.deepEqual([...m2].map(([k, v]) => [k, v.truss, v.how]), [['Upstage', 'DS', 'linked']]);
});

test('trusses the plot doesn\'t name pair front to back with positions that say where they are', () => {
  assert.deepEqual([depthRank('Downstage Truss'), depthRank('US'), depthRank('LX3'), depthRank('Box boom')], [
    { family: 'stage', rank: 1 },
    { family: 'stage', rank: 3 },
    { family: 'number', rank: 3 },
    null,
  ]);
  const depth = { 'Truss at Y -6.6 m': 6.6, 'Truss at Y -3.6 m': 3.6 };
  const m = pairPositions([{ name: 'US', candidate: true }, { name: 'DS', candidate: true }], Object.keys(depth), depth);
  assert.deepEqual(Object.fromEntries([...m].map(([k, v]) => [k, `${v.truss} (${v.how})`])), { US: 'Truss at Y -6.6 m (by depth)', DS: 'Truss at Y -3.6 m (by depth)' });
  // Not when the names don't say, or the counts differ.
  assert.equal(pairPositions([{ name: 'Left', candidate: true }, { name: 'Right', candidate: true }], Object.keys(depth), depth).size, 0);
  assert.equal(pairPositions([{ name: 'LX1', candidate: true }, { name: 'LX2', candidate: true }, { name: 'LX3', candidate: true }], Object.keys(depth), depth).size, 0);
});
