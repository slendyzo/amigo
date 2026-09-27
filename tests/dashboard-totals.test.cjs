const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const ts=require('typescript');const Module=require('node:module');const path=require('node:path');
function load(file,mocks={}){const name=path.resolve(file),m=new Module(name,module);m.paths=module.paths;const req=m.require.bind(m);m.require=id=>id in mocks?mocks[id]:req(id);m._compile(ts.transpileModule(fs.readFileSync(name,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,name);return m.exports;}
const split=load('src/lib/split-utils.ts');const spending=load('src/lib/expense-spending.ts',{'./split-utils':split});
const {annualSummary,monthlyBudgetSummary,yearToDateBounds}=load('src/lib/dashboard-totals.ts',{'./expense-spending':spending});
const today=new Date('2026-09-26T12:00:00Z');const bill={id:'bill',date:'2026-09-01',status:'PAID',type:'LIFESTYLE',amount:100,amountEur:80};
test('annual actuals exclude forecasts, future dates, pending spending and internal broker transfers',()=>{
 const income=[{date:'2026-01-01',amountEur:1000,isRecurring:false},{date:'2026-09-01',amountEur:5000,isRecurring:true},{date:'2026-12-01',amountEur:500,isRecurring:false},{date:'2025-12-31',amountEur:500,isRecurring:false}];
 const expenses=[bill,{...bill,id:'pending',status:'PENDING'},{...bill,id:'future',date:'2026-12-01'},{...bill,id:'old',date:'2025-12-31'},{...bill,id:'broker',type:'INVESTMENT'},{...bill,id:'linked'}];
 assert.deepEqual(annualSummary(income,expenses,today,['linked']),{income:1000,spent:80,net:920});
});
test('annual uses converted own share even fully repaid; net-zero records stay zero and budget exclusions still count as actual spending',()=>{
 const people=[{label:'Me',amount:25,locked:true},{label:'Sam',amount:75,locked:true,repayment:{paid:true}}];
 const own={...bill,splitCount:2,splitData:JSON.stringify(people),excludeFromBudget:true};
 const expenses=[own,{...bill,fullyReimbursed:true,projectTotalMode:'INCLUDE'},{...bill,projectTotalMode:'EXCLUDE'}];
 assert.deepEqual(annualSummary([],expenses,today),{income:0,spent:20,net:-20});
});
test('refunds net spending down and currency rounding avoids floating point residue',()=>{
 const result=annualSummary([{date:'2026-01-01',amountEur:0.3,isRecurring:false}],[{...bill,amount:0.1,amountEur:0.1},{...bill,amount:0.2,amountEur:0.2},{...bill,amount:-0.1,amountEur:-0.1}],today);
 assert.deepEqual(result,{income:0.3,spent:0.2,net:0.1});
});
test('year boundary is UTC, not a rolling 12-month forecast',()=>{
 assert.equal(yearToDateBounds(today).gte.toISOString(),'2026-01-01T00:00:00.000Z');
 assert.equal(yearToDateBounds(new Date('2027-01-01T00:00:00Z')).gte.toISOString(),'2027-01-01T00:00:00.000Z');
});
test('monthly progress represents money spent, with explicit zero/unset budgets and overspending',()=>{
 assert.deepEqual(monthlyBudgetSummary(1000,250,5),{remaining:750,over:false,progress:25,daily:150});
 assert.deepEqual(monthlyBudgetSummary(1000,1250,5),{remaining:-250,over:true,progress:100,daily:0});
 assert.deepEqual(monthlyBudgetSummary(null,250,5),{remaining:null,over:false,progress:100,daily:null});
 assert.deepEqual(monthlyBudgetSummary(0,250,5),{remaining:-250,over:true,progress:100,daily:0});
 assert.equal(monthlyBudgetSummary(1000,-100,0).progress,0);
 assert.equal(monthlyBudgetSummary(1000,250,0).daily,750);
});
