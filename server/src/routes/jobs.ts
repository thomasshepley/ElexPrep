import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { prisma, logActivity } from '../db';

const uploadDir = path.join(__dirname, '..', '..', 'uploads');
fs.mkdirSync(uploadDir, { recursive: true });
const upload = multer({
  storage: multer.diskStorage({
    destination: uploadDir,
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname) || '';
      cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`);
    },
  }),
});

export const jobsRouter = Router();

jobsRouter.get('/', async (_req, res) => {
  const jobs = await prisma.job.findMany({ orderBy: { createdAt: 'desc' } });
  res.json(jobs);
});

jobsRouter.post('/', async (req, res) => {
  const { name, venue } = req.body ?? {};
  if (!name || typeof name !== 'string') {
    return res.status(400).json({ error: 'name is required' });
  }
  const job = await prisma.job.create({ data: { name, venue: venue ?? null } });
  await logActivity('job.create', name, job.id);
  res.status(201).json(job);
});

jobsRouter.get('/:id', async (req, res) => {
  const job = await prisma.job.findUnique({ where: { id: req.params.id } });
  if (!job) return res.status(404).json({ error: 'not found' });
  res.json(job);
});

jobsRouter.put('/:id', async (req, res) => {
  const { name, venue, currentRmsOpportunityId } = req.body ?? {};
  const job = await prisma.job.update({
    where: { id: req.params.id },
    data: {
      ...(name !== undefined ? { name } : {}),
      ...(venue !== undefined ? { venue } : {}),
      ...(currentRmsOpportunityId !== undefined ? { currentRmsOpportunityId } : {}),
    },
  });
  res.json(job);
});

jobsRouter.delete('/:id', async (req, res) => {
  await prisma.job.delete({ where: { id: req.params.id } });
  res.status(204).end();
});

jobsRouter.post('/:id/logo', upload.single('logo'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'logo file is required' });
  const job = await prisma.job.update({
    where: { id: req.params.id },
    data: { logoPath: req.file.filename },
  });
  await logActivity('job.logo_upload', req.file.originalname, job.id);
  res.json(job);
});

jobsRouter.get('/:id/logo', async (req, res) => {
  const job = await prisma.job.findUnique({ where: { id: req.params.id } });
  if (!job?.logoPath) return res.status(404).end();
  res.sendFile(path.join(uploadDir, job.logoPath));
});

export { uploadDir, upload };
