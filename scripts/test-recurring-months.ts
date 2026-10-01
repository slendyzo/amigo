// Run without extra dependencies: node --experimental-strip-types scripts/test-recurring-months.ts
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import * as monthsModule from "../src/lib/recurring-months.ts";
import * as installmentModule from "../src/lib/installment-math.ts";
const { parseRecurringMonths, recurringDate, recurringMonthAllowed } = monthsModule;

const now = new Date("2026-10-01T00:00:00Z");
// The UI and API share the UTC month key, including the Lisbon rollover hour.
const lisbonRollover = new Date("2026-10-01T00:30:00+01:00");
assert.equal(monthsModule.recurringMonthKey(lisbonRollover), "2026-09");
assert.deepEqual(parseRecurringMonths({ fromMonth: "2026-09" }, lisbonRollover).months, ["2026-09"]);
assert.deepEqual(parseRecurringMonths({ months: ["2026-09", "2026-07", "2026-09"] }, now).months, ["2026-07", "2026-09"]);
assert.deepEqual(parseRecurringMonths({ fromMonth: "2026-08" }, now).months, ["2026-08", "2026-09", "2026-10"]);
assert.deepEqual(parseRecurringMonths({ fromMonth: "2025-12" }, new Date("2026-02-01Z")).months, ["2025-12", "2026-01", "2026-02"]);
assert.equal(parseRecurringMonths({ fromMonth: "2016-11" }, now).months.length, 120);
assert.equal(parseRecurringMonths({ month: 11, year: 2027 }, now).months[0], "2027-12");
assert.deepEqual(parseRecurringMonths({}, now), { months: ["2026-10"], backfill: false });
for (const body of [
  { months: [] }, { months: ["2026-00"] }, { months: ["2026-13"] }, { months: ["2026-1"] },
  { months: ["1899-12"] }, { months: ["2026-11"] }, { fromMonth: "2026-11" },
  { fromMonth: "2016-10" }, { fromMonth: "2026-01", months: ["2026-01"] },
  { months: ["2026-01"], year: 2026 }, { month: 12 }, { month: -1 }, { month: 1.5 },
  { year: 10000 }, { year: 1899 }, { month: "1" }, { months: null },
]) assert.throws(() => parseRecurringMonths(body, now), JSON.stringify(body));
assert.equal(recurringDate("2024-02", 31).toISOString(), "2024-02-29T00:00:00.000Z");
assert.equal(recurringDate("2025-02", 31).toISOString(), "2025-02-28T00:00:00.000Z");
assert.equal(recurringDate("2026-12", 31).toISOString(), "2026-12-31T00:00:00.000Z");
const start = new Date("2026-02-15Z");
const end = new Date("2026-05-01Z");
assert.equal(recurringMonthAllowed("2026-01", start, end), false);
assert.equal(recurringMonthAllowed("2026-02", start, end), true);
assert.equal(recurringMonthAllowed("2026-04", start, end), true);
assert.equal(recurringMonthAllowed("2026-05", start, end), false);
assert.equal(recurringMonthAllowed("2020-01", null, null), true);
console.log("Recurring month regression checks passed");

// Exercise the real route against a small transactional store. No running app,
// network calls, credentials, or database writes are needed.
const require = createRequire(import.meta.url);
const ts = require("typescript");
const compiled = ts.transpileModule(readFileSync(new URL("../src/app/api/recurring-templates/generate/route.ts", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const template: Record<string, any> = {
  id: "payment", workspaceId: "workspace", isActive: true, autoGenerate: false,
  name: "Rent", type: "SURVIVAL_FIXED", amount: 100, currency: "EUR", dayOfMonth: 31,
  startDate: null, endDate: null, installmentMonths: null, installmentTotal: null,
  categoryId: "category", bankAccountId: "account", projects: [{ id: "project" }],
  description: "Note", excludeFromBudget: true,
};
let rows: Record<string, any>[] = [];
let failOnCreate = 0;
let creates = 0;
let locks = 0;
const tx = {
  $queryRaw: async () => { locks++; },
  expense: {
    findMany: async () => rows,
    create: async ({ data }: { data: Record<string, any> }) => {
      creates++;
      if (failOnCreate === creates) throw new Error("Simulated failed write");
      rows.push(data);
      return data;
    },
  },
  recurringTemplate: { updateMany: async () => ({ count: 1 }) },
};
const prisma = {
  recurringTemplate: { findMany: async ({ where }: any) =>
    where.workspaceId === template.workspaceId && (!where.id || where.id.in.includes(template.id)) && (!where.autoGenerate || template.autoGenerate) && (!where.isActive || template.isActive) ? [template] : [] },
  $transaction: async (fn: (client: typeof tx) => Promise<unknown>) => {
    const previous = [...rows];
    try { return await fn(tx); } catch (error) { rows = previous; throw error; }
  },
};
const exports: any = {};
vm.runInNewContext(compiled, { exports, console: { error: () => {} }, require: (name: string) => {
  const modules: Record<string, unknown> = {
    "next/server": { NextResponse: { json: (body: unknown, init?: { status: number }) => ({ body, status: init?.status ?? 200 }) } },
    "@/lib/workspace": { getActiveWorkspace: async () => ({ workspace: { id: "workspace" } }) },
    "@/lib/db": { prisma }, "@/lib/currency": { convertToEur: async (amount: number) => ({ amountEur: amount, exchangeRate: 1 }) },
    "@/lib/installment-math": installmentModule, "@/lib/recurring-months": monthsModule,
  };
  if (!(name in modules)) throw new Error(`Unexpected import ${name}`);
  return modules[name];
} });
const post = (body: unknown) => exports.POST({ json: async () => body });
assert.equal((await post({ months: ["2020-01"] })).status, 400);
assert.equal((await post({ months: ["2020-01"], templateIds: [] })).status, 400);
assert.equal((await post({ months: ["2020-01"], templateOverrides: [{ id: "payment", dayOverride: 32 }] })).status, 400);
assert.equal((await post({ months: ["2020-01"], templateIds: ["another-workspace-id"] })).body.generated, 0);
const request = { months: ["2020-02", "2020-01", "2020-02"], templateIds: ["payment"] };
assert.equal((await post(request)).body.generated, 2);
assert.equal(rows[1].date.toISOString(), "2020-02-29T00:00:00.000Z");
assert.equal(rows[0].bankAccountId, "account");
assert.equal(rows[0].categoryId, "category");
assert.equal(rows[0].projects.connect[0].id, "project");
assert.equal(rows[0].excludeFromBudget, true);
assert.equal((await post(request)).body.skipped, 2);
assert.equal(rows.length, 2);
rows = []; creates = 0; failOnCreate = 2;
assert.equal((await post(request)).status, 500);
assert.equal(rows.length, 0, "A failed batch must roll back every payment");
assert.ok(locks > 0);
failOnCreate = 0; creates = 0;
assert.equal((await post({ months: ["2020-01", "2020-03"], templateIds: ["payment"] })).body.generated, 2);
assert.deepEqual(rows.map((row) => row.date.toISOString().slice(0, 7)), ["2020-01", "2020-03"]);
rows = [];
template.startDate = new Date("2020-01-01Z");
template.endDate = new Date("2020-04-01Z");
template.installmentMonths = 3;
template.installmentTotal = 100;
const installmentResult = await post({ months: ["2019-12", "2020-01", "2020-02", "2020-03", "2020-04"], templateIds: ["payment"] });
assert.equal(installmentResult.body.generated, 3);
assert.equal(installmentResult.body.skipped, 2);
assert.deepEqual(rows.map((row) => row.amount), [33.33, 33.33, 33.34]);
assert.deepEqual(rows.map((row) => row.installmentNumber), [1, 2, 3]);
template.startDate = template.endDate = template.installmentMonths = template.installmentTotal = null;
rows = [];
const actualNow = new Date();
const previousMonth = new Date(Date.UTC(actualNow.getUTCFullYear(), actualNow.getUTCMonth() - 1, 1));
assert.equal((await post({ fromMonth: monthsModule.recurringMonthKey(previousMonth), templateIds: ["payment"] })).body.generated, 2);
assert.equal(rows[1].date.toISOString().slice(0, 7), monthsModule.recurringMonthKey(actualNow));
rows = [];
assert.equal((await exports.GET()).body.generated, 0, "Manual-only payments are not automatically generated");
template.autoGenerate = true;
assert.equal((await exports.GET()).body.generated, 1);
assert.equal((await exports.GET()).body.generated, 0);
assert.equal((await post({ months: [monthsModule.recurringMonthKey(actualNow)], templateIds: ["payment"] })).body.generated, 0);
rows = [];
template.workspaceId = "different-workspace";
assert.equal((await exports.GET()).body.generated, 0);
assert.equal((await post(request)).body.generated, 0);
console.log("Recurring route regression checks passed");
