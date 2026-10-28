// หน้าหลักแบบ A + แถบบน AI แบบ B (ds58): ต้องจ่ายเป็นแถวมีวงกลมตัวอักษร ดูทั้งหมดอยู่หัวการ์ด สิ่งที่ควรรู้ไม่มีกล่องซ้อน ปุ่มบนหน้า AI ไม่มีวงกลม
const { chromium } = require('playwright');
const http=require('http'),fs=require('fs'),path=require('path');const root=require('path').resolve(__dirname,'..');
const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png'};
const srv=http.createServer((q,s)=>{let p=q.url.split('?')[0];if(p==='/')p='/index.html';const f=path.join(root,p);fs.readFile(f,(e,d)=>{if(e){s.writeHead(404);s.end();return}s.writeHead(200,{'content-type':types[path.extname(f)]||'text/plain'});s.end(d)})});
const shots=require('os').tmpdir()+'/vaultet-test-shots/'; require('fs').mkdirSync(shots,{recursive:true});
(async()=>{await new Promise(r=>srv.listen(8209,r));
const b=await chromium.launch({...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{}),args:['--no-sandbox']});
const pg=await (await b.newContext({viewport:{width:380,height:820},deviceScaleFactor:2,serviceWorkers:'block'})).newPage();
const errs=[];pg.on('pageerror',e=>errs.push(e.message));
await pg.route(/accounts\.google\.com|fonts\./,r=>r.abort());
await pg.addInitScript(()=>{if(localStorage.getItem('__s'))return;localStorage.setItem('__s','1');
 const day=n=>{const x=new Date();x.setDate(x.getDate()+n);return x.toISOString().slice(0,10)};
 localStorage.setItem('finance_tracker_accounts_v1',JSON.stringify([{id:'a1',name:'กสิกร',initialBalance:12000}]));
 localStorage.setItem('finance_tracker_recurring_v1',JSON.stringify([
  {id:'r1',name:'Elevenlabs',amount:222,category:'กิน',accountId:'a1',frequency:'monthly',nextDueDate:day(2),status:'active'},
  {id:'r2',name:'อินเทอร์เน็ต',amount:200,category:'กิน',accountId:'a1',frequency:'monthly',nextDueDate:day(6),status:'active'},
  {id:'r3',name:'netflix',amount:169,category:'กิน',accountId:'a1',frequency:'monthly',nextDueDate:day(10),status:'active'}]));});
await pg.goto('http://localhost:8209/index.html');await pg.waitForTimeout(1500);
const ok=(n,c)=>console.log((c?'PASS ':'FAIL ')+n);
await pg.evaluate(()=>{window.scrollTo(0,0)});
ok('upcoming card: 3 rows with letter circles, total in the head', (await pg.locator('#upcomingPreviewList .v-up-row').count())===3 && (await pg.textContent('#upcomingPreviewList .v-up-av >> nth=0')).trim()==='E' && (await pg.textContent('#upcomingTotalNum')).includes('591'));
ok('"ดูทั้งหมด" sits in the card head, not a big outlined button', await pg.evaluate(()=>{const b=document.getElementById('viewUpcomingBtn');return !!b.closest('.v-up-head') && getComputedStyle(b).borderTopWidth==='0px';}));
ok('due within 3 days is highlighted', await pg.evaluate(()=>document.querySelector('#upcomingPreviewList .v-up-row').classList.contains('is-soon')));
await pg.click('#viewUpcomingBtn'); await pg.waitForTimeout(400);
ok('"ดูทั้งหมด" still opens the full list', await pg.evaluate(()=>document.getElementById('upcomingOverlay').classList.contains('open')));
await pg.evaluate(()=>document.querySelectorAll('.open').forEach(e=>e.classList.remove('open')));
await pg.evaluate(()=>{document.getElementById('upcomingCard').scrollIntoView({block:'start'});window.scrollBy(0,-90)}); await pg.waitForTimeout(300);
await pg.screenshot({path:shots+'r9-home.png'});
// สิ่งที่ควรรู้: ใส่ข้อเสนอจำลอง
await pg.evaluate(()=>{window.vaultetRenderAdvisorPreview([{type:'MIN_BUFFER',severity:'critical',action:'เติมเงิน',data:{available:16705,target:30000}}]); document.getElementById('notificationDashboardCard').style.display='block';});
await pg.evaluate(()=>{document.getElementById('notificationDashboardCard').scrollIntoView({block:'center'})}); await pg.waitForTimeout(300);
ok('insight row: no nested box, round icon, chevron', await pg.evaluate(()=>{const i=document.querySelector('#notificationDashboardCard .notification-item');const cs=getComputedStyle(i);const ic=getComputedStyle(i.querySelector('.notification-icon'));return cs.backgroundColor==='rgba(0, 0, 0, 0)' && ic.borderRadius.includes('50%') && !!i.querySelector('.adv-chevron');}));
await pg.screenshot({path:shots+'r9-insight.png'});
// หน้า AI
await pg.click('.ux-bottom-item[data-page="chat"]'); await pg.waitForTimeout(600);
ok('AI top bar: icon buttons have no circle/border', await pg.evaluate(()=>['uxChatNewBtn','uxChatMenuBtn'].every(id=>{const cs=getComputedStyle(document.getElementById(id));return cs.borderTopWidth==='0px'&&cs.backgroundColor==='rgba(0, 0, 0, 0)';})));
ok('AI top bar: both buttons still there and tappable size', await pg.evaluate(()=>['uxChatNewBtn','uxChatMenuBtn'].every(id=>{const r=document.getElementById(id).getBoundingClientRect();return r.width>=44&&r.height>=44;})));
await pg.screenshot({path:shots+'r9-ai.png'});
await pg.click('#uxChatMenuBtn'); await pg.waitForTimeout(400);
ok('menu button still opens the AI menu', await pg.isVisible('#aiMenu'));
ok('long-press popup text cannot be selected', await pg.evaluate(()=>{const d=document.createElement('div');d.className='v-aimenu-pop';document.body.append(d);const u=getComputedStyle(d).userSelect;d.remove();return u==='none';}));
ok('no js errors', errs.length===0); if(errs.length) console.log(errs.join(' | '));
await b.close();srv.close();})();
