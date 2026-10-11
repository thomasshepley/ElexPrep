import { Router } from 'express';
import { prisma, logActivity } from '../db';
import { DEFAULT_LABEL_TEMPLATES, LabelType, LabelElementDef, LabelTypeTemplate, mergeTemplate } from '@elexprep/shared';

/**
 * Loads a job's effective template for a label type (default merged with its override, if
 * any) — the single source of truth both this route's GET and the actual PDF renderer
 * (buildLabelPdfs.ts) use, so a "customize layout" edit in the print-queue editor changes the
 * real printed output, not just what the editor's own preview shows.
 */
export async function loadMergedTemplate(jobId: string, labelType: LabelType): Promise<LabelTypeTemplate> {
  const base = DEFAULT_LABEL_TEMPLATES[labelType];
  const row = await prisma.labelTemplate.findUnique({ where: { jobId_labelType: { jobId, labelType } } });
  if (!row) return base;
  const overrides = JSON.parse(row.elementsJson) as Record<string, Partial<LabelElementDef>>;
  return mergeTemplate(base, overrides);
}

/**
 * Per-job label layout overrides — the data side of the print-queue editor's "customize
 * layout" mode. A job with no override row just gets the default template back; PUT writes a
 * partial, per-element-id patch (never a whole-template replacement) so a default element
 * introduced later still reaches jobs that already customized this label type, per the data
 * model decided in the ELEX Portal plan.
 */
export const labelTemplatesRouter = Router();

const LABEL_TYPES = Object.keys(DEFAULT_LABEL_TEMPLATES) as LabelType[];

function isLabelType(value: string): value is LabelType {
  return (LABEL_TYPES as string[]).includes(value);
}

labelTemplatesRouter.get('/:jobId/label-templates/:labelType', async (req, res) => {
  const { jobId, labelType } = req.params;
  if (!isLabelType(labelType)) return res.status(400).json({ error: 'Unknown label type' });

  const row = await prisma.labelTemplate.findUnique({ where: { jobId_labelType: { jobId, labelType } } });
  const template = await loadMergedTemplate(jobId, labelType);
  res.json({ template, isCustomized: Boolean(row) });
});

labelTemplatesRouter.put('/:jobId/label-templates/:labelType', async (req, res) => {
  const { jobId, labelType } = req.params;
  if (!isLabelType(labelType)) return res.status(400).json({ error: 'Unknown label type' });
  const { elements } = req.body ?? {};
  if (!elements || typeof elements !== 'object') {
    return res.status(400).json({ error: 'elements (a map of elementId -> partial element patch) is required' });
  }

  const base = DEFAULT_LABEL_TEMPLATES[labelType];
  const validIds = new Set(base.elements.map((el) => el.id));
  for (const id of Object.keys(elements)) {
    if (!validIds.has(id)) return res.status(400).json({ error: `Unknown element id "${id}" for ${labelType}` });
  }

  await prisma.labelTemplate.upsert({
    where: { jobId_labelType: { jobId, labelType } },
    create: { jobId, labelType, elementsJson: JSON.stringify(elements) },
    update: { elementsJson: JSON.stringify(elements) },
  });
  await logActivity('label_template.update', labelType, jobId, req.user?.id);
  res.json({ template: mergeTemplate(base, elements), isCustomized: true });
});

labelTemplatesRouter.delete('/:jobId/label-templates/:labelType', async (req, res) => {
  const { jobId, labelType } = req.params;
  if (!isLabelType(labelType)) return res.status(400).json({ error: 'Unknown label type' });
  await prisma.labelTemplate.deleteMany({ where: { jobId, labelType } });
  await logActivity('label_template.reset', labelType, jobId, req.user?.id);
  res.json({ template: DEFAULT_LABEL_TEMPLATES[labelType], isCustomized: false });
});
