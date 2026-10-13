/**
 * Admin command-line tool for operating a deployed instance - run inside the container via
 * `docker compose exec elexprep node dist/cli.js <command> ...` (see scripts/admin.sh for a
 * host-side wrapper, and DEPLOY.md for the full command reference). This is deliberately a
 * separate entrypoint from index.ts, not an API route: these are operator actions (resetting
 * the whole database, bypassing a forgotten password) that should never be reachable over
 * HTTP, even by an authenticated admin account.
 */
import { prisma } from './db';
import { hashPassword } from './auth';
import { setMaintenanceMode, isMaintenanceModeEnabled } from './maintenanceMode';
import { uploadDir } from './routes/jobs';
import fs from 'fs';
import path from 'path';

const ROLES = ['ADMIN', 'USER', 'SIGNAGE', 'CREW', 'WEBMASTER'];

function fail(message: string): never {
  console.error(`Error: ${message}`);
  process.exit(1);
}

function requireArgs(args: string[], count: number, usage: string) {
  if (args.length < count) fail(`Usage: ${usage}`);
}

async function cmdStatus() {
  const [userCount, jobCount, sessionCount, lockedDown] = await Promise.all([
    prisma.user.count(),
    prisma.job.count(),
    prisma.session.count(),
    isMaintenanceModeEnabled(),
  ]);
  const byRole = await prisma.user.groupBy({ by: ['role'], _count: true });
  console.log(`Lockdown: ${lockedDown ? 'ON - only admins can sign in or use the API' : 'off'}`);
  console.log(`Users: ${userCount}`);
  for (const r of byRole) console.log(`  ${r.role}: ${r._count}`);
  console.log(`Jobs: ${jobCount}`);
  console.log(`Active sessions: ${sessionCount}`);
}

async function cmdListUsers() {
  const users = await prisma.user.findMany({
    orderBy: { username: 'asc' },
    select: { username: true, displayName: true, role: true, mustChangePassword: true, totpEnabled: true, createdAt: true },
  });
  if (users.length === 0) {
    console.log('No users.');
    return;
  }
  for (const u of users) {
    const flags = [u.mustChangePassword && 'must-change-password', u.totpEnabled && '2fa'].filter(Boolean).join(', ');
    console.log(`${u.username}\t${u.role}\t${u.displayName}${flags ? `\t[${flags}]` : ''}`);
  }
}

async function cmdAddUser(args: string[]) {
  requireArgs(args, 2, 'add-user <username> <password> [role] [displayName]');
  const [username, password, role = 'USER', displayName] = args;
  if (!ROLES.includes(role)) fail(`role must be one of: ${ROLES.join(', ')}`);
  if (password.length < 8) fail('password must be at least 8 characters');
  const existing = await prisma.user.findUnique({ where: { username } });
  if (existing) fail(`a user named "${username}" already exists`);
  await prisma.user.create({
    data: { username, displayName: displayName || username, passwordHash: hashPassword(password), role },
  });
  console.log(`Created ${role} user "${username}".`);
}

async function cmdRemoveUser(args: string[]) {
  requireArgs(args, 1, 'remove-user <username> --confirm');
  const [username] = args;
  if (!args.includes('--confirm')) fail('this permanently deletes the account and its crew profile/documents - re-run with --confirm');
  const user = await prisma.user.findUnique({ where: { username } });
  if (!user) fail(`no user named "${username}"`);
  await prisma.user.delete({ where: { username } });
  console.log(`Deleted user "${username}".`);
}

async function cmdSetPassword(args: string[]) {
  requireArgs(args, 2, 'set-password <username> <newPassword>');
  const [username, password] = args;
  if (password.length < 8) fail('password must be at least 8 characters');
  const user = await prisma.user.findUnique({ where: { username } });
  if (!user) fail(`no user named "${username}"`);
  await prisma.user.update({ where: { username }, data: { passwordHash: hashPassword(password), mustChangePassword: false } });
  console.log(`Password updated for "${username}".`);
}

async function cmdForcePasswordReset(args: string[]) {
  requireArgs(args, 1, 'force-password-reset <username>');
  const [username] = args;
  const user = await prisma.user.findUnique({ where: { username } });
  if (!user) fail(`no user named "${username}"`);
  await prisma.user.update({ where: { username }, data: { mustChangePassword: true } });
  console.log(`"${username}" will be required to set a new password on their next sign-in.`);
}

async function cmdSetRole(args: string[]) {
  requireArgs(args, 2, 'set-role <username> <role>');
  const [username, role] = args;
  if (!ROLES.includes(role)) fail(`role must be one of: ${ROLES.join(', ')}`);
  const user = await prisma.user.findUnique({ where: { username } });
  if (!user) fail(`no user named "${username}"`);
  await prisma.user.update({ where: { username }, data: { role } });
  console.log(`"${username}" is now role ${role}.`);
}

async function cmdRevokeSessions(args: string[]) {
  requireArgs(args, 1, 'revoke-sessions <username|--all>');
  const [target] = args;
  if (target === '--all') {
    const { count } = await prisma.session.deleteMany({});
    console.log(`Revoked ${count} session(s) - everyone will need to sign in again.`);
    return;
  }
  const user = await prisma.user.findUnique({ where: { username: target } });
  if (!user) fail(`no user named "${target}"`);
  const { count } = await prisma.session.deleteMany({ where: { userId: user.id } });
  console.log(`Revoked ${count} session(s) for "${target}".`);
}

async function cmdLockdown() {
  await setMaintenanceMode(true);
  await prisma.session.deleteMany({ where: { user: { role: { not: 'ADMIN' } } } });
  console.log('Lockdown enabled - only ADMIN accounts can sign in or use the API; non-admin sessions revoked.');
}

async function cmdUnlock() {
  await setMaintenanceMode(false);
  console.log('Lockdown disabled - normal access restored.');
}

async function cmdResetAllData(args: string[]) {
  if (!args.includes('--confirm-reset-everything')) {
    fail('this permanently deletes every job, user, crew record and uploaded file - re-run with --confirm-reset-everything');
  }
  const tables: { tablename: string }[] = await prisma.$queryRawUnsafe(
    `SELECT name AS tablename FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_prisma_%'`
  );
  await prisma.$executeRawUnsafe('PRAGMA foreign_keys=OFF;');
  for (const { tablename } of tables) {
    await prisma.$executeRawUnsafe(`DELETE FROM "${tablename}";`);
  }
  await prisma.$executeRawUnsafe('PRAGMA foreign_keys=ON;');

  if (fs.existsSync(uploadDir)) {
    for (const entry of fs.readdirSync(uploadDir)) {
      fs.rmSync(path.join(uploadDir, entry), { recursive: true, force: true });
    }
  }
  console.log('All data and uploaded files wiped. The site is now a brand new instance - visit it to create the first admin account.');
}

function printUsage() {
  console.log(`Usage: node dist/cli.js <command> [args]

  status                                   Show user/job/session counts and lockdown state
  list-users                                List every account
  add-user <user> <pass> [role] [name]      Create an account (role: ${ROLES.join('|')}, default USER)
  remove-user <user> --confirm              Permanently delete an account
  set-password <user> <newPass>             Set an account's password directly
  force-password-reset <user>               Require a new password on next sign-in
  set-role <user> <role>                    Change an account's role
  revoke-sessions <user|--all>              Sign an account (or everyone) out everywhere
  lockdown                                   Lock the site to admins only (emergency stop)
  unlock                                     Undo lockdown
  reset-all-data --confirm-reset-everything  Wipe the database and uploads back to a fresh install
`);
}

async function main() {
  const [command, ...args] = process.argv.slice(2);
  switch (command) {
    case 'status':
      return cmdStatus();
    case 'list-users':
      return cmdListUsers();
    case 'add-user':
      return cmdAddUser(args);
    case 'remove-user':
      return cmdRemoveUser(args);
    case 'set-password':
      return cmdSetPassword(args);
    case 'force-password-reset':
      return cmdForcePasswordReset(args);
    case 'set-role':
      return cmdSetRole(args);
    case 'revoke-sessions':
      return cmdRevokeSessions(args);
    case 'lockdown':
      return cmdLockdown();
    case 'unlock':
      return cmdUnlock();
    case 'reset-all-data':
      return cmdResetAllData(args);
    default:
      printUsage();
      process.exit(command ? 1 : 0);
  }
}

main()
  .catch((err) => {
    console.error('Error:', err instanceof Error ? err.message : err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
