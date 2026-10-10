-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_AdHocLabel" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "jobId" TEXT NOT NULL,
    "labelType" TEXT NOT NULL,
    "contentJson" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "order" INTEGER NOT NULL DEFAULT 0,
    "excludeFromPrint" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AdHocLabel_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_AdHocLabel" ("contentJson", "createdAt", "id", "jobId", "labelType", "quantity") SELECT "contentJson", "createdAt", "id", "jobId", "labelType", "quantity" FROM "AdHocLabel";
DROP TABLE "AdHocLabel";
ALTER TABLE "new_AdHocLabel" RENAME TO "AdHocLabel";
CREATE TABLE "new_PrintQueueItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "jobId" TEXT NOT NULL,
    "labelType" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "sourceId" TEXT,
    "contentJson" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PrintQueueItem_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_PrintQueueItem" ("contentJson", "createdAt", "id", "jobId", "labelType", "quantity", "sourceId", "sourceType", "status", "updatedAt") SELECT "contentJson", "createdAt", "id", "jobId", "labelType", "quantity", "sourceId", "sourceType", "status", "updatedAt" FROM "PrintQueueItem";
DROP TABLE "PrintQueueItem";
ALTER TABLE "new_PrintQueueItem" RENAME TO "PrintQueueItem";
CREATE INDEX "PrintQueueItem_jobId_idx" ON "PrintQueueItem"("jobId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- Backfill `order` for existing rows so today's print output doesn't change: PrintQueueItem
-- rows get a sequential position per (jobId, labelType) ordered by createdAt (id as tiebreak
-- for identical timestamps), then AdHocLabel rows continue that same sequence per group —
-- reproducing the current (accidental) "ad hoc always prints last" behavior as real, editable
-- order values instead of an artifact of query concatenation order.
UPDATE "PrintQueueItem"
SET "order" = (
  SELECT COUNT(*)
  FROM "PrintQueueItem" AS p2
  WHERE p2."jobId" = "PrintQueueItem"."jobId"
    AND p2."labelType" = "PrintQueueItem"."labelType"
    AND (p2."createdAt" < "PrintQueueItem"."createdAt"
         OR (p2."createdAt" = "PrintQueueItem"."createdAt" AND p2."id" <= "PrintQueueItem"."id"))
);

UPDATE "AdHocLabel"
SET "order" = (
  SELECT COUNT(*) FROM "PrintQueueItem" AS p
  WHERE p."jobId" = "AdHocLabel"."jobId" AND p."labelType" = "AdHocLabel"."labelType"
) + (
  SELECT COUNT(*)
  FROM "AdHocLabel" AS a2
  WHERE a2."jobId" = "AdHocLabel"."jobId"
    AND a2."labelType" = "AdHocLabel"."labelType"
    AND (a2."createdAt" < "AdHocLabel"."createdAt"
         OR (a2."createdAt" = "AdHocLabel"."createdAt" AND a2."id" <= "AdHocLabel"."id"))
);

