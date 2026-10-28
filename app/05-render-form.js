// Vaultet — app/05-render-form.js : วาดหน้าหลัก (render) และฟอร์มเพิ่ม/แก้รายการ
// (แยกจาก app.js เดิม — โหลดเรียงตามเลขไฟล์ ทุกไฟล์ใช้ตัวแปร/ฟังก์ชันร่วมกันแบบ global)
function render(){
  refreshBackupBanner();
  renderAccountsSummary();
  renderUpcomingWidget();
  renderPeriodAnalysis();
  renderCompareSection();
  const months = getMonths();
  const monthSelect = document.getElementById("monthSelect");
  monthSelect.innerHTML = months.map(m => `<option value="${m}" ${m===selectedMonth?"selected":""}>${monthLabel(m)}</option>`).join("");

  const totals = getTotals();
  const carry = getTotalMoneyAllAccounts(selectedMonth + "-01"); // ยอดยกมาจากเดือนก่อน
  const nm = new Date(Number(selectedMonth.slice(0,4)), Number(selectedMonth.slice(5,7)), 1);
  const nextMonthStart = `${nm.getFullYear()}-${String(nm.getMonth()+1).padStart(2,"0")}-01`;
  // เดือนก่อนเริ่มใช้งานจริง (ก่อนรายการแรก) ไม่ต้องโชว์ยอดเริ่มต้นบัญชี
  const firstDate = [...entries.map(e => e.date), ...loans.map(l => l.date)].filter(Boolean).sort()[0];
  const beforeStart = !firstDate || nextMonthStart <= firstDate;
  const heroBal = beforeStart ? 0 : getTotalMoneyAllAccounts(nextMonthStart); // เงินจริง ณ สิ้นเดือนที่เลือก (รวมเงินให้ยืมที่ออกไปด้วย)
  const loanOut = loans.filter(l => l.date && monthKey(l.date) === selectedMonth).reduce((a,l) => a + toCents(l.amount), 0) / 100;
  // เดือนปัจจุบันที่มีเงินกันไว้: เลขใหญ่ = ใช้ได้จริง (ในบัญชี − กันไว้) เงินกันไว้เป็นยอด ณ ตอนนี้ จึงไม่หักย้อนหลังในเดือนเก่า
  const reservedNow = getTotalReserved(), showAvail = !beforeStart && reservedNow > 0 && selectedMonth === monthKey(todayISO());
  const heroNum = showAvail ? (toCents(heroBal) - toCents(reservedNow)) / 100 : heroBal;
  document.getElementById("heroLabel").textContent = showAvail ? "ใช้ได้จริง" : "คงเหลือเดือนนี้";
  document.getElementById("balanceNum").textContent = (heroNum<0?"-":"") + "฿" + fmt(Math.abs(heroNum));
  document.getElementById("balanceNum").style.color = heroNum<0 ? "var(--expense)" : "var(--ink)";
  document.getElementById("carryNum").textContent = ""; // ยอดยกมาย้ายไปแท็บวิเคราะห์ (renderPeriodAnalysis)
  document.getElementById("pillIncome").textContent = "฿"+fmt(totals.income);
  document.getElementById("pillExpense").textContent = "฿"+fmt(totals.expense);
  document.getElementById("pillSaving").textContent = "฿"+fmt(totals.saving);

  const breakdownSection = document.getElementById("breakdownSection");
  const blocks = [
    { key:"income", label:"รายรับตามหมวด", color:"var(--income)" },
    { key:"saving", label:"ออม/ลงทุนตามหมวด", color:"var(--saving)" },
  ];
  const BREAKDOWN_LIMIT = 5;
  breakdownSection.innerHTML = blocks.map(b => {
    const rows = getByCategory(b.key, totals);
    if(rows.length===0) return "";
    const expanded = expandedBreakdown[b.key];
    const visibleRows = expanded ? rows : rows.slice(0, BREAKDOWN_LIMIT);
    const hiddenCount = rows.length - visibleRows.length;
    return `<div>
      <span class="section-label">${escapeHtml(b.label)}</span>
      <div style="margin-top:8px">
        ${visibleRows.map(r => `
          <div class="bar-row">
            <div class="bar-row-top"><span>${escapeHtml(r.cat)}</span><span class="mono">฿${fmt(r.amount)}</span></div>
            <div class="bar-track"><div class="bar-fill" style="width:${r.pct}%;background:${b.color}"></div></div>
          </div>
        `).join("")}
        ${hiddenCount>0 ? `<button class="breakdown-toggle" data-toggle="${b.key}">+ ดูอีก ${hiddenCount} หมวด</button>` : ""}
        ${expanded && rows.length>BREAKDOWN_LIMIT ? `<button class="breakdown-toggle" data-toggle="${b.key}">ย่อ</button>` : ""}
      </div>
    </div>`;
  }).join("");
  breakdownSection.querySelectorAll("[data-toggle]").forEach(btn => {
    btn.addEventListener("click", () => {
      const key = btn.dataset.toggle;
      expandedBreakdown[key] = !expandedBreakdown[key];
      render();
    });
  });

  document.getElementById("typeFilter").value = typeFilter;
  const q = searchQuery.trim().toLowerCase();
  const me = [...getMonthEntries()]
    .filter(e => typeFilter==="all" || e.type===typeFilter)
    .filter(e => !q || (e.category || "").toLowerCase().includes(q) || (e.note || "").toLowerCase().includes(q))
    .sort((a,b) => b.date.localeCompare(a.date));
  document.getElementById("countLabel").textContent = me.length + " รายการ";
  const ss = document.getElementById("searchSummary"), sumG = {};
  const sumSrc = searchAllMonths ? entries.filter(e => (typeFilter==="all" || e.type===typeFilter) && ((e.category||"").toLowerCase().includes(q) || (e.note||"").toLowerCase().includes(q))) : me;
  sumSrc.forEach(e => { if(e.type==="transfer") return; const g = sumG[e.type] = sumG[e.type] || {n:0,c:0}; g.n++; g.c += toCents(e.amount); });
  const sumNames = {income:"รายรับ", expense:"รายจ่าย", saving:"ออม"};
  if(q && Object.keys(sumG).length){ ss.innerHTML = "สรุป “" + escapeHtml(searchQuery.trim()) + "” " + (searchAllMonths ? "ทุกเดือน" : "เดือนนี้") + ` · <button id="sumToggle" style="background:none;border:none;color:var(--saving);font:inherit;padding:0;cursor:pointer">${searchAllMonths ? "ดูเฉพาะเดือนนี้" : "ดูทุกเดือน"}</button><br>` + Object.keys(sumG).map(k => `${sumNames[k]} <b>${sumG[k].n}</b> ครั้ง · <b class="mono">฿${fmt(sumG[k].c/100)}</b>`).join("<br>"); ss.style.display = "block"; }
  else ss.style.display = "none";
  ss.onclick = ev => { if(ev.target.id === "sumToggle"){ searchAllMonths = !searchAllMonths; render(); } };
  const listContainer = document.getElementById("listContainer");
  const emptyMsg = `<div class="empty-state">ยังไม่มีรายการในเดือนนี้ — กดปุ่ม + เพื่อเริ่มจด</div>`;
  if(me.length===0){
    listContainer.innerHTML = emptyMsg;
  }else{
    listContainer.innerHTML = txListHtml(me.slice(0, txVisibleLimit)) + (me.length > txVisibleLimit
      ? `<button type="button" class="v-more-btn" id="loadMoreTxBtn">ดูเพิ่มเติม (เหลืออีก ${me.length - txVisibleLimit} รายการ)</button>`
      : "");
    const loadMoreTxBtn = document.getElementById("loadMoreTxBtn");
    if(loadMoreTxBtn){
      loadMoreTxBtn.addEventListener("click", () => {
        txVisibleLimit += 20;
        render();
      });
    }
    bindTxRows(listContainer);
  }
  scheduleGDriveAutoSync();
}

// เลือกเป้าหมายตอนลงรายการออม (แทนการพิมพ์โน้ตเอง): แสดงเฉพาะเมื่อเลือกหมวด "เป้าหมาย"
function renderGoalPick(){
  const wrap = document.getElementById("goalPickWrap"); if(!wrap) return;
  const goals = readGoals().filter(g => g && g.name);
  if(selectedGoalId && !goals.some(g => g.id === selectedGoalId)) selectedGoalId = "";
  wrap.style.display = (formType === "saving" && selectedCategory === GOAL_CAT && goals.length) ? "" : "none";
  if(wrap.style.display === "none") return;
  document.getElementById("goalPickRow").innerHTML = goals.map(g => `<span class="v-chip-wrap ${selectedGoalId===g.id?`is-selected v-t-saving`:""}"><button type="button" class="v-chip" data-goal="${escapeHtml(g.id)}">${escapeHtml(g.name)}</button></span>`).join("");
  document.querySelectorAll("#goalPickRow [data-goal]").forEach(btn => btn.addEventListener("click", () => {
    selectedGoalId = btn.dataset.goal;
    renderCatGrid();
  }));
}
function renderCatGrid(){
  const cats = CATS_BY_TYPE[formType];
  const catGrid = document.getElementById("catGrid");
  // ถ้าหมวดเดิมของรายการที่กำลังแก้ไขถูกลบไปแล้ว ให้แสดงเป็นชิปชั่วคราว (orphan) แทนการเปลี่ยนหมวดให้เงียบๆ
  const showOrphan = orphanCategory && !cats.includes(orphanCategory);
  const chips = showOrphan ? [{ name: orphanCategory, orphan: true }, ...cats.map(c => ({ name: c, orphan: false }))]
                            : cats.map(c => ({ name: c, orphan: false }));
  catGrid.innerHTML = chips.map(({ name: c, orphan }) => {
    const sel = selectedCategory===c ? `is-selected v-t-${formType}` : "";
    const delBtn = orphan
      ? ""
      : `<button type="button" class="v-chip-x cat-chip-del" data-cat="${escapeHtml(c)}" aria-label="ลบหมวด ${escapeHtml(c)}">×</button>`;
    const label = orphan ? `${escapeHtml(c)} (หมวดถูกลบ)` : escapeHtml(c);
    return `<span class="v-chip-wrap ${sel} ${orphan?"is-orphan":""}">
      <button type="button" class="v-chip cat-chip-label" data-cat="${escapeHtml(c)}">${label}</button>
      ${delBtn}
    </span>`;
  }).join("") + `<button type="button" class="v-chip v-chip-add v-manage-only" id="addCatBtn">+ เพิ่มหมวด</button><button type="button" class="v-chip v-chip-add v-manage-only" id="mergeCatBtn">⇄ รวมหมวด</button>`;

  catGrid.querySelectorAll(".cat-chip-label").forEach(btn => {
    btn.addEventListener("click", () => {
      selectedCategory = btn.dataset.cat;
      if(selectedCategory === GOAL_CAT){ if(!selectedGoalId) selectedGoalId = (readGoals()[0]||{}).id || ""; }
      else selectedGoalId = "";
      // เลือกหมวดจริงแล้ว ไม่ต้องเตือนเรื่องหมวดที่ถูกลบอีก
      if(cats.includes(selectedCategory)) orphanCategory = null;
      renderCatGrid();
    });
  });
  catGrid.querySelectorAll(".cat-chip-del").forEach(btn => {
    btn.addEventListener("click", async (ev) => {
      ev.stopPropagation();
      const cat = btn.dataset.cat;
      if(CATS_BY_TYPE[formType].length <= 1){
        showToast("ต้องเหลืออย่างน้อย 1 หมวด");
        return;
      }
      const inUse = entries.some(e => e.type===formType && e.category===cat);
      const msg = inUse
        ? `หมวด "${cat}" มีรายการที่บันทึกไว้อยู่ ลบหมวดนี้ออกจากตัวเลือกใช่ไหม? (รายการเดิมจะไม่หาย)`
        : `ลบหมวด "${cat}" ใช่ไหม?`;
      if(!(await vaultetAsk("ลบ", msg, true))) return;
      CATS_BY_TYPE[formType] = CATS_BY_TYPE[formType].filter(x => x !== cat);
      saveCategories();
      if(selectedCategory === cat){
        orphanCategory = null;
        selectedCategory = CATS_BY_TYPE[formType][0] || "";
      }
      renderCatGrid();
    });
  });
  document.getElementById("addCatBtn").addEventListener("click", async () => {
    const name = await vaultetPrompt("ชื่อหมวด", "", { title: "เพิ่มหมวดใหม่", required: true, placeholder: "เช่น กาแฟ", okText: "เพิ่ม" });
    if(!name) return;
    const trimmed = name.trim();
    if(!trimmed) return;
    orphanCategory = null;
    if(CATS_BY_TYPE[formType].includes(trimmed)){
      selectedCategory = trimmed;
      renderCatGrid();
      return;
    }
    CATS_BY_TYPE[formType].push(trimmed);
    saveCategories();
    selectedCategory = trimmed;
    renderCatGrid();
  });
  renderGoalPick();
}

function populateAccountSelects(){
  const opts = accounts.map(a => `<option value="${a.id}">${escapeHtml(a.name)}</option>`).join("");
  document.getElementById("entryAccount").innerHTML = opts;
  document.getElementById("fromAccount").innerHTML = opts;
  document.getElementById("toAccount").innerHTML = opts;
}

function setFormType(t, isInit, entry){
  formType = t;
  if(t !== "saving") selectedGoalId = "";
  const isTransfer = t === "transfer";
  document.getElementById("categoryFieldGroup").style.display = isTransfer ? "none" : "block";
  document.getElementById("transferFieldGroup").style.display = isTransfer ? "block" : "none";
  document.getElementById("entryAccountWrap").style.display = isTransfer ? "none" : "";
  if(isTransfer){
    if(accounts.length < 2){
      showToast("ต้องมีอย่างน้อย 2 บัญชีก่อนถึงจะโอนเงินได้");
    }
    populateAccountSelects();
    document.getElementById("fromAccount").value = entry ? entry.fromAccountId : (accounts[0]?.id || "");
    document.getElementById("toAccount").value = entry ? entry.toAccountId : (accounts[1]?.id || accounts[0]?.id || "");
    document.querySelectorAll(".type-btn").forEach(b => {
      b.classList.remove("active-expense","active-income","active-saving","active-transfer");
      if(b.dataset.type===t) b.classList.add("active-transfer");
    });
    document.getElementById("submitBtn").style.background = "var(--transfer)";
    renderGoalPick();
    return;
  }
  const cats = CATS_BY_TYPE[t] || [];
  if(!cats.includes(selectedCategory)){
    if(isInit && selectedCategory){
      // กำลังเปิดฟอร์มแก้ไขรายการเดิม และหมวดของรายการนั้นถูกลบไปแล้ว — คงค่าไว้เป็น orphan แทนการสลับเงียบๆ
      orphanCategory = selectedCategory;
    }else{
      // รายการใหม่ หรือผู้ใช้กดสลับประเภทเอง — เลือกหมวดล่าสุดที่เคยใช้กับประเภทนี้ ถ้ามี ไม่งั้นเลือกหมวดแรก
      orphanCategory = null;
      const last = lastUsedCat[t];
      selectedCategory = (last && last !== GOAL_CAT && cats.includes(last)) ? last : (cats.find(c => c !== GOAL_CAT) || "");
    }
  }else{
    orphanCategory = null;
  }
  document.querySelectorAll(".type-btn").forEach(b => {
    b.classList.remove("active-expense","active-income","active-saving","active-transfer");
    if(b.dataset.type===t) b.classList.add("active-"+t);
  });
  document.getElementById("submitBtn").style.background = `var(--${t})`;
  populateAccountSelects();
  document.getElementById("entryAccount").value = entry ? (entry.accountId || UNASSIGNED_ACCOUNT_ID) : (lastUsedAccountId && accounts.some(a=>a.id===lastUsedAccountId) ? lastUsedAccountId : (accounts[0]?.id || ""));
  renderCatGrid();
}

function setFormManaging(on){
  document.querySelector("#overlay .v-sheet").classList.toggle("v-managing", on);
  const b = document.getElementById("vManageBtn");
  b.setAttribute("aria-pressed", on ? "true" : "false");
  b.textContent = on ? "เสร็จ" : "จัดการ";
}
function openForm(entry){
  setFormManaging(false);
  document.getElementById("vDeleteEntryBtn").hidden = !entry;
  document.getElementById("vAiEntryBtn").hidden = !!entry;
  editingId = entry ? entry.id : null;
  document.getElementById("modalTitle").textContent = entry ? "แก้ไขรายการ" : "เพิ่มรายการ";
  document.getElementById("overlay").classList.add("open");
  document.getElementById("date").value = entry ? entry.date : todayISO();
  document.getElementById("amount").value = entry ? entry.amount : "";
  document.getElementById("note").value = entry ? (entry.note || "") : "";
  selectedCategory = entry ? entry.category : "";
  selectedGoalId = entry && entry.type === "saving" ? (entry.goalId || "") : "";
  orphanCategory = null;
  setFormType(entry ? entry.type : "expense", true, entry);
  const v = parseFloat(document.getElementById("amount").value);
  document.getElementById("submitBtn").disabled = !v || v<=0;
  fitAmountWidth();
  document.getElementById("amount").focus();
}
function closeForm(){
  document.getElementById("overlay").classList.remove("open");
  editingId = null;
}

document.getElementById("fabBtn").addEventListener("click", () => openForm(null));
document.getElementById("vAiEntryBtn").addEventListener("click", () => {
  closeForm();
  document.getElementById("aiFabBtn").click();
});
document.getElementById("vDeleteEntryBtn").addEventListener("click", async () => {
  if(!editingId || !(await vaultetAsk("ลบ", "ลบรายการนี้ใช่ไหม?", true))) return;
  const id = editingId;
  closeForm();
  deleteEntryById(id);
});
document.getElementById("vManageBtn").addEventListener("click", () => setFormManaging(!document.querySelector("#overlay .v-sheet").classList.contains("v-managing")));
document.getElementById("closeBtn").addEventListener("click", closeForm);
document.getElementById("overlay").addEventListener("click", closeForm);
document.querySelectorAll(".type-btn").forEach(btn => {
  btn.addEventListener("click", () => setFormType(btn.dataset.type));
});
// ให้ช่องจำนวนเงินกว้างพอดีตัวเลข (ตัวเลขกับ ฿ จะอยู่กึ่งกลางเสมอ)
function fitAmountWidth(){
  const el = document.getElementById("amount");
  el.style.width = Math.max(1, String(el.value || "").length) + 1 + "ch";
}
document.getElementById("amount").addEventListener("input", () => {
  fitAmountWidth();
  const v = parseFloat(document.getElementById("amount").value);
  document.getElementById("submitBtn").disabled = !v || v<=0;
});
document.querySelectorAll(".quick-amount-btn[data-add]").forEach(btn => {
  btn.addEventListener("click", () => {
    const amountInput = document.getElementById("amount");
    const current = parseFloat(amountInput.value) || 0;
    const add = parseFloat(btn.dataset.add) || 0;
    // รวมด้วยหน่วยสตางค์ก่อนหารกลับ กันปัญหา floating point เพี้ยนสะสม
    amountInput.value = Math.max(0, toCents(current) + toCents(add)) / 100;
    amountInput.dispatchEvent(new Event("input"));
  });
});
document.getElementById("quickAmountClear").addEventListener("click", () => {
  const amountInput = document.getElementById("amount");
  amountInput.value = "";
  amountInput.dispatchEvent(new Event("input"));
  amountInput.focus();
});
document.getElementById("monthSelect").addEventListener("change", (e) => {
  selectedMonth = e.target.value;
  txVisibleLimit = 20;
  render();
});
document.getElementById("typeFilter").addEventListener("change", (e) => {
  typeFilter = e.target.value;
  txVisibleLimit = 20;
  render();
});
