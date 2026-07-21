import { Router } from 'express';
import { prisma, logActivity } from '../db';

export const fixtureTypeRulesRouter = Router();

fixtureTypeRulesRouter.get('/', async (_req, res) => {
  const rules = await prisma.fixtureTypeRule.findMany({ orderBy: { name: 'asc' } });
  res.json(rules);
});

fixtureTypeRulesRouter.post('/', async (req, res) => {
  const { name, unitsPerCase, caseLabelOverride } = req.body ?? {};
  if (!name || typeof name !== 'string') {
    return res.status(400).json({ error: 'name is required' });
  }
  const rule = await prisma.fixtureTypeRule.create({
    data: {
      name,
      unitsPerCase: Number.isFinite(unitsPerCase) ? unitsPerCase : 1,
      caseLabelOverride: caseLabelOverride ?? null,
    },
  });
  await logActivity('fixture_type_rule.create', `${name} (${rule.unitsPerCase}/case)`);
  res.status(201).json(rule);
});

fixtureTypeRulesRouter.put('/:id', async (req, res) => {
  const { name, unitsPerCase, caseLabelOverride } = req.body ?? {};
  const rule = await prisma.fixtureTypeRule.update({
    where: { id: req.params.id },
    data: {
      ...(name !== undefined ? { name } : {}),
      ...(unitsPerCase !== undefined ? { unitsPerCase } : {}),
      ...(caseLabelOverride !== undefined ? { caseLabelOverride } : {}),
    },
  });
  res.json(rule);
});

fixtureTypeRulesRouter.delete('/:id', async (req, res) => {
  await prisma.fixtureTypeRule.delete({ where: { id: req.params.id } });
  res.status(204).end();
});
