/**
 * Truck pack (alpha): turns a job's kit into cases, stacks them, and lays the stacks into a van or
 * truck from the cab back so the first thing needed at the venue comes off first. Pure, so the
 * server, the page and the tests all run the same sums.
 *
 * Until stock is itemised by container in Current RMS, case counts are worked out here: fixtures
 * by the case rules (units per case) and the case each fixture travels in, other kit by item
 * rules, and cable into trunks by its weight and coiled volume.
 */

export type PackCategory = 'RIGGING' | 'POWER' | 'CABLE' | 'FIXTURES' | 'CONTROL' | 'OTHER';

export const PACK_CATEGORIES: PackCategory[] = ['RIGGING', 'POWER', 'CABLE', 'FIXTURES', 'CONTROL', 'OTHER'];

export const PACK_CATEGORY_LABEL: Record<PackCategory, string> = {
  RIGGING: 'Rigging',
  POWER: 'Power',
  CABLE: 'Cable',
  FIXTURES: 'Fixtures',
  CONTROL: 'Control',
  OTHER: 'Other',
};

/** The order kit is needed at the venue: rigging goes up first, so it is loaded last (by the doors). */
export const DEFAULT_UNLOAD_ORDER: PackCategory[] = ['RIGGING', 'POWER', 'CABLE', 'FIXTURES', 'CONTROL', 'OTHER'];

export interface CaseSpecLike {
  id: string;
  name: string;
  /** Outside sizes, castors and lid included. */
  lengthMm: number;
  widthMm: number;
  heightMm: number;
  emptyKg: number;
  /** How many of this case may stand in one stack, itself included: 1 is never stacked, 2 double, 3 triple. */
  maxStack: number;
  /** Whether it may sit on top of a different case (always allowed on its own kind). */
  canGoOnTop: boolean;
  /** Whether it may be turned 90 degrees on the floor. */
  canRotate: boolean;
  category: PackCategory;
  /** Units it holds when no case rule says otherwise. */
  holds: number;
}

export interface VehicleLike {
  id: string;
  name: string;
  /** Inside the load space. */
  lengthMm: number;
  widthMm: number;
  heightMm: number;
  payloadKg: number;
  doorWidthMm?: number | null;
  doorHeightMm?: number | null;
  /** Wheel arches inside the load space (vans): the floor between `fromMm` and `toMm` is only `clearWidthMm` wide. */
  arch?: { fromMm: number; toMm: number; clearWidthMm: number } | null;
}

export interface PackSettingsLike {
  /** Kept free under the roof. */
  clearanceMm: number;
  unloadOrder: PackCategory[];
  /** Let a lighter, smaller case top up another stack of the same category. */
  mixedStacking: boolean;
  /** Flag when the weight sits more than this far off the centre line, as a share of the width. */
  maxSideOffsetPct: number;
  /** Flag when the centre of the weight is further back than this share of the load length. */
  maxRearCogPct: number;
}

export const DEFAULT_PACK_SETTINGS: PackSettingsLike = {
  clearanceMm: 50,
  unloadOrder: DEFAULT_UNLOAD_ORDER,
  mixedStacking: true,
  maxSideOffsetPct: 10,
  maxRearCogPct: 60,
};

/** One kind of case on the manifest: "6 cases of Robe MegaPointe, 2 per case, 82 kg each". */
export interface ManifestLine {
  key: string;
  label: string;
  caseId: string;
  cases: number;
  kgEach: number;
  category: PackCategory;
  /** What's inside, in words. */
  contents: string;
  source: 'PICKLIST' | 'PATCH' | 'CABLE' | 'MANUAL';
}

// ---------------------------------------------------------------------------------------------
// Cable into trunks
// ---------------------------------------------------------------------------------------------

export type CableKind = 'SOCA' | 'SPIDER' | 'CEE16' | 'CEE32' | 'CEE63' | 'TRUE1' | 'POWERCON' | 'DMX' | 'CAT' | 'MOTOR';
export type TrunkGroup = 'SOCA' | 'POWER' | 'DATA' | 'MOTOR';

export interface CableSpec {
  label: string;
  group: TrunkGroup;
  kgPerM: number;
  diameterMm: number;
  /** Things sold by the piece (spiders) rather than the metre. */
  kgEach?: number;
  litresEach?: number;
}

/** Typical weights and outside diameters; adjust in the settings to match your own stock. */
export const DEFAULT_CABLE_SPECS: Record<CableKind, CableSpec> = {
  SOCA: { label: 'Socapex', group: 'SOCA', kgPerM: 1.13, diameterMm: 26 },
  SPIDER: { label: 'Socapex spiders', group: 'SOCA', kgPerM: 0, diameterMm: 0, kgEach: 2.5, litresEach: 3 },
  CEE16: { label: '16A', group: 'POWER', kgPerM: 0.2, diameterMm: 13 },
  CEE32: { label: '32A', group: 'POWER', kgPerM: 0.6, diameterMm: 20 },
  CEE63: { label: '63A', group: 'POWER', kgPerM: 1.25, diameterMm: 27 },
  TRUE1: { label: 'TRUE1 jumpers', group: 'POWER', kgPerM: 0.13, diameterMm: 10 },
  POWERCON: { label: 'powerCON jumpers', group: 'POWER', kgPerM: 0.13, diameterMm: 10 },
  DMX: { label: 'DMX', group: 'DATA', kgPerM: 0.05, diameterMm: 6.5 },
  CAT: { label: 'Cat', group: 'DATA', kgPerM: 0.045, diameterMm: 7 },
  MOTOR: { label: 'Motor cable', group: 'MOTOR', kgPerM: 0.25, diameterMm: 14 },
};

export const TRUNK_GROUP_LABEL: Record<TrunkGroup, string> = { SOCA: 'Socapex', POWER: 'Power', DATA: 'Data', MOTOR: 'Motor cable' };
const TRUNK_GROUP_CATEGORY: Record<TrunkGroup, PackCategory> = { SOCA: 'CABLE', POWER: 'POWER', DATA: 'CABLE', MOTOR: 'RIGGING' };

/** Reads a kit line's cable type and length from its name ("Socapex 16A 20m", "5-pin DMX 10 m"). Not cable: null. */
export function classifyCable(name: string): { kind: CableKind; lengthM: number | null } | null {
  const n = name.toLowerCase();
  const m = n.match(/(\d+(?:[.,]\d+)?)\s*(?:m|mtr|metre|meter)s?\b/);
  const lengthM = m ? Number(m[1].replace(',', '.')) : null;
  let kind: CableKind | null = null;
  if (/spider|break.?out|fan.?out/.test(n)) kind = 'SPIDER';
  else if (/soca|socapex|19.?pin/.test(n)) kind = 'SOCA';
  else if (/motor/.test(n) && /cable|lead|ext/.test(n)) kind = 'MOTOR';
  else if (/dmx/.test(n) && !/node|terminat|splitter|opto|buffer/.test(n)) kind = 'DMX';
  else if (/\bcat\s*\d|ethercon|\brj45\b/.test(n) && !/node|switch/.test(n)) kind = 'CAT';
  else if (/true\s*1|true1/.test(n)) kind = 'TRUE1';
  else if (/powercon/.test(n)) kind = 'POWERCON';
  else if (/125\s*a|63\s*a/.test(n)) kind = 'CEE63';
  else if (/32\s*a/.test(n)) kind = 'CEE32';
  else if (/16\s*a|cee\s*form|ceeform/.test(n) && /cable|ext|lead|jumper|\d\s*m/.test(n)) kind = 'CEE16';
  if (!kind) return null;
  // Only cable that runs by the metre needs a length; a missing one is filled in by the caller.
  return { kind, lengthM: kind === 'SPIDER' ? null : lengthM };
}

export interface TrunkSettings {
  caseId: string;
  /** Usable space inside one trunk. */
  litres: number;
  /** Heaviest a trunk should be packed to, cable only. */
  maxKg: number;
  /** How much of a trunk coiled cable really fills (coils leave gaps). */
  fill: number;
  /** For a cable line whose name gives no length. */
  defaultLengthM: number;
}

// One 1200 x 600 x 600 mm trunk takes about ten 20 m socas (226 kg): coils fill about a third of the space.
export const DEFAULT_TRUNK_SETTINGS: Omit<TrunkSettings, 'caseId'> = { litres: 360, maxKg: 250, fill: 0.35, defaultLengthM: 10 };

export interface TrunkPlan {
  group: TrunkGroup;
  label: string;
  metres: number;
  pieces: number;
  cableKg: number;
  litres: number;
  trunks: number;
  /** Which of weight or space decided the count. */
  limitedBy: 'weight' | 'space';
  lines: string[];
}

/** Cable lines into trunks, one kind of trunk per group so socas, power and data travel apart. */
export function planCableTrunks(cables: { name: string; kind: CableKind; lengthM: number | null; quantity: number }[], specs: Record<CableKind, CableSpec>, t: TrunkSettings): TrunkPlan[] {
  const groups = new Map<TrunkGroup, TrunkPlan>();
  for (const c of cables) {
    if (c.quantity <= 0) continue;
    const spec = specs[c.kind];
    const g = groups.get(spec.group) ?? { group: spec.group, label: TRUNK_GROUP_LABEL[spec.group], metres: 0, pieces: 0, cableKg: 0, litres: 0, trunks: 0, limitedBy: 'weight' as const, lines: [] };
    if (spec.kgEach !== undefined) {
      g.pieces += c.quantity;
      g.cableKg += c.quantity * spec.kgEach;
      g.litres += c.quantity * (spec.litresEach ?? 0);
    } else {
      const m = (c.lengthM ?? t.defaultLengthM) * c.quantity;
      g.metres += m;
      g.cableKg += m * spec.kgPerM;
      // Litres of cable per metre, then the gaps a coil leaves.
      g.litres += (m * (Math.PI * spec.diameterMm * spec.diameterMm)) / 4 / 1000 / Math.max(0.1, t.fill);
    }
    g.lines.push(`${c.quantity} x ${c.name}`);
    groups.set(spec.group, g);
  }
  for (const g of groups.values()) {
    const byKg = g.cableKg / Math.max(1, t.maxKg);
    const bySpace = g.litres / Math.max(1, t.litres);
    g.trunks = Math.max(1, Math.ceil(Math.max(byKg, bySpace) - 1e-9));
    g.limitedBy = byKg >= bySpace ? 'weight' : 'space';
    g.cableKg = Math.round(g.cableKg * 10) / 10;
    g.litres = Math.round(g.litres);
    g.metres = Math.round(g.metres * 10) / 10;
  }
  const order: TrunkGroup[] = ['SOCA', 'POWER', 'DATA', 'MOTOR'];
  return [...groups.values()].sort((a, b) => order.indexOf(a.group) - order.indexOf(b.group));
}

// ---------------------------------------------------------------------------------------------
// Kit into a manifest of cases
// ---------------------------------------------------------------------------------------------

export interface FixtureCaseLike {
  displayName: string;
  aliases: string | null;
  weightKg: number | null;
  clampKg: number | null;
  caseId: string | null;
}

export interface ItemRuleLike {
  id: string;
  /** Every word must appear in the item's name (case-insensitive). */
  match: string;
  caseId: string | null;
  unitsPerCase: number;
  /** Weight of one item, without its case. */
  itemKg: number;
  /** Not packed at all (labour, services, consumables). */
  ignore: boolean;
  category: PackCategory | null;
}

export interface KitLine {
  name: string;
  quantity: number;
}

export interface ManifestResult {
  lines: ManifestLine[];
  trunks: TrunkPlan[];
  /** Kit with no case to pack it in yet. */
  unknown: { name: string; quantity: number; reason: string }[];
  ignored: { name: string; quantity: number }[];
  notes: string[];
}

/** Lower case, words and numbers only, and "3.0 m" read the same as "3m". */
const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/(\d)[.,](\d)/g, '$1.$2')
    .replace(/(\d+)\.0+(?!\d)/g, '$1')
    .replace(/(\d)\s+(m|kg|t|a)\b/g, '$1$2')
    .replace(/[^a-z0-9.]+/g, ' ')
    .replace(/(^|\s)\.|\.(\s|$)/g, ' ')
    .trim();

/** A rule matches when each of its words is in the name. Longer (more specific) rules win. */
export function matchItemRule<T extends Pick<ItemRuleLike, 'match'>>(name: string, rules: T[]): T | null {
  const words = ` ${norm(name)} `;
  let best: T | null = null;
  let bestLen = 0;
  for (const r of rules) {
    const parts = norm(r.match).split(' ').filter(Boolean);
    if (!parts.length) continue;
    if (parts.every((p) => words.includes(` ${p} `) || (p.length > 3 && words.includes(p)))) {
      const len = parts.join(' ').length;
      if (len > bestLen) {
        best = r;
        bestLen = len;
      }
    }
  }
  return best;
}

/** A fixture by its name or one of its aliases, with or without the maker's name in front. */
export function matchFixtureCase<T extends FixtureCaseLike>(name: string, fixtures: T[]): T | null {
  const n = norm(name);
  let best: T | null = null;
  let bestLen = 0;
  for (const f of fixtures) {
    const names = [f.displayName, ...(f.aliases ?? '').split(',')].map(norm).filter(Boolean);
    // Without the maker ("Robe MegaPointe" also matches "MegaPointe").
    const bare = norm(f.displayName).split(' ').slice(1).join(' ');
    if (bare.length > 3) names.push(bare);
    for (const cand of names) {
      if (n === cand || ` ${n} `.includes(` ${cand} `)) {
        if (cand.length > bestLen) {
          best = f;
          bestLen = cand.length;
        }
      }
    }
  }
  return best;
}

export interface ManifestInput {
  kit: KitLine[];
  source: 'PICKLIST' | 'PATCH';
  fixtures: FixtureCaseLike[];
  /** The case rules: units per case by fixture type. */
  caseRules: { name: string; unitsPerCase: number }[];
  itemRules: ItemRuleLike[];
  cases: CaseSpecLike[];
  cableSpecs: Record<CableKind, CableSpec>;
  trunk: TrunkSettings;
  /** Extra cable lines (the Cable (beta) plan) when the kit list has none. */
  cablePlan?: KitLine[];
  /** Cases added by hand. */
  manual?: { key: string; caseId: string; label: string; cases: number; kgEach: number | null }[];
  /** Case counts typed over the worked-out ones, by line key. */
  overrides?: Record<string, number>;
}

const r1 = (n: number) => Math.round(n * 10) / 10;

export function buildManifest(input: ManifestInput): ManifestResult {
  const caseById = new Map(input.cases.map((c) => [c.id, c]));
  const lines: ManifestLine[] = [];
  const unknown: ManifestResult['unknown'] = [];
  const ignored: ManifestResult['ignored'] = [];
  const notes: string[] = [];
  const cables: { name: string; kind: CableKind; lengthM: number | null; quantity: number }[] = [];
  const unitsFor = (names: string[]) => {
    for (const n of names) {
      const r = input.caseRules.find((c) => norm(c.name) === norm(n));
      if (r) return Math.max(1, r.unitsPerCase);
    }
    return null;
  };
  const noWeight = new Set<string>();

  // The same item listed twice adds up.
  const kit = new Map<string, KitLine>();
  for (const k of input.kit) {
    const q = Math.max(0, Math.round(Number(k.quantity) || 0));
    if (!q || !k.name.trim()) continue;
    const key = norm(k.name);
    const prev = kit.get(key);
    kit.set(key, { name: prev?.name ?? k.name.trim(), quantity: (prev?.quantity ?? 0) + q });
  }

  for (const [key, k] of kit) {
    const rule = matchItemRule(k.name, input.itemRules);
    if (rule?.ignore) {
      ignored.push(k);
      continue;
    }
    if (rule?.caseId) {
      const c = caseById.get(rule.caseId);
      if (!c) {
        unknown.push({ ...k, reason: 'Its item rule points at a case that no longer exists' });
        continue;
      }
      const units = Math.max(1, rule.unitsPerCase);
      const n = Math.ceil(k.quantity / units);
      lines.push({
        key: `item:${key}`,
        label: k.name,
        caseId: c.id,
        cases: n,
        kgEach: r1(c.emptyKg + (k.quantity / n) * rule.itemKg),
        category: rule.category ?? c.category,
        contents: units > 1 ? `${k.quantity} in ${n} ${c.name}, ${units} per case` : c.name === k.name ? 'Loose' : `1 per ${c.name}`,
        source: input.source,
      });
      continue;
    }
    const fx = matchFixtureCase(k.name, input.fixtures);
    if (fx) {
      const c = fx.caseId ? caseById.get(fx.caseId) : null;
      if (!c) {
        unknown.push({ ...k, reason: `No case set for ${fx.displayName}` });
        continue;
      }
      const units = unitsFor([k.name, fx.displayName, ...(fx.aliases ?? '').split(',')]) ?? Math.max(1, c.holds);
      const n = Math.ceil(k.quantity / units);
      if (fx.weightKg == null) noWeight.add(fx.displayName);
      const each = (fx.weightKg ?? 0) + (fx.clampKg ?? 1);
      lines.push({
        key: `fx:${key}`,
        label: k.name,
        caseId: c.id,
        cases: n,
        kgEach: r1(c.emptyKg + (k.quantity / n) * each),
        category: 'FIXTURES',
        contents: `${k.quantity} in ${n} ${c.name}, ${units} per case`,
        source: input.source,
      });
      continue;
    }
    const cable = classifyCable(k.name);
    if (cable) {
      cables.push({ name: k.name, ...cable, quantity: k.quantity });
      continue;
    }
    unknown.push({ ...k, reason: 'Not a known fixture or cable, and no item rule matches it' });
  }

  // The cable plan stands in for a kit list with no cable on it.
  if (!cables.length && input.cablePlan?.length) {
    for (const k of input.cablePlan) {
      const cable = classifyCable(k.name);
      if (cable && k.quantity > 0) cables.push({ name: k.name, ...cable, quantity: Math.round(k.quantity) });
    }
    if (cables.length) notes.push('Cable comes from the Cable (beta) plan, as the kit list has none.');
  }
  if (cables.some((c) => c.lengthM === null && c.kind !== 'SPIDER')) notes.push(`Cable with no length in its name is taken as ${input.trunk.defaultLengthM} m.`);

  const trunkCase = caseById.get(input.trunk.caseId);
  const trunks = planCableTrunks(cables, input.cableSpecs, input.trunk);
  if (trunks.length && !trunkCase) notes.push('No cable trunk case is set in the truck pack settings, so cable is not packed.');
  if (trunkCase) {
    for (const t of trunks) {
      lines.push({
        key: `trunk:${t.group}`,
        label: `${t.label} trunk`,
        caseId: trunkCase.id,
        cases: t.trunks,
        kgEach: r1(trunkCase.emptyKg + t.cableKg / t.trunks),
        category: TRUNK_GROUP_CATEGORY[t.group],
        contents: [t.metres ? `${t.metres} m` : '', t.pieces ? `${t.pieces} pieces` : '', `${t.cableKg} kg of cable`].filter(Boolean).join(', '),
        source: 'CABLE',
      });
    }
  }

  for (const m of input.manual ?? []) {
    const c = caseById.get(m.caseId);
    if (!c || m.cases <= 0) continue;
    lines.push({ key: m.key, label: m.label || c.name, caseId: c.id, cases: Math.round(m.cases), kgEach: m.kgEach ?? c.emptyKg, category: c.category, contents: 'Added by hand', source: 'MANUAL' });
  }

  for (const l of lines) {
    const o = input.overrides?.[l.key];
    if (o !== undefined && o >= 0) l.cases = Math.round(o);
  }
  if (noWeight.size) notes.push(`No weight in the fixture database for ${[...noWeight].join(', ')}: those cases count as empty.`);
  return { lines: lines.filter((l) => l.cases > 0), trunks, unknown, ignored, notes };
}

// ---------------------------------------------------------------------------------------------
// Packing
// ---------------------------------------------------------------------------------------------

interface Unit {
  lineKey: string;
  label: string;
  spec: CaseSpecLike;
  kg: number;
  category: PackCategory;
}

export interface PlacedCase {
  lineKey: string;
  label: string;
  caseId: string;
  caseName: string;
  zMm: number;
  heightMm: number;
  kg: number;
  /** Footprint of this case, which may be smaller than the stack's. */
  lengthMm: number;
  widthMm: number;
}

export interface PlacedStack {
  id: string;
  /** Loading order, 1 goes in first (at the cab end). */
  step: number;
  /** Along the length from the cab bulkhead. */
  xMm: number;
  /** Across the width from the left wall (driver's side in the UK). */
  yMm: number;
  lengthMm: number;
  widthMm: number;
  heightMm: number;
  rotated: boolean;
  kg: number;
  category: PackCategory;
  cases: PlacedCase[];
}

export interface Unplaced {
  lineKey: string;
  label: string;
  count: number;
  reason: string;
}

export interface VehiclePack {
  vehicleId: string;
  vehicleName: string;
  stacks: PlacedStack[];
  unplaced: Unplaced[];
  kg: number;
  payloadKg: number;
  usedLengthMm: number;
  /** Share of the load space's volume taken by cases. */
  fillPct: number;
  cases: number;
  /** Centre of the load, as shares of the length (0 at the cab) and the width (0 at the left). */
  cog: { xPct: number; yPct: number } | null;
  flags: string[];
  fits: boolean;
  overweight: boolean;
}

/** Highest a case may be stacked in this space, itself included. */
function levelsFor(spec: CaseSpecLike, v: VehicleLike, s: PackSettingsLike) {
  return Math.max(1, Math.min(spec.maxStack, Math.floor((v.heightMm - s.clearanceMm) / spec.heightMm)));
}

interface Stack {
  units: Unit[];
  footL: number;
  footW: number;
}

function buildStacks(units: Unit[], v: VehicleLike, s: PackSettingsLike): Stack[] {
  const groups = new Map<string, Unit[]>();
  for (const u of units) groups.set(u.spec.id, [...(groups.get(u.spec.id) ?? []), u]);
  const stacks: Stack[] = [];
  for (const list of groups.values()) {
    const spec = list[0].spec;
    const levels = levelsFor(spec, v, s);
    // The same kind of kit together, heaviest at the bottom.
    const sorted = [...list].sort((a, b) => a.lineKey.localeCompare(b.lineKey) || b.kg - a.kg);
    for (let i = 0; i < sorted.length; i += levels) {
      const chunk = sorted.slice(i, i + levels).sort((a, b) => b.kg - a.kg);
      stacks.push({ units: chunk, footL: spec.lengthMm, footW: spec.widthMm });
    }
  }
  if (!s.mixedStacking) return stacks;

  // Short stacks top up others of the same category: a lighter case that fits within the
  // footprint of the one below it, under the roof, and within every case's stacking limit.
  const roof = v.heightMm - s.clearanceMm;
  const height = (st: Stack) => st.units.reduce((n, u) => n + u.spec.heightMm, 0);
  const fitsOn = (top: CaseSpecLike, below: CaseSpecLike) =>
    (top.lengthMm <= below.lengthMm && top.widthMm <= below.widthMm) || (top.lengthMm <= below.widthMm && top.widthMm <= below.lengthMm);
  const donors = stacks.filter((st) => st.units.length < levelsFor(st.units[0].spec, v, s) && st.units.every((u) => u.spec.canGoOnTop));
  donors.sort((a, b) => b.footL * b.footW - a.footL * a.footW);
  for (const d of donors) {
    while (d.units.length) {
      const u = d.units[d.units.length - 1];
      const target = stacks
        .filter((st) => st !== d && st.units.length && st.units[0].category === u.category)
        .filter((st) => {
          const top = st.units[st.units.length - 1];
          const limit = Math.min(...st.units.map((x) => x.spec.maxStack), u.spec.maxStack);
          return st.units.length + 1 <= limit && height(st) + u.spec.heightMm <= roof && fitsOn(u.spec, top.spec) && u.kg <= top.kg;
        })
        .sort((a, b) => b.footL * b.footW - a.footL * a.footW)[0];
      if (!target) break;
      target.units.push(d.units.pop()!);
    }
  }
  return stacks.filter((st) => st.units.length);
}

interface Rect {
  x: number;
  y: number;
  l: number;
  w: number;
}

const overlaps = (a: Rect, b: Rect) => a.x < b.x + b.l && b.x < a.x + a.l && a.y < b.y + b.w && b.y < a.y + a.w;
const contains = (a: Rect, b: Rect) => b.x >= a.x && b.y >= a.y && b.x + b.l <= a.x + a.l && b.y + b.w <= a.y + a.w;

/** Free floor after `used` is taken out of `free` (maximal rectangles). */
function carve(free: Rect[], used: Rect): Rect[] {
  const out: Rect[] = [];
  for (const f of free) {
    if (!overlaps(f, used)) {
      out.push(f);
      continue;
    }
    if (used.x > f.x) out.push({ x: f.x, y: f.y, l: used.x - f.x, w: f.w });
    if (used.x + used.l < f.x + f.l) out.push({ x: used.x + used.l, y: f.y, l: f.x + f.l - (used.x + used.l), w: f.w });
    if (used.y > f.y) out.push({ x: f.x, y: f.y, l: f.l, w: used.y - f.y });
    if (used.y + used.w < f.y + f.w) out.push({ x: f.x, y: used.y + used.w, l: f.l, w: f.y + f.w - (used.y + used.w) });
  }
  return out.filter((r, i) => r.l > 0 && r.w > 0 && !out.some((o, j) => j !== i && contains(o, r) && (!contains(r, o) || j < i)));
}

/** Can a single case get into the vehicle at all, and if not, why. */
function wontGoIn(spec: CaseSpecLike, v: VehicleLike, s: PackSettingsLike): string | null {
  const short = Math.min(spec.lengthMm, spec.widthMm);
  const long = Math.max(spec.lengthMm, spec.widthMm);
  if (spec.heightMm > v.heightMm - s.clearanceMm) return 'Taller than the load space';
  if (v.doorHeightMm && spec.heightMm > v.doorHeightMm) return 'Taller than the doors';
  if (v.doorWidthMm && short > v.doorWidthMm) return 'Wider than the doors';
  const floorW = v.widthMm;
  if (spec.canRotate ? short > floorW || long > v.lengthMm : spec.widthMm > floorW || spec.lengthMm > v.lengthMm) return 'Too big for the floor';
  return null;
}

function expand(lines: ManifestLine[], cases: CaseSpecLike[]): { units: Unit[]; missing: Unplaced[] } {
  const byId = new Map(cases.map((c) => [c.id, c]));
  const units: Unit[] = [];
  const missing: Unplaced[] = [];
  for (const l of lines) {
    const spec = byId.get(l.caseId);
    if (!spec) {
      missing.push({ lineKey: l.key, label: l.label, count: l.cases, reason: 'Its case is not in the case library' });
      continue;
    }
    for (let i = 0; i < l.cases; i++) units.push({ lineKey: l.key, label: l.label, spec, kg: l.kgEach, category: l.category });
  }
  return { units, missing };
}

function packUnits(units: Unit[], v: VehicleLike, s: PackSettingsLike): { pack: VehiclePack; left: Unit[] } {
  const unplaced = new Map<string, Unplaced>();
  const addUnplaced = (u: Unit, reason: string) => {
    const k = `${u.lineKey}|${reason}`;
    const e = unplaced.get(k) ?? { lineKey: u.lineKey, label: u.label, count: 0, reason };
    e.count++;
    unplaced.set(k, e);
  };
  const fitting: Unit[] = [];
  for (const u of units) {
    const why = wontGoIn(u.spec, v, s);
    if (why) addUnplaced(u, why);
    else fitting.push(u);
  }

  // Loaded first: what's needed last at the venue, then the heaviest and the biggest.
  const order = s.unloadOrder.length ? s.unloadOrder : DEFAULT_UNLOAD_ORDER;
  const loadRank = (c: PackCategory) => {
    const i = order.indexOf(c);
    return i < 0 ? -1 : order.length - 1 - i;
  };
  const stacks = buildStacks(fitting, v, s);
  const stackKg = (st: Stack) => st.units.reduce((n, u) => n + u.kg, 0);
  // Within a group, stacks of the same case stay together so rows come out even, the densest
  // kinds (kg per square metre of floor) nearest the cab, and the heaviest of each kind first.
  const density = new Map<string, number>();
  for (const st of stacks) {
    const id = st.units[0].spec.id;
    density.set(id, Math.max(density.get(id) ?? 0, stackKg(st) / ((st.footL * st.footW) / 1e6)));
  }
  const dens = (st: Stack) => density.get(st.units[0].spec.id) ?? 0;
  stacks.sort(
    (a, b) =>
      loadRank(a.units[0].category) - loadRank(b.units[0].category) ||
      dens(b) - dens(a) ||
      a.units[0].spec.id.localeCompare(b.units[0].spec.id) ||
      stackKg(b) - stackKg(a)
  );

  let free: Rect[] = [{ x: 0, y: 0, l: v.lengthMm, w: v.widthMm }];
  if (v.arch && v.arch.clearWidthMm < v.widthMm) {
    const side = (v.widthMm - v.arch.clearWidthMm) / 2;
    const l = v.arch.toMm - v.arch.fromMm;
    free = carve(free, { x: v.arch.fromMm, y: 0, l, w: side });
    free = carve(free, { x: v.arch.fromMm, y: v.widthMm - side, l, w: side });
  }

  const placed: PlacedStack[] = [];
  const left: Unit[] = [];
  const leave = (st: Stack, reason: string) => {
    left.push(...st.units);
    for (const u of st.units) addUnplaced(u, reason);
  };
  let kg = 0;
  // Kit needed sooner at the venue never goes further forward than kit loaded before it in an
  // earlier group, or it would be buried. Within a group, gaps are filled freely.
  let rank = -Infinity;
  let minX = 0;
  for (const st of stacks) {
    const spec = st.units[0].spec;
    const stKg = stackKg(st);
    const r = loadRank(st.units[0].category);
    if (r !== rank) {
      rank = r;
      minX = placed.reduce((n, p) => Math.max(n, p.xMm), 0);
    }
    // Payload first: a stack that would overload the vehicle stays off.
    if (kg + stKg > v.payloadKg + 1e-6) {
      leave(st, 'Over the payload');
      continue;
    }
    const options: { l: number; w: number; rotated: boolean }[] = [{ l: st.footL, w: st.footW, rotated: false }];
    if (spec.canRotate && st.footL !== st.footW) options.push({ l: st.footW, w: st.footL, rotated: true });
    let best: { r: Rect; rotated: boolean } | null = null;
    for (const f of free) {
      const x = Math.max(f.x, minX);
      for (const o of options) {
        if (x + o.l > f.x + f.l || o.w > f.w) continue;
        const r = { x, y: f.y, l: o.l, w: o.w };
        // Nearest the cab, then nearest the left wall; ties go to the snugger fit.
        if (!best || r.x < best.r.x - 0.5 || (Math.abs(r.x - best.r.x) <= 0.5 && r.y < best.r.y - 0.5)) best = { r, rotated: o.rotated };
      }
    }
    if (!best) {
      leave(st, 'No room left');
      continue;
    }
    free = carve(free, best.r);
    kg += stKg;
    let z = 0;
    const cases: PlacedCase[] = st.units.map((u) => {
      const c: PlacedCase = { lineKey: u.lineKey, label: u.label, caseId: u.spec.id, caseName: u.spec.name, zMm: z, heightMm: u.spec.heightMm, kg: u.kg, lengthMm: u.spec.lengthMm, widthMm: u.spec.widthMm };
      z += u.spec.heightMm;
      return c;
    });
    placed.push({ id: '', step: 0, xMm: best.r.x, yMm: best.r.y, lengthMm: best.r.l, widthMm: best.r.w, heightMm: z, rotated: best.rotated, kg: stKg, category: st.units[0].category, cases });
  }

  placed.sort((a, b) => a.xMm - b.xMm || a.yMm - b.yMm);
  placed.forEach((p, i) => {
    p.step = i + 1;
    p.id = `s${i + 1}`;
  });

  const total = placed.reduce((n, p) => n + p.kg, 0);
  const cog = total > 0
    ? {
        xPct: (placed.reduce((n, p) => n + p.kg * (p.xMm + p.lengthMm / 2), 0) / total / v.lengthMm) * 100,
        yPct: (placed.reduce((n, p) => n + p.kg * (p.yMm + p.widthMm / 2), 0) / total / v.widthMm) * 100,
      }
    : null;
  const usedLengthMm = placed.reduce((n, p) => Math.max(n, p.xMm + p.lengthMm), 0);
  const volume = placed.reduce((n, p) => n + p.cases.reduce((m, c) => m + c.lengthMm * c.widthMm * c.heightMm, 0), 0);
  const flags: string[] = [];
  const list = [...unplaced.values()];
  const overweight = list.some((u) => u.reason === 'Over the payload');
  if (overweight) flags.push(`Over the ${Math.round(v.payloadKg)} kg payload: ${list.filter((u) => u.reason === 'Over the payload').reduce((n, u) => n + u.count, 0)} cases left off.`);
  if (list.some((u) => u.reason === 'No room left')) flags.push(`No room for ${list.filter((u) => u.reason === 'No room left').reduce((n, u) => n + u.count, 0)} cases.`);
  if (cog && Math.abs(cog.yPct - 50) > s.maxSideOffsetPct) flags.push(`The weight sits towards the ${cog.yPct < 50 ? 'left' : 'right'} side: swap some heavy stacks across.`);
  if (cog && cog.xPct > s.maxRearCogPct) flags.push('The weight sits towards the doors: bring heavy stacks forward.');
  return {
    pack: {
      vehicleId: v.id,
      vehicleName: v.name,
      stacks: placed,
      unplaced: list,
      kg: Math.round(total),
      payloadKg: v.payloadKg,
      usedLengthMm: Math.round(usedLengthMm),
      fillPct: Math.round((volume / (v.lengthMm * v.widthMm * v.heightMm)) * 1000) / 10,
      cases: placed.reduce((n, p) => n + p.cases.length, 0),
      cog: cog && { xPct: Math.round(cog.xPct * 10) / 10, yPct: Math.round(cog.yPct * 10) / 10 },
      flags,
      fits: list.length === 0,
      overweight,
    },
    left,
  };
}

export interface VehicleCheck {
  vehicleId: string;
  fits: boolean;
  /** Why not, in a few words. */
  reason: string | null;
  usedLengthMm: number;
  kg: number;
}

export interface TruckPackResult {
  totals: { cases: number; kg: number; volumeM3: number };
  /** Every vehicle, smallest first, with whether the whole load fits. */
  checks: VehicleCheck[];
  /** The smallest vehicle the whole load fits in, or null when it needs more than one. */
  smallestId: string | null;
  /** The pack shown: the chosen vehicle, the smallest that fits, or a split across several. */
  packs: VehiclePack[];
  split: boolean;
  /** Cases whose case isn't in the library. */
  missing: Unplaced[];
}

/** Smallest first: by the size of the load space, then by payload. */
export const vehicleOrder = (a: VehicleLike, b: VehicleLike) => a.lengthMm * a.widthMm * a.heightMm - b.lengthMm * b.widthMm * b.heightMm || a.payloadKg - b.payloadKg;

export function planTruckPack(lines: ManifestLine[], cases: CaseSpecLike[], vehicles: VehicleLike[], settings: PackSettingsLike, opts: { vehicleId?: string | null } = {}): TruckPackResult {
  const { units, missing } = expand(lines, cases);
  const totals = {
    cases: units.length,
    kg: Math.round(units.reduce((n, u) => n + u.kg, 0)),
    volumeM3: Math.round((units.reduce((n, u) => n + u.spec.lengthMm * u.spec.widthMm * u.spec.heightMm, 0) / 1e9) * 10) / 10,
  };
  const sorted = [...vehicles].sort(vehicleOrder);
  const results = sorted.map((v) => ({ v, ...packUnits(units, v, settings) }));
  const checks: VehicleCheck[] = results.map(({ v, pack }) => ({
    vehicleId: v.id,
    fits: pack.fits,
    reason: pack.fits ? null : pack.overweight ? 'Too heavy' : pack.unplaced.some((u) => u.reason === 'No room left') ? 'Too small' : pack.unplaced[0]?.reason ?? null,
    usedLengthMm: pack.usedLengthMm,
    kg: pack.kg,
  }));
  const smallest = results.find((r) => r.pack.fits) ?? null;
  const chosen = opts.vehicleId ? results.find((r) => r.v.id === opts.vehicleId) : null;
  if (chosen) return { totals, checks, smallestId: smallest?.v.id ?? null, packs: [chosen.pack], split: false, missing };
  if (smallest || !sorted.length) return { totals, checks, smallestId: smallest?.v.id ?? null, packs: smallest ? [smallest.pack] : [], split: false, missing };

  // Nothing takes it all: fill the biggest, then put what's left in the smallest that takes it.
  const packs: VehiclePack[] = [];
  const biggest = results[results.length - 1].v;
  let rest = units;
  for (let i = 0; i < 12 && rest.length; i++) {
    const next = sorted.map((v) => ({ v, ...packUnits(rest, v, settings) })).find((r) => r.pack.fits) ?? { v: biggest, ...packUnits(rest, biggest, settings) };
    // Cases that fit no vehicle at all stop the split.
    if (!next.pack.stacks.length) {
      packs.push(next.pack);
      break;
    }
    packs.push({ ...next.pack, unplaced: next.pack.unplaced.filter((u) => u.reason !== 'No room left' && u.reason !== 'Over the payload') });
    rest = next.left;
  }
  return { totals, checks, smallestId: null, packs, split: true, missing };
}
