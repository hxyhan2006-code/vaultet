// Vaultet — app/03-calc.js : คำนวณ: ค่าใช้จ่ายประจำ/ที่ต้องจ่าย, คาดการณ์เงินสด, วิเคราะห์ตามช่วงเวลา
// (แยกจาก app.js เดิม — โหลดเรียงตามเลขไฟล์ ทุกไฟล์ใช้ตัวแปร/ฟังก์ชันร่วมกันแบบ global)
// ===== Phase 4: Recurring Expenses + Upcoming Payments — core logic =====
// เพิ่มจำนวนเดือนให้กับวันที่ ISO โดย "clamp" วันที่ให้อยู่ในช่วงที่ถูกต้องของเดือนปลายทางเสมอ
// เช่น 31 ม.ค. +1 เดือน -> 28 หรือ 29 ก.พ. (แล้วแต่ปีอธิกสุรทิน), ไม่มีวันที่ invalid หลุดออกมา
function addMonthsClamped(iso, months){
  const [y,m,d] = iso.split("-").map(Number);
  const targetMonthIndex = (m-1) + months;
  const targetYear = y + Math.floor(targetMonthIndex/12);
  const targetMonth0 = ((targetMonthIndex % 12) + 12) % 12;
  const lastDay = new Date(targetYear, targetMonth0+1, 0).getDate();
  const day = Math.min(d, lastDay);
  return `${targetYear}-${String(targetMonth0+1).padStart(2,"0")}-${String(day).padStart(2,"0")}`;
}
function computeNextDueDate(currentISO, frequency){
  switch(frequency){
    case "weekly": return addDaysISO(currentISO, 7);
    case "monthly": return addMonthsClamped(currentISO, 1);
    case "bimonthly": return addMonthsClamped(currentISO, 2);
    case "quarterly": return addMonthsClamped(currentISO, 3);
    case "yearly": return addMonthsClamped(currentISO, 12);
    default: return addMonthsClamped(currentISO, 1);
  }
}
function frequencyLabel(f){
  return { weekly:"รายสัปดาห์", monthly:"รายเดือน", bimonthly:"ทุก 2 เดือน", quarterly:"รายไตรมาส", yearly:"รายปี" }[f] || f;
}
// สถานะที่คำนวณจากวันที่ (เฉพาะรายการที่ status="active" เท่านั้นที่จะมีสถานะเหล่านี้)
function getDueStatus(r){
  const today = todayISO();
  if(r.nextDueDate < today) return "overdue";
  if(r.nextDueDate === today) return "dueToday";
  return "upcoming";
}
function statusLabel(s){
  return { active:"ใช้งานอยู่", paused:"หยุดชั่วคราว", cancelled:"ยกเลิกแล้ว", overdue:"เลยกำหนด", dueToday:"ครบกำหนดวันนี้", upcoming:"กำลังจะถึง" }[s] || s;
}
function getActiveRecurring(){
  return recurringExpenses.filter(r => r.status === "active");
}
// จำนวนวันนับจากวันนี้ถึง iso (0 = วันนี้, ค่าลบ = เลยมาแล้วกี่วัน)
function daysUntil(iso){
  return daysBetweenInclusive(todayISO(), iso) - 1;
}
// เงินกันไว้ (Reserved Money) ที่เชื่อมกับ recurring expense นี้ — Reserved ยังคงเป็น "เงินที่กันไว้" ไม่ใช่ Expense
function getReservedLinkInfo(r){
  if(!r.reservedItemId) return null;
  const item = reservedItems.find(x => x.id === r.reservedItemId);
  if(!item) return null;
  const shortfall = Math.max(0, toCents(r.amount) - toCents(item.amount)) / 100;
  return { item, reservedAmount: item.amount, shortfall };
}
// รายการ Upcoming ตามช่วงเวลาที่เลือก — Overdue จะโผล่มาเสมอไม่ว่าจะเลือกช่วงไหน
function getUpcomingOccurrences(filter){
  const today = todayISO();
  let rangeStart = today, rangeEnd = null;
  if(filter === "7d") rangeEnd = addDaysISO(today, 7);
  else if(filter === "30d") rangeEnd = addDaysISO(today, 30);
  else if(filter === "thisMonth"){
    const now = new Date();
    rangeEnd = monthBoundsISO(now.getFullYear(), now.getMonth()).end;
  }else if(filter === "nextMonth"){
    const now = new Date();
    const nm = now.getMonth()+1 > 11 ? 0 : now.getMonth()+1;
    const ny = now.getMonth()+1 > 11 ? now.getFullYear()+1 : now.getFullYear();
    const bounds = monthBoundsISO(ny, nm);
    rangeStart = bounds.start; rangeEnd = bounds.end;
  }
  // filter === "all" -> ไม่มี upper bound
  return getActiveRecurring()
    .filter(r => {
      const status = getDueStatus(r);
      if(status === "overdue") return true; // overdue โผล่เสมอ
      if(filter === "nextMonth") return r.nextDueDate >= rangeStart && r.nextDueDate <= rangeEnd;
      if(rangeEnd) return r.nextDueDate <= rangeEnd;
      return true;
    })
    .map(r => ({ r, status: getDueStatus(r), days: daysUntil(r.nextDueDate) }))
    .sort((a,b) => a.r.nextDueDate.localeCompare(b.r.nextDueDate));
}
function getUpcomingSummary(){
  const today = todayISO();
  const in7 = addDaysISO(today, 7), in30 = addDaysISO(today, 30);
  let total=0, within7=0, within30=0, overdue=0, count=0;
  getActiveRecurring().forEach(r => {
    const amtCents = toCents(r.amount);
    const status = getDueStatus(r);
    count++;
    total += amtCents;
    if(status === "overdue"){ overdue += amtCents; return; }
    if(r.nextDueDate <= in7) within7 += amtCents;
    if(r.nextDueDate <= in30) within30 += amtCents;
  });
  return { total: total/100, within7: within7/100, within30: within30/100, overdue: overdue/100, count };
}
// "ประมาณการ" ค่าใช้จ่ายประจำต่อเดือน — ไม่ใช่ยอด Expense จริง แค่ค่าเฉลี่ยเพื่อดูภาพรวม
function computeMonthlyRecurringCost(){
  const cents = getActiveRecurring().reduce((s,r) => {
    const amt = toCents(r.amount);
    let monthly;
    switch(r.frequency){
      case "weekly": monthly = amt * 30 / 7; break;
      case "bimonthly": monthly = amt / 2; break;
      case "quarterly": monthly = amt / 3; break;
      case "yearly": monthly = amt / 12; break;
      case "monthly": default: monthly = amt;
    }
    return s + monthly;
  }, 0);
  return cents / 100;
}

// ===== Phase 5: Cash Flow Forecast — PURE CALCULATION, read-only =====
// ห้ามแก้ accounts / entries / recurringExpenses / reservedItems ใดๆ ทั้งสิ้น — คำนวณจากข้อมูลปัจจุบันแล้ว render อย่างเดียว
// occurrence ในอนาคตของ recurring ที่ active เท่านั้น ภายใน horizon (รวม overdue ที่ยังไม่ mark paid)
//
// หมายเหตุสำคัญเรื่อง day-31 rollover (แก้เฉพาะ Phase 5 เท่านั้น):
// computeNextDueDate()/addMonthsClamped() ของ Phase 4 เดิม จะ "จำ" วันที่ของรอบก่อนหน้าไว้แล้วบวกเดือนต่อไปเรื่อยๆ
// ผลคือถ้าวันที่ตั้งต้นคือ 31 แล้วโดน clamp เหลือ 28 ที่ ก.พ. เดือนถัดๆ ไปจะค้างที่ 28 ไม่กลับไป 31 อีก
// (เช่น 31 ม.ค. → 28 ก.พ. → 28 มี.ค. → ... ) — เป็นพฤติกรรมที่ถูกต้องแล้วสำหรับ Phase 4 เพราะ nextDueDate
// ต้องอิงจากวันที่ "จ่ายจริงครั้งล่าสุด" ที่บันทึกไว้ ไม่ใช่ค่าที่ Forecast ควรไปยุ่งด้วย จึงห้ามแก้ฟังก์ชันนั้น
//
// แต่ผู้ใช้ต้องการให้ Forecast (ซึ่งเป็นการจำลอง ไม่ใช่ของจริง) แสดง pattern แบบ
// 31 ม.ค. → 28/29 ก.พ. → 31 มี.ค. → 30 เม.ย. → 31 พ.ค. คือ "กลับไปวันเดิมทุกครั้งที่เดือนนั้นมีวันนั้นจริง"
// จึงเพิ่มฟังก์ชันใหม่ getForecastNextDate() ที่ใช้เฉพาะใน Forecast เท่านั้น โดยอิงจาก "anchor day" —
// วันที่ตั้งใจไว้ตอนสร้าง recurring (เอาจาก r.startDate ซึ่ง Phase 4 ตั้งไว้ครั้งเดียวตอนสร้างและไม่เคยแก้ทับ)
// แทนที่จะอิงวันที่ของรอบก่อนหน้าที่อาจถูก clamp ไปแล้ว
//
// ผลกระทบ: ไม่มี — ฟังก์ชันนี้เป็นฟังก์ชันใหม่แยกต่างหาก ไม่ได้ไปแก้ไข/เรียกทับ computeNextDueDate() หรือ
// addMonthsClamped() เดิม, ไม่แตะ r.nextDueDate จริงใน storage, Mark as Paid ของ Phase 4 ยังคำนวณรอบถัดไป
// ด้วย computeNextDueDate() เดิมเป๊ะๆ เหมือนเดิมทุกประการ — Forecast แค่ "มองไปข้างหน้า" ต่างไปเท่านั้น
function getForecastNextDate(currentISO, frequency, anchorDay){
  if(frequency === "weekly") return addDaysISO(currentISO, 7); // รายสัปดาห์ไม่มีปัญหาวันที่ล้นเดือน ใช้ตรงๆ ได้
  const monthsToAdd = { monthly:1, bimonthly:2, quarterly:3, yearly:12 }[frequency] || 1;
  const [y,m] = currentISO.split("-").map(Number);
  const targetMonthIndex = (m-1) + monthsToAdd;
  const targetYear = y + Math.floor(targetMonthIndex/12);
  const targetMonth0 = ((targetMonthIndex % 12) + 12) % 12;
  const lastDay = new Date(targetYear, targetMonth0+1, 0).getDate();
  const day = Math.min(anchorDay, lastDay); // ใช้วัน anchor เดิม ไม่ใช่วันของรอบก่อนหน้าที่อาจถูก clamp มาแล้ว
  return `${targetYear}-${String(targetMonth0+1).padStart(2,"0")}-${String(day).padStart(2,"0")}`;
}
// reuse getActiveRecurring()/getDueStatus() จาก Phase 4 เดิม — ไม่สร้าง status logic ใหม่
function getForecastOccurrences(horizonEnd){
  const today = todayISO();
  const occurrences = [];
  getActiveRecurring().forEach(r => {
    // anchor day: ใช้วัน (1-31) จาก startDate ที่ตั้งไว้ตอนสร้าง ถ้าไม่มี/ไม่ valid ให้ fallback เป็นวันของ nextDueDate ปัจจุบัน
    // (รองรับข้อมูลเก่าก่อนมี Forecast โดยไม่ต้องแก้ schema หรือ backfill ข้อมูลใดๆ)
    const anchorSource = isValidISODate(r.startDate) ? r.startDate : r.nextDueDate;
    const anchorDay = parseInt(anchorSource.split("-")[2], 10) || parseInt(r.nextDueDate.split("-")[2], 10) || 1;
    let dueDate = r.nextDueDate; // occurrence แรกใช้ nextDueDate จริงเสมอ — เป็นวัน authoritative ตาม Phase 4
    let guard = 0; // กัน infinite loop ถ้าข้อมูลผิดปกติ
    while(dueDate && dueDate <= horizonEnd && guard < 1000){
      occurrences.push({
        recurringId: r.id, name: r.name, amount: r.amount, accountId: r.accountId,
        category: r.category, date: dueDate, isOverdue: dueDate < today,
      });
      dueDate = getForecastNextDate(dueDate, r.frequency, anchorDay);
      guard++;
    }
  });
  occurrences.sort((a,b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name));
  return occurrences;
}
// คำนวณ Forecast ทั้งหมด — deterministic, ไม่แตะ localStorage, เรียกกี่ครั้งก็ได้ผลเหมือนเดิมถ้าข้อมูลจริงไม่เปลี่ยน
function computeForecast(days){
  const today = todayISO();
  const horizonEnd = addDaysISO(today, days);
  const occurrences = getForecastOccurrences(horizonEnd);

  const actualTotalCents = toCents(getTotalMoneyAllAccounts());
  const reservedTotalCents = toCents(getTotalReserved());
  const upcomingTotalCents = occurrences.reduce((s,o) => s + toCents(o.amount), 0);
  const forecastTotalCents = actualTotalCents - upcomingTotalCents;
  const forecastAvailableCents = forecastTotalCents - reservedTotalCents;

  // แยกตามบัญชี + running balance ต่อบัญชี เพื่อตรวจว่ามีจุดไหนติดลบระหว่างทางหรือไม่
  const perAccount = accounts.map(a => {
    const currentCents = toCents(computeAccountBalance(a.id));
    const accOccs = occurrences.filter(o => o.accountId === a.id);
    let running = currentCents;
    let firstNegative = null;
    accOccs.forEach(o => {
      running -= toCents(o.amount);
      if(running < 0 && !firstNegative) firstNegative = { date: o.date, balanceCents: running };
    });
    const futureCents = accOccs.reduce((s,o) => s + toCents(o.amount), 0);
    return {
      account: a,
      current: currentCents / 100,
      future: futureCents / 100,
      forecast: (currentCents - futureCents) / 100,
      firstNegative: firstNegative ? { date: firstNegative.date, balance: firstNegative.balanceCents / 100 } : null,
    };
  });

  // Timeline รวมทุกบัญชี — running total หลังแต่ละ occurrence เรียงตามวัน
  let runningTotal = actualTotalCents;
  const timeline = occurrences.map(o => {
    runningTotal -= toCents(o.amount);
    return { ...o, runningTotal: runningTotal / 100 };
  });

  return {
    days, horizonEnd,
    current: actualTotalCents / 100,
    reserved: reservedTotalCents / 100,
    upcoming: upcomingTotalCents / 100,
    forecast: forecastTotalCents / 100,
    forecastAvailable: forecastAvailableCents / 100,
    occurrenceCount: occurrences.length,
    timeline, perAccount,
    negativeAccounts: perAccount.filter(p => p.firstNegative),
    totalNegative: forecastTotalCents < 0,
  };
}

// ===== Phase 2: Custom Date Range + Period Analysis =====
function addDaysISO(iso, days){
  const [y,m,d] = iso.split("-").map(Number);
  const dt = new Date(y, m-1, d);
  dt.setDate(dt.getDate() + days);
  return `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,"0")}-${String(dt.getDate()).padStart(2,"0")}`;
}
function daysBetweenInclusive(startISO, endISO){
  const [y1,m1,d1] = startISO.split("-").map(Number);
  const [y2,m2,d2] = endISO.split("-").map(Number);
  const t1 = Date.UTC(y1,m1-1,d1), t2 = Date.UTC(y2,m2-1,d2);
  return Math.round((t2 - t1) / 86400000) + 1;
}
function monthBoundsISO(y, m){ // m: 0-based month index
  const start = `${y}-${String(m+1).padStart(2,"0")}-01`;
  const lastDay = new Date(y, m+1, 0).getDate();
  const end = `${y}-${String(m+1).padStart(2,"0")}-${String(lastDay).padStart(2,"0")}`;
  return { start, end };
}
// คืนค่า {start, end} เป็น ISO date string (inclusive) หรือ {start:null,end:null} สำหรับ "ทั้งหมด"
function getAnalysisRange(){
  const today = todayISO();
  const now = new Date();
  switch(analysisPreset){
    case "today": return { start: today, end: today };
    case "7d": return { start: addDaysISO(today, -6), end: today };
    case "thisMonth": return monthBoundsISO(now.getFullYear(), now.getMonth());
    case "lastMonth": {
      const m = now.getMonth()===0 ? 11 : now.getMonth()-1;
      const y = now.getMonth()===0 ? now.getFullYear()-1 : now.getFullYear();
      return monthBoundsISO(y, m);
    }
    case "3m": return { start: addDaysISO(today, -89), end: today };
    case "6m": return { start: addDaysISO(today, -179), end: today };
    case "thisYear": return { start: `${now.getFullYear()}-01-01`, end: `${now.getFullYear()}-12-31` };
    case "lastYear": return { start: `${now.getFullYear()-1}-01-01`, end: `${now.getFullYear()-1}-12-31` };
    case "custom": return { start: analysisStart || null, end: analysisEnd || null };
    case "all": default: return { start: null, end: null };
  }
}
function computePeriodAnalysis(){
  const { start, end } = getAnalysisRange();
  return computePeriodAnalysisForRange(start, end, analysisAccountFilter);
}
// เวอร์ชัน parametrized ของ computePeriodAnalysis เดิม — Phase 2 (computePeriodAnalysis) และ Phase 3 (Compare)
// เรียกฟังก์ชันนี้ร่วมกัน เพื่อให้ logic การคำนวณตรงกันเสมอ ไม่มีสูตรซ้ำซ้อน/ขัดแย้งกัน
function computePeriodAnalysisForRange(start, end, accountFilter){
  // รายการที่ไม่ใช่ transfer เท่านั้น (transfer ไม่ใช่รายรับ/รายจ่าย) และกรองตามบัญชีถ้าเลือกไว้
  let rangeEntries = entries.filter(e => e.type !== "transfer");
  if(start) rangeEntries = rangeEntries.filter(e => e.date >= start);
  if(end) rangeEntries = rangeEntries.filter(e => e.date <= end);
  if(accountFilter) rangeEntries = rangeEntries.filter(e => (e.accountId || UNASSIGNED_ACCOUNT_ID) === accountFilter);

  const sumOf = t => rangeEntries.filter(e => e.type===t).reduce((s,e) => s + toCents(e.amount), 0) / 100;
  const income = sumOf("income"), expense = sumOf("expense"), saving = sumOf("saving");
  const loanRepaymentIncome = rangeEntries.filter(e => e.type === "income" && e.source === "loan_repayment").reduce((s,e) => s + toCents(e.amount), 0) / 100;
  const withdrawIncome = rangeEntries.filter(e => e.type === "income" && e.category === WITHDRAW_CAT).reduce((s,e) => s + toCents(e.amount), 0) / 100;
  const nonLoanIncome = income - loanRepaymentIncome - withdrawIncome;
  const netCashFlow = income - expense - saving;

  let effStart = start, effEnd = end;
  if(!effStart || !effEnd){
    // "ทั้งหมด" — ใช้ช่วงจากรายการจริงที่มีอยู่ (ถ้าไม่มีรายการเลย ใช้ 1 วันกันหารด้วยศูนย์)
    const dates = rangeEntries.map(e => e.date).sort();
    effStart = start || dates[0] || today0();
    effEnd = end || dates[dates.length-1] || today0();
  }
  const days = Math.max(1, daysBetweenInclusive(effStart, effEnd));

  // ค่าเฉลี่ย/วัน: ถ้าช่วงที่เลือกมีวันในอนาคตรวมอยู่ด้วย (เช่น "เดือนนี้"/"ปีนี้" ที่ยังไม่จบเดือน/ปี)
  // ให้หารด้วยจำนวนวันที่ผ่านไปจริงถึงวันนี้เท่านั้น (เช่น วันนี้ที่ 5 ก็หาร 5) ไม่หารด้วยความยาวเต็มช่วง (30/31 วัน)
  // ส่วนช่วงที่จบไปแล้วทั้งหมด (เดือนที่แล้ว, ช่วงกำหนดเองในอดีต) ยังคงหารด้วยความยาวเต็มช่วงตามเดิม
  const todayStr = today0();
  const avgDivisorEnd = effEnd > todayStr ? todayStr : effEnd;
  const avgDays = avgDivisorEnd < effStart ? days : Math.max(1, daysBetweenInclusive(effStart, avgDivisorEnd));

  const expenseEntries = rangeEntries.filter(e => e.type==="expense");
  const avgIncomePerDay = income / days;
  const avgExpensePerDay = expense / avgDays;
  const avgExpensePerTxn = expenseEntries.length ? expense / expenseEntries.length : 0;

  const catMap = {};
  expenseEntries.forEach(e => { catMap[e.category] = (catMap[e.category]||0) + toCents(e.amount); });
  const breakdown = Object.keys(catMap).map(cat => ({ cat, amount: catMap[cat]/100 }))
    .sort((a,b) => b.amount - a.amount)
    .map(r => ({ ...r, pct: expense ? Math.round((r.amount/expense)*100) : 0 }));

  return {
    income, loanRepaymentIncome, nonLoanIncome, expense, saving, netCashFlow,
    count: rangeEntries.length,
    avgIncomePerDay, avgExpensePerDay, avgExpensePerTxn,
    topCategory: breakdown[0]?.cat || "-",
    breakdown,
  };
}
function today0(){ return todayISO(); }

function renderPeriodAnalysis(){
  const accSelect = document.getElementById("analysisAccountFilter");
  const accOptsHtml = `<option value="">ทุกบัญชี</option>` + accounts.map(a => `<option value="${a.id}">${escapeHtml(a.name)}</option>`).join("");
  if(accSelect.innerHTML !== accOptsHtml) accSelect.innerHTML = accOptsHtml;
  accSelect.value = analysisAccountFilter;
  document.getElementById("customRangeRow").style.display = analysisPreset === "custom" ? "flex" : "none";

  const a = computePeriodAnalysis();
  const container = document.getElementById("periodAnalysisSection");
  const statBox = (label, val, color) => `<div class="stat-box"><div class="stat-box-label">${label}</div><div class="stat-box-num mono" ${color?`style="color:${color}"`:""}>${val}</div></div>`;
  const money = n => (n<0?"-":"") + "฿" + fmt(Math.abs(n));
  // ยอดเงินจริงก่อนวันแรกของช่วงที่เลือก (ย้ายมาจากหน้าหลัก) + เงินให้ยืมที่ออกไปในช่วงนี้
  const { start: aStart, end: aEnd } = getAnalysisRange();
  const carry = aStart ? (analysisAccountFilter ? computeAccountBalance(analysisAccountFilter, aStart) : getTotalMoneyAllAccounts(aStart)) : null;
  const loanOut = loans.filter(l => l.date && (!aStart || l.date >= aStart) && (!aEnd || l.date <= aEnd) && (!analysisAccountFilter || l.accountId === analysisAccountFilter)).reduce((t,l) => t + toCents(l.amount), 0) / 100;
  container.innerHTML = `
    <div class="stats-grid">
      ${carry === null ? "" : statBox("ยกมาก่อนช่วงนี้", money(carry))}
      ${loanOut > 0 ? statBox("ให้ยืมไป", money(loanOut)) : ""}
      ${statBox("รายรับ", money(a.income), "var(--income)")}
      ${statBox("รายจ่าย", money(a.expense), "var(--expense)")}
      ${statBox("ออม/ลงทุน", money(a.saving), "var(--saving)")}
      ${statBox("Net Cash Flow", money(a.netCashFlow), a.netCashFlow<0?"var(--expense)":"var(--ink)")}
      ${statBox("รายจ่ายเฉลี่ย/วัน", money(a.avgExpensePerDay))}
    </div>
    <div style="margin-top:16px">
      <span class="section-label">รายจ่ายตามหมวด (ช่วงที่เลือก)</span>
      <div style="margin-top:8px">
        ${a.breakdown.length===0 ? `<div class="empty-state">ไม่มีรายจ่ายในช่วงเวลานี้</div>` :
          a.breakdown.map(r => `
            <div class="bar-row">
              <div class="bar-row-top"><span>${escapeHtml(r.cat)}</span><span class="mono">฿${fmt(r.amount)} (${r.pct}%)</span></div>
              <div class="bar-track"><div class="bar-fill" style="width:${r.pct}%;background:var(--expense)"></div></div>
            </div>
          `).join("")}
      </div>
    </div>
  `;
}
document.getElementById("analysisPreset").addEventListener("change", (e) => {
  analysisPreset = e.target.value;
  if(analysisPreset === "custom" && !analysisStart && !analysisEnd){
    analysisStart = todayISO();
    analysisEnd = todayISO();
    document.getElementById("analysisStartInput").value = analysisStart;
    document.getElementById("analysisEndInput").value = analysisEnd;
  }
  renderPeriodAnalysis();
});
document.getElementById("analysisAccountFilter").addEventListener("change", (e) => {
  analysisAccountFilter = e.target.value;
  renderPeriodAnalysis();
});
document.getElementById("analysisStartInput").addEventListener("change", (e) => {
  analysisStart = e.target.value;
  renderPeriodAnalysis();
});
document.getElementById("analysisEndInput").addEventListener("change", (e) => {
  analysisEnd = e.target.value;
  renderPeriodAnalysis();
});
