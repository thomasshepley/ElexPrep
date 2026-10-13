-- "PM" tag: purple name colour across the site.
ALTER TABLE "User" ADD COLUMN "isProjectManager" BOOLEAN NOT NULL DEFAULT false;

-- Per-slot logo size on the label logo bar, as a percentage of the slot (100 = fit the slot).
ALTER TABLE "Job" ADD COLUMN "logoScaleLeft" INTEGER NOT NULL DEFAULT 100;
ALTER TABLE "Job" ADD COLUMN "logoScale" INTEGER NOT NULL DEFAULT 100;
ALTER TABLE "Job" ADD COLUMN "logoScaleRight" INTEGER NOT NULL DEFAULT 100;
