// Vaultet — ai/06-stream-proactive.js : คำตอบแบบค่อยๆ พิมพ์ (สตรีม), คำแนะนำเชิงรุก (กฎในเครื่อง + แคช)
// (แยกจาก ai.js เดิม — โหลดเรียงตามเลขไฟล์ ทุกไฟล์ใช้ตัวแปร/ฟังก์ชันร่วมกันแบบ global)
// ===== คำตอบ AI แบบค่อยๆ พิมพ์ (สตรีม) =====
// ซ่อนคำสั่งหลังบ้านท้ายคำตอบ (@@ACTION@@ / @@MEMORY_*@@) ไม่ให้ผู้ใช้เห็นตอนกำลังพิมพ์
function aiStreamDisplayText(t){
  return String(t||"").replace(/^@@[A-Z_]+@@.*$/gm, "").replace(/@@[^\n]*$/, "").replace(/\s+$/, "");
}
function createAiStreamUI(chatId){
  let target = "", shown = 0, raf = 0, el = null, drainers = [];
  const bodyEl = () => document.getElementById("aiAnalystBody");
  function ensure(){
    const body = bodyEl();
    if(!body || loadAllChats().activeId !== chatId) return null;
    if(el && el.isConnected) return el;
    hideAiChatTyping();
    el = document.createElement("div");
    el.className = "ai-chat-msg role-model is-streaming";
    el.innerHTML = '<div class="ai-chat-bubble ai-chat-model"></div>';
    body.appendChild(el);
    return el;
  }
  function paint(){
    raf = 0;
    const full = aiStreamDisplayText(target);
    const node = ensure();
    if(node){
      if(shown < full.length) shown = Math.min(full.length, shown + Math.max(1, Math.ceil((full.length - shown) / 10)));
      const body = bodyEl();
      const stick = body.scrollHeight - body.scrollTop - body.clientHeight < 90;
      node.firstChild.innerHTML = simpleMarkdownToHtml(full.slice(0, shown)) + '<span class="ai-stream-caret"></span>';
      if(stick) body.scrollTop = body.scrollHeight;
    }
    if(shown < full.length) raf = requestAnimationFrame(paint);
    else { const d = drainers; drainers = []; d.forEach(f => f()); }
  }
  const kick = () => { if(!raf) raf = requestAnimationFrame(paint); };
  return {
    // ข้อความใหม่ไม่ได้ต่อจากของเดิม (เช่น ถามรอบสองหลังรอบแรกใช้ไม่ได้) → เริ่มพิมพ์ใหม่จากต้น แต่ไม่ล้างจอระหว่างรอ
    push(text){ const nt = String(text || ""); if(!nt || (shown > 0 && nt.slice(0, shown) !== target.slice(0, shown))) shown = 0; target = nt; kick(); },
    // รอให้ตัวหนังสือที่ค้างอยู่ค่อยๆ ขึ้นจนครบก่อน (สูงสุด 1.5 วิ) แล้วค่อยแทนด้วยข้อความจริง
    drain(){ return new Promise(res => { if(shown >= aiStreamDisplayText(target).length){ res(); return; } drainers.push(res); setTimeout(res, 1500); kick(); }); },
    remove(){ if(raf) cancelAnimationFrame(raf); raf = 0; if(el) el.remove(); el = null; }
  };
}

// onPartial(text) — ถ้าส่งมา จะรับคำตอบแบบสตรีม (ทีละท่อน) เพื่อแสดงสดๆ; ถ้าสตรีมใช้ไม่ได้จะถอยกลับไปแบบรอทั้งก้อนเอง
async function generateChatReply(priorHistory, userText, snapshot, profile, signal, onPartial){
  if(!aiAvailable()) return { ok:false, error:"missing_api_key" };
  if(!userText || !userText.trim()) return { ok:false, error:"empty_input" };

  const baseSystemPrompt = buildAIChatSystemPrompt(snapshot, profile);
  if(aiRun){
    const memOn = profile?.permissions?.memory !== false, memN = memOn ? Math.min(40, loadAIMemory().length) : 0;
    aiRun.sent = `รายการล่าสุด ${window.__aiSentRows || 0} · ความจำ ${memN} ข้อ · ประวัติแชท ${Math.min(16, priorHistory.filter(isSafeHistoryMessage).length)} ข้อความ (ประมาณ ${Math.max(1, Math.round(baseSystemPrompt.length / 1024))} KB)`;
    aiRunPaint();
  }
  // ไม่ส่งคำตอบ AI เก่าที่เป็นเศษข้อความกลับเข้าไปเป็นบริบท เพราะจะทำให้ความเพี้ยนสะสม
  const recentHistory = priorHistory.filter(isSafeHistoryMessage).slice(-16);
  const contents = recentHistory
    .map(m => ({ role: m.role === "user" ? "user" : "model", parts:[{ text: String(m.text).trim() }] }))
    .concat([{ role:"user", parts:[{ text: userText.trim() }] }]);

  async function requestReplyOnce(extraInstruction, stream){
    let res;
    const method = stream ? "streamGenerateContent?alt=sse&" : "generateContent?";
    try{
      res = await fetchGeminiWithRetry(
        (apiKey) => `https://generativelanguage.googleapis.com/v1beta/models/${aiModelId()}:${method}key=${encodeURIComponent(apiKey)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents,
            systemInstruction: { parts: [{ text: baseSystemPrompt + (extraInstruction ? "\n\n" + extraInstruction : "") }] },
            generationConfig: { temperature: 0.25, maxOutputTokens: 8192 }
          }),
          signal
        },
        1, { kind: "chat" }
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

    if(stream){
      if(!res.body || !res.body.getReader) return { ok:false, error:"stream_unsupported" };
      const reader = res.body.getReader(), dec = new TextDecoder();
      let buf = "", full = "", finishReason = "", gotText = false;
      const eat = line => {
        if(!line.startsWith("data:")) return;
        const payload = line.slice(5).trim();
        if(!payload || payload === "[DONE]") return;
        let j; try{ j = JSON.parse(payload); }catch(e){ return; }
        const cand = j?.candidates?.[0];
        if(cand?.finishReason) finishReason = cand.finishReason;
        const piece = (cand?.content?.parts || []).map(p => typeof p?.text === "string" ? p.text : "").join("");
        if(piece){ full += piece; gotText = true; try{ onPartial(full); }catch(e){} }
      };
      try{
        while(true){
          const { done, value } = await reader.read();
          if(done) break;
          buf += dec.decode(value, { stream:true });
          const lines = buf.split(/\r?\n/); buf = lines.pop();
          lines.forEach(eat);
        }
        if(buf) eat(buf);
      }catch(e){
        if(e && e.name === "AbortError") return { ok:false, error:"aborted", partialText: cleanAiChatReply(full) };
        return { ok:false, error:"network_error", gotText };
      }
      const rawText = full.trim();
      if(!rawText) return { ok:false, error:"empty_response", gotText:false };
      return { ok:true, text: cleanAiChatReply(rawText), data:{ candidates:[{ finishReason }] } };
    }

    let data;
    try{ data = await res.json(); }catch(e){ return { ok:false, error:"invalid_json" }; }
    const rawText = collectGeminiText(data);
    if(!rawText) return { ok:false, error:"empty_response" };
    const text = cleanAiChatReply(rawText);
    return { ok:true, text, data };
  }

  async function requestReply(extraInstruction){
    if(typeof onPartial !== "function") return requestReplyOnce(extraInstruction, false);
    let r = await requestReplyOnce(extraInstruction, true);
    // สตรีมไม่สำเร็จก่อนได้ข้อความใดๆ → ถอยกลับไปแบบเดิมเงียบๆ (ไม่นับกรณีกดหยุด/คีย์ผิด)
    if(!r.ok && r.error !== "aborted" && r.error !== "invalid_api_key" && !r.gotText){
      aiRunEvent("สตรีมไม่สำเร็จ ลองใหม่แบบรอทั้งก้อน");
      r = await requestReplyOnce(extraInstruction, false);
    }
    return r;
  }

  // คำตอบที่ "ถูกตัด" (ชนเพดานความยาว หรือท้ายประโยคค้าง ** [ ( ) แต่มีเนื้อหามากพอ → เก็บไว้แสดงเลย ไม่ลบทิ้งแล้วถามใหม่ (ถามใหม่ = รอเพิ่มอีกเท่าตัว)
  // ใช้ไม่ได้จริง (ว่าง สั้นเกิน เป็นเศษข้อมูลดิบ) → ถามใหม่ครั้งเดียว
  function acceptOrKeep(r){
    if(isUsableAiChatReply(r.text, r.data)) return { ok:true, text:r.text };
    const t = String(r.text || "").trim(), cut = r.data?.candidates?.[0]?.finishReason === "MAX_TOKENS" || /(?:\*\*|\[|\()\s*$/.test(t);
    if(cut && t.length >= 40 && !/^[\s]*(?:[-*•]\s*)?(?:Debt|Asset|Income|Expense)\s*:/i.test(t)){
      if(aiRun){ aiRun.truncated = true; aiRunEvent("คำตอบถูกตัดที่เพดานความยาว เก็บข้อความที่ได้ไว้ (กด ตอบใหม่ ได้)"); }
      return { ok:true, text: t.replace(/\s*(?:\*\*|\[|\()\s*$/, "").trim() };
    }
    return null;
  }
  let result=await requestReply("");
  if(!result.ok) return result;
  let kept = acceptOrKeep(result);
  if(kept) return kept;

  // รอบแรกใช้ไม่ได้จริง: ถามใหม่ครั้งเดียวด้วยกติกาที่เข้มขึ้น — ไม่ล้างข้อความบนจอระหว่างรอ (บอกไว้ในแถบสถานะ)
  if(aiRun) aiRun.retried = true;
  aiRunEvent("คำตอบรอบแรกใช้ไม่ได้ ถามใหม่อีกรอบ (จะนานขึ้น)");
  result=await requestReply("คำตอบรอบก่อนมีความเสี่ยงเป็นเศษข้อความหรือถูกตัด ให้ตอบคำถามล่าสุดใหม่ทั้งหมดเป็นภาษาไทยแบบสมบูรณ์ ห้ามอ้างชื่อฟิลด์ภายใน และต้องจบคำตอบอย่างเป็นธรรมชาติ.");
  if(!result.ok) return result;
  kept = acceptOrKeep(result);
  return kept || { ok:false, error:"invalid_ai_response" };
}

// แปลง Markdown พื้นฐาน (**ตัวหนา** และขึ้นบรรทัดใหม่) เป็น HTML อย่างปลอดภัย — escapeHtml() ก่อนเสมอ กัน XSS จากคำตอบ AI
// ปิด "แสดงเศษสตางค์" อยู่ → ตัวเลขเงินในคำตอบ AI (มี ฿ นำหน้า หรือ "บาท" ตามหลัง) ปัดเป็นบาทเต็ม ให้ตรงกับที่เหลือในแอป (ตัวเลขอื่น เช่น 2.5 เดือน 15.5% ไม่แตะ)
function aiRoundMoneyText(text){
  const s = String(text == null ? "" : text);
  if(getShowDecimals()) return s;
  const rnd = (sign, num) => { const n = Math.round(parseFloat(String(num).replace(/,/g, ""))); return (sign && n !== 0 ? "-" : "") + fmt(Math.abs(n)); };
  return s
    .replace(/(฿\s?)([-−]?)(\d[\d,]*)\.(\d{1,2})(?!\d)/g, (m, pre, sg, num, dec) => pre + rnd(sg, num + "." + dec))
    .replace(/([-−]?)(\d[\d,]*)\.(\d{1,2})(?!\d)(?=(?:\*\*)?\s*บาท)/g, (m, sg, num, dec) => rnd(sg, num + "." + dec));
}
function simpleMarkdownToHtml(text){
  const escaped = escapeHtml(aiRoundMoneyText(text));
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
    ...(getShowDecimals() ? [] : ["ตัวเลขเงินให้ปัดเป็นบาทเต็มจำนวน ไม่ใช้ทศนิยม/สตางค์ (ผู้ใช้ปิดการแสดงเศษสตางค์ไว้)"]),
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
  if(!aiAvailable()) return { ok:false, error:"missing_api_key" };

  const systemPrompt = buildProactiveSystemPrompt(evalResult, snapshot, profile);

  let res;
  try{
    res = await fetchGeminiWithRetry(
      (apiKey) => `https://generativelanguage.googleapis.com/v1beta/models/${aiModelId()}:generateContent?key=${encodeURIComponent(apiKey)}`,
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
