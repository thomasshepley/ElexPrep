import { Router } from 'express';
import { prisma, logActivity } from '../db';
import { MIN_PASSWORD_LENGTH, hashPassword, requireRole } from '../auth';

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
  dayRate: string | null;
  notes: string | null;
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
    dayRate: p.dayRate,
    notes: p.notes,
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
  const { username, password, displayName, phone, skills, dayRate, notes } = req.body ?? {};
  if (!username || !password) return res.status(400).json({ error: 'username and password are required' });
  if (password.length < MIN_PASSWORD_LENGTH) {
    return res.status(400).json({ error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` });
  }
  const existing = await prisma.user.findUnique({ where: { username } });
  if (existing) return res.status(409).json({ error: 'Username already taken' });

  const profile = await prisma.crewProfile.create({
    data: {
      phone: phone || null,
      skills: skills || null,
      dayRate: dayRate || null,
      notes: notes || null,
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
  const { displayName, password, phone, skills, dayRate, notes, active } = req.body ?? {};
  if (password !== undefined && password.length < MIN_PASSWORD_LENGTH) {
    return res.status(400).json({ error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` });
  }
  const existing = await prisma.crewProfile.findUnique({ where: { id: req.params.id } });
  if (!existing) return res.status(404).json({ error: 'Crew member not found' });

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
      ...(dayRate !== undefined ? { dayRate: dayRate || null } : {}),
      ...(notes !== undefined ? { notes: notes || null } : {}),
      ...(active !== undefined ? { active: Boolean(active) } : {}),
    },
    include: { user: { select: { username: true, displayName: true } } },
  });
  await logActivity('crew.update', profile.user.username, undefined, req.user!.id);
  res.json(toCrewDto(profile));
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
