import { Router } from 'express';
import { requirePermission } from '../permissions';
import { prisma, logActivity } from '../db';

export const locationColorRulesRouter = Router();
export const jobLocationColorRulesRouter = Router();

const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;
const PATTERNS = ['SOLID', 'DIAGONAL_STRIPES'];

/**
 * Prisma/SQLite can't do a case-insensitive equality filter directly, so this checks the
 * small per-scope rule set (global or one job's) in JS instead - always just a handful of rows.
 */
async function assertNoDuplicate(jobId: string | null, location: string, excludeId?: string) {
  const all = await prisma.locationColorRule.findMany({ where: { jobId } });
  return all.find((r) => r.location.toLowerCase().trim() === location.toLowerCase().trim() && r.id !== excludeId);
}

/**
 * Validates the optional pattern/secondaryColor pair: a DIAGONAL_STRIPES rule needs a valid
 * secondary hex color (the second stripe); a SOLID rule ignores/clears it.
 */
function validatePattern(body: Record<string, unknown>): { error: string } | { pattern?: string; secondaryColor?: string | null } {
  if (body.pattern === undefined && body.secondaryColor === undefined) return {};
  const pattern = typeof body.pattern === 'string' ? body.pattern : 'SOLID';
  if (!PATTERNS.includes(pattern)) return { error: 'pattern must be SOLID or DIAGONAL_STRIPES' };
  if (pattern === 'DIAGONAL_STRIPES') {
    if (!body.secondaryColor || !HEX_COLOR_RE.test(body.secondaryColor as string)) {
      return { error: 'secondaryColor must be a hex value like #FFFFFF when pattern is DIAGONAL_STRIPES' };
    }
    return { pattern, secondaryColor: body.secondaryColor as string };
  }
  return { pattern, secondaryColor: null };
}

// Global default rules (jobId = null) - these are the house-wide fallbacks every job starts with.
locationColorRulesRouter.get('/', async (_req, res) => {
  const rules = await prisma.locationColorRule.findMany({ where: { jobId: null }, orderBy: { location: 'asc' } });
  res.json(rules);
});

locationColorRulesRouter.post('/', requirePermission('managePrepSettings'), async (req, res) => {
  const { location, color } = req.body ?? {};
  if (!location || typeof location !== 'string') {
    return res.status(400).json({ error: 'location is required' });
  }
  if (!color || !HEX_COLOR_RE.test(color)) {
    return res.status(400).json({ error: 'color must be a hex value like #1FA34C' });
  }
  const patternFields = validatePattern(req.body ?? {});
  if ('error' in patternFields) return res.status(400).json({ error: patternFields.error });
  if (await assertNoDuplicate(null, location)) {
    return res.status(409).json({ error: 'A rule for this location already exists' });
  }
  const rule = await prisma.locationColorRule.create({ data: { location, color, jobId: null, ...patternFields } });
  await logActivity('location_color_rule.create', `${location} = ${color}`, undefined, req.user?.id);
  res.status(201).json(rule);
});

locationColorRulesRouter.put('/:id', requirePermission('managePrepSettings'), async (req, res) => {
  const { location, color } = req.body ?? {};
  if (color !== undefined && !HEX_COLOR_RE.test(color)) {
    return res.status(400).json({ error: 'color must be a hex value like #1FA34C' });
  }
  const patternFields = validatePattern(req.body ?? {});
  if ('error' in patternFields) return res.status(400).json({ error: patternFields.error });
  if (location !== undefined && (await assertNoDuplicate(null, location, req.params.id))) {
    return res.status(409).json({ error: 'A rule for this location already exists' });
  }
  const rule = await prisma.locationColorRule.update({
    where: { id: req.params.id },
    data: {
      ...(location !== undefined ? { location } : {}),
      ...(color !== undefined ? { color } : {}),
      ...patternFields,
    },
  });
  res.json(rule);
});

locationColorRulesRouter.delete('/:id', requirePermission('managePrepSettings'), async (req, res) => {
  await prisma.locationColorRule.delete({ where: { id: req.params.id } });
  res.status(204).end();
});

// Per-job overrides/additions (jobId set) - for jobs whose patch uses location names that
// don't match the house defaults (e.g. "Cube North", "Entrance Arch Top"), configured without
// touching the shared defaults. A job-specific rule wins over a global one of the same name.
jobLocationColorRulesRouter.get('/:jobId/location-colors', async (req, res) => {
  const rules = await prisma.locationColorRule.findMany({
    where: { jobId: req.params.jobId },
    orderBy: { location: 'asc' },
  });
  res.json(rules);
});

jobLocationColorRulesRouter.post('/:jobId/location-colors', requirePermission('editJobs'), async (req, res) => {
  const { jobId } = req.params;
  const { location, color } = req.body ?? {};
  if (!location || typeof location !== 'string') {
    return res.status(400).json({ error: 'location is required' });
  }
  if (!color || !HEX_COLOR_RE.test(color)) {
    return res.status(400).json({ error: 'color must be a hex value like #1FA34C' });
  }
  const patternFields = validatePattern(req.body ?? {});
  if ('error' in patternFields) return res.status(400).json({ error: patternFields.error });
  if (await assertNoDuplicate(jobId, location)) {
    return res.status(409).json({ error: 'A rule for this location already exists for this job' });
  }
  const rule = await prisma.locationColorRule.create({ data: { jobId, location, color, ...patternFields } });
  await logActivity('location_color_rule.create', `${location} = ${color} (job-specific)`, jobId, req.user?.id);
  res.status(201).json(rule);
});

jobLocationColorRulesRouter.put('/:jobId/location-colors/:id', requirePermission('editJobs'), async (req, res) => {
  const { location, color } = req.body ?? {};
  if (color !== undefined && !HEX_COLOR_RE.test(color)) {
    return res.status(400).json({ error: 'color must be a hex value like #1FA34C' });
  }
  const patternFields = validatePattern(req.body ?? {});
  if ('error' in patternFields) return res.status(400).json({ error: patternFields.error });
  const existing = await prisma.locationColorRule.findUnique({ where: { id: req.params.id } });
  if (!existing || existing.jobId !== req.params.jobId) return res.status(404).json({ error: 'not found' });
  if (location !== undefined && (await assertNoDuplicate(req.params.jobId, location, req.params.id))) {
    return res.status(409).json({ error: 'A rule for this location already exists for this job' });
  }
  const rule = await prisma.locationColorRule.update({
    where: { id: req.params.id },
    data: {
      ...(location !== undefined ? { location } : {}),
      ...(color !== undefined ? { color } : {}),
      ...patternFields,
    },
  });
  res.json(rule);
});

jobLocationColorRulesRouter.delete('/:jobId/location-colors/:id', requirePermission('editJobs'), async (req, res) => {
  const { count } = await prisma.locationColorRule.deleteMany({ where: { id: req.params.id, jobId: req.params.jobId } });
  if (count === 0) return res.status(404).json({ error: 'not found' });
  res.status(204).end();
});
