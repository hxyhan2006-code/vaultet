const { chromium } = require('playwright');
const http=require('http'),fs=require('fs'),path=require('path');const root=require('path').resolve(__dirname,'..');
const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png'};
const srv=http.createServer((q,s)=>{let p=q.url.split('?')[0];if(p==='/')p='/index.html';const f=path.join(root,p);fs.readFile(f,(e,d)=>{if(e){s.writeHead(404);s.end();return}s.writeHead(200,{'content-type':types[path.extname(f)]||'text/plain'});s.end(d)})});
(async()=>{await new Promise(r=>srv.listen(8140,r));
const b=await chromium.launch({...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{}),args:['--no-sandbox']});
const pg=await (await b.newContext({viewport:{width:380,height:820},serviceWorkers:'block'})).newPage();
const errs=[];pg.on('pageerror',e=>errs.push(e.message));
const T=require('./tlib.js');const native=T.watchNative(pg);
await pg.route(/accounts\.google\.com|fonts\./,r=>r.abort());
await pg.addInitScript(()=>{if(localStorage.getItem('__s'))return;localStorage.setItem('__s','1');const now=new Date().toISOString();const d=new Date().toISOString().slice(0,10);
 localStorage.setItem('finance_tracker_accounts_v1',JSON.stringify([{id:'a1',name:'กสิกร',initialBalance:1000},{id:'a2',name:'เงินสด',initialBalance:0}]));
 localStorage.setItem('finance_tracker_reserved_v1',JSON.stringify([{id:'r1',name:'ค่าหอ',amount:3000,dueDate:'',createdAt:now}]));
 localStorage.setItem('finance_tracker_loans_v1',JSON.stringify([{id:'l1',person:'เพื่อน A',amount:500,date:d,repayments:[],accountId:'a1'}]));});
await pg.goto('http://localhost:8140/index.html#plan');  // ทางลัดอยู่แท็บ "เงินของฉัน" ตั้งแต่ ds47
await pg.waitForTimeout(1000);
const ok=(n,c)=>console.log((c?'PASS ':'FAIL ')+n);
const get=k=>pg.evaluate(k=>JSON.parse(localStorage.getItem(k)),k);
const closeAll=()=>pg.evaluate(()=>document.querySelectorAll('.open').forEach(e=>e.classList.remove('open')));
// accounts: rename, delete
await pg.click('#vMoreBtn'); await pg.click('#manageAccountsBtn'); await pg.waitForTimeout(300);
ok('accounts: edit+delete icons rendered as svg', (await pg.locator('#accountsManageList .rename-acc-btn svg').count())===2 && (await pg.locator('#accountsManageList .delete-acc-btn svg').count())===2);
await pg.click('.rename-acc-btn >> nth=0'); await T.dlgOK(pg,{name:'กสิกรไทย'}); await pg.waitForTimeout(200);
ok('accounts: rename works', (await get('finance_tracker_accounts_v1'))[0].name==='กสิกรไทย');
await pg.click('.delete-acc-btn >> nth=1'); await T.dlgOK(pg); await pg.waitForTimeout(200);
ok('accounts: delete works', (await get('finance_tracker_accounts_v1')).length===1);
await closeAll();
// reserved
await pg.click('#manageReservedBtn'); await pg.waitForTimeout(300);
await pg.click('.edit-reserved-btn'); await T.dlgOK(pg,{name:'ค่าเน็ต',amt:'800'}); await pg.waitForTimeout(200);
const r=await get('finance_tracker_reserved_v1'); ok('reserved: edit works', r[0].name==='ค่าเน็ต'&&r[0].amount===800);
// reserved: จ่ายแล้ว -> สร้างรายจ่ายจริง + เอาเงินกันไว้ออก
const entBefore=((await get('finance_tracker_entries_v1'))||[]).length;
await pg.click('.pay-reserved-btn'); await T.dlgOK(pg,{amt:'750',acc:'a1'}); await pg.waitForTimeout(300);
const entAfter=(await get('finance_tracker_entries_v1'))||[];
ok('reserved: จ่ายแล้ว creates expense with paid amount', entAfter.length===entBefore+1 && entAfter[0].type==='expense' && entAfter[0].amount===750 && entAfter[0].accountId==='a1');
ok('reserved: จ่ายแล้ว removes the reserved item', (await get('finance_tracker_reserved_v1')).length===0);
await pg.evaluate(()=>{const k='finance_tracker_reserved_v1';localStorage.setItem(k,JSON.stringify([{id:'r9',name:'ค่าหอ',amount:3000,dueDate:''}]));});
await pg.reload(); await pg.waitForTimeout(800);
await pg.click('#vMoreBtn'); await pg.click('#manageReservedBtn'); await pg.waitForTimeout(300);
await pg.click('.delete-reserved-btn'); await T.dlgOK(pg); await pg.waitForTimeout(200);
ok('reserved: delete works', (await get('finance_tracker_reserved_v1')).length===0);
await closeAll();
// loans
await pg.click('#manageLoansBtn'); await pg.waitForTimeout(300);
ok('loans: รับคืน button is text, edit/delete are icons', (await pg.textContent('.repay-loan-btn')).includes('รับคืน') && (await pg.locator('.edit-loan-btn svg').count())===1);
await pg.click('.repay-loan-btn'); await T.dlgOK(pg,{amt:'200'}); await pg.waitForTimeout(300);
const l=await get('finance_tracker_loans_v1'); ok('loans: repayment recorded', (l[0].repayments||[]).length===1 && l[0].repayments[0].amount===200);
await pg.click('.delete-loan-btn'); await T.dlgOK(pg); await pg.waitForTimeout(200);
ok('loans: delete works', (await get('finance_tracker_loans_v1')).length===0);
ok('no native browser dialogs ('+native.msgs.join(' | ')+')', native.n===0);
console.log(errs.join('\n')||'no js errors');
await b.close();srv.close()})();
