// สวิตช์เปิด/ปิดคีย์ Gemini เป็นรายตัว: ข้ามคีย์ที่ปิด, ปิดหมดแล้วไป OpenRouter ทันที, ไม่เข้าไฟล์สำรอง
// ใช้ fetch จำลองทั้งหมด (ไม่เรียก AI จริง ไม่มีค่าใช้จ่าย)
const { chromium } = require('playwright');
const http=require('http'),fs=require('fs'),path=require('path');const root=require('path').resolve(__dirname,'..');
const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png'};
const srv=http.createServer((q,s)=>{let p=q.url.split('?')[0];if(p==='/')p='/index.html';const f=path.join(root,p);fs.readFile(f,(e,d)=>{if(e){s.writeHead(404);s.end();return}s.writeHead(200,{'content-type':types[path.extname(f)]||'text/plain'});s.end(d)})});
(async()=>{await new Promise(r=>srv.listen(8199,r));
const b=await chromium.launch({...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{}),args:['--no-sandbox']});
const pg=await (await b.newContext({viewport:{width:380,height:820},serviceWorkers:'block'})).newPage();
const errs=[];pg.on('pageerror',e=>errs.push(e.message));pg.on('console',m=>{if(m.type()==='error'&&!/ERR_FAILED|Failed to load resource/.test(m.text()))errs.push(m.text())});
await pg.route(/accounts\.google\.com|fonts\./,r=>r.abort());
await pg.addInitScript(()=>{
  if(localStorage.getItem('__s'))return;localStorage.setItem('__s','1');
  localStorage.setItem('finance_tracker_ai_apikeys_v1',JSON.stringify(['KEY-AAAA1111','KEY-BBBB2222','KEY-CCCC3333']));
  localStorage.setItem('finance_tracker_accounts_v1',JSON.stringify([{id:'a1',name:'กสิกร',openingBalance:20000}]));
  const real=window.fetch.bind(window);
  window.__calls=[];
  window.fetch=(url,opts)=>{
    const u=String(url);
    if(/openrouter\.ai\/api\/v1\/chat\/completions/.test(u)){ window.__calls.push('OR'); return Promise.resolve(new Response(JSON.stringify({choices:[{message:{content:'จาก OR'},finish_reason:'stop'}]}),{status:200,headers:{'content-type':'application/json'}})); }
    if(/openrouter\.ai/.test(u)) return Promise.resolve(new Response(JSON.stringify({data:{}}),{status:200}));
    if(!/generativelanguage/.test(u)) return real(url,opts);
    const k=(/key=([^&]*)/.exec(u)||[])[1]; window.__calls.push(k);
    if(window.__full && window.__full.includes(k)) return Promise.resolve(new Response('quota',{status:429}));
    return Promise.resolve(new Response(JSON.stringify({candidates:[{content:{parts:[{text:'จาก Gemini'}]},finishReason:'STOP'}]}),{status:200}));
  };
});
const T=require('./tlib.js');T.watchNative(pg);
await pg.goto('http://localhost:8197/index.html'.replace('8197','8199'));await pg.waitForTimeout(1000);
const ok=(n,c)=>console.log((c?'PASS ':'FAIL ')+n);
const call=()=>pg.evaluate(async()=>{window.__calls=[];const r=await fetchGeminiWithRetry(k=>'https://generativelanguage.googleapis.com/v1beta/models/m:generateContent?key='+k,{method:'POST',body:'{}'},0);return {calls:window.__calls.slice(),status:r.status};});
// ปกติ: ใช้คีย์แรก
let r=await call(); ok('ปกติใช้คีย์ 1',r.calls.join()==='KEY-AAAA1111');
// ปิดคีย์ 1 → ข้ามไปคีย์ 2
await pg.evaluate(()=>setApiKeyOn('KEY-AAAA1111',false));
r=await call(); ok('ปิดคีย์ 1 แล้วข้ามไปคีย์ 2',r.calls.join()==='KEY-BBBB2222');
// ปิดคีย์ 2 ที่เหลือคีย์ 3 ที่เต็ม → ไม่แตะคีย์ที่ปิด
await pg.evaluate(()=>{setApiKeyOn('KEY-BBBB2222',false);window.__full=['KEY-CCCC3333'];});
r=await call(); ok('ลองเฉพาะคีย์ที่เปิด (คีย์ 3)',r.calls.join()==='KEY-CCCC3333');
ok('aiAvailable ยังจริง (เหลือ 1 คีย์)',await pg.evaluate(()=>aiAvailable()));
// ปิดหมด + ไม่มี OpenRouter → ใช้ AI ไม่ได้
await pg.evaluate(()=>{setApiKeyOn('KEY-CCCC3333',false);window.__full=null;});
ok('ปิดทุกคีย์ ไม่มี OpenRouter → aiAvailable เป็นเท็จ',await pg.evaluate(()=>!aiAvailable()));
r=await call(); ok('ปิดทุกคีย์ ไม่ยิง Gemini เลย',!r.calls.some(c=>/KEY-/.test(c))&&r.status===503);
ok('สรุปในหน้าตั้งค่าบอก AI ใช้ไม่ได้',await pg.evaluate(()=>/ปิดทุกคีย์ · AI ใช้ไม่ได้/.test(aiGeminiSummary())));
// ตั้ง OpenRouter → ปิดหมดแล้วไป OR ทันที
await pg.evaluate(()=>{vaultetOR.setKey('or-test');vaultetOR.setModel('openai/gpt-mini-x');});
ok('มี OpenRouter → aiAvailable จริง',await pg.evaluate(()=>aiAvailable()));
r=await call(); ok('ปิดทุกคีย์ → ไป OpenRouter ทันที ไม่ยิง Gemini',r.calls.join()==='OR');
ok('สรุปบอกใช้ OpenRouter',await pg.evaluate(()=>/ปิดทุกคีย์ · ใช้ OpenRouter/.test(aiGeminiSummary())));
// UI: สวิตช์ในรายการคีย์
await pg.evaluate(()=>{renderApiKeyList();refreshApiKeyStatus();});
ok('มีสวิตช์ครบ 3 อัน และปิดอยู่ทั้งหมด',await pg.evaluate(()=>{const s=[...document.querySelectorAll('#apiKeyList .api-key-switch')];return s.length===3&&s.every(x=>!x.checked)}));
ok('หัวข้อบอก เปิด 0 จาก 3',await pg.evaluate(()=>/เปิด 0 จาก 3 คีย์/.test(document.getElementById('apiKeyStatus').textContent)));
await pg.evaluate(()=>{const s=document.querySelectorAll('#apiKeyList .api-key-switch')[1];s.checked=true;s.dispatchEvent(new Event('change',{bubbles:true}));});
ok('เปิดคีย์ 2 ผ่านสวิตช์ ใช้ได้จริง',await pg.evaluate(()=>isApiKeyOn('KEY-BBBB2222')&&!isApiKeyOn('KEY-AAAA1111')));
r=await call(); ok('เปิดคีย์ 2 แล้วยิง Gemini คีย์ 2',r.calls.join()==='KEY-BBBB2222');
ok('หัวข้อบอก เปิด 1 จาก 3',await pg.evaluate(()=>/เปิด 1 จาก 3 คีย์/.test(document.getElementById('apiKeyStatus').textContent)));
// ลบคีย์ → เคลียร์สถานะปิดของคีย์นั้น
await pg.evaluate(()=>{document.querySelectorAll('#apiKeyList .delete-api-key-btn')[0].click();});
ok('ลบคีย์ที่ปิดอยู่ แล้วสถานะปิดของมันหาย',await pg.evaluate(()=>!loadApiKeyOff().includes('AAAA1111'.slice(-8))&&getApiKeys().length===2));
// ไม่เข้าไฟล์สำรอง และคงอยู่หลังรีโหลด
ok('สถานะปิดไม่เข้าไฟล์สำรอง',await pg.evaluate(()=>!shouldBackupLocalStorageKey('vaultet_ai_keyoff_local')));
await pg.reload();await pg.waitForTimeout(800);
ok('จำสถานะหลังเปิดแอปใหม่',await pg.evaluate(()=>isApiKeyOn('KEY-BBBB2222')&&!isApiKeyOn('KEY-CCCC3333')));
ok('ไม่มี error',errs.length===0);
await b.close();srv.close();
})();
