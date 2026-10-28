// Vaultet — ai/01-settings.js : ตั้งค่าคีย์ Gemini, โปรไฟล์/ความจำ (ที่เก็บ + ฟอร์ม), จัดการความจำในหน้าตั้งค่า
// (แยกจาก ai.js เดิม — โหลดเรียงตามเลขไฟล์ ทุกไฟล์ใช้ตัวแปร/ฟังก์ชันร่วมกันแบบ global)
// ======================================================================
// ai.js — ระบบ AI ของ Vaultet (แยกออกมาจาก app.js)
// โหลดต่อท้าย app.js (<script src="ai.js"></script>) ทำงานบน Global Scope เดียวกัน
// ======================================================================

const AI_APIKEYS_MAX = 10;

// คืน array ของ API key ที่ตั้งค่าไว้ (เรียงตามลำดับที่จะลองใช้ก่อน-หลัง) — migrate คีย์เดี่ยวแบบเก่าให้อัตโนมัติครั้งเดียวถ้ามี
function getApiKeys(){
  let arr;
  try{ arr = JSON.parse(localStorage.getItem(AI_APIKEYS_KEY) || "null"); }catch(e){ arr = null; }
  if(Array.isArray(arr)) return arr;
  const legacy = localStorage.getItem(AI_APIKEY_KEY);
  if(legacy){
    arr = [legacy];
    localStorage.setItem(AI_APIKEYS_KEY, JSON.stringify(arr));
    localStorage.removeItem(AI_APIKEY_KEY);
    return arr;
  }
  return [];
}
// สำคัญ: เก็บเฉพาะคีย์เหล่านี้ ห้ามนำไปรวมกับ payload ของ exportBtn เด็ดขาด (ดูคอมเมนต์ด้านบน)
function saveApiKeys(arr){
  localStorage.setItem(AI_APIKEYS_KEY, JSON.stringify(arr));
  try{ localStorage.removeItem("vaultet_ai_keystate_local"); }catch(e){}   // ลำดับคีย์เปลี่ยน สถานะเก่าใช้ไม่ได้แล้
}

// ===== AI Layer (Milestone 3) =====
// กฎเหล็กเดียวกับ AI_APIKEY_KEY: ห้ามเพิ่มคีย์นี้เข้าไปใน object ของ exportBtn เด็ดขาด — เป็นข้อมูลเฉพาะเครื่อง ไม่ใช่ backup การเงิน
const AI_PROFILE_KEY = "finance_tracker_ai_profile_v1";
const AI_CHAT_KEY = "finance_tracker_ai_chat_v1"; // ประวัติแชทแบบเก่า (เดี่ยว) — เก็บไว้เผื่อ migrate เป็น AI_CHATS_KEY
const AI_CHATS_KEY = "finance_tracker_ai_chats_v1"; // ระบบแชทหลายรายการ (เหมือน ChatGPT/Gemini) — {chats:[{id,title,messages,createdAt,updatedAt}], activeId}
const AI_MEMORY_KEY = "finance_tracker_ai_memory_v1"; // ความจำระยะยาวของ AI ที่ปรึกษาการเงิน — [{id,text,createdAt}]
const AI_ADVISOR_INSTRUCTION_KEY = "finance_tracker_ai_advisor_instruction_v1"; // คำสั่งปรับบุคลิก/รูปแบบคำตอบของที่ปรึกษา AI
// Milestone 4: แคชผลวิเคราะห์ Proactive Insight — เก็บแยกจากทุกคีย์ข้างบน ห้ามรวมเข้า exportBtn backup
const AI_PROACTIVE_KEY = "finance_tracker_ai_proactive_v1";
// Weekly Audit: ผลวิเคราะห์ล่าสุด {text,generatedAt,weekKey,rangeStart,rangeEnd,stats} — ห้ามรวมเข้า exportBtn backup เช่นกัน
const WEEKLY_AUDIT_KEY = "vaultet_last_weekly_audit";

// ===== AI Layer (Milestone 3) state =====
// สำเนาโปรไฟล์ที่กำลังแก้ไขอยู่ในหน้า Settings — sync กับ localStorage ทันทีทุกครั้งที่เพิ่ม/ลบเป้าหมาย
let aiProfileDraft = null;

// แจ้งเตือนคำตอบ AI พร้อมแล้ว — ใช้ตอนผู้ใช้ปิดหน้าต่างแชท (หรือกด "หน้าหลัก" ไปดูอย่างอื่นในแอป) ระหว่างรอ AI ตอบ
// หมายเหตุ: ทำงานได้เฉพาะตอนที่ยังเปิดแท็บ/แอปนี้ค้างอยู่เท่านั้น (การเรียก fetch ยังทำงานต่อในพื้นหลังของหน้านี้ได้ปกติแม้ปิดชีทแชท)
// ถ้าผู้ใช้ปิดแท็บ/ออกจากแอปไปจริงๆ คำขอจะถูกตัดตามข้อจำกัดของเบราว์เซอร์ ต้องมีฝั่งเซิร์ฟเวอร์ + push notification ถึงจะแจ้งเตือนได้แม้ปิดแอป
function markAiChatUnread(){
  document.getElementById("aiFabBtn").classList.add("has-unread");
}
function clearAiChatUnread(){
  document.getElementById("aiFabBtn").classList.remove("has-unread");
}

// ===== AI Layer (Milestone 1): Settings panel — API Key(s) =====
// โชว์คีย์แบบปิดบังส่วนใหญ่ไว้ เหลือ 4 ตัวท้ายให้เห็น พอแยกออกว่าเป็นคีย์ไหน
function maskApiKey(key){
  if(!key) return "";
  const tail = key.slice(-4);
  const hidden = Math.max(4, key.length - 4);
  return "•".repeat(Math.min(hidden, 24)) + tail;
}
function renderApiKeyList(){
  const el = document.getElementById("apiKeyList");
  const keys = getApiKeys();
  const input = document.getElementById("apiKeyInput");
  if(!keys.length){
    el.innerHTML = "";
  }else{
    el.innerHTML = keys.map((k, i) => `
      <div class="memory-row">
        <div>
          <div class="memory-row-text">คีย์ที่ ${i+1}${i === 0 ? " (หลัก)" : " (สำรอง)"}</div>
          <div class="memory-row-meta">${escapeHtml(maskApiKey(k))}${aiKeyStateText(i) ? " · " + escapeHtml(aiKeyStateText(i)) : ""}</div>
        </div>
        <button class="icon-btn delete-api-key-btn" data-index="${i}" aria-label="ลบคีย์นี้">${ICON_TRASH}</button>
      </div>
    `).join("");
    el.querySelectorAll(".delete-api-key-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        const idx = parseInt(btn.dataset.index, 10);
        const cur = getApiKeys();
        cur.splice(idx, 1);
        saveApiKeys(cur);
        refreshApiKeyStatus();
        showToast("ลบ API Key แล้ว");
      });
    });
  }
  const atMax = keys.length >= AI_APIKEYS_MAX;
  input.disabled = atMax;
  input.placeholder = atMax ? `ใส่ได้สูงสุด ${AI_APIKEYS_MAX} คีย์` : "วาง Gemini API Key ที่นี่";
  document.getElementById("saveApiKeyBtn").disabled = atMax;
}
function refreshApiKeyStatus(){
  const keys = getApiKeys();
  const has = keys.length > 0;
  const statusEl = document.getElementById("apiKeyStatus");
  statusEl.textContent = has ? `ตั้งค่าแล้ว ${keys.length} คีย์` : "ยังไม่ได้ตั้งค่า";
  statusEl.style.color = has ? "var(--income)" : "var(--faint)";
  renderApiKeyList();
}

document.getElementById("saveApiKeyBtn").addEventListener("click", () => {
  const val = document.getElementById("apiKeyInput").value.trim();
  if(!val){ showToast("กรอก API Key ก่อน"); return; }
  const cur = getApiKeys();
  if(cur.length >= AI_APIKEYS_MAX){ showToast(`ใส่ได้สูงสุด ${AI_APIKEYS_MAX} คีย์`); return; }
  if(cur.includes(val)){ showToast("คีย์นี้ถูกเพิ่มไว้แล้ว"); return; }
  cur.push(val);
  saveApiKeys(cur);
  document.getElementById("apiKeyInput").value = "";
  refreshApiKeyStatus();
  showToast(cur.length === 1 ? "บันทึก API Key แล้ว" : "เพิ่ม API Key สำรองแล้ว");
});

// ===== AI Layer (Milestone 3): Profile / Memory — storage helpers =====
// คืน null ถ้าผู้ใช้ยังไม่เคยตั้งค่าอะไรเลย (แยกจากกรณีตั้งค่าแล้วแต่ทุกฟิลด์ว่าง) — สำคัญสำหรับ analyzeFinancialQuery()
function loadAIProfile(){
  try{
    const raw = localStorage.getItem(AI_PROFILE_KEY);
    if(!raw) return null;
    const parsed = JSON.parse(raw);
    return {
      nickname: parsed.nickname || "",
      monthlyIncomeEstimate: (typeof parsed.monthlyIncomeEstimate === "number" && !isNaN(parsed.monthlyIncomeEstimate)) ? parsed.monthlyIncomeEstimate : null,
      minReserveTarget: (typeof parsed.minReserveTarget === "number" && !isNaN(parsed.minReserveTarget)) ? parsed.minReserveTarget : null,
      financialGoals: Array.isArray(parsed.financialGoals) ? parsed.financialGoals : [],
      notes: parsed.notes || "",
    };
  }catch(e){ return null; }
}
function saveAIProfile(profile){
  try{ localStorage.setItem(AI_PROFILE_KEY, JSON.stringify(profile)); return true; }catch(e){ return false; }
}
function hasAIProfileContent(p){
  if(!p) return false;
  return !!(p.nickname || p.monthlyIncomeEstimate!=null || p.minReserveTarget!=null || p.notes || (p.financialGoals && p.financialGoals.length));
}
function refreshAIProfileStatus(){
  const has = !!localStorage.getItem(AI_PROFILE_KEY);
  const statusEl = document.getElementById("aiProfileStatus");
  statusEl.textContent = has ? "ตั้งค่าแล้ว" : "ยังไม่ได้ตั้งค่า";
  statusEl.style.color = has ? "var(--income)" : "var(--faint)";
}

// ===== AI Layer (Milestone 3): Profile / Memory — form rendering =====
function renderAIProfileForm(){
  refreshAIProfileStatus();
  document.getElementById("aiProfileNickname").value = aiProfileDraft.nickname || "";
  document.getElementById("aiProfileIncome").value = aiProfileDraft.monthlyIncomeEstimate!=null ? aiProfileDraft.monthlyIncomeEstimate : "";
  document.getElementById("aiProfileReserve").value = aiProfileDraft.minReserveTarget!=null ? aiProfileDraft.minReserveTarget : "";
  document.getElementById("aiProfileNotes").value = aiProfileDraft.notes || "";
  renderAIGoalsList();
}
function renderAIGoalsList(){
  const el = document.getElementById("aiGoalsList");
  const goals = aiProfileDraft.financialGoals || [];
  if(!goals.length){
    el.innerHTML = `<div class="empty-state">ยังไม่มีเป้าหมาย</div>`;
    return;
  }
  el.innerHTML = goals.map(g => `
    <div class="goal-row">
      <div class="goal-row-info">
        <span class="goal-row-name">${escapeHtml(g.name)}</span>
        <span class="goal-row-meta mono">฿${fmt(g.targetAmount)}${g.deadline ? ` · ครบกำหนด ${dayLabel(g.deadline)}` : ""}</span>
      </div>
      <button class="icon-btn ai-icon-btn delete-ai-goal-btn" data-id="${g.id}" aria-label="ลบเป้าหมาย"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7h14M9 7V5h6v2M8 10v8M12 10v8M16 10v8M6 7l1 14h10l1-14"/></svg></button>
    </div>
  `).join("");
  el.querySelectorAll(".delete-ai-goal-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      aiProfileDraft.financialGoals = (aiProfileDraft.financialGoals || []).filter(g => g.id !== btn.dataset.id);
      saveAIProfile(aiProfileDraft);
      refreshAIProfileStatus();
      renderAIGoalsList();
      showToast("ลบเป้าหมายแล้ว");
    });
  });
}
// เพิ่มเป้าหมายจากฟอร์มแนวนอนแล้วบันทึกทันที — ห้ามใช้ window.prompt() ตามข้อกำหนด
document.getElementById("addAiGoalBtn").addEventListener("click", () => {
  const nameEl = document.getElementById("aiGoalNameInput");
  const amountEl = document.getElementById("aiGoalAmountInput");
  const deadlineEl = document.getElementById("aiGoalDeadlineInput");
  const name = nameEl.value.trim();
  const amount = parseFloat(amountEl.value);
  const deadline = deadlineEl.value ? deadlineEl.value.trim() : null;
  if(!name){ showToast("กรอกชื่อเป้าหมายก่อน"); return; }
  if(!amount || amount <= 0){ showToast("กรอกยอดเงินให้ถูกต้อง"); return; }

  // เก็บตกบั๊ก Milestone 3: ดึงค่าจาก input อื่นๆ (nickname/income/reserve/notes) มารวมบันทึกด้วยเสมอ
  // ป้องกันข้อมูลที่พิมพ์ค้างไว้ในฟอร์มหลุดหายตอนกด "+ เพิ่มเป้าหมาย" โดยยังไม่ได้กด "บันทึกโปรไฟล์"
  const nicknameVal = document.getElementById("aiProfileNickname").value.trim();
  const incomeVal = parseFloat(document.getElementById("aiProfileIncome").value);
  const reserveVal = parseFloat(document.getElementById("aiProfileReserve").value);
  const notesVal = document.getElementById("aiProfileNotes").value.trim();
  aiProfileDraft.nickname = nicknameVal;
  aiProfileDraft.monthlyIncomeEstimate = (!isNaN(incomeVal) && incomeVal >= 0) ? incomeVal : null;
  aiProfileDraft.minReserveTarget = (!isNaN(reserveVal) && reserveVal >= 0) ? reserveVal : null;
  aiProfileDraft.notes = notesVal;

  aiProfileDraft.financialGoals = aiProfileDraft.financialGoals || [];
  aiProfileDraft.financialGoals.push({ id: makeId(), name, targetAmount: amount, deadline: deadline || null });
  saveAIProfile(aiProfileDraft);
  refreshAIProfileStatus();

  nameEl.value = ""; amountEl.value = ""; deadlineEl.value = "";
  renderAIGoalsList();
  showToast("เพิ่มเป้าหมายแล้ว");
  refreshProactiveCard(true);
});

// ===== Memory ที่ AI จำได้ — จัดการในหน้าตั้งค่า (ดู/ลบ/เพิ่มเองได้) =====
function renderAIMemoryList(){
  const el = document.getElementById("aiMemoryList");
  const mem = loadAIMemory();
  if(!mem.length){
    el.innerHTML = `<div class="empty-state">ยังไม่มีอะไรถูกจำไว้ — คุยกับ AI แล้วบอกว่า "จำไว้ด้วย" หรือเพิ่มเองด้านล่างได้เลย</div>`;
    return;
  }
  const sorted = [...mem].sort((a,b) => (b.createdAt||"").localeCompare(a.createdAt||""));
  el.innerHTML = sorted.map(m => `
    <div class="memory-row">
      <div>
        <div class="memory-row-text">${escapeHtml(m.text)}</div>
        <div class="memory-row-meta">${m.createdAt ? chatTimeLabel(m.createdAt) : ""}</div>
      </div>
      <div style="display:flex;align-items:center;gap:4px;">
        <button class="icon-btn ai-icon-btn edit-ai-memory-btn" data-id="${m.id}" aria-label="แก้ไขความจำนี้">${ICON_EDIT}</button>
        <button class="icon-btn ai-icon-btn delete-ai-memory-btn" data-id="${m.id}" aria-label="ลบความจำนี้"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7h14M9 7V5h6v2M8 10v8M12 10v8M16 10v8M6 7l1 14h10l-1-14"/></svg></button>
      </div>
    </div>
  `).join("");
  el.querySelectorAll(".edit-ai-memory-btn").forEach(btn => {
    btn.addEventListener("click", async () => {
      const list = loadAIMemory();
      const target = list.find(m => m.id === btn.dataset.id);
      if(!target){ showToast("ไม่พบความจำนี้แล้ว"); return; }
      const mv = await vaultetForm({ title: "แก้ไขความจำของ AI", okText: "บันทึก", fields: [{ key: "text", label: "ข้อความที่ AI จำไว้", type: "textarea", rows: 5, value: target.text, required: true }] });
      if(!mv) return;
      const t = mv.text;
      if(!t){ showToast("ข้อความความจำต้องไม่ว่าง"); return; }
      if(t === target.text) return;
      target.text = t;
      saveAIMemory(list);
      renderAIMemoryList();
      showToast("แก้ไขความจำแล้ว");
    });
  });
  el.querySelectorAll(".delete-ai-memory-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      deleteMemoryEntry(btn.dataset.id);
      renderAIMemoryList();
      showToast("ลบความจำแล้ว");
    });
  });
}
document.getElementById("addAiMemoryBtn").addEventListener("click", () => {
  const input = document.getElementById("aiMemoryInput");
  const text = input.value.trim();
  if(!text){ showToast("พิมพ์สิ่งที่อยากให้จำก่อน"); return; }
  addMemoryEntry(text);
  input.value = "";
  renderAIMemoryList();
  showToast("เพิ่มความจำแล้ว");
});
document.getElementById("aiMemoryInput").addEventListener("keydown", (e) => {
  if(e.key === "Enter"){ e.preventDefault(); document.getElementById("addAiMemoryBtn").click(); }
});

document.getElementById("saveAIProfileBtn").addEventListener("click", () => {
  const nickname = document.getElementById("aiProfileNickname").value.trim();
  const incomeVal = parseFloat(document.getElementById("aiProfileIncome").value);
  const reserveVal = parseFloat(document.getElementById("aiProfileReserve").value);

  aiProfileDraft.nickname = nickname;
  aiProfileDraft.monthlyIncomeEstimate = (!isNaN(incomeVal) && incomeVal >= 0) ? incomeVal : null;
  aiProfileDraft.minReserveTarget = (!isNaN(reserveVal) && reserveVal >= 0) ? reserveVal : null;
  aiProfileDraft.notes = document.getElementById("aiProfileNotes").value.trim();
  aiProfileDraft.financialGoals = aiProfileDraft.financialGoals || [];

  saveAIProfile(aiProfileDraft);
  refreshAIProfileStatus();
  showToast("บันทึกโปรไฟล์แล้ว");
  refreshProactiveCard(true);
});
document.getElementById("clearAIProfileBtn").addEventListener("click", async () => {
  if(!(await vaultetAsk("ลบ", "ลบโปรไฟล์การเงินทั้งหมด (รวมเป้าหมายทุกรายการ) ใช่ไหม?", true))) return;
  localStorage.removeItem(AI_PROFILE_KEY);
  aiProfileDraft = { nickname:"", monthlyIncomeEstimate:null, minReserveTarget:null, financialGoals:[], notes:"" };
  renderAIProfileForm();
  showToast("ลบโปรไฟล์แล้ว");
  refreshProactiveCard(true);
});
