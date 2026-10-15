// OpenRouter: แชทใช้เป็นตัวหลัก, สำรอง Gemini ฟรีที่โควต้าเต็มแบบเงียบ, ถอยรุ่น 3.8→3.6, เพดานค่าใช้จ่าย, หน้าตั้งค่า
// ใช้ fetch จำลองทั้งหมด (ไม่เรียก AI จริง ไม่มีค่าใช้จ่าย)
const { chromium } = require('playwright');
const http=require('http'),fs=require('fs'),path=require('path');const root=require('path').resolve(__dirname,'..');
const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png'};
const srv=http.createServer((q,s)=>{let p=q.url.split('?')[0];if(p==='/')p='/index.html';const f=path.join(root,p);fs.readFile(f,(e,d)=>{if(e){s.writeHead(404);s.end();return}s.writeHead(200,{'content-type':types[path.extname(f)]||'text/plain'});s.end(d)})});
const shots=require('os').tmpdir()+'/vaultet-test-shots/'; require('fs').mkdirSync(shots,{recursive:true});
(async()=>{await new Promise(r=>srv.listen(8187,r));
const b=await chromium.launch({...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{}),args:['--no-sandbox']});
const pg=await (await b.newContext({viewport:{width:380,height:820},deviceScaleFactor:2,serviceWorkers:'block'})).newPage();
const errs=[];pg.on('pageerror',e=>errs.push(e.message));pg.on('console',m=>{if(m.type()==='error'&&!/ERR_FAILED|Failed to load resource/.test(m.text()))errs.push(m.text())});
const T=require('./tlib.js');const native=T.watchNative(pg);
await pg.route(/accounts\.google\.com|fonts\./,r=>r.abort());
await pg.addInitScript(()=>{
  if(localStorage.getItem('__s'))return;localStorage.setItem('__s','1');
  localStorage.setItem('finance_tracker_ai_apikeys_v1',JSON.stringify(['G-KEY-1','G-KEY-2']));
  localStorage.setItem('finance_tracker_accounts_v1',JSON.stringify([{id:'a1',name:'กสิกร',openingBalance:20000}]));
  const real=window.fetch.bind(window);
  const M=window.__m={calls:[],orBodies:[],orAuth:[],orFail:false,gem429:false,gem404:false,orDelay:60,usage:{day:0.43,month:2.51},orText:'ตอบจาก OpenRouter ครับ ',gemText:'ตอบจาก Gemini ฟรี '};
  const enc=new TextEncoder(), json=(o,s=200)=>Promise.resolve(new Response(JSON.stringify(o),{status:s,headers:{'content-type':'application/json'}}));
  const sse=(chunks,delay,sig)=>new ReadableStream({start(c){let i=0,dead=false;sig&&sig.addEventListener('abort',()=>{if(!dead){dead=true;try{c.error(new DOMException('Aborted','AbortError'))}catch(e){}}});const tick=()=>{if(dead)return;if(i<chunks.length){c.enqueue(enc.encode(chunks[i]));i++;setTimeout(tick,delay)}else{dead=true;c.close()}};tick();}});
  window.fetch=(url,opts)=>{
    const u=String(url); opts=opts||{};
    if(/openrouter\.ai\/api\/v1\/key/.test(u)) return json({data:{usage:5,usage_daily:M.usage.day,usage_weekly:1,usage_monthly:M.usage.month,limit:null,limit_remaining:null}});
    if(/openrouter\.ai\/api\/v1\/models/.test(u)) return json({data:[
      {id:'anthropic/claude-haiku-x',name:'Claude Haiku X',pricing:{prompt:'0.000001',completion:'0.000005'},architecture:{output_modalities:['text']},context_length:200000},
      {id:'openai/gpt-mini-x',name:'GPT Mini X',pricing:{prompt:'0.0000004',completion:'0.0000016'},architecture:{output_modalities:['text']},context_length:128000},
      {id:'google/gemini-3.8-flash',name:'Gemini 3.8 Flash',pricing:{prompt:'0.000000375',completion:'0.000001875'},architecture:{output_modalities:['text']},context_length:1000000},
      {id:'google/gemini-3.8-flash:batch',name:'Gemini 3.8 Flash (batch)',pricing:{prompt:'0.000000375',completion:'0.000001875'},architecture:{output_modalities:['text']},context_length:1000000},
      {id:'img/only',name:'Image Only',pricing:{prompt:'0.1',completion:'0.1'},architecture:{output_modalities:['image']}}]});
    if(/openrouter\.ai\/api\/v1\/chat\/completions/.test(u)){
      const body=JSON.parse(opts.body); M.calls.push('OR '+body.model+(body.stream?' stream':'')); M.orBodies.push(body); M.orAuth.push((opts.headers||{}).Authorization);
      if(M.orFail) return Promise.resolve(new Response('boom',{status:500}));
      if(body.stream){ const parts=M.orText.split('|').filter(Boolean); const ch=parts.map(t=>'data: '+JSON.stringify({choices:[{delta:{content:t},finish_reason:null}]})+'\n\n'); ch.unshift(': OPENROUTER PROCESSING\n\n'); ch.push('data: '+JSON.stringify({choices:[{delta:{content:''},finish_reason:'stop'}]})+'\n\n','data: [DONE]\n\n'); return Promise.resolve(new Response(sse(ch,M.orDelay,opts.signal),{status:200,headers:{'content-type':'text/event-stream'}})); }
      return json({choices:[{message:{content:M.orText},finish_reason:'stop'}]});
    }
    if(/generativelanguage/.test(u)){
      const model=(u.match(/models\/([^:]+):/)||[])[1]; const st=/streamGenerateContent/.test(u);
      M.calls.push('GEM '+model+(st?' stream':''));
      if(M.gem404 && /3\.8/.test(model)) return Promise.resolve(new Response('{"error":{"code":404}}',{status:404}));
      if(M.gem429) return Promise.resolve(new Response('{"error":{"code":429}}',{status:429}));
      if(st){ const j={candidates:[{content:{parts:[{text:M.gemText}]},finishReason:'STOP'}]}; return Promise.resolve(new Response(sse(['data: '+JSON.stringify(j)+'\r\n\r\n'],50,opts.signal),{status:200,headers:{'content-type':'text/event-stream'}})); }
      return json({candidates:[{content:{parts:[{text:M.gemText}]},finishReason:'STOP'}]});
    }
    return real(url,opts);
  };
});
await pg.goto('http://localhost:8187/index.html');await pg.waitForTimeout(1000);
const ok=(n,c)=>console.log((c?'PASS ':'FAIL ')+n);
const calls=()=>pg.evaluate(()=>window.__m.calls.slice());
const reset=()=>pg.evaluate(()=>{window.__m.calls=[];window.__m.orBodies=[];window.__m.orAuth=[];});
const send=async t=>{ await pg.fill('#aiChatInput',t); await pg.click('#aiChatSendBtn'); };
const lastModel=()=>pg.evaluate(()=>{const h=loadAIChatHistory();const m=[...h].reverse().find(x=>x.role==='model');return m?m.text:null});
const setOR=(o)=>pg.evaluate(o=>{const R=vaultetOR;if(o.key!==undefined)R.setKey(o.key);if(o.model!==undefined)R.setModel(o.model);if(o.small!==undefined)R.setSmallModel(o.small);if(o.caps)R.setCaps(o.caps[0],o.caps[1]);},o);

// 1) ค่าเริ่มต้น: Gemini รุ่น 3.8 flash ทุกงาน
await pg.evaluate(()=>vaultetGo('chat')); await pg.waitForTimeout(400);
ok('Gemini default model is 3.8 flash', await pg.evaluate(()=>aiModelId())==='gemini-3.8-flash');
await reset(); await send('ทดสอบ Gemini อย่างเดียว'); await pg.waitForTimeout(1500);
const c1=await calls();
ok('without OpenRouter the chat streams from Gemini 3.8 ('+c1.join(', ')+')', c1.some(c=>/GEM gemini-3\.8-flash stream/.test(c)) && !c1.some(c=>c.startsWith('OR')));
ok('...and the reply is saved', (await lastModel())?.includes('ตอบจาก Gemini'));

// 2) ตั้ง OpenRouter ไว้แล้ว แต่ Gemini ฟรียังใช้ได้ → ใช้ Gemini ฟรีก่อน ไม่แตะ OpenRouter เลย
await setOR({key:'sk-or-test-123',model:'anthropic/claude-haiku-x'});
await pg.click('#uxChatNewBtn'); await pg.waitForTimeout(300); await reset();
await send('ทดสอบ Gemini ก่อน'); await pg.waitForTimeout(1500);
const c2=await calls();
ok('free Gemini is used first even though OpenRouter is configured ('+c2.join(', ')+')', c2.some(c=>/GEM gemini-3\.8-flash stream/.test(c)) && !c2.some(c=>c.startsWith('OR')));

// 3) โควต้า Gemini ฟรีเต็มทุกคีย์ → แชทสลับไป OpenRouter เงียบๆ (สตรีม) ไม่มีกล่องแจ้ง
await pg.evaluate(()=>{window.__m.gem429=true;window.__m.orText='ตอบจาก |OpenRouter |ที่สตรีมมา ครับ\n@@MEMORY_ADD@@ ชอบใช้ OpenRouter';});
await pg.click('#uxChatNewBtn'); await pg.waitForTimeout(300); await reset();
await send('ทดสอบโควต้าเต็ม'); await pg.waitForTimeout(2500);
const c3=await calls();
ok('both free keys hit 429, then OpenRouter streamed the answer ('+c3.join(', ')+')', c3.filter(c=>c.startsWith('GEM')).length===2 && c3.at(-1)==='OR anthropic/claude-haiku-x stream');
const a3=await pg.evaluate(()=>window.__m.orAuth[0]); ok('the key is sent as a Bearer token', a3==='Bearer sk-or-test-123');
const body3=await pg.evaluate(()=>window.__m.orBodies[0]);
ok('request converted to OpenAI format (system + user messages)', body3.messages[0].role==='system' && body3.messages.at(-1).role==='user' && /ทดสอบโควต้าเต็ม/.test(body3.messages.at(-1).content));
const m3=await lastModel(); ok('streamed OpenRouter reply saved clean (no directive line)', m3 && m3.includes('ที่สตรีมมา') && !m3.includes('@@'));
ok('memory directive from the OpenRouter reply was applied', (await pg.evaluate(()=>JSON.parse(localStorage.getItem('finance_tracker_ai_memory_v1')||'[]'))).some(x=>/ชอบใช้ OpenRouter/.test(x.text)));
ok('no error box shown during the silent switch', !(await pg.isVisible('#aiChatError')));
// ข้อความถัดไป: พัก Gemini ชั่วครู่ ไม่ต้องรอล้มซ้ำ
await pg.evaluate(()=>{window.__m.orText='ตอบรอบสองจาก OpenRouter ที่ไม่ต้องรอ Gemini ล้ม ครับ';}); await pg.click('#uxChatNewBtn'); await pg.waitForTimeout(300); await reset();
await send('ข้อความที่สอง'); await pg.waitForTimeout(2000);
const c3b=await calls();
ok('next message goes straight to OpenRouter during the cooldown ('+c3b.join(', ')+')', c3b.length===1 && c3b[0].startsWith('OR '));
// ทั้งคู่ล้มเหลว → ขึ้นข้อความผิดพลาดปกติ
await pg.evaluate(()=>{geminiCooldownUntil=0;window.__m.orFail=true;}); await pg.click('#uxChatNewBtn'); await pg.waitForTimeout(300); await reset();
await send('ล้มทั้งคู่'); await pg.waitForTimeout(1800);
ok('when both fail the usual error is shown and the input is usable again', (await pg.isVisible('#aiChatError')) && !(await pg.evaluate(()=>document.getElementById('aiChatInput').disabled)));
await pg.evaluate(()=>{window.__m.orFail=false;window.__m.gem429=false;geminiCooldownUntil=0;});

// 4) โควต้า Gemini ฟรีเต็มทุกคีย์ → งานเล็กสลับไป OpenRouter เงียบๆ + แปลง JSON mode
await setOR({small:'openai/gpt-mini-x'});
await pg.evaluate(()=>{window.__m.gem429=true;window.__m.orText='{"action":"expense","amount":60}';}); await reset();
const r4=await pg.evaluate(async()=>{const res=await fetchGeminiWithRetry(k=>`https://generativelanguage.googleapis.com/v1beta/models/${aiModelId()}:generateContent?key=${k}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({contents:[{role:'user',parts:[{text:'กินข้าว 60'}]}],systemInstruction:{parts:[{text:'แปลงเป็นรายการ'}]},generationConfig:{response_mime_type:'application/json',response_schema:{type:'OBJECT'}}})},0);return {ok:res.ok,j:await res.json()};});
const c4=await calls();
ok('both Gemini keys tried (429) then OpenRouter small-task model used ('+c4.join(', ')+')', c4.filter(c=>c.startsWith('GEM')).length===2 && c4.at(-1)==='OR openai/gpt-mini-x');
ok('the result comes back in Gemini shape so callers need no change', r4.ok && r4.j.candidates[0].content.parts[0].text.includes('"action":"expense"'));
const b4=await pg.evaluate(()=>window.__m.orBodies.at(-1));
ok('JSON mode translated (response_format + schema hint in the system prompt)', b4.response_format?.type==='json_object' && /JSON/.test(b4.messages[0].content));
await pg.evaluate(()=>{window.__m.gem429=false;});

// 5) เพดานค่าใช้จ่าย: เกินแล้วไม่สลับไป OpenRouter (แม้ Gemini ฟรีเต็ม)
await setOR({caps:[0.40,0]}); await pg.evaluate(async()=>{await vaultetOR.refreshUsage(true);});
ok('usage read from OpenRouter /key (today $0.43, month $2.51)', await pg.evaluate(()=>{const u=vaultetOR.usageCache();return u.day===0.43&&u.month===2.51}));
ok('over the daily cap is detected', await pg.evaluate(()=>vaultetOR.overCap()));
await pg.evaluate(()=>{window.__m.gem429=true;geminiCooldownUntil=0;}); await pg.click('#uxChatNewBtn'); await pg.waitForTimeout(300); await reset();
await send('ทดสอบเพดาน'); await pg.waitForTimeout(1800);
const c5=await calls();
ok('over the cap + free quota full → OpenRouter is NOT called ('+c5.join(', ')+')', !c5.some(c=>c.startsWith('OR ')) && c5.some(c=>c.startsWith('GEM')));
await pg.evaluate(()=>{window.__m.gem429=false;});
await setOR({caps:[0,0]});

// 6) Gemini ยังไม่มีรุ่น 3.8 (404) → ถอยไป 3.6 เองครั้งเดียว
await setOR({key:'',model:''}); await pg.evaluate(()=>{window.__m.gem404=true;localStorage.removeItem('vaultet_gemini_model_v1');}); await reset();
const r6=await pg.evaluate(async()=>{const res=await fetchGeminiWithRetry(k=>`https://generativelanguage.googleapis.com/v1beta/models/${aiModelId()}:generateContent?key=${k}`,{method:'POST',headers:{},body:'{"contents":[{"role":"user","parts":[{"text":"x"}]}]}'},0);return res.status;});
const c6=await calls();
ok('404 on 3.8 → silently retried on 3.6 ('+c6.join(', ')+') status '+r6, r6===200 && c6[0]==='GEM gemini-3.8-flash' && c6[1]==='GEM gemini-3.6-flash');
ok('the fallback model is remembered', await pg.evaluate(()=>aiModelId())==='gemini-3.6-flash');
await pg.evaluate(()=>{window.__m.gem404=false;localStorage.removeItem('vaultet_gemini_model_v1');});

// 7) ความปลอดภัยของคีย์ + พร้อมใช้งาน
ok('the OpenRouter key is excluded from backups', await pg.evaluate(()=>VAULTET_BACKUP_EXCLUDED_KEYS.has('vaultet_or_key_v1')));
await pg.evaluate(()=>{localStorage.setItem('finance_tracker_ai_apikeys_v1','[]');vaultetOR.setKey('sk-or-x');vaultetOR.setModel('openai/gpt-mini-x');});
ok('AI counts as available with only OpenRouter configured', await pg.evaluate(()=>aiAvailable()));
await pg.evaluate(()=>{vaultetOR.setModel('');});
ok('...but not with a key and no model', !(await pg.evaluate(()=>aiAvailable())));
await pg.evaluate(()=>{localStorage.setItem('finance_tracker_ai_apikeys_v1',JSON.stringify(['G-KEY-1']));vaultetOR.setKey('');});

// 8) หน้าตั้งค่า: การ์ด, เลือกโมเดลจากรายการพร้อมราคา, เพดาน
await pg.evaluate(()=>vaultetGo('more')); await pg.waitForTimeout(300);
ok('Settings has an OpenRouter row under AI', (await pg.textContent('#vSetOR')).includes('OpenRouter'));
await pg.click('#vSetOR'); await pg.waitForTimeout(400);
const cards=await pg.evaluate(()=>[...document.querySelectorAll('#settingsOverlay > .sheet-modal > .settings-card')].filter(c=>getComputedStyle(c).display!=='none').map(c=>c.querySelector('.settings-card-title').textContent));
ok('the row opens only the OpenRouter card ('+cards.join('|')+')', cards.length===1 && /OpenRouter/.test(cards[0]));
await pg.fill('#orKeyInput','sk-or-ui-key'); await pg.click('#orKeySave'); await pg.waitForTimeout(500);
ok('key saved from the UI', await pg.evaluate(()=>vaultetOR.key())==='sk-or-ui-key');
ok('status asks for a model next', (await pg.textContent('#orStatus')).includes('ยังไม่ได้เลือกโมเดล'));
await pg.click('#orModelBtn'); await pg.waitForSelector('.v-or-row'); await pg.waitForTimeout(200);
const rows=await pg.locator('.v-or-row').allTextContents();
ok('picker lists text models with live prices, hides image-only ('+rows.length+' rows)', rows.length===3 && rows.some(t=>t.includes('Claude Haiku X')&&t.includes('$1.00')&&t.includes('$5.00')) && !rows.some(t=>t.includes('Image Only')));
ok('the :batch variant is hidden by default', !rows.some(t=>t.includes(':batch')));
await pg.click('.v-or-toggle'); await pg.waitForTimeout(150);
ok('the toggle reveals the :batch variant', (await pg.locator('.v-or-row').allTextContents()).some(t=>t.includes(':batch')));
await pg.click('.v-or-toggle'); await pg.waitForTimeout(150);
await pg.fill('.v-or-pick input[type=search]','gpt'); await pg.waitForTimeout(150);
ok('search filters the list', (await pg.locator('.v-or-row').count())===1);
await pg.screenshot({path:shots+'or-picker.png'});
await pg.click('.v-or-row'); await pg.waitForTimeout(400);
ok('choosing a model saves it and activates OpenRouter', await pg.evaluate(()=>vaultetOR.model()==='openai/gpt-mini-x' && vaultetOR.enabled()));
ok('price shown under the chosen model', (await pg.textContent('#orModelInfo')).includes('$0.400'));
await pg.fill('#orCapDay','5'); await pg.fill('#orCapMonth','20'); await pg.dispatchEvent('#orCapMonth','change'); await pg.waitForTimeout(300);
ok('caps saved from the UI', await pg.evaluate(()=>{const c=vaultetOR.caps();return c.day===5&&c.month===20}));
await pg.evaluate(async()=>{await vaultetOR.refreshUsage(true);}); await pg.waitForTimeout(400);
ok('usage rows show real usage against the caps', (await pg.textContent('#orUsage')).includes('$0.43 / $5.00') && (await pg.textContent('#orUsage')).includes('$2.51 / $20.00'));
await pg.screenshot({path:shots+'or-card.png'});
// ค่า AI โชว์บนหน้าตั้งค่าเลย ไม่ต้องกดเข้า OpenRouter
await pg.evaluate(()=>document.querySelectorAll('.open').forEach(e=>e.classList.remove('open'))); await pg.waitForTimeout(300);
await pg.evaluate(()=>vaultetGo('home')); await pg.evaluate(()=>vaultetGo('more')); await pg.waitForTimeout(700);
ok('the AI group is the first group on the Settings page', (await pg.locator('#ux-more .v-group-title').first().textContent())==='AI');
ok('settings page shows the AI cost directly (visible without opening anything)', await pg.isVisible('#vSetAiCost'));
const costTxt=await pg.textContent('#vSetAiCost');
ok('...today $0.43 / $5.00 and month $2.51 / $20.00 ('+costTxt.replace(/\s+/g,' ').trim()+')', costTxt.includes('$0.43 / $5.00') && costTxt.includes('$2.51 / $20.00'));
await pg.screenshot({path:shots+'or-settings-cost.png'});
await pg.evaluate(()=>{vaultetOR.setKey('');}); await pg.evaluate(()=>vaultetGo('home')); await pg.evaluate(()=>vaultetGo('more')); await pg.waitForTimeout(500);
ok('without an OpenRouter key the cost block is hidden', !(await pg.isVisible('#vSetAiCost')));

ok('no native browser dialogs ('+native.msgs.join(' | ')+')', native.n===0);
console.log(errs.join('\n')||'no js errors');
await b.close();srv.close()})();
