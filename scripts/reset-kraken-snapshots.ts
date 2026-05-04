/**
 * AMIGO-124 — One-shot script to wipe historical PortfolioSnapshot rows for
 * Kraken connections after the connector correctness fixes land.
 *
 * Why: Months of daily snapshots were computed from buggy data (wrong asset
 * values, missing staked positions, wrong P&L). They're immutable per-day
 * records that pollute the performance chart forever unless cleared. The new
 * sync starts a fresh snapshot timeline from the day this script runs.
 *
 * What it deletes:
 *   - PortfolioSnapshot rows where the parent connection's provider = 'KRAKEN'
 *
 * What it does NOT touch:
 *   - PortfolioAsset (gets overwritten by the next sync's upsert)
 *   - ExchangeDeposit (preserves user link/dismiss state)
 *   - Trade (the just-built history remains intact)
 *   - Any non-Kraken connections
 *
 * Usage:
 *   npx tsx scripts/reset-kraken-snapshots.ts --workspace=<id> [--yes]
 *   npx tsx scripts/reset-kraken-snapshots.ts --all [--yes]
 */

import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import readline from "node:readline";

// Mirror src/lib/db.ts's adapter setup so the script connects the same way the
// app does. Prisma 7 with the pg adapter requires this explicit wiring.
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 1,
  connectionTimeoutMillis: 5000,
});
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

function parseArgs() {
  const args = process.argv.slice(2);
  const result: { workspace?: string; all: boolean; yes: boolean } = {
    all: false,
    yes: false,
  };
  for (const arg of args) {
    if (arg === "--all") result.all = true;
    else if (arg === "--yes") result.yes = true;
    else if (arg.startsWith("--workspace=")) result.workspace = arg.slice("--workspace=".length);
    else {
      console.error(`Unknown argument: ${arg}`);
      printUsage();
      process.exit(1);
    }
  }
  return result;
}

function printUsage() {
  console.log(`Usage:
  npx tsx scripts/reset-kraken-snapshots.ts --workspace=<id> [--yes]
  npx tsx scripts/reset-kraken-snapshots.ts --all [--yes]

Wipes PortfolioSnapshot rows for Kraken connections so the performance chart
restarts cleanly after the connector correctness fix.

  --workspace=<id>  Limit to a single workspace
  --all             Apply to every Kraken connection across the database
  --yes             Skip the confirmation prompt
`);
}

function confirm(question: string): Promise<boolean> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise((resolve) => {
    rl.question(`${question} [y/N] `, (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase() === "y" || answer.trim().toLowerCase() === "yes");
    });
  });
}

async function main() {
  const args = parseArgs();

  if (!args.all && !args.workspace) {
    console.error("Either --all or --workspace=<id> is required.");
    printUsage();
    process.exit(1);
  }

  // Find affected connections so we can show the user what they're about to do
  const connections = await prisma.exchangeConnection.findMany({
    where: {
      provider: "KRAKEN",
      ...(args.workspace ? { workspaceId: args.workspace } : {}),
    },
    select: {
      id: true,
      label: true,
      workspaceId: true,
      _count: { select: { snapshots: true } },
    },
  });

  if (connections.length === 0) {
    console.log("No Kraken connections found for the given filter.");
    await prisma.$disconnect();
    return;
  }

  const totalSnapshots = connections.reduce(
    (sum, c) => sum + c._count.snapshots,
    0
  );

  console.log(`\nKraken connections affected (${connections.length}):`);
  for (const c of connections) {
    console.log(
      `  - ${c.label.padEnd(30)} workspace=${c.workspaceId.slice(0, 8)}…  snapshots=${c._count.snapshots}`
    );
  }
  console.log(`\nTotal snapshot rows to delete: ${totalSnapshots}\n`);

  if (totalSnapshots === 0) {
    console.log("Nothing to delete.");
    await prisma.$disconnect();
    return;
  }

  if (!args.yes) {
    const proceed = await confirm(
      "This deletes the historical performance chart for these connections. Continue?"
    );
    if (!proceed) {
      console.log("Aborted.");
      await prisma.$disconnect();
      return;
    }
  }

  const deleted = await prisma.portfolioSnapshot.deleteMany({
    where: {
      exchangeConnection: {
        provider: "KRAKEN",
        ...(args.workspace ? { workspaceId: args.workspace } : {}),
      },
    },
  });

  console.log(`\n✅ Deleted ${deleted.count} PortfolioSnapshot row(s).`);
  console.log(
    "Next portfolio sync will write a fresh snapshot for today; the chart restarts from clean.\n"
  );

  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error("Script failed:", err);
  await prisma.$disconnect();
  process.exit(1);
});
