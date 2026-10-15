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
