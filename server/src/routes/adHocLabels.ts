import { Router } from 'express';
import { prisma, logActivity } from '../db';
import { nextOrderStart } from '../printing/queueOrder';

export const adHocLabelsRouter = Router();

adHocLabelsRouter.get('/:jobId/adhoc-labels', async (req, res) => {
  const items = await prisma.adHocLabel.findMany({
    where: { jobId: req.params.jobId },
    orderBy: { order: 'asc' },
    include: { requestedByCrewProfile: { include: { user: { select: { displayName: true } } } } },
  });
  res.json(
    items.map(({ requestedByCrewProfile, contentJson, ...rest }) => ({
      ...rest,
      content: JSON.parse(contentJson),
      requestedByDisplayName: requestedByCrewProfile?.user.displayName ?? null,
    }))
  );
});

adHocLabelsRouter.post('/:jobId/adhoc-labels', async (req, res) => {
  const { labelType, content, quantity, groupId } = req.body ?? {};
  if (!labelType || !content) return res.status(400).json({ error: 'labelType and content are required' });
  const order = await nextOrderStart(req.params.jobId, labelType);
  const item = await prisma.adHocLabel.create({
    data: {
      jobId: req.params.jobId,
      labelType,
      contentJson: JSON.stringify(content),
      quantity: Number.isFinite(quantity) ? quantity : 1,
      groupId: groupId || null,
      order,
    },
  });
  await logActivity('adhoc_label.create', labelType, req.params.jobId, req.user?.id);
  res.status(201).json({ ...item, content: JSON.parse(item.contentJson) });
});

adHocLabelsRouter.put('/:jobId/adhoc-labels/:id', async (req, res) => {
  const { content, quantity, labelType, excludeFromPrint, groupId } = req.body ?? {};
  const item = await prisma.adHocLabel.update({
    where: { id: req.params.id },
    data: {
      ...(content !== undefined ? { contentJson: JSON.stringify(content) } : {}),
      ...(quantity !== undefined ? { quantity } : {}),
      ...(labelType !== undefined ? { labelType } : {}),
      ...(excludeFromPrint !== undefined ? { excludeFromPrint } : {}),
      ...(groupId !== undefined ? { groupId: groupId || null } : {}),
    },
  });
  res.json({ ...item, content: JSON.parse(item.contentJson) });
});

adHocLabelsRouter.delete('/:jobId/adhoc-labels/:id', async (req, res) => {
  await prisma.adHocLabel.delete({ where: { id: req.params.id } });
  res.status(204).end();
});
