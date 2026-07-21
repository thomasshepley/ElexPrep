import { Router } from 'express';
import fs from 'fs';
import { prisma, logActivity } from '../db';
import { requireRole } from '../auth';
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

printJobsRouter.get('/', async (req, res) => {
  const jobId = typeof req.query.jobId === 'string' ? req.query.jobId : undefined;
  const jobs = await prisma.printJob.findMany({
    where: jobId ? { jobId } : undefined,
    orderBy: { createdAt: 'desc' },
    take: 100,
  });
  res.json(jobs);
});

printJobsRouter.get('/:id/pdf', async (req, res) => {
  const job = await prisma.printJob.findUnique({ where: { id: req.params.id } });
  if (!job) return res.status(404).end();
  const filePath = printJobFilePath(job.fileName);
  if (!fs.existsSync(filePath)) return res.status(410).json({ error: 'PDF no longer on disk' });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${job.fileName}"`);
  res.sendFile(filePath);
});

printJobsRouter.post('/:id/retry', async (req, res) => {
  const job = await prisma.printJob.findUnique({ where: { id: req.params.id } });
  if (!job) return res.status(404).json({ error: 'not found' });
  await prisma.printJob.update({ where: { id: job.id }, data: { status: 'QUEUED', error: null } });
  await dispatchPrintJob(job.id);
  const updated = await prisma.printJob.findUnique({ where: { id: job.id } });
  await logActivity('print_job.retry', `${job.labelType} → ${job.tray}`, job.jobId, req.user?.id);
  res.json(updated);
});

printJobsRouter.post('/:id/cancel', async (req, res) => {
  const job = await prisma.printJob.findUnique({ where: { id: req.params.id } });
  if (!job) return res.status(404).json({ error: 'not found' });
  if (!['QUEUED', 'FAILED'].includes(job.status)) {
    return res.status(400).json({ error: `Cannot cancel a job in status ${job.status}` });
  }
  const updated = await prisma.printJob.update({ where: { id: job.id }, data: { status: 'CANCELLED' } });
  res.json(updated);
});

// --- Printer settings (admin only) ---

export const printerSettingsRouter = Router();

printerSettingsRouter.get('/', async (_req, res) => {
  res.json(await getPrinterSettings());
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
