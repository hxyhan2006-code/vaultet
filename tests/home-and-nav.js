const { chromium } = require('playwright');
const http=require('http'),fs=require('fs'),path=require('path');const root=require('path').resolve(__dirname,'..');
const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png'};
const srv=http.createServer((q,s)=>{let p=q.url.split('?')[0];if(p==='/')p='/index.html';const f=path.join(root,p);fs.readFile(f,(e,d)=>{if(e){s.writeHead(404);s.end();return}s.writeHead(200,{'content-type':types[path.extname(f)]||'text/plain'});s.end(d)})});
const shots=require('os').tmpdir()+'/vaultet-test-shots/'; require('fs').mkdirSync(shots,{recursive:true});
async function gotoPage(pg,p){ if(p==='more'){ if(await pg.isVisible('#uxAvatarBtn')) await pg.click('#uxAvatarBtn'); else await pg.evaluate(()=>vaultetGo('more')); } else { await pg.click('.ux-bottom-item[data-page="'+p+'"]'); } }
(async()=>{await new Promise(r=>srv.listen(8125,r));
const b=await chromium.launch({...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{}),args:['--no-sandbox']});
const ctx=await b.newContext({viewport:{width:380,height:820},deviceScaleFactor:2,serviceWorkers:'block'});
const pg=await ctx.newPage(); const errs=[];
pg.on('pageerror',e=>errs.push('PAGEERR '+e.message));
pg.on('console',m=>{if(m.type()==='error'&&!/ERR_FAILED/.test(m.text()))errs.push('CONSOLE '+m.text())});
const T=require('./tlib.js');const native=T.watchNative(pg);
await pg.route(/accounts\.google\.com|fonts\./,r=>r.abort());
await pg.addInitScript(()=>{ if(localStorage.getItem('__seeded'))return; localStorage.setItem('__seeded','1');
 const d=n=>{const x=new Date();x.setDate(x.getDate()-n);return x.toISOString().slice(0,10)};
 localStorage.setItem('finance_tracker_accounts_v1',JSON.stringify([{id:'a1',name:'กสิกร',openingBalance:2000},{id:'a2',name:'เงินสด',openingBalance:500}]));
 const E=(i,t,c,a,n,ac,dd)=>({id:'e'+i,type:t,category:c,amount:a,note:n,date:d(dd||0),accountId:ac});
 localStorage.setItem('finance_tracker_entries_v1',JSON.stringify([E(1,'income','กยศ.',6000,'','a1',0),E(2,'expense','กิน',60,'ข้าวมันไก่','a2',0),E(3,'expense','คาเฟ่',145,'กาแฟ','a1',1),E(4,'saving','เงินออม',1000,'','a1',1),E(5,'expense','ค่าเดินทาง',80,'','a2',2)]));
});
await pg.goto('http://localhost:8125/index.html');await pg.waitForTimeout(1200);
const ok=(n,c)=>console.log((c?'PASS ':'FAIL ')+n);
// eye
await pg.click('#vEyeBtn'); ok('eye hides numbers', await pg.evaluate(()=>document.body.classList.contains('v-hide-numbers')));
await pg.reload(); await pg.waitForTimeout(800); ok('eye state persists', await pg.evaluate(()=>document.body.classList.contains('v-hide-numbers')));
await pg.click('#vEyeBtn'); ok('eye shows again', await pg.evaluate(()=>!document.body.classList.contains('v-hide-numbers')));
// more (ทางลัด/สินทรัพย์รวมย้ายไปแท็บ "เงินของฉัน" ตั้งแต่ ds47)
await pg.click('.ux-bottom-item[data-page="plan"]'); await pg.waitForTimeout(300);
ok('old shortcut grid hidden, money rows shown (ds52)', !(await pg.isVisible('#vShortcuts')) && await pg.isVisible('#vMoneyHero') && await pg.isVisible('#vMoneyAccounts'));
// assets
await pg.click('#vAssets summary'); ok('assets opens', await pg.evaluate(()=>document.getElementById('vAssets').open));
await pg.screenshot({path:shots+'assets-open.png'});
await pg.reload(); await pg.waitForTimeout(800); await pg.click('.ux-bottom-item[data-page="plan"]'); await pg.waitForTimeout(300); ok('assets state persists', await pg.evaluate(()=>document.getElementById('vAssets').open));
await pg.click('#vAssets summary');
// แถวในหน้าเงินของฉันเปิดหน้าต่างเดิม (แทนทางลัด)
for (const [sel,name,ov] of [['#vMoneyPfRow','portfolio',null],['#vMoneyDebtTile','debts','debtsOverlay'],['#vMoneyAccounts [data-act="accounts"]','accounts','accountsOverlay'],['#vMoneyReservedRow','reserved','reservedOverlay'],['#vMoneyLoanTile','loans','loansOverlay']]) {
  await pg.click(sel); await pg.waitForTimeout(400);
  ok('money row '+name+' opens its sheet', await pg.evaluate(ov=>ov?document.getElementById(ov)?.classList.contains('open'):!!document.querySelector('.open'),ov));
  await pg.screenshot({path:shots+'money-'+name+'.png'});
  await pg.evaluate(()=>{document.querySelectorAll('.open').forEach(e=>e.classList.remove('open'));}); await pg.waitForTimeout(150);
}
// tx row tap -> edit form
await pg.click('.ux-bottom-item[data-page="home"]'); await pg.waitForTimeout(300);
await pg.click('#vRecentList .v-tx >> nth=0'); await pg.waitForTimeout(300);
ok('row tap opens edit form', await pg.evaluate(()=>document.getElementById('overlay').classList.contains('open')));
await pg.screenshot({path:shots+'edit.png'});
await pg.click('#closeBtn');
// delete (รายการเต็มอยู่หน้า "รายการทั้งหมด" เปิดจาก "ดูทั้งหมด")
await pg.click('.ux-bottom-item[data-page="home"]'); await pg.waitForTimeout(300);
await pg.click('#vSeeAllBtn'); await pg.waitForTimeout(300);
const before=await pg.locator('#listContainer .v-tx').count();
await pg.click('#listContainer .v-tx >> nth=0'); await pg.waitForTimeout(300);
ok('delete link visible when editing', await pg.isVisible('#vDeleteEntryBtn'));
await pg.click('#vDeleteEntryBtn'); await T.dlgOK(pg); await pg.waitForTimeout(400);
ok('delete removes row', (await pg.locator('#listContainer .v-tx').count())===before-1);
await pg.evaluate(()=>openForm(null)); ok('delete link hidden for new entry', !(await pg.isVisible('#vDeleteEntryBtn'))); await pg.evaluate(()=>closeForm());
ok('full list lives on its own page (search box in #ux-list)', (await pg.locator('#ux-list #searchInput').count())===1 && (await pg.locator('#ux-home #searchInput').count())===0);
await pg.click('.ux-bottom-item[data-page="analysis"]'); await pg.waitForTimeout(300);
ok('analysis tab shows the new report (custom compare folded at the bottom)', (await pg.isVisible('#vReport'))&&(await pg.isVisible('#vRepMore'))&&!(await pg.isVisible('#compareSection')));
ok('analysis tab has no transaction list', (await pg.locator('#ux-analysis #listContainer').count())===0);
const top=await pg.evaluate(()=>{const tb=document.querySelector('.ux-topbar').getBoundingClientRect().bottom;const first=document.querySelector('#ux-analysis > :not(.ux-view-title):not(.ux-view-sub)').getBoundingClientRect().top;return first-tb});
ok('analysis content starts >=12px below the top bar (gap='+Math.round(top)+')', top>=12);
await pg.screenshot({path:shots+'analysis-tab.png'});
await pg.click('.ux-bottom-item[data-page="home"]');
// nav pages
for (const p of ['analysis','plan','chat','more','home']) { await gotoPage(pg,p); await pg.waitForTimeout(400); await pg.screenshot({path:shots+'page-'+p+'.png'}); }
ok('version label', await pg.evaluate(()=>!!document.querySelector('.v-version')));
ok('no native browser dialogs ('+native.msgs.join(' | ')+')', native.n===0);
console.log(errs.join('\n')||'no js errors');
await b.close();srv.close()})();
