const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');const ts=require('typescript');const Module=require('node:module');const path=require('node:path');
const filename=path.resolve('src/lib/expense-currency-preference.ts');const m=new Module(filename,module);m.paths=module.paths;
m.require=id=>{if(id==='./currencies')return {CURRENCIES:['EUR','USD','GBP']};return require(id);};
m._compile(ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,filename);
const {createCurrencyPreference}=m.exports;
function storage(){const values=new Map();return {getItem:k=>values.get(k),setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)};}
test('explicit unsaved selection survives reopening, stale defaults and remount, scoped by workspace',async()=>{
 const disk=storage();const writes=[];const pref=createCurrencyPreference(()=>disk,async(...args)=>writes.push(args));
 const save=pref.choose('a','USD');
 assert.equal(pref.read('a','EUR'),'USD');assert.equal(pref.read('b','EUR'),'EUR');
 await save;assert.deepEqual(writes,[['a','USD']]);
 const remounted=createCurrencyPreference(()=>disk,async()=>{});
 assert.equal(remounted.read('a','EUR'),'USD');
 remounted.clear('a');assert.equal(remounted.read('a','EUR'),'EUR');
});
test('rapid selections serialize server writes, with latest value visible immediately',async()=>{
 let release;const first=new Promise(r=>release=r);const writes=[];
 const pref=createCurrencyPreference(()=>storage(),async(_,currency)=>{writes.push(currency);if(currency==='USD')await first;});
 const a=pref.choose('ws','USD');const b=pref.choose('ws','GBP');
 assert.equal(pref.read('ws','EUR'),'GBP');
 await new Promise(r=>setImmediate(r));assert.deepEqual(writes,['USD']);
 release();await Promise.all([a,b]);assert.deepEqual(writes,['USD','GBP']);
});
test('offline and unavailable storage do not erase choice; invalid currencies are ignored',async()=>{
 const pref=createCurrencyPreference(()=>{throw new Error('blocked');},async()=>{throw new Error('offline');});
 await pref.choose('ws','GBP');assert.equal(pref.read('ws','EUR'),'GBP');
 await pref.choose('ws','BAD');assert.equal(pref.read('ws','EUR'),'GBP');
});
test('subscribers see pending choices before server response',async()=>{
 const pref=createCurrencyPreference(()=>storage(),async()=>{});let visible;
 const unsubscribe=pref.subscribe(()=>visible=pref.read('ws','EUR'));
 await pref.choose('ws','USD');assert.equal(visible,'USD');unsubscribe();
 await pref.choose('ws','GBP');assert.equal(visible,'USD');
});
test('preference writes reject a changed workspace and remain conditional on remembering being enabled',async()=>{
 const file=path.resolve('src/app/api/workspace/route.ts');const route=new Module(file,module);route.paths=module.paths;const writes=[];
 const mocks={'next/server':{NextResponse:Response},'@/lib/currencies':{CURRENCIES:['EUR','USD']},
 '@/lib/workspace':{getActiveWorkspace:async()=>({workspace:{id:'a'}})},
 '@/lib/db':{prisma:{workspace:{updateMany:async q=>{writes.push(q);return {count:1};},update:async()=>({id:'a'})}}}};
 route.require=id=>id in mocks?mocks[id]:require(id);
 route._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,file);
 const put=body=>route.exports.PUT(new Request('http://localhost',{method:'PUT',body:JSON.stringify(body)}));
 assert.equal((await put({workspaceId:'b',lastExpenseCurrency:'USD'})).status,409);assert.equal(writes.length,0);
 assert.equal((await put({workspaceId:'a',lastExpenseCurrency:'USD'})).status,200);
 assert.deepEqual(writes[0].where,{id:'a',rememberExpenseCurrency:true});
});
