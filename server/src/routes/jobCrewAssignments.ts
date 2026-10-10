import { Router } from 'express';
import { prisma, logActivity } from '../db';
import { requirePermission } from '../permissions';

/**
 * Job-scoped crew attribution: who's working this job, in what role, at what rate. Viewing is
 * open to anyone who can see the job (same as other job sub-resources, e.g. Plots); adding,
 * editing, or removing an assignment needs the delegatable manageCrewAssignments permission
 * (ADMIN always has it). The crew roster itself — creating/deleting a CREW account — is a
 * separate, ADMIN-only concern handled by routes/crew.ts.
 */
export const jobCrewAssignmentsRouter = Router();

interface AssignmentRow {
  id: string;
  jobId: string;
  crewProfileId: string;
  role: string;
  dayRate: string | null;
  xeroContactId: string | null;
  crewProfile: {
    id: string;
    dayRate: string | null;
    active: boolean;
    user: { username: string; displayName: string };
  };
}

function toAssignmentDto(a: AssignmentRow) {
  return {
    id: a.id,
    crewProfileId: a.crewProfileId,
    displayName: a.crewProfile.user.displayName,
    username: a.crewProfile.user.username,
    role: a.role,
    dayRate: a.dayRate,
    profileDayRate: a.crewProfile.dayRate,
    active: a.crewProfile.active,
  };
}

const assignmentInclude = {
  crewProfile: { include: { user: { select: { username: true, displayName: true } } } },
} as const;

jobCrewAssignmentsRouter.get('/:jobId/crew', async (req, res) => {
  const assignments = await prisma.jobCrewAssignment.findMany({
    where: { jobId: req.params.jobId },
    include: assignmentInclude,
    orderBy: { createdAt: 'asc' },
  });
  res.json(assignments.map(toAssignmentDto));
});

jobCrewAssignmentsRouter.post('/:jobId/crew', requirePermission('manageCrewAssignments'), async (req, res) => {
  const { jobId } = req.params;
  const { crewProfileId, role, dayRate } = req.body ?? {};
  if (!crewProfileId || typeof crewProfileId !== 'string') {
    return res.status(400).json({ error: 'crewProfileId is required' });
  }
  if (!role || typeof role !== 'string') {
    return res.status(400).json({ error: 'role is required (e.g. "LD", "Rigger", "Spot Op")' });
  }
  const profile = await prisma.crewProfile.findUnique({ where: { id: crewProfileId } });
  if (!profile) return res.status(404).json({ error: 'Crew member not found' });
  const existing = await prisma.jobCrewAssignment.findUnique({
    where: { jobId_crewProfileId: { jobId, crewProfileId } },
  });
  if (existing) return res.status(409).json({ error: 'This crew member is already assigned to this job' });

  const assignment = await prisma.jobCrewAssignment.create({
    data: { jobId, crewProfileId, role, dayRate: dayRate || null },
    include: assignmentInclude,
  });
  await logActivity('crew_assignment.create', `${assignment.crewProfile.user.username} as ${role}`, jobId, req.user?.id);
  res.status(201).json(toAssignmentDto(assignment));
});

jobCrewAssignmentsRouter.put('/:jobId/crew/:id', requirePermission('manageCrewAssignments'), async (req, res) => {
  const { role, dayRate } = req.body ?? {};
  const assignment = await prisma.jobCrewAssignment.update({
    where: { id: req.params.id },
    data: {
      ...(role !== undefined ? { role } : {}),
      ...(dayRate !== undefined ? { dayRate: dayRate || null } : {}),
    },
    include: assignmentInclude,
  });
  res.json(toAssignmentDto(assignment));
});

jobCrewAssignmentsRouter.delete('/:jobId/crew/:id', requirePermission('manageCrewAssignments'), async (req, res) => {
  const assignment = await prisma.jobCrewAssignment.findUnique({ where: { id: req.params.id }, include: assignmentInclude });
  if (!assignment) return res.status(404).json({ error: 'Assignment not found' });
  await prisma.jobCrewAssignment.delete({ where: { id: req.params.id } });
  await logActivity('crew_assignment.remove', assignment.crewProfile.user.username, req.params.jobId, req.user?.id);
  res.status(204).end();
});
