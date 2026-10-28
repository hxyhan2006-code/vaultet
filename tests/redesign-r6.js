// เก็บตกหลังปรับโฉม (ds54): ไม่เหลือช่องเลือก/วันที่/เดือนแบบเบราว์เซอร์ที่มองเห็นได้, ปุ่มแบบใหม่ตามค่าที่โค้ดตั้ง,
// เลือกในกล่องข้อความแบบกางในกล่องเดิม, แผ่นเลือกเดือน, แถบเตือนสำรองข้อมูลย้ายไปกระดิ่ง
const { chromium } = require('playwright');
const http=require('http'),fs=require('fs'),path=require('path');const root=require('path').resolve(__dirname,'..');
const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png'};
const srv=http.createServer((q,s)=>{let p=q.url.split('?')[0];if(p==='/')p='/index.html';const f=path.join(root,p);fs.readFile(f,(e,d)=>{if(e){s.writeHead(404);s.end();return}s.writeHead(200,{'content-type':types[path.extname(f)]||'text/plain'});s.end(d)})});
const shots=require('os').tmpdir()+'/vaultet-test-shots/'; require('fs').mkdirSync(shots,{recursive:true});
(async()=>{await new Promise(r=>srv.listen(8206,r));
const b=await chromium.launch({...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{}),args:['--no-sandbox']});
const pg=await (await b.newContext({viewport:{width:380,height:820},deviceScaleFactor:2,serviceWorkers:'block'})).newPage();
const errs=[];pg.on('pageerror',e=>errs.push(e.message));pg.on('console',m=>{if(m.type()==='error'&&!/ERR_FAILED/.test(m.text()))errs.push(m.text())});
const T=require('./tlib.js');const native=T.watchNative(pg);
await pg.route(/accounts\.google\.com|fonts\./,r=>r.abort());
await pg.addInitScript(()=>{if(localStorage.getItem('__s'))return;localStorage.setItem('__s','1');
 const d=n=>{const x=new Date();x.setDate(x.getDate()-n);return x.toISOString().slice(0,10)};
 localStorage.setItem('finance_tracker_accounts_v1',JSON.stringify([{id:'a1',name:'กสิกร',initialBalance:12000},{id:'a2',name:'เงินสด',initialBalance:800}]));
 localStorage.setItem('finance_tracker_entries_v1',JSON.stringify([{id:'e1',type:'expense',category:'กิน',amount:60,note:'',date:d(0),accountId:'a2'}]));
 localStorage.setItem('finance_tracker_reserved_v1',JSON.stringify([{id:'r1',name:'ค่าหอ',amount:3000,dueDate:''}]));});
await pg.goto('http://localhost:8206/index.html');await pg.waitForTimeout(1500);
const ok=(n,c)=>console.log((c?'PASS ':'FAIL ')+n);
const vis=s=>pg.isVisible(s);
const closeAll=()=>pg.evaluate(()=>document.querySelectorAll('.open').forEach(e=>e.classList.remove('open')));
const visibleNative=()=>pg.evaluate(()=>[...document.querySelectorAll('select, input[type=date], input[type=month]')].filter(e=>e.offsetParent!==null&&getComputedStyle(e).visibility!=='hidden').map(e=>e.id||e.name||e.tagName));

// ---- แถบเตือนสำรองข้อมูล → กระดิ่ง ----
ok('backup banner is not shown on home', !(await vis('#backupBanner')));
ok('bell has an unread dot', await vis('#uxBellDot'));
await pg.click('#uxBellBtn'); await pg.waitForTimeout(400);
ok('bell lists "ยังไม่ได้สำรองข้อมูล"', (await pg.textContent('#notificationFullList')).includes('ยังไม่ได้สำรองข้อมูล'));
await pg.click('[data-notif-id^="backup-"]'); await pg.waitForTimeout(600);
ok('tapping it opens the settings page (backup rows)', await vis('#ux-more') && await vis('#vSetExport'));
ok('the notice is now read', await pg.evaluate(()=>loadVaultetNotifications().find(n=>n.id.startsWith('backup-')).read===true));
await pg.click('#uxBackBtn'); await pg.waitForTimeout(300);
// สำรองแล้ว → ไม่ซ้ำ ไม่เพิ่มใหม่
await pg.evaluate(()=>{ setLastBackup(new Date().toISOString()); refreshBackupBanner(); });
ok('after a backup, no new unread backup notice', await pg.evaluate(()=>loadVaultetNotifications().filter(n=>n.id.startsWith('backup-')&&!n.read).length===0));

// ---- ไม่มีช่องแบบเบราว์เซอร์ที่มองเห็นได้ ในหน้า/หน้าต่างต่างๆ ----
const seen=[];
for(const step of [
  async()=>{ await pg.click('.ux-bottom-item[data-page="analysis"]'); await pg.click('#vRepMore summary'); },
  async()=>{ await pg.evaluate(()=>openBudgetManager()); },
  async()=>{ await closeAll(); await pg.evaluate(()=>openEmergencyManager()); },
  async()=>{ await closeAll(); await pg.click('.ux-bottom-item[data-page="plan"]'); await pg.click('#vMoneyDebtTile'); },
  async()=>{ await closeAll(); await pg.evaluate(()=>openForm(null)); },
]){ await step(); await pg.waitForTimeout(350); seen.push(...await visibleNative()); }
await closeAll(); await pg.evaluate(()=>closeForm());
ok('no visible native select/date/month boxes ('+(seen.join(',')||'none')+')', seen.length===0);

// ---- ปุ่มตามค่าที่โค้ดตั้ง (ไม่มี event) ----
await pg.evaluate(()=>openBudgetManager()); await pg.waitForTimeout(300);
const btnFor=id=>pg.evaluate(id=>document.querySelector('.v-fbtn[data-for="'+id+'"] .v-fbtn-t')?.textContent,id);
ok('month box shows a Thai month label', /25\d\d/.test(await btnFor('budgetMonthInput')));
await pg.evaluate(()=>{ document.getElementById('budgetMonthInput').value='2026-01'; });
ok('setting the value from code updates the button (มกราคม 2569)', (await btnFor('budgetMonthInput'))==='มกราคม 2569');
await pg.click('.v-fbtn[data-for="budgetMonthInput"]'); await pg.waitForTimeout(300);
ok('month sheet lists months with "(เดือนนี้)"', (await pg.locator('.v-dlg-sheet .v-pick-row').count())>=30 && (await pg.textContent('.v-dlg-sheet')).includes('(เดือนนี้)'));
await pg.click('.v-dlg-sheet .v-pick-row >> text=/เดือนนี้/'); await pg.waitForTimeout(250);
ok('picking "เดือนนี้" sets the real month input', (await pg.inputValue('#budgetMonthInput'))===(await pg.evaluate(()=>monthKey(todayISO()))));
await closeAll();

// ---- กล่องข้อความ: เลือกบัญชี/วันที่แบบกางในกล่องเดิม ----
await pg.click('.ux-bottom-item[data-page="plan"]'); await pg.waitForTimeout(200);
await pg.click('#vMoneyReservedRow'); await pg.waitForTimeout(300); await pg.click('.pay-reserved-btn'); await pg.waitForSelector('.v-dlg');
ok('dialog shows buttons instead of native boxes', (await pg.locator('.v-dlg .v-fbtn-auto').count())>=2 && (await pg.evaluate(()=>[...document.querySelectorAll('.v-dlg select,.v-dlg input[type=date]')].every(e=>e.offsetParent===null))));
await pg.click('.v-dlg .v-fbtn[data-name="acc"]'); await pg.waitForTimeout(200);
ok('account list opens inside the same dialog (no second dialog)', (await pg.locator('.v-dlg').count())===1 && await vis('.v-dlg .v-fpanel'));
await pg.screenshot({path:shots+'r6-dialog.png'});
await pg.click('.v-dlg .v-fpanel .v-pick-row[data-value="a2"]'); await pg.waitForTimeout(150);
const dateBtn=await pg.$('.v-dlg .v-fbtn-auto[data-name]:not([data-name="acc"]):not([data-name="cat"])');
if(dateBtn){ await dateBtn.click(); await pg.waitForTimeout(200); await pg.click('.v-dlg .v-fpanel .v-date-quick .v-fchip >> nth=1'); await pg.waitForTimeout(150); }
await pg.click('.v-dlg-ok'); await pg.waitForTimeout(400);
const es=await pg.evaluate(()=>JSON.parse(localStorage.getItem('finance_tracker_entries_v1')));
const paid=es.find(e=>e.amount===3000);
ok('paid entry uses the account picked in the dialog (เงินสด)'+(dateBtn?' and yesterday':''), !!paid && paid.accountId==='a2' && (!dateBtn || paid.date===(await pg.evaluate(()=>{const x=new Date();x.setDate(x.getDate()-1);return x.toISOString().slice(0,10)}))));

ok('Drive auto-sync is a switch', await pg.evaluate(()=>document.getElementById('gdriveAutoSyncToggle').classList.contains('v-switch')));
ok('no native dialogs', native.n===0);
ok('no js errors', errs.length===0); if(errs.length) console.log('- '+errs.join(' | ').slice(0,300));
await b.close(); srv.close();
})();
