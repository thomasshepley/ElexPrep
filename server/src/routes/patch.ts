import { Router } from 'express';
import multer from 'multer';
import type { Prisma } from '@prisma/client';
import { PATCH_FIELD_KEYS, PatchFieldKey } from '@elexprep/shared';
import { prisma, logActivity } from '../db';
import { requirePermission } from '../permissions';
import { parseWysiwygCsv, buildFixturesFromRows } from '../patchCsv';
import { getOneDriveConfig } from '../oneDrive/config';
import { findPatchSource } from '../oneDrive/patchDetect';

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

patchRouter.post('/:jobId/patch/import', async (req, res) => {
  const { jobId } = req.params;
  const { mapping, rows, groupId } = req.body ?? {};
  if (!Array.isArray(rows)) {
    return res.status(400).json({ error: 'rows are required' });
  }
  if (groupId !== undefined && groupId !== null && typeof groupId !== 'string') {
    return res.status(400).json({ error: 'groupId must be a string or null' });
  }
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
  const result = await mergeFixtures(jobId, fixtures, groupId ?? null);
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

/**
 * Looks for a patch source in the job's OneDrive folder - an exported CSV in the "Patch"
 * subfolder first, falling back to extracting a table out of the job's CAD PDF when there's no
 * CSV (see oneDrive/patchDetect.ts's findPatchSource) - and, if found, stores it as a PENDING
 * candidate for review - never applied directly. A re-scan that finds the same file (by its
 * Graph lastModifiedDateTime) leaves the existing candidate's status alone; a re-scan that finds
 * a changed or new file overwrites it back to PENDING even if the old one was already reviewed.
 */
patchRouter.post('/:jobId/patch/onedrive-scan', requirePermission('manageOneDrive'), async (req, res) => {
  const { jobId } = req.params;
  const job = await prisma.job.findUnique({ where: { id: jobId } });
  if (!job) return res.status(404).json({ error: 'job not found' });
  const config = await getOneDriveConfig();
  if (!config.enabled) return res.status(400).json({ error: 'OneDrive is not configured yet' });
  if (!job.oneDriveFolderId) return res.status(400).json({ error: 'This job has no OneDrive folder linked yet' });

  let found;
  try {
    found = await findPatchSource(job);
  } catch (err) {
    return res.status(502).json({ error: (err as Error).message });
  }
  if (!found) return res.json({ detected: false });

  const existing = await prisma.patchImportCandidate.findUnique({ where: { jobId } });
  if (existing && existing.sourceModifiedAt.getTime() === found.modifiedAt.getTime()) {
    return res.json({ detected: true, candidate: toCandidateResponse(existing) });
  }
  if (found.headers.length === 0) {
    return res.status(400).json({ error: `Could not find a header row in ${found.fileName}` });
  }

  const candidate = await prisma.patchImportCandidate.upsert({
    where: { jobId },
    create: {
      jobId,
      oneDriveItemId: found.itemId,
      oneDriveItemPath: found.path,
      fileName: found.fileName,
      extractedFrom: found.source,
      sourceModifiedAt: found.modifiedAt,
      rowsJson: JSON.stringify(found.rows),
      status: 'PENDING',
    },
    update: {
      oneDriveItemId: found.itemId,
      oneDriveItemPath: found.path,
      fileName: found.fileName,
      extractedFrom: found.source,
      sourceModifiedAt: found.modifiedAt,
      rowsJson: JSON.stringify(found.rows),
      status: 'PENDING',
      detectedAt: new Date(),
      reviewedAt: null,
      reviewedBy: null,
      rejectionNote: null,
    },
  });
  await logActivity('patch.onedrive_detect', `${found.fileName} (${found.source})`, jobId, req.user?.id);
  res.json({ detected: true, candidate: toCandidateResponse(candidate) });
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

  const m = await loadSavedPatchMapping();
  if (!m || !m.address || !m.fixtureType) {
    return res.status(400).json({
      error:
        'No column mapping available - set the CSV column mapping in Settings → Import Mapping (address and fixture type are required)',
    });
  }

  const rows = JSON.parse(candidate.rowsJson) as Record<string, string>[];
  const fixtures = buildFixturesFromRows(rows, m);
  const result = await mergeFixtures(jobId, fixtures);
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
patchRouter.put('/:jobId/fixtures/bulk', async (req, res) => {
  const { ids, location } = req.body ?? {};
  if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ error: 'ids array is required' });
  if (typeof location !== 'string') return res.status(400).json({ error: 'location is required' });
  const result = await prisma.fixture.updateMany({
    where: { id: { in: ids }, jobId: req.params.jobId },
    data: { location: location.trim() === '' ? null : location },
  });
  await logActivity('patch.bulk_update', `${result.count} fixtures -> location "${location}"`, req.params.jobId, req.user?.id);
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
