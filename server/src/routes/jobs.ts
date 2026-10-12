import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { prisma, logActivity } from '../db';
import { requirePermission, resolvePermissionsForUser } from '../permissions';
import { normalizeCrewFeaturesPatch } from '../crewFeatures';

const uploadDir = process.env.UPLOADS_DIR
  ? path.resolve(process.env.UPLOADS_DIR)
  : path.join(__dirname, '..', '..', 'uploads');
fs.mkdirSync(uploadDir, { recursive: true });
const upload = multer({
  storage: multer.diskStorage({
    destination: uploadDir,
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname) || '';
      cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`);
    },
  }),
  fileFilter: (_req, file, cb) => cb(null, file.mimetype.startsWith('image/')),
  limits: { fileSize: 10 * 1024 * 1024 },
});

export const jobsRouter = Router();

/** ADMIN sees every job; USER/SIGNAGE only see jobs an admin has marked Public. */
jobsRouter.get('/', async (req, res) => {
  const isAdmin = req.user?.role === 'ADMIN';
  const jobs = await prisma.job.findMany({
    where: isAdmin ? undefined : { isPublic: true },
    orderBy: { createdAt: 'desc' },
  });
  res.json(jobs);
});

// Jobs can no longer be created directly - every job enters the portal by onboarding a
// Current RMS Quote/Order (see routes/currentRms.ts's import/bulk-import endpoints), so the
// job list and its data (crew features, OneDrive folder, etc.) always starts from a real
// opportunity rather than a blank admin-typed name.
jobsRouter.get('/:id', async (req, res) => {
  const job = await prisma.job.findUnique({ where: { id: req.params.id } });
  if (!job) return res.status(404).json({ error: 'not found' });
  if (!job.isPublic && req.user?.role !== 'ADMIN') return res.status(404).json({ error: 'not found' });
  res.json(job);
});

jobsRouter.put('/:id', async (req, res) => {
  const { name, venue, description, address, startsAt, endsAt, isPublic, crewFeatures } = req.body ?? {};
  if (isPublic !== undefined && req.user?.role !== 'ADMIN') {
    const perms = req.user?.role === 'USER' ? await resolvePermissionsForUser(req.user.id, 'USER') : null;
    if (!perms?.publishJobs) {
      return res.status(403).json({ error: "Insufficient permissions to change a job's public visibility" });
    }
  }
  if (crewFeatures !== undefined && req.user?.role !== 'ADMIN') {
    const perms = req.user?.role === 'USER' ? await resolvePermissionsForUser(req.user.id, 'USER') : null;
    if (!perms?.onboardJobs && !perms?.manageCrewAssignments) {
      return res.status(403).json({ error: "Insufficient permissions to change this job's crew portal features" });
    }
  }
  let crewFeaturesJson: string | null | undefined;
  if (crewFeatures !== undefined) {
    crewFeaturesJson = crewFeatures === null ? null : JSON.stringify(normalizeCrewFeaturesPatch(crewFeatures));
  }
  const job = await prisma.job.update({
    where: { id: req.params.id },
    data: {
      ...(name !== undefined ? { name } : {}),
      ...(venue !== undefined ? { venue } : {}),
      ...(description !== undefined ? { description } : {}),
      ...(address !== undefined ? { address } : {}),
      ...(startsAt !== undefined ? { startsAt: startsAt ? new Date(startsAt) : null } : {}),
      ...(endsAt !== undefined ? { endsAt: endsAt ? new Date(endsAt) : null } : {}),
      ...(isPublic !== undefined ? { isPublic } : {}),
      ...(crewFeaturesJson !== undefined ? { crewFeaturesJson } : {}),
    },
  });
  if (isPublic !== undefined) await logActivity('job.visibility', `isPublic=${isPublic}`, job.id, req.user?.id);
  if (crewFeaturesJson !== undefined) await logActivity('job.crew_features', crewFeaturesJson ?? 'reset to default', job.id, req.user?.id);
  res.json(job);
});

jobsRouter.delete('/:id', requirePermission('deleteJobs'), async (req, res) => {
  const jobId = req.params.id;
  const [job, plots, printJobs] = await Promise.all([
    prisma.job.findUnique({ where: { id: jobId } }),
    prisma.plot.findMany({ where: { jobId } }),
    prisma.printJob.findMany({ where: { jobId } }),
  ]);
  if (!job) return res.status(404).json({ error: 'not found' });

  // PrintJob has no FK relation to Job (its rows persist as print history independent of the
  // job existing), so it isn't covered by cascade delete and needs cleaning up explicitly.
  await prisma.printJob.deleteMany({ where: { jobId } });
  await prisma.job.delete({ where: { id: jobId } }); // cascades fixtures/cases/adhoc/queue/plots

  const filesToRemove = [
    ...(job.logoPath ? [path.join(uploadDir, job.logoPath)] : []),
    ...plots.map((p) => path.join(uploadDir, 'plots', p.fileName)),
    ...printJobs.map((pj) => path.join(uploadDir, 'print-jobs', pj.fileName)),
  ];
  await Promise.all(filesToRemove.map((f) => fs.promises.unlink(f).catch(() => {})));

  await logActivity('job.delete', job.name, undefined, req.user?.id);
  res.status(204).end();
});

jobsRouter.post('/:id/logo', upload.single('logo'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'logo file is required' });
  const job = await prisma.job.update({
    where: { id: req.params.id },
    data: { logoPath: req.file.filename },
  });
  await logActivity('job.logo_upload', req.file.originalname, job.id, req.user?.id);
  res.json(job);
});

jobsRouter.get('/:id/logo', async (req, res) => {
  const job = await prisma.job.findUnique({ where: { id: req.params.id } });
  if (!job?.logoPath) return res.status(404).end();
  if (!job.isPublic && req.user?.role !== 'ADMIN') return res.status(404).end();
  res.sendFile(path.join(uploadDir, job.logoPath));
});

export { uploadDir, upload };
