-- CreateIndex
CREATE INDEX "ActivityLogEntry_jobId_createdAt_idx" ON "ActivityLogEntry"("jobId", "createdAt");

-- CreateIndex
CREATE INDEX "ActivityLogEntry_createdAt_idx" ON "ActivityLogEntry"("createdAt");

-- CreateIndex
CREATE INDEX "Session_expiresAt_idx" ON "Session"("expiresAt");

-- CreateIndex
CREATE INDEX "PrintJob_jobId_idx" ON "PrintJob"("jobId");

-- Fresh installs used to seed the global default location colours twice (two concurrent seed
-- passes at boot). Keep the most recently edited row per location and drop the rest.
DELETE FROM "LocationColorRule"
WHERE "jobId" IS NULL
  AND "id" NOT IN (
    SELECT "id" FROM (
      SELECT "id", ROW_NUMBER() OVER (PARTITION BY "location" ORDER BY "updatedAt" DESC, "createdAt" DESC) AS rn
      FROM "LocationColorRule"
      WHERE "jobId" IS NULL
    ) WHERE rn = 1
  );
