import path from 'path';
import fs from 'fs';
import { PDFDocument } from 'pdf-lib';
import { LabelType, PAL_AVERY_SHEET } from '@elexprep/shared';
import { prisma } from '../db';
import { uploadDir } from '../routes/jobs';
import { loadLocationColorMap, LocationColorMap } from '../pdf/locationColors';
import { renderLabelTypeGeneric, type LogoImages } from '../pdf/genericRenderer';
import { loadMergedTemplate } from '../routes/labelTemplates';

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
 * shared `order` field rather than simply concatenating queue-then-adhoc - so a manual
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
 * The not-yet-confirmed view of the queue (PENDING items + ad hoc labels) - this is what the
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

function loadLogoFile(logoPath: string | null): { bytes: Uint8Array; kind: 'png' | 'jpg' } | undefined {
  if (!logoPath) return undefined;
  const ext = path.extname(logoPath).toLowerCase();
  const kind = ext === '.png' ? 'png' : ext === '.jpg' || ext === '.jpeg' ? 'jpg' : null;
  const filePath = path.join(uploadDir, logoPath);
  if (!kind || !fs.existsSync(filePath)) return undefined;
  return { bytes: fs.readFileSync(filePath), kind };
}

/** The job's up-to-three logo slots (left/middle/right - see routes/jobs.ts's LOGO_SLOT_FIELDS),
 * embedded as pdf-lib images ready to hand to renderLabelTypeGeneric. Most jobs only ever set
 * the legacy single "middle" slot. */
async function loadJobLogos(doc: PDFDocument, jobId: string): Promise<LogoImages> {
  const job = await prisma.job.findUnique({ where: { id: jobId } });
  if (!job) return {};
  const embed = async (logoPath: string | null) => {
    const file = loadLogoFile(logoPath);
    if (!file) return undefined;
    return file.kind === 'png' ? doc.embedPng(file.bytes) : doc.embedJpg(file.bytes);
  };
  const [left, middle, right] = await Promise.all([
    embed(job.logoPathLeft),
    embed(job.logoPath),
    embed(job.logoPathRight),
  ]);
  return { left, middle, right, scales: { left: job.logoScaleLeft, middle: job.logoScale, right: job.logoScaleRight } };
}

export async function renderLabelType(
  doc: PDFDocument,
  jobId: string,
  labelType: string,
  items: unknown[],
  locationColors: LocationColorMap
): Promise<void> {
  const template = await loadMergedTemplate(jobId, labelType as LabelType);
  if (!template) throw new Error(`Unknown label type: ${labelType}`);
  const logos = template.labelType === 'PAL' ? await loadJobLogos(doc, jobId) : {};
  return renderLabelTypeGeneric(doc, template, items, locationColors, logos);
}

/** One PDF per label type - the unit a print job (and its tray selection) operates on. */
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

/** All types combined into a single PDF - used for both the manual download and the live preview. */
export async function buildCombinedPdf(jobId: string, byType: LabelContentByType): Promise<Buffer> {
  const locationColors = await loadLocationColorMap(jobId);
  const doc = await PDFDocument.create();
  for (const [labelType, items] of Object.entries(byType)) {
    if (items.length === 0) continue;
    await renderLabelType(doc, jobId, labelType, items, locationColors);
  }
  return Buffer.from(await doc.save());
}

/**
 * PAL content collated 4-up onto an Avery 105x148-R sheet (A4 landscape, plain paper + Avery
 * self-adhesive stock) instead of PAL's usual one-per-page direct-to-label-printer output -
 * a separate export for print shops/offices without the dedicated die-cut label printer.
 * Reuses the job's own (possibly customized) PAL template content/logo, swapping only the
 * sheet geometry - see PAL_AVERY_SHEET's own comment for why the same element layout carries
 * over to the physically larger Avery label without needing its own template.
 */
export async function buildPalAverySheetPdf(jobId: string, items: unknown[]): Promise<Buffer> {
  const locationColors = await loadLocationColorMap(jobId);
  const doc = await PDFDocument.create();
  const template = await loadMergedTemplate(jobId, 'PAL');
  const averyTemplate = { ...template, sheet: PAL_AVERY_SHEET };
  const logos = await loadJobLogos(doc, jobId);
  await renderLabelTypeGeneric(doc, averyTemplate, items, locationColors, logos);
  return Buffer.from(await doc.save());
}
