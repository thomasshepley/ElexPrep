import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assignmentCost, crewSuggestedRate, effectiveDayRate, inheritedDayRate, roleKey, type RateTables } from './crewRates';

const tables = (job: Record<string, number> = {}, global: Record<string, number> = {}, defaultRate = 0): RateTables => ({
  job: new Map(Object.entries(job)),
  global: new Map(Object.entries(global)),
  defaultRate,
});

test('roleKey ignores case and stray spaces', () => {
  assert.equal(roleKey('  LX   Tech '), 'lx tech');
});

test('inheritedDayRate: job role rate, then agreed rate, then portal role rate, then default', () => {
  const t = tables({ 'lx tech': 240 }, { 'lx tech': 200, rigger: 280 }, 150);
  assert.deepEqual(inheritedDayRate('LX Tech', '250', t), { rate: 240, source: 'jobRole' });
  assert.deepEqual(inheritedDayRate('Rigger', '250', t), { rate: 250, source: 'profile' });
  assert.deepEqual(inheritedDayRate('Rigger', null, t), { rate: 280, source: 'globalRole' });
  assert.deepEqual(inheritedDayRate('Spot Op', null, t), { rate: 150, source: 'default' });
  assert.deepEqual(inheritedDayRate('Spot Op', null, tables()), { rate: 0, source: 'none' });
});

test('effectiveDayRate: zero-rating and a per-person override beat the role rates', () => {
  const t = tables({ 'lx tech': 240 });
  assert.equal(effectiveDayRate({ role: 'LX Tech', dayRate: '300', zeroRated: false }, null, t).rate, 300);
  const zero = effectiveDayRate({ role: 'LX Tech', dayRate: '300', zeroRated: true }, null, t);
  assert.equal(zero.rate, 0);
  assert.equal(zero.source, 'zero');
  assert.equal(zero.inherited.rate, 240);
  assert.equal(effectiveDayRate({ role: 'LX Tech', dayRate: null, zeroRated: false }, null, t).source, 'jobRole');
});

test('crewSuggestedRate: their own role line, then their general line', () => {
  const lines = [
    { label: 'General day rate', amount: '220' },
    { label: 'Rigger', amount: '300' },
  ];
  assert.deepEqual(crewSuggestedRate(' rigger ', lines), { rate: 300, source: 'role' });
  assert.deepEqual(crewSuggestedRate('LD', lines), { rate: 220, source: 'rateCard' });
  assert.deepEqual(crewSuggestedRate('LD', []), { rate: 0, source: 'none' });
});

test('assignmentCost: scheduled days win, each at its own rate when set', () => {
  const rate = { rate: 200, source: 'jobRole' as const };
  assert.deepEqual(assignmentCost(rate, [null, null, '100'], '5'), { days: 3, fromSchedule: true, cost: 500, dayOverrides: 1 });
  assert.deepEqual(assignmentCost(rate, [], '2'), { days: 2, fromSchedule: false, cost: 400, dayOverrides: 0 });
  assert.deepEqual(assignmentCost(rate, [], null), { days: 1, fromSchedule: false, cost: 200, dayOverrides: 0 });
  assert.equal(assignmentCost({ rate: 0, source: 'zero' }, [null, '100'], null).cost, 0);
});
