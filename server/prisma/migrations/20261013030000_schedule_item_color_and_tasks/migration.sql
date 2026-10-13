-- AlterTable
ALTER TABLE "JobScheduleItem" ADD COLUMN "color" TEXT;

-- CreateTable
CREATE TABLE "JobScheduleItemCrewAssignment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "scheduleItemId" TEXT NOT NULL,
    "jobCrewAssignmentId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "JobScheduleItemCrewAssignment_scheduleItemId_fkey" FOREIGN KEY ("scheduleItemId") REFERENCES "JobScheduleItem" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "JobScheduleItemCrewAssignment_jobCrewAssignmentId_fkey" FOREIGN KEY ("jobCrewAssignmentId") REFERENCES "JobCrewAssignment" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "JobScheduleItemCrewAssignment_scheduleItemId_jobCrewAssignmentId_key" ON "JobScheduleItemCrewAssignment"("scheduleItemId", "jobCrewAssignmentId");

-- CreateIndex
CREATE INDEX "JobScheduleItemCrewAssignment_scheduleItemId_idx" ON "JobScheduleItemCrewAssignment"("scheduleItemId");

-- CreateIndex
CREATE INDEX "JobScheduleItemCrewAssignment_jobCrewAssignmentId_idx" ON "JobScheduleItemCrewAssignment"("jobCrewAssignmentId");
