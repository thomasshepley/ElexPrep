/**
 * Cable calculator: turns a job's hanging positions (trusses, floor, FOH), the fixtures on each
 * and the company's cable rules into a per-position cable list and job totals. Pure and
 * deterministic: every number in the result carries a short note saying which rule produced it,
 * so the person checking the plan can see its working.
 *
 * Conventions (UK touring): one fixture per 16A circuit, six circuits per Socapex, fan-outs
 * (spiders) at the truss, a fan-out is TRUE1 only when every fixture on it is TRUE1. Looms are
 * built per job from individual cables, so the output is a cable list, not a loom list.
 */

export type PowerConnector = 'CEE16' | 'TRUE1' | 'POWERCON' | 'OTHER';
export type DataConnector = 'DMX5' | 'DMX3' | 'ETHERCON';
export type PositionKind = 'TRUSS' | 'FLOOR' | 'FOH' | 'OTHER';
export type DataPolicy = 'DMX_FROM_DISTRO' | 'NODE_PER_TRUSS';

export interface FixtureProfileLike {
  typeKey: string;
  displayName: string;
  /** Maximum draw at 230 V. */
  watts: number;
  amps?: number | null;
  powerConnector: PowerConnector;
  hasPowerThru: boolean;
  dataConnector: DataConnector;
  /** RJ45 data in and out, so fixtures can chain on Cat without a node. */
  hasDataThru?: boolean;
  /** Maker's units-per-line when power chaining is allowed. */
  maxPerLine?: number | null;
  inrushA?: number | null;
  /** Other names the patch uses for this fixture, comma separated. */
  aliases?: string | null;
}

export interface CableRules {
  voltage: number;
  circuitAmps: number;
  /** Share of a circuit's rating a plan may use continuously (0 to 1). */
  utilisation: number;
  circuitsPerSoca: number;
  /** Chain fixtures with a power thru on one circuit (up to the maker's per-line figure). */
  allowChainWhenThru: boolean;
  spareCircuitsPerPosition: number;
  socaLengthsM: number[];
  dmxLengthsM: number[];
  catLengthsM: number[];
  jumperLengthsM: number[];
  motorCableLengthsM: number[];
  /** Extra on the vertical drop for cable swag, percent. */
  swagPct: number;
  floorSlackM: number;
  distroTailM: number;
  maxDmxDevicesPerLine: number;
  dataPolicy: DataPolicy;
  spareDmxLinePerPosition: boolean;
  /** Ports on one truss node (NODE_PER_TRUSS). */
  nodePorts: number;
  defaultTrimM: number;
  /** Where dimmer city sits. Elex: always stage right. */
  distroSide: 'SR' | 'SL' | 'US' | 'DS';
  /** Horizontal run from a position's cable pick to dimmer city when none is entered. */
  defaultDistanceM: number;
  /** How far along a truss a Soca can reach past its cable pick before it needs an extension. */
  trussReachM: number;
  /** Gap left between fixtures when working out jumper lengths, metres. */
  jumperSlackM: number;
  /** Motors: rigging, kept apart from the lighting pack. */
  motorsEnabled: boolean;
  motorWaysPerController: number;
}

/** The standard set; every value is editable in Settings > Cable rules. */
export const DEFAULT_CABLE_RULES: CableRules = {
  voltage: 230,
  circuitAmps: 16,
  utilisation: 0.8,
  circuitsPerSoca: 6,
  allowChainWhenThru: false,
  spareCircuitsPerPosition: 1,
  socaLengthsM: [5, 10, 15, 20, 25, 30],
  dmxLengthsM: [1, 2, 3, 5, 10, 15, 20, 25, 30, 50],
  catLengthsM: [5, 10, 15, 20, 25, 30, 50],
  jumperLengthsM: [1, 2, 3, 5],
  motorCableLengthsM: [5, 10, 15, 20, 25, 30],
  swagPct: 10,
  floorSlackM: 3,
  distroTailM: 2,
  maxDmxDevicesPerLine: 16,
  dataPolicy: 'DMX_FROM_DISTRO',
  spareDmxLinePerPosition: false,
  nodePorts: 4,
  defaultTrimM: 6,
  distroSide: 'SR',
  defaultDistanceM: 12,
  trussReachM: 6,
  jumperSlackM: 0.5,
  motorsEnabled: true,
  motorWaysPerController: 8,
};

/** Merges a stored (possibly partial or older) rule set over the defaults, keeping only sane values. */
export function normaliseCableRules(stored: Partial<CableRules> | null | undefined): CableRules {
  const r: CableRules = { ...DEFAULT_CABLE_RULES };
  if (!stored || typeof stored !== 'object') return r;
  const num = (k: keyof CableRules, min: number, max: number) => {
    const v = Number((stored as Record<string, unknown>)[k]);
    if (Number.isFinite(v) && v >= min && v <= max) (r as unknown as Record<string, unknown>)[k] = v;
  };
  const list = (k: keyof CableRules) => {
    const v = (stored as Record<string, unknown>)[k];
    if (Array.isArray(v)) {
      const clean = [...new Set(v.map(Number).filter((n) => Number.isFinite(n) && n > 0 && n <= 500))].sort((a, b) => a - b);
      if (clean.length) (r as unknown as Record<string, unknown>)[k] = clean;
    }
  };
  num('voltage', 100, 400);
  num('circuitAmps', 1, 63);
  num('utilisation', 0.1, 1);
  num('circuitsPerSoca', 1, 12);
  num('spareCircuitsPerPosition', 0, 12);
  num('swagPct', 0, 100);
  num('floorSlackM', 0, 50);
  num('distroTailM', 0, 50);
  num('maxDmxDevicesPerLine', 1, 32);
  num('nodePorts', 1, 16);
  num('defaultTrimM', 0, 40);
  num('defaultDistanceM', 0, 300);
  num('trussReachM', 0, 50);
  num('jumperSlackM', 0, 5);
  num('motorWaysPerController', 1, 32);
  list('socaLengthsM');
  list('dmxLengthsM');
  list('catLengthsM');
  list('jumperLengthsM');
  list('motorCableLengthsM');
  for (const k of ['allowChainWhenThru', 'spareDmxLinePerPosition', 'motorsEnabled'] as const) {
    if (typeof stored[k] === 'boolean') r[k] = stored[k] as boolean;
  }
  if (stored.dataPolicy === 'DMX_FROM_DISTRO' || stored.dataPolicy === 'NODE_PER_TRUSS') r.dataPolicy = stored.dataPolicy;
  if (stored.distroSide && ['SR', 'SL', 'US', 'DS'].includes(stored.distroSide)) r.distroSide = stored.distroSide;
  return r;
}

/** Lowercase letters and digits only: "Robe BMFL Spot" and "robe-bmfl spot" match. */
export function fixtureTypeKey(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '');
}

/**
 * The profile for a patch fixture type: an exact key or alias match first, then one name ending
 * with the other (a patch often drops the maker, "BMFL Spot" for "Robe BMFL Spot").
 */
export function matchFixtureProfile<T extends FixtureProfileLike>(fixtureType: string, profiles: T[]): T | null {
  const key = fixtureTypeKey(fixtureType);
  if (!key) return null;
  const keysOf = (p: T) => [p.typeKey, fixtureTypeKey(p.displayName), ...(p.aliases ?? '').split(',').map(fixtureTypeKey)].filter(Boolean);
  const exact = profiles.find((p) => keysOf(p).includes(key));
  if (exact) return exact;
  const loose = profiles
    .filter((p) => keysOf(p).some((k) => (k.length >= 4 && key.length >= 4 && (k.endsWith(key) || key.endsWith(k)))))
    .sort((a, b) => b.typeKey.length - a.typeKey.length);
  return loose[0] ?? null;
}

export interface PositionFixture {
  address?: number | null;
  type: string;
  universe?: number | null;
  profile: FixtureProfileLike | null;
}

export interface PositionInput {
  name: string;
  kind: PositionKind;
  /** Truss length, metres. */
  lengthM?: number | null;
  trimM?: number | null;
  /** Horizontal run from this position's cable pick to dimmer city, metres. */
  distanceM?: number | null;
  /** Distance along the truss from the cable pick to the truss's near end (0 = pick at the end). */
  pickOffsetM?: number | null;
  motors?: number | null;
  fixtures: PositionFixture[];
}

export interface Explained<T> {
  value: T;
  why: string;
}

export interface SocaPlan {
  index: number;
  fanout: 'TRUE1' | 'CEE16';
  /** Fixtures on this soca, by patch number where there is one. */
  fixtures: string[];
  circuitsUsed: number;
  spare: number;
  amps: number;
  /** Why the fan-out is 16A when some fixtures are TRUE1. */
  forced16A: string[];
  extensionM: number[];
}

export interface DataLine {
  universe: number | null;
  devices: number;
  lengthM: number[];
  spare?: boolean;
}

export interface PositionPlan {
  name: string;
  kind: PositionKind;
  fixtureCount: number;
  watts: number;
  amps: number;
  circuits: Explained<number>;
  socaCount: Explained<number>;
  loomRunM: Explained<number>;
  socaLengthM: Explained<number[]>;
  socas: SocaPlan[];
  data: {
    policy: DataPolicy | 'CAT_CHAIN';
    lines: DataLine[];
    node: Explained<number> | null;
    catLengthM: number[] | null;
    why: string;
  };
  jumpers: { power: { label: string; lengthM: number; count: number }[]; data: { label: string; lengthM: number; count: number }[]; why: string };
  rigging: { motors: number; cableLengthM: number[]; why: string } | null;
  flags: string[];
  assumed: string[];
}

export interface StockTotal {
  key: string;
  label: string;
  /** Lighting pack or rigging (motors), kept separate. */
  section: 'LIGHTING' | 'RIGGING';
  quantity: number;
}

export interface CablePlanResult {
  positions: PositionPlan[];
  totals: StockTotal[];
  distro: { socaOuts: number; circuits: number; amps: number; ampsPerPhase: [number, number, number]; why: string };
  flags: string[];
  unplaced: string[];
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/**
 * The stock lengths that cover `needM`: the shortest single length that does, else the fewest
 * pieces (the longest length repeated, then the shortest piece that covers what's left).
 */
export function coverWithStock(needM: number, stock: number[]): number[] {
  const sorted = [...stock].sort((a, b) => a - b);
  if (sorted.length === 0) return [Math.ceil(needM)];
  if (needM <= 0) return [sorted[0]];
  const single = sorted.find((s) => s >= needM - 1e-9);
  if (single !== undefined) return [single];
  const longest = sorted[sorted.length - 1];
  const parts: number[] = [];
  let left = needM;
  while (left > longest + 1e-9) {
    parts.push(longest);
    left -= longest;
  }
  parts.push(sorted.find((s) => s >= left - 1e-9) ?? longest);
  return parts;
}

const fmtLengths = (l: number[]) => l.map((n) => `${n} m`).join(' + ');

/** The jumper stock length for a gap between neighbouring fixtures. */
function jumperLength(lengthM: number | null | undefined, count: number, rules: CableRules): number {
  const gap = lengthM && count > 1 ? lengthM / (count - 1) : 1;
  return coverWithStock(gap + rules.jumperSlackM, rules.jumperLengthsM)[0];
}

function fixtureLabel(f: PositionFixture) {
  return f.address != null ? `${f.type} ${f.address}` : f.type;
}

/** A circuit: one fixture, or several chained on a power thru when the rules allow it. */
interface Circuit {
  fixtures: PositionFixture[];
  watts: number;
}

function buildCircuits(fixtures: PositionFixture[], rules: CableRules, flags: string[]): Explained<Circuit[]> {
  const capW = rules.circuitAmps * rules.utilisation * rules.voltage;
  const circuits: Circuit[] = [];
  const chained = new Set<string>();
  if (rules.allowChainWhenThru) {
    const byType = new Map<string, PositionFixture[]>();
    for (const f of fixtures) {
      const p = f.profile;
      if (p?.hasPowerThru && p.maxPerLine && p.maxPerLine > 1) {
        if (!byType.has(p.typeKey)) byType.set(p.typeKey, []);
        byType.get(p.typeKey)!.push(f);
      } else circuits.push({ fixtures: [f], watts: p?.watts ?? 0 });
    }
    for (const [key, list] of byType) {
      let current: Circuit | null = null;
      for (const f of list) {
        const w = f.profile!.watts;
        if (!current || current.fixtures.length >= f.profile!.maxPerLine! || current.watts + w > capW) {
          current = { fixtures: [], watts: 0 };
          circuits.push(current);
        }
        current.fixtures.push(f);
        current.watts += w;
      }
      chained.add(key);
    }
  } else {
    for (const f of fixtures) circuits.push({ fixtures: [f], watts: f.profile?.watts ?? 0 });
  }
  for (const c of circuits) {
    if (c.watts > capW) flags.push(`${c.fixtures.map(fixtureLabel).join(', ')} draws ${c.watts} W, over the ${Math.round(capW)} W a ${rules.circuitAmps}A circuit should carry at ${Math.round(rules.utilisation * 100)}%`);
  }
  const why = rules.allowChainWhenThru && chained.size
    ? `One fixture per circuit, except fixtures with a power thru chained up to their per-line limit and ${Math.round(capW)} W`
    : 'One fixture per 16A circuit';
  return { value: circuits, why };
}

export function planPosition(input: PositionInput, rules: CableRules): PositionPlan {
  const flags: string[] = [];
  const assumed: string[] = [];
  const fixtures = [...input.fixtures].sort((a, b) => (a.address ?? 1e9) - (b.address ?? 1e9) || a.type.localeCompare(b.type));

  for (const t of new Set(fixtures.filter((f) => !f.profile).map((f) => f.type))) {
    flags.push(`${t} is not in the fixture database: taken as a 16A fixture with no load. Add it in Settings > Cable rules.`);
  }
  for (const p of new Map(fixtures.filter((f) => f.profile?.inrushA).map((f) => [f.profile!.typeKey, f.profile!])).values()) {
    flags.push(`${p.displayName} has a high inrush (${p.inrushA} A): check the distro's breakers`);
  }

  const watts = fixtures.reduce((n, f) => n + (f.profile?.watts ?? 0), 0);
  const circuitsBuilt = buildCircuits(fixtures, rules, flags);
  const usedCircuits = circuitsBuilt.value.length;
  const totalCircuits = usedCircuits + (fixtures.length ? rules.spareCircuitsPerPosition : 0);
  const socaCount = fixtures.length ? Math.ceil(totalCircuits / rules.circuitsPerSoca) : 0;

  // Loom length: vertical drop (with swag) + run to dimmer city + floor slack + tail at the distro.
  const elevated = input.kind === 'TRUSS';
  let trim = input.trimM ?? null;
  if (elevated && trim == null) {
    trim = rules.defaultTrimM;
    assumed.push(`Trim taken as the ${rules.defaultTrimM} m default`);
  }
  let distance = input.distanceM ?? null;
  if (distance == null) {
    distance = rules.defaultDistanceM;
    assumed.push(`Distance to dimmer city (${rules.distroSide}) taken as the ${rules.defaultDistanceM} m default`);
  }
  const vertical = elevated ? (trim ?? 0) * (1 + rules.swagPct / 100) : 0;
  const run = round1(vertical + distance + rules.floorSlackM + rules.distroTailM);
  const runWhy = `${elevated ? `${trim} m trim + ${rules.swagPct}% swag (${round1(vertical)} m) + ` : ''}${distance} m to dimmer city + ${rules.floorSlackM} m floor slack + ${rules.distroTailM} m distro tail = ${run} m`;
  const socaLen = coverWithStock(run, rules.socaLengthsM);

  // Spread socas along the truss; a soca whose share of the truss is beyond the reach from the
  // pick gets an extension.
  const socas: SocaPlan[] = [];
  const perSoca = rules.circuitsPerSoca;
  const length = input.lengthM ?? null;
  if (elevated && length == null && fixtures.length) assumed.push('No truss length: no Soca extensions worked out');
  for (let i = 0; i < socaCount; i++) {
    const own = circuitsBuilt.value.slice(i * perSoca, (i + 1) * perSoca);
    const onSoca = own.flatMap((c) => c.fixtures);
    const allTrue1 = onSoca.length > 0 && onSoca.every((f) => f.profile?.powerConnector === 'TRUE1');
    const forced = allTrue1 ? [] : [...new Set(onSoca.filter((f) => f.profile?.powerConnector !== 'TRUE1').map((f) => f.type))];
    const hasTrue1 = onSoca.some((f) => f.profile?.powerConnector === 'TRUE1');
    if (!allTrue1 && hasTrue1) flags.push(`Soca ${i + 1} mixes TRUE1 with ${forced.join(', ')}, so it gets a 16A spider. Re-split to keep TRUE1 fixtures on a TRUE1 spider.`);
    let extensionM: number[] = [];
    if (elevated && length) {
      const centre = (input.pickOffsetM ?? 0) + (length * (i + 0.5)) / socaCount;
      if (centre > rules.trussReachM) extensionM = coverWithStock(centre - rules.trussReachM, rules.socaLengthsM);
    }
    socas.push({
      index: i + 1,
      fanout: allTrue1 ? 'TRUE1' : 'CEE16',
      fixtures: onSoca.map(fixtureLabel),
      circuitsUsed: own.length,
      spare: perSoca - own.length,
      amps: round1(own.reduce((n, c) => n + c.watts, 0) / rules.voltage),
      forced16A: hasTrue1 ? forced : [],
      extensionM,
    });
  }

  // Data.
  const universes = new Map<number | null, number>();
  for (const f of fixtures) universes.set(f.universe ?? null, (universes.get(f.universe ?? null) ?? 0) + 1);
  if (universes.has(null) && fixtures.length) assumed.push('Some fixtures have no universe: counted as one line');
  const catChain = fixtures.length > 0 && fixtures.every((f) => f.profile?.dataConnector === 'ETHERCON' && f.profile?.hasDataThru);
  const lines: DataLine[] = [];
  const dmxLen = coverWithStock(run, rules.dmxLengthsM);
  const catLen = coverWithStock(run, rules.catLengthsM);
  for (const [u, n] of [...universes.entries()].sort((a, b) => (a[0] ?? 1e9) - (b[0] ?? 1e9))) {
    const count = Math.ceil(n / rules.maxDmxDevicesPerLine);
    for (let k = 0; k < count; k++) {
      lines.push({ universe: u, devices: Math.min(rules.maxDmxDevicesPerLine, n - k * rules.maxDmxDevicesPerLine), lengthM: rules.dataPolicy === 'DMX_FROM_DISTRO' ? dmxLen : [] });
    }
  }
  if (rules.spareDmxLinePerPosition && fixtures.length) lines.push({ universe: null, devices: 0, lengthM: rules.dataPolicy === 'DMX_FROM_DISTRO' ? dmxLen : [], spare: true });
  let data: PositionPlan['data'];
  if (!fixtures.length) data = { policy: rules.dataPolicy, lines: [], node: null, catLengthM: null, why: 'No fixtures' };
  else if (catChain) {
    data = { policy: 'CAT_CHAIN', lines: [], node: null, catLengthM: catLen, why: 'Every fixture has RJ45 in and out, so they chain on Cat with no node' };
  } else if (rules.dataPolicy === 'NODE_PER_TRUSS') {
    const nodes = Math.ceil(lines.length / rules.nodePorts);
    data = {
      policy: 'NODE_PER_TRUSS',
      lines,
      node: { value: nodes, why: `${lines.length} DMX lines on ${rules.nodePorts}-port nodes` },
      catLengthM: catLen,
      why: `One node per position fed by Cat (${fmtLengths(catLen)}), one DMX line per universe, split past ${rules.maxDmxDevicesPerLine} devices`,
    };
  } else {
    data = {
      policy: 'DMX_FROM_DISTRO',
      lines,
      node: null,
      catLengthM: null,
      why: `One 5-pin line per universe from dimmer city (${fmtLengths(dmxLen)}), split past ${rules.maxDmxDevicesPerLine} devices`,
    };
  }

  // Jumpers: one power jumper per fixture from its spider tail, one data jumper between neighbours.
  const jLen = jumperLength(length, fixtures.length, rules);
  const powerJ = new Map<string, number>();
  socas.forEach((s, i) => {
    const onSoca = circuitsBuilt.value.slice(i * perSoca, (i + 1) * perSoca).flatMap((c) => c.fixtures);
    for (const f of onSoca) {
      const to = f.profile?.powerConnector ?? 'CEE16';
      const label =
        s.fanout === 'TRUE1' ? 'TRUE1 jumper' : to === 'TRUE1' ? '16A to TRUE1 jumper' : to === 'POWERCON' ? '16A to powerCON jumper' : '16A jumper';
      powerJ.set(label, (powerJ.get(label) ?? 0) + 1);
    }
  });
  const dataLines = data.policy === 'CAT_CHAIN' ? 0 : lines.filter((l) => !l.spare).length;
  const dataJumperCount = Math.max(0, fixtures.length - dataLines);
  const dataLabel = data.policy === 'CAT_CHAIN' ? 'Cat jumper' : fixtures.some((f) => f.profile?.dataConnector === 'DMX3') ? '5-pin DMX jumper (check 3-pin fixtures)' : '5-pin DMX jumper';
  const jumpers = {
    power: [...powerJ.entries()].map(([label, count]) => ({ label, lengthM: jLen, count })),
    data: dataJumperCount ? [{ label: dataLabel, lengthM: jLen, count: dataJumperCount }] : [],
    why: length ? `${length} m truss over ${fixtures.length} fixtures, so ${jLen} m jumpers` : `${jLen} m jumpers (no truss length to space them by)`,
  };

  const motors = Math.max(0, Math.round(input.motors ?? 0));
  const rigging =
    rules.motorsEnabled && motors > 0
      ? {
          motors,
          cableLengthM: coverWithStock(run, rules.motorCableLengthsM),
          why: `${motors} motors, one motor cable each, cut like the loom (${run} m)`,
        }
      : null;

  return {
    name: input.name,
    kind: input.kind,
    fixtureCount: fixtures.length,
    watts,
    amps: round1(watts / rules.voltage),
    circuits: { value: totalCircuits, why: `${circuitsBuilt.why}: ${usedCircuits} + ${fixtures.length ? rules.spareCircuitsPerPosition : 0} spare` },
    socaCount: { value: socaCount, why: `${totalCircuits} circuits ÷ ${perSoca} per Soca, rounded up = ${socaCount} (${socaCount * perSoca - usedCircuits} spare circuits)` },
    loomRunM: { value: run, why: runWhy },
    socaLengthM: { value: socaLen, why: `${run} m rounded up to stock: ${fmtLengths(socaLen)}` },
    socas,
    data,
    jumpers,
    rigging,
    flags,
    assumed,
  };
}

function add(totals: Map<string, StockTotal>, key: string, label: string, quantity: number, section: StockTotal['section'] = 'LIGHTING') {
  if (quantity <= 0) return;
  const t = totals.get(key);
  if (t) t.quantity += quantity;
  else totals.set(key, { key, label, section, quantity });
}

/** The whole job: every position plus the totals by stock item and what dimmer city must supply. */
export function planCables(positions: PositionInput[], rules: CableRules, unplaced: string[] = []): CablePlanResult {
  const plans = positions.map((p) => planPosition(p, rules));
  const totals = new Map<string, StockTotal>();
  for (const p of plans) {
    for (const len of p.socaLengthM.value) add(totals, `soca:${len}`, `Socapex 16A ${len} m`, p.socaCount.value);
    for (const s of p.socas) {
      add(totals, `spider:${s.fanout}`, s.fanout === 'TRUE1' ? 'Socapex to 6 x TRUE1 spider' : 'Socapex to 6 x 16A spider', 1);
      for (const len of s.extensionM) add(totals, `soca:${len}`, `Socapex 16A ${len} m`, 1);
    }
    if (p.data.policy === 'DMX_FROM_DISTRO') {
      for (const l of p.data.lines) for (const len of l.lengthM) add(totals, `dmx:${len}`, `5-pin DMX ${len} m`, 1);
    }
    if (p.data.catLengthM) for (const len of p.data.catLengthM) add(totals, `cat:${len}`, `Cat6 etherCON ${len} m`, 1);
    if (p.data.node) add(totals, `node:${rules.nodePorts}`, `DMX node (${rules.nodePorts}-port)`, p.data.node.value);
    if (p.data.policy !== 'CAT_CHAIN') add(totals, 'dmx:terminator', '5-pin DMX terminator', p.data.lines.filter((l) => !l.spare).length);
    for (const j of [...p.jumpers.power, ...p.jumpers.data]) add(totals, `j:${j.label}:${j.lengthM}`, `${j.label} ${j.lengthM} m`, j.count);
    if (p.rigging) for (const len of p.rigging.cableLengthM) add(totals, `motor:${len}`, `Motor cable ${len} m`, p.rigging.motors, 'RIGGING');
  }
  const motorsTotal = plans.reduce((n, p) => n + (p.rigging?.motors ?? 0), 0);
  if (motorsTotal) add(totals, 'motor:controller', `Motor controller (${rules.motorWaysPerController}-way)`, Math.ceil(motorsTotal / rules.motorWaysPerController), 'RIGGING');

  // Dimmer city: one Soca out per Soca, circuits spread L1, L2, L3 in turn.
  const phase: [number, number, number] = [0, 0, 0];
  let n = 0;
  for (const p of plans) {
    for (const s of p.socas) {
      const perCircuit = s.circuitsUsed ? s.amps / s.circuitsUsed : 0;
      for (let c = 0; c < s.circuitsUsed; c++) phase[n++ % 3] += perCircuit;
    }
  }
  const circuits = plans.reduce((x, p) => x + p.socas.reduce((y, s) => y + s.circuitsUsed, 0), 0);
  const amps = round1(plans.reduce((x, p) => x + p.amps, 0));
  const socaOuts = plans.reduce((x, p) => x + p.socaCount.value, 0);

  const sectionOrder = { LIGHTING: 0, RIGGING: 1 };
  return {
    positions: plans,
    totals: [...totals.values()].sort((a, b) => sectionOrder[a.section] - sectionOrder[b.section] || a.label.localeCompare(b.label, undefined, { numeric: true })),
    distro: {
      socaOuts,
      circuits,
      amps,
      ampsPerPhase: phase.map(round1) as [number, number, number],
      why: `${socaOuts} Soca outs at dimmer city (${rules.distroSide}); ${circuits} circuits spread across three phases`,
    },
    flags: plans.flatMap((p) => p.flags.map((f) => `${p.name}: ${f}`)),
    unplaced,
  };
}
