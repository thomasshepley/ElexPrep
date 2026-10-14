import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { Router } from 'express';
import {
  DEFAULT_CABLE_RULES,
  SEED_FIXTURE_PROFILES,
  fixtureTypeKey,
  matchFixtureProfile,
  normaliseCableRules,
  planCables,
  type CableRules,
  type FixtureProfileLike,
  type PositionInput,
  type PositionKind,
} from '@elexprep/shared';
import { prisma, logActivity } from '../db';
import { requireRole } from '../auth';
import { requirePermission } from '../permissions';
import { getCurrentRmsConfig } from '../currentRms/config';
import { fetchPickListSnapshot } from '../currentRms/sync';
import { plotsDir } from './plots';
import { hashBytes, readPlotGeometry, type PlotGeometry } from '../cable/plotRead';
import { getOneDriveConfig } from '../oneDrive/config';
import { findSharedCadPdf } from '../oneDrive/cad';
import { streamOneDriveFile } from '../oneDrive/client';

/** Every CAD plot on the job, wherever it lives: uploaded on the Plots tab, the CAD PDF found in
 * the job's OneDrive folder, or a OneDrive file marked as a CAD plot. Same list the Plots tab's
 * CAD view shows. */
async function jobCadPlots(jobId: string): Promise<{ source: 'UPLOAD' | 'ONEDRIVE'; ref: string; name: string; note?: string }[]> {
  const job = await prisma.job.findUnique({ where: { id: jobId }, select: { oneDriveFolderId: true } });
  const [uploads, cadPdf, shares] = await Promise.all([
    prisma.plot.findMany({ where: { jobId }, select: { id: true, originalName: true }, orderBy: { createdAt: 'desc' } }),
    job ? findSharedCadPdf(job).catch(() => null) : Promise.resolve(null),
    prisma.oneDriveShare.findMany({ where: { jobId, isCadPlot: true, isFolder: false }, orderBy: { sharedAt: 'desc' } }),
  ]);
  const out: { source: 'UPLOAD' | 'ONEDRIVE'; ref: string; name: string; note?: string }[] = [];
  if (cadPdf) out.push({ source: 'ONEDRIVE', ref: cadPdf.itemId, name: cadPdf.name, note: 'OneDrive CAD folder' });
  for (const s of shares) if (s.itemId !== cadPdf?.itemId) out.push({ source: 'ONEDRIVE', ref: s.itemId, name: s.itemName, note: 'OneDrive' });
  for (const u of uploads) out.push({ source: 'UPLOAD', ref: u.id, name: u.originalName, note: 'Uploaded' });
  return out;
}

const MAX_PLOT_BYTES = 100 * 1024 * 1024;

async function readOneDriveBytes(itemId: string): Promise<Uint8Array> {
  const { stream } = await streamOneDriveFile(await getOneDriveConfig(), itemId);
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of stream) {
    size += (chunk as Buffer).length;
    if (size > MAX_PLOT_BYTES) throw new Error('That PDF is too large to read (over 100 MB)');
    chunks.push(chunk as Buffer);
  }
  return new Uint8Array(Buffer.concat(chunks));
}

/**
 * Cable calculator (beta, admin only). Company rules and the fixture database live under
 * /api/cable; each job's positions, plan and plot reading under /api/jobs/:jobId/cable.
 */
export const cableRouter = Router();
export const jobCableRouter = Router();

const RULES_KEY = 'cableRules';

export async function getCableRules(): Promise<CableRules> {
  const row = await prisma.appSetting.findUnique({ where: { key: RULES_KEY } });
  if (!row) return { ...DEFAULT_CABLE_RULES };
  try {
    return normaliseCableRules(JSON.parse(row.valueJson));
  } catch {
    return { ...DEFAULT_CABLE_RULES };
  }
}

let seedingFixtures: Promise<void> | null = null;

export async function fixtureProfiles() {
  // Once, even when several requests arrive together on a fresh database.
  seedingFixtures ??= seedFixtureProfiles().catch((err) => {
    seedingFixtures = null;
    throw err;
  });
  await seedingFixtures;
  return prisma.fixtureProfile.findMany({ orderBy: { displayName: 'asc' } });
}

async function seedFixtureProfiles() {
  if ((await prisma.fixtureProfile.count()) === 0) {
    await prisma.fixtureProfile.createMany({
      data: SEED_FIXTURE_PROFILES.map((p) => ({
        typeKey: fixtureTypeKey(p.displayName),
        displayName: p.displayName,
        watts: p.watts,
        amps: p.amps ?? null,
        powerConnector: p.powerConnector,
        hasPowerThru: p.hasPowerThru,
        dataConnector: p.dataConnector,
        hasDataThru: p.hasDataThru ?? false,
        maxPerLine: p.maxPerLine ?? null,
        inrushA: p.inrushA ?? null,
        aliases: p.aliases ?? null,
        notes: p.notes ?? null,
        weightKg: p.weightKg ?? null,
      })),
    });
  }
}

function toProfileLike(p: Awaited<ReturnType<typeof fixtureProfiles>>[number]): FixtureProfileLike {
  return {
    typeKey: p.typeKey,
    displayName: p.displayName,
    watts: p.watts,
    amps: p.amps,
    powerConnector: p.powerConnector as FixtureProfileLike['powerConnector'],
    hasPowerThru: p.hasPowerThru,
    dataConnector: p.dataConnector as FixtureProfileLike['dataConnector'],
    hasDataThru: p.hasDataThru,
    maxPerLine: p.maxPerLine,
    inrushA: p.inrushA,
    aliases: p.aliases,
  };
}

// ---------------------------------------------------------------------------------------------
// Rules and fixture database (Settings > Cable rules)
// ---------------------------------------------------------------------------------------------

cableRouter.get('/rules', requireRole('ADMIN'), async (_req, res) => {
  res.json({ rules: await getCableRules(), defaults: DEFAULT_CABLE_RULES });
});

cableRouter.put('/rules', requireRole('ADMIN'), requirePermission('managePrepSettings'), async (req, res) => {
  const rules = normaliseCableRules({ ...(await getCableRules()), ...(req.body ?? {}) });
  const valueJson = JSON.stringify(rules);
  await prisma.appSetting.upsert({ where: { key: RULES_KEY }, create: { key: RULES_KEY, valueJson }, update: { valueJson } });
  await logActivity('cable.rules_updated', undefined, undefined, req.user!.id);
  res.json({ rules, defaults: DEFAULT_CABLE_RULES });
});

const POWER = ['CEE16', 'TRUE1', 'POWERCON', 'OTHER'];
const DATA = ['DMX5', 'DMX3', 'ETHERCON'];

function profileData(body: Record<string, unknown>): { data?: Record<string, unknown>; error?: string } {
  const displayName = typeof body.displayName === 'string' ? body.displayName.trim().slice(0, 120) : '';
  if (!displayName) return { error: 'Name is required' };
  const watts = Number(body.watts);
  if (!Number.isFinite(watts) || watts < 0 || watts > 20000) return { error: 'Watts must be 0 to 20000' };
  if (!POWER.includes(body.powerConnector as string)) return { error: 'Choose a power connector' };
  if (!DATA.includes(body.dataConnector as string)) return { error: 'Choose a data connector' };
  const optNum = (v: unknown, max: number) => (v === null || v === undefined || v === '' ? null : Number.isFinite(Number(v)) && Number(v) >= 0 && Number(v) <= max ? Number(v) : NaN);
  const amps = optNum(body.amps, 63);
  const maxPerLine = optNum(body.maxPerLine, 64);
  const inrushA = optNum(body.inrushA, 500);
  const weightKg = optNum(body.weightKg, 2000);
  const clampKg = optNum(body.clampKg, 50);
  if ([amps, maxPerLine, inrushA, weightKg, clampKg].some((n) => Number.isNaN(n))) return { error: 'Amps, per-line, inrush and weights must be numbers' };
  return {
    data: {
      displayName,
      typeKey: fixtureTypeKey(displayName),
      watts: Math.round(watts),
      amps,
      powerConnector: body.powerConnector,
      hasPowerThru: Boolean(body.hasPowerThru),
      dataConnector: body.dataConnector,
      hasDataThru: Boolean(body.hasDataThru),
      maxPerLine: maxPerLine === null ? null : Math.round(maxPerLine),
      inrushA,
      aliases: typeof body.aliases === 'string' && body.aliases.trim() ? body.aliases.trim().slice(0, 300) : null,
      notes: typeof body.notes === 'string' && body.notes.trim() ? body.notes.trim().slice(0, 300) : null,
      weightKg,
      clampKg,
    },
  };
}

cableRouter.get('/profiles', requireRole('ADMIN'), async (_req, res) => {
  res.json(await fixtureProfiles());
});

cableRouter.post('/profiles', requireRole('ADMIN'), requirePermission('managePrepSettings'), async (req, res) => {
  const { data, error } = profileData(req.body ?? {});
  if (error) return res.status(400).json({ error });
  const created = await prisma.fixtureProfile.create({ data: data as never });
  await logActivity('cable.profile_created', created.displayName, undefined, req.user!.id);
  res.status(201).json(created);
});

cableRouter.put('/profiles/:id', requireRole('ADMIN'), requirePermission('managePrepSettings'), async (req, res) => {
  const { data, error } = profileData(req.body ?? {});
  if (error) return res.status(400).json({ error });
  const updated = await prisma.fixtureProfile.update({ where: { id: req.params.id }, data: data as never });
  res.json(updated);
});

cableRouter.delete('/profiles/:id', requireRole('ADMIN'), requirePermission('managePrepSettings'), async (req, res) => {
  const deleted = await prisma.fixtureProfile.delete({ where: { id: req.params.id } });
  await logActivity('cable.profile_deleted', deleted.displayName, undefined, req.user!.id);
  res.status(204).end();
});

// ---------------------------------------------------------------------------------------------
// One job
// ---------------------------------------------------------------------------------------------

jobCableRouter.use('/:jobId/cable', requireRole('ADMIN'));

const UNPLACED = /^(n\/?a|none|-+|unplaced|spare)?$/i;

function guessKind(name: string): PositionKind {
  if (/floor|deck|ground|stage\s*floor/i.test(name)) return 'FLOOR';
  if (/\bfoh\b|front of house|balcony|bar\b/i.test(name)) return 'FOH';
  return 'TRUSS';
}

/** Positions from the patch's Position column (prefixed with the stage on a multi-stage job),
 * creating any new ones; fixtures with no position are listed as unplaced. */
export async function syncPositions(jobId: string) {
  const fixtures = await prisma.fixture.findMany({ where: { jobId }, include: { group: { select: { name: true } } }, orderBy: { address: 'asc' } });
  const usesStages = fixtures.some((f) => f.groupId);
  const nameFor = (f: (typeof fixtures)[number]) => {
    const loc = (f.location ?? '').trim();
    if (UNPLACED.test(loc)) return null;
    return usesStages ? `${f.group?.name ?? 'Ungrouped'}: ${loc}` : loc;
  };
  const names = [...new Set(fixtures.map(nameFor).filter((n): n is string => Boolean(n)))];
  const existing = await prisma.jobPosition.findMany({ where: { jobId } });
  const have = new Set(existing.map((p) => p.name));
  for (const name of names) {
    if (!have.has(name)) await prisma.jobPosition.create({ data: { jobId, name, kind: guessKind(name.split(': ').pop()!) } });
  }
  const positions = await prisma.jobPosition.findMany({ where: { jobId }, orderBy: { name: 'asc' } });
  return { fixtures, positions, nameFor, inPatch: new Set(names) };
}

export async function buildInputs(jobId: string) {
  const [{ fixtures, positions, nameFor, inPatch }, rules, profs] = await Promise.all([syncPositions(jobId), getCableRules(), fixtureProfiles()]);
  const like = profs.map(toProfileLike);
  const profileCache = new Map<string, FixtureProfileLike | null>();
  const profileFor = (type: string) => {
    if (!profileCache.has(type)) profileCache.set(type, matchFixtureProfile(type, like));
    return profileCache.get(type)!;
  };
  const byPosition = new Map<string, PositionInput['fixtures']>();
  const unplaced: string[] = [];
  for (const f of fixtures) {
    const name = nameFor(f);
    const entry = { address: f.address, type: f.fixtureType, universe: f.mainUniverse, profile: profileFor(f.fixtureType) };
    if (!name) unplaced.push(f.address != null ? `${f.fixtureType} ${f.address}` : f.fixtureType);
    else {
      if (!byPosition.has(name)) byPosition.set(name, []);
      byPosition.get(name)!.push(entry);
    }
  }
  const inputs: PositionInput[] = positions
    .filter((p) => inPatch.has(p.name) || p.motors > 0)
    .map((p) => ({
      name: p.name,
      kind: p.kind as PositionKind,
      lengthM: p.lengthM,
      trimM: p.trimM,
      distanceM: p.distanceM,
      pickOffsetM: p.pickOffsetM,
      motors: p.motors,
      fixtures: byPosition.get(p.name) ?? [],
    }));
  const unknownTypes = [...new Set(fixtures.filter((f) => !profileFor(f.fixtureType)).map((f) => f.fixtureType))];
  const inputHash = crypto
    .createHash('sha1')
    .update(JSON.stringify({ inputs, rules, unplaced }))
    .digest('hex');
  return { inputs, rules, unplaced, unknownTypes, positions, fixtures, inputHash };
}

/** The job's cable lines on the Current RMS kit list, to check the plan against. */
async function kitCables(jobId: string): Promise<{ linked: boolean; lines: { name: string; quantity: number }[]; error: string | null }> {
  const job = await prisma.job.findUnique({ where: { id: jobId }, select: { currentRmsOpportunityId: true } });
  if (!job?.currentRmsOpportunityId) return { linked: false, lines: [], error: null };
  try {
    const config = await getCurrentRmsConfig();
    if (!config.enabled) return { linked: true, lines: [], error: 'The Current RMS integration is turned off' };
    const items = await fetchPickListSnapshot(config, Number(job.currentRmsOpportunityId));
    return {
      linked: true,
      lines: items
        .filter((i) => /soca|socapex|cable|dmx|true\s*1|true1|spider|break.?out|loom|cat\s*\d|ethercon|16a|powercon|motor|node|distro/i.test(i.name))
        .map((i) => ({ name: i.name, quantity: Math.round(Number(i.quantity) || 0) })),
      error: null,
    };
  } catch (err) {
    return { linked: true, lines: [], error: (err as Error).message };
  }
}

jobCableRouter.get('/:jobId/cable', async (req, res) => {
  const jobId = req.params.jobId;
  const [built, plan, plots, kit, extraction] = await Promise.all([
    buildInputs(jobId),
    prisma.cablePlan.findUnique({ where: { jobId } }),
    jobCadPlots(jobId),
    kitCables(jobId),
    prisma.plotExtraction.findFirst({ where: { jobId }, orderBy: { createdAt: 'desc' } }),
  ]);
  res.json({
    inputs: {
      fixtureCount: built.fixtures.length,
      positionCount: built.inputs.length,
      unplaced: built.unplaced,
      unknownTypes: built.unknownTypes,
      plots,
      kit,
    },
    positions: built.positions.map((p) => ({ ...p, fixtureCount: built.inputs.find((i) => i.name === p.name)?.fixtures.length ?? 0, inPatch: built.inputs.some((i) => i.name === p.name) })),
    rules: built.rules,
    plan: plan
      ? { computedAt: plan.computedAt, stale: plan.inputHash !== built.inputHash, result: JSON.parse(plan.resultJson), overrides: JSON.parse(plan.overridesJson) as Record<string, number> }
      : null,
    plot: extraction ? { sourceName: extraction.sourceName, createdAt: extraction.createdAt, geometry: JSON.parse(extraction.resultJson) as PlotGeometry } : null,
  });
});

jobCableRouter.post('/:jobId/cable/compute', async (req, res) => {
  const jobId = req.params.jobId;
  const built = await buildInputs(jobId);
  const result = planCables(built.inputs, built.rules, built.unplaced);
  const existing = await prisma.cablePlan.findUnique({ where: { jobId } });
  const plan = await prisma.cablePlan.upsert({
    where: { jobId },
    create: { jobId, inputHash: built.inputHash, resultJson: JSON.stringify(result) },
    // Overrides survive a re-run.
    update: { inputHash: built.inputHash, resultJson: JSON.stringify(result), computedAt: new Date() },
  });
  await logActivity('cable.plan_computed', `${result.positions.length} positions`, jobId, req.user!.id);
  res.json({ computedAt: plan.computedAt, stale: false, result, overrides: existing ? JSON.parse(existing.overridesJson) : {} });
});

const num = (v: unknown, min: number, max: number): number | null | undefined => {
  if (v === undefined) return undefined;
  if (v === null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= min && n <= max ? Math.round(n * 100) / 100 : undefined;
};

jobCableRouter.put('/:jobId/cable/positions/:id', async (req, res) => {
  const pos = await prisma.jobPosition.findFirst({ where: { id: req.params.id, jobId: req.params.jobId } });
  if (!pos) return res.status(404).json({ error: 'not found' });
  const b = req.body ?? {};
  const data: Record<string, unknown> = {};
  for (const [k, max] of [['lengthM', 200], ['trimM', 60], ['distanceM', 500], ['pickOffsetM', 200]] as const) {
    const v = num(b[k], 0, max);
    if (b[k] !== undefined && v === undefined) return res.status(400).json({ error: `${k} must be a number from 0 to ${max}` });
    if (v !== undefined) data[k] = v;
  }
  if (b.motors !== undefined) {
    const m = Number(b.motors);
    if (!Number.isInteger(m) || m < 0 || m > 64) return res.status(400).json({ error: 'motors must be a whole number from 0 to 64' });
    data.motors = m;
  }
  if (b.kind !== undefined) {
    if (!['TRUSS', 'FLOOR', 'FOH', 'OTHER'].includes(b.kind)) return res.status(400).json({ error: 'kind must be TRUSS, FLOOR, FOH or OTHER' });
    data.kind = b.kind;
  }
  if (Object.keys(data).some((k) => k !== 'kind' && k !== 'motors')) data.source = 'MANUAL';
  res.json(await prisma.jobPosition.update({ where: { id: pos.id }, data }));
});

jobCableRouter.put('/:jobId/cable/overrides', async (req, res) => {
  const plan = await prisma.cablePlan.findUnique({ where: { jobId: req.params.jobId } });
  if (!plan) return res.status(400).json({ error: 'Work out the plan first' });
  const overrides = JSON.parse(plan.overridesJson) as Record<string, number>;
  const { key, quantity } = req.body ?? {};
  if (typeof key !== 'string' || !key) return res.status(400).json({ error: 'key is required' });
  if (quantity === null) delete overrides[key];
  else {
    const q = Number(quantity);
    if (!Number.isInteger(q) || q < 0 || q > 10000) return res.status(400).json({ error: 'quantity must be a whole number' });
    overrides[key] = q;
  }
  await prisma.cablePlan.update({ where: { id: plan.id }, data: { overridesJson: JSON.stringify(overrides) } });
  res.json({ overrides });
});

const csvCell = (v: string | number) => {
  const s = String(v);
  // Neutralise spreadsheet formulas as well as quoting.
  const safe = /^[=+\-@]/.test(s) && typeof v === 'string' ? `'${s}` : s;
  return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};

jobCableRouter.get('/:jobId/cable/export.csv', async (req, res) => {
  const [plan, job] = await Promise.all([
    prisma.cablePlan.findUnique({ where: { jobId: req.params.jobId } }),
    prisma.job.findUnique({ where: { id: req.params.jobId }, select: { name: true } }),
  ]);
  if (!plan) return res.status(404).json({ error: 'Work out the plan first' });
  const result = JSON.parse(plan.resultJson) as ReturnType<typeof planCables>;
  const overrides = JSON.parse(plan.overridesJson) as Record<string, number>;
  const rows: (string | number)[][] = [['Section', 'Item', 'Quantity', 'Calculated']];
  for (const t of result.totals) rows.push([t.section === 'RIGGING' ? 'Rigging' : 'Lighting', t.label, overrides[t.key] ?? t.quantity, t.quantity]);
  rows.push([]);
  rows.push(['Position', 'Fixtures', 'Socas', 'Soca length', 'Spiders', 'Extensions', 'Data', 'Motors']);
  for (const p of result.positions) {
    rows.push([
      p.name,
      p.fixtureCount,
      p.socaCount.value,
      p.socaLengthM.value.map((l) => `${l} m`).join(' + '),
      p.socas.map((s) => (s.fanout === 'TRUE1' ? 'TRUE1' : '16A')).join(' '),
      p.socas.flatMap((s) => s.extensionM).map((l) => `${l} m`).join(' '),
      p.data.policy === 'CAT_CHAIN' ? 'Cat chain' : `${p.data.lines.length} DMX${p.data.node ? `, node x${p.data.node.value}` : ''}`,
      p.rigging?.motors ?? 0,
    ]);
  }
  const name = (job?.name ?? 'job').replace(/[^\w.-]+/g, '_').slice(0, 60);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${name}-cables.csv"`);
  res.send(rows.map((r) => r.map(csvCell).join(',')).join('\n'));
});

/** Reads truss geometry from one of the job's CAD plots (uploaded or on OneDrive) and fills in
 * positions that match. */
jobCableRouter.post('/:jobId/cable/read-plot', async (req, res) => {
  const jobId = req.params.jobId;
  const source = req.body?.source === 'ONEDRIVE' ? 'ONEDRIVE' : 'UPLOAD';
  const ref = String(req.body?.ref ?? req.body?.plotId ?? '');
  // Only a plot this job actually has, never an arbitrary OneDrive item.
  const plot = (await jobCadPlots(jobId)).find((p) => p.source === source && p.ref === ref);
  if (!plot) return res.status(404).json({ error: 'not found' });
  let data: Uint8Array;
  try {
    if (source === 'UPLOAD') {
      const row = await prisma.plot.findFirst({ where: { id: ref, jobId } });
      if (!row) return res.status(404).json({ error: 'not found' });
      data = new Uint8Array(await fs.promises.readFile(path.join(plotsDir, row.fileName)));
    } else {
      data = await readOneDriveBytes(ref);
    }
  } catch (err) {
    return res.status(502).json({ error: `Could not fetch that plot: ${(err as Error).message}` });
  }
  const hash = hashBytes(data);
  let extraction = await prisma.plotExtraction.findUnique({ where: { jobId_sourceHash: { jobId, sourceHash: hash } } });
  if (!extraction) {
    let geometry: PlotGeometry;
    try {
      geometry = await readPlotGeometry(data);
    } catch (err) {
      return res.status(422).json({ error: `Could not read that PDF: ${(err as Error).message}` });
    }
    extraction = await prisma.plotExtraction.create({ data: { jobId, sourceName: plot.name, sourceHash: hash, method: 'PDF_TEXT', resultJson: JSON.stringify(geometry) } });
  }
  const geometry = JSON.parse(extraction.resultJson) as PlotGeometry;
  const { positions } = await syncPositions(jobId);
  const applied: string[] = [];
  for (const t of geometry.trusses) {
    const key = t.position.toLowerCase();
    // A stage prefix ("Main: DS") still matches the plot's "DS".
    const match = positions.find((p) => p.name.toLowerCase() === key || p.name.toLowerCase().endsWith(`: ${key}`));
    if (!match) continue;
    await prisma.jobPosition.update({
      where: { id: match.id },
      data: { lengthM: t.lengthM, pickOffsetM: t.pickOffsetM, kind: 'TRUSS', source: 'PLOT' },
    });
    applied.push(match.name);
  }
  await prisma.plotExtraction.update({ where: { id: extraction.id }, data: { confirmedAt: new Date() } });
  await logActivity('cable.plot_read', `${plot.name}: ${applied.length ? applied.join(', ') : 'no matching positions'}`, jobId, req.user!.id);
  res.json({ geometry, applied });
});
