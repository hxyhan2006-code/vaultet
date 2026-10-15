const { chromium } = require('playwright');
const http=require('http'),fs=require('fs'),path=require('path');const root=require('path').resolve(__dirname,'..');
const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png'};
const srv=http.createServer((q,s)=>{let p=q.url.split('?')[0];if(p==='/')p='/index.html';const f=path.join(root,p);fs.readFile(f,(e,d)=>{if(e){s.writeHead(404);s.end();return}s.writeHead(200,{'content-type':types[path.extname(f)]||'text/plain'});s.end(d)})});
const shots=require('os').tmpdir()+'/vaultet-test-shots/'; require('fs').mkdirSync(shots,{recursive:true});
async function gotoPage(pg,p){ if(p==='more'){ if(await pg.isVisible('#uxAvatarBtn')) await pg.click('#uxAvatarBtn'); else await pg.evaluate(()=>vaultetGo('more')); } else { await pg.click('.ux-bottom-item[data-page="'+p+'"]'); } }
(async()=>{await new Promise(r=>srv.listen(8133,r));
const b=await chromium.launch({...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{}),args:['--no-sandbox']});
const pg=await (await b.newContext({viewport:{width:380,height:820},deviceScaleFactor:2,serviceWorkers:'block'})).newPage();
await pg.route(/accounts\.google\.com|fonts\./,r=>r.abort());
await pg.addInitScript(()=>{localStorage.setItem('finance_tracker_last_backup_v1',String(Date.now()));
 const d=new Date().toISOString().slice(0,10);
 localStorage.setItem('finance_tracker_accounts_v1',JSON.stringify([{id:'a1',name:'กสิกร',openingBalance:2000}]));
 localStorage.setItem('finance_tracker_entries_v1',JSON.stringify([{id:'e1',type:'expense',category:'กิน',amount:60,note:'ข้าว',date:d,accountId:'a1'}]));});
await pg.goto('http://localhost:8133/index.html');await pg.waitForTimeout(900);
await pg.evaluate(()=>{const b=document.getElementById('backupBanner');if(b)b.style.display='none';document.getElementById('driveDirtyBanner')?.style&&(document.getElementById('driveDirtyBanner').style.display='none')});
for(const p of ['analysis','plan','more']){
  await gotoPage(pg,p);await pg.waitForTimeout(300);
  const gap=await pg.evaluate((p)=>{const tb=document.querySelector('.ux-topbar').getBoundingClientRect().bottom;const v=document.getElementById('ux-'+p);const kids=[...v.children].filter(k=>getComputedStyle(k).display!=='none'&&!k.classList.contains('ux-view-title')&&!k.classList.contains('ux-view-sub')&&k.getBoundingClientRect().height>0);return Math.round(kids[0].getBoundingClientRect().top-tb)},p);
  console.log((gap>=12?'PASS ':'FAIL ')+p+' first content is '+gap+'px below the top bar');
  await pg.screenshot({path:shots+'gap-'+p+'.png'});
}
await b.close();srv.close()})();
