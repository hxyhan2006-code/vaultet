// Vaultet — app/13-form-v2.js : หน้าเพิ่ม/แก้รายการโฉมใหม่ (รอบ 2, ds50)
// แป้นตัวเลขของแอปเอง, แท็บประเภทแบบสไลด์, ไอคอนหมวด, ปุ่มเลือกบัญชี/วันที่ (แผ่นจากล่าง),
// ปุ่มบันทึกบอกยอด, แจ้ง "บันทึกแล้ว" พร้อมปุ่มย้อน
// ค่าจริงยังอยู่ในช่องเดิม (#amount #date #entryAccount #fromAccount #toAccount) โค้ดเดิมจึงทำงานเหมือนเดิม
(function(){
  const overlay = document.getElementById("overlay");
  const sheet = overlay && overlay.querySelector(".v-sheet");
  const amount = document.getElementById("amount");
  const submit = document.getElementById("submitBtn");
  if(!sheet || !amount || !submit) return;
  const touch = window.matchMedia && window.matchMedia("(pointer: coarse)").matches;
  const CHEV = '<svg class="v-fbtn-chev" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>';

  // ---------- จำนวนเงิน: ช่องข้อความ (รับ "12." ระหว่างพิมพ์ได้) ไม่เด้งคีย์บอร์ดมือถือ ----------
  amount.type = "text";
  amount.setAttribute("inputmode", touch ? "none" : "decimal");
  if(touch) amount.readOnly = true;
  amount.setAttribute("autocomplete", "off");
  // พิมพ์จากคีย์บอร์ดคอม: เก็บเฉพาะตัวเลขกับจุดเดียว ทศนิยมไม่เกิน 2 ตำแหน่ง
  const clean = s => {
    s = String(s || "").replace(/[^\d.]/g, "");
    const i = s.indexOf(".");
    if(i >= 0) s = s.slice(0, i + 1) + s.slice(i + 1).replace(/\./g, "").slice(0, 2);
    const [a, b] = s.split(".");
    let int = (a || "").replace(/^0+(?=\d)/, "").slice(0, 9);
    if(b !== undefined && int === "") int = "0";
    return b !== undefined ? int + "." + b : int;
  };
  overlay.addEventListener("input", e => {
    if(e.target !== amount) return;
    const c = clean(amount.value);
    if(c !== amount.value) amount.value = c;
  }, true);

  // ---------- แป้นตัวเลข ----------
  const foot = sheet.querySelector(".v-sheet-foot");
  const pad = document.createElement("div");
  pad.className = "v-keypad"; pad.id = "vKeypad"; pad.setAttribute("role", "group"); pad.setAttribute("aria-label", "แป้นตัวเลข");
  const KEYS = ["1","2","3","4","5","6","7","8","9",".","0","del"];
  pad.innerHTML = KEYS.map(k => k === "del"
    ? '<button type="button" class="v-key v-key-del" data-k="del" aria-label="ลบตัวเลข"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5h11v14H9l-6-7z"/><path d="M12 9l6 6M18 9l-6 6"/></svg></button>'
    : '<button type="button" class="v-key" data-k="' + k + '">' + k + "</button>").join("");
  foot.insertBefore(pad, foot.firstChild);
  function press(k){
    let s = amount.value || "";
    if(k === "del") s = s.slice(0, -1);
    else if(k === ".") s = s.includes(".") ? s : (s || "0") + ".";
    else s = s + k;
    amount.value = clean(s);
    amount.dispatchEvent(new Event("input", { bubbles: true }));
  }
  pad.addEventListener("click", e => { const b = e.target.closest(".v-key"); if(b) press(b.dataset.k); });
  // กดค้างปุ่มลบ = ล้างทั้งหมด
  let holdT = 0;
  const del = pad.querySelector(".v-key-del");
  del.addEventListener("pointerdown", () => { holdT = setTimeout(() => { amount.value = ""; amount.dispatchEvent(new Event("input", { bubbles: true })); holdT = -1; }, 550); });
  ["pointerup", "pointerleave", "pointercancel"].forEach(ev => del.addEventListener(ev, () => { if(holdT > 0) clearTimeout(holdT); }));
  del.addEventListener("click", e => { if(holdT === -1){ e.stopPropagation(); holdT = 0; } }, true);
  // พิมพ์โน้ต (คีย์บอร์ดมือถือขึ้น) → ซ่อนแป้นชั่วคราว
  sheet.addEventListener("focusin", e => { if(e.target.matches("input, textarea") && e.target !== amount) sheet.classList.add("v-kp-off"); });
  sheet.addEventListener("focusout", e => { if(e.target.matches("input, textarea") && e.target !== amount) sheet.classList.remove("v-kp-off"); });

  // ---------- ปุ่มบันทึกบอกยอด ----------
  function syncSave(){
    const v = parseFloat(amount.value);
    submit.textContent = v > 0 ? "บันทึก ฿" + fmt(v) : "ใส่จำนวนเงิน";
  }
  amount.addEventListener("input", syncSave);

  // ---------- แท็บประเภท: แถบสีเลื่อนตาม ----------
  const toggle = document.getElementById("typeToggle");
  const ind = document.createElement("span"); ind.className = "v-seg-ind"; ind.setAttribute("aria-hidden", "true");
  if(toggle) toggle.insertBefore(ind, toggle.firstChild);
  function syncType(){
    if(!toggle) return;
    const on = toggle.querySelector(".type-btn[class*='active-']");
    toggle.querySelectorAll(".type-btn").forEach(b => b.setAttribute("aria-pressed", b === on ? "true" : "false"));
    if(!on || !on.offsetWidth){ ind.style.opacity = "0"; return; }
    ind.style.opacity = "1";
    ind.style.transform = "translateX(" + on.offsetLeft + "px)";
    ind.style.width = on.offsetWidth + "px";
    ind.style.background = "var(--v-t-" + on.dataset.type + ")";
  }
  window.addEventListener("resize", syncType);

  // ---------- ปุ่มแทนช่องเลือกบัญชี / วันที่ ----------
  function fieldBtn(id, label){
    const b = document.createElement("button");
    b.type = "button"; b.className = "v-fbtn"; b.id = id;
    b.innerHTML = '<small class="v-fbtn-k"></small><span class="v-fbtn-v"><span class="v-fbtn-t"></span>' + CHEV + "</span>";
    b.querySelector(".v-fbtn-k").textContent = label;
    return b;
  }
  function accLabel(sel){ return sel.selectedOptions[0]?.textContent || "เลือกบัญชี"; }
  function accOptions(sel){
    return [...sel.options].map(o => {
      let sub = "";
      try{ if(typeof computeAccountBalance === "function" && accounts.some(a => a.id === o.value)) sub = "คงเหลือ ฿" + fmt(computeAccountBalance(o.value)); }catch(e){}
      return { value: o.value, label: o.textContent, sub };
    });
  }
  const enhanced = [];
  function enhanceSelect(sel, id, label, title){
    if(!sel) return;
    const b = fieldBtn(id, label);
    sel.classList.add("v-native-hidden"); sel.tabIndex = -1; sel.setAttribute("aria-hidden", "true");
    const lab = sel.id && sel.parentElement.querySelector('label[for="' + sel.id + '"]'); if(lab) lab.classList.add("v-native-hidden");
    sel.after(b);
    const sync = () => { b.querySelector(".v-fbtn-t").textContent = accLabel(sel); };
    b.addEventListener("click", async () => {
      const v = await vaultetPick({ title, value: sel.value, options: accOptions(sel) });
      if(v == null || v === sel.value) return;
      sel.value = v; sel.dispatchEvent(new Event("change", { bubbles: true })); sync();
    });
    sel.addEventListener("change", sync);
    enhanced.push(sync); sync();
  }
  enhanceSelect(document.getElementById("entryAccount"), "vAccBtn", "บัญชี", "เลือกบัญชี");
  // โอนเงิน: ปุ่ม "จาก" → "ไป" (ป้ายในปุ่มแทนหัวข้อเดิม)
  const tg = document.getElementById("transferFieldGroup");
  if(tg){ tg.querySelectorAll(":scope > .v-label").forEach(l => l.classList.add("v-native-hidden")); }
  enhanceSelect(document.getElementById("fromAccount"), "vFromBtn", "จากบัญชี", "โอนจากบัญชี");
  enhanceSelect(document.getElementById("toAccount"), "vToBtn", "ไปบัญชี", "โอนไปบัญชี");
  const date = document.getElementById("date");
  if(date){
    const b = fieldBtn("vDateBtn", "วันที่");
    date.classList.add("v-native-hidden"); date.tabIndex = -1; date.setAttribute("aria-hidden", "true");
    const lab = date.parentElement.querySelector('label[for="date"]'); if(lab) lab.classList.add("v-native-hidden");
    date.after(b);
    const sync = () => { b.querySelector(".v-fbtn-t").textContent = vaultetDateLabel(date.value || todayISO()); };
    b.addEventListener("click", async () => {
      const v = await vaultetPickDate({ value: date.value || todayISO() });
      if(v == null) return;
      date.value = v; date.dispatchEvent(new Event("change", { bubbles: true })); sync();
    });
    date.addEventListener("change", sync); date.addEventListener("input", sync);
    enhanced.push(sync); sync();
  }
  const syncFields = () => enhanced.forEach(f => f());
  // จัดลำดับใหม่: จำนวนเงิน → ปุ่มลัด → (โอน: จาก→ไป) → บัญชี/วันที่ → เทมเพลต → หมวด → โน้ต
  const qa = document.getElementById("quickAmountRow"), two = sheet.querySelector(".v-two");
  if(qa && two){ qa.after(two); if(tg){ two.before(tg); const arrow = tg.querySelector(".transfer-arrow"); if(arrow){ arrow.textContent = ""; arrow.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>'; } } }

  // ---------- ไอคอนหมวด (เดาจากชื่อหมวด ไม่ตรงอะไรเลยใช้จุด) ----------
  const IC = {
    food: '<path d="M7 3v8M5 3v5a2 2 0 004 0V3M7 11v10M17 3c-1.700 1-3 3-3 6v4h3M17 3v18"/>',
    cafe: '<path d="M4 9h12v4a5 5 0 01-5 5H9a5 5 0 01-5-5zM16 10h2a2 2 0 010 4h-2M8 3v3M12 3v3"/>',
    home: '<path d="M3 11l9-7 9 7v9H3zM10 20v-5h4v5"/>',
    bus: '<path d="M5 17V6a3 3 0 013-3h8a3 3 0 013 3v11zM5 11h14M8 20v-3M16 20v-3"/>',
    box: '<path d="M4 7l8-4 8 4v10l-8 4-8-4zM4 7l8 4 8-4M12 11v10"/>',
    heart: '<path d="M12 20s-7-4.500-7-10a4 4 0 017-2.600A4 4 0 0119 10c0 5.500-7 10-7 10z"/>',
    bag: '<path d="M5 8h14l-1 13H6zM9 8V6a3 3 0 016 0v2"/>',
    book: '<path d="M3 8l9-4 9 4-9 4zM7 10v5c3 2 7 2 10 0v-5"/>',
    phone: '<rect x="7" y="3" width="10" height="18" rx="2"/><path d="M11 18h2"/>',
    gift: '<path d="M4 10h16v10H4zM3 7h18v3H3zM12 7v13M12 7c-2-4-6-3-5 0M12 7c2-4 6-3 5 0"/>',
    game: '<path d="M6 9h12a3 3 0 013 3v2a3 3 0 01-5 2l-1-1H9l-1 1a3 3 0 01-5-2v-2a3 3 0 013-3zM8 11v3M6.500 12.500h3"/>',
    money: '<rect x="3" y="6" width="18" height="12" rx="2"/><circle cx="12" cy="12" r="2.500"/>',
    up: '<path d="M12 19V5M6 11l6-6 6 6"/>',
    save: '<path d="M12 3l7 9-7 9-7-9z"/>',
    chart: '<path d="M3 17l6-6 4 4 8-8M15 7h6v6"/>',
    target: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/>',
    dot: '<circle cx="12" cy="12" r="2.500"/>'
  };
  const RULES = [
    [/กิน|อาหาร|ข้าว|ขนม|ของกิน|มื้อ/, "food"], [/คาเฟ่|กาแฟ|ชา|เครื่องดื่ม|น้ำดื่ม/, "cafe"],
    [/หอ|บ้าน|เช่า|น้ำ|ไฟ|ค่าห้อง/, "home"], [/เดินทาง|รถ|น้ำมัน|bts|mrt|แท็กซี่|วิน/i, "bus"],
    [/จำเป็น|ของใช้|ซักผ้า/, "box"], [/สุขภาพ|ยา|หมอ|โรงพยาบาล|ฟิตเนส/, "heart"],
    [/ช้อป|เสื้อ|ของชอบ|แต่งตัว|เครื่องสำอาง/, "bag"], [/เรียน|หนังสือ|คอร์ส|ค่าเทอม|การศึกษา/, "book"],
    [/โทรศัพท์|เน็ต|มือถือ|ค่าโทร|wifi/i, "phone"], [/ของขวัญ|ทำบุญ|บริจาค/, "gift"],
    [/เกม|หนัง|บันเทิง|เที่ยว|สตรีม/, "game"], [/เป้าหมาย/, "target"], [/ลงทุน|หุ้น|กองทุน/, "chart"]
  ];
  function catIcon(name, type){
    for(const [re, k] of RULES) if(re.test(name)) return IC[k];
    if(type === "income") return /เงินเดือน|ค่าจ้าง|กยศ|ทุน|โบนัส|ขาย/.test(name) ? IC.money : IC.up;
    if(type === "saving") return IC.save;
    return IC.dot;
  }
  window.vaultetCatIcon = catIcon;
  function decorateCats(){
    document.querySelectorAll("#catGrid .cat-chip-label").forEach(b => {
      if(b.querySelector(".v-cat-ic")) return;
      b.insertAdjacentHTML("afterbegin", '<span class="v-cat-ic" aria-hidden="true"><svg viewBox="0 0 24 24">' + catIcon(b.dataset.cat || "", formType) + "</svg></span>");
    });
  }

  // ---------- ผูกกับฟังก์ชันเดิม ----------
  const _rcg = renderCatGrid;
  renderCatGrid = function(){ _rcg.apply(this, arguments); decorateCats(); };
  const _sft = setFormType;
  setFormType = function(t, isInit){
    // สลับประเภทเอง (ไม่ใช่ตอนเปิดฟอร์ม) → คงบัญชีที่เลือกไว้ ไม่เด้งกลับบัญชีเริ่มต้น
    const accSel = document.getElementById("entryAccount"), keep = isInit ? null : accSel && accSel.value;
    const r = _sft.apply(this, arguments);
    if(keep && accSel && [...accSel.options].some(o => o.value === keep)) accSel.value = keep;
    syncFields(); requestAnimationFrame(syncType); return r;
  };
  const _of = openForm;
  openForm = function(entry){
    _of.apply(this, arguments);
    sheet.classList.remove("v-kp-off");
    syncFields(); syncSave(); decorateCats();
    requestAnimationFrame(syncType);
  };

  // ---------- บันทึกรายการใหม่แล้ว: แจ้งผลพร้อมปุ่ม "ย้อน" ----------
  let added = null;
  const _ce = commitEntry;
  commitEntry = function(payload){
    const res = _ce.apply(this, arguments);
    if(res && res.ok && res.entry && payload && !payload.editingId) added = res.entry;
    return res;
  };
  submit.addEventListener("click", () => { added = null; }, true);
  submit.addEventListener("click", () => {
    const en = added; added = null;
    if(!en || overlay.classList.contains("open")) return;
    const what = en.type === "transfer" ? "โอนเงิน" : (en.category || "");
    vaultetSnack("บันทึกแล้ว · " + what + " ฿" + fmt(en.amount), {
      action: "ย้อน",
      onAction: async () => {
        if(!entries.some(e => e.id === en.id)) return;
        await deleteEntryById(en.id);
        vaultetSnack("ย้อนแล้ว ลบรายการที่เพิ่งบันทึก", { duration: 2500 });
      }
    });
  });
})();
