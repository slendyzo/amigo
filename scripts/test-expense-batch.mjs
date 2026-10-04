import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import ts from "typescript";

const require = createRequire(import.meta.url);
function loadTs(file) {
  const filename = path.resolve(file);
  const result = { exports: {} };
  const compiled = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
  const localRequire = name => name.startsWith(".") ? loadTs(path.resolve(path.dirname(filename), `${name}.ts`)) : require(name);
  new Function("require", "module", "exports", compiled)(localRequire, result, result.exports);
  return result.exports;
}
const { assertExpenseBatchWorkspace, validateExpenseBatch, screenshotExpenseId, saveExpenseBatch } = loadTs("src/lib/expense-batch.ts");
const first = { clientId: "abc00000-0000-4000-8000-000000000001", name: "Lunch", merchant: "IKEA", amount: 16.07, currency: "EUR", date: "2026-10-03" };
const second = { ...first, clientId: "abc00000-0000-4000-8000-000000000002", name: "Coffee", amount: 1.25 };
const validate = (...expenses) => validateExpenseBatch({ expectedWorkspaceId: "one", expenses });
assertExpenseBatchWorkspace({ expectedWorkspaceId: "one", expenses: [first] }, "one");
assert.throws(() => assertExpenseBatchWorkspace({ expectedWorkspaceId: "one", expenses: [first] }, "other"), error => error.status === 409 && error.code === "WORKSPACE_CHANGED", "Switching workspace before a retry cannot write to a different ledger");
for (const expectedWorkspaceId of [undefined, null, "", " ", 1, "x".repeat(101)]) assert.throws(() => validateExpenseBatch({ expectedWorkspaceId, expenses: [first] }), /workspace ID/);
assert.equal(validate(first)[0].amount, 16.07);
assert.equal(validate(first)[0].merchant, "IKEA");
assert.equal(validate({ ...first, bankAccountId: null })[0].bankAccountId, null);
assert.equal(validate({ ...first, description: "" })[0].description, null);
assert.equal(validate({ ...first, description: " \n\t " })[0].description, null);
assert.equal(validate({ ...first, description: "First line\nSecond line\twith tab\r\nEnd" })[0].description, "First line\nSecond line\twith tab\r\nEnd");
assert.equal(validate({ ...first, description: "x".repeat(1000) })[0].description.length, 1000);
assert.notEqual(screenshotExpenseId("one", first.clientId), screenshotExpenseId("two", first.clientId));
for (const invalid of [null, [], {}, { expectedWorkspaceId: "one", expenses: [] }, { expectedWorkspaceId: "one", expenses: Array(51).fill(first) }, { expectedWorkspaceId: "one", expenses: [first], workspaceId: "other" }]) assert.throws(() => validateExpenseBatch(invalid));
for (const replacement of [
  { amount: 0 }, { amount: -1 }, { amount: 0.001 }, { amount: NaN }, { amount: Infinity }, { amount: "6.99" }, { amount: 10000000000 },
  { date: "2026-02-30" }, { date: "yesterday" }, { date: "2026-10-03T12:00:00Z" },
  { currency: "ZZZ" }, { currency: "eur" }, { clientId: "one" }, { name: " " }, { merchant: 1 },
  { categoryId: null }, { bankAccountId: [] }, { projectIds: ["a", "a"] }, { projectIds: "a" },
  { type: "WRONG" }, { excludeFromBudget: "true" }, { name: "x".repeat(256) }, { description: "x".repeat(1001) }, { description: "bad\u0000note" }, { description: "bad\u000bnote" }, { screenshot: "secret image" },
]) assert.throws(() => validate({ ...first, ...replacement }), JSON.stringify(replacement));
assert.throws(() => validate(first, first), /Duplicate client ID/);

function fakeDb() {
  let data = { expenses: [], categories: [{ id: "cat", name: "Food", workspaceId: "one" }], accounts: [{ id: "account", workspaceId: "one" }], projects: [{ id: "project", workspaceId: "one" }], mappings: [{ keyword: "ikea", categoryId: "cat", expenseType: "SURVIVAL_VARIABLE", workspaceId: "one" }] };
  const scoped = (rows, where) => rows.filter(row => row.workspaceId === where.workspaceId && (!where.id || where.id.in.includes(row.id)));
  return {
    get data() { return data; }, failName: null,
    expense: { findMany: async ({ where }) => scoped(data.expenses, where) },
    async $transaction(callback) {
      const snapshot = structuredClone(data);
      try {
        return await callback({
          $queryRaw: async () => [],
          expense: {
            findMany: async ({ where }) => scoped(data.expenses, where),
            create: async ({ data: row }) => {
              if (row.name === this.failName) throw new Error("Simulated database failure");
              assert(!data.expenses.some(saved => saved.id === row.id));
              const saved = { ...row, category: data.categories.find(category => category.id === row.categoryId), bankAccount: data.accounts.find(account => account.id === row.bankAccountId) ?? null, projects: row.projects?.connect ?? [] };
              data.expenses.push(saved);
              return saved;
            },
          },
          category: {
            findMany: async ({ where }) => scoped(data.categories, where),
            create: async ({ data: row }) => { const category = { ...row, id: `fallback-${data.categories.length}` }; data.categories.push(category); return category; },
          },
          bankAccount: { findMany: async ({ where }) => scoped(data.accounts, where) },
          project: { findMany: async ({ where }) => scoped(data.projects, where) },
          keywordMapping: { findMany: async ({ where }) => scoped(data.mappings, where) },
        });
      } catch (error) { data = snapshot; throw error; }
    },
  };
}
const workspace = { id: "one", defaultBankAccountId: "account" };
const conversions = [];
const convert = async (amount, currency) => { conversions.push({ amount, currency }); return { amountEur: currency === "USD" ? amount * 0.8 : amount, exchangeRate: currency === "USD" ? 0.8 : 1 }; };
const db = fakeDb();
const original = validate(first, { ...second, bankAccountId: null });
const saved = await saveExpenseBatch(db, workspace, original, convert);
assert.equal(saved.expenses.length, 2);
assert.equal(saved.replayed, false);
assert.equal(saved.expenses[0].name, "Lunch");
assert.equal(saved.expenses[0].merchant, "IKEA");
assert.equal(saved.expenses[0].categoryId, "cat");
assert.equal(saved.expenses[0].type, "SURVIVAL_VARIABLE");
assert.equal(saved.expenses[0].bankAccountId, "account");
assert.equal(saved.expenses[1].bankAccountId, null);
assert.equal(saved.expenses[0].date.toISOString(), "2026-10-03T00:00:00.000Z");
assert(saved.expenses[0].rawInput.startsWith("screenshot-batch:"));
assert(!saved.expenses[0].rawInput.includes("IKEA"));
const replay = await saveExpenseBatch(db, workspace, original, convert);
assert.equal(replay.replayed, true);
const replayWithoutRates = await saveExpenseBatch(db, workspace, original, async () => { throw new Error("Rate service unavailable"); });
assert.equal(replayWithoutRates.replayed, true, "A completed retry never fetches rates");
assert.equal(db.data.expenses.length, 2);
await assert.rejects(saveExpenseBatch(db, workspace, validate({ ...first, amount: 100 }), convert), error => error.status === 409);
assert.equal(db.data.expenses.length, 2);
for (const field of [{ categoryId: "foreign" }, { bankAccountId: "foreign" }, { projectIds: ["foreign"] }]) {
  const isolated = fakeDb();
  isolated.data.categories.push({ id: "foreign", workspaceId: "other", name: "Private" });
  isolated.data.accounts.push({ id: "foreign", workspaceId: "other" });
  isolated.data.projects.push({ id: "foreign", workspaceId: "other" });
  await assert.rejects(saveExpenseBatch(isolated, workspace, validate({ ...first, ...field }), convert), error => error.code === "INVALID_REFERENCE");
  assert.equal(isolated.data.expenses.length, 0);
}
const rollback = fakeDb();
rollback.failName = "Coffee";
await assert.rejects(saveExpenseBatch(rollback, workspace, validate(first, second), convert), /Simulated database failure/);
assert.equal(rollback.data.expenses.length, 0, "A late failure rolls back the entire import");
const fallback = fakeDb();
fallback.data.mappings = [];
const fallbackSaved = await saveExpenseBatch(fallback, workspace, validate({ ...first, merchant: null }, { ...second, merchant: null, currency: "USD" }), convert);
assert.equal(fallback.data.categories.filter(category => category.name === "Uncategorized").length, 1);
assert.equal(fallbackSaved.expenses[1].amountEur, 1);
assert.equal(fallbackSaved.expenses[1].exchangeRate, 0.8);
const foreignWorkspace = await saveExpenseBatch(db, { id: "other", defaultBankAccountId: null }, original.map(row => ({ ...row, bankAccountId: null })), convert);
assert(foreignWorkspace.expenses.every(expense => expense.workspaceId === "other"));
assert.notEqual(foreignWorkspace.expenses[0].id, saved.expenses[0].id);
console.log("Expense batch validation, workspace boundaries, conversions, retries and rollback passed.");
