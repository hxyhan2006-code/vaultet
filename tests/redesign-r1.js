// โฉมใหม่ รอบ 1 (ds47): แถบบน (โปรไฟล์/ทักทาย/ปุ่มเดือน), แถบล่างชื่อใหม่, หน้าหลัก (งบพับได้ + รายการล่าสุด),
// หน้ารายการทั้งหมด (ชิปกรอง ช่องค้นหา ย้อนกลับ), แผ่นเลือกเดือนจากล่าง, ทางลัดย้ายไปแท็บเงินของฉัน
const { chromium } = require('playwright');
const http=require('http'),fs=require('fs'),path=require('path');const root=require('path').resolve(__dirname,'..');
const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png'};
const srv=http.createServer((q,s)=>{let p=q.url.split('?')[0];if(p==='/')p='/index.html';const f=path.join(root,p);fs.readFile(f,(e,d)=>{if(e){s.writeHead(404);s.end();return}s.writeHead(200,{'content-type':types[path.extname(f)]||'text/plain'});s.end(d)})});
const shots=require('os').tmpdir()+'/vaultet-test-shots/'; require('fs').mkdirSync(shots,{recursive:true});
(async()=>{await new Promise(r=>srv.listen(8201,r));
const b=await chromium.launch({...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{}),args:['--no-sandbox']});
const pg=await (await b.newContext({viewport:{width:380,height:820},deviceScaleFactor:2,serviceWorkers:'block'})).newPage();
const errs=[];pg.on('pageerror',e=>errs.push(e.message));pg.on('console',m=>{if(m.type()==='error'&&!/ERR_FAILED/.test(m.text()))errs.push(m.text())});
const T=require('./tlib.js');const native=T.watchNative(pg);
await pg.route(/accounts\.google\.com|fonts\./,r=>r.abort());
await pg.addInitScript(()=>{if(localStorage.getItem('__s'))return;localStorage.setItem('__s','1');
 const now=new Date(), d=n=>{const x=new Date(now);x.setDate(x.getDate()-n);return x.toISOString().slice(0,10)};
 const mk=now.toISOString().slice(0,7);
 const prev=new Date(now.getFullYear(),now.getMonth()-1,15,12).toISOString().slice(0,10);
 localStorage.setItem('vaultet_user_profile_v1',JSON.stringify({nickname:'ฮัน'}));
 localStorage.setItem('finance_tracker_accounts_v1',JSON.stringify([{id:'a1',name:'กสิกร',openingBalance:20000},{id:'a2',name:'เงินสด',openingBalance:500}]));
 const E=(i,t,c,a,n,dd,ac)=>({id:'e'+i,type:t,category:c,amount:a,note:n,date:typeof dd==='string'?dd:d(dd),accountId:ac||'a1'});
 localStorage.setItem('finance_tracker_entries_v1',JSON.stringify([
  E(1,'income','กยศ.',6000,'',0),E(2,'expense','กิน',60,'ข้าวมันไก่',0,'a2'),E(3,'expense','คาเฟ่',145,'กาแฟ',0),E(4,'saving','เงินออม',1000,'',0),
  E(5,'expense','ค่าเดินทาง',80,'',0,'a2'),E(6,'expense','กิน',220,'ชาบู',0),E(7,'expense','ช้อปปิ้ง',590,'เสื้อ',0),E(8,'expense','กิน',99,'เดือนก่อน',prev)]));
 localStorage.setItem('finance_tracker_budgets_v1',JSON.stringify([{id:'b1',kind:'expense',categories:['กิน'],name:'กิน',amount:3500,period:'monthly',month:mk,enabled:true,createdAt:now.toISOString(),updatedAt:now.toISOString()}]));
});
await pg.goto('http://localhost:8201/index.html');await pg.waitForTimeout(1200);
const ok=(n,c)=>console.log((c?'PASS ':'FAIL ')+n);
const vis=s=>pg.isVisible(s);
const tab=p=>pg.click('.ux-bottom-item[data-page="'+p+'"]');

// ---- แถบบน + แถบล่าง ----
ok('bottom tabs renamed: รายงาน / เงินของฉัน', (await pg.textContent('.ux-bottom-item[data-page="analysis"]')).trim()==='รายงาน' && (await pg.textContent('.ux-bottom-item[data-page="plan"]')).trim()==='เงินของฉัน');
ok('home top bar: avatar letter + greeting with nickname', await vis('#uxAvatarBtn') && (await pg.textContent('#uxAvatarBtn')).trim()==='ฮ' && (await pg.textContent('#uxGreeting')).trim()==='สวัสดี ฮัน');
ok('home top bar: month button shows current month, page name hidden', await vis('#uxMonthBtn') && (await pg.textContent('#uxMonthLabel')).trim().length>3 && !(await vis('#uxPageName')));
ok('no native month select left in the top bar', (await pg.locator('.ux-topbar select').count())===0);
await pg.screenshot({path:shots+'r1-home.png'});

// ---- หน้าหลัก ----
ok('shortcuts and assets are not on home any more', !(await vis('#vShortcuts')) && !(await vis('#vAssets')) && (await pg.locator('#ux-home #vShortcuts').count())===0);
ok('budget card is on home', await vis('#ux-home #budgetDashboardCard'));
ok('budget rows start folded, and there is no "ดูรายหมวด" button', !(await vis('#budgetDashboardRows')) && (await pg.locator('#vBudgetMoreBtn').count())===0);
await pg.click('#budgetDashboardCard .v-card-title'); await pg.waitForTimeout(80);
ok('while unfolding, rows are clipped (nothing spills over the next card)', await pg.evaluate(()=>getComputedStyle(document.getElementById('budgetDashboardRows')).overflow==='hidden'));
await pg.waitForTimeout(400);
ok('tapping the card unfolds the rows (smooth, ends fully open)', await vis('#budgetDashboardRows') && (await pg.getAttribute('#budgetDashboardCard','aria-expanded'))==='true' && (await pg.evaluate(()=>document.getElementById('budgetDashboardRows').style.height))==='');
await pg.reload(); await pg.waitForTimeout(900);
ok('budget fold state is remembered', await vis('#budgetDashboardRows'));
await pg.locator('#budgetDashboardRows .v-brow').first().click(); await pg.waitForTimeout(450);
ok('tapping a category row does not fold the card', await vis('#budgetDashboardRows'));
await pg.click('#budgetDashboardManageBtn'); await pg.waitForTimeout(300);
ok('"จัดการ" opens the manager and does not fold the card', await vis('#budgetOverlay') && await vis('#budgetDashboardRows'));
await pg.click('#closeBudgetBtn'); await pg.waitForTimeout(200);
await pg.click('#budgetDashboardCard .v-card-title'); await pg.waitForTimeout(450);
ok('tapping the empty part of the card folds it again', !(await vis('#budgetDashboardRows')) && (await pg.getAttribute('#budgetDashboardCard','aria-expanded'))==='false');
ok('upcoming total is small (20px), not competing with the main balance', await pg.evaluate(()=>parseFloat(getComputedStyle(document.getElementById('upcomingTotalNum')).fontSize)<=20));
ok('upcoming card has no "ดูทั้งหมด" button; tapping it opens the sheet', await (async()=>{
  const none=(await pg.locator('#viewUpcomingBtn').count())===0;
  await pg.evaluate(()=>{document.getElementById('upcomingCard').style.display='block';});
  await pg.click('#upcomingCard .networth-label'); await pg.waitForTimeout(300);
  const open=await pg.evaluate(()=>document.getElementById('upcomingOverlay').classList.contains('open'));
  await pg.click('#closeUpcomingBtn'); await pg.waitForTimeout(60);
  const closing=await pg.evaluate(()=>{const o=document.getElementById('upcomingOverlay');const op=parseFloat(getComputedStyle(o).opacity);return !o.classList.contains('open')&&op>0&&op<1;});
  await pg.waitForTimeout(450);
  const closed=await pg.evaluate(()=>{const o=document.getElementById('upcomingOverlay');return !o.classList.contains('open')&&getComputedStyle(o).visibility==='hidden';});
  const open2=open&&closing&&closed;
  return none&&open2; })());
ok('recent list shows at most 5 rows of this month', (await pg.locator('#vRecentList .v-tx').count())===5);
ok('"ดูทั้งหมด" link visible', await vis('#vSeeAllBtn'));
await pg.click('#vRecentList .v-tx >> nth=0'); await pg.waitForTimeout(300);
ok('tapping a recent row opens the edit form', await pg.evaluate(()=>document.getElementById('overlay').classList.contains('open')) && await vis('#vDeleteEntryBtn'));
await pg.evaluate(()=>closeForm()); await pg.waitForTimeout(200);

// ---- หน้ารายการทั้งหมด ----
await pg.click('#vSeeAllBtn'); await pg.waitForTimeout(400);
ok('see-all opens the list page with back button and title', await vis('#ux-list') && !(await vis('#ux-home')) && await vis('#uxBackBtn') && (await pg.textContent('#uxPageName')).trim()==='รายการทั้งหมด');
ok('list page shows month chip, home tab stays highlighted', await vis('#uxMonthChip') && await pg.evaluate(()=>document.querySelector('.ux-bottom-item[data-page="home"]').classList.contains('active')));
ok('all 7 rows of this month listed', (await pg.locator('#listContainer .v-tx').count())===7);
ok('5 filter chips, "ทั้งหมด" selected, native select hidden', (await pg.locator('#vTypeChips .v-fchip').count())===5 && await pg.evaluate(()=>document.querySelector('.v-fchip[data-f="all"]').classList.contains('is-on')) && !(await vis('#typeFilter')));
await pg.click('.v-fchip[data-f="expense"]'); await pg.waitForTimeout(250);
ok('chip "รายจ่าย" filters to 5 expense rows', (await pg.locator('#listContainer .v-tx').count())===5 && (await pg.textContent('#countLabel')).includes('5') && await pg.evaluate(()=>document.querySelector('.v-fchip[data-f="expense"]').getAttribute('aria-pressed')==='true'));
await pg.click('.v-fchip[data-f="saving"]'); await pg.waitForTimeout(250);
ok('chip "ออม/ลงทุน" filters to 1 row', (await pg.locator('#listContainer .v-tx').count())===1);
await pg.click('.v-fchip[data-f="all"]'); await pg.waitForTimeout(250);
await pg.fill('#searchInput','กาแฟ'); await pg.waitForTimeout(300);
ok('search box (with icon) still filters', (await pg.locator('#listContainer .v-tx').count())===1 && (await pg.locator('.v-search > svg').count())===1);
await pg.fill('#searchInput',''); await pg.waitForTimeout(200);
await pg.screenshot({path:shots+'r1-list.png'});

// ---- แผ่นเลือกเดือน ----
await pg.click('#uxMonthChip'); await pg.waitForTimeout(300);
ok('month chip opens a bottom sheet (not a native select)', await vis('.v-dlg-sheet') && (await pg.locator('.v-dlg-sheet .v-pick-row').count())>=2 && native.n===0);
ok('current month is marked in the sheet', (await pg.locator('.v-dlg-sheet .v-pick-row.is-on').count())===1);
await pg.screenshot({path:shots+'r1-month-sheet.png'});
await pg.click('.v-dlg-sheet .v-pick-row >> nth=1'); await pg.waitForTimeout(400);
ok('picking last month switches the list (1 row) and the chip label', (await pg.locator('#listContainer .v-tx').count())===1 && (await pg.textContent('#uxMonthChipLabel'))===(await pg.evaluate(()=>document.getElementById('monthSelect').selectedOptions[0].textContent)));
await pg.click('#uxMonthChip'); await pg.waitForTimeout(300); await pg.keyboard.press('Escape'); await pg.waitForTimeout(250);
ok('Escape closes the sheet without changing month', !(await vis('.v-dlg-sheet')) && (await pg.locator('#listContainer .v-tx').count())===1);
await pg.click('#uxMonthChip'); await pg.waitForTimeout(300); await pg.click('.v-dlg-sheet .v-pick-row >> nth=0'); await pg.waitForTimeout(300);
await pg.click('#uxBackBtn'); await pg.waitForTimeout(400);
ok('back returns to home', await vis('#ux-home') && !(await vis('#ux-list')) && !(await vis('#uxBackBtn')));
ok('home month label follows the same month', (await pg.textContent('#uxMonthLabel'))===(await pg.textContent('#uxMonthChipLabel')));

// ---- เงินของฉัน ----
await tab('plan'); await pg.waitForTimeout(300);
ok('เงินของฉัน: assets + money rows + emergency card here', await vis('#ux-plan #vAssets') && await vis('#ux-plan #vMoneyAccounts') && await vis('#emergencyDashboardCard'));
ok('avatar only on home', !(await vis('#uxAvatarBtn')) && (await pg.textContent('#uxPageName')).trim()==='เงินของฉัน');
await pg.screenshot({path:shots+'r1-money.png'});

// ---- โปรไฟล์ → ตั้งค่า ----
await tab('home'); await pg.waitForTimeout(300);
await pg.click('#uxAvatarBtn'); await pg.waitForTimeout(400);
ok('avatar opens settings page', await vis('#ux-more') && await vis('#uxBackBtn'));
await pg.click('#uxBackBtn'); await pg.waitForTimeout(400);
ok('back from settings returns home', await vis('#ux-home'));

// ---- ไม่มีบ้านว่าง: เดือนที่ไม่มีรายการ ----
await pg.evaluate(()=>{ const m=document.getElementById('monthSelect'); const o=[...m.options].pop(); m.value=o.value; m.dispatchEvent(new Event('change',{bubbles:true})); });
await pg.waitForTimeout(300);
const empty=await vis('#vRecentList .v-empty');
ok('empty month shows icon + message + add button', empty && await vis('#vRecentAddBtn') && !(await vis('#vSeeAllBtn')));
if(empty){ await pg.click('#vRecentAddBtn'); await pg.waitForTimeout(300); ok('empty-state button opens the add form', await pg.evaluate(()=>document.getElementById('overlay').classList.contains('open'))); await pg.evaluate(()=>closeForm()); }

ok('no check marks in visible text', !/[✓✔]/.test(await pg.evaluate(()=>document.body.innerText)));
ok('no native dialogs', native.n===0);
ok('no js errors', errs.length===0); if(errs.length) console.log('- '+errs.join(' | ').slice(0,300));
await b.close(); srv.close();
})();
