// โฉมใหม่ รอบ 3 (ds51): หน้ารายงาน — ช่วง สัปดาห์/เดือน/ปี/อื่นๆ, เลื่อนช่วง, เลือกบัญชี, แถบประเภท 3 ช่อง,
// วงกลมแยกหมวด, รายหมวดกดดูรายการ, กราฟ 6 ช่วง (กดแท่งไปช่วงนั้น), ตัวเลขสรุป, เทียบแบบกำหนดเองพับไว้
const { chromium } = require('playwright');
const http=require('http'),fs=require('fs'),path=require('path');const root=require('path').resolve(__dirname,'..');
const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png'};
const srv=http.createServer((q,s)=>{let p=q.url.split('?')[0];if(p==='/')p='/index.html';const f=path.join(root,p);fs.readFile(f,(e,d)=>{if(e){s.writeHead(404);s.end();return}s.writeHead(200,{'content-type':types[path.extname(f)]||'text/plain'});s.end(d)})});
const shots=require('os').tmpdir()+'/vaultet-test-shots/'; require('fs').mkdirSync(shots,{recursive:true});
(async()=>{await new Promise(r=>srv.listen(8203,r));
const b=await chromium.launch({...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{}),args:['--no-sandbox']});
const pg=await (await b.newContext({viewport:{width:380,height:820},deviceScaleFactor:2,serviceWorkers:'block'})).newPage();
const errs=[];pg.on('pageerror',e=>errs.push(e.message));pg.on('console',m=>{if(m.type()==='error'&&!/ERR_FAILED/.test(m.text()))errs.push(m.text())});
const T=require('./tlib.js');const native=T.watchNative(pg);
await pg.route(/accounts\.google\.com|fonts\./,r=>r.abort());
await pg.addInitScript(()=>{if(localStorage.getItem('__s'))return;localStorage.setItem('__s','1');
 const now=new Date(), ym=(o,day)=>{const d=new Date(now.getFullYear(),now.getMonth()+o,day,12);return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')};
 localStorage.setItem('finance_tracker_accounts_v1',JSON.stringify([{id:'a1',name:'กสิกร',initialBalance:10000},{id:'a2',name:'เงินสด',initialBalance:500}]));
 const E=(i,t,c,a,date,ac,extra)=>Object.assign({id:'e'+i,type:t,category:c,amount:a,note:'n'+i,date,accountId:ac||'a1'},extra||{});
 localStorage.setItem('finance_tracker_entries_v1',JSON.stringify([
  // เดือนนี้ (วันที่ 1-2 กันวันในอนาคต)
  E(1,'expense','กิน',300,ym(0,1)),E(2,'expense','กิน',200,ym(0,1),'a2'),E(3,'expense','คาเฟ่',100,ym(0,2)),
  E(4,'income','เงินเดือน',5000,ym(0,1)),E(5,'income','ถอนเงินออม',400,ym(0,2)),E(6,'saving','เงินออม',700,ym(0,2)),
  // เดือนก่อน: รายจ่าย 1,000
  E(7,'expense','กิน',1000,ym(-1,10)),
  // 2 เดือนก่อน
  E(8,'expense','ช้อปปิ้ง',250,ym(-2,5))]));
});
await pg.goto('http://localhost:8203/index.html');await pg.waitForTimeout(1200);
const ok=(n,c)=>console.log((c?'PASS ':'FAIL ')+n);
const vis=s=>pg.isVisible(s);
const tx=s=>pg.textContent(s);
await pg.click('.ux-bottom-item[data-page="analysis"]'); await pg.waitForTimeout(400);

ok('report shows, month mode by default, next arrow disabled on current month', await vis('#vReport') && await pg.evaluate(()=>document.querySelector('.v-rseg [data-mode="month"]').classList.contains('is-on')) && await pg.isDisabled('#vRepNext'));
ok('old duplicate sections hidden (trend, breakdown, period stats)', !(await vis('#trendCard')) && !(await vis('#breakdownSection')) && !(await vis('#periodAnalysisSection')));
const tabs=await pg.locator('.v-rtab').allTextContents();
ok('type tabs show this month totals: จ่าย 600 / รับจริง 5,000 (ไม่นับเงินคืน) / ออม 700', tabs[0].includes('฿600') && tabs[1].includes('฿5,000') && tabs[2].includes('฿700'));
ok('donut center names the biggest expense category (กิน 83%)', (await tx('#vRepDonut')).includes('กิน') && (await tx('#vRepDonut')).includes('83%'));
ok('compare pill: 40% less than last month (green)', /รายจ่ายน้อยกว่า .+ 40% \(฿1,000\)/.test(await tx('#vRepCmp')) && await pg.evaluate(()=>document.getElementById('vRepCmp').classList.contains('is-good')));
ok('category rows: กิน ฿500, คาเฟ่ ฿100', (await pg.locator('.v-rcat').count())===2 && (await tx('.v-rcat >> nth=0')).includes('฿500'));
await pg.click('.v-rcat >> nth=0 >> summary'); await pg.waitForTimeout(150);
ok('tapping a category lists its entries', (await pg.locator('.v-rcat[open] .v-rcat-item').count())===2);
ok('6 trend bars, current month highlighted', (await pg.locator('#vRepBars .v-rbar').count())===6 && (await pg.locator('#vRepBars .v-rbar.is-on').count())===1 && await pg.evaluate(()=>[...document.querySelectorAll('#vRepBars .v-rbar')].pop().classList.contains('is-on')));
const facts=await tx('#vRepFacts');
ok('facts: carry-over 10,500 − last months spend, net cash flow, average per day', /ยกมาก่อนช่วงนี้\s*฿9,250/.test(facts) && facts.includes('คงเหลือสุทธิ') && facts.includes('จ่ายเฉลี่ยต่อวัน'));
await pg.screenshot({path:shots+'r3-report.png',fullPage:true});

// รายรับ: บอกยอดที่ไม่ได้นับ
await pg.click('.v-rtab[data-type="income"]'); await pg.waitForTimeout(200);
ok('income tab: note about withdrawn savings not counted (฿400)', (await tx('#vRepNote')).includes('฿400') && await pg.evaluate(()=>document.querySelector('.v-rtab[data-type="income"]').classList.contains('is-on')));
ok('income tab: category title follows type', (await tx('#vRepCatsTitle')).trim()==='รายรับตามหมวด');
await pg.click('.v-rtab[data-type="expense"]'); await pg.waitForTimeout(150);

// เลื่อนไปเดือนก่อน
await pg.click('#vRepPrev'); await pg.waitForTimeout(200);
ok('prev arrow: last month shows จ่าย 1,000 and next arrow is enabled', (await tx('.v-rtab >> nth=0')).includes('฿1,000') && !(await pg.isDisabled('#vRepNext')));
await pg.click('#vRepNext'); await pg.waitForTimeout(200);
// กดแท่งกราฟ = ไปช่วงนั้น
await pg.click('#vRepBars .v-rbar >> nth=3'); await pg.waitForTimeout(200);
ok('tapping the 2-months-ago bar jumps there (ช้อปปิ้ง ฿250)', (await tx('.v-rtab >> nth=0')).includes('฿250') && (await tx('#vRepCats')).includes('ช้อปปิ้ง'));
await pg.click('#vRepNext'); await pg.click('#vRepNext'); await pg.waitForTimeout(200);
ok('next arrow twice returns to this month', await pg.isDisabled('#vRepNext') && (await tx('.v-rtab >> nth=0')).includes('฿600'));

// บัญชี
await pg.click('#vRepAccBtn'); await pg.waitForTimeout(250);
ok('account sheet offers ทุกบัญชี + 2 accounts', (await pg.locator('.v-dlg-sheet .v-pick-row').count())===3);
await pg.click('.v-dlg-sheet .v-pick-row[data-value="a2"]'); await pg.waitForTimeout(200);
ok('filter เงินสด: expense 200 only', (await tx('.v-rtab >> nth=0')).includes('฿200') && (await tx('#vRepAccLabel')).trim()==='เงินสด');
await pg.click('#vRepAccBtn'); await pg.waitForTimeout(200); await pg.click('.v-dlg-sheet .v-pick-row[data-value=""]'); await pg.waitForTimeout(200);

// ปี / สัปดาห์
await pg.click('.v-rseg [data-mode="year"]'); await pg.waitForTimeout(200);
const yr=await tx('#vRepLabel');
ok('year mode: Buddhist year label ('+yr.trim()+')', /^25\d\d$/.test(yr.trim()));
await pg.click('.v-rseg [data-mode="week"]'); await pg.waitForTimeout(200);
ok('week mode: label is a date range and bars are weekly', /–/.test(await tx('#vRepLabel')) && (await tx('#vRepTrendTitle')).includes('สัปดาห์'));

// อื่นๆ: 3 เดือนล่าสุด / กำหนดเอง
await pg.click('.v-rseg [data-mode="other"]'); await pg.waitForTimeout(250);
ok('"อื่นๆ" opens a sheet of ranges', (await pg.locator('.v-dlg-sheet .v-pick-row').count())===5);
await pg.click('.v-dlg-sheet .v-pick-row[data-value="all"]'); await pg.waitForTimeout(250);
ok('ทั้งหมด: expense 1,850, arrows hidden, no carry tile', (await tx('.v-rtab >> nth=0')).includes('฿1,850') && !(await vis('#vRepPrev')) && !(await tx('#vRepFacts')).includes('ยกมา'));
await pg.click('.v-rseg [data-mode="other"]'); await pg.waitForTimeout(250);
await pg.click('.v-dlg-sheet .v-pick-row[data-value="custom"]'); await pg.waitForTimeout(250);
ok('custom: asks start date with the Thai calendar', (await tx('.v-date-sheet .v-dlg-title')).includes('เริ่ม'));
// เลื่อนปฏิทินไปเดือนก่อน (ตำแหน่งเริ่มต้นขึ้นกับวันนี้ จึงเลื่อนจนหัวข้อตรง)
const lastMonthTitle=await pg.evaluate(()=>{const M=["มกราคม","กุมภาพันธ์","มีนาคม","เมษายน","พฤษภาคม","มิถุนายน","กรกฎาคม","สิงหาคม","กันยายน","ตุลาคม","พฤศจิกายน","ธันวาคม"];const n=new Date();const d=new Date(n.getFullYear(),n.getMonth()-1,1);return M[d.getMonth()]+' '+(d.getFullYear()+543)});
const goLast=async()=>{ for(let i=0;i<3;i++){ const t=(await tx('.v-date-sheet .v-date-title')).trim(); if(t===lastMonthTitle) return; await pg.click('.v-date-sheet .v-date-nav >> nth='+(t>lastMonthTitle&&false?1:0)); await pg.waitForTimeout(80);} };
await goLast();
await pg.click('.v-date-sheet .v-date-day >> text="1"'); await pg.waitForTimeout(300);
ok('custom: then asks end date', (await tx('.v-date-sheet .v-dlg-title')).includes('ถึง'));
await goLast();
await pg.click('.v-date-sheet .v-date-day >> text="28"'); await pg.waitForTimeout(300);
ok('custom range = whole last month (จ่าย 1,000)', (await tx('.v-rtab >> nth=0')).includes('฿1,000') && /–/.test(await tx('#vRepLabel')));

// โหมดจำไว้ข้ามการเปิดแอป
await pg.click('.v-rseg [data-mode="year"]'); await pg.waitForTimeout(150); await pg.click('.v-rtab[data-type="saving"]'); await pg.waitForTimeout(150);
await pg.reload(); await pg.waitForTimeout(900); await pg.click('.ux-bottom-item[data-page="analysis"]'); await pg.waitForTimeout(300);
ok('mode and type tab are remembered', await pg.evaluate(()=>document.querySelector('.v-rseg [data-mode="year"]').classList.contains('is-on') && document.querySelector('.v-rtab[data-type="saving"]').classList.contains('is-on')));

// เทียบแบบกำหนดเอง (ของเดิม) ยังใช้ได้ในส่วนพับ
await pg.click('#vRepMore summary'); await pg.waitForTimeout(200);
ok('custom compare (old tool) is inside the folded section and works', await vis('#compareSection') && await vis('.v-fbtn[data-for="comparePreset"]'));

// เพิ่มรายการแล้วรายงานอัปเดตเอง
await pg.click('#vRepMore summary'); await pg.click('.v-rseg [data-mode="month"]'); await pg.click('.v-rtab[data-type="expense"]'); await pg.waitForTimeout(150);
await pg.evaluate(()=>{ entries.unshift({id:'z1',type:'expense',category:'คาเฟ่',amount:50,note:'',date:todayISO(),accountId:'a1'}); saveEntries(); render(); });
await pg.waitForTimeout(200);
ok('new entry updates the report immediately (650)', (await tx('.v-rtab >> nth=0')).includes('฿650'));

ok('no "income" in report class names (old CSS would recolour)', await pg.evaluate(()=>![...document.querySelectorAll('#vReport *')].some(e=>/income|positive|primary/.test(e.className.baseVal!==undefined?e.className.baseVal:e.className))));
ok('no check marks', !/[✓✔]/.test(await pg.evaluate(()=>document.getElementById('vReport').innerText)));
ok('no native dialogs', native.n===0);
ok('no js errors', errs.length===0); if(errs.length) console.log('- '+errs.join(' | ').slice(0,300));
await b.close(); srv.close();
})();
