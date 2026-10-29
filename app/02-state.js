// Vaultet — app/02-state.js : สถานะและที่เก็บข้อมูล: ค่าใช้จ่ายประจำ, เทียบช่วง, หนี้, เงินสำรองฉุกเฉิน, งบ, รายรับฐาน
// (แยกจาก app.js เดิม — โหลดเรียงตามเลขไฟล์ ทุกไฟล์ใช้ตัวแปร/ฟังก์ชันร่วมกันแบบ global)
// ===== Phase 4: Recurring Expenses + Upcoming Payments =====
// recurringExpenses: { id, name, amount, category, accountId, frequency, nextDueDate, startDate, endDate, note, status, reservedItemId, lastPaidDate }
// frequency: weekly | monthly | bimonthly | quarterly | yearly
// status: active | paused | cancelled  (นี่คือสถานะที่ผู้ใช้ตั้งเอง แยกจาก "overdue/dueToday/upcoming" ที่คำนวณจากวันที่)
let recurringExpenses = [];
let upcomingFilter = "30d"; // 7d | 30d | thisMonth | nextMonth | all
let markPaidRecurringId = null;
let analysisPreset = "thisMonth";
let analysisStart = "";
let analysisEnd = "";
let analysisAccountFilter = "";
// ===== Phase 3: Compare Period state =====
let comparePreset = "thisMonthVsLastMonth";
let compareAccountFilter = "";
let compareAStart = "";
let compareAEnd = "";
let compareBStart = "";
let compareBEnd = "";
let compareCategorySort = "changed"; // changed | increase | decrease | total
let compareDetailExpanded = false;
let selectedMonth = "";
let typeFilter = "all";
let txVisibleLimit = 20;
let searchQuery = "";
let formType = "expense";
let selectedCategory = "";
let selectedGoalId = ""; // เป้าหมายที่เลือกในฟอร์มรายการออม
let orphanCategory = null; // category from an existing entry that no longer exists in CATS_BY_TYPE; kept visible so editing doesn't silently reassign it
let editingId = null;
let searchAllMonths = false;
let expandedBreakdown = { income:false, expense:false, saving:false }; // แต่ละบล็อก breakdown พับ/กางแยกกัน
// ===== Phase 5: Cash Flow Forecast state =====
// (AI) aiProfileDraft ย้ายไป ai.js

function makeId(){
  if(window.crypto && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 9);
}
// รวมเงินด้วยหน่วยสตางค์ (integer) ก่อน แล้วค่อยหารคืนเป็นบาท กันปัญหา floating point เพี้ยนสะสม เช่น 0.1+0.2
function toCents(n){ return Math.round(Number(n || 0) * 100); }

function todayISO(){
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth()+1).padStart(2,"0");
  const day = String(d.getDate()).padStart(2,"0");
  return `${y}-${m}-${day}`;
}
function monthKey(d){ return d.slice(0,7); }
const SHOW_DECIMALS_KEY = "vaultet_show_decimals_v1";
function getShowDecimals(){
  try{ return localStorage.getItem(SHOW_DECIMALS_KEY) === "1"; }catch(e){ return false; }
}
function fmt(n){
  if(getShowDecimals()){
    return new Intl.NumberFormat("th-TH",{maximumFractionDigits:2}).format(n);
  }
  const r = Math.round(n);
  return new Intl.NumberFormat("th-TH",{maximumFractionDigits:0}).format(r === 0 ? 0 : r);
}
function monthLabel(mk){
  const [rawY,m] = String(mk).split("-").map(Number);
  // เก็บ key ภายในเป็น ค.ศ.; ถ้าเจอ พ.ศ. จากข้อมูลเก่าให้ไม่บวก 543 ซ้ำ
  const y = rawY > 2400 ? rawY : rawY + 543;
  return `${THAI_MONTHS_FULL[m-1]||""} ${y}`;
}
function dayLabel(iso){
  const [y,m,d] = iso.split("-").map(Number);
  return `${d} ${THAI_MONTHS_SHORT[m-1]}`;
}
// หัวกลุ่มวันในรายการ: วันนี้ / เมื่อวาน / "15 ต.ค."
function dayHeading(iso){
  const t = new Date(); t.setHours(0,0,0,0);
  const [y,m,d] = iso.split("-").map(Number);
  const diff = Math.round((t - new Date(y, m-1, d)) / 86400000);
  return diff===0 ? "วันนี้" : diff===1 ? "เมื่อวาน" : dayLabel(iso);
}
function escapeHtml(s){
  const d = document.createElement("div");
  d.textContent = s == null ? "" : String(s);
  return d.innerHTML;
}
function showToast(msg){
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(showToast._timer);
  showToast._timer = setTimeout(() => t.classList.remove("show"), 2200);
}

// (AI) markAiChatUnread / clearAiChatUnread ย้ายไป ai.js

function loadEntries(){
  try{
    const raw = localStorage.getItem(ENTRIES_KEY);
    entries = raw ? JSON.parse(raw) : [];
  }catch(e){ entries = []; }
}
function saveEntries(){
  try{
    const res = localStorage.setItem(ENTRIES_KEY, JSON.stringify(entries));
    document.getElementById("errorBanner").style.display = "none";
    if(typeof refreshProactiveCard==="function") refreshProactiveCard();
    return true;
  }catch(e){
    document.getElementById("errorBanner").style.display = "block";
    return false;
  }
}
function loadCategories(){
  try{
    const raw = localStorage.getItem(CATS_KEY);
    if(raw){
      const parsed = JSON.parse(raw);
      CATS_BY_TYPE = {
        income: parsed.income && parsed.income.length ? parsed.income : [...DEFAULT_CATS.income],
        expense: parsed.expense && parsed.expense.length ? parsed.expense : [...DEFAULT_CATS.expense],
        saving: parsed.saving && parsed.saving.length ? parsed.saving : [...DEFAULT_CATS.saving],
      };
    }
  }catch(e){ /* keep defaults */ }
  try{ if(!localStorage.getItem("vaultet_wd_cat_v1")){ if(!CATS_BY_TYPE.income.includes(WITHDRAW_CAT)){ CATS_BY_TYPE.income.push(WITHDRAW_CAT); saveCategories(); } localStorage.setItem("vaultet_wd_cat_v1","1"); } }catch(e){}
  try{ if(!localStorage.getItem("vaultet_goal_cat_v1")){ if(!CATS_BY_TYPE.saving.includes(GOAL_CAT)){ const i=CATS_BY_TYPE.saving.indexOf("อื่นๆ"); CATS_BY_TYPE.saving.splice(i>=0?i:CATS_BY_TYPE.saving.length,0,GOAL_CAT); saveCategories(); } localStorage.setItem("vaultet_goal_cat_v1","1"); } }catch(e){}
}
function saveCategories(){
  try{ localStorage.setItem(CATS_KEY, JSON.stringify(CATS_BY_TYPE)); }catch(e){}
}
function loadLastCat(){
  try{
    const raw = localStorage.getItem(LAST_CAT_KEY);
    if(raw){
      const parsed = JSON.parse(raw);
      lastUsedCat = { income: parsed.income || "", expense: parsed.expense || "", saving: parsed.saving || "" };
    }
  }catch(e){ /* keep defaults */ }
}
function saveLastCat(){
  try{ localStorage.setItem(LAST_CAT_KEY, JSON.stringify(lastUsedCat)); }catch(e){}
}
function loadAccounts(){
  try{
    const raw = localStorage.getItem(ACCOUNTS_KEY);
    accounts = raw ? JSON.parse(raw) : [];
  }catch(e){ accounts = []; }
  if(!accounts.length){
    // บัญชีเริ่มต้นสำหรับข้อมูลเก่าที่ยังไม่เคยมีระบบบัญชี — รายการเก่าทั้งหมดจะถูกนับรวมอยู่ในนี้
    accounts = [{ id: UNASSIGNED_ACCOUNT_ID, name: "ไม่ระบุบัญชี", initialBalance: 0 }];
    saveAccounts();
  }
}
function saveAccounts(){
  try{ localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(accounts)); }catch(e){}
}
function loadLastAccount(){
  try{ lastUsedAccountId = localStorage.getItem(LAST_ACC_KEY) || ""; }catch(e){ lastUsedAccountId = ""; }
}
function saveLastAccount(){
  try{ localStorage.setItem(LAST_ACC_KEY, lastUsedAccountId); }catch(e){}
}
function loadReserved(){
  try{
    const raw = localStorage.getItem(RESERVED_KEY);
    reservedItems = raw ? JSON.parse(raw) : [];
  }catch(e){ reservedItems = []; }
}
function saveReserved(){
  try{ localStorage.setItem(RESERVED_KEY, JSON.stringify(reservedItems)); }catch(e){}
}
function loadLoans(){
  try{
    const raw = localStorage.getItem(LOANS_KEY);
    loans = raw ? JSON.parse(raw) : [];
  }catch(e){ loans = []; }
  loans.forEach(l => { if(!Array.isArray(l.repayments)) l.repayments = []; if(!Array.isArray(l.adjustments)) l.adjustments = []; });
}
function saveLoans(){
  try{ localStorage.setItem(LOANS_KEY, JSON.stringify(loans)); }catch(e){}
  if(typeof refreshProactiveCard==="function") refreshProactiveCard();
}
// ===== Milestone 5: Debt Management Engine — storage =====
function loadDebts(){
  try{
    const raw = localStorage.getItem(DEBTS_KEY);
    debts = raw ? JSON.parse(raw) : [];
    if(!Array.isArray(debts)) debts = [];
  }catch(e){ debts = []; }
  debts.forEach(d => { if(!Array.isArray(d.history)) d.history = []; });
}
function saveDebts(){
  try{ localStorage.setItem(DEBTS_KEY, JSON.stringify(debts)); }catch(e){}
  if(typeof refreshProactiveCard==="function") refreshProactiveCard();
}

// ===== Round 2: Emergency Fund — storage + deterministic calculations =====
const DEFAULT_ESSENTIAL_CATS = ["กิน","ค่าหอ (น้ำ/ไฟ)","ค่าเดินทาง","ของใช้จำเป็น"];
function normalizeEmergencyConfig(raw){
  const r = raw && typeof raw === "object" ? raw : {};
  let months = Number(r.targetMonths);
  if(!isFinite(months) || months <= 0) months = 3;
  months = Math.min(24, Math.max(1, Math.round(months*10)/10));
  const cats = Array.isArray(r.essentialCategories) ? r.essentialCategories.map(String) : DEFAULT_ESSENTIAL_CATS.slice();
  return { targetMonths:months, essentialCategories:[...new Set(cats)] };
}
function loadEmergencyFundConfig(){
  try{ const raw=localStorage.getItem(EMERGENCY_KEY); emergencyFundConfig=normalizeEmergencyConfig(raw?JSON.parse(raw):null); }catch(e){ emergencyFundConfig=normalizeEmergencyConfig(null); }
}
function saveEmergencyFundConfig(){ try{ localStorage.setItem(EMERGENCY_KEY,JSON.stringify(emergencyFundConfig)); }catch(e){} }
function getEmergencyEssentialCategories(){
  const available=CATS_BY_TYPE.expense||[];
  const chosen=(emergencyFundConfig.essentialCategories||[]).filter(c=>available.includes(c));
  return chosen.length ? chosen : available.filter(c=>DEFAULT_ESSENTIAL_CATS.includes(c));
}
function computeEssentialExpenseForMonth(month,categories){
  const bounds=monthBoundsISO(Number(month.slice(0,4)),Number(month.slice(5,7))-1);
  const a=computePeriodAnalysisForRange(bounds.start,bounds.end,null);
  const wanted=new Set(categories);
  return a.breakdown.filter(r=>wanted.has(r.cat)).reduce((sum,r)=>sum+Number(r.amount||0),0);
}
function computeEmergencyFund(){
  const cats=getEmergencyEssentialCategories();
  const now=new Date();
  const currentMonth=monthKey(todayISO());
  const months=[];
  for(let i=1;i<=3;i++){ const d=new Date(now.getFullYear(),now.getMonth()-i,1); months.push(monthKey(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-01`)); }
  const firstDate=[...entries.map(e=>e.date),...loans.map(l=>l.date)].filter(Boolean).sort()[0];
  const firstMonth=firstDate?monthKey(firstDate):currentMonth;
  const completed=months.filter(m=>m>=firstMonth).map(m=>computeEssentialExpenseForMonth(m,cats)).filter(v=>isFinite(v)); // ไม่เอาเดือนก่อนเริ่มใช้งานมาหาร
  const currentEssential=computeEssentialExpenseForMonth(currentMonth,cats);
  const avgBase=completed.length && completed.some(v=>v>0) ? completed.reduce((a,b)=>a+b,0)/completed.length : currentEssential;
  const essentialMonthly=Math.max(0,avgBase||0);
  const targetMonths=Math.max(1,Number(emergencyFundConfig.targetMonths)||3);
  const recommended=Math.max(0,essentialMonthly*targetMonths);
  const currentAvailable=Math.max(0,getTotalMoneyAllAccounts()-getTotalReserved())+getEmergencySaved();
  const coverage=essentialMonthly>0 ? currentAvailable/essentialMonthly : 0;
  const progress=recommended>0 ? Math.min(100,currentAvailable/recommended*100) : (currentAvailable>0?100:0);
  let status="CRITICAL";
  if(recommended<=0) status=currentAvailable>0?"HEALTHY":"WATCH";
  else if(currentAvailable>=recommended) status="HEALTHY";
  else if(currentAvailable>=recommended*0.5) status="WATCH";
  return { emergencySaved:getEmergencySaved(), cashAvailable:Math.max(0,getTotalMoneyAllAccounts()-getTotalReserved()), targetMonths, essentialCategories:cats, monthlyEssentialExpense:essentialMonthly, recommendedEmergencyFund:recommended, currentAvailableReserve:currentAvailable, reserveCoverageMonths:coverage, reserveProgressPercent:progress, reserveShortfall:Math.max(0,recommended-currentAvailable), status, historicalEssentialExpenses:completed, currentMonthEssentialExpense:currentEssential };
}

// ===== Round 1: Budget Engine storage + deterministic calculations =====
function bKey(month,cats,kind){ return (kind==="saving"?"S|":"")+month+"|"+(cats||[]).slice().sort().join("+"); }
function budgetKey(b){ return bKey(b.month,(b.categories||[b.category]),b.kind); }
function getMonthSavingByCategories(month,cats){ const set=new Set(cats||[]); return entries.filter(e=>e.type==="saving" && monthKey(e.date)===month && set.has(e.category)).reduce((s,e)=>s+toCents(e.amount),0)/100; }
// ===== เงินสำรองเผื่อเหตุไม่คาดฝันรายเดือน (buffer) =====
const BUFFER_KEY="vaultet_buffer_v1";
function __readBuffer(){ let o={}; try{o=JSON.parse(localStorage.getItem(BUFFER_KEY)||"{}");}catch(e){} o.months=o.months||{}; return o; }
// เงินคืนจากการยืม = เงินเดิมของเรา ไม่ใช่รายได้ใหม่: นับทั้งรายการจากระบบเงินให้ยืม (source) และรายการที่พิมพ์เองในหมวดนี้
function isLoanRepaymentIncome(e){ return !!e && e.type==="income" && (e.source==="loan_repayment" || e.category==="เงินคืนจากการยืม"); }
function getBufferInfo(month=monthKey(todayISO())){
  const amt=__readBuffer().months[month]; if(amt==null) return null;
  const covered=new Set(); budgets.filter(b=>b.enabled!==false&&(b.kind||"expense")==="expense"&&b.month===month).forEach(b=>(b.categories||[]).forEach(c=>covered.add(c)));
  const used=covered.size?entries.filter(e=>e.type==="expense"&&monthKey(e.date)===month&&!covered.has(e.category)).reduce((t,e)=>t+toCents(e.amount),0)/100:0;
  const swept=Number((__readBuffer().swept||{})[month]||0);
  return {month,amount:Number(amt),used,swept,remaining:Number(amt)-used-swept,daysLeft:getBudgetRemainingDays(month)};
}
// ===== รายรับฐาน: เฉลี่ยย้อนหลังสูงสุด 3 เดือนที่ผ่านมาแล้ว (ไม่นับถอนเงินออม/เงินที่ถูกคืนจากการยืม) =====
function sweepBufferToSaving(month,amount,category){
  const bf=getBufferInfo(month); if(!bf) return {ok:false,msg:"ยังไม่ได้ตั้งเงินสำรองเดือนนี้"};
  const amt=Math.round(Number(amount)*100)/100; if(!(amt>0)) return {ok:false,msg:"จำนวนเงินไม่ถูกต้อง"};
  if(amt>bf.remaining+0.005) return {ok:false,msg:`เงินสำรองเหลือแค่ ฿${fmt(Math.max(0,bf.remaining))}`};
  const sc=CATS_BY_TYPE.saving||[], cat=sc.includes(category)?category:(sc.includes("เงินออม")?"เงินออม":sc[0]); if(!cat) return {ok:false,msg:"ยังไม่มีหมวดออม"};
  const acc=accounts.find(x=>x.id!==UNASSIGNED_ACCOUNT_ID)||accounts[0];
  const r=commitEntry({type:"saving",category:cat,accountId:acc?acc.id:UNASSIGNED_ACCOUNT_ID,amount:amt,date:todayISO(),note:"ย้ายเศษเงินสำรอง "+monthLabel(month)});
  if(!r||!r.ok) return {ok:false,msg:"บันทึกรายการออมไม่สำเร็จ"};
  const o=__readBuffer(); o.swept=o.swept||{}; o.swept[month]=Math.round((Number(o.swept[month]||0)+amt)*100)/100; localStorage.setItem(BUFFER_KEY,JSON.stringify(o));
  return {ok:true,entry:r.entry,amount:amt,category:cat};
}
// แผนปิดเดือนที่คำนวณด้วยโค้ด (AI ไม่ต้องคิดเลขเอง): เงินสำรองที่เหลือ → เติมเงินสำรองฉุกเฉิน → เป้าออมเดือนนี้ → ออมเพิ่ม
function buildMonthEndPlan(snapshot){
  const month=monthKey(todayISO()), bf=getBufferInfo(month), sv=computeBudgetSummary(month,"saving"), ex=computeBudgetSummary(month);
  const ef=(snapshot&&snapshot.emergencyFund)||{}, efGap=Math.max(0,Number(ef.reserveShortfall||0)), sc=CATS_BY_TYPE.saving||[];
  const defCat=sc.includes("เงินออม")?"เงินออม":(sc[0]||null), emCat=sc.find(c=>c.includes("สำรอง"))||defCat;
  let left=bf?Math.max(0,Math.round(bf.remaining*100)/100):0;
  const toEm=Math.min(left,efGap); left=Math.round((left-toEm)*100)/100;
  const goalGap=Math.max(0,sv.totalRemaining||0), toGoal=Math.min(left,goalGap); left=Math.round((left-toGoal)*100)/100;
  const waterfall=[{to:"เติมเงินสำรองฉุกเฉิน",category:emCat,amount:Math.round(toEm*100)/100},{to:"เติมเป้าออมเดือนนี้",category:defCat,amount:Math.round(toGoal*100)/100},{to:"ออมเพิ่ม (หรือเก็บไว้เป็น buffer เดือนหน้า)",category:defCat,amount:left}].filter(x=>x.amount>0&&x.category);
  return {month,daysLeft:getBudgetRemainingDays(month),buffer:bf,emergencyFundGap:efGap,savingGoalGap:goalGap,overBudget:ex.rows.filter(r=>r.status==="OVER").map(r=>({category:r.category,over:Math.round(-r.remaining)})),waterfall,note:bf?(bf.remaining<0?"ใช้เกินเงินสำรอง":""):"ยังไม่ได้ตั้ง buffer เดือนนี้"};
}
function getIncomeBaseline(){
  const cur=monthKey(todayISO()), tot={};
  entries.forEach(e=>{ if(e.type!=="income"||e.category===WITHDRAW_CAT||e.source==="loan_repayment"||e.category==="เงินคืนจากการยืม") return; const m=monthKey(e.date); if(m>=cur) return; tot[m]=(tot[m]||0)+toCents(e.amount); });
  const ms=Object.keys(tot).sort().reverse().slice(0,3), v=ms.map(m=>tot[m]/100).filter(x=>x>0);
  if(!v.length) return {months:0};
  const avg=v.reduce((a,b)=>a+b,0)/v.length, sd=Math.sqrt(v.reduce((a,b)=>a+(b-avg)*(b-avg),0)/v.length);
  return {months:v.length,avg:Math.round(avg),min:Math.round(Math.min(...v)),max:Math.round(Math.max(...v)),volatilityPct:avg>0?Math.round(sd/avg*100):0};
}
function getMonthExpenseByCategories(month, cats){ const set=new Set(cats||[]); return entries.filter(e=>e.type==="expense" && monthKey(e.date)===month && set.has(e.category)).reduce((s,e)=>s+toCents(e.amount),0)/100; }
function normalizeBudget(b){
  if(!b || typeof b !== "object") return null;
  const amount = Number(b.amount);
  if(!b.id || !(b.category || (Array.isArray(b.categories)&&b.categories.length)) || !isFinite(amount) || amount < 0) return null;
  const month = /^\d{4}-\d{2}$/.test(String(b.month || "")) ? String(b.month) : monthKey(todayISO());
  const cats=(Array.isArray(b.categories)&&b.categories.length?b.categories:[b.category]).map(String).filter(Boolean);
  const name=b.name?String(b.name):"";
  return { id:String(b.id), kind:(b.kind==="saving"?"saving":"expense"), category:name||cats.join(" + "), categories:cats, name, amount:Math.round(amount*100)/100, period:"monthly", month,
    enabled:b.enabled !== false, createdAt:b.createdAt || new Date().toISOString(), updatedAt:b.updatedAt || b.createdAt || new Date().toISOString() };
}
function loadBudgets(){
  try{
    const raw=localStorage.getItem(BUDGETS_KEY); const parsed=raw?JSON.parse(raw):[];
    budgets=Array.isArray(parsed)?parsed.map(normalizeBudget).filter(Boolean):[];
    const map=new Map();
    budgets.forEach(b=>{ const k=budgetKey(b); const old=map.get(k); if(!old || String(b.updatedAt)>String(old.updatedAt)) map.set(k,b); });
    budgets=Array.from(map.values()); saveBudgets();
  }catch(e){ budgets=[]; }
}
function saveBudgets(){ try{ localStorage.setItem(BUDGETS_KEY, JSON.stringify(budgets)); }catch(e){} }
function getMonthExpenseByCategory(month, category){
  return entries.filter(e=>e.type==="expense" && monthKey(e.date)===month && e.category===category).reduce((s,e)=>s+toCents(e.amount),0)/100;
}
function getDaysInMonth(month){ const [y,m]=month.split("-").map(Number); return new Date(y,m,0).getDate(); }
function getBudgetElapsedDays(month){ const today=todayISO(), cur=monthKey(today); if(month<cur) return getDaysInMonth(month); if(month>cur) return 0; return new Date().getDate(); }
function getBudgetRemainingDays(month){ const cur=monthKey(todayISO()); if(month<cur) return 0; if(month>cur) return getDaysInMonth(month); return Math.max(0,getDaysInMonth(month)-new Date().getDate()); }
function getBudgetStatus(spent,budget,projected){
  if(budget<=0) return spent>0?"OVER":"SAFE";
  if(spent>budget) return "OVER";
  if(projected>budget || spent>=budget*0.8) return "WATCH";
  return "SAFE";
}
function computeBudgetSummary(month=monthKey(todayISO()),kind="expense"){
  const rows=budgets.filter(b=>b.enabled!==false && b.period==="monthly" && b.month===month && (b.kind||"expense")===kind).map(b=>{
    const spent=(kind==="saving"?getMonthSavingByCategories:getMonthExpenseByCategories)(month,b.categories), days=getDaysInMonth(month), elapsed=getBudgetElapsedDays(month), remainingDays=getBudgetRemainingDays(month);
    const remaining=b.amount-spent, pct=b.amount>0?(spent/b.amount)*100:(spent>0?100:0), projected=elapsed>0?(spent/elapsed)*days:spent;
    return {id:b.id,category:b.category,categories:b.categories,budget:b.amount,spent,remaining,pct,projected,dailyAllowance:remainingDays>0?Math.max(0,remaining)/remainingDays:0,status:kind==="saving"?(spent>=b.amount?"DONE":"SAVING"):getBudgetStatus(spent,b.amount,projected),kind,elapsedDays:elapsed,remainingDays,daysInMonth:days};
  });
  const totalBudget=rows.reduce((s,r)=>s+r.budget,0), totalSpent=rows.reduce((s,r)=>s+r.spent,0);
  return {month,daysInMonth:getDaysInMonth(month),elapsedDays:getBudgetElapsedDays(month),remainingDays:getBudgetRemainingDays(month),rows,totalBudget,totalSpent,totalRemaining:totalBudget-totalSpent,totalPct:totalBudget>0?totalSpent/totalBudget*100:0,projectedTotal:getBudgetElapsedDays(month)>0?totalSpent/getBudgetElapsedDays(month)*getDaysInMonth(month):totalSpent,overCount:rows.filter(r=>r.status==="OVER").length,watchCount:rows.filter(r=>r.status==="WATCH").length,budgetCount:rows.length};
}
function getBudgetFindingData(){ const s=computeBudgetSummary(); return {month:s.month,totalBudget:s.totalBudget,totalSpent:s.totalSpent,totalRemaining:s.totalRemaining,totalPct:s.totalPct,overCount:s.overCount,watchCount:s.watchCount,rows:s.rows.map(r=>({category:r.category,budget:r.budget,spent:r.spent,remaining:r.remaining,pct:r.pct,projected:r.projected,dailyAllowance:r.dailyAllowance,status:r.status}))}; }
function getTotalDebts(){
  return debts.reduce((s,d) => s + toCents(d.outstandingBalance), 0) / 100;
}
function debtHistoryLabel(type){
  return { increase:"เพิ่มยอด", adjustment:"แก้ยอด", repayment:"ชำระคืน" }[type] || type;
}
// เพิ่ม/ลดยอดหนี้แบบ relative (ใช้กับปุ่มลัดเพิ่มยอด และบันทึกชำระคืน) — บันทึก history เสมอ
function addDebtHistory(debtId, type, amount, note, date){
  const d = debts.find(x => x.id === debtId);
  if(!d) return false;
  const amt = Math.round(parseFloat(amount) * 100) / 100;
  if(!amt || amt <= 0) return false;
  const signedCents = (type === "repayment") ? -toCents(amt) : toCents(amt);
  d.outstandingBalance = Math.max(0, toCents(d.outstandingBalance) + signedCents) / 100;
  d.history.unshift({ id: makeId(), type, amount: amt, date: date || todayISO(), note: (note || "").trim() });
  saveDebts();
  return true;
}
// แก้ยอดคงค้างตรงๆ (ไม่ใช่ relative) — ใช้ตอนแก้ยอดให้ตรงกับความเป็นจริง เช่น หลังเช็คสมุด กยศ.
function setDebtBalance(debtId, newBalance, note){
  const d = debts.find(x => x.id === debtId);
  if(!d) return false;
  const nb = Math.round(parseFloat(newBalance) * 100) / 100;
  if(isNaN(nb) || nb < 0) return false;
  const diff = Math.round((toCents(nb) - toCents(d.outstandingBalance))) / 100;
  d.outstandingBalance = nb;
  d.history.unshift({ id: makeId(), type:"adjustment", amount: diff, date: todayISO(), note: (note || "แก้ยอดคงค้างด้วยตนเอง").trim() });
  saveDebts();
  return true;
}
// สร้างหนี้ กยศ. เริ่มต้นให้อัตโนมัติครั้งแรกที่เปิดใช้งาน ตามยอดจริงของผู้ใช้ตอนเริ่ม Milestone 5 — ทำครั้งเดียวถ้ายังไม่เคยมีข้อมูลหนี้เลย
function ensureDefaultDebts(){
  // Never create a synthetic liability on a fresh install. Existing debt data is preserved.
  if(debts.length) return;
  if(entries.some(e => e.type === "income" && e.category === "กยศ.")) return;
  return;
  /*
  debts.push({
    id: makeId(), name: "กยศ.", type: "student_loan",
    outstandingBalance: 121600, gracePeriod: true, note: "",
    history: [{ id: makeId(), type:"adjustment", amount:121600, date: todayISO(), note:"ยอดเริ่มต้นตอนเปิดใช้งาน Debt Management" }]
  });
  saveDebts();
  */
}
function loadRecurring(){
  try{
    const raw = localStorage.getItem(RECURRING_KEY);
    recurringExpenses = raw ? JSON.parse(raw) : [];
    if(!Array.isArray(recurringExpenses)) recurringExpenses = [];
  }catch(e){ recurringExpenses = []; }
}
function saveRecurring(){
  try{ localStorage.setItem(RECURRING_KEY, JSON.stringify(recurringExpenses)); }catch(e){}
}
function loanOutstanding(loan){
  const repaidCents = (loan.repayments || []).reduce((s,r) => s + toCents(r.amount), 0);
  const adjustmentCents = (loan.adjustments || []).reduce((s,a) => s + toCents(a.amount), 0);
  return Math.max(0, (toCents(loan.amount) + adjustmentCents - repaidCents) / 100);
}
function getTotalReserved(){
  return reservedItems.reduce((s,r) => s + toCents(r.amount), 0) / 100;
}
function getTotalReceivablesOutstanding(){
  return loans.reduce((s,l) => s + toCents(loanOutstanding(l)), 0) / 100;
}
