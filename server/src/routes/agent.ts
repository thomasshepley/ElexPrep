import crypto from 'crypto';
import { NextFunction, Request, Response, Router } from 'express';
import rateLimit from 'express-rate-limit';
import fs from 'fs';
import { prisma, logActivity } from '../db';
import { getPrinterSettings } from '../printing/printerSettings';
import { printJobFilePath } from '../printing/printJobService';

/**
 * Endpoints for the Windows print agent (agent/ in this repo). The agent is not a browser
 * session - it authenticates with the static token from Printer Settings via the
 * X-Agent-Token header.
 */
export const agentRouter = Router();

// Same rationale as the login rate limiter (routes/auth.ts) - this is a 192-bit random token
// (see generateAgentToken), so brute force is already infeasible, but a public-facing route
// with no limiter at all still invites being hammered.
const agentAuthLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many attempts - wait a while and try again' },
});

/** Constant-time comparison - a plain !== leaks how many leading bytes matched through
 * response timing, which a standard token comparison should just never do regardless of how
 * impractical exploiting it would be here. */
function tokensMatch(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

async function agentAuth(req: Request, res: Response, next: NextFunction) {
  const settings = await getPrinterSettings();
  const token = req.header('x-agent-token');
  if (!settings.agent.token || !token || !tokensMatch(token, settings.agent.token)) {
    return res.status(401).json({ error: 'Invalid agent token' });
  }
  next();
}

agentRouter.use(agentAuthLimiter, agentAuth);

/** The agent polls this; atomically claims the oldest QUEUED job so two agents can't double-print. */
agentRouter.post('/print-jobs/claim', async (_req, res) => {
  const settings = await getPrinterSettings();
  const next = await prisma.printJob.findFirst({
    where: { status: 'QUEUED', method: 'AGENT' },
    orderBy: { createdAt: 'asc' },
  });
  if (!next) return res.json({ job: null });
  const claimed = await prisma.printJob.updateMany({
    where: { id: next.id, status: 'QUEUED' },
    data: { status: 'CLAIMED' },
  });
  if (claimed.count === 0) return res.json({ job: null }); // raced another agent; caller just polls again
  const tray = settings.trays[next.tray as keyof typeof settings.trays];
  res.json({
    job: {
      id: next.id,
      labelType: next.labelType,
      pages: next.pages,
      printerName: settings.agent.printerName,
      bin: tray?.bin ?? '',
    },
  });
});

agentRouter.get('/print-jobs/:id/pdf', async (req, res) => {
  const job = await prisma.printJob.findUnique({ where: { id: req.params.id } });
  if (!job) return res.status(404).end();
  const filePath = printJobFilePath(job.fileName);
  if (!fs.existsSync(filePath)) return res.status(410).json({ error: 'PDF no longer on disk' });
  res.setHeader('Content-Type', 'application/pdf');
  res.sendFile(filePath);
});

agentRouter.post('/print-jobs/:id/complete', async (req, res) => {
  const { ok, error } = req.body ?? {};
  const job = await prisma.printJob.findUnique({ where: { id: req.params.id } });
  if (!job) return res.status(404).json({ error: 'not found' });
  const updated = await prisma.printJob.update({
    where: { id: job.id },
    data: ok ? { status: 'DONE', error: null } : { status: 'FAILED', error: error ?? 'Agent reported failure' },
  });
  await logActivity(
    ok ? 'print_job.printed' : 'print_job.failed',
    `${job.labelType} → ${job.tray}${ok ? '' : `: ${error ?? 'unknown error'}`}`,
    job.jobId
  );
  res.json(updated);
});
