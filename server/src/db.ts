import { PrismaClient } from '@prisma/client';
import { getRequestContext } from './requestContext';

export const prisma = new PrismaClient();

/** ipAddress/userAgent are pulled automatically from the current request's context (see
 * requestContext.ts) rather than being a parameter here — this is what makes every one of
 * this function's 80+ existing call sites IP-logged for free, with no call-site changes. */
export async function logActivity(action: string, detail?: string, jobId?: string, userId?: string) {
  const context = getRequestContext();
  await prisma.activityLogEntry.create({
    data: { action, detail, jobId, userId, ipAddress: context?.ipAddress, userAgent: context?.userAgent },
  });
}
