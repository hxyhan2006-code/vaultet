// ทดสอบคำตอบ AI แบบสตรีม: ใช้ fetch จำลอง (ไม่เรียก Gemini จริง ไม่มีค่าใช้จ่าย)
const { chromium } = require('playwright');
const http=require('http'),fs=require('fs'),path=require('path');const root=require('path').resolve(__dirname,'..');
const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png'};
const srv=http.createServer((q,s)=>{let p=q.url.split('?')[0];if(p==='/')p='/index.html';const f=path.join(root,p);fs.readFile(f,(e,d)=>{if(e){s.writeHead(404);s.end();return}s.writeHead(200,{'content-type':types[path.extname(f)]||'text/plain'});s.end(d)})});
(async()=>{await new Promise(r=>srv.listen(8197,r));
const b=await chromium.launch({...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{}),args:['--no-sandbox']});
const pg=await (await b.newContext({viewport:{width:380,height:820},serviceWorkers:'block'})).newPage();
const errs=[];pg.on('pageerror',e=>errs.push(e.message));pg.on('console',m=>{if(m.type()==='error'&&!/ERR_FAILED|Failed to load resource/.test(m.text()))errs.push(m.text())});
await pg.route(/accounts\.google\.com|fonts\./,r=>r.abort());
await pg.addInitScript(()=>{
  if(localStorage.getItem('__s'))return;localStorage.setItem('__s','1');
  localStorage.setItem('finance_tracker_ai_apikeys_v1',JSON.stringify(['KEY-1','KEY-2']));
  localStorage.setItem('finance_tracker_accounts_v1',JSON.stringify([{id:'a1',name:'กสิกร',openingBalance:20000}]));
  const real=window.fetch.bind(window);
  window.__mock={mode:'ok',calls:[],parts:[],delay:200,first:0,full:''};
  window.fetch=(url,opts)=>{
    const u=String(url);
    if(!/generativelanguage/.test(u)) return real(url,opts);
    const M=window.__mock; M.calls.push(u.replace(/key=[^&]*/,'key=K'));
    const isStream=/streamGenerateContent/.test(u);
    if(M.quota1 && /key=KEY-1/.test(u)) return Promise.resolve(new Response('quota',{status:429}));
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
await pg.goto('http://localhost:8197/index.html');await pg.waitForTimeout(1000);
const ok=(n,c)=>console.log((c?'PASS ':'FAIL ')+n);
const lastModel=()=>pg.evaluate(()=>{const h=loadAIChatHistory();const m=[...h].reverse().find(x=>x.role==='model');return m?m.text:null});
const send=async t=>{ await pg.fill('#aiChatInput',t); await pg.click('#aiChatSendBtn'); };
await pg.evaluate(()=>vaultetGo('chat')); await pg.waitForTimeout(400);


await pg.evaluate(()=>{window.__mock.mode='ok';window.__mock.delay=300;window.__mock.first=2600;window.__mock.quota1=true;window.__mock.parts=['คำตอบ ','ทดสอบ ','ครับ'];});
await send('ช่วยดูงบหน่อย');
await pg.waitForTimeout(1700);
const st=await pg.evaluate(()=>{const e=document.getElementById('aiRunStatus');return e?e.innerText:null});
ok('ขึ้นสถานะระหว่างรอ',!!st);
ok('บอกสิ่งที่ส่งตามจริง (รายการล่าสุด/ความจำ/ประวัติ)',/ส่งข้อมูลให้ AI: รายการล่าสุด \d+ · ความจำ \d+ ข้อ · ประวัติแชท \d+ ข้อความ/.test(st||''));
ok('บอกว่าคีย์ 1 เต็ม ลองคีย์ 2',/คีย์ Gemini ที่ 1 โควต้าเต็ม ลองคีย์ที่ 2/.test(st||''));
ok('มีตัวนับเวลารอจริง',/รอ AI เริ่มตอบ… \d+ วินาที/.test(st||''));
ok('ไม่ขึ้นข้อความอ่านงบ/เดาเอง',!/กำลังอ่าน|กำลังวิเคราะห์/.test(st||''));
await pg.waitForFunction(()=>document.querySelector('.ai-chat-latency'),null,{timeout:15000});
const lat=await pg.evaluate(()=>document.querySelector('.ai-chat-latency').innerText);
ok('สรุปเวลาแยกสองช่วง',/เริ่มตอบหลัง \d+\.\d วิ · พิมพ์ \d+\.\d วิ · รวม \d+\.\d วิ/.test(lat));
const f=Number((/เริ่มตอบหลัง (\d+\.\d)/.exec(lat)||[])[1]);
ok('ช่วงรอสอดคล้องกับที่ตั้งไว้ (~2.6 วิ)',f>=2.4&&f<=4.5);
ok('สรุปมีเหตุการณ์คีย์',/คีย์ Gemini ที่ 1/.test(lat));
await pg.evaluate(()=>renderAiChatBubbles());
ok('เวลายังอยู่หลังวาดแชทใหม่',await pg.evaluate(()=>/เริ่มตอบหลัง/.test((document.querySelector('.ai-chat-latency')||{}).innerText||'')));
await pg.reload();await pg.waitForTimeout(800);await pg.evaluate(()=>vaultetGo('chat'));await pg.waitForTimeout(400);
ok('เวลายังอยู่หลังเปิดแอปใหม่',await pg.evaluate(()=>/เริ่มตอบหลัง/.test((document.querySelector('.ai-chat-latency')||{}).innerText||'')));
ok('ไม่มี error',errs.length===0);
await b.close();srv.close();
})();
