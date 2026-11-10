// Vaultet — ai/07b-weekly-ui.js : รายงานรายสัปดาห์ ส่วนหน้าจอ/แคช/ปุ่ม (แยกจาก 07-weekly.js เดิม) โหลดต่อจาก 07 ทันที
// ===== 3) UI & Storage =====
function injectWeeklyAuditStyles(){
  if(document.getElementById("weeklyAuditStyles")) return;
  const st = document.createElement("style");
  st.id = "weeklyAuditStyles";
  st.textContent = `
#weeklyAuditHeaderBtn{position:relative}
#weeklyAuditHeaderBtn.wa-has-new::after{content:"";position:absolute;top:4px;right:4px;width:8px;height:8px;border-radius:50%;background:var(--expense,#ff6b6b)}
.wa-banner{display:none;align-items:center;gap:10px;margin:8px 12px;padding:10px 12px;border:1px solid var(--accent1,#7c8cff);border-radius:14px;font-size:13px;line-height:1.35}
body.ux-chat-active .wa-banner.show{display:flex}
.wa-banner-text{flex:1;min-width:0}
.wa-banner-open{border:0;border-radius:10px;padding:7px 12px;background:var(--accent1,#7c8cff);color:#fff;font:inherit;font-size:12px;font-weight:700;cursor:pointer;white-space:nowrap}
.wa-banner-x{border:0;background:transparent;color:var(--faint,#888);font-size:16px;cursor:pointer;padding:4px}
.wa-overlay{position:fixed;inset:0;z-index:10050;display:none;align-items:flex-end;justify-content:center;background:rgba(0,0,0,.55)}
.wa-overlay.open{display:flex}
.wa-sheet{width:100%;max-width:560px;max-height:88vh;overflow-y:auto;background:var(--surface,var(--card,var(--bg,#15171d)));color:var(--text,inherit);border-radius:20px 20px 0 0;padding:16px 16px 22px;box-shadow:0 -8px 30px rgba(0,0,0,.35)}
.wa-head{display:flex;align-items:flex-start;justify-content:space-between;gap:10px;margin-bottom:12px}
.wa-title{font-size:16px;font-weight:700}
.wa-sub{font-size:11px;color:var(--faint,#888);margin-top:3px}
.wa-close{border:0;background:transparent;color:var(--faint,#888);font-size:20px;cursor:pointer;padding:2px 6px}
.wa-stats{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:12px}
.wa-stat{padding:9px 8px;border:1px solid rgba(128,128,128,.25);border-radius:12px;text-align:center}
.wa-stat-label{font-size:10px;color:var(--faint,#888);margin-bottom:3px}
.wa-stat-value{font-size:14px;font-weight:700}
.wa-stat-note{font-size:10px;color:var(--faint,#888);margin-top:2px}
.wa-body{font-size:14px;line-height:1.6;min-height:60px}
.wa-muted{color:var(--faint,#888)}
.wa-err{color:var(--expense,#ff6b6b);font-size:12px;margin-top:10px}
.wa-stale{font-size:11px;color:var(--faint,#888);margin-top:10px}
.wa-refresh{display:block;width:100%;margin-top:14px;padding:11px 14px;border:1px solid var(--accent1,#7c8cff);border-radius:12px;background:transparent;color:var(--accent1,#7c8cff);font:inherit;font-size:13px;font-weight:600;cursor:pointer}
.wa-refresh:disabled{opacity:.5;cursor:default}
`;
  document.head.appendChild(st);
}

function ensureWeeklyAuditModal(){
  if(document.getElementById("weeklyAuditOverlay")) return;
  const ov = document.createElement("div");
  ov.id = "weeklyAuditOverlay";
  ov.className = "wa-overlay";
  ov.setAttribute("role", "dialog");
  ov.setAttribute("aria-modal", "true");
  ov.setAttribute("aria-labelledby", "weeklyAuditTitle");
  ov.innerHTML = `
    <div class="wa-sheet">
      <div class="wa-head">
        <div>
          <div class="wa-title" id="weeklyAuditTitle">รายงานรอบสัปดาห์</div>
          <div class="wa-sub" id="weeklyAuditSub"></div>
        </div>
        <button type="button" class="wa-close" id="weeklyAuditCloseBtn" aria-label="ปิด">✕</button>
      </div>
      <div class="wa-stats" id="weeklyAuditStats"></div>
      <div class="wa-body" id="weeklyAuditBody"></div>
      <button type="button" class="wa-refresh" id="weeklyAuditRefreshBtn">วิเคราะห์ใหม่</button>
    </div>`;
  document.body.appendChild(ov);
  ov.addEventListener("click", (e) => { if(e.target === ov) closeWeeklyAuditModal(); });
  document.getElementById("weeklyAuditCloseBtn").addEventListener("click", closeWeeklyAuditModal);
  document.getElementById("weeklyAuditRefreshBtn").addEventListener("click", () => { runWeeklyAudit(); });
  document.addEventListener("keydown", (e) => {
    if(e.key === "Escape" && ov.classList.contains("open")) closeWeeklyAuditModal();
  });
}

function waStatsHtml(s){
  const baseLabel = s.baselineType === "monthly_budget" ? "งบ"
    : s.baselineType === "last_month_average" ? "เดือนก่อนเฉลี่ย" : "";
  const baseNote = (baseLabel && s.baselineDaily != null) ? `${baseLabel} ${waBaht(s.baselineDaily)}/วัน` : "ไม่มีฐานเทียบ";
  return `
    <div class="wa-stat"><div class="wa-stat-label">ใช้รวม 7 วัน</div><div class="wa-stat-value">${waBaht(s.expense)}</div></div>
    <div class="wa-stat"><div class="wa-stat-label">เฉลี่ย/วัน</div><div class="wa-stat-value">${waBaht(s.burnPerDay)}</div><div class="wa-stat-note">${escapeHtml(baseNote)}</div></div>
    <div class="wa-stat"><div class="wa-stat-label">กรอบสัปดาห์หน้า</div><div class="wa-stat-value">${s.weekday ? `฿${fmt(s.weekday[0])}–${fmt(s.weekday[1])}` : "-"}</div><div class="wa-stat-note">${s.weekend ? `หยุด ฿${fmt(s.weekend[0])}–${fmt(s.weekend[1])}` : ""}</div></div>`;
}

// status: loading | ready | error | needsApiKey | empty
function waRenderView(v){
  const body = document.getElementById("weeklyAuditBody");
  if(!body) return;
  const statsEl = document.getElementById("weeklyAuditStats");
  const subEl = document.getElementById("weeklyAuditSub");
  const refreshBtn = document.getElementById("weeklyAuditRefreshBtn");

  const rec = v.record || v.cache || null;
  let stats = v.stats || null;
  if(rec && rec.stats && (v.status === "ready" || v.status === "error" || v.status === "needsApiKey")) stats = rec.stats;
  statsEl.innerHTML = stats ? waStatsHtml(stats) : "";
  statsEl.style.display = stats ? "grid" : "none";
  subEl.textContent = rec
    ? `ข้อมูล ${waShortDate(rec.rangeStart)}–${waShortDate(rec.rangeEnd)} · วิเคราะห์เมื่อ ${waShortDate(rec.generatedAt)}`
    : (v.meta || "");
  refreshBtn.disabled = v.status === "loading";

  if(v.status === "loading"){
    body.innerHTML = `<span class="wa-muted">กำลังวิเคราะห์ข้อมูล 7 วันล่าสุด...</span>`;
  }else if(v.status === "empty"){
    body.innerHTML = `<span class="wa-muted">ยังไม่มีรายการรายรับ/รายจ่ายใน 7 วันที่ผ่านมา เลยยังไม่มีอะไรให้ตรวจ</span>`;
  }else if(v.status === "needsApiKey"){
    body.innerHTML = (rec ? simpleMarkdownToHtml(rec.text) + "<br><br>" : "")
      + `<span class="wa-muted">ตั้งค่า API Key ก่อน เพื่อให้ AI วิเคราะห์รอบใหม่ได้</span>`;
  }else if(v.status === "error"){
    const r = v.result || {};
    const codeLine = r.error ? ` (โค้ด: ${escapeHtml(r.error)}${r.status ? " HTTP " + r.status : ""})` : "";
    body.innerHTML = (rec ? simpleMarkdownToHtml(rec.text) + `<div class="wa-stale">นี่คือรายงานรอบก่อน (${escapeHtml(waShortDate(rec.generatedAt))}) — รอบใหม่ยังไม่สำเร็จ</div>` : "")
      + `<div class="wa-err">${escapeHtml(aiErrorLabel(r))}${codeLine}</div>`;
  }else{
    body.innerHTML = simpleMarkdownToHtml(rec ? rec.text : "");
  }
}

function openWeeklyAuditModal(){
  injectWeeklyAuditStyles();
  ensureWeeklyAuditModal();
  document.getElementById("weeklyAuditOverlay").classList.add("open");
  const cache = loadWeeklyAuditCache();
  // มีผลของสัปดาห์นี้อยู่แล้ว → โชว์จากแคชเลย ไม่ยิง API ใหม่ (ผู้ใช้กด "วิเคราะห์ใหม่" เองได้)
  if(cache && cache.weekKey === waWeekKey(todayISO())){
    waRenderView({ status:"ready", record:cache });
    return;
  }
  runWeeklyAudit();
}
function closeWeeklyAuditModal(){
  document.getElementById("weeklyAuditOverlay")?.classList.remove("open");
}

async function runWeeklyAudit(){
  if(weeklyAuditBusy) return;
  const cache = loadWeeklyAuditCache();
  let ctx;
  try{ ctx = buildWeeklyAuditContext(); }
  catch(e){
    console.error(e);
    waRenderView({ status:"error", cache, result:{ error:"context_error" } });
    return;
  }
  const stats = waStatsFromContext(ctx);

  if(ctx.totals.transactionCount === 0){ waRenderView({ status:"empty", stats }); return; }
  if(!aiAvailable()){ waRenderView({ status:"needsApiKey", stats, cache }); return; }

  weeklyAuditBusy = true;
  waRenderView({ status:"loading", stats, meta:`ข้อมูล ${waShortDate(ctx.period.start)}–${waShortDate(ctx.period.end)}` });
  let result;
  try{ result = await generateWeeklyAudit(ctx); }
  catch(e){ result = { ok:false, error:"network_error" }; }
  weeklyAuditBusy = false;

  if(!result.ok){ waRenderView({ status:"error", stats, cache, result }); return; }

  const record = {
    text: result.text,
    generatedAt: todayISO(),
    generatedAtTs: Date.now(),
    ver: WEEKLY_AUDIT_VERSION,
    weekKey: ctx.period.weekKey,
    rangeStart: ctx.period.start,
    rangeEnd: ctx.period.end,
    stats
  };
  saveWeeklyAuditCache(record);
  waRenderView({ status:"ready", record });
  refreshWeeklyAuditBanner();
}

// แบนเนอร์ชวนดูรายงาน: แสดงเมื่อเป็นสัปดาห์ใหม่ที่ยังไม่ได้ Audit และมีรายการใน 7 วันล่าสุดให้ตรวจ
function shouldShowWeeklyAuditBanner(){
  const weekKey = waWeekKey(todayISO());
  const cache = loadWeeklyAuditCache();
  if(cache && cache.weekKey === weekKey) return false;
  try{ if(sessionStorage.getItem(WEEKLY_AUDIT_DISMISS_KEY) === weekKey) return false; }catch(e){}
  const start = isoDaysFromToday(-(WEEKLY_AUDIT_DAYS - 1)), today = todayISO();
  return entries.some(e => e && (e.type === "expense" || e.type === "income") && e.date >= start && e.date <= today);
}
function refreshWeeklyAuditBanner(){
  const show = shouldShowWeeklyAuditBanner();
  const banner = document.getElementById("weeklyAuditBanner");
  if(banner) banner.classList.toggle("show", show);
  const btn = document.getElementById("weeklyAuditHeaderBtn");
  if(btn) btn.classList.toggle("wa-has-new", show);
}

// เสียบปุ่ม/แบนเนอร์เข้าหน้าจอที่มีอยู่ (ไม่แก้ HTML เดิม) — ถ้าหา anchor ไม่เจอจะข้ามเงียบๆ ไม่ทำให้แอปพัง
function mountWeeklyAuditEntryPoints(){
  // เก็บกวาดของเวอร์ชันก่อน: ปุ่มแคปซูลกลางจอเลิกใช้แล้ว
  document.getElementById("weeklyAuditBtn")?.remove();

  // ปุ่มไอคอน 📊 บน Header ขวาบนของแท็บที่ปรึกษา AI (วางข้างปุ่มประวัติแชท/ตั้งค่า AI)
  if(!document.getElementById("weeklyAuditHeaderBtn")){
    const anchor = document.getElementById("aiChatHistoryBtn") || document.getElementById("aiAdvisorSettingsBtn");
    if(anchor){
      const btn = document.createElement("button");
      btn.type = "button";
      btn.id = "weeklyAuditHeaderBtn";
      btn.className = "icon-btn ai-icon-btn";
      btn.title = "รายงานรอบสัปดาห์";
      btn.setAttribute("aria-label", "รายงานรอบสัปดาห์");
      btn.innerHTML = vaultetIcon("📊");
      btn.addEventListener("click", (e) => { e.stopPropagation(); openWeeklyAuditModal(); });
      anchor.insertAdjacentElement("beforebegin", btn);
    }
  }

  // แบนเนอร์สัปดาห์ใหม่: อยู่ในแท็บที่ปรึกษา AI เท่านั้น (ห้ามแตะหน้าภาพรวม) — CSS ซ่อนเมื่อ body ไม่มี ux-chat-active
  if(!document.getElementById("weeklyAuditBanner")){
    const panel = document.getElementById("aiAdvisorSettingsPanel");
    const chatBody = document.getElementById("aiAnalystBody");
    if(panel || chatBody){
      const banner = document.createElement("div");
      banner.id = "weeklyAuditBanner";
      banner.className = "wa-banner";
      banner.innerHTML = `
        <span aria-hidden="true">${vaultetIcon("📊")}</span>
        <div class="wa-banner-text">สัปดาห์ใหม่แล้ว — ดูรายงานสุขภาพการเงินรอบ 7 วันที่ผ่านมา</div>
        <button type="button" class="wa-banner-open" id="weeklyAuditBannerOpenBtn">ดูรายงาน</button>
        <button type="button" class="wa-banner-x" id="weeklyAuditBannerDismissBtn" aria-label="ปิดแจ้งเตือน">✕</button>`;
      if(panel) panel.insertAdjacentElement("afterend", banner);
      else chatBody.insertAdjacentElement("beforebegin", banner);
      document.getElementById("weeklyAuditBannerOpenBtn").addEventListener("click", openWeeklyAuditModal);
      document.getElementById("weeklyAuditBannerDismissBtn").addEventListener("click", () => {
        try{ sessionStorage.setItem(WEEKLY_AUDIT_DISMISS_KEY, waWeekKey(todayISO())); }catch(e){}
        refreshWeeklyAuditBanner();
      });
    }
  }
}

function initWeeklyAudit(){
  injectWeeklyAuditStyles();
  ensureWeeklyAuditModal();
  mountWeeklyAuditEntryPoints();
  refreshWeeklyAuditBanner();
  // เปิดแอปค้างข้ามวัน/ข้ามสัปดาห์ → เช็คแบนเนอร์ใหม่ตอนกลับมาที่แท็บ
  document.addEventListener("visibilitychange", () => { if(!document.hidden) refreshWeeklyAuditBanner(); });
}
window.openWeeklyAudit = openWeeklyAuditModal;
