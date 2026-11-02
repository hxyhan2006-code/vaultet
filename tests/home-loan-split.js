const { chromium } = require('playwright');
const http=require('http'),fs=require('fs'),path=require('path');const root=path.resolve(__dirname,'..');
const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png'};
const srv=http.createServer((q,s)=>{let p=q.url.split('?')[0];if(p==='/')p='/index.html';const f=path.join(root,p);fs.readFile(f,(e,d)=>{if(e){s.writeHead(404);s.end();return}s.writeHead(200,{'content-type':types[path.extname(f)]||'text/plain'});s.end(d)})});
const ok=(n,c)=>console.log((c?'PASS ':'FAIL ')+n);
(async()=>{await new Promise(r=>srv.listen(8187,r));
const b=await chromium.launch({...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{}),args:['--no-sandbox']});
const ctx=await b.newContext({viewport:{width:380,height:820},serviceWorkers:'block'});
const pg=await ctx.newPage();
const errs=[];pg.on('pageerror',e=>errs.push(e.message));
await pg.route(/accounts\.google\.com|fonts\./,r=>r.abort());
await pg.addInitScript(()=>{if(localStorage.getItem('__s'))return;localStorage.setItem('__s','1');const d=new Date().toISOString().slice(0,10);
 localStorage.setItem('finance_tracker_accounts_v1',JSON.stringify([{id:'a1',name:'หลัก',initialBalance:10000}]));
 localStorage.setItem('finance_tracker_entries_v1',JSON.stringify([
  {id:'e1',type:'income',category:'เงินแม่',amount:3000,note:'',date:d,accountId:'a1'},
  {id:'e2',type:'income',category:'เงินคืนจากการยืม',amount:500,note:'',date:d,accountId:'a1',source:'loan_repayment',loanId:'l1',repaymentId:'r1'},
  {id:'e3',type:'expense',category:'กิน',amount:100,note:'',date:d,accountId:'a1'}]));
 localStorage.setItem('finance_tracker_loans_v1',JSON.stringify([{id:'l1',person:'แม่',amount:2000,date:d,accountId:'a1',repayments:[{id:'r1',amount:500,date:d,accountId:'a1',financialEntryId:'e2'}]}]));});
await pg.goto('http://localhost:8187/index.html');await pg.waitForTimeout(1200);
const txt=id=>pg.textContent('#'+id);
ok('home "เข้า" excludes loan repayment (3,000 not 3,500)', (await txt('pillIncome')).trim()==='฿3,000');
const sub=await txt('carryNum');
ok('sub line shows lent-out and repaid-back', /ให้ยืมไป ฿2,000/.test(sub) && /รับคืนจากการยืม ฿500/.test(sub));
await pg.evaluate(()=>{ if(window.vaultetGo) vaultetGo('list'); });
await pg.waitForTimeout(500);
const tags=await pg.$$eval('#listContainer .v-tx-tag',els=>els.map(e=>e.textContent));
ok('repayment row has tag in list page (only that row)', tags.length===1 && /ไม่นับเป็นรายรับ/.test(tags[0]));
ok('no page errors', errs.length===0);
await b.close();srv.close();})();
