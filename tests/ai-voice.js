// เสียงในหน้าแชท (ds96): ปุ่มไมค์ (อัดเสียง → Gemini ถอดเป็นข้อความ → ใส่ช่องพิมพ์ ไม่ส่งเอง ไม่ไป OpenRouter)
// และปุ่ม "อ่าน" ใต้คำตอบ AI (เสียงอ่านของเครื่อง) — ไมค์ใช้อุปกรณ์จำลองของ Chromium, Gemini กับเสียงอ่านเป็นตัวจำลอง
const { chromium } = require('playwright');
const http=require('http'),fs=require('fs'),path=require('path');const root=require('path').resolve(__dirname,'..');
const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png'};
const srv=http.createServer((q,s)=>{let p=q.url.split('?')[0];if(p==='/')p='/index.html';const f=path.join(root,p);fs.readFile(f,(e,d)=>{if(e){s.writeHead(404);s.end();return}s.writeHead(200,{'content-type':types[path.extname(f)]||'text/plain'});s.end(d)})});
const shots=require('os').tmpdir()+'/vaultet-test-shots/'; require('fs').mkdirSync(shots,{recursive:true});
(async()=>{await new Promise(r=>srv.listen(8210,r));
const b=await chromium.launch({...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{}),args:['--no-sandbox','--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream']});
const ctx=await b.newContext({viewport:{width:380,height:820},deviceScaleFactor:2,serviceWorkers:'block',permissions:['microphone']});
const pg=await ctx.newPage();
const errs=[];pg.on('pageerror',e=>errs.push(e.message));pg.on('console',m=>{if(m.type()==='error'&&!/ERR_FAILED/.test(m.text()))errs.push(m.text())});
const T=require('./tlib.js');const native=T.watchNative(pg);
await pg.route(/accounts\.google\.com|fonts\./,r=>r.abort());
await pg.addInitScript(()=>{
 // Gemini จำลอง: window.__v.plan = คิวคำตอบ ({status,text}) ; window.__v.calls = สิ่งที่แอปส่งไป
 window.__v={calls:[],plan:[],spoken:[],cancels:0,voices:[{lang:'th-TH',name:'Thai'}],mute:false};
 const realFetch=window.fetch.bind(window);
 window.fetch=(u,o)=>{u=String(u);
  if(/openrouter\.ai/.test(u)){ window.__v.calls.push({or:true}); return Promise.resolve(new Response('{}',{status:200})); }
  if(!/generativelanguage/.test(u)) return realFetch(u,o);
  let body={};try{body=JSON.parse(o.body)}catch(e){}
  const parts=(body.contents&&body.contents[0]&&body.contents[0].parts)||[];const au=parts.find(p=>p.inline_data);
  window.__v.calls.push({key:(/key=([^&]*)/.exec(u)||[])[1],model:(/models\/([^:]+):/.exec(u)||[])[1],mime:au&&au.inline_data.mime_type,b64:au?au.inline_data.data.length:0,stream:/stream/.test(u)});
  const p=window.__v.plan.shift()||{status:200,text:'กาแฟ 60 บาท'};
  if(p.status!==200) return Promise.resolve(new Response('{"error":{}}',{status:p.status}));
  return Promise.resolve(new Response(JSON.stringify({candidates:[{content:{parts:[{text:p.text}]}}]}),{status:200,headers:{'content-type':'application/json'}}));
 };
 // เสียงอ่านจำลอง
 const stub={getVoices:()=>window.__v.voices,cancel(){window.__v.cancels++;this._q=[];},speak(u){ if(window.__v.mute) return; window.__v.spoken.push({text:u.text,lang:u.lang}); this._q=(this._q||[]).concat(u); if(this._q.length===1) setTimeout(()=>u.onstart&&u.onstart({}),10); },
  finish(){const q=this._q||[];this._q=[];const l=q[q.length-1];l&&l.onend&&l.onend({});},_q:[]};
 try{Object.defineProperty(window,'speechSynthesis',{value:stub,configurable:true});}catch(e){}
 if(localStorage.getItem('__s'))return;localStorage.setItem('__s','1');
 localStorage.setItem('finance_tracker_ai_apikeys_v1',JSON.stringify(['KEY-AAAA1111','KEY-BBBB2222']));
 localStorage.setItem('finance_tracker_accounts_v1',JSON.stringify([{id:'a1',name:'กสิกร',initialBalance:2000}]));
 localStorage.setItem('finance_tracker_entries_v1','[]');});
await pg.goto('http://localhost:8210/index.html');await pg.waitForTimeout(1200);
const ok=(n,c)=>console.log((c?'PASS ':'FAIL ')+n);
const vis=s=>pg.isVisible(s);
const box=s=>pg.evaluate(s=>{const r=document.querySelector(s).getBoundingClientRect();return {x:Math.round(r.x),y:Math.round(r.y),w:Math.round(r.width),h:Math.round(r.height)}},s);

await pg.click('.ux-bottom-item[data-page="chat"]'); await pg.waitForTimeout(500);
// ---- ไมค์ ----
ok('mic button shows in the empty composer, send hidden', await vis('#aiChatMicBtn') && !(await vis('#aiChatSendBtn')));
const rowIdle=await box('.ai-chat-input-row'), micBox=await box('#aiChatMicBtn');
ok('mic is a 40px icon button with an SVG (no emoji)', micBox.w===40&&micBox.h===40&&await pg.evaluate(()=>!!document.querySelector('#aiChatMicBtn svg')&&!document.getElementById('aiChatMicBtn').textContent.trim()));
await pg.screenshot({path:shots+'voice-idle.png'});
await pg.fill('#aiChatInput','ทดสอบ'); await pg.waitForTimeout(100);
const sendBox=await box('#aiChatSendBtn'), rowTyped=await box('.ai-chat-input-row');   // แตะช่องพิมพ์แล้วทั้งแถวเลื่อนตามแป้นพิมพ์ (ของเดิม) จึงเทียบตำแหน่งภายในแถว
ok('typing swaps mic for send in the same spot', !(await vis('#aiChatMicBtn')) && await vis('#aiChatSendBtn') && sendBox.x===micBox.x && sendBox.y-rowTyped.y===micBox.y-rowIdle.y);
await pg.fill('#aiChatInput',''); await pg.evaluate(()=>document.activeElement.blur()); await pg.waitForTimeout(300);
ok('clearing the text brings the mic back', await vis('#aiChatMicBtn'));
await pg.evaluate(()=>{window.__v.calls=[]});   // ล้างการเรียก AI ตอนเปิดแอป (การ์ดสรุป) ออกก่อนนับ
const rowIdle2=await box('.ai-chat-input-row');

await pg.click('#aiChatMicBtn'); await pg.waitForTimeout(1300);
ok('recording: status with running time + cancel, text box hidden', await vis('#aiVoiceStatus') && /^กำลังอัดเสียง 0:0[1-3]$/.test((await pg.textContent('#aiVoiceStatus .v-voice-txt')).trim()) && await vis('.v-voice-cancel') && !(await vis('#aiChatInput')));
const rowRec=await box('.ai-chat-input-row');
ok('composer does not jump while recording', rowRec.y===rowIdle2.y && rowRec.h===rowIdle2.h && (await box('#aiChatMicBtn')).x===micBox.x);
await pg.screenshot({path:shots+'voice-recording.png'});
ok('nothing sent to Gemini while still recording', (await pg.evaluate(()=>window.__v.calls.length))===0);
await pg.click('#aiChatMicBtn'); await pg.waitForFunction(()=>document.getElementById('aiVoiceStatus').hidden,null,{timeout:8000});
const c1=await pg.evaluate(()=>window.__v.calls.slice());
ok('stop sends ONE audio clip to Gemini (same model as chat, first key, not streaming)', c1.length===1 && c1[0].key==='KEY-AAAA1111' && c1[0].model==='gemini-3.8-flash' && !c1[0].stream && /^audio\/(webm|mp4|ogg)$/.test(c1[0].mime) && c1[0].b64>200);
ok('transcript goes into the input, is NOT sent by itself', (await pg.inputValue('#aiChatInput'))==='กาแฟ 60 บาท' && (await pg.locator('.ai-chat-msg').count())===0 && await vis('#aiChatSendBtn') && !(await vis('#aiChatMicBtn')));
ok('microphone released after recording', await pg.evaluate(()=>!document.querySelector('.ai-chat-input-row').classList.contains('v-voice-rec')));
await pg.fill('#aiChatInput',''); await pg.waitForTimeout(100);

// ยกเลิกระหว่างอัด → ไม่ส่งอะไรเลย
await pg.evaluate(()=>{window.__v.calls=[]});
await pg.click('#aiChatMicBtn'); await pg.waitForTimeout(900); await pg.click('.v-voice-cancel'); await pg.waitForTimeout(500);
ok('cancel while recording sends nothing and leaves the input empty', (await pg.evaluate(()=>window.__v.calls.length))===0 && (await pg.inputValue('#aiChatInput'))==='' && await vis('#aiChatMicBtn') && !(await vis('#aiVoiceStatus')));

// คีย์แรกเต็ม → ลองคีย์ถัดไป
await pg.evaluate(()=>{window.__v.calls=[];window.__v.plan=[{status:429},{status:200,text:'"ค่ารถ 45"'}]});
await pg.click('#aiChatMicBtn'); await pg.waitForTimeout(1000); await pg.click('#aiChatMicBtn'); await pg.waitForFunction(()=>document.getElementById('aiVoiceStatus').hidden,null,{timeout:8000});
ok('first key full → next key used, quotes around the transcript removed', (await pg.evaluate(()=>window.__v.calls.map(c=>c.key).join()))==='KEY-AAAA1111,KEY-BBBB2222' && (await pg.inputValue('#aiChatInput'))==='ค่ารถ 45');
await pg.fill('#aiChatInput',''); await pg.waitForTimeout(100);

// ทุกคีย์เต็ม + ตั้ง OpenRouter ไว้ → ไม่ไป OpenRouter (กันเสียเงิน) บอกตรงๆ
await pg.evaluate(()=>{vaultetOR.setKey('or-test'); try{vaultetOR.setModel&&vaultetOR.setModel('x/y')}catch(e){} window.__v.calls=[];window.__v.plan=[{status:429},{status:429}]});
await pg.click('#aiChatMicBtn'); await pg.waitForTimeout(1000); await pg.click('#aiChatMicBtn'); await pg.waitForFunction(()=>document.getElementById('aiVoiceStatus').hidden,null,{timeout:8000});
ok('all keys full: never falls back to OpenRouter, says the free quota is full', (await pg.evaluate(()=>!window.__v.calls.some(c=>c.or)&&window.__v.calls.length===2)) && await vis('#aiChatError') && /โควต้าฟรีของ Gemini เต็ม/.test(await pg.textContent('#aiChatError')) && (await pg.inputValue('#aiChatInput'))==='');

// ไม่มีเสียงพูด
await pg.evaluate(()=>{window.__v.calls=[];window.__v.plan=[{status:200,text:'@@NONE@@'}]});
await pg.click('#aiChatMicBtn'); await pg.waitForTimeout(200);
ok('starting a new recording clears the old error', !(await vis('#aiChatError')));
await pg.waitForTimeout(800); await pg.click('#aiChatMicBtn'); await pg.waitForFunction(()=>document.getElementById('aiVoiceStatus').hidden,null,{timeout:8000});
ok('no speech heard → honest message, nothing typed', /ไม่ได้ยินเสียงพูด/.test(await pg.textContent('#aiChatError')) && (await pg.inputValue('#aiChatInput'))==='');

// ปิดคีย์ Gemini หมด → ไม่อัด ไม่ส่ง
await pg.evaluate(()=>{['KEY-AAAA1111','KEY-BBBB2222'].forEach(k=>setApiKeyOn(k,false));window.__v.calls=[]});
await pg.click('#aiChatMicBtn'); await pg.waitForTimeout(400);
ok('no active Gemini key → does not record, explains why', !(await vis('#aiVoiceStatus')) && /คีย์ Gemini/.test(await pg.textContent('#aiChatError')) && (await pg.evaluate(()=>window.__v.calls.length))===0);
await pg.evaluate(()=>{['KEY-AAAA1111','KEY-BBBB2222'].forEach(k=>setApiKeyOn(k,true));vaultetOR.setKey('');});

// ไม่อนุญาตไมค์
await pg.evaluate(()=>{window.__gum=navigator.mediaDevices.getUserMedia;navigator.mediaDevices.getUserMedia=()=>Promise.reject(Object.assign(new Error('x'),{name:'NotAllowedError'}))});
await pg.click('#aiChatMicBtn'); await pg.waitForTimeout(300);
ok('microphone permission denied → clear message', /ยังไม่ได้อนุญาตให้ใช้ไมโครโฟน/.test(await pg.textContent('#aiChatError')) && !(await vis('#aiVoiceStatus')));
await pg.evaluate(()=>{navigator.mediaDevices.getUserMedia=window.__gum});

// ---- อ่านออกเสียง ----
await pg.evaluate(()=>{ saveAIChatHistory([{role:'user',text:'หนี้เท่าไหร่'},{role:'model',text:'* **ส่องตัวเลขจริง**: ตอนนี้หนี้ กยศ. อยู่ที่ **฿133,600** ต้องเก็บอีก ฿120000+\n\n## ต่อไป\n1. ดันเงินสำรองให้แตะ ฿30000'},{role:'user',text:'โอเค'},{role:'model',text:'ได้เลย'}]); renderAiChatBubbles(); });
await pg.waitForTimeout(300);
ok('every AI answer gets a อ่าน button (my own messages do not)', (await pg.locator('.role-model [data-action="speak"]').count())===2 && (await pg.locator('.role-user [data-action="speak"]').count())===0);
ok('buttons under the last answer fit on one line', await pg.evaluate(()=>{const bs=[...document.querySelectorAll('.ai-chat-msg:last-child .ai-chat-actions button')];const ys=bs.map(b=>Math.round(b.getBoundingClientRect().top));return bs.length===3&&new Set(ys).size===1&&bs[2].getBoundingClientRect().right<=380}));
await pg.click('.ai-chat-msg[data-idx="1"] [data-action="speak"]'); await pg.waitForTimeout(200);
const sp=await pg.evaluate(()=>window.__v.spoken.slice());
ok('reads the answer in Thai without markdown symbols, ฿ spoken as บาท', sp.length===3 && sp.every(s=>s.lang==='th-TH'&&!/[*#฿]/.test(s.text)) && sp[0].text==='ส่องตัวเลขจริง: ตอนนี้หนี้ กยศ. อยู่ที่ 133600 บาท ต้องเก็บอีก 120000 บาทขึ้นไป' && sp[1].text==='ต่อไป' && sp[2].text==='ดันเงินสำรองให้แตะ 30000 บาท');
ok('button turns into หยุดอ่าน while reading (only that one)', (await pg.textContent('.ai-chat-msg[data-idx="1"] [data-action="speak"]')).trim()==='หยุดอ่าน' && (await pg.textContent('.ai-chat-msg[data-idx="3"] [data-action="speak"]')).trim()==='อ่าน');
await pg.screenshot({path:shots+'voice-speaking.png'});
await pg.evaluate(()=>renderAiChatBubbles()); await pg.waitForTimeout(100);
ok('state survives a redraw of the chat', (await pg.textContent('.ai-chat-msg[data-idx="1"] [data-action="speak"]')).trim()==='หยุดอ่าน');
const cz=await pg.evaluate(()=>window.__v.cancels);
await pg.click('.ai-chat-msg[data-idx="1"] [data-action="speak"]'); await pg.waitForTimeout(150);
ok('tapping again stops reading', (await pg.evaluate(()=>window.__v.cancels))>cz && (await pg.textContent('.ai-chat-msg[data-idx="1"] [data-action="speak"]')).trim()==='อ่าน');
await pg.click('.ai-chat-msg[data-idx="3"] [data-action="speak"]'); await pg.waitForTimeout(150);
await pg.evaluate(()=>speechSynthesis.finish()); await pg.waitForTimeout(150);
ok('button goes back to อ่าน when the reading ends by itself', (await pg.textContent('.ai-chat-msg[data-idx="3"] [data-action="speak"]')).trim()==='อ่าน');
await pg.click('.ai-chat-msg[data-idx="3"] [data-action="speak"]'); await pg.waitForTimeout(150);
await pg.click('.ux-bottom-item[data-page="home"]'); await pg.waitForTimeout(1100);
ok('leaving the chat page stops the reading', await pg.evaluate(()=>!document.querySelector('[data-action="speak"].is-speaking')));
await pg.click('.ux-bottom-item[data-page="chat"]'); await pg.waitForTimeout(400);
// เครื่องไม่มีเสียงไทย → บอกตรงๆ ไม่อ่านมั่ว
await pg.evaluate(()=>{window.__v.voices=[{lang:'en-US',name:'English'}];window.__v.spoken=[]});
await pg.click('.ai-chat-msg[data-idx="3"] [data-action="speak"]'); await pg.waitForTimeout(250);
ok('no Thai voice on the device → says so, reads nothing', (await pg.evaluate(()=>window.__v.spoken.length))===0 && /ยังไม่มีเสียงอ่านภาษาไทย/.test(await pg.evaluate(()=>document.body.innerText)));
ok('copy and regenerate still there', (await pg.locator('.ai-chat-msg[data-idx="3"] [data-action="copy"]').count())===1 && (await pg.locator('.ai-chat-msg[data-idx="3"] [data-action="regenerate"]').count())===1);

ok('no check marks or emoji icons in the chat', !/[✓✔✗🎤🔊]/.test(await pg.evaluate(()=>document.getElementById('ux-chat').innerText)));
ok('no new saved keys from voice (nothing extra for backups)', await pg.evaluate(()=>!Object.keys(localStorage).some(k=>/voice|speak|mic/i.test(k))));
ok('no native dialogs', native.n===0);
ok('no js errors', errs.length===0); if(errs.length) console.log('- '+errs.join(' | ').slice(0,300));
await b.close(); srv.close();
})();
