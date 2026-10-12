import { getOneDriveConfig } from './config';
import { listChildren, findChildByName, streamOneDriveFile } from './client';
import { findSharedCadPdf } from './cad';
import { extractPatchTableFromPdf } from './patchPdfExtract';
import { parseWysiwygCsv } from '../patchCsv';

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

/**
 * The full OneDrive patch-sourcing flow: look for an exported CSV in the job's "Patch"
 * subfolder first (findPatchCsv); if there isn't one, fall back to extracting a patch table out
 * of the job's CAD PDF (findSharedCadPdf + patchPdfExtract) - the plan's "if absent, fall back
 * to parsing the patch table out of the CAD PDF". Both branches end up parsed into the same
 * header+rows shape, but the CSV path is the reliable one; the PDF path is inherently fuzzy
 * (see patchPdfExtract.ts), which is why the result carries `source` - routes/patch.ts surfaces
 * it so a reviewer knows a PDF-sourced candidate deserves extra scrutiny. Returns null when
 * neither a patch CSV nor a CAD PDF with an extractable table could be found - an ordinary,
 * expected outcome, not an error.
 */
export async function findPatchSource(job: {
  oneDriveFolderId: string | null;
  oneDriveFolderPath: string | null;
}): Promise<PatchScanResult | null> {
  const config = await getOneDriveConfig();
  if (!config.enabled || !job.oneDriveFolderId) return null;

  const csv = await findPatchCsv(job);
  if (csv) {
    const { stream } = await streamOneDriveFile(config, csv.itemId);
    const text = (await collectStreamText(stream)).toString('utf-8');
    const { headers, rows } = parseWysiwygCsv(text);
    return { source: 'csv', itemId: csv.itemId, path: csv.path, fileName: csv.name, modifiedAt: csv.modifiedAt, headers, rows };
  }

  const cadPdf = await findSharedCadPdf(job);
  if (cadPdf) {
    const { stream } = await streamOneDriveFile(config, cadPdf.itemId);
    const buffer = await collectStreamText(stream);
    const { headers, rows } = await extractPatchTableFromPdf(buffer);
    if (rows.length === 0) return null;
    return {
      source: 'pdf',
      itemId: cadPdf.itemId,
      path: `${job.oneDriveFolderPath ?? ''}/CAD/${cadPdf.name}`,
      fileName: cadPdf.name,
      modifiedAt: cadPdf.modifiedAt ?? new Date(),
      headers,
      rows,
    };
  }

  return null;
}
