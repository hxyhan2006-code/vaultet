// Vaultet — ai/09-chat-ui.js : รายการแชททั้งหมด และหน้าจอแชท
// (แยกจาก ai.js เดิม — โหลดเรียงตามเลขไฟล์ ทุกไฟล์ใช้ตัวแปร/ฟังก์ชันร่วมกันแบบ global)
// ===== รายการแชททั้งหมด (หลายแชทแบบ ChatGPT/Gemini) =====
function renderAiChatList(){
  const el = document.getElementById("aiChatListBody");
  const data = loadAllChats();
  const sorted = [...data.chats].sort((a,b) => (b.updatedAt||"").localeCompare(a.updatedAt||""));
  el.innerHTML = sorted.map(c => {
    const title = c.title || chatTitleFrom(c.messages) || "แชทใหม่";
    const isActive = c.id === data.activeId;
    return `
    <div class="ai-chat-list-row${isActive ? " active" : ""}" data-id="${c.id}">
      <div class="ai-chat-list-info">
        <span class="ai-chat-list-title">${escapeHtml(title)}</span>
        <span class="ai-chat-list-meta">${c.messages.length} ข้อความ · ${chatTimeLabel(c.updatedAt)}</span>
      </div>
      <button class="icon-btn ai-icon-btn delete-ai-chat-btn" data-id="${c.id}" aria-label="ลบแชทนี้"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7h14M9 7V5h6v2M8 10v8M12 10v8M16 10v8M6 7l1 14h10l1-14"/></svg></button>
    </div>`;
  }).join("");

  el.querySelectorAll(".ai-chat-list-row").forEach(row => {
    row.addEventListener("click", (e) => {
      if(e.target.closest(".delete-ai-chat-btn")) return;
      switchToChat(row.dataset.id);
      renderAiChatBubbles();
      document.getElementById("aiChatListOverlay").classList.remove("open");
      document.getElementById("aiAnalystOverlay").classList.add("open");
      clearAiChatUnread();
    });
  });
  el.querySelectorAll(".delete-ai-chat-btn").forEach(btn => {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      if(!(await vaultetAsk("ลบ", "ลบแชทนี้ทั้งหมดใช่ไหม? กู้คืนไม่ได้", true))) return;
      deleteChat(btn.dataset.id);
      renderAiChatList();
      renderAiChatBubbles();
      showToast("ลบแชทแล้ว");
    });
  });
}
document.getElementById("aiChatHistoryBtn").addEventListener("click", (e) => {
  e.stopPropagation();
  renderAiChatList();
  document.getElementById("aiChatListOverlay").classList.add("open");
});
document.getElementById("closeAiChatListBtn").addEventListener("click", () => {
  document.getElementById("aiChatListOverlay").classList.remove("open");
});
document.getElementById("aiChatListOverlay").addEventListener("click", () => {
  document.getElementById("aiChatListOverlay").classList.remove("open");
});
document.getElementById("newAiChatBtn").addEventListener("click", () => {
  if(aiChatAbortController) aiChatAbortController.abort();
  aiChatEditingIndex = null;
  createNewChat();
  renderAiChatBubbles();
  document.getElementById("aiChatListOverlay").classList.remove("open");
  document.getElementById("aiAnalystOverlay").classList.add("open");
  clearAiChatUnread();
  document.getElementById("aiChatError").style.display = "none";
});

// คลิกปุ่ม แก้ไข/คัดลอก/ตอบใหม่ บนแต่ละข้อความ (event delegation — ปุ่มถูกสร้างใหม่ทุกครั้งที่ render)
document.getElementById("aiAnalystBody").addEventListener("click", (e) => {
  const actionBtn = e.target.closest("[data-action]");
  if(!actionBtn) return;
  const idx = parseInt(actionBtn.dataset.idx, 10);
  const action = actionBtn.dataset.action;
  const history = loadAIChatHistory();
  const msg = history[idx];
  if(!msg) return;

  if(action === "copy"){
    if(navigator.clipboard && navigator.clipboard.writeText){
      navigator.clipboard.writeText(msg.text).then(() => showToast("คัดลอกแล้ว")).catch(() => {});
    }
    return;
  }
  if(action === "edit"){
    document.getElementById("aiChatInput").value = msg.text;
    document.getElementById("aiChatInput").focus();
    aiChatEditingIndex = idx; // ตอนกดส่ง จะตัดประวัติตั้งแต่ข้อความนี้ (รวมคำตอบเดิมหลังจากนี้) ออกก่อนส่งใหม่
    showToast("แก้ไขข้อความแล้วกดส่งได้เลย — คำตอบเดิมหลังจากนี้จะถูกแทนที่");
    return;
  }
  if(action === "regenerate"){
    if(idx < 1) return;
    const beforeThisReply = history.slice(0, idx); // ตัดคำตอบเดิม (idx) ออก เหลือแค่ก่อนหน้า
    const lastUserMsg = beforeThisReply[beforeThisReply.length - 1];
    if(!lastUserMsg || lastUserMsg.role !== "user") return;
    regenerateLastReply(beforeThisReply.slice(0, -1), lastUserMsg.text);
    return;
  }
});

function renderAiInstructions(){
  const list = document.getElementById("aiInsList"); if(!list) return;
  const o = loadAIInstructions();
  const on = document.getElementById("aiInsOn"); if(on) on.checked = o.on;
  const wrap = document.getElementById("aiAdvisorSettingsPanel"); if(wrap) wrap.classList.toggle("v-ins-off", !o.on);
  document.getElementById("aiInsClear")?.toggleAttribute("disabled", !o.items.length);
  document.getElementById("aiInsAdd")?.toggleAttribute("disabled", o.items.length >= AI_INSTR_MAX);
  list.innerHTML = o.items.length
    ? o.items.map(x => `<div class="v-ins-item" data-id="${escapeHtml(x.id)}"><div class="v-ins-text">${escapeHtml(x.text)}</div><button type="button" class="v-ins-more" aria-label="ตัวเลือก"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="5" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="12" cy="19" r="1.6"/></svg></button></div>`).join("")
    : '<div class="v-ins-empty">ยังไม่มีคำสั่ง — AI จะตอบตามรูปแบบมาตรฐาน กด “เพิ่ม” เพื่อเริ่ม</div>';
}
const aiAdvisorSettingsBtn = document.getElementById("aiAdvisorSettingsBtn");
const aiAdvisorSettingsPanel = document.getElementById("aiAdvisorSettingsPanel");
renderAiInstructions();
aiAdvisorSettingsBtn?.addEventListener("click", () => {
  aiAdvisorSettingsPanel?.classList.toggle("is-open");
  if(aiAdvisorSettingsPanel?.classList.contains("is-open")) renderAiInstructions();
});
async function aiInsEdit(id){
  const o = loadAIInstructions(), it = id ? o.items.find(x => x.id === id) : null;
  if(!id && o.items.length >= AI_INSTR_MAX) return;
  const v = await vaultetPrompt("คำสั่ง", it ? it.text : "", { title: it ? "แก้คำสั่ง" : "เพิ่มคำสั่ง", type: "textarea", required: true, okText: "บันทึก", placeholder: "เช่น เริ่มคำตอบด้วยสรุปสั้นๆ", maxlen: AI_INSTR_LEN });
  if(v == null) return;
  const t = String(v).trim().slice(0, AI_INSTR_LEN); if(!t) return;
  if(it) it.text = t; else o.items.push({ id: makeId(), text: t });
  saveAIInstructions(o); renderAiInstructions();
}
document.getElementById("aiInsAdd")?.addEventListener("click", () => aiInsEdit(null));
document.getElementById("aiInsOn")?.addEventListener("change", e => { const o = loadAIInstructions(); o.on = !!e.target.checked; saveAIInstructions(o); renderAiInstructions(); });
document.getElementById("aiInsClear")?.addEventListener("click", async () => {
  const o = loadAIInstructions(); if(!o.items.length) return;
  if(!(await vaultetAsk("ลบทั้งหมด", "ลบคำสั่งทั้งหมด " + o.items.length + " ข้อใช่ไหม?", true))) return;
  o.items = []; saveAIInstructions(o); renderAiInstructions();
});
document.getElementById("aiInsList")?.addEventListener("click", async e => {
  const row = e.target.closest(".v-ins-item"); if(!row) return;
  const id = row.dataset.id;
  const x = await vaultetChoice({ title: "คำสั่งนี้", options: [{ value: "edit", label: "แก้ไข" }, { value: "del", label: "ลบ", danger: true }] });
  if(x === "edit") aiInsEdit(id);
  else if(x === "del"){ const o = loadAIInstructions(); o.items = o.items.filter(i => i.id !== id); saveAIInstructions(o); renderAiInstructions(); }
});

function hideAiCompletionNotification(){
  document.getElementById('aiCompletionNotice')?.classList.remove('show');
}
function showAiCompletionNotification(chatId){
  if(isAdvisorPageActive()) return;
  const el=document.getElementById('aiCompletionNotice');
  if(!el) return;
  el.dataset.chatId=chatId||'';
  el.classList.add('show');
}
function openAiCompletionChat(){
  const el=document.getElementById('aiCompletionNotice');
  const chatId=el?.dataset.chatId;
  if(chatId && getChatById(chatId)){ switchToChat(chatId); }
  hideAiCompletionNotification();
  window.bancheeOpenChatPage?.();
}
document.getElementById('aiCompletionOpenBtn')?.addEventListener('click',openAiCompletionChat);
document.getElementById('aiCompletionDismissBtn')?.addEventListener('click',hideAiCompletionNotification);

// ส่งข้อความต่อเนื่องในหน้าต่างแชท (ไม่ผ่านการคัดกรองแบบหน้าพิมพ์รายการ — คุยได้อิสระเต็มที่)
document.getElementById("aiChatSendBtn").addEventListener("click", async () => {
  // ถ้ากำลังรอ AI ตอบอยู่ ปุ่มนี้ทำหน้าที่เป็นปุ่ม "หยุด" แทน
  if(aiChatBusy){
    if(aiChatAbortController) aiChatAbortController.abort();
    return;
  }

  const input = document.getElementById("aiChatInput");
  const text = input.value.trim();
  const errBox = document.getElementById("aiChatError");
  errBox.style.display = "none";
  if(!text) return;

  if(!aiAvailable()){
    errBox.textContent = AI_ERROR_MESSAGES.missing_api_key;
    errBox.style.display = "block";
    return;
  }

  let priorHistory = loadAIChatHistory();
  if(aiChatEditingIndex !== null){
    priorHistory = priorHistory.slice(0, aiChatEditingIndex); // ตัดตั้งแต่ข้อความที่แก้ไข (รวมคำตอบเดิม) ออกทั้งหมด
    aiChatEditingIndex = null;
  }

  const historyWithUserMsg = priorHistory.concat([{ role:"user", text }]);
  saveAIChatHistory(historyWithUserMsg);
  renderAiChatBubbles();
  input.value = "";

  const requestId=makeId();
  const requestChatId=loadAllChats().activeId;
  aiRequestState={id:requestId,chatId:requestChatId,status:'pending',startedAt:Date.now(),userText:text};
  aiChatBusy = true;
  setAiChatSendBtnState(true);
  input.disabled = true;
  showAiChatTyping();

  const snapshot = buildFinancialSnapshot();
  const profile = loadAIProfile();
  aiChatAbortController = new AbortController();
  const aiRequestStartedAt = performance.now();
  const streamUI = createAiStreamUI(requestChatId);
  aiRunStart(); aiRunPaint();
  const result = await generateChatReply(priorHistory, text, snapshot, profile, aiChatAbortController.signal, t => { if(aiRun && !aiRun.first && t) aiRun.first = performance.now(); streamUI.push(t); });
  if(aiRun) aiRun.end = performance.now();
  if(result.ok) await streamUI.drain();
  streamUI.remove();
  const aiElapsedMs = Math.round(performance.now() - aiRequestStartedAt);
  aiChatAbortController = null;

  if(!isAiRequestCurrent(requestId)) return;
  aiRequestState.status=result.ok?'completed':(result.error==='aborted'?'cancelled':'error');
  aiChatBusy = false;
  hideAiChatTyping();
  setAiChatSendBtnState(false);
  input.disabled = false;

  if(!result.ok){
    if(result.error === "aborted"){ const pt = aiStreamDisplayText(result.partialText || "").trim(); if(pt) saveAIChatHistoryForChat(requestChatId, historyWithUserMsg.concat([{ role:"model", text: pt }])); aiRequestState=null; renderAiChatBubbles(); return; }
    const label = aiErrorLabel(result);
    const codeLine = result.error ? ` (โค้ด: ${result.error}${result.status ? " HTTP " + result.status : ""})` : "";
    errBox.textContent = label + codeLine + " — ข้อความที่พิมพ์ไว้ยังอยู่ ลองกดส่งใหม่ได้เลย";
    errBox.style.display = "block";
    aiRequestState=null;
    renderAiChatBubbles();
    return;
  }

  const historyWithReply = historyWithUserMsg.concat([{ role:"model", text: processAiReplyForMemory(result.text, historyWithUserMsg), actions: takePendingActions(), timing: aiRunSummary() || ("ตอบใน " + (aiElapsedMs/1000).toFixed(1) + " วินาที") }]);
  saveAIChatHistoryForChat(requestChatId, historyWithReply);
  aiRequestState=null;
  renderAiChatBubbles();

  // แจ้งเฉพาะเมื่อผู้ใช้ไม่ได้อยู่หน้า Advisor ตอนคำตอบเสร็จ และแจ้งครั้งเดียวต่อ request
  if(!isAdvisorPageActive()){
    markAiChatUnread();
    showAiCompletionNotification(requestChatId);
  }
});
document.getElementById("aiChatInput").addEventListener("input", () => {
  syncAiChatSendBtnVisibility();
});
document.getElementById("aiChatInput").addEventListener("keydown", (e) => {
  if(e.key === "Enter"){
    const touchDevice = window.matchMedia && window.matchMedia("(pointer: coarse)").matches;
    if(touchDevice || e.shiftKey || e.isComposing) return; // มือถือ: Enter = ขึ้นบรรทัดใหม่ ส่งด้วยปุ่มลูกศร
    e.preventDefault();
    document.getElementById("aiChatSendBtn").click();
  }
});
syncAiChatSendBtnVisibility();

// ใช้ตอนกด "ตอบใหม่" — ตัดคำตอบ AI อันเดิมทิ้ง แล้วยิงคำถามเดิมซ้ำ
async function regenerateLastReply(priorHistory, userText){
  const errBox = document.getElementById("aiChatError");
  errBox.style.display = "none";

  saveAIChatHistory(priorHistory.concat([{ role:"user", text: userText }]));
  renderAiChatBubbles();

  const requestId=makeId();
  const requestChatId=loadAllChats().activeId;
  aiRequestState={id:requestId,chatId:requestChatId,status:'pending',startedAt:Date.now(),userText:userText};
  aiChatBusy = true;
  setAiChatSendBtnState(true);
  document.getElementById("aiChatInput").disabled = true;
  showAiChatTyping();

  const snapshot = buildFinancialSnapshot();
  const profile = loadAIProfile();
  aiChatAbortController = new AbortController();
  const streamUI = createAiStreamUI(requestChatId);
  aiRunStart(); aiRunPaint();
  const result = await generateChatReply(priorHistory, userText, snapshot, profile, aiChatAbortController.signal, t => { if(aiRun && !aiRun.first && t) aiRun.first = performance.now(); streamUI.push(t); });
  if(aiRun) aiRun.end = performance.now();
  if(result.ok) await streamUI.drain();
  streamUI.remove();
  aiChatAbortController = null;

  if(!isAiRequestCurrent(requestId)) return;
  aiRequestState.status=result.ok?'completed':(result.error==='aborted'?'cancelled':'error');
  hideAiChatTyping();
  aiChatBusy = false;
  setAiChatSendBtnState(false);
  document.getElementById("aiChatInput").disabled = false;

  if(!result.ok){
    if(result.error === "aborted"){ const pt = aiStreamDisplayText(result.partialText || "").trim(); if(pt) saveAIChatHistoryForChat(requestChatId, priorHistory.concat([{ role:"user", text: userText }, { role:"model", text: pt }])); aiRequestState=null; renderAiChatBubbles(); return; }
    const label = aiErrorLabel(result);
    errBox.textContent = label + " — ลองตอบใหม่อีกครั้ง";
    errBox.style.display = "block";
    aiRequestState=null; renderAiChatBubbles(); return;
  }

  saveAIChatHistoryForChat(requestChatId,priorHistory.concat([{ role:"user", text: userText }, { role:"model", text: processAiReplyForMemory(result.text, priorHistory), actions: takePendingActions(), timing: aiRunSummary() }]));
  aiRequestState=null;
  renderAiChatBubbles();

  if(!isAdvisorPageActive()){
    markAiChatUnread();
    showAiCompletionNotification(requestChatId);
  }
}

document.getElementById("aiProcessBtn").addEventListener("click", async () => {
  const text = document.getElementById("aiInputText").value.trim();
  const errBox = document.getElementById("aiInputError");
  errBox.style.display = "none";
  if(!text) return;

  const btn = document.getElementById("aiProcessBtn");
  const originalLabel = btn.textContent;
  btn.disabled = true;
  btn.textContent = "กำลังคัดกรอง...";

  // ด่านแรกเสมอ: ตัดสินว่าข้อความนี้คือ "บันทึกรายการ" หรือ "คำถาม/ขอวิเคราะห์"
  const intentResult = await classifyIntent(text);

  if(!intentResult.ok){
    btn.disabled = false;
    btn.textContent = originalLabel;
    errBox.textContent = aiErrorLabel(intentResult);
    errBox.style.display = "block";
    return;
  }

  if(intentResult.intent === "query"){
    // Flow วิเคราะห์การเงิน — ไม่แตะ Flow บันทึกรายการเดิมเลย
    btn.textContent = "กำลังวิเคราะห์ข้อมูลการเงิน...";
    const snapshot = buildFinancialSnapshot();
    const analysisResult = await analyzeFinancialQuery(text, snapshot);

    btn.disabled = false;
    btn.textContent = originalLabel;

    if(!analysisResult.ok){
      errBox.textContent = aiErrorLabel(analysisResult);
      errBox.style.display = "block";
      return;
    }

    closeAiInputSheet();
    openAiAnalystSheet(text, processAiReplyForMemory(analysisResult.text));
    return;
  }

  // Flow บันทึกรายการเดิม (ห้ามแตะต้อง) — เดิมเรียก parseNaturalLanguageEntry() ตรงๆ ทันที
  btn.textContent = "กำลังตีความรายการ...";
  const result = await parseNaturalLanguageEntry(text);

  btn.disabled = false;
  btn.textContent = originalLabel;

  if(!result.ok){
    errBox.textContent = aiErrorLabel(result);
    errBox.style.display = "block";
    return;
  }

  closeAiInputSheet();
  handleAiParseResult(result.payload, text);
});
