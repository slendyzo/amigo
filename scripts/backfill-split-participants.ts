/**
 * Forest & Bracket — Split data migration.
 *
 * The legacy split model stored a JSON blob on Expense.splitData:
 *   [{ label: string, amount: number, locked?: boolean }]
 *
 * The new model is a real SplitParticipant table:
 *   { expenseId, memberId | adHocName, share, paid, settledAt, locked }
 *
 * This script reads every Expense with non-null splitData, parses the JSON,
 * and writes one SplitParticipant row per entry. It is idempotent — if an
 * expense already has participant rows, we skip it.
 *
 * splitData is NOT deleted yet. Keep it as a safety net until the redesign
 * fully ships and we've verified the new code path against production.
 *
 * Run: npx tsx scripts/backfill-split-participants.ts [--dry-run]
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

type LegacyRow = { label?: string; amount?: number; locked?: boolean };

async function main() {
  const dryRun = process.argv.includes("--dry-run");

  const expenses = await prisma.expense.findMany({
    where: { splitData: { not: null } },
    select: {
      id: true,
      name: true,
      currency: true,
      splitData: true,
      participants: { select: { id: true } },
    },
  });

  console.log(`Found ${expenses.length} expenses with legacy splitData.`);

  let migrated = 0;
  let skippedAlreadyHasRows = 0;
  let skippedUnparseable = 0;

  for (const expense of expenses) {
    if (expense.participants.length > 0) {
      skippedAlreadyHasRows++;
      continue;
    }

    let rows: LegacyRow[];
    try {
      const parsed = JSON.parse(expense.splitData ?? "null");
      if (!Array.isArray(parsed)) throw new Error("not an array");
      rows = parsed as LegacyRow[];
    } catch (err) {
      console.warn(
        `  [skip] expense ${expense.id} (${expense.name}): could not parse splitData — ${
          (err as Error).message
        }`,
      );
      skippedUnparseable++;
      continue;
    }

    const inputs = rows
      .filter((r) => typeof r?.amount === "number" && !Number.isNaN(r.amount))
      .map((r) => ({
        expenseId: expense.id,
        adHocName: r.label?.trim() || "Sem nome",
        share: r.amount as number,
        paid: false,
        locked: r.locked === true,
      }));

    if (inputs.length === 0) {
      console.warn(`  [skip] expense ${expense.id}: zero usable rows in splitData`);
      skippedUnparseable++;
      continue;
    }

    if (!dryRun) {
      await prisma.splitParticipant.createMany({ data: inputs });
    }

    migrated++;
    console.log(
      `  [${dryRun ? "dry" : "ok"}] expense ${expense.id} (${expense.name}) → ${
        inputs.length
      } participant rows`,
    );
  }

  console.log("---");
  console.log(`Migrated:                  ${migrated}`);
  console.log(`Skipped (already has rows): ${skippedAlreadyHasRows}`);
  console.log(`Skipped (unparseable):      ${skippedUnparseable}`);
  if (dryRun) console.log("(dry run — nothing written)");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
