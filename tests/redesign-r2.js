// โฉมใหม่ รอบ 2 (ds50): หน้าเพิ่ม/แก้รายการ — แป้นตัวเลขของแอป, แท็บประเภทแบบสไลด์, ไอคอนหมวด,
// ปุ่มเลือกบัญชี/วันที่ (แผ่นจากล่าง + ปฏิทินไทย), ปุ่มบันทึกบอกยอด, แจ้ง "บันทึกแล้ว" พร้อมปุ่มย้อน
const { chromium } = require('playwright');
const http=require('http'),fs=require('fs'),path=require('path');const root=require('path').resolve(__dirname,'..');
const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png'};
const srv=http.createServer((q,s)=>{let p=q.url.split('?')[0];if(p==='/')p='/index.html';const f=path.join(root,p);fs.readFile(f,(e,d)=>{if(e){s.writeHead(404);s.end();return}s.writeHead(200,{'content-type':types[path.extname(f)]||'text/plain'});s.end(d)})});
const shots=require('os').tmpdir()+'/vaultet-test-shots/'; require('fs').mkdirSync(shots,{recursive:true});
(async()=>{await new Promise(r=>srv.listen(8202,r));
const b=await chromium.launch({...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{}),args:['--no-sandbox']});
const ok=(n,c)=>console.log((c?'PASS ':'FAIL ')+n);
const seed=()=>{if(localStorage.getItem('__s'))return;localStorage.setItem('__s','1');
 localStorage.setItem('finance_tracker_accounts_v1',JSON.stringify([{id:'a1',name:'กสิกร',openingBalance:2000},{id:'a2',name:'เงินสด',openingBalance:500}]));
 localStorage.setItem('finance_tracker_entries_v1','[]');};
const pg=await (await b.newContext({viewport:{width:380,height:820},deviceScaleFactor:2,serviceWorkers:'block'})).newPage();
const errs=[];pg.on('pageerror',e=>errs.push(e.message));pg.on('console',m=>{if(m.type()==='error'&&!/ERR_FAILED/.test(m.text()))errs.push(m.text())});
const T=require('./tlib.js');const native=T.watchNative(pg);
await pg.route(/accounts\.google\.com|fonts\./,r=>r.abort());
await pg.addInitScript(seed);
await pg.goto('http://localhost:8202/index.html');await pg.waitForTimeout(1200);
const vis=s=>pg.isVisible(s);
const key=k=>pg.click('.v-key[data-k="'+k+'"]');
const amt=()=>pg.inputValue('#amount');
const entries=()=>pg.evaluate(()=>JSON.parse(localStorage.getItem('finance_tracker_entries_v1')||'[]'));
const iso=n=>pg.evaluate(n=>{const d=new Date();d.setDate(d.getDate()+n);return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')},n);

await pg.click('#uxAddBtn'); await pg.waitForTimeout(350);
ok('keypad with 12 keys shows in the add sheet', await vis('#vKeypad') && (await pg.locator('#vKeypad .v-key').count())===12);
ok('save button says "ใส่จำนวนเงิน" and is disabled when empty', (await pg.textContent('#submitBtn')).trim()==='ใส่จำนวนเงิน' && await pg.isDisabled('#submitBtn'));
for(const k of ['1','2','5','.','5','0','9']) await key(k);
ok('keys type an amount (max 2 decimals): 125.50', (await amt())==='125.50');
await key('del'); await key('del'); await key('del');
ok('backspace deletes one char at a time', (await amt())==='125');
await key('.'); await key('.'); await key('del');
ok('a second dot is ignored', (await amt())==='125');
ok('save button shows the amount', (await pg.textContent('#submitBtn')).trim()==='บันทึก ฿125' && !(await pg.isDisabled('#submitBtn')));
await pg.fill('#amount','12a3'); await pg.waitForTimeout(100);
ok('typed letters are stripped (desktop keyboard)', (await amt())==='123');
await pg.fill('#amount',''); await key('0'); await key('0'); await key('7');
ok('leading zeros are dropped', (await amt())==='7');
await pg.fill('#amount',''); await key('.'); await key('5');
ok('dot first becomes 0.5', (await amt())==='0.5');
await pg.fill('#amount','');

// ประเภท: แถบสีเลื่อนตาม
const indX=()=>pg.evaluate(()=>{const i=document.querySelector('.v-seg-ind');return Math.round(new DOMMatrix(getComputedStyle(i).transform).m41)});
const x0=await indX();
await pg.click('.type-btn[data-type="saving"]'); await pg.waitForTimeout(400);
const x1=await indX();
ok('type indicator slides to the chosen type ('+x0+' → '+x1+')', x1>x0+40 && await pg.evaluate(()=>document.querySelector('.type-btn[data-type="saving"]').getAttribute('aria-pressed')==='true'));
await pg.click('.type-btn[data-type="expense"]'); await pg.waitForTimeout(300);

// ไอคอนหมวด
ok('every category chip has an icon', await pg.evaluate(()=>{const c=[...document.querySelectorAll('#catGrid .cat-chip-label')];return c.length>0&&c.every(b=>b.querySelector('.v-cat-ic svg'))}));

// บัญชี: แผ่นเลือกจากล่าง
ok('native account select and date input are hidden, buttons shown', !(await vis('#entryAccount')) && !(await vis('#date')) && await vis('#vAccBtn') && await vis('#vDateBtn'));
ok('date button says วันนี้', (await pg.textContent('#vDateBtn .v-fbtn-t')).trim()==='วันนี้');
await pg.click('#vAccBtn'); await pg.waitForTimeout(250);
ok('account sheet lists both accounts with balances', (await pg.locator('.v-dlg-sheet .v-pick-row').count())===2 && (await pg.textContent('.v-dlg-sheet')).includes('คงเหลือ'));
await pg.click('.v-dlg-sheet .v-pick-row[data-value="a2"]'); await pg.waitForTimeout(200);
ok('picking an account updates the button and the real select', (await pg.textContent('#vAccBtn .v-fbtn-t')).trim()==='เงินสด' && (await pg.evaluate(()=>document.getElementById('entryAccount').value))==='a2');
await pg.click('.type-btn[data-type="income"]'); await pg.waitForTimeout(200); await pg.click('.type-btn[data-type="expense"]'); await pg.waitForTimeout(200);
ok('switching type keeps the chosen account', (await pg.evaluate(()=>document.getElementById('entryAccount').value))==='a2');

// วันที่: ปฏิทินไทย
await pg.click('#vDateBtn'); await pg.waitForTimeout(250);
ok('date sheet: quick chips + Thai month title + day grid', await vis('.v-date-quick') && /25\d\d/.test(await pg.textContent('.v-date-title')) && (await pg.locator('.v-date-day').count())>=28);
ok('today is marked', (await pg.locator('.v-date-day.is-on').count())===1);
await pg.screenshot({path:shots+'r2-date.png'});
await pg.click('.v-date-quick .v-fchip >> nth=1'); await pg.waitForTimeout(200);
ok('"เมื่อวาน" sets yesterday', (await pg.inputValue('#date'))===(await iso(-1)) && (await pg.textContent('#vDateBtn .v-fbtn-t')).trim()==='เมื่อวาน');
await pg.click('#vDateBtn'); await pg.waitForTimeout(250);
await pg.click('.v-date-nav >> nth=0'); await pg.waitForTimeout(150);
await pg.click('.v-date-day >> text="15"'); await pg.waitForTimeout(200);
const d15=await pg.inputValue('#date');
ok('previous month + day 15 picks the 15th of last month ('+d15+')', /-15$/.test(d15) && d15<(await iso(0)));
await pg.click('#vDateBtn'); await pg.waitForTimeout(250); await pg.keyboard.press('Escape'); await pg.waitForTimeout(200);
ok('Escape closes the date sheet without change', !(await vis('.v-date-sheet')) && (await pg.inputValue('#date'))===d15);

// โน้ต: คีย์บอร์ดมือถือขึ้นแทน → ซ่อนแป้น
await pg.click('#note'); await pg.waitForTimeout(150);
ok('typing a note hides the keypad', !(await vis('#vKeypad')));
await pg.fill('#note','ข้าวเที่ยง'); await pg.click('#vDateBtn'); await pg.keyboard.press('Escape'); await pg.waitForTimeout(200);
ok('keypad returns after leaving the note', await vis('#vKeypad'));
await pg.screenshot({path:shots+'r2-form.png'});

// บันทึก → แจ้งผล + ย้อน
for(const k of ['6','0']) await key(k);
await pg.click('.v-chip[data-cat="กิน"]'); await pg.waitForTimeout(100);
await pg.click('#submitBtn'); await pg.waitForTimeout(400);
let es=await entries();
ok('entry saved with keypad amount, picked account and date', es.length===1 && es[0].amount===60 && es[0].accountId==='a2' && es[0].date===d15 && es[0].note==='ข้าวเที่ยง');
ok('snack "บันทึกแล้ว" with ย้อน appears', await vis('#vSnack.is-on') && (await pg.textContent('#vSnack .v-snack-msg')).includes('บันทึกแล้ว · กิน ฿60'));
await pg.screenshot({path:shots+'r2-snack.png'});
await pg.click('#vSnack .v-snack-act'); await pg.waitForTimeout(300);
ok('ย้อน removes the entry just added', (await entries()).length===0);

// แก้ไขรายการเดิม: ไม่มีแจ้งย้อน, ปุ่มบอกค่าเดิม
await pg.evaluate(()=>{ entries.unshift({id:'x1',type:'expense',category:'คาเฟ่',amount:45,note:'',date:new Date().toISOString().slice(0,10),accountId:'a1'}); saveEntries(); render(); });
await pg.waitForTimeout(300); await pg.evaluate(()=>openForm(entries.find(e=>e.id==='x1'))); await pg.waitForTimeout(300);
ok('edit form shows its amount, account and date on the buttons', (await amt())==='45' && (await pg.textContent('#vAccBtn .v-fbtn-t')).trim()==='กสิกร' && (await pg.textContent('#submitBtn')).trim()==='บันทึก ฿45');
await key('0'); await pg.click('#submitBtn'); await pg.waitForTimeout(400);
ok('editing saves 450 and shows no undo snack', (await entries()).find(e=>e.id==='x1').amount===450 && !(await vis('#vSnack.is-on')));

ok('no check marks in the sheet', !/[✓✔]/.test(await pg.evaluate(()=>document.getElementById('overlay').innerText)));
ok('no native dialogs', native.n===0);
ok('no js errors', errs.length===0); if(errs.length) console.log('- '+errs.join(' | ').slice(0,300));

// ---- มือถือจริง (จอสัมผัส): ช่องจำนวนเงินไม่เปิดคีย์บอร์ด ----
const mp=await (await b.newContext({viewport:{width:380,height:820},hasTouch:true,isMobile:true,serviceWorkers:'block'})).newPage();
await mp.route(/accounts\.google\.com|fonts\./,r=>r.abort()); await mp.addInitScript(seed);
await mp.goto('http://localhost:8202/index.html'); await mp.waitForTimeout(1200);
await mp.tap('#uxAddBtn'); await mp.waitForTimeout(350);
ok('touch: amount field is read-only with inputmode none (no phone keyboard)', await mp.evaluate(()=>{const a=document.getElementById('amount');return a.readOnly&&a.getAttribute('inputmode')==='none'}));
await mp.tap('.v-key[data-k="8"]'); await mp.tap('.v-key[data-k="0"]');
ok('touch: keypad still types (80)', (await mp.inputValue('#amount'))==='80');
await b.close(); srv.close();
})();
