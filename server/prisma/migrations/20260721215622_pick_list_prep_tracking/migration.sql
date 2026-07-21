-- AlterTable
ALTER TABLE "Job" ADD COLUMN "rmsItemsDiffAt" DATETIME;
ALTER TABLE "Job" ADD COLUMN "rmsItemsDiffJson" TEXT;
ALTER TABLE "Job" ADD COLUMN "rmsItemsSnapshotJson" TEXT;

-- CreateTable
CREATE TABLE "PickListItemStatus" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "jobId" TEXT NOT NULL,
    "rmsItemId" INTEGER NOT NULL,
    "prepped" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PickListItemStatus_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "PickListItemStatus_jobId_idx" ON "PickListItemStatus"("jobId");

-- CreateIndex
CREATE UNIQUE INDEX "PickListItemStatus_jobId_rmsItemId_key" ON "PickListItemStatus"("jobId", "rmsItemId");
