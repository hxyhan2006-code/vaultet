// Vaultet — ai/10-confirm-boot.js : แผ่นยืนยันรายการจาก AI, คำสั่งเริ่มระบบ AI
// (แยกจาก ai.js เดิม — โหลดเรียงตามเลขไฟล์ ทุกไฟล์ใช้ตัวแปร/ฟังก์ชันร่วมกันแบบ global)
// ===== AI Layer (Milestone 1) Phase 3: Confirmation Bottom Sheet =====
let aiConfirmType = null;

function handleAiParseResult(payload, originalText){
  openAiConfirmSheet(payload, originalText);
}

function closeAiConfirmSheet(){
  document.getElementById("aiConfirmOverlay").classList.remove("open");
}

function clearAmbiguousMarks(){
  document.querySelectorAll("#aiConfirmOverlay .field-ambiguous").forEach(el => el.classList.remove("field-ambiguous"));
  document.querySelectorAll("#aiConfirmOverlay .ambiguous-hint").forEach(el => el.remove());
}
function markAmbiguous(el){
  if(!el) return;
  el.classList.add("field-ambiguous");
  const hint = document.createElement("div");
  hint.className = "ambiguous-hint";
  hint.textContent = "*(แนะนำให้ตรวจสอบ)*";
  el.insertAdjacentElement("afterend", hint);
}

function openAiConfirmSheet(payload, originalText){
  aiConfirmType = ["expense","income","saving","transfer","lend"].includes(payload.action) ? payload.action : "expense";
  document.getElementById("aiConfirmError").style.display = "none";
  document.getElementById("aiConfirmQuote").textContent = `ตีความจาก: "${originalText}"`;

  const badgeLabel = { expense:"รายจ่าย", income:"รายรับ", saving:"ออม/ลงทุน", transfer:"โอนเงิน", lend:"ให้ยืมเงิน" }[aiConfirmType];
  const badgeEl = document.getElementById("aiConfirmBadge");
  badgeEl.textContent = badgeLabel;
  badgeEl.className = "ai-confirm-badge badge-" + aiConfirmType;

  const isCatType = aiConfirmType === "expense" || aiConfirmType === "income" || aiConfirmType === "saving";
  const isTransfer = aiConfirmType === "transfer";
  const isLend = aiConfirmType === "lend";

  document.getElementById("aiConfirmCategoryGroup").style.display = isCatType ? "block" : "none";
  document.getElementById("aiConfirmTransferGroup").style.display = isTransfer ? "block" : "none";
  document.getElementById("aiConfirmLendGroup").style.display = isLend ? "block" : "none";

  document.getElementById("aiConfirmAmount").value = payload.amount || "";
  document.getElementById("aiConfirmDate").value = isValidISODate(payload.date) ? payload.date : todayISO();
  document.getElementById("aiConfirmNote").value = payload.note || "";

  const accOptsHtml = accounts.map(a => `<option value="${a.id}">${escapeHtml(a.name)}</option>`).join("");
  const isValidAccountId = (id) => !!id && accounts.some(a => a.id === id);
  const fallbackAccountId = () => (isValidAccountId(lastUsedAccountId) ? lastUsedAccountId : (accounts[0]?.id || ""));

  if(isCatType){
    const cats = CATS_BY_TYPE[aiConfirmType] || [];
    document.getElementById("aiConfirmCategory").innerHTML = cats.map(c => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join("");
    const lastCat = lastUsedCat[aiConfirmType];
    const cat = (payload.category && cats.includes(payload.category)) ? payload.category
      : (lastCat && cats.includes(lastCat)) ? lastCat
      : (cats[0] || "");
    document.getElementById("aiConfirmCategory").value = cat;

    document.getElementById("aiConfirmAccount").innerHTML = accOptsHtml;
    document.getElementById("aiConfirmAccount").value = isValidAccountId(payload.accountId) ? payload.accountId : fallbackAccountId();
  }

  if(isTransfer){
    document.getElementById("aiConfirmFromAccount").innerHTML = accOptsHtml;
    document.getElementById("aiConfirmToAccount").innerHTML = accOptsHtml;
    const fromId = isValidAccountId(payload.fromAccountId) ? payload.fromAccountId : fallbackAccountId();
    const toId = (isValidAccountId(payload.toAccountId) && payload.toAccountId !== fromId)
      ? payload.toAccountId
      : (accounts.find(a => a.id !== fromId)?.id || fromId);
    document.getElementById("aiConfirmFromAccount").value = fromId;
    document.getElementById("aiConfirmToAccount").value = toId;
  }

  if(isLend){
    document.getElementById("aiConfirmPerson").value = payload.person || "";
    document.getElementById("aiConfirmLendAccount").innerHTML = accOptsHtml;
    // กฎเหล็ก: บัญชีสำหรับ lend ห้าม null เสมอ — ถ้า AI เดาไม่ได้เลยก็ยังต้อง fallback ให้มีค่าเสมอ
    document.getElementById("aiConfirmLendAccount").value = isValidAccountId(payload.accountId) ? payload.accountId : fallbackAccountId();
    document.getElementById("aiConfirmDueDate").value = isValidISODate(payload.dueDate) ? payload.dueDate : "";
  }

  clearAmbiguousMarks();
  const ambiguous = Array.isArray(payload.ambiguousFields) ? payload.ambiguousFields : [];
  ambiguous.forEach(field => {
    if(field === "amount") markAmbiguous(document.getElementById("aiConfirmAmount"));
    else if(field === "date") markAmbiguous(document.getElementById("aiConfirmDate"));
    else if(field === "category" && isCatType) markAmbiguous(document.getElementById("aiConfirmCategory"));
    else if(field === "accountId"){
      if(isCatType) markAmbiguous(document.getElementById("aiConfirmAccount"));
      else if(isLend) markAmbiguous(document.getElementById("aiConfirmLendAccount"));
    }
    else if(field === "fromAccountId" && isTransfer) markAmbiguous(document.getElementById("aiConfirmFromAccount"));
    else if(field === "toAccountId" && isTransfer) markAmbiguous(document.getElementById("aiConfirmToAccount"));
    else if(field === "person" && isLend) markAmbiguous(document.getElementById("aiConfirmPerson"));
    else if(field === "dueDate" && isLend) markAmbiguous(document.getElementById("aiConfirmDueDate"));
  });

  document.getElementById("aiConfirmOverlay").classList.add("open");
}

document.getElementById("closeAiConfirmBtn").addEventListener("click", closeAiConfirmSheet);
document.getElementById("aiConfirmOverlay").addEventListener("click", closeAiConfirmSheet);
document.getElementById("aiConfirmCancelBtn").addEventListener("click", closeAiConfirmSheet);

const AI_CONFIRM_ERROR_MESSAGES = {
  invalid_amount: "จำนวนเงินไม่ถูกต้อง",
  invalid_transfer_accounts: "เลือกบัญชีต้นทางกับปลายทางให้ต่างกัน",
  entry_not_found: "ไม่พบรายการที่จะแก้ไข",
  missing_person: "กรอกชื่อคนยืมก่อน",
  missing_account: "เลือกบัญชีที่หักเงินก่อน",
  loan_not_found: "ไม่พบรายการเงินให้ยืมที่จะแก้ไข"
};

document.getElementById("aiConfirmSubmitBtn").addEventListener("click", () => {
  const errBox = document.getElementById("aiConfirmError");
  errBox.style.display = "none";

  const amount = document.getElementById("aiConfirmAmount").value;
  const date = document.getElementById("aiConfirmDate").value || todayISO();
  const note = document.getElementById("aiConfirmNote").value;

  let result;
  if(aiConfirmType === "transfer"){
    result = commitEntry({
      type: "transfer",
      fromAccountId: document.getElementById("aiConfirmFromAccount").value,
      toAccountId: document.getElementById("aiConfirmToAccount").value,
      amount, date, note
    });
  }else if(aiConfirmType === "lend"){
    result = commitLoan({
      person: document.getElementById("aiConfirmPerson").value,
      amount,
      accountId: document.getElementById("aiConfirmLendAccount").value,
      dueDate: document.getElementById("aiConfirmDueDate").value,
      date, note
    });
  }else{
    result = commitEntry({
      type: aiConfirmType,
      category: document.getElementById("aiConfirmCategory").value,
      accountId: document.getElementById("aiConfirmAccount").value,
      amount, date, note
    });
  }

  if(!result.ok){
    errBox.textContent = AI_CONFIRM_ERROR_MESSAGES[result.error] || "บันทึกไม่สำเร็จ ลองใหม่อีกครั้ง";
    errBox.style.display = "block";
    return;
  }

  closeAiConfirmSheet();
  if(aiConfirmType !== "lend"){
    selectedMonth = monthKey(result.entry.date);
  }
  render();
  if(aiConfirmType === "lend"){
    renderLoansManageList();
  }
  const doneLabel = { expense:"รายจ่าย", income:"รายรับ", saving:"ออม/ลงทุน", transfer:"โอนเงิน", lend:"ให้ยืมเงิน" }[aiConfirmType];
  showToast(`บันทึก${doneLabel}เรียบร้อย`);
});

// ===== คำสั่งบูตที่ย้ายมาจาก app.js (ต้องรันหลังประกาศทุกอย่างครบ) =====
refreshApiKeyStatus();
refreshProactiveCard();
try{ if(typeof renderVaultetNotifications==="function") renderVaultetNotifications(); }catch(_){}
try{ initWeeklyAudit(); }catch(e){ console.error(e); }

// Patch ที่เลเยอร์ใน app.js ลงทะเบียนไว้ เพื่อครอบฟังก์ชัน AI (openAiAnalystSheet / loadAIProfile / buildFinancialAnalystSystemPrompt)
(window.__vaultetAiPatches||[]).forEach(function(fn){ try{ fn(); }catch(e){ console.error(e); } });
try{pruneEmptyChats();}catch(e){}
