const { chromium } = require('playwright');
const http=require('http'),fs=require('fs'),path=require('path');const root=require('path').resolve(__dirname,'..');
const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png'};
const srv=http.createServer((q,s)=>{let p=q.url.split('?')[0];if(p==='/')p='/index.html';const f=path.join(root,p);fs.readFile(f,(e,d)=>{if(e){s.writeHead(404);s.end();return}s.writeHead(200,{'content-type':types[path.extname(f)]||'text/plain'});s.end(d)})});
const T=require('./tlib.js');
const shots=require('os').tmpdir()+'/vaultet-test-shots/'; require('fs').mkdirSync(shots,{recursive:true});
(async()=>{await new Promise(r=>srv.listen(8142,r));
const b=await chromium.launch({...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{}),args:['--no-sandbox']});
const ctx=await b.newContext({viewport:{width:380,height:820},deviceScaleFactor:2,serviceWorkers:'block'});
const pg=await ctx.newPage(); const native=T.watchNative(pg);
const errs=[];pg.on('pageerror',e=>errs.push(e.message));pg.on('console',m=>{if(m.type()==='error'&&!/ERR_FAILED/.test(m.text()))errs.push(m.text())});
await pg.route(/accounts\.google\.com|fonts\./,r=>r.abort());
await pg.addInitScript(()=>{if(localStorage.getItem('__s'))return;localStorage.setItem('__s','1');const now=new Date().toISOString();const d=new Date().toISOString().slice(0,10);
 localStorage.setItem('finance_tracker_accounts_v1',JSON.stringify([{id:'a1',name:'กสิกร',initialBalance:20000},{id:'a2',name:'เงินสด',initialBalance:500}]));
 localStorage.setItem('finance_tracker_entries_v1',JSON.stringify([{id:'e1',type:'expense',category:'กิน',amount:60,note:'ข้าว',date:d,accountId:'a1'},{id:'e2',type:'expense',category:'คาเฟ่',amount:45,note:'',date:d,accountId:'a1'}]));
 localStorage.setItem('finance_tracker_reserved_v1',JSON.stringify([{id:'r1',name:'ค่าหอ',amount:3000,dueDate:'',createdAt:now}]));
 localStorage.setItem('finance_tracker_ai_memory_v1',JSON.stringify([{id:'m1',text:'ชอบออมเดือนละ 3,000',createdAt:now}]));});
await pg.goto('http://localhost:8142/index.html');await pg.waitForTimeout(1200);
const ok=(n,c)=>console.log((c?'PASS ':'FAIL ')+n);
const get=k=>pg.evaluate(k=>JSON.parse(localStorage.getItem(k)||'null'),k);
const closeAll=()=>pg.evaluate(()=>document.querySelectorAll('.overlay.open,.open').forEach(e=>e.classList.remove('open')));

// ===== recurring: add / edit / pause / skip(cancel) / delete =====
await pg.evaluate(()=>{renderRecurringManageList();document.getElementById('recurringOverlay').classList.add('open')}); await pg.waitForTimeout(300);
await pg.click('#addRecurringBtn');
ok('recurring add form has category, account, frequency, link and note fields', await pg.evaluate(()=>['name','amt','cat','acc','freq','next','link','note'].every(k=>document.querySelector('.v-dlg [name="'+k+'"]'))));
await pg.screenshot({path:shots+'dlg-recurring.png'});
await T.dlgOK(pg,{name:'Netflix',amt:'199',cat:'กิน',acc:'a2',freq:'monthly',next:'2026-11-01',link:'r1',note:'ดูหนัง'}); await pg.waitForTimeout(300);
let rc=await get('finance_tracker_recurring_v1'); ok('recurring saved with all fields', rc.length===1&&rc[0].name==='Netflix'&&rc[0].amount===199&&rc[0].category==='กิน'&&rc[0].accountId==='a2'&&rc[0].frequency==='monthly'&&rc[0].nextDueDate==='2026-11-01'&&rc[0].reservedItemId==='r1'&&rc[0].note==='ดูหนัง'&&rc[0].status==='active');
ok('recurring row uses svg icons', (await pg.locator('#recurringManageList .edit-recurring-btn svg').count())===1 && (await pg.locator('#recurringManageList .delete-recurring-btn svg').count())===1);
await pg.click('.edit-recurring-btn'); await T.dlgOK(pg,{amt:'219',freq:'yearly',end:'2027-12-31'}); await pg.waitForTimeout(300);
rc=await get('finance_tracker_recurring_v1'); ok('recurring edit saved', rc[0].amount===219&&rc[0].frequency==='yearly'&&rc[0].endDate==='2027-12-31'&&rc[0].name==='Netflix');
await pg.click('.pause-recurring-btn'); await pg.waitForTimeout(200); rc=await get('finance_tracker_recurring_v1'); ok('pause works', rc[0].status==='paused');
await pg.click('.resume-recurring-btn'); await pg.waitForTimeout(200); rc=await get('finance_tracker_recurring_v1'); ok('resume works', rc[0].status==='active');
await pg.click('.cancel-recurring-btn'); await T.dlgOK(pg); await pg.waitForTimeout(250); rc=await get('finance_tracker_recurring_v1'); ok('cancel (confirm) works', rc[0].status==='cancelled');
await pg.click('.delete-recurring-btn'); await T.dlgOK(pg); await pg.waitForTimeout(250); rc=await get('finance_tracker_recurring_v1'); ok('delete (confirm) works', rc.length===0);
await closeAll();

// ===== loans: add / edit amount / repay / edit repayment =====
await pg.evaluate(()=>{renderLoansManageList();document.getElementById('loansOverlay').classList.add('open')}); await pg.waitForTimeout(300);
await pg.click('#addLoanBtn'); await T.dlgOK(pg,{person:'น้อง B',amt:'1000',acc:'a2',due:'2026-12-01'}); await pg.waitForTimeout(300);
let ln=await get('finance_tracker_loans_v1'); ok('loan added with account and due date', ln.length===1&&ln[0].person==='น้อง B'&&ln[0].amount===1000&&ln[0].accountId==='a2'&&ln[0].dueDate==='2026-12-01');
await pg.click('.edit-loan-btn'); await T.dlgOK(pg,{next:'800'}); await pg.waitForTimeout(300);
ln=await get('finance_tracker_loans_v1'); ok('loan outstanding edit works (outstanding now 800)', await pg.evaluate(()=>loanOutstanding(loans[0]))===800);
await pg.click('.repay-loan-btn'); await T.dlgOK(pg,{amt:'300',acc:'a1'}); await pg.waitForTimeout(300);
ln=await get('finance_tracker_loans_v1'); ok('repayment recorded to chosen account', ln[0].repayments.length===1&&ln[0].repayments[0].amount===300&&ln[0].repayments[0].accountId==='a1');
await pg.click('.v-loan-hist summary'); await pg.waitForTimeout(150); await pg.click('.edit-repayment-btn'); await T.dlgOK(pg,{amount:'250',date:'2026-10-10',note:'แก้แล้ว'}); await pg.waitForTimeout(300);
ln=await get('finance_tracker_loans_v1'); ok('repayment edit works', ln[0].repayments[0].amount===250&&ln[0].repayments[0].date==='2026-10-10'&&ln[0].repayments[0].note==='แก้แล้ว');
await pg.click('.v-loan-hist summary'); await pg.waitForTimeout(150); await pg.click('.edit-repayment-btn'); await pg.waitForSelector('.v-dlg'); await pg.fill('.v-dlg [name="amount"]','99999'); await pg.click('.v-dlg-ok');
ok('repayment amount above the allowed max is rejected inside the dialog', (await T.errShown(pg)) && (await pg.locator('.v-dlg').count())===1);
await T.dlgCancel(pg); await closeAll();

// ===== merge categories =====
await pg.evaluate(()=>openForm(null)); await pg.waitForTimeout(250); await pg.click('#vManageBtn'); await pg.click('#mergeCatBtn');
await pg.waitForSelector('.v-dlg'); await pg.selectOption('.v-dlg [name="src"]','คาเฟ่'); await pg.selectOption('.v-dlg [name="dst"]','คาเฟ่'); await pg.click('.v-dlg-ok');
ok('merge: same source and target is rejected', (await T.errShown(pg)) && (await pg.locator('.v-dlg').count())===1);
await pg.selectOption('.v-dlg [name="dst"]','กิน'); await pg.click('.v-dlg-ok'); await pg.waitForSelector('.v-dlg-danger'); ok('merge asks for confirmation with a danger button', (await T.dlgText(pg)).includes('รวม'));
await T.dlgOK(pg); await pg.waitForTimeout(300);
const es=await get('finance_tracker_entries_v1'); ok('merge moved the expense entries to the target category', es.filter(e=>e.type==='expense').every(e=>e.category==='กิน') && es.filter(e=>e.type==='expense').length===2);
await closeAll();

// ===== template save + delete =====
await pg.evaluate(()=>openForm(null)); await pg.waitForTimeout(250); await pg.fill('#amount','85'); await pg.click('.v-chip[data-cat="กิน"]'); await pg.click('#vManageBtn'); await pg.click('#tplSave');
await T.dlgOK(pg,{v:'ข้าวเย็น'}); await pg.waitForTimeout(250);
let tp=await get('vaultet_templates_v1'); ok('template saved with the typed name', tp.length===1&&tp[0].name==='ข้าวเย็น'&&tp[0].amount===85);
await pg.click('.v-chip-x[data-del="0"]'); await T.dlgOK(pg); await pg.waitForTimeout(250); tp=await get('vaultet_templates_v1'); ok('template delete (confirm) works', tp.length===0);
// ===== quick amount add =====
await pg.click('#qaAdd'); await T.dlgOK(pg,{v:'40'}); await pg.waitForTimeout(250);
const qa=await get('vaultet_quick_amounts_v1'); ok('quick amount +40 added', qa.includes(40));
await closeAll();

// ===== goals (plan tab) =====
await pg.evaluate(()=>vaultetGo('plan')); await pg.waitForTimeout(400);
await pg.click('#goalAdd'); await T.dlgOK(pg,{name:'โน้ตบุ๊ก',target:'30000',saved:'5000',dl:'2027-03-01'}); await pg.waitForTimeout(300);
let gl=await get('vaultet_goals_v1'); ok('goal added', gl.length===1&&gl[0].name==='โน้ตบุ๊ก'&&gl[0].target===30000&&gl[0].saved===5000&&gl[0].deadline==='2027-03-01');
const gs=()=>pg.evaluate(()=>goalSaved(readGoals()[0]));
await pg.click('[data-gadd]'); await T.dlgOK(pg,{v:'2500',acc:'a2'}); await pg.waitForTimeout(250); gl=await get('vaultet_goals_v1'); ok('add money to goal (+2500)', (await gs())===7500 && gl[0].saved===5000);
ok('goal money is a saving entry from the chosen account', await pg.evaluate(id=>entries.some(e=>e.goalId===id&&e.type==='saving'&&e.amount===2500&&e.accountId==='a2'),gl[0].id));
await pg.click('[data-gadd]'); await T.dlgOK(pg,{v:'-1000'}); await pg.waitForTimeout(250); ok('negative amount takes money out (-1000)', (await gs())===6500);
await pg.click('[data-gdel]'); await T.dlgOK(pg); await pg.waitForTimeout(250); gl=await get('vaultet_goals_v1'); ok('goal delete (confirm) works', gl.length===0);

// ===== AI memory edit =====
await pg.evaluate(()=>vaultetGo('chat')); await pg.waitForTimeout(300); await pg.click('#uxChatMenuBtn'); await pg.waitForTimeout(200); await pg.click('#aiMenu .v-aimenu-row >> nth=1'); await pg.waitForTimeout(650);
await pg.click('.edit-ai-memory-btn'); await T.dlgOK(pg,{text:'ชอบออมเดือนละ 4,000'}); await pg.waitForTimeout(250);
const mem=await get('finance_tracker_ai_memory_v1'); ok('AI memory edit saved', mem[0].text==='ชอบออมเดือนละ 4,000');
await closeAll(); await pg.waitForTimeout(600); await pg.keyboard.press('Escape'); await pg.waitForTimeout(400);

// ===== lock (PIN) =====
await pg.evaluate(()=>vaultetGo('more')); await pg.waitForTimeout(300);
await pg.click('#vSetLock'); await pg.waitForSelector('.v-dlg');
ok('PIN fields are masked (password type)', await pg.evaluate(()=>[...document.querySelectorAll('.v-dlg input')].every(i=>i.type==='password')));
await pg.fill('.v-dlg [name="p"]','12ab56'); await pg.fill('.v-dlg [name="p2"]','123456'); await pg.click('.v-dlg-ok');
ok('non-digit PIN rejected', await T.errShown(pg));
await pg.fill('.v-dlg [name="p"]','123456'); await pg.fill('.v-dlg [name="p2"]','654321'); await pg.click('.v-dlg-ok');
ok('mismatching PIN confirmation rejected', (await pg.textContent('.v-dlg')).includes('รหัสไม่ตรงกัน'));
await pg.fill('.v-dlg [name="p2"]','123456'); await pg.click('.v-dlg-ok');
await pg.waitForSelector('.v-dlg [name="q"]'); await T.dlgOK(pg,{q:'สัตว์เลี้ยงตัวแรก',a:'มะลิ'});
await T.dlgOK(pg); // "เปิดล็อกแอปแล้ว"
await pg.waitForTimeout(200);
let lk=await get('vlock_v1'); ok('lock enabled and PIN stored hashed (not plain)', lk&&lk.on===true&&lk.pin&&lk.pin!=='123456'&&!JSON.stringify(lk).includes('123456')&&lk.q==='สัตว์เลี้ยงตัวแรก');
// menu: turn off (needs current PIN)
await pg.click('#vSetLock'); await T.dlgChoose(pg,'ปิดล็อก');
await pg.waitForSelector('.v-dlg [name="o"]'); await pg.fill('.v-dlg [name="o"]','000000'); await pg.click('.v-dlg-ok');
ok('wrong current PIN is refused', (await T.dlgText(pg)).includes('รหัสไม่ถูกต้อง')); await T.dlgOK(pg);
await pg.click('#vSetLock'); await T.dlgChoose(pg,'ปิดล็อก'); await T.dlgOK(pg,{o:'123456'}); await T.dlgOK(pg); await pg.waitForTimeout(200);
lk=await get('vlock_v1'); ok('correct PIN turns the lock off', lk.on===false);
// forgot flow via the lock screen
await pg.click('#vSetLock'); await T.dlgChoose(pg,'เปิดล็อก'); await T.dlgOK(pg,{o:'123456'}); await T.dlgOK(pg); await pg.waitForTimeout(200);
await pg.evaluate(()=>{document.dispatchEvent(new Event('visibilitychange'))});
await pg.evaluate(()=>{const ov=[...document.body.children].find(e=>e.querySelector&&e.querySelector('#lockForgot'));ov.style.display='flex'});
await pg.click('#lockForgot'); await T.dlgOK(pg,{a:'ผิด'}); await pg.waitForSelector('.v-dlg'); ok('wrong recovery answer refused', (await T.dlgText(pg)).includes('คำตอบไม่ถูกต้อง')); await T.dlgOK(pg);
await pg.click('#lockForgot'); await T.dlgOK(pg,{a:'มะลิ'}); await pg.waitForSelector('.v-dlg [name="p"]'); await pg.fill('.v-dlg [name="p"]','111111'); await pg.fill('.v-dlg [name="p2"]','111111'); await pg.click('.v-dlg-ok'); await pg.waitForTimeout(300);
lk=await get('vlock_v1'); ok('recovery answer lets you set a new PIN', lk.on===true && lk.pin!==undefined);
ok('lock screen closed after recovery', !(await pg.evaluate(()=>{const ov=[...document.body.children].find(e=>e.querySelector&&e.querySelector('#lockForgot'));return getComputedStyle(ov).display!=='none'})));
ok('no native browser dialogs ('+native.msgs.join(' | ')+')', native.n===0);
console.log(errs.join('\n')||'no js errors');
await b.close();srv.close()})();
