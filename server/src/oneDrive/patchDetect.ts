import { getOneDriveConfig } from './config';
import { listChildren, findChildByName, streamOneDriveFile } from './client';
import { extractPatchTableFromPdf } from './patchPdfExtract';
import fs from 'fs';
import path from 'path';
import { parseWysiwygCsv } from '../patchCsv';
import { prisma } from '../db';
import { plotsDir } from '../routes/plots';

export interface DetectedPatchCsv {
  itemId: string;
  name: string;
  path: string;
  modifiedAt: Date;
}

/**
 * The detection half of OneDrive patch auto-import: if the job's matched OneDrive folder has a
 * child folder named "Patch" (any case), the most recently modified CSV inside it is surfaced as
 * a candidate for review - same "look for a conventionally-named subfolder" approach as
 * cad.ts's "CAD" folder. Unlike the CAD PDF, a patch CSV isn't safe to apply automatically
 * (importing it destructively replaces every Fixture row for the job - see routes/patch.ts), so
 * this only detects a file; turning it into fixtures is a separate, explicit approval step.
 * Returns null whenever OneDrive isn't configured, the job has no matched folder, there's no
 * "Patch" subfolder, or it has no CSV in it - all ordinary, expected states, not errors.
 */
export async function findPatchCsv(job: {
  oneDriveFolderId: string | null;
  oneDriveFolderPath: string | null;
}): Promise<DetectedPatchCsv | null> {
  if (!job.oneDriveFolderId) return null;
  const config = await getOneDriveConfig();
  if (!config.enabled) return null;

  const topLevel = await listChildren(config, job.oneDriveFolderId);
  const patchFolder = findChildByName(topLevel.filter((c) => c.folder), 'Patch');
  if (!patchFolder) return null;

  const children = await listChildren(config, patchFolder.id);
  const csvs = children.filter((c) => c.file && c.name.toLowerCase().endsWith('.csv') && c.lastModifiedDateTime);
  if (csvs.length === 0) return null;

  const newest = csvs.reduce((latest, candidate) =>
    new Date(candidate.lastModifiedDateTime!) > new Date(latest.lastModifiedDateTime!) ? candidate : latest
  );
  return {
    itemId: newest.id,
    name: newest.name,
    path: `${job.oneDriveFolderPath ?? ''}/Patch/${newest.name}`,
    modifiedAt: new Date(newest.lastModifiedDateTime!),
  };
}

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

/** A PDF the scan could try, with where it came from and how likely it is to hold the patch. */
interface PdfCandidate {
  key: string;
  name: string;
  path: string;
  modifiedAt: Date;
  size: number | null;
  priority: number;
  load: () => Promise<Buffer>;
  itemId: string | null;
}

/** What a scan looked at - returned when nothing usable is found, so the reviewer can see why. */
export interface PatchScanReport {
  checked: { name: string; path: string; rows: number; error?: string }[];
  foldersSearched: number;
}

const MAX_FOLDERS = 60;
const MAX_DEPTH = 4;
const MAX_PDFS_TRIED = 12;
const MAX_PDF_BYTES = 60 * 1024 * 1024;
/** A PDF yielding at least this many patch rows is taken without opening the rest. */
const GOOD_ENOUGH_ROWS = 10;

/** Higher = try sooner. Patch-named files and the Patch folder first, then CAD material. */
function pdfPriority(name: string, folderPath: string, flaggedCad: boolean): number {
  const n = name.toLowerCase();
  const f = folderPath.toLowerCase();
  let p = 0;
  if (n.includes('patch')) p += 6;
  if (/(^|\/)patch(\/|$)/.test(f)) p += 5;
  if (flaggedCad) p += 4;
  if (/(^|\/)cad(\/|$)/.test(f)) p += 3;
  if (/combined|plot|cad|lx|lighting|rig/.test(n)) p += 2;
  return p;
}

/**
 * Walks the job's OneDrive folder breadth-first (a few levels, a bounded number of folders) and
 * collects every PDF in it - the patch table can live in a "Combined" CAD export in the CAD
 * folder, a separate patch PDF in the Patch folder, or anywhere the project keeps drawings.
 */
async function collectOneDrivePdfs(
  config: Awaited<ReturnType<typeof getOneDriveConfig>>,
  rootId: string,
  rootPath: string,
  flaggedIds: Set<string>
): Promise<{ pdfs: PdfCandidate[]; foldersSearched: number }> {
  const pdfs: PdfCandidate[] = [];
  const queue: { id: string; path: string; depth: number }[] = [{ id: rootId, path: rootPath, depth: 0 }];
  let foldersSearched = 0;
  while (queue.length > 0 && foldersSearched < MAX_FOLDERS) {
    const folder = queue.shift()!;
    foldersSearched++;
    const children = await listChildren(config, folder.id);
    for (const c of children) {
      const childPath = `${folder.path}/${c.name}`;
      if (c.folder) {
        if (folder.depth + 1 <= MAX_DEPTH) queue.push({ id: c.id, path: childPath, depth: folder.depth + 1 });
      } else if (c.file && c.name.toLowerCase().endsWith('.pdf')) {
        pdfs.push({
          key: `od:${c.id}`,
          itemId: c.id,
          name: c.name,
          path: childPath,
          modifiedAt: c.lastModifiedDateTime ? new Date(c.lastModifiedDateTime) : new Date(0),
          size: c.size ?? null,
          priority: pdfPriority(c.name, folder.path, flaggedIds.has(c.id)),
          load: async () => collectStreamText((await streamOneDriveFile(config, c.id)).stream),
        });
      }
    }
  }
  return { pdfs, foldersSearched };
}

/**
 * The full OneDrive patch-sourcing flow:
 *   1. the newest CSV in the job folder's "Patch" subfolder (reliable - an actual export);
 *   2. otherwise every PDF in the job's OneDrive folder tree, plus PDFs uploaded on the job's
 *      Plots tab, tried in order of how likely each is to hold the patch (patch-named and Patch
 *      folder first, then CAD-flagged and CAD folder, newest first within that). The one that
 *      yields the most patch rows wins.
 * The PDF path is inherently fuzzy (see patchPdfExtract.ts), which is why the result carries
 * `source` - the reviewer is told a PDF-sourced candidate deserves extra scrutiny. When nothing
 * usable turns up, the report says which files were opened and what each gave.
 */
export async function findPatchSource(job: {
  id: string;
  oneDriveFolderId: string | null;
  oneDriveFolderPath: string | null;
}): Promise<{ found: PatchScanResult | null; report: PatchScanReport }> {
  const report: PatchScanReport = { checked: [], foldersSearched: 0 };
  const config = await getOneDriveConfig();
  const candidates: PdfCandidate[] = [];

  if (config.enabled && job.oneDriveFolderId) {
    const csv = await findPatchCsv(job);
    if (csv) {
      const { stream } = await streamOneDriveFile(config, csv.itemId);
      const text = (await collectStreamText(stream)).toString('utf-8');
      const { headers, rows } = parseWysiwygCsv(text);
      return {
        found: { source: 'csv', itemId: csv.itemId, path: csv.path, fileName: csv.name, modifiedAt: csv.modifiedAt, headers, rows },
        report,
      };
    }
    const flagged = await prisma.oneDriveShare.findMany({ where: { jobId: job.id, isCadPlot: true }, select: { itemId: true } });
    const { pdfs, foldersSearched } = await collectOneDrivePdfs(config, job.oneDriveFolderId, job.oneDriveFolderPath ?? '', new Set(flagged.map((f) => f.itemId)));
    report.foldersSearched = foldersSearched;
    candidates.push(...pdfs);
  }

  // PDFs uploaded straight onto the job's Plots tab count too.
  const plots = await prisma.plot.findMany({ where: { jobId: job.id }, orderBy: { createdAt: 'desc' } });
  for (const p of plots) {
    const file = path.join(plotsDir, p.fileName);
    candidates.push({
      key: `plot:${p.id}`,
      itemId: null,
      name: p.originalName,
      path: `Plots tab/${p.originalName}`,
      modifiedAt: p.createdAt,
      size: null,
      priority: pdfPriority(p.originalName, '', true),
      load: () => fs.promises.readFile(file),
    });
  }

  candidates.sort((a, b) => b.priority - a.priority || b.modifiedAt.getTime() - a.modifiedAt.getTime());

  let best: { candidate: PdfCandidate; headers: string[]; rows: Record<string, string>[] } | null = null;
  for (const candidate of candidates.slice(0, MAX_PDFS_TRIED)) {
    if (candidate.size !== null && candidate.size > MAX_PDF_BYTES) {
      report.checked.push({ name: candidate.name, path: candidate.path, rows: 0, error: 'too large to scan' });
      continue;
    }
    try {
      const buffer = await candidate.load();
      if (buffer.subarray(0, 1024).indexOf('%PDF') === -1) {
        report.checked.push({ name: candidate.name, path: candidate.path, rows: 0, error: 'not a valid PDF' });
        continue;
      }
      const { headers, rows } = await extractPatchTableFromPdf(buffer);
      report.checked.push({ name: candidate.name, path: candidate.path, rows: rows.length });
      if (rows.length > 0 && (!best || rows.length > best.rows.length)) best = { candidate, headers, rows };
      if (best && best.rows.length >= GOOD_ENOUGH_ROWS) break;
    } catch (err) {
      const message = (err as Error).message;
      // pdf.js reports a damaged or unreadable file in a few cryptic ways; say it plainly.
      const unreadable = /transfer object|Invalid PDF|password|Unexpected server response|bad XRef/i.test(message);
      report.checked.push({ name: candidate.name, path: candidate.path, rows: 0, error: unreadable ? "couldn't read this PDF (damaged or protected?)" : message.slice(0, 120) });
    }
  }
  if (candidates.length > MAX_PDFS_TRIED && !best) {
    report.checked.push({ name: `${candidates.length - MAX_PDFS_TRIED} more PDF(s) not opened`, path: '', rows: 0 });
  }

  if (!best) return { found: null, report };
  return {
    found: {
      source: 'pdf',
      itemId: best.candidate.itemId ?? best.candidate.key,
      path: best.candidate.path,
      fileName: best.candidate.name,
      modifiedAt: best.candidate.modifiedAt,
      headers: best.headers,
      rows: best.rows,
    },
    report,
  };
}
