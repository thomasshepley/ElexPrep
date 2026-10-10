import 'dotenv/config';
import path from 'path';
import fs from 'fs';
import express, { NextFunction, Request, Response } from 'express';
import 'express-async-errors';
import { Prisma } from '@prisma/client';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import multer from 'multer';
import { authMiddleware } from './auth';
import { authRouter } from './routes/auth';
import { usersRouter } from './routes/users';
import { settingsRouter } from './routes/settings';
import { jobsRouter } from './routes/jobs';
import { fixtureTypeRulesRouter } from './routes/fixtureTypeRules';
import { patchRouter } from './routes/patch';
import { casesRouter } from './routes/cases';
import { adHocLabelsRouter } from './routes/adHocLabels';
import { printQueueRouter } from './routes/printQueue';
import { plotsRouter } from './routes/plots';
import { printJobsRouter, printerSettingsRouter } from './routes/printJobs';
import { agentRouter } from './routes/agent';
import { activityRouter } from './routes/activity';
import { currentRmsRouter, jobCurrentRmsRouter } from './routes/currentRms';
import { restartCurrentRmsPolling } from './currentRms/sync';
import { locationColorRulesRouter, jobLocationColorRulesRouter } from './routes/locationColorRules';
import { permissionsRouter } from './routes/permissions';
import { crewRouter } from './routes/crew';
import { crewPortalRouter } from './routes/crewPortal';
import { jobCrewAssignmentsRouter } from './routes/jobCrewAssignments';
import { seedDefaultLocationColorsIfEmpty, seedNewDefaultLocationColorsIfMissing } from './pdf/locationColors';
import { prisma } from './db';

const app = express();
// CSP is left off: the SPA and its PDF previews/native viewers are all served same-origin
// with no external resources, so the main risk it guards against doesn't apply here, and a
// misconfigured policy is more likely to break a page (iframe/PDF embeds) than help.
// HSTS is left off too: the default deployment here is plain HTTP on a LAN/home box (see
// DEPLOY.md), and HSTS over plain HTTP just teaches the browser to refuse to reconnect.
// A TLS-terminating reverse proxy (Caddy/nginx/Traefik) is the right place to add it.
app.use(helmet({ contentSecurityPolicy: false, hsts: false }));
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '10mb' }));
app.use(cookieParser());
app.use(authMiddleware);

app.get('/api/health', (_req, res) => res.json({ ok: true }));

app.use('/api/auth', authRouter);
app.use('/api/users', usersRouter);
app.use('/api/settings', settingsRouter);
app.use('/api/jobs', jobsRouter);
app.use('/api/fixture-type-rules', fixtureTypeRulesRouter);
app.use('/api/location-color-rules', locationColorRulesRouter);
app.use('/api/jobs', patchRouter);
app.use('/api/jobs', casesRouter);
app.use('/api/jobs', adHocLabelsRouter);
app.use('/api/jobs', printQueueRouter);
app.use('/api/jobs', plotsRouter);
app.use('/api/jobs', jobCurrentRmsRouter);
app.use('/api/jobs', jobLocationColorRulesRouter);
app.use('/api/jobs', jobCrewAssignmentsRouter);
// crewPortalRouter (self-service, CREW-only) is mounted before the admin-only crewRouter at
// the same prefix so its specific /me* paths are tried first; anything it doesn't match
// (the bare roster list/CRUD) falls through to crewRouter unchanged.
app.use('/api/crew', crewPortalRouter);
app.use('/api/crew', crewRouter);
app.use('/api/current-rms', currentRmsRouter);
app.use('/api/print-jobs', printJobsRouter);
app.use('/api/printer-settings', printerSettingsRouter);
app.use('/api/agent', agentRouter);
app.use('/api/activity', activityRouter);
app.use('/api/permissions', permissionsRouter);

// In production (Docker) the server also serves the built web app; in dev the Vite dev
// server proxies /api here instead. WEB_DIST can point anywhere; default is web/dist.
const webDist = process.env.WEB_DIST
  ? path.resolve(process.env.WEB_DIST)
  : path.join(__dirname, '..', '..', 'web', 'dist');
if (fs.existsSync(path.join(webDist, 'index.html'))) {
  app.use(express.static(webDist));
  app.get(/^(?!\/api\/).*/, (_req, res) => res.sendFile(path.join(webDist, 'index.html')));
  console.log(`Serving web UI from ${webDist}`);
}

// Catches errors thrown/rejected anywhere in a route (express-async-errors forwards them
// here instead of the default Express 4 behavior of hanging the request). Prisma's known
// error codes get a proper status instead of a generic 500.
app.use((err: unknown, req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'Not found' });
    if (err.code === 'P2002') return res.status(409).json({ error: 'Already exists' });
  }
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: 'File is too large' });
    return res.status(400).json({ error: err.message });
  }
  console.error(`Unhandled error on ${req.method} ${req.path}:`, err);
  res.status(500).json({ error: 'Internal server error' });
});

const port = Number(process.env.PORT ?? 4000);
const server = app.listen(port, '0.0.0.0', () => {
  console.log(`ElexPrep server listening on http://localhost:${port}`);
});

// docker compose stop/restart sends SIGTERM: stop accepting new connections and close the
// Prisma connection cleanly instead of letting the process die mid-request.
function shutdown(signal: string) {
  console.log(`${signal} received, shutting down`);
  server.close(() => {
    prisma.$disconnect().finally(() => process.exit(0));
  });
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

restartCurrentRmsPolling().catch((err) => console.error('Could not start Current RMS polling:', err));
seedDefaultLocationColorsIfEmpty().catch((err) => console.error('Could not seed location colors:', err));
seedNewDefaultLocationColorsIfMissing(['Spare', 'Rigging']).catch((err) =>
  console.error('Could not top up new default location colors:', err)
);
