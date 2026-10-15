-- CreateTable
CREATE TABLE "JobDay" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "jobId" TEXT NOT NULL,
    "date" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "JobDay_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "JobDay_jobId_date_key" ON "JobDay"("jobId", "date");

-- CreateIndex
CREATE INDEX "JobDay_jobId_idx" ON "JobDay"("jobId");

-- CreateTable
CREATE TABLE "JobDayCrewAssignment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "jobDayId" TEXT NOT NULL,
    "jobCrewAssignmentId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "JobDayCrewAssignment_jobDayId_fkey" FOREIGN KEY ("jobDayId") REFERENCES "JobDay" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "JobDayCrewAssignment_jobCrewAssignmentId_fkey" FOREIGN KEY ("jobCrewAssignmentId") REFERENCES "JobCrewAssignment" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "JobDayCrewAssignment_jobDayId_jobCrewAssignmentId_key" ON "JobDayCrewAssignment"("jobDayId", "jobCrewAssignmentId");

-- CreateIndex
CREATE INDEX "JobDayCrewAssignment_jobDayId_idx" ON "JobDayCrewAssignment"("jobDayId");

-- CreateIndex
CREATE INDEX "JobDayCrewAssignment_jobCrewAssignmentId_idx" ON "JobDayCrewAssignment"("jobCrewAssignmentId");
