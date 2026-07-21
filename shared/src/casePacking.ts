import { CaseGroup, FixtureTypeRule, RawFixtureInput } from './types';

/**
 * Formats the address list for a single case, matching the conventions seen in Elex's
 * existing PAL labels: pairs join with "+" ("201 + 202"), full groups of 3+ collapse to a
 * range ("401 - 403"), and a case left short of a full group fills the missing slot(s) with
 * "Spare" ("303 + Spare").
 */
export function formatCaseLabel(addresses: number[], unitsPerCase: number): string {
  const n = addresses.length;
  if (n === 1 && unitsPerCase === 1) return `${addresses[0]}`;
  if (n === unitsPerCase) {
    if (n === 2) return `${addresses[0]} + ${addresses[1]}`;
    if (n >= 3) return `${addresses[0]} - ${addresses[n - 1]}`;
    return `${addresses[0]}`;
  }
  // Leftover/partial case: short by (unitsPerCase - n) slots.
  const missing = unitsPerCase - n;
  const parts = addresses.map(String).concat(Array(Math.max(missing, 0)).fill('Spare'));
  return parts.join(' + ');
}

/**
 * Groups fixtures of the same type into cases, chunking by address order in runs of
 * `unitsPerCase`. Fixture types with no matching rule default to one unit per case
 * (i.e. every fixture gets its own case label).
 */
export function packFixturesIntoCases(
  fixtures: RawFixtureInput[],
  rules: FixtureTypeRule[]
): CaseGroup[] {
  const ruleByType = new Map(rules.map((r) => [r.name.toLowerCase(), r]));
  const byType = new Map<string, RawFixtureInput[]>();
  for (const f of fixtures) {
    const key = f.fixtureType;
    if (!byType.has(key)) byType.set(key, []);
    byType.get(key)!.push(f);
  }

  const groups: CaseGroup[] = [];
  for (const [fixtureType, list] of byType) {
    const rule = ruleByType.get(fixtureType.toLowerCase());
    const unitsPerCase = rule?.unitsPerCase ?? 1;
    const sorted = [...list].sort((a, b) => a.address - b.address);
    for (let i = 0; i < sorted.length; i += unitsPerCase) {
      const chunk = sorted.slice(i, i + unitsPerCase);
      const addresses = chunk.map((f) => f.address);
      groups.push({
        fixtureType,
        addresses,
        label: formatCaseLabel(addresses, unitsPerCase),
        location: chunk[0]?.location ?? null,
      });
    }
  }
  return groups;
}
