-- CreateTable
CREATE TABLE "LabelTemplate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "jobId" TEXT NOT NULL,
    "labelType" TEXT NOT NULL,
    "elementsJson" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "LabelTemplate_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "LabelTemplate_jobId_idx" ON "LabelTemplate"("jobId");

-- CreateIndex
CREATE UNIQUE INDEX "LabelTemplate_jobId_labelType_key" ON "LabelTemplate"("jobId", "labelType");

