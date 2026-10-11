-- CreateTable
CREATE TABLE "CrewRateLine" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "crewProfileId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "amount" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CrewRateLine_crewProfileId_fkey" FOREIGN KEY ("crewProfileId") REFERENCES "CrewProfile" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "CrewRateLine_crewProfileId_idx" ON "CrewRateLine"("crewProfileId");

-- Backfill: any crew member with an existing free-text dayRate gets a "Day rate" line so their
-- rate isn't lost when the admin UI switches from the single field to the rate-line manager.
INSERT INTO "CrewRateLine" ("id", "crewProfileId", "label", "amount", "order", "createdAt", "updatedAt")
SELECT lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-' || hex(randomblob(2)) || '-' || hex(randomblob(2)) || '-' || hex(randomblob(6))),
       "id", 'Day rate', "dayRate", 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "CrewProfile"
WHERE "dayRate" IS NOT NULL AND trim("dayRate") != '';
