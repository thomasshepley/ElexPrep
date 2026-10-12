import { Router } from 'express';
import multer from 'multer';
import { PATCH_FIELD_KEYS, PatchFieldKey } from '@elexprep/shared';
import { prisma, logActivity } from '../db';
import { requirePermission } from '../permissions';
import { parseWysiwygCsv, buildFixturesFromRows } from '../patchCsv';
import { getOneDriveConfig } from '../oneDrive/config';
import { streamOneDriveFile } from '../oneDrive/client';
import { findPatchCsv } from '../oneDrive/patchDetect';

const upload = multer({ storage: multer.memoryStorage() });

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

/** The destructive replace shared by the manual-upload import and the OneDrive auto-detect
 * approval flow: wipes the job's existing fixtures and writes the freshly-built set in one
 * transaction. */
async function replaceFixtures(jobId: string, fixtures: ReturnType<typeof buildFixturesFromRows>) {
  await prisma.$transaction([
    prisma.fixture.deleteMany({ where: { jobId } }),
    prisma.fixture.createMany({
      data: fixtures.map((f) => ({
        jobId,
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
      })),
    }),
  ]);
}

patchRouter.post('/:jobId/patch/import', async (req, res) => {
  const { jobId } = req.params;
  const { mapping, rows } = req.body ?? {};
  if (!Array.isArray(rows)) {
    return res.status(400).json({ error: 'rows are required' });
  }
  const job = await prisma.job.findUnique({ where: { id: jobId } });
  if (!job) return res.status(404).json({ error: 'job not found' });

  // Column mapping is configured once in Settings; an explicit mapping in the request
  // overrides it for one-off imports with a different layout.
  const m = (mapping as Partial<Record<PatchFieldKey, string>> | undefined) ?? (await loadSavedPatchMapping());
  if (!m || !m.address || !m.fixtureType) {
    return res.status(400).json({
      error:
        'No column mapping available — set the CSV column mapping in Settings → Import Mapping (address and fixture type are required)',
    });
  }

  const fixtures = buildFixturesFromRows(rows as Record<string, string>[], m);
  await replaceFixtures(jobId, fixtures);

  await logActivity('patch.import', `${fixtures.length} fixtures`, jobId, req.user?.id);
  res.json({ imported: fixtures.length });
});

/**
 * Looks for a patch CSV in the job's OneDrive "Patch" subfolder (see oneDrive/patchDetect.ts)
 * and, if found, parses it and stores it as a PENDING candidate for review — never applied
 * directly, unlike the CAD PDF auto-surface. A re-scan that finds the same file (by its Graph
 * lastModifiedDateTime) leaves the existing candidate's status alone; a re-scan that finds a
 * changed or new file overwrites it back to PENDING even if the old one was already reviewed.
 */
patchRouter.post('/:jobId/patch/onedrive-scan', requirePermission('manageOneDrive'), async (req, res) => {
  const { jobId } = req.params;
  const job = await prisma.job.findUnique({ where: { id: jobId } });
  if (!job) return res.status(404).json({ error: 'job not found' });
  const config = await getOneDriveConfig();
  if (!config.enabled) return res.status(400).json({ error: 'OneDrive is not configured yet' });
  if (!job.oneDriveFolderId) return res.status(400).json({ error: 'This job has no OneDrive folder linked yet' });

  let detected;
  try {
    detected = await findPatchCsv(job);
  } catch (err) {
    return res.status(502).json({ error: (err as Error).message });
  }
  if (!detected) return res.json({ detected: false });

  const existing = await prisma.patchImportCandidate.findUnique({ where: { jobId } });
  if (existing && existing.sourceModifiedAt.getTime() === detected.modifiedAt.getTime()) {
    return res.json({ detected: true, candidate: toCandidateResponse(existing) });
  }

  const { stream } = await streamOneDriveFile(config, detected.itemId);
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  const text = Buffer.concat(chunks).toString('utf-8');
  const { headers, rows } = parseWysiwygCsv(text);
  if (headers.length === 0) {
    return res.status(400).json({ error: `Could not find a header row in ${detected.name}` });
  }

  const candidate = await prisma.patchImportCandidate.upsert({
    where: { jobId },
    create: {
      jobId,
      oneDriveItemId: detected.itemId,
      oneDriveItemPath: detected.path,
      fileName: detected.name,
      sourceModifiedAt: detected.modifiedAt,
      rowsJson: JSON.stringify(rows),
      status: 'PENDING',
    },
    update: {
      oneDriveItemId: detected.itemId,
      oneDriveItemPath: detected.path,
      fileName: detected.name,
      sourceModifiedAt: detected.modifiedAt,
      rowsJson: JSON.stringify(rows),
      status: 'PENDING',
      detectedAt: new Date(),
      reviewedAt: null,
      reviewedBy: null,
      rejectionNote: null,
    },
  });
  await logActivity('patch.onedrive_detect', detected.name, jobId, req.user?.id);
  res.json({ detected: true, candidate: toCandidateResponse(candidate) });
});

function toCandidateResponse(c: {
  id: string;
  fileName: string;
  oneDriveItemPath: string;
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
        'No column mapping available — set the CSV column mapping in Settings → Import Mapping (address and fixture type are required)',
    });
  }

  const rows = JSON.parse(candidate.rowsJson) as Record<string, string>[];
  const fixtures = buildFixturesFromRows(rows, m);
  await replaceFixtures(jobId, fixtures);
  const updated = await prisma.patchImportCandidate.update({
    where: { jobId },
    data: { status: 'APPROVED', reviewedAt: new Date(), reviewedBy: req.user?.id ?? null },
  });

  await logActivity('patch.onedrive_import', `${fixtures.length} fixtures from ${candidate.fileName}`, jobId, req.user?.id);
  res.json({ imported: fixtures.length, candidate: toCandidateResponse(updated) });
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
] as const;

/**
 * Bulk endpoints must be registered before the /:id routes below — Express matches routes in
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
      const n = Number(value);
      if (value === '' || value === null || !Number.isFinite(n)) {
        return res.status(400).json({ error: 'address is required and must be a number' });
      }
      data.address = n;
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
  const fixture = await prisma.fixture.update({ where: { id: req.params.id }, data });
  res.json(fixture);
});

patchRouter.delete('/:jobId/fixtures/:id', async (req, res) => {
  await prisma.fixture.delete({ where: { id: req.params.id } });
  res.status(204).end();
});
