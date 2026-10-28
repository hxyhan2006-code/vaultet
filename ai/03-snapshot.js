// Vaultet — ai/03-snapshot.js : สรุปการเงินที่ส่งให้ AI, สรุปให้แอป Twin, ชั้นที่ปรึกษาการเงิน
// (แยกจาก ai.js เดิม — โหลดเรียงตามเลขไฟล์ ทุกไฟล์ใช้ตัวแปร/ฟังก์ชันร่วมกันแบบ global)
// ===== AI Layer (Milestone 2): Deterministic Financial Snapshot =====
// ฟังก์ชัน Pure — ไม่แตะ DOM/localStorage ใดๆ คำนวณจากข้อมูลปัจจุบันแล้วคืนตัวเลขที่ผ่านการคำนวณแล้วเท่านั้น
// ห้ามส่ง raw entries ทั้งหมดให้ AI — ส่งเฉพาะ Snapshot นี้
// หมายเหตุ: เรียก computePeriodAnalysisForRange() ตรงๆ กำหนดช่วงวันเองจาก monthBoundsISO() แทนการเรียก
// computePeriodAnalysis()/getTotals() ที่ผูกกับ Global State (analysisPreset/selectedMonth) เพื่อกันปัญหา
// Snapshot ไปติดอยู่กับตัวกรองที่ผู้ใช้เผลอตั้งไว้บนหน้าจอ
// รวมงบ 2 ฝั่งให้ AI เห็นชัด: รายจ่าย (expense) + รายออม (saving) ของเดือนปัจจุบัน
// คงฟิลด์เดิมจาก getBudgetFindingData() (overCount/watchCount ฯลฯ) ไว้เพื่อไม่ให้ส่วนอื่นที่อ่าน budgetSummary พัง
function summarizeBudgetSide(raw){
  const toNum = v => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
  const list = Array.isArray(raw) ? raw
    : Array.isArray(raw?.items) ? raw.items
    : Array.isArray(raw?.budgets) ? raw.budgets
    : Array.isArray(raw?.list) ? raw.list
    : Array.isArray(raw?.rows) ? raw.rows
    : [];
  const pick = (o, keys) => { for(const k of keys){ if(o && o[k] != null && Number.isFinite(Number(o[k]))) return Number(o[k]); } return null; };
  const topBudget = pick(raw, ["totalBudget","budgetTotal","totalLimit","totalAmount","budget","limit","target","amount"]);
  const topSpent  = pick(raw, ["totalSpent","spentTotal","totalActual","totalUsed","spent","actual","used","total"]);
  const listBudget = list.reduce((a,b) => a + toNum(pick(b, ["amount","budget","limit","target"])), 0);
  const listSpent  = list.reduce((a,b) => a + toNum(pick(b, ["spent","actual","used","total"])), 0);
  const target = topBudget != null ? topBudget : listBudget;
  const actual = topSpent != null ? topSpent : listSpent;
  return { target, actual, remaining: target - actual, pct: target > 0 ? Math.round(actual / target * 100) : 0, count: list.length, detail: raw || null };
}
function buildBudgetSummaryBothSides(){
  const mk = monthKey(todayISO());
  let legacy = {};
  try { legacy = getBudgetFindingData() || {}; } catch(e) { legacy = {}; }
  let expenseRaw = null, savingRaw = null;
  try { expenseRaw = computeBudgetSummary(mk, "expense"); } catch(e) { expenseRaw = null; }
  try { savingRaw = computeBudgetSummary(mk, "saving"); } catch(e) { savingRaw = null; }
  const expense = summarizeBudgetSide(expenseRaw);
  const saving = summarizeBudgetSide(savingRaw);
  const pickSide = s => ({ target: s.target, actual: s.actual, remaining: s.remaining, pct: s.pct, count: s.count });
  const savingSentence = saving.target > 0
    ? `งบรายออม (เป้าออมรายเดือน) เดือนนี้: เป้า ฿${saving.target} ออมไปแล้ว ฿${saving.actual} (${saving.pct}%) เหลืออีก ฿${Math.max(0, saving.remaining)}`
    : "งบรายออม (เป้าออมรายเดือน) เดือนนี้: ผู้ใช้ยังไม่ได้ตั้งเป้า";
  const expenseSentence = expense.target > 0
    ? `งบรายจ่ายเดือนนี้: งบ ฿${expense.target} ใช้ไปแล้ว ฿${expense.actual} (${expense.pct}%) เหลือ ฿${Math.max(0, expense.remaining)}`
    : "งบรายจ่ายเดือนนี้: ผู้ใช้ยังไม่ได้ตั้งงบ";
  return {
    budgetOverview: `${savingSentence} | ${expenseSentence}`,
    expenseBudget: pickSide(expense),
    savingBudget: pickSide(saving),
    ...legacy,
    month: mk,
    expense: { ...expense, label: "งบรายจ่าย (เดือนนี้)" },
    saving: { ...saving, label: "งบรายออม (เดือนนี้)" },
    savingOverview: saving.target > 0
      ? `เดือนนี้ผู้ใช้ตั้งเป้าออม ฿${saving.target} ออมไปแล้ว ฿${saving.actual} (${saving.pct}%) เหลืออีก ฿${Math.max(0, saving.remaining)}`
      : "เดือนนี้ผู้ใช้ยังไม่ได้ตั้งงบรายออม",
  };
}

// เป้าหมายเก็บเงิน (หน้าแผน) สำหรับส่งให้ AI — เดิมโค้ดอ่านตัวแปร goals ที่ไม่มีอยู่จริง เลยส่งรายการว่างเสมอ
function getGoalsForAI(){
  try{
    const g=JSON.parse(localStorage.getItem("vaultet_goals_v1")||"[]");
    if(!Array.isArray(g)) return [];
    const today=new Date(); today.setHours(0,0,0,0);
    return g.filter(x=>x&&x.name).map(x=>{
      const target=Number(x.target)||0, saved=goalSaved(x), remaining=Math.max(0,target-saved);
      const o={ name:String(x.name), targetAmount:target, saved, remaining, progressPct:target>0?Math.min(100,Math.round(saved/target*100)):null };
      if(x.deadline){ o.deadline=x.deadline; const d=Math.ceil((new Date(x.deadline+"T00:00:00")-today)/86400000); if(isFinite(d)) o.daysLeft=d; }
      return o;
    });
  }catch(e){ return []; }
}
// สรุปรายเดือนย้อนหลัง 6 เดือนที่ครบแล้ว แยกหมวดรายจ่าย (ย่อ: 8 หมวดแรกต่อเดือน) — ให้ AI ตอบเรื่องแนวโน้มได้โดยไม่ต้องส่งรายการดิบ
function buildMonthlyHistory(n){
  const out=[], now=new Date();
  for(let i=1;i<=n;i++){
    const d=new Date(now.getFullYear(),now.getMonth()-i,1), b=monthBoundsISO(d.getFullYear(),d.getMonth());
    const a=computePeriodAnalysisForRange(b.start,b.end,null);
    if(!a.count) continue;
    const cats={}; (a.breakdown||[]).slice(0,8).forEach(r=>{ cats[r.cat]=r.amount; });
    out.push({ month:b.start.slice(0,7), income:a.income, expense:a.expense, saving:a.saving, netCashFlow:a.netCashFlow, expenseByCategory:cats });
  }
  return out;
}

function buildFinancialSnapshot(){
  const today = todayISO();
  const now = new Date();

  const thisMonthBounds = monthBoundsISO(now.getFullYear(), now.getMonth());
  const lastMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lastMonthBounds = monthBoundsISO(lastMonthDate.getFullYear(), lastMonthDate.getMonth());

  const thisMonthAnalysis = computePeriodAnalysisForRange(thisMonthBounds.start, thisMonthBounds.end, null);
  const lastMonthAnalysis = computePeriodAnalysisForRange(lastMonthBounds.start, lastMonthBounds.end, null);

  const top5 = (analysis) => analysis.breakdown.slice(0, 5).map(r => ({ category: r.cat, amount: r.amount, pct: r.pct }));

  const totalMoney = getTotalMoneyAllAccounts();
  const reserved = getTotalReserved();
  const receivables = getTotalReceivablesOutstanding();

  // จำนวนวันที่เหลือจริงถึงสิ้นเดือน (รวมวันนี้) — ถ้าวันนี้เลยสิ้นเดือนไปแล้ว (ไม่ควรเกิดขึ้น) กันขั้นต่ำไว้ที่ 1 วัน
  const daysRemainingInMonth = Math.max(1, daysBetweenInclusive(today, thisMonthBounds.end));
  const forecastToMonthEnd = computeForecast(daysRemainingInMonth);
  const forecast30d = computeForecast(30);

  const cashByAccount = accounts.map(a => ({ id:a.id, name:a.name, balance:computeAccountBalance(a.id) }));
  const budgetBoth = buildBudgetSummaryBothSides();
  const snapshot = {
    generatedAt: today,
    budgetOverview: budgetBoth.budgetOverview,
    expenseBudget: budgetBoth.expenseBudget,
    savingBudget: budgetBoth.savingBudget,
    netWorth: {
      totalMoneyAllAccounts: totalMoney,
      reserved: reserved,
      available: totalMoney - reserved,
      receivablesOutstanding: receivables,
      savedTotal: getTotalSaved(),
      emergencySaved: getEmergencySaved(),
      liabilities: getTotalDebts(),
    },
    cash: { total:totalMoney, available:totalMoney-reserved, byAccount:cashByAccount },
    incomeContext: {
      total:thisMonthAnalysis.income,
      loanRepayment:thisMonthAnalysis.loanRepaymentIncome,
      nonLoanIncome:thisMonthAnalysis.nonLoanIncome,
      note:"loanRepayment เป็นการเปลี่ยน receivable กลับเป็น cash ไม่ใช่ earned income"
    },
    thisMonth: {
      range: thisMonthBounds,
      income: thisMonthAnalysis.income,
      loanRepaymentIncome: thisMonthAnalysis.loanRepaymentIncome,
      nonLoanIncome: thisMonthAnalysis.nonLoanIncome,
      expense: thisMonthAnalysis.expense,
      saving: thisMonthAnalysis.saving,
      netCashFlow: thisMonthAnalysis.netCashFlow,
      transactionCount: thisMonthAnalysis.count,
      topExpenseCategories: top5(thisMonthAnalysis),
    },
    lastMonth: {
      range: lastMonthBounds,
      income: lastMonthAnalysis.income,
      expense: lastMonthAnalysis.expense,
      saving: lastMonthAnalysis.saving,
      netCashFlow: lastMonthAnalysis.netCashFlow,
      transactionCount: lastMonthAnalysis.count,
      topExpenseCategories: top5(lastMonthAnalysis),
      // Milestone 4 fix: breakdown เต็มทุกหมวด (ไม่ตัดเหลือ Top 5) ใช้เทียบใน Rule B ของ evaluateProactiveRules()
      // เพื่อไม่ให้หมวดอันดับ 6 ลงไปถูกมองเป็น ฿0 อย่างผิดๆ (False Alarm)
      expenseBreakdownFull: lastMonthAnalysis.breakdown.map(r => ({ category: r.cat, amount: r.amount, pct: r.pct })),
    },
    monthComparison: {
      incomeChange: thisMonthAnalysis.income - lastMonthAnalysis.income,
      expenseChange: thisMonthAnalysis.expense - lastMonthAnalysis.expense,
      savingChange: thisMonthAnalysis.saving - lastMonthAnalysis.saving,
      netCashFlowChange: thisMonthAnalysis.netCashFlow - lastMonthAnalysis.netCashFlow,
    },
    upcoming: getUpcomingSummary(),
    forecastToMonthEnd: {
      daysRemaining: daysRemainingInMonth,
      currentTotalMoney: forecastToMonthEnd.current,
      reserved: forecastToMonthEnd.reserved,
      upcomingPayments: forecastToMonthEnd.upcoming,
      forecastTotalMoney: forecastToMonthEnd.forecast,
      forecastAvailable: forecastToMonthEnd.forecastAvailable,
    },
    forecast30d: {
      currentTotalMoney: forecast30d.current,
      reserved: forecast30d.reserved,
      upcomingPayments: forecast30d.upcoming,
      forecastTotalMoney: forecast30d.forecast,
      forecastAvailable: forecast30d.forecastAvailable,
    },
    // Milestone 5: หนี้สิน — ตั้งใจไม่รวมใน forecastToMonthEnd/forecast30d ด้านบน (ยังไม่ตัดเงินสด)
    debts: {
      totalDebt: getTotalDebts(),
      list: debts.map(d => ({ name: d.name, outstandingBalance: d.outstandingBalance, gracePeriod: !!d.gracePeriod })),
    },
    budgetSummary: budgetBoth,
    emergencyFund: computeEmergencyFund(),
    recurringExpenses: { monthlyEstimated:computeMonthlyRecurringCost(), upcoming:getUpcomingSummary() },
    goals: getGoalsForAI(),
    portfolio: (window.vaultetPortfolioForAI && window.vaultetPortfolioForAI()) || null,
    monthlyHistory: buildMonthlyHistory(6),
  };
  // Round 12: normalized intelligence context. Keep calculations deterministic and local;
  // the LLM receives this structured result instead of reconstructing finance from raw entries.
  snapshot.advisorContext = buildAdvisorContext(snapshot);
  snapshot.behaviorSummary = computeFinancialBehavior(snapshot);
  snapshot.financialBrain = computeFinancialHealth(snapshot);
  snapshot.advisorContext = buildAdvisorContext(snapshot);
  return snapshot;
}

// ===== สรุปการเงินให้แอป Twin อ่าน (อ่านอย่างเดียว) =====
// Twin เป็นเว็บแอปของ Han บนโดเมนเดียวกัน จึงอ่าน localStorage ตัวนี้ได้ ไม่ต้องมีเซิร์ฟเวอร์
// เขียนตอนเปิดแอปและตอนออกจากแอป ใช้ตัวเลขจาก buildFinancialSnapshot() ที่ทดสอบแล้ว (ไม่ให้ Twin คำนวณเอง)
// ส่งเฉพาะภาพรวม: ยอดรวม หนี้ งบ เป้าหมาย รายจ่ายหลัก ไม่มีรายการทีละรายการและไม่มีชื่อบัญชี
function buildTwinSnapshot(){
  const s = buildFinancialSnapshot();
  // ค่ารวมที่หน้าหลักโชว์ (สินทรัพย์รวม / มูลค่าสุทธิ / พอร์ตหุ้น) ใช้สูตรเดียวกับหน้าจอ ไม่ให้ Twin คำนวณเอง
  const A = vaultetAssets();
  const totals = { assets:A.assets, stock:A.stock, netWorthValue:vaultetNetWorth() };
  const month = (m, withTop) => ({ income:m.income, expense:m.expense, saving:m.saving, netCashFlow:m.netCashFlow, ...(withTop ? { topExpenseCategories:m.topExpenseCategories } : {}) });
  return {
    asOfDate: s.generatedAt,
    netWorth: s.netWorth,
    totals,
    thisMonth: month(s.thisMonth, true),
    lastMonth: month(s.lastMonth, true),
    forecastToMonthEnd: s.forecastToMonthEnd,
    debts: s.debts,
    budgetOverview: s.budgetOverview,
    emergencyFund: s.emergencyFund,
    recurringMonthlyEstimated: s.recurringExpenses && s.recurringExpenses.monthlyEstimated,
    goals: s.goals,
  };
}
function publishTwinSnapshot(){
  try{ localStorage.setItem(VAULTET_TWIN_SNAPSHOT_KEY, JSON.stringify({ v:1, at:Date.now(), data:buildTwinSnapshot() })); }catch(e){}
}
window.addEventListener("load", publishTwinSnapshot);
document.addEventListener("visibilitychange", () => { if(document.visibilityState === "hidden") publishTwinSnapshot(); });

// ===== Round 12: Financial Advisor Intelligence Layer =====
// Lightweight decision-support only — not a validated financial-health score.
function buildAdvisorHistoricalBaseline(snapshot){
  const now=new Date();
  const completed=[];
  for(let i=1;i<=3;i++){
    const d=new Date(now.getFullYear(),now.getMonth()-i,1);
    const b=monthBoundsISO(d.getFullYear(),d.getMonth());
    const a=computePeriodAnalysisForRange(b.start,b.end,null);
    completed.push({range:b,income:Number(a.income||0),expense:Number(a.expense||0),saving:Number(a.saving||0),netCashFlow:Number(a.netCashFlow||0),breakdown:(a.breakdown||[]).map(r=>({category:r.cat,amount:Number(r.amount||0),count:Number(r.count||0)})),transactionCount:Number(a.count||0)});
  }
  const usable=completed.filter(x=>x.transactionCount>=3 || x.income>0 || x.expense>0);
  const avg=(key)=>usable.length?usable.reduce((s,x)=>s+x[key],0)/usable.length:null;
  const catMap={};
  usable.forEach(m=>m.breakdown.forEach(r=>{if(!catMap[r.category])catMap[r.category]=[];catMap[r.category].push(r.amount);}));
  const categoryBaseline=Object.entries(catMap).map(([category,values])=>({category,months:values.length,average:values.reduce((a,b)=>a+b,0)/values.length}));
  return {monthsConsidered:usable.length,requiredForStrongBaseline:2,monthlyAverage:{income:avg('income'),expense:avg('expense'),saving:avg('saving'),netCashFlow:avg('netCashFlow')},categoryBaseline};
}

function buildAdvisorContext(snapshot){
  const baseline=buildAdvisorHistoricalBaseline(snapshot);
  const expenseDays=Math.max(1,Number(snapshot.behaviorSummary?.spendingDaysElapsed||new Date().getDate()));
  const avgDaily=Number(snapshot.behaviorSummary?.averageDailyExpense||0);
  const available=Number(snapshot.cash?.available||0);
  const runwayDays=avgDaily>0?available/avgDaily:null;
  const forecast=snapshot.forecastToMonthEnd||{};
  return {
    baseline,
    cashRunway:{estimatedDays:runwayDays,assumption:`ใช้ค่าใช้จ่ายเฉลี่ยต่อวันของเดือนปัจจุบันจาก ${expenseDays} วันที่ผ่านไป`,availableCash:available},
    forecast:{monthEndAvailable:forecast.forecastAvailable,thirtyDayAvailable:snapshot.forecast30d?.forecastAvailable,assumption:'หักเฉพาะ recurring/upcoming expenses ที่ระบบรู้จัก ยังไม่สมมติรายรับในอนาคต'},
    incomeClassification:{regularOrNonLoan:Number(snapshot.incomeContext?.nonLoanIncome||0),loanRepayment:Number(snapshot.incomeContext?.loanRepayment||0),rule:'loan repayment ไม่ใช่ earned/regular income และ transfers/savings are not income'},
    dataQuality:{historicalMonths:baseline.monthsConsidered,hasStrongBaseline:baseline.monthsConsidered>=2}
  };
}

function advisorFinding(id,severity,urgency,impact,confidence,evidence,action,stateKey,state='new',extra={}){
  const score=Math.round((severity*urgency*impact*confidence)*100)/100;
  return {id,severity,urgency,impact,confidence,evidence,action,stateKey,state,priorityScore:score,...extra};
}
function advisorSeverity(n){return n>=4?'critical':n>=3?'important':n>=2?'watch':'info';}

function buildAdvisorFindings(snapshot,profile){
  const out=[]; const b=snapshot.behaviorSummary||{}, c=snapshot.cash||{}, fc=snapshot.forecastToMonthEnd||{}, base=snapshot.advisorContext?.baseline||{};
  const available=Number(c.available||0);
  // Liquidity: only strong when the model has a real forward obligation/forecast signal.
  if(Number(fc.forecastAvailable)<0){
    out.push(advisorFinding('LIQUIDITY_FORECAST','critical',4,4,0.98,[`forecastAvailable=${fc.forecastAvailable}`,`upcoming=${fc.upcoming}`],'ชะลอรายจ่ายที่ไม่จำเป็นและตรวจสอบภาระที่กำลังจะถึงก่อนรายรับครั้งถัดไป','liquidity|forecast-negative','new'));
  }
  const minReserve=Number(profile?.minReserveTarget||0);
  const reserveHeld=available+Number(snapshot.netWorth?.emergencySaved||0); // เงินสดที่ใช้ได้ + เงินสำรองที่ออมไว้
  if(minReserve>0 && reserveHeld<minReserve){
    const ratio=minReserve>0?available/minReserve:1;
    out.push(advisorFinding('MIN_BUFFER','critical',4,3,0.95,[`available=${reserveHeld}`,`minReserveTarget=${minReserve}`],'รักษาเงินกันชนขั้นต่ำและเลื่อนรายจ่ายที่ไม่จำเป็นหากทำได้','liquidity|min-buffer','new',{data:{available:reserveHeld,target:minReserve,shortfall:minReserve-reserveHeld}}));
  }
  // Upcoming obligations: use the existing recurring engine and only surface material shortfall.
  const upcomingOccurrences=typeof getUpcomingOccurrences==='function' ? getUpcomingOccurrences('7d') : [];
  upcomingOccurrences.slice(0,20).forEach(o=>{
    const amount=Number(o.r?.amount ?? o.amount ?? 0);
    if(amount<=0)return;
    const record=o.r||o; const link=typeof getReservedLinkInfo==='function' ? getReservedLinkInfo(record) : null; const shortfall=link?Number(link.shortfall||0):amount;
    const status=o.status||record.status||'';
    if(shortfall>0 && (status==='overdue'||status==='dueToday')){
      const name=record.name||record.title||'รายการ'; const due=record.nextDueDate||record.date||'';
      out.push(advisorFinding('OBLIGATION_SHORTFALL','critical',4,4,0.94,[`name=${name}`,`amount=${amount}`,`shortfall=${shortfall}`,`status=${status}`],'จัดลำดับภาระนี้ก่อนรายจ่าย discretionary และกันเงินตามจำนวนที่ขาด','obligation|'+name+'|'+due,'new',{data:{name,amount,shortfall,status,nextDueDate:due}}));
    }
  });
  // Spending baseline: require >=2 completed months and meaningful transaction history.
  const currentExpense=Number(snapshot.thisMonth?.expense||0), avgExpense=Number(base.monthlyAverage?.expense||0);
  const elapsedDays=Math.max(1,new Date().getDate());
  const daysInMonth=new Date(new Date().getFullYear(),new Date().getMonth()+1,0).getDate();
  const projectedExpense=elapsedDays>=7 ? currentExpense/elapsedDays*daysInMonth : null;
  if(base.monthsConsidered>=2 && avgExpense>0 && projectedExpense!=null && projectedExpense>=avgExpense*1.25 && projectedExpense-avgExpense>=500){
    const pct=((projectedExpense-avgExpense)/avgExpense)*100;
    const confidence=Math.min(0.95,0.65+(elapsedDays/30)*0.3);
    out.push(advisorFinding('SPENDING_ABOVE_BASELINE','important',2,3,confidence,[`monthToDate=${currentExpense}`,`projectedMonthEnd=${projectedExpense}`,`baseline=${avgExpense}`,`differencePct=${pct}`,`baselineMonths=${base.monthsConsidered}`],'ทบทวนหมวดที่เร่งตัวขึ้นและตั้งเพดาน discretionary ที่เหมาะกับเงินคงเหลือ','spending|overall','new',{data:{currentExpense,baseline:avgExpense,projectedExpense,pct,elapsedDays}}));
  }
  // Category-level meaningful deviations, with a minimum absolute amount to avoid tiny noise.
  if(base.monthsConsidered>=2){
    const currentMap=Object.fromEntries((snapshot.thisMonth?.topExpenseCategories||[]).map(x=>[x.category,Number(x.amount||0)]));
    base.categoryBaseline.forEach(r=>{
      const cur=currentMap[r.category]||0;
      const expectedToDate=r.average*elapsedDays/daysInMonth;
      const projected=elapsedDays>=7 ? cur/elapsedDays*daysInMonth : null;
      if(projected!=null&&r.average>0&&projected>=r.average*1.3&&projected-r.average>=300){
        out.push(advisorFinding('CATEGORY_SPIKE','important',2,2,Math.min(0.93,0.65+(elapsedDays/30)*0.3),[`category=${r.category}`,`monthToDate=${cur}`,`projectedMonthEnd=${projected}`,`baseline=${r.average}`,`expectedToDate=${expectedToDate}`,`months=${r.months}`],`พิจารณาคุมหมวด ${r.category} ให้อยู่ใกล้ระดับปกติในช่วงที่เหลือของเดือน`,`spending|category|${r.category}`,'new',{data:{category:r.category,current:cur,baseline:r.average,projected,pct:((projected-r.average)/r.average)*100,months:r.months}}));
      }
    });
  }
  const saving=Number(snapshot.thisMonth?.saving||0), income=Number(snapshot.incomeContext?.nonLoanIncome||0);
  if(income>0 && saving/income<0.1){
    out.push(advisorFinding('SAVINGS_PACE','important',2,2,0.9,[`regularIncome=${income}`,`saving=${saving}`,`savingsRate=${saving/income}`],'ถ้ากระแสเงินสดยังรองรับ ลองกันเงินออมเพิ่มตามจำนวนที่ไม่ทำให้ buffer ต่ำกว่าระดับปลอดภัย','savings|rate','new',{data:{saving,income,savingsRate:saving/income*100}}));
  }
  if(base.monthsConsidered>=2 && base.monthlyAverage.income>0 && income<base.monthlyAverage.income*0.8){
    out.push(advisorFinding('INCOME_BELOW_BASELINE','important',3,3,0.88,[`current=${income}`,`baseline=${base.monthlyAverage.income}`,`months=${base.monthsConsidered}`],'เผื่อ cash buffer มากขึ้นจนกว่าจะเห็นว่ารายรับกลับสู่ระดับปกติ','income|below-baseline','new',{data:{current:income,baseline:base.monthlyAverage.income,pct:((income-base.monthlyAverage.income)/base.monthlyAverage.income)*100}}));
  }
  // Positive state only when there is genuinely nothing important to act on.
  if(!out.length){
    out.push(advisorFinding('STABLE','info',1,1,Math.min(1,base.monthsConsidered>=2?0.95:0.65),['no material critical/important findings'],'ยังไม่มีสิ่งที่ต้องลงมือทำเป็นพิเศษ — รักษาแผนปัจจุบันและทบทวนอีกครั้งเมื่อมีข้อมูลใหม่','global|stable','new',{data:{baselineMonths:base.monthsConsidered}}));
  }
  return out.sort((a,b)=>b.priorityScore-a.priorityScore);
}

function getAdvisorStateStore(){try{const x=JSON.parse(localStorage.getItem('vaultet_advisor_issue_states_v1')||'{}');return x&&typeof x==='object'&&!Array.isArray(x)?x:{};}catch(e){return {};}}
function saveAdvisorStateStore(x){try{localStorage.setItem('vaultet_advisor_issue_states_v1',JSON.stringify(x));}catch(e){}}
function resolveAdvisorStates(findings){
  const states=getAdvisorStateStore(),now=new Date().toISOString();
  const active=new Set(findings.map(f=>f.stateKey));
  Object.keys(states).forEach(k=>{if(!active.has(k)&&states[k]?.status!=='resolved')states[k]={...states[k],status:'resolved',resolvedAt:now};});
  findings.forEach(f=>{const prev=states[f.stateKey];if(!prev){f.state='new';}else if(prev.status==='resolved'){f.state='new';}else if(f.priorityScore>(prev.priorityScore||0)*1.2){f.state='worsening';}else if(f.priorityScore<(prev.priorityScore||0)*0.8){f.state='improving';}else{f.state='unchanged';}states[f.stateKey]={status:'active',priorityScore:f.priorityScore,lastSeen:now};});
  saveAdvisorStateStore(states);
  return findings;
}

function getAdvisorIntelligence(snapshot,profile){
  const findings=resolveAdvisorStates(buildAdvisorFindings(snapshot,profile));
  const top=findings.filter(f=>f.id!=='STABLE').slice(0,3);
  return {generatedAt:new Date().toISOString(),status:top.some(f=>f.severity==='critical')?'needs attention':top.length?'watch':'stable',topPriorities:top,allFindings:findings,dataQuality:snapshot.advisorContext?.dataQuality||{}};
}
