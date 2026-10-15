// Vaultet — openrouter.js: ใช้ OpenRouter (AI หลายค่าย) เป็นตัวหลักของแชท และเป็นตัวสำรองเงียบๆ เมื่อโควต้า Gemini ฟรีเต็ม
// หลักการ: แปลงคำขอรูปแบบ Gemini → รูปแบบ OpenAI แล้วแปลงคำตอบกลับเป็นรูปแบบ Gemini
// ฟังก์ชัน AI เดิมทุกตัวจึงไม่ต้องรู้ว่าคำตอบมาจากค่ายไหน (ดู fetchGeminiWithRetry ใน ai.js)
// คีย์เก็บในเครื่องเท่านั้น ไม่รวมในไฟล์สำรองข้อมูล
(function(){
  const K = { key:"vaultet_or_key_v1", model:"vaultet_or_model_v1", small:"vaultet_or_model_small_v1", capDay:"vaultet_or_cap_day_v1", capMonth:"vaultet_or_cap_month_v1", usage:"vaultet_or_usage_v1", models:"vaultet_or_models_cache_v1" };
  const BASE = "https://openrouter.ai/api/v1";
  const get = k => { try{ return localStorage.getItem(k) || ""; }catch(e){ return ""; } };
  const set = (k, v) => { try{ if(v === "" || v == null) localStorage.removeItem(k); else localStorage.setItem(k, String(v)); }catch(e){} };
  try{ if(typeof VAULTET_BACKUP_EXCLUDED_KEYS !== "undefined"){ VAULTET_BACKUP_EXCLUDED_KEYS.add(K.key); VAULTET_BACKUP_EXCLUDED_KEYS.add(K.usage); VAULTET_BACKUP_EXCLUDED_KEYS.add(K.models); } }catch(e){}

  const num = k => { const n = parseFloat(get(k)); return Number.isFinite(n) && n > 0 ? n : 0; };
  const api = {
    hasKey: () => !!get(K.key),
    enabled: () => !!get(K.key) && !!get(K.model),
    modelFor: kind => (kind === "small" ? (get(K.small) || get(K.model)) : get(K.model)),
    caps: () => ({ day: num(K.capDay), month: num(K.capMonth) }),
    setCaps: (day, month) => { set(K.capDay, day > 0 ? day : ""); set(K.capMonth, month > 0 ? month : ""); },
    key: () => get(K.key), setKey: v => set(K.key, (v || "").trim()),
    model: () => get(K.model), setModel: v => set(K.model, (v || "").trim()),
    smallModel: () => get(K.small), setSmallModel: v => set(K.small, (v || "").trim()),
    usageCache: () => { try{ return JSON.parse(get(K.usage) || "null"); }catch(e){ return null; } },
    fxRate: () => { try{ const r = JSON.parse(localStorage.getItem("vaultet_pf_prices_v1") || "{}")?.fx?.rate; return r > 0 ? r : null; }catch(e){ return null; } }
  };

  // ---------- ยอดใช้จริงจาก OpenRouter (GET /key) ----------
  let inflight = null;
  api.refreshUsage = function(force){
    const c = api.usageCache();
    if(!api.hasKey()) return Promise.resolve(null);
    if(!force && c && Date.now() - c.at < 20000) return Promise.resolve(c);
    if(inflight) return inflight;
    inflight = (async () => {
      try{
        const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 6000);
        const r = await fetch(BASE + "/key", { headers: { Authorization: "Bearer " + api.key() }, signal: ctl.signal });
        clearTimeout(t);
        if(!r.ok) return { ...(c || {}), error: r.status, at: Date.now() };
        const d = (await r.json())?.data || {};
        const v = { day: Number(d.usage_daily) || 0, week: Number(d.usage_weekly) || 0, month: Number(d.usage_monthly) || 0, total: Number(d.usage) || 0, limit: d.limit == null ? null : Number(d.limit), remaining: d.limit_remaining == null ? null : Number(d.limit_remaining), at: Date.now() };
        set(K.usage, JSON.stringify(v));
        try{ document.dispatchEvent(new CustomEvent("vaultet-or-usage")); }catch(e){}
        return v;
      }catch(e){ return c || null; }
      finally{ inflight = null; }
    })();
    return inflight;
  };
  // เกินเพดานที่ตั้งในแอปหรือยัง (นับเฉพาะส่วนที่จ่ายเงินผ่าน OpenRouter)
  api.overCap = function(){
    const cap = api.caps(), u = api.usageCache(); if(!u) return false;
    return (cap.day > 0 && u.day >= cap.day) || (cap.month > 0 && u.month >= cap.month);
  };

  // ---------- แปลงคำขอ Gemini → OpenAI ----------
  function textOf(parts){ return (parts || []).map(p => typeof p?.text === "string" ? p.text : "").join(""); }
  function toOpenAI(b, model, stream){
    const messages = [];
    let sys = textOf(b.systemInstruction?.parts);
    const gc = b.generationConfig || {};
    const wantJson = gc.response_mime_type === "application/json" || gc.responseMimeType === "application/json";
    if(wantJson){
      const schema = gc.response_schema || gc.responseSchema;
      sys += "\n\nตอบเป็น JSON เท่านั้น ห้ามมีข้อความอื่นหรือ markdown ครอบ" + (schema ? " โครงสร้างต้องตรงตามนี้ (JSON Schema แบบ Gemini): " + JSON.stringify(schema) : "");
    }
    if(sys.trim()) messages.push({ role: "system", content: sys });
    (b.contents || []).forEach(c => { const t = textOf(c.parts); if(t) messages.push({ role: c.role === "model" ? "assistant" : "user", content: t }); });
    const p = { model, messages, stream: !!stream };
    if(gc.temperature != null) p.temperature = gc.temperature;
    if(gc.maxOutputTokens) p.max_tokens = gc.maxOutputTokens;
    if(wantJson) p.response_format = { type: "json_object" };
    return p;
  }
  const geminiShaped = (text, finish) => ({ candidates: [{ content: { role: "model", parts: [{ text }] }, finishReason: finish === "length" ? "MAX_TOKENS" : "STOP" }] });
  function contentText(c){ return typeof c === "string" ? c : Array.isArray(c) ? c.map(x => x?.text || "").join("") : ""; }

  // SSE ของ OpenRouter → SSE หน้าตาเหมือน Gemini
  function adaptStream(body){
    const reader = body.getReader(), dec = new TextDecoder(), enc = new TextEncoder();
    let buf = "", finished = false;
    return new ReadableStream({
      async pull(ctrl){
        while(true){
          const { done, value } = await reader.read();
          if(done){ if(!finished){ ctrl.enqueue(enc.encode("data: " + JSON.stringify(geminiShaped("", "stop")) + "\n\n")); } ctrl.close(); return; }
          buf += dec.decode(value, { stream: true });
          const lines = buf.split(/\r?\n/); buf = lines.pop();
          let out = "";
          for(const line of lines){
            if(!line.startsWith("data:")) continue;
            const payload = line.slice(5).trim(); if(!payload || payload === "[DONE]") continue;
            let j; try{ j = JSON.parse(payload); }catch(e){ continue; }
            if(j.error){ ctrl.error(new Error("openrouter_stream_error")); return; }
            const ch = j.choices?.[0]; if(!ch) continue;
            const txt = contentText(ch.delta?.content);
            if(txt || ch.finish_reason){
              const cand = { content: { role: "model", parts: [{ text: txt }] } };
              if(ch.finish_reason){ finished = true; cand.finishReason = ch.finish_reason === "length" ? "MAX_TOKENS" : "STOP"; }
              out += "data: " + JSON.stringify({ candidates: [cand] }) + "\n\n";
            }
          }
          if(out){ ctrl.enqueue(enc.encode(out)); return; }
        }
      },
      cancel(){ try{ reader.cancel(); }catch(e){} }
    });
  }

  // เรียก OpenRouter ด้วยคำขอรูปแบบ Gemini; คืน Response รูปแบบ Gemini หรือ null ถ้าใช้ไม่ได้ (ผู้เรียกจะไปทางอื่นต่อเงียบๆ)
  api.call = async function(bodyText, o){
    o = o || {};
    if(!api.enabled()) return null;
    const cap = api.caps();
    if(cap.day > 0 || cap.month > 0){ await api.refreshUsage(false); if(api.overCap()) return null; }
    let b; try{ b = JSON.parse(bodyText); }catch(e){ return null; }
    const model = api.modelFor(o.kind);
    let r;
    try{
      r = await fetch(BASE + "/chat/completions", { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + api.key() }, body: JSON.stringify(toOpenAI(b, model, !!o.stream)), signal: o.signal });
    }catch(e){ if(e && e.name === "AbortError") throw e; return null; }
    if(!r.ok) return null;
    setTimeout(() => api.refreshUsage(true), 4000);
    if(o.stream){
      if(!r.body || !r.body.getReader) return null;
      return new Response(adaptStream(r.body), { status: 200, headers: { "content-type": "text/event-stream" } });
    }
    let j; try{ j = await r.json(); }catch(e){ return null; }
    const ch = j?.choices?.[0]; const text = contentText(ch?.message?.content);
    if(!text) return null;
    return new Response(JSON.stringify(geminiShaped(text, ch.finish_reason)), { status: 200, headers: { "content-type": "application/json" } });
  };

  // ---------- รายชื่อโมเดล + ราคาสด ----------
  api.models = async function(force){
    try{ const c = JSON.parse(get(K.models) || "null"); if(!force && c && Date.now() - c.at < 12 * 3600 * 1000 && c.list?.length) return c.list; }catch(e){}
    const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 10000);
    try{
      const r = await fetch(BASE + "/models", { signal: ctl.signal }); clearTimeout(t);
      if(!r.ok) return null;
      const d = (await r.json())?.data || [];
      const list = d.filter(m => !m.architecture?.output_modalities || m.architecture.output_modalities.includes("text"))
        .map(m => ({ id: m.id, name: m.name || m.id, inM: (parseFloat(m.pricing?.prompt) || 0) * 1e6, outM: (parseFloat(m.pricing?.completion) || 0) * 1e6, ctx: m.context_length || 0 }))
        .sort((a, b) => a.name.localeCompare(b.name));
      set(K.models, JSON.stringify({ at: Date.now(), list }));
      return list;
    }catch(e){ return null; }
  };
  const money = n => n === 0 ? "ฟรี" : "$" + (n >= 10 ? n.toFixed(0) : n >= 1 ? n.toFixed(2) : n.toFixed(3));
  api.priceText = m => m ? money(m.inM) + " / " + money(m.outM) + " ต่อล้านโทเค็น" : "";

  // กล่องเลือกโมเดล: ค้นหา + ราคา + พิมพ์ ID เองได้ → คืน id หรือ null
  api.pickModel = function(title, current){
    return window.__vaultetShow(ctx => {
      ctx.cancelValue = null;
      const box = ctx.box; box.classList.add("v-or-pick");
      box.insertAdjacentHTML("beforeend", '<h2 class="v-dlg-title"></h2><p class="v-dlg-msg">ราคาต่อ 1 ล้านโทเค็น (ข้อความที่ส่งเข้า / คำตอบที่ได้) แอปนี้ส่งข้อมูลการเงินไปด้วย ยิ่งแพงยิ่งเสียเงินเร็ว</p>');
      box.querySelector(".v-dlg-title").textContent = title;
      const search = document.createElement("input"); search.type = "search"; search.className = "v-field"; search.placeholder = "ค้นหา เช่น claude, gpt, gemini"; search.autocomplete = "off";
      const list = document.createElement("div"); list.className = "v-or-list"; list.textContent = "กำลังโหลดรายการโมเดล…";
      const manual = document.createElement("input"); manual.type = "text"; manual.className = "v-field"; manual.placeholder = "หรือพิมพ์ ID โมเดลเอง เช่น vendor/model-name"; manual.value = ""; manual.autocomplete = "off"; manual.setAttribute("autocapitalize", "off");
      let all = null;
      const draw = () => {
        const q = search.value.trim().toLowerCase();
        const rows = (all || []).filter(m => !q || m.id.toLowerCase().includes(q) || m.name.toLowerCase().includes(q)).slice(0, 60);
        list.innerHTML = "";
        if(!all){ list.textContent = "โหลดรายการไม่ได้ (เช็กอินเทอร์เน็ต) — พิมพ์ ID โมเดลเองด้านล่างได้"; return; }
        if(!rows.length){ list.textContent = "ไม่พบโมเดลที่ค้นหา"; return; }
        rows.forEach(m => {
          const b = document.createElement("button"); b.type = "button"; b.className = "v-or-row" + (m.id === current ? " is-current" : "");
          b.innerHTML = '<span class="v-or-name"></span><span class="v-or-id"></span><span class="v-or-price"></span>';
          b.querySelector(".v-or-name").textContent = m.name; b.querySelector(".v-or-id").textContent = m.id; b.querySelector(".v-or-price").textContent = api.priceText(m);
          b.addEventListener("click", () => ctx.close(m.id)); list.append(b);
        });
      };
      search.addEventListener("input", draw);
      api.models(false).then(l => { all = l; draw(); });
      box.append(search, list, manual);
      const actions = document.createElement("div"); actions.className = "v-dlg-actions";
      const cancel = document.createElement("button"); cancel.type = "button"; cancel.className = "v-dlg-cancel"; cancel.textContent = "ยกเลิก"; cancel.addEventListener("click", () => ctx.close(null));
      const use = document.createElement("button"); use.type = "button"; use.className = "v-dlg-ok"; use.textContent = "ใช้ ID ที่พิมพ์";
      use.addEventListener("click", () => { const v = manual.value.trim(); if(v) ctx.close(v); });
      actions.append(cancel, use); box.append(actions);
      search.setAttribute("data-autofocus", "");
    });
  };

  // ---------- หน้าตั้งค่า OpenRouter (การ์ด #orCard ในหน้าต่างตั้งค่า) ----------
  api.statusText = function(){
    if(!api.hasKey()) return "ยังไม่ได้ตั้งค่า";
    if(!api.model()) return "ใส่คีย์แล้ว · ยังไม่ได้เลือกโมเดล";
    return "ใช้งานอยู่ ✓ · " + api.model();
  };
  const usd = n => "$" + (Number(n) || 0).toFixed(2);
  function baht(n){ const fx = api.fxRate(); return fx ? " ≈ " + Math.round(n * fx).toLocaleString("en-US") + " บาท" : ""; }
  async function renderOR(){
    const st = document.getElementById("orStatus"); if(!st) return;
    st.textContent = api.statusText(); st.style.color = api.enabled() ? "var(--income)" : "var(--faint)";
    const info = document.getElementById("orModelInfo");
    const btn = document.getElementById("orModelBtn"), sb = document.getElementById("orSmallBtn");
    btn.textContent = api.model() || "เลือกโมเดล";
    sb.textContent = api.smallModel() || "ใช้ตัวเดียวกับแชท";
    info.textContent = api.model() ? "" : "ต้องเลือกโมเดลก่อน ระบบถึงจะเริ่มใช้ OpenRouter";
    if(api.model()){ const l = await api.models(false); const m = l && l.find(x => x.id === api.model()); info.textContent = m ? api.priceText(m) : "ราคา: ดูในหน้าโมเดลของ OpenRouter (รายการยังโหลดไม่ได้)"; }
    const cap = api.caps(); const dayI = document.getElementById("orCapDay"), monI = document.getElementById("orCapMonth");
    if(document.activeElement !== dayI) dayI.value = cap.day || ""; if(document.activeElement !== monI) monI.value = cap.month || "";
    const u = api.usageCache(), box = document.getElementById("orUsage");
    if(!api.hasKey()){ box.innerHTML = ""; return; }
    const row = (label, val, capv, extra) => '<div class="v-or-urow"><span>' + label + '</span><b class="v-or-pill' + (capv > 0 && val >= capv ? " is-over" : "") + '">' + usd(val) + (capv > 0 ? " / " + usd(capv) : "") + '</b></div>' + (extra ? '<div class="v-or-usub">' + extra + '</div>' : "");
    box.innerHTML = u && !u.error ? row("ค่า AI วันนี้", u.day, cap.day, "") + row("ค่า AI เดือนนี้", u.month, cap.month, "ยอดจริงจาก OpenRouter (รวมทุกการใช้คีย์นี้)" + baht(u.month)) + (api.overCap() ? '<div class="v-or-usub is-over">ถึงเพดานแล้ว — แอปหยุดเรียก OpenRouter ชั่วคราว</div>' : "")
      : '<div class="v-or-usub">' + (u && u.error ? "ดึงยอดใช้ไม่ได้ (HTTP " + u.error + ") — เช็กคีย์" : "กำลังดึงยอดใช้…") + "</div>";
  }
  function bindOR(){
    const $ = id => document.getElementById(id); if(!$("orCard")) return;
    $("orKeySave").addEventListener("click", async () => {
      const v = $("orKeyInput").value.trim();
      if(!v){ if(typeof showToast === "function") showToast("วางคีย์ก่อน"); return; }
      api.setKey(v); $("orKeyInput").value = "";
      const u = await api.refreshUsage(true);
      if(typeof showToast === "function") showToast(u && !u.error ? "บันทึกคีย์แล้ว ✓" : "บันทึกแล้ว แต่ตรวจคีย์ไม่ผ่าน — เช็กว่าวางถูกไหม");
      renderOR();
    });
    $("orKeyDel").addEventListener("click", async () => {
      if(!api.hasKey()) return;
      if(!(await vaultetAsk("ลบคีย์", "ลบคีย์ OpenRouter ออกจากเครื่องนี้ใช่ไหม? (ไม่กระทบเครดิตในบัญชี OpenRouter)", true))) return;
      api.setKey(""); localStorage.removeItem(K.usage); renderOR();
    });
    $("orModelBtn").addEventListener("click", async () => { const id = await api.pickModel("เลือกโมเดลหลัก (แชท)", api.model()); if(id){ api.setModel(id); renderOR(); } });
    $("orSmallBtn").addEventListener("click", async () => {
      const id = await api.pickModel("โมเดลงานเล็ก (สำรองตอน Gemini ฟรีเต็ม)", api.smallModel());
      if(id){ api.setSmallModel(id); renderOR(); }
    });
    $("orSmallBtn").addEventListener("contextmenu", e => { e.preventDefault(); api.setSmallModel(""); renderOR(); });
    const caps = () => { api.setCaps(parseFloat($("orCapDay").value) || 0, parseFloat($("orCapMonth").value) || 0); renderOR(); };
    $("orCapDay").addEventListener("change", caps); $("orCapMonth").addEventListener("change", caps);
    document.addEventListener("vaultet-or-usage", renderOR);
    $("settingsBtn")?.addEventListener("click", () => { renderOR(); api.refreshUsage(true); });
    renderOR();
  }

  window.vaultetOR = api;
  if(document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => { bindOR(); if(api.hasKey()) api.refreshUsage(false); });
  else { bindOR(); if(api.hasKey()) api.refreshUsage(false); }
})();
