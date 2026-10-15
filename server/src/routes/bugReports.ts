import { Router } from 'express';
import { prisma } from '../db';
import { requireRole } from '../auth';

/**
 * "Submit a bug" - any signed-in account can file one (POST), capturing the page they were on,
 * basic device info, a rolling trail of their last few clicks, and whatever notes they typed.
 * Reporter identity is pulled from req.user, never trusted from the client body. Reading the
 * list back is WEBMASTER-only (see routes/auth.ts's Role comment) - not even ADMIN can see
 * these; there is no staff-facing surface for this data at all besides the Webmaster page.
 */
export const bugReportsRouter = Router();

const MAX_ACTIONS = 15;

bugReportsRouter.post('/', async (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Not signed in' });
  const { pageUrl, pageTitle, userAgent, viewportWidth, viewportHeight, recentActions, notes } = req.body ?? {};
  if (!pageUrl || typeof pageUrl !== 'string') return res.status(400).json({ error: 'pageUrl is required' });

  const actions = Array.isArray(recentActions) ? recentActions.slice(-MAX_ACTIONS) : [];

  await prisma.bugReport.create({
    data: {
      userId: req.user.id,
      reporterName: req.user.displayName,
      reporterRole: req.user.role,
      pageUrl,
      pageTitle: typeof pageTitle === 'string' ? pageTitle : null,
      userAgent: typeof userAgent === 'string' ? userAgent : null,
      viewportWidth: Number.isFinite(viewportWidth) ? viewportWidth : null,
      viewportHeight: Number.isFinite(viewportHeight) ? viewportHeight : null,
      recentActionsJson: JSON.stringify(actions),
      notes: typeof notes === 'string' && notes.trim() ? notes.trim() : null,
    },
  });
  res.status(201).json({ ok: true });
});

bugReportsRouter.get('/', requireRole('WEBMASTER'), async (_req, res) => {
  const reports = await prisma.bugReport.findMany({ orderBy: { createdAt: 'desc' } });
  res.json(
    reports.map((r) => ({
      id: r.id,
      reporterName: r.reporterName,
      reporterRole: r.reporterRole,
      pageUrl: r.pageUrl,
      pageTitle: r.pageTitle,
      userAgent: r.userAgent,
      viewportWidth: r.viewportWidth,
      viewportHeight: r.viewportHeight,
      recentActions: r.recentActionsJson ? JSON.parse(r.recentActionsJson) : [],
      notes: r.notes,
      createdAt: r.createdAt.toISOString(),
    }))
  );
});

bugReportsRouter.delete('/:id', requireRole('WEBMASTER'), async (req, res) => {
  await prisma.bugReport.deleteMany({ where: { id: req.params.id } });
  res.status(204).end();
});
