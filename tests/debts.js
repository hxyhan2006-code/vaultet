const { chromium } = require('playwright');
const http=require('http'),fs=require('fs'),path=require('path');const root=require('path').resolve(__dirname,'..');
const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png'};
const srv=http.createServer((q,s)=>{let p=q.url.split('?')[0];if(p==='/')p='/index.html';const f=path.join(root,p);fs.readFile(f,(e,d)=>{if(e){s.writeHead(404);s.end();return}s.writeHead(200,{'content-type':types[path.extname(f)]||'text/plain'});s.end(d)})});
const shots=require('os').tmpdir()+'/vaultet-test-shots/'; require('fs').mkdirSync(shots,{recursive:true});
(async()=>{await new Promise(r=>srv.listen(8139,r));
const b=await chromium.launch({...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{}),args:['--no-sandbox']});
const pg=await (await b.newContext({viewport:{width:380,height:820},deviceScaleFactor:2,serviceWorkers:'block'})).newPage();
const errs=[];pg.on('pageerror',e=>errs.push(e.message));pg.on('console',m=>{if(m.type()==='error'&&!/ERR_FAILED/.test(m.text()))errs.push(m.text())});
const T=require('./tlib.js');const native=T.watchNative(pg);
await pg.route(/accounts\.google\.com|fonts\./,r=>r.abort());
await pg.addInitScript(()=>{if(localStorage.getItem('__s'))return;localStorage.setItem('__s','1');
 const d=n=>{const x=new Date();x.setDate(x.getDate()+n);return x.toISOString().slice(0,10)};const now=new Date().toISOString();
 localStorage.setItem('finance_tracker_accounts_v1',JSON.stringify([{id:'a1',name:'กสิกร',initialBalance:12000}]));
 localStorage.setItem('finance_tracker_entries_v1',JSON.stringify([{id:'e1',type:'expense',category:'กิน',amount:60,note:'ข้าว',date:d(0),accountId:'a1'}]));
 localStorage.setItem('finance_tracker_debts_v1',JSON.stringify([{id:'d1',name:'กยศ.',outstandingBalance:58000,gracePeriod:true,history:[{id:'h1',date:d(-3),type:'increase',amount:3000,note:'ค่าครองชีพ'}],createdAt:now},{id:'d2',name:'ผ่อนมือถือ',outstandingBalance:8000,gracePeriod:false,history:[],createdAt:now}]));});
await pg.goto('http://localhost:8139/index.html#plan');  // ทางลัดหนี้อยู่แท็บ "เงินของฉัน" ตั้งแต่ ds47
await pg.waitForTimeout(1200);
const ok=(n,c)=>console.log((c?'PASS ':'FAIL ')+n);
const debts=()=>pg.evaluate(()=>JSON.parse(localStorage.getItem('finance_tracker_debts_v1')));
await pg.click('#vMoneyDebtTile'); await pg.waitForTimeout(400);
ok('two debt cards', (await pg.locator('.v-debt').count())===2);
ok('balance shown', (await pg.textContent('.v-debt >> nth=0')).includes('58,000'));
ok('history collapsed by default', !(await pg.isVisible('.v-debt >> nth=0 >> .v-hrow')));
await pg.click('.v-debt >> nth=0 >> summary'); await pg.waitForTimeout(200);
ok('history opens', await pg.isVisible('.v-debt >> nth=0 >> .v-hrow'));
await pg.screenshot({path:shots+'debt-open.png'});
// quick chip: +3000 ค่าครองชีพ (seeded for กยศ.)
await pg.click('.v-debt >> nth=0 >> .v-debt-quick .v-chip-pill >> nth=0'); await T.dlgOK(pg); await pg.waitForTimeout(400);
let d=await debts(); ok('quick chip adds 3000 to กยศ. (now '+d[0].outstandingBalance+')', d[0].outstandingBalance===61000);
// repay via the form: button points the form at the debt
await pg.click('.v-debt >> nth=1 >> [data-act="repayment"]'); await pg.waitForTimeout(400);
ok('repay button selects that debt in the form', (await pg.inputValue('#debtActionSelect'))==='d2' && (await pg.inputValue('#debtActionType'))==='repayment');
ok('form label names the action and debt', (await pg.textContent('.debt-action-row .field-label')).includes('ผ่อนมือถือ'));
await pg.fill('#debtActionAmount','1500'); await pg.click('#debtActionSubmitBtn'); await pg.waitForTimeout(400);
d=await debts(); ok('repayment reduces balance (8000 -> '+d[1].outstandingBalance+')', d[1].outstandingBalance===6500);
// undo
await pg.click('.v-debt >> nth=1 >> summary'); await pg.waitForTimeout(150);
await pg.click('.v-debt >> nth=1 >> [data-undo]'); await T.dlgOK(pg); await pg.waitForTimeout(400);
d=await debts(); ok('undo restores balance (-> '+d[1].outstandingBalance+')', d[1].outstandingBalance===8000);
// add quick chip via manage section
await pg.click('.v-debt >> nth=1 >> summary').catch(()=>{}); await pg.waitForTimeout(350);
if(!(await pg.isVisible('.v-debt >> nth=1 >> [data-act="addq"]'))){ await pg.click('.v-debt >> nth=1 >> summary'); await pg.waitForTimeout(350); }
await pg.click('.v-debt >> nth=1 >> [data-act="addq"]'); await T.dlgOK(pg,{amt:'500',note:'ค่าอาหาร'}); await pg.waitForTimeout(400);
d=await debts(); ok('add quick chip', d[1].quick.length===1 && d[1].quick[0].amount===500);
await pg.screenshot({path:shots+'debt-manage.png'});
// delete quick chip
await pg.click('.v-debt >> nth=1 >> [data-qd]'); await T.dlgOK(pg); await pg.waitForTimeout(400);
d=await debts(); ok('delete quick chip', d[1].quick.length===0);
// add a new debt
await pg.click('#addDebtBtn'); await pg.waitForTimeout(200);
ok('add form opens', await pg.isVisible('#debtAddForm'));
await pg.fill('#debtNewName','ยืมแม่'); await pg.fill('#debtNewAmount','2000'); await pg.click('#debtNewSubmitBtn'); await pg.waitForTimeout(400);
d=await debts(); ok('new debt saved', d.some(x=>x.name==='ยืมแม่'&&x.outstandingBalance===2000));
// delete a debt
const before=(await debts()).length;
await pg.click('.v-debt >> nth=1 >> summary').catch(()=>{});
const delBtn=pg.locator('.v-debt >> nth=1 >> .delete-debt-btn'); if(!(await delBtn.isVisible())) await pg.click('.v-debt >> nth=1 >> summary');
await delBtn.click(); await T.dlgOK(pg); await pg.waitForTimeout(400);
ok('delete debt', (await debts()).length===before-1);
ok('no native browser dialogs ('+native.msgs.join(' | ')+')', native.n===0);
console.log(errs.join('\n')||'no js errors');
await b.close();srv.close()})();
