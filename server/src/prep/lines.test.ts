import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rmsItemsToLines } from './lines';

test('pick-list lines: groups become headings, service lines and their accessories are left out', () => {
  const lines = rmsItemsToLines([
    { id: 1, name: 'Lighting', opportunity_item_type: 0 },
    { id: 2, item_id: 100, name: 'Robe BMFL Blade', quantity: '12.0' as unknown as number, opportunity_item_type: 1, transaction_type_name: 'Rental' },
    { id: 3, item_id: 101, name: 'Safety bond', quantity: 12, opportunity_item_type: 2 },
    { id: 4, name: 'Crew', opportunity_item_type: 0 },
    { id: 5, name: 'Lighting Technician', quantity: 3, opportunity_item_type: 1, transaction_type: 3 },
    { id: 6, name: 'Overtime', quantity: 1, opportunity_item_type: 2 },
    {
      id: 7,
      item_id: 200,
      name: '16A 5m',
      quantity: 4,
      opportunity_item_type: 1,
      transaction_type_name: 'Rental',
      status: 20,
      item_assets: [{ id: 9, stock_level_asset_number: 'C-1', status: 15 }],
    },
  ]);
  assert.deepEqual(
    lines.map((l) => [l.key, l.group, l.required, l.accessory]),
    [
      ['rms:2', 'Lighting', 12, false],
      ['rms:3', 'Lighting', 12, true],
      ['rms:7', 'Crew', 4, false],
    ]
  );
  assert.equal(lines[0].productId, 100);
  assert.equal(lines[2].bookedOut, true);
  assert.deepEqual(lines[2].allocated, [{ assetNumber: 'C-1', itemAssetId: 9, status: 15 }]);
});
