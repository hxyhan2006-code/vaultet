// Vaultet — ai/08-notify-chat.js : ศูนย์แจ้งเตือน, สถานะแชท (กำลังพิมพ์/ยกเลิก), ช่องพิมพ์รายการด้วยภาษาพูด
// (แยกจาก ai.js เดิม — โหลดเรียงตามเลขไฟล์ ทุกไฟล์ใช้ตัวแปร/ฟังก์ชันร่วมกันแบบ global)
// ===== Vaultet Notification Center: functional local engine =====
const VAULTET_NOTIF_KEY="vaultet_notifications_v1", VAULTET_NOTIF_SETTINGS_KEY="vaultet_notification_settings_v1", VAULTET_NOTIF_STATE_KEY="vaultet_notification_states_v2", VAULTET_ADVISOR_ACTIVE_KEY="vaultet_advisor_active_v1";
const DEFAULT_NOTIF_SETTINGS=Object.freeze({enabled:true,positive:true,budget:true,emergency:true,forecast:true,obligation:true,behavior:true,quiet:true});
const NOTIF_SETTING_KEYS=Object.keys(DEFAULT_NOTIF_SETTINGS);
function normalizeVaultetNotifSettings(raw){const out={...DEFAULT_NOTIF_SETTINGS};if(raw&&typeof raw==="object"&&!Array.isArray(raw))NOTIF_SETTING_KEYS.forEach(k=>{if(Object.prototype.hasOwnProperty.call(raw,k))out[k]=raw[k]===true});return out;}
function loadVaultetNotifSettings(){try{const raw=localStorage.getItem(VAULTET_NOTIF_SETTINGS_KEY);return normalizeVaultetNotifSettings(raw?JSON.parse(raw):null)}catch(e){return {...DEFAULT_NOTIF_SETTINGS}}}
function saveVaultetNotifSettings(value){const normalized=normalizeVaultetNotifSettings(value);try{localStorage.setItem(VAULTET_NOTIF_SETTINGS_KEY,JSON.stringify(normalized));return true}catch(e){return false}}
function syncVaultetNotifControls(){const s=loadVaultetNotifSettings();NOTIF_SETTING_KEYS.forEach(k=>{const el=document.getElementById({enabled:"notifEnabledInput",positive:"notifPositiveInput",budget:"notifBudgetInput",emergency:"notifEmergencyInput",forecast:"notifForecastInput",obligation:"notifObligationInput",behavior:"notifBehaviorInput",quiet:"notifQuietInput"}[k]);if(el)el.checked=s[k]});return s;}
function loadVaultetNotifications(){try{const a=JSON.parse(localStorage.getItem(VAULTET_NOTIF_KEY)||"[]");return Array.isArray(a)?a:[]}catch(e){return []}}
function saveVaultetNotifications(a){try{localStorage.setItem(VAULTET_NOTIF_KEY,JSON.stringify(a.slice(0,80)))}catch(e){}}
function loadVaultetNotifStates(){try{const x=JSON.parse(localStorage.getItem(VAULTET_NOTIF_STATE_KEY)||"{}");return x&&typeof x==="object"&&!Array.isArray(x)?x:{}}catch(e){return {}}}
function saveVaultetNotifStates(x){try{localStorage.setItem(VAULTET_NOTIF_STATE_KEY,JSON.stringify(x))}catch(e){}}
function loadVaultetAdvisorActive(){try{const x=JSON.parse(localStorage.getItem(VAULTET_ADVISOR_ACTIVE_KEY)||"[]");return Array.isArray(x)?x:[]}catch(e){return []}}
function compactVaultetNotificationHistory(){try{const a=loadVaultetNotifications(),seen=new Set(),out=[];for(const n of a){const k=`${n.day||""}|${n.type||""}|${n.title||""}|${n.body||""}`;if(seen.has(k))continue;seen.add(k);out.push(n);if(out.length>=40)break;}if(out.length!==a.length)saveVaultetNotifications(out);}catch(e){}}
function migrateVaultetNotificationHistory(){
  const key="vaultet_notification_history_v3_migrated";
  try{if(localStorage.getItem(key)==="1")return;
    const a=loadVaultetNotifications(),seen=new Set(),out=[];
    for(const n of a){
      // New philosophy: historical notifications are limited to actionable critical events.
      if(n.severity!=="critical")continue;
      const k=n.fingerprint||`${n.day||""}|${n.type||""}|${n.title||""}|${n.body||""}`;
      if(seen.has(k))continue; seen.add(k); out.push(n); if(out.length>=40)break;
    }
    saveVaultetNotifications(out); localStorage.setItem(key,"1");
  }catch(e){}
}

function saveVaultetAdvisorActive(x){try{localStorage.setItem(VAULTET_ADVISOR_ACTIVE_KEY,JSON.stringify(x.slice(0,3)))}catch(e){}}
function notifTypeEnabled(id,s){if(["EMERGENCY_LOW","A"].includes(id))return s.emergency;if(["BUDGET_OVER","BUDGET_PACE_HIGH"].includes(id))return s.budget;if(["D","CASHFLOW_NEGATIVE","FORECAST_NEGATIVE"].includes(id))return s.forecast;if(["C"].includes(id))return s.obligation;if(["B","SPENDING_SPIKE","INCOME_DROP"].includes(id))return s.behavior;if(["EMERGENCY_HEALTHY","FINANCIAL_STRENGTH"].includes(id))return s.positive;return false;}
function notificationFromFinding(f){const d=f.data||{},money=n=>`฿${fmt(Math.abs(Number(n)||0))}`;const map={BUDGET_OVER:["งบประมาณเกิน",`หมวด ${d.category||""} ใช้ไป ${money(d.spent)} จากงบ ${money(d.budget)}`],BUDGET_PACE_HIGH:["ใช้เงินเร็วเกินงบ",`หมวด ${d.category||""} มีแนวโน้มเกินงบในเดือนนี้`],EMERGENCY_LOW:["เงินสำรองฉุกเฉินต่ำ",`เงินสำรอง ${money(d.currentAvailableReserve)} ยังต่ำกว่าเป้าหมาย ${money(d.recommendedEmergencyFund)}`],A:["เงินสดต่ำกว่าเงินสำรองขั้นต่ำ",`เงินที่ใช้ได้ ${money(d.available)} ต่ำกว่าเป้าหมาย ${money(d.target)}`],D:["กระแสเงินสดตึงตัว",`คาดการณ์เงินใช้ได้ ${money(d.forecastAvailable)} — ควรเช็กภาระที่กำลังจะถึง`],C:["มีภาระสำคัญใกล้ถึงกำหนด",`${d.name||"รายการ"} ${money(d.amount)} ยังกันเงินไม่พอ`],CASHFLOW_NEGATIVE:["กระแสเงินสดติดลบ","รายจ่ายมากกว่ารายรับในช่วงปัจจุบัน"],FORECAST_NEGATIVE:["เงินอาจไม่พอถึงสิ้นช่วง","Forecast ส่งสัญญาณว่าเงินใช้ได้อาจติดลบ"],B:["ค่าใช้จ่ายหมวดหนึ่งพุ่งผิดปกติ",`หมวด ${d.category||"ไม่ระบุ"} เพิ่มขึ้นเป็น ${money(d.thisMonthAmt)} จาก ${money(d.lastMonthAmt)} เดือนก่อน`],SPENDING_SPIKE:["รายจ่ายพุ่งผิดปกติ","มีหมวดรายจ่ายที่เพิ่มขึ้นมากกว่าปกติ"],INCOME_DROP:["รายรับลดลงอย่างมีนัยสำคัญ","รายรับช่วงปัจจุบันลดลงจากช่วงก่อนหน้า"],EMERGENCY_HEALTHY:["เงินสำรองถึงเป้าหมาย","เงินสำรองของคุณอยู่ในระดับที่ตั้งไว้แล้ว"],FINANCIAL_STRENGTH:["สุขภาพการเงินแข็งแรง","ภาพรวมการเงินอยู่ในสถานะที่ดี"]};const v=map[f.id]||[proactiveRuleLabel(f.id),"มีประเด็นการเงินที่ควรตรวจสอบ"];return{title:v[0],body:v[1],icon:f.severity==="critical"?"🚨":f.severity==="warning"?"⚠️":"💡"};}
function notificationIdentity(f){
  const d=f.data||{};
  const target=d.category||d.name||d.loanId||d.debtId||d.id||f.stateKey||"global";
  let state=f.state||"active";
  if(f.id==="A")state=d.available<d.target?"critical-low":"warning-near";
  else if(f.id==="C")state=`${d.status||"upcoming"}|${d.nextDueDate||""}|${Math.round(Number(d.shortfall||0)/100)*100}`;
  else if(f.id==="B")state=`${Math.round(Number(d.pct||0)/10)*10}`;
  else if(f.id==="D")state=`${Math.round(Number(d.forecastAvailable||0)/500)*500}`;
  return {key:`${f.id}|${target}`,state};
}
function advisorPriorityScore(f){
  const base={critical:100,warning:60,positive:10}[f.severity]||0;
  const urgency={D:24,FORECAST_NEGATIVE:24,C:22,A:20,EMERGENCY_LOW:18,CASHFLOW_NEGATIVE:16,BUDGET_OVER:10,BUDGET_PACE_HIGH:7,B:6,SPENDING_SPIKE:6,INCOME_DROP:5,EMERGENCY_HEALTHY:1}[f.id]||0;
  const d=f.data||{};
  let impact=0;
  if(Number(d.shortfall)>0) impact=Math.min(15,Number(d.shortfall)/1000);
  if(Number(d.diff)>0) impact=Math.min(10,Number(d.diff)/1000);
  if(Number(d.forecastAvailable)<0) impact=Math.min(15,Math.abs(Number(d.forecastAvailable))/1000);
  return base+urgency+impact;
}
function advisorNotificationFindings(evalResult){
  const allowed=new Set(["A","B","BUDGET_OVER","BUDGET_PACE_HIGH","EMERGENCY_LOW","D","C","CASHFLOW_NEGATIVE","FORECAST_NEGATIVE","SPENDING_SPIKE","INCOME_DROP","EMERGENCY_HEALTHY"]);
  const seen=new Set(),out=[];
  const rawFindings=(evalResult.findings||[]);
  const hasForecastRisk=rawFindings.some(f=>f.id==="D"&&f.severity==="critical");
  rawFindings.forEach(f=>{
    if(hasForecastRisk && ["CASHFLOW_NEGATIVE","FORECAST_NEGATIVE"].includes(f.id)) return;
    if(!allowed.has(f.id))return;
    const ident=notificationIdentity(f), dedupeKey=ident.key+"|"+ident.state;
    if(seen.has(dedupeKey))return; seen.add(dedupeKey);
    out.push({...f,_identity:ident,priorityScore:advisorPriorityScore(f)});
  });
  return out.sort((a,b)=>b.priorityScore-a.priorityScore);
}
const VAULTET_NOTIFICATION_COOLDOWN_MS = 24*60*60*1000;
function addVaultetNotification(f,states){
  const s=loadVaultetNotifSettings();
  // Notification is reserved for genuinely actionable critical events.
  // Warnings/insights remain visible in Advisor but do not create notification history.
  if(!s.enabled||!notifTypeEnabled(f.id,s)||f.severity!=="critical")return false;
  const identity=f._identity||notificationIdentity(f), key=identity.key, prev=states[key];
  const now=Date.now();
  const previousSeverity=prev?.severity||"";
  const escalated=previousSeverity!=="critical";
  // Active + unchanged = dedupe. Once the issue is resolved, a later re-entry is a real state transition
  // and is allowed to notify again; this prevents the 24h cooldown from hiding a genuinely recurring problem.
  if(prev && prev.state===identity.state && !prev.resolvedAt)return false;
  if(prev?.resolvedAt && prev.state===identity.state && !escalated) { /* resolved → re-entered: allow one new notification */ }
  const h=new Date().getHours();
  if(s.quiet&&h>=23&&h<7){states[key]={state:identity.state,severity:f.severity,lastSeen:todayISO(),resolvedAt:null};return false;}
  const a=loadVaultetNotifications(),m=notificationFromFinding(f);
  a.unshift({id:makeId(),day:todayISO(),createdAt:new Date().toISOString(),fingerprint:key+"|"+identity.state,type:f.id,severity:f.severity,title:m.title,body:m.body,icon:m.icon,read:false,priority:f.priorityScore||f.severity});
  saveVaultetNotifications(a);
  states[key]={state:identity.state,severity:f.severity,lastSeen:todayISO(),lastNotifiedAt:new Date(now).toISOString(),resolvedAt:null};
  return true;
}
function renderVaultetNotifications(){
  const a=loadVaultetNotifications(),unread=a.filter(n=>!n.read).length,badge=document.getElementById("notificationUnreadBadge"),dot=document.getElementById("uxBellDot");
  if(badge){badge.textContent=unread;badge.style.display=unread?"flex":"none"}if(dot)dot.style.display=unread?"block":"none";
  const draw=(arr,target)=>{if(!target)return;
    const timeOf=n=>n.createdAt?new Date(n.createdAt).toLocaleTimeString("th-TH",{hour:"2-digit",minute:"2-digit"}):"";
    let lastDay="";
    target.innerHTML=arr.length?arr.map(n=>{const day=n.day||todayISO();let head="";if(day!==lastDay){lastDay=day;head=`<div class="notification-day">${escapeHtml(dayHeading(day))}</div>`;}
      return head+`<div class="notification-item ${n.read?"":"unread"}" data-notif-id="${escapeHtml(n.id)}"><div class="notification-icon">${vaultetIcon(n.icon)}</div><div class="notification-content"><div class="notification-item-title">${escapeHtml(n.title)}</div><div class="notification-item-body">${escapeHtml(n.body)}</div></div><div class="notification-time">${escapeHtml(timeOf(n))}</div></div>`;}).join(""):"<div class=\"notification-empty\">ยังไม่มีการแจ้งเตือน</div>";
    target.querySelectorAll("[data-notif-id]").forEach(el=>el.onclick=()=>{const x=loadVaultetNotifications(),n=x.find(v=>v.id===el.dataset.notifId);if(n)n.read=true;saveVaultetNotifications(x);renderVaultetNotifications()})};
  const active=loadVaultetAdvisorActive();
  const current=active.slice(0,3);
  const dashboardTarget=document.getElementById("notificationPreviewList");
  if(dashboardTarget && window.vaultetRenderAdvisorPreview){ window.vaultetRenderAdvisorPreview(current); }
  draw(a,document.getElementById("notificationFullList"));const countEl=document.getElementById("notificationHistoryCount");if(countEl)countEl.textContent=String(a.length);const sub=document.getElementById("notificationDashboardSub");if(sub)sub.textContent=current.length?`คัดมา ${current.length} เรื่องที่สำคัญที่สุด` : "ตอนนี้ไม่มีเรื่องสำคัญ — Insight อื่นอยู่ใน Advisor";
}
function toggleNotificationSettings(){const panel=document.getElementById("notificationSettingsPanel"),btn=document.getElementById("notificationSettingsToggle");if(!panel||!btn)return;const open=panel.hidden;panel.hidden=!open;btn.setAttribute("aria-expanded",String(open));if(open)setTimeout(()=>panel.querySelector("input,button")?.focus({preventScroll:true}),0);}
function openVaultetNotificationCenter(){syncVaultetNotifControls();renderVaultetNotifications();document.getElementById("notificationOverlay")?.classList.add("open")}
function closeVaultetNotificationCenter(){document.getElementById("notificationOverlay")?.classList.remove("open")}
function renderAdvisorReviewCard(snapshot,profile){
  const card=document.getElementById('notificationDashboardCard'); if(!card)return;
  const result=getAdvisorIntelligence(snapshot,profile||{});
  const current=result.topPriorities||[];
  const sub=document.getElementById('notificationDashboardSub');
  if(sub)sub.textContent=current.length?`คัดมา ${current.length} เรื่องที่มีผลกระทบสูงสุด`:'ตอนนี้ไม่มีเรื่องสำคัญที่ต้องลงมือทำ';
  const target=document.getElementById('notificationPreviewList');
  if(!target)return;
  if(!current.length){target.innerHTML='<div class="notification-empty">ตอนนี้ทุกอย่างค่อนข้างเสถียร — ไม่มีเรื่องที่ต้องจัดการเป็นพิเศษ</div>';return;}
  if(window.vaultetRenderAdvisorPreview) window.vaultetRenderAdvisorPreview(current.map(f=>({type:f.id,severity:f.severity,evidence:f.evidence||[],action:f.action||'',data:f.data||{}})));
}
function checkVaultetNotifications(){try{
  const snap=buildFinancialSnapshot();
  const result=evaluateProactiveRules(snap,loadAIProfile());
  const current=advisorNotificationFindings(result),states=loadVaultetNotifStates(),activeKeys=new Set(current.map(f=>f._identity.key));
  const nowIso=new Date().toISOString();
  Object.keys(states).forEach(k=>{
    if(!activeKeys.has(k) && !states[k].resolvedAt) states[k]={...states[k],resolvedAt:nowIso};
  });
  current.forEach(f=>addVaultetNotification(f,states));
  saveVaultetNotifStates(states);
  const activeForAdvisor=(result.intelligence?.topPriorities||[]).slice(0,3).map(f=>{
    const m=notificationFromFinding(f);
    const title=f.id==='CATEGORY_SPIKE'?`หมวด ${f.data?.category||''} สูงกว่าปกติ`:f.id==='SPENDING_ABOVE_BASELINE'?'รายจ่ายรวมสูงกว่าระดับปกติ':f.id==='SAVINGS_PACE'?'จังหวะการออมช้าลง':f.id==='INCOME_BELOW_BASELINE'?'รายรับต่ำกว่าระดับปกติ':m.title;
    return{type:f.id,severity:f.severity,title,body:f.action||m.body,icon:f.severity==='critical'?'🚨':'⚠️',priority:f.priorityScore,state:f.state,confidence:f.confidence,evidence:f.evidence||[],action:f.action||'',data:f.data||{}};
  });
  saveVaultetAdvisorActive(activeForAdvisor);
  renderAdvisorReviewCard(snap,loadAIProfile());
}catch(e){}renderVaultetNotifications();}
function initVaultetNotifications(){
  migrateVaultetNotificationHistory();
  syncVaultetNotifControls();
  const ids={enabled:"notifEnabledInput",positive:"notifPositiveInput",budget:"notifBudgetInput",emergency:"notifEmergencyInput",forecast:"notifForecastInput",obligation:"notifObligationInput",behavior:"notifBehaviorInput",quiet:"notifQuietInput"};
  Object.entries(ids).forEach(([key,id])=>{const el=document.getElementById(id);if(!el||el.dataset.vaultetBound==="1")return;el.dataset.vaultetBound="1";el.addEventListener("change",()=>{const current=loadVaultetNotifSettings();current[key]=!!el.checked;saveVaultetNotifSettings(current);syncVaultetNotifControls();checkVaultetNotifications();});});
  document.getElementById("closeNotificationBtn")?.addEventListener("click",closeVaultetNotificationCenter);document.getElementById("notificationOverlay")?.addEventListener("click",e=>{if(e.target.id==="notificationOverlay")closeVaultetNotificationCenter()});document.getElementById("markNotificationsReadBtn")?.addEventListener("click",()=>{const a=loadVaultetNotifications();a.forEach(n=>n.read=true);saveVaultetNotifications(a);renderVaultetNotifications();showToast("อ่านการแจ้งเตือนทั้งหมดแล้ว")});document.getElementById("clearNotificationsBtn")?.addEventListener("click",()=>{saveVaultetNotifications([]);renderVaultetNotifications();showToast("ล้างประวัติการแจ้งเตือนแล้ว")});
  document.getElementById("requestNotificationBtn")?.addEventListener("click",async()=>{if(!("Notification"in window)){showToast("เบราว์เซอร์นี้ไม่รองรับการแจ้งเตือน");return}try{const p=await Notification.requestPermission();document.getElementById("notificationPermissionBox").textContent=p==="granted"?"เปิดการแจ้งเตือนบนเครื่องแล้ว":"ยังไม่ได้อนุญาตการแจ้งเตือนบนเครื่อง"}catch(e){showToast("เปิดการแจ้งเตือนไม่สำเร็จ")} });
  compactVaultetNotificationHistory(); window.addEventListener("storage",e=>{if(e.key===VAULTET_NOTIF_SETTINGS_KEY){syncVaultetNotifControls();renderVaultetNotifications();}});renderVaultetNotifications();setTimeout(checkVaultetNotifications,300);setInterval(checkVaultetNotifications,300000);
}
setTimeout(initVaultetNotifications,0);
window.addEventListener("storage",e=>{if(e.key===VAULTET_NOTIF_SETTINGS_KEY){syncVaultetNotifControls();renderVaultetNotifications()}});

// --- UI: #aiProactiveCard บน Dashboard ---
const PROACTIVE_SEVERITY_META = {
  critical: { icon:"🚨", color:"var(--expense)" },
  warning:  { icon:"⚠️", color:"var(--transfer)" },
  positive: { icon:"💡", color:"var(--saving)" },
};
let proactiveCardBusy = false;
// ===== Persistent AI Chat: state สำหรับ typing indicator / ยกเลิกการเรียก / แก้ไขข้อความ =====
let aiChatBusy = false;
let aiChatAbortController = null;
let aiChatEditingIndex = null; // ถ้าไม่ใช่ null แปลว่ากำลังแก้ไขข้อความเดิม index นี้อยู่ — ตอนส่งใหม่จะตัดประวัติตั้งแต่จุดนี้ก่อน
// Request state อยู่ระดับ app/session ไม่ผูกกับหน้า Advisor เพื่อให้ loading อยู่ต่อเมื่อเปลี่ยนหน้า
let aiRequestState = null;
function getChatById(id){
  const data=loadAllChats();
  return data.chats.find(c=>c.id===id)||null;
}
function saveAIChatHistoryForChat(chatId, history){
  if(!chatId) return false;
  const data=loadAllChats();
  const chat=data.chats.find(c=>c.id===chatId);
  if(!chat) return false;
  chat.messages=history.slice(-40);
  chat.updatedAt=new Date().toISOString();
  if(!chat.title) chat.title=chatTitleFrom(chat.messages);
  saveAllChats(data);
  return true;
}
function isAiRequestCurrent(requestId){ return !!(aiRequestState && aiRequestState.id===requestId && aiRequestState.status==='pending'); }
function isAdvisorPageActive(){ return document.body.classList.contains('ux-chat-active'); }

function renderProactiveCard(severity, text, state, errorInfo){
  const card = document.getElementById("aiProactiveCard");
  if(!card) return;
  const meta = PROACTIVE_SEVERITY_META[severity] || PROACTIVE_SEVERITY_META.positive;
  card.style.display = "block";
  card.style.borderColor = meta.color;
  document.getElementById("aiProactiveIcon").innerHTML = vaultetIcon(meta.icon);

  const bodyEl = document.getElementById("aiProactiveBody");
  if(state === "loading"){
    bodyEl.innerHTML = `<span style="color:var(--faint)">กำลังวิเคราะห์สถานะการเงิน...</span>`;
  }else if(state === "needsApiKey"){
    // ยังไม่มี API Key: ไม่โชว์การ์ดบนหน้าหลัก (ไม่ต้องมีข้อความเตือนให้ไปตั้งค่าทุกครั้งที่เปิดแอป)
    card.style.display = "none";
  }else if(state === "error" && !text){
    const label = (errorInfo && AI_ERROR_MESSAGES[errorInfo.error]) || "เรียก AI ไม่สำเร็จ";
    const codeLine = errorInfo && errorInfo.error ? `<br><span style="font-size:11px;opacity:0.65;">โค้ด: ${escapeHtml(errorInfo.error)}${errorInfo.status ? " (HTTP " + errorInfo.status + ")" : ""}</span>` : "";
    const detailLine = errorInfo && errorInfo.detail ? `<br><span style="font-size:11px;opacity:0.65;">${escapeHtml(errorInfo.detail)}</span>` : "";
    bodyEl.innerHTML = `<span style="color:var(--faint)">${label} — กดปุ่มรีเฟรชเพื่อลองใหม่${codeLine}${detailLine}</span>`;
  }else if(text){
    bodyEl.innerHTML = simpleMarkdownToHtml(text);
  }else{
    card.style.display = "none";
  }
}

// เรียกประเมิน + สร้างการ์ดใหม่เฉพาะเมื่อจำเป็น (cache miss หรือ force=true)
async function refreshProactiveCard(force){
  if(proactiveCardBusy) return;
  const card = document.getElementById("aiProactiveCard");
  if(!card) return;

  const snapshot = buildFinancialSnapshot();
  const profile = loadAIProfile();
  const evalResult = evaluateProactiveRules(snapshot, profile);
  const fingerprint = getProactiveDataFingerprint(snapshot) + '|' + JSON.stringify(evalResult.intelligence?.topPriorities||[]);

  const cache = loadProactiveCache();
  // Milestone 4 fix: ต้องเช็ควันที่ด้วยเสมอ — ข้ามวันใหม่ต้องประเมิน/ดึง Insight ใหม่ทุกครั้ง แม้ fingerprint จะเหมือนเดิม
  const cacheValid = !!cache && cache.generatedAt === todayISO() && cache.fingerprint === fingerprint
    && cache.topRuleId === evalResult.topRuleId && cache.severity === evalResult.severity;

  if(cacheValid && !force){
    renderProactiveCard(evalResult.severity, cache.text);
    return;
  }

  if(!aiAvailable()){
    renderProactiveCard(evalResult.severity, null, "needsApiKey");
    return;
  }

  proactiveCardBusy = true;
  renderProactiveCard(evalResult.severity, null, "loading");

  const result = await generateProactiveInsight(evalResult, snapshot, profile);
  proactiveCardBusy = false;

  if(!result.ok){
    // เรียก AI ไม่สำเร็จ — ถ้ามีแคชเก่าอยู่ (แม้ fingerprint จะเปลี่ยนไปแล้ว) ให้โชว์ไว้ก่อนดีกว่าไม่มีอะไรเลย
    renderProactiveCard(evalResult.severity, cache ? cache.text : null, "error", { error: result.error, detail: result.detail, status: result.status });
    return;
  }

  saveProactiveCache({
    fingerprint, topRuleId: evalResult.topRuleId, severity: evalResult.severity,
    text: result.text, generatedAt: todayISO()
  });
  renderProactiveCard(evalResult.severity, result.text);
}

document.getElementById("aiProactiveRefreshBtn").addEventListener("click", (e) => {
  e.stopPropagation();
  refreshProactiveCard(true);
});

// ===== AI Layer (Milestone 1): NL Input UI (Bottom Sheet) =====
function closeAiInputSheet(){
  document.getElementById("aiInputOverlay").classList.remove("open");
}
document.getElementById("aiFabBtn").addEventListener("click", () => {
  if(!aiAvailable()){
    showToast("ใส่ Gemini API Key ก่อนถึงจะใช้ AI ได้");
    if(window.vaultetOpenAiSettings) window.vaultetOpenAiSettings();
    return;
  }
  document.getElementById("aiInputText").value = "";
  document.getElementById("aiInputError").style.display = "none";
  document.getElementById("aiInputOverlay").classList.add("open");
  document.getElementById("aiInputText").focus();
});
document.getElementById("closeAiInputBtn").addEventListener("click", closeAiInputSheet);
document.getElementById("aiInputOverlay").addEventListener("click", closeAiInputSheet);

const AI_ERROR_MESSAGES = {
  missing_api_key: "ยังไม่ได้ตั้งค่า API Key",
  empty_input: "พิมพ์ข้อความก่อน",
  invalid_api_key: "API Key ไม่ถูกต้อง หรือหมดสิทธิ์ใช้งาน",
  api_error: "เรียก AI ไม่สำเร็จ ลองใหม่อีกครั้ง",
  empty_response: "AI ไม่ตอบกลับข้อมูล ลองพิมพ์ใหม่อีกครั้ง",
  invalid_ai_response: "AI ตอบกลับมาไม่สมบูรณ์ ลองพิมพ์ใหม่อีกครั้ง",
  invalid_json: "แปลผลลัพธ์จาก AI ไม่สำเร็จ ลองพิมพ์ใหม่อีกครั้ง",
  network_error: "เชื่อมต่อไม่สำเร็จ ตรวจสอบอินเทอร์เน็ต",
  aborted: "ยกเลิกแล้ว"
};
// ข้อความ error ที่เป็นมิตร — เคส HTTP 429 อธิบายละเอียดกว่าเดิม เพราะเป็นได้ทั้ง 2 แบบ:
// (1) โควต้าฟรีต่อนาทีเต็มชั่วคราว — ระบบ retry อัตโนมัติไปแล้วแต่ยังไม่ผ่าน รอไม่นานก็หาย
// (2) โควต้าฟรีต่อวันเต็ม (ใช้ถี่ทั้งวัน) — retry ไม่ช่วย ต้องรอข้ามวันหรือเช็ค Google AI Studio
function aiErrorLabel(result){
  if(result && result.status === 429){
    return "Gemini แจ้งว่าเรียกถี่/บ่อยเกินไป (โควต้าฟรีเต็มชั่วคราว) — ระบบลองซ้ำอัตโนมัติให้แล้วแต่ยังไม่ผ่าน ลองรอสัก 1-2 นาทีแล้วกดใหม่ ถ้ารอนานแล้วยังไม่หาย อาจเป็นโควต้ารายวันเต็ม (ต้องรอข้ามวัน หรือเช็คโควต้า Key ที่ aistudio.google.com)";
  }
  if(result && result.status === 503) return "เซิร์ฟเวอร์ Gemini ยุ่งอยู่ (503) ระบบลองซ้ำให้แล้วแต่ยังไม่ผ่าน รอสักครู่แล้วกดใหม่";
  const base = (result && AI_ERROR_MESSAGES[result.error]) || "เกิดข้อผิดพลาด ลองใหม่อีกครั้ง";
  return base + (result && result.status ? ` (รหัส ${result.status})` : "");
}

// ===== AI Layer (Milestone 2 → อัปเกรดเป็นแชทถาวร): Financial Advisor sheet =====
// บันทึกคำถาม+คำตอบลงประวัติแชทถาวร (ไม่ใช่ popup ครั้งเดียวทิ้งเหมือนเดิม) แล้วเปิดหน้าต่างแชท
function openAiAnalystSheet(query, analysisText){
  const history = loadAIChatHistory();
  history.push({ role:"user", text: query });
  history.push({ role:"model", text: analysisText });
  saveAIChatHistory(history);
  renderAiChatBubbles();
  document.getElementById("aiAnalystOverlay").classList.add("open");
  clearAiChatUnread();
}
function closeAiAnalystSheet(){
  document.getElementById("aiAnalystOverlay").classList.remove("open");
}
document.getElementById("aiAnalystOverlay").addEventListener("click", closeAiAnalystSheet);

document.getElementById("clearAiChatBtn").addEventListener("click", (e) => {
  e.stopPropagation();
  if(aiChatAbortController) aiChatAbortController.abort();
  aiChatEditingIndex = null;
  clearAIChatHistory();
  renderAiChatBubbles();
  document.getElementById("aiChatError").style.display = "none";
});
