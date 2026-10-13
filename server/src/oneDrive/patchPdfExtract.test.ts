import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parsePatchDataLine, extractPatchRowsFromText } from './patchPdfExtract';

test('parsePatchDataLine: a normal addressed row with position and options', () => {
  const row = parsePatchDataLine('101 1.1 Fixture A US Mode: Standard; Pan Range: 540 36');
  assert.deepEqual(row, {
    spot: '101',
    patch: '1.1',
    type: 'Fixture A',
    position: 'US',
    fixtureOptions: 'Mode: Standard; Pan Range: 540',
    dataCount: '36',
  });
});

test('parsePatchDataLine: a blank-position row keeps the full type intact', () => {
  const row = parsePatchDataLine('301 3.1 Fixture B Mode: 16-Bit Ex.; Reserved Channels: Disabled 35');
  assert.deepEqual(row, {
    spot: '301',
    patch: '3.1',
    type: 'Fixture B',
    position: '',
    fixtureOptions: 'Mode: 16-Bit Ex.; Reserved Channels: Disabled',
    dataCount: '35',
  });
});

test('parsePatchDataLine: a type with no colon-bearing options field still parses', () => {
  const row = parsePatchDataLine('401 2.279 Fixture C US Channels: 4 4');
  assert.deepEqual(row, {
    spot: '401',
    patch: '2.279',
    type: 'Fixture C',
    position: 'US',
    fixtureOptions: 'Channels: 4',
    dataCount: '4',
  });
});

test('parsePatchDataLine: a type ending in a short all-caps word that is not a known position code is left whole', () => {
  const row = parsePatchDataLine('501 5.1 Robe MegaPointe FX Mode: Standard 20');
  assert.equal(row?.type, 'Robe MegaPointe FX');
  assert.equal(row?.position, '');
});

test('parsePatchDataLine: an unaddressed fixture (no Spot/Patch) is not a real patch row', () => {
  assert.equal(parsePatchDataLine('Fixture D N/A 1'), null);
});

test('parsePatchDataLine: a "Type: X" section-heading line is not a real patch row', () => {
  assert.equal(parsePatchDataLine('Type: Fixture A'), null);
});

test('parsePatchDataLine: blank or unrelated text is not a real patch row', () => {
  assert.equal(parsePatchDataLine(''), null);
  assert.equal(parsePatchDataLine('BOTM 2026 - HQ3'), null);
  assert.equal(parsePatchDataLine('Symbol Name Count'), null);
});

test('extractPatchRowsFromText: keeps only the page with enough real patch rows', () => {
  const titlePage = { text: 'Venue\nMedia City\nLighting Designer\nSome Designer' };
  const riggingPage = {
    text: [
      'Name X Y Capacity Load Position Notes',
      'LX-1 3.50m -3.60m 180.00 kg 51.00 kg US',
      'LX-2 1.50m -3.60m 180.00 kg 110.00 kg US',
    ].join('\n'),
  };
  const patchPage = {
    text: [
      'Patch V1.0',
      'Spot Patch Type Position Fixture Options # Data',
      'Type: Fixture A',
      '101 1.1 Fixture A US Mode: Standard; Pan Range: 540 36',
      '102 1.37 Fixture A US Mode: Standard; Pan Range: 540 36',
      'Type: Fixture B',
      '301 3.1 Fixture B Mode: 16-Bit Ex.; Reserved Channels: Disabled 35',
    ].join('\n'),
  };

  const rows = extractPatchRowsFromText([titlePage, riggingPage, patchPage]);
  assert.equal(rows.length, 3);
  assert.deepEqual(
    rows.map((r) => r.Spot),
    ['101', '102', '301']
  );
  assert.equal(rows[0].Type, 'Fixture A');
  assert.equal(rows[2].Position, '');
});

test('extractPatchRowsFromText: a page with too few matching lines is ignored', () => {
  const rows = extractPatchRowsFromText([{ text: '101 1.1 Fixture A US Mode: Standard 36' }]);
  assert.equal(rows.length, 0);
});

test('extractPatchRowsFromText: merges rows from more than one qualifying page', () => {
  const pageOne = {
    text: [
      '101 1.1 Fixture A US Mode: Standard 36',
      '102 1.37 Fixture A US Mode: Standard 36',
      '103 1.73 Fixture A US Mode: Standard 36',
    ].join('\n'),
  };
  const pageTwo = {
    text: [
      '201 2.1 Fixture B US Mode: Ext. 25',
      '202 2.26 Fixture B US Mode: Ext. 25',
      '203 2.51 Fixture B US Mode: Ext. 25',
    ].join('\n'),
  };
  const rows = extractPatchRowsFromText([pageOne, pageTwo]);
  assert.equal(rows.length, 6);
});
