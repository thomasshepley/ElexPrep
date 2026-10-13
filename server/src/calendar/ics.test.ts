import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildIcs } from './ics';

test('writes all-day and timed events with escaped text and CRLF line endings', () => {
  const ics = buildIcs(
    'Awards',
    [
      { uid: 'day-1@elex', summary: 'Awards, Gala; Night', allDay: '2026-10-15', location: 'Hall 1' },
      { uid: 'item-1@elex', summary: 'Load in', start: new Date('2026-10-15T08:00:00Z'), end: new Date('2026-10-15T12:00:00Z') },
    ],
    new Date('2026-10-13T00:00:00Z'),
  );
  assert.ok(ics.startsWith('BEGIN:VCALENDAR\r\n'));
  assert.ok(ics.includes('SUMMARY:Awards\\, Gala\\; Night\r\n'));
  assert.ok(ics.includes('DTSTART;VALUE=DATE:20261015\r\nDTEND;VALUE=DATE:20261016\r\n'));
  assert.ok(ics.includes('DTSTART:20261015T080000Z\r\nDTEND:20261015T120000Z\r\n'));
  assert.ok(ics.endsWith('END:VCALENDAR\r\n'));
});

test('folds long lines at 75 octets', () => {
  const ics = buildIcs('x', [{ uid: 'u', summary: 'A'.repeat(200), allDay: '2026-01-01' }]);
  for (const line of ics.split('\r\n')) assert.ok(Buffer.byteLength(line) <= 75, line);
});
