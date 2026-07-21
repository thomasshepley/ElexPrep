import { Router } from 'express';
import { packFixturesIntoCases, RawFixtureInput } from '@elexprep/shared';
import { prisma, logActivity } from '../db';

export const casesRouter = Router();

casesRouter.post('/:jobId/cases/generate', async (req, res) => {
  const { jobId } = req.params;
  const [fixtures, rules] = await Promise.all([
    prisma.fixture.findMany({ where: { jobId } }),
    prisma.fixtureTypeRule.findMany(),
  ]);

  const inputs: RawFixtureInput[] = fixtures.map((f) => ({
    address: f.address,
    fixtureType: f.fixtureType,
    location: f.location,
  }));

  const groups = packFixturesIntoCases(inputs, rules);

  await prisma.$transaction([
    prisma.caseGroupRecord.deleteMany({ where: { jobId } }),
    prisma.caseGroupRecord.createMany({
      data: groups.map((g) => ({
        jobId,
        fixtureType: g.fixtureType,
        label: g.label,
        location: g.location ?? null,
        addressesJson: JSON.stringify(g.addresses),
      })),
    }),
  ]);

  await logActivity('cases.generate', `${groups.length} cases`, jobId, req.user?.id);
  res.json({ generated: groups.length });
});

function serializeCase(r: { addressesJson: string; [key: string]: unknown }) {
  return { ...r, addresses: JSON.parse(r.addressesJson) as number[] };
}

casesRouter.get('/:jobId/cases', async (req, res) => {
  const records = await prisma.caseGroupRecord.findMany({
    where: { jobId: req.params.jobId },
    orderBy: { fixtureType: 'asc' },
  });
  res.json(records.map(serializeCase));
});

/** Adds a single manual case row — for cases the algorithm didn't create (or got wrong)
 * without needing a full regenerate, which would wipe every other manual edit. */
casesRouter.post('/:jobId/cases', async (req, res) => {
  const { fixtureType, label, location, addresses } = req.body ?? {};
  if (!fixtureType || !label) {
    return res.status(400).json({ error: 'fixtureType and label are required' });
  }
  const record = await prisma.caseGroupRecord.create({
    data: {
      jobId: req.params.jobId,
      fixtureType,
      label,
      location: location || null,
      addressesJson: JSON.stringify(Array.isArray(addresses) ? addresses : []),
    },
  });
  await logActivity('cases.create', `${fixtureType} ${label}`, req.params.jobId, req.user?.id);
  res.status(201).json(serializeCase(record));
});

casesRouter.put('/:jobId/cases/:id', async (req, res) => {
  const { fixtureType, label, location } = req.body ?? {};
  const record = await prisma.caseGroupRecord.update({
    where: { id: req.params.id },
    data: {
      ...(fixtureType !== undefined ? { fixtureType } : {}),
      ...(label !== undefined ? { label } : {}),
      ...(location !== undefined ? { location: location || null } : {}),
    },
  });
  res.json(serializeCase(record));
});

casesRouter.delete('/:jobId/cases/:id', async (req, res) => {
  await prisma.caseGroupRecord.delete({ where: { id: req.params.id } });
  res.status(204).end();
});
