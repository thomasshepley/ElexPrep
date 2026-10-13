import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { prisma, logActivity } from '../db';
import { requirePermission, resolvePermissionsForUser } from '../permissions';
import { isAdminRole, requireRole } from '../auth';
import { IMAGE_KINDS, acceptDiskUpload, acceptFileAtPath, randomUploadName, sendStoredUpload } from '../uploadSafety';
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
    filename: (_req, _file, cb) => cb(null, randomUploadName()),
  }),
  fileFilter: (_req, file, cb) => cb(null, file.mimetype.startsWith('image/')),
  limits: { fileSize: 10 * 1024 * 1024 },
});

export const jobsRouter = Router();

const LOGO_SCALE_FIELDS = { left: 'logoScaleLeft', middle: 'logoScale', right: 'logoScaleRight' } as const;
const LOGO_SCALE_MIN = 20;
const LOGO_SCALE_MAX = 200;

/** Who can be a job's project manager - staff who run jobs, not signage screens or crew logins. */
const PM_ROLES = ['ADMIN', 'USER'];
const PM_SELECT = { id: true, displayName: true, avatarPath: true } as const;

/** ADMIN sees every job; USER/SIGNAGE only see jobs an admin has marked Public. */
jobsRouter.get('/', async (req, res) => {
  const isAdmin = isAdminRole(req.user?.role);
  const jobs = await prisma.job.findMany({
    where: isAdmin ? undefined : { isPublic: true },
    orderBy: { createdAt: 'desc' },
    include: {
      _count: { select: { fixtures: true, caseGroups: true, crewAssignments: true } },
      projectManager: { select: PM_SELECT },
    },
  });
  const ids = jobs.map((j) => j.id);
  const [queueCounts, opportunities] = await Promise.all([
    prisma.printQueueItem.groupBy({ by: ['jobId', 'status'], where: { jobId: { in: ids } }, _count: true }),
    prisma.currentRmsOpportunity.findMany({
      where: { rmsId: { in: jobs.filter((j) => j.currentRmsOpportunityId).map((j) => Number(j.currentRmsOpportunityId)) } },
      select: { rmsId: true, startsAt: true, endsAt: true },
    }),
  ]);
  const oppById = new Map(opportunities.map((o) => [String(o.rmsId), o]));
  // A light per-job summary for the jobs list cards: effective dates (the job's own, falling
  // back to the opportunity's), crew count, and how far prep has got.
  res.json(
    jobs.map(({ _count, ...job }) => {
      const opp = job.currentRmsOpportunityId ? oppById.get(job.currentRmsOpportunityId) : undefined;
      const queue = queueCounts.filter((q) => q.jobId === job.id);
      const count = (status: string) => queue.find((q) => q.status === status)?._count ?? 0;
      return {
        ...job,
        summary: {
          startsAt: job.startsAt ?? opp?.startsAt ?? null,
          endsAt: job.endsAt ?? opp?.endsAt ?? null,
          crewCount: _count.crewAssignments,
          fixtures: _count.fixtures,
          cases: _count.caseGroups,
          labelsQueued: count('PENDING') + count('CONFIRMED'),
          labelsPrinted: count('PRINTED'),
        },
      };
    })
  );
});

// Staff who can be picked as a job's project manager. Declared before /:id so it isn't
// swallowed as a job id.
jobsRouter.get('/project-manager-options', requireRole('ADMIN', 'USER'), async (_req, res) => {
  const users = await prisma.user.findMany({
    where: { role: { in: PM_ROLES } },
    select: PM_SELECT,
    orderBy: { displayName: 'asc' },
  });
  res.json(users);
});

// Jobs can no longer be created directly - every job enters the portal by onboarding a
// Current RMS Quote/Order (see routes/currentRms.ts's import/bulk-import endpoints), so the
// job list and its data (crew features, OneDrive folder, etc.) always starts from a real
// opportunity rather than a blank admin-typed name.
jobsRouter.get('/:id', async (req, res) => {
  const job = await prisma.job.findUnique({ where: { id: req.params.id }, include: { projectManager: { select: PM_SELECT } } });
  if (!job) return res.status(404).json({ error: 'not found' });
  if (!job.isPublic && !isAdminRole(req.user?.role)) return res.status(404).json({ error: 'not found' });
  res.json(job);
});

jobsRouter.put('/:id', async (req, res) => {
  const { name, venue, description, address, startsAt, endsAt, isPublic, crewFeatures, logoScales, projectManagerUserId } = req.body ?? {};
  const editsDetails = [name, venue, description, address, startsAt, endsAt, logoScales, projectManagerUserId].some((v) => v !== undefined);
  if (editsDetails && !isAdminRole(req.user?.role)) {
    const perms = req.user?.role === 'USER' ? await resolvePermissionsForUser(req.user.id, 'USER') : null;
    if (!perms?.editJobs) {
      return res.status(403).json({ error: "Insufficient permissions to edit this job's details" });
    }
  }
  for (const [key, value] of Object.entries({ name, venue, description, address })) {
    if (value !== undefined && value !== null && typeof value !== 'string') {
      return res.status(400).json({ error: `${key} must be a string` });
    }
  }
  if (typeof name === 'string' && !name.trim()) return res.status(400).json({ error: 'name cannot be empty' });
  // Per-slot logo size on the label logo bar, percent of the slot - see Job.logoScale*.
  const logoScaleData: Record<string, number> = {};
  if (logoScales !== undefined) {
    if (!logoScales || typeof logoScales !== 'object') return res.status(400).json({ error: 'logoScales must be an object' });
    for (const [slot, value] of Object.entries(logoScales as Record<string, unknown>)) {
      if (!(slot in LOGO_SCALE_FIELDS)) return res.status(400).json({ error: `Unknown logo slot "${slot}"` });
      if (typeof value !== 'number' || !Number.isFinite(value) || value < LOGO_SCALE_MIN || value > LOGO_SCALE_MAX) {
        return res.status(400).json({ error: `Logo size must be between ${LOGO_SCALE_MIN}% and ${LOGO_SCALE_MAX}%` });
      }
      logoScaleData[LOGO_SCALE_FIELDS[slot as keyof typeof LOGO_SCALE_FIELDS]] = Math.round(value);
    }
  }
  for (const [key, value] of Object.entries({ startsAt, endsAt })) {
    if (value && Number.isNaN(new Date(value).getTime())) return res.status(400).json({ error: `${key} is not a valid date` });
  }
  if (projectManagerUserId !== undefined && projectManagerUserId !== null) {
    if (typeof projectManagerUserId !== 'string') return res.status(400).json({ error: 'projectManagerUserId must be a user id or null' });
    const pm = await prisma.user.findUnique({ where: { id: projectManagerUserId }, select: { role: true } });
    if (!pm || !PM_ROLES.includes(pm.role)) return res.status(400).json({ error: 'The project manager must be an admin or prep account' });
  }
  if (isPublic !== undefined && typeof isPublic !== 'boolean') return res.status(400).json({ error: 'isPublic must be a boolean' });
  if (isPublic !== undefined && !isAdminRole(req.user?.role)) {
    const perms = req.user?.role === 'USER' ? await resolvePermissionsForUser(req.user.id, 'USER') : null;
    if (!perms?.publishJobs) {
      return res.status(403).json({ error: "Insufficient permissions to change a job's public visibility" });
    }
  }
  if (crewFeatures !== undefined && !isAdminRole(req.user?.role)) {
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
      ...(projectManagerUserId !== undefined ? { projectManagerUserId } : {}),
      ...logoScaleData,
    },
    include: { projectManager: { select: PM_SELECT } },
  });
  if (isPublic !== undefined) await logActivity('job.visibility', `isPublic=${isPublic}`, job.id, req.user?.id);
  if (projectManagerUserId !== undefined) await logActivity('job.project_manager', job.projectManager?.displayName ?? '(none)', job.id, req.user?.id);
  if (crewFeaturesJson !== undefined) await logActivity('job.crew_features', crewFeaturesJson ?? 'reset to default', job.id, req.user?.id);
  res.json(job);
});

jobsRouter.delete('/:id', requirePermission('deleteJobs'), async (req, res) => {
  const jobId = req.params.id;
  const [job, plots, printJobs, chatImages] = await Promise.all([
    prisma.job.findUnique({ where: { id: jobId } }),
    prisma.plot.findMany({ where: { jobId } }),
    prisma.printJob.findMany({ where: { jobId } }),
    prisma.jobDiscussionMessage.findMany({ where: { jobId, attachmentPath: { not: null } }, select: { attachmentPath: true } }),
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
    ...chatImages.map((m) => path.join(uploadDir, 'discussion', m.attachmentPath!)),
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

// The slot is constrained so /:id/logo/onedrive-candidate (below) isn't swallowed as a slot.
const LOGO_PATH = '/:id/logo/:slot(left|middle|right)?';

jobsRouter.post(LOGO_PATH, requirePermission('editJobs'), upload.single('logo'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'logo file is required' });
  await acceptDiskUpload(req.file, IMAGE_KINDS);
  const slot = resolveLogoSlot(req.params.slot);
  const field = LOGO_SLOT_FIELDS[slot];
  const job = await prisma.job.update({
    where: { id: req.params.id },
    data: { [field]: req.file.filename },
  });
  await logActivity('job.logo_upload', `${req.file.originalname} (${slot})`, job.id, req.user?.id);
  res.json(job);
});

jobsRouter.delete(LOGO_PATH, requirePermission('editJobs'), async (req, res) => {
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

jobsRouter.get(LOGO_PATH, async (req, res) => {
  const slot = resolveLogoSlot(req.params.slot);
  const field = LOGO_SLOT_FIELDS[slot];
  const job = await prisma.job.findUnique({ where: { id: req.params.id } });
  const logoPath = job?.[field];
  if (!logoPath) return res.status(404).end();
  await sendStoredUpload(res, path.join(uploadDir, logoPath), `logo-${slot}${path.extname(logoPath)}`);
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
  const { stream } = await streamOneDriveFile(config, candidate.itemId);
  const tempPath = path.join(uploadDir, randomUploadName());
  await new Promise<void>((resolve, reject) => {
    const writeStream = fs.createWriteStream(tempPath);
    stream.pipe(writeStream);
    writeStream.on('finish', resolve);
    writeStream.on('error', reject);
    stream.on('error', reject);
  });
  const { filename: savedName } = await acceptFileAtPath(tempPath, IMAGE_KINDS);

  const updated = await prisma.job.update({ where: { id: req.params.id }, data: { [field]: savedName } });
  await logActivity('job.logo_onedrive_import', `${candidate.name} (${slot})`, updated.id, req.user?.id);
  res.json(updated);
});

export { uploadDir, upload };
