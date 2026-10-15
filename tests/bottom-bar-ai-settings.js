const { chromium } = require('playwright');
const http=require('http'),fs=require('fs'),path=require('path');const root=require('path').resolve(__dirname,'..');
const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png'};
const srv=http.createServer((q,s)=>{let p=q.url.split('?')[0];if(p==='/')p='/index.html';const f=path.join(root,p);fs.readFile(f,(e,d)=>{if(e){s.writeHead(404);s.end();return}s.writeHead(200,{'content-type':types[path.extname(f)]||'text/plain'});s.end(d)})});
const shots=require('os').tmpdir()+'/vaultet-test-shots/'; require('fs').mkdirSync(shots,{recursive:true});
(async()=>{await new Promise(r=>srv.listen(8137,r));
const b=await chromium.launch({...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{}),args:['--no-sandbox']});
const pg=await (await b.newContext({viewport:{width:380,height:820},deviceScaleFactor:2,serviceWorkers:'block'})).newPage();
const errs=[];pg.on('pageerror',e=>errs.push(e.message));pg.on('console',m=>{if(m.type()==='error'&&!/ERR_FAILED/.test(m.text()))errs.push(m.text())});
const T=require('./tlib.js');const native=T.watchNative(pg);
await pg.route(/accounts\.google\.com|fonts\./,r=>r.abort());
await pg.addInitScript(()=>{if(localStorage.getItem('__s'))return;localStorage.setItem('__s','1');
 const d=new Date().toISOString().slice(0,10);
 localStorage.setItem('finance_tracker_accounts_v1',JSON.stringify([{id:'a1',name:'กสิกร',openingBalance:2000}]));
 localStorage.setItem('finance_tracker_entries_v1',JSON.stringify([{id:'e1',type:'expense',category:'กิน',amount:60,note:'ข้าว',date:d,accountId:'a1'}]));});
await pg.goto('http://localhost:8137/index.html');await pg.waitForTimeout(1200);
const ok=(n,c)=>console.log((c?'PASS ':'FAIL ')+n);
const vis=sel=>pg.isVisible(sel);
const closeAll=()=>pg.evaluate(()=>document.querySelectorAll('.overlay.open,.open').forEach(e=>e.classList.remove('open')));
const tab=p=>pg.click('.ux-bottom-item[data-page="'+p+'"]');

// ---- nav ----
ok('4 tabs + centre add button', (await pg.locator('.ux-bottom-item').count())===4 && (await pg.locator('#uxAddBtn').count())===1);
ok('no settings tab in the bottom bar', (await pg.locator('.ux-bottom-item[data-page="more"]').count())===0);
ok('floating + and sparkle buttons are gone', !(await vis('#fabBtn')) && !(await vis('#aiFabBtn')));
for(const p of ['home','analysis','plan']){ await tab(p); await pg.waitForTimeout(150); await pg.click('#uxAddBtn'); await pg.waitForTimeout(250);
  ok('add button opens the sheet from '+p, await pg.evaluate(()=>document.getElementById('overlay').classList.contains('open'))); await pg.evaluate(()=>closeForm()); }
await tab('chat'); await pg.waitForTimeout(150);
ok('add button also visible on AI tab', await vis('#uxAddBtn'));
await pg.screenshot({path:shots+'new-nav-chat.png'});

// ---- avatar / settings page / back ----
await tab('plan'); await pg.waitForTimeout(200);
ok('no profile icon in the top bar', (await pg.locator('#uxAvatarBtn').count())===0 || !(await vis('#uxAvatarBtn')));
await tab('chat'); await pg.waitForTimeout(250);
ok('AI top bar has only menu + new chat', (await pg.locator('#uxChatTopActions button:visible').count())===2 && await vis('#uxChatMenuBtn') && await vis('#uxChatNewBtn'));
await pg.screenshot({path:shots+'new-ai-top.png'});
await pg.click('#uxChatMenuBtn'); await pg.waitForTimeout(250);
ok('AI menu opens with 6 rows + profile row', await vis('#aiMenu') && (await pg.locator('#aiMenu .v-aimenu-row').count())===6 && await vis('#aiMenuProfile'));
await pg.screenshot({path:shots+'new-ai-menu.png'});
await pg.click('#aiMenuProfile'); await pg.waitForTimeout(350);
ok('profile row opens settings page', await vis('#ux-more') && !(await vis('#aiMenu')));
ok('back button visible on settings', await vis('#uxBackBtn'));
ok('settings has 5 groups (incl. AI key)', (await pg.locator('#ux-more .v-group').count())===5);
ok('no leftover empty display card in the old sheet', !(await pg.evaluate(()=>[...document.querySelectorAll('#settingsOverlay .settings-card-title')].some(t=>/การแสดงตัวเลข/.test(t.textContent)))));
ok('export row says no file backup yet', (await pg.textContent('#vSetExport')).includes('ยังไม่เคยสำรองเป็นไฟล์'));
await pg.screenshot({path:shots+'new-settings.png'});
await pg.click('#uxBackBtn'); await pg.waitForTimeout(300);
ok('back returns to the AI tab', await vis('#ux-chat') && !(await vis('#ux-more')));

// ---- scoped settings sheets ----
const cardsShown=()=>pg.evaluate(()=>[...document.querySelectorAll('#settingsOverlay > .sheet-modal > .settings-card')].filter(c=>getComputedStyle(c).display!=='none').map(c=>c.querySelector('.settings-card-title').textContent.replace(/[^\wก-๙ ()]/g,'').trim()));
const title=()=>pg.textContent('#settingsOverlay .modal-title');
await pg.evaluate(()=>vaultetGo('more')); await pg.waitForTimeout(200);
await pg.click('#vSetDrive'); await pg.waitForTimeout(300);
let c=await cardsShown(); ok('Drive row shows only the Drive card ('+c.join(' | ')+')', c.length===1&&/Drive/.test(c[0])); ok('...titled Google Drive', (await title())==='Google Drive');
await closeAll(); await pg.waitForTimeout(200);
await pg.click('#vSetStock'); await pg.waitForTimeout(300);
c=await cardsShown(); ok('Stock row shows only the stock card ('+c.join(' | ')+')', c.length===1&&/Twelve|หุ้น/.test(c[0]));
await closeAll(); await pg.waitForTimeout(200);
await pg.evaluate(()=>vaultetGo('chat')); await pg.waitForTimeout(200);
const menuRow=async n=>{ await pg.click('#uxChatMenuBtn'); await pg.waitForTimeout(200); await pg.click('#aiMenu .v-aimenu-row >> nth='+n); await pg.waitForTimeout(350); };
await menuRow(2);
ok('"นิสัยและคำสั่ง" opens the AI instruction panel', await vis('#aiAdvisorInstruction'));
await menuRow(1);
c=await cardsShown(); ok('Memory row shows only the Memory card: '+c.join(' | '), c.length===1 && /Memory/.test(c[0]));
ok('...titled Memory ที่ AI จำได้', (await title())==='Memory ที่ AI จำได้');
await pg.screenshot({path:shots+'new-ai-sheet.png'});
await closeAll(); await pg.waitForTimeout(250);
await pg.evaluate(()=>vaultetGo('more')); await pg.waitForTimeout(200);
await pg.click('#vSetAiKey'); await pg.waitForTimeout(300);
c=await cardsShown(); ok('API key row shows only the Gemini card: '+c.join(' | '), c.length===1 && /Gemini/.test(c[0]));
ok('...titled Gemini API Key', (await title())==='Gemini API Key');
await closeAll(); await pg.waitForTimeout(250);
await pg.evaluate(()=>document.getElementById('settingsBtn').click()); await pg.waitForTimeout(250);
c=await cardsShown(); ok('after closing, opening the sheet directly shows Gemini + stock + Drive again', c.some(x=>/Gemini/.test(x))&&c.some(x=>/Twelve/.test(x))&&c.some(x=>/Drive/.test(x)));
await closeAll();

// ---- AI menu rows ----
await pg.evaluate(()=>vaultetGo('chat')); await pg.waitForTimeout(250);
await menuRow(0); ok('history row opens the chat list', await pg.evaluate(()=>document.getElementById('aiChatListOverlay').classList.contains('open'))); await closeAll(); await pg.waitForTimeout(200);
await menuRow(3); ok('"ข้อมูลของฉัน" opens the profile editor', await pg.evaluate(()=>document.getElementById('vaultetProfileOverlay').classList.contains('open'))); await closeAll(); await pg.waitForTimeout(200);
await menuRow(5); await pg.waitForSelector('.v-dlg'); ok('clear-chat row asks first', await pg.isVisible('.v-dlg')); await T.dlgCancel(pg); await pg.waitForTimeout(200);
const chatsBefore=await pg.evaluate(()=>{try{return JSON.stringify(Object.keys(localStorage).filter(k=>/chat/i.test(k)).map(k=>localStorage.getItem(k).length))}catch(e){return ''}});
await pg.click('#uxChatNewBtn'); await pg.waitForTimeout(300); ok('new-chat button works without leaving the chat tab', await vis('#ux-chat'));
await pg.click('#uxChatMenuBtn'); await pg.keyboard.press('Escape'); await pg.waitForTimeout(200); ok('Escape closes the AI menu', !(await vis('#aiMenu')));

// ---- AI entry link in the add sheet ----
await pg.evaluate(()=>vaultetGo('home')); await pg.evaluate(()=>openForm(null)); await pg.waitForTimeout(250);
ok('AI sentence link shown for a new entry', await vis('#vAiEntryBtn'));
await pg.click('#vAiEntryBtn'); await pg.waitForTimeout(350);
ok('without API key: opens AI settings instead of the sentence box', await pg.evaluate(()=>document.getElementById('settingsOverlay').classList.contains('open')) && !(await pg.evaluate(()=>document.getElementById('aiInputOverlay').classList.contains('open'))));
await closeAll();
await pg.evaluate(()=>{localStorage.setItem('finance_tracker_ai_apikeys_v1',JSON.stringify(['TESTKEY'])); });
await pg.evaluate(()=>openForm(null)); await pg.click('#vAiEntryBtn'); await pg.waitForTimeout(350);
ok('with an API key: opens the sentence box', await pg.evaluate(()=>document.getElementById('aiInputOverlay').classList.contains('open')));
await closeAll();
await pg.evaluate(()=>{const e=JSON.parse(localStorage.getItem('finance_tracker_entries_v1'))[0];openForm(e)}); await pg.waitForTimeout(250);
ok('AI sentence link hidden when editing', !(await vis('#vAiEntryBtn')));
await closeAll();

// ---- unread dot moved to AI tab ----
await pg.evaluate(()=>document.getElementById('aiFabBtn').classList.add('has-unread')); await pg.waitForTimeout(150);
ok('unread AI answer shows a dot on the AI tab', await pg.evaluate(()=>document.querySelector('.ux-bottom-item[data-page="chat"]').classList.contains('has-unread')));
ok('no native browser dialogs ('+native.msgs.join(' | ')+')', native.n===0);
console.log(errs.join('\n')||'no js errors');
await b.close();srv.close()})();
