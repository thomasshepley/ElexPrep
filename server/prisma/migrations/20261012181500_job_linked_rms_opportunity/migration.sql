-- CreateTable
CREATE TABLE "JobLinkedRmsOpportunity" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "jobId" TEXT NOT NULL,
    "rmsId" INTEGER NOT NULL,
    "subject" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "JobLinkedRmsOpportunity_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "JobLinkedRmsOpportunity_jobId_rmsId_key" ON "JobLinkedRmsOpportunity"("jobId", "rmsId");
