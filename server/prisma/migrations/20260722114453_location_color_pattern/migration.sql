-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_LocationColorRule" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "jobId" TEXT,
    "location" TEXT NOT NULL,
    "color" TEXT NOT NULL,
    "pattern" TEXT NOT NULL DEFAULT 'SOLID',
    "secondaryColor" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "LocationColorRule_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_LocationColorRule" ("color", "createdAt", "id", "jobId", "location", "updatedAt") SELECT "color", "createdAt", "id", "jobId", "location", "updatedAt" FROM "LocationColorRule";
DROP TABLE "LocationColorRule";
ALTER TABLE "new_LocationColorRule" RENAME TO "LocationColorRule";
CREATE INDEX "LocationColorRule_jobId_idx" ON "LocationColorRule"("jobId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
