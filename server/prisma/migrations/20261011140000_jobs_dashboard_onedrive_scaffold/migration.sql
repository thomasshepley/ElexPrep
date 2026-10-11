-- AlterTable
ALTER TABLE "CurrentRmsOpportunity" ADD COLUMN "kind" TEXT;

-- AlterTable
ALTER TABLE "Job" ADD COLUMN "crewFeaturesJson" TEXT;
ALTER TABLE "Job" ADD COLUMN "oneDriveFolderId" TEXT;
ALTER TABLE "Job" ADD COLUMN "oneDriveFolderPath" TEXT;
ALTER TABLE "Job" ADD COLUMN "oneDriveMatchStatus" TEXT;

-- CreateTable
CREATE TABLE "OneDriveShare" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "jobId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "itemName" TEXT NOT NULL,
    "itemPath" TEXT NOT NULL,
    "isFolder" BOOLEAN NOT NULL,
    "sharedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sharedByUserId" TEXT,
    CONSTRAINT "OneDriveShare_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "OneDriveShare_jobId_idx" ON "OneDriveShare"("jobId");

-- CreateIndex
CREATE UNIQUE INDEX "OneDriveShare_jobId_itemId_key" ON "OneDriveShare"("jobId", "itemId");

