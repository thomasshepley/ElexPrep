import { prisma } from '../db';
import { DriveItem } from './client';

export function toShareDto(s: {
  id: string;
  jobId: string;
  itemId: string;
  itemName: string;
  itemPath: string;
  isFolder: boolean;
  isCadPlot: boolean;
  sharedAt: Date;
}) {
  return {
    id: s.id,
    jobId: s.jobId,
    itemId: s.itemId,
    itemName: s.itemName,
    itemPath: s.itemPath,
    isFolder: s.isFolder,
    isCadPlot: s.isCadPlot,
    sharedAt: s.sharedAt,
  };
}

export async function listJobShares(jobId: string) {
  const shares = await prisma.oneDriveShare.findMany({ where: { jobId }, orderBy: { sharedAt: 'desc' } });
  return shares.map(toShareDto);
}

export async function isItemSharedWithJob(jobId: string, itemId: string): Promise<boolean> {
  const share = await prisma.oneDriveShare.findUnique({ where: { jobId_itemId: { jobId, itemId } } });
  return Boolean(share);
}

export async function shareItemWithJob(
  jobId: string,
  item: Pick<DriveItem, 'id' | 'name' | 'folder'>,
  itemPath: string,
  sharedByUserId: string | undefined
) {
  const share = await prisma.oneDriveShare.upsert({
    where: { jobId_itemId: { jobId, itemId: item.id } },
    create: {
      jobId,
      itemId: item.id,
      itemName: item.name,
      itemPath,
      isFolder: Boolean(item.folder),
      sharedByUserId,
    },
    update: { itemName: item.name, itemPath, isFolder: Boolean(item.folder) },
  });
  return toShareDto(share);
}

export async function setShareCadPlot(jobId: string, shareId: string, isCadPlot: boolean) {
  const share = await prisma.oneDriveShare.findUnique({ where: { id: shareId } });
  if (!share || share.jobId !== jobId) return null;
  const updated = await prisma.oneDriveShare.update({ where: { id: shareId }, data: { isCadPlot } });
  return toShareDto(updated);
}

export async function unshareItem(jobId: string, shareId: string): Promise<boolean> {
  const share = await prisma.oneDriveShare.findUnique({ where: { id: shareId } });
  if (!share || share.jobId !== jobId) return false;
  await prisma.oneDriveShare.delete({ where: { id: shareId } });
  return true;
}
