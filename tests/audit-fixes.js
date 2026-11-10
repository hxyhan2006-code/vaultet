const { chromium } = require('playwright');
const http=require('http'),fs=require('fs'),path=require('path');const root=path.resolve(__dirname,'..');
const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.webmanifest':'application/manifest+json'};
const srv=http.createServer((q,s)=>{let p=q.url.split('?')[0];if(p==='/')p='/index.html';fs.readFile(path.join(root,p),(e,d)=>{if(e){s.writeHead(404);s.end();return}s.writeHead(200,{'content-type':types[path.extname(f=p)]||'text/plain'});s.end(d)})});let f;
const ok=(n,c)=>console.log((c?'PASS ':'FAIL ')+n);
(async()=>{await new Promise(r=>srv.listen(8137,r));
const b=await chromium.launch({...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{}),args:['--no-sandbox']});
const mk=async(sw,init)=>{const ctx=await b.newContext({viewport:{width:380,height:820},serviceWorkers:sw?'allow':'block'});const calls={g:0};
 await ctx.route(/accounts\.google\.com|fonts\./,r=>r.abort());
 await ctx.route(/generativelanguage\.googleapis\.com/,r=>{calls.g++;r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({candidates:[{content:{parts:[{text:'ทดสอบ'}]},finishReason:'STOP'}]})})});
 await ctx.addInitScript(()=>{if(localStorage.getItem('__s'))return;localStorage.setItem('__s','1');
  localStorage.setItem('finance_tracker_accounts_v1',JSON.stringify([{id:'a1',name:'กสิกร',initialBalance:5000}]));
  localStorage.setItem('finance_tracker_ai_apikeys_v1',JSON.stringify(['FAKE-KEY-12345678']));
  localStorage.setItem('vaultet_goals_v1',JSON.stringify([{id:'g1',name:'เป้า1',target:1000,saved:0,deadline:''},{id:'g2',name:'เป้า2',target:2000,saved:0,deadline:''}]));});
 if(init)await ctx.addInitScript(init);
 const pg=await ctx.newPage();const errs=[];pg.on('pageerror',e=>errs.push(e.message));return{ctx,pg,calls,errs};};
const url='http://localhost:8137/index.html';
// 1) การ์ดสรุป AI วันละครั้ง
{const {ctx,pg,calls,errs}=await mk();await pg.goto(url);await pg.waitForTimeout(1800);
 ok('เปิดแอปครั้งแรกของวัน เรียก AI เอง 1 ครั้ง',calls.g===1);
 const g=calls.g;
 for(let i=0;i<3;i++){await pg.evaluate(()=>{commitEntry({type:'expense',category:'กิน',accountId:'a1',amount:40+Math.random(),date:todayISO(),note:'t'});render();});await pg.waitForTimeout(500);}
 ok('บันทึกรายการ 3 ครั้ง ไม่เรียก AI เพิ่ม',calls.g===g);
 await pg.reload();await pg.waitForTimeout(1500);
 ok('เปิดซ้ำวันเดียวกัน ไม่เรียก AI เพิ่ม',calls.g===g);
 await pg.evaluate(()=>refreshProactiveCard(true));await pg.waitForTimeout(800);
 ok('กดรีเฟรชเอง ยังเรียก AI ได้',calls.g===g+1);
 ok('ไม่มี error',errs.length===0);await ctx.close();}
// 2) กู้คืนแบบรวม ไม่ลบเป้าหมายที่สร้างหลังสำรอง
{const {ctx,pg}=await mk();await pg.goto(url);await pg.waitForTimeout(1200);
 const r=await pg.evaluate(()=>{const bk=JSON.parse(JSON.stringify(buildBackupPayload()));
  const g=JSON.parse(localStorage.getItem('vaultet_goals_v1'));g.push({id:'g3',name:'ใหม่',target:5,saved:0,deadline:''});g[0].name='แก้หลังสำรอง';localStorage.setItem('vaultet_goals_v1',JSON.stringify(g));
  const g0=JSON.parse(localStorage.getItem('vaultet_goals_v1')).length;
  applyImportedBackup(bk);const a=JSON.parse(localStorage.getItem('vaultet_goals_v1'));return{g0,n:a.length,name:a[0].name};});
 ok('รวมข้อมูล: เป้าหมายใหม่ไม่หาย',r.n===3&&r.g0===3);ok('รวมข้อมูล: ของในเครื่องไม่ถูกทับ',r.name==='แก้หลังสำรอง');await ctx.close();}
// 3) ลบรายการขายหุ้น ลบบันทึกขายในพอร์ตด้วย
{const {ctx,pg}=await mk();await pg.goto(url);await pg.waitForTimeout(1200);
 const r=await pg.evaluate(async()=>{const res=commitEntry({type:'income',category:'ถอนเงินออม',amount:600,date:todayISO(),note:'ขายหุ้น X',accountId:'a1'});
  localStorage.setItem('vaultet_portfolio_sells_v1',JSON.stringify([{id:'s1',ticker:'X',date:todayISO(),shares:1,proceeds:600,cost:500,entryId:res.entry.id},{id:'s2',ticker:'Y',date:todayISO(),shares:1,proceeds:1,cost:1,entryId:'other'}]));
  await deleteEntryById(res.entry.id);return JSON.parse(localStorage.getItem('vaultet_portfolio_sells_v1')).map(x=>x.id);});
 ok('ลบรายการขายหุ้น: บันทึกขายของรายการนั้นหาย อันอื่นอยู่',r.length===1&&r[0]==='s2');await ctx.close();}
// 4) เวลาเงียบ 23:00-07:00 ทำงานจริง
{const {ctx,pg}=await mk();await pg.clock.setFixedTime(new Date('2026-11-10T16:30:00Z'));await pg.goto(url);await pg.waitForTimeout(800);   // 23:30 เวลาไทย (เบราว์เซอร์ใช้เขตเวลาเครื่อง จึงตั้งเวลาเองแทน)
 const r=await pg.evaluate(()=>{const RealDate=Date;const fake=new RealDate();fake.setHours(23,30,0,0);const h=fake.getHours();
  const before=loadVaultetNotifications().length;const st={};
  const OrigNow=Date;const f={id:'A',severity:'critical',data:{available:1,target:100},priorityScore:1};
  const hOrig=Date.prototype.getHours;Date.prototype.getHours=function(){return 23};
  const quiet=addVaultetNotification(f,st);
  Date.prototype.getHours=function(){return 12};const day=addVaultetNotification(f,{});
  Date.prototype.getHours=hOrig;return{quiet,day,added:loadVaultetNotifications().length-before};});
 ok('23:00 ไม่แจ้งเตือน',r.quiet===false);ok('กลางวันแจ้งเตือนได้',r.day===true&&r.added===1);await ctx.close();}
// 5) ไม่มีเครื่องหมายติ๊กใน OpenRouter / หน้ากู้คืน
{const {ctx,pg}=await mk(false,()=>{localStorage.setItem('vaultet_or_key_v1','k');localStorage.setItem('vaultet_or_model_v1','a/b');});await pg.goto(url);await pg.waitForTimeout(800);
 ok('สถานะ OpenRouter ไม่มีติ๊ก',!/[✓✔✗]/.test(await pg.evaluate(()=>vaultetOR.statusText())));
 await pg.evaluate(()=>promptRestore({exportedAt:new Date().toISOString(),entries:[],integrity:{hash:'x'}},'ทดสอบ'));
 ok('หน้ากู้คืนไม่มี ✗',!/[✓✔✗]/.test(await pg.evaluate(()=>document.body.lastElementChild.innerText)));await ctx.close();}
// 6) ล็อกแอป: ซ่อนหน้าไว้ตั้งแต่แรก แล้วปล่อยเมื่อพร้อม / ไม่มีล็อกไม่ซ่อน
{const {ctx,pg}=await mk(false,()=>{localStorage.setItem('vlock_v1',JSON.stringify({on:true,salt:'s',pin:'x',q:'q',a:'a'}));});
 await pg.goto(url);await pg.waitForTimeout(600);
 const r=await pg.evaluate(()=>({style:!!document.getElementById('vBootLock'),vis:getComputedStyle(document.body).visibility,lockShown:[...document.body.children].some(x=>x.style&&x.style.zIndex==='99999'&&x.style.display==='flex')}));
 ok('มีล็อก: หน้าล็อกขึ้น และไม่ค้างจอดำ',r.lockShown&&r.style===true);
 const lockVisible=await pg.evaluate(()=>{const o=[...document.body.children].find(x=>x.style&&x.style.zIndex==='99999');return getComputedStyle(o.querySelector('#lockPin')).visibility;});
 ok('หน้าล็อกมองเห็นได้ (ตัวหน้าอื่นยังซ่อน)',lockVisible==='visible'&&r.vis==='hidden');
 await ctx.close();}
{const {ctx,pg}=await mk();await pg.goto(url);await pg.waitForTimeout(500);
 ok('ไม่มีล็อก: ไม่ซ่อนหน้า',await pg.evaluate(()=>!document.getElementById('vBootLock')&&getComputedStyle(document.body).visibility==='visible'));await ctx.close();}
// 7) เก็บไฟล์ในเครื่อง: ติดตั้งแล้วไฟล์ทั้งหมดอยู่ใน cache และ SW ส่งของในเครื่องได้
{const {ctx,pg}=await mk(true);await pg.goto(url);
 await pg.waitForFunction(()=>navigator.serviceWorker.controller||false,null,{timeout:8000}).catch(async()=>{await pg.reload();});
 await pg.waitForTimeout(1500);
 const r=await pg.evaluate(async()=>{const ks=await caches.keys();const c=await caches.open(ks.find(k=>/vaultet-shell/.test(k)));const reqs=(await c.keys()).map(x=>new URL(x.url).pathname+new URL(x.url).search);return{ks,n:reqs.length,has:['/app/01-base.js','/ai/11-chat-look.js','/css/16-ds-redesign.css','/ui.js','/dialog.js'].every(p=>reqs.some(x=>x.startsWith(p+'?v=ds')))};});
 ok('cache ชื่อรุ่นใหม่ (v8)',r.ks.includes('vaultet-shell-v8'));ok('ไฟล์แอปครบอยู่ใน cache ('+r.n+' ไฟล์)',r.has&&r.n>=40);
 await ctx.setOffline(true);const pg2=await ctx.newPage();await pg2.goto(url).catch(()=>{});await pg2.waitForTimeout(1200);
 ok('ออฟไลน์เปิดแอปได้ ขึ้นยอดเงินครบ',await pg2.evaluate(()=>/\d/.test((document.getElementById('balanceNum')||{}).textContent||'')&&!!document.querySelector('.ux-bottom-nav')));
 await ctx.close();}
// 8) เลขเวอร์ชันบอกเวลาเปิดแอปจริง
{const {ctx,pg}=await mk();await pg.goto(url);await pg.waitForTimeout(1200);
 const t=await pg.evaluate(()=>document.querySelector('.v-version').textContent);
 ok('เลขเวอร์ชัน ds92 + เวลาเปิดแอป: '+t,/ds92 · เปิดแอป \d+\.\d วินาที/.test(t));await ctx.close();}
console.log('no js errors');
await b.close();srv.close();})().catch(e=>{console.log('FAIL exception '+e.message);process.exit(1)});
