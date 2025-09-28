-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Transaction" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "accountId" TEXT NOT NULL,
    "categoryId" TEXT,
    "type" TEXT NOT NULL,
    "amount" DECIMAL NOT NULL,
    "currency" TEXT NOT NULL,
    "fxRateToTRY" DECIMAL,
    "description" TEXT,
    "merchant" TEXT,
    "occurredAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "categorySource" TEXT NOT NULL DEFAULT 'rule',
    "suggestedCategoryId" TEXT,
    "suggestedConfidence" REAL,
    CONSTRAINT "Transaction_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Transaction_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Transaction" ("accountId", "amount", "categoryId", "createdAt", "currency", "description", "fxRateToTRY", "id", "merchant", "occurredAt", "type") SELECT "accountId", "amount", "categoryId", "createdAt", "currency", "description", "fxRateToTRY", "id", "merchant", "occurredAt", "type" FROM "Transaction";
DROP TABLE "Transaction";
ALTER TABLE "new_Transaction" RENAME TO "Transaction";
CREATE INDEX "Transaction_categoryId_idx" ON "Transaction"("categoryId");
CREATE INDEX "Transaction_merchant_idx" ON "Transaction"("merchant");
CREATE INDEX "Transaction_description_idx" ON "Transaction"("description");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
