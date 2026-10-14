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
import { getVersionInfo } from './version';
import { requestContextMiddleware } from './requestContext';
import { authRouter } from './routes/auth';
import { twoFactorRouter } from './routes/twoFactor';
import { usersRouter } from './routes/users';
import { settingsRouter } from './routes/settings';
import { jobsRouter } from './routes/jobs';
import { fixtureTypeRulesRouter } from './routes/fixtureTypeRules';
import { patchRouter } from './routes/patch';
import { casesRouter } from './routes/cases';
import { fixtureGroupsRouter } from './routes/fixtureGroups';
import { adHocLabelsRouter } from './routes/adHocLabels';
import { crewLabelRequestsRouter } from './routes/crewLabelRequests';
import { printQueueRouter } from './routes/printQueue';
import { plotsRouter } from './routes/plots';
import { printJobsRouter, printerSettingsRouter } from './routes/printJobs';
import { agentRouter } from './routes/agent';
import { activityRouter } from './routes/activity';
import { currentRmsRouter, jobCurrentRmsRouter } from './routes/currentRms';
import { oneDriveRouter, jobOneDriveRouter } from './routes/oneDrive';
import { portalSettingsRouter } from './routes/portalSettings';
import { restartCurrentRmsPolling } from './currentRms/sync';
import { locationColorRulesRouter, jobLocationColorRulesRouter } from './routes/locationColorRules';
import { permissionsRouter } from './routes/permissions';
import { crewRouter } from './routes/crew';
import { crewApplicationsRouter } from './routes/crewApplications';
import { onboardingRouter } from './routes/onboarding';
import { crewPortalRouter } from './routes/crewPortal';
import { jobCrewAssignmentsRouter } from './routes/jobCrewAssignments';
import { labelTemplatesRouter } from './routes/labelTemplates';
import { jobScheduleRouter } from './routes/jobSchedule';
import { jobDaysRouter } from './routes/jobDays';
import { bugReportsRouter } from './routes/bugReports';
import { jobDocumentsRouter } from './routes/jobDocuments';
import { jobContactsRouter } from './routes/jobContacts';
import { jobDiscussionRouter } from './routes/jobDiscussion';
import { dashboardRouter } from './routes/dashboard';
import { notificationsRouter } from './routes/notifications';
import { lockdownRouter } from './routes/lockdown';
import { prepRouter } from './routes/prep';
import { cableRouter, jobCableRouter } from './routes/cable';
import { riggingRouter, jobRiggingRouter } from './routes/rigging';
import { requireJobVisible } from './jobVisibility';
import { RejectedUploadError } from './uploadSafety';
import { seedDefaultLocationColorsIfEmpty, seedNewDefaultLocationColorsIfMissing } from './pdf/locationColors';
import { prisma } from './db';
import { globalRoleRatesRouter, jobRoleRatesRouter } from './routes/roleRates';

const app = express();
// One reverse proxy in front of this app in the documented deployment (see DEPLOY.md) - trust
// its X-Forwarded-For so req.ip (used for activity-log IP logging, see requestContext.ts) is
// the real client address, not the proxy's. Harmless when there's no proxy (nothing sets the
// header, so req.ip falls back to the direct connection's address same as before).
app.set('trust proxy', 1);
// CSP is defence in depth behind upload sniffing (uploadSafety.ts): no inline or third-party
// script can run on this origin. The only external embed is the Google Maps iframe in
// LocationLinks.tsx; pdf.js needs blob: workers and wasm for some image codecs.
// HSTS is left off: the default deployment here is plain HTTP on a LAN/home box (see
// DEPLOY.md), and HSTS over plain HTTP just teaches the browser to refuse to reconnect.
// A TLS-terminating reverse proxy (Caddy/nginx/Traefik) is the right place to add it.
app.use(
  helmet({
    hsts: false,
    contentSecurityPolicy: {
      useDefaults: false,
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'wasm-unsafe-eval'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'blob:'],
        fontSrc: ["'self'", 'data:'],
        connectSrc: ["'self'"],
        workerSrc: ["'self'", 'blob:'],
        frameSrc: ["'self'", 'blob:', 'https://maps.google.com', 'https://www.google.com'],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        frameAncestors: ["'self'"],
      },
    },
  })
);
// The SPA and API are always same-origin in practice - one Express server serves both in
// production, and the Vite dev server proxies /api to this server rather than calling it
// cross-origin (see web/vite.config.ts) - so no cross-origin access is actually needed.
// `origin: true` here used to reflect every requesting origin back with credentials
// enabled, which told the browser "yes" to any site's cookie-carrying request against this
// session-cookie-authenticated API - a real CSRF/data-exposure misconfiguration, not just
// unnecessary surface. CORS_ALLOWED_ORIGINS lets a genuine cross-origin case opt in
// explicitly (comma-separated) without going back to reflecting everything.
const corsAllowedOrigins = (process.env.CORS_ALLOWED_ORIGINS ?? '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);
app.use(cors({ origin: corsAllowedOrigins.length > 0 ? corsAllowedOrigins : false, credentials: true }));
app.use(express.json({ limit: '10mb' }));
app.use(cookieParser());
app.use(requestContextMiddleware);
app.use(authMiddleware);

app.get('/api/health', (_req, res) => res.json({ ok: true }));
app.get('/api/version', (_req, res) => res.json(getVersionInfo()));

app.use('/api/auth', authRouter);
app.use('/api/bug-reports', bugReportsRouter);
app.use('/api/2fa', twoFactorRouter);
app.use('/api/users', usersRouter);
app.use('/api/settings', settingsRouter);
app.use('/api/jobs/:jobId', requireJobVisible);
app.use('/api/jobs', jobsRouter);
app.use('/api/jobs', jobRoleRatesRouter);
app.use('/api/role-rates', globalRoleRatesRouter);
app.use('/api/fixture-type-rules', fixtureTypeRulesRouter);
app.use('/api/location-color-rules', locationColorRulesRouter);
app.use('/api/jobs', patchRouter);
app.use('/api/jobs', casesRouter);
app.use('/api/jobs', fixtureGroupsRouter);
app.use('/api/jobs', adHocLabelsRouter);
app.use('/api/jobs', crewLabelRequestsRouter);
app.use('/api/jobs', printQueueRouter);
app.use('/api/jobs', plotsRouter);
app.use('/api/jobs', jobCurrentRmsRouter);
app.use('/api/jobs', jobLocationColorRulesRouter);
app.use('/api/jobs', jobCrewAssignmentsRouter);
app.use('/api/jobs', labelTemplatesRouter);
app.use('/api/jobs', jobScheduleRouter);
app.use('/api/jobs', jobDaysRouter);
app.use('/api/jobs', jobDocumentsRouter);
app.use('/api/jobs', jobContactsRouter);
app.use('/api/jobs', jobDiscussionRouter);
app.use('/api/jobs', jobCableRouter);
app.use('/api/jobs', jobRiggingRouter);
app.use('/api/dashboard', dashboardRouter);
app.use('/api/notifications', notificationsRouter);
// crewPortalRouter (self-service, CREW-only) is mounted before the admin-only crewRouter at
// the same prefix so its specific /me* paths are tried first; anything it doesn't match
// (the bare roster list/CRUD) falls through to crewRouter unchanged.
app.use('/api/crew', crewPortalRouter);
app.use('/api/crew', crewRouter);
app.use('/api/crew-applications', crewApplicationsRouter);
app.use('/api/onboarding', onboardingRouter);
app.use('/api/current-rms', currentRmsRouter);
app.use('/api/onedrive', oneDriveRouter);
app.use('/api/jobs', jobOneDriveRouter);
app.use('/api/portal-settings', portalSettingsRouter);
app.use('/api/print-jobs', printJobsRouter);
app.use('/api/printer-settings', printerSettingsRouter);
app.use('/api/agent', agentRouter);
app.use('/api/activity', activityRouter);
app.use('/api/permissions', permissionsRouter);
app.use('/api/lockdown', lockdownRouter);
// Prep bays check job access themselves (crew see the jobs they are on, a bay screen its own
// job), so they sit outside /api/jobs/:jobId's public-job rule.
app.use('/api/prep', prepRouter);
app.use('/api/cable', cableRouter);
app.use('/api/rigging', riggingRouter);

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
  if (err instanceof RejectedUploadError) return res.status(400).json({ error: err.message });
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
// Sequential on purpose: run concurrently on an empty table, both passes saw the newer
// defaults as missing and inserted them twice.
(async () => {
  await seedDefaultLocationColorsIfEmpty();
  await seedNewDefaultLocationColorsIfMissing(['Spare', 'Rigging', 'Everywhere']);
})().catch((err) => console.error('Could not seed location colors:', err));
