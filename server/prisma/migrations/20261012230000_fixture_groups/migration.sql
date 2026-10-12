-- Named "stage" groupings for a job's fixtures/cases/labels, so a multi-stage job can run a
-- separate patch import, case packing, and print queue per stage without them colliding.
CREATE TABLE "FixtureGroup" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "jobId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "rmsGroupName" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FixtureGroup_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "FixtureGroup_jobId_idx" ON "FixtureGroup"("jobId");

ALTER TABLE "Fixture" ADD COLUMN "groupId" TEXT REFERENCES "FixtureGroup" ("id") ON DELETE SET NULL;
CREATE INDEX "Fixture_groupId_idx" ON "Fixture"("groupId");

ALTER TABLE "CaseGroupRecord" ADD COLUMN "groupId" TEXT REFERENCES "FixtureGroup" ("id") ON DELETE SET NULL;
CREATE INDEX "CaseGroupRecord_groupId_idx" ON "CaseGroupRecord"("groupId");

ALTER TABLE "PrintQueueItem" ADD COLUMN "groupId" TEXT REFERENCES "FixtureGroup" ("id") ON DELETE SET NULL;
CREATE INDEX "PrintQueueItem_groupId_idx" ON "PrintQueueItem"("groupId");

ALTER TABLE "AdHocLabel" ADD COLUMN "groupId" TEXT REFERENCES "FixtureGroup" ("id") ON DELETE SET NULL;
