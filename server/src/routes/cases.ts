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

casesRouter.get('/:jobId/cases', async (req, res) => {
  const records = await prisma.caseGroupRecord.findMany({ where: { jobId: req.params.jobId } });
  res.json(
    records.map((r) => ({
      ...r,
      addresses: JSON.parse(r.addressesJson) as number[],
    }))
  );
});
