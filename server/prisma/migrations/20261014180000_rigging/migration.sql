ALTER TABLE "FixtureProfile" ADD COLUMN "weightKg" REAL;
ALTER TABLE "FixtureProfile" ADD COLUMN "clampKg" REAL;

CREATE TABLE "TrussProfile" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "maker" TEXT,
    "kgPerM" REAL NOT NULL,
    "spanTableJson" TEXT NOT NULL DEFAULT '[]',
    "cantileverRatio" REAL NOT NULL DEFAULT 0.25,
    "source" TEXT,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
CREATE UNIQUE INDEX "TrussProfile_name_key" ON "TrussProfile"("name");

CREATE TABLE "HoistModel" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "ratedKg" REAL NOT NULL,
    "hoistClass" TEXT NOT NULL DEFAULT 'D8+',
    "bodyKg" REAL NOT NULL,
    "chainKgPerM" REAL NOT NULL,
    "chainM" REAL NOT NULL DEFAULT 20,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
CREATE UNIQUE INDEX "HoistModel_name_key" ON "HoistModel"("name");

CREATE TABLE "RiggingPlan" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "jobId" TEXT NOT NULL,
    "overridesJson" TEXT NOT NULL DEFAULT '{}',
    "method" TEXT NOT NULL DEFAULT 'envelope',
    "calculatedById" TEXT,
    "calculatedAt" DATETIME,
    "checkedByName" TEXT,
    "checkedAt" DATETIME,
    "snapshotJson" TEXT,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "RiggingPlan_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "RiggingPlan_jobId_key" ON "RiggingPlan"("jobId");

CREATE TABLE "VenuePointSet" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "venueKey" TEXT NOT NULL,
    "venueName" TEXT NOT NULL,
    "pointsJson" TEXT NOT NULL,
    "updatedAt" DATETIME NOT NULL
);
CREATE UNIQUE INDEX "VenuePointSet_venueKey_key" ON "VenuePointSet"("venueKey");

-- Fixture weights from the Rigging Loads Calculator Plan, for databases already seeded by the
-- cable calculator. Only fills blanks.
UPDATE "FixtureProfile" SET "weightKg" = 22 WHERE "typeKey" = 'ayrtondiablos' AND "weightKg" IS NULL;
UPDATE "FixtureProfile" SET "weightKg" = 6.5 WHERE "typeKey" = 'martinmacauraxb' AND "weightKg" IS NULL;
UPDATE "FixtureProfile" SET "weightKg" = 37.2 WHERE "typeKey" = 'martinmacviperprofile' AND "weightKg" IS NULL;
UPDATE "FixtureProfile" SET "weightKg" = 23.2 WHERE "typeKey" = 'martinmacquantumprofile' AND "weightKg" IS NULL;
UPDATE "FixtureProfile" SET "weightKg" = 36 WHERE "typeKey" = 'robebmflspot' AND "weightKg" IS NULL;
UPDATE "FixtureProfile" SET "weightKg" = 22 WHERE "typeKey" = 'robemegapointe' AND "weightKg" IS NULL;
UPDATE "FixtureProfile" SET "weightKg" = 27.8 WHERE "typeKey" = 'robeesprite' AND "weightKg" IS NULL;
UPDATE "FixtureProfile" SET "weightKg" = 13.3 WHERE "typeKey" = 'robespiider' AND "weightKg" IS NULL;
UPDATE "FixtureProfile" SET "weightKg" = 18.1 WHERE "typeKey" = 'robetetra2' AND "weightKg" IS NULL;
UPDATE "FixtureProfile" SET "weightKg" = 19 WHERE "typeKey" = 'claypakysharpy' AND "weightKg" IS NULL;
UPDATE "FixtureProfile" SET "weightKg" = 32 WHERE "typeKey" = 'claypakymythos2' AND "weightKg" IS NULL;
UPDATE "FixtureProfile" SET "weightKg" = 8 WHERE "typeKey" = 'chauvetstrikearray2' AND "weightKg" IS NULL;
UPDATE "FixtureProfile" SET "weightKg" = 10.3 WHERE "typeKey" = 'chauvetroguer2xwash' AND "weightKg" IS NULL;
UPDATE "FixtureProfile" SET "weightKg" = 14.5 WHERE "typeKey" = 'sgmp6' AND "weightKg" IS NULL;
UPDATE "FixtureProfile" SET "weightKg" = 8.1 WHERE "typeKey" = 'sgmq7' AND "weightKg" IS NULL;
UPDATE "FixtureProfile" SET "weightKg" = 12 WHERE "typeKey" = 'glpjdc1' AND "weightKg" IS NULL;
UPDATE "FixtureProfile" SET "weightKg" = 16 WHERE "typeKey" = 'glpimpressionx4bar20' AND "weightKg" IS NULL;
UPDATE "FixtureProfile" SET "weightKg" = 27.4 WHERE "typeKey" = 'prolightsastrablade100ip' AND "weightKg" IS NULL;
UPDATE "FixtureProfile" SET "weightKg" = 7.3 WHERE "typeKey" = 'acmepixellineip' AND "weightKg" IS NULL;
