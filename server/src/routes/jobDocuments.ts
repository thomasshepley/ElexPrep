import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { prisma, logActivity } from '../db';
import { requireRole } from '../auth';
import { uploadDir } from './jobs';

/**
 * General job files (call sheets, info packs, contracts) - unencrypted, same pattern as
 * routes/plots.ts, just a different document category. Part of the crew portal's "Why"
 * section; reads are open to any signed-in staff account, writes are admin-only.
 */
const jobDocumentsDir = path.join(uploadDir, 'job-documents');
fs.mkdirSync(jobDocumentsDir, { recursive: true });

const upload = multer({
  storage: multer.diskStorage({
    destination: jobDocumentsDir,
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname) || '';
      cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`);
    },
  }),
  fileFilter: (_req, file, cb) => {
    cb(null, file.mimetype === 'application/pdf' || file.mimetype.startsWith('image/'));
  },
  limits: { fileSize: 25 * 1024 * 1024 },
});

export const jobDocumentsRouter = Router();

jobDocumentsRouter.get('/:jobId/documents', async (req, res) => {
  const documents = await prisma.jobDocument.findMany({
    where: { jobId: req.params.jobId },
    orderBy: { createdAt: 'desc' },
  });
  res.json(documents);
});

jobDocumentsRouter.post('/:jobId/documents', requireRole('ADMIN'), upload.single('document'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'A PDF or image file is required' });
  const document = await prisma.jobDocument.create({
    data: {
      jobId: req.params.jobId,
      fileName: req.file.filename,
      originalName: req.file.originalname,
      mimeType: req.file.mimetype,
    },
  });
  await logActivity('job_document.upload', req.file.originalname, req.params.jobId, req.user?.id);
  res.status(201).json(document);
});

jobDocumentsRouter.get('/:jobId/documents/:id/file', async (req, res) => {
  const document = await prisma.jobDocument.findUnique({ where: { id: req.params.id } });
  if (!document || document.jobId !== req.params.jobId) return res.status(404).end();
  res.setHeader('Content-Type', document.mimeType);
  res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(document.originalName)}"`);
  res.sendFile(path.join(jobDocumentsDir, document.fileName));
});

jobDocumentsRouter.delete('/:jobId/documents/:id', requireRole('ADMIN'), async (req, res) => {
  const document = await prisma.jobDocument.findUnique({ where: { id: req.params.id } });
  if (!document || document.jobId !== req.params.jobId) return res.status(404).end();
  await prisma.jobDocument.delete({ where: { id: document.id } });
  fs.promises.unlink(path.join(jobDocumentsDir, document.fileName)).catch(() => {});
  await logActivity('job_document.delete', document.originalName, req.params.jobId, req.user?.id);
  res.status(204).end();
});
