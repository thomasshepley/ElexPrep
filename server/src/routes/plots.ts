import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { prisma, logActivity } from '../db';

import { uploadDir } from './jobs';

export const plotsDir = path.join(uploadDir, 'plots');
fs.mkdirSync(plotsDir, { recursive: true });

const upload = multer({
  storage: multer.diskStorage({
    destination: plotsDir,
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname) || '.pdf';
      cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`);
    },
  }),
  fileFilter: (_req, file, cb) => {
    cb(null, file.mimetype === 'application/pdf' || file.originalname.toLowerCase().endsWith('.pdf'));
  },
  limits: { fileSize: 100 * 1024 * 1024 },
});

export const plotsRouter = Router();

plotsRouter.get('/:jobId/plots', async (req, res) => {
  const plots = await prisma.plot.findMany({
    where: { jobId: req.params.jobId },
    orderBy: { createdAt: 'desc' },
  });
  res.json(plots);
});

plotsRouter.post('/:jobId/plots', upload.single('plot'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'A PDF file is required' });
  const plot = await prisma.plot.create({
    data: {
      jobId: req.params.jobId,
      fileName: req.file.filename,
      originalName: req.file.originalname,
    },
  });
  await logActivity('plot.upload', req.file.originalname, req.params.jobId, req.user?.id);
  res.status(201).json(plot);
});

plotsRouter.get('/:jobId/plots/:id/file', async (req, res) => {
  const plot = await prisma.plot.findUnique({ where: { id: req.params.id } });
  if (!plot || plot.jobId !== req.params.jobId) return res.status(404).end();
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(plot.originalName)}"`);
  res.sendFile(path.join(plotsDir, plot.fileName));
});

plotsRouter.delete('/:jobId/plots/:id', async (req, res) => {
  const plot = await prisma.plot.findUnique({ where: { id: req.params.id } });
  if (!plot || plot.jobId !== req.params.jobId) return res.status(404).end();
  await prisma.plot.delete({ where: { id: plot.id } });
  fs.promises.unlink(path.join(plotsDir, plot.fileName)).catch(() => {});
  await logActivity('plot.delete', plot.originalName, req.params.jobId, req.user?.id);
  res.status(204).end();
});
