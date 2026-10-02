/*
  Warnings:

  - You are about to drop the column `merchantName` on the `keyword_mappings` table. All the data in the column will be lost.

*/
-- CreateEnum
CREATE TYPE "IncomeType" AS ENUM ('SALARY', 'FREELANCE', 'INVESTMENT', 'SALE', 'GIFT', 'REFUND', 'OTHER');

-- AlterTable
ALTER TABLE "keyword_mappings" DROP COLUMN "merchantName",
ADD COLUMN     "expenseType" TEXT,
ALTER COLUMN "categoryId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "workspaces" ADD COLUMN     "defaultCurrency" TEXT NOT NULL DEFAULT 'EUR',
ADD COLUMN     "monthlyBudget" DECIMAL(12,2);

-- CreateTable
CREATE TABLE "incomes" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "bankAccountId" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "type" "IncomeType" NOT NULL DEFAULT 'SALARY',
    "amount" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "amountEur" DECIMAL(12,2) NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "isRecurring" BOOLEAN NOT NULL DEFAULT false,
    "interval" "RecurrenceInterval",
    "dayOfMonth" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "incomes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "incomes_workspaceId_date_idx" ON "incomes"("workspaceId", "date");

-- CreateIndex
CREATE INDEX "incomes_workspaceId_type_idx" ON "incomes"("workspaceId", "type");

-- AddForeignKey
ALTER TABLE "incomes" ADD CONSTRAINT "incomes_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incomes" ADD CONSTRAINT "incomes_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "bank_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
