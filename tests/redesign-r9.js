// แถบบน AI แบบ B (ds59): ปุ่มบนหน้า AI ไม่มีวงกลม + เมนูเล็กตอนกดค้างเลือกข้อความไม่ได้ (หน้าหลักคงของเดิม)
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
