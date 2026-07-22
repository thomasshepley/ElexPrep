import { Router } from 'express';
import { prisma, logActivity } from '../db';
import { requireRole } from '../auth';
import { requirePermission } from '../permissions';
import { DEFAULT_CURRENT_RMS_CONFIG, getCurrentRmsConfig, saveCurrentRmsConfig, toPublicConfig } from '../currentRms/config';
import { testCurrentRmsConnection, fetchOpportunityItems, GROUP_ITEM_TYPE } from '../currentRms/client';
import {
  runCurrentRmsSync,
  restartCurrentRmsPolling,
  resolveAndCacheMemberName,
  fetchPickListSnapshot,
} from '../currentRms/sync';

export const currentRmsRouter = Router();

currentRmsRouter.use(requireRole('ADMIN'));

currentRmsRouter.get('/config', async (_req, res) => {
  res.json(toPublicConfig(await getCurrentRmsConfig()));
});

currentRmsRouter.put('/config', async (req, res) => {
  const current = await getCurrentRmsConfig();
  const body = req.body ?? {};
  const next = {
    ...current,
    enabled: body.enabled ?? current.enabled,
    subdomain: body.subdomain !== undefined ? body.subdomain : current.subdomain,
    pollMinutes: body.pollMinutes ?? current.pollMinutes,
    // Only overwrite the stored key if a non-empty one was actually submitted — this lets
    // the settings form round-trip without the client ever needing to see the real key.
    apiKey: body.apiKey ? body.apiKey : current.apiKey,
  };
  await saveCurrentRmsConfig(next);
  await restartCurrentRmsPolling();
  await logActivity('current_rms.config_update', `enabled=${next.enabled}`, undefined, req.user?.id);
  res.json(toPublicConfig(next));
});

currentRmsRouter.post('/test-connection', async (req, res) => {
  const config = await getCurrentRmsConfig();
  const subdomain = req.body?.subdomain || config.subdomain;
  const apiKey = req.body?.apiKey || config.apiKey;
  try {
    await testCurrentRmsConnection({ subdomain, apiKey });
    res.json({ ok: true, message: `Connected to ${subdomain}.current-rms.com` });
  } catch (err) {
    res.status(502).json({ ok: false, error: (err as Error).message });
  }
});

currentRmsRouter.post('/sync', async (req, res) => {
  const result = await runCurrentRmsSync();
  await logActivity(
    'current_rms.sync',
    result.error ? `failed: ${result.error}` : `${result.pulled} pulled, ${result.alertsRaised} alerts`,
    undefined,
    req.user?.id
  );
  res.json(result);
});

currentRmsRouter.get('/opportunities', async (req, res) => {
  const q = typeof req.query.q === 'string' ? req.query.q : undefined;
  const opportunities = await prisma.currentRmsOpportunity.findMany({
    where: q
      ? {
          OR: [
            { subject: { contains: q } },
            { memberName: { contains: q } },
          ],
        }
      : undefined,
    orderBy: { rmsUpdatedAt: 'desc' },
    take: 200,
  });
  res.json(opportunities);
});

currentRmsRouter.post('/opportunities/:rmsId/import', async (req, res) => {
  const rmsId = Number(req.params.rmsId);
  const opp = await prisma.currentRmsOpportunity.findUnique({ where: { rmsId } });
  if (!opp) return res.status(404).json({ error: 'Opportunity not cached — try syncing first' });

  const existingJob = await prisma.job.findFirst({ where: { currentRmsOpportunityId: String(rmsId) } });
  if (existingJob) return res.status(409).json({ error: 'A job is already linked to this opportunity', job: existingJob });

  const venue = await resolveAndCacheMemberName(await getCurrentRmsConfig(), opp);

  const job = await prisma.job.create({
    data: {
      name: opp.subject,
      venue,
      currentRmsOpportunityId: String(rmsId),
    },
  });
  await logActivity('current_rms.import', opp.subject, job.id, req.user?.id);
  res.status(201).json(job);
});

/** Defaults exposed so the settings page can show sensible placeholders (e.g. poll interval). */
currentRmsRouter.get('/defaults', (_req, res) => {
  const { apiKey: _apiKey, ...rest } = DEFAULT_CURRENT_RMS_CONFIG;
  res.json(rest);
});

// --- Per-job endpoints, mounted separately under /api/jobs since any user who can see the
// job (not just admins) should be able to view its linked opportunity/pick list. ---

export const jobCurrentRmsRouter = Router();

jobCurrentRmsRouter.get('/:jobId/current-rms', async (req, res) => {
  const job = await prisma.job.findUnique({ where: { id: req.params.jobId } });
  if (!job) return res.status(404).json({ error: 'not found' });
  if (!job.currentRmsOpportunityId) return res.json({ linked: false });

  const opp = await prisma.currentRmsOpportunity.findUnique({
    where: { rmsId: Number(job.currentRmsOpportunityId) },
  });
  if (opp && !opp.memberName) {
    const memberName = await resolveAndCacheMemberName(await getCurrentRmsConfig(), opp);
    if (memberName) opp.memberName = memberName;
  }
  res.json({ linked: true, opportunity: opp, rmsAlertAt: job.rmsAlertAt });
});

jobCurrentRmsRouter.get('/:jobId/current-rms/pick-list', async (req, res) => {
  const job = await prisma.job.findUnique({ where: { id: req.params.jobId } });
  if (!job?.currentRmsOpportunityId) return res.status(400).json({ error: 'Job is not linked to a Current RMS opportunity' });
  const config = await getCurrentRmsConfig();
  if (!config.enabled) return res.status(400).json({ error: 'Current RMS integration is disabled' });
  try {
    const [items, statuses] = await Promise.all([
      fetchOpportunityItems(config, Number(job.currentRmsOpportunityId)),
      prisma.pickListItemStatus.findMany({ where: { jobId: job.id } }),
    ]);
    const preppedById = new Map(statuses.map((s) => [s.rmsItemId, s.prepped]));
    res.json({
      items: items.map((i) => ({
        ...i,
        prepped: preppedById.get(i.id) ?? false,
        // Current RMS's own opportunity-item status: 20 = "Booked Out" (physically out on
        // hire) — this is CRMS's system of record, separate from ElexPrep's own `prepped`
        // crew checklist above, which tracks warehouse prep independent of when someone
        // updates CRMS itself.
        bookedOut: typeof i.status === 'number' && i.status >= 20,
        // A Group row is a section heading in Current RMS's own quote/order layout (e.g.
        // "Lighting - Moving Lights"), not a real item to pick.
        isGroup: i.opportunity_item_type === GROUP_ITEM_TYPE,
      })),
    });
  } catch (err) {
    res.status(502).json({ error: (err as Error).message });
  }
});

/** Crew ticks an item off (or back on) as they physically pull it — ElexPrep's own tracking,
 * independent of whatever Current RMS's own line-item status says. */
jobCurrentRmsRouter.put('/:jobId/current-rms/pick-list/:itemId/prepped', async (req, res) => {
  const { prepped } = req.body ?? {};
  if (typeof prepped !== 'boolean') return res.status(400).json({ error: 'prepped must be a boolean' });
  const rmsItemId = Number(req.params.itemId);
  const status = await prisma.pickListItemStatus.upsert({
    where: { jobId_rmsItemId: { jobId: req.params.jobId, rmsItemId } },
    create: { jobId: req.params.jobId, rmsItemId, prepped },
    update: { prepped },
  });
  res.json(status);
});

/** The signage screen polls this for the GitHub-diff-style full-screen change alert. */
jobCurrentRmsRouter.get('/:jobId/current-rms/items-diff', async (req, res) => {
  const job = await prisma.job.findUnique({ where: { id: req.params.jobId } });
  if (!job) return res.status(404).json({ error: 'not found' });
  res.json({
    diff: job.rmsItemsDiffJson ? JSON.parse(job.rmsItemsDiffJson) : null,
    diffAt: job.rmsItemsDiffAt,
  });
});

jobCurrentRmsRouter.post('/:jobId/current-rms/items-diff/acknowledge', async (req, res) => {
  const job = await prisma.job.update({
    where: { id: req.params.jobId },
    data: { rmsItemsDiffJson: null, rmsItemsDiffAt: null },
  });
  res.json({ diff: null, diffAt: job.rmsItemsDiffAt });
});

jobCurrentRmsRouter.post('/:jobId/current-rms/link', requirePermission('linkCurrentRms'), async (req, res) => {
  const { rmsId } = req.body ?? {};
  if (!rmsId) return res.status(400).json({ error: 'rmsId is required' });
  // Establish the pick-list baseline right away, so the first real change afterwards has
  // something to diff against instead of looking like every item was just "added".
  let snapshotJson: string | null = null;
  try {
    const config = await getCurrentRmsConfig();
    if (config.enabled) snapshotJson = JSON.stringify(await fetchPickListSnapshot(config, Number(rmsId)));
  } catch {
    // Not fatal — the link itself still succeeds; the next sync will establish it instead.
  }
  const job = await prisma.job.update({
    where: { id: req.params.jobId },
    data: {
      currentRmsOpportunityId: String(rmsId),
      rmsAlertAt: null,
      rmsItemsSnapshotJson: snapshotJson,
      rmsItemsDiffJson: null,
      rmsItemsDiffAt: null,
    },
  });
  await logActivity('current_rms.link', String(rmsId), job.id, req.user?.id);
  res.json(job);
});

jobCurrentRmsRouter.post('/:jobId/current-rms/unlink', requirePermission('linkCurrentRms'), async (req, res) => {
  const job = await prisma.job.update({
    where: { id: req.params.jobId },
    data: {
      currentRmsOpportunityId: null,
      rmsAlertAt: null,
      rmsItemsSnapshotJson: null,
      rmsItemsDiffJson: null,
      rmsItemsDiffAt: null,
    },
  });
  await logActivity('current_rms.unlink', undefined, job.id, req.user?.id);
  res.json(job);
});

jobCurrentRmsRouter.post('/:jobId/current-rms/acknowledge', async (req, res) => {
  const job = await prisma.job.update({ where: { id: req.params.jobId }, data: { rmsAlertAt: null } });
  res.json(job);
});
