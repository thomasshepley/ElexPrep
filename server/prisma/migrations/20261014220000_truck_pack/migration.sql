-- Truck pack (alpha)
ALTER TABLE "FixtureProfile" ADD COLUMN "truckCaseId" TEXT;

CREATE TABLE "TruckCase" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "lengthMm" INTEGER NOT NULL,
    "widthMm" INTEGER NOT NULL,
    "heightMm" INTEGER NOT NULL,
    "emptyKg" REAL NOT NULL,
    "maxStack" INTEGER NOT NULL DEFAULT 2,
    "canGoOnTop" BOOLEAN NOT NULL DEFAULT true,
    "canRotate" BOOLEAN NOT NULL DEFAULT true,
    "category" TEXT NOT NULL DEFAULT 'OTHER',
    "holds" INTEGER NOT NULL DEFAULT 1,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
CREATE UNIQUE INDEX "TruckCase_name_key" ON "TruckCase"("name");

CREATE TABLE "TruckVehicle" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "lengthMm" INTEGER NOT NULL,
    "widthMm" INTEGER NOT NULL,
    "heightMm" INTEGER NOT NULL,
    "payloadKg" REAL NOT NULL,
    "doorWidthMm" INTEGER,
    "doorHeightMm" INTEGER,
    "archFromMm" INTEGER,
    "archToMm" INTEGER,
    "archClearWidthMm" INTEGER,
    "licence" TEXT,
    "notes" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
CREATE UNIQUE INDEX "TruckVehicle_name_key" ON "TruckVehicle"("name");

CREATE TABLE "TruckItemRule" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "match" TEXT NOT NULL,
    "caseId" TEXT,
    "unitsPerCase" INTEGER NOT NULL DEFAULT 1,
    "itemKg" REAL NOT NULL DEFAULT 0,
    "ignore" BOOLEAN NOT NULL DEFAULT false,
    "category" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "TruckItemRule_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "TruckCase" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "TruckItemRule_match_key" ON "TruckItemRule"("match");

CREATE TABLE "TruckPlan" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "jobId" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'AUTO',
    "vehicleId" TEXT,
    "overridesJson" TEXT NOT NULL DEFAULT '{}',
    "manualJson" TEXT NOT NULL DEFAULT '[]',
    "updatedById" TEXT,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "TruckPlan_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "TruckPlan_jobId_key" ON "TruckPlan"("jobId");
