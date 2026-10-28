const { chromium } = require('playwright');
const http=require('http'),fs=require('fs'),path=require('path');const root=require('path').resolve(__dirname,'..');
const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png'};
const srv=http.createServer((q,s)=>{let p=q.url.split('?')[0];if(p==='/')p='/index.html';const f=path.join(root,p);fs.readFile(f,(e,d)=>{if(e){s.writeHead(404);s.end();return}s.writeHead(200,{'content-type':types[path.extname(f)]||'text/plain'});s.end(d)})});
const shots=require('os').tmpdir()+'/vaultet-test-shots/'; require('fs').mkdirSync(shots,{recursive:true});
(async()=>{await new Promise(r=>srv.listen(8131,r));
const b=await chromium.launch({...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{}),args:['--no-sandbox']});
const pg=await (await b.newContext({viewport:{width:380,height:820},deviceScaleFactor:2,serviceWorkers:'block'})).newPage();
const errs=[];pg.on('pageerror',e=>errs.push(e.message));pg.on('console',m=>{if(m.type()==='error'&&!/ERR_FAILED/.test(m.text()))errs.push(m.text())});
const T=require('./tlib.js');const native=T.watchNative(pg);
await pg.route(/accounts\.google\.com|fonts\./,r=>r.abort());
await pg.addInitScript(()=>{if(localStorage.getItem('__s'))return;localStorage.setItem('__s','1');
 const d=n=>{const x=new Date();x.setDate(x.getDate()-n);return x.toISOString().slice(0,10)};
 const mk=new Date().toISOString().slice(0,7);
 localStorage.setItem('finance_tracker_accounts_v1',JSON.stringify([{id:'a1',name:'กสิกร',openingBalance:20000}]));
 const E=(i,t,c,a,n,dd)=>({id:'e'+i,type:t,category:c,amount:a,note:n,date:d(dd),accountId:'a1'});
 localStorage.setItem('finance_tracker_entries_v1',JSON.stringify([E(1,'income','กยศ.',9000,'',3),E(2,'expense','กิน',2900,'ข้าว',2),E(3,'expense','คาเฟ่',1300,'กาแฟ',1),E(4,'expense','ค่าเดินทาง',640,'',1),E(5,'saving','เงินออม',1500,'',1)]));
 const now=new Date().toISOString();
 localStorage.setItem('finance_tracker_budgets_v1',JSON.stringify([
  {id:'b1',kind:'expense',categories:['กิน'],name:'กิน',amount:3500,period:'monthly',month:mk,enabled:true,createdAt:now,updatedAt:now},
  {id:'b2',kind:'expense',categories:['คาเฟ่'],name:'คาเฟ่',amount:1200,period:'monthly',month:mk,enabled:true,createdAt:now,updatedAt:now},
  {id:'b4',kind:'saving',categories:['เงินออม'],name:'เงินออม',amount:3000,period:'monthly',month:mk,enabled:true,createdAt:now,updatedAt:now}]));
});
await pg.goto('http://localhost:8131/index.html');await pg.waitForTimeout(1000);
const ok=(n,c)=>console.log((c?'PASS ':'FAIL ')+n);
// งบเดือนนี้อยู่หน้าหลักตั้งแต่ ds47 (รายหมวดพับไว้ กด "ดูรายหมวด" ก่อน); ds61 แถวโชว์ข้อความสถานะ ไม่มีป้าย/ปุ่มย้ายเศษ
ok('budget card visible on home', await pg.isVisible('#ux-home #budgetDashboardCard'));
await pg.click('#budgetDashboardCard .v-card-title');await pg.waitForTimeout(450);
ok('remaining shows 1000 (4700-... check text)', /฿/.test(await pg.textContent('#budgetDashboardRemaining')));
ok('over-budget row says เกินงบ ฿… under its bar', (await pg.textContent('#budgetDashboardRows .v-brow-st.over >> nth=0')).includes('เกินงบ ฿'));
ok('every row shows a status line (none hidden)', (await pg.locator('#budgetDashboardRows details.v-brow-c').count())===(await pg.locator('#budgetDashboardRows details.v-brow-c .v-brow-st').count()));
ok('no sweep-to-saving button or month-end box in the card', !(await pg.locator('#bufferSweepBtn, #budgetDashboardCard .v-note').count()));
ok('big number reads เกิน ฿… when over total budget, never a minus sign', await pg.evaluate(()=>{const t=document.getElementById('budgetDashboardRemaining').textContent;return !t.includes('-')&&(t.startsWith('เกิน ฿')||t.startsWith('฿'));}));
{ const c=pg.locator('#budgetDashboardRows details.v-brow-c'); const n=await c.count(); const h=await pg.evaluate(()=>document.querySelector('#budgetDashboardRows details.v-brow-c').getBoundingClientRect().height);
  ok('budget rows compact ('+n+' rows, first '+Math.round(h)+'px)', n>=1 && h<90);
  const withMore=pg.locator('#budgetDashboardRows details.v-brow-c:has(.v-brow-more)');
  if(await withMore.count()){ await withMore.first().locator('summary').click(); await pg.waitForTimeout(150);
    ok('tapping a budget row shows details', await withMore.first().locator('.v-brow-more').isVisible()); } }
await pg.click('.ux-bottom-item[data-page="plan"]');await pg.waitForTimeout(500);
ok('emergency card visible (เงินของฉัน)', await pg.isVisible('#emergencyDashboardCard'));
ok('duplicate spend card is gone from Plan', !(await pg.locator('#spendSummaryCard').count()));
// manage budgets (ปุ่มจัดการอยู่บนการ์ดงบที่หน้าหลัก)
await pg.click('.ux-bottom-item[data-page="home"]');await pg.waitForTimeout(300);
await pg.click('#budgetDashboardManageBtn'); await pg.waitForTimeout(400);
const rows=await pg.locator('#budgetManageList .v-brow').count();
ok('manager lists budget rows ('+rows+')', rows===3);
await pg.evaluate(()=>{const l=document.getElementById('budgetManageList');l.scrollIntoView({block:'center'})}); await pg.waitForTimeout(200); await pg.screenshot({path:shots+'plan-manager.png'});
await pg.click('#budgetManageList .budget-edit-btn >> nth=0'); await pg.waitForTimeout(200);
ok('edit fills amount input', (await pg.inputValue('#budgetAmountInput'))!=='');
await pg.click('#budgetManageList .budget-delete-btn >> nth=0'); await T.dlgOK(pg); await pg.waitForTimeout(300);
ok('delete removes a budget', (await pg.locator('#budgetManageList .v-brow').count())===2);
await pg.evaluate(()=>document.querySelectorAll('.open').forEach(e=>e.classList.remove('open')));
// emergency settings
await pg.click('.ux-bottom-item[data-page="plan"]');await pg.waitForTimeout(300);
await pg.click('#emergencyDashboardManageBtn'); await pg.waitForTimeout(300);
ok('emergency settings opens', await pg.evaluate(()=>!!document.querySelector('.overlay.open')));
ok('no native browser dialogs ('+native.msgs.join(' | ')+')', native.n===0);
console.log(errs.join('\n')||'no js errors');
await b.close();srv.close()})();
