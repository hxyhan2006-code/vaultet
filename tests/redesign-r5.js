// โฉมใหม่ รอบ 5 (ds53): หน้าแชท AI (หน้าว่างมีคำถามแนะนำ, ฟองข้อความเรา/AI, ปุ่มส่งสีของแอป)
// และหน้าตั้งค่า (ไอคอนทุกแถว, สวิตช์เศษสตางค์, แถวล็อกแอปบอกสถานะจริง, ตัวอักษรโปรไฟล์)
const { chromium } = require('playwright');
const http=require('http'),fs=require('fs'),path=require('path');const root=require('path').resolve(__dirname,'..');
const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png'};
const srv=http.createServer((q,s)=>{let p=q.url.split('?')[0];if(p==='/')p='/index.html';const f=path.join(root,p);fs.readFile(f,(e,d)=>{if(e){s.writeHead(404);s.end();return}s.writeHead(200,{'content-type':types[path.extname(f)]||'text/plain'});s.end(d)})});
const shots=require('os').tmpdir()+'/vaultet-test-shots/'; require('fs').mkdirSync(shots,{recursive:true});
(async()=>{await new Promise(r=>srv.listen(8205,r));
const b=await chromium.launch({...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{}),args:['--no-sandbox']});
const pg=await (await b.newContext({viewport:{width:380,height:820},deviceScaleFactor:2,serviceWorkers:'block'})).newPage();
const errs=[];pg.on('pageerror',e=>errs.push(e.message));pg.on('console',m=>{if(m.type()==='error'&&!/ERR_FAILED/.test(m.text()))errs.push(m.text())});
const T=require('./tlib.js');const native=T.watchNative(pg);
let aiCalls=0;
await pg.route(/accounts\.google\.com|fonts\./,r=>r.abort());
await pg.route(/generativelanguage|openrouter/,r=>{aiCalls++;r.abort();});
await pg.addInitScript(()=>{if(localStorage.getItem('__s'))return;localStorage.setItem('__s','1');
 localStorage.setItem('vaultet_user_profile_v1',JSON.stringify({nickname:'ฮัน'}));
 localStorage.setItem('finance_tracker_accounts_v1',JSON.stringify([{id:'a1',name:'กสิกร',initialBalance:2000}]));
 localStorage.setItem('finance_tracker_entries_v1','[]');});
await pg.goto('http://localhost:8205/index.html');await pg.waitForTimeout(1200);
const ok=(n,c)=>console.log((c?'PASS ':'FAIL ')+n);
const vis=s=>pg.isVisible(s);

// ---- แชท ----
await pg.click('.ux-bottom-item[data-page="chat"]'); await pg.waitForTimeout(500);
ok('empty chat: icon + message + 4 suggested questions', await vis('.v-chat-empty .v-chat-empty-ic') && (await pg.locator('.v-chat-sug').count())===4);
await pg.screenshot({path:shots+'r5-chat-empty.png'});
const callsBefore=aiCalls;
await pg.click('.v-chat-sug >> nth=0'); await pg.waitForTimeout(400);
ok('tapping a suggestion fills the input (does not send by itself)', (await pg.inputValue('#aiChatInput'))==='สรุปการเงินเดือนนี้ให้หน่อย' && aiCalls===callsBefore && (await pg.locator('.ai-chat-msg').count())===0);
ok('send button shows once there is text, in the app green', await vis('#aiChatSendBtn') && await pg.evaluate(()=>getComputedStyle(document.getElementById('aiChatSendBtn')).backgroundColor.replace(/\s/g,'')==='rgb(29,185,84)'));
await pg.fill('#aiChatInput',''); await pg.waitForTimeout(100);
await pg.evaluate(()=>{ saveAIChatHistory([{role:'user',text:'เดือนนี้ใช้เงินเยอะไปไหม'},{role:'model',text:'ยังไม่เยอะ **฿1,095**'}]); renderAiChatBubbles(); });
await pg.waitForTimeout(300);
ok('my message is a green bubble', await pg.evaluate(()=>getComputedStyle(document.querySelector('.ai-chat-msg.role-user .ai-chat-bubble')).backgroundColor.replace(/\s/g,'')==='rgb(29,185,84)'));
ok('AI message has the small sparkle mark', await pg.evaluate(()=>{const m=document.querySelector('.ai-chat-msg.role-model');const a=getComputedStyle(m,'::after');return a.content!=='none'&&parseFloat(a.width)>10;}));
ok('suggestions gone once there is a conversation', (await pg.locator('.v-chat-sug').count())===0);
await pg.screenshot({path:shots+'r5-chat.png'});
await pg.evaluate(()=>{ saveAIChatHistory([]); renderAiChatBubbles(); }); await pg.waitForTimeout(200);
ok('suggestions come back for a fresh chat', (await pg.locator('.v-chat-sug').count())===4);

// ---- ตั้งค่า ----
await pg.evaluate(()=>vaultetOpenSettings()); await pg.waitForTimeout(500);
ok('every settings row has an icon', await pg.evaluate(()=>{const r=[...document.querySelectorAll('#ux-more .v-group-box > .v-set-row')];return r.length>=9&&r.every(x=>x.querySelector('.v-set-ic svg'))}));
ok('profile card shows the nickname letter', (await pg.textContent('#ux-more .ux-user-context-avatar')).trim()==='ฮ');
ok('decimals is a switch (not a white checkbox)', await pg.evaluate(()=>{const c=document.getElementById('showDecimalsToggle');return c.classList.contains('v-switch')&&c.getAttribute('role')==='switch'&&getComputedStyle(c).appearance==='none'&&c.getBoundingClientRect().width>=44}));
await pg.click('#showDecimalsToggle'); await pg.waitForTimeout(150);
ok('switch turns decimals on (saved)', (await pg.evaluate(()=>localStorage.getItem('vaultet_show_decimals_v1')))==='1');
await pg.click('#showDecimalsToggle'); await pg.waitForTimeout(150);
ok('lock is a normal row, old card button hidden', await vis('#vSetLock') && !(await vis('#lockSettingsBtn')) && (await pg.textContent('#vSetLock')).includes('ยังไม่ได้ตั้ง'));
await pg.screenshot({path:shots+'r5-settings.png',fullPage:true});
// ตั้งล็อกผ่านแถวใหม่ แล้วสถานะในแถวเปลี่ยนทันที
await pg.click('#vSetLock'); await T.dlgOK(pg,{p:'123456',p2:'123456'});
await pg.waitForSelector('.v-dlg [name="q"]'); await T.dlgOK(pg,{q:'สัตว์เลี้ยง',a:'มะลิ'}); await T.dlgOK(pg); await pg.waitForTimeout(300);
ok('after turning the lock on, the row says เปิดอยู่ with a pill', (await pg.textContent('#vSetLock')).includes('เปิดอยู่') && await vis('#vSetLock .v-set-pill'));
await pg.click('#vSetLock'); await T.dlgChoose(pg,'ปิดล็อก'); await T.dlgOK(pg,{o:'123456'}); await T.dlgOK(pg); await pg.waitForTimeout(300);
ok('after turning it off, the row says ปิดอยู่', (await pg.textContent('#vSetLock')).includes('ปิดอยู่') && !(await vis('#vSetLock .v-set-pill')));

ok('no check marks on chat or settings', !/[✓✔]/.test(await pg.evaluate(()=>document.getElementById('ux-more').innerText+document.getElementById('ux-chat').innerText)));
ok('no native dialogs', native.n===0);
ok('no js errors', errs.length===0); if(errs.length) console.log('- '+errs.join(' | ').slice(0,300));
await b.close(); srv.close();
})();
