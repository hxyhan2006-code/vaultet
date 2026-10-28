// Vaultet — app/06-backup-ui.js : บันทึกจาก AI, สำรอง/กู้คืนไฟล์, เศษสตางค์, ตั้งค่า Google Drive
// (แยกจาก app.js เดิม — โหลดเรียงตามเลขไฟล์ ทุกไฟล์ใช้ตัวแปร/ฟังก์ชันร่วมกันแบบ global)
// ===== AI Layer integration point: pure data-in commit function =====
// รับ payload ตรงๆ ไม่พึ่ง DOM เพื่อให้ทั้ง UI ฟอร์มเดิม และ AI Confirmation Sheet
// เรียกจุดเดียวกันได้ ผลลัพธ์และ side-effect เหมือนโค้ดเดิมทุกประการ
// payload: { type, category, accountId, fromAccountId, toAccountId, amount, date, note, editingId }
// return: { ok:true, entry } | { ok:false, error }
function findStudentLoanDebt(){ return debts.find(d => d.type === "student_loan") || debts.find(d => d.name === "กยศ.") || null; }
function ensureStudentLoanDebt(){
  let d=findStudentLoanDebt();
  if(d) return d;
  d={id:makeId(),name:"กยศ.",type:"student_loan",outstandingBalance:0,gracePeriod:true,note:"",history:[]};
  debts.push(d); saveDebts(); return d;
}
function applyStudentLoanImpact(entry, delta){
  if(!entry || entry.type!=="income" || entry.category!=="กยศ.") return;
  const cents=toCents(delta); if(!cents) return;
  const d=entry.debtId ? debts.find(x=>x.id===entry.debtId) : findStudentLoanDebt();
  const debt=d || ensureStudentLoanDebt();
  debt.outstandingBalance=Math.max(0,(toCents(debt.outstandingBalance)+cents)/100);
  debt.history.unshift({id:makeId(),type:cents>0?"increase":"adjustment",amount:cents/100,date:entry.date||todayISO(),note:"เชื่อมกับรายการ กยศ. #"+entry.id.slice(0,8),entryId:entry.id});
  entry.debtId=debt.id; entry.debtPrincipalImpact=cents/100;
  saveDebts();
}
function reverseStudentLoanImpact(entry){
  if(!entry || !entry.debtId || !entry.debtPrincipalImpact) return;
  const d=debts.find(x=>x.id===entry.debtId); if(!d) return;
  const cents=toCents(entry.debtPrincipalImpact);
  d.outstandingBalance=Math.max(0,(toCents(d.outstandingBalance)-cents)/100);
  d.history.unshift({id:makeId(),type:"adjustment",amount:-entry.debtPrincipalImpact,date:todayISO(),note:"ย้อนผลจากการแก้ไข/ลบรายการ กยศ.",entryId:entry.id});
  saveDebts();
  entry.debtId=null; entry.debtPrincipalImpact=0;
}
function syncStudentLoanEntry(oldEntry, newEntry){
  const oldImpact=oldEntry?.debtPrincipalImpact || 0;
  if(oldEntry?.debtId && oldImpact){
    const d=debts.find(x=>x.id===oldEntry.debtId);
    if(d){ d.outstandingBalance=Math.max(0,(toCents(d.outstandingBalance)-toCents(oldImpact))/100); d.history.unshift({id:makeId(),type:"adjustment",amount:-oldImpact,date:todayISO(),note:"ย้อนผลก่อนอัปเดตรายการ กยศ.",entryId:oldEntry.id}); saveDebts(); }
  }
  if(newEntry?.type==="income" && newEntry?.category==="กยศ."){
    const d=findStudentLoanDebt() || ensureStudentLoanDebt();
    d.outstandingBalance=Math.max(0,(toCents(d.outstandingBalance)+toCents(newEntry.amount))/100);
    d.history.unshift({id:makeId(),type:"increase",amount:Number(newEntry.amount),date:newEntry.date||todayISO(),note:"เชื่อมกับรายการ กยศ.",entryId:newEntry.id});
    newEntry.debtId=d.id; newEntry.debtPrincipalImpact=Number(newEntry.amount);
    saveDebts();
  }else{ newEntry.debtId=null; newEntry.debtPrincipalImpact=0; }
}

function commitEntry(payload){
  let amount=parseFloat(payload.amount); if(!Number.isFinite(amount)||amount<=0) return {ok:false,error:"invalid_amount"};
  amount=Math.round(amount*100)/100; const date=payload.date||todayISO(); const note=(payload.note||"").trim(); const editingId=payload.editingId||null; const type=payload.type;
  if(editingId){
    const existing=entries.find(e=>e.id===editingId);
    if(existing?.source === "loan_repayment"){
      if(type!=="income" || payload.category!==existing.category) return {ok:false,error:"loan_repayment_category_locked"};
      const loan=loans.find(l=>l.id===existing.loanId), repayment=loan?.repayments?.find(r=>r.id===existing.repaymentId);
      if(!loan||!repayment) return {ok:false,error:"loan_repayment_link_missing"};
      const max=getLoanRepaymentGrossCap(loan,repayment.id);
      if(toCents(amount)>toCents(max)) return {ok:false,error:"invalid_repayment_amount"};
      repayment.amount=amount; repayment.accountId=payload.accountId||repayment.accountId; repayment.date=date; repayment.note=note||repayment.note||`รับคืนเงินจาก ${loan.person}`; repayment.financialEntryId=existing.id;
      Object.assign(existing,{type:"income",category:loanRepaymentCategory(),accountId:repayment.accountId,amount,date,note:repayment.note,source:"loan_repayment",loanId:loan.id,repaymentId:repayment.id});
      saveEntries();saveLoans();return{ok:true,entry:existing};
    }
  }
  if(type==="transfer"){
    const fromAccountId=payload.fromAccountId,toAccountId=payload.toAccountId;
    if(!fromAccountId||!toAccountId||fromAccountId===toAccountId) return {ok:false,error:"invalid_transfer_accounts"};
    let entry;
    if(editingId){ const idx=entries.findIndex(e=>e.id===editingId); if(idx===-1)return{ok:false,error:"entry_not_found"}; entry=entries[idx]; const old={...entry}; Object.assign(entry,{type:"transfer",category:undefined,fromAccountId,toAccountId,amount,date,note}); syncStudentLoanEntry(old,entry); }
    else { entry={id:makeId(),type:"transfer",fromAccountId,toAccountId,amount,date,note}; entries.unshift(entry); }
    saveEntries(); return {ok:true,entry};
  }
  const accountId=payload.accountId||UNASSIGNED_ACCOUNT_ID,category=payload.category; let entry;
  if(editingId){ const idx=entries.findIndex(e=>e.id===editingId); if(idx===-1)return{ok:false,error:"entry_not_found"}; const old={...entries[idx]}; entry=entries[idx]; Object.assign(entry,{type,category,accountId,amount,date,note}); if(type==="saving"&&payload.goalId) entry.goalId=payload.goalId; else delete entry.goalId; syncStudentLoanEntry(old,entry); }
  else { entry={id:makeId(),type,category,accountId,amount,date,note}; if(type==="saving"&&payload.goalId) entry.goalId=payload.goalId; entries.unshift(entry); if(type==="income"&&category==="กยศ."){ syncStudentLoanEntry(null,entry); } }
  lastUsedCat[type]=category; saveLastCat(); lastUsedAccountId=accountId; saveLastAccount(); saveEntries();
  return {ok:true,entry};
}

document.getElementById("submitBtn").addEventListener("click", () => {
  const amountRaw = document.getElementById("amount").value;
  const date = document.getElementById("date").value || todayISO();
  let note = document.getElementById("note").value;
  const goalId = formType === "saving" ? selectedGoalId : "";
  if(goalId && !note.trim()){ const g = readGoals().find(x => x.id === goalId); if(g) note = "เป้าหมาย: " + g.name; }

  const payload = formType === "transfer"
    ? {
        type: "transfer",
        fromAccountId: document.getElementById("fromAccount").value,
        toAccountId: document.getElementById("toAccount").value,
        amount: amountRaw, date, note, editingId
      }
    : {
        type: formType,
        category: selectedCategory,
        accountId: document.getElementById("entryAccount").value,
        amount: amountRaw, date, note, editingId, goalId
      };

  const result = commitEntry(payload);
  if(!result.ok){
    if(result.error === "invalid_transfer_accounts") showToast("เลือกบัญชีต้นทางกับปลายทางให้ต่างกัน");
    // invalid_amount: เดิมไม่มี toast (ปุ่มถูก disable อยู่แล้วเมื่อจำนวนเงินไม่ถูกต้อง) — คงพฤติกรรมเดิม
    return;
  }

  closeForm();
  selectedMonth = monthKey(result.entry.date);
  render();
});

document.getElementById("searchInput").addEventListener("input", (e) => {
  searchQuery = e.target.value;
  txVisibleLimit = 20;
  render();
});
document.getElementById("backupNowBtn").addEventListener("click", () => {
  document.getElementById("exportBtn").click();
});
document.getElementById("backupDismissBtn").addEventListener("click", () => {
  sessionStorage.setItem("backupDismissedMonth", monthKey(todayISO()));
  document.getElementById("backupBanner").classList.remove("show");
});

document.getElementById("exportBtn").addEventListener("click", () => {
  const payload = buildBackupPayload();
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `finance-backup-${backupStamp()}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  setLastBackup(todayISO());
  refreshBackupBanner();
  showToast(`ดาวน์โหลดไฟล์สำรองแล้ว ${payload.integrity.counts.entries} รายการ · ${payload.integrity.counts.storageKeys} ชุดข้อมูล · รหัสตรวจ ${payload.integrity.hash.slice(0,8)}`);
});

document.getElementById("importBtn").addEventListener("click", () => {
  document.getElementById("importFile").click();
});
// รวมข้อมูลจาก backup object (data) เข้ากับข้อมูลปัจจุบัน แบบ merge-by-id (ไม่ทับของเดิม แค่เติมของที่ยังไม่มี)
// ใช้ร่วมกันทั้งกู้คืนจากไฟล์ (importFile) และกู้คืนจาก Google Drive — คืน true ถ้าสำเร็จ, false ถ้าข้อมูลไม่ถูกต้อง
function applyImportedBackup(data){
  if(!data || typeof data !== 'object') return false;
  // รองรับทั้ง Backup แบบใหม่ (envelope) และ Backup รุ่นเก่าที่มี fields อยู่ top-level
  const source = data.data && typeof data.data === 'object' ? data.data : data;
  if(!Array.isArray(source.entries)) return false;
  // Restore persisted app state ก่อน แล้วค่อย merge ข้อมูลการเงินแบบเดิม
  // Secret/API key และ state ของ OAuth/Drive จะไม่ถูกนำกลับมาโดยเด็ดขาด
  const storedState = data.appState?.localStorage || source.appState?.localStorage;
  if(storedState && typeof storedState === 'object'){
    try{
      Object.entries(storedState).forEach(([key,value]) => {
        if(shouldBackupLocalStorageKey(key) && typeof value === 'string') localStorage.setItem(key,value);
      });
    }catch(e){}
  }
  const existingIds = new Set(entries.map(en => en.id));
  const merged = [...entries];
  source.entries.forEach(en => { if(!existingIds.has(en.id)) merged.push(en); });
  entries = merged;
  if(source.categories){
    ["income","expense","saving"].forEach(t => {
      if(Array.isArray(source.categories[t])){
        const set = new Set([...CATS_BY_TYPE[t], ...source.categories[t]]);
        CATS_BY_TYPE[t] = Array.from(set);
      }
    });
    saveCategories();
  }
  if(Array.isArray(source.accounts)){
    const existingAccIds = new Set(accounts.map(a => a.id));
    source.accounts.forEach(a => { if(a && a.id && !existingAccIds.has(a.id)) accounts.push(a); });
    saveAccounts();
  }
  if(Array.isArray(source.reservedItems)){
    const existingResIds = new Set(reservedItems.map(r => r.id));
    source.reservedItems.forEach(r => { if(r && r.id && !existingResIds.has(r.id)) reservedItems.push(r); });
    saveReserved();
  }
  if(Array.isArray(source.loans)){
    const existingLoanIds = new Set(loans.map(l => l.id));
    source.loans.forEach(l => { if(l && l.id && !existingLoanIds.has(l.id)){ if(!Array.isArray(l.repayments)) l.repayments=[]; loans.push(l); } });
    saveLoans();
  }
  // Backup เก่าที่ไม่มี recurringExpenses เลย ให้ถือเป็น [] (ค่าเริ่มต้น) โดยไม่ทำให้ restore พัง
  if(Array.isArray(source.recurringExpenses)){
    const existingRecIds = new Set(recurringExpenses.map(r => r.id));
    source.recurringExpenses.forEach(r => { if(r && r.id && !existingRecIds.has(r.id)) recurringExpenses.push(r); });
    saveRecurring();
  }
  // Backup เก่าที่ไม่มี debts เลย (ก่อน Milestone 5) ให้ถือเป็น [] โดยไม่ทำให้ restore พัง
  if(Array.isArray(source.debts)){
    const existingDebtIds = new Set(debts.map(d => d.id));
    source.debts.forEach(d => { if(d && d.id && !existingDebtIds.has(d.id)){ if(!Array.isArray(d.history)) d.history=[]; debts.push(d); } });
    saveDebts();
  }
  if(Array.isArray(source.budgets)){
    const existingBudgetIds = new Set(budgets.map(b => b.id));
    source.budgets.map(normalizeBudget).filter(Boolean).forEach(b => { if(!existingBudgetIds.has(b.id)) budgets.push(b); });
    const map=new Map(); budgets.forEach(b=>{ const k=budgetKey(b); const old=map.get(k); if(!old || String(b.updatedAt)>String(old.updatedAt)) map.set(k,b); });
    budgets=Array.from(map.values()); saveBudgets();
  }
  if(source.emergencyFundConfig && typeof source.emergencyFundConfig === "object"){ emergencyFundConfig=normalizeEmergencyConfig(source.emergencyFundConfig); saveEmergencyFundConfig(); }
  saveEntries();
  render();
  return true;
}


// ===== กู้คืนข้อมูล: ตรวจไฟล์ → เทียบจำนวน → เลือก "แทนที่ทั้งหมด" (ตรงไฟล์เป๊ะ) หรือ "รวมเข้ากับของเดิม" =====
function promptRestore(data,label){
  const source=data&&data.data&&typeof data.data==="object"?data.data:data;
  if(!source||!Array.isArray(source.entries)){ showToast("ไฟล์ไม่ถูกต้อง กู้คืนไม่สำเร็จ"); return; }
  const ver=verifyBackupIntegrity(data), stored=(data.appState&&data.appState.localStorage)||(source.appState&&source.appState.localStorage);
  const canReplace=!!stored&&typeof stored==="object"&&ver.status!=="mismatch";
  const c=a=>Array.isArray(a)?a.length:0;
  const rows=[["รายการเงิน",c(source.entries),entries.length],["บัญชี",c(source.accounts),accounts.length],["งบประมาณ",c(source.budgets),budgets.length],["หนี้",c(source.debts),debts.length],["เงินให้ยืม",c(source.loans),loans.length],["รายจ่ายประจำ",c(source.recurringExpenses),recurringExpenses.length],["เงินที่กันไว้",c(source.reservedItems),reservedItems.length]];
  const vtxt=ver.status==="ok"?`<span style="color:#52b788">ผ่านการตรวจความถูกต้อง (รหัส ${escapeHtml(ver.hash.slice(0,8))})</span>`:ver.status==="mismatch"?`<span style="color:#ef5350">✗ ไฟล์ไม่ตรงกับรหัสตรวจ — อาจเสียหายหรือถูกแก้ไข จึงปิดโหมดแทนที่</span>`:`<span style="color:#e9c46a">ไฟล์รุ่นเก่า ไม่มีรหัสตรวจ (ตรวจความถูกต้องไม่ได้)</span>`;
  const when=data.exportedAt?new Date(data.exportedAt).toLocaleString("th-TH"):"ไม่ทราบ";
  const ov=document.createElement("div");
  ov.style.cssText="position:fixed;inset:0;z-index:4000;background:rgba(0,0,0,.65);display:flex;align-items:center;justify-content:center;padding:16px;";
  const bs="width:100%;padding:13px 0;border-radius:14px;font-size:14.5px;font-weight:700;font-family:inherit;cursor:pointer;margin-top:8px;";
  ov.innerHTML=`<div style="background:var(--surface,#161618);color:var(--ink,#F5F5F7);border:1px solid var(--line,#2a2a2e);border-radius:18px;padding:18px;max-width:420px;width:100%;max-height:88vh;overflow:auto;">
    <div style="font-weight:800;font-size:16px;margin-bottom:4px;">กู้คืนข้อมูลจาก ${escapeHtml(label||"ไฟล์")}</div>
    <div style="font-size:12px;color:var(--faint,#8E8E93);margin-bottom:8px;">สำรองเมื่อ ${escapeHtml(when)}</div>
    <div style="font-size:12.5px;margin-bottom:10px;">${vtxt}</div>
    <div style="font-size:12.5px;border:1px solid var(--line,#2a2a2e);border-radius:12px;padding:8px 10px;"><div style="display:flex;justify-content:space-between;color:var(--faint,#8E8E93);"><span></span><span>ในไฟล์ / ตอนนี้</span></div>${rows.map(r=>`<div style="display:flex;justify-content:space-between;padding:3px 0;"><span>${r[0]}</span><span class="mono">${r[1]} / ${r[2]}</span></div>`).join("")}</div>
    <button type="button" id="rsReplace" ${canReplace?"":"disabled"} style="${bs}border:none;background:${canReplace?"var(--accent1,#1DB954)":"#333"};color:${canReplace?"#0A0A0C":"#777"};">แทนที่ทั้งหมด (ให้ตรงไฟล์เป๊ะ)</button>
    <div style="font-size:11px;color:var(--faint,#8E8E93);margin:4px 2px 0;">${canReplace?"ข้อมูลปัจจุบันจะถูกดาวน์โหลดเก็บไว้เป็นไฟล์ก่อนเสมอ แล้วแอปจะโหลดใหม่":"ใช้ไม่ได้: ไฟล์ไม่มีข้อมูลสถานะแอป หรือรหัสตรวจไม่ตรง"}</div>
    <button type="button" id="rsMerge" style="${bs}border:1px solid var(--line,#2a2a2e);background:var(--surface-2,#1c1c1f);color:var(--ink,#F5F5F7);">รวมเข้ากับข้อมูลเดิม (ไม่ลบอะไร)</button>
    <button type="button" id="rsCancel" style="${bs}border:none;background:transparent;color:var(--faint,#8E8E93);">ยกเลิก</button></div>`;
  document.body.appendChild(ov);
  const close=()=>ov.remove();
  ov.querySelector("#rsCancel").onclick=close;
  ov.querySelector("#rsMerge").onclick=()=>{ close(); try{ if(!applyImportedBackup(data)) throw new Error("invalid"); showToast("รวมข้อมูลสำเร็จ"); }catch(e){ showToast("กู้คืนไม่สำเร็จ"); } };
  ov.querySelector("#rsReplace").onclick=async ()=>{
    if(!canReplace) return;
    if(!(await vaultetAsk("แทนที่ข้อมูล", "ข้อมูลในเครื่องจะถูกแทนที่ด้วยข้อมูลในไฟล์ทั้งหมด (รวมรายการที่ไม่มีในไฟล์จะหายไป)\nระบบจะดาวน์โหลดข้อมูลปัจจุบันเก็บไว้ให้ก่อน ดำเนินการต่อไหม?", true))) return;
    try{
      downloadJsonFile(buildBackupPayload(),`finance-before-restore-${backupStamp()}.json`);
      const keep=new Set(Object.keys(stored).filter(k=>shouldBackupLocalStorageKey(k)&&typeof stored[k]==="string")), drop=[];
      for(let i=0;i<localStorage.length;i++){ const k=localStorage.key(i); if(shouldBackupLocalStorageKey(k)&&!keep.has(k)) drop.push(k); }
      setTimeout(()=>{
        try{
          drop.forEach(k=>localStorage.removeItem(k));
          keep.forEach(k=>localStorage.setItem(k,stored[k]));
          sessionStorage.setItem("vaultet_restored",`กู้คืนแบบแทนที่ทั้งหมดสำเร็จ (${c(source.entries)} รายการ) — ไฟล์ข้อมูลก่อนกู้คืนถูกดาวน์โหลดเก็บไว้แล้ว`);
          location.reload();
        }catch(e){ showToast("กู้คืนไม่สำเร็จ: "+(e&&e.message||e)); }
      },1200);
      close(); showToast("กำลังเก็บไฟล์ข้อมูลเดิม แล้วกู้คืน…");
    }catch(e){ showToast("กู้คืนไม่สำเร็จ: "+(e&&e.message||e)); }
  };
}

document.getElementById("importFile").addEventListener("change", (e) => {
  const file = e.target.files[0];
  if(!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try{
      const data = JSON.parse(reader.result);
      promptRestore(data, "ไฟล์ " + file.name);
    }catch(err){
      showToast("ไฟล์ไม่ถูกต้อง กู้คืนไม่สำเร็จ");
    }
    e.target.value = "";
  };
  reader.readAsText(file);
});

// (AI) Settings panel — API Key(s) ย้ายไป ai.js
document.getElementById("settingsBtn").addEventListener("click", () => {
  document.getElementById("apiKeyInput").value = "";
  refreshApiKeyStatus();
  refreshGDriveStatus();
  aiProfileDraft = loadAIProfile() || { nickname:"", monthlyIncomeEstimate:null, minReserveTarget:null, financialGoals:[], notes:"" };
  renderAIProfileForm();
  renderAIMemoryList();
  document.getElementById("settingsOverlay").classList.add("open");
});
document.getElementById("closeSettingsBtn").addEventListener("click", () => {
  document.getElementById("settingsOverlay").classList.remove("open");
});
document.getElementById("settingsOverlay").addEventListener("click", () => {
  document.getElementById("settingsOverlay").classList.remove("open");
});
/* ===== ตั้งค่า: เปิด/ปิดการแสดงเศษสตางค์ (ทศนิยม) — ไม่กระทบพอร์ตหุ้น (ใช้ pfFmtMoney/pfFmtShares ของตัวเอง) ===== */
(function(){
  const tg = document.getElementById("showDecimalsToggle");
  if(!tg) return;
  const sync = () => { tg.checked = getShowDecimals(); };
  sync();
  document.getElementById("settingsBtn").addEventListener("click", sync);
  tg.addEventListener("change", () => {
    try{ localStorage.setItem(SHOW_DECIMALS_KEY, tg.checked ? "1" : "0"); }catch(e){}
    render();
  });
})();
// (AI) ปุ่มบันทึก API Key ย้ายไป ai.js

// ===== Google Drive Auto-Backup: Settings panel =====
function gdriveTimeLabel(iso){
  if(!iso) return "ยังไม่เคย";
  const d = new Date(iso);
  const pad = n => String(n).padStart(2,"0");
  return `${pad(d.getDate())}/${pad(d.getMonth()+1)}/${d.getFullYear()+543} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function refreshGDriveStatus(){
  const clientId = localStorage.getItem(GDRIVE_CLIENT_ID_KEY);
  const fileId = localStorage.getItem(GDRIVE_FILE_ID_KEY);
  const connected = !!clientId && !!fileId; // ถือว่า "เชื่อมต่อแล้ว" หลังเคยสำรองสำเร็จอย่างน้อย 1 ครั้ง (มี fileId)
  const connStatusEl = document.getElementById("gdriveConnStatus");
  connStatusEl.textContent = connected ? "เชื่อมต่อแล้ว" : (clientId ? "ตั้งค่า Client ID แล้ว ยังไม่เคยสำรอง" : "ยังไม่ได้เชื่อมต่อ");
  connStatusEl.style.color = connected ? "var(--income)" : "var(--faint)";
  document.getElementById("gdriveLastSyncStatus").textContent = gdriveTimeLabel(localStorage.getItem(GDRIVE_LAST_SYNC_KEY));
  document.getElementById("gdriveClientIdInput").value = clientId || "";
  document.getElementById("gdriveConnectBtn").style.display = clientId ? "block" : "none";
  document.getElementById("gdriveDisconnectBtn").style.display = (clientId || fileId) ? "block" : "none";
  document.getElementById("gdriveSyncNowBtn").disabled = !clientId;
  document.getElementById("gdriveRestoreBtn").disabled = !fileId;
  const autoOn=localStorage.getItem(GDRIVE_AUTOSYNC_KEY)==="1";
  const tokenReady=!!(gdriveAccessToken && Date.now()<gdriveAccessTokenExpiry);
  document.getElementById("gdriveAutoSyncToggle").checked = autoOn;
  document.getElementById("gdriveAutoSyncToggle").disabled = !clientId;
  const autoStatus=document.getElementById("gdriveAutoStatus");
  if(autoStatus){
    autoStatus.textContent=!autoOn ? "Auto Backup ปิดอยู่" : gdriveLastAutoError ? gdriveLastAutoError : tokenReady ? "Auto Backup พร้อมทำงานในเซสชันนี้" : fileId ? "Auto Backup เปิดอยู่ แต่ต้องเชื่อมต่อ Google Drive ใหม่ก่อนจึงจะสำรองเบื้องหลังได้" : "Auto Backup เปิดอยู่ แต่ยังไม่มีไฟล์สำรองบน Drive";
    autoStatus.dataset.state=!autoOn?'off':gdriveLastAutoError?'error':tokenReady?'ready':'needs-auth';
  }
}
document.getElementById("saveGDriveClientIdBtn").addEventListener("click", () => {
  const val = document.getElementById("gdriveClientIdInput").value.trim();
  if(!val){ showToast("กรอก Client ID ก่อน"); return; }
  localStorage.setItem(GDRIVE_CLIENT_ID_KEY, val);
  gdriveTokenClient = null; // บังคับสร้าง token client ใหม่ด้วย client id ล่าสุด
  initGDriveTokenClient();
  refreshGDriveStatus();
  showToast("บันทึก Client ID แล้ว — กด \"เชื่อมต่อ Google Drive\" ต่อได้เลย");
});
document.getElementById("gdriveConnectBtn").addEventListener("click", async () => {
  if(!localStorage.getItem(GDRIVE_CLIENT_ID_KEY)){ showToast("ใส่ Client ID แล้วกดบันทึกก่อน"); return; }
  try{
    await requestGDriveToken("consent"); // ต้องมี user gesture (มาจาก click นี้แหละ) ถึงจะเปิด popup ได้
    await runGDriveSync(false); // สำรองครั้งแรกทันทีหลังเชื่อมต่อสำเร็จ เพื่อสร้างไฟล์บน Drive และยืนยันว่าเชื่อมต่อได้จริง
    refreshGDriveStatus();
  }catch(e){
    showToast("เชื่อมต่อ Google Drive ไม่สำเร็จ ลองใหม่อีกครั้ง");
  }
});
document.getElementById("gdriveDisconnectBtn").addEventListener("click", () => {
  gdriveAccessToken = null;
  gdriveAccessTokenExpiry = 0;
  gdriveTokenClient = null;
  localStorage.removeItem(GDRIVE_CLIENT_ID_KEY);
  localStorage.removeItem(GDRIVE_FILE_ID_KEY);
  localStorage.removeItem(GDRIVE_LAST_SYNC_KEY);
  localStorage.removeItem(GDRIVE_AUTOSYNC_KEY);
  refreshGDriveStatus();
  showToast("ยกเลิกการเชื่อมต่อ Google Drive แล้ว (ไฟล์ backup บน Drive จริงยังอยู่ ไม่ถูกลบ)");
});
document.getElementById("gdriveSyncNowBtn").addEventListener("click", async () => {
  await runGDriveSync(false);
  refreshGDriveStatus();
});
document.getElementById("gdriveRestoreBtn").addEventListener("click", async () => {
  try{
    const data = await gdriveDownloadBackup();
    promptRestore(data, "Google Drive");
  }catch(e){
    showToast("กู้คืนจาก Drive ไม่สำเร็จ");
  }
});
document.getElementById("gdriveAutoSyncToggle").addEventListener("change", (e) => {
  localStorage.setItem(GDRIVE_AUTOSYNC_KEY, e.target.checked ? "1" : "0");
  if(e.target.checked) scheduleGDriveAutoSync();
  refreshGDriveStatus();
});

// (AI) ระบบ AI ทั้งหมด (โปรไฟล์/ความจำ/Gemini/แชท/Advisor/Proactive/Confirm) ย้ายไป ai.js
