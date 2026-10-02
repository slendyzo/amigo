CREATE TABLE IF NOT EXISTS "receipt_people" (
    "id" TEXT NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "receipt_people_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "receipt_people_workspaceId_idx" ON "receipt_people"("workspaceId");
DO $$ BEGIN
    ALTER TABLE "receipt_people" ADD CONSTRAINT "receipt_people_workspaceId_fkey"
        FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
