import crypto from 'crypto';
import { Router } from 'express';
import { prisma, logActivity } from '../db';
import { MIN_PASSWORD_LENGTH, hashPassword } from '../auth';
import { requirePermission } from '../permissions';
import { encryptBankDetails, parseBankDetails } from '../bankDetails';
import { notifyOnboardingRequestSubmitted } from '../notifications';

/**
 * The lighter-weight crew intake path — see OnboardingInvite's schema comment. Three audiences:
 * the public (submit a name, look up/complete an approved invite by its token — both exempted
 * from the session gate in auth.ts, same as the crew-applications public POST), and admin/staff
 * with manageCrewApplications (review the queue, approve/reject). Nothing here is reachable by
 * a CREW account; by the time one exists, onboarding for that person is already done.
 */
export const onboardingRouter = Router();

function toInviteDto(i: { id: string; fullName: string; status: string; reviewedAt: Date | null; createdAt: Date; token: string | null }) {
  return {
    id: i.id,
    fullName: i.fullName,
    status: i.status,
    reviewedAt: i.reviewedAt,
    createdAt: i.createdAt,
    // The token is the signup link itself — fine to show the admin who approved it, never to
    // anyone else, and never on the PENDING list before a decision has been made.
    token: i.status === 'APPROVED' ? i.token : null,
  };
}

onboardingRouter.post('/', async (req, res) => {
  const { fullName } = req.body ?? {};
  if (!fullName || typeof fullName !== 'string' || !fullName.trim()) {
    return res.status(400).json({ error: 'fullName is required' });
  }
  const invite = await prisma.onboardingInvite.create({ data: { fullName: fullName.trim() } });
  await notifyOnboardingRequestSubmitted(invite.fullName);
  res.status(201).json({ id: invite.id });
});

onboardingRouter.get('/', requirePermission('manageCrewApplications'), async (req, res) => {
  const status = typeof req.query.status === 'string' ? req.query.status : undefined;
  const invites = await prisma.onboardingInvite.findMany({
    where: status ? { status } : undefined,
    orderBy: { createdAt: 'desc' },
  });
  res.json(invites.map(toInviteDto));
});

onboardingRouter.post('/:id/approve', requirePermission('manageCrewApplications'), async (req, res) => {
  const invite = await prisma.onboardingInvite.findUnique({ where: { id: req.params.id } });
  if (!invite) return res.status(404).json({ error: 'Invite not found' });
  if (invite.status !== 'PENDING') return res.status(409).json({ error: 'Invite has already been reviewed' });

  const token = crypto.randomBytes(24).toString('base64url');
  const updated = await prisma.onboardingInvite.update({
    where: { id: invite.id },
    data: { status: 'APPROVED', token, reviewedAt: new Date(), reviewedBy: req.user!.id },
  });
  await logActivity('onboarding.approve', invite.fullName, undefined, req.user!.id);
  res.json(toInviteDto(updated));
});

onboardingRouter.post('/:id/reject', requirePermission('manageCrewApplications'), async (req, res) => {
  const invite = await prisma.onboardingInvite.findUnique({ where: { id: req.params.id } });
  if (!invite) return res.status(404).json({ error: 'Invite not found' });
  if (invite.status !== 'PENDING') return res.status(409).json({ error: 'Invite has already been reviewed' });

  await prisma.onboardingInvite.update({
    where: { id: invite.id },
    data: { status: 'REJECTED', reviewedAt: new Date(), reviewedBy: req.user!.id },
  });
  await logActivity('onboarding.reject', invite.fullName, undefined, req.user!.id);
  res.status(204).end();
});

// Public: the invitee following their one-time link. Says just enough to greet them and decide
// whether to show the completion form — never the full admin invite list shape.
onboardingRouter.get('/invite/:token', async (req, res) => {
  const invite = await prisma.onboardingInvite.findUnique({ where: { token: req.params.token } });
  if (!invite || invite.status === 'PENDING' || invite.status === 'REJECTED') {
    return res.status(404).json({ error: 'Invite not found' });
  }
  res.json({ fullName: invite.fullName, status: invite.status });
});

onboardingRouter.post('/invite/:token/complete', async (req, res) => {
  const invite = await prisma.onboardingInvite.findUnique({ where: { token: req.params.token } });
  if (!invite || invite.status !== 'APPROVED') return res.status(404).json({ error: 'Invite not found' });

  const { username, password, displayName, phone, skills, certifications, gender, address, dayRate, notes, bankDetails } = req.body ?? {};
  if (!username || !password) return res.status(400).json({ error: 'username and password are required' });
  if (password.length < MIN_PASSWORD_LENGTH) {
    return res.status(400).json({ error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` });
  }
  const existingUser = await prisma.user.findUnique({ where: { username } });
  if (existingUser) return res.status(409).json({ error: 'Username already taken' });

  let bankEncrypted: { ciphertext: string; iv: string; authTag: string } | null = null;
  try {
    const parsed = parseBankDetails(bankDetails);
    if (parsed) bankEncrypted = encryptBankDetails(parsed);
  } catch (err) {
    return res.status(400).json({ error: (err as Error).message });
  }

  const profile = await prisma.$transaction(async (tx) => {
    const created = await tx.crewProfile.create({
      data: {
        phone: phone || null,
        skills: skills || null,
        certifications: certifications || null,
        gender: gender || null,
        address: address || null,
        dayRate: dayRate || null,
        notes: notes || null,
        bankDetailsCiphertext: bankEncrypted?.ciphertext ?? null,
        bankDetailsIv: bankEncrypted?.iv ?? null,
        bankDetailsAuthTag: bankEncrypted?.authTag ?? null,
        user: {
          create: {
            username,
            displayName: displayName || invite.fullName,
            passwordHash: hashPassword(password),
            role: 'CREW',
          },
        },
      },
      include: { user: { select: { username: true } } },
    });
    await tx.onboardingInvite.update({ where: { id: invite.id }, data: { status: 'COMPLETED' } });
    return created;
  });

  await logActivity('onboarding.complete', invite.fullName, undefined, undefined);
  res.status(201).json({ userId: profile.userId, username: profile.user.username });
});
