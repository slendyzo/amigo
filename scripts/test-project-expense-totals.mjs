import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import ts from "typescript";

const require = createRequire(import.meta.url);
const mockModules = {};
function loadTs(file) {
  const filename = path.resolve(file);
  const result = { exports: {} };
  const compiled = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
  const localRequire = name => {
    if (mockModules[name]) return mockModules[name];
    if (name.startsWith("@/")) return loadTs("src/" + name.slice(2) + ".ts");
    return name.startsWith(".") ? loadTs(path.resolve(path.dirname(filename), `${name}.ts`)) : require(name);
  };
  new Function("require", "module", "exports", compiled)(localRequire, result, result.exports);
  return result.exports;
}

const { projectExpenseTotals } = loadTs("src/lib/project-expense-totals.ts");
const { spendingEur } = loadTs("src/lib/expense-spending.ts");
const expense = { amount: 500, amountEur: 500 };
assert.deepEqual(projectExpenseTotals([]), { totalSpent: 0, reimbursed: 0, yourCost: 0, budgetSpent: 0 });
assert.deepEqual(projectExpenseTotals([expense]), { totalSpent: 500, reimbursed: 0, yourCost: 500, budgetSpent: 500 });
for (const mode of [undefined, "AUTO", "INCLUDE"]) {
  const reimbursed = { ...expense, fullyReimbursed: true, projectTotalMode: mode };
  assert.deepEqual(projectExpenseTotals([reimbursed]), { totalSpent: 500, reimbursed: 500, yourCost: 0, budgetSpent: mode === "INCLUDE" ? 500 : 0 });
  assert.equal(spendingEur(reimbursed), 0, "Project figures cannot restore overall spending");
}
for (const fullyReimbursed of [false, true]) assert.deepEqual(projectExpenseTotals([{ ...expense, fullyReimbursed, projectTotalMode: "EXCLUDE" }]), { totalSpent: 0, reimbursed: 0, yourCost: 0, budgetSpent: 0 });
assert.deepEqual(projectExpenseTotals([expense, { ...expense, fullyReimbursed: true }]), { totalSpent: 1000, reimbursed: 500, yourCost: 500, budgetSpent: 500 });
for (const paid of [false, true]) {
  const split = { amount: 100, amountEur: 80, splitCount: 2, splitData: JSON.stringify([{ label: "Me", amount: 25, locked: true }, { label: "Other", amount: 75, locked: true, repayment: { paid } }]) };
  assert.equal(projectExpenseTotals([split]).totalSpent, 20, "Only own share, irrespective of split repayments");
  assert.deepEqual(projectExpenseTotals([{ ...split, fullyReimbursed: true }]), { totalSpent: 20, reimbursed: 20, yourCost: 0, budgetSpent: 0 });
}
assert.equal(projectExpenseTotals([{ amount: 100, amountEur: 80, splitCount: 4 }]).totalSpent, 20, "Equal-share fallback");
console.log("Project totals regression passed: original spend, reimbursement, own cost, budget overrides and split shares.");

const project = { id: "project", name: "Reimbursed project", budget: 1000, _count: { expenses: 1 } };
const rows = [{ ...expense, id: "one", fullyReimbursed: true, projectTotalMode: "AUTO", date: new Date("2026-10-07"), category: { name: "Travel" } }];
const queries = [];
mockModules["next/server"] = { NextResponse: { json: data => ({ json: async () => data }) } };
mockModules["@/lib/workspace"] = { getActiveWorkspace: async () => ({ workspace: { id: "workspace" } }) };
mockModules["@/lib/utils"] = { stripHtmlTags: s => s };
mockModules["@/lib/db"] = { prisma: {
  project: { findMany: async () => [project], findFirst: async () => project },
  expense: { findMany: async query => { queries.push(query); return rows; } }
} };
const params = { params: Promise.resolve({ id: "project" }) };
const list = await (await loadTs("src/app/api/projects/route.ts").GET(new Request("http://localhost/api/projects"))).json();
const detail = await (await loadTs("src/app/api/projects/[id]/route.ts").GET(new Request("http://localhost/api/projects/project"), params)).json();
const wrapped = await (await loadTs("src/app/api/projects/[id]/wrapped/route.ts").GET(new Request("http://localhost/api/projects/project/wrapped"), params)).json();
for (const totals of [list.projects[0], detail.project, wrapped.wrapped]) {
  assert.equal(totals.totalSpent, 500);
  assert.equal(totals.reimbursed, 500);
  assert.equal(totals.yourCost, 0);
  assert.equal(totals.budgetSpent, 0);
}
assert.equal(wrapped.wrapped.expenseCount, 1);
assert.equal(wrapped.wrapped.monthlyBreakdown[0].total, 500);
assert.equal(wrapped.wrapped.topCategories[0].total, 500);
assert.equal(wrapped.wrapped.budgetUsage, 0);
assert.ok(queries.every(query => query.where.workspaceId === "workspace"), "All expense reads remain workspace scoped");
rows.length = 0;
const empty = await (await loadTs("src/app/api/projects/[id]/wrapped/route.ts").GET(new Request("http://localhost/api/projects/project/wrapped"), params)).json();
assert.equal(empty.wrapped.totalSpent, 0);
assert.equal(empty.wrapped.yourCost, 0);
console.log("Project list, detail and wrapped API regressions passed, including workspace scoping and reimbursed monthly/category totals.");
