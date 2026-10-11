-- CreateTable
CREATE TABLE "CrewLabelRequest" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "jobId" TEXT NOT NULL,
    "crewProfileId" TEXT NOT NULL,
    "labelType" TEXT NOT NULL,
    "contentJson" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "reviewedAt" DATETIME,
    "reviewedBy" TEXT,
    "rejectionNote" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CrewLabelRequest_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CrewLabelRequest_crewProfileId_fkey" FOREIGN KEY ("crewProfileId") REFERENCES "CrewProfile" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_AdHocLabel" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "jobId" TEXT NOT NULL,
    "labelType" TEXT NOT NULL,
    "contentJson" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "order" INTEGER NOT NULL DEFAULT 0,
    "excludeFromPrint" BOOLEAN NOT NULL DEFAULT false,
    "requestedByCrewProfileId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AdHocLabel_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "AdHocLabel_requestedByCrewProfileId_fkey" FOREIGN KEY ("requestedByCrewProfileId") REFERENCES "CrewProfile" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_AdHocLabel" ("contentJson", "createdAt", "excludeFromPrint", "id", "jobId", "labelType", "order", "quantity") SELECT "contentJson", "createdAt", "excludeFromPrint", "id", "jobId", "labelType", "order", "quantity" FROM "AdHocLabel";
DROP TABLE "AdHocLabel";
ALTER TABLE "new_AdHocLabel" RENAME TO "AdHocLabel";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "CrewLabelRequest_jobId_idx" ON "CrewLabelRequest"("jobId");

-- CreateIndex
CREATE INDEX "CrewLabelRequest_status_idx" ON "CrewLabelRequest"("status");

