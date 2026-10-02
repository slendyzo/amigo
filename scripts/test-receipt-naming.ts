// Run with installed Node and TypeScript: node --experimental-strip-types scripts/test-receipt-naming.ts
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import { webcrypto } from "node:crypto";

const require = createRequire(import.meta.url);
const ts = require("typescript");
function load(file: string, dependencies: Record<string, unknown> = {}) {
  const sandbox = { exports: {} as Record<string, (...args: any[]) => any>, crypto: webcrypto, console, URL, require: (name: string) => dependencies[name] || require(name) };
  const source = ts.transpileModule(readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(source, sandbox);
  return sandbox.exports;
}

const splits = load("src/lib/split-utils.ts");
const serialization = load("src/lib/receipt-context.ts");
const original = [
  { id: "self", label: "Me", amount: 20, locked: false },
  { id: "guest", label: "Alex", amount: 20, locked: true, personId: "alex" },
];
const encode = JSON.stringify;
const preserved = JSON.parse(splits.preserveRepayments(encode(original), encode(original.map(({ ...row }) => ({ ...row, personId: undefined }))), 2));
assert.equal(preserved[1].personId, "alex", "stale edits retain saved identity when the label is unchanged");
const renamed = original.map((row, index) => index ? { ...row, label: "Bob" } : row);
assert.equal(JSON.parse(splits.preserveRepayments(encode(original), encode(renamed), 2))[1].personId, undefined, "unpaid rename must require reassignment");
assert.equal(JSON.parse(splits.preserveRepayments(null, encode(original), 2))[1].personId, undefined, "expense creation cannot inject saved identities");
assert.equal(splits.parseSplitData(encode(original.map(row => ({ ...row, personId: "alex" })))), null, "owner cannot be a receipt recipient");
assert.equal(splits.parseSplitData(encode([...original, { id: "guest2", label: "Other Alex", amount: 0, locked: false, personId: "alex" } ])), null, "duplicate saved identities are invalid");
assert.equal(splits.parseSplitData(encode(original.map((row, index) => index ? { ...row, personId: "not an id" } : row))), null);
assert.equal(splits.initializeSplit(60, 3, "Me", original)[1].personId, "alex");
const paid = original.map((row, index) => index ? { ...row, repayment: { paid: true, date: "2026-10-01", note: "Cash" } } : row);
assert.throws(() => splits.preserveRepayments(encode(paid), encode(renamed), 2), /REPAYMENT_PROTECTED/);

let existing: any = { id: "expense", workspaceId: "workspace", name: "Dinner", description: "Private notes", date: new Date("2026-10-01"), updatedAt: new Date("2026-10-02T10:00:00Z"), amount: 40, amountEur: 36, currency: "USD", splitCount: 2, splitData: encode(paid.map(row => ({ ...row, personId: undefined }))) };
let saved = [{ id: "alex", name: "Alex" }];
let writes = 0;
let rejectConcurrentWrite = false;
let authenticated = true;
const prisma = {
  expense: {
    findFirst: async (query: any) => { assert.equal(query.where.workspaceId, "workspace"); return existing; },
    update: async (query: any) => {
      assert.equal(query.where.workspaceId, "workspace");
      assert.equal(query.where.updatedAt, existing.updatedAt);
      if (rejectConcurrentWrite) throw { code: "P2025" };
      writes++;
      return { ...existing, ...query.data };
    },
  },
  receiptPerson: { findMany: async (query: any) => { assert.equal(query.where.workspaceId, "workspace"); return saved; } },
};
const route = load("src/app/api/receipts/naming/route.ts", {
  "next/server": { NextResponse: { json: (body: unknown, init: any = {}) => ({ body, status: init.status || 200 }) } },
  "@/lib/db": { prisma },
  "@/lib/workspace": { getActiveWorkspace: async () => authenticated ? { workspace: { id: "workspace" } } : null },
  "@/lib/split-utils": splits,
  "@/lib/receipt-context": serialization,
});
const body = { expenseId: "expense", updatedAt: existing.updatedAt.toISOString(), assignments: [{ index: 1, personId: "alex" }] };
const call = (input: unknown) => route.POST({ json: async () => input });
let response = await call(body);
assert.equal(response.status, 200);
const named = JSON.parse(response.body.expense.splitData)[1];
assert.equal(named.id, "guest");
assert.equal(named.amount, 20);
assert.equal(named.locked, true);
assert.equal(named.repayment.note, "Cash");
assert.equal(named.personId, "alex");
assert.equal(response.body.expense.description, "Dinner", "private notes are not exported");
assert.equal((await call({ ...body, updatedAt: "2026-10-01" })).status, 409);
saved = [];
assert.equal((await call(body)).status, 400, "foreign or nonexistent identity is rejected");
saved = [{ id: "alex", name: "Alex" }];
assert.equal((await call({ ...body, assignments: [{ index: 1, personId: "alex" }, { index: 1, personId: "alex" }] })).status, 400);
assert.equal((await call({ ...body, assignments: [{ index: 0, personId: "alex" }] })).status, 400);
rejectConcurrentWrite = true;
assert.equal((await call(body)).status, 409, "database races are conflicts");
rejectConcurrentWrite = false;
existing.splitData = response.body.expense.splitData;
assert.equal((await call({ ...body, assignments: [{ index: 1, personId: "bob" }] })).status, 400, "paid saved identities cannot be reassigned");
existing.splitData = null;
response = await call(body);
assert.equal(response.status, 200);
assert.equal(JSON.parse(response.body.expense.splitData)[1].amount, 20);
assert.equal(writes, 2);
authenticated = false;
assert.equal((await call(body)).status, 401);
console.log("PASS: receipt identity integrity, private projection, paid naming, workspace checks, concurrency and legacy splits");
