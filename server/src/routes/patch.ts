import { Router } from 'express';
import multer from 'multer';
import type { Job, Prisma } from '@prisma/client';
import { PATCH_FIELD_KEYS, PatchFieldKey } from '@elexprep/shared';
import { prisma, logActivity } from '../db';
import { requirePermission } from '../permissions';
import { parseWysiwygCsv, buildFixturesFromRows } from '../patchCsv';
import { getOneDriveConfig } from '../oneDrive/config';
import { listPatchFiles, readPatchFile } from '../oneDrive/patchDetect';

// Every other multer instance in this app bounds upload size explicitly (jobs.ts, plots.ts,
// jobDocuments.ts, crew.ts) - this one didn't, so an arbitrarily large request body could be
// buffered fully into memory (memoryStorage) before any row-count/shape validation runs.
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

export const patchRouter = Router();

patchRouter.post('/:jobId/patch/preview', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'CSV file is required' });
  const text = req.file.buffer.toString('utf-8');
  const { headers, rows } = parseWysiwygCsv(text);
  if (headers.length === 0) {
    return res.status(400).json({ error: 'Could not find a header row in this CSV' });
  }
  const saved = await prisma.appSetting.findUnique({ where: { key: 'patchMapping' } });
  const savedMapping = saved ? (JSON.parse(saved.valueJson) as Partial<Record<PatchFieldKey, string>>) : null;
  // Report which mapped columns are missing from this file so the UI can warn before import.
  const missingColumns = savedMapping
    ? Object.entries(savedMapping)
        .filter(([, col]) => col && !headers.includes(col))
        .map(([field, col]) => ({ field, column: col as string }))
    : [];
  res.json({ headers, rows, fieldKeys: PATCH_FIELD_KEYS, savedMapping, missingColumns });
});

async function loadSavedPatchMapping(): Promise<Partial<Record<PatchFieldKey, string>> | null> {
  const saved = await prisma.appSetting.findUnique({ where: { key: 'patchMapping' } });
  return saved ? JSON.parse(saved.valueJson) : null;
}

/**
 * Shared by the manual-upload import and the OneDrive auto-detect approval flow. Re-importing
 * a job's patch is expected to happen more than once - a venue-confirmed v2 of the same show -
 * so this merges the new file onto what's already there instead of wiping it and starting
 * over, using `address` (the Spot/unit number, not necessarily the live DMX patch - see
 * schema.prisma's Fixture.address doc comment) as the one stable identity a re-import carries:
 *
 * - A new row whose address matches an existing fixture's address is the same physical unit,
 *   so that fixture is UPDATED in place: fixtureType/mainUniverse/mainAddress/pixUniverse/
 *   pixAddress/mode/rawJson (everything the patch file itself says) are overwritten from the
 *   new row, while location/notes/ipAddress/subnetMask (whatever an admin set by hand) are left
 *   untouched. This is the "renew addresses, keep my settings" behaviour - re-patching a unit
 *   to a new DMX address in v2 updates mainUniverse/mainAddress without losing its location.
 * - A new row whose address doesn't match anything existing (or has no address at all) becomes
 *   a new Fixture.
 * - An existing ADDRESSED fixture whose address isn't in the new file at all is struck from the
 *   patch, so it's removed. An existing UNADDRESSED fixture is never auto-removed this way -
 *   there's no way to tell whether it corresponds to anything in the new file (nothing to
 *   match on), so it's left alone rather than risk deleting an admin's own notes/location on a
 *   fixture they haven't gotten an address for yet; the cost is that re-importing repeatedly
 *   without addressing it first can leave more than one unaddressed row for the same real unit,
 *   which is cleaned up the same way any duplicate/extra row is - deleted by hand.
 *
 * Scoped to one stage (groupId, null meaning "ungrouped") rather than the whole job, so a
 * multi-stage job can re-import one stage's patch without touching any other stage's already-
 * imported fixtures - see routes/fixtureGroups.ts for the stage model.
 */
async function mergeFixtures(jobId: string, fixtures: ReturnType<typeof buildFixturesFromRows>, groupId: string | null = null) {
  const existing = await prisma.fixture.findMany({ where: { jobId, groupId } });
  const existingByAddress = new Map(
    existing.filter((f) => f.address !== null).map((f) => [f.address as number, f])
  );
  const matchedIds = new Set<string>();

  const operations: Prisma.PrismaPromise<unknown>[] = fixtures.map((f) => {
    const match = f.address !== null ? existingByAddress.get(f.address) : undefined;
    if (match) {
      matchedIds.add(match.id);
      return prisma.fixture.update({
        where: { id: match.id },
        data: {
          fixtureType: f.fixtureType,
          mainUniverse: f.mainUniverse ?? null,
          mainAddress: f.mainAddress ?? null,
          pixUniverse: f.pixUniverse ?? null,
          pixAddress: f.pixAddress ?? null,
          mode: f.mode ?? null,
          rawJson: JSON.stringify(f.raw ?? {}),
        },
      });
    }
    return prisma.fixture.create({
      data: {
        jobId,
        groupId,
        address: f.address,
        fixtureType: f.fixtureType,
        mainUniverse: f.mainUniverse ?? null,
        mainAddress: f.mainAddress ?? null,
        pixUniverse: f.pixUniverse ?? null,
        pixAddress: f.pixAddress ?? null,
        mode: f.mode ?? null,
        location: f.location ?? null,
        ipAddress: f.ipAddress ?? null,
        subnetMask: f.subnetMask ?? null,
        notes: f.notes ?? null,
        rawJson: JSON.stringify(f.raw ?? {}),
      },
    });
  });

  const removedIds = existing.filter((f) => f.address !== null && !matchedIds.has(f.id)).map((f) => f.id);
  if (removedIds.length > 0) operations.push(prisma.fixture.deleteMany({ where: { id: { in: removedIds } } }));

  await prisma.$transaction(operations);

  return { matched: matchedIds.size, created: fixtures.length - matchedIds.size, removed: removedIds.length };
}

/**
 * Auto-adds a default (1 unit/case, no label override) global case rule for any fixture type
 * just imported that doesn't already have one (matched case-insensitively, same as
 * casePacking.ts's own lookup) - so a case rule always exists to tweak later instead of the
 * fixture silently packing as a 1-per-case default with nothing to find in Settings. Returns
 * the names actually created, for the import response to flag to the admin.
 */
async function addMissingFixtureTypeRules(fixtureTypes: string[]): Promise<string[]> {
  const distinct = [...new Set(fixtureTypes.filter(Boolean))];
  if (distinct.length === 0) return [];
  const existing = await prisma.fixtureTypeRule.findMany({ select: { name: true } });
  const have = new Set(existing.map((r) => r.name.toLowerCase()));
  const missing = distinct.filter((t) => !have.has(t.toLowerCase()));
  if (missing.length === 0) return [];
  await prisma.fixtureTypeRule.createMany({ data: missing.map((name) => ({ name })) });
  return missing;
}

/** A stage id from a request: undefined/null mean "Ungrouped"; anything else must be one of this job's stages. */
async function resolveGroupId(jobId: string, raw: unknown): Promise<{ groupId: string | null } | { error: string }> {
  if (raw === undefined || raw === null || raw === '') return { groupId: null };
  if (typeof raw !== 'string') return { error: 'groupId must be a stage id or null' };
  const group = await prisma.fixtureGroup.findFirst({ where: { id: raw, jobId }, select: { id: true } });
  return group ? { groupId: group.id } : { error: "That stage isn't part of this job" };
}

patchRouter.post('/:jobId/patch/import', async (req, res) => {
  const { jobId } = req.params;
  const { mapping, rows, groupId } = req.body ?? {};
  if (!Array.isArray(rows)) {
    return res.status(400).json({ error: 'rows are required' });
  }
  const stage = await resolveGroupId(jobId, groupId);
  if ('error' in stage) return res.status(400).json({ error: stage.error });
  const job = await prisma.job.findUnique({ where: { id: jobId } });
  if (!job) return res.status(404).json({ error: 'job not found' });

  // Column mapping is configured once in Settings; an explicit mapping in the request
  // overrides it for one-off imports with a different layout.
  const m = (mapping as Partial<Record<PatchFieldKey, string>> | undefined) ?? (await loadSavedPatchMapping());
  if (!m || !m.address || !m.fixtureType) {
    return res.status(400).json({
      error:
        'No column mapping available - set the CSV column mapping in Settings → Import Mapping (address and fixture type are required)',
    });
  }

  const fixtures = buildFixturesFromRows(rows as Record<string, string>[], m);
  const result = await mergeFixtures(jobId, fixtures, stage.groupId);
  const newFixtureTypes = await addMissingFixtureTypeRules(fixtures.map((f) => f.fixtureType));

  await logActivity(
    'patch.import',
    `${result.matched} updated, ${result.created} new, ${result.removed} removed`,
    jobId,
    req.user?.id
  );
  if (newFixtureTypes.length > 0) {
    await logActivity('fixture_type_rules.auto_create', newFixtureTypes.join(', '), jobId, req.user?.id);
  }
  res.json({ imported: fixtures.length, newFixtureTypes, ...result });
});

/** A PDF-extracted table always has these columns (see patchPdfExtract.ts). */
const PDF_PATCH_MAPPING: Partial<Record<PatchFieldKey, string>> = {
  address: 'Spot',
  fixtureType: 'Type',
  mainUniverseAddress: 'Patch',
  location: 'Position',
  mode: 'Mode',
  notes: 'Fixture Options',
};

/** Pulls "Mode: Standard" out of a PDF row's Fixture Options into its own Mode column. */
function withPdfMode(rows: Record<string, string>[], source: string): Record<string, string>[] {
  if (source !== 'pdf') return rows;
  return rows.map((r) => {
    const mode = /mode:\s*([^;]+)/i.exec(r['Fixture Options'] ?? '')?.[1]?.trim();
    return mode ? { ...r, Mode: mode } : r;
  });
}

async function loadPatchJob(jobId: string): Promise<{ job: Job } | { error: string; status: number }> {
  const job = await prisma.job.findUnique({ where: { id: jobId } });
  if (!job) return { error: 'job not found', status: 404 } as const;
  const config = await getOneDriveConfig();
  const hasOneDrive = config.enabled && Boolean(job.oneDriveFolderId);
  if (!hasOneDrive && (await prisma.plot.count({ where: { jobId } })) === 0) {
    return {
      status: 400,
      error: config.enabled
        ? 'This job has no OneDrive folder linked yet, and no plots uploaded on the Plots tab to choose from'
        : 'OneDrive is not configured yet, and this job has no plots uploaded on the Plots tab to choose from',
    };
  }
  return { job };
}

/** When each file name was last imported from OneDrive for this job (from the activity log). */
async function lastImportedByName(jobId: string): Promise<Map<string, Date>> {
  const entries = await prisma.activityLogEntry.findMany({
    where: { jobId, action: 'patch.onedrive_import' },
    select: { detail: true, createdAt: true },
    orderBy: { createdAt: 'desc' },
  });
  const out = new Map<string, Date>();
  for (const e of entries) {
    const name = /\bfrom (.+)$/.exec(e.detail ?? '')?.[1];
    if (name && !out.has(name)) out.set(name, e.createdAt);
  }
  return out;
}

/**
 * The files someone can pick as this job's patch: every CSV and PDF in its OneDrive folder tree
 * plus its Plots-tab PDFs, likeliest first (see oneDrive/patchDetect.ts's listPatchFiles).
 */
patchRouter.get('/:jobId/patch/onedrive-files', requirePermission('manageOneDrive'), async (req, res) => {
  const loaded = await loadPatchJob(req.params.jobId);
  if ('error' in loaded) return res.status(loaded.status).json({ error: loaded.error });
  let listing;
  try {
    listing = await listPatchFiles(loaded.job);
  } catch (err) {
    return res.status(502).json({ error: (err as Error).message });
  }
  const imported = await lastImportedByName(req.params.jobId);
  res.json({
    foldersSearched: listing.foldersSearched,
    truncated: listing.truncated,
    files: listing.files.map((f) => ({
      key: f.key,
      kind: f.kind,
      origin: f.origin,
      name: f.name,
      path: f.path,
      modifiedAt: f.modifiedAt,
      size: f.size,
      suggested: f.priority >= 2,
      lastImportedAt: imported.get(f.name) ?? null,
    })),
  });
});

/**
 * Reads the picked file and puts its rows up for review as the job's PENDING candidate - never
 * applied directly. Always replaces whatever candidate was there, even when it's the same file
 * already approved, so a patch can be imported again on purpose.
 */
patchRouter.post('/:jobId/patch/onedrive-files/read', requirePermission('manageOneDrive'), async (req, res) => {
  const { jobId } = req.params;
  const { key } = req.body ?? {};
  if (typeof key !== 'string' || !key) return res.status(400).json({ error: 'key is required' });
  const loaded = await loadPatchJob(jobId);
  if ('error' in loaded) return res.status(loaded.status).json({ error: loaded.error });

  // Re-list rather than trusting the key, so only a file inside this job's folder (or on its
  // Plots tab) can ever be read.
  let found;
  try {
    const { files } = await listPatchFiles(loaded.job);
    const file = files.find((f) => f.key === key);
    if (!file) return res.status(404).json({ error: "That file isn't in this job's OneDrive folder or Plots tab any more" });
    found = await readPatchFile(file);
  } catch (err) {
    return res.status(502).json({ error: (err as Error).message });
  }
  if (found.headers.length === 0 || found.rows.length === 0) {
    return res.status(422).json({
      error: found.source === 'pdf' ? `No patch table found in ${found.fileName}` : `Could not find any patch rows in ${found.fileName}`,
    });
  }

  const data = {
    oneDriveItemId: found.itemId,
    oneDriveItemPath: found.path,
    fileName: found.fileName,
    extractedFrom: found.source,
    sourceModifiedAt: found.modifiedAt,
    rowsJson: JSON.stringify(found.rows),
    status: 'PENDING',
  };
  const candidate = await prisma.patchImportCandidate.upsert({
    where: { jobId },
    create: { jobId, ...data },
    update: { ...data, detectedAt: new Date(), reviewedAt: null, reviewedBy: null, rejectionNote: null },
  });
  await logActivity('patch.onedrive_detect', `${found.fileName} (${found.source})`, jobId, req.user?.id);
  res.json({ candidate: toCandidateResponse(candidate) });
});

function toCandidateResponse(c: {
  id: string;
  fileName: string;
  oneDriveItemPath: string;
  extractedFrom: string;
  rowsJson: string;
  status: string;
  detectedAt: Date;
  reviewedAt: Date | null;
  reviewedBy: string | null;
  rejectionNote: string | null;
}) {
  const rows = JSON.parse(c.rowsJson) as Record<string, string>[];
  return {
    id: c.id,
    fileName: c.fileName,
    extractedFrom: c.extractedFrom,
    oneDriveItemPath: c.oneDriveItemPath,
    rowCount: rows.length,
    status: c.status,
    detectedAt: c.detectedAt,
    reviewedAt: c.reviewedAt,
    reviewedBy: c.reviewedBy,
    rejectionNote: c.rejectionNote,
  };
}

patchRouter.get('/:jobId/patch/onedrive-candidate', requirePermission('manageOneDrive'), async (req, res) => {
  const candidate = await prisma.patchImportCandidate.findUnique({ where: { jobId: req.params.jobId } });
  res.json(candidate ? toCandidateResponse(candidate) : null);
});

patchRouter.post('/:jobId/patch/onedrive-candidate/approve', requirePermission('manageOneDrive'), async (req, res) => {
  const { jobId } = req.params;
  const candidate = await prisma.patchImportCandidate.findUnique({ where: { jobId } });
  if (!candidate) return res.status(404).json({ error: 'No pending OneDrive patch import for this job' });
  if (candidate.status !== 'PENDING') {
    return res.status(409).json({ error: `This import was already ${candidate.status.toLowerCase()}` });
  }
  // Imports into the stage being viewed when it was approved (Ungrouped when none).
  const stage = await resolveGroupId(jobId, req.body?.groupId);
  if ('error' in stage) return res.status(400).json({ error: stage.error });

  // A PDF-extracted table always has the same columns (see patchPdfExtract.ts), so it gets its
  // own fixed mapping rather than the CSV mapping from Settings, whose column names won't match.
  const m = candidate.extractedFrom === 'pdf' ? PDF_PATCH_MAPPING : await loadSavedPatchMapping();
  if (!m || !m.address || !m.fixtureType) {
    return res.status(400).json({
      error:
        'No column mapping available - set the CSV column mapping in Settings → Import Mapping (address and fixture type are required)',
    });
  }

  const rows = withPdfMode(JSON.parse(candidate.rowsJson) as Record<string, string>[], candidate.extractedFrom);
  const fixtures = buildFixturesFromRows(rows, m);
  const result = await mergeFixtures(jobId, fixtures, stage.groupId);
  const newFixtureTypes = await addMissingFixtureTypeRules(fixtures.map((f) => f.fixtureType));
  const updated = await prisma.patchImportCandidate.update({
    where: { jobId },
    data: { status: 'APPROVED', reviewedAt: new Date(), reviewedBy: req.user?.id ?? null },
  });

  await logActivity(
    'patch.onedrive_import',
    `${result.matched} updated, ${result.created} new, ${result.removed} removed from ${candidate.fileName}`,
    jobId,
    req.user?.id
  );
  if (newFixtureTypes.length > 0) {
    await logActivity('fixture_type_rules.auto_create', newFixtureTypes.join(', '), jobId, req.user?.id);
  }
  res.json({ imported: fixtures.length, newFixtureTypes, ...result, candidate: toCandidateResponse(updated) });
});

patchRouter.post('/:jobId/patch/onedrive-candidate/reject', requirePermission('manageOneDrive'), async (req, res) => {
  const { jobId } = req.params;
  const { note } = req.body ?? {};
  const candidate = await prisma.patchImportCandidate.findUnique({ where: { jobId } });
  if (!candidate) return res.status(404).json({ error: 'No pending OneDrive patch import for this job' });
  if (candidate.status !== 'PENDING') {
    return res.status(409).json({ error: `This import was already ${candidate.status.toLowerCase()}` });
  }

  const updated = await prisma.patchImportCandidate.update({
    where: { jobId },
    data: {
      status: 'REJECTED',
      reviewedAt: new Date(),
      reviewedBy: req.user?.id ?? null,
      rejectionNote: typeof note === 'string' && note.trim() ? note.trim() : null,
    },
  });
  await logActivity('patch.onedrive_reject', candidate.fileName, jobId, req.user?.id);
  res.json({ candidate: toCandidateResponse(updated) });
});

patchRouter.get('/:jobId/fixtures', async (req, res) => {
  const fixtures = await prisma.fixture.findMany({
    where: { jobId: req.params.jobId },
    orderBy: { address: 'asc' },
  });
  res.json(fixtures);
});

const FIXTURE_EDITABLE_FIELDS = [
  'address',
  'fixtureType',
  'mainUniverse',
  'mainAddress',
  'pixUniverse',
  'pixAddress',
  'mode',
  'location',
  'groupId',
] as const;

/**
 * Bulk endpoints must be registered before the /:id routes below - Express matches routes in
 * registration order, and a literal "bulk" segment would otherwise be swallowed by :id.
 */
// Bulk edit of selected fixtures: set their location, and/or move them to another stage
// (groupId: a stage id, or null for Ungrouped).
patchRouter.put('/:jobId/fixtures/bulk', async (req, res) => {
  const { ids, location } = req.body ?? {};
  const movingStage = req.body && 'groupId' in req.body;
  if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ error: 'ids array is required' });
  if (location !== undefined && typeof location !== 'string') return res.status(400).json({ error: 'location must be text' });
  if (location === undefined && !movingStage) return res.status(400).json({ error: 'location or groupId is required' });
  const data: { location?: string | null; groupId?: string | null } = {};
  if (location !== undefined) data.location = location.trim() === '' ? null : location;
  let stageName = 'Ungrouped';
  if (movingStage) {
    const stage = await resolveGroupId(req.params.jobId, req.body.groupId);
    if ('error' in stage) return res.status(400).json({ error: stage.error });
    data.groupId = stage.groupId;
    if (stage.groupId) stageName = (await prisma.fixtureGroup.findUnique({ where: { id: stage.groupId }, select: { name: true } }))?.name ?? stageName;
  }
  const result = await prisma.fixture.updateMany({ where: { id: { in: ids }, jobId: req.params.jobId }, data });
  const changes = [location !== undefined && `location "${location}"`, movingStage && `moved to ${stageName}`].filter(Boolean).join(', ');
  await logActivity('patch.bulk_update', `${result.count} fixtures -> ${changes}`, req.params.jobId, req.user?.id);
  res.json({ updated: result.count });
});

patchRouter.delete('/:jobId/fixtures/bulk', async (req, res) => {
  const { ids } = req.body ?? {};
  if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ error: 'ids array is required' });
  const result = await prisma.fixture.deleteMany({ where: { id: { in: ids }, jobId: req.params.jobId } });
  await logActivity('patch.bulk_delete', `${result.count} fixtures`, req.params.jobId, req.user?.id);
  res.json({ deleted: result.count });
});

patchRouter.put('/:jobId/fixtures/:id', async (req, res) => {
  const data: Record<string, unknown> = {};
  for (const field of FIXTURE_EDITABLE_FIELDS) {
    if (req.body?.[field] === undefined) continue;
    const value = req.body[field];
    if (field === 'address') {
      if (value === '' || value === null) {
        data.address = null;
      } else {
        const n = Number(value);
        if (!Number.isFinite(n)) return res.status(400).json({ error: 'address must be a number' });
        data.address = n;
      }
    } else if (['mainUniverse', 'mainAddress', 'pixUniverse', 'pixAddress'].includes(field)) {
      data[field] = value === '' || value === null ? null : Number(value);
    } else if (field === 'fixtureType') {
      if (!value || !String(value).trim()) {
        return res.status(400).json({ error: 'fixtureType is required' });
      }
      data.fixtureType = value;
    } else {
      data[field] = value === '' ? null : value;
    }
  }
  const { count } = await prisma.fixture.updateMany({ where: { id: req.params.id, jobId: req.params.jobId }, data });
  if (count === 0) return res.status(404).json({ error: 'not found' });
  res.json(await prisma.fixture.findUniqueOrThrow({ where: { id: req.params.id } }));
});

patchRouter.delete('/:jobId/fixtures/:id', async (req, res) => {
  const { count } = await prisma.fixture.deleteMany({ where: { id: req.params.id, jobId: req.params.jobId } });
  if (count === 0) return res.status(404).json({ error: 'not found' });
  res.status(204).end();
});
