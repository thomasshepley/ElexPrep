import { OneDriveConfig } from './config';
import { getItemByPath, listChildren, findChildByName, DriveItem } from './client';

export interface FolderMatch {
  folderId: string;
  path: string;
}

/**
 * Matches an opportunity being onboarded to a folder under the configured root
 * (default "Projects"), following the <root>/<year>/<project name> convention described by
 * the user: Projects -> each year -> each project. Tries the opportunity's start-year folder
 * first (the year the job is actually happening), falling back to the current year - a job
 * onboarded close to its date, before Current RMS has the final start date locked in, should
 * still have a reasonable shot at matching. Returns null (not a throw) on no match, since
 * "we couldn't find it automatically" is an expected, common outcome, not an error - the
 * onboarding flow falls back to a manual folder pick either way.
 */
export async function matchJobFolder(
  config: Pick<OneDriveConfig, 'enabled' | 'tenantId' | 'clientId' | 'clientSecret' | 'driveId' | 'rootFolderPath'>,
  opportunity: { subject: string; startsAt: Date | null }
): Promise<FolderMatch | null> {
  const years = new Set<number>();
  if (opportunity.startsAt) years.add(opportunity.startsAt.getFullYear());
  years.add(new Date().getFullYear());

  for (const year of years) {
    const yearPath = `${config.rootFolderPath}/${year}`;
    const yearFolder = await getItemByPath(config, yearPath);
    if (!yearFolder || !yearFolder.folder) continue;

    const children = await listChildren(config, yearFolder.id);
    const match = findBestNameMatch(children, opportunity.subject);
    if (match) return { folderId: match.id, path: `${yearPath}/${match.name}` };
  }
  return null;
}

/** Exact (case-insensitive) match first, then a substring match in either direction - a
 * project folder is often named slightly differently from the opportunity subject (an
 * abbreviation, a trailing client reference), so a pure exact match alone would miss too much
 * to be useful as an "automatic" step. */
function findBestNameMatch(children: DriveItem[], subject: string): DriveItem | null {
  const folders = children.filter((c) => c.folder);
  const exact = findChildByName(folders, subject);
  if (exact) return exact;

  const target = subject.trim().toLowerCase();
  if (!target) return null;
  return folders.find((c) => {
    const name = c.name.trim().toLowerCase();
    return name.includes(target) || target.includes(name);
  }) ?? null;
}
