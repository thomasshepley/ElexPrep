-- Per-day crew rate overrides and per-role day rates (global and per job).
ALTER TABLE "JobDayCrewAssignment" ADD COLUMN "dayRate" TEXT;

CREATE TABLE "RoleRate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "jobId" TEXT,
    "role" TEXT NOT NULL,
    "roleKey" TEXT NOT NULL,
    "dayRate" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "RoleRate_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "RoleRate_jobId_roleKey_key" ON "RoleRate"("jobId", "roleKey");
CREATE INDEX "RoleRate_jobId_idx" ON "RoleRate"("jobId");
