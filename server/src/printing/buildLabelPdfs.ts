import path from 'path';
import fs from 'fs';
import { PDFDocument } from 'pdf-lib';
import { prisma } from '../db';
import { uploadDir } from '../routes/jobs';
import { loadLocationColorMap, LocationColorMap } from '../pdf/locationColors';
import {
  buildCableLabelsPdf,
  buildFixtureLabelsPdf,
  buildPalLabelsPdf,
  buildRackLabelsPdf,
  buildTrussSpikePositionPdf,
  buildTrussSpikeSacnPdf,
  buildTrussSpikeTipPdf,
} from '../pdf/labelRenderers';

export type LabelContentByType = Record<string, unknown[]>;

function expandContent(
  byType: LabelContentByType,
  labelType: string,
  contentJson: string,
  quantity: number
) {
  byType[labelType] = byType[labelType] ?? [];
  const content = JSON.parse(contentJson);
  for (let i = 0; i < quantity; i++) byType[labelType].push(content);
}

/** Expands confirmed queue items + ad hoc labels into per-type content lists (one entry per copy). */
export async function collectConfirmedContent(jobId: string): Promise<LabelContentByType> {
  const [confirmed, adHoc] = await Promise.all([
    prisma.printQueueItem.findMany({ where: { jobId, status: 'CONFIRMED' } }),
    prisma.adHocLabel.findMany({ where: { jobId } }),
  ]);
  const byType: LabelContentByType = {};
  for (const item of confirmed) expandContent(byType, item.labelType, item.contentJson, item.quantity);
  for (const item of adHoc) expandContent(byType, item.labelType, item.contentJson, item.quantity);
  return byType;
}

/**
 * The not-yet-confirmed view of the queue (PENDING items + ad hoc labels) — this is what the
 * "what will actually print" preview renders, since it's what a user is looking at before
 * they've hit either confirm action.
 */
export async function collectPendingContent(jobId: string): Promise<LabelContentByType> {
  const [pending, adHoc] = await Promise.all([
    prisma.printQueueItem.findMany({ where: { jobId, status: 'PENDING' } }),
    prisma.adHocLabel.findMany({ where: { jobId } }),
  ]);
  const byType: LabelContentByType = {};
  for (const item of pending) expandContent(byType, item.labelType, item.contentJson, item.quantity);
  for (const item of adHoc) expandContent(byType, item.labelType, item.contentJson, item.quantity);
  return byType;
}

async function loadJobLogo(jobId: string): Promise<{ bytes: Uint8Array; kind: 'png' | 'jpg' } | undefined> {
  const job = await prisma.job.findUnique({ where: { id: jobId } });
  if (!job?.logoPath) return undefined;
  const ext = path.extname(job.logoPath).toLowerCase();
  const kind = ext === '.png' ? 'png' : ext === '.jpg' || ext === '.jpeg' ? 'jpg' : null;
  const filePath = path.join(uploadDir, job.logoPath);
  if (!kind || !fs.existsSync(filePath)) return undefined;
  return { bytes: fs.readFileSync(filePath), kind };
}

export async function renderLabelType(
  doc: PDFDocument,
  jobId: string,
  labelType: string,
  items: unknown[],
  locationColors: LocationColorMap
): Promise<void> {
  switch (labelType) {
    case 'FIXTURE':
      return buildFixtureLabelsPdf(doc, items as never);
    case 'TRUSS_SPIKE_POSITION':
      return buildTrussSpikePositionPdf(doc, items as never);
    case 'TRUSS_SPIKE_TIP':
      return buildTrussSpikeTipPdf(doc, items as never);
    case 'TRUSS_SPIKE_SACN':
      return buildTrussSpikeSacnPdf(doc, items as never);
    case 'CABLE':
      return buildCableLabelsPdf(doc, items as never);
    case 'PAL':
      return buildPalLabelsPdf(doc, items as never, await loadJobLogo(jobId), locationColors);
    case 'RACK':
      return buildRackLabelsPdf(doc, items as never);
    default:
      throw new Error(`Unknown label type: ${labelType}`);
  }
}

/** One PDF per label type — the unit a print job (and its tray selection) operates on. */
export async function buildPdfPerType(
  jobId: string,
  byType: LabelContentByType
): Promise<{ labelType: string; pdf: Buffer; pages: number }[]> {
  const locationColors = await loadLocationColorMap(jobId);
  const out: { labelType: string; pdf: Buffer; pages: number }[] = [];
  for (const [labelType, items] of Object.entries(byType)) {
    if (items.length === 0) continue;
    const doc = await PDFDocument.create();
    await renderLabelType(doc, jobId, labelType, items, locationColors);
    const pages = doc.getPageCount();
    const bytes = await doc.save();
    out.push({ labelType, pdf: Buffer.from(bytes), pages });
  }
  return out;
}

/** All types combined into a single PDF — used for both the manual download and the live preview. */
export async function buildCombinedPdf(jobId: string, byType: LabelContentByType): Promise<Buffer> {
  const locationColors = await loadLocationColorMap(jobId);
  const doc = await PDFDocument.create();
  for (const [labelType, items] of Object.entries(byType)) {
    if (items.length === 0) continue;
    await renderLabelType(doc, jobId, labelType, items, locationColors);
  }
  return Buffer.from(await doc.save());
}
