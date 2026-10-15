import { getOneDriveConfig } from './config';
import { listChildren, streamOneDriveFile } from './client';
import { extractPatchTableFromPdf } from './patchPdfExtract';
import fs from 'fs';
import path from 'path';
import { parseWysiwygCsv } from '../patchCsv';
import { prisma } from '../db';
import { plotsDir } from '../routes/plots';

export interface PatchScanResult {
  source: 'csv' | 'pdf';
  itemId: string;
  path: string;
  fileName: string;
  modifiedAt: Date;
  headers: string[];
  rows: Record<string, string>[];
}

async function collectStreamText(stream: NodeJS.ReadableStream): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return Buffer.concat(chunks);
}

/**
 * A file someone could pick as the job's patch: a CSV or PDF anywhere in the job's OneDrive
 * folder tree, or a PDF uploaded on the Plots tab. `key` is what the candidate stores as its
 * oneDriveItemId - the Graph item id for OneDrive files, "plot:<id>" for Plots-tab uploads.
 */
export interface PatchFile {
  key: string;
  kind: 'csv' | 'pdf';
  origin: 'onedrive' | 'plots';
  name: string;
  path: string;
  modifiedAt: Date;
  size: number | null;
  /** Higher = more likely to be the patch; the picker lists these first and marks them. */
  priority: number;
  load: () => Promise<Buffer>;
}

const MAX_FOLDERS = 60;
const MAX_DEPTH = 4;
const MAX_FILE_BYTES = 60 * 1024 * 1024;

/** Higher = more likely the patch. Patch-named files and the Patch folder first, then CAD. */
function patchPriority(kind: 'csv' | 'pdf', name: string, folderPath: string, flaggedCad: boolean): number {
  const n = name.toLowerCase();
  const f = folderPath.toLowerCase();
  let p = 0;
  if (kind === 'csv') p += 1;
  if (n.includes('patch')) p += 6;
  if (/(^|\/)patch(\/|$)/.test(f)) p += 5;
  if (flaggedCad) p += 4;
  if (/(^|\/)cad(\/|$)/.test(f)) p += 3;
  if (kind === 'pdf' && /combined|plot|cad|lx|lighting|rig/.test(n)) p += 2;
  return p;
}

/**
 * Every CSV and PDF in the job's OneDrive folder (breadth-first, a few levels, a bounded number
 * of folders) plus every file on its Plots tab, most likely patch first, newest first within
 * that. The patch can be a CSV export in a "Patch" folder, a patch PDF, or the table on a
 * "Combined" CAD export - so nothing is ruled out; the person picking chooses.
 */
export async function listPatchFiles(job: {
  id: string;
  oneDriveFolderId: string | null;
  oneDriveFolderPath: string | null;
}): Promise<{ files: PatchFile[]; foldersSearched: number; truncated: boolean }> {
  const files: PatchFile[] = [];
  let foldersSearched = 0;
  let truncated = false;
  const config = await getOneDriveConfig();

  if (config.enabled && job.oneDriveFolderId) {
    const flagged = await prisma.oneDriveShare.findMany({ where: { jobId: job.id, isCadPlot: true }, select: { itemId: true } });
    const flaggedIds = new Set(flagged.map((f) => f.itemId));
    const queue: { id: string; path: string; depth: number }[] = [{ id: job.oneDriveFolderId, path: job.oneDriveFolderPath ?? '', depth: 0 }];
    while (queue.length > 0) {
      if (foldersSearched >= MAX_FOLDERS) {
        truncated = true;
        break;
      }
      const folder = queue.shift()!;
      foldersSearched++;
      const children = await listChildren(config, folder.id);
      for (const c of children) {
        const childPath = `${folder.path}/${c.name}`;
        if (c.folder) {
          if (folder.depth + 1 <= MAX_DEPTH) queue.push({ id: c.id, path: childPath, depth: folder.depth + 1 });
          continue;
        }
        const lower = c.name.toLowerCase();
        const kind = lower.endsWith('.csv') ? 'csv' : lower.endsWith('.pdf') ? 'pdf' : null;
        if (!c.file || !kind) continue;
        files.push({
          key: c.id,
          kind,
          origin: 'onedrive',
          name: c.name,
          path: childPath,
          modifiedAt: c.lastModifiedDateTime ? new Date(c.lastModifiedDateTime) : new Date(0),
          size: c.size ?? null,
          priority: patchPriority(kind, c.name, folder.path, flaggedIds.has(c.id)),
          load: async () => collectStreamText((await streamOneDriveFile(config, c.id)).stream),
        });
      }
    }
  }

  const plots = await prisma.plot.findMany({ where: { jobId: job.id }, orderBy: { createdAt: 'desc' } });
  for (const p of plots) {
    const file = path.join(plotsDir, p.fileName);
    files.push({
      key: `plot:${p.id}`,
      kind: 'pdf',
      origin: 'plots',
      name: p.originalName,
      path: `Plots tab/${p.originalName}`,
      modifiedAt: p.createdAt,
      size: null,
      priority: patchPriority('pdf', p.originalName, '', true),
      load: () => fs.promises.readFile(file),
    });
  }

  files.sort((a, b) => b.priority - a.priority || b.modifiedAt.getTime() - a.modifiedAt.getTime());
  return { files, foldersSearched, truncated };
}

/** Reads one picked file into patch rows - a CSV as-is, a PDF through the table extractor. */
export async function readPatchFile(file: PatchFile): Promise<PatchScanResult> {
  if (file.size !== null && file.size > MAX_FILE_BYTES) throw new Error(`${file.name} is too large to read (over 60 MB)`);
  const buffer = await file.load();
  const base = { source: file.kind, itemId: file.key, path: file.path, fileName: file.name, modifiedAt: file.modifiedAt };
  if (file.kind === 'csv') {
    const { headers, rows } = parseWysiwygCsv(buffer.toString('utf-8'));
    return { ...base, headers, rows };
  }
  if (buffer.subarray(0, 1024).indexOf('%PDF') === -1) throw new Error(`${file.name} isn't a valid PDF`);
  try {
    const { headers, rows } = await extractPatchTableFromPdf(buffer);
    return { ...base, headers, rows };
  } catch (err) {
    const message = (err as Error).message;
    // pdf.js reports a damaged or unreadable file in a few cryptic ways; say it plainly.
    if (/transfer object|Invalid PDF|password|Unexpected server response|bad XRef/i.test(message)) {
      throw new Error(`Couldn't read ${file.name} - it may be damaged or password-protected`);
    }
    throw err;
  }
}
