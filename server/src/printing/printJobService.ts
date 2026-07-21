import path from 'path';
import fs from 'fs';
import { prisma, logActivity } from '../db';
import { sendPdfDirect } from './direct9100';
import { getPrinterSettings, PrinterSettings } from './printerSettings';
import { buildPdfPerType, collectConfirmedContent } from './buildLabelPdfs';

import { uploadDir } from '../routes/jobs';

export const printJobsDir = path.join(uploadDir, 'print-jobs');
fs.mkdirSync(printJobsDir, { recursive: true });

export function printJobFilePath(fileName: string): string {
  return path.join(printJobsDir, fileName);
}

/**
 * Turns everything confirmed (plus ad hoc labels) into one PrintJob per label type,
 * each tagged with the tray it must print from, then dispatches per the configured method:
 * DRY_RUN marks jobs SENT without touching hardware, DIRECT_9100 streams PJL-wrapped PDF
 * to the printer's raw port, AGENT leaves jobs QUEUED for the Windows agent to collect.
 */
export async function createPrintJobs(jobId: string, userId?: string) {
  const settings = await getPrinterSettings();
  const byType = await collectConfirmedContent(jobId);
  const pdfs = await buildPdfPerType(jobId, byType);
  if (pdfs.length === 0) {
    throw new Error('Nothing confirmed to print — confirm items in the print queue first');
  }

  const created = [];
  for (const { labelType, pdf, pages } of pdfs) {
    const trayKey = settings.typeToTray[labelType] ?? 'BYPASS';
    const fileName = `${jobId}-${labelType}-${Date.now()}.pdf`;
    fs.writeFileSync(printJobFilePath(fileName), pdf);
    const job = await prisma.printJob.create({
      data: { jobId, labelType, tray: trayKey, fileName, method: settings.method, pages },
    });
    created.push(job);
  }

  await prisma.printQueueItem.updateMany({
    where: { jobId, status: 'CONFIRMED' },
    data: { status: 'PRINTED' },
  });

  for (const job of created) {
    await dispatchPrintJob(job.id, settings);
  }

  await logActivity('print_jobs.create', `${created.length} jobs (${settings.method})`, jobId, userId);
  return prisma.printJob.findMany({ where: { id: { in: created.map((j) => j.id) } } });
}

export async function dispatchPrintJob(printJobId: string, settings?: PrinterSettings) {
  const s = settings ?? (await getPrinterSettings());
  const job = await prisma.printJob.findUnique({ where: { id: printJobId } });
  if (!job) return;

  if (s.method === 'AGENT') return; // stays QUEUED until the agent claims it

  if (s.method === 'DRY_RUN') {
    await prisma.printJob.update({
      where: { id: job.id },
      data: { status: 'SENT', error: null, method: 'DRY_RUN' },
    });
    return;
  }

  // DIRECT_9100
  if (!s.direct.host) {
    await prisma.printJob.update({
      where: { id: job.id },
      data: { status: 'FAILED', error: 'No printer IP configured in Printer Settings' },
    });
    return;
  }
  const tray = s.trays[job.tray as keyof typeof s.trays];
  try {
    const pdf = fs.readFileSync(printJobFilePath(job.fileName));
    await sendPdfDirect(s.direct.host, s.direct.port, pdf, {
      mediaSource: tray?.pjl ?? 'AUTO',
      jobName: `ElexPrep ${job.labelType}`,
    });
    await prisma.printJob.update({
      where: { id: job.id },
      data: { status: 'SENT', error: null, method: 'DIRECT_9100' },
    });
  } catch (err) {
    await prisma.printJob.update({
      where: { id: job.id },
      data: { status: 'FAILED', error: (err as Error).message },
    });
  }
}
