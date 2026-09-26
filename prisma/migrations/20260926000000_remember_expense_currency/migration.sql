ALTER TABLE "workspaces" ADD COLUMN "rememberExpenseCurrency" BOOLEAN NOT NULL DEFAULT false, ADD COLUMN "lastExpenseCurrency" VARCHAR(3);
