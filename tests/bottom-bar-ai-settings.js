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
ok('avatar visible on plan', await vis('#uxAvatarBtn'));
await pg.click('#uxAvatarBtn'); await pg.waitForTimeout(300);
ok('avatar opens settings page', await vis('#ux-more'));
ok('back button visible on settings', await vis('#uxBackBtn'));
ok('avatar hidden on settings', !(await vis('#uxAvatarBtn')));
ok('settings has 4 groups', (await pg.locator('#ux-more .v-group').count())===4);
ok('no leftover empty display card in the old sheet', !(await pg.evaluate(()=>[...document.querySelectorAll('#settingsOverlay .settings-card-title')].some(t=>/การแสดงตัวเลข/.test(t.textContent)))));
ok('export row says no file backup yet', (await pg.textContent('#vSetExport')).includes('ยังไม่เคยสำรองเป็นไฟล์'));
await pg.screenshot({path:shots+'new-settings.png'});
await pg.click('#uxBackBtn'); await pg.waitForTimeout(300);
ok('back returns to the tab we came from (plan)', await vis('#ux-plan') && !(await vis('#ux-more')));
await tab('chat'); await pg.waitForTimeout(200);
ok('avatar hidden on AI tab', !(await vis('#uxAvatarBtn')));

// ---- scoped settings sheets ----
const cardsShown=()=>pg.evaluate(()=>[...document.querySelectorAll('#settingsOverlay > .sheet-modal > .settings-card')].filter(c=>getComputedStyle(c).display!=='none').map(c=>c.querySelector('.settings-card-title').textContent.replace(/[^\wก-๙ ()]/g,'').trim()));
const title=()=>pg.textContent('#settingsOverlay .modal-title');
await pg.click('#uxAvatarBtn').catch(()=>{}); await pg.evaluate(()=>vaultetGo('more')); await pg.waitForTimeout(200);
await pg.click('#vSetDrive'); await pg.waitForTimeout(300);
let c=await cardsShown(); ok('Drive row shows only the Drive card ('+c.join(' | ')+')', c.length===1&&/Drive/.test(c[0])); ok('...titled Google Drive', (await title())==='Google Drive');
await closeAll(); await pg.waitForTimeout(200);
await pg.click('#vSetStock'); await pg.waitForTimeout(300);
c=await cardsShown(); ok('Stock row shows only the stock card ('+c.join(' | ')+')', c.length===1&&/Twelve|หุ้น/.test(c[0]));
await closeAll(); await pg.waitForTimeout(200);
await pg.evaluate(()=>vaultetGo('chat')); await pg.waitForTimeout(200);
await pg.click('#aiAdvisorSettingsBtn'); await pg.waitForTimeout(250);
ok('AI panel has the AI-data button', await vis('#vAiDataBtn'));
await pg.click('#vAiDataBtn'); await pg.waitForTimeout(300);
c=await cardsShown(); ok('AI button shows AI cards only: '+c.join(' | '), c.some(x=>/Gemini/.test(x)) && c.some(x=>/Memory/.test(x)) && !c.some(x=>/Drive|Twelve/.test(x)));
ok('...titled ตั้งค่า AI', (await title())==='ตั้งค่า AI');
await pg.screenshot({path:shots+'new-ai-sheet.png'});
await closeAll(); await pg.waitForTimeout(250);
await pg.evaluate(()=>document.getElementById('settingsBtn').click()); await pg.waitForTimeout(250);
c=await cardsShown(); ok('after closing, opening the sheet directly shows Gemini + stock + Drive again', c.some(x=>/Gemini/.test(x))&&c.some(x=>/Twelve/.test(x))&&c.some(x=>/Drive/.test(x)));
await closeAll();

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
