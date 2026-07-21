import { Router } from 'express';
import { prisma, logActivity } from '../db';

export const adHocLabelsRouter = Router();

adHocLabelsRouter.get('/:jobId/adhoc-labels', async (req, res) => {
  const items = await prisma.adHocLabel.findMany({ where: { jobId: req.params.jobId } });
  res.json(items.map((i) => ({ ...i, content: JSON.parse(i.contentJson) })));
});

adHocLabelsRouter.post('/:jobId/adhoc-labels', async (req, res) => {
  const { labelType, content, quantity } = req.body ?? {};
  if (!labelType || !content) return res.status(400).json({ error: 'labelType and content are required' });
  const item = await prisma.adHocLabel.create({
    data: {
      jobId: req.params.jobId,
      labelType,
      contentJson: JSON.stringify(content),
      quantity: Number.isFinite(quantity) ? quantity : 1,
    },
  });
  await logActivity('adhoc_label.create', labelType, req.params.jobId);
  res.status(201).json({ ...item, content: JSON.parse(item.contentJson) });
});

adHocLabelsRouter.put('/:jobId/adhoc-labels/:id', async (req, res) => {
  const { content, quantity, labelType } = req.body ?? {};
  const item = await prisma.adHocLabel.update({
    where: { id: req.params.id },
    data: {
      ...(content !== undefined ? { contentJson: JSON.stringify(content) } : {}),
      ...(quantity !== undefined ? { quantity } : {}),
      ...(labelType !== undefined ? { labelType } : {}),
    },
  });
  res.json({ ...item, content: JSON.parse(item.contentJson) });
});

adHocLabelsRouter.delete('/:jobId/adhoc-labels/:id', async (req, res) => {
  await prisma.adHocLabel.delete({ where: { id: req.params.id } });
  res.status(204).end();
});
