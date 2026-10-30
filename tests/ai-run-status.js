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
const st=await pg.evaluate(()=>{const e=document.getElementById('aiChatTypingIndicator');return e?e.innerText.trim():null});
ok('ระหว่างรอมีแค่จุด ไม่มีข้อความยาว',st==='');
ok('ไม่มีกล่องสถานะ',await pg.evaluate(()=>!document.getElementById('aiRunStatus')));
await pg.waitForFunction(()=>document.querySelector('.ai-chat-latency'),null,{timeout:15000});
const lat=await pg.evaluate(()=>document.querySelector('.ai-chat-latency').innerText);
ok('สรุปเวลาแยกสองช่วง',/เริ่มตอบหลัง \d+\.\d วิ · พิมพ์ \d+\.\d วิ · รวม \d+\.\d วิ/.test(lat));
const f=Number((/เริ่มตอบหลัง (\d+\.\d)/.exec(lat)||[])[1]);
ok('ช่วงรอสอดคล้องกับที่ตั้งไว้ (~2.6 วิ)',f>=2.4&&f<=4.5);
ok('บรรทัดเวลาไม่มีเรื่องคีย์ (สั้น)',!/คีย์/.test(lat));
// หน้าตั้งค่า
await pg.evaluate(()=>{window.vaultetOpenSettings&&window.vaultetOpenSettings();});await pg.waitForTimeout(500);
const rows=await pg.evaluate(()=>({k:document.querySelector('#vSetAiKey')?.innerText||'',o:document.querySelector('#vSetOR')?.innerText||''}));
ok('แถว Gemini: คีย์ 1 เต็ม (2 คีย์ ใช้ได้ 1)',/2 คีย์ · เต็ม 1 คีย์/.test(rows.k));
const ks=await pg.evaluate(()=>JSON.parse(localStorage.getItem('vaultet_ai_keystate_local')));
ok('เก็บสถานะรายคีย์ (1=เต็ม 2=ใช้ได้)',ks.keys[0].s==='full'&&ks.keys[1].s==='ok');
ok('สถานะไม่เข้าไฟล์สำรอง',await pg.evaluate(()=>!shouldBackupLocalStorageKey('vaultet_ai_keystate_local')));
await pg.evaluate(()=>renderAiChatBubbles());
ok('เวลายังอยู่หลังวาดแชทใหม่',await pg.evaluate(()=>/เริ่มตอบหลัง/.test((document.querySelector('.ai-chat-latency')||{}).innerText||'')));
await pg.reload();await pg.waitForTimeout(800);await pg.click('.ux-bottom-item[data-page="chat"]');await pg.waitForTimeout(600);
ok('เวลายังอยู่หลังเปิดแอปใหม่',await pg.evaluate(()=>/เริ่มตอบหลัง/.test((document.querySelector('.ai-chat-latency')||{}).innerText||'')));
// ทุกคีย์เต็ม → สรุปเต็มทั้งหมด
await pg.evaluate(()=>{localStorage.setItem('vaultet_ai_keystate_local',JSON.stringify({keys:{0:{s:'full',t:Date.now()},1:{s:'full',t:Date.now()}}}));vaultetOpenSettings();});await pg.waitForTimeout(300);
ok('แถว Gemini: เต็มทั้งหมด',/2 คีย์ · เต็มทั้งหมด \d\d:\d\d/.test(await pg.evaluate(()=>document.querySelector('#vSetAiKey').innerText)));
// รายคีย์ในหน้าตั้งคีย์
await pg.evaluate(()=>renderApiKeyList());
ok('รายคีย์แสดงเต็มพร้อมเวลา',/เต็ม \d\d:\d\d/.test(await pg.evaluate(()=>document.getElementById('apiKeyList').textContent)));
// เพิ่ม/ลบคีย์ → ล้างสถานะเก่า
await pg.evaluate(()=>saveApiKeys(['KEY-1']));
ok('แก้รายการคีย์แล้วล้างสถานะเก่า',await pg.evaluate(()=>localStorage.getItem('vaultet_ai_keystate_local')===null));
ok('ไม่มี error',errs.length===0);
await b.close();srv.close();
})();
