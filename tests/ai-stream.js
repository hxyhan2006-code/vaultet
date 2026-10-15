// ทดสอบคำตอบ AI แบบสตรีม: ใช้ fetch จำลอง (ไม่เรียก Gemini จริง ไม่มีค่าใช้จ่าย)
const { chromium } = require('playwright');
const http=require('http'),fs=require('fs'),path=require('path');const root=require('path').resolve(__dirname,'..');
const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png'};
const srv=http.createServer((q,s)=>{let p=q.url.split('?')[0];if(p==='/')p='/index.html';const f=path.join(root,p);fs.readFile(f,(e,d)=>{if(e){s.writeHead(404);s.end();return}s.writeHead(200,{'content-type':types[path.extname(f)]||'text/plain'});s.end(d)})});
(async()=>{await new Promise(r=>srv.listen(8183,r));
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
await pg.goto('http://localhost:8183/index.html');await pg.waitForTimeout(1000);
const ok=(n,c)=>console.log((c?'PASS ':'FAIL ')+n);
const lastModel=()=>pg.evaluate(()=>{const h=loadAIChatHistory();const m=[...h].reverse().find(x=>x.role==='model');return m?m.text:null});
const send=async t=>{ await pg.fill('#aiChatInput',t); await pg.click('#aiChatSendBtn'); };
await pg.evaluate(()=>vaultetGo('chat')); await pg.waitForTimeout(400);

// 1) ค่อยๆ ขึ้น ไม่เด้งทีเดียว + ซ่อนคำสั่งหลังบ้าน
await pg.evaluate(()=>{window.__mock.mode='ok';window.__mock.delay=450;window.__mock.first=700;window.__mock.parts=['ตอบสั้นๆ ว่า **สวัสดี** ','เดือนนี้ใช้จ่าย 9,891 บาท ','ควรลดค่ากินลงหน่อย\n@@MEMORY_ADD@@ ชอบประหยัดมาก'];});
await send('สรุปเดือนนี้หน่อย'); await pg.waitForTimeout(250);
ok('typing dots show before the first chunk', await pg.isVisible('#aiChatTypingIndicator'));
await pg.waitForTimeout(1000);
let live=await pg.evaluate(()=>{const e=document.querySelector('.ai-chat-msg.is-streaming .ai-chat-bubble');return e?e.textContent:null});
ok('a live bubble is growing while the reply is still arriving: "'+(live||'').slice(0,30)+'"', !!live && live.includes('ตอบสั้น') && !live.includes('ควรลดค่ากิน'));
ok('typing dots are replaced by the live bubble', !(await pg.isVisible('#aiChatTypingIndicator')));
ok('send button is the stop button while streaming', await pg.evaluate(()=>document.getElementById('aiChatSendBtn').classList.contains('stop-btn')));
await pg.waitForTimeout(450);
live=await pg.evaluate(()=>{const e=document.querySelector('.ai-chat-msg.is-streaming .ai-chat-bubble');return e?e.textContent:''});
ok('...and the directive line is never shown ('+live.length+' chars)', !live.includes('@@') && !live.includes('MEMORY'));
await pg.waitForTimeout(2500);
const m1=await lastModel();
ok('final saved reply is complete and clean', m1 && m1.includes('ควรลดค่ากินลงหน่อย') && !m1.includes('@@'));
ok('no live bubble left after completion', (await pg.locator('.ai-chat-msg.is-streaming').count())===0);
ok('final bubble is rendered from history (with actions)', (await pg.locator('.ai-chat-msg.role-model .ai-chat-actions').count())>=1);
const mem=await pg.evaluate(()=>JSON.parse(localStorage.getItem('finance_tracker_ai_memory_v1')||'[]'));
ok('memory directive still applied after streaming', mem.some(x=>/ชอบประหยัดมาก/.test(x.text)));
ok('send button back to normal', !(await pg.evaluate(()=>document.getElementById('aiChatSendBtn').classList.contains('stop-btn'))));
const calls1=await pg.evaluate(()=>window.__mock.calls);
ok('used the streaming endpoint (alt=sse): '+calls1.length+' call(s)', calls1.some(c=>/streamGenerateContent\?alt=sse/.test(c)));

// 2) กดหยุดกลางทาง → ข้อความที่ได้แล้วยังอยู่
await pg.click('#uxChatNewBtn'); await pg.waitForTimeout(400);
await pg.evaluate(()=>{window.__mock.calls=[];window.__mock.first=0;window.__mock.delay=500;window.__mock.parts=['ข้อความส่วนแรกที่ยาวพอสมควร ','ส่วนที่สองที่ไม่ควรได้เห็น ','ส่วนที่สามที่ไม่ควรได้เห็น'];});
await send('ทดสอบกดหยุด'); await pg.waitForTimeout(900);
await pg.click('#aiChatSendBtn'); await pg.waitForTimeout(700);
const m2=await lastModel();
ok('stopping keeps the part that already arrived: "'+(m2||'').slice(0,25)+'"', !!m2 && m2.includes('ข้อความส่วนแรก') && !m2.includes('ไม่ควรได้เห็น ส่วนที่สาม'));
ok('input usable again after stop', !(await pg.evaluate(()=>document.getElementById('aiChatInput').disabled)));
ok('no live bubble left after stop', (await pg.locator('.ai-chat-msg.is-streaming').count())===0);

// 3) สตรีมใช้ไม่ได้ → ถอยกลับไปแบบเดิมเอง
await pg.click('#uxChatNewBtn'); await pg.waitForTimeout(400);
await pg.evaluate(()=>{window.__mock.calls=[];window.__mock.mode='stream500';window.__mock.full='คำตอบจากทางสำรองแบบไม่สตรีม ใช้งานได้ปกติ';});
await send('ทดสอบทางสำรอง'); await pg.waitForTimeout(1800);
const m3=await lastModel();
ok('fallback reply arrives', m3 && m3.includes('ทางสำรอง'));
const calls3=await pg.evaluate(()=>window.__mock.calls);
ok('tried stream first, then plain generateContent ('+calls3.length+' calls)', calls3.length===2 && /streamGenerateContent/.test(calls3[0]) && /:generateContent\?/.test(calls3[1]));
ok('no error box shown after silent fallback', !(await pg.isVisible('#aiChatError')));

// 4) ตอบใหม่ (regenerate) ก็สตรีม
await pg.evaluate(()=>{window.__mock.calls=[];window.__mock.mode='ok';window.__mock.delay=100;window.__mock.parts=['คำตอบใหม่จากการกดตอบใหม่ ','สตรีมได้เหมือนเดิมทุกอย่าง'];});
await pg.click('[data-action="regenerate"]'); await pg.waitForTimeout(1800);
const m4=await lastModel();
ok('regenerate replies via the stream', m4 && m4.includes('คำตอบใหม่') && (await pg.evaluate(()=>window.__mock.calls)).some(c=>/streamGenerateContent/.test(c)));

ok('no native browser dialogs ('+native.msgs.join(' | ')+')', native.n===0);
console.log(errs.join('\n')||'no js errors');
await b.close();srv.close()})();
