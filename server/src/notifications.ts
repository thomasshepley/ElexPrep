import { prisma } from './db';
import { NOTIFICATION_CATEGORIES, type NotificationCategory } from '@elexprep/shared';

/**
 * In-app notifications v1 - deliberately a handful of trigger points, not a general event
 * bus (see the plan's "notifications v1" milestone). Each helper below is called from exactly
 * the route that causes the thing it describes; nothing here polls or infers.
 */

function categoryOf(type: string): NotificationCategory | null {
  const prefix = type.split('.')[0];
  return (NOTIFICATION_CATEGORIES as readonly string[]).includes(prefix) ? (prefix as NotificationCategory) : null;
}

/** A category with no entry in prefs.notifications, or no parseable prefs at all, defaults to
 * enabled - opting out is an explicit choice, not the starting state (same "default false, admin
 * must opt in" posture permissions.ts uses, just inverted since these default to on). */
function isCategoryEnabled(prefsJson: string, type: string): boolean {
  const category = categoryOf(type);
  if (!category) return true;
  try {
    const prefs = JSON.parse(prefsJson) as { notifications?: Partial<Record<NotificationCategory, boolean>> };
    return prefs.notifications?.[category] !== false;
  } catch {
    return true;
  }
}

export async function notifyUser(userId: string, type: string, title: string, body?: string, link?: string) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { prefsJson: true } });
  if (user && !isCategoryEnabled(user.prefsJson, type)) return;
  await prisma.notification.create({ data: { userId, type, title, body, link } });
}

/** Every ADMIN account - used for events only staff with full access should see (a new crew
 * application, a new label request) rather than every USER, which would be noisier than useful
 * for a small team. */
async function notifyAdmins(type: string, title: string, body?: string, link?: string) {
  const admins = await prisma.user.findMany({ where: { role: { in: ['ADMIN', 'WEBMASTER'] } }, select: { id: true, prefsJson: true } });
  const recipients = admins.filter((a) => isCategoryEnabled(a.prefsJson, type));
  if (recipients.length === 0) return;
  await prisma.notification.createMany({
    data: recipients.map((a) => ({ userId: a.id, type, title, body, link })),
  });
}

export async function notifyCrewApplicationSubmitted(fullName: string) {
  await notifyAdmins(
    'crew_application.submitted',
    'New crew application',
    `${fullName} applied to join the crew roster.`,
    '/settings/crew-applications'
  );
}

export async function notifyOnboardingRequestSubmitted(fullName: string) {
  await notifyAdmins('onboarding.submitted', 'New onboarding request', `${fullName} asked to be onboarded to the crew roster.`, '/settings/onboarding');
}

export async function notifyLabelRequestSubmitted(jobId: string, jobName: string, requesterName: string, labelType: string) {
  await notifyAdmins(
    'crew_label_request.submitted',
    'New label request',
    `${requesterName} requested a ${labelType} label on ${jobName}.`,
    `/jobs/${jobId}`
  );
}

export async function notifyCrewAssigned(userId: string, jobId: string, jobName: string, role: string) {
  await notifyUser(userId, 'crew_assignment.added', 'Added to a job', `You've been added to ${jobName} as ${role}.`, `/crew/jobs/${jobId}`);
}

export async function notifyLabelRequestReviewed(userId: string, jobId: string, jobName: string, approved: boolean) {
  await notifyUser(
    userId,
    approved ? 'crew_label_request.approved' : 'crew_label_request.rejected',
    approved ? 'Label request approved' : 'Label request denied',
    approved ? `Your label request for ${jobName} was approved.` : `Your label request for ${jobName} was denied.`,
    `/crew/jobs/${jobId}`
  );
}

const EXCERPT_LENGTH = 80;

/**
 * A new message in a job's discussion thread - notifies every staff account that can see the job and
 * every crew member assigned to the job, excluding whoever just posted it. Two batches because
 * the two audiences land on different shells (staff -> the job's Discussion tab, crew -> their
 * portal's job page), so they need different links.
 */
export async function notifyDiscussionMessage(jobId: string, jobName: string, authorUserId: string, authorName: string, body: string, groupId?: string) {
  const excerpt = body.length > EXCERPT_LENGTH ? `${body.slice(0, EXCERPT_LENGTH)}…` : body;
  const group = groupId ? await prisma.discussionGroup.findUnique({ where: { id: groupId }, include: { members: { select: { jobCrewAssignmentId: true } } } }) : null;
  const title = group && !group.isDefault ? `${authorName} in ${jobName} · ${group.name}` : `${authorName} in ${jobName}`;

  // USER accounts can't open a private job, so they aren't told about its messages either.
  const job = await prisma.job.findUnique({ where: { id: jobId }, select: { isPublic: true } });
  const staffRoles = job?.isPublic ? ['ADMIN', 'WEBMASTER', 'USER'] : ['ADMIN', 'WEBMASTER'];
  const staff = await prisma.user.findMany({
    where: { role: { in: staffRoles }, id: { not: authorUserId } },
    select: { id: true, prefsJson: true },
  });
  const staffRecipients = staff.filter((u) => isCategoryEnabled(u.prefsJson, 'job_discussion.message'));
  if (staffRecipients.length > 0) {
    await prisma.notification.createMany({
      data: staffRecipients.map((u) => ({ userId: u.id, type: 'job_discussion.message', title, body: excerpt, link: `/jobs/${jobId}` })),
    });
  }

  // Crew only hear about groups they can see (members-only groups: just the members).
  const assignments = await prisma.jobCrewAssignment.findMany({
    where: {
      jobId,
      crewProfile: { userId: { not: authorUserId } },
      ...(group?.visibility === 'MEMBERS' ? { id: { in: group.members.map((m) => m.jobCrewAssignmentId) } } : {}),
    },
    select: { crewProfile: { select: { userId: true, user: { select: { prefsJson: true } } } } },
  });
  const seen = new Set<string>();
  const crewRecipients = assignments
    .map((a) => a.crewProfile)
    .filter((p) => {
      if (seen.has(p.userId)) return false;
      seen.add(p.userId);
      return isCategoryEnabled(p.user.prefsJson, 'job_discussion.message');
    });
  if (crewRecipients.length > 0) {
    await prisma.notification.createMany({
      data: crewRecipients.map((p) => ({ userId: p.userId, type: 'job_discussion.message', title, body: excerpt, link: `/crew/jobs/${jobId}` })),
    });
  }
}
