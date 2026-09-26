ALTER TABLE "workspaces" ADD COLUMN IF NOT EXISTS "rememberExpenseCurrency" BOOLEAN NOT NULL DEFAULT false, ADD COLUMN IF NOT EXISTS "lastExpenseCurrency" VARCHAR(3);
