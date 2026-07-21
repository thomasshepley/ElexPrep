import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findHeaderRowIndex, splitUniverseAddress } from './csvHeader';

test('findHeaderRowIndex: picks the real header row past title/metadata preamble rows', () => {
  const rows = [
    ['Asset 3@4x.png', '', 'Patch', '', '', 'V1.1', ''],
    ['Orbital - Cakebread Street', ' ', '', '', '', '24/04/2026', ''],
    ['', '', '', '', '', '', ''],
    ['', '', '', '', '', '', ''],
    ['Spot', 'Patch', 'Type', 'Position', 'Fixture Options', '# Data', 'Unit'],
    ['', '', '', '', '', '', ''],
    ['Type: Mac Aura XIP', '', '', '', '', '', ''],
    ['201', '1.1', 'Mac Aura XIP', 'Floor', 'Mode: Basic', '36', ''],
  ];
  assert.equal(findHeaderRowIndex(rows), 4);
});

test('findHeaderRowIndex: a simple CSV with the header on row 0 still works', () => {
  const rows = [
    ['Position', 'Type', 'Universe', 'Address', 'Location'],
    ['201', 'AstraBlade', '6', '1', 'Floor'],
    ['202', 'AstraBlade', '6', '84', 'Floor'],
  ];
  assert.equal(findHeaderRowIndex(rows), 0);
});

test('splitUniverseAddress: splits combined "universe.address" notation', () => {
  assert.deepEqual(splitUniverseAddress('3.109'), { universe: 3, address: 109 });
  assert.deepEqual(splitUniverseAddress('1.1'), { universe: 1, address: 1 });
});

test('splitUniverseAddress: returns nulls for missing/malformed values', () => {
  assert.deepEqual(splitUniverseAddress(''), { universe: null, address: null });
  assert.deepEqual(splitUniverseAddress(null), { universe: null, address: null });
  assert.deepEqual(splitUniverseAddress('not-a-patch'), { universe: null, address: null });
});
