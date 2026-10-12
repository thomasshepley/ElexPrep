import { CaseGroup, FixtureTypeRule, RawFixtureInput } from './types';

/**
 * Formats the address list for a single case, matching the conventions seen in Elex's
 * existing PAL labels: pairs join with "+" ("201 + 202"), any run of 3+ real addresses
 * (whether it's a full case or the real portion of a partial one) collapses to a range
 * ("401 - 403"), and a case left short of a full group fills the missing slot(s) with
 * "Spare" ("303 + Spare", "401 - 404 + Spare").
 */
export function formatCaseLabel(addresses: number[], unitsPerCase: number): string {
  const n = addresses.length;
  if (n === 1 && unitsPerCase === 1) return `${addresses[0]}`;
  if (n === unitsPerCase) {
    if (n === 2) return `${addresses[0]} + ${addresses[1]}`;
    if (n >= 3) return `${addresses[0]} - ${addresses[n - 1]}`;
    return `${addresses[0]}`;
  }
  // Leftover/partial case: short by (unitsPerCase - n) slots. The real addresses still
  // collapse to a range once there are 3+ of them, same as a full case would.
  const missing = unitsPerCase - n;
  const realPart =
    n === 1 ? `${addresses[0]}` : n === 2 ? `${addresses[0]} + ${addresses[1]}` : `${addresses[0]} - ${addresses[n - 1]}`;
  const spareParts = Array(Math.max(missing, 0)).fill('Spare');
  return [realPart, ...spareParts].join(' + ');
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
  // Grouped by fixture type AND stage together, so two stages' fixtures of the same type
  // never end up packed into the same case (see RawFixtureInput.groupId).
  const byTypeAndGroup = new Map<string, RawFixtureInput[]>();
  for (const f of fixtures) {
    const key = `${f.fixtureType}::${f.groupId ?? ''}`;
    if (!byTypeAndGroup.has(key)) byTypeAndGroup.set(key, []);
    byTypeAndGroup.get(key)!.push(f);
  }

  const groups: CaseGroup[] = [];
  for (const list of byTypeAndGroup.values()) {
    const fixtureType = list[0].fixtureType;
    const groupId = list[0].groupId ?? null;
    const rule = ruleByType.get(fixtureType.toLowerCase());
    const unitsPerCase = rule?.unitsPerCase ?? 1;
    const sorted = [...list].sort((a, b) => a.address - b.address);
    for (let i = 0; i < sorted.length; i += unitsPerCase) {
      const chunk = sorted.slice(i, i + unitsPerCase);
      const addresses = chunk.map((f) => f.address);
      groups.push({
        // caseLabelOverride lets a shorter/friendlier name print on the case label than the
        // patch's fixture type string (e.g. "Astra" instead of "AstraBlade Pixel Tube Mk2").
        fixtureType: rule?.caseLabelOverride || fixtureType,
        addresses,
        label: formatCaseLabel(addresses, unitsPerCase),
        location: chunk[0]?.location ?? null,
        groupId,
      });
    }
  }
  return groups;
}
