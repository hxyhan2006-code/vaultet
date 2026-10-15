// ทดสอบคำตอบ AI แบบสตรีม: ใช้ fetch จำลอง (ไม่เรียก Gemini จริง ไม่มีค่าใช้จ่าย)
const { chromium } = require('playwright');
const http=require('http'),fs=require('fs'),path=require('path');const root=require('path').resolve(__dirname,'..');
const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png'};
const srv=http.createServer((q,s)=>{let p=q.url.split('?')[0];if(p==='/')p='/index.html';const f=path.join(root,p);fs.readFile(f,(e,d)=>{if(e){s.writeHead(404);s.end();return}s.writeHead(200,{'content-type':types[path.extname(f)]||'text/plain'});s.end(d)})});
(async()=>{await new Promise(r=>srv.listen(8196,r));
const b=await chromium.launch({...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{}),args:['--no-sandbox']});
const pg=await (await b.newContext({viewport:{width:380,height:820},serviceWorkers:'block'})).newPage();
const errs=[];pg.on('pageerror',e=>errs.push(e.message));pg.on('console',m=>{if(m.type()==='error'&&!/ERR_FAILED|Failed to load resource/.test(m.text()))errs.push(m.text())});
await pg.route(/accounts\.google\.com|fonts\./,r=>r.abort());
await pg.addInitScript(()=>{
  if(localStorage.getItem('__s'))return;localStorage.setItem('__s','1');
  localStorage.setItem('finance_tracker_ai_apikeys_v1',JSON.stringify(['KEY-TEST']));
  localStorage.setItem('finance_tracker_accounts_v1',JSON.stringify([{id:'a1',name:'กสิกร',openingBalance:20000}]));
  const real=window.fetch.bind(window);
  window.__mock={mode:'ok',calls:[],parts:[],delay:200,first:0,full:''};
  window.fetch=(url,opts)=>{
    const u=String(url);
    if(!/generativelanguage/.test(u)) return real(url,opts);
    const M=window.__mock; M.calls.push(u.replace(/key=[^&]*/,'key=K'));
    const isStream=/streamGenerateContent/.test(u);
    if(M.mode==='stream500' && isStream) return Promise.resolve(new Response('boom',{status:500}));
    if(isStream){
      const parts=M.parts, enc=new TextEncoder(); let i=0;
      const stream=new ReadableStream({start(c){
        const sig=opts&&opts.signal; let dead=false;
        const kill=()=>{ if(dead) return; dead=true; try{c.error(new DOMException('Aborted','AbortError'))}catch(e){} };
        if(sig) sig.addEventListener('abort',kill);
        const tick=()=>{ if(dead) return; if(i<parts.length){ const last=i===parts.length-1; const j={candidates:[{content:{parts:[{text:parts[i]}]},...(last?{finishReason:'STOP'}:{})}]}; c.enqueue(enc.encode('data: '+JSON.stringify(j)+'\r\n\r\n')); i++; setTimeout(tick,M.delay); } else { dead=true; c.close(); } };
        setTimeout(tick,M.first);
      }});
      return Promise.resolve(new Response(stream,{status:200,headers:{'content-type':'text/event-stream'}}));
    }
    return Promise.resolve(new Response(JSON.stringify({candidates:[{content:{parts:[{text:M.full}]},finishReason:'STOP'}]}),{status:200}));
  };
});
const T=require('./tlib.js');const native=T.watchNative(pg);
await pg.goto('http://localhost:8196/index.html');await pg.waitForTimeout(1000);
const ok=(n,c)=>console.log((c?'PASS ':'FAIL ')+n);
const lastModel=()=>pg.evaluate(()=>{const h=loadAIChatHistory();const m=[...h].reverse().find(x=>x.role==='model');return m?m.text:null});
const send=async t=>{ await pg.fill('#aiChatInput',t); await pg.click('#aiChatSendBtn'); };
await pg.evaluate(()=>vaultetGo('chat')); await pg.waitForTimeout(400);


await pg.evaluate(()=>{
  entries.push({id:'e1',type:'expense',category:'ค่ากิน',amount:40,date:'2026-10-15',note:'',accountId:'a1'});
  entries.push({id:'e2',type:'expense',category:'ค่าเดินทาง',amount:100,date:'2026-10-14',note:'',accountId:'a1'});
  const mk=(typeof curMonthKey==='function')?curMonthKey():'2026-10';
  const h=loadAIChatHistory(); h.push({role:'user',text:'x'});
  h.push({role:'model',text:'ได้ครับ',actions:[
    {type:'delete_entry',id:'e1',status:'pending'},
    {type:'edit_entry',id:'e2',changes:{amount:120},status:'pending'},
    {type:'add_entry',entryType:'expense',category:'ค่ากิน',amount:55,date:'2026-10-16',status:'pending'},
    {type:'set_budget',month:'2026-10',categories:['ค่ากิน'],name:'ค่ากิน',amount:3000,status:'pending'},
    {type:'delete_budget',month:'2026-10',categories:['ค่ากิน'],name:'ค่ากิน',status:'pending'}]});
  saveAIChatHistoryForChat(loadAllChats().activeId,h); renderAiChatBubbles();
});
const txt=()=>pg.evaluate(()=>document.querySelector('.v-act-list').innerText);
const c0=await txt();
ok('ไม่มีหัวข้อเก่า',!/สิ่งที่ AI เสนอให้ปรับ/.test(c0));
ok('แสดงชื่อรายการ+วันที่แบบสั้น',/ลบรายการ/.test(c0)&&/ค่ากิน ฿40 · 15 ต\.ค\./.test(c0));
ok('ไม่มีติ๊ก',!/[✓✔✗✕]/.test(c0));
ok('ปุ่มลบสีแดง+ยกเลิก+เสนอแก้',await pg.evaluate(()=>{const c=document.querySelector('.v-act-card');return !!c.querySelector('.v-act-btn.danger')&&c.querySelector('.v-act-btn.danger').textContent==='ลบ'&&/ยกเลิก/.test(c.innerText)&&/เสนอแก้/.test(c.innerText)}));
ok('ปุ่มเพิ่มเป็นยืนยัน',await pg.evaluate(()=>document.querySelectorAll('.v-act-card')[2].querySelector('.v-act-btn.primary').textContent==='ยืนยัน'));
const click=(i,op)=>pg.evaluate(([i,op])=>document.querySelectorAll('.v-act-card')[i].querySelector('[data-aiact="'+op+'"]').click(),[i,op]);
// ลบ
await click(0,'ok'); await pg.waitForTimeout(200);
ok('ลบรายการจริง',await pg.evaluate(()=>!entries.some(e=>e.id==='e1')));
ok('สถานะ ลบแล้ว (ตัวอักษรล้วน)',await pg.evaluate(()=>{const t=document.querySelectorAll('.v-act-card')[0].innerText;return /ลบแล้ว/.test(t)&&!/[✓✔✗]/.test(t)}));
await click(0,'undo'); await pg.waitForTimeout(200);
ok('ย้อนกลับคืนรายการ',await pg.evaluate(()=>entries.some(e=>e.id==='e1')));
// แก้
await click(1,'ok'); await pg.waitForTimeout(200);
ok('แก้ยอดจริง',await pg.evaluate(()=>entries.find(e=>e.id==='e2').amount===120));
// เพิ่ม
const n0=await pg.evaluate(()=>entries.length);
await click(2,'ok'); await pg.waitForTimeout(200);
ok('เพิ่มรายการจริง+สถานะ เพิ่มแล้ว',await pg.evaluate(n=>entries.length===n+1&&/เพิ่มแล้ว/.test(document.querySelectorAll('.v-act-card')[2].innerText),n0));
// ตั้งงบ / ลบงบ
await click(3,'ok'); await pg.waitForTimeout(200);
ok('ตั้งงบจริง',await pg.evaluate(()=>budgets.some(b=>b.amount===3000)));
await click(4,'ok'); await pg.waitForTimeout(200);
ok('ลบงบจริง',await pg.evaluate(()=>!budgets.some(b=>b.enabled!==false&&b.amount===3000)));
// ยกเลิก / เสนอแก้
await pg.evaluate(()=>{const h=loadAIChatHistory();h.push({role:'model',text:'อีกอัน',actions:[{type:'delete_entry',id:'e2',status:'pending'},{type:'delete_entry',id:'e2',status:'pending'}]});saveAIChatHistoryForChat(loadAllChats().activeId,h);renderAiChatBubbles();});
const cards=await pg.evaluate(()=>document.querySelectorAll('.v-act-card').length);
await click(cards-2,'no'); await pg.waitForTimeout(150);
ok('ยกเลิกไม่ลบ+แสดง ยกเลิกแล้ว',await pg.evaluate(n=>entries.some(e=>e.id==='e2')&&/ยกเลิกแล้ว/.test(document.querySelectorAll('.v-act-card')[n-2].innerText),cards));
await click(cards-1,'rev'); await pg.waitForTimeout(150);
ok('เสนอแก้เติมช่องพิมพ์',await pg.evaluate(()=>/ขอปรับข้อเสนอนี้/.test(document.getElementById('aiChatInput').value)));
ok('toast ไม่มีติ๊ก',native.msgs.every(m=>!/[✓✔]/.test(m)));
ok('ไม่มี error',errs.length===0);
await b.close();srv.close();
})();
