import { Router } from 'express';
import { PACK_CATEGORY_LABEL, planTruckPack } from '@elexprep/shared';
import { prisma, logActivity } from '../db';
import { requireRole } from '../auth';
import { fixtureProfiles } from './cable';
import {
  buildJobTruckPack,
  ensureTruckSeeds,
  getTruckPackSettings,
  isCategory,
  sanitiseManual,
  sanitiseOverrides,
  saveTruckPackSettings,
  type TruckPackSettings,
} from '../truckPack/build';

/**
 * Truck pack (alpha, webmaster only). The case library, vehicles and item rules under
 * /api/truck-pack; each job's pack under /api/jobs/:jobId/truck-pack.
 */
export const truckPackRouter = Router();
export const jobTruckPackRouter = Router();

// requireRole lets the webmaster through and, with only WEBMASTER listed, nobody else.
truckPackRouter.use(requireRole('WEBMASTER'));
jobTruckPackRouter.use('/:jobId/truck-pack', requireRole('WEBMASTER'));

const num = (v: unknown, min: number, max: number) => {
  const n = Number(v);
  return v !== '' && v !== null && v !== undefined && Number.isFinite(n) && n >= min && n <= max ? n : null;
};
const optNum = (v: unknown, min: number, max: number) => (v === '' || v === null || v === undefined ? null : num(v, min, max));
const text = (v: unknown, max: number) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null);

truckPackRouter.get('/config', async (_req, res) => {
  await ensureTruckSeeds();
  const [settings, cases, vehicles, itemRules, profiles] = await Promise.all([
    getTruckPackSettings(),
    prisma.truckCase.findMany({ orderBy: [{ category: 'asc' }, { name: 'asc' }] }),
    prisma.truckVehicle.findMany({ orderBy: [{ payloadKg: 'asc' }, { lengthMm: 'asc' }] }),
    prisma.truckItemRule.findMany({ orderBy: { match: 'asc' } }),
    fixtureProfiles(),
  ]);
  res.json({
    settings,
    cases,
    vehicles,
    itemRules,
    fixtures: profiles.map((p) => ({ id: p.id, displayName: p.displayName, weightKg: p.weightKg, truckCaseId: p.truckCaseId })),
  });
});

truckPackRouter.put('/settings', async (req, res) => {
  const settings = await saveTruckPackSettings((req.body ?? {}) as Partial<TruckPackSettings>);
  await logActivity('truckpack.settings_updated', undefined, undefined, req.user!.id);
  res.json(settings);
});

function caseData(b: Record<string, unknown>) {
  const name = text(b.name, 80);
  const lengthMm = num(b.lengthMm, 50, 20000);
  const widthMm = num(b.widthMm, 50, 3000);
  const heightMm = num(b.heightMm, 50, 3500);
  const emptyKg = num(b.emptyKg, 0, 5000);
  const maxStack = num(b.maxStack, 1, 10);
  const holds = num(b.holds, 1, 500);
  if (!name) return { error: 'Name is required' };
  if (lengthMm === null || widthMm === null || heightMm === null) return { error: 'Length, width and height must be 50 mm or more' };
  if (emptyKg === null) return { error: 'Empty weight must be a number of kg' };
  if (maxStack === null || !Number.isInteger(maxStack)) return { error: 'Stack limit must be a whole number from 1 to 10' };
  return {
    data: {
      name,
      lengthMm: Math.round(lengthMm),
      widthMm: Math.round(widthMm),
      heightMm: Math.round(heightMm),
      emptyKg,
      maxStack,
      holds: Math.round(holds ?? 1),
      canGoOnTop: b.canGoOnTop !== false,
      canRotate: b.canRotate !== false,
      category: isCategory(b.category) ? b.category : 'OTHER',
      notes: text(b.notes, 300),
    },
  };
}

truckPackRouter.post('/cases', async (req, res) => {
  const { data, error } = caseData(req.body ?? {});
  if (error) return res.status(400).json({ error });
  res.status(201).json(await prisma.truckCase.create({ data: data! }));
});
truckPackRouter.put('/cases/:id', async (req, res) => {
  const { data, error } = caseData(req.body ?? {});
  if (error) return res.status(400).json({ error });
  res.json(await prisma.truckCase.update({ where: { id: req.params.id }, data: data! }));
});
truckPackRouter.delete('/cases/:id', async (req, res) => {
  await prisma.$transaction([
    prisma.fixtureProfile.updateMany({ where: { truckCaseId: req.params.id }, data: { truckCaseId: null } }),
    prisma.truckCase.delete({ where: { id: req.params.id } }),
  ]);
  res.status(204).end();
});

function vehicleData(b: Record<string, unknown>) {
  const name = text(b.name, 80);
  const lengthMm = num(b.lengthMm, 500, 20000);
  const widthMm = num(b.widthMm, 500, 3000);
  const heightMm = num(b.heightMm, 500, 4000);
  const payloadKg = num(b.payloadKg, 1, 50000);
  if (!name) return { error: 'Name is required' };
  if (lengthMm === null || widthMm === null || heightMm === null) return { error: 'Length, width and height of the load space must be given in mm' };
  if (payloadKg === null) return { error: 'Payload must be a number of kg' };
  const archFromMm = optNum(b.archFromMm, 0, 20000);
  const archToMm = optNum(b.archToMm, 0, 20000);
  const archClearWidthMm = optNum(b.archClearWidthMm, 100, 3000);
  const arch = archFromMm !== null && archToMm !== null && archClearWidthMm !== null && archToMm > archFromMm;
  return {
    data: {
      name,
      lengthMm: Math.round(lengthMm),
      widthMm: Math.round(widthMm),
      heightMm: Math.round(heightMm),
      payloadKg,
      doorWidthMm: optNum(b.doorWidthMm, 100, 3000),
      doorHeightMm: optNum(b.doorHeightMm, 100, 4000),
      archFromMm: arch ? archFromMm : null,
      archToMm: arch ? archToMm : null,
      archClearWidthMm: arch ? archClearWidthMm : null,
      licence: text(b.licence, 60),
      notes: text(b.notes, 300),
      enabled: b.enabled !== false,
    },
  };
}

truckPackRouter.post('/vehicles', async (req, res) => {
  const { data, error } = vehicleData(req.body ?? {});
  if (error) return res.status(400).json({ error });
  res.status(201).json(await prisma.truckVehicle.create({ data: data! }));
});
truckPackRouter.put('/vehicles/:id', async (req, res) => {
  const { data, error } = vehicleData(req.body ?? {});
  if (error) return res.status(400).json({ error });
  res.json(await prisma.truckVehicle.update({ where: { id: req.params.id }, data: data! }));
});
truckPackRouter.delete('/vehicles/:id', async (req, res) => {
  await prisma.truckVehicle.delete({ where: { id: req.params.id } });
  res.status(204).end();
});

function ruleData(b: Record<string, unknown>) {
  const match = text(b.match, 120);
  if (!match) return { error: 'Words to match are required' };
  const ignore = b.ignore === true;
  const caseId = typeof b.caseId === 'string' && b.caseId ? b.caseId : null;
  if (!ignore && !caseId) return { error: 'Choose the case it travels in, or mark it as not packed' };
  return {
    data: {
      match: match.toLowerCase(),
      caseId: ignore ? null : caseId,
      unitsPerCase: Math.round(num(b.unitsPerCase, 1, 1000) ?? 1),
      itemKg: num(b.itemKg, 0, 5000) ?? 0,
      ignore,
      category: isCategory(b.category) ? b.category : null,
    },
  };
}

truckPackRouter.post('/item-rules', async (req, res) => {
  const { data, error } = ruleData(req.body ?? {});
  if (error) return res.status(400).json({ error });
  // Saving a rule for words that already have one replaces it.
  res.status(201).json(await prisma.truckItemRule.upsert({ where: { match: data!.match }, create: data!, update: data! }));
});
truckPackRouter.put('/item-rules/:id', async (req, res) => {
  const { data, error } = ruleData(req.body ?? {});
  if (error) return res.status(400).json({ error });
  res.json(await prisma.truckItemRule.update({ where: { id: req.params.id }, data: data! }));
});
truckPackRouter.delete('/item-rules/:id', async (req, res) => {
  await prisma.truckItemRule.delete({ where: { id: req.params.id } });
  res.status(204).end();
});

/** Which case a fixture in the fixture database travels in. */
truckPackRouter.put('/fixtures/:id', async (req, res) => {
  const caseId = typeof req.body?.truckCaseId === 'string' && req.body.truckCaseId ? req.body.truckCaseId : null;
  if (caseId && !(await prisma.truckCase.findUnique({ where: { id: caseId } }))) return res.status(400).json({ error: 'That case is not in the library' });
  const p = await prisma.fixtureProfile.update({ where: { id: req.params.id }, data: { truckCaseId: caseId } });
  res.json({ id: p.id, displayName: p.displayName, weightKg: p.weightKg, truckCaseId: p.truckCaseId });
});

async function jobPack(jobId: string) {
  const built = await buildJobTruckPack(jobId);
  const by = built.updatedById ? await prisma.user.findUnique({ where: { id: built.updatedById }, select: { username: true, displayName: true } }) : null;
  return { ...built, updatedBy: by ? by.displayName || by.username : null };
}

jobTruckPackRouter.get('/:jobId/truck-pack', async (req, res) => {
  if (!(await prisma.job.findUnique({ where: { id: req.params.jobId }, select: { id: true } }))) return res.status(404).json({ error: 'not found' });
  res.json(await jobPack(req.params.jobId));
});

/** The job's choices: where the kit comes from, the vehicle, typed-over counts and extra cases. */
jobTruckPackRouter.put('/:jobId/truck-pack', async (req, res) => {
  const jobId = req.params.jobId;
  const b = req.body ?? {};
  const data: Record<string, unknown> = { updatedById: req.user!.id };
  if (b.source !== undefined) data.source = ['AUTO', 'PICKLIST', 'PATCH'].includes(b.source) ? b.source : 'AUTO';
  if (b.vehicleId !== undefined) data.vehicleId = typeof b.vehicleId === 'string' && b.vehicleId ? b.vehicleId : null;
  if (b.overrides !== undefined) data.overridesJson = JSON.stringify(sanitiseOverrides(b.overrides));
  if (b.manual !== undefined) data.manualJson = JSON.stringify(sanitiseManual(b.manual));
  await prisma.truckPlan.upsert({ where: { jobId }, create: { jobId, ...data }, update: data });
  res.json(await jobPack(jobId));
});

const csvCell = (v: string | number) => {
  const s = String(v);
  const safe = /^[=+\-@]/.test(s) && typeof v === 'string' ? `'${s}` : s;
  return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};

/** The load order, vehicle by vehicle, then the manifest. */
jobTruckPackRouter.get('/:jobId/truck-pack/export.csv', async (req, res) => {
  const jobId = req.params.jobId;
  const [built, job] = await Promise.all([buildJobTruckPack(jobId), prisma.job.findUnique({ where: { id: jobId }, select: { name: true } })]);
  const vehicleId = typeof req.query.vehicle === 'string' && req.query.vehicle ? req.query.vehicle : built.vehicleId;
  const r = planTruckPack(built.manifest.lines, built.cases, built.vehicles, built.settings, { vehicleId });
  const rows: (string | number)[][] = [['Truck pack (alpha): an estimate from case sizes and weights, to be checked on the dock.']];
  r.packs.forEach((p, i) => {
    rows.push([]);
    rows.push([`${r.packs.length > 1 ? `Vehicle ${i + 1}: ` : ''}${p.vehicleName}`, `${p.kg} kg of ${p.payloadKg} kg`, `${(p.usedLengthMm / 1000).toFixed(1)} m of floor used`]);
    rows.push(['Step', 'From the cab (m)', 'From the left wall (m)', 'Stack', 'Cases', 'Height (m)', 'Weight (kg)', 'Category']);
    for (const s of p.stacks) {
      rows.push([
        s.step,
        (s.xMm / 1000).toFixed(2),
        (s.yMm / 1000).toFixed(2),
        s.cases.map((c) => c.label).join(' / '),
        s.cases.length,
        (s.heightMm / 1000).toFixed(2),
        Math.round(s.kg),
        PACK_CATEGORY_LABEL[s.category],
      ]);
    }
    for (const u of p.unplaced) rows.push(['Not packed', '', '', u.label, u.count, '', '', u.reason]);
  });
  rows.push([]);
  rows.push(['Manifest', 'Case', 'Cases', 'Each (kg)', 'Contents']);
  const caseName = new Map(built.cases.map((c) => [c.id, c.name]));
  for (const l of built.manifest.lines) rows.push([l.label, caseName.get(l.caseId) ?? '', l.cases, l.kgEach, l.contents]);
  for (const u of built.manifest.unknown) rows.push([u.name, 'Not packed', u.quantity, '', u.reason]);
  const name = (job?.name ?? 'job').replace(/[^\w.-]+/g, '_').slice(0, 60);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${name}-truck-pack.csv"`);
  res.send(rows.map((row) => row.map(csvCell).join(',')).join('\n'));
});
