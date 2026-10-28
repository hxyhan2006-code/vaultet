// Vaultet — ai/02-gemini.js : สร้างบริบท, เลือกโมเดล, เรียก Gemini (หมุนคีย์/สำรอง), แยกเจตนาคำถาม
// (แยกจาก ai.js เดิม — โหลดเรียงตามเลขไฟล์ ทุกไฟล์ใช้ตัวแปร/ฟังก์ชันร่วมกันแบบ global)
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
// โมเดล Gemini ทุกงานใช้ตัวเดียวกัน (Flash 3.8) — ถ้า Google ตอบว่าไม่พบรุ่นนี้ (404) จะถอยไปรุ่นก่อนหน้าเองครั้งเดียวแล้วจำไว้
const GEMINI_MODEL_DEFAULT = "gemini-3.8-flash", GEMINI_MODEL_FALLBACK = "gemini-3.6-flash", GEMINI_MODEL_KEY = "vaultet_gemini_model_v1";
function aiModelId(){ try{ return localStorage.getItem(GEMINI_MODEL_KEY) || GEMINI_MODEL_DEFAULT; }catch(e){ return GEMINI_MODEL_DEFAULT; } }
// มี AI ให้ใช้ไหม: คีย์ Gemini อย่างน้อย 1 อัน หรือ OpenRouter ตั้งค่าครบ (คีย์ + โมเดล)
function aiAvailable(){ return getApiKeys().length > 0 || !!(window.vaultetOR && window.vaultetOR.enabled()); }

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
let geminiCooldownUntil = 0;   // หลังโควต้าฟรีเต็มทุกคีย์ แล้วสลับไป OpenRouter สำเร็จ → พักไม่ลอง Gemini ชั่วครู่ ไม่ให้ทุกข้อความต้องรอล้มก่อน
async function fetchGeminiWithRetry(buildUrl, options, maxRetriesPerKey = 2, meta = {}){
  // ทุกงาน (แชท การ์ดสรุป แปลงประโยค ฯลฯ) ใช้ Gemini ฟรีก่อนเสมอ
  // ถ้าโควต้าฟรีเต็มทุกคีย์ และตั้ง OpenRouter ไว้ ค่อยสลับไป OpenRouter เงียบๆ (ไม่แจ้งผู้ใช้)
  const OR = window.vaultetOR, kind = meta.kind || "small";
  const stream = /streamGenerateContent/.test(buildUrl("x"));
  const orOn = !!(OR && OR.enabled());
  if(orOn && Date.now() < geminiCooldownUntil){
    aiRunEvent("ใช้ OpenRouter (Gemini ฟรีเพิ่งเต็ม พักไว้ชั่วคราว)");
    const r = await OR.call(options.body, { kind, stream, signal: options.signal });
    if(r){ noteAiOR(); return r; }
  }
  const retries = orOn ? 0 : maxRetriesPerKey;   // มีตัวสำรองแล้ว ไม่ต้องรอ retry นาน
  const keys = getApiKeys();
  let res = null;
  for(let i = 0; i < keys.length; i++){
    let url = buildUrl(keys[i]);
    let attempt = 0;
    while(true){
      res = await fetch(url, options);
      // รุ่น 3.8 ยังไม่เปิดให้คีย์นี้ (404) → ถอยไปรุ่นก่อนหน้า จำไว้ แล้วลองใหม่ทันที
      if(res.status === 404 && aiModelId() === GEMINI_MODEL_DEFAULT){
        try{ localStorage.setItem(GEMINI_MODEL_KEY, GEMINI_MODEL_FALLBACK); }catch(e){}
        url = buildUrl(keys[i]);
        res = await fetch(url, options);
      }
      if((res.status !== 429 && res.status !== 503) || attempt >= retries) break;
      attempt++;
      await new Promise(r => setTimeout(r, 1500 * attempt)); // หน่วงเพิ่มขึ้นทีละรอบ: 1.5s, 3s
    }
    noteAiKey(i, res.ok ? "ok" : res.status === 429 ? "full" : res.status === 503 ? "busy" : "bad");
    if(res.status !== 429 && res.status !== 503) return res; // สำเร็จ หรือ error อื่นที่ไม่ใช่โควต้าเต็ม → ไม่ต้องลองคีย์อื่น
    // คีย์นี้โควต้าเต็ม → ลองคีย์สำรองถัดไปทันที
    if(i + 1 < keys.length) aiRunEvent(`คีย์ Gemini ที่ ${i + 1} โควต้าเต็ม ลองคีย์ที่ ${i + 2}`);
  }
  if(orOn){
    aiRunEvent("คีย์ Gemini ฟรีเต็มทั้งหมด สลับไปใช้ OpenRouter");
    const r = await OR.call(options.body, { kind, stream, signal: options.signal });
    if(r){ geminiCooldownUntil = Date.now() + 90000; noteAiOR(); return r; }
  }
  return res || new Response("no_ai_available", { status: 503 });
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
  if(!aiAvailable()) return { ok:false, error:"missing_api_key" };
  if(!text || !text.trim()) return { ok:false, error:"empty_input" };

  const context = buildAIContext();
  const systemPrompt = buildAISystemPrompt(context);

  let res;
  try{
    res = await fetchGeminiWithRetry(
      (apiKey) => `https://generativelanguage.googleapis.com/v1beta/models/${aiModelId()}:generateContent?key=${encodeURIComponent(apiKey)}`,
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
  if(!aiAvailable()) return { ok:false, error:"missing_api_key" };

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
      (apiKey) => `https://generativelanguage.googleapis.com/v1beta/models/${aiModelId()}:generateContent?key=${encodeURIComponent(apiKey)}`,
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
