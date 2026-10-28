// Vaultet — ai/05-memory-status.js : ความจำระยะยาว, สถานะคีย์ล่าสุด, สถานะการเรียก AI ตามจริง
// (แยกจาก ai.js เดิม — โหลดเรียงตามเลขไฟล์ ทุกไฟล์ใช้ตัวแปร/ฟังก์ชันร่วมกันแบบ global)
// ===== Memory ระยะยาว (เหมือนระบบ Memory ของ AI ทั่วไป) — [{id,text,createdAt}] เก็บในเครื่องนี้เท่านั้น =====
function loadAIMemory(){
  try{
    const raw = localStorage.getItem(AI_MEMORY_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  }catch(e){ return []; }
}
function saveAIMemory(list){
  try{ localStorage.setItem(AI_MEMORY_KEY, JSON.stringify(list)); }catch(e){}
}
function addMemoryEntry(text){
  const t = (text || "").trim();
  if(!t) return;
  const mem = loadAIMemory();
  mem.push({ id: makeId(), text: t, createdAt: new Date().toISOString() });
  saveAIMemory(mem);
}
function deleteMemoryEntry(id){
  saveAIMemory(loadAIMemory().filter(m => m.id !== id));
}
// AI แปะ directive ท้ายคำตอบเพื่อขอเพิ่ม/ลบความจำเอง เช่น "@@MEMORY_ADD@@ ข้อความ" หรือ "@@MEMORY_DELETE@@ id"
// ฟังก์ชันนี้ดึง directive ออกมา พร้อมคืนข้อความที่ตัด directive ออกแล้ว (สำหรับเอาไปแสดง/บันทึกในแชทจริง)
function extractMemoryDirectives(text){
  if(!text) return { cleaned: text, adds: [], dels: [] };
  const adds = [];
  const dels = [];
  const addRe = /^@@MEMORY_ADD@@\s*(.+)$/gm;
  const delRe = /^@@MEMORY_DELETE@@\s*(.+)$/gm;
  let m;
  while((m = addRe.exec(text))) adds.push(m[1].trim());
  while((m = delRe.exec(text))) dels.push(m[1].trim());
  const cleaned = text
    .replace(/^@@MEMORY_ADD@@.*$/gm, "")
    .replace(/^@@MEMORY_DELETE@@.*$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return { cleaned, adds, dels };
}
function applyMemoryDirectives(adds, dels){
  if(!adds.length && !dels.length) return;
  let mem = loadAIMemory();
  dels.forEach(d => {
    if(!d) return;
    // ลบตาม id ตรงๆ ถ้ามี หรือลบรายการที่เนื้อหาตรงกับข้อความที่ AI ส่งมา (กันกรณี AI จำ id ไม่แม่น)
    mem = mem.filter(item => item.id !== d && item.text !== d);
  });
  adds.forEach(a => { if(a) mem.push({ id: makeId(), text: a, createdAt: new Date().toISOString() }); });
  saveAIMemory(mem);
}
// จัดการผลลัพธ์จาก AI ก่อนเอาไปแสดง/บันทึกจริง — ดึง directive ออก อัปเดต memory แล้วคืนข้อความที่สะอาดแล้ว
let __pendingActions=[];
function takePendingActions(){ const a=__pendingActions; __pendingActions=[]; return a; }
function sanitizeAiAction(a){
  if(!a||typeof a!=="object") return null;
  const month=/^\d{4}-\d{2}$/.test(String(a.month||""))?String(a.month):monthKey(todayISO());
  const valid=new Set(a.kind==="saving"?(CATS_BY_TYPE.saving||[]):(CATS_BY_TYPE.expense||[])), kind=(a.kind==="saving"?"saving":"expense"), cats=Array.isArray(a.categories)?Array.from(new Set(a.categories.map(String))).filter(c=>valid.has(c)):[];
  const n=v=>{v=Number(v);return isFinite(v)&&v>=0&&v<=100?Math.round(v):null;};
  if(a.type==="set_budget"){ const amount=Number(a.amount); if(!cats.length||!isFinite(amount)||amount<0) return null; return {type:a.type,kind,month,categories:cats,name:String(a.name||"").slice(0,30),amount:Math.round(amount*100)/100,status:"pending"}; }
  if(a.type==="delete_budget"){ if(!cats.length) return null; return {type:a.type,kind,month,categories:cats,status:"pending"}; }
  if(a.type==="sweep_buffer"){ const amount=Number(a.amount); if(!isFinite(amount)||amount<=0||amount>10000000) return null; const sc=CATS_BY_TYPE.saving||[]; const cat=sc.includes(String(a.category||""))?String(a.category):(sc.includes("เงินออม")?"เงินออม":sc[0]); if(!cat) return null; return {type:a.type,month,amount:Math.round(amount*100)/100,category:cat,status:"pending"}; }
  if(a.type==="set_buffer"){ const amount=Number(a.amount); if(!isFinite(amount)||amount<0||amount>10000000) return null; return {type:a.type,month,amount:Math.round(amount*100)/100,status:"pending"}; }
  if(a.type==="set_brain_targets"){ const s=n(a.savingsRatePct),e=n(a.essentialMaxPct),d=n(a.discretionaryMaxPct); if(s==null||e==null||d==null||s+e+d>100) return null; return {type:a.type,month,savingsRatePct:s,essentialMaxPct:e,discretionaryMaxPct:d,status:"pending"}; }
  if(a.type==="reset_brain_targets") return {type:a.type,month,status:"pending"};
  if(a.type==="add_entry"){ const type=a.type2||a.entryType||a.kind; const et=(a.entryType==="income"||a.entryType==="expense")?a.entryType:null, amount=Number(a.amount), date=/^\d{4}-\d{2}-\d{2}$/.test(String(a.date||""))?String(a.date):todayISO(), cat=String(a.category||"");
    if(!et||!isFinite(amount)||amount<=0||!(CATS_BY_TYPE[et]||[]).includes(cat)) return null;
    return {type:"add_entry",entryType:et,category:cat,amount:Math.round(amount*100)/100,date,note:String(a.note||"").slice(0,80),account:String(a.account||"").slice(0,40),status:"pending"}; }
  if(a.type==="edit_entry"||a.type==="delete_entry"){
    const e=entries.find(x=>x.id===String(a.id||"")); if(!e||(e.type!=="income"&&e.type!=="expense")||e.source||e.recurringId||e.category==="กยศ.") return null;
    if(a.type==="delete_entry") return {type:a.type,id:e.id,status:"pending"};
    const ch={}; if(a.amount!=null){const v=Number(a.amount); if(!isFinite(v)||v<=0) return null; ch.amount=Math.round(v*100)/100;}
    if(a.category!=null){ if(!(CATS_BY_TYPE[e.type]||[]).includes(String(a.category))||a.category==="กยศ.") return null; ch.category=String(a.category); }
    if(a.date!=null){ if(!/^\d{4}-\d{2}-\d{2}$/.test(String(a.date))) return null; ch.date=String(a.date); }
    if(a.note!=null) ch.note=String(a.note).slice(0,80);
    if(!Object.keys(ch).length) return null; return {type:a.type,id:e.id,changes:ch,status:"pending"};
  }
  if(a.type==="add_recurring"){ const amount=Number(a.amount), cat=String(a.category||""), fr=["weekly","monthly","bimonthly","quarterly","yearly"].includes(a.frequency)?a.frequency:"monthly", due=/^\d{4}-\d{2}-\d{2}$/.test(String(a.nextDueDate||""))?String(a.nextDueDate):null, name=String(a.name||"").trim().slice(0,40);
    if(!name||!isFinite(amount)||amount<=0||!(CATS_BY_TYPE.expense||[]).includes(cat)||!due) return null;
    return {type:"add_recurring",name,amount:Math.round(amount*100)/100,category:cat,frequency:fr,nextDueDate:due,account:String(a.account||"").slice(0,40),status:"pending"}; }
  if(a.type==="set_emergency_target"){ const m=Number(a.targetMonths); if(!isFinite(m)||m<1||m>24) return null; return {type:a.type,targetMonths:Math.round(m*10)/10,status:"pending"}; }
  return null;
}
function describeAiAction(a){
  const ml=monthLabel(a.month), nm=a.name||(a.categories||[]).join(" + ");
  if(a.type==="set_budget") return `${a.kind==="saving"?"ตั้งเป้าออม":"ตั้งงบ"} "${nm}" ${ml} = ฿${fmt(a.amount)}`;
  if(a.type==="delete_budget") return `ลบ${a.kind==="saving"?"เป้าออม":"งบ"} "${nm}" ${ml}`;
  if(a.type==="sweep_buffer") return `ย้ายเศษเงินสำรอง ฿${fmt(a.amount)} ไปออมหมวด "${a.category}"`;
  if(a.type==="set_buffer") return `ตั้งเงินสำรองเผื่อเหตุไม่คาดฝัน ${ml} = ฿${fmt(a.amount)}`;
  if(a.type==="set_brain_targets"){ const o=getBrainTargets(a.month); return `เกณฑ์ Brain ${ml}: ออม ≥${a.savingsRatePct}% · จำเป็น ≤${a.essentialMaxPct}% · ไม่จำเป็น ≤${a.discretionaryMaxPct}% (เดิม ${o.savingsRatePct}/${o.essentialMaxPct}/${o.discretionaryMaxPct})`; }
  if(a.type==="add_entry") return `บันทึก${a.entryType==="income"?"รายรับ":"รายจ่าย"} ${a.category} ฿${fmt(a.amount)} วันที่ ${a.date}${a.note?` (${a.note})`:""}`;
  if(a.type==="edit_entry"||a.type==="delete_entry"){ const e=entries.find(x=>x.id===a.id); const row=e?`${e.date} ${e.category} ฿${fmt(e.amount)}${e.note?` (${e.note})`:""}`:"(ไม่พบรายการแล้ว)";
    if(a.type==="delete_entry") return `ลบรายการ: ${row}`;
    const c=a.changes||{}; return `แก้รายการ: ${row} → ${[c.category,c.amount!=null?"฿"+fmt(c.amount):null,c.date,c.note!=null?`"${c.note}"`:null].filter(Boolean).join(" · ")}`; }
  if(a.type==="add_recurring") return `เพิ่มรายจ่ายประจำ "${a.name}" ฿${fmt(a.amount)} (${a.category}) ครบกำหนดแรก ${a.nextDueDate}`;
  if(a.type==="set_emergency_target") return `ตั้งเป้าเงินสำรองฉุกเฉิน ${a.targetMonths} เดือน (เดิม ${emergencyFundConfig.targetMonths})`;
  return `คืนเกณฑ์ Brain ${ml} เป็นค่าเริ่มต้น`;
}
function __aiAcct(name){ const n=String(name||"").trim(); return (n&&accounts.find(x=>x.name===n))||accounts.find(x=>x.id!==UNASSIGNED_ACCOUNT_ID)||accounts[0]; }
function __readTargets(){ let o={}; try{o=JSON.parse(localStorage.getItem(BRAIN_TARGETS_KEY)||"{}");}catch(e){} o.months=o.months||{}; return o; }
function executeAiAction(a){
  const now=new Date().toISOString();
  if(a.type==="set_budget"||a.type==="delete_budget"){
    const kind=a.kind==="saving"?"saving":"expense", key=bKey(a.month,a.categories,kind);
    const clash=budgets.find(x=>x.enabled!==false&&x.month===a.month&&(x.kind||"expense")===kind&&budgetKey(x)!==key&&x.categories.some(c=>a.categories.includes(c)));
    if(a.type==="set_budget"&&clash) return {ok:false,msg:`หมวดซ้ำกับงบ "${clash.category}"`};
    const ex=budgets.find(x=>x.enabled!==false&&budgetKey(x)===key), prev=ex?JSON.parse(JSON.stringify(ex)):null;
    if(a.type==="delete_budget"){ if(!ex) return {ok:false,msg:"ไม่พบงบนี้"}; budgets=budgets.filter(x=>x!==ex); saveBudgets(); return {ok:true,undo:{kind:"budget",key,prev}}; }
    if(ex){ ex.amount=a.amount; ex.name=a.name; ex.category=a.name||a.categories.join(" + "); ex.updatedAt=now; }
    else budgets.push({id:makeId(),kind,category:a.name||a.categories.join(" + "),categories:a.categories,name:a.name,amount:a.amount,period:"monthly",month:a.month,enabled:true,createdAt:now,updatedAt:now});
    saveBudgets(); return {ok:true,undo:{kind:"budget",key,prev}};
  }
  if(a.type==="sweep_buffer"){ const r=sweepBufferToSaving(a.month,a.amount,a.category); if(!r.ok) return {ok:false,msg:r.msg}; return {ok:true,undo:{kind:"sweep",month:a.month,entryId:r.entry.id,amount:r.amount}}; }
  if(a.type==="set_buffer"){ const o=__readBuffer(), prev=o.months[a.month]==null?null:o.months[a.month]; o.months[a.month]=a.amount; localStorage.setItem(BUFFER_KEY,JSON.stringify(o)); return {ok:true,undo:{kind:"buffer",month:a.month,prev}}; }
  if(a.type==="set_brain_targets"||a.type==="reset_brain_targets"){
    const o=__readTargets(), prev=o.months[a.month]||null;
    if(a.type==="set_brain_targets") o.months[a.month]={savingsRatePct:a.savingsRatePct,essentialMaxPct:a.essentialMaxPct,discretionaryMaxPct:a.discretionaryMaxPct}; else delete o.months[a.month];
    localStorage.setItem(BRAIN_TARGETS_KEY,JSON.stringify(o)); return {ok:true,undo:{kind:"targets",month:a.month,prev}};
  }
  if(a.type==="add_entry"){
    const acc=__aiAcct(a.account), r=commitEntry({type:a.entryType,category:a.category,accountId:acc?acc.id:UNASSIGNED_ACCOUNT_ID,amount:a.amount,date:a.date,note:a.note});
    if(!r||!r.ok) return {ok:false,msg:"บันทึกรายการไม่สำเร็จ"}; return {ok:true,undo:{kind:"entry",id:r.entry.id}};
  }
  if(a.type==="edit_entry"||a.type==="delete_entry"){
    const idx=entries.findIndex(x=>x.id===a.id); if(idx<0) return {ok:false,msg:"ไม่พบรายการนี้แล้ว"};
    const prev=JSON.parse(JSON.stringify(entries[idx]));
    if(a.type==="delete_entry") entries.splice(idx,1); else Object.assign(entries[idx],a.changes);
    saveEntries(); return {ok:true,undo:{kind:a.type,prev,idx}};
  }
  if(a.type==="add_recurring"){
    const acc=__aiAcct(a.account); if(!acc) return {ok:false,msg:"ยังไม่มีบัญชี"};
    const id=makeId(); recurringExpenses.push({id,name:a.name,amount:a.amount,category:a.category,accountId:acc.id,frequency:a.frequency,nextDueDate:a.nextDueDate,startDate:a.nextDueDate,endDate:"",note:"",status:"active",reservedItemId:"",lastPaidDate:""});
    saveRecurring(); return {ok:true,undo:{kind:"recurring",id}};
  }
  if(a.type==="set_emergency_target"){ const prev=emergencyFundConfig.targetMonths; emergencyFundConfig=normalizeEmergencyConfig({targetMonths:a.targetMonths,essentialCategories:emergencyFundConfig.essentialCategories}); saveEmergencyFundConfig(); return {ok:true,undo:{kind:"emergency",prev}}; }
  return {ok:false,msg:"ไม่รู้จักคำสั่ง"};
}
function undoAiAction(u){
  if(u.kind==="budget"){ budgets=budgets.filter(x=>!(x.enabled!==false&&budgetKey(x)===u.key)); if(u.prev) budgets.push(normalizeBudget(u.prev)); saveBudgets(); }
  else if(u.kind==="sweep"){ entries=entries.filter(e=>e.id!==u.entryId); saveEntries(); const o=__readBuffer(); o.swept=o.swept||{}; o.swept[u.month]=Math.max(0,Math.round((Number(o.swept[u.month]||0)-u.amount)*100)/100); localStorage.setItem(BUFFER_KEY,JSON.stringify(o)); }
  else if(u.kind==="buffer"){ const o=__readBuffer(); if(u.prev==null) delete o.months[u.month]; else o.months[u.month]=u.prev; localStorage.setItem(BUFFER_KEY,JSON.stringify(o)); }
  else if(u.kind==="targets"){ const o=__readTargets(); if(u.prev) o.months[u.month]=u.prev; else delete o.months[u.month]; localStorage.setItem(BRAIN_TARGETS_KEY,JSON.stringify(o)); }
  else if(u.kind==="entry"){ entries=entries.filter(e=>e.id!==u.id); saveEntries(); }
  else if(u.kind==="delete_entry"){ if(!entries.some(e=>e.id===u.prev.id)) entries.splice(Math.min(u.idx,entries.length),0,u.prev); saveEntries(); }
  else if(u.kind==="edit_entry"){ const i=entries.findIndex(e=>e.id===u.prev.id); if(i>=0) entries[i]=u.prev; saveEntries(); }
  else if(u.kind==="recurring"){ recurringExpenses=recurringExpenses.filter(r=>r.id!==u.id); saveRecurring(); }
  else if(u.kind==="emergency"){ emergencyFundConfig=normalizeEmergencyConfig({targetMonths:u.prev,essentialCategories:emergencyFundConfig.essentialCategories}); saveEmergencyFundConfig(); }
}
function __aiShortDate(d){ const m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(String(d||"")); if(!m) return String(d||""); const mo=["ม.ค.","ก.พ.","มี.ค.","เม.ย.","พ.ค.","มิ.ย.","ก.ค.","ส.ค.","ก.ย.","ต.ค.","พ.ย.","ธ.ค."]; return Number(m[3])+" "+mo[Number(m[2])-1]; }
const AI_ACT_SVG={del:'<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>',add:'<path d="M12 5v14M5 12h14"/>',edit:'<path d="M4 20h4L19 9l-4-4L4 16z"/>'};
function aiActionParts(a){
  const ml=monthLabel(a.month), nm=a.name||(a.categories||[]).join(" + ");
  const row=e=>e?`${e.category} ฿${fmt(e.amount)} · ${__aiShortDate(e.date)}`:"ไม่พบรายการแล้ว";
  if(a.type==="delete_entry") return {k:"del",title:"ลบรายการ",detail:row(entries.find(x=>x.id===a.id))};
  if(a.type==="delete_budget") return {k:"del",title:a.kind==="saving"?"ลบเป้าออม":"ลบงบ",detail:`${nm} · ${ml}`};
  if(a.type==="add_entry") return {k:"add",title:a.entryType==="income"?"เพิ่มรายรับ":"เพิ่มรายจ่าย",detail:`${a.category} ฿${fmt(a.amount)} · ${__aiShortDate(a.date)}${a.note?` · ${a.note}`:""}`};
  if(a.type==="add_recurring") return {k:"add",title:"เพิ่มรายจ่ายประจำ",detail:`${a.name} ฿${fmt(a.amount)} · ครบกำหนด ${__aiShortDate(a.nextDueDate)}`};
  if(a.type==="edit_entry"){ const e=entries.find(x=>x.id===a.id), c=a.changes||{};
    return {k:"edit",title:"แก้รายการ",detail:`${row(e)} → ${[c.category,c.amount!=null?"฿"+fmt(c.amount):null,c.date?__aiShortDate(c.date):null,c.note!=null?c.note:null].filter(Boolean).join(" · ")}`}; }
  if(a.type==="set_budget") return {k:"edit",title:a.kind==="saving"?"ตั้งเป้าออม":"ตั้งงบ",detail:`${nm} · ${ml} · ฿${fmt(a.amount)}`};
  return {k:"edit",title:"ปรับการตั้งค่า",detail:describeAiAction(a)};
}
function renderAiActionCard(m,idx){
  if(!Array.isArray(m.actions)||!m.actions.length) return "";
  const st={done:a=>a.__k==="del"?"ลบแล้ว":a.__k==="add"?"เพิ่มแล้ว":"ทำแล้ว",cancelled:()=>"ยกเลิกแล้ว",revised:()=>"รอคุณพิมพ์ข้อเสนอด้านล่าง",undone:()=>"ย้อนกลับแล้ว",failed:()=>"ทำไม่ได้"};
  const btn=(op,ai,t,cls)=>`<button type="button" class="v-act-btn ${cls||""}" data-aiact="${op}" data-mi="${idx}" data-ai="${ai}">${t}</button>`;
  return `<div class="v-act-list">${m.actions.map((a,ai)=>{
    const p=aiActionParts(a); a.__k=p.k;
    const ic=`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${AI_ACT_SVG[p.k]||AI_ACT_SVG.edit}</svg>`;
    const status=st[a.status]?st[a.status](a):"";
    return `<div class="v-act-card ${a.status!=="pending"?"is-"+a.status:""}"><div class="v-act-head"><span class="v-act-ic ${p.k}">${ic}</span><div class="v-act-txt"><div class="v-act-title">${escapeHtml(p.title)}</div><div class="v-act-detail">${escapeHtml(p.detail)}</div></div></div>${a.msg?`<div class="v-act-msg">${escapeHtml(a.msg)}</div>`:""}${a.status==="pending"?`<div class="v-act-row">${btn("ok",ai,p.k==="del"?"ลบ":"ยืนยัน",p.k==="del"?"danger":"primary")}${btn("no",ai,"ยกเลิก","")}${btn("rev",ai,"เสนอแก้","link")}</div>`:`<div class="v-act-row"><span class="v-act-status">${status}</span>${a.status==="done"?btn("undo",ai,"ย้อนกลับ","link"):""}</div>`}</div>`;}).join("")}</div>`;
}
document.addEventListener("click",e=>{
  const b=e.target.closest&&e.target.closest("[data-aiact]"); if(!b) return;
  e.preventDefault(); e.stopPropagation();
  try{
    const op=b.dataset.aiact, mi=Number(b.dataset.mi), ai=Number(b.dataset.ai), cid=loadAllChats().activeId, h=loadAIChatHistory(), a=h[mi]&&h[mi].actions&&h[mi].actions[ai];
    if(!a){ showToast("ไม่พบข้อเสนอนี้แล้ว"); return; }
    if(op==="ok"&&a.status==="pending"){ const r=executeAiAction(a); if(r.ok){a.status="done";a.undo=r.undo;showToast("ปรับระบบแล้ว");}else{a.status="failed";a.msg=r.msg;showToast(r.msg||"ทำไม่สำเร็จ");} }
    else if(op==="no"&&a.status==="pending"){ a.status="cancelled"; }
    else if(op==="rev"&&a.status==="pending"){ a.status="revised"; const inp=document.getElementById("aiChatInput"); if(inp){ inp.value="ขอปรับข้อเสนอนี้: "+describeAiAction(a)+" → อยากให้ปรับเป็น "; inp.focus(); try{inp.setSelectionRange(inp.value.length,inp.value.length);}catch(_){} } showToast("พิมพ์สิ่งที่อยากปรับแล้วกดส่งได้เลย"); }
    else if(op==="undo"&&a.status==="done"&&a.undo){ undoAiAction(a.undo); a.status="undone"; delete a.undo; showToast("ย้อนกลับแล้ว"); }
    saveAIChatHistoryForChat(cid,h);
    renderAiChatBubbles();
    try{ render(); }catch(err){ console.error("render after ai action",err); }
  }catch(err){ console.error("ai action click",err); showToast("เกิดข้อผิดพลาด: "+(err&&err.message||err)); }
},true);
// กันการ์ด Action ซ้ำ: ตัดข้อเสนอที่ค่าตรงกับค่าปัจจุบันในระบบอยู่แล้ว หรือมี Action เดียวกันที่ยืนยัน (done) ไปแล้วในแชทล่าสุด
function __aiActionSig(a){
  const c=Object.assign({},a); delete c.status; delete c.undo; delete c.msg;
  if(Array.isArray(c.categories)) c.categories=[...c.categories].sort();
  return JSON.stringify(Object.keys(c).sort().map(k=>[k,c[k]]));
}
function isAiActionRedundant(a,history){
  try{
    const same=(x,y)=>Math.abs(Number(x)-Number(y))<0.005;
    if(a.type==="set_brain_targets"){
      const t=getBrainTargets(a.month)||{};
      if(same(t.savingsRatePct,a.savingsRatePct)&&same(t.essentialMaxPct,a.essentialMaxPct)&&same(t.discretionaryMaxPct,a.discretionaryMaxPct)) return true;
    }
    else if(a.type==="reset_brain_targets"){ if(!__readTargets().months[a.month]) return true; }
    else if(a.type==="set_buffer"){ const o=__readBuffer(), cur=o&&o.months?o.months[a.month]:null; if(cur!=null&&same(cur,a.amount)) return true; }
    else if(a.type==="set_budget"||a.type==="delete_budget"){
      const kind=a.kind==="saving"?"saving":"expense", key=bKey(a.month,a.categories,kind);
      const ex=budgets.find(x=>x.enabled!==false&&budgetKey(x)===key);
      if(a.type==="set_budget"&&ex&&same(ex.amount,a.amount)) return true;
      if(a.type==="delete_budget"&&!ex) return true;
    }
    else if(a.type==="set_emergency_target"){ if(same(emergencyFundConfig.targetMonths,a.targetMonths)) return true; }
    if(a.type!=="add_entry"&&a.type!=="sweep_buffer"){
      const sig=__aiActionSig(a), recent=(Array.isArray(history)?history:[]).slice(-12);
      if(recent.some(m=>m&&m.role==="model"&&Array.isArray(m.actions)&&m.actions.some(x=>x&&x.status==="done"&&__aiActionSig(x)===sig))) return true;
    }
  }catch(e){}
  return false;
}
function processAiReplyForMemory(text,history){
  { const acts=[]; const seen=new Set(); const hist=Array.isArray(history)?history:loadAIChatHistory(); const re=/^@@ACTION@@\s*(\{.*\})\s*$/gm; let m; while((m=re.exec(text||""))){ try{ const s=sanitizeAiAction(JSON.parse(m[1])); if(s){ const sig=__aiActionSig(s); if(seen.has(sig)||isAiActionRedundant(s,hist)) continue; seen.add(sig); acts.push(s); } }catch(e){} } __pendingActions=acts.slice(0,6); text=String(text||"").replace(/^@@ACTION@@.*$/gm,""); }
  const { cleaned, adds, dels } = extractMemoryDirectives(text);
  applyMemoryDirectives(adds, dels);
  return cleaned;
}

// ตัดส่วนที่ซ้ำออกก่อนส่งให้ AI (ตัวเลขเดิมยังอยู่ในที่อื่นของ snapshot): lastMonth.expenseBreakdownFull ซ้ำกับ monthlyHistory
function slimSnapshotForPrompt(s){
  const c = Object.assign({}, s);
  if(c.lastMonth && Array.isArray(c.monthlyHistory) && c.monthlyHistory.length){ c.lastMonth = Object.assign({}, c.lastMonth); delete c.lastMonth.expenseBreakdownFull; }
  return c;
}
function renderAiChatBubbles(){
  const history = loadAIChatHistory();
  const body = document.getElementById("aiAnalystBody");
  if(!body) return;
  if(!history.length){
    body.innerHTML = `<div class="ai-chat-empty">เริ่มคุยกับที่ปรึกษาการเงิน AI ได้เลย ถามอะไรก็ได้เกี่ยวกับสถานะการเงินของคุณ หรือแค่อยากระบายก็ได้</div>`;
    return;
  }
  let lastModelIdx = -1;
  for(let i = history.length - 1; i >= 0; i--){ if(history[i].role === "model"){ lastModelIdx = i; break; } }

  body.innerHTML = history.map((m, idx) => {
    const isUser = m.role === "user";
    const bubbleCls = isUser ? "ai-chat-user" : "ai-chat-model";
    const inner = isUser ? escapeHtml(m.text) : simpleMarkdownToHtml(m.text);
    const icons={
      edit:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 16.5V20h3.5L18.8 8.7l-3.5-3.5L4 16.5Zm11.8-9.9 1.6-1.6a1 1 0 0 1 1.4 0l.2.2a1 1 0 0 1 0 1.4l-1.6 1.6-1.6-1.6Z"/></svg>',
      copy:'<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="8" width="11" height="11" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/></svg>',
      refresh:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 11a8 8 0 0 0-14.7-4L4 9"/><path d="M4 5v4h4"/><path d="M4 13a8 8 0 0 0 14.7 4L20 15"/><path d="M20 19v-4h-4"/></svg>'
    };
    const actions = isUser
      ? `<div class="ai-chat-actions"><button type="button" data-action="edit" data-idx="${idx}">${icons.edit}<span>แก้ไข</span></button></div>`
      : `<div class="ai-chat-actions"><button type="button" data-action="copy" data-idx="${idx}">${icons.copy}<span>คัดลอก</span></button>${idx === lastModelIdx ? `<button type="button" data-action="regenerate" data-idx="${idx}">${icons.refresh}<span>ตอบใหม่</span></button>` : ""}</div>`;
    return `<div class="ai-chat-msg role-${m.role}" data-idx="${idx}"><div class="ai-chat-bubble ${bubbleCls}">${inner}</div>${renderAiActionCard(m,idx)}${actions}${(!isUser&&m.timing&&idx===lastModelIdx)?`<div class="ai-chat-latency">${escapeHtml(m.timing)}</div>`:""}</div>`;
  }).join("");
  body.scrollTop = body.scrollHeight;
  const activeChatId=loadAllChats().activeId;
  if(aiRequestState?.status==='pending' && aiRequestState.chatId===activeChatId){
    showAiChatTyping();
  }
}

// ตัวบอกสถานะ "AI กำลังพิมพ์" — เป็น DOM ชั่วคราว ไม่เก็บลงประวัติ
// ===== สถานะคีย์/ตัวสำรองครั้งล่าสุด (เก็บในเครื่อง ใช้แสดงในหน้าตั้งค่า) =====
const AI_KEYSTATE_KEY = "vaultet_ai_keystate_local"; // สถานะเฉพาะเครื่องนี้ — ถูกกันออกจากไฟล์สำรองใน app.js
function loadAiKeyState(){ try{ const o = JSON.parse(localStorage.getItem(AI_KEYSTATE_KEY) || "{}"); o.keys = o.keys || {}; return o; }catch(e){ return { keys:{} }; } }
function noteAiKey(i, st){ try{ const o = loadAiKeyState(); o.keys[i] = { s: st, t: Date.now() }; localStorage.setItem(AI_KEYSTATE_KEY, JSON.stringify(o)); }catch(e){} }
function noteAiOR(){ try{ const o = loadAiKeyState(); o.or = Date.now(); localStorage.setItem(AI_KEYSTATE_KEY, JSON.stringify(o)); }catch(e){} }
function aiStateTime(t){
  const d = new Date(t), now = new Date(), hm = String(d.getHours()).padStart(2,"0") + ":" + String(d.getMinutes()).padStart(2,"0");
  if(d.toDateString() === now.toDateString()) return hm;
  return (typeof __aiShortDate === "function" ? __aiShortDate(d.getFullYear() + "-" + String(d.getMonth()+1).padStart(2,"0") + "-" + String(d.getDate()).padStart(2,"0")) : "") + " " + hm;
}
// สรุปสถานะ: เฉพาะที่เคยเกิดขึ้นจริงตอนเรียก AI (ไม่ใช่สถานะสด)
function aiKeyStateText(i){
  const st = loadAiKeyState().keys[i]; if(!st) return "";
  return st.s === "full" ? "เต็ม " + aiStateTime(st.t) : st.s === "busy" ? "ไม่ว่าง " + aiStateTime(st.t) : st.s === "bad" ? "ตอบกลับผิดพลาด " + aiStateTime(st.t) : "ใช้ได้ " + aiStateTime(st.t);
}
function aiGeminiSummary(){
  const n = getApiKeys().length; if(!n) return "ยังไม่ได้ตั้งค่า";
  const o = loadAiKeyState(), sts = Array.from({ length:n }, (_, i) => o.keys[i]);
  const tried = sts.filter(Boolean);
  if(!tried.length) return "ตั้งค่าแล้ว " + n + " คีย์";
  const full = sts.filter(x => x && x.s === "full"), okc = sts.filter(x => x && x.s === "ok"), bad = sts.filter(x => x && x.s === "bad");
  if(bad.length && !full.length) return n + " คีย์ · " + bad.length + " คีย์ตอบกลับผิดพลาด (ตรวจคีย์) " + aiStateTime(bad.reduce((a, b) => (a.t > b.t ? a : b)).t);
  const last = tried.reduce((a, b) => (a.t > b.t ? a : b));
  if(full.length === n) return n + " คีย์ · เต็มทั้งหมด " + aiStateTime(last.t);
  if(full.length) return n + " คีย์ · เต็ม " + full.length + " คีย์ (ล่าสุด " + aiStateTime(full.reduce((a, b) => (a.t > b.t ? a : b)).t) + ")";
  return n + " คีย์ · ใช้ได้" + (okc.length ? " (ล่าสุด " + aiStateTime(last.t) + ")" : "");
}
function aiORSummary(){
  const OR = window.vaultetOR; if(!OR || !OR.statusText) return "";
  const base = OR.statusText(), o = loadAiKeyState();
  if(!OR.hasKey() || !OR.model() || !o.or) return base;
  const okTimes = Object.values(o.keys).filter(x => x && x.s === "ok").map(x => x.t), lastOk = okTimes.length ? Math.max(...okTimes) : 0;
  return (o.or > lastOk ? "กำลังใช้แทน Gemini ฟรี" : "พร้อมสำรอง") + " · ใช้ล่าสุด " + aiStateTime(o.or) + " · " + OR.model();
}
// ===== สถานะการเรียก AI ตามจริง: เก็บเฉพาะสิ่งที่แอปรู้เองจริง (ข้อมูลที่ส่ง เวลา เหตุการณ์ของคีย์/ตัวสำรอง) =====
let aiRun = null, aiRunTimer = 0;
function aiRunStart(){ aiRun = { t0: performance.now(), first: 0, end: 0, events: [], sent: "" }; }
function aiRunEvent(txt){ if(aiRun){ aiRun.events.push(txt); aiRunPaint(); } }
function aiRunPaint(){
  const el = document.getElementById("aiRunStatus");
  if(!el || !aiRun) return;
  const sec = Math.round((performance.now() - aiRun.t0) / 1000);
  const lines = [];
  if(aiRun.sent) lines.push("ส่งข้อมูลให้ AI: " + aiRun.sent);
  aiRun.events.forEach(t => lines.push(t));
  lines.push(aiRun.first ? "กำลังพิมพ์คำตอบ" : "รอ AI เริ่มตอบ… " + sec + " วินาที");
  el.innerHTML = lines.map(t => "<div>" + escapeHtml(t) + "</div>").join("");
}
function aiRunSummary(){
  if(!aiRun || !aiRun.end) return "";
  const f = ((aiRun.first || aiRun.end) - aiRun.t0) / 1000, tot = (aiRun.end - aiRun.t0) / 1000;
  const parts = ["เริ่มตอบหลัง " + f.toFixed(1) + " วิ", "พิมพ์ " + Math.max(0, tot - f).toFixed(1) + " วิ", "รวม " + tot.toFixed(1) + " วิ"];
  return parts.join(" · ");
}
function showAiChatTyping(){
  const body = document.getElementById("aiAnalystBody");
  if(!body || document.getElementById("aiChatTypingIndicator")) return;
  const div = document.createElement("div");
  div.id = "aiChatTypingIndicator";
  div.className = "ai-chat-typing";
  div.innerHTML = "<span></span><span></span><span></span>";
  body.appendChild(div);
  body.scrollTop = body.scrollHeight;
}
function hideAiChatTyping(){
  clearInterval(aiRunTimer);
  const el = document.getElementById("aiChatTypingIndicator");
  if(el) el.remove();
}
// สลับปุ่มส่ง/ยกเลิกตามสถานะกำลังเรียก AI — เปลี่ยนเฉพาะ presentation ไม่แตะ request behavior
function syncAiChatSendBtnVisibility(){
  const btn = document.getElementById("aiChatSendBtn");
  const input = document.getElementById("aiChatInput");
  if(!btn) return;
  const hasText = !!input && input.value.trim().length > 0;
  const show = !!aiChatBusy || hasText;
  btn.classList.toggle("is-composer-empty", !show);
}

function setAiChatSendBtnState(isBusy){
  const btn = document.getElementById("aiChatSendBtn");
  if(!btn) return;
  if(isBusy){
    btn.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="7" y="7" width="10" height="10" rx="2"/></svg>';
    btn.classList.add("stop-btn");
    btn.title = "ยกเลิกการส่ง";
    btn.setAttribute("aria-label","ยกเลิกการส่ง");
  }else{
    btn.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 19V5"/><path d="m5 12 7-7 7 7"/></svg>';
    btn.classList.remove("stop-btn");
    btn.title = "ส่งข้อความ";
    btn.setAttribute("aria-label","ส่งข้อความ");
  }
  syncAiChatSendBtnVisibility();
}

// คำสั่งปรับแต่ง AI แบบทีละข้อ (เปิด/ปิดได้) — ถ้ายังไม่เคยบันทึกแบบใหม่ จะแตกข้อความเดิมของแบบเก่าเป็นรายข้อให้
const AI_INSTR_KEY = "vaultet_ai_instructions_v1", AI_INSTR_MAX = 20, AI_INSTR_LEN = 300;
function loadAIInstructions(){
  try{ const o = JSON.parse(localStorage.getItem(AI_INSTR_KEY) || "null"); if(o && Array.isArray(o.items)) return { on: o.on !== false, items: o.items.filter(x => x && typeof x.text === "string" && x.text.trim()) }; }catch(e){}
  const old = (localStorage.getItem(AI_ADVISOR_INSTRUCTION_KEY) || "").trim();
  return { on: true, items: old ? old.split(/\n+/).map(t => t.trim()).filter(Boolean).slice(0, AI_INSTR_MAX).map(t => ({ id: makeId(), text: t.slice(0, AI_INSTR_LEN) })) : [] };
}
function saveAIInstructions(o){ try{ localStorage.setItem(AI_INSTR_KEY, JSON.stringify({ on: o.on !== false, items: o.items })); }catch(e){} }
function loadAIAdvisorInstruction(){
  const o = loadAIInstructions();
  return (o.on && o.items.length) ? o.items.map(x => "- " + x.text).join("\n").slice(0, 2000) : "";
}

// ระบบพรอมป์เดียวกับ buildFinancialAnalystSystemPrompt แต่เปิดกว้างขึ้นสำหรับการคุยแบบต่อเนื่อง/พูดคุยทั่วไป ไม่ใช่แค่ถามตัวเลข
function buildAIChatSystemPrompt(snapshot, profile){
  const base = buildFinancialAnalystSystemPrompt(snapshot, profile);
  return base + "\n\n" +
    [
      "หมายเหตุเพิ่มเติมสำหรับโหมดแชทต่อเนื่องนี้:",
      "- นี่คือการสนทนาต่อเนื่องหลายข้อความ ให้ใช้บริบทก่อนหน้าเมื่อเกี่ยวข้อง แต่คำถามล่าสุดของผู้ใช้มีความสำคัญสูงสุดเสมอ",
      "- ตอบผู้ใช้เป็นคำตอบที่สมบูรณ์ อ่านรู้เรื่อง และจบประโยคก่อนส่งทุกครั้ง ห้ามส่งเศษข้อความ ค่าบางส่วน หรือข้อความที่คัดลอกมาจากข้อมูลดิบ",
      "- ห้ามเปิดเผยชื่อฟิลด์ภายใน โค้ด ตัวแปร หรือคีย์จาก Financial Snapshot เช่น minReserveTarget, maxOutputTokens หรือชื่อ property ใด ๆ ให้แปลข้อมูลเป็นภาษามนุษย์แทน",
      "- หากผู้ใช้ถามว่าควรจัดการอะไรก่อน ให้สรุปลำดับความสำคัญจากสถานะการเงินจริงปัจจุบันอย่างชัดเจน พร้อมเหตุผลสั้น ๆ และขั้นตอนถัดไป",
      "- ถ้าผู้ใช้พิมพ์มาแบบทั่วไป ไม่ใช่คำถามเชิงตัวเลข (เช่น บ่น/ระบาย/ทักทาย) ให้ตอบรับแบบเป็นมิตรในฐานะที่ปรึกษาการเงินส่วนตัวได้ตามปกติ โดยยังโยงกลับมาที่สถานะการเงินจริงของผู้ใช้เมื่อเหมาะสม แต่ไม่ต้องยัดตัวเลขเข้าไปทุกครั้งถ้าไม่เกี่ยวข้อง",
      "- ยังคงห้ามสร้างตัวเลขที่ไม่มีอยู่ใน Financial Snapshot ขึ้นมาเองเด็ดขาด",
      "- ย้ำกฎเหล็กเรื่อง Action: ก่อนออก @@ACTION@@ ทุกครั้งให้เทียบกับค่าปัจจุบันใน Snapshot และประวัติแชท หากค่าในระบบตรงกับที่จะเสนออยู่แล้ว หรือผู้ใช้เพิ่งกดยืนยันเรื่องนั้นไปแล้ว ห้ามออก @@ACTION@@ ซ้ำ ให้ตอบเป็นข้อความพูดคุยตามปกติ",
      "- ย้ำเรื่องงบ: ผู้ใช้มีทั้งงบรายจ่ายและงบรายออม (เป้าออมรายเดือน) ควบคู่กัน เมื่อพูดถึงงบหรือเป้าหมายต้องกล่าวถึงทั้งสองด้านเสมอ โดยอ้างตัวเลขจาก expenseBudget และ savingBudget",
      "- ในโหมดแชทนี้ให้คุยแบบเพื่อนคู่คิดที่เป็นมืออาชีพ: ตรงประเด็น กล้าทักท้วงเมื่อแผนเสี่ยง เสนอทางออกที่ทำได้จริง และเช็ก Memory ทุกครั้งว่ามีแผน/รายรับที่เคยเล่าไว้ที่เกี่ยวข้องหรือไม่ พร้อมแปะ @@MEMORY_ADD@@ อัตโนมัติเมื่อผู้ใช้เล่าข้อมูลใหม่ที่สำคัญ (ตามกติกา Auto-Memory ด้านบน) โดยไม่ต้องรอให้ผู้ใช้สั่ง",
      "- คำสั่งปรับแต่งจากผู้ใช้ใช้ปรับรูปแบบและน้ำเสียงได้ แต่ห้ามทำให้คำตอบไม่สมบูรณ์ ขัดกับคำถามล่าสุด หรือขัดกับข้อมูลจริง",
      loadAIAdvisorInstruction() ? "คำสั่งปรับแต่งจากผู้ใช้:\n" + loadAIAdvisorInstruction() : ""
    ].filter(Boolean).join("\n");
}

// ส่งข้อความต่อเนื่อง (พร้อมประวัติแชท) ให้ Gemini ตอบ คืน { ok:true, text } หรือ { ok:false, error }
// signal (AbortSignal) เป็น optional — ใช้สำหรับให้ผู้ใช้กดยกเลิกระหว่างรอคำตอบได้
function collectGeminiText(data){
  const parts=data?.candidates?.[0]?.content?.parts;
  if(!Array.isArray(parts)) return "";
  return parts.map(p=>typeof p?.text==="string"?p.text:"").filter(Boolean).join("\n").trim();
}

function isUsableAiChatReply(text, data){
      const t=String(text||"").trim();
      if(!t) return false;
      if(t.length<8) return false;
      if(/^[\s]*(?:[-*•]\s*)?(?:Debt|Asset|Income|Expense)\s*:\s*[^\n]{0,40}$/i.test(t) && t.length<60) return false;
      if(/(?:\*\*|\[|\()\s*$/.test(t)) return false;
      if(data?.candidates?.[0]?.finishReason==="MAX_TOKENS") return false;
      return true;
    }

function cleanAiChatReply(text){
  let t=String(text||"").trim();
  // แทนชื่อฟิลด์ภายในที่อาจหลุดออกมาเป็นภาษาคน แทนการทิ้งคำตอบทั้งก้อน
  const replacements={
    minReserveTarget:"เป้าหมายเงินสำรองขั้นต่ำ",
    monthlyEssentialExpense:"ค่าใช้จ่ายจำเป็นต่อเดือน",
    reserveCoverageMonths:"จำนวนเดือนที่เงินสำรองครอบคลุม",
    maxOutputTokens:"ความยาวคำตอบ"
  };
  Object.keys(replacements).forEach(k=>{
    t=t.replace(new RegExp('\\b'+k+'\\b','g'),replacements[k]);
  });
  return t.replace(/\n{3,}/g,'\n\n').trim();
}

function isSafeHistoryMessage(m){
  if(!m || !m.text || !String(m.text).trim()) return false;
  return m.role!=="model" || isUsableAiChatReply(m.text, null);
}

// ส่งข้อความต่อเนื่อง (พร้อมประวัติแชท) ให้ Gemini ตอบ และตรวจคำตอบที่ถูกตัด/เป็นข้อมูลดิบก่อนบันทึก
