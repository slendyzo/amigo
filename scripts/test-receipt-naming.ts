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

const nameHelpers = load("src/lib/receipt-person-name.ts");
const peopleHelpers = load("src/lib/receipt-people.ts", { "./receipt-person-name": nameHelpers });
assert.equal(nameHelpers.normalizeReceiptPersonName("  NECO  "), "neco");
assert.equal(nameHelpers.normalizeReceiptPersonName("Jose\u0301"), nameHelpers.normalizeReceiptPersonName("José"));
assert.notEqual(nameHelpers.normalizeReceiptPersonName("José"), nameHelpers.normalizeReceiptPersonName("Jose"));
assert.equal(nameHelpers.isPlaceholderReceiptName(" Pessoa   2 "), true);
assert.equal(nameHelpers.isPlaceholderReceiptName("Thaxnay"), false);
assert.equal(peopleHelpers.canonicalReceiptPeople([{ id: "z", name: "Neco" }, { id: "a", name: " NECO " }])[0].id, "a");

let personRecords: { id: string; name: string }[] = [];
let expenseRecords: any[] = [];
let scopeExists = true;
let lockCalls = 0;
let serial = Promise.resolve();
let failWrite = false;
const transaction = {
  $executeRaw: async (_strings: TemplateStringsArray, key: string) => { assert.equal(key, "receipt-people:workspace"); lockCalls++; },
  receiptPerson: {
    findMany: async (query: any) => { assert.equal(query.where.workspaceId, "workspace"); return structuredClone(personRecords); },
    create: async (query: any) => { assert.equal(query.data.workspaceId, "workspace"); const person = { id: `created${personRecords.length}`, name: query.data.name }; personRecords.push(person); return person; },
  },
  project: { findFirst: async (query: any) => { assert.equal(query.where.workspaceId, "workspace"); return scopeExists ? { id: query.where.id } : null; } },
  expense: {
    findFirst: async (query: any) => { assert.equal(query.where.workspaceId, "workspace"); return scopeExists ? { id: query.where.id } : null; },
    findMany: async (query: any) => { assert.equal(query.where.workspaceId, "workspace"); assert.equal(query.where.projects.some.id, "project"); return structuredClone(expenseRecords); },
    update: async (query: any) => {
      assert.equal(query.where.workspaceId, "workspace");
      const record = expenseRecords.find(expense => expense.id === query.where.id);
      assert.equal(query.where.updatedAt.getTime(), record.updatedAt.getTime());
      if (failWrite) throw { code: "P2025" };
      record.splitData = query.data.splitData;
      return record;
    },
  },
};
const transactionalDb = { $transaction: (operation: (tx: typeof transaction) => Promise<unknown>) => {
  // Emulate the serialized critical section and rollback of the advisory-locked transaction.
  const job = serial.then(async () => {
    const oldPeople = structuredClone(personRecords), oldExpenses = structuredClone(expenseRecords);
    try { return await operation(transaction); }
    catch (error) { personRecords = oldPeople; expenseRecords = oldExpenses; throw error; }
  });
  serial = job.then(() => undefined, () => undefined);
  return job;
} };
const dependencies = {
  "next/server": { NextResponse: { json: (body: unknown, init: any = {}) => ({ body, status: init.status || 200 }) } },
  "@/lib/db": { prisma: transactionalDb },
  "@/lib/workspace": { getActiveWorkspace: async () => ({ workspace: { id: "workspace" } }) },
  "@/lib/receipt-people": peopleHelpers,
  "@/lib/receipt-person-name": nameHelpers,
  "@/lib/split-utils": splits,
};
const peopleRoute = load("src/app/api/receipts/people/route.ts", dependencies);
const concurrent = await Promise.all(Array.from({ length: 12 }, (_, index) => peopleRoute.POST({ json: async () => ({ name: index % 2 ? " NECO " : "Neco" }) })));
assert.equal(personRecords.length, 1);
assert.equal(new Set(concurrent.map(response => response.body.id)).size, 1);
assert.equal(concurrent.filter(response => response.status === 201).length, 1);
assert.equal(lockCalls, 12);

personRecords = [{ id: "z-neco", name: "Neco" }, { id: "a-neco", name: "neco" }, { id: "sage", name: "Sage" }];
const oldRows = [
  { id: "self", label: "Me", amount: 10, locked: false },
  { id: "neco-row", personId: "z-neco", label: "Person 2", amount: 15, locked: true, repayment: { paid: true, note: "Cash", date: "2026-10-01" } },
  { id: "sage-row", label: " SAGE ", amount: 15, locked: false },
];
expenseRecords = [{ id: "trip", workspaceId: "workspace", splitCount: 3, updatedAt: new Date(), splitData: encode(oldRows) }];
const resolver = load("src/app/api/receipts/resolve/route.ts", dependencies);
const resolve = () => resolver.POST({ json: async () => ({ projectId: "project" }) });
let resolution = await resolve();
assert.equal(resolution.status, 200);
assert.equal(resolution.body.resolved, 2);
const repaired = JSON.parse(expenseRecords[0].splitData);
assert.equal(repaired[1].personId, "a-neco");
assert.deepEqual(repaired[1].repayment, oldRows[1].repayment);
assert.equal(repaired[1].amount, 15);
assert.equal(repaired[1].locked, true);
assert.equal(repaired[1].id, "neco-row");
assert.equal(repaired[2].personId, "sage");
assert.equal(personRecords.length, 3, "duplicate people are not deleted");
assert.equal((await resolve()).body.resolved, 0, "repair is idempotent");
expenseRecords[0].splitData = encode([oldRows[0], { ...oldRows[1], personId: undefined, label: "Brand New" }, { ...oldRows[2], label: "brand new" }]);
const beforeAmbiguous = encode(expenseRecords);
resolution = await resolve();
assert.equal(resolution.status, 409);
assert.equal(resolution.body.code, "AMBIGUOUS_RECEIPT_PEOPLE");
assert.equal(personRecords.length, 3, "ambiguous scope rolls back created people");
assert.equal(encode(expenseRecords), beforeAmbiguous, "ambiguous scope does not mutate splits");
expenseRecords[0].splitData = encode(oldRows);
failWrite = true;
assert.equal((await resolve()).body.code, "RECEIPT_CONFLICT");
assert.equal(expenseRecords[0].splitData, encode(oldRows));
failWrite = false;
expenseRecords[0].splitData = encode([oldRows[0], { ...oldRows[1], personId: undefined, label: "Person 2" }, { ...oldRows[2], label: "Pessoa 3" }]);
assert.equal((await resolve()).body.resolved, 0, "placeholders remain for the wizard");
scopeExists = false;
assert.equal((await resolve()).status, 404);
console.log("PASS: exact Unicode matching, concurrent name reuse, canonical paid repair, placeholders, ambiguity rollback and write races");

// Exercise the real receipt aggregation after repair, not a mocked total calculator.
const receiptData = load("src/lib/receipt-data.ts");
scopeExists = true;
const expenseBase = { workspaceId: "workspace", currency: "USD", updatedAt: new Date("2026-10-02T10:00:00Z"), date: new Date("2026-10-01T12:00:00Z") };
expenseRecords = [
  { ...expenseBase, id: "neco-paid", name: "Dinner", amount: 40, amountEur: 36, splitCount: 3, splitData: encode(oldRows) },
  { ...expenseBase, id: "neco-unpaid", name: "Taxi", amount: 60, amountEur: 54, splitCount: 3, splitData: encode([
    { id: "self-taxi", label: "Me", amount: 20, locked: false },
    { id: "neco-taxi", personId: "a-neco", label: "neco", amount: 25, locked: true },
    { id: "sage-taxi", personId: "sage", label: "Sage", amount: 15, locked: false },
  ]) },
  { ...expenseBase, id: "sage-only", name: "Museum", amount: 30, amountEur: 27, splitCount: 2, splitData: encode([
    { id: "self-museum", label: "Me", amount: 10, locked: false },
    { id: "sage-museum", personId: "sage", label: "Sage", amount: 20, locked: true },
  ]) },
];
assert.equal((await resolve()).status, 200);
const repairedContext = {
  title: "New York",
  people: peopleHelpers.canonicalReceiptPeople(personRecords),
  expenses: expenseRecords.map(serialization.serializeReceiptExpense),
};
const necoTicket = receiptData.buildReceipt(repairedContext, "a-neco", "original", "en");
assert.equal(necoTicket.lines.length, 2, "both old and canonical Neco IDs contribute after repair");
assert.deepEqual(Array.from(necoTicket.lines, (line: any) => line.expenseId).sort(), ["neco-paid", "neco-unpaid"]);
assert.equal(necoTicket.totals[0].total, 40, "only Neco's 15 + 25 shares are included");
assert.equal(necoTicket.totals[0].paid, 15);
assert.equal(necoTicket.totals[0].owed, 25, "paid share is deducted from balance");
assert.equal(necoTicket.lines.some((line: any) => line.expenseId === "sage-only"), false);
assert.equal(JSON.stringify(necoTicket).includes("Sage"), false, "no other recipient identity leaks into Neco's ticket");
const eurTicket = receiptData.buildReceipt(repairedContext, "a-neco", "eur", "en");
assert.equal(eurTicket.totals[0].total, 36);
assert.equal(eurTicket.totals[0].paid, 13.5);
assert.equal(eurTicket.totals[0].owed, 22.5);
const sageTicket = receiptData.buildReceipt(repairedContext, "sage", "original", "en");
assert.equal(sageTicket.totals[0].total, 50, "other recipient retains their own independent shares");
console.log("PASS: repaired duplicate identities feed actual receipt aggregation with every own share, paid deduction and recipient isolation");
