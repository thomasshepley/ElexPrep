import { prisma } from '../db';

/**
 * The next free `order` value for a (jobId, labelType) group, continuing the shared
 * sequence across both PrintQueueItem and AdHocLabel - so newly-created rows append after
 * whatever's already there instead of colliding at the default of 0.
 */
export async function nextOrderStart(jobId: string, labelType: string): Promise<number> {
  const [maxQueue, maxAdHoc] = await Promise.all([
    prisma.printQueueItem.aggregate({ where: { jobId, labelType }, _max: { order: true } }),
    prisma.adHocLabel.aggregate({ where: { jobId, labelType }, _max: { order: true } }),
  ]);
  const max = Math.max(maxQueue._max.order ?? -1, maxAdHoc._max.order ?? -1);
  return max + 1;
}
