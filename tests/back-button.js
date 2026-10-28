const { chromium } = require('playwright');
const http=require('http'),fs=require('fs'),path=require('path');const root=require('path').resolve(__dirname,'..');
const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png'};
const srv=http.createServer((q,s)=>{let p=q.url.split('?')[0];if(p==='/')p='/index.html';const f=path.join(root,p);fs.readFile(f,(e,d)=>{if(e){s.writeHead(404);s.end();return}s.writeHead(200,{'content-type':types[path.extname(f)]||'text/plain'});s.end(d)})});
const T=require('./tlib.js');
const ok=(n,c)=>console.log((c?'PASS ':'FAIL ')+n);
(async()=>{await new Promise(r=>srv.listen(8161,r));
const b=await chromium.launch({...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{}),args:['--no-sandbox']});
const pg=await (await b.newContext({viewport:{width:380,height:820},serviceWorkers:'block'})).newPage();
const errs=[];pg.on('pageerror',e=>errs.push(e.message));pg.on('console',m=>{if(m.type()==='error'&&!/ERR_FAILED/.test(m.text()))errs.push(m.text())});
const native=T.watchNative(pg);
await pg.route(/accounts\.google\.com|fonts\./,r=>r.abort());
await pg.addInitScript(()=>{try{localStorage.getItem('__s');}catch(e){return;} if(localStorage.getItem('__s'))return;localStorage.setItem('__s','1');const d=new Date().toISOString().slice(0,10);
 localStorage.setItem('finance_tracker_accounts_v1',JSON.stringify([{id:'a1',name:'x',initialBalance:5000}]));
 localStorage.setItem('finance_tracker_entries_v1',JSON.stringify([{id:'e1',type:'expense',category:'กิน',amount:60,note:'',date:d,accountId:'a1'}]));});
await pg.goto('about:blank');
await pg.goto('http://localhost:8161/index.html');await pg.waitForTimeout(1000);
const back=async()=>{await pg.evaluate(()=>history.back());await pg.waitForTimeout(350);};
const q=(f)=>pg.evaluate(f);
await pg.mouse.click(190,400); await pg.waitForTimeout(100); // แตะครั้งแรก = ใส่รายการกั้น

// 1) ฟอร์ม: ย้อนครั้งแรกปิดแป้น ครั้งที่สองปิดฟอร์ม
await pg.evaluate(()=>openForm(null)); await pg.waitForTimeout(300);
ok('form open, keypad visible', await q(()=>document.getElementById('overlay').classList.contains('open')) && await pg.isVisible('#vKeypad'));
await back();
ok('back #1: keypad closes, form stays', await q(()=>document.getElementById('overlay').classList.contains('open')) && !(await pg.isVisible('#vKeypad')));
ok('still inside the app', pg.url().includes('localhost:8161'));
await pg.click('#overlay .v-amount'); await pg.waitForTimeout(150);
ok('tapping the amount brings the keypad back', await pg.isVisible('#vKeypad'));
await back(); await back();
ok('back #2 (after hiding again): form closes', !(await q(()=>document.getElementById('overlay').classList.contains('open'))));
ok('still inside the app after closing the form', pg.url().includes('localhost:8161'));

// 2) กล่องข้อความของแอป
const asked=pg.evaluate(()=>vaultetConfirm('ทดสอบ?').then(v=>{window.__ans=v;return v;}));
await pg.waitForTimeout(250);
ok('dialog is open', (await pg.locator('.v-dlg-back').count())===1);
await back();
ok('back closes the dialog as "cancel"', (await pg.locator('.v-dlg-back').count())===0 && (await q(()=>window.__ans))===false);

// 3) หน้าย่อย/แท็บอื่น
await pg.evaluate(()=>vaultetGo('analysis')); await pg.waitForTimeout(200);
await back();
ok('back from a tab goes to home', await q(()=>document.body.classList.contains('ux-home-active')));
await pg.evaluate(()=>vaultetGo('list')); await pg.waitForTimeout(200);
await back();
ok('back from the list page goes to the previous tab (home)', await q(()=>document.body.classList.contains('ux-home-active')));

// 4) หน้าต่างแบบแผ่นจากล่าง
await pg.evaluate(()=>{ document.getElementById('budgetOverlay').classList.add('open'); }); await pg.waitForTimeout(150);
await back();
ok('back closes a bottom-sheet window', !(await q(()=>document.getElementById('budgetOverlay').classList.contains('open'))));

// 5) หน้าหลักไม่มีอะไรเปิด → ย้อนอีกครั้งออกจากแอป
await back(); await pg.waitForTimeout(300);
ok('at home with nothing open, back leaves the app', pg.url()==='about:blank');
ok('no native dialogs, no js errors: '+(errs.join(' ')||'none'), native.n===0 && errs.length===0);
await b.close();srv.close()})();
