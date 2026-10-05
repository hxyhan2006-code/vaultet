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
          <div class="memory-row-meta">${escapeHtml(maskApiKey(k))}</div>
        </div>
        <button class="icon-btn delete-api-key-btn" data-index="${i}" aria-label="ลบคีย์นี้">🗑</button>
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
  statusEl.textContent = has ? `ตั้งค่าแล้ว ${keys.length} คีย์ ✓` : "ยังไม่ได้ตั้งค่า";
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
  statusEl.textContent = has ? "ตั้งค่าแล้ว ✓" : "ยังไม่ได้ตั้งค่า";
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
      <button class="icon-btn ai-icon-btn delete-ai-memory-btn" data-id="${m.id}" aria-label="ลบความจำนี้"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7h14M9 7V5h6v2M8 10v8M12 10v8M16 10v8M6 7l1 14h10l-1-14"/></svg></button>
    </div>
  `).join("");
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
document.getElementById("clearAIProfileBtn").addEventListener("click", () => {
  if(!confirm("ลบโปรไฟล์การเงินทั้งหมด (รวมเป้าหมายทุกรายการ) ใช่ไหม?")) return;
  localStorage.removeItem(AI_PROFILE_KEY);
  aiProfileDraft = { nickname:"", monthlyIncomeEstimate:null, minReserveTarget:null, financialGoals:[], notes:"" };
  renderAIProfileForm();
  showToast("ลบโปรไฟล์แล้ว");
  refreshProactiveCard(true);
});

// ===== AI Layer (Milestone 1): Context builder =====
// ส่งเฉพาะ enum/id ที่จำเป็นต่อการตัดสินใจของ AI (บัญชี, หมวดหมู่, ค่าที่ใช้ล่าสุด, วันนี้)
// ไม่ส่ง entries/transactions ย้อนหลังเพื่อความเร็วและประหยัด token
function buildAIContext(){
  return {
    today: todayISO(),
    accounts: accounts.map(a => ({ id: a.id, name: a.name })),
    categories: CATS_BY_TYPE,
    lastUsedAccountId: lastUsedAccountId || null,
    lastUsedCat: lastUsedCat
  };
}

function buildAISystemPrompt(context){
  return [
    "คุณคือตัวแปลงข้อความภาษาไทย (ภาษาพูดก็ได้) ให้เป็นข้อมูลธุรกรรมการเงินแบบมีโครงสร้าง สำหรับแอป Vaultet",
    "ตอบกลับเป็น JSON ล้วนตาม schema ที่กำหนดเท่านั้น ห้ามมีข้อความอื่นนอก JSON",
    "",
    "Context ปัจจุบันของผู้ใช้:",
    JSON.stringify(context),
    "",
    "กติกาการแปล:",
    '- action มีได้แค่ 5 ค่า: "expense" (รายจ่าย), "income" (รายรับ), "saving" (เงินออม/ลงทุน), "transfer" (โอนเงินข้ามบัญชี), "lend" (ให้ยืมเงิน)',
    "- amount ต้องเป็นตัวเลขบวกเสมอ ถ้าข้อความไม่มีจำนวนเงินที่ชัดเจน ให้เดาที่ใกล้เคียงที่สุดไม่ได้ ให้ใส่ 0 และเพิ่ม \"amount\" เข้าไปใน ambiguousFields",
    "- date: ถ้าไม่ได้ระบุ ให้เป็น null (ระบบจะใช้วันนี้เอง) ถ้าระบุเป็นคำ เช่น เมื่อวาน/พรุ่งนี้ ให้คำนวณจาก today ใน context แล้วตอบเป็น YYYY-MM-DD",
    "- category: ต้องเลือกจากรายการใน categories[action] เท่านั้น (เฉพาะ expense/income/saving) ถ้าข้อความไม่ตรงกับหมวดไหนชัดเจน ให้เดาหมวดที่ใกล้เคียงที่สุด และเพิ่ม \"category\" เข้า ambiguousFields",
    "- accountId: ต้องเป็น id จาก accounts ใน context เท่านั้น ถ้าผู้ใช้ไม่ได้ระบุบัญชี ให้ใช้ lastUsedAccountId เป็นค่าเริ่มต้น (ถ้ามี) และเพิ่ม \"accountId\" เข้า ambiguousFields เสมอเมื่อเป็นการเดา ไม่ใช่ระบุตรงๆ",
    "- fromAccountId/toAccountId: ใช้เฉพาะ action=transfer ต้องเป็น id จาก accounts และห้ามเหมือนกัน ถ้าเดาไม่ได้ให้เป็น null และเพิ่มใน ambiguousFields",
    "- person: ใช้เฉพาะ action=lend คือชื่อคนที่ให้ยืม",
    "- dueDate: ใช้เฉพาะ action=lend ถ้าไม่ได้ระบุให้เป็น null",
    "- lend บังคับต้องมี accountId เสมอ (เงินให้ยืมต้องตัดออกจากบัญชีจริง) ถ้าเดาบัญชีไม่ได้เลย ให้ใช้ lastUsedAccountId และเพิ่ม \"accountId\" เข้า ambiguousFields",
    "- confidence: \"high\" ถ้าทุกฟิลด์ที่จำเป็นระบุชัดเจนในข้อความหรือเดาได้อย่างมั่นใจ, \"needs_confirmation\" ถ้ามีฟิลด์ใดๆ ใน ambiguousFields",
    "- ambiguousFields: array ของชื่อฟิลด์ (string) ที่เป็นการเดา/fallback ไม่ใช่สิ่งที่ผู้ใช้ระบุตรงๆ ถ้าไม่มีให้เป็น array ว่าง",
    "- note: สรุปสั้นๆ จากข้อความต้นฉบับ (ถ้ามีรายละเอียดเพิ่มเติมนอกเหนือจากฟิลด์อื่น)",
    "",
    "ตัวอย่างภาษาพูดที่ต้องเข้าใจ:",
    '- "กินข้าว เมื่อวาน 43" => expense, amount 43, date = เมื่อวานจาก today, note = "กินข้าว", category = หมวดที่ใกล้เคียง เช่น "กิน"',
    '- "กาแฟ 60" => expense, amount 60, date = null, note = "กาแฟ"',
    '- "ได้เงินเดือนวันนี้ 25000" => income, amount 25000, date = วันนี้, note = "ได้เงินเดือน"',
    '- "โอนให้แม่ 500" => transfer หรือ expense ตามความหมายที่ระบุและ context; ถ้าระบุบัญชีไม่พอให้ใส่ ambiguousFields',
    "ผู้ใช้ไม่จำเป็นต้องพิมพ์คำว่า บันทึก/จ่าย เสมอไป: ชื่อสิ่งที่ซื้อ + จำนวนเงิน + เวลา เช่น กินข้าว เมื่อวาน 43 คือธุรกรรมรายจ่าย"
  ].join("\n");
}

// ===== AI model routing =====
// ใช้โมเดล Flash ตัวเดียวกับ AI ที่ปรึกษา เพื่อให้พฤติกรรมสอดคล้องกัน
// แต่ flow พิมพ์รายการมี local fast-path ก่อน เพื่อไม่ต้องรอ API สำหรับประโยคสั้นชัดเจน
const AI_TRANSACTION_MODEL = "gemini-3.6-flash";
const AI_ADVISOR_MODEL = AI_TRANSACTION_MODEL;

// ===== AI Layer (Milestone 1): Gemini call =====
const AI_RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    action: { type: "STRING", enum: ["expense","income","saving","transfer","lend"] },
    amount: { type: "NUMBER" },
    date: { type: "STRING", nullable: true },
    note: { type: "STRING" },
    category: { type: "STRING", nullable: true },
    accountId: { type: "STRING", nullable: true },
    fromAccountId: { type: "STRING", nullable: true },
    toAccountId: { type: "STRING", nullable: true },
    person: { type: "STRING", nullable: true },
    dueDate: { type: "STRING", nullable: true },
    confidence: { type: "STRING", enum: ["high","needs_confirmation"] },
    ambiguousFields: { type: "ARRAY", items: { type: "STRING" } }
  },
  required: ["action","amount","note","confidence","ambiguousFields"]
};

// เรียก Gemini API พร้อมกันโควต้าเต็ม (HTTP 429) 2 ชั้น:
// 1) auto-retry เงียบๆ กับคีย์เดิมก่อน (หน่วงเวลาเพิ่มทีละรอบ) เหมือนเดิม
// 2) ถ้าคีย์เดิม retry แล้วยัง 429 อยู่ ให้สลับไปลองคีย์สำรองถัดไปในลิสต์ทันที (ถ้าตั้งค่าไว้หลายคีย์)
// buildUrl: function(apiKey) => url เต็มพร้อม query key (เพราะแต่ละคีย์ต้องประกอบ url ใหม่)
// ผู้ใช้จะไม่เห็น error 429 เลยถ้าคีย์ใดคีย์หนึ่งในลิสต์ผ่านได้ภายในเงื่อนไขนี้
async function fetchGeminiWithRetry(buildUrl, options, maxRetriesPerKey = 2){
  const keys = getApiKeys();
  let res = null;
  for(let i = 0; i < keys.length; i++){
    const url = buildUrl(keys[i]);
    let attempt = 0;
    while(true){
      res = await fetch(url, options);
      if((res.status !== 429 && res.status !== 503) || attempt >= maxRetriesPerKey) break;
      attempt++;
      await new Promise(r => setTimeout(r, 1500 * attempt)); // หน่วงเพิ่มขึ้นทีละรอบ: 1.5s, 3s
    }
    if(res.status !== 429 && res.status !== 503) return res; // สำเร็จ หรือ error อื่นที่ไม่ใช่โควต้าเต็ม → ไม่ต้องลองคีย์ถัดไป
    // คีย์นี้โควต้าเต็มแม้ retry แล้ว → ลองคีย์สำรองถัดไปทันที ไม่ต้องหน่วงเพิ่ม
  }
  return res; // ทุกคีย์โดน 429 หมด (หรือไม่มีคีย์เลย) — คืนตัวสุดท้ายให้ caller จัดการ error ตามปกติ
}

// Local fast-path สำหรับภาษาพูดสั้น ๆ ที่ชัดเจน เช่น "กินข้าว เมื่อวาน 43"
// ลด latency โดยไม่ต้องเรียก AI 2 รอบ และ fallback ไป Gemini Flash เมื่อกำกวม
function thaiDigitsToArabic(value){
  return String(value||'').replace(/[๐-๙]/g, ch => String('๐๑๒๓๔๕๖๗๘๙'.indexOf(ch)));
}
function isoDaysFromToday(delta){
  const d=new Date(); d.setHours(12,0,0,0); d.setDate(d.getDate()+delta);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function parseSpokenTransactionFast(text){
  const raw=String(text||'').trim();
  if(!raw) return null;
  const normalized=thaiDigitsToArabic(raw).replace(/,/g,'');
  const nums=[...normalized.matchAll(/(?:^|\s)(\d+(?:\.\d+)?)(?=\s|$)/g)].map(m=>Number(m[1]));
  if(!nums.length) return null;
  const amount=nums[nums.length-1];
  if(!Number.isFinite(amount)||amount<=0) return null;
  let date=null;
  if(/เมื่อวาน/.test(normalized)) date=isoDaysFromToday(-1);
  else if(/วันนี้/.test(normalized)) date=todayISO();
  else if(/พรุ่งนี้/.test(normalized)) date=isoDaysFromToday(1);
  const expenseWords=/กิน|ข้าว|กาแฟ|อาหาร|ขนม|รถ|แท็กซี่|ค่าเดินทาง|เติมน้ำมัน|ซื้อ|จ่าย|เซเว่น|7-?11|ร้าน/;
  const incomeWords=/เงินเดือน|ได้เงิน|รายได้|โบนัส|ขายของ/;
  const savingWords=/ออม|ลงทุน|กองทุน/;
  let action='';
  if(savingWords.test(normalized)) action='saving';
  else if(incomeWords.test(normalized)) action='income';
  else if(expenseWords.test(normalized)) action='expense';
  else return null;
  let category=null;
  const cats=CATS_BY_TYPE[action]||[];
  if(action==='expense'){
    category=cats.find(c=>/กิน|อาหาร/.test(c))||cats.find(c=>/อาหาร|กิน/.test(c))||null;
  }
  const note=normalized
    .replace(/(?:^|\s)\d+(?:\.\d+)?(?=\s|$)/g,' ')
    .replace(/เมื่อวาน|วันนี้|พรุ่งนี้/g,' ')
    .replace(/\s+/g,' ').trim();
  const ambiguousFields=[];
  if(action!=='transfer' && !category) ambiguousFields.push('category');
  if(!lastUsedAccountId) ambiguousFields.push('accountId');
  return {
    action, amount, date, note:note||raw, category,
    accountId:lastUsedAccountId||null, fromAccountId:null, toAccountId:null, person:null, dueDate:null,
    confidence:ambiguousFields.length?'needs_confirmation':'high', ambiguousFields
  };
}

// รับข้อความภาษาคน คืน { ok:true, payload } ตาม schema ในข้อ 2 ของแผน หรือ { ok:false, error }
async function parseNaturalLanguageEntry(text){
  const fastPayload=parseSpokenTransactionFast(text);
  if(fastPayload) return { ok:true, payload:fastPayload, fast:true };
  if(getApiKeys().length === 0) return { ok:false, error:"missing_api_key" };
  if(!text || !text.trim()) return { ok:false, error:"empty_input" };

  const context = buildAIContext();
  const systemPrompt = buildAISystemPrompt(context);

  let res;
  try{
    res = await fetchGeminiWithRetry(
      (apiKey) => `https://generativelanguage.googleapis.com/v1beta/models/${AI_TRANSACTION_MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: text.trim() }] }],
          systemInstruction: { parts: [{ text: systemPrompt }] },
          generationConfig: {
            response_mime_type: "application/json",
            response_schema: AI_RESPONSE_SCHEMA
          }
        })
      }
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

  const raw = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if(!raw) return { ok:false, error:"empty_response" };

  let payload;
  try{ payload = JSON.parse(raw); }catch(e){ return { ok:false, error:"invalid_json" }; }

  return { ok:true, payload };
}

// ===== AI Layer (Milestone 2): Dual-Intent Router =====
const INTENT_RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    intent: { type: "STRING", enum: ["transaction","query"] }
  },
  required: ["intent"]
};

// ตรวจว่าข้อความของผู้ใช้เป็น "transaction" (ต้องการบันทึกรายการ) หรือ "query" (คำถาม/ขอวิเคราะห์)
// ด่านแรกก่อนเข้า flow ใดๆ — คืน { ok:true, intent } หรือ { ok:false, error } รูปแบบเดียวกับ parseNaturalLanguageEntry
async function classifyIntent(text){
  if(!text || !text.trim()) return { ok:false, error:"empty_input" };
  // ประโยคสั้นที่ local parser เข้าใจได้ ให้เป็น transaction ทันที — เร็วกว่าเรียก AI และแก้เคส "กินข้าว เมื่อวาน 43"
  if(parseSpokenTransactionFast(text)) return { ok:true, intent:"transaction", fast:true };
  if(getApiKeys().length === 0) return { ok:false, error:"missing_api_key" };

  const systemPrompt = [
    "คุณคือตัวจัดประเภทข้อความสำหรับแอปการเงินส่วนตัว Vaultet",
    "หน้าที่ของคุณคือดูข้อความที่ผู้ใช้พิมพ์ แล้วตัดสินว่าเป็นประเภทไหนใน 2 แบบนี้เท่านั้น:",
    '- "transaction": ข้อความที่มีเจตนา "บันทึก" ธุรกรรมการเงินใหม่ รวมถึงภาษาพูดที่ไม่มีกริยาบันทึก เช่น "กินข้าว เมื่อวาน 43", "กาแฟ 60", "รถไฟฟ้า 45" หากมีชื่อสิ่งที่ซื้อ/กิจกรรม + จำนวนเงิน ให้ถือเป็น transaction',
    '- "query": ข้อความที่เป็นคำถาม ขอให้วิเคราะห์ หรือสงสัยเกี่ยวกับสถานะการเงิน เช่น ถามยอดเงินคงเหลือ ถามว่าเดือนนี้ใช้จ่ายไปเท่าไหร่ เทียบเดือนที่แล้วเป็นยังไง จะมีเงินพอจ่ายไหม ไม่ใช่การขอให้บันทึกรายการใหม่',
    "ถ้าข้อความกำกวมมีทั้งสองอย่างปนกัน ให้เลือกตามเจตนาหลักที่เด่นที่สุดของข้อความ",
    "ตอบกลับเป็น JSON ล้วนตาม schema ที่กำหนดเท่านั้น ห้ามมีข้อความอื่นนอก JSON"
  ].join("\n");

  let res;
  try{
    res = await fetchGeminiWithRetry(
      (apiKey) => `https://generativelanguage.googleapis.com/v1beta/models/${AI_TRANSACTION_MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: text.trim() }] }],
          systemInstruction: { parts: [{ text: systemPrompt }] },
          generationConfig: {
            response_mime_type: "application/json",
            response_schema: INTENT_RESPONSE_SCHEMA
          }
        })
      }
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

  const raw = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if(!raw) return { ok:false, error:"empty_response" };

  let payload;
  try{ payload = JSON.parse(raw); }catch(e){ return { ok:false, error:"invalid_json" }; }

  // fallback ที่ปลอดภัย: ถ้า AI ตอบค่าแปลกๆ นอก enum ให้ถือเป็น transaction (flow เดิมที่มี validation ของตัวเองอยู่แล้ว)
  const intent = (payload && payload.intent === "query") ? "query" : "transaction";
  return { ok:true, intent };
}

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
  return {
    ...legacy,
    month: mk,
    expense: { ...expense, label: "งบรายจ่าย (เดือนนี้)" },
    saving: { ...saving, label: "งบรายออม (เดือนนี้)" },
    savingOverview: saving.target > 0
      ? `เดือนนี้ผู้ใช้ตั้งเป้าออม ฿${saving.target} ออมไปแล้ว ฿${saving.actual} (${saving.pct}%) เหลืออีก ฿${Math.max(0, saving.remaining)}`
      : "เดือนนี้ผู้ใช้ยังไม่ได้ตั้งงบรายออม",
  };
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
  const snapshot = {
    generatedAt: today,
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
    budgetSummary: buildBudgetSummaryBothSides(),
    emergencyFund: computeEmergencyFund(),
    recurringExpenses: { monthlyEstimated:computeMonthlyRecurringCost(), upcoming:getUpcomingSummary() },
    goals: typeof goals!=='undefined' ? goals : [],
  };
  // Round 12: normalized intelligence context. Keep calculations deterministic and local;
  // the LLM receives this structured result instead of reconstructing finance from raw entries.
  snapshot.advisorContext = buildAdvisorContext(snapshot);
  snapshot.behaviorSummary = computeFinancialBehavior(snapshot);
  snapshot.financialBrain = computeFinancialHealth(snapshot);
  snapshot.advisorContext = buildAdvisorContext(snapshot);
  return snapshot;
}

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
function computeFinancialHealth(snapshot){
  const b=snapshot.behaviorSummary||{}, budget=snapshot.budgetSummary||{}, ef=snapshot.emergencyFund||{}, fc=snapshot.forecastToMonthEnd||{}, income=Number(snapshot.thisMonth?.income||0);
  let score=50;const factors=[];const add=(label,points,status)=>{score+=points;factors.push({label,points,status});};
  const flow=Number(snapshot.thisMonth?.netCashFlow||0); if(flow>0)add('กระแสเงินสดเป็นบวก',15,'positive'); else if(flow<0)add('กระแสเงินสดติดลบ',-20,'negative');
  if(budget.budgetCount){if(budget.overCount>0)add(`เกินงบ ${budget.overCount} หมวด`,-15,'negative');else if(budget.watchCount>0)add(`ต้องเฝ้าดูงบ ${budget.watchCount} หมวด`,-6,'warning');else add('คุมงบได้ดี',10,'positive');}
  if(ef.recommendedEmergencyFund>0){if(ef.currentAvailableReserve>=ef.recommendedEmergencyFund)add('เงินสำรองถึงเป้าหมาย',15,'positive');else if(ef.currentAvailableReserve>=ef.recommendedEmergencyFund*.5)add('เงินสำรองกำลังสร้าง',6,'warning');else add('เงินสำรองยังต่ำ',-12,'negative');}
  if(income>0){const __S=getBrainTargets().savingsRatePct;if(b.savingsRate>=__S)add('อัตราออมแข็งแรง',10,'positive');else if(b.savingsRate>=__S/2)add('มีการออมสม่ำเสมอ',5,'warning');else add('อัตราออมต่ำ',-7,'warning');}
  if(Number(fc.forecastAvailable||0)<0)add('คาดการณ์เงินใช้ได้ติดลบ',-20,'negative'); else if(Number(fc.forecastAvailable||0)>0)add('คาดการณ์เงินใช้ได้ยังเป็นบวก',5,'positive');
  if(b.discretionaryRatio>60)add('รายจ่ายไม่จำเป็นมีสัดส่วนสูง',-8,'warning');
  if(Number(snapshot.monthComparison?.incomeChange||0)<0&&income>0)add('รายรับลดจากเดือนก่อน',-5,'warning');
  score=Math.max(0,Math.min(100,Math.round(score)));const status=score<40?'CRITICAL':score<70?'WATCH':'HEALTHY';
  const __T=getBrainTargets(),benchmark={essentialTargetPct:__T.essentialMaxPct,discretionaryTargetPct:__T.discretionaryMaxPct,savingTargetPct:__T.savingsRatePct,essentialPct:income>0?b.essentialExpense/income*100:null,discretionaryPct:income>0?b.discretionaryExpense/income*100:null,savingPct:income>0?Number(snapshot.thisMonth?.saving||0)/income*100:null};
  return {score,status,factors,negativeFactorCount:factors.filter(x=>x.status==='negative').length,benchmark,strengths:factors.filter(x=>x.status==='positive').map(x=>x.label),risks:factors.filter(x=>x.status!=='positive').map(x=>x.label)};
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
  if(b.savingsRate<getBrainTargets().savingsRatePct/2&&Number(snapshot.thisMonth.income||0)>0)f.push({id:'SAVINGS_RATE_LOW',severity:'warning',data:{savingsRate:b.savingsRate}});
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
    "ถ้าคำถามของผู้ใช้ต้องการข้อมูลที่ไม่มีอยู่ใน Snapshot ให้บอกตรงๆ ว่าไม่มีข้อมูลส่วนนั้น อย่าสร้างตัวเลขขึ้นมาเอง",
    `เกณฑ์สุขภาพการเงินของเดือนนี้ในระบบ (หน้า Financial Brain ใช้ค่านี้): ออม ≥${getBrainTargets().savingsRatePct}% , จำเป็น ≤${getBrainTargets().essentialMaxPct}% , ไม่จำเป็น ≤${getBrainTargets().discretionaryMaxPct}% ของรายรับ`,
    "ถ้า queryContext.mode=income_allocation (ผู้ใช้สมมติรายรับ) ใช้ queryContext.plan เป็นฐาน แต่ปรับสัดส่วนให้เหมาะกับสถานการณ์ได้ (เช่น เงินสำรองยังไม่ถึงเป้า → ออมมากขึ้น) โดยต้องบอกเปอร์เซ็นต์ที่ใช้ชัดเจน และต้องเสนอ action set_brain_targets ให้หน้า Brain ตรงกับแผนที่เสนอ",
    `การสั่งแก้ระบบ: ถ้าผู้ใช้ขอให้ตั้ง/ปรับ/ลบงบประมาณหรือเกณฑ์ Brain ให้ **เสนอ** การเปลี่ยนแปลงด้วยการเพิ่มบรรทัดท้ายคำตอบ รูปแบบ JSON บรรทัดเดียว ต่อ 1 action: @@ACTION@@ {"type":"set_budget","month":"YYYY-MM","name":"ชื่อกลุ่ม(ไม่บังคับ)","categories":["หมวด1","หมวด2"],"amount":3720} | {"type":"delete_budget","month":"YYYY-MM","categories":[...]} | {"type":"set_brain_targets","month":"YYYY-MM","savingsRatePct":20,"essentialMaxPct":50,"discretionaryMaxPct":30} | {"type":"reset_brain_targets","month":"YYYY-MM"} | {"type":"add_entry","entryType":"income|expense","category":"หมวด","amount":123,"date":"YYYY-MM-DD","note":"","account":"ชื่อบัญชี(ไม่บังคับ)"} | {"type":"edit_entry","id":"รหัสรายการ","amount":123,"category":"หมวด","date":"YYYY-MM-DD","note":""(ใส่เฉพาะช่องที่จะแก้)} | {"type":"delete_entry","id":"รหัสรายการ"} | {"type":"add_recurring","name":"ชื่อ","amount":199,"category":"หมวดรายจ่าย","frequency":"weekly|monthly|bimonthly|quarterly|yearly","nextDueDate":"YYYY-MM-DD"} | {"type":"set_emergency_target","targetMonths":3}. add_entry ใช้เมื่อผู้ใช้บอกชัดว่ามีรายการเกิดขึ้นจริงให้บันทึก (ไม่ใช่การสมมติ) และ categories ของรายรับ: ${JSON.stringify(CATS_BY_TYPE.income||[])}; ห้ามเดาจำนวนเงินหรือวันที่ที่ผู้ใช้ไม่ได้บอก ถ้าไม่ชัดให้ถามก่อน`,
    `- เดือนปัจจุบัน ${monthKey(todayISO())}; categories ต้องเป็นชื่อหมวดรายจ่ายที่มีจริงเท่านั้น: ${JSON.stringify(CATS_BY_TYPE.expense||[])}; 1 หมวดอยู่ได้แค่งบเดียวต่อเดือน; ออม+จำเป็น+ไม่จำเป็นรวมกันต้องไม่เกิน 100%`,
    `- รายการที่แก้/ลบได้ (ล่าสุด 40 รายการ; ใช้ id ตามนี้เท่านั้น ห้ามเดา id; ถ้าผู้ใช้พูดคลุมเครือว่าหมายถึงรายการไหน ให้ถามก่อน และห้ามเสนอลบ/แก้หลายรายการพร้อมกันถ้าไม่ชัดเจน): ${JSON.stringify(entries.filter(e=>(e.type==="income"||e.type==="expense")&&!e.source&&!e.recurringId&&e.category!=="กยศ.").slice(0,40).map(e=>({id:e.id,date:e.date,type:e.type,category:e.category,amount:e.amount,note:e.note||""})))}`,
    "- ผู้ใช้ต้องกดยืนยันก่อนระบบถึงจะเปลี่ยนจริง ดังนั้นห้ามบอกว่า \"ปรับให้แล้ว\" ให้บอกว่าเสนอแล้วให้กดยืนยันด้านล่าง และห้ามใส่ action ถ้าผู้ใช้แค่ถามหรือขอคำแนะนำเฉยๆ ที่ไม่ได้ขอให้ปรับระบบ; ห้ามเปิดเผยบรรทัด @@ACTION@@ ในเนื้อหาคำตอบ",
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
    JSON.stringify(snapshot)
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
  if(getApiKeys().length === 0) return { ok:false, error:"missing_api_key" };
  if(!query || !query.trim()) return { ok:false, error:"empty_input" };

  const profile = loadAIProfile(); // null ถ้าผู้ใช้ยังไม่เคยตั้งค่า — ไม่ทำให้ query flow พังถ้าไม่มีโปรไฟล์
  const queryContext=buildAdvisorQueryContext(query,snapshot,profile);
  const systemPrompt = buildFinancialAnalystSystemPrompt({...snapshot,queryContext}, profile);

  let res;
  try{
    res = await fetchGeminiWithRetry(
      (apiKey) => `https://generativelanguage.googleapis.com/v1beta/models/${AI_TRANSACTION_MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: query.trim() }] }],
          systemInstruction: { parts: [{ text: systemPrompt }] },
          generationConfig: { maxOutputTokens: 4096 }
        })
      }
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
function renderAiActionCard(m,idx){
  if(!Array.isArray(m.actions)||!m.actions.length) return "";
  const st={pending:"",done:" ✓ ทำแล้ว",cancelled:" (ยกเลิก)",revised:" (ขอปรับ — พิมพ์ข้อเสนอของคุณด้านล่าง)",undone:" (ย้อนกลับแล้ว)",failed:" ✗ ทำไม่ได้"};
  const btn=(op,ai,t)=>`<button type="button" data-aiact="${op}" data-mi="${idx}" data-ai="${ai}" style="padding:9px 14px;min-height:38px;border-radius:999px;border:1px solid var(--line);background:var(--surface-2);color:var(--ink);font-size:13px;cursor:pointer;position:relative;z-index:3;pointer-events:auto;touch-action:manipulation;">${t}</button>`;
  return `<div style="margin:8px 0 0;padding:10px 12px;border:1px solid var(--line);border-radius:12px;background:var(--surface-2);font-size:12.5px;"><div style="font-weight:700;margin-bottom:6px;">🛠 สิ่งที่ AI เสนอให้ปรับ</div>${m.actions.map((a,ai)=>`<div style="padding:6px 0;border-top:1px solid var(--line);"><div>${escapeHtml(describeAiAction(a))}<span style="color:var(--faint)">${st[a.status]||""}</span>${a.msg?`<div style="color:var(--expense)">${escapeHtml(a.msg)}</div>`:""}</div><div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:8px;">${a.status==="pending"?btn("ok",ai,"✓ ยืนยัน")+btn("rev",ai,"💬 เสนอแก้")+btn("no",ai,"ยกเลิก"):a.status==="done"?btn("undo",ai,"↩ ย้อนกลับ"):""}</div></div>`).join("")}</div>`;
}
document.addEventListener("click",e=>{
  const b=e.target.closest&&e.target.closest("[data-aiact]"); if(!b) return;
  e.preventDefault(); e.stopPropagation();
  try{
    const op=b.dataset.aiact, mi=Number(b.dataset.mi), ai=Number(b.dataset.ai), cid=loadAllChats().activeId, h=loadAIChatHistory(), a=h[mi]&&h[mi].actions&&h[mi].actions[ai];
    if(!a){ showToast("ไม่พบข้อเสนอนี้แล้ว"); return; }
    if(op==="ok"&&a.status==="pending"){ const r=executeAiAction(a); if(r.ok){a.status="done";a.undo=r.undo;showToast("ปรับระบบแล้ว ✓");}else{a.status="failed";a.msg=r.msg;showToast(r.msg||"ทำไม่สำเร็จ");} }
    else if(op==="no"&&a.status==="pending"){ a.status="cancelled"; }
    else if(op==="rev"&&a.status==="pending"){ a.status="revised"; const inp=document.getElementById("aiChatInput"); if(inp){ inp.value="ขอปรับข้อเสนอนี้: "+describeAiAction(a)+" → อยากให้ปรับเป็น "; inp.focus(); try{inp.setSelectionRange(inp.value.length,inp.value.length);}catch(_){} } showToast("พิมพ์สิ่งที่อยากปรับแล้วกดส่งได้เลย"); }
    else if(op==="undo"&&a.status==="done"&&a.undo){ undoAiAction(a.undo); a.status="undone"; delete a.undo; showToast("ย้อนกลับแล้ว"); }
    saveAIChatHistoryForChat(cid,h);
    renderAiChatBubbles();
    try{ render(); }catch(err){ console.error("render after ai action",err); }
  }catch(err){ console.error("ai action click",err); showToast("เกิดข้อผิดพลาด: "+(err&&err.message||err)); }
},true);
function processAiReplyForMemory(text){
  { const acts=[]; const re=/^@@ACTION@@\s*(\{.*\})\s*$/gm; let m; while((m=re.exec(text||""))){ try{ const s=sanitizeAiAction(JSON.parse(m[1])); if(s) acts.push(s); }catch(e){} } __pendingActions=acts.slice(0,6); text=String(text||"").replace(/^@@ACTION@@.*$/gm,""); }
  const { cleaned, adds, dels } = extractMemoryDirectives(text);
  applyMemoryDirectives(adds, dels);
  return cleaned;
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
    return `<div class="ai-chat-msg role-${m.role}" data-idx="${idx}"><div class="ai-chat-bubble ${bubbleCls}">${inner}</div>${renderAiActionCard(m,idx)}${actions}</div>`;
  }).join("");
  body.scrollTop = body.scrollHeight;
  const activeChatId=loadAllChats().activeId;
  if(aiRequestState?.status==='pending' && aiRequestState.chatId===activeChatId){
    showAiChatTyping();
  }
}

// ตัวบอกสถานะ "AI กำลังพิมพ์" — เป็น DOM ชั่วคราว ไม่เก็บลงประวัติ
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

function loadAIAdvisorInstruction(){ return (localStorage.getItem(AI_ADVISOR_INSTRUCTION_KEY) || "").trim().slice(0,2000); }
function saveAIAdvisorInstruction(value){ localStorage.setItem(AI_ADVISOR_INSTRUCTION_KEY, String(value || "").trim().slice(0,2000)); }

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
async function generateChatReply(priorHistory, userText, snapshot, profile, signal){
  if(getApiKeys().length === 0) return { ok:false, error:"missing_api_key" };
  if(!userText || !userText.trim()) return { ok:false, error:"empty_input" };

  const baseSystemPrompt = buildAIChatSystemPrompt(snapshot, profile);
  // ไม่ส่งคำตอบ AI เก่าที่เป็นเศษข้อความกลับเข้าไปเป็นบริบท เพราะจะทำให้ความเพี้ยนสะสม
  const recentHistory = priorHistory.filter(isSafeHistoryMessage).slice(-16);
  const contents = recentHistory
    .map(m => ({ role: m.role === "user" ? "user" : "model", parts:[{ text: String(m.text).trim() }] }))
    .concat([{ role:"user", parts:[{ text: userText.trim() }] }]);

  async function requestReply(extraInstruction){
    let res;
    try{
      res = await fetchGeminiWithRetry(
        (apiKey) => `https://generativelanguage.googleapis.com/v1beta/models/${AI_ADVISOR_MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents,
            systemInstruction: { parts: [{ text: baseSystemPrompt + (extraInstruction ? "\n\n" + extraInstruction : "") }] },
            generationConfig: { temperature: 0.25, maxOutputTokens: 4096 }
          }),
          signal
        },
        1
      );
    }catch(e){
      if(e && e.name === "AbortError") return { ok:false, error:"aborted" };
      return { ok:false, error:"network_error" };
    }

    if(!res.ok){
      let detail = "";
      try{ detail = (await res.text()).slice(0,300); }catch(e){}
      return { ok:false, error: res.status === 400 ? "invalid_api_key" : "api_error", detail, status: res.status };
    }

    let data;
    try{ data = await res.json(); }catch(e){ return { ok:false, error:"invalid_json" }; }
    const rawText = collectGeminiText(data);
    if(!rawText) return { ok:false, error:"empty_response" };
    const text = cleanAiChatReply(rawText);
    return { ok:true, text, data };
  }

  let result=await requestReply("");
  if(!result.ok) return result;
  if(isUsableAiChatReply(result.text,result.data)) return { ok:true, text:result.text };

  // ถ้ารอบแรกถูกตัดหรือคืนเศษข้อมูล ให้ลองใหม่ครั้งเดียวด้วยกติกาที่เข้มขึ้น แทนการบันทึกคำตอบเสียลงประวัติ
  result=await requestReply("คำตอบรอบก่อนมีความเสี่ยงเป็นเศษข้อความหรือถูกตัด ให้ตอบคำถามล่าสุดใหม่ทั้งหมดเป็นภาษาไทยแบบสมบูรณ์ ห้ามอ้างชื่อฟิลด์ภายใน และต้องจบคำตอบอย่างเป็นธรรมชาติ.");
  if(!result.ok) return result;
  if(!isUsableAiChatReply(result.text,result.data)) return { ok:false, error:"invalid_ai_response" };
  return { ok:true, text:result.text };
}

// แปลง Markdown พื้นฐาน (**ตัวหนา** และขึ้นบรรทัดใหม่) เป็น HTML อย่างปลอดภัย — escapeHtml() ก่อนเสมอ กัน XSS จากคำตอบ AI
function simpleMarkdownToHtml(text){
  const escaped = escapeHtml(text);
  return escaped
    .replace(/\*\*(.+?)\*\*/g, '<strong style="color:var(--accent1)">$1</strong>')
    .replace(/\n/g, "<br>");
}

// ===== AI Layer (Milestone 4): Proactive Financial Advisor =====

// --- Deterministic Rule Engine — Pure Local Function 100%, ไม่ยิง Network ---
function evaluateProactiveRules(snapshot, profile){
  const intelligence=getAdvisorIntelligence(snapshot,profile||{});
  const findings=[];
  // Adapter layer: retain the existing notification IDs/UI while the intelligence layer owns priority.
  intelligence.allFindings.forEach(f=>{
    let id='ADVISOR_'+f.id, severity=f.severity==='critical'?'critical':f.severity==='important'?'warning':'info';
    const d=f.data||{};
    if(f.id==='LIQUIDITY_FORECAST')id='D';
    else if(f.id==='MIN_BUFFER')id='A';
    else if(f.id==='OBLIGATION_SHORTFALL')id='C';
    else if(f.id==='SPENDING_ABOVE_BASELINE'||f.id==='CATEGORY_SPIKE')id='B';
    else if(f.id==='SAVINGS_PACE')id='SAVINGS_RATE_LOW';
    else if(f.id==='INCOME_BELOW_BASELINE')id='INCOME_DROP';
    else if(f.id==='STABLE')id='OK';
    findings.push({id,severity,data:d,priorityScore:f.priorityScore,evidence:f.evidence,action:f.action,stateKey:f.stateKey,state:f.state,confidence:f.confidence,urgency:f.urgency,impact:f.impact,insightType:f.id==='STABLE'?'progress':(severity==='critical'?'action':severity==='warning'?'warning':'insight'),sourceFindingId:f.id});
  });
  const top=findings.filter(f=>f.id!=='OK').sort((a,b)=>b.priorityScore-a.priorityScore).slice(0,3);
  const stable=findings.find(f=>f.id==='OK');
  return {severity:top[0]?.severity || 'positive',topRuleId:top[0]?.id || 'OK',findings:top.length?top:(stable?[stable]:[]),intelligence};
}

// --- Smart Cache & Invalidation ---
// dataFingerprint ครอบคลุมทั้งการให้ยืมเงิน (loans), การแก้ตัวเลข (edit), และการเพิ่ม/ลบรายการ
function getProactiveDataFingerprint(snapshot){
  // Include the actual financial state, not only array lengths/first entry.
  // This prevents stale Advisor/AI insight after editing an older repayment or loan.
  const compactEntries=entries.map(e=>({id:e.id,type:e.type,category:e.category,accountId:e.accountId,fromAccountId:e.fromAccountId,toAccountId:e.toAccountId,amount:e.amount,date:e.date,source:e.source,loanId:e.loanId,repaymentId:e.repaymentId,debtId:e.debtId,debtPrincipalImpact:e.debtPrincipalImpact}));
  const compactLoans=loans.map(l=>({id:l.id,amount:l.amount,accountId:l.accountId,adjustments:l.adjustments,repayments:l.repayments}));
  return `${JSON.stringify(compactEntries)}|${JSON.stringify(compactLoans)}|${JSON.stringify(debts)}|${JSON.stringify(budgets)}|${JSON.stringify(snapshot.budgetSummary)}|${JSON.stringify(snapshot.emergencyFund)}|${JSON.stringify(snapshot.financialBrain)}|${JSON.stringify(snapshot.behaviorSummary)}`;
}
function loadProactiveCache(){
  try{
    const raw = localStorage.getItem(AI_PROACTIVE_KEY);
    return raw ? JSON.parse(raw) : null;
  }catch(e){ return null; }
}
function saveProactiveCache(cache){
  try{ localStorage.setItem(AI_PROACTIVE_KEY, JSON.stringify(cache)); }catch(e){}
}

function proactiveRuleLabel(id){
  return { A:"เงินสำรองเสี่ยง", B:"ค่าใช้จ่ายพุ่งผิดปกติ", C:"ภาระใกล้ถึงกำหนด", D:"กระแสเงินสดตึงตัว", BUDGET_OVER:"งบประมาณเกิน", BUDGET_PACE_HIGH:"ใช้เงินเร็วเกินงบ", EMERGENCY_LOW:"เงินสำรองฉุกเฉินยังไม่พอ", EMERGENCY_HEALTHY:"เงินสำรองฉุกเฉินแข็งแรง", CASHFLOW_NEGATIVE:"กระแสเงินสดติดลบ", FORECAST_NEGATIVE:"เงินอาจไม่พอถึงสิ้นช่วง", HIGH_DISCRETIONARY_SPENDING:"รายจ่ายไม่จำเป็นสูง", SPENDING_SPIKE:"รายจ่ายพุ่งผิดปกติ", INCOME_DROP:"รายรับลดลง", SAVINGS_RATE_LOW:"อัตราออมต่ำ", FINANCIAL_STRENGTH:"สุขภาพการเงินแข็งแรง", OK:"ภาพรวมการเงิน" }[id] || "ภาพรวมการเงิน";
}

function buildProactiveSystemPrompt(evalResult, snapshot, profile){
  const hasProfile = hasAIProfileContent(profile);
  const lines = [
    "คุณคือ Personal Financial Manager ของแอป Vaultet ทำหน้าที่เขียนข้อความสั้นๆ แสดงบนการ์ด Financial Review หน้า Dashboard",
    "บุคลิก: calm, professional, practical, honest, context-aware, ไม่ตื่นตูมและไม่รายงานทุกอย่างที่เกิดขึ้น",
    "ถ้าสถานะการเงินปกติ ให้เงียบหรือสรุปสั้นๆ ว่าไม่มีเรื่องเร่งด่วน ไม่ต้องหาเรื่องมาเตือน",
    "ทำหน้าที่เหมือน Personal Financial Manager: ตีความ → อธิบาย → จัดลำดับ → เสนอ action ไม่ใช่รายงานทุก transaction",
    "แยก regular/non-loan income ออกจาก loan repayment เสมอ; loan repayment คือการเปลี่ยน receivable กลับเป็น cash ไม่ใช่ earned income",
    "ถ้าข้อมูลย้อนหลังไม่พอสำหรับ baseline ให้บอกว่าไม่พอ ห้ามสร้างคำว่า unusual จากข้อมูลน้อย",
    "ถ้าเป็น forecast ให้ระบุสมมติฐานและใช้คำว่า estimated/based on current pattern ไม่ใช่คำรับรอง",
    "เขียนแบบคนคุยกับเจ้าของเงินจริงๆ: สั้น กระชับ เป็นธรรมชาติ ไม่เป็นภาษารายงานบริษัท; โดยทั่วไป 1-3 ประโยค และใช้เฉพาะตัวเลขที่จำเป็น",
    "ถ้าต้องแนะนำ ให้พูดสิ่งที่ควรทำต่อแบบ practical ไม่สั่งสอน ไม่ตื่นตูม; ถ้าไม่มีอะไรสำคัญ ให้บอกสั้นๆ ว่าทุกอย่างยังโอเค",
    "ใช้ **ตัวหนา** ล้อมรอบตัวเลขเงินหรือหมวดหมู่/รายการที่สำคัญที่สุดที่ต้องการเน้น",
    "อ้างอิงเฉพาะตัวเลขจาก Findings/Snapshot ด้านล่างเท่านั้น ห้ามคำนวณหรือสร้างตัวเลขขึ้นมาเอง",
    `เรื่องที่สำคัญที่สุดตอนนี้คือ: ${proactiveRuleLabel(evalResult.topRuleId)} (severity: ${evalResult.severity})`,
    evalResult.severity === "positive"
      ? "ไม่มีความเสี่ยงเร่งด่วน — ให้ชมเชยสั้นๆ หรือสรุปความคืบหน้าไปเป้าหมาย/สถานะการเงินโดยรวมในเชิงบวก"
      : "ให้เตือนเฉพาะเรื่องที่สำคัญที่สุด (ตาม Findings อันดับแรก) อย่างตรงไปตรงมา ไม่ต้องพูดถึงทุกเรื่องพร้อมกัน",
  ];
  if(hasProfile){
    lines.push(
      "",
      profile.nickname ? `- ถ้าเหมาะสม เรียกผู้ใช้ว่า "${profile.nickname}" ในข้อความได้` : null,
      "User Profile:",
      JSON.stringify(profile)
    );
  }
  lines.push("", "Advisor Intelligence (Top priorities + evidence + action):", JSON.stringify(evalResult.intelligence||{}));
  lines.push("", "Findings (เรียงตามความสำคัญแล้ว):", JSON.stringify(evalResult.findings));
  lines.push("", "Financial Snapshot:", JSON.stringify(snapshot));
  lines.push("", "Financial Brain Context:", JSON.stringify(buildFinancialBrainContext(snapshot, profile)));
  return lines.filter(l => l !== null).join("\n");
}

// ส่ง Findings + Snapshot + Profile ให้ Gemini เรียบเรียงเป็นข้อความ คืน { ok:true, text } หรือ { ok:false, error }
async function generateProactiveInsight(evalResult, snapshot, profile){
  if(getApiKeys().length === 0) return { ok:false, error:"missing_api_key" };

  const systemPrompt = buildProactiveSystemPrompt(evalResult, snapshot, profile);

  let res;
  try{
    res = await fetchGeminiWithRetry(
      (apiKey) => `https://generativelanguage.googleapis.com/v1beta/models/${AI_TRANSACTION_MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: "สร้างข้อความสำหรับการ์ด Insight ตาม system prompt ด้านบน" }] }],
          systemInstruction: { parts: [{ text: systemPrompt }] },
          generationConfig: { maxOutputTokens: 4096 }
        })
      }
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
  const draw=(arr,target)=>{if(!target)return;target.innerHTML=arr.length?arr.map(n=>`<div class="notification-item ${n.read?"":"unread"}" data-notif-id="${escapeHtml(n.id)}"><div class="notification-icon">${n.icon||"🔔"}</div><div class="notification-content"><div class="notification-item-title">${escapeHtml(n.title)}</div><div class="notification-item-body">${escapeHtml(n.body)}</div></div><div class="notification-time">${escapeHtml((n.day||todayISO())===todayISO() ? (n.createdAt ? new Date(n.createdAt).toLocaleTimeString("th-TH",{hour:"2-digit",minute:"2-digit"}) : "ตอนนี้") : dayLabel(n.day||todayISO()))}</div></div>`).join(""):"<div class=\"notification-empty\">ตอนนี้ยังไม่มีเรื่องสำคัญที่ต้องแจ้ง 🎉</div>";target.querySelectorAll("[data-notif-id]").forEach(el=>el.onclick=()=>{const x=loadVaultetNotifications(),n=x.find(v=>v.id===el.dataset.notifId);if(n)n.read=true;saveVaultetNotifications(x);renderVaultetNotifications()})};
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
  if(!current.length){target.innerHTML='<div class="notification-empty">ตอนนี้ทุกอย่างค่อนข้างเสถียร — ไม่มีเรื่องที่ต้องจัดการเป็นพิเศษ 🎉</div>';return;}
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
  document.getElementById("aiProactiveIcon").textContent = meta.icon;

  const bodyEl = document.getElementById("aiProactiveBody");
  if(state === "loading"){
    bodyEl.innerHTML = `<span style="color:var(--faint)">กำลังวิเคราะห์สถานะการเงิน...</span>`;
  }else if(state === "needsApiKey"){
    bodyEl.innerHTML = `<span style="color:var(--faint)">ตั้งค่า API Key (⚙️) เพื่อเปิดใช้งานการวิเคราะห์อัตโนมัติ</span>`;
  }else if(state === "error" && !text){
    const label = (errorInfo && AI_ERROR_MESSAGES[errorInfo.error]) || "เรียก AI ไม่สำเร็จ";
    const codeLine = errorInfo && errorInfo.error ? `<br><span style="font-size:11px;opacity:0.65;">โค้ด: ${escapeHtml(errorInfo.error)}${errorInfo.status ? " (HTTP " + errorInfo.status + ")" : ""}</span>` : "";
    const detailLine = errorInfo && errorInfo.detail ? `<br><span style="font-size:11px;opacity:0.65;">${escapeHtml(errorInfo.detail)}</span>` : "";
    bodyEl.innerHTML = `<span style="color:var(--faint)">${label} — กด 🔄 เพื่อลองใหม่${codeLine}${detailLine}</span>`;
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

  if(getApiKeys().length === 0){
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
  if(getApiKeys().length === 0){
    showToast("ยังไม่ได้ตั้งค่า API Key — กดไอคอน ⚙️ เพื่อตั้งค่าก่อน");
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
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      if(!confirm("ลบแชทนี้ทั้งหมดใช่ไหม? กู้คืนไม่ได้")) return;
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

const aiAdvisorSettingsBtn = document.getElementById("aiAdvisorSettingsBtn");
const aiAdvisorSettingsPanel = document.getElementById("aiAdvisorSettingsPanel");
const aiAdvisorInstructionEl = document.getElementById("aiAdvisorInstruction");
const aiAdvisorInstructionStatus = document.getElementById("aiAdvisorInstructionStatus");
if(aiAdvisorInstructionEl) aiAdvisorInstructionEl.value = loadAIAdvisorInstruction();
aiAdvisorSettingsBtn?.addEventListener("click", () => {
  aiAdvisorSettingsPanel?.classList.toggle("is-open");
  if(aiAdvisorSettingsPanel?.classList.contains("is-open")) aiAdvisorInstructionEl?.focus();
});
document.getElementById("saveAiAdvisorInstructionBtn")?.addEventListener("click", () => {
  saveAIAdvisorInstruction(aiAdvisorInstructionEl?.value || "");
  if(aiAdvisorInstructionStatus) aiAdvisorInstructionStatus.textContent = "บันทึกแล้ว — จะใช้กับข้อความถัดไปทันที";
});
document.getElementById("resetAiAdvisorInstructionBtn")?.addEventListener("click", () => {
  if(aiAdvisorInstructionEl) aiAdvisorInstructionEl.value = "";
  saveAIAdvisorInstruction("");
  if(aiAdvisorInstructionStatus) aiAdvisorInstructionStatus.textContent = "รีเซ็ตเป็นรูปแบบมาตรฐานแล้ว";
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

  if(getApiKeys().length === 0){
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
  const result = await generateChatReply(priorHistory, text, snapshot, profile, aiChatAbortController.signal);
  const aiElapsedMs = Math.round(performance.now() - aiRequestStartedAt);
  aiChatAbortController = null;

  if(!isAiRequestCurrent(requestId)) return;
  aiRequestState.status=result.ok?'completed':(result.error==='aborted'?'cancelled':'error');
  aiChatBusy = false;
  hideAiChatTyping();
  setAiChatSendBtnState(false);
  input.disabled = false;

  if(!result.ok){
    if(result.error === "aborted"){ aiRequestState=null; renderAiChatBubbles(); return; }
    const label = aiErrorLabel(result);
    const codeLine = result.error ? ` (โค้ด: ${result.error}${result.status ? " HTTP " + result.status : ""})` : "";
    errBox.textContent = label + codeLine + " — ข้อความที่พิมพ์ไว้ยังอยู่ ลองกดส่งใหม่ได้เลย";
    errBox.style.display = "block";
    aiRequestState=null;
    renderAiChatBubbles();
    return;
  }

  const historyWithReply = historyWithUserMsg.concat([{ role:"model", text: processAiReplyForMemory(result.text), actions: takePendingActions() }]);
  saveAIChatHistoryForChat(requestChatId, historyWithReply);
  aiRequestState=null;
  renderAiChatBubbles();
  const latencyEl = document.createElement("div");
  latencyEl.className = "ai-chat-latency";
  latencyEl.textContent = `ตอบใน ${(aiElapsedMs/1000).toFixed(1)} วินาที`;
  if(isAdvisorPageActive()) document.getElementById("aiAnalystBody")?.appendChild(latencyEl);

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

// ใช้ตอนกด "🔄 ตอบใหม่" — ตัดคำตอบ AI อันเดิมทิ้ง แล้วยิงคำถามเดิมซ้ำ
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
  const result = await generateChatReply(priorHistory, userText, snapshot, profile, aiChatAbortController.signal);
  aiChatAbortController = null;

  if(!isAiRequestCurrent(requestId)) return;
  aiRequestState.status=result.ok?'completed':(result.error==='aborted'?'cancelled':'error');
  hideAiChatTyping();
  aiChatBusy = false;
  setAiChatSendBtnState(false);
  document.getElementById("aiChatInput").disabled = false;

  if(!result.ok){
    if(result.error === "aborted"){aiRequestState=null;renderAiChatBubbles();return;}
    const label = aiErrorLabel(result);
    errBox.textContent = label + " — ลองตอบใหม่อีกครั้ง";
    errBox.style.display = "block";
    aiRequestState=null; renderAiChatBubbles(); return;
  }

  saveAIChatHistoryForChat(requestChatId,priorHistory.concat([{ role:"user", text: userText }, { role:"model", text: processAiReplyForMemory(result.text), actions: takePendingActions() }]));
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
  showToast(`บันทึก${doneLabel}เรียบร้อย ✓`);
});

// ===== คำสั่งบูตที่ย้ายมาจาก app.js (ต้องรันหลังประกาศทุกอย่างครบ) =====
refreshApiKeyStatus();
refreshProactiveCard();
try{renderFinancialBrainCard();}catch(e){console.error(e);}
try{ if(typeof renderVaultetNotifications==="function") renderVaultetNotifications(); }catch(_){}

// Patch ที่เลเยอร์ใน app.js ลงทะเบียนไว้ เพื่อครอบฟังก์ชัน AI (openAiAnalystSheet / loadAIProfile / buildFinancialAnalystSystemPrompt)
(window.__vaultetAiPatches||[]).forEach(function(fn){ try{ fn(); }catch(e){ console.error(e); } });
try{pruneEmptyChats();}catch(e){}
