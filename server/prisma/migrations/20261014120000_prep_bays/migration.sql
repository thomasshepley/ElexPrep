-- CreateTable
CREATE TABLE "ScreenDevice" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "currentJobId" TEXT,
    "lastSeenAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ScreenDevice_currentJobId_fkey" FOREIGN KEY ("currentJobId") REFERENCES "Job" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "ScreenDevice_token_key" ON "ScreenDevice"("token");

-- CreateTable
CREATE TABLE "PrepOperatorSession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "token" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastActiveAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" DATETIME,
    CONSTRAINT "PrepOperatorSession_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "ScreenDevice" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PrepOperatorSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "PrepOperatorSession_token_key" ON "PrepOperatorSession"("token");
CREATE INDEX "PrepOperatorSession_deviceId_idx" ON "PrepOperatorSession"("deviceId");

-- CreateTable
CREATE TABLE "PrepSession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "jobId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedByUserId" TEXT,
    "completedAt" DATETIME,
    "completedByUserId" TEXT,
    "missingJson" TEXT,
    "flaggedAt" DATETIME,
    "flagResolvedAt" DATETIME,
    "flagResolvedByUserId" TEXT,
    "transportAt" DATETIME,
    "transportByUserId" TEXT,
    "bookOutJson" TEXT,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PrepSession_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "PrepSession_jobId_idx" ON "PrepSession"("jobId");

-- CreateTable
CREATE TABLE "PrepLineState" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "prepSessionId" TEXT NOT NULL,
    "lineKey" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "required" INTEGER NOT NULL,
    "pulled" INTEGER NOT NULL DEFAULT 0,
    "short" INTEGER NOT NULL DEFAULT 0,
    "shortNote" TEXT,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PrepLineState_prepSessionId_fkey" FOREIGN KEY ("prepSessionId") REFERENCES "PrepSession" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "PrepLineState_prepSessionId_lineKey_key" ON "PrepLineState"("prepSessionId", "lineKey");

-- CreateTable
CREATE TABLE "ScanEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "jobId" TEXT NOT NULL,
    "prepSessionId" TEXT,
    "code" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "lineKey" TEXT,
    "result" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "deviceId" TEXT,
    "userId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ScanEvent_prepSessionId_fkey" FOREIGN KEY ("prepSessionId") REFERENCES "PrepSession" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "ScanEvent_jobId_createdAt_idx" ON "ScanEvent"("jobId", "createdAt");

-- CreateTable
CREATE TABLE "PrepAssetScan" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "prepSessionId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "serialised" BOOLEAN NOT NULL DEFAULT true,
    "lineKey" TEXT NOT NULL,
    "rmsItemId" INTEGER,
    "rmsStockLevelId" INTEGER,
    "userId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "rmsPreparedAt" DATETIME,
    "rmsBookedOutAt" DATETIME,
    "rmsError" TEXT,
    CONSTRAINT "PrepAssetScan_prepSessionId_fkey" FOREIGN KEY ("prepSessionId") REFERENCES "PrepSession" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "PrepAssetScan_prepSessionId_code_idx" ON "PrepAssetScan"("prepSessionId", "code");

-- CreateTable
CREATE TABLE "BarcodeAlias" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "rmsProductId" INTEGER,
    "rmsStockLevelId" INTEGER,
    "label" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'RMS',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
CREATE UNIQUE INDEX "BarcodeAlias_code_key" ON "BarcodeAlias"("code");
