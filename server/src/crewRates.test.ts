import { test } from 'node:test';
import assert from 'node:assert/strict';
import { effectiveDayRate, effectiveDays, suggestedDayRate } from './crewRates';

const lines = [
  { label: 'General day rate', amount: '220' },
  { label: 'Rigger', amount: '300' },
];

test('effectiveDays: scheduled job days win over the typed figure', () => {
  assert.deepEqual(effectiveDays(3, '1'), { days: 3, fromSchedule: true });
  assert.deepEqual(effectiveDays(0, '2'), { days: 2, fromSchedule: false });
  assert.deepEqual(effectiveDays(0, null), { days: 1, fromSchedule: false });
});

test('suggestedDayRate: role line, then profile, then general line, then portal default', () => {
  assert.deepEqual(suggestedDayRate(' rigger ', '250', lines, 180), { rate: 300, source: 'role' });
  assert.deepEqual(suggestedDayRate('LD', '250', lines, 180), { rate: 250, source: 'profile' });
  assert.deepEqual(suggestedDayRate('LD', null, lines, 180), { rate: 220, source: 'rateCard' });
  assert.deepEqual(suggestedDayRate('LD', null, [], 180), { rate: 180, source: 'default' });
  assert.deepEqual(suggestedDayRate('LD', null, [], 0), { rate: 0, source: 'none' });
});

test('effectiveDayRate: job override and zero-rating beat everything', () => {
  assert.equal(effectiveDayRate({ role: 'Rigger', dayRate: '350', zeroRated: false }, '250', lines, 0).rate, 350);
  const zero = effectiveDayRate({ role: 'Rigger', dayRate: '350', zeroRated: true }, '250', lines, 0);
  assert.equal(zero.rate, 0);
  assert.equal(zero.suggested.rate, 300);
  assert.equal(effectiveDayRate({ role: 'Rigger', dayRate: null, zeroRated: false }, '250', lines, 0).source, 'role');
});
