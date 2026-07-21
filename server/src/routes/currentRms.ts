import { Router } from 'express';
import { prisma, logActivity } from '../db';
import { requireRole } from '../auth';
import { DEFAULT_CURRENT_RMS_CONFIG, getCurrentRmsConfig, saveCurrentRmsConfig, toPublicConfig } from '../currentRms/config';
import { testCurrentRmsConnection, fetchOpportunityItems } from '../currentRms/client';
import { runCurrentRmsSync, restartCurrentRmsPolling } from '../currentRms/sync';

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

  const job = await prisma.job.create({
    data: {
      name: opp.subject,
      venue: opp.memberName,
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
  res.json({ linked: true, opportunity: opp, rmsAlertAt: job.rmsAlertAt });
});

jobCurrentRmsRouter.get('/:jobId/current-rms/pick-list', async (req, res) => {
  const job = await prisma.job.findUnique({ where: { id: req.params.jobId } });
  if (!job?.currentRmsOpportunityId) return res.status(400).json({ error: 'Job is not linked to a Current RMS opportunity' });
  const config = await getCurrentRmsConfig();
  if (!config.enabled) return res.status(400).json({ error: 'Current RMS integration is disabled' });
  try {
    const items = await fetchOpportunityItems(config, Number(job.currentRmsOpportunityId));
    res.json({ items });
  } catch (err) {
    res.status(502).json({ error: (err as Error).message });
  }
});

jobCurrentRmsRouter.post('/:jobId/current-rms/link', requireRole('ADMIN'), async (req, res) => {
  const { rmsId } = req.body ?? {};
  if (!rmsId) return res.status(400).json({ error: 'rmsId is required' });
  const job = await prisma.job.update({
    where: { id: req.params.jobId },
    data: { currentRmsOpportunityId: String(rmsId), rmsAlertAt: null },
  });
  await logActivity('current_rms.link', String(rmsId), job.id, req.user?.id);
  res.json(job);
});

jobCurrentRmsRouter.post('/:jobId/current-rms/unlink', requireRole('ADMIN'), async (req, res) => {
  const job = await prisma.job.update({
    where: { id: req.params.jobId },
    data: { currentRmsOpportunityId: null, rmsAlertAt: null },
  });
  await logActivity('current_rms.unlink', undefined, job.id, req.user?.id);
  res.json(job);
});

jobCurrentRmsRouter.post('/:jobId/current-rms/acknowledge', async (req, res) => {
  const job = await prisma.job.update({ where: { id: req.params.jobId }, data: { rmsAlertAt: null } });
  res.json(job);
});
