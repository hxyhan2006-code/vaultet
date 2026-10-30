const { chromium } = require('playwright');
const http=require('http'),fs=require('fs'),path=require('path');const root=require('path').resolve(__dirname,'..');
const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png'};
const srv=http.createServer((q,s)=>{let p=q.url.split('?')[0];if(p==='/')p='/index.html';const f=path.join(root,p);fs.readFile(f,(e,d)=>{if(e){s.writeHead(404);s.end();return}s.writeHead(200,{'content-type':types[path.extname(f)]||'text/plain'});s.end(d)})});
const T=require('./tlib.js');
const shots=require('os').tmpdir()+'/vaultet-test-shots/'; require('fs').mkdirSync(shots,{recursive:true});
const ok=(n,c)=>console.log((c?'PASS ':'FAIL ')+n);
(async()=>{await new Promise(r=>srv.listen(8147,r));
const b=await chromium.launch({...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{}),args:['--no-sandbox']});
async function newPage(seed){
  const ctx=await b.newContext({viewport:{width:380,height:820},deviceScaleFactor:2,serviceWorkers:'block'});
  const pg=await ctx.newPage(); pg.__errs=[]; pg.__native=T.watchNative(pg);
  pg.on('pageerror',e=>pg.__errs.push(e.message));pg.on('console',m=>{if(m.type()==='error'&&!/ERR_FAILED/.test(m.text()))pg.__errs.push(m.text())});
  await pg.route(/accounts\.google\.com|fonts\./,r=>r.abort());
  await pg.addInitScript(seed);
  await pg.goto('http://localhost:8147/index.html');await pg.waitForTimeout(1200);
  return pg;
}
const get=(pg,k)=>pg.evaluate(k=>JSON.parse(localStorage.getItem(k)||'null'),k);

// ================= A. single account mode =================
let pg=await newPage(()=>{if(localStorage.getItem('__s'))return;localStorage.setItem('__s','1');const d=new Date().toISOString().slice(0,10);
 localStorage.setItem('finance_tracker_accounts_v1',JSON.stringify([{id:'a1',name:'บัญชีหลัก',initialBalance:5000}]));
 localStorage.setItem('finance_tracker_entries_v1',JSON.stringify([{id:'e1',type:'expense',category:'กิน',amount:60,note:'ข้าว',date:d,accountId:'a1'}]));});
ok('single-account class is on', await pg.evaluate(()=>document.body.classList.contains('v-single-account')));
ok('single account: recent rows do not show the account name', await pg.evaluate(()=>{const t=document.getElementById('vRecentList').innerText;return t.includes('ข้าว') && !t.includes('บัญชีหลัก');}));
ok('"ไม่ระบุบัญชี" is never shown as a row label', await pg.evaluate(()=>accountNameForRow('unassigned')==='' && accountNameForRow(undefined)===''));
await pg.evaluate(()=>openForm(null)); await pg.waitForTimeout(250);
ok('add sheet: account picker hidden', !(await pg.isVisible('#entryAccountWrap')));
ok('add sheet: transfer type hidden, other 3 visible', !(await pg.isVisible('.type-btn[data-type="transfer"]')) && (await pg.locator('.type-btn:visible').count())===3);
ok('add sheet: date still visible', await pg.isVisible('#vDateBtn'));
await pg.screenshot({path:shots+'single-form.png'});
await pg.fill('#amount','99'); await pg.click('.v-chip[data-cat="คาเฟ่"]'); await pg.click('#submitBtn'); await pg.waitForTimeout(300);
let es=await get(pg,'finance_tracker_entries_v1'); ok('entry saved to the only account', es.some(e=>e.amount===99&&e.accountId==='a1'));
await pg.evaluate(()=>closeForm());
await pg.evaluate(()=>vaultetGo('plan')); await pg.waitForTimeout(150);
await pg.click('#vAssets summary'); await pg.waitForTimeout(150);
ok('assets detail: per-account list hidden', !(await pg.isVisible('#accountsList')));
ok('single account: money page calls it "เงินพร้อมใช้" (no "บัญชี" / "ในบัญชี" / account name)', await pg.evaluate(()=>{const t=document.querySelector('#vMoneyAccounts .v-msec-title').textContent, row=document.querySelector('#vMoneyAccounts .v-mrow .v-mrow-t').textContent, leg=document.getElementById('vMoneyLegend').textContent, lab=document.getElementById('inAccLabel').textContent;return t==='เงินพร้อมใช้'&&row==='เงินพร้อมใช้'&&!leg.includes('ในบัญชี')&&lab==='เงินพร้อมใช้'&&!document.getElementById('vMoneyAccounts').textContent.includes('บัญชีหลัก');}));
await pg.evaluate(()=>vaultetGo('analysis')); await pg.waitForTimeout(250);
ok('analysis: account filters hidden', !(await pg.isVisible('#analysisAccountFilter')) && !(await pg.isVisible('#compareAccountFilter')) && !(await pg.isVisible('#vRepAccBtn')));
// add a 2nd account -> everything comes back
await pg.evaluate(()=>vaultetGo('plan')); await pg.waitForTimeout(150); await pg.click('#vMoneyAccounts [data-act="accounts"]'); await pg.waitForTimeout(250);
await pg.click('#addAccountBtn'); await T.dlgOK(pg,{name:'ออมทรัพย์',bal:'1000'}); await pg.waitForTimeout(300);
ok('2 accounts: recent rows show the account name again', await pg.evaluate(()=>document.getElementById('vRecentList').innerText.includes('บัญชีหลัก')));
ok('2 accounts: money page goes back to "บัญชี" with real account names', await pg.evaluate(()=>{const t=document.querySelector('#vMoneyAccounts .v-msec-title').textContent, rows=[...document.querySelectorAll('#vMoneyAccounts .v-mrow .v-mrow-t')].map(x=>x.textContent);return t==='บัญชี'&&rows.includes('บัญชีหลัก')&&rows.includes('ออมทรัพย์');}));
ok('2 accounts: class removed', !(await pg.evaluate(()=>document.body.classList.contains('v-single-account'))));
await pg.evaluate(()=>document.querySelectorAll('.open').forEach(e=>e.classList.remove('open')));
await pg.evaluate(()=>openForm(null)); await pg.waitForTimeout(250);
ok('2 accounts: account picker + transfer type are back', (await pg.isVisible('#entryAccountWrap')) && (await pg.isVisible('.type-btn[data-type="transfer"]')));
await pg.evaluate(()=>closeForm());
await pg.evaluate(()=>vaultetGo('analysis')); await pg.waitForTimeout(250);
ok('2 accounts: report account filter is back', await pg.isVisible('#vRepAccBtn'));
// remove the 2nd account again
await pg.evaluate(()=>vaultetGo('plan')); await pg.waitForTimeout(150); await pg.click('#vMoneyAccounts [data-act="accounts"]'); await pg.waitForTimeout(250);
await pg.click('.delete-acc-btn >> nth=1'); await T.dlgOK(pg); await pg.waitForTimeout(300);
ok('back to one account -> single mode again', await pg.evaluate(()=>document.body.classList.contains('v-single-account')));

// ================= B/C. removed things + new homes =================
ok('Brain card is gone', (await pg.locator('#financialBrainCard').count())===0 && (await pg.locator('#brainScore').count())===0);
ok('forecast sheet and button are gone', (await pg.locator('#forecastOverlay').count())===0 && (await pg.locator('#openForecastBtn').count())===0);
await pg.evaluate(()=>document.querySelectorAll('.open').forEach(e=>e.classList.remove('open')));
await pg.evaluate(()=>vaultetGo('plan')); await pg.waitForTimeout(200);
ok('เงินของฉัน sections: accounts, invest, emergency+goals, debts/loans', ['#vMoneyAccounts','#vMoneyInvest','#vMoneyKeep','#vMoneyOwed'].every(Boolean) && await pg.isVisible('#vMoneyKeep #emergencyDashboardCard'));
await pg.evaluate(()=>{vaultetGo('home');document.getElementById('vEmergencyBtn').click();}); await pg.waitForTimeout(900);
ok('emergency shortcut opens the Plan tab', await pg.isVisible('#ux-plan'));
ok('...and scrolls the emergency card into view', await pg.evaluate(()=>{const r=document.getElementById('emergencyDashboardCard').getBoundingClientRect();return r.top>=0&&r.top<window.innerHeight*0.6}));
ok('goals card lives in the Plan tab', await pg.evaluate(()=>!!document.querySelector('#ux-plan #goalsCard')) && await pg.isVisible('#goalsCard'));
await pg.evaluate(()=>vaultetGo('analysis')); await pg.waitForTimeout(250);
ok('trend chart lives in the Analysis tab (6 bars, ds51)', (await pg.locator('#ux-analysis #vRepBars .v-rbar').count())===6 && await pg.isVisible('#vRepBars'));
await pg.screenshot({path:shots+'analysis-trend.png'});
ok('no native dialogs, no js errors (A-C): '+(pg.__errs.join(' ')||'none'), pg.__native.n===0 && pg.__errs.length===0);
await pg.context().close();

// ================= D. goals merge + migration =================
pg=await newPage(()=>{if(localStorage.getItem('__s'))return;localStorage.setItem('__s','1');
 localStorage.setItem('finance_tracker_accounts_v1',JSON.stringify([{id:'a1',name:'บัญชีหลัก',initialBalance:5000}]));
 localStorage.setItem('vaultet_user_profile_v1',JSON.stringify({nickname:'ฮาน',statuses:['student'],financialGoals:[{id:'p1',name:'ซื้อรถ',targetAmount:200000,deadline:null},{id:'p2',name:'โน้ตบุ๊ก',targetAmount:30000,deadline:'2027-01-01'}],permissions:{financial:true}}));
 localStorage.setItem('finance_tracker_ai_profile_v1',JSON.stringify({nickname:'ฮาน',financialGoals:[{id:'p1',name:'ซื้อรถ',targetAmount:200000,deadline:null},{id:'p3',name:'ท่องเที่ยว',targetAmount:15000,deadline:null}],notes:''}));
 localStorage.setItem('vaultet_goals_v1',JSON.stringify([{id:'g1',name:'โน้ตบุ๊ก',target:30000,saved:7500,deadline:'2027-06-01'}]));});
let plan=await get(pg,'vaultet_goals_v1');
ok('migration: plan has 3 goals, no duplicates ('+plan.map(g=>g.name).join(', ')+')', plan.length===3 && new Set(plan.map(g=>g.name)).size===3);
const nb=plan.find(g=>g.name==='โน้ตบุ๊ก'); ok('migration: existing plan goal kept untouched (saved 7,500 / deadline 2027-06-01)', nb.saved===7500&&nb.deadline==='2027-06-01'&&nb.target===30000);
const car=plan.find(g=>g.name==='ซื้อรถ'); ok('migration: profile goal moved (target 200,000, saved 0)', car&&car.target===200000&&car.saved===0);
ok('migration: goal that only existed in the legacy AI profile was moved too', plan.some(g=>g.name==='ท่องเที่ยว'&&g.target===15000));
const prof=await get(pg,'vaultet_user_profile_v1'), leg=await get(pg,'finance_tracker_ai_profile_v1');
ok('migration: old goal lists emptied, other profile data kept', prof.financialGoals.length===0 && prof.nickname==='ฮาน' && leg.financialGoals.length===0);
ok('migration: done flag set', (await pg.evaluate(()=>localStorage.getItem('vaultet_goals_merged_v1')))==='1');
await pg.evaluate(()=>vaultetGo('plan')); await pg.waitForTimeout(300);
ok('plan tab shows all 3 goals', (await pg.locator('#goalsCard .v-brow').count())===3);
await pg.screenshot({path:shots+'goals-card.png'});
const ai=await pg.evaluate(()=>({prof:loadAIProfile().financialGoals,snap:buildFinancialSnapshot().goals}));
ok('AI profile goals now come from the plan (with saved amounts)', ai.prof.length===3 && ai.prof.find(g=>g.name==='โน้ตบุ๊ก').saved===7500);
ok('AI snapshot goals match (remaining 22,500 for the laptop)', ai.snap.length===3 && ai.snap.find(g=>g.name==='โน้ตบุ๊ก').remaining===22500);
// profile editor
await pg.evaluate(()=>vaultetOpenProfile()); await pg.waitForTimeout(300);
ok('profile editor: no goal form any more, has a link to the plan tab', (await pg.locator('#vpGoalName').count())===0 && (await pg.isVisible('#vpGoalsLink')));
await pg.click('#vpGoalsLink'); await pg.waitForTimeout(700);
ok('profile link opens the plan tab at the goals', await pg.isVisible('#ux-plan') && !(await pg.isVisible('#vaultetProfileOverlay')));
// saving the profile must not bring goals back
await pg.evaluate(()=>vaultetOpenProfile()); await pg.waitForTimeout(250); await pg.click('#vpSave'); await pg.waitForTimeout(300);
const prof2=await get(pg,'vaultet_user_profile_v1'); ok('saving the profile keeps its goal list empty', prof2.financialGoals.length===0);
plan=await get(pg,'vaultet_goals_v1'); ok('plan goals unchanged after saving the profile', plan.length===3);
// settings profile card shows a plan goal
await pg.evaluate(()=>vaultetGo('more')); await pg.waitForTimeout(300);
ok('settings profile card shows a goal line from the plan', (await pg.textContent('#ux-more .ux-user-context')).includes('เป้าหมาย:'));
// reload: idempotent
await pg.reload(); await pg.waitForTimeout(1000);
plan=await get(pg,'vaultet_goals_v1'); ok('reload does not duplicate goals', plan.length===3);
// adding/deleting still works from the plan card
await pg.evaluate(()=>vaultetGo('plan')); await pg.waitForTimeout(250);
await pg.click('#goalAdd'); await T.dlgOK(pg,{name:'ทุนเรียนต่อ',target:'50000'}); await pg.waitForTimeout(250);
plan=await get(pg,'vaultet_goals_v1'); ok('can still add a goal', plan.length===4);
ok('no native dialogs, no js errors (D): '+(pg.__errs.join(' ')||'none'), pg.__native.n===0 && pg.__errs.length===0);
await b.close();srv.close()})();
