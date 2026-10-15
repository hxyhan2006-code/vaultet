const { chromium } = require('playwright');
const http=require('http'),fs=require('fs'),path=require('path');const root=require('path').resolve(__dirname,'..');
const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png'};
const srv=http.createServer((q,s)=>{let p=q.url.split('?')[0];if(p==='/')p='/index.html';const f=path.join(root,p);fs.readFile(f,(e,d)=>{if(e){s.writeHead(404);s.end();return}s.writeHead(200,{'content-type':types[path.extname(f)]||'text/plain'});s.end(d)})});
const shots=require('os').tmpdir()+'/vaultet-test-shots/'; require('fs').mkdirSync(shots,{recursive:true});
(async()=>{await new Promise(r=>srv.listen(8128,r));
const b=await chromium.launch({...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{}),args:['--no-sandbox']});
const pg=await (await b.newContext({viewport:{width:380,height:820},deviceScaleFactor:2,serviceWorkers:'block'})).newPage();
const errs=[];pg.on('pageerror',e=>errs.push(e.message));pg.on('console',m=>{if(m.type()==='error'&&!/ERR_FAILED/.test(m.text()))errs.push(m.text())});
const T=require('./tlib.js');const native=T.watchNative(pg);
await pg.route(/accounts\.google\.com|fonts\./,r=>r.abort());
await pg.addInitScript(()=>{if(localStorage.getItem('__s'))return;localStorage.setItem('__s','1');
 localStorage.setItem('finance_tracker_accounts_v1',JSON.stringify([{id:'a1',name:'กสิกร',openingBalance:2000},{id:'a2',name:'เงินสด',openingBalance:500}]));
 const d=new Date().toISOString().slice(0,10);
 localStorage.setItem('finance_tracker_entries_v1',JSON.stringify([{id:'e1',type:'expense',category:'กิน',amount:60,note:'ข้าวมันไก่',date:d,accountId:'a2'}]));
 localStorage.setItem('vaultet_templates_v1',JSON.stringify([{id:'t1',name:'ข้าวเที่ยง',type:'expense',category:'กิน',amount:60,note:'เที่ยง'}]));});
await pg.goto('http://localhost:8128/index.html');await pg.waitForTimeout(1000);
const ok=(n,c)=>console.log((c?'PASS ':'FAIL ')+n);
const entries=()=>pg.evaluate(()=>JSON.parse(localStorage.getItem('finance_tracker_entries_v1')));
const open=()=>pg.evaluate(()=>openForm(null));
// 1 add expense
await open(); await pg.fill('#amount','123'); 
ok('save enabled after amount', await pg.isEnabled('#submitBtn'));
await pg.click('.v-chip[data-cat="คาเฟ่"]'); await pg.fill('#note','ลาเต้');
await pg.screenshot({path:shots+'f-filled.png'});
await pg.click('#submitBtn'); await pg.waitForTimeout(300);
let es=await entries(); const e1=es.find(e=>e.note==='ลาเต้');
ok('expense saved with category/amount', !!e1&&e1.category==='คาเฟ่'&&e1.amount===123&&e1.type==='expense');
ok('sheet closes after save', !(await pg.evaluate(()=>document.getElementById('overlay').classList.contains('open'))));
// 2 quick amounts add up
await open(); await pg.click('[data-qa="50"]'); await pg.click('[data-qa="100"]');
ok('quick amounts add (150)', (await pg.inputValue('#amount'))==='150');
await pg.click('#quickAmountClear'); ok('clear empties', (await pg.inputValue('#amount'))==='');
ok('save disabled when empty', await pg.isDisabled('#submitBtn'));
// 3 template
await pg.click('[data-use="0"]'); 
ok('template fills amount+note', (await pg.inputValue('#amount'))==='60'&&(await pg.inputValue('#note'))==='เที่ยง');
// 4 manage mode
ok('x hidden by default', !(await pg.isVisible('.v-chip-x >> nth=0')));
await pg.click('#vManageBtn');
ok('x visible in manage mode', await pg.isVisible('.v-chip-x >> nth=0'));
ok('add category visible in manage mode', await pg.isVisible('#addCatBtn'));
await pg.screenshot({path:shots+'f-manage.png'});
await pg.click('#addCatBtn'); await T.dlgOK(pg,{v:'ของเล่น'}); await pg.waitForTimeout(200);
ok('add category works', await pg.isVisible('.v-chip[data-cat="ของเล่น"]'));
await pg.click('.v-chip-x[data-cat="ของเล่น"]'); await T.dlgOK(pg); await pg.waitForTimeout(200);
ok('delete category works', !(await pg.isVisible('.v-chip[data-cat="ของเล่น"]')));
await pg.click('#vManageBtn'); ok('manage toggles off', !(await pg.isVisible('#addCatBtn')));
await pg.evaluate(()=>closeForm());
// 5 transfer
await open(); await pg.click('.type-btn[data-type="transfer"]'); await pg.fill('#amount','200');
ok('account select hidden in transfer', !(await pg.isVisible('#entryAccount')));
await pg.selectOption('#fromAccount','a1'); await pg.selectOption('#toAccount','a2'); await pg.click('#submitBtn'); await pg.waitForTimeout(300);
es=await entries(); ok('transfer saved', es.some(e=>e.type==='transfer'&&e.amount===200&&e.fromAccountId==='a1'&&e.toAccountId==='a2'));
// 6 income + saving invest fields
await open(); await pg.click('.type-btn[data-type="income"]'); await pg.fill('#amount','999'); await pg.click('.v-chip[data-cat="ยูทูป"]'); await pg.click('#submitBtn'); await pg.waitForTimeout(300);
es=await entries(); ok('income saved', es.some(e=>e.type==='income'&&e.category==='ยูทูป'&&e.amount===999));
await open(); await pg.click('.type-btn[data-type="saving"]'); await pg.click('#vManageBtn'); await pg.click('#addCatBtn'); await T.dlgOK(pg,{v:'ลงทุน'}); await pg.waitForTimeout(200);
ok('invest fields appear for category ลงทุน', await pg.isVisible('#investTicker'));
await pg.screenshot({path:shots+'f-invest.png'}); await pg.evaluate(()=>closeForm());
// 7 edit
await pg.evaluate(()=>{const e=JSON.parse(localStorage.getItem('finance_tracker_entries_v1')).find(x=>x.id==='e1');openForm(e)});
ok('edit prefilled', (await pg.inputValue('#amount'))==='60'&&(await pg.textContent('#modalTitle'))==='แก้ไขรายการ');
await pg.fill('#amount','75'); await pg.click('#submitBtn'); await pg.waitForTimeout(300);
es=await entries(); ok('edit saved', es.find(e=>e.id==='e1').amount===75);
// 8 overflow check
await open(); const ov=await pg.evaluate(()=>{const s=document.querySelector('#overlay .v-sheet');return [s.scrollWidth>s.clientWidth, document.documentElement.scrollWidth>window.innerWidth]});
ok('no horizontal overflow', !ov[0]&&!ov[1]);
ok('no native browser dialogs ('+native.msgs.join(' | ')+')', native.n===0);
console.log(errs.join('\n')||'no js errors');
await b.close();srv.close()})();
