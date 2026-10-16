// ทดสอบแผงคำสั่งปรับแต่ง AI แบบทีละข้อ (เพิ่ม แก้ ลบ เปิด/ปิด ย้ายข้อความเดิม)
const { chromium } = require('playwright');
const http=require('http'),fs=require('fs'),path=require('path');const root=require('path').resolve(__dirname,'..');
const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png'};
const srv=http.createServer((q,s)=>{let p=q.url.split('?')[0];if(p==='/')p='/index.html';const f=path.join(root,p);fs.readFile(f,(e,d)=>{if(e){s.writeHead(404);s.end();return}s.writeHead(200,{'content-type':types[path.extname(f)]||'text/plain'});s.end(d)})});
(async()=>{await new Promise(r=>srv.listen(8199,r));
const b=await chromium.launch({...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{}),args:['--no-sandbox']});
const pg=await (await b.newContext({viewport:{width:380,height:820},serviceWorkers:'block'})).newPage();
const errs=[];pg.on('pageerror',e=>errs.push(e.message));pg.on('console',m=>{if(m.type()==='error'&&!/ERR_FAILED|Failed to load resource/.test(m.text()))errs.push(m.text())});
await pg.addInitScript(()=>{ if(localStorage.getItem('__s'))return;localStorage.setItem('__s','1');
  localStorage.setItem('finance_tracker_ai_apikeys_v1',JSON.stringify(['KEY-TEST']));
  localStorage.setItem('finance_tracker_ai_advisor_instruction_v1','ตอบสั้น\nพูดเป็นกันเอง\n\nไม่เอาน้ำ'); });
const T=require('./tlib.js');const native=T.watchNative(pg);
await pg.goto('http://localhost:8199/index.html');await pg.waitForTimeout(1000);
const ok=(n,c)=>console.log((c?'PASS ':'FAIL ')+n);
await pg.click('.ux-bottom-item[data-page="chat"]');await pg.waitForTimeout(400);
const open=async()=>{ await pg.evaluate(()=>document.getElementById('aiAdvisorSettingsBtn').click()); await pg.waitForTimeout(450); };
const items=()=>pg.evaluate(()=>[...document.querySelectorAll('.v-ins-text')].map(e=>e.innerText));
const prompt=()=>pg.evaluate(()=>buildAIChatSystemPrompt(buildFinancialSnapshot(),loadAIProfile()));
await open();
ok('ข้อความเดิมถูกแตกเป็น 3 ข้อ',JSON.stringify(await items())===JSON.stringify(['ตอบสั้น','พูดเป็นกันเอง','ไม่เอาน้ำ']));
ok('ไม่มีช่องกรอกยาวแบบเก่า',await pg.evaluate(()=>!document.getElementById('aiAdvisorInstruction')));
ok('prompt มีคำสั่งเดิม',/คำสั่งปรับแต่งจากผู้ใช้:[\s\S]*- พูดเป็นกันเอง/.test(await prompt()));
await pg.screenshot({path:'/tmp/claude-0/-home-user-vaultet/6cfe1b73-07b7-5766-a539-da2d50aa541f/scratchpad/ins1.png'});
// เพิ่ม
await pg.click('#aiInsAdd'); await T.dlgOK(pg,{v:'เริ่มคำตอบด้วยสรุปสั้นๆ'}); await pg.waitForTimeout(200);
ok('เพิ่มข้อใหม่',(await items()).includes('เริ่มคำตอบด้วยสรุปสั้นๆ')&&(await items()).length===4);
ok('prompt มีข้อใหม่',/- เริ่มคำตอบด้วยสรุปสั้นๆ/.test(await prompt()));
// แก้
await pg.click('.v-ins-item:nth-child(2)'); await pg.waitForSelector('.v-dlg-choice');
await pg.click('.v-dlg-choice:has-text("แก้ไข")'); await T.dlgOK(pg,{v:'พูดแบบเพื่อนสนิท'}); await pg.waitForTimeout(200);
ok('แก้ข้อที่ 2',(await items())[1]==='พูดแบบเพื่อนสนิท');
// ลบข้อเดียว
await pg.click('.v-ins-item:nth-child(1)'); await pg.waitForSelector('.v-dlg-choice');
await pg.click('.v-dlg-choice:has-text("ลบ")'); await pg.waitForTimeout(250);
ok('ลบข้อที่ 1 (เหลือ 3 และไม่ถามซ้ำ)',(await items()).length===3&&!(await items()).includes('ตอบสั้น'));
ok('prompt ไม่มีข้อที่ลบแล้ว',!/- ตอบสั้น\n/.test(await prompt()+'\n'));
// ปิดสวิตช์
await pg.evaluate(()=>{const c=document.getElementById('aiInsOn');c.checked=false;c.dispatchEvent(new Event('change',{bubbles:true}));}); await pg.waitForTimeout(200);
ok('ปิดสวิตช์: prompt ไม่ใส่คำสั่ง แต่รายการยังอยู่',!/คำสั่งปรับแต่งจากผู้ใช้:\n/.test(await prompt())&&(await items()).length===3);
await pg.screenshot({path:'/tmp/claude-0/-home-user-vaultet/6cfe1b73-07b7-5766-a539-da2d50aa541f/scratchpad/ins2.png'});
await pg.evaluate(()=>{const c=document.getElementById('aiInsOn');c.checked=true;c.dispatchEvent(new Event('change',{bubbles:true}));});
// ค้างหลังรีโหลด
await pg.reload();await pg.waitForTimeout(900);await pg.click('.ux-bottom-item[data-page="chat"]');await pg.waitForTimeout(300);await open();
ok('จำไว้หลังเปิดแอปใหม่',(await items()).length===3&&(await items())[0]==='พูดแบบเพื่อนสนิท');
// ลบทั้งหมด
await pg.click('#aiInsClear'); await T.dlgOK(pg); await pg.waitForTimeout(250);
ok('ลบทั้งหมดแล้วว่าง+ขึ้นข้อความว่าง',(await items()).length===0&&/ยังไม่มีคำสั่ง/.test(await pg.evaluate(()=>document.getElementById('aiInsList').innerText)));
ok('ลบทั้งหมดไม่ย้ายข้อความเก่ากลับมา',await pg.evaluate(()=>{renderAiInstructions();return document.querySelectorAll('.v-ins-item').length===0}));
ok('ไม่มี alert ของเบราว์เซอร์',native.n===0);
ok('ไม่มี error',errs.length===0);
await b.close();srv.close();
})();
