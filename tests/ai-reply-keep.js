// คำตอบ AI ที่ถูกตัด/ใช้ไม่ได้ (ds97): ไม่ล้างข้อความบนจอแล้วถามใหม่โดยไม่บอก
// - ถูกตัดที่เพดานความยาว (มีเนื้อหาพอ) → เก็บข้อความไว้ ไม่ถามใหม่ มีหมายเหตุใต้คำตอบ
// - ใช้ไม่ได้จริง (สั้นเกิน) → ถามใหม่ครั้งเดียว แต่ข้อความเดิมยังอยู่บนจอระหว่างรอ และบรรทัดใต้คำตอบบอกว่าถามใหม่
// ใช้ Gemini จำลองเท่านั้น (ไม่เรียกของจริง)
const { chromium } = require('playwright');
const http=require('http'),fs=require('fs'),path=require('path');const root=require('path').resolve(__dirname,'..');
const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png'};
const srv=http.createServer((q,s)=>{let p=q.url.split('?')[0];if(p==='/')p='/index.html';const f=path.join(root,p);fs.readFile(f,(e,d)=>{if(e){s.writeHead(404);s.end();return}s.writeHead(200,{'content-type':types[path.extname(f)]||'text/plain'});s.end(d)})});
(async()=>{await new Promise(r=>srv.listen(8211,r));
const b=await chromium.launch({...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{}),args:['--no-sandbox']});
const pg=await (await b.newContext({viewport:{width:380,height:820},serviceWorkers:'block'})).newPage();
const errs=[];pg.on('pageerror',e=>errs.push(e.message));pg.on('console',m=>{if(m.type()==='error'&&!/ERR_FAILED|Failed to load resource/.test(m.text()))errs.push(m.text())});
await pg.route(/accounts\.google\.com|fonts\./,r=>r.abort());
await pg.addInitScript(()=>{
  if(localStorage.getItem('__s'))return;localStorage.setItem('__s','1');
  localStorage.setItem('finance_tracker_ai_apikeys_v1',JSON.stringify(['KEY-TEST']));
  localStorage.setItem('finance_tracker_accounts_v1',JSON.stringify([{id:'a1',name:'กสิกร',openingBalance:20000}]));
  const real=window.fetch.bind(window);
  // plan = คิวของแต่ละคำขอสตรีม: {parts:[...], finish, wait} (wait = หน่วงก่อนส่งท่อนแรก มิลลิวินาที)
  window.__m={plan:[],calls:[],bodies:[]};
  window.fetch=(url,opts)=>{
    const u=String(url);
    if(!/generativelanguage/.test(u)) return real(url,opts);
    const M=window.__m; M.calls.push(/streamGenerateContent/.test(u)?'stream':'plain'); try{M.bodies.push(JSON.parse(opts.body))}catch(e){}
    const p=M.plan.shift()||{parts:['คำตอบปกติที่ยาวพอใช้งานได้ครับ'],finish:'STOP',wait:50};
    if(!/streamGenerateContent/.test(u)) return Promise.resolve(new Response(JSON.stringify({candidates:[{content:{parts:[{text:p.parts.join('')}]},finishReason:p.finish}]}),{status:200}));
    const enc=new TextEncoder(); let i=0;
    const stream=new ReadableStream({start(c){
      const tick=()=>{ if(i<p.parts.length){ const last=i===p.parts.length-1; c.enqueue(enc.encode('data: '+JSON.stringify({candidates:[{content:{parts:[{text:p.parts[i]}]},...(last?{finishReason:p.finish}:{})}]})+'\r\n\r\n')); i++; setTimeout(tick,60);} else c.close(); };
      setTimeout(tick,p.wait||50);
    }});
    return Promise.resolve(new Response(stream,{status:200,headers:{'content-type':'text/event-stream'}}));
  };
});
const T=require('./tlib.js');const native=T.watchNative(pg);
await pg.goto('http://localhost:8211/index.html');await pg.waitForTimeout(1000);
const ok=(n,c)=>console.log((c?'PASS ':'FAIL ')+n);
await pg.click('.ux-bottom-item[data-page="chat"]'); await pg.waitForTimeout(500);
const send=async t=>{await pg.fill('#aiChatInput',t);await pg.click('#aiChatSendBtn');};
const idle=()=>pg.waitForFunction(()=>!aiChatBusy,null,{timeout:20000});
const lastModel=()=>pg.evaluate(()=>{const m=[...loadAIChatHistory()].reverse().find(x=>x.role==='model');return m||null});
// เฝ้าดูกล่องข้อความที่กำลังพิมพ์: จดความยาวข้อความ และช่วงที่ว่างต่อเนื่องนานสุด
await pg.evaluate(()=>{window.__w={max:0,run:0,seen:false,texts:[]};setInterval(()=>{const e=document.querySelector('.ai-chat-msg.is-streaming .ai-chat-bubble');if(!e)return;const n=e.textContent.length;const w=window.__w;if(n>0){w.seen=true;w.run=0;}else if(w.seen){w.run+=40;w.max=Math.max(w.max,w.run);}w.texts.push(n);},40);});
const reset=()=>pg.evaluate(()=>{window.__w={max:0,run:0,seen:false,texts:[]};window.__m.calls=[];window.__m.bodies=[];});

// 1) ปกติ: ถามครั้งเดียว และเพดานความยาวเป็น 8192
await reset(); await pg.evaluate(()=>{window.__m.plan=[{parts:['เดือนนี้จ่ายไป ','11,870 บาท ครับ'],finish:'STOP'}]});
await send('เดือนนี้ใช้เงินไปเท่าไหร่'); await idle(); await pg.waitForTimeout(300);
ok('normal answer: asked once, ceiling is 8192 tokens', (await pg.evaluate(()=>window.__m.calls.join()))==='stream' && (await pg.evaluate(()=>window.__m.bodies[0].generationConfig.maxOutputTokens))===8192);

// 2) ถูกตัดที่เพดาน (ข้อความยาวพอ ท้ายค้าง **) → เก็บไว้ ไม่ถามใหม่ ไม่ว่างจอ
await reset(); const longCut='ภาพรวมเดือนนี้: ค่าหอ 6,200 บาท ของใช้จำเป็น 3,230 บาท หมวดอื่น ๆ รวม 2,440 บาท งบรายจ่ายเหลือ 7,810 บาท **';
await pg.evaluate(t=>{window.__m.plan=[{parts:[t.slice(0,30),t.slice(30)],finish:'MAX_TOKENS'}]},longCut);
await send('สรุปเดือนนี้'); await idle(); await pg.waitForTimeout(300);
const m2=await lastModel(), w2=await pg.evaluate(()=>window.__w);
ok('truncated answer: asked only ONCE (no hidden second request)', (await pg.evaluate(()=>window.__m.calls.length))===1);
ok('truncated answer is kept in full, dangling ** removed', m2 && m2.text===longCut.replace(/\s*\*\*$/,'') );
ok('screen never went blank while it was typing', w2.seen && w2.max<=80);
ok('note under the answer says it was cut and can be regenerated', m2 && /ถูกตัดที่เพดานความยาว กด ตอบใหม่ ได้/.test(m2.timing||'') && /ถูกตัดที่เพดานความยาว/.test(await pg.textContent('.ai-chat-latency')));

// 3) ใช้ไม่ได้จริง (สั้นเกิน) → ถามใหม่ครั้งเดียว: ข้อความเดิมยังอยู่ระหว่างรอ, บรรทัดใต้คำตอบบอก, สุดท้ายได้คำตอบรอบสอง
await reset(); await pg.evaluate(()=>{window.__m.plan=[{parts:['โอเค'],finish:'STOP',wait:50},{parts:['รอบสองตอบครบแล้ว ','จ่ายไปทั้งหมด 11,870 บาท'],finish:'STOP',wait:1500}]});
await send('ขอสรุปอีกที');
await pg.waitForFunction(()=>window.__m.calls.length===2,null,{timeout:8000}); await pg.waitForTimeout(700);
const during=await pg.evaluate(()=>({txt:(document.querySelector('.ai-chat-msg.is-streaming .ai-chat-bubble')||{textContent:''}).textContent.replace(/\s/g,'')}));
ok('while waiting for the 2nd round the first text is still on screen (not wiped)', during.txt.startsWith('โอเค'));
await idle(); await pg.waitForTimeout(300);
const m3=await lastModel(), w3=await pg.evaluate(()=>window.__w);
ok('exactly 2 requests, final answer is the 2nd one', (await pg.evaluate(()=>window.__m.calls.length))===2 && m3.text==='รอบสองตอบครบแล้ว จ่ายไปทั้งหมด 11,870 บาท');
ok('blank gap stays short (the 2nd round types straight away)', w3.max<=200);
ok('the line under the answer tells it was asked again (honest about the longer wait)', /ถามใหม่ 1 รอบ เพราะคำตอบแรกใช้ไม่ได้/.test(m3.timing||'') && /ถามใหม่ 1 รอบ/.test(await pg.textContent('.ai-chat-latency')));

// 4) เศษข้อมูลดิบสั้น ๆ ที่ถูกตัด ไม่ถือว่าเก็บได้ → ถามใหม่
await reset(); await pg.evaluate(()=>{window.__m.plan=[{parts:['Debt: กยศ. 133600'],finish:'MAX_TOKENS'},{parts:['หนี้ กยศ. คงเหลือ 133,600 บาท ครับ'],finish:'STOP'}]});
await send('หนี้เท่าไหร่'); await idle(); await pg.waitForTimeout(300);
ok('raw data fragment is not kept: asked again and the real answer shown', (await pg.evaluate(()=>window.__m.calls.length))===2 && (await lastModel()).text==='หนี้ กยศ. คงเหลือ 133,600 บาท ครับ');

ok('no check marks in the chat', !/[✓✔]/.test(await pg.evaluate(()=>document.getElementById('ux-chat').innerText)));
ok('no native dialogs', native.n===0);
ok('no js errors', errs.length===0); if(errs.length) console.log('- '+errs.join(' | ').slice(0,300));
await b.close(); srv.close();
})();
