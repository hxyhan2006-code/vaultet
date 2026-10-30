// Vaultet — app/08-plans-ui.js : รายการที่ต้องจ่าย/ค่าใช้จ่ายประจำ (หน้าต่าง), เงินสำรองฉุกเฉิน, งบประมาณ (หน้าจอ)
// (แยกจาก app.js เดิม — โหลดเรียงตามเลขไฟล์ ทุกไฟล์ใช้ตัวแปร/ฟังก์ชันร่วมกันแบบ global)
// ----- Upcoming overlay: filter, summary stats, full list, mark paid / skip -----
function renderUpcomingOverlay(){
  document.getElementById("upcomingFilterSelect").value = upcomingFilter;
  const summary = getUpcomingSummary();
  document.getElementById("upcomingStatsGrid").innerHTML = `
    <div class="stat-box"><div class="stat-box-label">ค่าใช้จ่ายที่กำลังจะถึง</div><div class="stat-box-num">฿${fmt(summary.total)}</div></div>
    <div class="stat-box"><div class="stat-box-label">จำนวนรายการ</div><div class="stat-box-num">${summary.count} รายการ</div></div>
    <div class="stat-box"><div class="stat-box-label">ภายใน 7 วัน</div><div class="stat-box-num">฿${fmt(summary.within7)}</div></div>
    <div class="stat-box"><div class="stat-box-label">ภายใน 30 วัน</div><div class="stat-box-num">฿${fmt(summary.within30)}</div></div>
    <div class="stat-box"><div class="stat-box-label" style="color:var(--expense)">Overdue</div><div class="stat-box-num" style="color:var(--expense)">฿${fmt(summary.overdue)}</div></div>
    <div class="stat-box"><div class="stat-box-label">ประมาณต่อเดือน</div><div class="stat-box-num">฿${fmt(computeMonthlyRecurringCost())}</div></div>
  `;
  const items = getUpcomingOccurrences(upcomingFilter);
  const listEl = document.getElementById("upcomingFullList");
  if(!items.length){
    listEl.innerHTML = `<div class="empty-state">ไม่มีรายการที่กำลังจะถึงในช่วงนี้</div>`;
    return;
  }
  listEl.innerHTML = items.map(({r, status, days}) => {
    const dayText = status==="overdue" ? `เลยกำหนดมาแล้ว ${Math.abs(days)} วัน` : status==="dueToday" ? "ครบกำหนดวันนี้" : `อีก ${days} วัน`;
    const color = status==="overdue" ? "var(--expense)" : status==="dueToday" ? "var(--locked)" : "var(--ink)";
    const accName = accounts.find(a => a.id===r.accountId)?.name || "บัญชีที่ถูกลบ";
    const link = getReservedLinkInfo(r);
    let reservedLine;
    if(!link){
      reservedLine = `<div class="list-note">ยังไม่ได้กันเงิน</div>`;
    }else if(link.shortfall <= 0){
      reservedLine = `<div class="list-note" style="color:var(--income)">กันไว้แล้ว ฿${fmt(link.reservedAmount)} · ครบแล้ว</div>`;
    }else{
      reservedLine = `<div class="list-note" style="color:var(--expense)">กันไว้แล้ว ฿${fmt(link.reservedAmount)} · ยังขาด ฿${fmt(link.shortfall)}</div>`;
    }
    return `<div class="upcoming-item">
      <div>
        <div class="list-cat" style="color:${color}">${escapeHtml(r.name)} · ${dayText}</div>
        <div class="list-note">${[frequencyLabel(r.frequency), accounts.length>1?escapeHtml(accName):"", "฿"+fmt(r.amount)].filter(Boolean).join(" · ")}</div>
        ${reservedLine}
      </div>
      <div class="upcoming-actions">
        <span class="mono" style="font-weight:600;color:var(--expense)">฿${fmt(r.amount)}</span>
        <button class="small-btn primary mark-paid-btn" data-id="${r.id}">บันทึกว่าจ่ายแล้ว</button>
        <button class="small-btn skip-recurring-btn" data-id="${r.id}">ข้ามรอบนี้</button>
      </div>
    </div>`;
  }).join("");
  listEl.querySelectorAll(".mark-paid-btn").forEach(btn => {
    btn.addEventListener("click", () => openMarkPaid(btn.dataset.id));
  });
  listEl.querySelectorAll(".skip-recurring-btn").forEach(btn => {
    btn.addEventListener("click", async () => {
      const r = recurringExpenses.find(x => x.id === btn.dataset.id);
      if(!r) return;
      if(!(await vaultetAsk("ข้ามรอบนี้", `ข้ามรอบนี้ของ "${r.name}" ใช่ไหม? จะไม่สร้างรายจ่าย และเลื่อนไปกำหนดครั้งถัดไป`, false))) return;
      r.nextDueDate = computeNextDueDate(r.nextDueDate, r.frequency);
      saveRecurring();
      renderUpcomingOverlay();
      renderUpcomingWidget();
      showToast("ข้ามรอบนี้แล้ว");
    });
  });
}
document.getElementById("upcomingFilterSelect").addEventListener("change", (e) => {
  upcomingFilter = e.target.value;
  renderUpcomingOverlay();
});
// เปิดรายการทั้งหมด: แตะที่การ์ด #upcomingCard (ผูกใน app/09-nav-home.js)
// ปิดแผ่นแบบเลื่อนลงนุ่ม ๆ (ถ้าเครื่องตั้งลดการเคลื่อนไหวก็ปิดทันที)
function closeUpcomingSheet(){ document.getElementById("upcomingOverlay").classList.remove("open"); } // เลื่อนลงนุ่มด้วย CSS กลาง (.overlay)
document.getElementById("closeUpcomingBtn").addEventListener("click", closeUpcomingSheet);
document.getElementById("upcomingOverlay").addEventListener("click", closeUpcomingSheet);

// ----- Recurring management overlay (add / edit / pause / resume / cancel / delete) -----
function renderRecurringManageList(){
  document.getElementById("monthlyRecurringNum").textContent = "฿" + fmt(computeMonthlyRecurringCost());
  const el = document.getElementById("recurringManageList");
  if(!recurringExpenses.length){
    el.innerHTML = `<div class="empty-state">ยังไม่มีค่าใช้จ่ายประจำ</div>`;
    return;
  }
  const sorted = [...recurringExpenses].sort((a,b) => a.nextDueDate.localeCompare(b.nextDueDate));
  el.innerHTML = sorted.map(r => {
    const accName = accounts.find(a => a.id===r.accountId)?.name || "บัญชีที่ถูกลบ";
    const displayStatus = r.status === "active" ? getDueStatus(r) : r.status;
    const badgeColor = (displayStatus==="overdue") ? "var(--expense)" : (displayStatus==="paused"||displayStatus==="cancelled") ? "var(--faint)" : "var(--income)";
    return `<div class="account-row" style="align-items:flex-start;">
      <span class="acc-name" style="flex-direction:column; align-items:flex-start; display:flex;">
        <span>${escapeHtml(r.name)} <span style="color:${badgeColor}">— ${statusLabel(displayStatus)}</span></span>
        <span class="mono" style="font-size:12px;color:var(--faint)">฿${fmt(r.amount)} · ${frequencyLabel(r.frequency)} · ${accounts.length>1?escapeHtml(accName)+" · ":""}ครบกำหนด ${r.nextDueDate}</span>
      </span>
      <span class="acc-actions">
        <button class="icon-btn edit-recurring-btn" data-id="${r.id}" aria-label="แก้ไข">${ICON_EDIT}</button>
        ${r.status==="active" ? `<button class="icon-btn pause-recurring-btn" data-id="${r.id}" aria-label="หยุดชั่วคราว" title="หยุดชั่วคราว">${ICON_PAUSE}</button>` : `<button class="icon-btn resume-recurring-btn" data-id="${r.id}" aria-label="เปิดใช้งาน" title="เปิดใช้งาน">${ICON_PLAY}</button>`}
        ${r.status!=="cancelled" ? `<button class="icon-btn cancel-recurring-btn" data-id="${r.id}" aria-label="ยกเลิก" title="ยกเลิกรายการนี้">${ICON_BAN}</button>` : ""}
        <button class="icon-btn delete-recurring-btn" data-id="${r.id}" aria-label="ลบ">${ICON_TRASH}</button>
      </span>
    </div>`;
  }).join("");

  el.querySelectorAll(".edit-recurring-btn").forEach(btn => {
    btn.addEventListener("click", async () => {
      const r = recurringExpenses.find(x => x.id === btn.dataset.id);
      if(!r) return;
      const v = await askRecurringForm(r);
      if(!v) return;
      r.name = v.name; r.amount = v.amt; r.category = v.cat || r.category; r.accountId = v.acc || r.accountId;
      r.frequency = v.freq; r.nextDueDate = v.next; r.endDate = v.end || "";
      r.note = v.note || ""; if(reservedItems.length) r.reservedItemId = v.link || "";
      saveRecurring();
      renderRecurringManageList();
      renderUpcomingWidget();
      showToast("บันทึกการแก้ไขแล้ว");
    });
  });
  el.querySelectorAll(".pause-recurring-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const r = recurringExpenses.find(x => x.id === btn.dataset.id);
      if(!r) return;
      r.status = "paused"; saveRecurring(); renderRecurringManageList(); renderUpcomingWidget();
      showToast("หยุดชั่วคราวแล้ว");
    });
  });
  el.querySelectorAll(".resume-recurring-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const r = recurringExpenses.find(x => x.id === btn.dataset.id);
      if(!r) return;
      r.status = "active"; saveRecurring(); renderRecurringManageList(); renderUpcomingWidget();
      showToast("เปิดใช้งานแล้ว");
    });
  });
  el.querySelectorAll(".cancel-recurring-btn").forEach(btn => {
    btn.addEventListener("click", async () => {
      if(!(await vaultetAsk("ยกเลิกค่าใช้จ่าย", "ยกเลิกค่าใช้จ่ายประจำนี้ใช่ไหม? จะไม่แสดงใน Upcoming อีก แต่ประวัติการจ่ายเดิมจะยังอยู่เหมือนเดิม", true))) return;
      const r = recurringExpenses.find(x => x.id === btn.dataset.id);
      if(!r) return;
      r.status = "cancelled"; saveRecurring(); renderRecurringManageList(); renderUpcomingWidget();
    });
  });
  el.querySelectorAll(".delete-recurring-btn").forEach(btn => {
    btn.addEventListener("click", async () => {
      if(!(await vaultetAsk("ลบ", "ลบค่าใช้จ่ายประจำนี้ใช่ไหม? รายการที่เคยบันทึกว่าจ่ายไปแล้วจะไม่ถูกลบ", true))) return;
      recurringExpenses = recurringExpenses.filter(x => x.id !== btn.dataset.id);
      saveRecurring(); renderRecurringManageList(); renderUpcomingWidget();
    });
  });
}
document.getElementById("manageRecurringBtn")?.addEventListener("click", () => {
  renderRecurringManageList();
  document.getElementById("recurringOverlay").classList.add("open");
});
document.getElementById("openRecurringFromUpcomingBtn").addEventListener("click", () => {
  document.getElementById("upcomingOverlay").classList.remove("open");
  renderRecurringManageList();
  document.getElementById("recurringOverlay").classList.add("open");
});
document.getElementById("closeRecurringBtn").addEventListener("click", () => {
  document.getElementById("recurringOverlay").classList.remove("open");
});
document.getElementById("recurringOverlay").addEventListener("click", () => {
  document.getElementById("recurringOverlay").classList.remove("open");
});
document.getElementById("addRecurringBtn").addEventListener("click", async () => {
  if(!accounts.length){ showToast("ยังไม่มีบัญชีเลย เพิ่มบัญชีก่อน"); return; }
  if(!(CATS_BY_TYPE.expense || []).length){ showToast("ยังไม่มีหมวดรายจ่ายเลย เพิ่มหมวดก่อน"); return; }
  const v = await askRecurringForm(null);
  if(!v) return;
  recurringExpenses.push({
    id: makeId(), name: v.name, amount: v.amt, category: v.cat, accountId: v.acc || accounts[0].id,
    frequency: v.freq, nextDueDate: v.next, startDate: v.next, endDate: "",
    note: v.note || "", status: "active", reservedItemId: v.link || "", lastPaidDate: ""
  });
  saveRecurring();
  renderRecurringManageList();
  renderUpcomingWidget();
  showToast("เพิ่มค่าใช้จ่ายประจำแล้ว");
});

// ----- Forecast overlay: read-only cash flow projection (Phase 5) -----

// ----- Mark as Paid: สร้าง Expense Transaction จริงเมื่อกดยืนยันเท่านั้น -----
function openMarkPaid(id){
  const r = recurringExpenses.find(x => x.id === id);
  if(!r) return;
  markPaidRecurringId = id;
  document.getElementById("markPaidTitle").textContent = `บันทึกว่าจ่ายแล้ว — ${r.name}`;
  document.getElementById("markPaidAmount").value = r.amount;
  const cats = CATS_BY_TYPE.expense.length ? CATS_BY_TYPE.expense : [r.category];
  document.getElementById("markPaidCategory").innerHTML = cats.map(c =>
    `<option value="${escapeHtml(c)}" ${c===r.category ? "selected" : ""}>${escapeHtml(c)}</option>`
  ).join("");
  document.getElementById("markPaidAccount").innerHTML = accounts.map(a =>
    `<option value="${a.id}" ${a.id===r.accountId ? "selected" : ""}>${escapeHtml(a.name)}</option>`
  ).join("");
  document.getElementById("markPaidDate").value = todayISO();
  document.getElementById("markPaidNote").value = r.note || "";
  document.getElementById("upcomingOverlay").classList.remove("open");
  document.getElementById("markPaidOverlay").classList.add("open");
}
document.getElementById("closeMarkPaidBtn").addEventListener("click", () => {
  document.getElementById("markPaidOverlay").classList.remove("open");
  markPaidRecurringId = null;
});
document.getElementById("markPaidOverlay").addEventListener("click", () => {
  document.getElementById("markPaidOverlay").classList.remove("open");
  markPaidRecurringId = null;
});
document.getElementById("markPaidSubmitBtn").addEventListener("click", () => {
  const r = recurringExpenses.find(x => x.id === markPaidRecurringId);
  if(!r){ showToast("ไม่พบรายการ"); return; }
  const amt = parseFloat(document.getElementById("markPaidAmount").value);
  if(!amt || amt<=0){ showToast("กรอกจำนวนเงินให้ถูกต้อง"); return; }
  const category = document.getElementById("markPaidCategory").value || r.category;
  const accountId = document.getElementById("markPaidAccount").value || r.accountId;
  const date = document.getElementById("markPaidDate").value || todayISO();
  if(!isValidISODate(date)){ showToast("วันที่ไม่ถูกต้อง"); return; }
  const note = document.getElementById("markPaidNote").value.trim();
  // สร้าง Expense Transaction จริง — ใช้ยอดที่จ่ายจริง (อาจต่างจากยอดประมาณการของ recurring)
  entries.unshift({ id: makeId(), type: "expense", amount: amt, category, accountId, date, note, recurringId: r.id });
  saveEntries();
  r.lastPaidDate = date;
  r.nextDueDate = computeNextDueDate(r.nextDueDate, r.frequency); // เลื่อนไปครั้งถัดไป ไม่สร้างซ้ำ
  saveRecurring();
  document.getElementById("markPaidOverlay").classList.remove("open");
  markPaidRecurringId = null;
  render();
  showToast("บันทึกว่าจ่ายแล้ว");
});

// ===== Round 2: Emergency Fund UI =====
function emergencyStatusMeta(status){ return {CRITICAL:{label:"ยังไม่ถึงครึ่งเป้าหมาย",cls:"critical"},WATCH:{label:"กำลังสร้างเงินสำรอง",cls:"watch"},HEALTHY:{label:"ถึงเป้าหมายแล้ว",cls:"healthy"}}[status] || {label:"กำลังประเมิน",cls:"watch"}; }
function renderEmergencyCategories(){
  const el=document.getElementById("emergencyEssentialCategories"); if(!el)return;
  const cats=CATS_BY_TYPE.expense||[]; const chosen=new Set(emergencyFundConfig.essentialCategories||[]);
  el.innerHTML=cats.map(c=>`<label class="v-check"><input type="checkbox" value="${escapeHtml(c)}" ${chosen.has(c)?"checked":""}><span>${escapeHtml(c)}</span></label>`).join("");
}
function renderEmergencyPreview(){
  const e=computeEmergencyFund();
  const avg=document.getElementById("emergencyEssentialAvg"), target=document.getElementById("emergencyRecommendedTarget");
  if(avg)avg.textContent="฿"+fmt(e.monthlyEssentialExpense); if(target)target.textContent="฿"+fmt(e.recommendedEmergencyFund);
}
function openEmergencyManager(){
  const months=Number(emergencyFundConfig.targetMonths)||3; const preset=[3,6].includes(months)?String(months):"custom";
  document.getElementById("emergencyMonthsInput").value=preset;
  document.getElementById("emergencyCustomMonthsWrap").style.display=preset==="custom"?"block":"none";
  document.getElementById("emergencyCustomMonthsInput").value=preset==="custom"?months:"";
  renderEmergencyCategories(); renderEmergencyPreview(); document.getElementById("emergencyOverlay").classList.add("open");
}
function renderEmergencyDashboard(){
  const card=document.getElementById("emergencyDashboardCard"); if(!card)return; const e=computeEmergencyFund();
  card.style.display="block";
  const meta=emergencyStatusMeta(e.status);
  document.getElementById("emergencyDashboardSplit").textContent=`ออมไว้ ฿${fmt(e.emergencySaved)} + เงินสดใช้ได้ ฿${fmt(e.cashAvailable)}`;
  document.getElementById("emergencyDashboardAmount").textContent="฿"+fmt(e.currentAvailableReserve);
  document.getElementById("emergencyDashboardTarget").textContent="฿"+fmt(e.recommendedEmergencyFund);
  document.getElementById("emergencyDashboardCoverage").textContent=e.monthlyEssentialExpense>0?fmt(e.reserveCoverageMonths)+" เดือน":"ยังประเมินไม่ได้";
  document.getElementById("emergencyDashboardSub").textContent=e.recommendedEmergencyFund>0?`เป้าหมาย ${fmt(e.targetMonths)} เดือน · ค่าใช้จ่ายจำเป็นเฉลี่ย ฿${fmt(e.monthlyEssentialExpense)}`:"ยังไม่มีข้อมูลค่าใช้จ่ายจำเป็นเพียงพอ";
  const fill=document.getElementById("emergencyDashboardFill"); fill.style.width=Math.min(100,Math.max(0,e.reserveProgressPercent))+"%"; fill.style.background=e.status==="CRITICAL"?"var(--v-out)":e.status==="WATCH"?"var(--v-xfer)":"var(--v-accent)";
  document.getElementById("emergencyDashboardStatus").innerHTML=`<span class="v-pill v-pill-${meta.cls==="critical"?"over":meta.cls==="watch"?"watch":"safe"}">${meta.label}${e.reserveShortfall>0?` · ขาด ฿${fmt(e.reserveShortfall)}`:""}</span>`;
}
document.getElementById("emergencyDashboardManageBtn")?.addEventListener("click",openEmergencyManager);
document.getElementById("closeEmergencyBtn")?.addEventListener("click",()=>document.getElementById("emergencyOverlay").classList.remove("open"));
document.getElementById("emergencyOverlay")?.addEventListener("click",()=>document.getElementById("emergencyOverlay").classList.remove("open"));
document.getElementById("emergencyMonthsInput")?.addEventListener("change",e=>{ const custom=e.target.value==="custom"; document.getElementById("emergencyCustomMonthsWrap").style.display=custom?"block":"none"; renderEmergencyPreview(); });
document.getElementById("emergencyCustomMonthsInput")?.addEventListener("input",renderEmergencyPreview);
document.getElementById("saveEmergencyBtn")?.addEventListener("click",()=>{
  const sel=document.getElementById("emergencyMonthsInput").value; let months=sel==="custom"?Number(document.getElementById("emergencyCustomMonthsInput").value):Number(sel);
  if(!isFinite(months)||months<1||months>24){showToast("จำนวนเดือนต้องอยู่ระหว่าง 1–24 เดือน");return;}
  const cats=[...document.querySelectorAll("#emergencyEssentialCategories input:checked")].map(x=>x.value);
  if(!cats.length){showToast("เลือกอย่างน้อย 1 หมวดค่าใช้จ่ายจำเป็น");return;}
  emergencyFundConfig=normalizeEmergencyConfig({targetMonths:months,essentialCategories:cats}); saveEmergencyFundConfig();
  document.getElementById("emergencyOverlay").classList.remove("open"); renderEmergencyDashboard(); render(); refreshProactiveCard(true); showToast("บันทึกเป้าหมายเงินสำรองแล้ว");
});

// ===== Round 1: Budget Engine UI =====
let budgetEditingId = null;
let budgetFormKind = "expense";
function updateBudgetKindUI(){ document.querySelectorAll("#budgetKindToggle [data-bk]").forEach(b=>b.classList.toggle("on",b.dataset.bk===budgetFormKind)); const a=document.getElementById("budgetAmountInput"); if(a) a.placeholder=budgetFormKind==="saving"?"เป้าออมต่อเดือน เช่น 3000":"เช่น 5000"; const l=document.querySelector("#budgetCategoryInput")?.previousElementSibling; if(l) l.textContent=budgetFormKind==="saving"?"เลือกหมวดออม (เลือกได้หลายอัน)":"เลือกหมวดรายจ่าย (เลือกได้หลายอัน)"; }
document.getElementById("budgetKindToggle")?.addEventListener("click",e=>{const b=e.target.closest("[data-bk]"); if(!b) return; budgetFormKind=b.dataset.bk; budgetEditingId=null; document.getElementById("saveBudgetBtn").textContent="เพิ่ม / อัปเดตงบ"; renderBudgetCategorySelect([]); updateBudgetKindUI();});
function budgetStatusMeta(status){ return {DONE:{label:"ครบเป้า",cls:"safe"},SAVING:{label:"กำลังออม",cls:"watch"},SAFE:{label:"ปกติ",cls:"safe"},WATCH:{label:"เฝ้าดู",cls:"watch"},OVER:{label:"เกินงบ",cls:"over"}}[status] || {label:"ปกติ",cls:"safe"}; }
function renderBudgetCategorySelect(selected){ const el=document.getElementById("budgetCategoryInput"); if(!el)return; const cats=CATS_BY_TYPE[budgetFormKind]||[]; const sel=new Set(selected||getBudgetSelectedCats()); el.innerHTML=cats.map(c=>`<label class="v-check"><input type="checkbox" value="${escapeHtml(c)}" ${sel.has(c)?"checked":""} /><span>${escapeHtml(c)}</span></label>`).join(""); }
function getBudgetSelectedCats(){ return Array.from(document.querySelectorAll("#budgetCategoryInput input:checked")).map(x=>x.value); }
function openBudgetManager(){ budgetEditingId=null; budgetFormKind="expense"; document.getElementById("budgetMonthInput").value=monthKey(todayISO()); document.getElementById("budgetAmountInput").value=""; document.getElementById("saveBudgetBtn").textContent="เพิ่ม / อัปเดตงบ"; renderBudgetCategorySelect([]); document.getElementById("budgetNameInput").value=""; updateBudgetKindUI(); renderBudgetManager(); document.getElementById("budgetOverlay").classList.add("open"); }
function budgetRowHtml(r,manage){
  const sv=r.kind==="saving", m=budgetStatusMeta(r.status), w=Math.min(100,Math.max(0,r.pct));
  const col=sv?"var(--v-save)":(r.status==="OVER"?"var(--v-out)":r.status==="WATCH"?"var(--v-xfer)":"var(--v-accent)");
  const rem=sv?(r.remaining<=0?`เกินเป้า ฿${fmt(Math.abs(r.remaining))}`:`อีก ฿${fmt(r.remaining)} ถึงเป้า`):(r.remaining<0?`เกิน ฿${fmt(Math.abs(r.remaining))}`:`เหลือ ฿${fmt(r.remaining)}`);
  const pace=sv?(r.remainingDays>0&&r.remaining>0?`ออมเฉลี่ย ฿${fmt(r.remaining/r.remainingDays)}/วัน`:(r.remaining>0?"หมดเดือนแล้ว ยังไม่ถึงเป้า":"")):(r.remainingDays>0?`ใช้ได้เฉลี่ย ฿${fmt(r.dailyAllowance)}/วัน`:(r.projected>r.budget?"pace สูงกว่างบ":""));
  // เตือนเฉพาะที่ต้องสนใจ: เฝ้าดู/เกินงบ/ครบเป้า (โหมดจัดการแสดงสถานะทุกแถว)
  const showPill = manage || r.status==="OVER" || r.status==="WATCH" || r.status==="DONE";
  const pillCls = r.status==="OVER" ? "over" : (r.status==="WATCH"||r.status==="SAVING") ? "watch" : "safe";
  const proj = !sv && (r.status==="OVER"||r.status==="WATCH") ? `คาดทั้งเดือน ฿${fmt(r.projected)}` : "";
  const meta1 = [rem, pace].filter(Boolean).join(" · ");
  if(!manage){
    const detail = [pace, proj].filter(Boolean).join(" · ");
    const stTxt = sv ? (r.remaining<=0?"ครบเป้า":`อีก ฿${fmt(r.remaining)}`) : (r.status==="OVER" ? `เกินงบ ฿${fmt(Math.abs(r.remaining))}` : r.status==="WATCH" ? `${rem} · เฝ้าดู` : rem);
    const stCls = !sv && r.status==="OVER" ? "over" : !sv && r.status==="WATCH" ? "watch" : "";
    return `<details class="v-brow v-brow-c"><summary><div class="v-brow-top"><span class="v-brow-name">${escapeHtml(r.category)}<span class="v-brow-st ${stCls}">${escapeHtml(stTxt)}</span></span><span class="v-brow-amt">฿${fmt(r.spent)}<small> / ฿${fmt(r.budget)}</small></span></div><div class="v-bar v-bar-xs"><i style="width:${w}%;background:${col}"></i></div></summary>${detail?`<div class="v-brow-more">${escapeHtml(detail)}</div>`:""}</details>`;
  }
  return `<div class="v-brow"><div class="v-brow-top"><span class="v-brow-name">${escapeHtml(r.category)}</span><span class="v-brow-amt">฿${fmt(r.spent)}<small> / ฿${fmt(r.budget)}</small></span></div><div class="v-bar v-bar-sm"><i style="width:${w}%;background:${col}"></i></div><div class="v-brow-meta"><span>${escapeHtml(meta1)}${proj?` · ${proj}`:""}</span>${showPill?`<span class="v-pill v-pill-${pillCls}">${m.label}</span>`:""}</div>${manage?`<div class="v-brow-actions"><button type="button" class="v-icon-btn budget-edit-btn" data-id="${escapeHtml(r.id)}" aria-label="แก้ไขงบ">แก้ไข</button><button type="button" class="v-icon-btn v-icon-danger budget-delete-btn" data-id="${escapeHtml(r.id)}" aria-label="ลบงบ">ลบ</button></div>`:""}</div>`;
}
function renderBudgetManager(){
  const month=document.getElementById("budgetMonthInput")?.value||monthKey(todayISO()), s=computeBudgetSummary(month), sv=computeBudgetSummary(month,"saving"), summaryEl=document.getElementById("budgetManageSummary"), listEl=document.getElementById("budgetManageList");
  if(summaryEl){
    let h="";
    if(s.budgetCount) h+=`<div class="networth-sub"><span>งบรายจ่ายรวม</span><span class="mono">฿${fmt(s.totalBudget)}</span></div><div class="networth-sub"><span>ใช้ไป</span><span class="mono" style="color:var(--expense)">฿${fmt(s.totalSpent)}</span></div><div class="networth-sub"><span>เหลือ</span><span class="mono" style="color:${s.totalRemaining<0?"var(--expense)":"var(--ink)"}">${s.totalRemaining<0?"-":""}฿${fmt(Math.abs(s.totalRemaining))}</span></div>`;
    if(sv.budgetCount) h+=`<div class="networth-sub"><span>เป้าออมรวม</span><span class="mono">฿${fmt(sv.totalBudget)}</span></div><div class="networth-sub"><span>ออมแล้ว</span><span class="mono" style="color:var(--saving)">฿${fmt(sv.totalSpent)} (${fmt(sv.totalPct)}%)</span></div>`;
    summaryEl.innerHTML=h||`<div class="budget-empty">ยังไม่ได้ตั้งงบสำหรับเดือน ${escapeHtml(monthLabel(month))}</div>`;
  }
  if(!listEl) return;
  const rows=s.rows.concat(sv.rows);
  listEl.innerHTML=rows.map(r=>budgetRowHtml(r,true)).join("");
  listEl.querySelectorAll(".budget-edit-btn").forEach(btn=>btn.addEventListener("click",()=>{const b=budgets.find(x=>x.id===btn.dataset.id);if(!b)return;budgetEditingId=b.id;budgetFormKind=b.kind==="saving"?"saving":"expense";document.getElementById("budgetMonthInput").value=b.month;renderBudgetCategorySelect(b.categories);updateBudgetKindUI();document.getElementById("budgetNameInput").value=b.name||"";document.getElementById("budgetAmountInput").value=b.amount;document.getElementById("saveBudgetBtn").textContent="บันทึกการแก้ไข";}));
  listEl.querySelectorAll(".budget-delete-btn").forEach(btn=>btn.addEventListener("click",async ()=>{const b=budgets.find(x=>x.id===btn.dataset.id);if(!b)return;if(!(await vaultetAsk("ลบ", `ลบงบ ${b.category} เดือน ${monthLabel(b.month)} ใช่ไหม?`, true)))return;budgets=budgets.filter(x=>x.id!==b.id);saveBudgets();budgetEditingId=null;renderBudgetManager();render();showToast("ลบงบประมาณแล้ว");}));
}
function renderBudgetDashboard(){
  const card=document.getElementById("budgetDashboardCard");if(!card)return;
  const s=computeBudgetSummary(), sv=computeBudgetSummary(monthKey(todayISO()),"saving"), bf=getBufferInfo();
  if(!s.budgetCount&&!sv.budgetCount&&!bf){card.style.display="none";return;}card.style.display="block";
  const rem=document.getElementById("budgetDashboardRemaining"), sub=document.getElementById("budgetDashboardSub"), fill=document.getElementById("budgetDashboardFill");
  if(s.budgetCount){
    // เกินงบรวมแต่มีเงินสำรองรองรับอยู่ = สีเหลือง; สำรองก็ไม่พอ = สีแดง
    const over=s.totalRemaining<0, over$=Math.abs(s.totalRemaining), covered=over&&bf&&bf.remaining>=over$;
    const bigLbl=rem.nextElementSibling; if(bigLbl) bigLbl.textContent=over?"งบรวมทุกหมวด":"คงเหลือ";
    rem.textContent=over?"เกิน ฿"+fmt(over$):"฿"+fmt(s.totalRemaining);rem.style.color=over?(covered?"var(--v-xfer)":"var(--v-out)"):"";
    const resv=over&&bf?(covered?`<br>มีเงินสำรอง ฿${fmt(bf.remaining)} รองรับอยู่`:`<br>เงินสำรองเหลือ ฿${fmt(Math.max(0,bf.remaining))} ไม่พอรองรับ`):"";
    sub.innerHTML=`ใช้ ฿${fmt(s.totalSpent)} จาก ฿${fmt(s.totalBudget)} · เหลือ ${s.remainingDays} วัน${resv}`;
    fill.style.width=Math.min(100,Math.max(0,s.totalPct))+"%";fill.style.background=over?(covered?"var(--v-xfer)":"var(--v-out)"):s.totalPct>=80?"var(--v-xfer)":"var(--v-accent)";
  } else {
    const bigLbl2=rem.nextElementSibling; if(bigLbl2) bigLbl2.textContent="ออมแล้ว";
    rem.textContent="฿"+fmt(sv.totalSpent);rem.style.color="var(--v-save)";
    sub.textContent=`ออมแล้ว ฿${fmt(sv.totalSpent)} จากเป้า ฿${fmt(sv.totalBudget)} · เหลือ ${sv.remainingDays} วัน`;
    fill.style.width=Math.min(100,Math.max(0,sv.totalPct))+"%";fill.style.background="var(--v-save)";
  }
  const order={OVER:0,WATCH:1,SAFE:2};
  const sorted=s.rows.slice().sort((a,b)=>order[a.status]-order[b.status]);
  const hotRows=sorted.filter(r=>r.status==="OVER"||r.status==="WATCH"), calmRows=sorted.filter(r=>r.status!=="OVER"&&r.status!=="WATCH");
  // หมวดที่ต้องดูขึ้นก่อน ตามด้วยหมวดปกติ (โชว์ครบทุกหมวด มีหัวข้อกลุ่มเมื่อมีทั้งสองกลุ่ม)
  const grp=(t,rows)=>`<div class="v-subhead v-subhead-g"><span>${t}</span><span class="v-subhead-r">${rows.length} หมวด</span></div>`+rows.map(r=>budgetRowHtml(r,false)).join("");
  let html=(hotRows.length&&calmRows.length)?grp("ต้องดู",hotRows)+grp("ปกติ",calmRows):hotRows.concat(calmRows).map(r=>budgetRowHtml(r,false)).join("");
  if(sv.budgetCount){
    html+=`<div class="v-subhead"><span>เป้าออมเดือนนี้</span>${sv.rows.length>1?`<span class="v-subhead-r">฿${fmt(sv.totalSpent)} / ฿${fmt(sv.totalBudget)} · ${fmt(sv.totalPct)}%</span>`:""}</div>`+sv.rows.map(r=>budgetRowHtml(r,false)).join("");
  }
  if(bf){
    const low=bf.remaining<0, col=low?"var(--v-out)":"var(--v-accent)", w=bf.amount>0?Math.min(100,Math.max(0,bf.used/bf.amount*100)):0;
    html+=`<div class="v-subhead"><span>เงินสำรองเผื่อเหตุไม่คาดฝัน</span><span class="v-pill v-pill-${low?"over":"safe"}">${low?"เกินสำรอง":"พร้อมใช้"}</span></div><div class="v-brow"><div class="v-brow-top"><span class="v-brow-name">ใช้ไปนอกงบ<span class="v-brow-st ${low?"over":""}">${low?"เกิน":"เหลือ"} ฿${fmt(Math.abs(bf.remaining))}${bf.swept>0?` · ย้ายไปออมแล้ว ฿${fmt(bf.swept)}`:""}</span></span><span class="v-brow-amt">฿${fmt(bf.used)}<small> / ฿${fmt(bf.amount)}</small></span></div><div class="v-bar v-bar-sm"><i style="width:${w}%;background:${col}"></i></div></div>`;
  }
  // เตือนช่วงท้ายเดือน (เหลือ ≤5 วัน)
  if(s.remainingDays<=5){
    const tips=[];
    if(bf&&bf.remaining<0) tips.push(`ใช้เกินเงินสำรอง ฿${fmt(Math.abs(bf.remaining))} → เดือนหน้าลดหมวดไม่จำเป็นชดเชย`);
    if(sv.budgetCount&&sv.totalRemaining>0) tips.push(`เป้าออมยังขาด ฿${fmt(sv.totalRemaining)}`);
    if(s.overCount) tips.push(`เกินงบ ${s.overCount} หมวด`);
    if(tips.length){
      // ตอนโหลดหน้าแรก ai.js (ที่มีระบบแจ้งเตือน) ยังไม่โหลด: ข้ามไปก่อน รอบ render ถัดไปค่อยเพิ่ม
      if(typeof loadVaultetNotifications==="function") try{
        const mk=monthKey(todayISO()), nid="monthend-"+mk, list=loadVaultetNotifications();
        if(!list.some(n=>n.id===nid)){ list.unshift({id:nid,icon:"🗓",title:"ใกล้สิ้นเดือนแล้ว",body:tips.join(" · "),read:false,day:todayISO(),createdAt:new Date().toISOString()}); saveVaultetNotifications(list); if(typeof renderVaultetNotifications==="function") renderVaultetNotifications(); }
      }catch(err){ console.error(err); }
    }
  }
  document.getElementById("budgetDashboardRows").innerHTML=html;
}
document.getElementById("budgetDashboardManageBtn")?.addEventListener("click",openBudgetManager);
document.getElementById("closeBudgetBtn")?.addEventListener("click",()=>document.getElementById("budgetOverlay").classList.remove("open"));
document.getElementById("budgetOverlay")?.addEventListener("click",()=>document.getElementById("budgetOverlay").classList.remove("open"));
document.getElementById("budgetMonthInput")?.addEventListener("change",()=>{budgetEditingId=null;document.getElementById("budgetAmountInput").value="";document.getElementById("saveBudgetBtn").textContent="เพิ่ม / อัปเดตงบ";renderBudgetManager();});
document.getElementById("saveBudgetBtn")?.addEventListener("click",()=>{
  const kind=budgetFormKind, month=document.getElementById("budgetMonthInput").value||monthKey(todayISO()), cats=getBudgetSelectedCats(), name=(document.getElementById("budgetNameInput").value||"").trim(), category=name||cats.join(" + "), amount=Number(document.getElementById("budgetAmountInput").value);
  if(!/^\d{4}-\d{2}$/.test(month)){showToast("เลือกเดือนให้ถูกต้อง");return;}
  if(!cats.length){showToast(kind==="saving"?"เลือกหมวดออมอย่างน้อย 1 หมวด":"เลือกหมวดรายจ่ายอย่างน้อย 1 หมวด");return;}
  const clash=budgets.find(x=>x.enabled!==false&&x.month===month&&x.id!==budgetEditingId&&(x.kind||"expense")===kind&&x.categories.some(c=>cats.includes(c))&&budgetKey(x)!==bKey(month,cats,kind));
  if(clash){showToast(`หมวดซ้ำกับงบ "${clash.category}" แล้ว`);return;}
  if(!isFinite(amount)||amount<0){showToast("กรอกจำนวนเงินให้ถูกต้อง");return;}
  const now=new Date().toISOString(), amt=Math.round(amount*100)/100;
  if(budgetEditingId){const b=budgets.find(x=>x.id===budgetEditingId);if(b){b.month=month;b.kind=kind;b.category=category;b.categories=cats;b.name=name;b.amount=amt;b.updatedAt=now;b.enabled=true;}}
  else{const existing=budgets.find(x=>x.enabled!==false&&budgetKey(x)===bKey(month,cats,kind));if(existing){existing.amount=amt;existing.updatedAt=now;}else budgets.push({id:makeId(),kind,category,categories:cats,name,amount:amt,period:"monthly",month,enabled:true,createdAt:now,updatedAt:now});}
  saveBudgets();budgetEditingId=null;document.getElementById("budgetAmountInput").value="";document.getElementById("budgetNameInput").value="";renderBudgetCategorySelect([]);document.getElementById("saveBudgetBtn").textContent="เพิ่ม / อัปเดตงบ";renderBudgetManager();render();showToast("บันทึกแล้ว");
});
function getBrainBaseIncome(actualIncome){
  // ฐานรายได้ที่ใช้ประเมิน: 1) รายได้ประมาณการจากโปรไฟล์  2) ค่าเฉลี่ยรายรับ 3 เดือนย้อนหลัง  3) รายรับจริงเดือนนี้
  let est=null;
  try{ const p=(typeof loadAIProfile==='function')?loadAIProfile():null; if(p&&Number(p.monthlyIncomeEstimate)>0) est=Number(p.monthlyIncomeEstimate); }catch(e){}
  if(est==null){ try{ const raw=JSON.parse(localStorage.getItem('vaultet_user_profile_v1')||'null'); if(raw&&Number(raw.monthlyIncomeEstimate)>0) est=Number(raw.monthlyIncomeEstimate); }catch(e){} }
  if(est!=null) return {value:est,source:'profile'};
  let bl=null; try{ bl=getIncomeBaseline(); }catch(e){}
  if(bl&&bl.months>0&&bl.avg>0) return {value:bl.avg,source:'baseline'};
  return {value:Number(actualIncome)||0,source:'actual'};
}
window.getBrainBaseIncome=getBrainBaseIncome;
const __baseVaultetRender=render;render=function(){__baseVaultetRender();renderBudgetDashboard();renderEmergencyDashboard();};renderBudgetDashboard();renderEmergencyDashboard();
