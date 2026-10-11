-- AlterTable
ALTER TABLE "CrewApplication" ADD COLUMN "address" TEXT;
ALTER TABLE "CrewApplication" ADD COLUMN "bankDetailsAuthTag" TEXT;
ALTER TABLE "CrewApplication" ADD COLUMN "bankDetailsCiphertext" TEXT;
ALTER TABLE "CrewApplication" ADD COLUMN "bankDetailsIv" TEXT;
ALTER TABLE "CrewApplication" ADD COLUMN "certifications" TEXT;
ALTER TABLE "CrewApplication" ADD COLUMN "gender" TEXT;

-- AlterTable
ALTER TABLE "CrewProfile" ADD COLUMN "address" TEXT;
ALTER TABLE "CrewProfile" ADD COLUMN "bankDetailsAuthTag" TEXT;
ALTER TABLE "CrewProfile" ADD COLUMN "bankDetailsCiphertext" TEXT;
ALTER TABLE "CrewProfile" ADD COLUMN "bankDetailsIv" TEXT;
ALTER TABLE "CrewProfile" ADD COLUMN "certifications" TEXT;
ALTER TABLE "CrewProfile" ADD COLUMN "facebookUrl" TEXT;
ALTER TABLE "CrewProfile" ADD COLUMN "gender" TEXT;
ALTER TABLE "CrewProfile" ADD COLUMN "instagramUrl" TEXT;
ALTER TABLE "CrewProfile" ADD COLUMN "otherLinkUrl" TEXT;
ALTER TABLE "CrewProfile" ADD COLUMN "pronouns" TEXT;

-- CreateTable
CREATE TABLE "OnboardingInvite" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "fullName" TEXT NOT NULL,
    "token" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "reviewedAt" DATETIME,
    "reviewedBy" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "OnboardingInvite_token_key" ON "OnboardingInvite"("token");

-- CreateIndex
CREATE INDEX "OnboardingInvite_status_idx" ON "OnboardingInvite"("status");

