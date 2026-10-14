import {
  DEFAULT_RIG_SETTINGS,
  SEED_HOIST_MODELS,
  SEED_TRUSS_PROFILES,
  matchFixtureProfile,
  planPosition,
  type HoistModelLike,
  type PointKind,
  type Rig,
  type RigMethod,
  type RigPoint,
  type RigSettings,
  type RigTruss,
  type TrussLoad,
  type TrussProfileLike,
} from '@elexprep/shared';
import { prisma } from '../db';
import { fixtureProfiles, getCableRules, syncPositions } from '../routes/cable';
import type { PlotGeometry } from '../cable/plotRead';

/** Company-wide rigging settings (Settings > Rigging). */
export interface RiggingSettings extends RigSettings {
  defaultTrussProfileId: string | null;
  defaultHoistModelId: string | null;
  /** Clamp and safety bond per fixture when the fixture record has none, kg. */
  clampKg: number;
  /** Cable weights for the loom along each truss and its drop, kg per metre. */
  socaKgPerM: number;
  dmxKgPerM: number;
  catKgPerM: number;
  /** Connectors and fan-outs on top of the cable, percent. */
  connectorPct: number;
}

export const DEFAULT_RIGGING_SETTINGS: RiggingSettings = {
  ...DEFAULT_RIG_SETTINGS,
  defaultTrussProfileId: null,
  defaultHoistModelId: null,
  clampKg: 1,
  socaKgPerM: 1.13,
  dmxKgPerM: 0.04,
  catKgPerM: 0.03,
  connectorPct: 10,
};

const KEY = 'riggingSettings';

const clampNum = (v: unknown, min: number, max: number, fallback: number) => {
  const n = Number(v);
  return Number.isFinite(n) && n >= min && n <= max ? n : fallback;
};

export function normaliseRiggingSettings(raw: Partial<RiggingSettings> | null | undefined): RiggingSettings {
  const r = { ...DEFAULT_RIGGING_SETTINGS };
  if (!raw || typeof raw !== 'object') return r;
  if (raw.method === 'tributary' || raw.method === 'continuous' || raw.method === 'envelope') r.method = raw.method;
  r.marginPct = clampNum(raw.marginPct, 0, 100, r.marginPct);
  r.warnAtPct = clampNum(raw.warnAtPct, 1, 200, r.warnAtPct);
  r.overAtPct = clampNum(raw.overAtPct, 1, 300, r.overAtPct);
  r.riggingAllowanceKg = clampNum(raw.riggingAllowanceKg, 0, 100, r.riggingAllowanceKg);
  r.clampKg = clampNum(raw.clampKg, 0, 20, r.clampKg);
  r.socaKgPerM = clampNum(raw.socaKgPerM, 0, 10, r.socaKgPerM);
  r.dmxKgPerM = clampNum(raw.dmxKgPerM, 0, 2, r.dmxKgPerM);
  r.catKgPerM = clampNum(raw.catKgPerM, 0, 2, r.catKgPerM);
  r.connectorPct = clampNum(raw.connectorPct, 0, 100, r.connectorPct);
  if (typeof raw.trussFactor085 === 'boolean') r.trussFactor085 = raw.trussFactor085;
  if (typeof raw.defaultTrussProfileId === 'string' || raw.defaultTrussProfileId === null) r.defaultTrussProfileId = raw.defaultTrussProfileId;
  if (typeof raw.defaultHoistModelId === 'string' || raw.defaultHoistModelId === null) r.defaultHoistModelId = raw.defaultHoistModelId;
  if (r.overAtPct < r.warnAtPct) r.overAtPct = r.warnAtPct;
  return r;
}

export async function getRiggingSettings(): Promise<RiggingSettings> {
  const row = await prisma.appSetting.findUnique({ where: { key: KEY } });
  try {
    return normaliseRiggingSettings(row ? JSON.parse(row.valueJson) : null);
  } catch {
    return { ...DEFAULT_RIGGING_SETTINGS };
  }
}

export async function saveRiggingSettings(patch: Partial<RiggingSettings>) {
  const next = normaliseRiggingSettings({ ...(await getRiggingSettings()), ...patch });
  const valueJson = JSON.stringify(next);
  await prisma.appSetting.upsert({ where: { key: KEY }, create: { key: KEY, valueJson }, update: { valueJson } });
  return next;
}

/** Runs each first-use seed once even when several requests arrive together. */
const seeding = new Map<string, Promise<void>>();
function once(key: string, fn: () => Promise<void>) {
  if (!seeding.has(key)) seeding.set(key, fn().catch((err) => {
    seeding.delete(key);
    throw err;
  }));
  return seeding.get(key)!;
}

/** Truss profiles, seeded from the plan on first use; Global Truss F34 is the house default. */
export async function trussProfiles() {
  await once('truss', seedTrussProfiles);
  return prisma.trussProfile.findMany({ orderBy: { name: 'asc' } });
}

async function seedTrussProfiles() {
  if ((await prisma.trussProfile.count()) === 0) {
    await prisma.trussProfile.createMany({
      data: SEED_TRUSS_PROFILES.map((t) => ({ name: t.name, maker: t.maker, kgPerM: t.kgPerM, spanTableJson: JSON.stringify(t.spanTable), cantileverRatio: t.cantileverRatio, notes: t.notes ?? null })),
    });
    const f34 = await prisma.trussProfile.findUnique({ where: { name: 'Global Truss F34' } });
    const settings = await getRiggingSettings();
    if (f34 && !settings.defaultTrussProfileId) await saveRiggingSettings({ defaultTrussProfileId: f34.id });
  }
}

export async function hoistModels() {
  await once('hoist', seedHoistModels);
  return prisma.hoistModel.findMany({ orderBy: [{ ratedKg: 'asc' }, { name: 'asc' }] });
}

async function seedHoistModels() {
  if ((await prisma.hoistModel.count()) === 0) {
    await prisma.hoistModel.createMany({ data: SEED_HOIST_MODELS.map((h) => ({ ...h, notes: h.notes ?? null })) });
    const cm = await prisma.hoistModel.findUnique({ where: { name: 'CM Lodestar 500 kg' } });
    const settings = await getRiggingSettings();
    if (cm && !settings.defaultHoistModelId) await saveRiggingSettings({ defaultHoistModelId: cm.id });
  }
}

/** The truss and hoist the calculator actually uses when a job hasn't picked one: the house default if it still exists, else the F34 and the common UK 500 kg motor. */
export function effectiveDefaults(s: RiggingSettings, profiles: { id: string; name: string }[], hoists: { id: string; name: string; ratedKg: number }[]) {
  const trussId = (s.defaultTrussProfileId && profiles.some((p) => p.id === s.defaultTrussProfileId) ? s.defaultTrussProfileId : null) ?? profiles.find((p) => p.name === 'Global Truss F34')?.id ?? null;
  const hoistId =
    (s.defaultHoistModelId && hoists.some((h) => h.id === s.defaultHoistModelId) ? s.defaultHoistModelId : null) ??
    hoists.find((h) => h.name === 'CM Lodestar 500 kg')?.id ??
    hoists.find((h) => h.ratedKg === 500)?.id ??
    hoists[0]?.id ??
    null;
  return { trussId, hoistId };
}

export function toTrussProfileLike(t: Awaited<ReturnType<typeof trussProfiles>>[number]): TrussProfileLike {
  let spanTable: TrussProfileLike['spanTable'] = [];
  try {
    spanTable = JSON.parse(t.spanTableJson);
  } catch {
    spanTable = [];
  }
  return { id: t.id, name: t.name, kgPerM: t.kgPerM, spanTable, cantileverRatio: t.cantileverRatio };
}

export function toHoistLike(h: Awaited<ReturnType<typeof hoistModels>>[number]): HoistModelLike {
  return { id: h.id, name: h.name, ratedKg: h.ratedKg, hoistClass: h.hoistClass, bodyKg: h.bodyKg, chainKgPerM: h.chainKgPerM, chainM: h.chainM };
}

/** What has been changed on a job's rig on top of what the plot and patch give. */
export interface RigOverrides {
  trusses?: Record<
    string,
    {
      profileId?: string | null;
      originX?: number;
      y?: number;
      lengthM?: number;
      hoists?: { pointId: string; x: number }[];
      /** Fixture id to metres along the truss. */
      fixtureX?: Record<string, number>;
    }
  >;
  points?: Record<string, { name?: string; x?: number; y?: number; kind?: PointKind; capacityKg?: number | null; hoistModelId?: string | null }>;
  addedPoints?: { id: string; name: string; x: number; y: number; kind: PointKind }[];
  removedPointIds?: string[];
}

const finite = (v: unknown, min: number, max: number): number | undefined => {
  const n = Number(v);
  return v !== null && v !== '' && Number.isFinite(n) && n >= min && n <= max ? Math.round(n * 1000) / 1000 : undefined;
};
const KINDS: PointKind[] = ['hoist', 'deadHang', 'cablePick'];

/** Keeps only well-formed values from a client-sent overrides object. */
export function sanitiseOverrides(raw: unknown): RigOverrides {
  const out: RigOverrides = { trusses: {}, points: {}, addedPoints: [], removedPointIds: [] };
  if (!raw || typeof raw !== 'object') return out;
  const r = raw as Record<string, unknown>;
  for (const [name, t] of Object.entries((r.trusses as Record<string, unknown>) ?? {}).slice(0, 200)) {
    if (!t || typeof t !== 'object') continue;
    const tt = t as Record<string, unknown>;
    const entry: NonNullable<RigOverrides['trusses']>[string] = {};
    if (tt.profileId === null || typeof tt.profileId === 'string') entry.profileId = tt.profileId as string | null;
    const ox = finite(tt.originX, -500, 500);
    if (ox !== undefined) entry.originX = ox;
    const y = finite(tt.y, -500, 500);
    if (y !== undefined) entry.y = y;
    const len = finite(tt.lengthM, 0.1, 200);
    if (len !== undefined) entry.lengthM = len;
    if (Array.isArray(tt.hoists)) {
      entry.hoists = tt.hoists
        .slice(0, 40)
        .map((h) => ({ pointId: String((h as Record<string, unknown>)?.pointId ?? ''), x: finite((h as Record<string, unknown>)?.x, -50, 250) }))
        .filter((h): h is { pointId: string; x: number } => Boolean(h.pointId) && h.x !== undefined);
    }
    if (tt.fixtureX && typeof tt.fixtureX === 'object') {
      entry.fixtureX = {};
      for (const [id, x] of Object.entries(tt.fixtureX as Record<string, unknown>).slice(0, 500)) {
        const v = finite(x, -50, 250);
        if (v !== undefined) entry.fixtureX[id] = v;
      }
    }
    out.trusses![name.slice(0, 120)] = entry;
  }
  for (const [id, p] of Object.entries((r.points as Record<string, unknown>) ?? {}).slice(0, 500)) {
    if (!p || typeof p !== 'object') continue;
    const pp = p as Record<string, unknown>;
    const entry: NonNullable<RigOverrides['points']>[string] = {};
    if (typeof pp.name === 'string' && pp.name.trim()) entry.name = pp.name.trim().slice(0, 40);
    const x = finite(pp.x, -500, 500);
    if (x !== undefined) entry.x = x;
    const y = finite(pp.y, -500, 500);
    if (y !== undefined) entry.y = y;
    if (KINDS.includes(pp.kind as PointKind)) entry.kind = pp.kind as PointKind;
    if (pp.capacityKg === null) entry.capacityKg = null;
    else {
      const c = finite(pp.capacityKg, 0, 100000);
      if (c !== undefined) entry.capacityKg = c;
    }
    if (pp.hoistModelId === null || typeof pp.hoistModelId === 'string') entry.hoistModelId = pp.hoistModelId as string | null;
    out.points![id.slice(0, 80)] = entry;
  }
  if (Array.isArray(r.addedPoints)) {
    for (const a of r.addedPoints.slice(0, 200)) {
      const aa = a as Record<string, unknown>;
      const id = String(aa?.id ?? '');
      const x = finite(aa?.x, -500, 500);
      const y = finite(aa?.y, -500, 500);
      if (!id.startsWith('add:') || x === undefined || y === undefined) continue;
      out.addedPoints!.push({ id: id.slice(0, 80), name: String(aa.name ?? 'Point').slice(0, 40), x, y, kind: KINDS.includes(aa.kind as PointKind) ? (aa.kind as PointKind) : 'hoist' });
    }
  }
  if (Array.isArray(r.removedPointIds)) out.removedPointIds = r.removedPointIds.map(String).slice(0, 500);
  return out;
}

export interface RigFixtureInfo {
  id: string;
  label: string;
  type: string;
  weightKg: number | null;
  x: number;
  placed: boolean;
}

export interface RigTrussInfo {
  id: string;
  positionName: string;
  fromPlot: boolean;
  profileId: string | null;
  fixtures: RigFixtureInfo[];
  cableKgPerM: number;
  dropKg: number;
}

export interface BuiltRig {
  rig: Rig;
  trusses: RigTrussInfo[];
  assumptions: string[];
  plotName: string | null;
  venue: string | null;
  venueSetApplied: boolean;
  overrides: RigOverrides;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

/** The rig for a job: the plot's points and trusses, the patch's fixtures and weights, the cable
 * plan's loom, then everything changed by hand on top. */
export async function buildRig(jobId: string): Promise<BuiltRig> {
  const [, profiles, hoists, fixtureDb, cableRules, plan, extraction, job, { fixtures, positions, nameFor }] = await Promise.all([
    getRiggingSettings(),
    trussProfiles(),
    hoistModels(),
    fixtureProfiles(),
    getCableRules(),
    prisma.riggingPlan.findUnique({ where: { jobId } }),
    prisma.plotExtraction.findFirst({ where: { jobId }, orderBy: { createdAt: 'desc' } }),
    prisma.job.findUnique({ where: { id: jobId }, select: { venue: true } }),
    syncPositions(jobId),
  ]);
  // Defaults may have been set by the seeding above.
  const s = await getRiggingSettings();
  const overrides = sanitiseOverrides(plan ? JSON.parse(plan.overridesJson) : {});
  const geometry: PlotGeometry | null = extraction ? JSON.parse(extraction.resultJson) : null;
  const venueSet = job?.venue ? await prisma.venuePointSet.findUnique({ where: { venueKey: job.venue.trim().toLowerCase() } }) : null;
  const venueCaps = new Map<string, number>((venueSet ? (JSON.parse(venueSet.pointsJson) as { name: string; capacityKg: number }[]) : []).map((p) => [p.name.toLowerCase(), p.capacityKg]));
  const assumptions: string[] = [];
  const profileById = new Map(profiles.map((p) => [p.id, toTrussProfileLike(p)]));
  const hoistById = new Map(hoists.map((h) => [h.id, toHoistLike(h)]));
  const defaults = effectiveDefaults(s, profiles, hoists);
  const defaultHoist = defaults.hoistId ? hoistById.get(defaults.hoistId) ?? null : null;

  // Points.
  const removed = new Set(overrides.removedPointIds ?? []);
  const basePoints: (RigPoint & { position?: string })[] = [];
  for (const p of geometry?.points ?? []) {
    basePoints.push({
      id: `plot:${p.name}`,
      name: p.name,
      x: p.xM,
      y: p.yM,
      kind: p.cablePick ? 'cablePick' : 'hoist',
      capacityKg: p.capacityKg,
      capacitySource: p.capacityKg ? 'PLOT' : null,
      position: p.position,
    });
  }
  for (const a of overrides.addedPoints ?? []) basePoints.push({ ...a, capacityKg: null, capacitySource: null });
  let venueApplied = false;
  const points: (RigPoint & { position?: string })[] = basePoints
    .filter((p) => !removed.has(p.id))
    .map((p) => {
      const o = overrides.points?.[p.id] ?? {};
      const point = { ...p, ...(o.name ? { name: o.name } : {}), ...(o.x !== undefined ? { x: o.x } : {}), ...(o.y !== undefined ? { y: o.y } : {}), ...(o.kind ? { kind: o.kind } : {}) };
      const venueCap = venueCaps.get(point.name.toLowerCase());
      if (o.capacityKg !== undefined) {
        point.capacityKg = o.capacityKg;
        point.capacitySource = o.capacityKg ? 'MANUAL' : null;
      } else if (venueCap) {
        point.capacityKg = venueCap;
        point.capacitySource = 'VENUE';
        venueApplied = true;
      }
      if (point.kind === 'hoist') {
        const id = o.hoistModelId === undefined ? undefined : o.hoistModelId;
        point.hoist = id === null ? null : id ? hoistById.get(id) ?? defaultHoist : defaultHoist;
      } else point.hoist = null;
      point.directLoads = [];
      return point;
    });
  if (!geometry) assumptions.push('No plot has been read yet: read the CAD plot on the Cable (beta) tab to bring in its rigging points, or add points by hand.');
  if (points.some((p) => p.kind === 'hoist' && !p.capacityKg)) assumptions.push('Some points have no capacity: enter the venue figure for each one.');
  if (venueApplied) assumptions.push(`Capacities saved for ${job?.venue} were used where this plot has none of its own or they were not changed here.`);
  if (points.some((p) => p.kind === 'hoist' && p.hoist && p.hoist.id === defaultHoist?.id)) assumptions.push(`Hoists default to the ${defaultHoist?.name}; change any point that uses something else.`);

  // Trusses: one per patch position on a truss.
  const like = fixtureDb.map((f) => ({
    typeKey: f.typeKey,
    displayName: f.displayName,
    watts: f.watts,
    powerConnector: f.powerConnector as 'TRUE1',
    hasPowerThru: f.hasPowerThru,
    dataConnector: f.dataConnector as 'DMX5',
    hasDataThru: f.hasDataThru,
    maxPerLine: f.maxPerLine,
    aliases: f.aliases,
    weightKg: f.weightKg,
    clampKg: f.clampKg,
  }));
  const byPos = new Map<string, typeof fixtures>();
  for (const f of fixtures) {
    const name = nameFor(f);
    if (!name) continue;
    if (!byPos.has(name)) byPos.set(name, []);
    byPos.get(name)!.push(f);
  }
  const unknownWeights = new Set<string>();
  const trusses: RigTruss[] = [];
  const infos: RigTrussInfo[] = [];
  let stacked = 0;
  for (const pos of positions) {
    const list = byPos.get(pos.name) ?? [];
    if (pos.kind !== 'TRUSS' || list.length === 0) continue;
    const o = overrides.trusses?.[pos.name] ?? {};
    const key = pos.name.toLowerCase();
    const plotTruss = geometry?.trusses.find((t) => t.position.toLowerCase() === key || key.endsWith(`: ${t.position.toLowerCase()}`)) ?? null;
    let lengthM = o.lengthM ?? plotTruss?.lengthM ?? pos.lengthM ?? null;
    if (!lengthM) {
      lengthM = Math.max(2, Math.ceil(list.length * 0.6));
      assumptions.push(`${pos.name}: no truss length, taken as ${lengthM} m. Set it on the Cable (beta) tab or here.`);
    }
    const originX = o.originX ?? plotTruss?.fromXM ?? 0;
    const y = o.y ?? plotTruss?.yM ?? -3 * stacked++;
    const plotHoists = plotTruss
      ? points.filter((p) => p.kind !== 'cablePick' && (p as { position?: string }).position && (p as { position?: string }).position!.toLowerCase() === plotTruss.position.toLowerCase()).map((p) => ({ pointId: p.id, x: r2(p.x - originX) }))
      : [];
    const hoistsOnTruss = (o.hoists ?? plotHoists).filter((h) => points.some((p) => p.id === h.pointId));
    if (hoistsOnTruss.length === 0) assumptions.push(`${pos.name}: no hoists yet. Add them in the elevation view.`);
    const profileId = o.profileId === undefined ? defaults.trussId : o.profileId;
    const profile = profileId ? profileById.get(profileId) ?? null : null;

    const sorted = [...list].sort((a, b) => (a.address ?? 1e9) - (b.address ?? 1e9));
    const loads: TrussLoad[] = [];
    const fixtureInfos: RigFixtureInfo[] = [];
    let placedAll = true;
    // Until moved by hand, each fixture type is spread evenly along the whole truss (slot
    // centres), which is how a symmetric rig is usually hung.
    const byType = new Map<string, typeof sorted>();
    for (const f of sorted) byType.set(f.fixtureType, [...(byType.get(f.fixtureType) ?? []), f]);
    const defaultX = new Map<string, number>();
    for (const group of byType.values()) group.forEach((f, i) => defaultX.set(f.id, r2(((i + 0.5) * lengthM!) / group.length)));
    sorted.forEach((f, i) => {
      const prof = matchFixtureProfile(f.fixtureType, like);
      const w = prof?.weightKg ?? null;
      if (w === null) unknownWeights.add(f.fixtureType);
      const clamp = prof?.clampKg ?? s.clampKg;
      const placed = o.fixtureX?.[f.id];
      if (placed === undefined) placedAll = false;
      const x = placed ?? defaultX.get(f.id)!;
      const label = f.address != null ? `${f.fixtureType} ${f.address}` : `${f.fixtureType} (${i + 1})`;
      loads.push({ kind: 'point', x, kg: (w ?? 0) + clamp, label, source: 'fixture', ref: f.id });
      fixtureInfos.push({ id: f.id, label, type: f.fixtureType, weightKg: w, x, placed: placed !== undefined });
    });
    if (!placedAll) assumptions.push(`${pos.name}: each fixture type is spread evenly along the truss until moved in the elevation view.`);

    // The loom along the truss and its drop, from the cable calculator's own working.
    const cp = planPosition(
      {
        name: pos.name,
        kind: 'TRUSS',
        lengthM,
        trimM: pos.trimM,
        distanceM: pos.distanceM,
        pickOffsetM: pos.pickOffsetM,
        fixtures: sorted.map((f) => ({ address: f.address, type: f.fixtureType, universe: f.mainUniverse, profile: matchFixtureProfile(f.fixtureType, like) })),
      },
      cableRules
    );
    const dataKgPerM = cp.data.policy === 'DMX_FROM_DISTRO' ? cp.data.lines.length * s.dmxKgPerM : s.catKgPerM;
    const cableKgPerM = r2((cp.socaCount.value * s.socaKgPerM + dataKgPerM) * (1 + s.connectorPct / 100));
    if (cableKgPerM > 0) loads.push({ kind: 'udl', from: 0, to: lengthM, kgPerM: cableKgPerM, label: 'Cable along the truss', source: 'cable' });
    const drop = pos.trimM ?? cableRules.defaultTrimM;
    const dropKg = r2(cableKgPerM * drop);
    const pick = points.find((p) => p.kind === 'cablePick' && (p as { position?: string }).position && plotTruss && (p as { position?: string }).position!.toLowerCase() === plotTruss.position.toLowerCase());
    if (dropKg > 0) {
      if (pick) pick.directLoads!.push({ kg: dropKg, label: `${pos.name} cable drop (${drop} m)`, source: 'cable' });
      else {
        loads.push({ kind: 'point', x: lengthM, kg: dropKg, label: 'Cable drop', source: 'cable' });
        assumptions.push(`${pos.name}: no cable pick found, so the cable drop hangs off the truss end.`);
      }
    }

    trusses.push({ id: pos.name, name: pos.name, lengthM, originX, y, profile, hoists: hoistsOnTruss, loads });
    infos.push({ id: pos.name, positionName: pos.name, fromPlot: Boolean(plotTruss), profileId: profile?.id ?? null, fixtures: fixtureInfos, cableKgPerM, dropKg });
  }
  if (unknownWeights.size) assumptions.push(`No weight in the fixture database for ${[...unknownWeights].join(', ')}: counted as clamp only. Add the weight in Settings, Fixture database.`);
  assumptions.push('Cable weight comes from the Cable (beta) working for each truss: Socas and data along the truss, plus the vertical drop at the cable pick.');

  const method = (plan?.method as RigMethod) ?? s.method;
  return {
    rig: {
      trusses,
      points: points.map(({ position: _p, ...rest }) => rest),
      settings: { method, marginPct: s.marginPct, warnAtPct: s.warnAtPct, overAtPct: s.overAtPct, riggingAllowanceKg: s.riggingAllowanceKg, trussFactor085: s.trussFactor085 },
    },
    trusses: infos,
    assumptions,
    plotName: extraction?.sourceName ?? null,
    venue: job?.venue ?? null,
    venueSetApplied: venueApplied,
    overrides,
  };
}
