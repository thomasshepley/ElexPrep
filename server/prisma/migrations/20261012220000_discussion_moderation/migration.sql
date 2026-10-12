-- Edit/soft-delete support for job discussion messages, plus a per-job discussion lock.
ALTER TABLE "JobDiscussionMessage" ADD COLUMN "editedAt" DATETIME;
ALTER TABLE "JobDiscussionMessage" ADD COLUMN "deletedAt" DATETIME;
ALTER TABLE "JobDiscussionMessage" ADD COLUMN "deletedByName" TEXT;
ALTER TABLE "Job" ADD COLUMN "discussionLocked" BOOLEAN NOT NULL DEFAULT false;
