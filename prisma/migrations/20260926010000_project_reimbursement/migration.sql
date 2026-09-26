DO $$ BEGIN
  CREATE TYPE "ProjectTotalMode" AS ENUM ('AUTO', 'INCLUDE', 'EXCLUDE');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
ALTER TABLE "expenses"
  ADD COLUMN IF NOT EXISTS "fullyReimbursed" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "projectTotalMode" "ProjectTotalMode" NOT NULL DEFAULT 'AUTO';
