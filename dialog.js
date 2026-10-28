// Vaultet — dialog.js: กล่องข้อความในแอป แทน prompt() / confirm() / alert() ของเบราว์เซอร์
// ใช้แบบ await ได้ทั้งหมด:
//   const ok  = await vaultetConfirm("ลบรายการนี้ใช่ไหม?", { okText:"ลบ", danger:true });
//   const v   = await vaultetForm({ title:"เพิ่มบัญชี", fields:[{ key:"name", label:"ชื่อบัญชี", required:true }, { key:"bal", label:"ยอดเริ่มต้น", type:"number", value:0 }] });  // null = ยกเลิก
//   const s   = await vaultetPrompt("ชื่อหมวดใหม่", "", { title:"เพิ่มหมวด" });                                            // null = ยกเลิก
//   await vaultetAlert("ต้องเป็นตัวเลข 6 หลัก");
// ฟิลด์: type = text | number | date | select | password | textarea ; required, value, placeholder, hint, options:[{value,label}], min, max, maxlength, inputmode
// ไม่แตะข้อมูลหรือโลจิกการเงิน
(function(){
  let queue = Promise.resolve();
  let uid = 0;

  function el(tag, cls, text){
    const n = document.createElement(tag);
    if(cls) n.className = cls;
    if(text != null) n.textContent = text;
    return n;
  }

  function show(build){
    // ทีละกล่อง ไม่ซ้อนกัน
    const run = () => new Promise(resolve => {
      const prevFocus = document.activeElement;
      const back = el("div", "v-dlg-back");
      const box = el("div", "v-dlg");
      box.setAttribute("role", "dialog");
      box.setAttribute("aria-modal", "true");
      back.append(box);
      let closed = false;
      const close = value => {
        if(closed) return; closed = true;
        document.removeEventListener("keydown", onKey, true);
        back.remove();
        try{ prevFocus && prevFocus.focus && prevFocus.focus({ preventScroll:true }); }catch(e){}
        resolve(value);
      };
      const ctx = { box, close, cancelValue: null };
      const onKey = e => {
        if(e.key === "Escape"){ e.stopPropagation(); e.preventDefault(); close(ctx.cancelValue); }
        else if(e.key === "Tab"){ // เก็บ focus ไว้ในกล่อง
          const f = [...box.querySelectorAll("input,select,textarea,button")].filter(x => !x.disabled && x.offsetParent !== null);
          if(!f.length) return;
          const first = f[0], last = f[f.length - 1];
          if(e.shiftKey && document.activeElement === first){ e.preventDefault(); last.focus(); }
          else if(!e.shiftKey && document.activeElement === last){ e.preventDefault(); first.focus(); }
        }
      };
      document.addEventListener("keydown", onKey, true);
      back.addEventListener("mousedown", e => { if(e.target === back) close(ctx.cancelValue); });
      build(ctx);
      document.body.append(back);
      const focusTarget = box.querySelector("[data-autofocus]") || box.querySelector("input,select,textarea") || box.querySelector("button.v-dlg-ok");
      // โฟกัสช่องแรกให้อัตโนมัติ — แต่ถ้าผู้ใช้เริ่มแตะ/โฟกัสช่องอื่นไปแล้ว ไม่ไปแย่งโฟกัสกลับ
      if(focusTarget) setTimeout(() => {
        try{
          if(box.contains(document.activeElement)) return;
          focusTarget.focus();
          if(focusTarget.select && focusTarget.type !== "date") focusTarget.select();
        }catch(e){}
      }, 30);
    });
    const p = queue.then(run, run);
    queue = p.catch(() => {});
    return p;
  }

  window.__vaultetShow = show;
  function header(box, title, message){
    const id = "vdlg" + (++uid);
    box.setAttribute("aria-labelledby", id);
    if(title){ const h = el("h2", "v-dlg-title", title); h.id = id; box.append(h); }
    else { box.removeAttribute("aria-labelledby"); }
    if(message){ box.append(el("p", "v-dlg-msg", message)); }
  }

  function buttons(box, o, onOk, onCancel, showCancel){
    const row = el("div", "v-dlg-actions");
    if(showCancel){
      const c = el("button", "v-dlg-cancel", o.cancelText || "ยกเลิก"); c.type = "button"; c.addEventListener("click", onCancel); row.append(c);
    }
    const ok = el("button", "v-dlg-ok" + (o.danger ? " v-dlg-danger" : ""), o.okText || "ตกลง"); ok.type = "button"; ok.addEventListener("click", onOk);
    row.append(ok);
    box.append(row);
    return ok;
  }

  // ---------- confirm ----------
  window.vaultetConfirm = function(message, opts){
    const o = typeof message === "object" ? message : Object.assign({ message }, opts || {});
    return show(ctx => {
      ctx.cancelValue = false;
      header(ctx.box, o.title, o.message);
      const ok = buttons(ctx.box, Object.assign({ okText: "ตกลง" }, o), () => ctx.close(true), () => ctx.close(false), true);
      ok.setAttribute("data-autofocus", "");
    });
  };

  // ---------- alert ----------
  window.vaultetAlert = function(message, opts){
    const o = typeof message === "object" ? message : Object.assign({ message }, opts || {});
    return show(ctx => {
      ctx.cancelValue = undefined;
      header(ctx.box, o.title, o.message);
      const ok = buttons(ctx.box, Object.assign({ okText: "ตกลง" }, o), () => ctx.close(undefined), null, false);
      ok.setAttribute("data-autofocus", "");
    });
  };

  // ---------- form ----------
  window.vaultetForm = function(opts){
    const o = opts || {};
    const fields = o.fields || [];
    return show(ctx => {
      ctx.cancelValue = null;
      header(ctx.box, o.title, o.message);
      const form = el("form", "v-dlg-form");
      form.noValidate = true;
      const inputs = {};
      fields.forEach(f => {
        const wrap = el("div", "v-dlg-field");
        const id = "vdf" + (++uid);
        if(f.label){ const l = el("label", "v-dlg-label", f.label); l.htmlFor = id; wrap.append(l); }
        let input;
        if(f.type === "select"){
          input = el("select", "v-field");
          (f.options || []).forEach(op => { const x = el("option", null, op.label); x.value = String(op.value); input.append(x); });
          if(f.value != null) input.value = String(f.value);
        }else if(f.type === "textarea"){
          input = el("textarea", "v-field"); input.rows = f.rows || 3;
          if(f.value != null) input.value = String(f.value);
        }else{
          input = el("input", "v-field");
          const t = f.type === "number" ? "number" : f.type === "date" ? "date" : f.type === "password" ? "password" : "text";
          input.type = t;
          if(t === "number"){ input.step = "any"; input.inputMode = "decimal"; if(f.min != null) input.min = f.min; if(f.max != null) input.max = f.max; }
          if(f.inputmode) input.inputMode = f.inputmode;
          if(f.maxlength) input.maxLength = f.maxlength;
          if(f.value != null && f.value !== "") input.value = String(f.value);
          input.autocomplete = "off";
        }
        input.id = id; input.name = f.key;
        if(f.placeholder) input.placeholder = f.placeholder;
        wrap.append(input);
        if(f.hint) wrap.append(el("div", "v-dlg-hint", f.hint));
        const err = el("div", "v-dlg-err"); err.hidden = true; err.setAttribute("role", "alert"); wrap.append(err);
        input.addEventListener("input", () => { err.hidden = true; input.removeAttribute("aria-invalid"); });
        inputs[f.key] = { f, input, err };
        form.append(wrap);
      });
      ctx.box.append(form);

      const submit = () => {
        const out = {};
        let firstBad = null;
        for(const f of fields){
          const { input, err } = inputs[f.key];
          let raw = input.value;
          let val = typeof raw === "string" ? raw.trim() : raw;
          let msg = "";
          if(f.type === "number"){
            if(val === ""){ val = null; if(f.required) msg = "ใส่จำนวนเงิน"; }
            else{
              const n = Number(val);
              if(!isFinite(n)) msg = "ต้องเป็นตัวเลข";
              else if(f.min != null && n < Number(f.min)) msg = "ต้องไม่น้อยกว่า " + f.min;
              else if(f.max != null && n > Number(f.max)) msg = "ต้องไม่เกิน " + f.max;
              else if(f.positive && n <= 0) msg = "ต้องมากกว่า 0";
              else val = n;
            }
          }else if(f.required && val === ""){ msg = "ต้องกรอกช่องนี้"; }
          else if(f.pattern && val !== "" && !new RegExp(f.pattern).test(val)) msg = f.patternMessage || "รูปแบบไม่ถูกต้อง";
          if(!msg && typeof f.validate === "function"){ msg = f.validate(val, out) || ""; }
          if(msg){ err.textContent = msg; err.hidden = false; input.setAttribute("aria-invalid", "true"); if(!firstBad) firstBad = input; }
          out[f.key] = val;
        }
        if(firstBad){ firstBad.focus(); return; }
        ctx.close(out);
      };
      form.addEventListener("submit", e => { e.preventDefault(); submit(); });
      const ok = buttons(ctx.box, Object.assign({ okText: "บันทึก" }, o), submit, () => ctx.close(null), true);
      // Enter ในช่องกรอกส่งฟอร์ม (ไม่รวม textarea)
      form.addEventListener("keydown", e => { if(e.key === "Enter" && e.target.tagName !== "TEXTAREA"){ e.preventDefault(); submit(); } });
    });
  };

  // ---------- prompt (ช่องเดียว) ----------
  window.vaultetPrompt = function(label, value, opts){
    const o = opts || {};
    return window.vaultetForm({
      title: o.title || label, message: o.message,
      okText: o.okText || "ตกลง", cancelText: o.cancelText, danger: o.danger,
      fields: [{ key: "v", label: o.title ? label : "", type: o.type || "text", value: value == null ? "" : value, placeholder: o.placeholder, required: !!o.required, hint: o.hint, min: o.min, positive: o.positive, pattern: o.pattern, patternMessage: o.patternMessage, maxlength: o.maxlength, inputmode: o.inputmode }]
    }).then(r => r ? r.v : null);
  };
})();

// ถามยืนยันแบบกำหนดปุ่ม: await vaultetAsk("ลบ", "ลบรายการนี้ใช่ไหม?", true)  → true/false
window.vaultetAsk = function(okText, message, danger){
  return window.vaultetConfirm(message, { okText, danger: !!danger });
};

// ---------- เลือก 1 ข้อจากรายการปุ่ม (แทนเมนูที่ให้พิมพ์เลข) ----------
// const x = await vaultetChoice({ title:"ล็อกแอป", options:[{ value:"1", label:"ปิดล็อก" }, { value:"4", label:"ลบทั้งหมด", danger:true }] })  // null = ยกเลิก
window.vaultetChoice = function(opts){
  const o = opts || {};
  return (function(){
    // ใช้กล่องเดียวกัน: ปุ่มเรียงลง + ปุ่มยกเลิก
    return window.__vaultetShow(ctx => {
      ctx.cancelValue = null;
      const box = ctx.box;
      const id = "vdlgc" + Date.now();
      box.setAttribute("aria-labelledby", id);
      if(o.title){ const h = document.createElement("h2"); h.className = "v-dlg-title"; h.id = id; h.textContent = o.title; box.append(h); }
      if(o.message){ const p = document.createElement("p"); p.className = "v-dlg-msg"; p.textContent = o.message; box.append(p); }
      const list = document.createElement("div"); list.className = "v-dlg-choices";
      (o.options || []).forEach((op, i) => {
        const b = document.createElement("button"); b.type = "button"; b.className = "v-dlg-choice" + (op.danger ? " v-dlg-choice-danger" : "");
        b.textContent = op.label; if(i === 0) b.setAttribute("data-autofocus", "");
        b.addEventListener("click", () => ctx.close(op.value)); list.append(b);
      });
      box.append(list);
      const row = document.createElement("div"); row.className = "v-dlg-actions";
      const c = document.createElement("button"); c.type = "button"; c.className = "v-dlg-cancel"; c.textContent = o.cancelText || "ยกเลิก"; c.addEventListener("click", () => ctx.close(null));
      row.append(c); box.append(row);
    });
  })();
};

// ---------- เลือก 1 ข้อแบบแผ่นเลื่อนขึ้นจากล่าง (แทนช่องตัวเลือก <select> ของเบราว์เซอร์) ----------
// const v = await vaultetPick({ title:"เลือกเดือน", value:"2026-10", options:[{ value:"2026-10", label:"ตุลาคม 2569", sub:"7 รายการ", color:"#ff6b60" }] })  // null = ปิดไปเฉยๆ
window.vaultetPick = function(opts){
  const o = opts || {};
  return window.__vaultetShow(ctx => {
    ctx.cancelValue = null;
    const box = ctx.box;
    box.classList.add("v-dlg-sheet");
    if(box.parentElement) box.parentElement.classList.add("v-dlg-back-sheet");
    const grip = document.createElement("div"); grip.className = "v-pick-grip"; grip.setAttribute("aria-hidden", "true"); box.append(grip);
    const id = "vdlgp" + Date.now();
    if(o.title){ const h = document.createElement("h2"); h.className = "v-dlg-title"; h.id = id; h.textContent = o.title; box.append(h); box.setAttribute("aria-labelledby", id); }
    const list = document.createElement("div"); list.className = "v-pick-list"; list.setAttribute("role", "listbox");
    (o.options || []).forEach(op => {
      const on = String(op.value) === String(o.value);
      const b = document.createElement("button"); b.type = "button"; b.className = "v-pick-row" + (on ? " is-on" : "");
      b.setAttribute("role", "option"); b.setAttribute("aria-selected", on ? "true" : "false"); b.dataset.value = op.value;
      if(op.color){ const d = document.createElement("i"); d.className = "v-pick-dot"; d.style.background = op.color; b.append(d); }
      const main = document.createElement("span"); main.className = "v-pick-main";
      const t = document.createElement("span"); t.className = "v-pick-label"; t.textContent = op.label; main.append(t);
      if(op.sub){ const s = document.createElement("span"); s.className = "v-pick-sub"; s.textContent = op.sub; main.append(s); }
      const radio = document.createElement("span"); radio.className = "v-pick-radio"; radio.setAttribute("aria-hidden", "true");
      b.append(main, radio);
      if(on) b.setAttribute("data-autofocus", "");
      b.addEventListener("click", () => ctx.close(op.value));
      list.append(b);
    });
    box.append(list);
  });
};

// ---------- เลือกวันที่แบบปฏิทินไทย (แผ่นจากล่าง) ----------
// const iso = await vaultetPickDate({ value:"2026-10-28", title:"เลือกวันที่" })  // null = ปิดไปเฉยๆ
(function(){
  const TH_MONTH = ["มกราคม","กุมภาพันธ์","มีนาคม","เมษายน","พฤษภาคม","มิถุนายน","กรกฎาคม","สิงหาคม","กันยายน","ตุลาคม","พฤศจิกายน","ธันวาคม"];
  const TH_SHORT = ["ม.ค.","ก.พ.","มี.ค.","เม.ย.","พ.ค.","มิ.ย.","ก.ค.","ส.ค.","ก.ย.","ต.ค.","พ.ย.","ธ.ค."];
  const WK = ["อา","จ","อ","พ","พฤ","ศ","ส"];
  const pad = n => String(n).padStart(2, "0");
  const iso = d => d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
  const parse = s => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || ""); return m ? new Date(+m[1], +m[2] - 1, +m[3], 12) : null; };
  const today = () => { const d = new Date(); d.setHours(12, 0, 0, 0); return d; };
  const shift = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
  // ป้ายสั้นสำหรับปุ่ม: วันนี้ / เมื่อวาน / 26 ต.ค. 69
  window.vaultetDateLabel = function(s){
    const d = parse(s); if(!d) return "";
    const t = iso(today());
    if(s === t) return "วันนี้";
    if(s === iso(shift(today(), -1))) return "เมื่อวาน";
    if(s === iso(shift(today(), 1))) return "พรุ่งนี้";
    return d.getDate() + " " + TH_SHORT[d.getMonth()] + " " + String(d.getFullYear() + 543).slice(-2);
  };
  window.vaultetPickDate = function(opts){
    const o = opts || {};
    const sel = parse(o.value) || today();
    let view = new Date(sel.getFullYear(), sel.getMonth(), 1, 12);
    return window.__vaultetShow(ctx => {
      ctx.cancelValue = null;
      const box = ctx.box;
      box.classList.add("v-dlg-sheet", "v-date-sheet");
      if(box.parentElement) box.parentElement.classList.add("v-dlg-back-sheet");
      box.insertAdjacentHTML("beforeend", '<div class="v-pick-grip" aria-hidden="true"></div>');
      const h = document.createElement("h2"); h.className = "v-dlg-title"; h.id = "vdlgd" + Date.now(); h.textContent = o.title || "เลือกวันที่"; box.append(h); box.setAttribute("aria-labelledby", h.id);
      const quick = document.createElement("div"); quick.className = "v-date-quick";
      [["วันนี้", 0], ["เมื่อวาน", -1], ["2 วันก่อน", -2]].forEach(([label, n]) => {
        const v = iso(shift(today(), n));
        const b = document.createElement("button"); b.type = "button"; b.className = "v-fchip" + (v === iso(sel) ? " is-on" : ""); b.textContent = label; b.dataset.date = v;
        b.addEventListener("click", () => ctx.close(v)); quick.append(b);
      });
      box.append(quick);
      const head = document.createElement("div"); head.className = "v-date-head";
      const prev = document.createElement("button"); prev.type = "button"; prev.className = "v-date-nav"; prev.setAttribute("aria-label", "เดือนก่อน"); prev.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 6l-6 6 6 6"/></svg>';
      const next = document.createElement("button"); next.type = "button"; next.className = "v-date-nav"; next.setAttribute("aria-label", "เดือนถัดไป"); next.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>';
      const title = document.createElement("span"); title.className = "v-date-title"; title.setAttribute("aria-live", "polite");
      head.append(prev, title, next); box.append(head);
      const grid = document.createElement("div"); grid.className = "v-date-grid"; grid.setAttribute("role", "grid"); box.append(grid);
      const draw = () => {
        title.textContent = TH_MONTH[view.getMonth()] + " " + (view.getFullYear() + 543);
        grid.innerHTML = WK.map(w => '<span class="v-date-wk">' + w + "</span>").join("");
        for(let i = 0; i < view.getDay(); i++) grid.insertAdjacentHTML("beforeend", "<span></span>");
        const days = new Date(view.getFullYear(), view.getMonth() + 1, 0).getDate();
        const t = iso(today()), s = iso(sel);
        for(let d = 1; d <= days; d++){
          const v = view.getFullYear() + "-" + pad(view.getMonth() + 1) + "-" + pad(d);
          const b = document.createElement("button"); b.type = "button"; b.className = "v-date-day" + (v === s ? " is-on" : "") + (v === t ? " is-today" : "");
          b.textContent = d; b.dataset.date = v; b.setAttribute("aria-label", d + " " + TH_MONTH[view.getMonth()] + " " + (view.getFullYear() + 543));
          if(v === s) b.setAttribute("data-autofocus", "");
          b.addEventListener("click", () => ctx.close(v));
          grid.append(b);
        }
      };
      prev.addEventListener("click", () => { view = new Date(view.getFullYear(), view.getMonth() - 1, 1, 12); draw(); });
      next.addEventListener("click", () => { view = new Date(view.getFullYear(), view.getMonth() + 1, 1, 12); draw(); });
      draw();
    });
  };
})();

// ---------- แจ้งผลลอยล่างจอ พร้อมปุ่มทำต่อ (เช่น "ย้อน") ----------
// vaultetSnack("บันทึกแล้ว · กิน ฿60", { action:"ย้อน", onAction(){ ... } })
window.vaultetSnack = function(message, opts){
  const o = opts || {};
  let el = document.getElementById("vSnack");
  if(!el){
    el = document.createElement("div"); el.id = "vSnack"; el.className = "v-snack"; el.setAttribute("role", "status"); el.setAttribute("aria-live", "polite");
    el.innerHTML = '<span class="v-snack-msg"></span><button type="button" class="v-snack-act"></button>';
    document.body.append(el);
  }
  const msg = el.querySelector(".v-snack-msg"), act = el.querySelector(".v-snack-act");
  msg.textContent = message;
  act.hidden = !o.action; act.textContent = o.action || "";
  act.onclick = () => { hide(); if(o.onAction) o.onAction(); };
  function hide(){ el.classList.remove("is-on"); }
  clearTimeout(window.vaultetSnack._t);
  el.classList.remove("is-on"); void el.offsetWidth; el.classList.add("is-on");
  window.vaultetSnack._t = setTimeout(hide, o.duration || 5000);
  return hide;
};

// ---------- ไอคอนแทนอีโมจิ (เส้นเดียวกับไอคอนอื่นในแอป) ----------
(function(){
  const P = {
    alert:'<circle cx="12" cy="12" r="9"/><path d="M12 7v6M12 16.5v.01"/>',
    warn:'<path d="M12 4l9 16H3z"/><path d="M12 10v4M12 17v.01"/>',
    info:'<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8v.01"/>',
    check:'<circle cx="12" cy="12" r="9"/><path d="M8 12.5l2.7 2.7L16 9.5"/>',
    cal:'<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 10h16M9 3v4M15 3v4"/>',
    bell:'<path d="M6 16V11a6 6 0 0112 0v5l1.5 2h-15z"/><path d="M10 20a2 2 0 004 0"/>',
    gear:'<circle cx="12" cy="12" r="3"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1"/>',
    chart:'<path d="M5 20V10M12 20V4M19 20v-7"/>'
  };
  const MAP = { "🚨":"alert","⚠️":"warn","⚠":"warn","💡":"info","✅":"check","🎉":"check","🗓":"cal","📅":"cal","🔔":"bell","⚙️":"gear","⚙":"gear","📊":"chart" };
  window.vaultetIcon = function(e){
    const k = P[MAP[String(e||"").trim()] || "bell"];
    return '<svg class="v-ic" viewBox="0 0 24 24" aria-hidden="true">' + k + '</svg>';
  };
})();
