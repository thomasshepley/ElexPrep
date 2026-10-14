import { Router } from 'express';
import { RIGGING_DISCLAIMER, solveRig, type RigMethod } from '@elexprep/shared';
import { prisma, logActivity } from '../db';
import { requireRole } from '../auth';
import {
  buildRig,
  effectiveDefaults,
  getRiggingSettings,
  hoistModels,
  sanitiseOverrides,
  saveRiggingSettings,
  trussProfiles,
  type RiggingSettings,
} from '../rigging/build';

/**
 * Rigging loads calculator (beta, admin only). Company settings, truss profiles and hoists under
 * /api/rigging; each job's rig under /api/jobs/:jobId/rigging. The browser runs the solver
 * (shared/rigging.ts) live as things are moved; the server builds the rig and stores the record.
 */
export const riggingRouter = Router();
export const jobRiggingRouter = Router();

riggingRouter.use(requireRole('ADMIN'));
jobRiggingRouter.use('/:jobId/rigging', requireRole('ADMIN'));

/** Settings with the default truss and hoist the calculator actually falls back to, so the page never shows one and works out with another. */
async function resolvedSettings() {
  const [profiles, hoists, settings] = await Promise.all([trussProfiles(), hoistModels(), getRiggingSettings()]);
  const d = effectiveDefaults(settings, profiles, hoists);
  return { ...settings, defaultTrussProfileId: d.trussId, defaultHoistModelId: d.hoistId };
}

riggingRouter.get('/config', async (_req, res) => {
  const [profiles, hoists] = await Promise.all([trussProfiles(), hoistModels()]);
  res.json({
    settings: await resolvedSettings(),
    trussProfiles: profiles.map((p) => ({ ...p, spanTable: JSON.parse(p.spanTableJson) })),
    hoistModels: hoists,
  });
});

riggingRouter.put('/settings', async (req, res) => {
  await saveRiggingSettings((req.body ?? {}) as Partial<RiggingSettings>);
  await logActivity('rigging.settings_updated', undefined, undefined, req.user!.id);
  res.json(await resolvedSettings());
});

const num = (v: unknown, min: number, max: number) => {
  const n = Number(v);
  return v !== '' && v !== null && Number.isFinite(n) && n >= min && n <= max ? n : null;
};
const text = (v: unknown, max: number) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null);

function trussData(b: Record<string, unknown>) {
  const name = text(b.name, 80);
  const kgPerM = num(b.kgPerM, 0, 100);
  const cantileverRatio = num(b.cantileverRatio, 0, 1);
  if (!name) return { error: 'Name is required' };
  if (kgPerM === null) return { error: 'Weight per metre must be 0 to 100 kg' };
  if (cantileverRatio === null) return { error: 'Cantilever limit must be between 0 and 1 of the span' };
  const table = Array.isArray(b.spanTable) ? b.spanTable : [];
  const spanTable = table
    .map((r) => ({ spanM: num((r as Record<string, unknown>)?.spanM, 0.5, 60), udlKgPerM: num((r as Record<string, unknown>)?.udlKgPerM, 0, 5000) }))
    .filter((r): r is { spanM: number; udlKgPerM: number } => r.spanM !== null && r.udlKgPerM !== null)
    .sort((a, b) => a.spanM - b.spanM);
  return { data: { name, maker: text(b.maker, 80), kgPerM, cantileverRatio, spanTableJson: JSON.stringify(spanTable), source: text(b.source, 300), notes: text(b.notes, 300) } };
}

riggingRouter.post('/truss-profiles', async (req, res) => {
  const { data, error } = trussData(req.body ?? {});
  if (error) return res.status(400).json({ error });
  res.status(201).json(await prisma.trussProfile.create({ data: data! }));
});
riggingRouter.put('/truss-profiles/:id', async (req, res) => {
  const { data, error } = trussData(req.body ?? {});
  if (error) return res.status(400).json({ error });
  res.json(await prisma.trussProfile.update({ where: { id: req.params.id }, data: data! }));
});
riggingRouter.delete('/truss-profiles/:id', async (req, res) => {
  await prisma.trussProfile.delete({ where: { id: req.params.id } });
  res.status(204).end();
});

function hoistData(b: Record<string, unknown>) {
  const name = text(b.name, 80);
  const ratedKg = num(b.ratedKg, 1, 20000);
  const bodyKg = num(b.bodyKg, 0, 500);
  const chainKgPerM = num(b.chainKgPerM, 0, 20);
  const chainM = num(b.chainM, 0, 200);
  if (!name) return { error: 'Name is required' };
  if (ratedKg === null || bodyKg === null || chainKgPerM === null || chainM === null) return { error: 'Rated load, body, chain weight and chain length must be numbers' };
  const hoistClass = ['D8', 'D8+', 'C1'].includes(b.hoistClass as string) ? (b.hoistClass as string) : 'D8+';
  return { data: { name, ratedKg, bodyKg, chainKgPerM, chainM, hoistClass, notes: text(b.notes, 300) } };
}

riggingRouter.post('/hoists', async (req, res) => {
  const { data, error } = hoistData(req.body ?? {});
  if (error) return res.status(400).json({ error });
  res.status(201).json(await prisma.hoistModel.create({ data: data! }));
});
riggingRouter.put('/hoists/:id', async (req, res) => {
  const { data, error } = hoistData(req.body ?? {});
  if (error) return res.status(400).json({ error });
  res.json(await prisma.hoistModel.update({ where: { id: req.params.id }, data: data! }));
});
riggingRouter.delete('/hoists/:id', async (req, res) => {
  await prisma.hoistModel.delete({ where: { id: req.params.id } });
  res.status(204).end();
});

async function names(ids: (string | null | undefined)[]) {
  const unique = [...new Set(ids.filter((x): x is string => Boolean(x)))];
  const users = await prisma.user.findMany({ where: { id: { in: unique } }, select: { id: true, displayName: true } });
  return new Map(users.map((u) => [u.id, u.displayName]));
}

async function jobRigging(jobId: string) {
  const [built, plan, profiles, hoists] = await Promise.all([buildRig(jobId), prisma.riggingPlan.findUnique({ where: { jobId } }), trussProfiles(), hoistModels()]);
  const n = await names([plan?.calculatedById]);
  return {
    ...built,
    disclaimer: RIGGING_DISCLAIMER,
    trussProfiles: profiles.map((p) => ({ id: p.id, name: p.name })),
    hoistModels: hoists.map((h) => ({ id: h.id, name: h.name, ratedKg: h.ratedKg, hoistClass: h.hoistClass })),
    record: {
      calculatedBy: plan?.calculatedById ? n.get(plan.calculatedById) ?? null : null,
      calculatedAt: plan?.calculatedAt ?? null,
      checkedByName: plan?.checkedByName ?? null,
      checkedAt: plan?.checkedAt ?? null,
    },
  };
}

jobRiggingRouter.get('/:jobId/rigging', async (req, res) => {
  res.json(await jobRigging(req.params.jobId));
});

/** Saves the hand changes (and method); any check on the old rig no longer stands. */
jobRiggingRouter.put('/:jobId/rigging', async (req, res) => {
  const jobId = req.params.jobId;
  const data: Record<string, unknown> = { calculatedById: req.user!.id, calculatedAt: new Date() };
  if (req.body?.overrides !== undefined) data.overridesJson = JSON.stringify(sanitiseOverrides(req.body.overrides));
  if (['tributary', 'continuous', 'envelope'].includes(req.body?.method)) data.method = req.body.method as RigMethod;
  const existing = await prisma.riggingPlan.findUnique({ where: { jobId } });
  if (existing?.checkedAt) Object.assign(data, { checkedByName: null, checkedAt: null, snapshotJson: null });
  await prisma.riggingPlan.upsert({ where: { jobId }, create: { jobId, ...data }, update: data });
  res.json(await jobRigging(jobId));
});

/** "Checked by": records who checked it and keeps the rig and results exactly as they were. */
jobRiggingRouter.post('/:jobId/rigging/check', async (req, res) => {
  const jobId = req.params.jobId;
  const checkedByName = typeof req.body?.checkedByName === 'string' ? req.body.checkedByName.trim().slice(0, 120) : '';
  if (!checkedByName) return res.status(400).json({ error: 'Enter who checked it' });
  const built = await buildRig(jobId);
  const result = solveRig(built.rig);
  const snapshotJson = JSON.stringify({ rig: built.rig, result, assumptions: built.assumptions, at: new Date().toISOString() });
  await prisma.riggingPlan.upsert({
    where: { jobId },
    create: { jobId, checkedByName, checkedAt: new Date(), snapshotJson, calculatedById: req.user!.id, calculatedAt: new Date() },
    update: { checkedByName, checkedAt: new Date(), snapshotJson },
  });
  await logActivity('rigging.checked', `Rigging checked by ${checkedByName}: ${result.totals.overCount} over, ${result.totals.warningCount} warnings`, jobId, req.user!.id);
  res.json(await jobRigging(jobId));
});

jobRiggingRouter.delete('/:jobId/rigging/check', async (req, res) => {
  await prisma.riggingPlan.updateMany({ where: { jobId: req.params.jobId }, data: { checkedByName: null, checkedAt: null, snapshotJson: null } });
  res.json(await jobRigging(req.params.jobId));
});

/** Saves this job's point capacities against its venue, for next time. */
jobRiggingRouter.post('/:jobId/rigging/venue-capacities', async (req, res) => {
  const built = await buildRig(req.params.jobId);
  if (!built.venue) return res.status(400).json({ error: 'Set the job venue (Job Settings) first' });
  const points = built.rig.points.filter((p) => p.capacityKg).map((p) => ({ name: p.name, capacityKg: p.capacityKg! }));
  if (points.length === 0) return res.status(400).json({ error: 'No point has a capacity yet' });
  const venueKey = built.venue.trim().toLowerCase();
  await prisma.venuePointSet.upsert({
    where: { venueKey },
    create: { venueKey, venueName: built.venue, pointsJson: JSON.stringify(points) },
    update: { venueName: built.venue, pointsJson: JSON.stringify(points) },
  });
  await logActivity('rigging.venue_saved', `${points.length} point capacities saved for ${built.venue}`, req.params.jobId, req.user!.id);
  res.json({ saved: points.length, venue: built.venue });
});

const csvCell = (v: string | number | null) => {
  const s = v === null ? '' : String(v);
  const safe = typeof v === 'string' && /^[=+\-@]/.test(s) ? `'${s}` : s;
  return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};

/** The point table, laid out like the plot's Rigging Points table, for the venue's form. */
jobRiggingRouter.get('/:jobId/rigging/export.csv', async (req, res) => {
  const [built, job, plan] = await Promise.all([
    buildRig(req.params.jobId),
    prisma.job.findUnique({ where: { id: req.params.jobId }, select: { name: true } }),
    prisma.riggingPlan.findUnique({ where: { jobId: req.params.jobId } }),
  ]);
  const result = solveRig(built.rig);
  const pointById = new Map(built.rig.points.map((p) => [p.id, p]));
  const trussOf = new Map<string, string>();
  for (const t of built.rig.trusses) for (const h of t.hoists) trussOf.set(h.pointId, t.name);
  const n = await names([plan?.calculatedById]);
  const rows: (string | number | null)[][] = [
    ['Name', 'X (m)', 'Y (m)', 'Capacity (kg)', 'Capacity from', 'Applied (kg)', 'Hoist and rigging (kg)', 'Load with margin (kg)', 'Use (%)', 'State', 'Position', 'Hoist'],
  ];
  for (const r of result.points) {
    const p = pointById.get(r.pointId)!;
    rows.push([
      r.name,
      p.x,
      p.y,
      r.capacityKg,
      r.capacitySource === 'PLOT' ? 'Plot' : r.capacitySource === 'VENUE' ? 'Venue' : r.capacitySource === 'MANUAL' ? 'Entered' : '',
      r.appliedKg,
      Math.round((r.breakdown.hoist + r.breakdown.rigging) * 10) / 10,
      r.pointLoadKg,
      r.utilisation === null ? null : Math.round(r.utilisation * 100),
      { ok: 'OK', warning: 'Warning', over: 'Over capacity', unknown: 'Unknown capacity', uplift: 'Uplift' }[r.state],
      p.kind === 'cablePick' ? 'Cable pick' : trussOf.get(r.pointId) ?? '',
      p.hoist ? `${p.hoist.name} (${p.hoist.hoistClass})` : p.kind === 'deadHang' ? 'Dead hang' : '',
    ]);
  }
  rows.push([]);
  rows.push(['Method', built.rig.settings.method === 'envelope' ? 'Envelope (larger of tributary and continuous beam)' : built.rig.settings.method]);
  rows.push(['Safety margin', `${built.rig.settings.marginPct}%`]);
  rows.push(['Calculated by', plan?.calculatedById ? n.get(plan.calculatedById) ?? '' : '']);
  rows.push(['Checked by', plan?.checkedByName ? `${plan.checkedByName} on ${plan.checkedAt?.toISOString().slice(0, 10)}` : '']);
  rows.push(['Note', RIGGING_DISCLAIMER]);
  const name = (job?.name ?? 'job').replace(/[^\w.-]+/g, '_').slice(0, 60);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${name}-rigging-points.csv"`);
  res.send(rows.map((r) => r.map(csvCell).join(',')).join('\n'));
});
