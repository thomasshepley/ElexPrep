import { prisma } from './db';

/**
 * Chat groups inside a job's discussion. Every job has a General group (isDefault), made the
 * first time the discussion is opened; messages from before groups existed are moved into it
 * then. Staff see every group. Crew see EVERYONE groups plus MEMBERS groups they've been added
 * to (by their assignment on the job).
 */

export const GROUP_VISIBILITIES = ['EVERYONE', 'MEMBERS'] as const;
export type GroupVisibility = (typeof GROUP_VISIBILITIES)[number];

const groupInclude = { members: { select: { jobCrewAssignmentId: true } } } as const;

export async function ensureJobGroups(jobId: string) {
  let groups = await prisma.discussionGroup.findMany({ where: { jobId }, include: groupInclude, orderBy: [{ order: 'asc' }, { createdAt: 'asc' }] });
  if (!groups.some((g) => g.isDefault)) {
    const general = await prisma.discussionGroup.create({ data: { jobId, name: 'General', isDefault: true, order: 0 }, include: groupInclude });
    groups = [general, ...groups];
  }
  const general = groups.find((g) => g.isDefault)!;
  await prisma.jobDiscussionMessage.updateMany({ where: { jobId, groupId: null }, data: { groupId: general.id } });
  return groups;
}

export type JobGroup = Awaited<ReturnType<typeof ensureJobGroups>>[number];

export function crewCanSee(group: JobGroup, jobCrewAssignmentId: string): boolean {
  return group.visibility !== 'MEMBERS' || group.members.some((m) => m.jobCrewAssignmentId === jobCrewAssignmentId);
}

export function toGroupDto(g: JobGroup, opts: { includeMembers: boolean }) {
  return {
    id: g.id,
    name: g.name,
    color: g.color,
    visibility: g.visibility as GroupVisibility,
    isDefault: g.isDefault,
    ...(opts.includeMembers ? { memberAssignmentIds: g.members.map((m) => m.jobCrewAssignmentId) } : {}),
  };
}

/** Picks the requested group if the caller may see it, else the job's General group. */
export function pickGroup(groups: JobGroup[], requested: unknown): JobGroup {
  const id = typeof requested === 'string' ? requested : null;
  return (id && groups.find((g) => g.id === id)) || groups.find((g) => g.isDefault) || groups[0];
}
