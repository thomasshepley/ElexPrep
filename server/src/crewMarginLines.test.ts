import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_EXCLUDED_LINE_NAMES, lineExclusion, lineNameKey } from './crewMarginLines';

const portal = new Set(DEFAULT_EXCLUDED_LINE_NAMES.map(lineNameKey));

test('delivery and collection are left out by default, matching loosely on case and spaces', () => {
  assert.deepEqual(lineExclusion('1:1', ' delivery  (mainland uk)', new Map(), portal), { excluded: true, by: 'portal', onPortalList: true });
  assert.equal(lineExclusion('1:2', 'Collection (Mainland UK)', new Map(), portal).excluded, true);
  assert.equal(lineExclusion('1:3', 'Lighting Technician', new Map(), portal).excluded, false);
});

test('a job can leave out any line, or put back one the portal list drops', () => {
  assert.deepEqual(lineExclusion('1:3', 'Lighting Technician', new Map([['1:3', true]]), portal), { excluded: true, by: 'job', onPortalList: false });
  assert.deepEqual(lineExclusion('1:1', 'Delivery (Mainland UK)', new Map([['1:1', false]]), portal), { excluded: false, by: null, onPortalList: true });
});
