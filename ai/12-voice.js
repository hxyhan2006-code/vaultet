// Vaultet — ai/12-voice.js : เสียงในหน้าแชท (ds96)
// 1) ปุ่มไมค์: อัดเสียง → ส่งให้ Gemini ถอดเป็นข้อความ → ใส่ในช่องพิมพ์ (ไม่ส่งเอง กดส่งเองทุกครั้ง)
//    ใช้คีย์ Gemini ฟรีเท่านั้น ไม่สลับไป OpenRouter (กันเสียเงินโดยไม่ตั้งใจ)
// 2) ปุ่ม "อ่าน" ใต้คำตอบ AI: ใช้เสียงอ่านของเครื่อง (ไม่เรียก AI ไม่ใช้โควต้า)
(function(){
  const row = document.querySelector(".ai-chat-input-row");
  const input = document.getElementById("aiChatInput");
  const sendBtn = document.getElementById("aiChatSendBtn");
  const errBox = document.getElementById("aiChatError");
  const IC_MIC = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.500 11a6.500 6.500 0 0013 0M12 17.500V21"/></svg>';
  const IC_STOP = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="7" y="7" width="10" height="10" rx="2"/></svg>';
  const IC_SPEAK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9.500v5h3.500L12 18.500v-13L7.500 9.500z"/><path d="M15.500 9a4.200 4.200 0 010 6M18 6.500a7.800 7.800 0 010 11"/></svg>';
  function say(msg){ if(typeof showToast === "function") showToast(msg); }
  function showErr(msg){ if(!errBox) return; errBox.textContent = msg; errBox.style.display = "block"; }
  function hideErr(){ if(errBox) errBox.style.display = "none"; }

  // ===================== ไมค์ =====================
  const MAX_MS = 60000, MIN_MS = 700;
  const canRecord = !!(row && input && sendBtn && navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.MediaRecorder);
  let mic = null, statusEl = null, statusTxt = null;
  let rec = null;        // { recorder, stream, chunks, startedAt, tick, cancelled }
  let working = null;    // AbortController ระหว่างถอดเสียง

  function pickMime(){
    const list = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"];
    for(const m of list){ try{ if(MediaRecorder.isTypeSupported(m)) return m; }catch(e){} }
    return "";
  }
  function setMode(mode){   // idle | rec | work
    row.classList.toggle("v-voice-rec", mode === "rec");
    row.classList.toggle("v-voice-work", mode === "work");
    statusEl.hidden = mode === "idle";
    mic.innerHTML = mode === "idle" ? IC_MIC : IC_STOP;
    const label = mode === "rec" ? "หยุดแล้วถอดเป็นข้อความ" : mode === "work" ? "กำลังถอดเสียง" : "พูดแทนพิมพ์";
    mic.title = label; mic.setAttribute("aria-label", label);
    mic.disabled = mode === "work";
    if(mode === "work") statusTxt.textContent = "กำลังถอดเสียงเป็นข้อความ";
    syncMic();
  }
  function syncMic(){
    if(!mic) return;
    const active = !!rec || !!working;
    const sendShown = !sendBtn.classList.contains("is-composer-empty");
    mic.hidden = !active && sendShown;
  }
  function fmt(ms){ const s = Math.floor(ms / 1000); return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0"); }
  function paintRec(){ if(rec) statusTxt.textContent = "กำลังอัดเสียง " + fmt(Date.now() - rec.startedAt); }

  async function startRec(){
    hideErr();
    if(!getApiKeys().some(isApiKeyOn)){ showErr("ไมค์ใช้คีย์ Gemini ถอดเสียง — ตอนนี้ยังไม่มีคีย์ Gemini ที่เปิดใช้อยู่"); return; }
    let stream;
    try{ stream = await navigator.mediaDevices.getUserMedia({ audio: true }); }
    catch(e){
      const n = e && e.name;
      showErr(n === "NotAllowedError" || n === "SecurityError" ? "ยังไม่ได้อนุญาตให้ใช้ไมโครโฟน — เปิดสิทธิ์ไมโครโฟนของเว็บนี้ในเบราว์เซอร์ก่อน"
        : n === "NotFoundError" ? "ไม่พบไมโครโฟนในเครื่องนี้" : "เปิดไมโครโฟนไม่ได้ (" + (n || "ไม่ทราบสาเหตุ") + ")");
      return;
    }
    let recorder;
    try{ const m = pickMime(); recorder = new MediaRecorder(stream, m ? { mimeType: m, audioBitsPerSecond: 32000 } : { audioBitsPerSecond: 32000 }); }
    catch(e){ stream.getTracks().forEach(t => t.stop()); showErr("เบราว์เซอร์นี้อัดเสียงไม่ได้"); return; }
    const r = rec = { recorder, stream, chunks: [], startedAt: Date.now(), cancelled: false, tick: 0 };
    recorder.addEventListener("dataavailable", e => { if(e.data && e.data.size) r.chunks.push(e.data); });
    recorder.addEventListener("stop", () => finishRec(r));
    recorder.start();
    r.tick = setInterval(() => { paintRec(); if(Date.now() - r.startedAt >= MAX_MS) stopRec(false); }, 250);
    setMode("rec"); paintRec();
  }
  function stopRec(cancel){
    if(!rec) return;
    rec.cancelled = !!cancel;
    try{ if(rec.recorder.state !== "inactive") rec.recorder.stop(); else finishRec(rec); }catch(e){ finishRec(rec); }
  }
  async function finishRec(r){
    if(r.done) return; r.done = true;
    clearInterval(r.tick);
    r.stream.getTracks().forEach(t => t.stop());
    const ms = Date.now() - r.startedAt;
    if(rec === r) rec = null;
    if(r.cancelled){ setMode("idle"); return; }
    const type = String(r.recorder.mimeType || (r.chunks[0] && r.chunks[0].type) || "audio/webm").split(";")[0];
    const blob = new Blob(r.chunks, { type });
    if(ms < MIN_MS || !blob.size){ setMode("idle"); showErr("อัดเสียงสั้นเกินไป ลองกดไมค์แล้วพูดใหม่"); return; }
    working = new AbortController();
    setMode("work");
    const out = await transcribe(blob, type, working.signal);
    working = null;
    setMode("idle");
    if(out.error === "aborted") return;
    if(!out.ok){ showErr(out.msg); return; }
    input.value = out.text;
    input.dispatchEvent(new Event("input", { bubbles: true }));
  }
  function blobToBase64(blob){
    return new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(String(fr.result).split(",")[1] || ""); fr.onerror = () => rej(fr.error); fr.readAsDataURL(blob); });
  }
  // ส่งเสียงให้ Gemini (รุ่นเดียวกับแชท) ถอดเป็นข้อความ — หมุนคีย์เมื่อเต็ม/ไม่ว่าง เหมือนการเรียกอื่น แต่ไม่ไป OpenRouter
  async function transcribe(blob, mime, signal){
    let data;
    try{ data = await blobToBase64(blob); }catch(e){ return { ok: false, msg: "อ่านไฟล์เสียงที่อัดไว้ไม่ได้" }; }
    const body = JSON.stringify({
      contents: [{ role: "user", parts: [
        { inline_data: { mime_type: mime, data } },
        { text: "ถอดเสียงพูดในคลิปนี้เป็นข้อความตามที่พูดจริงทุกคำ (ส่วนใหญ่เป็นภาษาไทย อาจมีคำอังกฤษปน) จำนวนเงินและตัวเลขให้เขียนเป็นเลขอารบิก ตอบเฉพาะข้อความที่ถอดได้เท่านั้น ห้ามตอบคำถาม ห้ามอธิบาย ห้ามเติมคำที่ไม่ได้พูด ถ้าไม่มีเสียงพูดเลยให้ตอบว่า @@NONE@@" }
      ] }],
      generationConfig: { temperature: 0, maxOutputTokens: 1024 }
    });
    const keys = getApiKeys();
    let res = null;
    for(let i = 0; i < keys.length; i++){
      if(!isApiKeyOn(keys[i])) continue;
      const url = () => `https://generativelanguage.googleapis.com/v1beta/models/${aiModelId()}:generateContent?key=${encodeURIComponent(keys[i])}`;
      const opt = { method: "POST", headers: { "Content-Type": "application/json" }, body, signal };
      try{
        res = await fetch(url(), opt);
        if(res.status === 404 && aiModelId() === GEMINI_MODEL_DEFAULT){
          try{ localStorage.setItem(GEMINI_MODEL_KEY, GEMINI_MODEL_FALLBACK); }catch(e){}
          res = await fetch(url(), opt);
        }
      }catch(e){
        if(e && e.name === "AbortError") return { ok: false, error: "aborted" };
        return { ok: false, msg: "ส่งเสียงไปถอดไม่ได้ ตรวจอินเทอร์เน็ตแล้วลองใหม่" };
      }
      noteAiKey(i, res.ok ? "ok" : res.status === 429 ? "full" : res.status === 503 ? "busy" : "bad");
      if(res.status !== 429 && res.status !== 503) break;
    }
    if(!res) return { ok: false, msg: "ยังไม่มีคีย์ Gemini ที่เปิดใช้อยู่" };
    if(res.status === 429) return { ok: false, msg: "โควต้าฟรีของ Gemini เต็มทุกคีย์ ตอนนี้ถอดเสียงไม่ได้ พิมพ์แทนไปก่อน" };
    if(!res.ok) return { ok: false, msg: "Gemini ถอดเสียงไม่สำเร็จ (HTTP " + res.status + ")" };
    let j; try{ j = await res.json(); }catch(e){ return { ok: false, msg: "Gemini ตอบกลับมาอ่านไม่ได้" }; }
    const parts = (j && j.candidates && j.candidates[0] && j.candidates[0].content && j.candidates[0].content.parts) || [];
    const text = parts.filter(p => p && !p.thought && typeof p.text === "string").map(p => p.text).join("").replace(/@@NONE@@/g, "").trim().replace(/^["“”']+|["“”']+$/g, "").trim();
    if(!text) return { ok: false, msg: "ไม่ได้ยินเสียงพูด ลองพูดใกล้ไมค์อีกครั้ง" };
    return { ok: true, text };
  }

  if(canRecord){
    statusEl = document.createElement("div"); statusEl.className = "v-voice-status"; statusEl.id = "aiVoiceStatus"; statusEl.hidden = true;
    statusEl.innerHTML = '<i class="v-voice-dot" aria-hidden="true"></i><span class="v-voice-txt" aria-live="polite"></span><button type="button" class="v-voice-cancel">ยกเลิก</button>';
    statusTxt = statusEl.querySelector(".v-voice-txt");
    mic = document.createElement("button"); mic.type = "button"; mic.id = "aiChatMicBtn"; mic.className = "v-voice-mic";
    row.insertBefore(statusEl, sendBtn); row.insertBefore(mic, sendBtn);
    mic.addEventListener("click", () => { if(working) return; if(rec) stopRec(false); else startRec(); });
    statusEl.querySelector(".v-voice-cancel").addEventListener("click", () => { if(rec) stopRec(true); else if(working) working.abort(); });
    // ปุ่มไมค์อยู่ตำแหน่งเดียวกับปุ่มส่ง: โชว์เมื่อช่องพิมพ์ว่างและ AI ไม่ได้ตอบอยู่
    const _sync = syncAiChatSendBtnVisibility;
    syncAiChatSendBtnVisibility = function(){ const out = _sync.apply(this, arguments); try{ syncMic(); }catch(e){} return out; };
    setMode("idle");
    document.addEventListener("visibilitychange", () => { if(document.hidden && rec) stopRec(true); });
  }

  // ===================== อ่านออกเสียง =====================
  const synth = window.speechSynthesis;
  const canSpeak = !!(synth && window.SpeechSynthesisUtterance);
  let speaking = null;   // { idx, chatId, watch, leave }
  // ความเร็วเสียงอ่าน: ค่าเริ่มต้นของมือถือช้าไปสำหรับ Han จึงตั้งเองได้ 4 ระดับ (จำไว้เฉพาะเครื่องนี้ ไม่เข้าไฟล์สำรอง)
  const RATES = [{ v: 1, n: "ปกติ" }, { v: 1.25, n: "เร็ว" }, { v: 1.5, n: "เร็วมาก" }, { v: 2, n: "เร็วสุด" }], RATE_KEY = "vaultet_ai_speak_rate_local";
  function rateIdx(){ let v = 1.25; try{ const s = parseFloat(localStorage.getItem(RATE_KEY)); if(RATES.some(r => r.v === s)) v = s; }catch(e){} return Math.max(0, RATES.findIndex(r => r.v === v)); }
  function saveRateIdx(i){ try{ localStorage.setItem(RATE_KEY, String(RATES[i].v)); }catch(e){} }

  function speechText(md){
    return String(md || "")
      .replace(/```[\s\S]*?```/g, " ")
      .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
      .replace(/฿\s*(-?[\d,]+(?:\.\d+)?)(\+?)/g, (m, n, plus) => n.replace(/,/g, "") + " บาท" + (plus ? "ขึ้นไป" : ""))
      .replace(/^\s*(?:[-*•]|\d+[.)])\s+/gm, "")
      .replace(/^#{1,6}\s*/gm, "")
      .replace(/[*_`~>|]/g, "")
      .replace(/[ \t]+/g, " ").trim();
  }
  // ตัดเป็นท่อนสั้น: เบราว์เซอร์บางตัวหยุดอ่านกลางคันถ้าข้อความยาวเกิน
  function chunks(text){
    const out = [];
    text.split(/\n+/).forEach(line => {
      let s = line.trim();
      while(s.length > 180){
        let cut = s.lastIndexOf(" ", 180); if(cut < 60) cut = 180;
        out.push(s.slice(0, cut).trim()); s = s.slice(cut).trim();
      }
      if(s) out.push(s);
    });
    return out;
  }
  function thaiVoice(){
    let vs = []; try{ vs = synth.getVoices() || []; }catch(e){}
    return { any: vs.length > 0, voice: vs.find(v => /^th([-_]|$)/i.test(v.lang || "")) || null };
  }
  function stopSpeak(){
    const s = speaking; speaking = null;
    if(s){ clearTimeout(s.watch); clearInterval(s.leave); }
    try{ synth.cancel(); }catch(e){}
    paintSpeak();
  }
  function startSpeak(idx){
    const msg = loadAIChatHistory()[idx]; if(!msg) return;
    const list = chunks(speechText(msg.text)); if(!list.length) return;
    const tv = thaiVoice();
    if(tv.any && !tv.voice){ say("เครื่องนี้ยังไม่มีเสียงอ่านภาษาไทย (ติดตั้งได้ในตั้งค่าเสียงอ่านของมือถือ)"); return; }
    try{ synth.cancel(); }catch(e){}
    const me = speaking = { idx, chatId: loadAllChats().activeId, watch: 0, leave: 0, started: false };
    list.forEach((t, i) => {
      const u = new SpeechSynthesisUtterance(t);
      u.lang = "th-TH"; u.rate = RATES[rateIdx()].v; if(tv.voice){ try{ u.voice = tv.voice; }catch(e){} }
      u.onstart = () => { me.started = true; clearTimeout(me.watch); };
      u.onerror = e => { if(speaking !== me) return; const c = e && e.error; stopSpeak(); if(c !== "canceled" && c !== "interrupted") say("อ่านออกเสียงไม่ได้บนเบราว์เซอร์นี้"); };
      if(i === list.length - 1) u.onend = () => { if(speaking === me) stopSpeak(); };
      synth.speak(u);
    });
    // ถ้าเบราว์เซอร์รับคำสั่งแต่ไม่ยอมอ่าน (ไม่มีเสียงเริ่มใน 6 วินาที) ให้บอกตรงๆ ไม่ค้างสถานะ "กำลังอ่าน"
    me.watch = setTimeout(() => { if(speaking === me && !me.started){ stopSpeak(); say("เบราว์เซอร์นี้ไม่เริ่มอ่านออกเสียง"); } }, 6000);
    // ออกจากหน้าแชท หรือเปลี่ยนแชท → หยุดอ่าน
    me.leave = setInterval(() => { if(speaking !== me) return; if(!isAdvisorPageActive() || loadAllChats().activeId !== me.chatId) stopSpeak(); }, 700);
    paintSpeak();
  }
  function paintSpeak(){
    const body = document.getElementById("aiAnalystBody"); if(!body) return;
    body.querySelectorAll('.ai-chat-actions [data-action="speak"]').forEach(b => {
      const on = !!speaking && speaking.idx === parseInt(b.dataset.idx, 10) && speaking.chatId === loadAllChats().activeId;
      b.classList.toggle("is-speaking", on);
      b.innerHTML = (on ? IC_STOP : IC_SPEAK) + "<span>" + (on ? "หยุดอ่าน" : "อ่าน") + "</span>";
    });
    body.querySelectorAll('.ai-chat-actions [data-action="speed"]').forEach(b => { const r = RATES[rateIdx()]; b.innerHTML = "<span>" + r.n + "</span>"; b.title = b.ariaLabel = "ความเร็วเสียงอ่าน: " + r.n + " (แตะเพื่อเปลี่ยน)"; });
  }
  function addSpeakButtons(){
    const body = document.getElementById("aiAnalystBody"); if(!body) return;
    body.querySelectorAll(".ai-chat-msg.role-model").forEach(m => {
      const bar = m.querySelector(".ai-chat-actions"); if(!bar || bar.querySelector('[data-action="speak"]')) return;
      const b = document.createElement("button"); b.type = "button"; b.dataset.action = "speak"; b.dataset.idx = m.dataset.idx;
      bar.append(b);
      const sp = document.createElement("button"); sp.type = "button"; sp.dataset.action = "speed"; sp.dataset.idx = m.dataset.idx;
      bar.append(sp);
    });
    paintSpeak();
  }
  if(canSpeak){
    try{ synth.getVoices(); }catch(e){}   // บางเบราว์เซอร์โหลดรายชื่อเสียงช้า เรียกไว้ก่อน
    const _r = renderAiChatBubbles;
    renderAiChatBubbles = function(){ const out = _r.apply(this, arguments); try{ addSpeakButtons(); }catch(e){ console.error(e); } return out; };
    const body = document.getElementById("aiAnalystBody");
    if(body) body.addEventListener("click", e => {
      const sb = e.target.closest('[data-action="speed"]');
      if(sb){
        const i = (rateIdx() + 1) % RATES.length; saveRateIdx(i); paintSpeak(); say("ความเร็วเสียงอ่าน: " + RATES[i].n);
        if(speaking){ const at = speaking.idx; stopSpeak(); startSpeak(at); }   // กำลังอ่านอยู่ → เริ่มอ่านใหม่ด้วยความเร็วใหม่
        return;
      }
      const b = e.target.closest('[data-action="speak"]'); if(!b) return;
      const idx = parseInt(b.dataset.idx, 10);
      if(speaking && speaking.idx === idx){ stopSpeak(); return; }
      startSpeak(idx);
    });
    window.addEventListener("pagehide", () => { try{ synth.cancel(); }catch(e){} });
    addSpeakButtons();
  }
})();
