import { Router } from 'express';
import multer from 'multer';
import { prisma, logActivity } from '../db';
import { MIN_PASSWORD_LENGTH, hashPassword, requireRole } from '../auth';
import { requirePermission } from '../permissions';
import { DOCUMENT_FIELDS, saveDocuments, streamDecryptedDocument } from '../crewDocumentsStorage';
import { notifyCrewApplicationSubmitted } from '../notifications';

/**
 * Public application intake + admin review queue for the freelance crew roster. The public
 * submission (POST /) needs no login — see auth.ts's explicit exemption for this exact path —
 * everything else here requires the (delegatable) manageCrewApplications permission, applied
 * per-route rather than via router.use so it never shadows that public route. Viewing/downloading
 * an actual document's bytes is a narrower, hard requireRole('ADMIN') check per route (not
 * delegated), matching the plan's "compliance document visibility stays admin-only" decision —
 * reviewing an application's form fields and approving/rejecting it is delegatable, seeing the
 * underlying compliance files is not.
 */
export const crewApplicationsRouter = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  fileFilter: (_req, file, cb) => {
    cb(null, file.mimetype === 'application/pdf' || file.mimetype.startsWith('image/'));
  },
  limits: { fileSize: 15 * 1024 * 1024, files: DOCUMENT_FIELDS.length },
});

interface ApplicationRow {
  id: string;
  fullName: string;
  email: string;
  phone: string | null;
  skills: string | null;
  dayRate: string | null;
  rightToWork: string | null;
  notes: string | null;
  status: string;
  reviewedAt: Date | null;
  reviewedBy: string | null;
  rejectionNote: string | null;
  createdAt: Date;
}

function toApplicationDto(a: ApplicationRow) {
  return {
    id: a.id,
    fullName: a.fullName,
    email: a.email,
    phone: a.phone,
    skills: a.skills,
    dayRate: a.dayRate,
    rightToWork: a.rightToWork,
    notes: a.notes,
    status: a.status,
    reviewedAt: a.reviewedAt,
    rejectionNote: a.rejectionNote,
    createdAt: a.createdAt,
  };
}

crewApplicationsRouter.post(
  '/',
  upload.fields(DOCUMENT_FIELDS.map((d) => ({ name: d.field, maxCount: 1 }))),
  async (req, res) => {
    const { fullName, email, phone, skills, dayRate, rightToWork, notes } = req.body ?? {};
    if (!fullName || typeof fullName !== 'string') return res.status(400).json({ error: 'fullName is required' });
    if (!email || typeof email !== 'string') return res.status(400).json({ error: 'email is required' });

    const application = await prisma.crewApplication.create({
      data: {
        fullName,
        email,
        phone: phone || null,
        skills: skills || null,
        dayRate: dayRate || null,
        rightToWork: rightToWork || null,
        notes: notes || null,
      },
    });
    await saveDocuments({ applicationId: application.id }, req.files as Record<string, Express.Multer.File[]> | undefined);
    await notifyCrewApplicationSubmitted(fullName);
    res.status(201).json({ id: application.id });
  }
);

crewApplicationsRouter.get('/', requirePermission('manageCrewApplications'), async (req, res) => {
  const status = typeof req.query.status === 'string' ? req.query.status : undefined;
  const applications = await prisma.crewApplication.findMany({
    where: status ? { status } : undefined,
    orderBy: { createdAt: 'desc' },
  });
  res.json(applications.map(toApplicationDto));
});

crewApplicationsRouter.get('/:id', requirePermission('manageCrewApplications'), async (req, res) => {
  const application = await prisma.crewApplication.findUnique({
    where: { id: req.params.id },
    include: { documents: { select: { id: true, kind: true, originalName: true, mimeType: true, createdAt: true } } },
  });
  if (!application) return res.status(404).json({ error: 'Application not found' });
  res.json({ ...toApplicationDto(application), documents: application.documents });
});

// Document bytes are the one part of this flow that stays hard admin-only, never delegated —
// see this file's top comment.
crewApplicationsRouter.get('/:id/documents/:docId', requireRole('ADMIN'), async (req, res) => {
  const doc = await prisma.crewDocument.findUnique({ where: { id: req.params.docId } });
  if (!doc || doc.applicationId !== req.params.id) return res.status(404).end();
  await streamDecryptedDocument(res, doc, req.user?.id);
});

crewApplicationsRouter.post('/:id/approve', requirePermission('manageCrewApplications'), async (req, res) => {
  const { username, password, displayName } = req.body ?? {};
  if (!username || !password) return res.status(400).json({ error: 'username and password are required' });
  if (password.length < MIN_PASSWORD_LENGTH) {
    return res.status(400).json({ error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` });
  }

  const application = await prisma.crewApplication.findUnique({ where: { id: req.params.id } });
  if (!application) return res.status(404).json({ error: 'Application not found' });
  if (application.status !== 'PENDING') return res.status(409).json({ error: 'Application has already been reviewed' });
  const existingUser = await prisma.user.findUnique({ where: { username } });
  if (existingUser) return res.status(409).json({ error: 'Username already taken' });

  const profile = await prisma.$transaction(async (tx) => {
    const created = await tx.crewProfile.create({
      data: {
        phone: application.phone,
        skills: application.skills,
        dayRate: application.dayRate,
        notes: application.notes,
        user: {
          create: {
            username,
            displayName: displayName || application.fullName,
            passwordHash: hashPassword(password),
            role: 'CREW',
          },
        },
      },
      include: { user: { select: { username: true, displayName: true } } },
    });
    await tx.crewDocument.updateMany({
      where: { applicationId: application.id },
      data: { crewProfileId: created.id, applicationId: null },
    });
    await tx.crewApplication.update({
      where: { id: application.id },
      data: { status: 'APPROVED', reviewedAt: new Date(), reviewedBy: req.user!.id },
    });
    return created;
  });

  await logActivity('crew_application.approve', application.fullName, undefined, req.user!.id);
  res.json({ userId: profile.userId, crewProfileId: profile.id, username: profile.user.username });
});

crewApplicationsRouter.post('/:id/reject', requirePermission('manageCrewApplications'), async (req, res) => {
  const { note } = req.body ?? {};
  const application = await prisma.crewApplication.findUnique({ where: { id: req.params.id } });
  if (!application) return res.status(404).json({ error: 'Application not found' });
  if (application.status !== 'PENDING') return res.status(409).json({ error: 'Application has already been reviewed' });

  await prisma.crewApplication.update({
    where: { id: application.id },
    data: { status: 'REJECTED', reviewedAt: new Date(), reviewedBy: req.user!.id, rejectionNote: note || null },
  });
  await logActivity('crew_application.reject', application.fullName, undefined, req.user!.id);
  res.status(204).end();
});
