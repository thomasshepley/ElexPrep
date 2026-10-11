import { Router } from 'express';
import multer from 'multer';
import { prisma, logActivity } from '../db';
import { MIN_PASSWORD_LENGTH, hashPassword, requireRole } from '../auth';
import { DOCUMENT_FIELDS, deleteDocumentFile, saveDocuments, streamDecryptedDocument } from '../crewDocumentsStorage';
import { encryptBankDetails, decryptBankDetails, parseBankDetails } from '../bankDetails';

/**
 * Admin-only crew roster: creates/edits/removes a CREW User + its CrewProfile together, so a
 * CREW account can never exist without a profile (unlike the generic /api/users endpoint,
 * which deliberately refuses the CREW role for exactly that reason). This is the "direct-create
 * path" the plan calls for — the public application flow (a later milestone) is the second,
 * approval-based way a User+CrewProfile pair comes into existence.
 */
export const crewRouter = Router();

crewRouter.use(requireRole('ADMIN'));

interface CrewProfileRow {
  id: string;
  userId: string;
  phone: string | null;
  skills: string | null;
  certifications: string | null;
  dayRate: string | null;
  notes: string | null;
  gender: string | null;
  address: string | null;
  pronouns: string | null;
  instagramUrl: string | null;
  facebookUrl: string | null;
  otherLinkUrl: string | null;
  bankDetailsCiphertext: string | null;
  active: boolean;
  createdAt: Date;
  user: { username: string; displayName: string };
}

function toCrewDto(p: CrewProfileRow) {
  return {
    id: p.id,
    userId: p.userId,
    username: p.user.username,
    displayName: p.user.displayName,
    phone: p.phone,
    skills: p.skills,
    certifications: p.certifications,
    dayRate: p.dayRate,
    notes: p.notes,
    gender: p.gender,
    address: p.address,
    pronouns: p.pronouns,
    instagramUrl: p.instagramUrl,
    facebookUrl: p.facebookUrl,
    otherLinkUrl: p.otherLinkUrl,
    hasBankDetails: p.bankDetailsCiphertext !== null,
    active: p.active,
    createdAt: p.createdAt,
  };
}

crewRouter.get('/', async (_req, res) => {
  const profiles = await prisma.crewProfile.findMany({
    include: { user: { select: { username: true, displayName: true } } },
    orderBy: { createdAt: 'desc' },
  });
  res.json(profiles.map(toCrewDto));
});

crewRouter.post('/', async (req, res) => {
  const {
    username, password, displayName, phone, skills, certifications, dayRate, notes,
    gender, address, pronouns, instagramUrl, facebookUrl, otherLinkUrl, bankDetails,
  } = req.body ?? {};
  if (!username || !password) return res.status(400).json({ error: 'username and password are required' });
  if (password.length < MIN_PASSWORD_LENGTH) {
    return res.status(400).json({ error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` });
  }
  const existing = await prisma.user.findUnique({ where: { username } });
  if (existing) return res.status(409).json({ error: 'Username already taken' });

  let bankEncrypted: { ciphertext: string; iv: string; authTag: string } | null = null;
  try {
    const parsed = parseBankDetails(bankDetails);
    if (parsed) bankEncrypted = encryptBankDetails(parsed);
  } catch (err) {
    return res.status(400).json({ error: (err as Error).message });
  }

  const profile = await prisma.crewProfile.create({
    data: {
      phone: phone || null,
      skills: skills || null,
      certifications: certifications || null,
      dayRate: dayRate || null,
      notes: notes || null,
      gender: gender || null,
      address: address || null,
      pronouns: pronouns || null,
      instagramUrl: instagramUrl || null,
      facebookUrl: facebookUrl || null,
      otherLinkUrl: otherLinkUrl || null,
      bankDetailsCiphertext: bankEncrypted?.ciphertext ?? null,
      bankDetailsIv: bankEncrypted?.iv ?? null,
      bankDetailsAuthTag: bankEncrypted?.authTag ?? null,
      user: {
        create: {
          username,
          displayName: displayName || username,
          passwordHash: hashPassword(password),
          role: 'CREW',
        },
      },
    },
    include: { user: { select: { username: true, displayName: true } } },
  });
  await logActivity('crew.create', `${username}`, undefined, req.user!.id);
  res.status(201).json(toCrewDto(profile));
});

crewRouter.put('/:id', async (req, res) => {
  const {
    displayName, password, phone, skills, certifications, dayRate, notes, active,
    gender, address, pronouns, instagramUrl, facebookUrl, otherLinkUrl, bankDetails,
  } = req.body ?? {};
  if (password !== undefined && password.length < MIN_PASSWORD_LENGTH) {
    return res.status(400).json({ error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` });
  }
  const existing = await prisma.crewProfile.findUnique({ where: { id: req.params.id } });
  if (!existing) return res.status(404).json({ error: 'Crew member not found' });

  let bankPatch: { bankDetailsCiphertext: string; bankDetailsIv: string; bankDetailsAuthTag: string } | undefined;
  if (bankDetails !== undefined) {
    try {
      const parsed = parseBankDetails(bankDetails);
      if (parsed) {
        const enc = encryptBankDetails(parsed);
        bankPatch = { bankDetailsCiphertext: enc.ciphertext, bankDetailsIv: enc.iv, bankDetailsAuthTag: enc.authTag };
      }
    } catch (err) {
      return res.status(400).json({ error: (err as Error).message });
    }
  }

  if (displayName !== undefined || password !== undefined) {
    await prisma.user.update({
      where: { id: existing.userId },
      data: {
        ...(displayName !== undefined ? { displayName } : {}),
        ...(password !== undefined ? { passwordHash: hashPassword(password) } : {}),
      },
    });
  }
  const profile = await prisma.crewProfile.update({
    where: { id: req.params.id },
    data: {
      ...(phone !== undefined ? { phone: phone || null } : {}),
      ...(skills !== undefined ? { skills: skills || null } : {}),
      ...(certifications !== undefined ? { certifications: certifications || null } : {}),
      ...(dayRate !== undefined ? { dayRate: dayRate || null } : {}),
      ...(notes !== undefined ? { notes: notes || null } : {}),
      ...(gender !== undefined ? { gender: gender || null } : {}),
      ...(address !== undefined ? { address: address || null } : {}),
      ...(pronouns !== undefined ? { pronouns: pronouns || null } : {}),
      ...(instagramUrl !== undefined ? { instagramUrl: instagramUrl || null } : {}),
      ...(facebookUrl !== undefined ? { facebookUrl: facebookUrl || null } : {}),
      ...(otherLinkUrl !== undefined ? { otherLinkUrl: otherLinkUrl || null } : {}),
      ...(active !== undefined ? { active: Boolean(active) } : {}),
      ...bankPatch,
    },
    include: { user: { select: { username: true, displayName: true } } },
  });
  await logActivity('crew.update', profile.user.username, undefined, req.user!.id);
  res.json(toCrewDto(profile));
});

crewRouter.get('/:id/bank-details', async (req, res) => {
  const profile = await prisma.crewProfile.findUnique({ where: { id: req.params.id }, include: { user: { select: { username: true } } } });
  if (!profile) return res.status(404).json({ error: 'Crew member not found' });
  if (!profile.bankDetailsCiphertext || !profile.bankDetailsIv || !profile.bankDetailsAuthTag) {
    return res.status(404).json({ error: 'No bank details on file' });
  }
  const details = decryptBankDetails(profile.bankDetailsCiphertext, profile.bankDetailsIv, profile.bankDetailsAuthTag);
  await logActivity('crew.bankDetails.view', profile.user.username, undefined, req.user!.id);
  res.json(details);
});

// Deletes the User row, not just the CrewProfile — a CREW user with no profile is meaningless,
// and the FK cascade (CrewProfile.userId -> User, onDelete: Cascade) removes the profile (and
// its job assignments, via CrewProfile's own cascade) along with it.
crewRouter.delete('/:id', async (req, res) => {
  const existing = await prisma.crewProfile.findUnique({ where: { id: req.params.id }, include: { user: true } });
  if (!existing) return res.status(404).json({ error: 'Crew member not found' });
  await prisma.user.delete({ where: { id: existing.userId } });
  await logActivity('crew.delete', existing.user.username, undefined, req.user!.id);
  res.status(204).end();
});

// Compliance documents, post-approval. The whole router is already requireRole('ADMIN') (see
// top of file) with no delegation, matching the plan's "document visibility stays admin-only"
// decision — unlike the applications review queue, nothing here is ever gated by a permission.
const documentUpload = multer({
  storage: multer.memoryStorage(),
  fileFilter: (_req, file, cb) => {
    cb(null, file.mimetype === 'application/pdf' || file.mimetype.startsWith('image/'));
  },
  limits: { fileSize: 15 * 1024 * 1024, files: DOCUMENT_FIELDS.length },
});

crewRouter.get('/:id/documents', async (req, res) => {
  const profile = await prisma.crewProfile.findUnique({ where: { id: req.params.id } });
  if (!profile) return res.status(404).json({ error: 'Crew member not found' });
  const documents = await prisma.crewDocument.findMany({
    where: { crewProfileId: profile.id },
    select: { id: true, kind: true, originalName: true, mimeType: true, createdAt: true },
    orderBy: { createdAt: 'desc' },
  });
  res.json(documents);
});

crewRouter.post(
  '/:id/documents',
  documentUpload.fields(DOCUMENT_FIELDS.map((d) => ({ name: d.field, maxCount: 1 }))),
  async (req, res) => {
    const profile = await prisma.crewProfile.findUnique({ where: { id: req.params.id } });
    if (!profile) return res.status(404).json({ error: 'Crew member not found' });
    await saveDocuments({ crewProfileId: profile.id }, req.files as Record<string, Express.Multer.File[]> | undefined);
    await logActivity('crew.document.upload', profile.id, undefined, req.user!.id);
    const documents = await prisma.crewDocument.findMany({
      where: { crewProfileId: profile.id },
      select: { id: true, kind: true, originalName: true, mimeType: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    });
    res.status(201).json(documents);
  }
);

crewRouter.get('/:id/documents/:docId', async (req, res) => {
  const doc = await prisma.crewDocument.findUnique({ where: { id: req.params.docId } });
  if (!doc || doc.crewProfileId !== req.params.id) return res.status(404).end();
  await streamDecryptedDocument(res, doc, req.user?.id);
});

crewRouter.delete('/:id/documents/:docId', async (req, res) => {
  const doc = await prisma.crewDocument.findUnique({ where: { id: req.params.docId } });
  if (!doc || doc.crewProfileId !== req.params.id) return res.status(404).end();
  await prisma.crewDocument.delete({ where: { id: doc.id } });
  await deleteDocumentFile(doc.fileName);
  await logActivity('crew.document.delete', doc.originalName, undefined, req.user!.id);
  res.status(204).end();
});

// Rate card: named rate lines (e.g. "Day rate", "Overtime") replacing the single free-text
// dayRate field in the admin UI — see CrewRateLine's schema comment.
crewRouter.get('/:id/rate-lines', async (req, res) => {
  const profile = await prisma.crewProfile.findUnique({ where: { id: req.params.id } });
  if (!profile) return res.status(404).json({ error: 'Crew member not found' });
  const lines = await prisma.crewRateLine.findMany({ where: { crewProfileId: profile.id }, orderBy: { order: 'asc' } });
  res.json(lines);
});

crewRouter.post('/:id/rate-lines', async (req, res) => {
  const profile = await prisma.crewProfile.findUnique({ where: { id: req.params.id } });
  if (!profile) return res.status(404).json({ error: 'Crew member not found' });
  const { label, amount } = req.body ?? {};
  if (!label || !amount) return res.status(400).json({ error: 'label and amount are required' });
  const count = await prisma.crewRateLine.count({ where: { crewProfileId: profile.id } });
  const line = await prisma.crewRateLine.create({
    data: { crewProfileId: profile.id, label, amount, order: count },
  });
  await logActivity('crew.rateLine.create', `${label}: ${amount}`, undefined, req.user!.id);
  res.status(201).json(line);
});

crewRouter.put('/:id/rate-lines/:lineId', async (req, res) => {
  const existing = await prisma.crewRateLine.findUnique({ where: { id: req.params.lineId } });
  if (!existing || existing.crewProfileId !== req.params.id) return res.status(404).json({ error: 'Rate line not found' });
  const { label, amount } = req.body ?? {};
  const line = await prisma.crewRateLine.update({
    where: { id: existing.id },
    data: {
      ...(label !== undefined ? { label } : {}),
      ...(amount !== undefined ? { amount } : {}),
    },
  });
  await logActivity('crew.rateLine.update', `${line.label}: ${line.amount}`, undefined, req.user!.id);
  res.json(line);
});

crewRouter.delete('/:id/rate-lines/:lineId', async (req, res) => {
  const existing = await prisma.crewRateLine.findUnique({ where: { id: req.params.lineId } });
  if (!existing || existing.crewProfileId !== req.params.id) return res.status(404).json({ error: 'Rate line not found' });
  await prisma.crewRateLine.delete({ where: { id: existing.id } });
  await logActivity('crew.rateLine.delete', existing.label, undefined, req.user!.id);
  res.status(204).end();
});
