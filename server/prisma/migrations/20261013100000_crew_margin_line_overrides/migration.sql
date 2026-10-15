-- Per-job choices about which Current RMS charge lines count in the crew margin.
CREATE TABLE "CrewMarginLineOverride" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "jobId" TEXT NOT NULL,
    "lineKey" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "excluded" BOOLEAN NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CrewMarginLineOverride_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "CrewMarginLineOverride_jobId_lineKey_key" ON "CrewMarginLineOverride"("jobId", "lineKey");
CREATE INDEX "CrewMarginLineOverride_jobId_idx" ON "CrewMarginLineOverride"("jobId");
