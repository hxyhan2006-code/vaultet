const { chromium } = require('playwright');
const http=require('http'),fs=require('fs'),path=require('path');const root=require('path').resolve(__dirname,'..');
const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png'};
const srv=http.createServer((q,s)=>{let p=q.url.split('?')[0];if(p==='/')p='/index.html';const f=path.join(root,p);fs.readFile(f,(e,d)=>{if(e){s.writeHead(404);s.end();return}s.writeHead(200,{'content-type':types[path.extname(f)]||'text/plain'});s.end(d)})});
const shots=require('os').tmpdir()+'/vaultet-test-shots/'; require('fs').mkdirSync(shots,{recursive:true});
(async()=>{await new Promise(r=>srv.listen(8186,r));
const b=await chromium.launch({...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{}),args:['--no-sandbox']});
const pg=await (await b.newContext({viewport:{width:380,height:820},deviceScaleFactor:2,serviceWorkers:'block'})).newPage();
const errs=[];pg.on('pageerror',e=>errs.push(e.message+' @ '+(e.stack||'').split('\n').slice(1,3).join(' | ')));pg.on('console',m=>{if(m.type()==='error'&&!/ERR_FAILED|Failed to load resource/.test(m.text()))errs.push(m.text())});
const T=require('./tlib.js');const native=T.watchNative(pg);
await pg.route(/accounts\.google\.com|fonts\./,r=>r.abort());
await pg.addInitScript(()=>{if(localStorage.getItem('__s'))return;localStorage.setItem('__s','1');
 localStorage.setItem('finance_tracker_accounts_v1',JSON.stringify([{id:'a1',name:'กสิกร',openingBalance:20000}]));
 localStorage.setItem('finance_tracker_loans_v1',JSON.stringify([
  {id:'l1',person:'อุ',name:'อุ',amount:830,date:'2026-09-01',accountId:'a1',repayments:[{id:'r1',amount:300,date:'2026-09-10',accountId:'a1'},{id:'r2',amount:250,date:'2026-10-13',accountId:'a1'}]},
  {id:'l2',person:'ลี',name:'ลี',amount:450,date:'2026-09-01',accountId:'a1',repayments:[{id:'r3',amount:450,date:'2026-09-20',accountId:'a1'}]},
  {id:'l3',person:'อา',name:'อา',amount:200,date:'2026-09-01',accountId:'a1',repayments:[]}]));});
await pg.goto('http://localhost:8186/index.html');await pg.waitForTimeout(1000);
const ok=(n,c)=>console.log((c?'PASS ':'FAIL ')+n);
await pg.evaluate(()=>{renderLoansManageList();document.getElementById('loansOverlay').classList.add('open')}); await pg.waitForTimeout(400);
const activeNames=()=>pg.evaluate(()=>[...document.querySelectorAll('#loansManageList > .v-loan-row')].map(r=>r.querySelector('.acc-name > span').textContent.trim()));
const doneNames=()=>pg.evaluate(()=>[...document.querySelectorAll('#loansManageList .v-loan-done .v-loan-row')].map(r=>r.querySelector('.acc-name > span').textContent.trim()));
ok('main list shows only people who still owe (อุ, อา)', (await activeNames()).map(s=>s.split(' ')[0]).join(',')==='อุ,อา');
ok('the fully repaid person (ลี) is not in the main list', !(await activeNames()).some(s=>s.startsWith('ลี')));
ok('"คืนครบแล้ว (1)" section holds ลี', (await pg.textContent('.v-loan-done > summary')).includes('(1)') && (await doneNames()).some(s=>s.startsWith('ลี')));
ok('paid-off row has no "ค้าง ฿0" line', !(await pg.textContent('.v-loan-done .v-loan-row')).includes('ค้าง'));
ok('paid-off row has no "รับคืน" button', (await pg.locator('.v-loan-done .repay-loan-btn').count())===0);
await pg.click('.v-loan-row >> nth=0 >> .v-loan-hist summary'); await pg.waitForTimeout(200);
const rep=await pg.evaluate(()=>{const r=document.querySelector('.v-loan-rep');const bs=[...r.querySelectorAll('button')].map(x=>x.getBoundingClientRect());const txt=r.querySelector('.mono');return {oneLineText:txt.getBoundingClientRect().height<24,h:Math.round(r.getBoundingClientRect().height),sameLine:Math.abs(bs[0].top-bs[1].top)<3,n:document.querySelectorAll('.v-loan-row')[0].querySelectorAll('.v-loan-rep').length}});
ok('repayment history rows are one line each with the icons side by side ('+JSON.stringify(rep)+')', rep.h<=48 && rep.sameLine && rep.n===2 && rep.oneLineText);
await pg.screenshot({path:shots+'loans-list.png'});
// จ่ายส่วนที่เหลือของ "อุ" ให้ครบ → ย้ายลงช่องคืนครบแล้ว
await pg.click('.v-loan-row >> nth=0 >> .repay-loan-btn'); await T.dlgOK(pg,{amt:'280'}); await pg.waitForTimeout(400);
ok('after the last repayment อุ leaves the main list', (await activeNames()).map(s=>s.split(' ')[0]).join(',')==='อา');
ok('...and shows up under คืนครบแล้ว (2)', (await pg.textContent('.v-loan-done > summary')).includes('(2)'));
await pg.click('.v-loan-done > summary'); await pg.waitForTimeout(200);
await pg.screenshot({path:shots+'loans-done.png'});
// ลบคนที่คืนครบแล้วได้
await pg.click('.v-loan-done .delete-loan-btn >> nth=0'); await T.dlgOK(pg); await pg.waitForTimeout(300);
ok('a paid-off entry can be deleted', (await pg.evaluate(()=>JSON.parse(localStorage.getItem('finance_tracker_loans_v1')||'[]').length))===2);
// ไม่มีใครค้างเลย
await pg.click('.repay-loan-btn >> nth=0'); await T.dlgOK(pg,{amt:'200'}); await pg.waitForTimeout(400);
ok('nobody owes → friendly message instead of an empty list', (await pg.textContent('#loansManageList')).includes('ไม่มีใครค้างคืน'));
ok('no native browser dialogs ('+native.msgs.join(' | ')+')', native.n===0);
console.log(errs.join('\n')||'no js errors');
await b.close();srv.close()})();
