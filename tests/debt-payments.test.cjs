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
  m.require = (id) => id in mocks ? mocks[id] : original(id);
  m._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 }
  }).outputText, filename);
  return m.exports;
}
const { computeLoanBalance } = load('src/lib/loan-amortization.ts');
test('six-month bike plan counts its first month and current month', () => {
  const balance = computeLoanBalance({ principal: 600, monthlyPayment: 100, termMonths: 6,
    startDate: new Date('2026-08-18'), asOf: new Date('2026-09-19'), firstPaymentAtStart: true });
  assert.equal(balance.monthsElapsed, 2);
  assert.equal(balance.currentBalance, 400);
});
test('ordinary loans retain payment-after-one-month behavior', () => {
  assert.equal(computeLoanBalance({ principal: 600, monthlyPayment: 100,
    startDate: new Date('2026-08-18'), asOf: new Date('2026-09-19') }).currentBalance, 500);
});
test('future installment month is not counted and completed term is capped', () => {
  const base = { principal: 600, monthlyPayment: 100, termMonths: 6, firstPaymentAtStart: true, startDate: new Date('2026-08-31') };
  assert.equal(computeLoanBalance({ ...base, asOf: new Date('2026-07-31') }).currentBalance, 600);
  assert.equal(computeLoanBalance({ ...base, asOf: new Date('2026-09-01') }).currentBalance, 400);
  assert.equal(computeLoanBalance({ ...base, asOf: new Date('2027-02-01') }).currentBalance, 0);
});
module.exports = { load };
const { debtSchedule } = load('src/lib/debt-schedule.ts');
test('month-end schedule has exactly six billing months and clamps next due', () => {
  const s = debtSchedule(new Date('2026-08-31'), 6, new Date('2026-09-01'));
  assert.equal(s.endDate.toISOString(), '2027-02-01T00:00:00.000Z');
  assert.equal(s.nextDue.toISOString(), '2026-09-30T00:00:00.000Z');
});

function debtFixture({ deny = false, failCreate = false } = {}) {
  const { Prisma } = require('@prisma/client');
  const state = {
    debt: { id: 'bike', workspaceId: 'ours', name: 'Bike', type: 'INSTALLMENT', currency: 'EUR',
      principal: 600, principalEur: 600, interestRate: 0, monthlyPayment: 100, termMonths: 6,
      startDate: new Date('2026-09-18'), recurringTemplateId: 'plan', status: 'ACTIVE' },
    template: { id: 'plan', workspaceId: 'ours', name: 'Bike', amount: 100, currency: 'EUR',
      isActive: true, autoGenerate: true, dayOfMonth: 18, startDate: null,
      createdAt: new Date('2026-09-18'), endDate: new Date('2027-03-18'), projects: [], categoryId: 'cat' },
    payments: [{ id: 'first', recurringTemplateId: 'plan', date: new Date('2026-08-18'), amount: 95 }],
  };
  const db = {
    liability: {
      findFirst: async ({where}) => where.id === 'bike' && where.workspaceId === 'ours' ? state.debt : null,
      update: async ({data}) => { Object.assign(state.debt, data); return { ...state.debt, recurringTemplate: state.template }; },
    },
    recurringTemplate: {
      findUnique: async () => state.template,
      update: async ({data}) => Object.assign(state.template, data),
    },
    category: { findFirst: async () => ({id: 'cat'}) },
    expense: {
      count: async ({where}) => state.payments.filter(p => p.recurringTemplateId === where.recurringTemplateId && p.date >= where.date.gte && p.date <= where.date.lte).length,
      create: async ({data}) => { if (failCreate) throw new Error('fixture write failed'); state.payments.push(data); return data; },
    },
    $transaction: async callback => {
      const before = { debt: { ...state.debt }, template: { ...state.template }, payments: state.payments.map(p => ({...p})) };
      try { return await callback(db); } catch (e) { Object.assign(state, before); throw e; }
    },
  };
  const currency = { convertToEur: async amount => ({amountEur: amount, exchangeRate: 1}) };
  const {generateDueForTemplate} = load('src/lib/recurring-generate.ts', {
    './db': {prisma: db}, './currency': currency, './installment-math': load('src/lib/installment-math.ts'),
  });
  class WorkspaceAccessError extends Error { constructor() { super('Forbidden'); this.code = 'FORBIDDEN'; } }
  const route = load('src/app/api/liabilities/[id]/route.ts', {
    'next/server': {NextResponse: Response}, '@/lib/db': {prisma: db}, '@/lib/currency': currency,
    '@/lib/loan-amortization': {computeLoanBalance: input => computeLoanBalance({...input, asOf: new Date('2026-09-19')})},
    '@/lib/debt-schedule': {debtSchedule},
    '@/lib/recurring-generate': { generateDueForTemplate: (id, opts, tx) => generateDueForTemplate(id, {...opts, now: new Date('2026-09-19')}, tx) },
    '@/lib/workspace': { WorkspaceAccessError, requirePermission: async () => { if(deny) throw new WorkspaceAccessError(); return {workspace: {id: 'ours'}}; } },
  });
  return {state, put: (body, id = 'bike') => route.PUT(new Request('http://localhost/api/liabilities/'+id, {
    method: 'PUT', body: JSON.stringify(body), headers: {'Content-Type': 'application/json'},
  }), {params: Promise.resolve({id})})};
}

test('editing first payment date catches up September without duplicating or overwriting August', async () => {
  const {state, put} = debtFixture();
  const response = await put({startDate:'2026-08-18', termMonths:6, monthlyPayment:100});
  assert.equal(response.status, 200);
  assert.equal((await response.json()).generatedExpenses, 1);
  assert.equal(state.payments.length, 2);
  assert.equal(state.payments[0].amount, 95);
  assert.equal(state.payments[1].date.toISOString(), '2026-09-18T00:00:00.000Z');
  assert.equal(Number(state.debt.currentBalance), 400);
  assert.equal(state.template.endDate.toISOString(), '2027-02-01T00:00:00.000Z');
  assert.equal((await put({startDate:'2026-08-18', termMonths:6})).status, 200);
  assert.equal(state.payments.length, 2);
});
test('changing monthly amount preserves historical amounts and updates future payments', async () => {
  const {state, put} = debtFixture();
  assert.equal((await put({monthlyPayment:110})).status, 200);
  assert.equal(Number(state.template.amount),110);
  assert.equal(state.payments[0].amount,95);
});
test('invalid dates, amounts and terms fail before any writes', async () => {
  const {state,put} = debtFixture();
  for (const body of [{startDate:'2026-02-30'}, {startDate:'no'}, {monthlyPayment:-1}, {termMonths:1.5}, {termMonths:0}, {name:''}]) {
    assert.equal((await put(body)).status,400);
  }
  assert.equal(state.payments.length,1);
  assert.equal(state.debt.startDate.toISOString(),'2026-09-18T00:00:00.000Z');
});
test('unauthorized and cross-workspace debts cannot be edited', async () => {
  assert.equal((await debtFixture({deny:true}).put({monthlyPayment:50})).status,403);
  assert.equal((await debtFixture().put({monthlyPayment:50}, 'someone-elses')).status,404);
});
test('generation failure rolls back the schedule and debt', async () => {
  const {state,put} = debtFixture({failCreate:true});
  const log = console.error; console.error = () => {};
  try { assert.equal((await put({startDate:'2026-08-18'})).status,500); }
  finally { console.error = log; }
  assert.equal(state.debt.startDate.toISOString(),'2026-09-18T00:00:00.000Z');
  assert.equal(state.template.startDate,null);
  assert.equal(state.payments.length,1);
});

const {isRegularIncome,hasRecordedSalary} = load('src/lib/income-classification.ts');
test('one-off salary is regular income and replaces only its own account salary forecast', () => {
  const salary = {type:'SALARY',isRecurring:false,bankAccountId:'one'};
  assert.equal(isRegularIncome(salary),true);
  assert.equal(isRegularIncome({type:'GIFT',isRecurring:false}),false);
  assert.equal(hasRecordedSalary({type:'SALARY',bankAccountId:'one'},[salary]),true);
  assert.equal(hasRecordedSalary({type:'SALARY',bankAccountId:'two'},[salary]),false);
  assert.equal(hasRecordedSalary({type:'FREELANCE',bankAccountId:'one'},[salary]),false);
});
const {trackedAccountBalance} = load('src/lib/account-balance.ts');
test('opening balance plus actual transactions stays separate from income, preserving native currency', () => {
  const incomes = [{currency:'USD',amount:100,amountEur:84}];
  const expenses = [{currency:'EUR',amount:42,amountEur:42}];
  assert.equal(trackedAccountBalance(500,'USD',0.84,incomes,expenses),550);
  assert.equal(trackedAccountBalance(0,'EUR',1,[],[{currency:'EUR',amount:10,amountEur:10}]),-10);
});

function incomeFixture() {
  const rows = [
    {id:'forecast', workspaceId:'ours', type:'SALARY', isRecurring:true, bankAccountId:'one', dayOfMonth:1, date:new Date('2026-08-01'), amount:1000, amountEur:1000},
    {id:'actual', workspaceId:'ours', type:'SALARY', isRecurring:false, bankAccountId:'one', date:new Date('2026-09-18'), amount:1100, amountEur:1100},
    {id:'gift', workspaceId:'ours', type:'GIFT', isRecurring:false, bankAccountId:null, date:new Date('2026-09-18'), amount:20, amountEur:20},
    {id:'foreign', workspaceId:'theirs', type:'SALARY', isRecurring:false, bankAccountId:'two', date:new Date('2026-09-18'), amount:9000, amountEur:9000},
  ];
  const route = load('src/app/api/incomes/route.ts', {
    'next/server': {NextResponse:Response},
    '@/lib/workspace': {getActiveWorkspace:async () => ({workspace:{id:'ours'}})},
    '@/lib/income-classification': {hasRecordedSalary}, '@/lib/currency': {},
    '@/lib/db': {prisma:{income:{findMany:async ({where}) => rows.filter(i =>
      i.workspaceId === where.workspaceId && (!where.type || i.type === where.type)
      && (!where.isRecurring || i.isRecurring)
      && (!where.date?.gte || i.date >= where.date.gte)
      && (!where.date?.lte || i.date <= where.date.lte)
      && (!where.date?.lt || i.date < where.date.lt))}}},
  });
  return async (query='') => (await route.GET(new Request('http://localhost/api/incomes'+query))).json();
}
test('monthly income endpoint counts actual paycheck once and respects type/workspace filters', async () => {
  const get = incomeFixture();
  const month = await get('?month=8&year=2026');
  assert.equal(month.total,1120);
  assert.deepEqual(month.incomes.map(i=>i.id).sort(),['actual','gift']);
  const gifts = await get('?month=8&year=2026&type=GIFT');
  assert.equal(gifts.total,20);
  assert.equal(gifts.incomes.length,1);
});
test('unfiltered income endpoint retains recurring templates for Settings', async () => {
  const result = await incomeFixture()();
  assert.equal(result.incomes.some(i=>i.id==='forecast'),true);
  assert.equal(result.incomes.some(i=>i.id==='foreign'),false);
});
