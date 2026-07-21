import 'dotenv/config';
import path from 'path';
import fs from 'fs';
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
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
import { locationColorRulesRouter } from './routes/locationColorRules';
import { seedDefaultLocationColorsIfEmpty } from './pdf/locationColors';

const app = express();
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
app.use('/api/current-rms', currentRmsRouter);
app.use('/api/print-jobs', printJobsRouter);
app.use('/api/printer-settings', printerSettingsRouter);
app.use('/api/agent', agentRouter);
app.use('/api/activity', activityRouter);

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

const port = Number(process.env.PORT ?? 4000);
app.listen(port, '0.0.0.0', () => {
  console.log(`ElexPrep server listening on http://localhost:${port}`);
});

restartCurrentRmsPolling().catch((err) => console.error('Could not start Current RMS polling:', err));
seedDefaultLocationColorsIfEmpty().catch((err) => console.error('Could not seed location colors:', err));
