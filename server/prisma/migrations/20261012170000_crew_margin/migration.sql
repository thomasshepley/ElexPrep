-- AlterTable
ALTER TABLE "JobCrewAssignment" ADD COLUMN "days" TEXT;

-- AlterTable
ALTER TABLE "CurrentRmsOpportunity" ADD COLUMN "projectId" INTEGER;

-- CreateIndex
CREATE INDEX "CurrentRmsOpportunity_projectId_idx" ON "CurrentRmsOpportunity"("projectId");
