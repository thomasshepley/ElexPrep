import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatCaseLabel, packFixturesIntoCases } from './casePacking';
import { FixtureTypeRule, RawFixtureInput } from './types';

function fixture(address: number, fixtureType: string, location?: string): RawFixtureInput {
  return { address, fixtureType, location: location ?? null };
}

test('formatCaseLabel: single fixture, one unit per case', () => {
  assert.equal(formatCaseLabel([101], 1), '101');
});

test('formatCaseLabel: full pair joins with +', () => {
  assert.equal(formatCaseLabel([201, 202], 2), '201 + 202');
});

test('formatCaseLabel: full group of 3+ collapses to a range', () => {
  assert.equal(formatCaseLabel([401, 402, 403], 3), '401 - 403');
  assert.equal(formatCaseLabel([501, 502, 503, 504], 4), '501 - 504');
});

test('formatCaseLabel: short leftover case fills the gap with Spare', () => {
  assert.equal(formatCaseLabel([303], 2), '303 + Spare');
  assert.equal(formatCaseLabel([601, 602], 4), '601 + 602 + Spare + Spare');
});

test('formatCaseLabel: a partial case with 3+ real addresses still collapses to a range', () => {
  assert.equal(formatCaseLabel([201, 202, 203, 204], 6), '201 - 204 + Spare + Spare');
  assert.equal(formatCaseLabel([201, 202, 203], 8), '201 - 203 + Spare + Spare + Spare + Spare + Spare');
});

test('packFixturesIntoCases: groups by fixture type and chunks by unitsPerCase', () => {
  const fixtures = [
    fixture(201, 'AstraBlade'),
    fixture(202, 'AstraBlade'),
    fixture(203, 'AstraBlade'),
    fixture(101, 'Viper Profile'),
  ];
  const rules: FixtureTypeRule[] = [{ id: '1', name: 'AstraBlade', unitsPerCase: 2 }];
  const groups = packFixturesIntoCases(fixtures, rules);

  const astra = groups.filter((g) => g.fixtureType === 'AstraBlade');
  assert.equal(astra.length, 2);
  assert.equal(astra[0].label, '201 + 202');
  assert.equal(astra[1].label, '203 + Spare');

  const viper = groups.filter((g) => g.fixtureType === 'Viper Profile');
  assert.equal(viper.length, 1);
  assert.equal(viper[0].label, '101');
});

test('packFixturesIntoCases: fixture type with no rule defaults to one unit per case', () => {
  const fixtures = [fixture(401, 'Sharpy Wash'), fixture(402, 'Sharpy Wash')];
  const groups = packFixturesIntoCases(fixtures, []);
  assert.equal(groups.length, 2);
  assert.equal(groups[0].label, '401');
  assert.equal(groups[1].label, '402');
});

test('packFixturesIntoCases: caseLabelOverride renames the fixture type on the case label', () => {
  const fixtures = [fixture(201, 'AstraBlade Pixel Tube Mk2'), fixture(202, 'AstraBlade Pixel Tube Mk2')];
  const rules: FixtureTypeRule[] = [
    { id: '1', name: 'AstraBlade Pixel Tube Mk2', unitsPerCase: 2, caseLabelOverride: 'Astra' },
  ];
  const groups = packFixturesIntoCases(fixtures, rules);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].fixtureType, 'Astra');
});

test('packFixturesIntoCases: rule lookup is case-insensitive on fixture type name', () => {
  const fixtures = [fixture(201, 'AstraBlade'), fixture(202, 'AstraBlade')];
  const rules: FixtureTypeRule[] = [{ id: '1', name: 'astrablade', unitsPerCase: 2 }];
  const groups = packFixturesIntoCases(fixtures, rules);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].label, '201 + 202');
});

test('packFixturesIntoCases: sorts fixtures by address before chunking, regardless of input order', () => {
  const fixtures = [fixture(203, 'AstraBlade'), fixture(201, 'AstraBlade'), fixture(202, 'AstraBlade')];
  const rules: FixtureTypeRule[] = [{ id: '1', name: 'AstraBlade', unitsPerCase: 3 }];
  const groups = packFixturesIntoCases(fixtures, rules);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].label, '201 - 203');
});

test('packFixturesIntoCases: case location comes from the first fixture in the chunk', () => {
  const fixtures = [fixture(201, 'AstraBlade', 'Floor'), fixture(202, 'AstraBlade', 'Floor')];
  const rules: FixtureTypeRule[] = [{ id: '1', name: 'AstraBlade', unitsPerCase: 2 }];
  const groups = packFixturesIntoCases(fixtures, rules);
  assert.equal(groups[0].location, 'Floor');
});
