// ประวัติแชทในเมนู AI สไตล์ ChatGPT (ds57): ไม่มีปุ่มกากบาท, แตะ = เปิดแชท, กดค้าง = เมนูย่อย เปลี่ยนชื่อ/ลบ
const { chromium } = require('playwright');
const http=require('http'),fs=require('fs'),path=require('path');const root=require('path').resolve(__dirname,'..');
const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png'};
const srv=http.createServer((q,s)=>{let p=q.url.split('?')[0];if(p==='/')p='/index.html';const f=path.join(root,p);fs.readFile(f,(e,d)=>{if(e){s.writeHead(404);s.end();return}s.writeHead(200,{'content-type':types[path.extname(f)]||'text/plain'});s.end(d)})});
(async()=>{await new Promise(r=>srv.listen(8208,r));
const b=await chromium.launch({...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{}),args:['--no-sandbox']});
const pg=await (await b.newContext({viewport:{width:380,height:820},serviceWorkers:'block'})).newPage();
const errs=[];pg.on('pageerror',e=>errs.push(e.message));
const T=require('./tlib.js');
await pg.route(/accounts\.google\.com|fonts\./,r=>r.abort());
await pg.goto('http://localhost:8208/index.html');await pg.waitForTimeout(1500);
const ok=(n,c)=>console.log((c?'PASS ':'FAIL ')+n);
await pg.evaluate(()=>{const d=loadAllChats();const now=new Date().toISOString();
 d.chats=[{id:'c1',title:'ใช้เงินเยอะจังเมื่อวาน',messages:[{role:'user',text:'a'}],createdAt:now,updatedAt:now},{id:'c2',title:'อีก 2 วันเงินก็จะออก',messages:[{role:'user',text:'b'}],createdAt:now,updatedAt:'2000-01-01'}];
 d.activeId='c1';saveAllChats(d);});
await pg.evaluate(()=>vaultetGo('chat')); await pg.waitForTimeout(300);
await pg.click('#uxChatMenuBtn'); await pg.waitForTimeout(400);
ok('no X buttons in history rows', (await pg.locator('#aiMenuHist .v-aimenu-chat-del').count())===0 && (await pg.locator('#aiMenuHist .v-aimenu-chat').count())===2);
// แตะสั้น = เปิดแชท (ไม่เปิดเมนูย่อย)
const row=pg.locator('#aiMenuHist .v-aimenu-chat-main').nth(1);
await row.click(); await pg.waitForTimeout(600);
ok('short tap opens that chat, no popup', !(await pg.locator('.v-aimenu-pop').count()) && await pg.evaluate(()=>loadAllChats().activeId==='c2'));
// กดค้าง → เมนูย่อย
await pg.click('#uxChatMenuBtn'); await pg.waitForTimeout(400);
const box=await pg.locator('#aiMenuHist .v-aimenu-chat-main').nth(0).boundingBox();
await pg.mouse.move(box.x+60,box.y+20); await pg.mouse.down(); await pg.waitForTimeout(650); await pg.mouse.up(); await pg.waitForTimeout(250);
ok('long press shows popup with rename + delete', await pg.isVisible('.v-aimenu-pop') && (await pg.locator('.v-aimenu-pop-row').count())===2);
ok('long press did not also open the chat', await pg.isVisible('#aiMenu'));
const pb=await pg.locator('.v-aimenu-pop').boundingBox();
ok('popup stays inside the screen', pb.x>=0&&pb.y>=0&&pb.x+pb.width<=380&&pb.y+pb.height<=820);
// แตะนอกเมนู = ปิด ไม่ทำอะไร
await pg.mouse.click(10,10); await pg.waitForTimeout(200);
ok('tap outside closes popup, chats unchanged', !(await pg.locator('.v-aimenu-pop').count()) && (await pg.evaluate(()=>loadAllChats().chats.length))===2);
// เปลี่ยนชื่อ
await pg.locator('#aiMenuHist .v-aimenu-chat-main').nth(0).click({button:'right'}); await pg.waitForTimeout(250);
ok('right-click also opens popup', await pg.isVisible('.v-aimenu-pop'));
await pg.click('.v-aimenu-pop-row >> nth=0'); await T.dlgOK(pg,{v:'แผนเก็บเงิน'}); await pg.waitForTimeout(300);
ok('rename saves and shows in the list', await pg.evaluate(()=>loadAllChats().chats.find(c=>c.id==='c1').title==='แผนเก็บเงิน') && (await pg.textContent('#aiMenuHist')).includes('แผนเก็บเงิน'));
// ลบ (ถามยืนยันก่อน)
await pg.locator('#aiMenuHist .v-aimenu-chat-main').nth(1).click({button:'right'}); await pg.waitForTimeout(250);
await pg.click('.v-aimenu-pop-row.is-danger'); await T.dlgCancel(pg); await pg.waitForTimeout(200);
ok('delete asks first; cancel keeps the chat', (await pg.evaluate(()=>loadAllChats().chats.length))===2);
await pg.locator('#aiMenuHist .v-aimenu-chat-main').nth(1).click({button:'right'}); await pg.waitForTimeout(250);
await pg.click('.v-aimenu-pop-row.is-danger'); await T.dlgOK(pg); await pg.waitForTimeout(300);
ok('confirmed delete removes it', (await pg.evaluate(()=>loadAllChats().chats.length))===1 && (await pg.locator('#aiMenuHist .v-aimenu-chat').count())===1);
await pg.screenshot({path:require('os').tmpdir()+'/vaultet-test-shots/r8-menu.png'});
ok('no js errors', errs.length===0); if(errs.length) console.log(errs.join(' | '));
await b.close();srv.close();})();
