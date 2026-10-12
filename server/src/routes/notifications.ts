import { Router } from 'express';
import { prisma } from '../db';

/**
 * Self-service notifications for the signed-in account - every query is scoped to req.user.id,
 * never a client-supplied id, so this is safe to open to every role (ADMIN/USER/CREW), not just
 * staff. Polled by the sidebar bell in both shells rather than pushed.
 */
export const notificationsRouter = Router();

notificationsRouter.get('/', async (req, res) => {
  const notifications = await prisma.notification.findMany({
    where: { userId: req.user!.id },
    orderBy: { createdAt: 'desc' },
    take: 30,
  });
  res.json(notifications);
});

notificationsRouter.get('/unread-count', async (req, res) => {
  const count = await prisma.notification.count({ where: { userId: req.user!.id, readAt: null } });
  res.json({ count });
});

notificationsRouter.post('/:id/read', async (req, res) => {
  const notification = await prisma.notification.findUnique({ where: { id: req.params.id } });
  if (!notification || notification.userId !== req.user!.id) return res.status(404).json({ error: 'Not found' });
  const updated = await prisma.notification.update({ where: { id: notification.id }, data: { readAt: new Date() } });
  res.json(updated);
});

notificationsRouter.post('/read-all', async (req, res) => {
  await prisma.notification.updateMany({
    where: { userId: req.user!.id, readAt: null },
    data: { readAt: new Date() },
  });
  res.status(204).end();
});
