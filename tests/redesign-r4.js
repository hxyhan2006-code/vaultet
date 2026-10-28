// โฉมใหม่ รอบ 4 (ds52): หน้า "เงินของฉัน" — มูลค่าสุทธิ + แถบสัดส่วน + ที่มาของตัวเลข, บัญชี (+เงินกันไว้),
// พอร์ตหุ้น, เงินสำรองและเป้าหมาย, หนี้/เงินให้ยืม; แถวต่างๆ เปิดหน้าต่างเดิม; อัปเดตเองเมื่อข้อมูลเปลี่ยน
const { chromium } = require('playwright');
const http=require('http'),fs=require('fs'),path=require('path');const root=require('path').resolve(__dirname,'..');
const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png'};
const srv=http.createServer((q,s)=>{let p=q.url.split('?')[0];if(p==='/')p='/index.html';const f=path.join(root,p);fs.readFile(f,(e,d)=>{if(e){s.writeHead(404);s.end();return}s.writeHead(200,{'content-type':types[path.extname(f)]||'text/plain'});s.end(d)})});
const shots=require('os').tmpdir()+'/vaultet-test-shots/'; require('fs').mkdirSync(shots,{recursive:true});
(async()=>{await new Promise(r=>srv.listen(8204,r));
const b=await chromium.launch({...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{}),args:['--no-sandbox']});
const pg=await (await b.newContext({viewport:{width:380,height:820},deviceScaleFactor:2,serviceWorkers:'block'})).newPage();
const errs=[];pg.on('pageerror',e=>errs.push(e.message));pg.on('console',m=>{if(m.type()==='error'&&!/ERR_FAILED/.test(m.text()))errs.push(m.text())});
const T=require('./tlib.js');const native=T.watchNative(pg);
await pg.route(/accounts\.google\.com|fonts\./,r=>r.abort());
await pg.addInitScript(()=>{if(localStorage.getItem('__s'))return;localStorage.setItem('__s','1');
 const d=n=>{const x=new Date();x.setDate(x.getDate()-n);return x.toISOString().slice(0,10)};
 localStorage.setItem('finance_tracker_accounts_v1',JSON.stringify([{id:'a1',name:'กสิกร',initialBalance:12000},{id:'a2',name:'เงินสด',initialBalance:800}]));
 localStorage.setItem('finance_tracker_entries_v1',JSON.stringify([{id:'e1',type:'expense',category:'กิน',amount:60,note:'',date:d(0),accountId:'a2'},{id:'e2',type:'saving',category:'เงินสำรองฉุกเฉิน',amount:2000,note:'',date:d(3),accountId:'a1'}]));
 localStorage.setItem('finance_tracker_reserved_v1',JSON.stringify([{id:'r1',name:'ค่าหอ',amount:3000,dueDate:''}]));
 localStorage.setItem('finance_tracker_debts_v1',JSON.stringify([{id:'d1',name:'กยศ.',outstandingBalance:58000,gracePeriod:true,history:[]}]));
 localStorage.setItem('finance_tracker_loans_v1',JSON.stringify([{id:'l1',name:'เพื่อน',amount:500,date:d(5),accountId:'a1',repayments:[]}]));
 localStorage.setItem('vaultet_goals_v1',JSON.stringify([{id:'g1',name:'โน้ตบุ๊ก',target:25000,saved:3000}]));
});
await pg.goto('http://localhost:8204/index.html');await pg.waitForTimeout(1200);
const ok=(n,c)=>console.log((c?'PASS ':'FAIL ')+n);
const vis=s=>pg.isVisible(s);
const tx=async s=>(await pg.textContent(s)).replace(/\s+/g,' ').trim();
const closeAll=()=>pg.evaluate(()=>document.querySelectorAll('.open').forEach(e=>e.classList.remove('open')));
await pg.click('.ux-bottom-item[data-page="plan"]'); await pg.waitForTimeout(400);

ok('net worth = assets 12,240 + owed 500 − debt 58,000 = −45,260 (red)', (await tx('#vMoneyNet'))==='-฿45,260' && await pg.evaluate(()=>document.getElementById('vMoneyNet').style.color.includes('v-out')));
ok('same number as the app-wide net worth', await pg.evaluate(()=>{const n=vaultetNetWorth();return document.getElementById('vMoneyNet').textContent===(n<0?'-':'')+'฿'+fmt(Math.abs(n))}));
ok('composition bar has 3 parts (accounts, emergency, owed) with legend %', (await pg.locator('#vMoneyBar i').count())===3 && (await tx('#vMoneyLegend')).includes('ในบัญชี 80%'));
ok('debt note under the number', (await tx('#vMoneyDebtNote'))==='หักหนี้แล้ว ฿58,000');
ok('assets breakdown folded inside the card, no duplicate net-worth row or account list', await vis('#vMoneyHero #vAssets summary') && !(await vis('#netWorthNum')) && !(await vis('#accountsList')));
await pg.click('#vAssets summary'); await pg.waitForTimeout(150);
ok('unfolding shows where the number comes from (reserved / usable / debts)', await vis('#reservedNum') && (await tx('#availableNum'))==='฿7,240' && await vis('#totalDebtsNum'));
await pg.click('#vAssets summary');

// บัญชี
const rows=await pg.locator('#vMoneyAccounts .v-mrow').allTextContents();
ok('accounts: กสิกร 9,500 and เงินสด 740', rows[0].includes('กสิกร') && rows[0].includes('฿9,500') && rows[1].includes('เงินสด') && rows[1].includes('฿740'));
ok('reserved row: 3,000 and usable 7,240', (await tx('#vMoneyReservedRow')).includes('฿3,000') && (await tx('#vMoneyReservedRow')).includes('ใช้ได้จริง ฿7,240'));
await pg.click('#vMoneyAccounts .v-mrow >> nth=0'); await pg.waitForTimeout(300);
ok('tapping an account opens the Accounts sheet', await pg.evaluate(()=>document.getElementById('accountsOverlay').classList.contains('open')));
await closeAll(); await pg.waitForTimeout(150);
await pg.click('#vMoneyReservedRow'); await pg.waitForTimeout(300);
ok('tapping reserved opens the reserved sheet', await pg.evaluate(()=>document.getElementById('reservedOverlay').classList.contains('open')));
await closeAll(); await pg.waitForTimeout(150);

// ลงทุน
ok('portfolio row says no stocks yet', (await tx('#vMoneyPfRow')).includes('ยังไม่มีหุ้น'));
await pg.click('#vMoneyPfRow'); await pg.waitForTimeout(400);
ok('portfolio row opens the portfolio', await pg.evaluate(()=>!!document.querySelector('#pfOverlay.open, .pf-overlay.open, [id*="pf"].open')));
await closeAll(); await pg.waitForTimeout(200);

// เงินสำรองและเป้าหมาย
ok('emergency and goals cards live under "เงินสำรองและเป้าหมาย"', await vis('#vMoneyKeep #emergencyDashboardCard') && await vis('#vMoneyKeep #goalsCard'));

// หนี้ / ให้ยืม
ok('debt tile: 58,000 · 1 รายการ (red)', (await tx('#vMoneyDebtTile')).includes('฿58,000') && (await tx('#vMoneyDebtTile')).includes('1 รายการ') && await pg.evaluate(()=>document.querySelector('#vMoneyDebtTile .v-mtile-v').classList.contains('is-debt')));
ok('loan tile: 500 owed to me', (await tx('#vMoneyLoanTile')).includes('฿500'));
await pg.click('#vMoneyDebtTile'); await pg.waitForTimeout(300);
ok('debt tile opens the debts sheet', await pg.evaluate(()=>document.getElementById('debtsOverlay').classList.contains('open')));
await closeAll(); await pg.waitForTimeout(150);
await pg.click('#vMoneyLoanTile'); await pg.waitForTimeout(300);
ok('loan tile opens the loans sheet', await pg.evaluate(()=>document.getElementById('loansOverlay').classList.contains('open')));
await closeAll(); await pg.waitForTimeout(150);
await pg.screenshot({path:shots+'r4-money.png',fullPage:true});

// ข้อมูลเปลี่ยน → หน้าอัปเดตเอง
await pg.evaluate(()=>{ entries.unshift({id:'z1',type:'expense',category:'กิน',amount:240,note:'',date:todayISO(),accountId:'a2'}); saveEntries(); render(); });
await pg.waitForTimeout(200);
ok('new expense updates เงินสด to 500 and net worth to −45,500', (await pg.locator('#vMoneyAccounts .v-mrow >> nth=1').textContent()).includes('฿500') && (await tx('#vMoneyNet'))==='-฿45,500');

// ซ่อนตัวเลข (ตา) ใช้กับหน้านี้ด้วย
await pg.evaluate(()=>document.body.classList.add('v-hide-numbers'));
ok('hide-numbers blurs money values here too', await pg.evaluate(()=>getComputedStyle(document.getElementById('vMoneyNet')).filter.includes('blur')));
await pg.evaluate(()=>document.body.classList.remove('v-hide-numbers'));

ok('old shortcut grid hidden', !(await vis('#vShortcuts')));
ok('no "income/positive/primary" in new class names', await pg.evaluate(()=>![...document.querySelectorAll('#ux-plan [class]')].filter(e=>e.closest('#vMoneyHero,.v-msec')&&!e.closest('#vAssets,#emergencyDashboardCard,#goalsCard')).some(e=>/income|positive|primary/.test(e.getAttribute('class')))));
ok('no check marks', !/[✓✔]/.test(await pg.evaluate(()=>document.getElementById('ux-plan').innerText)));
ok('no native dialogs', native.n===0);
ok('no js errors', errs.length===0); if(errs.length) console.log('- '+errs.join(' | ').slice(0,300));
await b.close(); srv.close();
})();
