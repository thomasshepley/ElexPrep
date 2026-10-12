import { getOneDriveConfig } from './config';
import { listChildren } from './client';

export interface LogoCandidate {
  itemId: string;
  name: string;
}

const LOGO_NAME_PATTERN = /logo/i;
const IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg'];

/**
 * The automatic half of job logo setup: if the job's matched OneDrive folder has an image
 * file with "logo" in its name directly at the top level, it's surfaced as a one-click
 * suggestion on the job's Logo settings (see JobDetailPage.tsx) instead of requiring the
 * admin to download the file and re-upload it by hand. Deliberately only looks at the top
 * level (unlike CAD plots, which live in their own "CAD" subfolder - see oneDrive/cad.ts)
 * since a client/venue logo is normally dropped straight in the project root. Returns null
 * whenever OneDrive isn't configured, the job has no matched folder, or nothing matches -
 * all ordinary, expected states, not errors.
 */
export async function findLogoCandidate(job: { oneDriveFolderId: string | null }): Promise<LogoCandidate | null> {
  if (!job.oneDriveFolderId) return null;
  const config = await getOneDriveConfig();
  if (!config.enabled) return null;

  const children = await listChildren(config, job.oneDriveFolderId);
  const match = children.find(
    (c) => c.file && LOGO_NAME_PATTERN.test(c.name) && IMAGE_EXTENSIONS.some((ext) => c.name.toLowerCase().endsWith(ext))
  );
  return match ? { itemId: match.id, name: match.name } : null;
}
