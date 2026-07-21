import { Router } from 'express';
import { prisma, logActivity } from '../db';
import { MIN_PASSWORD_LENGTH, hashPassword, requireRole, toAuthedUser } from '../auth';

export const usersRouter = Router();

usersRouter.use(requireRole('ADMIN'));

usersRouter.get('/', async (_req, res) => {
  const users = await prisma.user.findMany({ orderBy: { username: 'asc' } });
  res.json(users.map(toAuthedUser));
});

usersRouter.post('/', async (req, res) => {
  const { username, password, displayName, role } = req.body ?? {};
  if (!username || !password) return res.status(400).json({ error: 'username and password are required' });
  if (password.length < MIN_PASSWORD_LENGTH) {
    return res.status(400).json({ error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` });
  }
  if (role && !['ADMIN', 'USER', 'SIGNAGE'].includes(role)) {
    return res.status(400).json({ error: 'role must be ADMIN, USER, or SIGNAGE' });
  }
  const existing = await prisma.user.findUnique({ where: { username } });
  if (existing) return res.status(409).json({ error: 'Username already taken' });
  const user = await prisma.user.create({
    data: {
      username,
      displayName: displayName || username,
      passwordHash: hashPassword(password),
      role: role ?? 'USER',
    },
  });
  await logActivity('user.create', `${username} (${user.role})`, undefined, req.user!.id);
  res.status(201).json(toAuthedUser(user));
});

usersRouter.put('/:id', async (req, res) => {
  const { displayName, role, password } = req.body ?? {};
  if (role && !['ADMIN', 'USER', 'SIGNAGE'].includes(role)) {
    return res.status(400).json({ error: 'role must be ADMIN, USER, or SIGNAGE' });
  }
  if (role && role !== 'ADMIN' && req.params.id === req.user!.id) {
    return res.status(400).json({ error: 'You cannot remove your own admin role' });
  }
  if (password !== undefined && password.length < MIN_PASSWORD_LENGTH) {
    return res.status(400).json({ error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` });
  }
  const user = await prisma.user.update({
    where: { id: req.params.id },
    data: {
      ...(displayName !== undefined ? { displayName } : {}),
      ...(role !== undefined ? { role } : {}),
      ...(password !== undefined ? { passwordHash: hashPassword(password) } : {}),
    },
  });
  await logActivity('user.update', user.username, undefined, req.user!.id);
  res.json(toAuthedUser(user));
});

usersRouter.delete('/:id', async (req, res) => {
  if (req.params.id === req.user!.id) {
    return res.status(400).json({ error: 'You cannot delete your own account' });
  }
  const user = await prisma.user.delete({ where: { id: req.params.id } });
  await logActivity('user.delete', user.username, undefined, req.user!.id);
  res.status(204).end();
});
