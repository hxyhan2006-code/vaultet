// Vaultet — ai/07-weekly.js : ตรวจสุขภาพการเงินรายสัปดาห์ (รวบรวมข้อมูล, สั่ง AI, หน้าจอ)
// (แยกจาก ai.js เดิม — โหลดเรียงตามเลขไฟล์ ทุกไฟล์ใช้ตัวแปร/ฟังก์ชันร่วมกันแบบ global)
// ======================================================================
// ===== Weekly Audit — ตรวจสุขภาพการเงินรอบสัปดาห์โดย AI =====
// ส่วนนี้เพิ่มใหม่ทั้งหมด ไม่แตะ logic เดิม:
//  1) buildWeeklyAuditContext()  — รวมข้อมูลจริง 7 วันล่าสุดแบบ deterministic (ไม่ยิง network)
//  2) generateWeeklyAudit()      — ส่ง Context ให้ Gemini เขียนรายงานสั้น 3 หัวข้อ
//  3) UI: ปุ่ม + Modal + แบนเนอร์สัปดาห์ใหม่ + แคชผลลง localStorage (WEEKLY_AUDIT_KEY)
// กฎเหล็กเดียวกับคีย์ AI อื่น: ห้ามนำ WEEKLY_AUDIT_KEY ไปรวมใน payload ของ exportBtn (ไม่ใช่ข้อมูลการเงิน)
// ======================================================================
const WEEKLY_AUDIT_DAYS = 7;                 // ช่วงที่ตรวจ: 7 วันล่าสุดรวมวันนี้
const WEEKLY_AUDIT_OVERUSE_PCT = 50;         // สัปดาห์เดียวใช้เกิน 50% ของงบทั้งเดือน = ระดับ critical
const WEEKLY_AUDIT_WARN_FACTOR = 1.5;        // ใช้เกิน 1.5 เท่าของสัดส่วนที่ควรใช้ใน 7 วัน = ระดับ warning
const WEEKLY_AUDIT_DISMISS_KEY = "vaultet_weekly_audit_banner_dismissed"; // เก็บใน sessionStorage เท่านั้น
let weeklyAuditBusy = false;
const WEEKLY_AUDIT_VERSION = 2;              // เปลี่ยนเลขนี้เมื่อรูปแบบรายงานเปลี่ยน → แคชเก่าถูกมองว่าหมดอายุ

// แยกประเภทค่าใช้จ่ายจากชื่อหมวด: "ก้อนเดียวจบ/รายคาบ" (one-off) vs "กินอยู่ประจำวัน" (daily flexible)
// แก้ regex ให้ตรงกับชื่อหมวดจริงของแอปได้ที่นี่ — ถ้าชื่อไม่เข้าเลย จะเดาจากความถี่ (ซื้อ ≤2 ครั้งใน 7 วัน = ก้อนเดียวจบ)
const WEEKLY_AUDIT_ONEOFF_RE = /ของใช้|ของเข้าบ้าน|ซื้อของ|ดูแลตัว|ช้อป|เสื้อผ้า|ค่าเทอม|ค่าเช่า|ค่าหอ|ประกัน|ซ่อม|ของขวัญ|อุปกรณ์|ค่ารักษา|หมอ|ค่าน้ำ|ค่าไฟ|เน็ต|อินเทอร์เน็ต|สมาชิก|ผ่อน/;
const WEEKLY_AUDIT_DAILY_RE = /กิน|อาหาร|ข้าว|กาแฟ|ขนม|เครื่องดื่ม|เดินทาง|น้ำมัน|ค่ารถ|ค่าโดยสาร|ตลาด/;
function waClassifySpend(category, count){
  const c = String(category || "");
  if(WEEKLY_AUDIT_ONEOFF_RE.test(c)) return { type:"one_off_periodic", by:"name" };
  if(WEEKLY_AUDIT_DAILY_RE.test(c)) return { type:"daily_flexible", by:"name" };
  return { type: waNum(count) >= 3 ? "daily_flexible" : "one_off_periodic", by:"frequency" };
}

// --- helpers ---
function waNum(v){ const n = Number(v); return Number.isFinite(n) ? n : 0; }
function waRound(v){ return Math.round(waNum(v)); }
function waIsoFromDate(d){ return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; }
// คีย์สัปดาห์ = วันจันทร์ของสัปดาห์นั้น (YYYY-MM-DD) ใช้ตัดสินว่า "สัปดาห์ใหม่" หรือยัง
function waWeekKey(iso){
  const p = String(iso || todayISO()).split("-").map(Number);
  const d = new Date(p[0], p[1]-1, p[2], 12, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return waIsoFromDate(d);
}
function waShortDate(iso){
  return /^\d{4}-\d{2}-\d{2}$/.test(String(iso || "")) ? `${iso.slice(8,10)}/${iso.slice(5,7)}` : "";
}
function waBaht(v){ return "฿" + fmt(waRound(v)); }

// --- storage ---
function loadWeeklyAuditCache(){
  try{
    const raw = localStorage.getItem(WEEKLY_AUDIT_KEY);
    if(!raw) return null;
    const c = JSON.parse(raw);
    return (c && c.ver === WEEKLY_AUDIT_VERSION && typeof c.text === "string" && c.text.trim() && c.weekKey) ? c : null;
  }catch(e){ return null; }
}
function saveWeeklyAuditCache(record){
  try{ localStorage.setItem(WEEKLY_AUDIT_KEY, JSON.stringify(record)); return true; }catch(e){ return false; }
}

// ===== 1) รวบรวมข้อมูลรอบ 7 วัน =====
function buildWeeklyAuditContext(){
  const today = todayISO();
  const start = isoDaysFromToday(-(WEEKLY_AUDIT_DAYS - 1));
  const prevStart = isoDaysFromToday(-(WEEKLY_AUDIT_DAYS * 2 - 1));
  const prevEnd = isoDaysFromToday(-WEEKLY_AUDIT_DAYS);
  const [ty, tm, td] = today.split("-").map(Number);
  const mk = monthKey(today);
  const mb = monthBoundsISO(ty, tm - 1);
  const daysInMonth = new Date(ty, tm, 0).getDate();
  const daysLeftAfterToday = Math.max(1, daysInMonth - td);

  // ใช้ตัววิเคราะห์ช่วงวันตัวเดิมของแอป เพื่อให้ตัวเลข (รายรับจริง/ไม่นับเงินคืนจากการให้ยืม/หมวด) ตรงกับหน้าอื่นเสมอ
  const week = computePeriodAnalysisForRange(start, today, null);
  const prevWeek = computePeriodAnalysisForRange(prevStart, prevEnd, null);
  const month = computePeriodAnalysisForRange(mb.start, today, null);

  let essentialSet;
  try{ essentialSet = new Set(getEmergencyEssentialCategories()); }catch(e){ essentialSet = new Set(); }

  const weekExpense = waNum(week.expense);
  const weekRows = Array.isArray(week.breakdown) ? week.breakdown : [];
  const categories = weekRows
    .map(r => ({
      category: r.cat,
      amount: waRound(r.amount),
      count: waNum(r.count),
      pctOfWeekExpense: weekExpense > 0 ? Math.round(waNum(r.amount) / weekExpense * 100) : 0,
      necessity: essentialSet.has(r.cat) ? "จำเป็น" : "ไม่จำเป็น",
      spendType: waClassifySpend(r.cat, r.count).type,
      spendTypeBasis: waClassifySpend(r.cat, r.count).by
    }))
    .filter(r => r.amount > 0)
    .sort((a, b) => b.amount - a.amount);
  const essentialExpense = categories.filter(c => c.necessity === "จำเป็น").reduce((s, c) => s + c.amount, 0);
  const discretionaryExpense = Math.max(0, waRound(weekExpense) - essentialExpense);
  const oneOffExpense = categories.filter(c => c.spendType === "one_off_periodic").reduce((s, c) => s + c.amount, 0);
  const dailyFlexibleExpense = categories.filter(c => c.spendType === "daily_flexible").reduce((s, c) => s + c.amount, 0);

  // งบรายจ่ายรายกลุ่มของเดือนนี้ เทียบกับยอดที่ใช้ใน 7 วัน
  const weekCatSpent = {}, monthCatSpent = {};
  weekRows.forEach(r => { weekCatSpent[r.cat] = waNum(r.amount); });
  (Array.isArray(month.breakdown) ? month.breakdown : []).forEach(r => { monthCatSpent[r.cat] = waNum(r.amount); });
  const fairSharePct = Math.round(WEEKLY_AUDIT_DAYS / daysInMonth * 100);
  const budgetGroups = (Array.isArray(budgets) ? budgets : [])
    .filter(b => b && b.enabled !== false && b.month === mk && (b.kind || "expense") === "expense" && waNum(b.amount) > 0)
    .map(b => {
      const cats = (Array.isArray(b.categories) && b.categories.length) ? b.categories : (b.category ? [b.category] : []);
      const amount = waNum(b.amount);
      const weekSpent = cats.reduce((s, c) => s + waNum(weekCatSpent[c]), 0);
      const monthSpent = cats.reduce((s, c) => s + waNum(monthCatSpent[c]), 0);
      const weekPct = Math.round(weekSpent / amount * 100);
      const level = weekPct >= WEEKLY_AUDIT_OVERUSE_PCT ? "critical"
        : weekPct >= fairSharePct * WEEKLY_AUDIT_WARN_FACTOR ? "warning" : "ok";
      return {
        name: b.name || b.category || cats.join(" + "),
        categories: cats,
        monthlyBudget: waRound(amount),
        weekSpent: waRound(weekSpent),
        weekPctOfMonthlyBudget: weekPct,
        monthSpentToDate: waRound(monthSpent),
        monthPctUsed: Math.round(monthSpent / amount * 100),
        spendType: (cats.length && cats.every(c => WEEKLY_AUDIT_ONEOFF_RE.test(String(c)))) ? "one_off_periodic" : "daily_flexible",
        level
      };
    });
  const overuseFlags = budgetGroups
    .filter(g => g.level !== "ok")
    .sort((a, b) => b.weekPctOfMonthlyBudget - a.weekPctOfMonthlyBudget)
    .map(g => ({
      budget: g.name,
      level: g.level,
      weekSpent: g.weekSpent,
      monthlyBudget: g.monthlyBudget,
      weekPctOfMonthlyBudget: g.weekPctOfMonthlyBudget,
      reason: g.level === "critical"
        ? `ใช้ใน 7 วันเกิน ${WEEKLY_AUDIT_OVERUSE_PCT}% ของงบทั้งเดือน`
        : `ใช้ใน 7 วันสูงกว่าสัดส่วนที่ควรใช้ (~${fairSharePct}% ของงบเดือน) เกิน ${WEEKLY_AUDIT_WARN_FACTOR} เท่า`
    }));

  // งบรายจ่ายรวมของเดือนนี้ (ใช้ตัวสรุปงบเดิมของแอป ถ้าอ่านไม่ได้ค่อย fallback เป็นผลรวมงบรายกลุ่ม)
  let budgetTarget = 0, budgetActual = 0;
  try{
    const bs = buildBudgetSummaryBothSides();
    budgetTarget = waNum(bs.expenseBudget && bs.expenseBudget.target);
    budgetActual = waNum(bs.expenseBudget && bs.expenseBudget.actual);
  }catch(e){}
  if(!(budgetTarget > 0)){
    budgetTarget = budgetGroups.reduce((s, g) => s + g.monthlyBudget, 0);
    budgetActual = budgetGroups.reduce((s, g) => s + g.monthSpentToDate, 0);
  }

  // Burn Rate: ยอดใช้จริงเฉลี่ยต่อวัน เทียบงบเฉลี่ยต่อวัน (ถ้าไม่ได้ตั้งงบ ใช้ค่าเฉลี่ยรายวันของเดือนก่อนเป็นฐานแทน)
  const burnPerDay = weekExpense / WEEKLY_AUDIT_DAYS;
  const dailyBudget = budgetTarget > 0 ? budgetTarget / daysInMonth : null;
  let baseline = { type: "none", dailyAmount: null };
  if(dailyBudget){
    baseline = { type: "monthly_budget", dailyAmount: dailyBudget };
  }else{
    try{
      const lm = new Date(ty, tm - 2, 1);
      const lmb = monthBoundsISO(lm.getFullYear(), lm.getMonth());
      const la = computePeriodAnalysisForRange(lmb.start, lmb.end, null);
      const lmDays = new Date(lm.getFullYear(), lm.getMonth() + 1, 0).getDate();
      if(waNum(la.expense) > 0) baseline = { type: "last_month_average", dailyAmount: waNum(la.expense) / lmDays };
    }catch(e){}
  }
  const ratio = baseline.dailyAmount > 0 ? burnPerDay / baseline.dailyAmount : null;
  const paceStatus = ratio == null ? "ไม่มีฐานเปรียบเทียบ"
    : ratio > 1.05 ? "เร็วกว่าแผน"
    : ratio < 0.95 ? "ช้ากว่าแผน (ใช้น้อยกว่าแผน)"
    : "ตามแผน";

  // เพดานเงินใช้ได้ต่อวันสำหรับ 7 วันข้างหน้า — คำนวณเองฝั่งโค้ด ให้ AI แค่นำไปสั่งการ ไม่ต้องคิดเลข
  const essentialPerDay = essentialExpense / WEEKLY_AUDIT_DAYS;
  let ceiling, basis;
  if(budgetTarget > 0){
    const remaining = budgetTarget - budgetActual;
    if(remaining > 0){
      ceiling = remaining / daysLeftAfterToday;
      basis = `งบรายจ่ายเดือนนี้คงเหลือ ${waBaht(remaining)} หารวันที่เหลือในเดือน ${daysLeftAfterToday} วัน`;
      if(dailyBudget && ceiling > dailyBudget * 1.25){
        ceiling = dailyBudget * 1.25;
        basis += " (จำกัดไม่เกิน 125% ของงบเฉลี่ยต่อวัน กันใช้พรวดช่วงปลายเดือน)";
      }
    }else{
      ceiling = essentialPerDay;
      basis = "งบรายจ่ายเดือนนี้หมดแล้ว — คุมเฉพาะรายจ่ายจำเป็นตามค่าเฉลี่ยของสัปดาห์นี้";
    }
  }else{
    ceiling = essentialPerDay + (discretionaryExpense / WEEKLY_AUDIT_DAYS) * 0.7;
    basis = "ยังไม่ได้ตั้งงบเดือนนี้ — คงรายจ่ายจำเป็นเท่าเดิม และลดรายจ่ายไม่จำเป็นลง 30% จากสัปดาห์นี้";
  }
  ceiling = Math.max(0, Math.floor(ceiling));

  // กรอบแบบยืดหยุ่น: 7 วันถัดไปมีวันธรรมดา 5 + วันหยุด 2 เสมอ ให้วันหยุดใช้ได้ ~2 เท่าของวันธรรมดา
  // เพดานบนรวมทั้งสัปดาห์ (5*วันธรรมดา + 2*วันหยุด) ไม่เกิน weeklyCeiling ที่คำนวณจากงบเหลือ
  const weeklyCeiling = ceiling * WEEKLY_AUDIT_DAYS;
  const floor10 = (n) => Math.max(0, Math.floor(n / 10) * 10);
  const weekdayMax = floor10(weeklyCeiling / 9);
  const weekendMax = weekdayMax * 2;
  const weekdayMin = floor10(weekdayMax * 0.8);
  const weekendMin = floor10(weekendMax * 0.8);

  const topTransactions = entries
    .filter(e => e && e.type === "expense" && !e.debtId && !e.loanId && e.date >= start && e.date <= today)
    .sort((a, b) => waNum(b.amount) - waNum(a.amount))
    .slice(0, 3)
    .map(e => ({ date: e.date, category: e.category, amount: waRound(e.amount), note: String(e.note || "").slice(0, 40) }));
  const transactionCount = entries.filter(e => e && (e.type === "expense" || e.type === "income") && e.date >= start && e.date <= today).length;

  const realIncome = week.nonLoanIncome != null ? waNum(week.nonLoanIncome) : waNum(week.income);
  const prevExpense = waNum(prevWeek.expense);

  return {
    generatedAt: today,
    period: { start, end: today, days: WEEKLY_AUDIT_DAYS, weekKey: waWeekKey(today), crossesMonthBoundary: start < mb.start },
    totals: {
      transactionCount,
      realIncome: waRound(realIncome),
      loanRepaymentReceived: waRound(week.loanRepaymentIncome),
      expense: waRound(weekExpense),
      essentialExpense,
      discretionaryExpense,
      essentialPct: weekExpense > 0 ? Math.round(essentialExpense / waRound(weekExpense) * 100) : null,
      discretionaryPct: weekExpense > 0 ? Math.round(discretionaryExpense / waRound(weekExpense) * 100) : null,
      oneOffPeriodicExpense: oneOffExpense,
      dailyFlexibleExpense,
      dailyFlexiblePerDay: waRound(dailyFlexibleExpense / WEEKLY_AUDIT_DAYS),
      saving: waRound(week.saving)
    },
    previousWeek: {
      expense: waRound(prevExpense),
      changePct: prevExpense > 0 ? Math.round((weekExpense - prevExpense) / prevExpense * 100) : null
    },
    categories: categories.slice(0, 8),
    topTransactions,
    burnRate: {
      perDay: waRound(burnPerDay),
      baselineType: baseline.type,
      baselineDailyAmount: baseline.dailyAmount != null ? waRound(baseline.dailyAmount) : null,
      ratioToBaseline: ratio != null ? Math.round(ratio * 100) / 100 : null,
      paceStatus
    },
    monthBudget: {
      month: mk,
      totalExpenseBudget: waRound(budgetTarget),
      spentToDate: waRound(budgetActual),
      remaining: waRound(budgetTarget - budgetActual),
      usedPct: budgetTarget > 0 ? Math.round(budgetActual / budgetTarget * 100) : null,
      daysInMonth,
      daysLeftAfterToday,
      dailyBudget: dailyBudget != null ? waRound(dailyBudget) : null
    },
    budgetGroups,
    overuseFlags,
    oneOffSettled: categories
      .filter(c => c.spendType === "one_off_periodic")
      .map(c => {
        const g = budgetGroups.find(x => x.categories.includes(c.category));
        return { category: c.category, spentThisWeek: c.amount, monthSpentToDate: waRound(monthCatSpent[c.category]), budgetPctUsed: g ? g.monthPctUsed : null, suggestCloseBudget: !!g && g.monthPctUsed >= 70 };
      }),
    nextWeekPlan: {
      weeklyCeiling,
      weekdayRangePerDay: { min: weekdayMin, max: weekdayMax },
      weekendRangePerDay: { min: weekendMin, max: weekendMax },
      avgCeilingPerDay: ceiling,
      dailyFlexibleSpentPerDayLastWeek: waRound(dailyFlexibleExpense / WEEKLY_AUDIT_DAYS),
      essentialPerDay: waRound(essentialPerDay),
      ceilingBelowEssentialRun: ceiling < waRound(essentialPerDay),
      basis
    },
    thresholds: { overusePctOfMonthlyBudget: WEEKLY_AUDIT_OVERUSE_PCT, fairWeeklySharePct: fairSharePct }
  };
}

// ตัวเลขสรุปสั้นๆ ที่ใช้โชว์บนหัว Modal (มาจาก Context ล้วน ไม่ผ่าน AI)
function waStatsFromContext(ctx){
  const p = ctx.nextWeekPlan;
  return {
    expense: ctx.totals.expense,
    burnPerDay: ctx.burnRate.perDay,
    baselineDaily: ctx.burnRate.baselineDailyAmount,
    baselineType: ctx.burnRate.baselineType,
    paceStatus: ctx.burnRate.paceStatus,
    weekday: [p.weekdayRangePerDay.min, p.weekdayRangePerDay.max],
    weekend: [p.weekendRangePerDay.min, p.weekendRangePerDay.max]
  };
}

// ===== 2) สั่งการ AI =====
function buildWeeklyAuditSystemPrompt(ctx){
  return [
    "คุณคือที่ปรึกษาการเงินส่วนตัวระดับท็อปของแอป Vaultet เขียนรายงานรอบสัปดาห์จากข้อมูลจริง 7 วันที่ผ่านมา พูดเหมือนคนที่เข้าใจชีวิตเจ้าของเงินจริงๆ ไม่ใช่บอทอ่านตาราง",
    "",
    "น้ำเสียงและภาษา:",
    "- สั้น กระชับ ตรงประเด็น เป็นมืออาชีพ ไม่ชมเพ้อเจ้อ ไม่ทักทาย ไม่เกริ่น ไม่ลงท้าย",
    "- ห้ามใช้ศัพท์ประดิษฐ์/อังกฤษแบบท่องจำ เช่น Burn rate, Pacing, Momentum, One-off, Daily Flexible ให้พูดภาษาธรรมชาติ เช่น \"สปีดการใช้เงินเฉลี่ยต่อวัน\", \"ค่าใช้จ่ายก้อนเดียวจบ\", \"ค่ากินอยู่ประจำวัน\"",
    "- ห้ามอ้างชื่อฟิลด์ใน Context",
    "- ห้ามพ่นตัวเลขซ้ำซ้อนในประโยคเดียว ให้รวบความอย่างฉลาด เช่น ถ้า discretionaryPct = 0 ให้พูดว่า \"ยอดทั้งหมดเป็นรายจ่ายจำเป็น 100% ยังไม่มีหมวดฟุ่มเฟือยหลุดมา\" แทนการไล่ยอดจำเป็น/ไม่จำเป็นทีละช่อง; ใช้ตัวเลขเฉพาะที่ช่วยให้ตัดสินใจ",
    "- ใช้เฉพาะตัวเลขใน Context ห้ามคำนวณหรือเดาตัวเลขใหม่ ถ้าไม่มีข้อมูลให้บอกสั้นๆ",
    "- totals.realIncome คือรายรับจริง (loanRepaymentReceived คือเงินที่คนคืน ไม่ใช่รายรับ)",
    "",
    "หลักคิดสำคัญ:",
    "- แยก \"ค่าใช้จ่ายก้อนเดียวจบของเดือน\" (categories[].spendType = one_off_periodic เช่น ของใช้จำเป็น ซื้อของเข้าบ้าน ดูแลตัวเอง) ออกจาก \"ค่ากินอยู่ประจำวัน\" (daily_flexible) เสมอ",
    "- ถ้าหมวดก้อนเดียวจบจ่ายไปแล้ว ห้ามเอามาเป็นตัวกดดันค่ากินอยู่รายวันของสัปดาห์หน้า ให้ถือว่าจบแล้ว และถ้า oneOffSettled[].suggestCloseBudget เป็น true ให้แนะนำให้ปิด/หยุดใช้งบหมวดนั้นไว้สำหรับเดือนนี้",
    "- spendTypeBasis = frequency แปลว่าระบบเดาประเภทจากความถี่ ให้ใช้คำว่า \"น่าจะเป็น\" ไม่ฟันธง",
    "- กรอบสัปดาห์หน้าต้องเป็นช่วง (range) ตามจังหวะชีวิตจริง ห้ามสั่งตัวเลขเดียวทื่อๆ ทุกวัน",
    "",
    "ตอบเป็น 3 หัวข้อเท่านั้น ตามลำดับ ใช้ชื่อหัวข้อนี้เป๊ะ (หัวข้อเป็นตัวหนา):",
    "**1) จังหวะและโมเมนตัมการเงิน**",
    "   2-3 บรรทัด: สปีดการใช้เงินเฉลี่ยต่อวันใน 7 วันที่ผ่านมาเร็วหรือช้ากว่าแผน (ตาม burnRate.paceStatus เทียบฐานตาม burnRate.baselineType) ตึงตัวหรือคุมได้ดี พร้อมยอดใช้รวมและการเทียบสัปดาห์ก่อนถ้าเปลี่ยนชัดเจน",
    "**2) วินิจฉัยพฤติกรรมเชิงลึก**",
    "   ไม่เกิน 3 ข้อ ขึ้นต้นด้วย \"- \": เจาะหมวดที่ใช้เยอะสุดพร้อมตัวเลขจริง ชี้ชัดว่าเป็นก้อนเดียวจบหรือค่ากินใช้สะสม และถ้ามี overuseFlags ให้บอกกลุ่มงบที่ใช้เกินสัดส่วนพร้อม % ของงบเดือน ปิดแต่ละข้อด้วยคำแนะนำตรงจุด ถ้าไม่พบจุดรั่วให้บอกสั้นๆ แล้วยังระบุหมวดอันดับ 1",
    "**3) กลยุทธ์จัดสรรสัปดาห์หน้า**",
    "   - วันธรรมดา (จันทร์-ศุกร์): nextWeekPlan.weekdayRangePerDay.min–max บาท/วัน เพื่อเซฟเงิน",
    "   - วันหยุด (เสาร์-อาทิตย์): nextWeekPlan.weekendRangePerDay.min–max บาท/วัน เผื่อให้ใช้ชีวิตพักผ่อนได้สบายใจ",
    "   บอกว่าภาพรวมทั้งสัปดาห์ต้องไม่เกิน nextWeekPlan.weeklyCeiling บาท แล้วปิดด้วยข้อควรระวังสำคัญ 1 ข้อเท่านั้น ถ้า ceilingBelowEssentialRun เป็น true ให้ข้อควรระวังนั้นเตือนตรงๆ ว่ากรอบต่ำกว่ารายจ่ายจำเป็นเฉลี่ยต่อวัน",
    "",
    "รูปแบบ: ใช้ **ตัวหนา** เฉพาะหัวข้อและตัวเลขเงินสำคัญ ห้ามตาราง ห้ามหัวข้อ markdown (#) รวมไม่เกิน 16 บรรทัด ภาษาไทย เงินใช้ ฿",
    "",
    "Context (7 วันล่าสุด ถึงวันที่ " + ctx.period.end + "):",
    JSON.stringify(ctx)
  ].join("\n");
}

// คืน { ok:true, text } หรือ { ok:false, error, detail?, status? } — รูปแบบเดียวกับ generateProactiveInsight
async function generateWeeklyAudit(ctx, signal){
  if(!aiAvailable()) return { ok:false, error:"missing_api_key" };
  const baseSystemPrompt = buildWeeklyAuditSystemPrompt(ctx);

  async function requestAudit(extraInstruction){
    let res;
    try{
      res = await fetchGeminiWithRetry(
        (apiKey) => `https://generativelanguage.googleapis.com/v1beta/models/${aiModelId()}:generateContent?key=${encodeURIComponent(apiKey)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ role:"user", parts:[{ text:"สร้างรายงาน Weekly Audit ตามกติกาใน system prompt" }] }],
            systemInstruction: { parts: [{ text: baseSystemPrompt + (extraInstruction ? "\n\n" + extraInstruction : "") }] },
            generationConfig: { temperature: 0.2, maxOutputTokens: 4096 }
          }),
          signal
        },
        1, { kind: "chat" }
      );
    }catch(e){
      if(e && e.name === "AbortError") return { ok:false, error:"aborted" };
      return { ok:false, error:"network_error" };
    }
    if(!res.ok){
      let detail = "";
      try{ detail = (await res.text()).slice(0,300); }catch(e){}
      return { ok:false, error: res.status === 400 ? "invalid_api_key" : "api_error", detail, status: res.status };
    }
    let data;
    try{ data = await res.json(); }catch(e){ return { ok:false, error:"invalid_json" }; }
    const rawText = collectGeminiText(data);
    if(!rawText) return { ok:false, error:"empty_response" };
    return { ok:true, text: cleanAiChatReply(rawText), data };
  }

  const hasAllSections = (t) => /1\)/.test(t) && /2\)/.test(t) && /3\)/.test(t);

  let result = await requestAudit("");
  if(!result.ok) return result;
  if(isUsableAiChatReply(result.text, result.data) && hasAllSections(result.text)) return { ok:true, text: result.text };

  // รอบแรกถูกตัดหรือรูปแบบไม่ครบ 3 หัวข้อ → ลองใหม่ครั้งเดียวด้วยกติกาที่เข้มขึ้น
  result = await requestAudit("คำตอบรอบก่อนไม่ครบหรือถูกตัด ให้เขียนใหม่ทั้งหมดให้ครบ 3 หัวข้อ (1) 2) 3)) ตามรูปแบบที่กำหนด สั้น กระชับ และจบอย่างสมบูรณ์ ห้ามอ้างชื่อฟิลด์ภายใน");
  if(!result.ok) return result;
  if(!isUsableAiChatReply(result.text, result.data)) return { ok:false, error:"invalid_ai_response" };
  return { ok:true, text: result.text };
}

// ===== 3) UI & Storage =====
function injectWeeklyAuditStyles(){
  if(document.getElementById("weeklyAuditStyles")) return;
  const st = document.createElement("style");
  st.id = "weeklyAuditStyles";
  st.textContent = `
#weeklyAuditHeaderBtn{position:relative}
#weeklyAuditHeaderBtn.wa-has-new::after{content:"";position:absolute;top:4px;right:4px;width:8px;height:8px;border-radius:50%;background:var(--expense,#ff6b6b)}
.wa-banner{display:none;align-items:center;gap:10px;margin:8px 12px;padding:10px 12px;border:1px solid var(--accent1,#7c8cff);border-radius:14px;font-size:13px;line-height:1.35}
body.ux-chat-active .wa-banner.show{display:flex}
.wa-banner-text{flex:1;min-width:0}
.wa-banner-open{border:0;border-radius:10px;padding:7px 12px;background:var(--accent1,#7c8cff);color:#fff;font:inherit;font-size:12px;font-weight:700;cursor:pointer;white-space:nowrap}
.wa-banner-x{border:0;background:transparent;color:var(--faint,#888);font-size:16px;cursor:pointer;padding:4px}
.wa-overlay{position:fixed;inset:0;z-index:10050;display:none;align-items:flex-end;justify-content:center;background:rgba(0,0,0,.55)}
.wa-overlay.open{display:flex}
.wa-sheet{width:100%;max-width:560px;max-height:88vh;overflow-y:auto;background:var(--surface,var(--card,var(--bg,#15171d)));color:var(--text,inherit);border-radius:20px 20px 0 0;padding:16px 16px 22px;box-shadow:0 -8px 30px rgba(0,0,0,.35)}
.wa-head{display:flex;align-items:flex-start;justify-content:space-between;gap:10px;margin-bottom:12px}
.wa-title{font-size:16px;font-weight:700}
.wa-sub{font-size:11px;color:var(--faint,#888);margin-top:3px}
.wa-close{border:0;background:transparent;color:var(--faint,#888);font-size:20px;cursor:pointer;padding:2px 6px}
.wa-stats{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:12px}
.wa-stat{padding:9px 8px;border:1px solid rgba(128,128,128,.25);border-radius:12px;text-align:center}
.wa-stat-label{font-size:10px;color:var(--faint,#888);margin-bottom:3px}
.wa-stat-value{font-size:14px;font-weight:700}
.wa-stat-note{font-size:10px;color:var(--faint,#888);margin-top:2px}
.wa-body{font-size:14px;line-height:1.6;min-height:60px}
.wa-muted{color:var(--faint,#888)}
.wa-err{color:var(--expense,#ff6b6b);font-size:12px;margin-top:10px}
.wa-stale{font-size:11px;color:var(--faint,#888);margin-top:10px}
.wa-refresh{display:block;width:100%;margin-top:14px;padding:11px 14px;border:1px solid var(--accent1,#7c8cff);border-radius:12px;background:transparent;color:var(--accent1,#7c8cff);font:inherit;font-size:13px;font-weight:600;cursor:pointer}
.wa-refresh:disabled{opacity:.5;cursor:default}
`;
  document.head.appendChild(st);
}

function ensureWeeklyAuditModal(){
  if(document.getElementById("weeklyAuditOverlay")) return;
  const ov = document.createElement("div");
  ov.id = "weeklyAuditOverlay";
  ov.className = "wa-overlay";
  ov.setAttribute("role", "dialog");
  ov.setAttribute("aria-modal", "true");
  ov.setAttribute("aria-labelledby", "weeklyAuditTitle");
  ov.innerHTML = `
    <div class="wa-sheet">
      <div class="wa-head">
        <div>
          <div class="wa-title" id="weeklyAuditTitle">รายงานรอบสัปดาห์</div>
          <div class="wa-sub" id="weeklyAuditSub"></div>
        </div>
        <button type="button" class="wa-close" id="weeklyAuditCloseBtn" aria-label="ปิด">✕</button>
      </div>
      <div class="wa-stats" id="weeklyAuditStats"></div>
      <div class="wa-body" id="weeklyAuditBody"></div>
      <button type="button" class="wa-refresh" id="weeklyAuditRefreshBtn">วิเคราะห์ใหม่</button>
    </div>`;
  document.body.appendChild(ov);
  ov.addEventListener("click", (e) => { if(e.target === ov) closeWeeklyAuditModal(); });
  document.getElementById("weeklyAuditCloseBtn").addEventListener("click", closeWeeklyAuditModal);
  document.getElementById("weeklyAuditRefreshBtn").addEventListener("click", () => { runWeeklyAudit(); });
  document.addEventListener("keydown", (e) => {
    if(e.key === "Escape" && ov.classList.contains("open")) closeWeeklyAuditModal();
  });
}

function waStatsHtml(s){
  const baseLabel = s.baselineType === "monthly_budget" ? "งบ"
    : s.baselineType === "last_month_average" ? "เดือนก่อนเฉลี่ย" : "";
  const baseNote = (baseLabel && s.baselineDaily != null) ? `${baseLabel} ${waBaht(s.baselineDaily)}/วัน` : "ไม่มีฐานเทียบ";
  return `
    <div class="wa-stat"><div class="wa-stat-label">ใช้รวม 7 วัน</div><div class="wa-stat-value">${waBaht(s.expense)}</div></div>
    <div class="wa-stat"><div class="wa-stat-label">เฉลี่ย/วัน</div><div class="wa-stat-value">${waBaht(s.burnPerDay)}</div><div class="wa-stat-note">${escapeHtml(baseNote)}</div></div>
    <div class="wa-stat"><div class="wa-stat-label">กรอบสัปดาห์หน้า</div><div class="wa-stat-value">${s.weekday ? `฿${fmt(s.weekday[0])}–${fmt(s.weekday[1])}` : "-"}</div><div class="wa-stat-note">${s.weekend ? `หยุด ฿${fmt(s.weekend[0])}–${fmt(s.weekend[1])}` : ""}</div></div>`;
}

// status: loading | ready | error | needsApiKey | empty
function waRenderView(v){
  const body = document.getElementById("weeklyAuditBody");
  if(!body) return;
  const statsEl = document.getElementById("weeklyAuditStats");
  const subEl = document.getElementById("weeklyAuditSub");
  const refreshBtn = document.getElementById("weeklyAuditRefreshBtn");

  const rec = v.record || v.cache || null;
  let stats = v.stats || null;
  if(rec && rec.stats && (v.status === "ready" || v.status === "error" || v.status === "needsApiKey")) stats = rec.stats;
  statsEl.innerHTML = stats ? waStatsHtml(stats) : "";
  statsEl.style.display = stats ? "grid" : "none";
  subEl.textContent = rec
    ? `ข้อมูล ${waShortDate(rec.rangeStart)}–${waShortDate(rec.rangeEnd)} · วิเคราะห์เมื่อ ${waShortDate(rec.generatedAt)}`
    : (v.meta || "");
  refreshBtn.disabled = v.status === "loading";

  if(v.status === "loading"){
    body.innerHTML = `<span class="wa-muted">กำลังวิเคราะห์ข้อมูล 7 วันล่าสุด...</span>`;
  }else if(v.status === "empty"){
    body.innerHTML = `<span class="wa-muted">ยังไม่มีรายการรายรับ/รายจ่ายใน 7 วันที่ผ่านมา เลยยังไม่มีอะไรให้ตรวจ</span>`;
  }else if(v.status === "needsApiKey"){
    body.innerHTML = (rec ? simpleMarkdownToHtml(rec.text) + "<br><br>" : "")
      + `<span class="wa-muted">ตั้งค่า API Key ก่อน เพื่อให้ AI วิเคราะห์รอบใหม่ได้</span>`;
  }else if(v.status === "error"){
    const r = v.result || {};
    const codeLine = r.error ? ` (โค้ด: ${escapeHtml(r.error)}${r.status ? " HTTP " + r.status : ""})` : "";
    body.innerHTML = (rec ? simpleMarkdownToHtml(rec.text) + `<div class="wa-stale">นี่คือรายงานรอบก่อน (${escapeHtml(waShortDate(rec.generatedAt))}) — รอบใหม่ยังไม่สำเร็จ</div>` : "")
      + `<div class="wa-err">${escapeHtml(aiErrorLabel(r))}${codeLine}</div>`;
  }else{
    body.innerHTML = simpleMarkdownToHtml(rec ? rec.text : "");
  }
}

function openWeeklyAuditModal(){
  injectWeeklyAuditStyles();
  ensureWeeklyAuditModal();
  document.getElementById("weeklyAuditOverlay").classList.add("open");
  const cache = loadWeeklyAuditCache();
  // มีผลของสัปดาห์นี้อยู่แล้ว → โชว์จากแคชเลย ไม่ยิง API ใหม่ (ผู้ใช้กด "วิเคราะห์ใหม่" เองได้)
  if(cache && cache.weekKey === waWeekKey(todayISO())){
    waRenderView({ status:"ready", record:cache });
    return;
  }
  runWeeklyAudit();
}
function closeWeeklyAuditModal(){
  document.getElementById("weeklyAuditOverlay")?.classList.remove("open");
}

async function runWeeklyAudit(){
  if(weeklyAuditBusy) return;
  const cache = loadWeeklyAuditCache();
  let ctx;
  try{ ctx = buildWeeklyAuditContext(); }
  catch(e){
    console.error(e);
    waRenderView({ status:"error", cache, result:{ error:"context_error" } });
    return;
  }
  const stats = waStatsFromContext(ctx);

  if(ctx.totals.transactionCount === 0){ waRenderView({ status:"empty", stats }); return; }
  if(!aiAvailable()){ waRenderView({ status:"needsApiKey", stats, cache }); return; }

  weeklyAuditBusy = true;
  waRenderView({ status:"loading", stats, meta:`ข้อมูล ${waShortDate(ctx.period.start)}–${waShortDate(ctx.period.end)}` });
  let result;
  try{ result = await generateWeeklyAudit(ctx); }
  catch(e){ result = { ok:false, error:"network_error" }; }
  weeklyAuditBusy = false;

  if(!result.ok){ waRenderView({ status:"error", stats, cache, result }); return; }

  const record = {
    text: result.text,
    generatedAt: todayISO(),
    generatedAtTs: Date.now(),
    ver: WEEKLY_AUDIT_VERSION,
    weekKey: ctx.period.weekKey,
    rangeStart: ctx.period.start,
    rangeEnd: ctx.period.end,
    stats
  };
  saveWeeklyAuditCache(record);
  waRenderView({ status:"ready", record });
  refreshWeeklyAuditBanner();
}

// แบนเนอร์ชวนดูรายงาน: แสดงเมื่อเป็นสัปดาห์ใหม่ที่ยังไม่ได้ Audit และมีรายการใน 7 วันล่าสุดให้ตรวจ
function shouldShowWeeklyAuditBanner(){
  const weekKey = waWeekKey(todayISO());
  const cache = loadWeeklyAuditCache();
  if(cache && cache.weekKey === weekKey) return false;
  try{ if(sessionStorage.getItem(WEEKLY_AUDIT_DISMISS_KEY) === weekKey) return false; }catch(e){}
  const start = isoDaysFromToday(-(WEEKLY_AUDIT_DAYS - 1)), today = todayISO();
  return entries.some(e => e && (e.type === "expense" || e.type === "income") && e.date >= start && e.date <= today);
}
function refreshWeeklyAuditBanner(){
  const show = shouldShowWeeklyAuditBanner();
  const banner = document.getElementById("weeklyAuditBanner");
  if(banner) banner.classList.toggle("show", show);
  const btn = document.getElementById("weeklyAuditHeaderBtn");
  if(btn) btn.classList.toggle("wa-has-new", show);
}

// เสียบปุ่ม/แบนเนอร์เข้าหน้าจอที่มีอยู่ (ไม่แก้ HTML เดิม) — ถ้าหา anchor ไม่เจอจะข้ามเงียบๆ ไม่ทำให้แอปพัง
function mountWeeklyAuditEntryPoints(){
  // เก็บกวาดของเวอร์ชันก่อน: ปุ่มแคปซูลกลางจอเลิกใช้แล้ว
  document.getElementById("weeklyAuditBtn")?.remove();

  // ปุ่มไอคอน 📊 บน Header ขวาบนของแท็บที่ปรึกษา AI (วางข้างปุ่มประวัติแชท/ตั้งค่า AI)
  if(!document.getElementById("weeklyAuditHeaderBtn")){
    const anchor = document.getElementById("aiChatHistoryBtn") || document.getElementById("aiAdvisorSettingsBtn");
    if(anchor){
      const btn = document.createElement("button");
      btn.type = "button";
      btn.id = "weeklyAuditHeaderBtn";
      btn.className = "icon-btn ai-icon-btn";
      btn.title = "รายงานรอบสัปดาห์";
      btn.setAttribute("aria-label", "รายงานรอบสัปดาห์");
      btn.innerHTML = vaultetIcon("📊");
      btn.addEventListener("click", (e) => { e.stopPropagation(); openWeeklyAuditModal(); });
      anchor.insertAdjacentElement("beforebegin", btn);
    }
  }

  // แบนเนอร์สัปดาห์ใหม่: อยู่ในแท็บที่ปรึกษา AI เท่านั้น (ห้ามแตะหน้าภาพรวม) — CSS ซ่อนเมื่อ body ไม่มี ux-chat-active
  if(!document.getElementById("weeklyAuditBanner")){
    const panel = document.getElementById("aiAdvisorSettingsPanel");
    const chatBody = document.getElementById("aiAnalystBody");
    if(panel || chatBody){
      const banner = document.createElement("div");
      banner.id = "weeklyAuditBanner";
      banner.className = "wa-banner";
      banner.innerHTML = `
        <span aria-hidden="true">${vaultetIcon("📊")}</span>
        <div class="wa-banner-text">สัปดาห์ใหม่แล้ว — ดูรายงานสุขภาพการเงินรอบ 7 วันที่ผ่านมา</div>
        <button type="button" class="wa-banner-open" id="weeklyAuditBannerOpenBtn">ดูรายงาน</button>
        <button type="button" class="wa-banner-x" id="weeklyAuditBannerDismissBtn" aria-label="ปิดแจ้งเตือน">✕</button>`;
      if(panel) panel.insertAdjacentElement("afterend", banner);
      else chatBody.insertAdjacentElement("beforebegin", banner);
      document.getElementById("weeklyAuditBannerOpenBtn").addEventListener("click", openWeeklyAuditModal);
      document.getElementById("weeklyAuditBannerDismissBtn").addEventListener("click", () => {
        try{ sessionStorage.setItem(WEEKLY_AUDIT_DISMISS_KEY, waWeekKey(todayISO())); }catch(e){}
        refreshWeeklyAuditBanner();
      });
    }
  }
}

function initWeeklyAudit(){
  injectWeeklyAuditStyles();
  ensureWeeklyAuditModal();
  mountWeeklyAuditEntryPoints();
  refreshWeeklyAuditBanner();
  // เปิดแอปค้างข้ามวัน/ข้ามสัปดาห์ → เช็คแบนเนอร์ใหม่ตอนกลับมาที่แท็บ
  document.addEventListener("visibilitychange", () => { if(!document.hidden) refreshWeeklyAuditBanner(); });
}
window.openWeeklyAudit = openWeeklyAuditModal;
