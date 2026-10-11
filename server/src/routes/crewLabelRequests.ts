import { Router } from 'express';
import { prisma, logActivity } from '../db';
import { nextOrderStart } from '../printing/queueOrder';

/**
 * Admin/staff side of a crew member's label request: review, approve (creates the real
 * AdHocLabel, attributed back to the requester), or reject. Open to any signed-in staff
 * account, same as the rest of the ad hoc label surface (routes/adHocLabels.ts) — not
 * admin-only. The crew-facing submission endpoint lives in routes/crewPortal.ts.
 */
export const crewLabelRequestsRouter = Router();

crewLabelRequestsRouter.get('/:jobId/label-requests', async (req, res) => {
  const status = typeof req.query.status === 'string' ? req.query.status : undefined;
  const requests = await prisma.crewLabelRequest.findMany({
    where: { jobId: req.params.jobId, ...(status ? { status } : {}) },
    include: { crewProfile: { include: { user: { select: { displayName: true } } } } },
    orderBy: { createdAt: 'desc' },
  });
  res.json(
    requests.map((r) => ({
      id: r.id,
      jobId: r.jobId,
      labelType: r.labelType,
      content: JSON.parse(r.contentJson),
      quantity: r.quantity,
      status: r.status,
      reviewedAt: r.reviewedAt,
      rejectionNote: r.rejectionNote,
      createdAt: r.createdAt,
      requestedByDisplayName: r.crewProfile.user.displayName,
    }))
  );
});

crewLabelRequestsRouter.post('/:jobId/label-requests/:id/approve', async (req, res) => {
  const request = await prisma.crewLabelRequest.findUnique({ where: { id: req.params.id } });
  if (!request || request.jobId !== req.params.jobId) return res.status(404).json({ error: 'Request not found' });
  if (request.status !== 'PENDING') return res.status(409).json({ error: 'Request has already been reviewed' });

  const order = await nextOrderStart(request.jobId, request.labelType);
  const label = await prisma.$transaction(async (tx) => {
    const created = await tx.adHocLabel.create({
      data: {
        jobId: request.jobId,
        labelType: request.labelType,
        contentJson: request.contentJson,
        quantity: request.quantity,
        order,
        requestedByCrewProfileId: request.crewProfileId,
      },
    });
    await tx.crewLabelRequest.update({
      where: { id: request.id },
      data: { status: 'APPROVED', reviewedAt: new Date(), reviewedBy: req.user?.id },
    });
    return created;
  });
  await logActivity('crew_label_request.approve', request.labelType, request.jobId, req.user?.id);
  res.json({ ...label, content: JSON.parse(label.contentJson) });
});

crewLabelRequestsRouter.post('/:jobId/label-requests/:id/reject', async (req, res) => {
  const { note } = req.body ?? {};
  const request = await prisma.crewLabelRequest.findUnique({ where: { id: req.params.id } });
  if (!request || request.jobId !== req.params.jobId) return res.status(404).json({ error: 'Request not found' });
  if (request.status !== 'PENDING') return res.status(409).json({ error: 'Request has already been reviewed' });

  await prisma.crewLabelRequest.update({
    where: { id: request.id },
    data: { status: 'REJECTED', reviewedAt: new Date(), reviewedBy: req.user?.id, rejectionNote: note || null },
  });
  await logActivity('crew_label_request.reject', request.labelType, request.jobId, req.user?.id);
  res.status(204).end();
});
