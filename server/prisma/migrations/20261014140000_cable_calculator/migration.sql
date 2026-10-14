CREATE TABLE "FixtureProfile" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "typeKey" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "watts" INTEGER NOT NULL,
    "amps" REAL,
    "powerConnector" TEXT NOT NULL,
    "hasPowerThru" BOOLEAN NOT NULL DEFAULT false,
    "dataConnector" TEXT NOT NULL DEFAULT 'DMX5',
    "hasDataThru" BOOLEAN NOT NULL DEFAULT false,
    "maxPerLine" INTEGER,
    "inrushA" REAL,
    "aliases" TEXT,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
CREATE UNIQUE INDEX "FixtureProfile_typeKey_key" ON "FixtureProfile"("typeKey");

CREATE TABLE "JobPosition" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "jobId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'TRUSS',
    "lengthM" REAL,
    "trimM" REAL,
    "distanceM" REAL,
    "pickOffsetM" REAL,
    "motors" INTEGER NOT NULL DEFAULT 0,
    "source" TEXT NOT NULL DEFAULT 'PATCH',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "JobPosition_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "JobPosition_jobId_name_key" ON "JobPosition"("jobId", "name");

CREATE TABLE "CablePlan" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "jobId" TEXT NOT NULL,
    "computedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "inputHash" TEXT NOT NULL,
    "resultJson" TEXT NOT NULL,
    "overridesJson" TEXT NOT NULL DEFAULT '{}',
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CablePlan_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "CablePlan_jobId_key" ON "CablePlan"("jobId");

CREATE TABLE "PlotExtraction" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "jobId" TEXT NOT NULL,
    "sourceName" TEXT NOT NULL,
    "sourceHash" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "resultJson" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmedAt" DATETIME,
    CONSTRAINT "PlotExtraction_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "PlotExtraction_jobId_sourceHash_key" ON "PlotExtraction"("jobId", "sourceHash");
