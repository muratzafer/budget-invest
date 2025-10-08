/*
  Warnings:

  - The primary key for the `TargetAllocation` table will be changed. If it partially fails, the table could be left without primary key constraint.

*/
-- CreateTable
CREATE TABLE "DCAPlan" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "amount" REAL NOT NULL,
    "period" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "lastRunAt" DATETIME,
    "nextRunAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_TargetAllocation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "symbol" TEXT NOT NULL,
    "targetPct" REAL NOT NULL,
    "asOf" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_TargetAllocation" ("createdAt", "id", "symbol", "targetPct") SELECT "createdAt", "id", "symbol", "targetPct" FROM "TargetAllocation";
DROP TABLE "TargetAllocation";
ALTER TABLE "new_TargetAllocation" RENAME TO "TargetAllocation";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
