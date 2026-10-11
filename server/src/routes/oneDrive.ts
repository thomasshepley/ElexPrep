import { Router } from 'express';
import { prisma, logActivity } from '../db';
import { requireRole } from '../auth';
import { requirePermission } from '../permissions';
import { getOneDriveConfig, saveOneDriveConfig, toPublicOneDriveConfig, DEFAULT_ONE_DRIVE_CONFIG } from '../oneDrive/config';
import { testOneDriveConnection, listChildren, getItemByPath, streamOneDriveFile } from '../oneDrive/client';
import { matchJobFolder } from '../oneDrive/matcher';
import { findSharedCadPdf } from '../oneDrive/cad';
import { listJobShares, shareItemWithJob, unshareItem } from '../oneDrive/shares';

/** Global OneDrive config — ADMIN-only, holds the Azure app secret. */
export const oneDriveRouter = Router();
oneDriveRouter.use(requireRole('ADMIN'));

oneDriveRouter.get('/config', async (_req, res) => {
  res.json(toPublicOneDriveConfig(await getOneDriveConfig()));
});

oneDriveRouter.put('/config', async (req, res) => {
  const current = await getOneDriveConfig();
  const body = req.body ?? {};
  const next = {
    ...current,
    enabled: body.enabled ?? current.enabled,
    tenantId: body.tenantId !== undefined ? body.tenantId : current.tenantId,
    clientId: body.clientId !== undefined ? body.clientId : current.clientId,
    driveId: body.driveId !== undefined ? body.driveId : current.driveId,
    rootFolderPath: body.rootFolderPath !== undefined ? body.rootFolderPath : current.rootFolderPath,
    // Only overwrite the stored secret if a non-empty one was actually submitted, same as
    // Current RMS's API key field.
    clientSecret: body.clientSecret ? body.clientSecret : current.clientSecret,
  };
  await saveOneDriveConfig(next);
  await logActivity('onedrive.config_update', `enabled=${next.enabled}`, undefined, req.user?.id);
  res.json(toPublicOneDriveConfig(next));
});

oneDriveRouter.post('/test-connection', async (req, res) => {
  const config = await getOneDriveConfig();
  try {
    await testOneDriveConnection({ ...config, enabled: true, ...(req.body ?? {}) });
    await saveOneDriveConfig({ ...config, lastTestError: null });
    res.json({ ok: true, message: 'Connected to OneDrive.' });
  } catch (err) {
    const message = (err as Error).message;
    await saveOneDriveConfig({ ...config, lastTestError: message });
    res.status(502).json({ ok: false, error: message });
  }
});

oneDriveRouter.get('/defaults', (_req, res) => {
  const { clientSecret: _s, ...rest } = DEFAULT_ONE_DRIVE_CONFIG;
  res.json(rest);
});

/** Per-job OneDrive endpoints, mounted under /api/jobs — matching/browsing/sharing is
 * delegatable via manageOneDrive rather than ADMIN-only, same reasoning as linkCurrentRms. */
export const jobOneDriveRouter = Router();

jobOneDriveRouter.get('/:jobId/onedrive', requirePermission('manageOneDrive'), async (req, res) => {
  const job = await prisma.job.findUnique({ where: { id: req.params.jobId } });
  if (!job) return res.status(404).json({ error: 'not found' });
  const config = await getOneDriveConfig();
  const [cadPdf, shares] = await Promise.all([
    findSharedCadPdf(job).catch(() => null),
    listJobShares(job.id),
  ]);
  res.json({
    enabled: config.enabled,
    folderId: job.oneDriveFolderId,
    folderPath: job.oneDriveFolderPath,
    matchStatus: job.oneDriveMatchStatus,
    cadPdf,
    shares,
  });
});

/** Re-runs the name-based auto-match against the job's opportunity — useful once a project
 * folder finally exists in OneDrive after a job was onboarded before it was created there. */
jobOneDriveRouter.post('/:jobId/onedrive/match', requirePermission('manageOneDrive'), async (req, res) => {
  const job = await prisma.job.findUnique({ where: { id: req.params.jobId } });
  if (!job) return res.status(404).json({ error: 'not found' });
  const config = await getOneDriveConfig();
  if (!config.enabled) return res.status(400).json({ error: 'OneDrive is not configured yet' });

  let startsAt: Date | null = null;
  if (job.currentRmsOpportunityId) {
    const opp = await prisma.currentRmsOpportunity.findUnique({ where: { rmsId: Number(job.currentRmsOpportunityId) } });
    startsAt = opp?.startsAt ?? null;
  }
  const match = await matchJobFolder(config, { subject: job.name, startsAt });
  const updated = await prisma.job.update({
    where: { id: job.id },
    data: match
      ? { oneDriveFolderId: match.folderId, oneDriveFolderPath: match.path, oneDriveMatchStatus: 'MATCHED' }
      : { oneDriveFolderId: null, oneDriveFolderPath: null, oneDriveMatchStatus: null },
  });
  res.json({ matched: Boolean(match), folderPath: updated.oneDriveFolderPath });
});

/** Manually points a job at a specific OneDrive folder, by path — the fallback when
 * auto-matching fails (a differently-named folder, or it doesn't exist yet). */
jobOneDriveRouter.put('/:jobId/onedrive/folder', requirePermission('manageOneDrive'), async (req, res) => {
  const { path: folderPath } = req.body ?? {};
  if (!folderPath || typeof folderPath !== 'string') return res.status(400).json({ error: 'path is required' });
  const config = await getOneDriveConfig();
  if (!config.enabled) return res.status(400).json({ error: 'OneDrive is not configured yet' });
  const item = await getItemByPath(config, folderPath);
  if (!item || !item.folder) return res.status(404).json({ error: 'No folder found at that path' });
  const job = await prisma.job.update({
    where: { id: req.params.jobId },
    data: { oneDriveFolderId: item.id, oneDriveFolderPath: folderPath, oneDriveMatchStatus: 'MANUAL' },
  });
  await logActivity('onedrive.folder_set', folderPath, job.id, req.user?.id);
  res.json({ folderId: job.oneDriveFolderId, folderPath: job.oneDriveFolderPath, matchStatus: job.oneDriveMatchStatus });
});

jobOneDriveRouter.delete('/:jobId/onedrive/folder', requirePermission('manageOneDrive'), async (req, res) => {
  const job = await prisma.job.update({
    where: { id: req.params.jobId },
    data: { oneDriveFolderId: null, oneDriveFolderPath: null, oneDriveMatchStatus: null },
  });
  await logActivity('onedrive.folder_unlink', undefined, job.id, req.user?.id);
  res.json({ folderId: null, folderPath: null, matchStatus: null });
});

/** Browses a job's matched OneDrive folder (or any sub-folder within it, via ?folderId=) for
 * the admin file-picker UI. */
jobOneDriveRouter.get('/:jobId/onedrive/browse', requirePermission('manageOneDrive'), async (req, res) => {
  const job = await prisma.job.findUnique({ where: { id: req.params.jobId } });
  if (!job) return res.status(404).json({ error: 'not found' });
  const config = await getOneDriveConfig();
  if (!config.enabled) return res.status(400).json({ error: 'OneDrive is not configured yet' });
  if (!job.oneDriveFolderId) return res.status(400).json({ error: 'This job has no OneDrive folder linked yet' });
  const folderId = typeof req.query.folderId === 'string' ? req.query.folderId : job.oneDriveFolderId;
  try {
    const children = await listChildren(config, folderId);
    res.json({ items: children });
  } catch (err) {
    res.status(502).json({ error: (err as Error).message });
  }
});

/** Streams any item under the job's linked folder for the admin browser/CAD preview — unlike
 * the crew-facing equivalent, this isn't limited to explicitly-shared items, since an admin
 * reviewing the folder needs to preview a file before deciding whether to share it. */
jobOneDriveRouter.get('/:jobId/onedrive/file/:itemId', requirePermission('manageOneDrive'), async (req, res) => {
  try {
    const config = await getOneDriveConfig();
    const { stream, contentType, fileName } = await streamOneDriveFile(config, req.params.itemId);
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(fileName)}"`);
    stream.pipe(res);
  } catch (err) {
    res.status(502).json({ error: (err as Error).message });
  }
});

jobOneDriveRouter.post('/:jobId/onedrive/share', requirePermission('manageOneDrive'), async (req, res) => {
  const { itemId, itemName, itemPath, isFolder } = req.body ?? {};
  if (!itemId || !itemName || !itemPath) return res.status(400).json({ error: 'itemId, itemName, and itemPath are required' });
  const share = await shareItemWithJob(
    req.params.jobId,
    { id: itemId, name: itemName, folder: isFolder ? { childCount: 0 } : undefined },
    itemPath,
    req.user?.id
  );
  await logActivity('onedrive.share', itemName, req.params.jobId, req.user?.id);
  res.status(201).json(share);
});

jobOneDriveRouter.delete('/:jobId/onedrive/share/:shareId', requirePermission('manageOneDrive'), async (req, res) => {
  const removed = await unshareItem(req.params.jobId, req.params.shareId);
  if (!removed) return res.status(404).json({ error: 'Share not found' });
  await logActivity('onedrive.unshare', undefined, req.params.jobId, req.user?.id);
  res.status(204).end();
});
