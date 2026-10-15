const { chromium } = require('playwright');
const http=require('http'),fs=require('fs'),path=require('path');const root=require('path').resolve(__dirname,'..');
const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png'};
const srv=http.createServer((q,s)=>{let p=q.url.split('?')[0];if(p==='/')p='/index.html';const f=path.join(root,p);fs.readFile(f,(e,d)=>{if(e){s.writeHead(404);s.end();return}s.writeHead(200,{'content-type':types[path.extname(f)]||'text/plain'});s.end(d)})});
const shots=require('os').tmpdir()+'/vaultet-test-shots/'; require('fs').mkdirSync(shots,{recursive:true});
async function gotoPage(pg,p){ if(p==='more'){ if(await pg.isVisible('#uxAvatarBtn')) await pg.click('#uxAvatarBtn'); else await pg.evaluate(()=>vaultetGo('more')); } else { await pg.click('.ux-bottom-item[data-page="'+p+'"]'); } }
(async()=>{await new Promise(r=>srv.listen(8136,r));
const b=await chromium.launch({...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{}),args:['--no-sandbox']});
const ctx=await b.newContext({viewport:{width:380,height:820},deviceScaleFactor:2,serviceWorkers:'block',acceptDownloads:true});
const pg=await ctx.newPage();
const errs=[];pg.on('pageerror',e=>errs.push(e.message));pg.on('console',m=>{if(m.type()==='error'&&!/ERR_FAILED/.test(m.text()))errs.push(m.text())});
const T=require('./tlib.js');const native=T.watchNative(pg);
await pg.route(/accounts\.google\.com|fonts\./,r=>r.abort());
await pg.addInitScript(()=>{if(localStorage.getItem('__s'))return;localStorage.setItem('__s','1');
 const d=new Date().toISOString().slice(0,10);
 localStorage.setItem('finance_tracker_accounts_v1',JSON.stringify([{id:'a1',name:'กสิกร',openingBalance:2000}]));
 localStorage.setItem('finance_tracker_entries_v1',JSON.stringify([{id:'e1',type:'expense',category:'กิน',amount:60,note:'ข้าว',date:d,accountId:'a1'}]));});
await pg.goto('http://localhost:8136/index.html');await pg.waitForTimeout(1200);
const ok=(n,c)=>console.log((c?'PASS ':'FAIL ')+n);
const closeAll=()=>pg.evaluate(()=>document.querySelectorAll('.overlay.open,.open').forEach(e=>e.classList.remove('open')));
await gotoPage(pg,'more');await pg.waitForTimeout(400);
ok('settings has 4 groups', (await pg.locator('#ux-more .v-group').count())===4);
ok('old backup buttons hidden', !(await pg.isVisible('#exportBtn')) && !(await pg.isVisible('#importBtn')));
ok('old "ตั้งค่าและข้อมูล" card hidden', !(await pg.isVisible('#settingsBtn')));
// notifications row
await pg.click('#vSetNotif'); await pg.waitForTimeout(300);
ok('notification row opens notification center', await pg.evaluate(()=>document.getElementById('notificationOverlay').classList.contains('open')));
await closeAll();
// export row -> file download
const dl=pg.waitForEvent('download',{timeout:5000}).catch(()=>null);
await pg.click('#vSetExport'); const d=await dl;
ok('export row triggers a file download', !!d);
if(d){const f=await d.path(); const j=JSON.parse(fs.readFileSync(f,'utf8')); ok('backup file has entries', Array.isArray(j.entries)&&j.entries.length>=1); ok('backup file has NO api keys', !JSON.stringify(j).toLowerCase().includes('apikey'));}
await pg.waitForTimeout(900);
ok('export row subtitle now says file backed up today', (await pg.textContent('#vSetExport')).includes('วันนี้'));
// import row opens file chooser
const fc=pg.waitForEvent('filechooser',{timeout:3000}).catch(()=>null);
await pg.click('#vSetImport'); ok('import row opens the file chooser', !!(await fc));
// drive row opens settings overlay
await pg.click('#vSetDrive'); await pg.waitForTimeout(400);
ok('Drive row opens settings sheet showing Drive status', await pg.isVisible('#gdriveConnStatus'));
await pg.screenshot({path:shots+'drive-sheet.png'});
await closeAll();
// decimals switch moved & works
const dec=pg.locator('#ux-more #showDecimalsToggle'); ok('decimals switch is on the settings page', (await dec.count())===1);
await dec.check(); await pg.waitForTimeout(200);
await pg.click('.ux-bottom-item[data-page="home"]'); await pg.waitForTimeout(300);
ok('decimals switch is saved and changes fmt()', (await pg.evaluate(()=>localStorage.getItem('vaultet_show_decimals_v1')))==='1' && (await pg.evaluate(()=>fmt(1.5)))==='1.5');
// lock card still there
await gotoPage(pg,'more');
ok('lock button still present', await pg.isVisible('#lockSettingsBtn'));
// banners: only one at a time, only on home
await pg.evaluate(()=>{document.getElementById('backupBanner').classList.add('show');document.getElementById('debtBumpBanner').classList.add('show');document.getElementById('driveDirtyBanner').classList.add('show')});
await pg.click('.ux-bottom-item[data-page="home"]'); await pg.waitForTimeout(200);
const vis=await pg.evaluate(()=>['debtBumpBanner','backupBanner','driveDirtyBanner'].filter(i=>getComputedStyle(document.getElementById(i)).display!=='none'));
ok('only the debt banner shows when all three are on (got '+vis.join(',')+')', vis.length===1&&vis[0]==='debtBumpBanner');
await pg.evaluate(()=>document.getElementById('debtBumpBanner').classList.remove('show'));
const vis2=await pg.evaluate(()=>['debtBumpBanner','backupBanner','driveDirtyBanner'].filter(i=>getComputedStyle(document.getElementById(i)).display!=='none'));
ok('then only the backup banner (got '+vis2.join(',')+')', vis2.length===1&&vis2[0]==='backupBanner');
await pg.evaluate(()=>document.getElementById('backupBanner').classList.remove('show'));
const vis3=await pg.evaluate(()=>['debtBumpBanner','backupBanner','driveDirtyBanner'].filter(i=>getComputedStyle(document.getElementById(i)).display!=='none'));
ok('then only the Drive banner (got '+vis3.join(',')+')', vis3.length===1&&vis3[0]==='driveDirtyBanner');
await pg.click('.ux-bottom-item[data-page="plan"]'); await pg.waitForTimeout(200);
const vis4=await pg.evaluate(()=>['debtBumpBanner','backupBanner','driveDirtyBanner'].filter(i=>getComputedStyle(document.getElementById(i)).display!=='none'));
ok('banners hidden on other tabs', vis4.length===0);
ok('no native browser dialogs ('+native.msgs.join(' | ')+')', native.n===0);
console.log(errs.join('\n')||'no js errors');
await b.close();srv.close()})();
