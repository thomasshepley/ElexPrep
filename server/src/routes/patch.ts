import { Router } from 'express';
import Papa from 'papaparse';
import multer from 'multer';
import { PATCH_FIELD_KEYS, PatchFieldKey, RawFixtureInput } from '@elexprep/shared';
import { prisma, logActivity } from '../db';

const upload = multer({ storage: multer.memoryStorage() });

export const patchRouter = Router();

patchRouter.post('/:jobId/patch/preview', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'CSV file is required' });
  const text = req.file.buffer.toString('utf-8');
  const parsed = Papa.parse<Record<string, string>>(text, { header: true, skipEmptyLines: true });
  if (parsed.errors.length) {
    return res.status(400).json({ error: 'Could not parse CSV', details: parsed.errors.slice(0, 5) });
  }
  const headers = parsed.meta.fields ?? [];
  res.json({ headers, rows: parsed.data, fieldKeys: PATCH_FIELD_KEYS });
});

function toInt(v: string | undefined | null): number | null {
  if (v === undefined || v === null || v.trim() === '') return null;
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : null;
}

patchRouter.post('/:jobId/patch/import', async (req, res) => {
  const { jobId } = req.params;
  const { mapping, rows } = req.body ?? {};
  if (!mapping || !Array.isArray(rows)) {
    return res.status(400).json({ error: 'mapping and rows are required' });
  }
  const job = await prisma.job.findUnique({ where: { id: jobId } });
  if (!job) return res.status(404).json({ error: 'job not found' });

  const m = mapping as Partial<Record<PatchFieldKey, string>>;
  if (!m.address || !m.fixtureType) {
    return res.status(400).json({ error: 'address and fixtureType must be mapped' });
  }

  const fixtures: RawFixtureInput[] = [];
  for (const row of rows as Record<string, string>[]) {
    const address = toInt(row[m.address]);
    const fixtureType = (row[m.fixtureType] ?? '').trim();
    if (address === null || !fixtureType) continue;
    fixtures.push({
      address,
      fixtureType,
      mainUniverse: m.mainUniverse ? toInt(row[m.mainUniverse]) : null,
      mainAddress: m.mainAddress ? toInt(row[m.mainAddress]) : null,
      pixUniverse: m.pixUniverse ? toInt(row[m.pixUniverse]) : null,
      pixAddress: m.pixAddress ? toInt(row[m.pixAddress]) : null,
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

  await logActivity('patch.import', `${fixtures.length} fixtures`, jobId);
  res.json({ imported: fixtures.length });
});

patchRouter.get('/:jobId/fixtures', async (req, res) => {
  const fixtures = await prisma.fixture.findMany({
    where: { jobId: req.params.jobId },
    orderBy: { address: 'asc' },
  });
  res.json(fixtures);
});
