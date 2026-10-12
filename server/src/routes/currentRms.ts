import { Router } from 'express';
import { prisma, logActivity } from '../db';
import { requireRole } from '../auth';
import { requirePermission } from '../permissions';
import { DEFAULT_CURRENT_RMS_CONFIG, getCurrentRmsConfig, saveCurrentRmsConfig, toPublicConfig } from '../currentRms/config';
import { testCurrentRmsConnection, fetchOpportunityItems, GROUP_ITEM_TYPE, RawOpportunityItem } from '../currentRms/client';
import {
  runCurrentRmsSync,
  restartCurrentRmsPolling,
  resolveAndCacheMemberName,
  fetchPickListSnapshot,
} from '../currentRms/sync';
import { getOneDriveConfig } from '../oneDrive/config';
import { matchJobFolder } from '../oneDrive/matcher';
import { getItemByPath } from '../oneDrive/client';
import { normalizeCrewFeaturesPatch } from '../crewFeatures';

export const currentRmsRouter = Router();

// Connection config and manual sync stay ADMIN-only — they hold the API key and can hammer
// Current RMS's rate limit. Browsing/onboarding opportunities (below) is delegatable instead,
// since onboarding a job is now the only way to create one at all.
currentRmsRouter.get('/config', requireRole('ADMIN'), async (_req, res) => {
  res.json(toPublicConfig(await getCurrentRmsConfig()));
});

currentRmsRouter.put('/config', requireRole('ADMIN'), async (req, res) => {
  const current = await getCurrentRmsConfig();
  const body = req.body ?? {};
  const next = {
    ...current,
    enabled: body.enabled ?? current.enabled,
    subdomain: body.subdomain !== undefined ? body.subdomain : current.subdomain,
    pollMinutes: body.pollMinutes ?? current.pollMinutes,
    // Only overwrite the stored key if a non-empty one was actually submitted — this lets
    // the settings form round-trip without the client ever needing to see the real key.
    // removeApiKey is the one explicit way to clear it instead of replacing it.
    apiKey: body.removeApiKey ? '' : body.apiKey ? body.apiKey : current.apiKey,
  };
  await saveCurrentRmsConfig(next);
  await restartCurrentRmsPolling();
  await logActivity('current_rms.config_update', `enabled=${next.enabled}`, undefined, req.user?.id);
  res.json(toPublicConfig(next));
});

currentRmsRouter.post('/test-connection', requireRole('ADMIN'), async (req, res) => {
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

currentRmsRouter.post('/sync', requireRole('ADMIN'), async (req, res) => {
  const result = await runCurrentRmsSync();
  await logActivity(
    'current_rms.sync',
    result.error ? `failed: ${result.error}` : `${result.pulled} pulled, ${result.alertsRaised} alerts`,
    undefined,
    req.user?.id
  );
  res.json(result);
});

currentRmsRouter.get('/opportunities', requirePermission('onboardJobs'), async (req, res) => {
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

/** Attempts an automatic OneDrive folder match for a newly-onboarded job, or resolves a
 * manually-supplied path to a real folder if one was given instead. Never throws — a OneDrive
 * failure (not configured, no match, a transient Graph error) shouldn't block onboarding the
 * job itself, so this just falls back to "no folder linked yet" on any error. */
async function resolveOneDriveFolderForOnboarding(
  opp: { subject: string; startsAt: Date | null },
  manualPath?: string
): Promise<{ oneDriveFolderId: string | null; oneDriveFolderPath: string | null; oneDriveMatchStatus: string | null }> {
  try {
    const config = await getOneDriveConfig();
    if (!config.enabled) return { oneDriveFolderId: null, oneDriveFolderPath: null, oneDriveMatchStatus: null };
    if (manualPath) {
      const item = await getItemByPath(config, manualPath);
      if (item) return { oneDriveFolderId: item.id, oneDriveFolderPath: manualPath, oneDriveMatchStatus: 'MANUAL' };
      return { oneDriveFolderId: null, oneDriveFolderPath: null, oneDriveMatchStatus: null };
    }
    const match = await matchJobFolder(config, opp);
    if (match) return { oneDriveFolderId: match.folderId, oneDriveFolderPath: match.path, oneDriveMatchStatus: 'MATCHED' };
    return { oneDriveFolderId: null, oneDriveFolderPath: null, oneDriveMatchStatus: null };
  } catch {
    return { oneDriveFolderId: null, oneDriveFolderPath: null, oneDriveMatchStatus: null };
  }
}

currentRmsRouter.post('/opportunities/:rmsId/import', requirePermission('onboardJobs'), async (req, res) => {
  const rmsId = Number(req.params.rmsId);
  const opp = await prisma.currentRmsOpportunity.findUnique({ where: { rmsId } });
  if (!opp) return res.status(404).json({ error: 'Opportunity not cached — try syncing first' });

  const existingJob = await prisma.job.findFirst({ where: { currentRmsOpportunityId: String(rmsId) } });
  if (existingJob) return res.status(409).json({ error: 'A job is already linked to this opportunity', job: existingJob });

  const venue = await resolveAndCacheMemberName(await getCurrentRmsConfig(), opp);
  const { crewFeatures, oneDriveFolderPath, name, description, address, startsAt, endsAt } = req.body ?? {};
  const oneDrive = await resolveOneDriveFolderForOnboarding(opp, oneDriveFolderPath || undefined);
  const crewFeaturesJson = crewFeatures ? JSON.stringify(normalizeCrewFeaturesPatch(crewFeatures)) : null;

  // The review step on the dashboard pre-fills these from the opportunity and lets the admin
  // override before the job is actually created — see JobsListPage's OnboardingOptionsForm.
  const job = await prisma.job.create({
    data: {
      name: name || opp.subject,
      venue,
      description: description || null,
      address: address || null,
      startsAt: startsAt ? new Date(startsAt) : opp.startsAt,
      endsAt: endsAt ? new Date(endsAt) : opp.endsAt,
      currentRmsOpportunityId: String(rmsId),
      crewFeaturesJson,
      ...oneDrive,
    },
  });
  await logActivity('current_rms.import', opp.subject, job.id, req.user?.id);
  res.status(201).json(job);
});

/** Bulk-onboards several cached opportunities at once — the dashboard's "Onboard N selected"
 * action. Each one gets its own best-effort OneDrive auto-match (no manual override makes
 * sense across a batch of different jobs); the same crewFeatures patch, if given, applies to
 * all of them uniformly. Skips (rather than fails the whole batch) any opportunity that's
 * already linked or no longer cached. */
currentRmsRouter.post('/opportunities/bulk-import', requirePermission('onboardJobs'), async (req, res) => {
  const { rmsIds, crewFeatures } = req.body ?? {};
  if (!Array.isArray(rmsIds) || rmsIds.length === 0) return res.status(400).json({ error: 'rmsIds (a non-empty array) is required' });

  const crewFeaturesJson = crewFeatures ? JSON.stringify(normalizeCrewFeaturesPatch(crewFeatures)) : null;
  const config = await getCurrentRmsConfig();
  const created: unknown[] = [];
  const skipped: { rmsId: number; reason: string }[] = [];

  for (const raw of rmsIds) {
    const rmsId = Number(raw);
    const opp = await prisma.currentRmsOpportunity.findUnique({ where: { rmsId } });
    if (!opp) {
      skipped.push({ rmsId, reason: 'Not cached — try syncing first' });
      continue;
    }
    const existingJob = await prisma.job.findFirst({ where: { currentRmsOpportunityId: String(rmsId) } });
    if (existingJob) {
      skipped.push({ rmsId, reason: 'Already onboarded' });
      continue;
    }
    const venue = await resolveAndCacheMemberName(config, opp);
    const oneDrive = await resolveOneDriveFolderForOnboarding(opp);
    const job = await prisma.job.create({
      data: { name: opp.subject, venue, currentRmsOpportunityId: String(rmsId), crewFeaturesJson, ...oneDrive },
    });
    await logActivity('current_rms.import', opp.subject, job.id, req.user?.id);
    created.push(job);
  }

  res.status(201).json({ created, skipped });
});

/** Defaults exposed so the settings page can show sensible placeholders (e.g. poll interval). */
currentRmsRouter.get('/defaults', requirePermission('onboardJobs'), (_req, res) => {
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

function toMoney(value: string | undefined): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

/** What one opportunity charges the client for crew/labour — the sum of every Service-type
 * line's pre-tax charge (not a Group row's own total, and not Current RMS's own per-asset
 * opportunity_cost, which this app doesn't read; see RawOpportunityItem). Service is this
 * account's existing convention for labour/setup lines (already relied on by the pick list's
 * Rentals-only default), so this reuses it rather than looking for a specifically-named group. */
function sumServiceCharge(items: RawOpportunityItem[]): number {
  return items
    .filter((i) => i.opportunity_item_type !== GROUP_ITEM_TYPE && i.transaction_type_name === 'Service')
    .reduce((sum, i) => sum + toMoney(i.charge_excluding_tax_total ?? i.charge_total), 0);
}

/**
 * Admin-only crew profit/cost view: what the client is charged for crew (from Current RMS,
 * summed across every opportunity sharing this job's Current RMS "project" — see
 * CurrentRmsOpportunity.projectId — so a separate "<Job> - Crewing" opportunity counts too)
 * against what ElexPrep's own records say crew actually cost on this job (JobCrewAssignment's
 * day rate override, or the crew member's own default, times the assignment's days). This is
 * financial margin data, same sensitivity tier as bank details/compliance documents — ADMIN
 * only, never delegated via the permissions system, and never surfaced in the freelancer-
 * facing crew portal.
 */
jobCurrentRmsRouter.get('/:jobId/current-rms/crew-margin', requireRole('ADMIN'), async (req, res) => {
  const job = await prisma.job.findUnique({ where: { id: req.params.jobId } });
  if (!job) return res.status(404).json({ error: 'not found' });
  if (!job.currentRmsOpportunityId) return res.status(400).json({ error: 'Job is not linked to a Current RMS opportunity' });
  const config = await getCurrentRmsConfig();
  if (!config.enabled) return res.status(400).json({ error: 'Current RMS integration is disabled' });

  const primaryRmsId = Number(job.currentRmsOpportunityId);
  const primary = await prisma.currentRmsOpportunity.findUnique({ where: { rmsId: primaryRmsId } });
  const siblings = primary?.projectId
    ? await prisma.currentRmsOpportunity.findMany({ where: { projectId: primary.projectId } })
    : [];
  // Always include the job's own linked opportunity even if it isn't cached locally yet (a
  // sync hasn't run since it was linked) — siblings alone would silently drop it.
  const opportunityIds = [...new Set([primaryRmsId, ...siblings.map((s) => s.rmsId)])];

  let chargeBreakdown;
  try {
    chargeBreakdown = await Promise.all(
      opportunityIds.map(async (rmsId) => {
        const items = await fetchOpportunityItems(config, rmsId);
        const cached = siblings.find((s) => s.rmsId === rmsId) ?? primary;
        return {
          opportunityId: rmsId,
          subject: cached?.subject ?? `Opportunity #${rmsId}`,
          serviceCharge: sumServiceCharge(items),
        };
      })
    );
  } catch (err) {
    return res.status(502).json({ error: (err as Error).message });
  }
  const chargeTotal = chargeBreakdown.reduce((sum, b) => sum + b.serviceCharge, 0);

  const assignments = await prisma.jobCrewAssignment.findMany({
    where: { jobId: job.id },
    include: { crewProfile: { include: { user: { select: { displayName: true } } } } },
  });
  const costBreakdown = assignments.map((a) => {
    const rate = toMoney(a.dayRate ?? a.crewProfile.dayRate ?? undefined);
    const days = a.days ? toMoney(a.days) || 1 : 1;
    return {
      crewProfileId: a.crewProfileId,
      name: a.crewProfile.user.displayName,
      role: a.role,
      dayRate: rate,
      days,
      cost: rate * days,
    };
  });
  const costTotal = costBreakdown.reduce((sum, b) => sum + b.cost, 0);

  const margin = chargeTotal - costTotal;
  res.json({
    chargeTotal,
    chargeBreakdown,
    costTotal,
    costBreakdown,
    margin,
    marginPercent: chargeTotal > 0 ? (margin / chargeTotal) * 100 : null,
  });
});
