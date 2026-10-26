const { chromium } = require('playwright');
const http=require('http'),fs=require('fs'),path=require('path');const root=require('path').resolve(__dirname,'..');
const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png'};
const srv=http.createServer((q,s)=>{let p=q.url.split('?')[0];if(p==='/')p='/index.html';const f=path.join(root,p);fs.readFile(f,(e,d)=>{if(e){s.writeHead(404);s.end();return}s.writeHead(200,{'content-type':types[path.extname(f)]||'text/plain'});s.end(d)})});
const T=require('./tlib.js');
const shots=require('os').tmpdir()+'/vaultet-test-shots/'; require('fs').mkdirSync(shots,{recursive:true});
const ok=(n,c)=>console.log((c?'PASS ':'FAIL ')+n);
(async()=>{await new Promise(r=>srv.listen(8151,r));
const b=await chromium.launch({...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{}),args:['--no-sandbox']});
const ctx=await b.newContext({viewport:{width:380,height:820},deviceScaleFactor:2,serviceWorkers:'block'});
const pg=await ctx.newPage(); const native=T.watchNative(pg);
const errs=[];pg.on('pageerror',e=>errs.push(e.message));pg.on('console',m=>{if(m.type()==='error'&&!/ERR_FAILED/.test(m.text()))errs.push(m.text())});
await pg.route(/accounts\.google\.com|fonts\./,r=>r.abort());
await pg.addInitScript(()=>{if(localStorage.getItem('__s'))return;localStorage.setItem('__s','1');const now=new Date().toISOString();const d=new Date().toISOString().slice(0,10);
 localStorage.setItem('finance_tracker_accounts_v1',JSON.stringify([{id:'a1',name:'บัญชีหลัก',initialBalance:10000}]));
 localStorage.setItem('finance_tracker_entries_v1',JSON.stringify([{id:'e1',type:'expense',category:'กิน',amount:1635,note:'',date:d,accountId:'a1'}]));
 localStorage.setItem('finance_tracker_reserved_v1',JSON.stringify([{id:'r1',name:'ค่าหอ',amount:6000,dueDate:'',createdAt:now}]));
 localStorage.setItem('vaultet_goals_v1',JSON.stringify([{id:'g1',name:'คอม',target:30000,saved:0,deadline:''}]));});
await pg.goto('http://localhost:8151/index.html');await pg.waitForTimeout(1200);
const txt=id=>pg.textContent('#'+id);
const assets=async()=>(await txt('totalMoneyNum')).trim();

// ===== เงินกันไว้: เลขใหญ่เป็นใช้ได้จริง =====
ok('hero label says ใช้ได้จริง when money is reserved', (await txt('heroLabel')).trim()==='ใช้ได้จริง');
ok('hero number = in account − reserved (8,365 − 6,000 = 2,365)', (await txt('balanceNum')).trim()==='฿2,365');
ok('hero has no split/carry lines (moved away)', !(await pg.$('#heroSplit')) && (await txt('carryNum')).trim()==='' && !(await pg.isVisible('#carryNum')));
await pg.evaluate(()=>{ analysisPreset='thisMonth'; renderPeriodAnalysis(); });
ok('analysis tab shows carry-over before the period', /ยกมาก่อนช่วงนี้\s*฿10,000/.test(await txt('periodAnalysisSection')));
ok('assets panel still shows the real in-account amount', (await txt('inAccountsNum')).trim()==='฿8,365' && (await txt('availableNum')).trim()==='฿2,365');
const a0=await assets();
await pg.screenshot({path:shots+'hero-available.png'});

// ===== เป้าหมาย: + เงิน หักออกจากบัญชี มีรายการเอง สินทรัพย์รวมเท่าเดิม =====
await pg.evaluate(()=>vaultetGo('plan')); await pg.waitForTimeout(400);
await pg.click('[data-gadd="g1"]'); await T.dlgOK(pg,{v:'2000'}); await pg.waitForTimeout(300);
const e=await pg.evaluate(()=>entries.find(x=>x.goalId==='g1'));
ok('goal money creates a saving entry with its own note', !!e && e.type==='saving' && e.amount===2000 && e.note==='เป้าหมาย: คอม' && e.accountId==='a1');
ok('goal money goes to its own category เป้าหมาย', e.category==='เป้าหมาย' && await pg.evaluate(()=>CATS_BY_TYPE.saving.includes('เป้าหมาย')));
ok('goal card shows ฿2,000 saved', /฿2,000/.test(await pg.textContent('#goalsCard .v-brow-amt')));
ok('hero (available) drops by 2,000 → ฿365', (await txt('balanceNum')).trim()==='฿365');
ok('in account drops to ฿6,365', (await txt('inAccountsNum')).trim()==='฿6,365');
ok('assets panel has a goals row ฿2,000', (await txt('goalsHeldNum')).trim()==='฿2,000' && await pg.evaluate(()=>document.getElementById('goalsHeldRow').style.display!=='none'));
ok('total assets unchanged ('+a0+')', (await assets())===a0);
ok('goal money is not counted as other savings', await pg.evaluate(()=>document.getElementById('otherSavedRow').style.display==='none'));
ok('AI sees saved 2,000 on the goal', await pg.evaluate(()=>buildFinancialSnapshot().goals[0].saved===2000));

// เอาเงินออก
await pg.click('[data-gadd="g1"]'); await T.dlgOK(pg,{v:'-500'}); await pg.waitForTimeout(300);
ok('taking 500 out → goal ฿1,500, money back in the account', (await pg.evaluate(()=>goalSaved(readGoals()[0])))===1500 && (await txt('inAccountsNum')).trim()==='฿6,865');
ok('withdrawal does not touch emergency savings', await pg.evaluate(()=>getEmergencySaved()===0));
ok('total assets still unchanged', (await assets())===a0);

// ลบรายการออม → ยอดเป้าหมายลดตาม
await pg.evaluate(()=>{ const x=entries.find(e=>e.goalId==='g1'&&e.type==='saving'); return deleteEntryById(x.id); }); await pg.waitForTimeout(300);
ok('deleting the saving entry updates the goal card', (await pg.evaluate(()=>goalSaved(readGoals()[0])))===0 && /฿0/.test(await pg.textContent('#goalsCard .v-brow-amt')));
await pg.screenshot({path:shots+'goals-linked.png'});

// ===== ฟอร์มเพิ่มรายการ: เลือกเป้าหมายแทนพิมพ์โน้ต =====
await pg.evaluate(()=>{ entries=entries.filter(x=>x.goalId!=='g1'); saveEntries(); render(); });
await pg.evaluate(()=>openForm(null)); await pg.waitForTimeout(250);
ok('goal picker hidden for expense', !(await pg.isVisible('#goalPickWrap')));
await pg.click('.type-btn[data-type="saving"]'); await pg.waitForTimeout(150);
ok('goal picker hidden on other saving categories (เงินออม)', !(await pg.isVisible('#goalPickWrap')));
await pg.click('.cat-chip-label[data-cat="ลงทุนหุ้น"]'); await pg.waitForTimeout(100);
ok('goal picker hidden on ลงทุนหุ้น too', !(await pg.isVisible('#goalPickWrap')));
await pg.fill('#amount','300'); await pg.click('.cat-chip-label[data-cat="เป้าหมาย"]'); await pg.waitForTimeout(100);
ok('picker shows only under category เป้าหมาย, first goal preselected', await pg.isVisible('#goalPickWrap') && (await pg.locator('#goalPickRow [data-goal]').count())===1 && await pg.evaluate(()=>selectedGoalId==='g1'));
await pg.click('#submitBtn'); await pg.waitForTimeout(300);
const f=await pg.evaluate(()=>entries.find(x=>x.goalId==='g1'&&x.amount===300));
ok('saved with goalId, category and auto note', !!f && f.type==='saving' && f.category==='เป้าหมาย' && f.note==='เป้าหมาย: คอม');
ok('goal now has the 300 (and hero drops)', (await pg.evaluate(()=>goalSaved(readGoals()[0])))===300);
await pg.evaluate(()=>openForm(entries.find(x=>x.goalId==='g1'&&x.amount===300))); await pg.waitForTimeout(250);
ok('editing shows the goal selected', await pg.evaluate(()=>selectedGoalId==='g1') && (await pg.locator('#goalPickRow .is-selected').count())===1);
await pg.click('.cat-chip-label[data-cat="เงินออม"]'); await pg.waitForTimeout(100);
ok('switching to another category hides picker and clears the goal', !(await pg.isVisible('#goalPickWrap')) && await pg.evaluate(()=>selectedGoalId===''));
await pg.click('#submitBtn'); await pg.waitForTimeout(300);
ok('goal link removed after edit', await pg.evaluate(()=>!entries.some(x=>x.goalId==='g1'&&x.amount===300)));
await pg.evaluate(()=>openForm(null)); await pg.click('.type-btn[data-type="saving"]'); await pg.waitForTimeout(100);
ok('new saving form does not preselect เป้าหมาย', await pg.evaluate(()=>selectedCategory!=='เป้าหมาย'&&selectedGoalId===''));
await pg.screenshot({path:shots+'form-goal-pick.png'});
await pg.evaluate(()=>closeForm());

// ===== ไม่มีเงินกันไว้ → กลับเป็นคงเหลือเดือนนี้ =====
await pg.evaluate(()=>{ reservedItems=[]; saveReserved(); render(); }); await pg.waitForTimeout(200);
ok('no reserved money → label back to คงเหลือเดือนนี้, no split line', (await txt('heroLabel')).trim()==='คงเหลือเดือนนี้' && !(await pg.$('#heroSplit')));

ok('no native alert/confirm/prompt', native.n===0);
ok('no js errors'+(errs.length?': '+errs.slice(0,3).join(' | '):''), errs.length===0);
await b.close(); srv.close();
})().catch(e=>{console.log('FAIL crashed: '+e.message);process.exit(1);});
