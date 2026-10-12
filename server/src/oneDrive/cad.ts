import { getOneDriveConfig } from './config';
import { listChildren, findChildByName } from './client';

export interface CadPdf {
  itemId: string;
  name: string;
  /** Graph's lastModifiedDateTime for the PDF, if present - used by the patch auto-import
   * fallback (oneDrive/patchPdfExtract.ts) to tell "this is the same plot already flagged" from
   * "it changed since", the same way patchDetect.ts does for a patch CSV. */
  modifiedAt: Date | null;
}

/**
 * The automatic half of the CAD feature: if the job's matched OneDrive folder has a child
 * folder named "CAD" (any case), the first PDF inside it is surfaced on the crew job page as
 * the viewable CAD plan - no explicit admin share step needed, since CAD plans are expected to
 * be crew-visible by default (unlike the rest of a project folder, which stays admin-only until
 * explicitly shared - see oneDrive/shares.ts). Returns null whenever OneDrive isn't configured,
 * the job has no matched folder, there's no "CAD" subfolder, or it has no PDF in it - all
 * ordinary, expected states, not errors.
 */
export async function findSharedCadPdf(job: { oneDriveFolderId: string | null }): Promise<CadPdf | null> {
  if (!job.oneDriveFolderId) return null;
  const config = await getOneDriveConfig();
  if (!config.enabled) return null;

  const topLevel = await listChildren(config, job.oneDriveFolderId);
  const cadFolder = findChildByName(topLevel.filter((c) => c.folder), 'CAD');
  if (!cadFolder) return null;

  const cadChildren = await listChildren(config, cadFolder.id);
  const pdf = cadChildren.find((c) => c.file && c.name.toLowerCase().endsWith('.pdf'));
  return pdf ? { itemId: pdf.id, name: pdf.name, modifiedAt: pdf.lastModifiedDateTime ? new Date(pdf.lastModifiedDateTime) : null } : null;
}
