-- Fixture.address becomes nullable: a real patch export sometimes has fixtures with no unit
-- number at all (unaddressed house fixtures), which previously got silently dropped on import
-- since address was required. SQLite has no ALTER COLUMN, so this rebuilds the table.
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Fixture" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "jobId" TEXT NOT NULL,
    "address" INTEGER,
    "fixtureType" TEXT NOT NULL,
    "mainUniverse" INTEGER,
    "mainAddress" INTEGER,
    "pixUniverse" INTEGER,
    "pixAddress" INTEGER,
    "mode" TEXT,
    "location" TEXT,
    "ipAddress" TEXT,
    "subnetMask" TEXT,
    "notes" TEXT,
    "rawJson" TEXT,
    "groupId" TEXT,
    CONSTRAINT "Fixture_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Fixture_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "FixtureGroup" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Fixture" ("id", "jobId", "address", "fixtureType", "mainUniverse", "mainAddress", "pixUniverse", "pixAddress", "mode", "location", "ipAddress", "subnetMask", "notes", "rawJson", "groupId")
SELECT "id", "jobId", "address", "fixtureType", "mainUniverse", "mainAddress", "pixUniverse", "pixAddress", "mode", "location", "ipAddress", "subnetMask", "notes", "rawJson", "groupId" FROM "Fixture";
DROP TABLE "Fixture";
ALTER TABLE "new_Fixture" RENAME TO "Fixture";
CREATE INDEX "Fixture_jobId_idx" ON "Fixture"("jobId");
CREATE INDEX "Fixture_groupId_idx" ON "Fixture"("groupId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
