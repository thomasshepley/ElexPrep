-- CreateTable
CREATE TABLE "PatchImportCandidate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "jobId" TEXT NOT NULL,
    "oneDriveItemId" TEXT NOT NULL,
    "oneDriveItemPath" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "sourceModifiedAt" DATETIME NOT NULL,
    "rowsJson" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "detectedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" DATETIME,
    "reviewedBy" TEXT,
    "rejectionNote" TEXT,
    CONSTRAINT "PatchImportCandidate_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "PatchImportCandidate_jobId_key" ON "PatchImportCandidate"("jobId");
