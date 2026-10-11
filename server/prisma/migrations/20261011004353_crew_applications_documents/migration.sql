-- CreateTable
CREATE TABLE "CrewApplication" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "fullName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "skills" TEXT,
    "dayRate" TEXT,
    "rightToWork" TEXT,
    "notes" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "reviewedAt" DATETIME,
    "reviewedBy" TEXT,
    "rejectionNote" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "CrewDocument" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "applicationId" TEXT,
    "crewProfileId" TEXT,
    "kind" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "iv" TEXT NOT NULL,
    "authTag" TEXT NOT NULL,
    "expiresAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CrewDocument_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "CrewApplication" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CrewDocument_crewProfileId_fkey" FOREIGN KEY ("crewProfileId") REFERENCES "CrewProfile" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "CrewApplication_status_idx" ON "CrewApplication"("status");

-- CreateIndex
CREATE INDEX "CrewDocument_applicationId_idx" ON "CrewDocument"("applicationId");

-- CreateIndex
CREATE INDEX "CrewDocument_crewProfileId_idx" ON "CrewDocument"("crewProfileId");

