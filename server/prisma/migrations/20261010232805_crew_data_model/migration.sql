-- CreateTable
CREATE TABLE "CrewProfile" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "phone" TEXT,
    "skills" TEXT,
    "dayRate" TEXT,
    "notes" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CrewProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "JobCrewAssignment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "jobId" TEXT NOT NULL,
    "crewProfileId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "dayRate" TEXT,
    "xeroContactId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "JobCrewAssignment_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "JobCrewAssignment_crewProfileId_fkey" FOREIGN KEY ("crewProfileId") REFERENCES "CrewProfile" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "CrewProfile_userId_key" ON "CrewProfile"("userId");

-- CreateIndex
CREATE INDEX "JobCrewAssignment_jobId_idx" ON "JobCrewAssignment"("jobId");

-- CreateIndex
CREATE INDEX "JobCrewAssignment_crewProfileId_idx" ON "JobCrewAssignment"("crewProfileId");

-- CreateIndex
CREATE UNIQUE INDEX "JobCrewAssignment_jobId_crewProfileId_key" ON "JobCrewAssignment"("jobId", "crewProfileId");

