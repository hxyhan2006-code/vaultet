// Vaultet — app/04-compare-totals.js : เทียบช่วงเวลา, ยอดบัญชี/เงินออม/เป้าหมาย, ยอดรวมเดือน, แถวรายการ
// (แยกจาก app.js เดิม — โหลดเรียงตามเลขไฟล์ ทุกไฟล์ใช้ตัวแปร/ฟังก์ชันร่วมกันแบบ global)
// ===== Phase 3: Compare Period =====
// คืนค่า label สำหรับช่วงเวลาแบบ custom (ใช้ตอนไม่มี start/end ให้แสดง "ทั้งหมด")
function compareRangeLabel(range){
  if(range.start && range.end) return `${dayLabel(range.start)} – ${dayLabel(range.end)}`;
  if(range.start) return `จาก ${dayLabel(range.start)}`;
  if(range.end) return `ถึง ${dayLabel(range.end)}`;
  return "ทั้งหมด";
}
// คืนค่า { A, B, labelA, labelB } โดย A คือช่วงปัจจุบัน/ใหม่กว่า, B คือช่วงก่อนหน้าที่จะเทียบด้วย
function getComparePeriods(){
  const today = todayISO();
  const now = new Date();
  switch(comparePreset){
    case "thisMonthVsLastMonth": {
      const A = monthBoundsISO(now.getFullYear(), now.getMonth());
      const m = now.getMonth()===0 ? 11 : now.getMonth()-1;
      const y = now.getMonth()===0 ? now.getFullYear()-1 : now.getFullYear();
      const B = monthBoundsISO(y, m);
      return { A, B, labelA: "เดือนนี้", labelB: "เดือนที่แล้ว" };
    }
    case "7dVsPrev7d": {
      const A = { start: addDaysISO(today, -6), end: today };
      const B = { start: addDaysISO(today, -13), end: addDaysISO(today, -7) };
      return { A, B, labelA: "7 วันล่าสุด", labelB: "7 วันก่อนหน้า" };
    }
    case "3mVsPrev3m": {
      const A = { start: addDaysISO(today, -89), end: today };
      const B = { start: addDaysISO(today, -179), end: addDaysISO(today, -90) };
      return { A, B, labelA: "3 เดือนล่าสุด", labelB: "3 เดือนก่อนหน้า" };
    }
    case "yearVsLastYear": {
      const A = { start: `${now.getFullYear()}-01-01`, end: `${now.getFullYear()}-12-31` };
      const B = { start: `${now.getFullYear()-1}-01-01`, end: `${now.getFullYear()-1}-12-31` };
      return { A, B, labelA: "ปีนี้", labelB: "ปีที่แล้ว" };
    }
    case "custom":
    default: {
      const A = { start: compareAStart || null, end: compareAEnd || null };
      const B = { start: compareBStart || null, end: compareBEnd || null };
      return { A, B, labelA: compareRangeLabel(A), labelB: compareRangeLabel(B) };
    }
  }
}
// เปรียบเทียบค่า current vs previous แบบปลอดภัย (ไม่มี NaN/Infinity)
// isMoney=true ใช้หน่วยสตางค์ (toCents) เหมือนส่วนอื่นของระบบ, isMoney=false ใช้จำนวนเต็มตรงๆ (เช่น จำนวนรายการ)
function computeChangeGeneric(current, previous, isMoney){
  const curUnits = isMoney ? toCents(current) : Math.round(current || 0);
  const prevUnits = isMoney ? toCents(previous) : Math.round(previous || 0);
  const diffUnits = curUnits - prevUnits;
  const diff = isMoney ? diffUnits/100 : diffUnits;
  const dir = diffUnits>0 ? "up" : diffUnits<0 ? "down" : "flat";
  const fmtAbs = v => isMoney ? ("฿"+fmt(Math.abs(v))) : fmt(Math.abs(v));
  if(curUnits===0 && prevUnits===0){
    return { diff:0, dir:"flat", diffLabel: fmtAbs(0), pctLabel:"—", hasBase:false, noData:true };
  }
  const sign = diffUnits>0 ? "+" : diffUnits<0 ? "-" : "";
  const diffLabel = sign + fmtAbs(diff);
  if(prevUnits===0){
    // ไม่มีฐานสำหรับคำนวณ % (previous = 0) — แสดงจำนวนเงินที่เปลี่ยนได้ แต่ไม่แสดง % เพื่อกัน Infinity
    return { diff, dir, diffLabel, pctLabel:"—", hasBase:false, noData:false };
  }
  const pct = (diffUnits/prevUnits)*100;
  const pctSign = pct>0 ? "+" : pct<0 ? "-" : "";
  const pctLabel = pctSign + fmt(Math.abs(pct)) + "%";
  return { diff, dir, diffLabel, pctLabel, hasBase:true, noData:false };
}
// รวมข้อมูลเปรียบเทียบทั้งหมด: เรียก computePeriodAnalysisForRange() ของ Phase 2 สำหรับทั้งสองช่วง
// เพื่อให้ Accounting Logic (transfer/money lent/loan repayment ไม่นับ, ไม่ double count) ตรงกับ Period Analysis เป๊ะๆ
function computeCompareAnalysis(){
  const { A, B, labelA, labelB } = getComparePeriods();
  const analysisA = computePeriodAnalysisForRange(A.start, A.end, compareAccountFilter);
  const analysisB = computePeriodAnalysisForRange(B.start, B.end, compareAccountFilter);

  const METRICS = [
    { key:"income", label:"รายรับ", isMoney:true },
    { key:"expense", label:"รายจ่าย", isMoney:true },
    { key:"saving", label:"ออม/ลงทุน", isMoney:true },
    { key:"netCashFlow", label:"Net Cash Flow", isMoney:true },
    { key:"count", label:"จำนวนรายการ", isMoney:false },
    { key:"avgExpensePerTxn", label:"รายจ่ายเฉลี่ย/รายการ", isMoney:true },
    { key:"avgIncomePerDay", label:"รายรับเฉลี่ย/วัน", isMoney:true },
    { key:"avgExpensePerDay", label:"รายจ่ายเฉลี่ย/วัน", isMoney:true },
  ];
  const rows = METRICS.map(m => ({
    ...m,
    curVal: analysisA[m.key],
    prevVal: analysisB[m.key],
    change: computeChangeGeneric(analysisA[m.key], analysisB[m.key], m.isMoney),
  }));

  // รวมหมวดหมู่จากทั้งสองช่วงเข้าด้วยกัน (union) เพื่อไม่ให้หมวดที่มีเฉพาะช่วงใดช่วงหนึ่งหายไป
  const catSet = new Set([...analysisA.breakdown.map(r=>r.cat), ...analysisB.breakdown.map(r=>r.cat)]);
  let catRows = Array.from(catSet).map(cat => {
    const aAmt = analysisA.breakdown.find(r=>r.cat===cat)?.amount || 0;
    const bAmt = analysisB.breakdown.find(r=>r.cat===cat)?.amount || 0;
    const change = computeChangeGeneric(aAmt, bAmt, true);
    return { cat, aAmt, bAmt, change };
  });
  switch(compareCategorySort){
    case "increase": catRows.sort((x,y) => y.change.diff - x.change.diff); break;
    case "decrease": catRows.sort((x,y) => x.change.diff - y.change.diff); break;
    case "total": catRows.sort((x,y) => Math.max(y.aAmt,y.bAmt) - Math.max(x.aAmt,x.bAmt)); break;
    default: catRows.sort((x,y) => Math.abs(y.change.diff) - Math.abs(x.change.diff));
  }

  return { analysisA, analysisB, labelA, labelB, rows, catRows };
}
// สร้าง insight จากข้อมูลจริงล้วนๆ (ไม่ใช้ AI) — ถ้าฐานข้อมูลไม่พอ (previous=0 หรือไม่เปลี่ยนแปลง) จะไม่พูดถึง metric นั้น
function buildCompareInsights(compare){
  const lines = [];
  const byKey = k => compare.rows.find(r => r.key===k);
  const dirWord = dir => dir==="up" ? "เพิ่มขึ้น" : dir==="down" ? "ลดลง" : "";
  [["income","รายรับ"], ["expense","รายจ่าย"], ["saving","เงินออม/ลงทุน"]].forEach(([key,label]) => {
    const r = byKey(key);
    if(r && r.change.hasBase && r.change.dir !== "flat"){
      lines.push(`${label}${dirWord(r.change.dir)} ${r.change.pctLabel.replace(/^[+-]/,"")}`);
    }
  });
  const changedCats = compare.catRows.filter(r => r.change.diff !== 0);
  if(changedCats.length){
    const top = changedCats.reduce((best,r) => Math.abs(r.change.diff) > Math.abs(best.change.diff) ? r : best, changedCats[0]);
    lines.push(`หมวด${top.cat}เป็นหมวดที่ใช้เงิน${dirWord(top.change.dir)}มากที่สุด (${top.change.diffLabel})`);
  }
  return lines;
}
function renderCompareSection(){
  const accSelect = document.getElementById("compareAccountFilter");
  const accOptsHtml = `<option value="">ทุกบัญชี</option>` + accounts.map(a => `<option value="${a.id}">${escapeHtml(a.name)}</option>`).join("");
  if(accSelect.innerHTML !== accOptsHtml) accSelect.innerHTML = accOptsHtml;
  accSelect.value = compareAccountFilter;
  document.getElementById("compareCustomARow").style.display = comparePreset === "custom" ? "flex" : "none";
  document.getElementById("compareCustomBRow").style.display = comparePreset === "custom" ? "flex" : "none";

  const compare = computeCompareAnalysis();
  const container = document.getElementById("compareSection");
  const money = n => (n<0?"-":"") + "฿" + fmt(Math.abs(n));
  const arrowGlyph = dir => dir==="up" ? "↑" : dir==="down" ? "↓" : "→";
  const arrowColor = dir => dir==="up" ? "var(--income)" : dir==="down" ? "var(--expense)" : "var(--faint)";

  const headlineKeys = ["income","expense","saving"];
  const headlineRows = compare.rows.filter(r => headlineKeys.includes(r.key));
  const otherRows = compare.rows.filter(r => !headlineKeys.includes(r.key));

  const insights = buildCompareInsights(compare);

  const noDataAtAll = compare.analysisA.count===0 && compare.analysisB.count===0;

  container.innerHTML = `
    <div class="compare-vs-row">
      <div class="compare-period-pill">${escapeHtml(compare.labelA)}</div>
      <div class="compare-vs-label">VS</div>
      <div class="compare-period-pill">${escapeHtml(compare.labelB)}</div>
    </div>
    ${noDataAtAll ? `<div class="empty-state">ไม่มีข้อมูลในทั้งสองช่วงเวลานี้</div>` : `
      <div class="compare-headline-grid">
        ${headlineRows.map(r => `
          <div class="compare-headline-row">
            <span class="compare-headline-label">${escapeHtml(r.label)}</span>
            <span class="compare-headline-val mono">${money(r.curVal)}</span>
            <span class="compare-headline-change mono" style="color:${arrowColor(r.change.dir)}">${arrowGlyph(r.change.dir)} ${r.change.noData ? "—" : r.change.pctLabel}</span>
          </div>
        `).join("")}
      </div>
      ${insights.length ? `<div class="insight-box">${insights.map(l => `<div>${escapeHtml(l)}</div>`).join("")}</div>` : ""}
      <button class="breakdown-toggle" id="compareDetailToggle" style="margin-bottom:10px;">${compareDetailExpanded ? "ซ่อนรายละเอียด" : "+ ดูรายละเอียดเพิ่มเติม"}</button>
      ${compareDetailExpanded ? `
        <div style="margin-bottom:16px;">
          ${otherRows.map(r => `
            <div class="compare-detail-row">
              <span style="flex:1.4">${escapeHtml(r.label)}</span>
              <span class="compare-detail-col mono">${r.isMoney ? money(r.curVal) : fmt(r.curVal)}</span>
              <span class="compare-detail-col mono" style="color:var(--faint)">${r.isMoney ? money(r.prevVal) : fmt(r.prevVal)}</span>
              <span class="compare-detail-col mono" style="color:${arrowColor(r.change.dir)}">${r.change.diffLabel}</span>
            </div>
          `).join("")}
        </div>
        <div style="margin-bottom:8px;">
          <div style="display:flex; justify-content:space-between; align-items:baseline; margin-bottom:8px;">
            <span class="section-label">รายจ่ายตามหมวด (เปรียบเทียบ)</span>
            <select id="compareCategorySort" style="font-size:12px;">
              <option value="changed">เปลี่ยนแปลงมากที่สุด</option>
              <option value="increase">เพิ่มขึ้นมากที่สุด</option>
              <option value="decrease">ลดลงมากที่สุด</option>
              <option value="total">ยอดรวมสูงสุด</option>
            </select>
          </div>
          ${compare.catRows.length===0 ? `<div class="empty-state">ไม่มีรายจ่ายในทั้งสองช่วงเวลานี้</div>` :
            compare.catRows.map(r => `
              <div class="compare-cat-row">
                <div class="compare-cat-top"><span>${escapeHtml(r.cat)}</span><span class="mono" style="color:${arrowColor(r.change.dir)}">${r.change.diffLabel}${r.change.hasBase ? ` (${r.change.pctLabel})` : ""}</span></div>
                <div class="compare-cat-sub"><span>${escapeHtml(compare.labelA)}: ฿${fmt(r.aAmt)}</span><span>${escapeHtml(compare.labelB)}: ฿${fmt(r.bAmt)}</span></div>
              </div>
            `).join("")}
        </div>
      ` : ""}
    `}
  `;

  const toggleBtn = document.getElementById("compareDetailToggle");
  if(toggleBtn){
    toggleBtn.addEventListener("click", () => {
      compareDetailExpanded = !compareDetailExpanded;
      renderCompareSection();
    });
  }
  const catSortSelect = document.getElementById("compareCategorySort");
  if(catSortSelect){
    catSortSelect.value = compareCategorySort;
    catSortSelect.addEventListener("change", (e) => {
      compareCategorySort = e.target.value;
      renderCompareSection();
    });
  }
}
document.getElementById("comparePreset").addEventListener("change", (e) => {
  comparePreset = e.target.value;
  if(comparePreset === "custom" && !compareAStart && !compareAEnd && !compareBStart && !compareBEnd){
    compareAStart = todayISO();
    compareAEnd = todayISO();
    compareBStart = todayISO();
    compareBEnd = todayISO();
    document.getElementById("compareAStartInput").value = compareAStart;
    document.getElementById("compareAEndInput").value = compareAEnd;
    document.getElementById("compareBStartInput").value = compareBStart;
    document.getElementById("compareBEndInput").value = compareBEnd;
  }
  renderCompareSection();
});
document.getElementById("compareAccountFilter").addEventListener("change", (e) => {
  compareAccountFilter = e.target.value;
  renderCompareSection();
});
document.getElementById("compareAStartInput").addEventListener("change", (e) => { compareAStart = e.target.value; renderCompareSection(); });
document.getElementById("compareAEndInput").addEventListener("change", (e) => { compareAEnd = e.target.value; renderCompareSection(); });
document.getElementById("compareBStartInput").addEventListener("change", (e) => { compareBStart = e.target.value; renderCompareSection(); });
document.getElementById("compareBEndInput").addEventListener("change", (e) => { compareBEnd = e.target.value; renderCompareSection(); });

// ยอดคงเหลือของบัญชี = ยอดเริ่มต้น + รายรับ - รายจ่าย - ออม/ลงทุน + โอนเข้า - โอนออก (คำนวณจากรายการทั้งหมดตลอดเวลา ไม่ใช่แค่เดือนที่เลือก)
function computeAccountBalance(accountId, beforeDate){
  let cents = toCents(accounts.find(a => a.id===accountId)?.initialBalance || 0);
  entries.forEach(e => {
    if(beforeDate && e.date >= beforeDate) return;
    const acc = e.accountId || UNASSIGNED_ACCOUNT_ID;
    if(e.type === "transfer"){
      if(e.fromAccountId === accountId) cents -= toCents(e.amount);
      if(e.toAccountId === accountId) cents += toCents(e.amount);
    }else if(acc === accountId){
      if(e.type === "income") cents += toCents(e.amount);
      else if(e.type === "expense" || e.type === "saving") cents -= toCents(e.amount);
    }
  });
  loans.forEach(l => {
    if(beforeDate && l.date && l.date >= beforeDate) return;
    if(l.accountId === accountId) cents -= toCents(l.amount); // เงินต้นออกจากบัญชี
    // Repayment cash is represented by a canonical income entry (source=loan_repayment).
    // Do NOT add repayments here again, otherwise the same cash inflow would be double-counted.
    // syncLoanRepaymentEntries() migrates legacy repayments to entries on load.
    // adjustment เป็นการแก้ยอดคงเหลือ: บวก = เพิ่มเงินที่ถูกให้ยืมออก, ลบ = เงินที่ควรได้คืนเข้าบัญชี
    (l.adjustments || []).forEach(a => { if(a.accountId === accountId) cents -= toCents(a.amount); });
  });
  return cents / 100;
}
function getTotalMoneyAllAccounts(beforeDate){
  return accounts.reduce((s,a) => s + toCents(computeAccountBalance(a.id, beforeDate)), 0) / 100;
}
// เงินออม/ลงทุนสะสม (ออกจากบัญชีแล้วแต่ยังเป็นสินทรัพย์ของเรา) แยกตามหมวด
function getSavedByCategory(){
  const m = {};
  let w = 0; // ยอดถอนเงินออมสะสม (หักจากหมวดสำรองก่อน แล้วค่อยหมวดอื่น)
  entries.forEach(e => {
    if(e.type === "saving"){ const c = e.category || "อื่นๆ"; m[c] = (m[c] || 0) + toCents(e.amount); }
    else if(e.type === "income" && e.category === WITHDRAW_CAT) w += toCents(e.amount);
  });
  Object.keys(m).sort((a,b) => (b.includes("สำรอง")?1:0) - (a.includes("สำรอง")?1:0)).forEach(k => { const d = Math.min(m[k], w); m[k] -= d; w -= d; });
  Object.keys(m).forEach(k => m[k] /= 100);
  return m;
}
function getTotalSaved(){ return Object.values(getSavedByCategory()).reduce((s,v) => s + toCents(v), 0) / 100; }
function getEmergencySaved(){ return Object.entries(getSavedByCategory()).filter(([c]) => c.includes("สำรอง")).reduce((s,[,v]) => s + toCents(v), 0) / 100; }
// เป้าหมายเก็บเงิน: ปุ่ม "+ เงิน" สร้างรายการออมจริง (มี goalId) เงินจึงออกจากบัญชี/ใช้ได้จริง แต่ยังนับเป็นสินทรัพย์
// ยอดเก็บแล้ว = ยอดตั้งต้นที่จดเอง (g.saved) + รายการที่ผูกกับเป้าหมาย (ลบรายการ = ยอดคืนเอง)
function readGoals(){ try{ const g=JSON.parse(localStorage.getItem("vaultet_goals_v1")||"[]"); return Array.isArray(g)?g:[]; }catch(e){ return []; } }
function goalLinkedSaved(goalId){
  let c = 0;
  entries.forEach(e => { if(!goalId || e.goalId !== goalId) return; if(e.type === "saving") c += toCents(e.amount); else if(e.type === "income" && e.category === WITHDRAW_CAT) c -= toCents(e.amount); });
  return Math.max(0, c) / 100;
}
function goalSaved(g){ return (toCents(Number(g.saved)||0) + toCents(goalLinkedSaved(g.id))) / 100; }
function getGoalsHeld(){ return readGoals().reduce((s,g) => s + toCents(goalLinkedSaved(g.id)), 0) / 100; }
function goalSavingCategory(){ if(!(CATS_BY_TYPE.saving||[]).includes(GOAL_CAT)){ CATS_BY_TYPE.saving.push(GOAL_CAT); try{ saveCategories(); }catch(e){} } return GOAL_CAT; }
function getLastBackup(){
  try{ return localStorage.getItem(BACKUP_KEY) || ""; }catch(e){ return ""; }
}
function setLastBackup(iso){
  try{ localStorage.setItem(BACKUP_KEY, iso); }catch(e){}
}
function refreshBackupBanner(){
  const banner = document.getElementById("backupBanner");
  if(!entries.length){ banner.classList.remove("show"); return; }
  const lastBackup = getLastBackup();
  let driveLast=""; try{ driveLast=localStorage.getItem(GDRIVE_LAST_SYNC_KEY)||""; }catch(_){}
  const lastAny=[lastBackup,driveLast].filter(Boolean).sort().pop();
  const staleBackup = !lastAny || (Date.now()-new Date(lastAny).getTime())>7*86400000;
  const dismissedThisMonth = sessionStorage.getItem("backupDismissedMonth") === monthKey(todayISO());
  banner.classList.toggle("show", staleBackup && !dismissedThisMonth);
}

function getMonths(){
  const set = new Set(entries.map(e => monthKey(e.date)));
  const now = new Date();
  for(let i=0; i<12; i++){
    const y = now.getFullYear();
    const m = now.getMonth() - i;
    const d2 = new Date(y, m, 1);
    const mk = `${d2.getFullYear()}-${String(d2.getMonth()+1).padStart(2,"0")}`;
    set.add(mk);
  }
  return Array.from(set).sort().reverse();
}
function getMonthEntries(){
  return entries.filter(e => monthKey(e.date) === selectedMonth);
}
function getTotals(){
  const me = getMonthEntries();
  const sumOf = t => me.filter(e => e.type === t).reduce((s,e) => s + toCents(e.amount), 0) / 100;
  const income = sumOf("income"), expense = sumOf("expense"), saving = sumOf("saving");
  return { income, expense, saving, balance: income - expense - saving };
}
function getByCategory(type, totals){
  const cats = CATS_BY_TYPE[type];
  const me = getMonthEntries();
  const totalForType = totals[type];
  return cats.map(cat => ({
    cat,
    amount: me.filter(e => e.type === type && e.category === cat).reduce((s,e) => s + toCents(e.amount), 0) / 100
  })).filter(c => c.amount > 0)
    .sort((a,b) => b.amount - a.amount)
    .map(c => ({ ...c, pct: totalForType ? Math.round((c.amount/totalForType)*100) : 0 }));
}

function vaultetAssets(){
  const total=getTotalMoneyAllAccounts(), em=getEmergencySaved(), other=Math.max(0,getTotalSaved()-em);
  let pf={value:0,cost:0}; try{ pf=(window.vaultetPortfolioSummary&&window.vaultetPortfolioSummary())||pf; }catch(e){}
  const goals=Math.min(getGoalsHeld(),Math.max(0,other-pf.cost)), rest=Math.max(0,other-pf.cost-goals);
  return {total,em,stock:pf.value,goals,rest,assets:total+em+goals+rest+pf.value};
}
  // มูลค่าสุทธิที่แท้จริง = เงินรวมทุกบัญชี (นับรวมเงินออม/เงินลงทุนที่อยู่ในบัญชีอยู่แล้ว) + เงินที่คนอื่นติดค้างเรา − หนี้สินรวม (Milestone 5)
  // ไม่ใช่รายรับลบรายจ่ายของเดือนนี้ ซึ่งเป็นคนละความหมายกัน (นั่นคือกระแสเงินสดของเดือน ไม่ใช่มูลค่าสุทธิสะสม)
// ค่าเดียวที่ใช้ทั้งหน้าหลัก (renderAccountsSummary) และสรุปให้ Twin (ai.js) กันตัวเลขสองที่ไม่ตรงกัน
function vaultetNetWorth(){ return vaultetAssets().assets + getTotalReceivablesOutstanding() - getTotalDebts(); }
function renderAccountsSummary(){
  // มีบัญชีเดียว → ซ่อนช่องเลือกบัญชี/โอนเงิน/แยกตามบัญชี (เพิ่มบัญชีที่สองเมื่อไหร่ก็กลับมาเอง)
  document.body.classList.toggle("v-single-account", accounts.length <= 1);
  const total = getTotalMoneyAllAccounts();
  const reserved = getTotalReserved();
  const A = vaultetAssets(), vis=(id,on)=>{ const el=document.getElementById(id); const r=el&&(el.classList.contains("v-row")?el:el.parentElement); if(r) r.style.display=on?"":"none"; };
  document.getElementById("totalMoneyNum").textContent = "฿" + fmt(A.assets);
  // อยู่ที่นี่ (ไม่ใช่ใน render) เพื่อให้รีเฟรชพร้อมสินทรัพย์รวมทุกครั้งที่ราคาหุ้น/พอร์ตเปลี่ยน
  const netWorth = vaultetNetWorth();
  document.getElementById("netWorthNum").textContent = (netWorth<0?"-":"") + "฿" + fmt(Math.abs(netWorth));
  document.getElementById("inAccountsNum").textContent = "฿" + fmt(total);
  // มีบัญชีเดียว = เรียกว่า "เงินพร้อมใช้" ก้อนเดียว (ไม่พูดถึงคำว่าบัญชี)
  document.getElementById("inAccLabel").textContent = accounts.length <= 1 ? "เงินพร้อมใช้" : (reserved > 0 ? "ในบัญชี" : "ในบัญชี (ใช้ได้จริง)");
  document.getElementById("reservedNum").textContent = "฿" + fmt(reserved);
  document.getElementById("availableNum").textContent = "฿" + fmt(total - reserved);
  vis("reservedRow", reserved > 0); vis("availRow", reserved > 0);
  document.getElementById("emergencySavedNum").textContent = "฿" + fmt(A.em); vis("emergencySavedNum", A.em > 0);
  document.getElementById("stockNum").textContent = "฿" + fmt(A.stock); vis("stockRow", A.stock > 0);
  document.getElementById("goalsHeldNum").textContent = "฿" + fmt(A.goals); vis("goalsHeldRow", A.goals > 0);
  document.getElementById("otherSavedNum").textContent = "฿" + fmt(A.rest); vis("otherSavedRow", A.rest > 0);
  const rc = getTotalReceivablesOutstanding(), db = getTotalDebts();
  document.getElementById("receivablesNum").textContent = "฿" + fmt(rc); vis("receivablesNum", rc > 0);
  document.getElementById("totalDebtsNum").textContent = "฿" + fmt(db); vis("totalDebtsNum", db > 0);
  const listEl = document.getElementById("accountsList");
  listEl.innerHTML = accounts.map(a => `
    <div class="account-row"><span class="acc-name">${escapeHtml(a.name)}</span><span class="mono">฿${fmt(computeAccountBalance(a.id))}</span></div>
  `).join("");
}

// แถวรายการ (ใช้ทั้งหน้าหลักและแท็บ "รายการ") — แตะแถวเพื่อแก้ไข/ลบ
// ชื่อบัญชีที่ควรโชว์ในแถว: ไม่โชว์เมื่อมีบัญชีเดียว หรือเป็น "ไม่ระบุบัญชี" (ไม่ได้ให้ข้อมูลอะไร)
function accountNameForRow(accountId){
  if(accounts.length <= 1 || !accountId || accountId === UNASSIGNED_ACCOUNT_ID) return "";
  return accounts.find(a=>a.id===accountId)?.name || "";
}
function txListHtml(list){
  const txRow = (e, glyph, tone, title, sub, amount) => `<li class="v-tx" data-id="${e.id}">
      <span class="v-tx-ic v-tone-${tone}">${glyph}</span>
      <div class="v-tx-main"><div class="v-tx-t">${title}</div>${sub?`<div class="v-tx-s">${sub}</div>`:""}</div>
      <span class="v-tx-a v-sens v-tone-${tone}">${amount}</span>
    </li>`;
  const rows = [];
  let lastDate = null;
  list.forEach(e => {
    if(e.date !== lastDate){ lastDate = e.date; rows.push(`<li class="v-day">${dayHeading(e.date)}</li>`); }
    const note = e.note ? escapeHtml(e.note) : "";
    if(e.type === "transfer"){
      const fromName = accounts.find(a=>a.id===e.fromAccountId)?.name || "บัญชีที่ถูกลบ";
      const toName = accounts.find(a=>a.id===e.toAccountId)?.name || "บัญชีที่ถูกลบ";
      rows.push(txRow(e, "⇄", "xfer", "โอนเงิน", `${escapeHtml(fromName)} → ${escapeHtml(toName)}${note ? " · "+note : ""}`, "฿"+fmt(e.amount)));
    }else{
      const tone = e.type==="income" ? "in" : e.type==="saving" ? "save" : "out";
      const sign = e.type==="income" ? "+" : e.type==="saving" ? "" : "−";
      const glyph = e.recurringId ? "↻" : e.type==="income" ? "↑" : e.type==="saving" ? "◆" : "↓";
      const accName = accountNameForRow(e.accountId);
      const sub = [accName ? escapeHtml(accName) : "", note].filter(Boolean).join(" · ");
      rows.push(txRow(e, glyph, tone, escapeHtml(e.category), sub, `${sign}฿${fmt(e.amount)}`));
    }
  });
  return `<ul class="v-txlist">${rows.join("")}</ul>`;
}
function bindTxRows(container){
  container.querySelectorAll(".v-tx").forEach(li => {
    li.addEventListener("click", () => {
      const entry = entries.find(e => e.id === li.dataset.id);
      if(entry) openForm(entry);
    });
  });
}
// ลบรายการ (เรียกจากปุ่ม "ลบรายการนี้" ในหน้าแก้ไข)
async function deleteEntryById(id){
  const target = entries.find(e => e.id === id);
  if(!target) return;
  if(target.source === "loan_repayment"){
    const result = await deleteLoanRepayment(target.loanId, target.repaymentId);
    if(!result.ok && result.error !== "cancelled") showToast("ลบเงินคืนไม่สำเร็จ");
    return;
  }
  syncStudentLoanEntry(target, {...target, type:"__deleted__", category:""});
  entries = entries.filter(e => e.id !== id);
  saveEntries();
  render();
}
