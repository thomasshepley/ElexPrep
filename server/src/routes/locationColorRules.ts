import { Router } from 'express';
import { prisma, logActivity } from '../db';

export const locationColorRulesRouter = Router();

locationColorRulesRouter.get('/', async (_req, res) => {
  const rules = await prisma.locationColorRule.findMany({ orderBy: { location: 'asc' } });
  res.json(rules);
});

locationColorRulesRouter.post('/', async (req, res) => {
  const { location, color } = req.body ?? {};
  if (!location || typeof location !== 'string') {
    return res.status(400).json({ error: 'location is required' });
  }
  if (!color || !/^#[0-9a-fA-F]{6}$/.test(color)) {
    return res.status(400).json({ error: 'color must be a hex value like #1FA34C' });
  }
  const rule = await prisma.locationColorRule.create({ data: { location, color } });
  await logActivity('location_color_rule.create', `${location} = ${color}`, undefined, req.user?.id);
  res.status(201).json(rule);
});

locationColorRulesRouter.put('/:id', async (req, res) => {
  const { location, color } = req.body ?? {};
  if (color !== undefined && !/^#[0-9a-fA-F]{6}$/.test(color)) {
    return res.status(400).json({ error: 'color must be a hex value like #1FA34C' });
  }
  const rule = await prisma.locationColorRule.update({
    where: { id: req.params.id },
    data: {
      ...(location !== undefined ? { location } : {}),
      ...(color !== undefined ? { color } : {}),
    },
  });
  res.json(rule);
});

locationColorRulesRouter.delete('/:id', async (req, res) => {
  await prisma.locationColorRule.delete({ where: { id: req.params.id } });
  res.status(204).end();
});
