import { Router } from 'express';
import Papa from 'papaparse';
import multer from 'multer';
import { PATCH_FIELD_KEYS, PatchFieldKey, RawFixtureInput, findHeaderRowIndex, splitUniverseAddress } from '@elexprep/shared';
import { prisma, logActivity } from '../db';

const upload = multer({ storage: multer.memoryStorage() });

export const patchRouter = Router();

/**
 * Real patch exports (e.g. CAST Wysiwyg's patch report) often have a few title/metadata rows
 * before the real column header row, plus blank rows and "Type: X" sub-group marker rows mixed
 * in with the data further down — so the header row can't just be assumed to be row 1.
 */
function parseWysiwygCsv(text: string): { headers: string[]; rows: Record<string, string>[] } {
  const raw = Papa.parse<string[]>(text, { skipEmptyLines: false });
  const allRows = raw.data as string[][];
  const headerRowIndex = findHeaderRowIndex(allRows);
  const headerRow = (allRows[headerRowIndex] ?? []).map((h) => (h ?? '').trim());
  const rows = allRows
    .slice(headerRowIndex + 1)
    .filter((r) => r.some((c) => (c ?? '').trim() !== ''))
    .map((r) => {
      const obj: Record<string, string> = {};
      headerRow.forEach((h, i) => {
        if (h) obj[h] = (r[i] ?? '').trim();
      });
      return obj;
    });
  return { headers: headerRow.filter(Boolean), rows };
}

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

function toInt(v: string | undefined | null): number | null {
  if (v === undefined || v === null || v.trim() === '') return null;
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : null;
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
  let m = mapping as Partial<Record<PatchFieldKey, string>> | undefined;
  if (!m) {
    const saved = await prisma.appSetting.findUnique({ where: { key: 'patchMapping' } });
    if (saved) m = JSON.parse(saved.valueJson);
  }
  if (!m || !m.address || !m.fixtureType) {
    return res.status(400).json({
      error:
        'No column mapping available — set the CSV column mapping in Settings → Import Mapping (address and fixture type are required)',
    });
  }

  const fixtures: RawFixtureInput[] = [];
  for (const row of rows as Record<string, string>[]) {
    const address = toInt(row[m.address]);
    const fixtureType = (row[m.fixtureType] ?? '').trim();
    if (address === null || !fixtureType) continue;
    // Some patch software (e.g. Wysiwyg) exports a single "universe.address" column instead
    // of two separate ones — split it when that mapping is used, otherwise fall back to the
    // separately-mapped universe/address columns.
    const mainSplit = m.mainUniverseAddress ? splitUniverseAddress(row[m.mainUniverseAddress]) : null;
    const pixSplit = m.pixUniverseAddress ? splitUniverseAddress(row[m.pixUniverseAddress]) : null;
    fixtures.push({
      address,
      fixtureType,
      mainUniverse: mainSplit ? mainSplit.universe : m.mainUniverse ? toInt(row[m.mainUniverse]) : null,
      mainAddress: mainSplit ? mainSplit.address : m.mainAddress ? toInt(row[m.mainAddress]) : null,
      pixUniverse: pixSplit ? pixSplit.universe : m.pixUniverse ? toInt(row[m.pixUniverse]) : null,
      pixAddress: pixSplit ? pixSplit.address : m.pixAddress ? toInt(row[m.pixAddress]) : null,
      mode: m.mode ? row[m.mode] ?? null : null,
      location: m.location ? row[m.location] ?? null : null,
      ipAddress: m.ipAddress ? row[m.ipAddress] ?? null : null,
      subnetMask: m.subnetMask ? row[m.subnetMask] ?? null : null,
      notes: m.notes ? row[m.notes] ?? null : null,
      raw: row,
    });
  }

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

  await logActivity('patch.import', `${fixtures.length} fixtures`, jobId, req.user?.id);
  res.json({ imported: fixtures.length });
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
