// reports which .ux-view is visible after clicking each tab — catches "content leaking into other tabs"
const { chromium } = require('playwright');
const http=require('http'),fs=require('fs'),path=require('path');const root=require('path').resolve(__dirname,'..');
const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png'};
const srv=http.createServer((q,s)=>{let p=q.url.split('?')[0];if(p==='/')p='/index.html';const f=path.join(root,p);fs.readFile(f,(e,d)=>{if(e){s.writeHead(404);s.end();return}s.writeHead(200,{'content-type':types[path.extname(f)]||'text/plain'});s.end(d)})});
async function gotoPage(pg,p){ if(p==='more'){ if(await pg.isVisible('#uxAvatarBtn')) await pg.click('#uxAvatarBtn'); else await pg.evaluate(()=>vaultetGo('more')); } else { await pg.click('.ux-bottom-item[data-page="'+p+'"]'); } }
(async()=>{await new Promise(r=>srv.listen(8132,r));
const b=await chromium.launch({...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{}),args:['--no-sandbox']});
const pg=await (await b.newContext({viewport:{width:380,height:820},serviceWorkers:'block'})).newPage();
await pg.route(/accounts\.google\.com|fonts\./,r=>r.abort());
await pg.goto('http://localhost:8132/index.html');await pg.waitForTimeout(800);
let bad=0;
for(const p of ['home','analysis','plan','chat','more','home']){
  await gotoPage(pg,p);await pg.waitForTimeout(250);
  const vis=await pg.evaluate(()=>[...document.querySelectorAll('.ux-view')].filter(v=>getComputedStyle(v).display!=='none').map(v=>v.id));
  const okk=vis.length===1&&vis[0]==='ux-'+p; if(!okk)bad++;
  console.log((okk?'PASS ':'FAIL ')+p+' -> visible views: '+vis.join(','));
}
console.log(bad?'LEAK FOUND':'no leaks');
await b.close();srv.close()})();
