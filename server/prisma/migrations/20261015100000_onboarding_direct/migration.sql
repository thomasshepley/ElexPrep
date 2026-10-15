-- Onboarding links made directly by an admin
ALTER TABLE "OnboardingInvite" ADD COLUMN "direct" BOOLEAN NOT NULL DEFAULT false;
