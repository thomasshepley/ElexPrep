import { prisma } from './db';

/**
 * In-app notifications v1 — deliberately a handful of trigger points, not a general event
 * bus (see the plan's "notifications v1" milestone). Each helper below is called from exactly
 * the route that causes the thing it describes; nothing here polls or infers.
 */

export async function notifyUser(userId: string, type: string, title: string, body?: string, link?: string) {
  await prisma.notification.create({ data: { userId, type, title, body, link } });
}

/** Every ADMIN account — used for events only staff with full access should see (a new crew
 * application, a new label request) rather than every USER, which would be noisier than useful
 * for a small team. */
async function notifyAdmins(type: string, title: string, body?: string, link?: string) {
  const admins = await prisma.user.findMany({ where: { role: 'ADMIN' }, select: { id: true } });
  if (admins.length === 0) return;
  await prisma.notification.createMany({
    data: admins.map((a) => ({ userId: a.id, type, title, body, link })),
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
 * A new message in a job's discussion thread — notifies every ADMIN/USER staff account and
 * every crew member assigned to the job, excluding whoever just posted it. Two batches because
 * the two audiences land on different shells (staff -> the job's Discussion tab, crew -> their
 * portal's job page), so they need different links.
 */
export async function notifyDiscussionMessage(jobId: string, jobName: string, authorUserId: string, authorName: string, body: string) {
  const excerpt = body.length > EXCERPT_LENGTH ? `${body.slice(0, EXCERPT_LENGTH)}…` : body;
  const title = `${authorName} in ${jobName}`;

  const staff = await prisma.user.findMany({ where: { role: { in: ['ADMIN', 'USER'] }, id: { not: authorUserId } }, select: { id: true } });
  if (staff.length > 0) {
    await prisma.notification.createMany({
      data: staff.map((u) => ({ userId: u.id, type: 'job_discussion.message', title, body: excerpt, link: `/jobs/${jobId}` })),
    });
  }

  const assignments = await prisma.jobCrewAssignment.findMany({
    where: { jobId, crewProfile: { userId: { not: authorUserId } } },
    select: { crewProfile: { select: { userId: true } } },
  });
  const crewUserIds = [...new Set(assignments.map((a) => a.crewProfile.userId))];
  if (crewUserIds.length > 0) {
    await prisma.notification.createMany({
      data: crewUserIds.map((userId) => ({ userId, type: 'job_discussion.message', title, body: excerpt, link: `/crew/jobs/${jobId}` })),
    });
  }
}
