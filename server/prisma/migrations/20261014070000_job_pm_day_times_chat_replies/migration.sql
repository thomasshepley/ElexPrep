-- Job project manager
ALTER TABLE "Job" ADD COLUMN "projectManagerUserId" TEXT REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Named days with call and wrap times
ALTER TABLE "JobDay" ADD COLUMN "name" TEXT;
ALTER TABLE "JobDay" ADD COLUMN "callTime" TEXT;
ALTER TABLE "JobDay" ADD COLUMN "wrapTime" TEXT;

-- Discussion replies and image attachments
ALTER TABLE "JobDiscussionMessage" ADD COLUMN "replyToId" TEXT REFERENCES "JobDiscussionMessage" ("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "JobDiscussionMessage" ADD COLUMN "attachmentPath" TEXT;
ALTER TABLE "JobDiscussionMessage" ADD COLUMN "attachmentMime" TEXT;
ALTER TABLE "JobDiscussionMessage" ADD COLUMN "attachmentName" TEXT;
