import { Router } from 'express';
import { prisma, logActivity } from '../db';
import { MIN_PASSWORD_LENGTH, SESSION_COOKIE, hashPassword, requireRole, revokeOtherSessions, toAuthedUser } from '../auth';

export const usersRouter = Router();

usersRouter.use(requireRole('ADMIN'));

// WEBMASTER accounts are only visible to and editable by another WEBMASTER - an ADMIN can't see,
// demote, reset or delete them from the web UI.
const hiddenFrom = (requesterRole: string | undefined) => (requesterRole === 'WEBMASTER' ? {} : { role: { not: 'WEBMASTER' } });

async function findManageableUser(id: string, requesterRole: string | undefined) {
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user || (user.role === 'WEBMASTER' && requesterRole !== 'WEBMASTER')) return null;
  return user;
}

usersRouter.get('/', async (req, res) => {
  const users = await prisma.user.findMany({ where: hiddenFrom(req.user?.role), orderBy: { username: 'asc' } });
  res.json(users.map(toAuthedUser));
});

usersRouter.post('/', async (req, res) => {
  const { username, password, displayName, role } = req.body ?? {};
  if (typeof username !== 'string' || typeof password !== 'string' || !username.trim() || !password) {
    return res.status(400).json({ error: 'username and password are required' });
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    return res.status(400).json({ error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` });
  }
  if (role && !['ADMIN', 'USER', 'SIGNAGE'].includes(role)) {
    return res.status(400).json({ error: 'role must be ADMIN, USER, or SIGNAGE (crew accounts are added as crew members)' });
  }
  const existing = await prisma.user.findUnique({ where: { username } });
  if (existing) return res.status(409).json({ error: 'Username already taken' });
  const user = await prisma.user.create({
    data: {
      username,
      displayName: displayName || username,
      passwordHash: await hashPassword(password),
      role: role ?? 'USER',
    },
  });
  await logActivity('user.create', `${username} (${user.role})`, undefined, req.user!.id);
  res.status(201).json(toAuthedUser(user));
});

usersRouter.put('/:id', async (req, res) => {
  const { displayName, role, password, isProjectManager } = req.body ?? {};
  if (isProjectManager !== undefined && typeof isProjectManager !== 'boolean') {
    return res.status(400).json({ error: 'isProjectManager must be a boolean' });
  }
  if (role && !['ADMIN', 'USER', 'SIGNAGE'].includes(role)) {
    return res.status(400).json({ error: 'role must be ADMIN, USER, or SIGNAGE (crew logins are managed as crew members)' });
  }
  if (role && role !== req.user!.role && req.params.id === req.user!.id) {
    return res.status(400).json({ error: 'You cannot change your own role' });
  }
  if (password !== undefined && (typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH)) {
    return res.status(400).json({ error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` });
  }
  if (displayName !== undefined && (typeof displayName !== 'string' || !displayName.trim())) {
    return res.status(400).json({ error: 'displayName must be a non-empty string' });
  }
  if (!(await findManageableUser(req.params.id, req.user?.role))) return res.status(404).json({ error: 'User not found' });
  const user = await prisma.user.update({
    where: { id: req.params.id },
    data: {
      ...(displayName !== undefined ? { displayName } : {}),
      ...(role !== undefined ? { role } : {}),
      ...(isProjectManager !== undefined ? { isProjectManager } : {}),
      ...(password !== undefined ? { passwordHash: await hashPassword(password) } : {}),
    },
  });
  if (password !== undefined) await revokeOtherSessions(user.id, user.id === req.user!.id ? req.cookies?.[SESSION_COOKIE] : undefined);
  await logActivity(
    'user.update',
    isProjectManager !== undefined ? `${user.username} (PM tag ${isProjectManager ? 'on' : 'off'})` : user.username,
    undefined,
    req.user!.id
  );
  res.json(toAuthedUser(user));
});

usersRouter.delete('/:id', async (req, res) => {
  if (req.params.id === req.user!.id) {
    return res.status(400).json({ error: 'You cannot delete your own account' });
  }
  if (!(await findManageableUser(req.params.id, req.user?.role))) return res.status(404).json({ error: 'User not found' });
  const user = await prisma.user.delete({ where: { id: req.params.id } });
  await logActivity('user.delete', user.username, undefined, req.user!.id);
  res.status(204).end();
});
