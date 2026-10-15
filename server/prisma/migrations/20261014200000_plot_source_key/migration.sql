-- AlterTable
ALTER TABLE "PlotExtraction" ADD COLUMN "sourceKey" TEXT;

-- CreateIndex
CREATE INDEX "PlotExtraction_jobId_sourceKey_idx" ON "PlotExtraction"("jobId", "sourceKey");
