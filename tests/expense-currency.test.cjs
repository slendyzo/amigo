const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const Module = require('node:module');
const path = require('node:path');
function load(file, mocks = {}) {
  const filename = path.resolve(file);
  const m = new Module(filename, module);
  m.paths = module.paths;
  const original = m.require.bind(m);
  m.require = id => id in mocks ? mocks[id] : original(id);
  m._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 }
  }).outputText, filename);
  return m.exports;
}
const currencies = load('src/lib/currencies.ts');
function api(remember = false, authorized = true) {
  const workspace = { id: 'workspace-a', defaultCurrency: 'EUR', rememberExpenseCurrency: remember, lastExpenseCurrency: null };
  const route = load('src/app/api/workspace/route.ts', {
    '@/lib/currencies': currencies,
    '@/lib/workspace': { getActiveWorkspace: async () => authorized ? { workspace } : null },
    '@/lib/db': { prisma: { workspace: {
      findUnique: async () => ({ rememberExpenseCurrency: workspace.rememberExpenseCurrency, lastExpenseCurrency: workspace.lastExpenseCurrency }),
      updateMany: async ({ where, data }) => {
        assert.equal(where.id, 'workspace-a');
        assert.equal(where.rememberExpenseCurrency, true);
        if (workspace.rememberExpenseCurrency) Object.assign(workspace, data);
      },
      update: async ({ where, data }) => { assert.equal(where.id, 'workspace-a'); Object.assign(workspace, data); return workspace; },
    } } },
  });
  return { ...route, workspace, save: body => route.PUT({ json: async () => body }) };
}
test('remembered currency is scoped to the active workspace and leaves conversion/default currency intact', async () => {
  const a = api(true);
  assert.equal((await a.save({ lastExpenseCurrency: 'JPY' })).status, 200);
  assert.equal(a.workspace.lastExpenseCurrency, 'JPY');
  assert.equal(a.workspace.defaultCurrency, 'EUR');
  assert.equal((await (await a.GET()).json()).workspace.lastExpenseCurrency, 'JPY');
});
test('disabled setting ignores currency saves; toggle survives subsequent settings reads', async () => {
  const a = api();
  await a.save({ lastExpenseCurrency: 'USD' });
  assert.equal(a.workspace.lastExpenseCurrency, null);
  await a.save({ rememberExpenseCurrency: true });
  await a.save({ lastExpenseCurrency: 'GBP' });
  await a.save({ rememberExpenseCurrency: false });
  await a.save({ lastExpenseCurrency: 'USD' });
  assert.equal(a.workspace.lastExpenseCurrency, 'GBP');
  assert.equal((await (await a.GET()).json()).workspace.rememberExpenseCurrency, false);
});
test('invalid preferences and unauthenticated writes are rejected', async () => {
  const a = api(true);
  assert.equal((await a.save({ rememberExpenseCurrency: 'true' })).status, 400);
  assert.equal((await a.save({ lastExpenseCurrency: 'INVALID' })).status, 400);
  assert.equal((await api(false, false).save({ lastExpenseCurrency: 'USD' })).status, 401);
  assert.equal(a.workspace.lastExpenseCurrency, null);
});
const { initializeSplit, recalculateSplit } = load('src/lib/split-utils.ts');
test('split rounding and locked custom shares remain accurate when total changes', () => {
  const people = initializeSplit(10, 3, 'Me');
  assert.deepEqual(people.map(p => p.amount), [3.33, 3.33, 3.34]);
  people[1] = { label: 'Alex', amount: 4, locked: true };
  const updated = recalculateSplit(12, people);
  assert.equal(updated[1].label, 'Alex');
  assert.equal(updated[1].amount, 4);
  assert.equal(updated.reduce((sum, p) => sum + p.amount, 0), 12);
  assert.equal(recalculateSplit(3, people), null);
});
