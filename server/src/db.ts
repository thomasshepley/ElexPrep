import { PrismaClient } from '@prisma/client';

export const prisma = new PrismaClient();

export async function logActivity(action: string, detail?: string, jobId?: string) {
  await prisma.activityLogEntry.create({
    data: { action, detail, jobId },
  });
}
