-- Chat groups within a job's discussion.
CREATE TABLE "DiscussionGroup" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "jobId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT,
    "visibility" TEXT NOT NULL DEFAULT 'EVERYONE',
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DiscussionGroup_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "DiscussionGroup_jobId_idx" ON "DiscussionGroup"("jobId");

CREATE TABLE "DiscussionGroupMember" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "groupId" TEXT NOT NULL,
    "jobCrewAssignmentId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DiscussionGroupMember_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "DiscussionGroup" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "DiscussionGroupMember_jobCrewAssignmentId_fkey" FOREIGN KEY ("jobCrewAssignmentId") REFERENCES "JobCrewAssignment" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "DiscussionGroupMember_groupId_jobCrewAssignmentId_key" ON "DiscussionGroupMember"("groupId", "jobCrewAssignmentId");
CREATE INDEX "DiscussionGroupMember_jobCrewAssignmentId_idx" ON "DiscussionGroupMember"("jobCrewAssignmentId");

-- The message -> group link (deleting a group deletes its messages).
ALTER TABLE "JobDiscussionMessage" ADD COLUMN "groupId" TEXT REFERENCES "DiscussionGroup" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE INDEX "JobDiscussionMessage_groupId_idx" ON "JobDiscussionMessage"("groupId");
