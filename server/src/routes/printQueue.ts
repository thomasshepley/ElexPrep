import { Router } from 'express';
import { prisma, logActivity } from '../db';
import { MAX_COPIES_WITHOUT_OVERRIDE } from '../constants';
import { buildCombinedPdf, buildPalAverySheetPdf, collectConfirmedContent, collectPendingContent } from '../printing/buildLabelPdfs';
import { createPrintJobs } from '../printing/printJobService';
import { getPrinterSettings } from '../printing/printerSettings';
import { nextOrderStart } from '../printing/queueOrder';

export const printQueueRouter = Router();

printQueueRouter.get('/:jobId/printer-config', async (_req, res) => {
  const settings = await getPrinterSettings();
  const trayMap: Record<string, string> = {};
  for (const [labelType, trayKey] of Object.entries(settings.typeToTray)) {
    trayMap[labelType] = settings.trays[trayKey]?.label ?? trayKey;
  }
  res.json({ printer: settings.agent.printerName, trayMap, method: settings.method });
});

printQueueRouter.post('/:jobId/print-queue/build', async (req, res) => {
  const { jobId } = req.params;
  const includeFixtureLabels = req.body?.includeFixtureLabels ?? true;
  const includePalLabels = req.body?.includePalLabels ?? true;

  await prisma.printQueueItem.deleteMany({
    where: { jobId, sourceType: { in: ['FIXTURE', 'CASE'] }, status: 'PENDING' },
  });

  const created: string[] = [];

  if (includeFixtureLabels) {
    const fixtures = await prisma.fixture.findMany({ where: { jobId } });
    let order = await nextOrderStart(jobId, 'FIXTURE');
    for (const f of fixtures) {
      const item = await prisma.printQueueItem.create({
        data: {
          jobId,
          labelType: 'FIXTURE',
          sourceType: 'FIXTURE',
          sourceId: f.id,
          contentJson: JSON.stringify({
            address: f.address,
            mainUniverse: f.mainUniverse,
            mainAddress: f.mainAddress,
            pixUniverse: f.pixUniverse,
            pixAddress: f.pixAddress,
            mode: f.mode,
            location: f.location,
          }),
          quantity: 1,
          order: order++,
        },
      });
      created.push(item.id);
    }
  }

  if (includePalLabels) {
    const cases = await prisma.caseGroupRecord.findMany({ where: { jobId } });
    let order = await nextOrderStart(jobId, 'PAL');
    for (const c of cases) {
      const item = await prisma.printQueueItem.create({
        data: {
          jobId,
          labelType: 'PAL',
          sourceType: 'CASE',
          sourceId: c.id,
          contentJson: JSON.stringify({
            location: c.location ?? '',
            title: c.fixtureType,
            subtitle: c.label,
          }),
          quantity: 1,
          order: order++,
        },
      });
      created.push(item.id);
    }
  }

  await logActivity('print_queue.build', `${created.length} items`, jobId, req.user?.id);
  res.json({ created: created.length });
});

printQueueRouter.get('/:jobId/print-queue', async (req, res) => {
  const { jobId } = req.params;
  const [queue, adHoc] = await Promise.all([
    prisma.printQueueItem.findMany({ where: { jobId }, orderBy: { order: 'asc' } }),
    prisma.adHocLabel.findMany({ where: { jobId }, orderBy: { order: 'asc' } }),
  ]);
  res.json({
    queue: queue.map((q) => ({ ...q, content: JSON.parse(q.contentJson) })),
    adHoc: adHoc.map((a) => ({ ...a, content: JSON.parse(a.contentJson) })),
  });
});

/**
 * Bulk-reorders items within one label type's print-run sequence - the shared `order` field
 * spans both PrintQueueItem and AdHocLabel rows, so dragging an ad hoc label above/below a
 * patch-sourced item (or vice versa) is a single write across both tables, not two separate
 * per-table operations.
 */
printQueueRouter.put('/:jobId/print-queue/reorder', async (req, res) => {
  const { labelType, items } = req.body ?? {};
  if (!labelType || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'labelType and a non-empty items array are required' });
  }
  for (const entry of items) {
    if (!entry || (entry.source !== 'queue' && entry.source !== 'adhoc') || !entry.id) {
      return res.status(400).json({ error: 'each item must be { source: "queue"|"adhoc", id }' });
    }
  }
  const { jobId } = req.params;
  await prisma.$transaction(
    items.map((entry: { source: 'queue' | 'adhoc'; id: string }, index: number) =>
      entry.source === 'queue'
        ? prisma.printQueueItem.updateMany({ where: { id: entry.id, jobId, labelType }, data: { order: index } })
        : prisma.adHocLabel.updateMany({ where: { id: entry.id, jobId, labelType }, data: { order: index } })
    )
  );
  res.json({ reordered: items.length });
});

/**
 * Renders the current PENDING queue + ad hoc labels - i.e. exactly what "Confirm & send to
 * printer" / "Confirm & download PDF" are about to act on - as an actual PDF, so the browser
 * shows the real print output (colors, logo, layout) rather than a text summary. Read-only:
 * no status changes, safe to hit on every edit.
 */
printQueueRouter.get('/:jobId/print-queue/preview.pdf', async (req, res) => {
  const { jobId } = req.params;
  const byType = await collectPendingContent(jobId);
  const total = Object.values(byType).reduce((n, items) => n + items.length, 0);
  if (total === 0) {
    return res.status(400).json({ error: 'Nothing queued to preview yet' });
  }
  const pdf = await buildCombinedPdf(jobId, byType);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', 'inline; filename="preview.pdf"');
  res.send(pdf);
});

/**
 * PAL labels collated 4-up onto an Avery 105x148-R sheet (A4 landscape) instead of PAL's
 * usual one-per-page direct-to-label-printer layout - for printing on plain paper with Avery
 * self-adhesive stock through an ordinary office printer. Reads the currently-queued PAL
 * items (pending + ad hoc, same source as the live preview) rather than requiring them to be
 * confirmed first, and doesn't touch queue status - this is a separate export, not part of
 * the confirm/send-to-printer lifecycle.
 */
printQueueRouter.get('/:jobId/print-queue/pal/avery.pdf', async (req, res) => {
  const { jobId } = req.params;
  const byType = await collectPendingContent(jobId);
  const items = byType.PAL ?? [];
  if (items.length === 0) {
    return res.status(400).json({ error: 'No PAL labels queued yet' });
  }
  const pdf = await buildPalAverySheetPdf(jobId, items);
  await logActivity('print_queue.pal_avery_pdf_generated', `${items.length} PAL label(s)`, jobId, req.user?.id);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', 'attachment; filename="pal-labels-avery-105x148.pdf"');
  res.send(pdf);
});

printQueueRouter.put('/:jobId/print-queue/:id', async (req, res) => {
  const { quantity, content } = req.body ?? {};
  const item = await prisma.printQueueItem.update({
    where: { id: req.params.id },
    data: {
      ...(quantity !== undefined ? { quantity } : {}),
      ...(content !== undefined ? { contentJson: JSON.stringify(content) } : {}),
    },
  });
  res.json({ ...item, content: JSON.parse(item.contentJson) });
});

printQueueRouter.delete('/:jobId/print-queue/:id', async (req, res) => {
  await prisma.printQueueItem.delete({ where: { id: req.params.id } });
  res.status(204).end();
});

printQueueRouter.post('/:jobId/print-queue/confirm', async (req, res) => {
  const { ids, override } = req.body ?? {};
  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ error: 'ids array is required' });
  }
  const items = await prisma.printQueueItem.findMany({ where: { id: { in: ids } } });
  const overLimit = items.filter((i) => i.quantity > MAX_COPIES_WITHOUT_OVERRIDE);
  if (overLimit.length && !override) {
    return res.status(409).json({
      error: 'Some items exceed the per-label copy safety cap; confirm again with override:true if intentional',
      maxCopies: MAX_COPIES_WITHOUT_OVERRIDE,
      overLimit: overLimit.map((i) => ({ id: i.id, quantity: i.quantity })),
    });
  }
  await prisma.printQueueItem.updateMany({ where: { id: { in: ids } }, data: { status: 'CONFIRMED' } });
  await logActivity('print_queue.confirm', `${ids.length} items`, req.params.jobId, req.user?.id);
  res.json({ confirmed: ids.length });
});

printQueueRouter.get('/:jobId/print-queue/pdf', async (req, res) => {
  const { jobId } = req.params;
  const byType = await collectConfirmedContent(jobId);
  const total = Object.values(byType).reduce((n, items) => n + items.length, 0);
  if (total === 0) {
    return res.status(400).json({ error: 'Nothing confirmed to print yet' });
  }

  const pdf = await buildCombinedPdf(jobId, byType);

  await prisma.printQueueItem.updateMany({
    where: { jobId, status: 'CONFIRMED' },
    data: { status: 'PRINTED' },
  });
  await logActivity('print_queue.pdf_generated', `${total} label entries`, jobId, req.user?.id);

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="job-${jobId}-labels.pdf"`);
  res.send(pdf);
});

/** Sends everything confirmed to the printer as tray-routed print jobs (one per label type). */
printQueueRouter.post('/:jobId/print-queue/send', async (req, res) => {
  try {
    const jobs = await createPrintJobs(req.params.jobId, req.user?.id);
    res.json({ printJobs: jobs });
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});
