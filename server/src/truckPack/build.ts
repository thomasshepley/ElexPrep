import {
  DEFAULT_CABLE_SPECS,
  DEFAULT_PACK_SETTINGS,
  DEFAULT_TRUNK_SETTINGS,
  PACK_CATEGORIES,
  SEED_FIXTURE_CASES,
  SEED_ITEM_RULES,
  SEED_TRUCK_CASES,
  SEED_VEHICLES,
  TRUCK_SEED_VERSION,
  buildManifest,
  type CableKind,
  type CableSpec,
  type CaseSpecLike,
  type ItemRuleLike,
  type KitLine,
  type ManifestResult,
  type PackCategory,
  type PackSettingsLike,
  type VehicleLike,
} from '@elexprep/shared';
import { prisma } from '../db';
import { getCurrentRmsConfig } from '../currentRms/config';
import { fetchPickListSnapshot } from '../currentRms/sync';
import { fixtureProfiles } from '../routes/cable';

/** Company-wide truck pack settings (Settings > Truck pack). */
export interface TruckPackSettings extends PackSettingsLike {
  /** The case cable is packed in. */
  trunkCaseId: string | null;
  trunkLitres: number;
  trunkMaxKg: number;
  trunkFill: number;
  defaultCableLengthM: number;
  cableSpecs: Record<CableKind, CableSpec>;
}

export const DEFAULT_TRUCK_PACK_SETTINGS: TruckPackSettings = {
  ...DEFAULT_PACK_SETTINGS,
  trunkCaseId: null,
  trunkLitres: DEFAULT_TRUNK_SETTINGS.litres,
  trunkMaxKg: DEFAULT_TRUNK_SETTINGS.maxKg,
  trunkFill: DEFAULT_TRUNK_SETTINGS.fill,
  defaultCableLengthM: DEFAULT_TRUNK_SETTINGS.defaultLengthM,
  cableSpecs: DEFAULT_CABLE_SPECS,
};

const KEY = 'truckPackSettings';

const clampNum = (v: unknown, min: number, max: number, fallback: number) => {
  const n = Number(v);
  return v !== null && v !== '' && Number.isFinite(n) && n >= min && n <= max ? n : fallback;
};

export const isCategory = (v: unknown): v is PackCategory => typeof v === 'string' && (PACK_CATEGORIES as string[]).includes(v);

export function normaliseTruckPackSettings(raw: Partial<TruckPackSettings> | null | undefined): TruckPackSettings {
  const r: TruckPackSettings = { ...DEFAULT_TRUCK_PACK_SETTINGS, cableSpecs: { ...DEFAULT_CABLE_SPECS } };
  if (!raw || typeof raw !== 'object') return r;
  r.clearanceMm = clampNum(raw.clearanceMm, 0, 500, r.clearanceMm);
  r.maxSideOffsetPct = clampNum(raw.maxSideOffsetPct, 1, 50, r.maxSideOffsetPct);
  r.maxRearCogPct = clampNum(raw.maxRearCogPct, 10, 100, r.maxRearCogPct);
  if (typeof raw.mixedStacking === 'boolean') r.mixedStacking = raw.mixedStacking;
  if (Array.isArray(raw.unloadOrder)) {
    const order = raw.unloadOrder.filter(isCategory).filter((c, i, a) => a.indexOf(c) === i);
    // Any category left out goes at the end, so nothing is ever unordered.
    r.unloadOrder = [...order, ...PACK_CATEGORIES.filter((c) => !order.includes(c))];
  }
  if (typeof raw.trunkCaseId === 'string' || raw.trunkCaseId === null) r.trunkCaseId = raw.trunkCaseId;
  r.trunkLitres = clampNum(raw.trunkLitres, 10, 5000, r.trunkLitres);
  r.trunkMaxKg = clampNum(raw.trunkMaxKg, 10, 1000, r.trunkMaxKg);
  r.trunkFill = clampNum(raw.trunkFill, 0.1, 1, r.trunkFill);
  r.defaultCableLengthM = clampNum(raw.defaultCableLengthM, 1, 200, r.defaultCableLengthM);
  if (raw.cableSpecs && typeof raw.cableSpecs === 'object') {
    for (const k of Object.keys(DEFAULT_CABLE_SPECS) as CableKind[]) {
      const v = (raw.cableSpecs as Record<string, Partial<CableSpec>>)[k];
      if (!v) continue;
      const d = DEFAULT_CABLE_SPECS[k];
      r.cableSpecs[k] = {
        ...d,
        kgPerM: clampNum(v.kgPerM, 0, 20, d.kgPerM),
        diameterMm: clampNum(v.diameterMm, 0, 100, d.diameterMm),
        ...(d.kgEach !== undefined ? { kgEach: clampNum(v.kgEach, 0, 100, d.kgEach), litresEach: clampNum(v.litresEach, 0, 200, d.litresEach ?? 0) } : {}),
      };
    }
  }
  return r;
}

export async function getTruckPackSettings(): Promise<TruckPackSettings> {
  const row = await prisma.appSetting.findUnique({ where: { key: KEY } });
  try {
    return normaliseTruckPackSettings(row ? JSON.parse(row.valueJson) : null);
  } catch {
    return normaliseTruckPackSettings(null);
  }
}

export async function saveTruckPackSettings(patch: Partial<TruckPackSettings>) {
  const current = await getTruckPackSettings();
  const next = normaliseTruckPackSettings({ ...current, ...patch, cableSpecs: { ...current.cableSpecs, ...(patch.cableSpecs ?? {}) } });
  const valueJson = JSON.stringify(next);
  await prisma.appSetting.upsert({ where: { key: KEY }, create: { key: KEY, valueJson }, update: { valueJson } });
  return next;
}

let seeding: Promise<void> | null = null;

/** The case library, vehicles and item rules, seeded once on first use. */
export async function ensureTruckSeeds() {
  seeding ??= seedTruckPack().catch((err) => {
    seeding = null;
    throw err;
  });
  await seeding;
}

async function seedTruckPack() {
  if ((await prisma.truckCase.count()) === 0) {
    await prisma.truckCase.createMany({ data: SEED_TRUCK_CASES.map((c) => ({ ...c, notes: c.notes ?? null })) });
    const cases = await prisma.truckCase.findMany();
    const byName = new Map(cases.map((c) => [c.name, c.id]));
    // Which case each known fixture travels in, where nobody has set one.
    const profiles = await fixtureProfiles();
    for (const p of profiles) {
      const caseName = SEED_FIXTURE_CASES[p.displayName];
      const id = caseName ? byName.get(caseName) : undefined;
      if (id && !p.truckCaseId) await prisma.fixtureProfile.update({ where: { id: p.id }, data: { truckCaseId: id } });
    }
    if ((await prisma.truckItemRule.count()) === 0) {
      await prisma.truckItemRule.createMany({
        data: SEED_ITEM_RULES.map((r) => ({ match: r.match, caseId: r.caseName ? byName.get(r.caseName) ?? null : null, unitsPerCase: r.unitsPerCase, itemKg: r.itemKg, ignore: r.ignore ?? false, category: r.category ?? null })),
      });
    }
    const settings = await getTruckPackSettings();
    if (!settings.trunkCaseId && byName.get('Cable trunk')) await saveTruckPackSettings({ trunkCaseId: byName.get('Cable trunk')! });
  }
  // Vehicles: all of them on a fresh database; later additions to the seed list once each on an
  // older one (one deleted on purpose stays deleted, as it only arrives once).
  const versionRow = await prisma.appSetting.findUnique({ where: { key: SEED_VERSION_KEY } });
  const seeded = versionRow ? Number(JSON.parse(versionRow.valueJson)) || 1 : (await prisma.truckVehicle.count()) > 0 ? 1 : 0;
  const have = new Set((await prisma.truckVehicle.findMany({ select: { name: true } })).map((v) => v.name));
  const toAdd = SEED_VEHICLES.filter((v) => (v.since ?? 1) > seeded && !have.has(v.name));
  if (toAdd.length) {
    await prisma.truckVehicle.createMany({
      data: toAdd.map((v) => ({
        name: v.name,
        lengthMm: v.lengthMm,
        widthMm: v.widthMm,
        heightMm: v.heightMm,
        payloadKg: v.payloadKg,
        doorWidthMm: v.doorWidthMm ?? null,
        doorHeightMm: v.doorHeightMm ?? null,
        archFromMm: v.arch?.fromMm ?? null,
        archToMm: v.arch?.toMm ?? null,
        archClearWidthMm: v.arch?.clearWidthMm ?? null,
        trailerLengthMm: v.trailer?.lengthMm ?? null,
        trailerWidthMm: v.trailer?.widthMm ?? null,
        trailerHeightMm: v.trailer?.heightMm ?? null,
        licence: v.licence,
        notes: v.notes,
        enabled: !v.disabled,
      })),
    });
  }
  if (seeded < TRUCK_SEED_VERSION) {
    const valueJson = JSON.stringify(TRUCK_SEED_VERSION);
    await prisma.appSetting.upsert({ where: { key: SEED_VERSION_KEY }, create: { key: SEED_VERSION_KEY, valueJson }, update: { valueJson } });
  }
}

const SEED_VERSION_KEY = 'truckPackSeedVersion';

type CaseRow = Awaited<ReturnType<typeof prisma.truckCase.findMany>>[number];
type VehicleRow = Awaited<ReturnType<typeof prisma.truckVehicle.findMany>>[number];

export const toCaseLike = (c: CaseRow): CaseSpecLike => ({
  id: c.id,
  name: c.name,
  lengthMm: c.lengthMm,
  widthMm: c.widthMm,
  heightMm: c.heightMm,
  emptyKg: c.emptyKg,
  maxStack: c.maxStack,
  canGoOnTop: c.canGoOnTop,
  canRotate: c.canRotate,
  category: isCategory(c.category) ? c.category : 'OTHER',
  holds: c.holds,
});

export const toVehicleLike = (v: VehicleRow): VehicleLike => ({
  id: v.id,
  name: v.name,
  lengthMm: v.lengthMm,
  widthMm: v.widthMm,
  heightMm: v.heightMm,
  payloadKg: v.payloadKg,
  doorWidthMm: v.doorWidthMm,
  doorHeightMm: v.doorHeightMm,
  arch: v.archFromMm != null && v.archToMm != null && v.archClearWidthMm != null ? { fromMm: v.archFromMm, toMm: v.archToMm, clearWidthMm: v.archClearWidthMm } : null,
  trailer: v.trailerLengthMm != null && v.trailerWidthMm != null && v.trailerHeightMm != null ? { lengthMm: v.trailerLengthMm, widthMm: v.trailerWidthMm, heightMm: v.trailerHeightMm } : null,
});

export interface ManualCase {
  key: string;
  caseId: string;
  label: string;
  cases: number;
  kgEach: number | null;
}

export function sanitiseManual(raw: unknown): ManualCase[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .slice(0, 200)
    .map((m) => m as Record<string, unknown>)
    .filter((m) => typeof m.caseId === 'string' && typeof m.key === 'string' && m.key.startsWith('manual:'))
    .map((m) => ({
      key: String(m.key).slice(0, 60),
      caseId: String(m.caseId),
      label: typeof m.label === 'string' ? m.label.slice(0, 120) : '',
      cases: Math.max(0, Math.min(500, Math.round(Number(m.cases) || 0))),
      kgEach: m.kgEach === null || m.kgEach === undefined || m.kgEach === '' ? null : Math.max(0, Math.min(5000, Number(m.kgEach) || 0)),
    }));
}

export function sanitiseOverrides(raw: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const [k, v] of Object.entries(raw as Record<string, unknown>).slice(0, 500)) {
    const n = Math.round(Number(v));
    if (k.length <= 200 && Number.isFinite(n) && n >= 0 && n <= 1000) out[k] = n;
  }
  return out;
}

export interface JobTruckPack {
  /** Where the kit came from this time. */
  source: 'PICKLIST' | 'PATCH';
  /** What the plan asks for (AUTO picks the kit list when the job is linked). */
  requestedSource: 'AUTO' | 'PICKLIST' | 'PATCH';
  sourceNote: string | null;
  linked: boolean;
  kitLines: number;
  manifest: ManifestResult;
  cases: CaseSpecLike[];
  vehicles: (VehicleLike & { licence: string | null; notes: string | null })[];
  settings: TruckPackSettings;
  vehicleId: string | null;
  overrides: Record<string, number>;
  manual: ManualCase[];
  updatedAt: Date | null;
  updatedById: string | null;
}

/** The kit from the patch: one line per fixture type, plus the Cable (beta) plan. */
async function patchKit(jobId: string): Promise<KitLine[]> {
  const rows = await prisma.fixture.groupBy({ by: ['fixtureType'], where: { jobId }, _count: { _all: true } });
  return rows.map((r) => ({ name: r.fixtureType, quantity: r._count._all }));
}

async function cablePlanKit(jobId: string): Promise<KitLine[]> {
  const plan = await prisma.cablePlan.findUnique({ where: { jobId } });
  if (!plan) return [];
  try {
    const result = JSON.parse(plan.resultJson) as { totals: { key: string; label: string; quantity: number }[] };
    const overrides = JSON.parse(plan.overridesJson) as Record<string, number>;
    return result.totals.map((t) => ({ name: t.label, quantity: overrides[t.key] ?? t.quantity }));
  } catch {
    return [];
  }
}

export async function buildJobTruckPack(jobId: string): Promise<JobTruckPack> {
  await ensureTruckSeeds();
  const [job, plan, settings, caseRows, vehicleRows, ruleRows, profiles, caseRules] = await Promise.all([
    prisma.job.findUnique({ where: { id: jobId }, select: { currentRmsOpportunityId: true } }),
    prisma.truckPlan.findUnique({ where: { jobId } }),
    getTruckPackSettings(),
    prisma.truckCase.findMany({ orderBy: { name: 'asc' } }),
    prisma.truckVehicle.findMany({ where: { enabled: true } }),
    prisma.truckItemRule.findMany(),
    fixtureProfiles(),
    prisma.fixtureTypeRule.findMany({ select: { name: true, unitsPerCase: true } }),
  ]);
  const linked = Boolean(job?.currentRmsOpportunityId);
  const requested = (plan?.source === 'PICKLIST' || plan?.source === 'PATCH' ? plan.source : 'AUTO') as JobTruckPack['requestedSource'];
  let source: 'PICKLIST' | 'PATCH' = requested === 'PATCH' || (requested === 'AUTO' && !linked) ? 'PATCH' : 'PICKLIST';
  let sourceNote: string | null = null;
  let kit: KitLine[] = [];
  if (source === 'PICKLIST') {
    try {
      if (!linked) throw new Error('this job is not linked to a Current RMS opportunity');
      const config = await getCurrentRmsConfig();
      if (!config.enabled) throw new Error('the Current RMS integration is turned off');
      kit = (await fetchPickListSnapshot(config, Number(job!.currentRmsOpportunityId))).map((i) => ({ name: i.name, quantity: Number(i.quantity) || 0 }));
    } catch (err) {
      sourceNote = `Could not read the Current RMS kit list (${(err as Error).message}), so the patch is used instead.`;
      source = 'PATCH';
    }
  }
  if (source === 'PATCH') kit = await patchKit(jobId);
  const cablePlan = await cablePlanKit(jobId);
  if (source === 'PATCH' && !kit.length) sourceNote ??= 'No patch on this job yet, and no kit list to read.';

  const cases = caseRows.map(toCaseLike);
  const overrides = sanitiseOverrides(plan ? JSON.parse(plan.overridesJson) : {});
  const manual = sanitiseManual(plan ? JSON.parse(plan.manualJson) : []);
  const manifest = buildManifest({
    kit,
    source,
    fixtures: profiles.map((p) => ({ displayName: p.displayName, aliases: p.aliases, weightKg: p.weightKg, clampKg: p.clampKg, caseId: p.truckCaseId })),
    caseRules,
    itemRules: ruleRows.map(
      (r): ItemRuleLike => ({ id: r.id, match: r.match, caseId: r.caseId, unitsPerCase: r.unitsPerCase, itemKg: r.itemKg, ignore: r.ignore, category: isCategory(r.category) ? r.category : null })
    ),
    cases,
    cableSpecs: settings.cableSpecs,
    trunk: { caseId: settings.trunkCaseId ?? '', litres: settings.trunkLitres, maxKg: settings.trunkMaxKg, fill: settings.trunkFill, defaultLengthM: settings.defaultCableLengthM },
    // The patch never carries cable, so the cable plan fills in; the kit list only falls back to it.
    cablePlan,
    manual,
    overrides,
  });
  if (source === 'PATCH') manifest.notes.unshift('Fixtures come from the patch, so spares and kit that is not patched are missing. Link the job to Current RMS for the full kit list.');
  return {
    source,
    requestedSource: requested,
    sourceNote,
    linked,
    kitLines: kit.length,
    manifest,
    cases,
    vehicles: vehicleRows.map((v) => ({ ...toVehicleLike(v), licence: v.licence, notes: v.notes })),
    settings,
    vehicleId: plan?.vehicleId && vehicleRows.some((v) => v.id === plan.vehicleId) ? plan.vehicleId : null,
    overrides,
    manual,
    updatedAt: plan?.updatedAt ?? null,
    updatedById: plan?.updatedById ?? null,
  };
}

