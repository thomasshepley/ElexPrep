-- CreateTable
CREATE TABLE "Job" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "venue" TEXT,
    "logoPath" TEXT,
    "currentRmsOpportunityId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "FixtureTypeRule" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "unitsPerCase" INTEGER NOT NULL DEFAULT 1,
    "caseLabelOverride" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Fixture" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "jobId" TEXT NOT NULL,
    "address" INTEGER NOT NULL,
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
    CONSTRAINT "Fixture_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CaseGroupRecord" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "jobId" TEXT NOT NULL,
    "fixtureType" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "location" TEXT,
    "addressesJson" TEXT NOT NULL,
    CONSTRAINT "CaseGroupRecord_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AdHocLabel" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "jobId" TEXT NOT NULL,
    "labelType" TEXT NOT NULL,
    "contentJson" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AdHocLabel_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PrintQueueItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "jobId" TEXT NOT NULL,
    "labelType" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "sourceId" TEXT,
    "contentJson" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PrintQueueItem_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ActivityLogEntry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "jobId" TEXT,
    "action" TEXT NOT NULL,
    "detail" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "FixtureTypeRule_name_key" ON "FixtureTypeRule"("name");

-- CreateIndex
CREATE INDEX "Fixture_jobId_idx" ON "Fixture"("jobId");

-- CreateIndex
CREATE INDEX "CaseGroupRecord_jobId_idx" ON "CaseGroupRecord"("jobId");

-- CreateIndex
CREATE INDEX "PrintQueueItem_jobId_idx" ON "PrintQueueItem"("jobId");
