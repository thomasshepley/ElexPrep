import { test } from 'node:test';
import assert from 'node:assert/strict';
import { diffPickListItems, pickListDiffIsEmpty } from './pickListDiff';

test('diffPickListItems: detects an added item', () => {
  const before = [{ id: 1, name: 'AstraBlade', quantity: 8 }];
  const after = [
    { id: 1, name: 'AstraBlade', quantity: 8 },
    { id: 2, name: 'Hazer', quantity: 1 },
  ];
  const diff = diffPickListItems(before, after);
  assert.equal(diff.added.length, 1);
  assert.equal(diff.added[0].name, 'Hazer');
  assert.equal(diff.removed.length, 0);
  assert.equal(diff.changed.length, 0);
});

test('diffPickListItems: detects a removed item', () => {
  const before = [
    { id: 1, name: 'AstraBlade', quantity: 8 },
    { id: 2, name: 'Hazer', quantity: 1 },
  ];
  const after = [{ id: 1, name: 'AstraBlade', quantity: 8 }];
  const diff = diffPickListItems(before, after);
  assert.equal(diff.removed.length, 1);
  assert.equal(diff.removed[0].name, 'Hazer');
  assert.equal(diff.added.length, 0);
});

test('diffPickListItems: detects a quantity change', () => {
  const before = [{ id: 1, name: 'AstraBlade', quantity: 8 }];
  const after = [{ id: 1, name: 'AstraBlade', quantity: 12 }];
  const diff = diffPickListItems(before, after);
  assert.equal(diff.changed.length, 1);
  assert.deepEqual(diff.changed[0], { id: 1, name: 'AstraBlade', before: 8, after: 12 });
});

test('diffPickListItems: identical snapshots produce an empty diff', () => {
  const items = [{ id: 1, name: 'AstraBlade', quantity: 8 }];
  const diff = diffPickListItems(items, items);
  assert.ok(pickListDiffIsEmpty(diff));
});

test('diffPickListItems: matches by id, not array position', () => {
  const before = [
    { id: 1, name: 'AstraBlade', quantity: 8 },
    { id: 2, name: 'Hazer', quantity: 1 },
  ];
  const after = [
    { id: 2, name: 'Hazer', quantity: 1 },
    { id: 1, name: 'AstraBlade', quantity: 8 },
  ];
  const diff = diffPickListItems(before, after);
  assert.ok(pickListDiffIsEmpty(diff));
});

test('pickListDiffIsEmpty: false when there is any change', () => {
  const diff = diffPickListItems([], [{ id: 1, name: 'X', quantity: 1 }]);
  assert.equal(pickListDiffIsEmpty(diff), false);
});
