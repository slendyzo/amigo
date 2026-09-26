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
const utils = load('src/lib/split-utils.ts');
const legacy = [{label:'Me',amount:30,locked:false},{label:'Sam',amount:30,locked:false}];
const paid = utils.initializeSplit(60,2,'Me',legacy);
paid[1].repayment = {paid:true,date:'2026-09-25',note:'Cash'};
test('legacy parsing is safe and malformed shapes are rejected', () => {
  assert.deepEqual(utils.parseSplitData(JSON.stringify(legacy)),legacy);
  for (const data of ['{}','null','[]','[null,null]',JSON.stringify([{...legacy[0],amount:'30'},legacy[1]])]) assert.equal(utils.parseSplitData(data),null);
});
test('recalculation and count changes keep identities and repayment metadata', () => {
  const next = utils.initializeSplit(90,3,'Me',paid);
  assert.deepEqual(next[1].repayment,paid[1].repayment);
  assert.equal(next[1].id,paid[1].id);
  assert.notEqual(next[2].id,paid[1].id);
  assert.equal(next[2].repayment,undefined);
  next[0].locked = true;
  assert.deepEqual(utils.recalculateSplit(120,next)[1].repayment,paid[1].repayment);
  assert.equal(utils.effectiveEur({amount:60,amountEur:50,splitCount:2,splitData:JSON.stringify(paid)}),25);
});
test('expense edits preserve authoritative repayments and reject removal, renaming and reassignment', () => {
  const stale = paid.map(p => ({...p,repayment:undefined}));
  const result = JSON.parse(utils.preserveRepayments(JSON.stringify(paid),JSON.stringify(stale),2));
  assert.deepEqual(result[1].repayment,paid[1].repayment);
  for (const next of [null, JSON.stringify([paid[0],{...paid[1],label:'Alex'}]), JSON.stringify([paid[0],{...paid[1],id:'new'}])]) {
    assert.throws(() => utils.preserveRepayments(JSON.stringify(paid),next,next ? 2 : null),/REPAYMENT_PROTECTED/);
  }
  assert.equal(JSON.parse(utils.preserveRepayments(null,JSON.stringify(paid),2))[1].repayment,undefined);
});
test('legacy repayments survive an ID upgrade without being copied to a renamed row', () => {
  const old = legacy.map(p => ({...p})); old[1].repayment = {paid:true};
  assert.equal(JSON.parse(utils.preserveRepayments(JSON.stringify(old),JSON.stringify(utils.initializeSplit(60,2,'Me',old)),2))[1].repayment.paid,true);
});
test('repayment validation enforces boolean status, real dates, bounded notes and clean undo', () => {
  for (const input of [{paid:'yes'},{paid:true,date:'2026-02-30'},{paid:true,date:'bad'},{paid:true,note:'x'.repeat(1001)},{paid:false,date:'2026-01-01'},{paid:true,amount:20},null]) assert.equal(utils.validRepayment(input),false);
  for (const input of [{paid:false},{paid:true},{paid:true,date:'2024-02-29',note:'Transfer'}]) assert.equal(utils.validRepayment(input),true);
});
function fixture({authorized=true,conflict=false,splitData=JSON.stringify(legacy)}={}) {
  const expense = {id:'ours',workspaceId:'ws',splitCount:2,splitData,amount:60,amountEur:60,status:'PENDING',paidAt:null,updatedAt:new Date()};
  let writes = 0;
  const route = load('src/app/api/expenses/[id]/repayments/route.ts', {
    'next/server':{NextResponse:Response}, '@/lib/split-utils':utils,
    '@/lib/workspace':{getActiveWorkspace:async()=> authorized ? {workspace:{id:'ws'}} : null},
    '@/lib/db':{prisma:{expense:{
      findFirst:async({where})=>where.id === expense.id && where.workspaceId === expense.workspaceId ? {...expense} : null,
      update:async({data,where})=>{ if(conflict) throw {code:'P2025'}; assert.equal(where.workspaceId,'ws'); assert.ok(where.updatedAt); writes++; Object.assign(expense,data); return expense; },
    }}},
  });
  return {expense,writes:()=>writes,patch:(body,id='ours')=>route.PATCH(new Request('http://localhost',{method:'PATCH',body:JSON.stringify({index:1,expectedSplitData:expense.splitData,repayment:{paid:true},...body})}),{params:Promise.resolve({id})})};
}
test('mark, edit optional details, clear details and undo leave expense status and money unchanged',async()=>{
  const f=fixture();
  for(const repayment of [{paid:true,date:'2026-09-25',note:'Cash'},{paid:true,note:'Bank'},{paid:true},{paid:false}]) {
    assert.equal((await f.patch({repayment})).status,200);
    assert.deepEqual(JSON.parse(f.expense.splitData)[1].repayment,repayment);
  }
  assert.equal(f.expense.status,'PENDING'); assert.equal(f.expense.paidAt,null); assert.equal(f.expense.amount,60);
});
test('count-only legacy expenses acquire rows and stable IDs on first save',async()=>{
  const f=fixture({splitData:null}); assert.equal((await f.patch({})).status,200);
  const people=JSON.parse(f.expense.splitData); assert.ok(people[1].id); assert.equal(people[1].amount,30);
});
test('authorization, workspace, self-row, malformed input and stale saves fail without writes',async()=>{
  assert.equal((await fixture({authorized:false}).patch({})).status,401);
  assert.equal((await fixture().patch({},'foreign')).status,404);
  const f=fixture();
  for(const body of [{index:0},{index:2},{index:1.5},{repayment:{paid:'yes'}},{repayment:{paid:true,date:'2025-02-29'}}]) assert.equal((await f.patch(body)).status,400);
  assert.equal((await f.patch({expectedSplitData:null})).status,409);
  assert.equal(f.writes(),0);
  assert.equal((await fixture({conflict:true}).patch({})).status,409);
});
test('ordinary expense PUT cannot erase newer repayments or change protected participants', async () => {
  const state = {id:'ours',workspaceId:'ws',splitCount:2,splitData:JSON.stringify(paid),amount:{toNumber:()=>60},currency:'EUR',updatedAt:new Date()};
  let writes = 0;
  const route = load('src/app/api/expenses/[id]/route.ts', {
    'next/server':{NextResponse:Response}, '@/lib/split-utils':utils,
    '@/lib/workspace':{getActiveWorkspace:async()=>({workspace:{id:'ws'}})}, '@/lib/currency':{},
    '@/lib/db':{prisma:{expense:{findFirst:async()=>({...state}),update:async({data,where})=>{assert.ok(where.updatedAt);writes++;Object.assign(state,data);return state;}}}},
  });
  const put=body=>route.PUT(new Request('http://localhost',{method:'PUT',body:JSON.stringify(body)}),{params:Promise.resolve({id:'ours'})});
  const stale=paid.map(p=>({...p,repayment:undefined}));
  assert.equal((await put({name:'Dinner',splitCount:2,splitData:JSON.stringify(stale)})).status,200);
  assert.equal(JSON.parse(state.splitData)[1].repayment.note,'Cash');
  assert.equal((await put({splitCount:null,splitData:null})).status,400);
  stale[1].label='Alex';
  assert.equal((await put({splitCount:2,splitData:JSON.stringify(stale)})).status,400);
  assert.equal(writes,1);
});
