// Vaultet — ai/04-brain-chat.js : Financial Brain, แชทที่ปรึกษาแบบถาวร (ที่เก็บประวัติ)
// (แยกจาก ai.js เดิม — โหลดเรียงตามเลขไฟล์ ทุกไฟล์ใช้ตัวแปร/ฟังก์ชันร่วมกันแบบ global)
// ===== Round 3: Financial Brain =====
function computeFinancialBehavior(snapshot){
  const now=new Date(), daysThisMonth=Math.max(1,now.getDate());
  const a=computePeriodAnalysisForRange(snapshot.thisMonth.range.start,snapshot.thisMonth.range.end,null);
  const prev=computePeriodAnalysisForRange(snapshot.lastMonth.range.start,snapshot.lastMonth.range.end,null);
  const full=a.breakdown||[], last=prev.breakdown||[];
  const map=arr=>Object.fromEntries(arr.map(r=>[r.cat,Number(r.amount||0)]));
  const tm=map(full),lm=map(last);
  const cats=[...new Set([...Object.keys(tm),...Object.keys(lm)])];
  const trends=cats.map(category=>{const current=tm[category]||0,previous=lm[category]||0;return {category,current,previous,change:current-previous,pctChange:previous>0?((current-previous)/previous)*100:null};}).filter(r=>r.current>0||r.previous>0).sort((x,y)=>y.current-x.current);
  const essentialCats=new Set(getEmergencyEssentialCategories());
  const essential=full.filter(r=>essentialCats.has(r.cat)).reduce((x,r)=>x+Number(r.amount||0),0);
  const expense=Number(a.expense||0),income=Number(a.income||0),saving=Number(a.saving||0);
  return {spendingTrend:{currentMonthlyExpense:expense,previousMonthlyExpense:Number(prev.expense||0),change:expense-Number(prev.expense||0),pctChange:prev.expense>0?((expense-prev.expense)/prev.expense)*100:null},incomeTrend:{current:income,previous:Number(prev.income||0),change:income-Number(prev.income||0),pctChange:prev.income>0?((income-prev.income)/prev.income)*100:null},averageDailyExpense:expense/daysThisMonth,essentialExpense:essential,discretionaryExpense:Math.max(0,expense-essential),discretionaryRatio:expense>0?Math.max(0,expense-essential)/expense*100:0,savingsRate:income>0?saving/income*100:0,topCategories:trends.slice(0,5),categoryTrends:trends.slice(0,20),frequentCategories:full.slice().sort((x,y)=>Number(y.count||0)-Number(x.count||0)).slice(0,5).map(r=>({category:r.cat,count:Number(r.count||0),amount:Number(r.amount||0)})),spendingDaysElapsed:daysThisMonth};
}
// ช่วงรอรอบรายรับเข้า: ก่อนวันที่ 22 หรือรายรับสะสมยังไม่ถึง 50% ของรายได้ฐาน (เฉพาะเดือนปัจจุบัน)
function getSavingsTimingState(snapshot,baseIncome){
  try{
    const income=Number(snapshot&&snapshot.thisMonth&&snapshot.thisMonth.income||0), base=Number(baseIncome||0);
    const viewMonth=snapshot&&snapshot.thisMonth&&snapshot.thisMonth.month, curMonth=monthKey(todayISO());
    if(viewMonth&&viewMonth!==curMonth) return {waiting:false,beforeDay22:false,incomeBelowHalf:false};
    const beforeDay22=new Date().getDate()<22;
    const incomeBelowHalf=base>0&&income<base*0.5;
    return {waiting:beforeDay22||incomeBelowHalf,beforeDay22,incomeBelowHalf};
  }catch(e){ return {waiting:false,beforeDay22:false,incomeBelowHalf:false}; }
}
function computeFinancialHealth(snapshot){
  const b=snapshot.behaviorSummary||{}, budget=snapshot.budgetSummary||{}, ef=snapshot.emergencyFund||{}, fc=snapshot.forecastToMonthEnd||{}, income=Number(snapshot.thisMonth?.income||0);
  // ฐานรายได้ประเมิน: getBrainBaseIncome() -> รายได้ประมาณการในโปรไฟล์ -> เฉลี่ย 3 เดือน -> รายรับจริงเดือนนี้
  let baseIncome=0;
  try{
    if(typeof window!=="undefined"&&typeof window.getBrainBaseIncome==="function"){ const r=window.getBrainBaseIncome(income); baseIncome=Number(r&&typeof r==="object"?r.value:r)||0; }
    if(!(baseIncome>0)){ const p=(typeof loadAIProfile==="function")?loadAIProfile():null; baseIncome=Number(p&&p.monthlyIncomeEstimate)>0?Number(p.monthlyIncomeEstimate):0; }
    if(!(baseIncome>0)&&typeof getIncomeBaseline==="function"){ const ib=getIncomeBaseline(); baseIncome=(ib&&ib.months>0&&ib.avg>0)?ib.avg:0; }
  }catch(e){ baseIncome=0; }
  if(!(baseIncome>0)) baseIncome=income;
  let score=50;const factors=[];const add=(label,points,status)=>{score+=points;factors.push({label,points,status});};
  const flow=Number(snapshot.thisMonth?.netCashFlow||0); if(flow>0)add('กระแสเงินสดเป็นบวก',15,'positive'); else if(flow<0){
    const __n=new Date(), __notMonthEnd=__n.getDate()<new Date(__n.getFullYear(),__n.getMonth()+1,0).getDate();
    // ติดลบช่วงรอรายรับเข้า (ยังไม่สิ้นเดือน และไม่เกินกรอบ baseIncome) = เฝ้าดูชั่วคราว ไม่หักหนัก
    if(__notMonthEnd&&baseIncome>0&&Math.abs(flow)<=baseIncome) add('กระแสเงินสดติดลบชั่วคราว (รอรายรับเข้า)',-3,'warning');
    else add('กระแสเงินสดติดลบ',-20,'negative');
  }
  if(budget.budgetCount){if(budget.overCount>0)add(`เกินงบ ${budget.overCount} หมวด`,-15,'negative');else if(budget.watchCount>0)add(`ต้องเฝ้าดูงบ ${budget.watchCount} หมวด`,-6,'warning');else add('คุมงบได้ดี',10,'positive');}
  if(ef.recommendedEmergencyFund>0){if(ef.currentAvailableReserve>=ef.recommendedEmergencyFund)add('เงินสำรองถึงเป้าหมาย',15,'positive');else if(ef.currentAvailableReserve>=ef.recommendedEmergencyFund*.5)add('เงินสำรองกำลังสร้าง',6,'warning');else add('เงินสำรองยังต่ำ',-12,'negative');}
  const __savTiming=getSavingsTimingState(snapshot,baseIncome); let savingsWaiting=false;
  if(income>0){const __S=getBrainTargets().savingsRatePct;if(b.savingsRate>=__S)add('อัตราออมแข็งแรง',10,'positive');else if(b.savingsRate>=__S/2)add('มีการออมสม่ำเสมอ',5,'warning');else if(__savTiming.waiting){savingsWaiting=true;add('รอรอบการออมตามรายรับ (ยังไม่ถึงงวดเงินเข้า)',0,'neutral');}else add('อัตราออมต่ำ',-7,'warning');}
  if(Number(fc.forecastAvailable||0)<0)add('คาดการณ์เงินใช้ได้ติดลบ',-20,'negative'); else if(Number(fc.forecastAvailable||0)>0)add('คาดการณ์เงินใช้ได้ยังเป็นบวก',5,'positive');
  if(b.discretionaryRatio>60)add('รายจ่ายไม่จำเป็นมีสัดส่วนสูง',-8,'warning');
  if(Number(snapshot.monthComparison?.incomeChange||0)<0&&income>0)add('รายรับลดจากเดือนก่อน',-5,'warning');
  score=Math.max(0,Math.min(100,Math.round(score)));const status=score<40?'CRITICAL':score<70?'WATCH':'HEALTHY';
  const __T=getBrainTargets(),benchmark={essentialTargetPct:__T.essentialMaxPct,discretionaryTargetPct:__T.discretionaryMaxPct,savingTargetPct:__T.savingsRatePct,essentialPct:baseIncome>0?b.essentialExpense/baseIncome*100:null,baseIncome,essentialAmount:Number(b.essentialExpense||0),discretionaryPct:income>0?b.discretionaryExpense/income*100:null,savingPct:income>0?Number(snapshot.thisMonth?.saving||0)/income*100:null};
  return {score,status,factors,savingsWaiting,savingsWaitingLabel:savingsWaiting?'รอรอบการออมตามรายรับ (ยังไม่ถึงงวดเงินเข้า)':'',negativeFactorCount:factors.filter(x=>x.status==='negative').length,benchmark,strengths:factors.filter(x=>x.status==='positive').map(x=>x.label),risks:factors.filter(x=>x.status!=='positive'&&x.status!=='neutral').map(x=>x.label)};
}
function buildFinancialBrainContext(snapshot,profile){
  const advisor=getAdvisorIntelligence(snapshot,profile||{});
  return {financialBrain:snapshot.financialBrain,advisorIntelligence:advisor,cash:snapshot.cash,incomeContext:snapshot.incomeContext,behaviorSummary:snapshot.behaviorSummary,budgetSummary:snapshot.budgetSummary,emergencyFund:snapshot.emergencyFund,forecastToMonthEnd:snapshot.forecastToMonthEnd,forecast30d:snapshot.forecast30d,recurring:snapshot.recurringExpenses||snapshot.upcoming,debts:snapshot.debts,netWorth:snapshot.netWorth,goals:typeof goals!=='undefined'?goals:[],profile:profile||{},memory:loadAIMemory().slice(-40)};
}
function financialBrainRuleFindings(snapshot){
  const f=[],b=snapshot.behaviorSummary||{};
  if(snapshot.thisMonth.netCashFlow<0)f.push({id:'CASHFLOW_NEGATIVE',severity:'critical',data:{netCashFlow:snapshot.thisMonth.netCashFlow}});
  if(snapshot.forecastToMonthEnd.forecastAvailable<0)f.push({id:'FORECAST_NEGATIVE',severity:'critical',data:{forecastAvailable:snapshot.forecastToMonthEnd.forecastAvailable}});
  if(snapshot.budgetSummary.overCount>0)f.push({id:'BUDGET_OVER',severity:'warning',data:snapshot.budgetSummary});
  if(snapshot.budgetSummary.watchCount>0&&snapshot.budgetSummary.overCount===0)f.push({id:'BUDGET_PACE_HIGH',severity:'warning',data:snapshot.budgetSummary});
  if(snapshot.emergencyFund.recommendedEmergencyFund>0&&snapshot.emergencyFund.currentAvailableReserve<snapshot.emergencyFund.recommendedEmergencyFund*.5)f.push({id:'EMERGENCY_LOW',severity:'critical',data:snapshot.emergencyFund});
  if(snapshot.emergencyFund.recommendedEmergencyFund>0&&snapshot.emergencyFund.currentAvailableReserve>=snapshot.emergencyFund.recommendedEmergencyFund)f.push({id:'EMERGENCY_HEALTHY',severity:'positive',data:snapshot.emergencyFund});
  if(b.discretionaryRatio>60)f.push({id:'HIGH_DISCRETIONARY_SPENDING',severity:'warning',data:{discretionaryRatio:b.discretionaryRatio}});
  if(Number(b.spendingTrend?.pctChange||0)>=30&&Number(b.spendingTrend?.change||0)>=500)f.push({id:'SPENDING_SPIKE',severity:'warning',data:b.spendingTrend});
  if(Number(b.incomeTrend?.pctChange||0)<=-20&&Number(b.incomeTrend?.change||0)<0)f.push({id:'INCOME_DROP',severity:'warning',data:b.incomeTrend});
  if(b.savingsRate<getBrainTargets().savingsRatePct/2&&Number(snapshot.thisMonth.income||0)>0&&!getSavingsTimingState(snapshot,snapshot.financialBrain?.benchmark?.baseIncome).waiting)f.push({id:'SAVINGS_RATE_LOW',severity:'warning',data:{savingsRate:b.savingsRate}});
  if(!f.length)f.push({id:'FINANCIAL_STRENGTH',severity:'positive',data:{score:snapshot.financialBrain?.score}});
  const rank={critical:4,warning:3,info:2,positive:1};return f.sort((a,z)=>(rank[z.severity]||0)-(rank[a.severity]||0));
}

function extractAdvisorAmount(text){
  const q=String(text||'');
  const matches=[...q.matchAll(/(?:฿|บาท|ราคา|ซื้อ|จ่าย|ค่าใช้จ่าย)\s*([0-9][0-9,]*(?:\.[0-9]+)?)/gi)].map(m=>Number(String(m[1]).replace(/,/g,''))).filter(Number.isFinite);
  if(matches.length)return matches[0];
  const standalone=[...q.matchAll(/\b([0-9]{2,}(?:,[0-9]{3})*(?:\.[0-9]+)?)\b/g)].map(m=>Number(String(m[1]).replace(/,/g,''))).filter(Number.isFinite);
  return standalone.length===1?standalone[0]:null;
}
function extractHypotheticalIncome(q){
  q=String(q||""); if(!/(รายรับ|รายได้|เงินเข้า|เงินเดือน|เข้ามา)/.test(q)||!/(สมมติ|ถ้า|พอ|ประมาณ)/.test(q)) return null;
  const re=/([0-9][0-9,]*(?:\.[0-9]+)?)\s*(k|K|พัน|หมื่น)?/g; let m;
  while((m=re.exec(q))){ let v=Number(m[1].replace(/,/g,'')); if(m[2]==='k'||m[2]==='K'||m[2]==='พัน')v*=1000; else if(m[2]==='หมื่น')v*=10000; if(v>=1000) return v; }
  return null;
}
function buildAdvisorQueryContext(query,snapshot,profile){
  const hypo=extractHypotheticalIncome(query);
  if(hypo!=null){
    const T=getBrainTargets(),ef=snapshot.emergencyFund||{},gap=Math.max(0,Number(ef.recommendedEmergencyFund||0)-Number(ef.currentAvailableReserve||0));
    return {mode:'income_allocation',hypotheticalIncome:hypo,plan:{saveAtLeast:Math.round(hypo*T.savingsRatePct/100),essentialMax:Math.round(hypo*T.essentialMaxPct/100),discretionaryMax:Math.round(hypo*T.discretionaryMaxPct/100)},targetsPct:T,emergencyFundGap:gap,incomeBaseline:getIncomeBaseline(),bufferSuggested:{min:Math.round(hypo*0.05),max:Math.round(hypo*0.10)},upcomingBills30d:(()=>{try{return Math.round(getUpcomingOccurrences("30d").reduce((t,o)=>t+Number((o.r||o).amount||0),0));}catch(e){return null;}})()};
  }
  if(/สิ้นเดือน|ปิดเดือน|สรุปเดือน|เศษเงิน|เงินเหลือ|เหลือเท่า|ย้าย.{0,6}(ออม|สำรอง)|buffer|บัฟเฟอร์/i.test(String(query||""))){
    return {mode:"month_end",plan:buildMonthEndPlan(snapshot)};
  }
  const amount=extractAdvisorAmount(query);
  if(amount==null)return {mode:'general',note:'ไม่ได้ระบุจำนวนเงินที่ตรวจสอบ affordability ได้ชัดเจน'};
  const available=Number(snapshot.cash?.available||0);
  const upcoming=(typeof getUpcomingOccurrences==='function'?getUpcomingOccurrences('7d'):[]).reduce((sum,o)=>sum+Number((o.r||o).amount||0),0);
  const reserveTarget=Math.max(0,Number(profile?.minReserveTarget||0));
  const afterPurchase=available-amount;
  const afterKnownObligations=available-upcoming-amount;
  return {mode:'affordability',purchaseAmount:amount,availableCash:available,upcoming7d:upcoming,minReserveTarget:reserveTarget,remainingAfterPurchase:afterPurchase,bufferAfterKnownObligations:afterKnownObligations,passesCashCheck:afterPurchase>=0,passesKnownObligationsCheck:afterKnownObligations>=0,passesReserveCheck:reserveTarget<=0||afterKnownObligations>=reserveTarget,assumptions:['ใช้เงินสดที่ใช้ได้หลังหักเงินกันไว้แล้ว','หักเฉพาะ recurring/upcoming obligations ที่ระบบรู้จักภายใน 7 วัน','ไม่สมมติรายรับในอนาคต','เงินสำรองขั้นต่ำใช้เฉพาะเมื่อผู้ใช้ตั้งค่าไว้']};
}

function buildFinancialAnalystSystemPrompt(snapshot, profile){
  const hasProfile = hasAIProfileContent(profile);
  const lines = [
    "คุณคือที่ปรึกษาและเพื่อนคู่คิดทางการเงินระดับมืออาชีพของผู้ใช้แอปการเงิน Vaultet ทำหน้าที่ตอบคำถาม/วิเคราะห์สถานะการเงินของผู้ใช้",
    "บุคลิก: ตรงไปตรงมา ชัดเจน ไม่อ้อมค้อม ไม่ตอบเป็นบอทท่องสคริปต์ราชการหรือคำตอบสำเร็จรูป; มีไหวพริบ ใช้ภาษาคนที่คุยง่ายเป็นกันเองแต่เฉียบคม ให้คำตอบที่ลึก ชัด และนำไปใช้ได้ทันที",
    "กล้าทักท้วง: ถ้าแผนของผู้ใช้สุ่มเสี่ยง (เช่น บอกจะซื้อโต๊ะ/เก้าอี้ แต่เงินสำรองยังไม่ถึงเป้า หรือมีภาระรอจ่าย) ให้เตือนตรงประเด็นด้วยตัวเลขจริงจาก Snapshot แล้วเสนอทางออกที่ทำได้จริง 1-2 ทาง (เช่น เลื่อนเวลา แบ่งจ่าย ลดงบหมวดอื่น) ไม่ต้องเออออตามผู้ใช้เพื่อเอาใจ",
    "ตอบโดยอิงจากตัวเลขใน Financial Snapshot ด้านล่างเท่านั้น ห้ามคำนวณตัวเลขเอง ห้ามประมาณ/เดาตัวเลขที่ไม่มีอยู่ใน Snapshot",
    "ตอบให้สั้นก่อนเสมอ: โดยทั่วไป 1-4 ประโยค หรือไม่เกิน 3 bullet เมื่อมีหลายประเด็น; อย่าเปิดรายงานการเงินเต็มรูปแบบถ้าผู้ใช้ไม่ได้ขอ",
    "ใช้ภาษาคนที่คุยง่ายและเป็นธรรมชาติ แต่ยังแม่นและมืออาชีพ; หลีกเลี่ยงศัพท์ corporate/financial jargon ที่ไม่จำเป็น ไม่ต้องมีคำนำหรือคำลงท้าย",
    "โครงสร้างตามธรรมชาติ: คำตอบตรงๆ → เหตุผลสั้นๆ ถ้าจำเป็น → สิ่งที่ควรทำต่อถ้ามี; ไม่จำเป็นต้องมีครบทุกส่วนทุกครั้ง",
    "ถ้าการเงินปกติ ให้บอกสั้นๆ ว่าปกติ/ยังไม่มีอะไรน่ากังวล และอย่าสร้างปัญหาเพื่อให้ดูฉลาด",
    "ใช้ **ข้อความ** ล้อมรอบตัวเลขเงินหรือประเด็นสำคัญที่ต้องการเน้นให้ผู้ใช้เห็นชัด",
    "Snapshot มีข้อมูลเหล่านี้ให้ใช้ตอบได้ตรงๆ: portfolio (พอร์ตหุ้น: holdings, ต้นทุน, ราคา, กำไรขาดทุน, สัดส่วน), goals (เป้าหมายเก็บเงิน พร้อม saved/remaining/daysLeft), monthlyHistory (สรุปรายเดือนย้อนหลัง 6 เดือนแยกหมวด) นอกเหนือจากยอดเงิน งบ หนี้ เงินสำรอง และรายการล่าสุด 40 รายการ",
    "ถ้าคำถามของผู้ใช้ต้องการข้อมูลที่ไม่มีอยู่ใน Snapshot ให้บอกตรงๆ ว่าไม่มีข้อมูลส่วนนั้น อย่าสร้างตัวเลขขึ้นมาเอง",
    `เกณฑ์สุขภาพการเงินของเดือนนี้ในระบบ (ระบบใช้ค่านี้ประเมินสุขภาพการเงิน): ออม ≥${getBrainTargets().savingsRatePct}% , จำเป็น ≤${getBrainTargets().essentialMaxPct}% , ไม่จำเป็น ≤${getBrainTargets().discretionaryMaxPct}% ของรายรับ`,
    "ถ้า queryContext.mode=income_allocation (ผู้ใช้สมมติรายรับ) ใช้ queryContext.plan เป็นฐาน แต่ปรับสัดส่วนให้เหมาะกับสถานการณ์ได้ (เช่น เงินสำรองยังไม่ถึงเป้า → ออมมากขึ้น) โดยต้องบอกเปอร์เซ็นต์ที่ใช้ชัดเจน และต้องเสนอ action set_brain_targets ให้หน้า Brain ตรงกับแผนที่เสนอ",
    `การสั่งแก้ระบบ: ถ้าผู้ใช้ขอให้ตั้ง/ปรับ/ลบงบประมาณหรือเกณฑ์ Brain ให้ **เสนอ** การเปลี่ยนแปลงด้วยการเพิ่มบรรทัดท้ายคำตอบ รูปแบบ JSON บรรทัดเดียว ต่อ 1 action: @@ACTION@@ {"type":"set_budget","month":"YYYY-MM","name":"ชื่อกลุ่ม(ไม่บังคับ)","categories":["หมวด1","หมวด2"],"amount":3720} | {"type":"delete_budget","month":"YYYY-MM","categories":[...]} | {"type":"set_brain_targets","month":"YYYY-MM","savingsRatePct":20,"essentialMaxPct":50,"discretionaryMaxPct":30} | {"type":"reset_brain_targets","month":"YYYY-MM"} | {"type":"add_entry","entryType":"income|expense","category":"หมวด","amount":123,"date":"YYYY-MM-DD","note":"","account":"ชื่อบัญชี(ไม่บังคับ)"} | {"type":"edit_entry","id":"รหัสรายการ","amount":123,"category":"หมวด","date":"YYYY-MM-DD","note":""(ใส่เฉพาะช่องที่จะแก้)} | {"type":"delete_entry","id":"รหัสรายการ"} | {"type":"add_recurring","name":"ชื่อ","amount":199,"category":"หมวดรายจ่าย","frequency":"weekly|monthly|bimonthly|quarterly|yearly","nextDueDate":"YYYY-MM-DD"} | {"type":"set_emergency_target","targetMonths":3}. add_entry ใช้เมื่อผู้ใช้บอกชัดว่ามีรายการเกิดขึ้นจริงให้บันทึก (ไม่ใช่การสมมติ) และ categories ของรายรับ: ${JSON.stringify(CATS_BY_TYPE.income||[])}; ห้ามเดาจำนวนเงินหรือวันที่ที่ผู้ใช้ไม่ได้บอก ถ้าไม่ชัดให้ถามก่อน`,
    `- เดือนปัจจุบัน ${monthKey(todayISO())}; categories ต้องเป็นชื่อหมวดรายจ่ายที่มีจริงเท่านั้น: ${JSON.stringify(CATS_BY_TYPE.expense||[])}; 1 หมวดอยู่ได้แค่งบเดียวต่อเดือน; ออม+จำเป็น+ไม่จำเป็นรวมกันต้องไม่เกิน 100%`,
    (()=>{
      // รายการล่าสุดของผู้ใช้ — ลิสต์เดียว (รวมรายการอ้างอิงกับรายการที่แก้/ลบได้ ไม่ส่งซ้ำสองชุด) รายการที่แก้/ลบได้มี i = id
      const acc=id=>(accounts.find(a=>a.id===id)||{}).name||"";
      const editable=e=>(e.type==="income"||e.type==="expense")&&!e.source&&!e.recurringId&&e.category!=="กยศ.";
      const edit40=entries.filter(editable).slice(0,40), editIds=new Set(edit40.map(e=>e.id));
      const rows=entries.slice().sort((a,b)=>String(b.date).localeCompare(String(a.date))).slice(0,60), have=new Set(rows.map(e=>e.id));
      edit40.forEach(e=>{ if(!have.has(e.id)){ rows.push(e); have.add(e.id); } });
      const list=rows.map(e=>{ const o={}; if(editIds.has(e.id)) o.i=e.id; o.d=e.date; o.t=e.type; o.c=e.category||""; o.a=+e.amount||0; if(e.note) o.n=e.note; const an=acc(e.accountId); if(an) o.acc=an; return o; });
      window.__aiSentRows = rows.length;
      return `- รายการล่าสุดของผู้ใช้ (ใช้อ้างอิงได้ตามจริง ห้ามเดาเกินจากนี้; d=วันที่ t=ประเภท c=หมวด a=จำนวนเงิน n=โน้ต acc=บัญชี; รายการที่มี i คือรายการที่แก้/ลบได้ ให้ใส่ค่า i ในฟิลด์ id ของ action ใช้ id ตามนี้เท่านั้น ห้ามเดา id รายการที่ไม่มี i แก้/ลบไม่ได้; ถ้าผู้ใช้พูดคลุมเครือว่าหมายถึงรายการไหน ให้ถามก่อน และห้ามเสนอลบ/แก้หลายรายการพร้อมกันถ้าไม่ชัดเจน): ${JSON.stringify(list)}`;
    })(),
    "- ผู้ใช้ต้องกดยืนยันก่อนระบบถึงจะเปลี่ยนจริง ดังนั้นห้ามบอกว่า \"ปรับให้แล้ว\" ให้บอกว่าเสนอแล้วให้กดยืนยันด้านล่าง และห้ามใส่ action ถ้าผู้ใช้แค่ถามหรือขอคำแนะนำเฉยๆ ที่ไม่ได้ขอให้ปรับระบบ; ห้ามเปิดเผยบรรทัด @@ACTION@@ ในเนื้อหาคำตอบ",
    "- เมื่อออก @@ACTION@@ ระบบจะแสดงการ์ดสรุปรายละเอียด (ชื่อ จำนวนเงิน วันที่) ให้ผู้ใช้เองแล้ว ในข้อความตอบให้พูดสั้นๆ ไม่เกิน 1 ประโยค ห้ามทวนรายละเอียดซ้ำ",
    "- กฎเหล็ก: ก่อนจะออกคำสั่ง @@ACTION@@ ให้ตรวจสอบค่าปัจจุบันใน Snapshot ก่อนเสมอ หากค่าในระบบเป็นค่านั้นอยู่แล้ว หรือผู้ใช้เพิ่งกดยืนยันการปรับนั้นไปในบทสนทนา ห้ามออก @@ACTION@@ ซ้ำเด็ดขาด ให้ตอบเป็นข้อความพูดคุยตามปกติ (เช่น เกณฑ์ Brain, buffer, งบรายหมวด หรือเป้าเงินสำรองฉุกเฉินที่ตรงกับค่าปัจจุบันแล้ว หรือมีสถานะ ✓ ทำแล้วในแชทนี้)",
    "- ผู้ใช้มีทั้ง \"งบรายจ่าย\" (expenseBudget) และ \"งบรายออม / เป้าออมรายเดือน\" (savingBudget) ควบคู่กันเสมอ ทั้งสองอยู่ระดับบนสุดของ Snapshot พร้อมสรุปใน budgetOverview; เมื่อวิเคราะห์เรื่องงบประมาณ เป้าหมาย หรือการจัดสรรเงิน ต้องพูดถึงทั้งสองด้านเสมอ (เป้าออมเดือนนี้เท่าไร ออมไปแล้วเท่าไร เหลืออีกเท่าไร และงบรายจ่ายใช้ไปเท่าไร) ห้ามพูดถึงแค่งบรายจ่ายอย่างเดียว",
    `- งบรายออม: set_budget/delete_budget ใส่ "kind":"saving" ได้ โดย categories ต้องเป็นหมวดออมเท่านั้น: ${JSON.stringify(CATS_BY_TYPE.saving||[])} (หน้าแผนจะแสดงว่าเดือนนี้ออมไปแล้วเท่าไหร่เทียบเป้า) | เงินสำรองเผื่อเหตุไม่คาดฝัน: {"type":"set_buffer","month":"YYYY-MM","amount":1500} | ย้ายเศษเงินสำรองไปออม: {"type":"sweep_buffer","month":"YYYY-MM","amount":800,"category":"หมวดออม"} (เสนอได้หลายบรรทัดเพื่อแยกหมวด แต่ผลรวมต้องไม่เกินเงินสำรองที่เหลือ)`,
    (()=>{const bf=getBufferInfo();return `- บทบาท: คุณคือผู้จัดการการเงินส่วนตัวที่ฉลาด ไม่ใช่แค่เครื่องคิดเลข ทุกครั้งที่จัดสรรรายรับ/วางแผนงบ ต้องกันเงินสำรองเผื่อเหตุไม่คาดฝัน (ซ่อมรถ/ค่ารักษา/ของพัง/งานด่วน) ราว 5-10% ของรายรับ (หรือประมาณ 1 เดือนของค่าใช้จ่ายผันแปร ถ้าเงินสำรองฉุกเฉินยังไม่ถึงเป้าให้เลือกต่ำ-กลาง) แยกเป็นก้อนชัดเจน บอกเหตุผลสั้นๆ และเสนอ set_buffer คู่กับงบอื่นเสมอ; จัดลำดับ: เงินสำรองฉุกเฉินไม่ถึงเป้า > buffer > หนี้ดอกแพง > ออม/ลงทุน > ใช้ชีวิต; ${bf?`buffer เดือนนี้ตั้งไว้ ฿${bf.amount}, ใช้ไปแล้ว(รายจ่ายนอกหมวดที่ตั้งงบ) ฿${bf.used}, คงเหลือ ฿${bf.remaining}, เหลืออีก ${bf.daysLeft} วันจะสิ้นเดือน`:"ยังไม่ได้ตั้ง buffer เดือนนี้"}; ถ้าใกล้สิ้นเดือน(เหลือ ≤5 วัน) หรือผู้ใช้ถามสรุปเดือน และ buffer ยังเหลือ ให้แนะนำชัดว่าควรย้ายเศษไปไหน พร้อมจำนวนเงิน ตามลำดับความสำคัญข้างต้น (เช่น เติมเงินสำรองฉุกเฉิน → โปะหนี้ → ออมเพิ่ม) แล้วเสนอ action ที่เกี่ยวข้อง; ถ้า buffer ถูกใช้เกินให้เตือนและเสนอวิธีชดเชยจากหมวดไม่จำเป็นเดือนหน้า`;})(),
    "ถ้า queryContext.mode=month_end ให้ใช้ queryContext.plan.waterfall เป็นคำตอบหลักตามลำดับที่ให้มาโดยตรง ห้ามคำนวณใหม่ อธิบายเหตุผลของแต่ละก้อนสั้นๆ แล้วเสนอ sweep_buffer หนึ่งบรรทัดต่อหนึ่งก้อน (ใช้ category ตามที่ระบุ) ถ้า plan.note บอกว่าใช้เกิน/ยังไม่ตั้ง buffer ให้บอกตรงๆ และเสนอวิธีแก้ (เช่น ลดหมวดไม่จำเป็นเดือนหน้า หรือ set_buffer เดือนหน้า) ถ้า overBudget ไม่ว่าง ให้เตือนหมวดที่เกินด้วย",
    "ถ้า queryContext.mode=income_allocation: (1) เสนอการจัดสรรให้ครบ 100% ของรายรับ โดยมีก้อน buffer ชัดเจนในช่วง queryContext.bufferSuggested (ถ้าเงินสำรองฉุกเฉินยังขาดมากให้เลือกฝั่งต่ำของช่วง) ให้หัก buffer จากส่วน \"ไม่จำเป็น\" ก่อน เพื่อไม่ให้เปอร์เซ็นต์ออม/จำเป็นเพี้ยน (2) ตรวจว่าก้อน \"จำเป็น\" ครอบคลุมรายจ่ายประจำที่รอตัด/queryContext.upcomingBills30d แล้ว ถ้าไม่พอให้เตือนและปรับ (3) สรุปตัวเลขทุกก้อนให้รวมเท่ากับรายรับ (4) เสนอ action ให้ครบชุดในคำตอบเดียว: set_brain_targets + set_buffer และ set_budget/ออมรายหมวดถ้าเกี่ยวข้อง ไม่ต้องรอให้ถามซ้ำ",
    "หลักการทั่วไป: ตอบแบบผู้จัดการการเงินที่ลงมือทำ — เริ่มจากข้อสรุป/คำแนะนำที่ชัด ตามด้วยตัวเลขที่อ้างจาก Snapshot เท่านั้น ถ้าข้อมูลที่จำเป็นขาด (เช่น ไม่รู้รายรับจริง) ให้ถามกลับสั้นๆ 1 ข้อ แทนการเดา และถ้าผู้ใช้เสนอแก้แผนให้ปรับเฉพาะส่วนที่ขอ พร้อมบอกว่าอะไรเปลี่ยนจากเดิม",
    (()=>{const ib=getIncomeBaseline();return ib.months>=2?`- ฐานรายรับ: รายรับจริงเฉลี่ย ${ib.months} เดือนที่ผ่านมา ฿${ib.avg} (ต่ำสุด ฿${ib.min} สูงสุด ฿${ib.max}, ผันผวน ${ib.volatilityPct}%). ถ้าผันผวน >25% หรือรายรับที่ผู้ใช้สมมติสูงกว่าค่าเฉลี่ย >20% ให้คำนวณงบหมวดจำเป็นและเป้าออมจากค่าเฉลี่ย (ถ้าผันผวนมากใช้ใกล้ยอดต่ำสุด) ส่วนที่เกินให้เข้า buffer/เงินสำรองฉุกเฉินก่อน และต้องบอกผู้ใช้ชัดเจนว่าใช้ฐานไหนเพราะอะไร`:"- ฐานรายรับ: ข้อมูลรายรับย้อนหลังยังไม่พอ (<2 เดือน) ให้ใช้ยอดที่ผู้ใช้บอก แต่แนะนำให้เผื่อ buffer เพิ่มเพราะยังประเมินความผันผวนไม่ได้";})(),
    "ถ้า Snapshot มี queryContext.mode=affordability ให้ใช้ผลคำนวณนั้นโดยตรงในการอธิบายว่าเงินก้อนนี้กระทบ cash, known obligations และ minimum reserve อย่างไร ห้ามคำนวณซ้ำเอง",
    "",
    "เรื่องหนี้สิน (debts): หนี้ กยศ. เป็นหนี้เพื่อการศึกษาที่ยังอยู่ใน Grace Period (ระหว่างศึกษา) — ยังไม่มีดอกเบี้ยเดินและยังไม่ต้องผ่อนชำระรายเดือนตอนนี้",
    "ห้ามเอา debts.totalDebt ไปหักออกจาก netWorth.available หรือมองว่ากระทบสภาพคล่อง/กระแสเงินสดของเดือนนี้เด็ดขาด (Cash Flow Forecast ในระบบก็ไม่ได้หักหนี้นี้ออกเช่นกัน)",
    "ให้มองหนี้นี้เป็นภาระผูกพันระยะยาวที่แยกต่างหากจากสภาพคล่องปัจจุบัน แต่ให้นำมาพิจารณาประกอบเวลาประเมินภาพรวม Net Worth หรือแผนการเงินระยะยาวของผู้ใช้",
  ];

  if(hasProfile){
    lines.push(
      "",
      "ผู้ใช้มี User Profile (บริบท/เป้าหมาย/ข้อจำกัดทางการเงินของผู้ใช้) แนบมาด้วย — ให้นำไปใช้ประกอบคำแนะนำเสมอ ไม่ใช่ดูแค่ตัวเลขดิบใน Snapshot:",
      profile.nickname ? `- ถ้าเหมาะสม เรียกผู้ใช้ว่า "${profile.nickname}" ในคำตอบได้` : null,
      "- ถ้ามีการตั้ง minReserveTarget ไว้ ให้เทียบกับ netWorth.available เสมอ: ถ้า available ต่ำกว่า minReserveTarget อยู่แล้ว หรือจะทำให้ต่ำกว่าหลังจ่ายตามที่ผู้ใช้ถาม ให้แจ้งผลกระทบต่อเงินสำรองนี้เป็นเรื่องแรกก่อนเรื่องอื่น โดยเฉพาะเวลาผู้ใช้ถามว่าจะซื้อของชิ้นไหนไหวไหม",
      "- ถ้ามีการตั้ง monthlyIncomeEstimate ไว้ ให้เทียบกับ thisMonth.income ใน Snapshot เพื่อประเมินว่าเดือนนี้รายรับเข้ามาตามที่คาดไว้ ต่ำกว่า หรือสูงกว่า แล้วนำผลนั้นไปประกอบคำแนะนำ",
      "- ถ้ามี financialGoals ให้พิจารณาว่าคำถาม/รายจ่ายที่ผู้ใช้ถามถึง จะกระทบความคืบหน้าไปสู่เป้าหมายเหล่านั้นอย่างไร (เช่น ทำให้ต้องเลื่อนเป้าหมาย หรือยังไปถึงได้ตามกำหนด)",
      "- ถ้ามี notes (ข้อจำกัด/นิสัยการเงิน) ให้เคารพข้อจำกัดเหล่านั้นในคำแนะนำด้วย เช่น ถ้าโน้ตบอกว่าห้ามแตะเงินในบัญชีออม ก็ไม่ควรแนะนำให้ดึงเงินออมมาใช้",
      "- ไม่ต้องสั่งผู้ใช้แบบฟันธงว่า \"ห้ามซื้อ\" แต่ต้องบอกความเห็นตรงๆ ว่าแผนนี้เสี่ยงหรือไหว พร้อมผลกระทบต่อเงินสำรอง/เป้าหมายและทางเลือกที่ดีกว่า แล้วให้ผู้ใช้ตัดสินใจเอง",
      "",
      "User Profile:",
      JSON.stringify(profile),
      profile.firstName || profile.lastName || profile.age!=null ? `บริบทตัวตน: ${[profile.firstName,profile.lastName].filter(Boolean).join(" ") || ""}${profile.age!=null?` อายุ ${profile.age} ปี`:""}` : null,
      profile.statuses?.length || profile.occupation || profile.education ? `บริบทชีวิต: ${[...(profile.statuses||[]),profile.occupation,profile.workType,profile.education].filter(Boolean).join(" · ")}` : null,
      profile.personalContext ? `เกี่ยวกับผู้ใช้: ${profile.personalContext}` : null,
      profile.priorities?.length ? `สิ่งสำคัญสำหรับผู้ใช้: ${profile.priorities.join(", ")}` : null,
      profile.habits ? `นิสัยการใช้เงิน: ${profile.habits}` : null,
      profile.aiHelp ? `สิ่งที่ผู้ใช้อยากให้ AI ช่วย: ${profile.aiHelp}` : null
    );
  }

  lines.push(
    "",
    "Financial Snapshot (ตัวเลขที่คำนวณไว้แล้วทั้งหมด หน่วยเป็นบาท):",
    JSON.stringify(slimSnapshotForPrompt(snapshot))
  );

  // ===== Memory ระยะยาว — ข้อมูลสำคัญที่ผู้ใช้เคยขอให้จำไว้ข้ามการสนทนา =====
  const memory = (profile?.permissions?.memory === false ? [] : loadAIMemory().slice(-40)); // ผู้ใช้ควบคุมได้ว่า AI จะใช้ Memory หรือไม่
  lines.push(
    "",
    "ความจำระยะยาว (Memory) — ข้อมูลสำคัญที่ผู้ใช้เคยเล่าไว้ (ทั้งที่ขอให้จำและที่ระบบบันทึกอัตโนมัติ) ใช้ข้ามการสนทนา แต่ละอันมี id กำกับ:",
    memory.length ? JSON.stringify(memory) : "(ยังไม่มีอะไรถูกจำไว้)",
    "",
    "กติกาการอัปเดต Memory (สำคัญ):",
    "- Auto-Memory (บังคับ): คุณต้องตรวจจับและบันทึกข้อมูลสำคัญอัตโนมัติทุกครั้งที่ผู้ใช้เล่าในระหว่างสนทนา โดยผู้ใช้ไม่ต้องสั่งว่า \"จำไว้ด้วย\"/\"บันทึกไว้\" ข้อมูลที่ต้องจับให้ได้ ได้แก่:",
    "  (ก) แผนการเงิน/ของที่ผู้ใช้วางแผนจะซื้อ (เช่น \"จะซื้อโต๊ะทำงาน\", \"จะซื้อเก้าอี้\")",
    "  (ข) รายรับ/รายได้ที่คาดว่าจะเข้า (เช่น \"เดือนนี้จะมีเงินเข้า 25k\", \"จะได้เงินพิเศษ\")",
    "  (ค) ข้อจำกัดทางการเงิน นิสัย หรือเป้าหมายชีวิตที่ผู้ใช้เล่าให้ฟัง (รวมถึงวันเงินเดือนออกและข้อมูลอื่นที่ควรใช้ต่อในการสนทนาครั้งหน้า)",
    "- เมื่อพบข้อมูลกลุ่มนี้ ให้เพิ่มบรรทัดต่อท้ายคำตอบเสมอ (บรรทัดใหม่ แยกจากเนื้อหา) รูปแบบ: @@MEMORY_ADD@@ ข้อความที่สรุปกระชับ (ได้ใจความ เป็นข้อความเดี่ยวๆ ไม่ต้องมีวันที่กำกับ; ถ้ามีจำนวนเงินหรือกำหนดเวลาที่ผู้ใช้บอก ให้ใส่ไว้ในข้อความด้วย) และให้ทำแม้ผู้ใช้ไม่ได้ขอ ถ้าผู้ใช้บอกตรงๆ ว่า \"จำไว้ด้วย\"/\"บันทึกไว้\" ก็ทำเช่นกัน",
    "- ก่อนแปะ ให้เช็กรายการ Memory ด้านบน: ถ้าข้อมูลนั้นมีอยู่แล้วในความหมายเดียวกัน ห้ามแปะซ้ำ; ถ้าข้อมูลเดิมเปลี่ยนไป (เช่น เปลี่ยนแผน/ยอดใหม่) ให้ @@MEMORY_DELETE@@ id เดิมแล้ว @@MEMORY_ADD@@ ข้อมูลใหม่",
    "- ใช้ Memory ทั้งหมดอย่างสม่ำเสมอ: นำสิ่งที่เคยจำไว้มาเชื่อมโยง ทักท้วง และอ้างอิงในคำแนะนำทุกครั้งที่เกี่ยวข้อง (เช่น ผู้ใช้เคยบอกว่าจะซื้อโต๊ะ แล้วตอนนี้ถามเรื่องเงินเหลือ ให้โยงเรื่องโต๊ะเข้ามาเอง; ถ้าแผนที่จำไว้ขัดกับสถานะการเงินปัจจุบัน ให้ทักท้วงตรงๆ)",
    "- ถ้าผู้ใช้ขอให้ลืม/ลบความจำเรื่องใดเรื่องหนึ่ง ให้เพิ่มบรรทัด: @@MEMORY_DELETE@@ ตามด้วย id ของรายการนั้น (คัดลอก id จากรายการด้านบนให้ตรงเป๊ะ)",
    "- ใส่ directive ได้หลายบรรทัดถ้ามีหลายเรื่อง แต่ห้ามจำคำถามทั่วไป คำทักทาย เรื่องชั่วคราวที่หมดความหมายภายในวัน หรือสิ่งที่ไม่เกี่ยวกับการเงิน/ชีวิตของผู้ใช้ในระยะยาว; ห้ามเดาข้อมูลที่ผู้ใช้ไม่ได้พูด",
    "- ผู้ใช้จะไม่เห็น directive พวกนี้ (ระบบตัดออกก่อนแสดงผลให้ผู้ใช้) จึงห้ามพูดถึงมันในเนื้อหาคำตอบที่ผู้ใช้เห็น เช่น ห้ามเขียนว่า \"ผมจดไว้แล้วนะ\" ให้ตอบตามปกติแล้วแปะ directive ต่อท้ายเงียบๆ"
  );

  return lines.filter(l => l !== null).join("\n");
}

// ส่ง Snapshot + Profile + คำถามผู้ใช้ ให้ Gemini วิเคราะห์ คืน { ok:true, text } หรือ { ok:false, error }
async function analyzeFinancialQuery(query, snapshot){
  if(!aiAvailable()) return { ok:false, error:"missing_api_key" };
  if(!query || !query.trim()) return { ok:false, error:"empty_input" };

  const profile = loadAIProfile(); // null ถ้าผู้ใช้ยังไม่เคยตั้งค่า — ไม่ทำให้ query flow พังถ้าไม่มีโปรไฟล์
  const queryContext=buildAdvisorQueryContext(query,snapshot,profile);
  const systemPrompt = buildFinancialAnalystSystemPrompt({...snapshot,queryContext}, profile);

  let res;
  try{
    res = await fetchGeminiWithRetry(
      (apiKey) => `https://generativelanguage.googleapis.com/v1beta/models/${aiModelId()}:generateContent?key=${encodeURIComponent(apiKey)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: query.trim() }] }],
          systemInstruction: { parts: [{ text: systemPrompt }] },
          generationConfig: { maxOutputTokens: 4096 }
        })
      },
        2, { kind: "chat" }
    );
  }catch(e){
    return { ok:false, error:"network_error" };
  }

  if(!res.ok){
    let detail = "";
    try{ detail = (await res.text()).slice(0,300); }catch(e){}
    return { ok:false, error: res.status === 400 ? "invalid_api_key" : "api_error", detail, status: res.status };
  }

  let data;
  try{ data = await res.json(); }catch(e){ return { ok:false, error:"invalid_json" }; }

  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if(!text) return { ok:false, error:"empty_response" };

  return { ok:true, text };
}

// ===== Persistent AI Chat (ที่ปรึกษาการเงิน) — ระบบหลายแชท (เหมือน ChatGPT/Gemini) เก็บไว้ในเครื่องนี้เท่านั้น =====
// โครงสร้าง: { chats:[{id,title,messages,createdAt,updatedAt}], activeId }
function loadAllChats(){
  try{
    const raw = localStorage.getItem(AI_CHATS_KEY);
    if(raw){
      const parsed = JSON.parse(raw);
      if(parsed && Array.isArray(parsed.chats) && parsed.chats.length) return parsed;
    }
  }catch(e){}

  // ยังไม่เคยมีข้อมูลแบบหลายแชท — migrate จากประวัติแชทเดี่ยวแบบเก่า (ถ้ามี) มาเป็นแชทแรกให้อัตโนมัติ
  let migratedMessages = [];
  try{
    const oldRaw = localStorage.getItem(AI_CHAT_KEY);
    if(oldRaw){
      const oldHistory = JSON.parse(oldRaw);
      if(Array.isArray(oldHistory)) migratedMessages = oldHistory;
    }
  }catch(e){}

  const now = new Date().toISOString();
  const firstChat = {
    id: makeId(),
    title: migratedMessages.length ? chatTitleFrom(migratedMessages) : null,
    messages: migratedMessages,
    createdAt: now,
    updatedAt: now,
  };
  const data = { chats: [firstChat], activeId: firstChat.id };
  saveAllChats(data);
  return data;
}
function saveAllChats(data){
  try{ localStorage.setItem(AI_CHATS_KEY, JSON.stringify(data)); }catch(e){}
}
function chatTitleFrom(messages){
  const firstUser = (messages || []).find(m => m.role === "user");
  if(!firstUser || !firstUser.text) return "แชทใหม่";
  const t = firstUser.text.trim().replace(/\s+/g, " ");
  return t.length > 34 ? t.slice(0, 34) + "…" : (t || "แชทใหม่");
}
function chatTimeLabel(iso){
  try{
    const d = new Date(iso);
    const hh = String(d.getHours()).padStart(2,"0");
    const mm = String(d.getMinutes()).padStart(2,"0");
    return `${d.getDate()} ${THAI_MONTHS_SHORT[d.getMonth()]} ${hh}:${mm}`;
  }catch(e){ return ""; }
}
function getActiveChat(){
  const data = loadAllChats();
  let chat = data.chats.find(c => c.id === data.activeId);
  if(!chat){
    // activeId เพี้ยน/ถูกลบไปแล้ว — fallback ไปแชทล่าสุดในลิสต์
    chat = data.chats[data.chats.length - 1];
    if(chat){ data.activeId = chat.id; saveAllChats(data); }
  }
  return chat || null;
}
function loadAIChatHistory(){
  const chat = getActiveChat();
  return chat ? chat.messages : [];
}
function saveAIChatHistory(history){
  const data = loadAllChats();
  let chat = data.chats.find(c => c.id === data.activeId);
  if(!chat){
    chat = { id: makeId(), title: null, messages: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    data.chats.push(chat);
    data.activeId = chat.id;
  }
  chat.messages = history.slice(-40); // เก็บย้อนหลังไม่เกิน 40 ข้อความต่อแชท กันไฟล์บวม
  chat.updatedAt = new Date().toISOString();
  if(!chat.title) chat.title = chatTitleFrom(chat.messages);
  saveAllChats(data);
}
// ล้างเฉพาะข้อความในแชทที่เปิดอยู่ (แชทยังอยู่ในลิสต์ แต่ว่างเปล่า) — ใช้กับปุ่ม 🗑️ ในหน้าต่างแชท
function clearAIChatHistory(){
  const data = loadAllChats();
  const chat = data.chats.find(c => c.id === data.activeId);
  if(chat){ chat.messages = []; chat.title = null; chat.updatedAt = new Date().toISOString(); saveAllChats(data); }
}
// เริ่มแชทใหม่ทั้งหมด (ว่างเปล่า) แล้วสลับไปเป็นแชทที่เปิดอยู่
function createNewChat(){
  const data = loadAllChats();
  // ถ้าแชทที่เปิดอยู่ยังว่าง ใช้อันเดิมต่อ ไม่สร้างแชทว่างซ้อน
  const cur = data.chats.find(c => c.id === data.activeId);
  if(cur && (!cur.messages || cur.messages.length === 0)) return cur;
  const now = new Date().toISOString();
  const chat = { id: makeId(), title: null, messages: [], createdAt: now, updatedAt: now };
  data.chats.unshift(chat);
  data.activeId = chat.id;
  saveAllChats(data);
  return chat;
}
// สลับไปแชทอื่นตาม id
function switchToChat(id){
  const data = loadAllChats();
  if(data.chats.some(c => c.id === id)){
    // ออกจากแชทว่างที่ไม่เคยคุย → ลบทิ้ง ไม่ให้ค้างในรายการ
    const prev = data.chats.find(c => c.id === data.activeId);
    if(prev && prev.id !== id && (!prev.messages || prev.messages.length === 0)){
      data.chats = data.chats.filter(c => c.id !== prev.id);
    }
    data.activeId = id; saveAllChats(data);
  }
}
// เคลียร์แชทว่างเก่าที่ค้างอยู่ (เก็บแชทที่เปิดอยู่ไว้เสมอ แม้ว่าง)
function pruneEmptyChats(){
  try{
    const data = loadAllChats();
    const keep = data.chats.filter(c => (c.messages && c.messages.length) || c.id === data.activeId);
    if(keep.length !== data.chats.length){ data.chats = keep; saveAllChats(data); }
  }catch(e){}
}
// ลบแชททิ้งทั้งอัน — ถ้าลบอันที่กำลังเปิดอยู่ จะสลับไปแชทอื่นที่อัปเดตล่าสุด หรือสร้างแชทใหม่ถ้าไม่เหลือเลย
function deleteChat(id){
  const data = loadAllChats();
  data.chats = data.chats.filter(c => c.id !== id);
  if(!data.chats.length){
    const now = new Date().toISOString();
    data.chats.push({ id: makeId(), title: null, messages: [], createdAt: now, updatedAt: now });
  }
  if(data.activeId === id){
    const sorted = [...data.chats].sort((a,b) => (b.updatedAt||"").localeCompare(a.updatedAt||""));
    data.activeId = sorted[0].id;
  }
  saveAllChats(data);
}
