-- AlterTable
ALTER TABLE "expenses" ADD COLUMN     "importLogId" TEXT;

-- CreateIndex
CREATE INDEX "expenses_importLogId_idx" ON "expenses"("importLogId");

-- CreateIndex
CREATE INDEX "import_logs_workspaceId_idx" ON "import_logs"("workspaceId");

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_importLogId_fkey" FOREIGN KEY ("importLogId") REFERENCES "import_logs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
