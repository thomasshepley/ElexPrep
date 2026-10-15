import { Router } from 'express';
import { prisma, logActivity } from '../db';
import { getCurrentRmsConfig } from '../currentRms/config';
import { fetchOpportunityItems, GROUP_ITEM_TYPE, RawOpportunityItem } from '../currentRms/client';

/**
 * "Stages" (FixtureGroup rows) - a named subdivision of one job's prep, for jobs that need
 * more than one self-contained patch import/case-pack/print-queue run (a multi-stage event
 * being the usual case, hence the name - though an admin can create any custom split). Open
 * to any signed-in staff account, same posture as the patch/cases routes they sit alongside -
 * no extra requirePermission wrapper.
 */
export const fixtureGroupsRouter = Router();

fixtureGroupsRouter.get('/:jobId/fixture-groups', async (req, res) => {
  const groups = await prisma.fixtureGroup.findMany({
    where: { jobId: req.params.jobId },
    orderBy: { order: 'asc' },
  });
  res.json(groups);
});

fixtureGroupsRouter.post('/:jobId/fixture-groups', async (req, res) => {
  const { name } = req.body ?? {};
  if (!name || !String(name).trim()) return res.status(400).json({ error: 'name is required' });
  const existing = await prisma.fixtureGroup.findMany({ where: { jobId: req.params.jobId } });
  const nextOrder = existing.reduce((m, g) => Math.max(m, g.order), -1) + 1;
  const group = await prisma.fixtureGroup.create({
    data: { jobId: req.params.jobId, name: String(name).trim(), order: nextOrder },
  });
  await logActivity('fixture_groups.create', group.name, req.params.jobId, req.user?.id);
  res.status(201).json(group);
});

fixtureGroupsRouter.put('/:jobId/fixture-groups/:id', async (req, res) => {
  const { name, order } = req.body ?? {};
  const data: Record<string, unknown> = {};
  if (name !== undefined) {
    if (!String(name).trim()) return res.status(400).json({ error: 'name is required' });
    data.name = String(name).trim();
  }
  if (order !== undefined) data.order = Number(order);
  if (!(await prisma.fixtureGroup.findFirst({ where: { id: req.params.id, jobId: req.params.jobId }, select: { id: true } }))) {
    return res.status(404).json({ error: 'not found' });
  }
  const group = await prisma.fixtureGroup.update({ where: { id: req.params.id }, data });
  res.json(group);
});

// Deleting a stage returns its fixtures/cases/print-queue items/ad hoc labels to ungrouped
// (SetNull on every groupId column - see schema.prisma) rather than deleting them.
fixtureGroupsRouter.delete('/:jobId/fixture-groups/:id', async (req, res) => {
  const group = await prisma.fixtureGroup.findUnique({ where: { id: req.params.id } });
  if (!group || group.jobId !== req.params.jobId) return res.status(404).json({ error: 'Stage not found' });
  await prisma.fixtureGroup.delete({ where: { id: req.params.id } });
  await logActivity('fixture_groups.delete', group.name, req.params.jobId, req.user?.id);
  res.status(204).end();
});

interface RmsHeadingGroup {
  name: string;
  itemNames: string[];
}

/** Splits an opportunity's ordered line items into sections by its Group rows (opportunity_item_type
 * 0 - a heading like "Stage 1 - Lighting", not a real pickable item). Every non-group item between
 * one heading and the next belongs to it - Current RMS has no explicit parent_id, so membership is
 * purely positional, same assumption CurrentRmsPanel.tsx's own lookback logic already relies on. */
function extractRmsHeadings(items: RawOpportunityItem[]): RmsHeadingGroup[] {
  const headings: RmsHeadingGroup[] = [];
  let current: RmsHeadingGroup | null = null;
  for (const item of items) {
    const name = typeof item.name === 'string' ? item.name.trim() : '';
    if (item.opportunity_item_type === GROUP_ITEM_TYPE) {
      current = name ? { name, itemNames: [] } : null;
      if (current) headings.push(current);
    } else if (current && name) {
      current.itemNames.push(name);
    }
  }
  return headings;
}

/** Case-insensitive, either-direction containment - real patch fixture-type strings and
 * Current RMS product names rarely match byte-for-byte ("MAC Aura XB" vs "Martin MAC Aura XB
 * Wash Light"), so a loose match catches far more real matches than an exact one would, at
 * the cost of an occasional false positive the admin can fix by hand afterward. */
function fixtureMatchesHeading(fixtureType: string, itemNames: string[]): boolean {
  const type = fixtureType.trim().toLowerCase();
  if (!type) return false;
  return itemNames.some((name) => {
    const n = name.trim().toLowerCase();
    return n.length > 0 && (n === type || n.includes(type) || type.includes(n));
  });
}

async function matchFixturesToGroup(jobId: string, groupId: string, itemNames: string[]): Promise<number> {
  const ungrouped = await prisma.fixture.findMany({ where: { jobId, groupId: null } });
  const matchIds = ungrouped.filter((f) => fixtureMatchesHeading(f.fixtureType, itemNames)).map((f) => f.id);
  if (matchIds.length === 0) return 0;
  await prisma.fixture.updateMany({ where: { id: { in: matchIds } }, data: { groupId } });
  return matchIds.length;
}

async function loadRmsHeadings(jobId: string): Promise<RmsHeadingGroup[]> {
  const job = await prisma.job.findUnique({ where: { id: jobId }, select: { currentRmsOpportunityId: true } });
  if (!job?.currentRmsOpportunityId) throw new Error('Job is not linked to a Current RMS opportunity');
  const config = await getCurrentRmsConfig();
  if (!config.enabled) throw new Error('Current RMS integration is disabled');
  const items = await fetchOpportunityItems(config, Number(job.currentRmsOpportunityId));
  return extractRmsHeadings(items);
}

// Shows the admin the opportunity's own section headings so they can pick which ones are
// stages - nothing is created yet.
fixtureGroupsRouter.get('/:jobId/fixture-groups/rms-headings', async (req, res) => {
  try {
    res.json(await loadRmsHeadings(req.params.jobId));
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

// Creates (or reuses) one FixtureGroup per selected heading name and auto-assigns every
// currently-ungrouped fixture whose type name cross-references against that heading's items.
fixtureGroupsRouter.post('/:jobId/fixture-groups/from-rms', async (req, res) => {
  const { names } = req.body ?? {};
  if (!Array.isArray(names) || names.length === 0 || names.some((n) => typeof n !== 'string')) {
    return res.status(400).json({ error: 'names (array of heading names) is required' });
  }

  let headings: RmsHeadingGroup[];
  try {
    headings = await loadRmsHeadings(req.params.jobId);
  } catch (err) {
    return res.status(400).json({ error: (err as Error).message });
  }

  const existing = await prisma.fixtureGroup.findMany({ where: { jobId: req.params.jobId } });
  let nextOrder = existing.reduce((m, g) => Math.max(m, g.order), -1) + 1;

  const results: { id: string; name: string; matched: number }[] = [];
  for (const headingName of names as string[]) {
    const heading = headings.find((h) => h.name === headingName);
    if (!heading) continue;
    let group = existing.find((g) => g.rmsGroupName === headingName || g.name === headingName);
    if (!group) {
      group = await prisma.fixtureGroup.create({
        data: { jobId: req.params.jobId, name: headingName, rmsGroupName: headingName, order: nextOrder++ },
      });
      existing.push(group);
    }
    const matched = await matchFixturesToGroup(req.params.jobId, group.id, heading.itemNames);
    results.push({ id: group.id, name: group.name, matched });
  }

  await logActivity('fixture_groups.create_from_rms', (names as string[]).join(', '), req.params.jobId, req.user?.id);
  res.json({ groups: results, totalMatched: results.reduce((sum, r) => sum + r.matched, 0) });
});

// Re-runs the cross-reference match for one existing RMS-derived stage - useful after a new
// patch import adds fixtures that weren't there yet when the stage was first created.
fixtureGroupsRouter.post('/:jobId/fixture-groups/:id/rematch', async (req, res) => {
  const group = await prisma.fixtureGroup.findUnique({ where: { id: req.params.id } });
  if (!group || group.jobId !== req.params.jobId) return res.status(404).json({ error: 'Stage not found' });
  if (!group.rmsGroupName) return res.status(400).json({ error: 'This stage was not created from a Current RMS heading' });

  let headings: RmsHeadingGroup[];
  try {
    headings = await loadRmsHeadings(req.params.jobId);
  } catch (err) {
    return res.status(400).json({ error: (err as Error).message });
  }
  const heading = headings.find((h) => h.name === group.rmsGroupName);
  if (!heading) return res.status(404).json({ error: `Heading "${group.rmsGroupName}" was not found in Current RMS anymore` });

  const matched = await matchFixturesToGroup(req.params.jobId, group.id, heading.itemNames);
  res.json({ matched });
});
