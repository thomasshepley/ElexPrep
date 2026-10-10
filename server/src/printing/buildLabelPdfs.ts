import path from 'path';
import fs from 'fs';
import { PDFDocument } from 'pdf-lib';
import { DEFAULT_LABEL_TEMPLATES, LabelType } from '@elexprep/shared';
import { prisma } from '../db';
import { uploadDir } from '../routes/jobs';
import { loadLocationColorMap, LocationColorMap } from '../pdf/locationColors';
import { renderLabelTypeGeneric } from '../pdf/genericRenderer';

export type LabelContentByType = Record<string, unknown[]>;

interface OrderedRow {
  labelType: string;
  order: number;
  contentJson: string;
  quantity: number;
}

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

/**
 * Combines queue items + ad hoc labels into one ordered list per label type, sorted by the
 * shared `order` field rather than simply concatenating queue-then-adhoc — so a manual
 * reorder (which writes `order` across both sources in the same per-type sequence) is
 * respected when building the actual print PDF, not just whatever order the two tables
 * happen to return rows in.
 */
function buildOrderedByType(rows: OrderedRow[]): LabelContentByType {
  const sorted = [...rows].sort((a, b) => a.order - b.order);
  const byType: LabelContentByType = {};
  for (const row of sorted) expandContent(byType, row.labelType, row.contentJson, row.quantity);
  return byType;
}

/** Expands confirmed queue items + ad hoc labels into per-type content lists (one entry per copy). */
export async function collectConfirmedContent(jobId: string): Promise<LabelContentByType> {
  const [confirmed, adHoc] = await Promise.all([
    prisma.printQueueItem.findMany({ where: { jobId, status: 'CONFIRMED' } }),
    prisma.adHocLabel.findMany({ where: { jobId, excludeFromPrint: false } }),
  ]);
  return buildOrderedByType([...confirmed, ...adHoc]);
}

/**
 * The not-yet-confirmed view of the queue (PENDING items + ad hoc labels) — this is what the
 * "what will actually print" preview renders, since it's what a user is looking at before
 * they've hit either confirm action.
 */
export async function collectPendingContent(jobId: string): Promise<LabelContentByType> {
  const [pending, adHoc] = await Promise.all([
    prisma.printQueueItem.findMany({ where: { jobId, status: 'PENDING' } }),
    prisma.adHocLabel.findMany({ where: { jobId, excludeFromPrint: false } }),
  ]);
  return buildOrderedByType([...pending, ...adHoc]);
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
  const template = DEFAULT_LABEL_TEMPLATES[labelType as LabelType];
  if (!template) throw new Error(`Unknown label type: ${labelType}`);
  const logo = template.labelType === 'PAL' ? await loadJobLogo(jobId) : undefined;
  const logoImage = logo ? await (logo.kind === 'png' ? doc.embedPng(logo.bytes) : doc.embedJpg(logo.bytes)) : undefined;
  return renderLabelTypeGeneric(doc, template, items, locationColors, logoImage);
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
