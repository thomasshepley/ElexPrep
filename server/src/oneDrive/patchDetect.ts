import { getOneDriveConfig } from './config';
import { listChildren, findChildByName } from './client';

export interface DetectedPatchCsv {
  itemId: string;
  name: string;
  path: string;
  modifiedAt: Date;
}

/**
 * The detection half of OneDrive patch auto-import: if the job's matched OneDrive folder has a
 * child folder named "Patch" (any case), the most recently modified CSV inside it is surfaced as
 * a candidate for review — same "look for a conventionally-named subfolder" approach as
 * cad.ts's "CAD" folder. Unlike the CAD PDF, a patch CSV isn't safe to apply automatically
 * (importing it destructively replaces every Fixture row for the job — see routes/patch.ts), so
 * this only detects a file; turning it into fixtures is a separate, explicit approval step.
 * Returns null whenever OneDrive isn't configured, the job has no matched folder, there's no
 * "Patch" subfolder, or it has no CSV in it — all ordinary, expected states, not errors.
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
