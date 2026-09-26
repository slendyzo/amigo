const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const Module = require('node:module');
const path = require('node:path');
function load(file, mocks = {}) {
  const filename = path.resolve(file);
  const m = new Module(filename, module); m.paths = module.paths;
  const original = m.require.bind(m);
  m.require = id => id in mocks ? mocks[id] : original(id);
  m._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 }
  }).outputText, filename);
  return m.exports;
}
const split = load('src/lib/split-utils.ts');
const totals = load('src/lib/project-expense-totals.ts', {'./split-utils':split});
const rows = [{label:'Me',amount:40,locked:true},{label:'Sam',amount:60,locked:true,repayment:{paid:true}}];
const bill = {amount:100,amountEur:80,splitCount:2,splitData:JSON.stringify(rows)};
test('all project modes count only own converted share; repayment never removes it', () => {
  assert.equal(totals.projectContributionEur(bill),32);
  for (const fullyReimbursed of [false,true]) for(const projectTotalMode of totals.PROJECT_TOTAL_MODES) {
    const expense = {...bill,fullyReimbursed,projectTotalMode};
    const expected = projectTotalMode === 'INCLUDE' || (projectTotalMode === 'AUTO' && !fullyReimbursed) ? 32 : 0;
    assert.equal(totals.projectContributionEur(expense),expected);
    assert.equal(split.effectiveEur(expense),32,'global own-share accounting stays unchanged');
  }
});
test('partial updates preserve omitted fields and reject invalid status/mode', () => {
  assert.deepEqual(totals.projectCountingUpdate({}),{});
  assert.deepEqual(totals.projectCountingUpdate({fullyReimbursed:false}),{fullyReimbursed:false});
  for(const body of [{fullyReimbursed:null},{fullyReimbursed:'true'},{projectTotalMode:null},{projectTotalMode:'auto'},{projectTotalMode:1}]) assert.throws(()=>totals.projectCountingUpdate(body));
});
const baseMocks = {'next/server':{NextResponse:Response}, '@/lib/split-utils':split, '@/lib/project-expense-totals':totals,
  '@/lib/workspace':{getActiveWorkspace:async()=>({workspace:{id:'ws'}})}, '@/lib/utils':{}, '@/lib/currency':{}};
test('expense PUT round-trips independent flags; unrelated edits preserve them and invalid input never writes',async()=>{
  const state={...bill,amount:{toNumber:()=>100},currency:'EUR',workspaceId:'ws',fullyReimbursed:false,projectTotalMode:'AUTO',updatedAt:new Date()};
  let writes=0;
  const route=load('src/app/api/expenses/[id]/route.ts',{...baseMocks,'@/lib/db':{prisma:{expense:{
    findFirst:async({where})=>where.workspaceId==='ws' && where.id==='ours' ? {...state}:null,
    update:async({data})=>{writes++;Object.assign(state,data);return state;}
  }}}});
  const put=body=>route.PUT(new Request('http://localhost',{method:'PUT',body:JSON.stringify(body)}),{params:Promise.resolve({id:'ours'})});
  for(const projectTotalMode of ['AUTO','INCLUDE','EXCLUDE']) {
    const response=await put({fullyReimbursed:true,projectTotalMode});
    assert.equal(response.status,200); const {expense}=await response.json();
    assert.equal(expense.fullyReimbursed,true); assert.equal(expense.projectTotalMode,projectTotalMode);
    assert.equal(expense.splitData,bill.splitData);
  }
  assert.equal((await put({name:'Dinner'})).status,200);
  assert.equal(state.fullyReimbursed,true);assert.equal(state.projectTotalMode,'EXCLUDE');
  assert.equal((await put({fullyReimbursed:'yes'})).status,400);
  assert.equal((await put({projectTotalMode:'BAD'})).status,400);assert.equal(writes,4);
});
test('project list, detail and wrapped agree while preserving historical expense count',async()=>{
  const expenses=[{...bill,id:'split',name:'Dinner',date:'2026-09-20',category:{name:'Food'}},
    {amount:10,amountEur:10,id:'refund',fullyReimbursed:true},
    {amount:7,amountEur:7,id:'include',fullyReimbursed:true,projectTotalMode:'INCLUDE',name:'Taxi',date:'2026-09-21'},
    {amount:500,amountEur:500,id:'exclude',projectTotalMode:'EXCLUDE'}];
  const project={id:'p',name:'Trip',budget:100,_count:{expenses:4}};
  const mocks={...baseMocks,'@/lib/db':{prisma:{
    project:{findFirst:async()=>project,findMany:async()=>[project]},
    expense:{findMany:async({where,select})=>{
      assert.equal(where.workspaceId,'ws');assert.deepEqual(where.projects,{some:{id:'p'}});
      if(select) {assert.equal(select.fullyReimbursed,true);assert.equal(select.projectTotalMode,true);}
      return expenses;
    }}
  }}};
  const request=new Request('http://localhost');const params={params:Promise.resolve({id:'p'})};
  const list=await (await load('src/app/api/projects/route.ts',mocks).GET(request)).json();
  const detail=await (await load('src/app/api/projects/[id]/route.ts',mocks).GET(request,params)).json();
  const {wrapped}=await (await load('src/app/api/projects/[id]/wrapped/route.ts',mocks).GET(request,params)).json();
  assert.equal(list.projects[0].totalSpent,39);assert.equal(detail.project.totalSpent,39);
  assert.equal(detail.project._count.expenses,4);assert.equal(wrapped.totalSpent,39);
  assert.equal(wrapped.expenseCount,2);assert.equal(wrapped.averageExpense,19.5);
  assert.equal(wrapped.highestExpense.amount,32);assert.equal(wrapped.monthlyBreakdown[0].total,39);
});
const spending = load('src/lib/expense-spending.ts', {'./split-utils':split});
test('bookkeeping expenses contribute zero overall even with a project Include override', () => {
  for(const projectTotalMode of totals.PROJECT_TOTAL_MODES) {
    assert.equal(spending.spendingEur({...bill,fullyReimbursed:true,projectTotalMode}),0);
  }
  assert.equal(spending.spendingEur({...bill,projectTotalMode:'EXCLUDE'}),0);
  assert.equal(spending.spendingEur({...bill,projectTotalMode:'INCLUDE'}),32);
  assert.equal(spending.spendingEur(bill),32,'all participants repaid still leaves own share');
  const history=[bill,{...bill,fullyReimbursed:true},{...bill,projectTotalMode:'EXCLUDE'}];
  assert.equal(history.reduce((sum,e)=>sum+spending.spendingEur(e),0),32);
  assert.equal(history.length,3,'bookkeeping history retained');
  assert.equal(totals.projectContributionEur({...bill,fullyReimbursed:true,projectTotalMode:'INCLUDE'}),32);
});
test('account activity excludes net-zero records without excluding budget-only expenses',async()=>{
  let checked=false;
  const route=load('src/app/api/bank-accounts/route.ts',{...baseMocks,
    '@/lib/expense-spending':spending,'@/lib/account-balance':{trackedAccountBalance:()=>100},
    '@/lib/db':{prisma:{bankAccount:{findMany:async()=>[]},income:{groupBy:async()=>[]},expense:{groupBy:async({where})=>{
      assert.equal(where.fullyReimbursed,false);assert.deepEqual(where.projectTotalMode,{not:'EXCLUDE'});
      assert.equal(where.excludeFromBudget,undefined);assert.equal(where.status,'PAID');checked=true;return [];
    }}}}});
  assert.equal((await route.GET()).status,200);assert.equal(checked,true);
});
test('advisor current and previous month aggregates omit bookkeeping-only activity',async()=>{
  let queries=0;
  const check=({where})=>{assert.equal(where.fullyReimbursed,false);assert.deepEqual(where.projectTotalMode,{not:'EXCLUDE'});queries++;};
  const advisor=load('src/lib/insight-aggregator.ts',{
    './expense-spending':spending,'@prisma/client':{InsightType:{}},
    '@/lib/db':{prisma:{expense:{aggregate:async q=>{check(q);return {_sum:{amountEur:0},_count:{id:0}};},
      groupBy:async q=>{check(q);return [];},findMany:async q=>{check(q);return [];},count:async q=>{check(q);return 0;}}}}
  });
  assert.equal((await advisor.aggregateMonth('ws',2026,9)).total,0);assert.equal(queries,7);
});
