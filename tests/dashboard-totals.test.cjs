const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const ts=require('typescript');const Module=require('node:module');const path=require('node:path');
function load(file,mocks={}){const name=path.resolve(file),m=new Module(name,module);m.paths=module.paths;const req=m.require.bind(m);m.require=id=>id in mocks?mocks[id]:req(id);m._compile(ts.transpileModule(fs.readFileSync(name,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,name);return m.exports;}
const split=load('src/lib/split-utils.ts');const spending=load('src/lib/expense-spending.ts',{'./split-utils':split});
const {annualIncomeWhere,annualSummary,monthlyBudgetSummary,yearToDateBounds}=load('src/lib/dashboard-totals.ts',{'./expense-spending':spending});
const today=new Date('2026-09-26T12:00:00Z');const bill={id:'bill',date:'2026-09-01',status:'PAID',type:'LIFESTYLE',amount:100,amountEur:80};
test('annual actuals exclude forecasts, future dates, pending spending and internal broker transfers',()=>{
 const income=[{date:'2026-01-01',amountEur:1000,isRecurring:false},{date:'2026-12-01',amountEur:5000,isRecurring:true,interval:'MONTHLY'},{date:'2026-12-01',amountEur:500,isRecurring:false},{date:'2025-12-31',amountEur:500,isRecurring:false}];
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

test('configured monthly USD salary contributes elapsed paydays to annual income',()=>{
 const incomes=[{date:'2026-01-15',amount:4300,currency:'USD',amountEur:3870,isRecurring:true,type:'SALARY',interval:'MONTHLY',dayOfMonth:15,bankAccountId:'salary-account'}, {date:'2026-02-01',amountEur:800,isRecurring:false,type:'OTHER',bankAccountId:null}];
 assert.equal(annualSummary(incomes,[],today).income,35630);
});

const salary={name:'Salary',type:'SALARY',bankAccountId:'a',currency:'USD',amountEur:3870,isRecurring:true,interval:'MONTHLY',dayOfMonth:31,date:'2025-12-31'};
test('annual salary uses elapsed calendar paydays, caps February and excludes future payday',()=>{
 assert.equal(annualSummary([salary],[],new Date('2026-03-30T12:00Z')).income,7740);
 assert.equal(annualSummary([salary],[],new Date('2026-03-31T12:00Z')).income,11610);
});
test('recorded paycheck replaces scheduled salary for its account and month, preserving other accounts',()=>{
 const actual={...salary,isRecurring:false,date:'2026-02-27',amountEur:4000};
 assert.equal(annualSummary([salary,actual,{...salary,bankAccountId:'b'}],[],new Date('2026-02-28T12:00Z')).income,15610);
});
test('no backfill before entered start or future one-off income, including late-month pay',()=>{
 assert.equal(annualSummary([{...salary,date:'2026-09-29',dayOfMonth:29}],[],today).income,0);
 assert.equal(annualSummary([{...salary,date:'2026-08-29',dayOfMonth:29}],[],today).income,3870);
});
test('weekly, quarterly and yearly schedules only contribute elapsed occurrences',()=>{
 const asOf=new Date('2026-04-05T12:00Z');
 assert.equal(annualSummary([{...salary,date:'2026-03-29',interval:'WEEKLY',amountEur:100}],[],asOf).income,200);
 assert.equal(annualSummary([{...salary,date:'2025-10-01',dayOfMonth:1,interval:'QUARTERLY',amountEur:100}],[],asOf).income,200);
 assert.equal(annualSummary([{...salary,date:'2025-04-06',interval:'YEARLY',amountEur:100}],[],asOf).income,0);
});

test('annual query keeps active workspace and prior-year schedules without fetching old one-offs',()=>{
 assert.deepEqual(annualIncomeWhere('active-workspace',today),{workspaceId:'active-workspace',OR:[{isRecurring:false,date:yearToDateBounds(today)},{isRecurring:true,date:{lte:today}}]});
 // Lock down the server query seam: it must use the tested selection, not
 // reintroduce the isRecurring:false filter before the calculator sees rows.
 const page=fs.readFileSync('src/app/dashboard/page.tsx','utf8');
 assert.match(page,/where: annualIncomeWhere\(workspace.id, now\)/);
 assert.match(page,/select: \{ amountEur: true, date: true, isRecurring: true, type: true, bankAccountId: true, interval: true, dayOfMonth: true \}/);
});
