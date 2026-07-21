import { Router } from 'express';
import path from 'path';
import fs from 'fs';
import { PDFDocument } from 'pdf-lib';
import { prisma, logActivity } from '../db';
import { uploadDir } from './jobs';
import { MAX_COPIES_WITHOUT_OVERRIDE, PRINTER_TRAY_MAP } from '../constants';
import {
  buildCableLabelsPdf,
  buildFixtureLabelsPdf,
  buildPalLabelsPdf,
  buildRackLabelsPdf,
  buildTrussSpikePositionPdf,
  buildTrussSpikeSacnPdf,
  buildTrussSpikeTipPdf,
} from '../pdf/labelRenderers';

export const printQueueRouter = Router();

printQueueRouter.get('/:jobId/printer-config', (_req, res) => {
  res.json({ printer: 'Develop ineo+ 3320i', trayMap: PRINTER_TRAY_MAP });
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
          }),
          quantity: 1,
        },
      });
      created.push(item.id);
    }
  }

  if (includePalLabels) {
    const cases = await prisma.caseGroupRecord.findMany({ where: { jobId } });
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
    prisma.printQueueItem.findMany({ where: { jobId }, orderBy: { createdAt: 'asc' } }),
    prisma.adHocLabel.findMany({ where: { jobId }, orderBy: { createdAt: 'asc' } }),
  ]);
  res.json({
    queue: queue.map((q) => ({ ...q, content: JSON.parse(q.contentJson) })),
    adHoc: adHoc.map((a) => ({ ...a, content: JSON.parse(a.contentJson) })),
  });
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
  const [job, confirmed, adHoc] = await Promise.all([
    prisma.job.findUnique({ where: { id: jobId } }),
    prisma.printQueueItem.findMany({ where: { jobId, status: 'CONFIRMED' } }),
    prisma.adHocLabel.findMany({ where: { jobId } }),
  ]);

  if (confirmed.length === 0 && adHoc.length === 0) {
    return res.status(400).json({ error: 'Nothing confirmed to print yet' });
  }

  const byType: Record<string, unknown[]> = {};
  const expand = (labelType: string, content: unknown, quantity: number) => {
    byType[labelType] = byType[labelType] ?? [];
    for (let i = 0; i < quantity; i++) byType[labelType].push(content);
  };
  for (const item of confirmed) {
    expand(item.labelType, JSON.parse(item.contentJson), item.quantity);
  }
  for (const item of adHoc) {
    expand(item.labelType, JSON.parse(item.contentJson), item.quantity);
  }

  const doc = await PDFDocument.create();
  if (byType.FIXTURE) await buildFixtureLabelsPdf(doc, byType.FIXTURE as never);
  if (byType.TRUSS_SPIKE_POSITION) await buildTrussSpikePositionPdf(doc, byType.TRUSS_SPIKE_POSITION as never);
  if (byType.TRUSS_SPIKE_TIP) await buildTrussSpikeTipPdf(doc, byType.TRUSS_SPIKE_TIP as never);
  if (byType.TRUSS_SPIKE_SACN) await buildTrussSpikeSacnPdf(doc, byType.TRUSS_SPIKE_SACN as never);
  if (byType.CABLE) await buildCableLabelsPdf(doc, byType.CABLE as never);
  if (byType.PAL) {
    let logo: { bytes: Uint8Array; kind: 'png' | 'jpg' } | undefined;
    if (job?.logoPath) {
      const ext = path.extname(job.logoPath).toLowerCase();
      const kind = ext === '.png' ? 'png' : ext === '.jpg' || ext === '.jpeg' ? 'jpg' : null;
      const filePath = path.join(uploadDir, job.logoPath);
      if (kind && fs.existsSync(filePath)) {
        logo = { bytes: fs.readFileSync(filePath), kind };
      }
    }
    await buildPalLabelsPdf(doc, byType.PAL as never, logo);
  }
  if (byType.RACK) await buildRackLabelsPdf(doc, byType.RACK as never);

  const bytes = await doc.save();

  await prisma.printQueueItem.updateMany({
    where: { jobId, status: 'CONFIRMED' },
    data: { status: 'PRINTED' },
  });
  await logActivity('print_queue.pdf_generated', `${confirmed.length + adHoc.length} label entries`, jobId, req.user?.id);

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="job-${jobId}-labels.pdf"`);
  res.send(Buffer.from(bytes));
});
