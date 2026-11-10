// Vaultet — app/07b-loans.js : เงินให้คนอื่นยืม (แยกจาก 07-boot-money.js เดิม) โหลดต่อจาก 07 ทันที
// ใช้ตัวแปร/ฟังก์ชัน global ร่วมกับไฟล์อื่น (ICON_*, accountOptions ฯลฯ อยู่ใน 07)
// ===== เงินให้คนอื่นยืม / Receivables =====
function loanRepaymentCategory(){ return "เงินคืนจากการยืม"; }

function ensureLoanRepaymentCategory(){
  if(!Array.isArray(CATS_BY_TYPE.income)) CATS_BY_TYPE.income=[];
  if(!CATS_BY_TYPE.income.includes(loanRepaymentCategory())){
    CATS_BY_TYPE.income.splice(1,0,loanRepaymentCategory());
    saveCategories();
  }
}
function findLoanRepaymentEntry(loanId, repaymentId){
  return entries.find(e => e.source === "loan_repayment" && e.loanId === loanId && e.repaymentId === repaymentId) || null;
}
function createLoanRepaymentEntry(loan, repayment){
  ensureLoanRepaymentCategory();
  const entry={
    id:makeId(),
    type:"income",
    category:loanRepaymentCategory(),
    accountId:repayment.accountId,
    amount:Number(repayment.amount),
    date:repayment.date||todayISO(),
    note:(repayment.note||`รับคืนเงินจาก ${loan.person}`).trim(),
    source:"loan_repayment",
    loanId:loan.id,
    repaymentId:repayment.id
  };
  entries.unshift(entry);
  repayment.financialEntryId=entry.id;
  return entry;
}
function syncLoanRepaymentEntries(){
  let changed=false;
  ensureLoanRepaymentCategory();
  const valid=new Set();
  loans.forEach(loan=>{
    if(!Array.isArray(loan.repayments)) loan.repayments=[];
    loan.repayments.forEach(r=>{
      valid.add(`${loan.id}|${r.id}`);
      const linkedMatches=entries.filter(e=>e.source === "loan_repayment" && e.loanId === loan.id && e.repaymentId === r.id);
      let entry=(r.financialEntryId && entries.find(e=>e.id===r.financialEntryId && e.source === "loan_repayment")) || linkedMatches[0] || null;
      if(!entry){
        createLoanRepaymentEntry(loan,r); changed=true;
      }else{
        // Keep exactly one canonical financial entry per repayment; remove any duplicate legacy copies.
        if(linkedMatches.length>1){
          const keepId=entry.id;
          entries=entries.filter(e=>!(e.source === "loan_repayment" && e.loanId === loan.id && e.repaymentId === r.id && e.id !== keepId));
          changed=true;
        }
        const before=JSON.stringify([entry.type,entry.category,entry.accountId,entry.amount,entry.date,entry.note,entry.source,entry.loanId,entry.repaymentId]);
        entry.type="income"; entry.category=loanRepaymentCategory(); entry.accountId=r.accountId||entry.accountId||UNASSIGNED_ACCOUNT_ID;
        entry.amount=Number(r.amount); entry.date=r.date||entry.date||todayISO(); entry.note=(r.note||`รับคืนเงินจาก ${loan.person}`).trim();
        entry.source="loan_repayment"; entry.loanId=loan.id; entry.repaymentId=r.id; r.financialEntryId=entry.id;
        if(before!==JSON.stringify([entry.type,entry.category,entry.accountId,entry.amount,entry.date,entry.note,entry.source,entry.loanId,entry.repaymentId])) changed=true;
      }
    });
  });
  const orphanRepaymentEntries=entries.filter(e=>e.source==="loan_repayment" && !valid.has(`${e.loanId}|${e.repaymentId}`));
  if(orphanRepaymentEntries.length){
    const ids=new Set(orphanRepaymentEntries.map(e=>e.id));
    entries=entries.filter(e=>!ids.has(e.id)); changed=true;
  }
  if(changed){ saveEntries(); saveLoans(); }
  return changed;
}
function getLoanRepaymentGrossCap(loan, repaymentId){
  const gross=toCents(loan.amount)+(loan.adjustments||[]).reduce((sum,a)=>sum+toCents(a.amount),0);
  const other=(loan.repayments||[]).reduce((sum,r)=>r.id===repaymentId?sum:sum+toCents(r.amount),0);
  return Math.max(0,(gross-other)/100);
}
function createLoanRepayment(loanId, amount, accountId, date=todayISO(), note=""){
  const loan=loans.find(l=>l.id===loanId); if(!loan) return {ok:false,error:"loan_not_found"};
  if(!Array.isArray(loan.repayments)) loan.repayments=[];
  const outstanding=loanOutstanding(loan);
  const cents=toCents(amount);
  if(cents<=0||cents>toCents(outstanding)) return {ok:false,error:"invalid_amount"};
  if(!accountId||!accounts.some(a=>a.id===accountId)) return {ok:false,error:"missing_account"};
  ensureLoanRepaymentCategory();
  const repayment={id:makeId(),amount:cents/100,date:date||todayISO(),accountId,note:(note||`รับคืนเงินจาก ${loan.person}`).trim()};
  loan.repayments.push(repayment);
  createLoanRepaymentEntry(loan,repayment);
  saveEntries(); saveLoans();
  return {ok:true,repayment,entry:findLoanRepaymentEntry(loan.id,repayment.id)};
}
async function editLoanRepayment(loanId, repaymentId){
  const loan=loans.find(l=>l.id===loanId); if(!loan) return {ok:false,error:"loan_not_found"};
  const r=(loan.repayments||[]).find(x=>x.id===repaymentId); if(!r) return {ok:false,error:"repayment_not_found"};
  const max=getLoanRepaymentGrossCap(loan,repaymentId);
  const v=await vaultetForm({ title:`แก้ไขเงินที่ ${loan.person} คืน`, fields:[
    { key:"amount", label:"ยอดที่คืน (บาท)", type:"number", value:r.amount, required:true, positive:true, max:max, hint:`สูงสุด ฿${fmt(max)}` },
    ...(accounts.length>1 ? [{ key:"account", label:"เงินเข้าบัญชี", type:"select", options:accountOptions(), value:r.accountId||accounts[0].id }] : []),
    { key:"date", label:"วันที่รับเงินคืน", type:"date", value:r.date||todayISO(), required:true },
    { key:"note", label:"โน้ต (ไม่บังคับ)", value:r.note||`รับคืนเงินจาก ${loan.person}` }
  ] });
  if(!v) return {ok:false,error:"cancelled"};
  const amount=Math.round(v.amount*100)/100;
  const accountId=v.account||accounts[0]?.id; if(!accountId) return {ok:false,error:"cancelled"};
  const date=v.date, note=v.note;
  r.amount=amount; r.accountId=accountId; r.date=date; r.note=note.trim();
  const entry=(r.financialEntryId&&entries.find(e=>e.id===r.financialEntryId))||findLoanRepaymentEntry(loanId,repaymentId)||createLoanRepaymentEntry(loan,r);
  entry.type="income";entry.category=loanRepaymentCategory();entry.accountId=accountId;entry.amount=amount;entry.date=date;entry.note=r.note;entry.source="loan_repayment";entry.loanId=loanId;entry.repaymentId=repaymentId;r.financialEntryId=entry.id;
  saveEntries();saveLoans();renderLoansManageList();render();
  return {ok:true,repayment:r,entry};
}
async function deleteLoanRepayment(loanId, repaymentId){
  const loan=loans.find(l=>l.id===loanId); if(!loan)return{ok:false,error:"loan_not_found"};
  const idx=(loan.repayments||[]).findIndex(x=>x.id===repaymentId);if(idx<0)return{ok:false,error:"repayment_not_found"};
  if(!(await vaultetAsk("ลบ", "ลบรายการรับเงินคืนนี้ใช่ไหม? เงินที่เคยรับคืนจะถูกหักกลับจากบัญชีโดยอัตโนมัติ", true)))return{ok:false,error:"cancelled"};
  const r=loan.repayments[idx]; const entryId=r.financialEntryId; loan.repayments.splice(idx,1);
  entries=entries.filter(e=>!(e.source==="loan_repayment"&&(e.id===entryId||(e.loanId===loanId&&e.repaymentId===repaymentId))));
  saveEntries();saveLoans();renderLoansManageList();render();
  return{ok:true};
}
function renderLoansManageList(){
  const el = document.getElementById("loansManageList");
  if(!loans.length){
    el.innerHTML = `<div class="empty-state">ยังไม่มีรายการเงินให้ยืม</div>`;
    return;
  }
  const rowHtml = l => {
    const outstanding = loanOutstanding(l);
    const paid = outstanding <= 0;
    const status = paid ? "คืนครบแล้ว" : (l.dueDate && l.dueDate < todayISO() ? "เลยกำหนด" : "ค้างคืน");
    const reps = l.repayments || [];
    const hist = reps.length ? `<details class="v-loan-hist"><summary>ประวัติการคืน (${reps.length})</summary>${reps.map(r => `<div class="v-loan-rep"><span class="mono">฿${fmt(r.amount)} · ${escapeHtml(r.date || "")}</span><span class="v-loan-rep-acts"><button type="button" class="icon-btn edit-repayment-btn" data-loan-id="${l.id}" data-repayment-id="${r.id}" aria-label="แก้เงินคืน">${ICON_EDIT}</button><button type="button" class="icon-btn delete-repayment-btn" data-loan-id="${l.id}" data-repayment-id="${r.id}" aria-label="ลบเงินคืน">${ICON_TRASH}</button></span></div>`).join("")}</details>` : "";
    return `<div class="account-row v-loan-row${paid ? " is-paid" : ""}" style="align-items:flex-start;">
      <span class="acc-name" style="flex-direction:column; align-items:flex-start; display:flex; min-width:0; flex:1;">
        <span>${escapeHtml(l.person)} <span style="color:var(--faint)">— ${status}</span></span>
        <span class="mono" style="font-size:12px;color:var(--faint)">${paid ? `ยืม ฿${fmt(l.amount)}` : `ยืม ฿${fmt(l.amount)} · ค้าง ฿${fmt(outstanding)}`}</span>
        ${hist}
      </span>
      <span class="acc-actions">
        ${paid ? "" : `<button class="icon-btn repay-loan-btn" data-id="${l.id}" aria-label="รับคืน">รับคืน</button>`}
        <button class="icon-btn edit-loan-btn" data-id="${l.id}" aria-label="แก้ไข">${ICON_EDIT}</button><button class="icon-btn delete-loan-btn" data-id="${l.id}" aria-label="ลบ">${ICON_TRASH}</button>
      </span>
    </div>`;
  };
  // คนที่คืนครบแล้วไม่ต้องอยู่ในรายการหลัก (ไม่ให้เห็นชื่อพร้อมยอด 0) — เก็บไว้ในช่อง "คืนครบแล้ว" ที่พับอยู่ ยังแก้/ลบได้
  const active = loans.filter(l => loanOutstanding(l) > 0), done = loans.filter(l => loanOutstanding(l) <= 0);
  el.innerHTML = (active.length ? active.map(rowHtml).join("") : `<div class="empty-state">ตอนนี้ไม่มีใครค้างคืน</div>`)
    + (done.length ? `<details class="v-loan-done"><summary>คืนครบแล้ว (${done.length})</summary>${done.map(rowHtml).join("")}</details>` : "");
  el.querySelectorAll(".repay-loan-btn").forEach(btn => {
    btn.addEventListener("click", async () => {
      const l = loans.find(x => x.id === btn.dataset.id);
      if(!l) return;
      const outstanding = loanOutstanding(l);
      if(!accounts.length) return;
      const v = await vaultetForm({ title: `${l.person} คืนเงิน`, okText: "บันทึกรับคืน", fields: [
        { key: "amt", label: "คืนเท่าไหร่ (บาท)", type: "number", value: outstanding, required: true, positive: true, max: outstanding, hint: `ค้างอยู่ ฿${fmt(outstanding)}` },
        ...(accounts.length > 1 ? [{ key: "acc", label: "เงินเข้าบัญชี", type: "select", options: accountOptions(), value: l.accountId || accounts[0].id }] : [])
      ] });
      if(!v) return;
      const accountId = v.acc || accounts[0].id;
      const result=createLoanRepayment(l.id, Math.min(v.amt, outstanding), accountId, todayISO());
      if(!result.ok){ showToast("บันทึกเงินคืนไม่สำเร็จ"); return; }
      renderLoansManageList();
      render();
    });
  });
  el.querySelectorAll(".edit-loan-btn").forEach(btn => {
    btn.addEventListener("click", async () => {
      const l = loans.find(x => x.id === btn.dataset.id);
      if(!l) return;
      const current = loanOutstanding(l);
      const v = await vaultetForm({ title: `แก้ยอดค้างของ ${l.person}`, fields: [
        { key: "next", label: "ยอดหนี้คงเหลือที่ต้องการ (บาท)", type: "number", value: current, required: true, min: 0, hint: `ตอนนี้ ฿${fmt(current)} · การแก้จะปรับเงินเฉพาะส่วนต่าง ไม่ซ้ำกับยอดที่คืนไปแล้ว` }
      ] });
      if(!v) return;
      const desired = v.next;
      if(!accounts.some(a=>a.id===l.accountId)){ showToast("บัญชีเดิมของรายการนี้หายไปแล้ว"); return; }
      const result = commitLoan({ person:l.person, amount:desired, accountId:l.accountId, dueDate:l.dueDate, note:l.note, editingId:l.id });
      if(!result.ok){ showToast("แก้ไขรายการไม่สำเร็จ"); return; }
      renderLoansManageList(); render(); showToast("แก้ยอดหนี้แล้ว");
    });
  });
  el.querySelectorAll(".edit-repayment-btn").forEach(btn => {
    btn.addEventListener("click", () => editLoanRepayment(btn.dataset.loanId, btn.dataset.repaymentId));
  });
  el.querySelectorAll(".delete-repayment-btn").forEach(btn => {
    btn.addEventListener("click", () => deleteLoanRepayment(btn.dataset.loanId, btn.dataset.repaymentId));
  });
  el.querySelectorAll(".delete-loan-btn").forEach(btn => {
    btn.addEventListener("click", async () => {
      if(!(await vaultetAsk("ลบ", "ลบรายการเงินให้ยืมนี้ใช่ไหม? (เงินที่หักออกจากบัญชีไปแล้วจะถูกคืนกลับเข้าบัญชี)", true))) return;
      const loanId=btn.dataset.id;
      entries=entries.filter(e=>!(e.source==="loan_repayment"&&e.loanId===loanId));
      loans = loans.filter(x => x.id !== loanId);
      saveEntries(); saveLoans();
      renderLoansManageList();
      render();
    });
  });
}
document.getElementById("manageLoansBtn").addEventListener("click", () => {
  renderLoansManageList();
  document.getElementById("loansOverlay").classList.add("open");
});
document.getElementById("closeLoansBtn").addEventListener("click", () => {
  document.getElementById("loansOverlay").classList.remove("open");
});
document.getElementById("loansOverlay").addEventListener("click", () => {
  document.getElementById("loansOverlay").classList.remove("open");
});
// ===== AI Layer integration point: pure data-in commit function =====
// payload: { person, amount, accountId, dueDate, date, note, editingId }
// return: { ok:true, loan } | { ok:false, error }
// กฎเหล็ก: accountId บังคับเสมอ (เงินให้ยืมต้องตัดออกจากบัญชีจริง ห้ามเป็น null)
function commitLoan(payload){
  const person = (payload.person || "").trim();
  if(!person) return { ok:false, error:"missing_person" };
  let amount = parseFloat(payload.amount);
  if(!Number.isFinite(amount) || amount<=0) return { ok:false, error:"invalid_amount" };
  amount = Math.round(amount * 100) / 100;
  const accountId = payload.accountId;
  if(!accountId || !accounts.some(a => a.id === accountId)) return { ok:false, error:"missing_account" };
  const dueDate = payload.dueDate ? String(payload.dueDate).trim() : "";
  const note = (payload.note || "").trim();
  const editingId = payload.editingId || null;

  if(editingId){
    const idx = loans.findIndex(l => l.id === editingId);
    if(idx === -1) return { ok:false, error:"loan_not_found" };
    const loan = loans[idx];
    if(!Array.isArray(loan.repayments)) loan.repayments=[];
    if(!Array.isArray(loan.adjustments)) loan.adjustments=[];
    const oldOutstanding = loanOutstanding(loan);
    // In edit mode the entered amount means the desired CURRENT outstanding balance.
    // Store only the delta as an adjustment so repayments are never counted twice.
    const delta = Math.round((amount - oldOutstanding) * 100) / 100;
    if(Math.abs(delta) > 0.000001){
      loan.adjustments.unshift({ id:makeId(), amount:delta, date:payload.date || todayISO(), accountId:loan.accountId, note:"ปรับยอดหนี้คงเหลือ" });
    }
    loan.person = person;
    loan.dueDate = dueDate;
    loan.note = note;
    // Keep the original cash account authoritative for historical movements.
    saveLoans();
    render();
    return { ok:true, loan };
  }

  const date = payload.date || todayISO();
  const loan = { id:makeId(), person, amount, date, dueDate, note, accountId, repayments:[], adjustments:[] };
  loans.push(loan);
  saveLoans();
  return { ok:true, loan };
}

document.getElementById("addLoanBtn").addEventListener("click", async () => {
  if(!accounts.length){ showToast("ยังไม่มีบัญชีเลย เพิ่มบัญชีก่อน"); return; }
  const v = await vaultetForm({ title: "บันทึกเงินให้ยืม", okText: "บันทึก", fields: [
    { key: "person", label: "ให้ใครยืม", required: true },
    { key: "amt", label: "จำนวนเงินที่ให้ยืม (บาท)", type: "number", required: true, positive: true },
    ...(accounts.length > 1 ? [{ key: "acc", label: "เงินออกจากบัญชี", type: "select", options: accountOptions(), value: accounts[0].id }] : []),
    { key: "due", label: "วันครบกำหนดคืน (ไม่บังคับ)", type: "date" }
  ] });
  if(!v) return;
  const person = v.person, amt = v.amt, accountId = v.acc || accounts[0].id, due = v.due || "";

  const result = commitLoan({ person, amount: amt, accountId, dueDate: due });
  if(!result.ok) return; // เดิม validate ผ่าน prompt flow ครบแล้ว จุดนี้ไม่ควรพลาดในทางปฏิบัติ

  renderLoansManageList();
  render();
});

syncLoanRepaymentEntries();
