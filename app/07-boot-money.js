// Vaultet — app/07-boot-money.js : เริ่มแอป (โหลดข้อมูล + วาดครั้งแรก), เงินกันไว้, เงินให้ยืม, หนี้, ที่ต้องจ่ายบนหน้าหลัก
// (แยกจาก app.js เดิม — โหลดเรียงตามเลขไฟล์ ทุกไฟล์ใช้ตัวแปร/ฟังก์ชันร่วมกันแบบ global)
loadEntries();
loadCategories();
loadLastCat();
loadAccounts();
loadLastAccount();
loadReserved();
loadLoans();
loadRecurring();
loadDebts();
loadBudgets();
loadEmergencyFundConfig();
ensureDefaultDebts();
selectedMonth = monthKey(todayISO());
render();
// (AI) refreshApiKeyStatus(); refreshProactiveCard(); ย้ายไปรันท้าย ai.js

// ตัวเลือกบัญชีสำหรับฟอร์ม (เลือกจากรายการ ไม่ต้องพิมพ์เลข)
const accountOptions = () => accounts.map(a => ({ value: a.id, label: a.name }));
// ไอคอนปุ่มในหน้าต่างจัดการ (ชุดเดียวกันทั้งแอป แทนอีโมจิ)
const ICON_EDIT = '<svg class="v-ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16z"/></svg>';
const ICON_PAUSE = '<svg class="v-ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5v14M15 5v14"/></svg>';
const ICON_PLAY = '<svg class="v-ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5l11 7-11 7z"/></svg>';
const ICON_BAN = '<svg class="v-ic" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8"/><path d="M6.300 6.300l11.400 11.400"/></svg>';
const ICON_TRASH = '<svg class="v-ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 12h10l1-12M9 7V4h6v3"/></svg>';
function renderAccountsManageList(){
  const el = document.getElementById("accountsManageList");
  el.innerHTML = accounts.map(a => `
    <div class="account-row">
      <span class="acc-name">${escapeHtml(a.name)} <span class="mono" style="color:var(--faint)">฿${fmt(computeAccountBalance(a.id))}</span></span>
      <span class="acc-actions">
        <button class="icon-btn rename-acc-btn" data-id="${a.id}" aria-label="แก้ไข">${ICON_EDIT}</button>
        <button class="icon-btn delete-acc-btn" data-id="${a.id}" aria-label="ลบ">${ICON_TRASH}</button>
      </span>
    </div>
  `).join("");
  el.querySelectorAll(".rename-acc-btn").forEach(btn => {
    btn.addEventListener("click", async () => {
      const acc = accounts.find(a => a.id === btn.dataset.id);
      if(!acc) return;
      const v = await vaultetForm({ title: "แก้ไขบัญชี", fields: [
        { key: "name", label: "ชื่อบัญชี", value: acc.name, required: true },
        { key: "bal", label: "ยอดเริ่มต้น (บาท)", type: "number", value: acc.initialBalance || 0, hint: "ใช้ตอนสร้างบัญชีครั้งแรกเท่านั้น ไม่กระทบรายการที่บันทึกไปแล้ว" }
      ] });
      if(!v) return;
      acc.name = v.name;
      if(v.bal !== null) acc.initialBalance = v.bal;
      saveAccounts();
      renderAccountsManageList();
      render();
    });
  });
  el.querySelectorAll(".delete-acc-btn").forEach(btn => {
    btn.addEventListener("click", async () => {
      if(accounts.length <= 1){
        showToast("ต้องเหลืออย่างน้อย 1 บัญชี");
        return;
      }
      const acc = accounts.find(a => a.id === btn.dataset.id);
      if(!acc) return;
      const inUse = entries.some(e => e.accountId===acc.id || e.fromAccountId===acc.id || e.toAccountId===acc.id)
        || loans.some(l => l.accountId===acc.id || l.repayments.some(r => r.accountId===acc.id));
      const fallback = accounts.find(a => a.id !== acc.id);
      const msg = inUse
        ? `บัญชี "${acc.name}" มีรายการผูกอยู่ ลบแล้วรายการเหล่านั้นจะถูกย้ายไปที่ "${fallback.name}" — ยืนยันไหม?`
        : `ลบบัญชี "${acc.name}" ใช่ไหม?`;
      if(!(await vaultetAsk("ลบ", msg, true))) return;
      if(inUse){
        entries.forEach(e => {
          if(e.accountId === acc.id) e.accountId = fallback.id;
          if(e.fromAccountId === acc.id) e.fromAccountId = fallback.id;
          if(e.toAccountId === acc.id) e.toAccountId = fallback.id;
        });
        saveEntries();
        loans.forEach(l => {
          if(l.accountId === acc.id) l.accountId = fallback.id;
          l.repayments.forEach(r => { if(r.accountId === acc.id) r.accountId = fallback.id; });
        });
        saveLoans();
      }
      accounts = accounts.filter(a => a.id !== acc.id);
      saveAccounts();
      renderAccountsManageList();
      render();
    });
  });
}

document.getElementById("manageAccountsBtn").addEventListener("click", () => {
  renderAccountsManageList();
  document.getElementById("accountsOverlay").classList.add("open");
});
document.getElementById("closeAccountsBtn").addEventListener("click", () => {
  document.getElementById("accountsOverlay").classList.remove("open");
});
document.getElementById("accountsOverlay").addEventListener("click", () => {
  document.getElementById("accountsOverlay").classList.remove("open");
});
document.getElementById("addAccountBtn").addEventListener("click", async () => {
  const v = await vaultetForm({ title: "เพิ่มบัญชี", okText: "เพิ่มบัญชี", fields: [
    { key: "name", label: "ชื่อบัญชี", required: true, placeholder: "เช่น ธนาคาร, เงินสด, Wallet, เงินออม" },
    { key: "bal", label: "ยอดเงินเริ่มต้นตอนนี้ (บาท)", type: "number", value: 0 }
  ] });
  if(!v) return;
  accounts.push({ id: makeId(), name: v.name, initialBalance: v.bal || 0 });
  saveAccounts();
  renderAccountsManageList();
  render();
});

// ===== เงินกันไว้ / Reserved Money =====
function renderReservedManageList(){
  const el = document.getElementById("reservedManageList");
  if(!reservedItems.length){
    el.innerHTML = `<div class="empty-state">ยังไม่มีเงินกันไว้</div>`;
    return;
  }
  el.innerHTML = reservedItems.map(r => `
    <div class="account-row">
      <span class="acc-name">${escapeHtml(r.name)} <span class="mono" style="color:var(--faint)">฿${fmt(r.amount)}</span>${r.dueDate ? ` <span style="color:var(--faint)">(${dayLabel(r.dueDate)})</span>` : ""}</span>
      <span class="acc-actions">
        <button class="small-btn primary pay-reserved-btn" data-id="${r.id}">จ่ายแล้ว</button>
        <button class="icon-btn edit-reserved-btn" data-id="${r.id}" aria-label="แก้ไข">${ICON_EDIT}</button>
        <button class="icon-btn delete-reserved-btn" data-id="${r.id}" aria-label="ลบ">${ICON_TRASH}</button>
      </span>
    </div>
  `).join("");
  el.querySelectorAll(".pay-reserved-btn").forEach(btn => {
    btn.addEventListener("click", async () => {
      const r = reservedItems.find(x => x.id === btn.dataset.id);
      if(!r) return;
      if(!accounts.length){ showToast("ยังไม่มีบัญชี"); return; }
      const cats = CATS_BY_TYPE.expense.length ? CATS_BY_TYPE.expense : ["อื่นๆ"];
      const v = await vaultetForm({ title: `จ่ายแล้ว — ${r.name}`, okText: "บันทึก", fields: [
        { key: "amt", label: "จำนวนที่จ่ายจริง (บาท)", type: "number", value: r.amount, required: true, positive: true },
        { key: "cat", label: "หมวดหมู่", type: "select", options: cats.map(c => ({ value: c, label: c })), value: cats[0] },
        { key: "acc", label: "จ่ายจากบัญชี", type: "select", options: accounts.map(a => ({ value: a.id, label: a.name })), value: accounts[0].id },
        { key: "date", label: "วันที่จ่าย", type: "date", value: todayISO(), required: true }
      ] });
      if(!v) return;
      if(!isValidISODate(v.date)){ showToast("วันที่ไม่ถูกต้อง"); return; }
      // บันทึกรายจ่ายจริง แล้วเอาเงินกันไว้ก้อนนี้ออก (กันหักซ้ำสองรอบ) — ส่วนที่เหลือถ้าจ่ายน้อยกว่าจะกลับเป็นเงินที่ใช้ได้
      entries.unshift({ id: makeId(), type: "expense", amount: v.amt, category: v.cat, accountId: v.acc, date: v.date, note: r.name });
      saveEntries();
      reservedItems = reservedItems.filter(x => x.id !== r.id);
      saveReserved();
      renderReservedManageList();
      render();
      showToast("บันทึกว่าจ่ายแล้ว");
    });
  });
  el.querySelectorAll(".edit-reserved-btn").forEach(btn => {
    btn.addEventListener("click", async () => {
      const r = reservedItems.find(x => x.id === btn.dataset.id);
      if(!r) return;
      const v = await vaultetForm({ title: "แก้ไขเงินกันไว้", fields: [
        { key: "name", label: "ชื่อรายการ", value: r.name, required: true },
        { key: "amt", label: "จำนวนเงินที่กันไว้ (บาท)", type: "number", value: r.amount, required: true, positive: true },
        { key: "due", label: "วันครบกำหนด (ไม่บังคับ)", type: "date", value: r.dueDate || "" }
      ] });
      if(!v) return;
      r.name = v.name; r.amount = v.amt; r.dueDate = v.due || "";
      saveReserved();
      renderReservedManageList();
      render();
    });
  });
  el.querySelectorAll(".delete-reserved-btn").forEach(btn => {
    btn.addEventListener("click", async () => {
      if(!(await vaultetAsk("ลบ", "ลบรายการเงินกันไว้นี้ใช่ไหม?", true))) return;
      reservedItems = reservedItems.filter(x => x.id !== btn.dataset.id);
      saveReserved();
      renderReservedManageList();
      render();
    });
  });
}
document.getElementById("manageReservedBtn").addEventListener("click", () => {
  renderReservedManageList();
  document.getElementById("reservedOverlay").classList.add("open");
});
document.getElementById("closeReservedBtn").addEventListener("click", () => {
  document.getElementById("reservedOverlay").classList.remove("open");
});
document.getElementById("reservedOverlay").addEventListener("click", () => {
  document.getElementById("reservedOverlay").classList.remove("open");
});
document.getElementById("addReservedBtn").addEventListener("click", async () => {
  const v = await vaultetForm({ title: "เพิ่มเงินกันไว้", okText: "เพิ่ม", fields: [
    { key: "name", label: "กันเงินไว้สำหรับอะไร", required: true, placeholder: "เช่น ค่าเช่าห้อง, ค่าเน็ต" },
    { key: "amt", label: "จำนวนเงินที่กันไว้ (บาท)", type: "number", required: true, positive: true },
    { key: "due", label: "วันครบกำหนด (ไม่บังคับ)", type: "date" }
  ] });
  if(!v) return;
  reservedItems.push({ id: makeId(), name: v.name, amount: v.amt, dueDate: v.due || "", note: "" });
  saveReserved();
  renderReservedManageList();
  render();
});


// ===== Milestone 5: Debt Management Engine — UI =====
function renderDebtsManageList(){
  const el = document.getElementById("debtsManageList");
  let seeded=false;
  debts.forEach(d=>{ if(!Array.isArray(d.quick)){ d.quick = /^กยศ/.test(d.name||"") ? [{amount:3000,note:"ค่าครองชีพ"},{amount:9250,note:"ค่าเทอม"}] : []; seeded=true; } });
  if(seeded) saveDebts();
  const eff = h => h.type==="repayment" ? -Math.abs(h.amount) : h.type==="increase" ? Math.abs(h.amount) : Number(h.amount)||0;
  if(!debts.length){
    el.innerHTML = `<div class="empty-state">ยังไม่มีข้อมูลหนี้สิน กด "+ เพิ่มหนี้ใหม่" ด้านล่าง</div>`;
  }else{
    // จำว่าการ์ดไหนกางประวัติอยู่ — วาดใหม่แล้วไม่ต้องพับกลับ (เช่น หลังลบปุ่มลัด/ยกเลิกรายการ)
    const openIds = new Set([...el.querySelectorAll(".v-debt-more[open]")].map(x => x.closest(".v-debt")?.dataset.id));
    el.innerHTML = debts.map(d => `
      <div class="v-debt" data-id="${d.id}">
        <div class="v-debt-name">${escapeHtml(d.name)}${d.gracePeriod ? `<span class="v-pill v-pill-watch">Grace Period</span>` : ""}</div>
        <div class="v-debt-bal">฿${fmt(d.outstandingBalance)}</div>
        <div class="v-debt-actions">
          <button type="button" class="v-btn-solid" data-act="repayment" data-id="${d.id}">ชำระคืน</button>
          <button type="button" class="v-btn-soft" data-act="increase" data-id="${d.id}">เพิ่มยอด</button>
          <button type="button" class="v-btn-soft" data-act="set" data-id="${d.id}">แก้ยอด</button>
        </div>
        ${d.quick.length ? `<div class="v-chips v-debt-quick">${d.quick.map((x,i)=>`<button type="button" class="v-chip v-chip-pill" data-qi="${i}" data-id="${d.id}">+${fmt(x.amount)} ${escapeHtml(x.note||"")}</button>`).join("")}</div>` : ""}
        <details class="v-debt-more">
          <summary>ประวัติและตัวเลือก${d.history.length ? ` (${d.history.length})` : ""}</summary>
          <div class="v-debt-hist">
            ${d.history.length ? d.history.slice(0,8).map(h => { const e=eff(h); return `
              <div class="v-hrow">
                <span class="v-hrow-main">${dayLabel(h.date)} · ${debtHistoryLabel(h.type)}${h.note ? " · "+escapeHtml(h.note) : ""}</span>
                <span class="v-hrow-amt ${e>0 ? "v-tone-out-red" : "v-tone-in"}">${e>=0?'+':'−'}฿${fmt(Math.abs(e))}</span>
                ${h.entryId ? `<span class="v-hrow-note" title="เชื่อมกับรายการ กยศ. — ลบที่รายการนั้น">ผูกรายการ</span>` : `<button type="button" class="v-link" data-undo="${h.id}" data-id="${d.id}" aria-label="ยกเลิกรายการนี้">ยกเลิก</button>`}
              </div>`; }).join("") : `<div class="v-hint">ยังไม่มีประวัติ</div>`}
          </div>
          <div class="v-label">ปุ่มลัดเพิ่มยอด</div>
          <div class="v-chips v-debt-manage">
            ${d.quick.map((x,i)=>`<span class="v-chip-wrap"><span class="v-chip">+${fmt(x.amount)} ${escapeHtml(x.note||"")}</span><button type="button" class="v-chip-x" data-qd="${i}" data-id="${d.id}" aria-label="ลบปุ่มลัด">×</button></span>`).join("")}
            <button type="button" class="v-chip v-chip-add" data-act="addq" data-id="${d.id}">+ ปุ่มลัด</button>
          </div>
          <button type="button" class="v-del-link delete-debt-btn" data-id="${d.id}">ลบหนี้นี้ทั้งก้อน</button>
        </details>
      </div>
    `).join("");
    el.querySelectorAll(".v-debt").forEach(c => { if(openIds.has(c.dataset.id)) c.querySelector(".v-debt-more").open = true; });
  }

  const select = document.getElementById("debtActionSelect");
  const prevSelected = select.value;
  select.innerHTML = debts.map(d => `<option value="${d.id}">${escapeHtml(d.name)}</option>`).join("");
  if(debts.some(d => d.id === prevSelected)) select.value = prevSelected;
  document.getElementById("debtActionAmount").value = "";
  document.getElementById("debtActionNote").value = "";

  if(el._bound) return; el._bound = true;
  el.addEventListener("click", async ev => {
    const btn = ev.target.closest("button"); if(!btn) return;
    const d = debts.find(x => x.id === btn.dataset.id); if(!d) return;
    const done = msg => { renderDebtsManageList(); render(); if(msg) showToast(msg); };
    if(btn.dataset.qi !== undefined){               // ปุ่มลัด: ถามยืนยันกันกดพลาด
      const q = d.quick[+btn.dataset.qi]; if(!q) return;
      if((await vaultetAsk("เพิ่มยอด", `เพิ่มหนี้ "${d.name}" +฿${fmt(q.amount)} (${q.note||"ไม่มีโน้ต"}) ใช่ไหม?`, false))){ addDebtHistory(d.id,"increase",q.amount,q.note); done("บันทึกยอดหนี้เพิ่มแล้ว (กด ↶ ถ้าพลาดได้)"); }
    }else if(btn.dataset.qd !== undefined){
      const q = d.quick[+btn.dataset.qd];
      if(q && (await vaultetAsk("ลบ", `ลบปุ่มลัด "+${fmt(q.amount)} ${q.note||""}" ?`, true))){ d.quick.splice(+btn.dataset.qd,1); saveDebts(); done(); }
    }else if(btn.dataset.act === "addq"){
      const q = await vaultetForm({ title: `เพิ่มปุ่มลัดของ "${d.name}"`, okText: "เพิ่มปุ่มลัด", fields: [
        { key: "amt", label: "จำนวนเงิน (บาท)", type: "number", required: true, positive: true },
        { key: "note", label: "ชื่อปุ่ม/โน้ต", placeholder: "เช่น ค่าเทอม" }
      ] });
      if(!q) return;
      d.quick.push({amount:q.amt,note:q.note}); saveDebts(); done();
    }else if(btn.dataset.act){                       // เพิ่มยอด / ชำระคืน / แก้ยอด -> ชี้ฟอร์มด้านล่างมาที่หนี้นี้
      const t = btn.dataset.act;
      document.getElementById("debtActionSelect").value = d.id;
      document.getElementById("debtActionType").value = t;
      const lb = document.querySelector(".debt-action-row .field-label");
      if(lb) lb.textContent = `${{increase:"เพิ่มยอด",repayment:"ชำระคืน",set:"แก้ยอดคงค้างของ"}[t]} · ${d.name}`;
      const inp = document.getElementById("debtActionAmount");
      inp.scrollIntoView({block:"center",behavior:"smooth"}); setTimeout(()=>inp.focus(),300);
    }else if(btn.dataset.undo){                      // ยกเลิกรายการประวัติ (ย้อนยอดกลับ)
      const h = d.history.find(x => x.id === btn.dataset.undo); if(!h) return;
      const e = eff(h);
      if(!(await vaultetAsk("ยกเลิกรายการ", `ยกเลิกรายการนี้?\n${debtHistoryLabel(h.type)} ${e>=0?"+":"−"}฿${fmt(Math.abs(e))}${h.note?" ("+h.note+")":""}\nยอดหนี้จะย้อนกลับ ${e>=0?"ลดลง":"เพิ่มขึ้น"} ฿${fmt(Math.abs(e))}`, true))) return;
      d.outstandingBalance = Math.max(0, toCents(d.outstandingBalance) - toCents(e)) / 100;
      d.history = d.history.filter(x => x.id !== h.id); saveDebts(); done("ยกเลิกรายการแล้ว");
    }else if(btn.classList.contains("delete-debt-btn")){
      const linked = entries.filter(e => e.debtId===d.id && Number(e.debtPrincipalImpact||0)!==0);
      const msg = linked.length
        ? `หนี้ "${d.name}" เชื่อมกับ ${linked.length} รายการรับเงิน กยศ.\\nถ้าลบ รายการรับเงินเหล่านั้นจะยังอยู่ แต่เลิกเชื่อมกับหนี้นี้\\nลบหนี้พร้อมประวัติทั้งหมดใช่ไหม?`
        : `ลบหนี้ "${d.name}" พร้อมประวัติทั้งหมดใช่ไหม?`;
      if(!(await vaultetAsk("ลบ", msg.replace(/\\n/g,"\n"), true))) return;
      linked.forEach(e => { e.debtId = null; e.debtPrincipalImpact = 0; });
      if(linked.length) saveEntries();
      debts = debts.filter(x => x.id !== d.id); saveDebts(); done("ลบหนี้แล้ว");
    }
  });
}
document.getElementById("manageDebtsBtn").addEventListener("click", () => {
  document.getElementById("debtAddForm").style.display = "none";
  renderDebtsManageList();
  document.getElementById("debtsOverlay").classList.add("open");
});
document.getElementById("closeDebtsBtn").addEventListener("click", () => {
  document.getElementById("debtsOverlay").classList.remove("open");
});
document.getElementById("debtsOverlay").addEventListener("click", () => {
  document.getElementById("debtsOverlay").classList.remove("open");
});

// ฟอร์มแก้ไข/บันทึกรายการหนี้ — ไม่ใช้ window.prompt() เด็ดขาด ใช้ input ใน Modal เท่านั้น
document.getElementById("debtActionSubmitBtn").addEventListener("click", () => {
  const debtId = document.getElementById("debtActionSelect").value;
  const actionType = document.getElementById("debtActionType").value;
  const amount = document.getElementById("debtActionAmount").value;
  const note = document.getElementById("debtActionNote").value;
  if(!debtId){ showToast("ยังไม่มีรายการหนี้ให้เลือก — เพิ่มหนี้ใหม่ก่อน"); return; }
  const amt = parseFloat(amount);
  if(!amt || amt<=0){ showToast("กรอกจำนวนเงินให้ถูกต้อง"); return; }

  const ok = (actionType === "set")
    ? setDebtBalance(debtId, amt, note)
    : addDebtHistory(debtId, actionType, amt, note);

  if(!ok){ showToast("บันทึกไม่สำเร็จ ลองใหม่อีกครั้ง"); return; }
  renderDebtsManageList();
  render();
  showToast("บันทึกแล้ว");
});

// ฟอร์มเพิ่มหนี้ใหม่ (แสดง/ซ่อนแบบ inline แทน prompt())
document.getElementById("addDebtBtn").addEventListener("click", () => {
  const formEl = document.getElementById("debtAddForm");
  const showing = formEl.style.display !== "none";
  formEl.style.display = showing ? "none" : "flex";
  if(!showing){
    document.getElementById("debtNewName").value = "";
    document.getElementById("debtNewAmount").value = "";
    document.getElementById("debtNewGrace").checked = true;
    document.getElementById("debtNewName").focus();
  }
});
document.getElementById("debtNewSubmitBtn").addEventListener("click", () => {
  const name = document.getElementById("debtNewName").value.trim();
  const amt = parseFloat(document.getElementById("debtNewAmount").value);
  const grace = document.getElementById("debtNewGrace").checked;
  if(!name){ showToast("กรอกชื่อหนี้ก่อน"); return; }
  if(isNaN(amt) || amt<0){ showToast("กรอกยอดคงค้างเริ่มต้นให้ถูกต้อง"); return; }

  debts.push({
    id: makeId(), name, type: "other", outstandingBalance: amt, gracePeriod: grace, note: "",
    history: [{ id: makeId(), type:"adjustment", amount: amt, date: todayISO(), note:"ยอดเริ่มต้น" }]
  });
  saveDebts();
  document.getElementById("debtAddForm").style.display = "none";
  renderDebtsManageList();
  render();
  showToast("เพิ่มหนี้ใหม่แล้ว");
});

// ===== Milestone 5: แจ้งเตือนเสนอเพิ่มยอดหนี้อัตโนมัติ เมื่อบันทึกรายรับหมวด "กยศ." =====
let pendingDebtBump = null; // { debtId, amount }
function showDebtBumpBanner(debt, amount){
  if(!debt) return;
  pendingDebtBump = { debtId: debt.id, amount };
  document.getElementById("debtBumpText").textContent =
    `บันทึกรายรับ "กยศ." ฿${fmt(amount)} — เพิ่มยอดหนี้ ${debt.name} ตามนี้ด้วยไหม?`;
  document.getElementById("debtBumpBanner").classList.add("show");
}
function hideDebtBumpBanner(){
  pendingDebtBump = null;
  document.getElementById("debtBumpBanner").classList.remove("show");
}
document.getElementById("debtBumpConfirmBtn").addEventListener("click", () => {
  if(!pendingDebtBump) return;
  addDebtHistory(pendingDebtBump.debtId, "increase", pendingDebtBump.amount, "จากรายรับ กยศ. อัตโนมัติ");
  hideDebtBumpBanner();
  render();
  showToast("เพิ่มยอดหนี้แล้ว");
});
document.getElementById("debtBumpDismissBtn").addEventListener("click", hideDebtBumpBanner);

// ===== Phase 4: Recurring Expenses + Upcoming Payments — UI =====

const FREQ_OPTIONS = [
  { value: "weekly", label: "รายสัปดาห์" }, { value: "monthly", label: "รายเดือน" }, { value: "bimonthly", label: "ทุก 2 เดือน" },
  { value: "quarterly", label: "รายไตรมาส" }, { value: "yearly", label: "รายปี" }
];
// ฟอร์มค่าใช้จ่ายประจำ (ใช้ทั้งเพิ่มและแก้ไข) — r = รายการเดิม หรือ null ถ้าเพิ่มใหม่
async function askRecurringForm(r){
  const cats = CATS_BY_TYPE.expense || [];
  return vaultetForm({ title: r ? "แก้ไขค่าใช้จ่ายประจำ" : "เพิ่มค่าใช้จ่ายประจำ", okText: r ? "บันทึก" : "เพิ่ม", fields: [
    { key: "name", label: "ชื่อค่าใช้จ่ายประจำ", value: r ? r.name : "", required: true, placeholder: "เช่น ค่าเช่าห้อง, Netflix" },
    { key: "amt", label: "จำนวนเงินโดยประมาณ (บาท)", type: "number", value: r ? r.amount : "", required: true, positive: true },
    { key: "cat", label: "หมวดหมู่", type: "select", options: cats.map(c => ({ value: c, label: c })), value: r && cats.includes(r.category) ? r.category : cats[0] },
    ...(accounts.length > 1 ? [{ key: "acc", label: "หักจากบัญชี", type: "select", options: accountOptions(), value: (r && r.accountId) || accounts[0].id }] : []),
    { key: "freq", label: "ความถี่", type: "select", options: FREQ_OPTIONS, value: r ? r.frequency : "monthly" },
    { key: "next", label: "วันครบกำหนดจ่ายครั้งถัดไป", type: "date", value: r ? r.nextDueDate : todayISO(), required: true },
    ...(r ? [{ key: "end", label: "วันสิ้นสุด (ไม่บังคับ)", type: "date", value: r.endDate || "" }] : []),
    ...(reservedItems.length ? [{ key: "link", label: "เชื่อมกับเงินกันไว้", type: "select", options: [{ value: "", label: "ไม่เชื่อม" }, ...reservedItems.map(x => ({ value: x.id, label: `${x.name} (฿${fmt(x.amount)})` }))], value: r ? (r.reservedItemId || "") : "" }] : []),
    { key: "note", label: "โน้ต (ไม่บังคับ)", value: r ? (r.note || "") : "" }
  ] });
}
function isValidISODate(s){
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s.trim()) && !isNaN(new Date(s.trim()).getTime());
}

// ----- Dashboard widget (แสดงย่อ 3-5 รายการใกล้ที่สุด) -----
function renderUpcomingWidget(){
  const card = document.getElementById("upcomingCard");
  if(!recurringExpenses.length){ card.style.display = "none"; return; }
  const summary = getUpcomingSummary();
  card.style.display = "block";
  document.getElementById("upcomingTotalNum").textContent = "฿" + fmt(summary.total);
  const items = getUpcomingOccurrences("30d").slice(0, 5);
  const listEl = document.getElementById("upcomingPreviewList");
  let html = "";
  if(summary.overdue > 0){
    html += `<div class="networth-sub" style="color:var(--expense)"><span>ค้างจ่าย (Overdue)</span><span class="mono">฿${fmt(summary.overdue)}</span></div>`;
  }
  if(!items.length){
    html += `<div class="networth-sub"><span>ไม่มีรายการใน 30 วันข้างหน้า</span><span></span></div>`;
  }else{
    html += items.map(({r, status, days}) => {
      const dayText = status==="overdue" ? `เลยกำหนด ${Math.abs(days)} วัน` : status==="dueToday" ? "วันนี้" : `อีก ${days} วัน`;
      const color = status==="overdue" ? "var(--expense)" : "var(--faint)";
      return `<div class="networth-sub"><span style="color:var(--ink)">${escapeHtml(r.name)} <span style="color:${color}">· ${dayText}</span></span><span class="mono">฿${fmt(r.amount)}</span></div>`;
    }).join("");
  }
  listEl.innerHTML = html;
}
