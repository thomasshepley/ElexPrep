import path from 'path';
import fs from 'fs';
import { Response } from 'express';
import { prisma, logActivity } from './db';
import { uploadDir } from './routes/jobs';
import { encryptBuffer, decryptBuffer } from './crewDocCrypto';

/** Ciphertext only — see crewDocCrypto.ts. A dedicated subdirectory under the existing uploads
 * tree, served only through the decrypt-and-stream routes below, never res.sendFile. */
export const crewDocumentsDir = path.join(uploadDir, 'crew-documents');
fs.mkdirSync(crewDocumentsDir, { recursive: true });

export const DOCUMENT_FIELDS: { field: string; kind: string }[] = [
  { field: 'idDocument', kind: 'ID' },
  { field: 'rightToWorkDocument', kind: 'RIGHT_TO_WORK' },
  { field: 'insuranceDocument', kind: 'INSURANCE' },
  { field: 'bankDetailsDocument', kind: 'BANK_DETAILS' },
];

export async function saveDocuments(
  encryptFor: { applicationId?: string; crewProfileId?: string },
  files: Record<string, Express.Multer.File[]> | undefined
) {
  if (!files) return;
  for (const { field, kind } of DOCUMENT_FIELDS) {
    const file = files[field]?.[0];
    if (!file) continue;
    const { ciphertext, iv, authTag } = encryptBuffer(file.buffer);
    const fileName = `${Date.now()}-${Math.round(Math.random() * 1e9)}.enc`;
    await fs.promises.writeFile(path.join(crewDocumentsDir, fileName), ciphertext);
    await prisma.crewDocument.create({
      data: { ...encryptFor, kind, originalName: file.originalname, fileName, mimeType: file.mimetype, iv, authTag },
    });
  }
}

interface StreamableDoc {
  id: string;
  fileName: string;
  iv: string;
  authTag: string;
  mimeType: string;
  originalName: string;
}

export async function streamDecryptedDocument(res: Response, doc: StreamableDoc, userId: string | undefined) {
  const ciphertext = await fs.promises.readFile(path.join(crewDocumentsDir, doc.fileName));
  const plaintext = decryptBuffer(ciphertext, doc.iv, doc.authTag);
  await logActivity('crew_document.view', doc.originalName, undefined, userId);
  res.setHeader('Content-Type', doc.mimeType);
  res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(doc.originalName)}"`);
  res.send(plaintext);
}

export async function deleteDocumentFile(fileName: string) {
  await fs.promises.unlink(path.join(crewDocumentsDir, fileName)).catch(() => {});
}
