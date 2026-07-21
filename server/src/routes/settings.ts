import { Router } from 'express';
import { prisma, logActivity } from '../db';

export const settingsRouter = Router();

/** Setting keys the API will accept — stops arbitrary keys accumulating in the table. */
const ALLOWED_KEYS = new Set(['patchMapping']);

settingsRouter.get('/:key', async (req, res) => {
  if (!ALLOWED_KEYS.has(req.params.key)) return res.status(404).json({ error: 'Unknown setting' });
  const setting = await prisma.appSetting.findUnique({ where: { key: req.params.key } });
  res.json({ key: req.params.key, value: setting ? JSON.parse(setting.valueJson) : null });
});

settingsRouter.put('/:key', async (req, res) => {
  if (!ALLOWED_KEYS.has(req.params.key)) return res.status(404).json({ error: 'Unknown setting' });
  const { value } = req.body ?? {};
  if (value === undefined) return res.status(400).json({ error: 'value is required' });
  const valueJson = JSON.stringify(value);
  await prisma.appSetting.upsert({
    where: { key: req.params.key },
    create: { key: req.params.key, valueJson },
    update: { valueJson },
  });
  await logActivity('settings.update', req.params.key, undefined, req.user?.id);
  res.json({ key: req.params.key, value });
});
