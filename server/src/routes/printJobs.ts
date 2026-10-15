import { Router } from 'express';
import fs from 'fs';
import { prisma, logActivity } from '../db';
import { isAdminRole, requireRole } from '../auth';
import { isJobVisibleTo } from '../jobVisibility';
import { sendStoredUpload } from '../uploadSafety';
import {
  DEFAULT_PRINTER_SETTINGS,
  generateAgentToken,
  getPrinterSettings,
  savePrinterSettings,
  PrinterSettings,
} from '../printing/printerSettings';
import { dispatchPrintJob, printJobFilePath } from '../printing/printJobService';
import { testPrinterConnection } from '../printing/direct9100';

export const printJobsRouter = Router();

/** A print job inherits its job's visibility - same rule as everything under /api/jobs/:jobId. */
async function findVisiblePrintJob(id: string, role: string | undefined) {
  const job = await prisma.printJob.findUnique({ where: { id } });
  if (!job || !(await isJobVisibleTo(job.jobId, role))) return null;
  return job;
}

printJobsRouter.get('/', async (req, res) => {
  const jobId = typeof req.query.jobId === 'string' ? req.query.jobId : undefined;
  if (jobId && !(await isJobVisibleTo(jobId, req.user?.role))) return res.json([]);
  let visibleJobIds: string[] | undefined;
  if (!jobId && !isAdminRole(req.user?.role)) {
    visibleJobIds = (await prisma.job.findMany({ where: { isPublic: true }, select: { id: true } })).map((j) => j.id);
  }
  const jobs = await prisma.printJob.findMany({
    where: jobId ? { jobId } : visibleJobIds ? { jobId: { in: visibleJobIds } } : undefined,
    orderBy: { createdAt: 'desc' },
    take: 100,
  });
  res.json(jobs);
});

printJobsRouter.get('/:id/pdf', async (req, res) => {
  const job = await findVisiblePrintJob(req.params.id, req.user?.role);
  if (!job) return res.status(404).end();
  const filePath = printJobFilePath(job.fileName);
  if (!fs.existsSync(filePath)) return res.status(410).json({ error: 'PDF no longer on disk' });
  await sendStoredUpload(res, filePath, job.fileName);
});

printJobsRouter.post('/:id/retry', async (req, res) => {
  const job = await findVisiblePrintJob(req.params.id, req.user?.role);
  if (!job) return res.status(404).json({ error: 'not found' });
  await prisma.printJob.update({ where: { id: job.id }, data: { status: 'QUEUED', error: null } });
  await dispatchPrintJob(job.id);
  const updated = await prisma.printJob.findUnique({ where: { id: job.id } });
  await logActivity('print_job.retry', `${job.labelType} → ${job.tray}`, job.jobId, req.user?.id);
  res.json(updated);
});

printJobsRouter.post('/:id/cancel', async (req, res) => {
  const job = await findVisiblePrintJob(req.params.id, req.user?.role);
  if (!job) return res.status(404).json({ error: 'not found' });
  if (!['QUEUED', 'FAILED'].includes(job.status)) {
    return res.status(400).json({ error: `Cannot cancel a job in status ${job.status}` });
  }
  const updated = await prisma.printJob.update({ where: { id: job.id }, data: { status: 'CANCELLED' } });
  res.json(updated);
});

// --- Printer settings (admin only) ---

export const printerSettingsRouter = Router();

// Readable by staff (the print queue needs the method and tray map) but the agent token - which
// lets its holder act as the print agent - only ever goes to admins.
printerSettingsRouter.get('/', async (req, res) => {
  const settings = await getPrinterSettings();
  if (!isAdminRole(req.user?.role)) settings.agent = { ...settings.agent, token: '' };
  res.json(settings);
});

printerSettingsRouter.put('/', requireRole('ADMIN'), async (req, res) => {
  const body = req.body as PrinterSettings;
  if (!body || !['DRY_RUN', 'DIRECT_9100', 'AGENT'].includes(body.method)) {
    return res.status(400).json({ error: 'method must be DRY_RUN, DIRECT_9100, or AGENT' });
  }
  const current = await getPrinterSettings();
  const next: PrinterSettings = {
    ...current,
    ...body,
    // The agent token is only changed via the dedicated endpoint below.
    agent: { ...current.agent, ...body.agent, token: current.agent.token },
  };
  await savePrinterSettings(next);
  await logActivity('printer_settings.update', body.method, undefined, req.user?.id);
  res.json(next);
});

printerSettingsRouter.post('/regenerate-token', requireRole('ADMIN'), async (req, res) => {
  const settings = await getPrinterSettings();
  settings.agent.token = generateAgentToken();
  await savePrinterSettings(settings);
  await logActivity('printer_settings.token_regenerated', undefined, undefined, req.user?.id);
  res.json(settings);
});

printerSettingsRouter.post('/test-connection', requireRole('ADMIN'), async (req, res) => {
  const settings = await getPrinterSettings();
  const host = req.body?.host ?? settings.direct.host;
  const port = req.body?.port ?? settings.direct.port;
  if (!host) return res.status(400).json({ error: 'No printer IP configured' });
  try {
    await testPrinterConnection(host, port);
    res.json({ ok: true, message: `Connected to ${host}:${port}` });
  } catch (err) {
    res.status(502).json({ ok: false, error: (err as Error).message });
  }
});

printerSettingsRouter.get('/defaults', (_req, res) => {
  res.json(DEFAULT_PRINTER_SETTINGS);
});
