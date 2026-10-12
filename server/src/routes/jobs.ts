import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { prisma, logActivity } from '../db';
import { requirePermission, resolvePermissionsForUser } from '../permissions';
import { normalizeCrewFeaturesPatch } from '../crewFeatures';
import { findLogoCandidate } from '../oneDrive/logo';
import { getOneDriveConfig } from '../oneDrive/config';
import { streamOneDriveFile } from '../oneDrive/client';

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
    ...(job.logoPathLeft ? [path.join(uploadDir, job.logoPathLeft)] : []),
    ...(job.logoPathRight ? [path.join(uploadDir, job.logoPathRight)] : []),
    ...plots.map((p) => path.join(uploadDir, 'plots', p.fileName)),
    ...printJobs.map((pj) => path.join(uploadDir, 'print-jobs', pj.fileName)),
  ];
  await Promise.all(filesToRemove.map((f) => fs.promises.unlink(f).catch(() => {})));

  await logActivity('job.delete', job.name, undefined, req.user?.id);
  res.status(204).end();
});

/** The three logo slots drawn left/middle/right across a label sheet's logo bar when more than
 * one is set (see genericRenderer.ts) - "logo" field names map to the legacy single-logo
 * column so an existing job's one uploaded logo keeps working exactly as before. */
const LOGO_SLOT_FIELDS = {
  left: 'logoPathLeft',
  middle: 'logoPath',
  right: 'logoPathRight',
} as const;
type LogoSlot = keyof typeof LOGO_SLOT_FIELDS;

function resolveLogoSlot(raw: string | undefined): LogoSlot {
  return raw === 'left' || raw === 'right' ? raw : 'middle';
}

jobsRouter.post('/:id/logo/:slot?', upload.single('logo'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'logo file is required' });
  const slot = resolveLogoSlot(req.params.slot);
  const field = LOGO_SLOT_FIELDS[slot];
  const job = await prisma.job.update({
    where: { id: req.params.id },
    data: { [field]: req.file.filename },
  });
  await logActivity('job.logo_upload', `${req.file.originalname} (${slot})`, job.id, req.user?.id);
  res.json(job);
});

jobsRouter.delete('/:id/logo/:slot?', async (req, res) => {
  const slot = resolveLogoSlot(req.params.slot);
  const field = LOGO_SLOT_FIELDS[slot];
  const existing = await prisma.job.findUnique({ where: { id: req.params.id } });
  const existingPath = existing?.[field];
  const job = await prisma.job.update({
    where: { id: req.params.id },
    data: { [field]: null },
  });
  if (existingPath) await fs.promises.unlink(path.join(uploadDir, existingPath)).catch(() => {});
  await logActivity('job.logo_remove', slot, job.id, req.user?.id);
  res.json(job);
});

jobsRouter.get('/:id/logo/:slot?', async (req, res) => {
  const slot = resolveLogoSlot(req.params.slot);
  const field = LOGO_SLOT_FIELDS[slot];
  const job = await prisma.job.findUnique({ where: { id: req.params.id } });
  const logoPath = job?.[field];
  if (!logoPath) return res.status(404).end();
  if (!job.isPublic && req.user?.role !== 'ADMIN') return res.status(404).end();
  res.sendFile(path.join(uploadDir, logoPath));
});

// The automatic fallback alongside manual upload: if the job's matched OneDrive folder has
// an obvious logo image sitting in it, surface it as a one-click suggestion rather than
// making the admin download and re-upload it by hand (see JobDetailPage.tsx's Logo panel).
jobsRouter.get('/:id/logo/onedrive-candidate', requirePermission('manageOneDrive'), async (req, res) => {
  const job = await prisma.job.findUnique({ where: { id: req.params.id }, select: { oneDriveFolderId: true } });
  if (!job) return res.status(404).json({ error: 'Job not found' });
  res.json(await findLogoCandidate(job));
});

jobsRouter.post('/:id/logo/onedrive-candidate/apply', requirePermission('manageOneDrive'), async (req, res) => {
  const slot = resolveLogoSlot(typeof req.body?.slot === 'string' ? req.body.slot : undefined);
  const field = LOGO_SLOT_FIELDS[slot];
  const job = await prisma.job.findUnique({ where: { id: req.params.id }, select: { oneDriveFolderId: true } });
  if (!job) return res.status(404).json({ error: 'Job not found' });
  const candidate = await findLogoCandidate(job);
  if (!candidate) return res.status(404).json({ error: "No logo found in this job's OneDrive folder" });

  const config = await getOneDriveConfig();
  const { stream, fileName } = await streamOneDriveFile(config, candidate.itemId);
  const savedName = `${Date.now()}-${Math.round(Math.random() * 1e9)}${path.extname(fileName) || '.png'}`;
  await new Promise<void>((resolve, reject) => {
    const writeStream = fs.createWriteStream(path.join(uploadDir, savedName));
    stream.pipe(writeStream);
    writeStream.on('finish', resolve);
    writeStream.on('error', reject);
    stream.on('error', reject);
  });

  const updated = await prisma.job.update({ where: { id: req.params.id }, data: { [field]: savedName } });
  await logActivity('job.logo_onedrive_import', `${candidate.name} (${slot})`, updated.id, req.user?.id);
  res.json(updated);
});

export { uploadDir, upload };
