-- AlterTable
ALTER TABLE "ActivityLogEntry" ADD COLUMN "ipAddress" TEXT;
ALTER TABLE "ActivityLogEntry" ADD COLUMN "userAgent" TEXT;

-- CreateTable
CREATE TABLE "BackupCode" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "usedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BackupCode_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "username" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'USER',
    "prefsJson" TEXT NOT NULL DEFAULT '{}',
    "permissionsJson" TEXT,
    "totpSecretCiphertext" TEXT,
    "totpSecretIv" TEXT,
    "totpSecretAuthTag" TEXT,
    "totpEnabled" BOOLEAN NOT NULL DEFAULT false,
    "totpVerifiedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_User" ("createdAt", "displayName", "id", "passwordHash", "permissionsJson", "prefsJson", "role", "updatedAt", "username") SELECT "createdAt", "displayName", "id", "passwordHash", "permissionsJson", "prefsJson", "role", "updatedAt", "username" FROM "User";
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "BackupCode_userId_idx" ON "BackupCode"("userId");

