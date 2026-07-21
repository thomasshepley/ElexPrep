import 'dotenv/config';
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
import { activityRouter } from './routes/activity';

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
app.use('/api/jobs', patchRouter);
app.use('/api/jobs', casesRouter);
app.use('/api/jobs', adHocLabelsRouter);
app.use('/api/jobs', printQueueRouter);
app.use('/api/jobs', plotsRouter);
app.use('/api/activity', activityRouter);

const port = Number(process.env.PORT ?? 4000);
app.listen(port, () => {
  console.log(`ElexPrep server listening on http://localhost:${port}`);
});
