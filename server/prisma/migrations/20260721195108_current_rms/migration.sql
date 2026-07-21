-- CreateTable
CREATE TABLE "CurrentRmsOpportunity" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "rmsId" INTEGER NOT NULL,
    "subject" TEXT NOT NULL,
    "status" TEXT,
    "memberName" TEXT,
    "startsAt" DATETIME,
    "endsAt" DATETIME,
    "rmsUpdatedAt" DATETIME,
    "rawJson" TEXT NOT NULL,
    "syncedAt" DATETIME NOT NULL
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Job" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "venue" TEXT,
    "logoPath" TEXT,
    "isPublic" BOOLEAN NOT NULL DEFAULT false,
    "currentRmsOpportunityId" TEXT,
    "rmsAlertAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Job" ("createdAt", "currentRmsOpportunityId", "id", "logoPath", "name", "updatedAt", "venue") SELECT "createdAt", "currentRmsOpportunityId", "id", "logoPath", "name", "updatedAt", "venue" FROM "Job";
DROP TABLE "Job";
ALTER TABLE "new_Job" RENAME TO "Job";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "CurrentRmsOpportunity_rmsId_key" ON "CurrentRmsOpportunity"("rmsId");

-- CreateIndex
CREATE INDEX "CurrentRmsOpportunity_rmsId_idx" ON "CurrentRmsOpportunity"("rmsId");
