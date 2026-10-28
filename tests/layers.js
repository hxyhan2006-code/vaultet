// หน้าต่างที่ซ้อนทับ: ล็อกการเลื่อนหน้าด้านหลัง, แจ้งเตือนลอยอยู่กึ่งกลาง, ทางลัดจัดเรียงเองได้และอยู่กึ่งกลาง
const { chromium } = require('playwright');
const http=require('http'),fs=require('fs'),path=require('path');const root=require('path').resolve(__dirname,'..');
const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png'};
const srv=http.createServer((q,s)=>{let p=q.url.split('?')[0];if(p==='/')p='/index.html';const f=path.join(root,p);fs.readFile(f,(e,d)=>{if(e){s.writeHead(404);s.end();return}s.writeHead(200,{'content-type':types[path.extname(f)]||'text/plain'});s.end(d)})});
const shots=require('os').tmpdir()+'/vaultet-test-shots/'; require('fs').mkdirSync(shots,{recursive:true});
(async()=>{await new Promise(r=>srv.listen(8185,r));
const b=await chromium.launch({...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{}),args:['--no-sandbox']});
const pg=await (await b.newContext({viewport:{width:380,height:820},deviceScaleFactor:2,serviceWorkers:'block'})).newPage();
const errs=[];pg.on('pageerror',e=>errs.push(e.message));pg.on('console',m=>{if(m.type()==='error'&&!/ERR_FAILED|Failed to load resource/.test(m.text()))errs.push(m.text())});
const T=require('./tlib.js');const native=T.watchNative(pg);
await pg.route(/accounts\.google\.com|fonts\./,r=>r.abort());
await pg.addInitScript(()=>{if(localStorage.getItem('__s'))return;localStorage.setItem('__s','1');
 const d=n=>{const x=new Date();x.setDate(x.getDate()-n);return x.toISOString().slice(0,10)};
 localStorage.setItem('finance_tracker_accounts_v1',JSON.stringify([{id:'a1',name:'กสิกร',openingBalance:20000}]));
 const es=[];for(let i=0;i<60;i++)es.push({id:'e'+i,type:'expense',category:'กิน',amount:50+i,note:'ข้าว '+i,date:d(i%20),accountId:'a1'});
 localStorage.setItem('finance_tracker_entries_v1',JSON.stringify(es));});
await pg.goto('http://localhost:8185/index.html');await pg.waitForTimeout(1000);
const ok=(n,c)=>console.log((c?'PASS ':'FAIL ')+n);
const vis=s=>pg.isVisible(s);
const scrollY=()=>pg.evaluate(()=>Math.round(window.scrollY));
const locked=()=>pg.evaluate(()=>document.body.classList.contains('v-scroll-locked'));

// ---- ล็อกการเลื่อน ---- (หน้าตั้งค่ายาวพอให้เลื่อน — หน้าหลักสั้นลงตั้งแต่ ds54 ที่ย้ายแถบเตือนไปกระดิ่ง)
await pg.evaluate(()=>vaultetGo('more')); await pg.waitForTimeout(600);
await pg.evaluate(()=>window.scrollTo(0,500)); await pg.waitForTimeout(200);
const y0=await scrollY(); ok('page is scrolled before opening anything ('+y0+'px)', y0>200);
await pg.evaluate(()=>openForm(null)); await pg.waitForTimeout(450);
ok('add sheet open → background scroll locked', await locked());
await pg.mouse.move(190,60); await pg.mouse.wheel(0,600); await pg.waitForTimeout(250);
ok('wheel over the dim backdrop does not move the page behind (body fixed)', await pg.evaluate(()=>getComputedStyle(document.body).position==='fixed'));
await pg.evaluate(()=>document.querySelectorAll('.overlay.open').forEach(e=>e.classList.remove('open'))); await pg.waitForTimeout(350);
ok('closing it unlocks', !(await locked()));
const y1=await scrollY(); ok('scroll position restored after closing ('+y1+' vs '+y0+')', Math.abs(y1-y0)<=2);

const p1=pg.evaluate(()=>vaultetAsk('ตกลง','ทดสอบกล่องข้อความ',false)); await pg.waitForSelector('.v-dlg'); await pg.waitForTimeout(150);
ok('in-app dialog → locked', await locked()); await T.dlgOK(pg); await p1; await pg.waitForTimeout(300);
ok('dialog closed → unlocked and position kept', !(await locked()) && Math.abs((await scrollY())-y0)<=2);

await pg.evaluate(()=>vaultetGo('chat')); await pg.waitForTimeout(400);
await pg.click('#uxChatMenuBtn'); await pg.waitForTimeout(400);
ok('AI menu open → locked', await locked());
await pg.keyboard.press('Escape'); await pg.waitForTimeout(500);
ok('AI menu closed → unlocked', !(await locked()));
await pg.click('#uxChatMenuBtn'); await pg.waitForTimeout(300); await pg.click('#aiMenu .v-aimenu-row >> nth=2'); await pg.waitForTimeout(700);
ok('instruction sheet open → locked', await locked());
await pg.click('#aiAdvisorCloseBtn'); await pg.waitForTimeout(700); await pg.keyboard.press('Escape'); await pg.waitForTimeout(500);
ok('everything closed → unlocked', !(await locked()));
await pg.evaluate(()=>vaultetGo('home')); await pg.waitForTimeout(300);

// ---- แถบล่าง: ปุ่มไม่ขยับเมื่อสลับไปแท็บ AI ----
const navXs=()=>pg.evaluate(()=>[...document.querySelectorAll('.ux-bottom-item, #uxAddBtn')].map(e=>{const r=e.getBoundingClientRect();return Math.round(r.left+r.width/2)}));
const navHome=await navXs();
const navByTab={};
for(const t of ['analysis','plan','chat','home']){ await pg.evaluate(x=>vaultetGo(x),t); await pg.waitForTimeout(350); navByTab[t]=await navXs(); }
const same=(a,b)=>a.length===b.length && a.every((v,i)=>Math.abs(v-b[i])<=1);
ok('bottom bar items stay put on every tab incl. AI ('+navHome.join(',')+' vs AI '+navByTab.chat.join(',')+')', ['analysis','plan','chat','home'].every(t=>same(navByTab[t],navHome)));
const cols=await pg.evaluate(()=>getComputedStyle(document.querySelector('.ux-bottom-nav')).display);
ok('nav is a grid on the home tab', cols==='grid');

// ---- แจ้งเตือน "AI ตอบแล้ว" อยู่กึ่งกลาง ----
await pg.evaluate(()=>window.scrollTo(0,0));
await pg.evaluate(()=>showAiCompletionNotification('x')); await pg.waitForTimeout(500);
const tb=await pg.evaluate(()=>{const r=document.getElementById('aiCompletionNotice').getBoundingClientRect();return {cx:Math.round(r.left+r.width/2),w:Math.round(r.width),l:Math.round(r.left),r:Math.round(window.innerWidth-r.right)}});
ok('"AI ตอบแล้ว" card is horizontally centred ('+JSON.stringify(tb)+')', Math.abs(tb.cx-190)<=2 && Math.abs(tb.l-tb.r)<=2 && tb.l>=12);
await pg.screenshot({path:shots+'layers-toast.png'});
await pg.click('#aiCompletionDismissBtn'); await pg.waitForTimeout(300);

// ---- เงินของฉัน (ds52): ทางลัดเดิม (รวมจัดเรียง) ถูกแทนด้วยแถวในหน้า จึงซ่อนไว้ ----
await pg.evaluate(()=>vaultetGo('plan')); await pg.evaluate(()=>window.scrollTo(0,0)); await pg.waitForTimeout(300);
ok('old shortcut grid is hidden (rows replace it)', !(await pg.isVisible('#vShortcuts')) && await pg.isVisible('#vMoneyAccounts'));
await pg.click('#vMoneyAccounts [data-act="accounts"]'); await pg.waitForTimeout(400);
ok('"จัดการ" on accounts opens the Accounts sheet', await pg.evaluate(()=>document.getElementById('accountsOverlay').classList.contains('open')));
await pg.evaluate(()=>document.querySelectorAll('.overlay.open').forEach(e=>e.classList.remove('open'))); await pg.waitForTimeout(300);
// ---- ไอคอนแอป: manifest ชี้ไฟล์ที่มีจริง ขนาดถูก ----
const ic=await pg.evaluate(async()=>{const m=await (await fetch('manifest.webmanifest')).json();const out=[];for(const i of m.icons){const r=await fetch(i.src);const buf=new Uint8Array(await r.arrayBuffer());const dv=new DataView(buf.buffer);out.push({src:i.src,sizes:i.sizes,purpose:i.purpose,ok:r.ok,png:buf[1]===0x50&&buf[2]===0x4E,w:dv.getUint32(16),h:dv.getUint32(20)});}
const ap=document.querySelector('link[rel=apple-touch-icon]').getAttribute('href');const r2=await fetch(ap);return {out,ap,apOk:r2.ok};});
ok('manifest icons exist and match their declared size ('+ic.out.map(i=>i.src+' '+i.w+'x'+i.h).join(', ')+')', ic.out.length>=2 && ic.out.every(i=>i.ok&&i.png&&i.sizes===i.w+'x'+i.h));
ok('apple-touch-icon file exists ('+ic.ap+')', ic.apOk);
ok('no native browser dialogs ('+native.msgs.join(' | ')+')', native.n===0);
console.log(errs.join('\n')||'no js errors');
await b.close();srv.close()})();
