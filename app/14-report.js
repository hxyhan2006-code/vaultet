// Vaultet — app/14-report.js : หน้ารายงานโฉมใหม่ (รอบ 3, ds51)
// เลือกช่วง (สัปดาห์/เดือน/ปี/อื่นๆ) + บัญชี, แถบ รายจ่าย/รายรับ/ออม (กดเลือกได้), วงกลมแยกหมวด,
// รายหมวด (กดดูรายการ), กราฟ 6 ช่วง (กดแท่งเพื่อไปช่วงนั้น), ตัวเลขสรุป, เทียบแบบกำหนดเอง (พับไว้)
// คำนวณด้วยสูตรเดิม (computePeriodAnalysisForRange ฯลฯ) ไม่มีสูตรใหม่ที่ขัดกับของเดิม
(function(){
  const view = document.getElementById("ux-analysis");
  if(!view) return;
  const TH_SHORT = ["ม.ค.","ก.พ.","มี.ค.","เม.ย.","พ.ค.","มิ.ย.","ก.ค.","ส.ค.","ก.ย.","ต.ค.","พ.ย.","ธ.ค."];
  const TH_MONTH = ["มกราคม","กุมภาพันธ์","มีนาคม","เมษายน","พฤษภาคม","มิถุนายน","กรกฎาคม","สิงหาคม","กันยายน","ตุลาคม","พฤศจิกายน","ธันวาคม"];
  const TYPES = { expense: "รายจ่าย", income: "รายรับ", saving: "ออม" };
  // สีหมวดตามประเภท: รายจ่ายเริ่มที่แดง รายรับเริ่มที่เขียว ออมเริ่มที่ฟ้า (ช่องสุดท้าย = อื่นๆ สีเทา)
  const PAL = { expense: [1,2,3,4,5,6], income: [4,5,3,2,1,6], saving: [5,4,3,2,1,6] };
  let CAT_COLORS = PAL.expense.map(i => "var(--v-cat-" + i + ")");
  const OTHER = [["today","วันนี้"],["3m","3 เดือนล่าสุด"],["6m","6 เดือนล่าสุด"],["all","ทั้งหมด"],["custom","กำหนดเอง"]];
  const K = "vaultet_ui_report_v1";
  const st = { mode: "month", off: 0, type: "expense", acc: "", other: "3m", cs: "", ce: "" };
  try{ const s = JSON.parse(localStorage.getItem(K) || "{}"); if(TYPES[s.type]) st.type = s.type; if(["week","month","year","other"].includes(s.mode)) st.mode = s.mode; if(s.other) st.other = s.other; }catch(e){}
  const save = () => { try{ localStorage.setItem(K, JSON.stringify({ mode: st.mode, type: st.type, other: st.other })); }catch(e){} };

  // ---------- วันที่ ----------
  const pad = n => String(n).padStart(2, "0");
  const isoOf = d => d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
  const dOf = s => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d, 12); };
  const by = y => String(y + 543);
  const short = s => { const d = dOf(s); return d.getDate() + " " + TH_SHORT[d.getMonth()]; };
  function weekStart(d){ const x = new Date(d); const k = (x.getDay() + 6) % 7; x.setDate(x.getDate() - k); return x; }
  // ช่วงของโหมดที่เลื่อนไป off หน่วย (0 = ปัจจุบัน)
  function rangeFor(mode, off){
    const now = new Date(); now.setHours(12, 0, 0, 0);
    if(mode === "week"){ const s = weekStart(now); s.setDate(s.getDate() + off * 7); const e = new Date(s); e.setDate(e.getDate() + 6); return { start: isoOf(s), end: isoOf(e) }; }
    if(mode === "month"){ const s = new Date(now.getFullYear(), now.getMonth() + off, 1, 12); return monthBoundsISO(s.getFullYear(), s.getMonth()); }
    if(mode === "year"){ const y = now.getFullYear() + off; return { start: y + "-01-01", end: y + "-12-31" }; }
    const t = todayISO();
    switch(st.other){
      case "today": return { start: t, end: t };
      case "3m": return { start: addDaysISO(t, -89), end: t };
      case "6m": return { start: addDaysISO(t, -179), end: t };
      case "custom": return { start: st.cs || t, end: st.ce || t };
      default: return { start: null, end: null };
    }
  }
  function labelFor(mode, off){
    const r = rangeFor(mode, off);
    if(mode === "week"){ const a = dOf(r.start), b = dOf(r.end); return a.getMonth() === b.getMonth() ? a.getDate() + "–" + b.getDate() + " " + TH_SHORT[b.getMonth()] + " " + by(b.getFullYear()).slice(-2) : short(r.start) + " – " + short(r.end); }
    if(mode === "month"){ const a = dOf(r.start); return TH_MONTH[a.getMonth()] + " " + by(a.getFullYear()); }
    if(mode === "year") return by(dOf(r.start).getFullYear());
    if(st.other === "custom") return short(r.start) + " – " + short(r.end) + " " + by(dOf(r.end).getFullYear()).slice(-2);
    return (OTHER.find(o => o[0] === st.other) || ["", "ทั้งหมด"])[1];
  }
  function prevRange(){
    if(st.mode !== "other") return rangeFor(st.mode, st.off - 1);
    const r = rangeFor("other", 0); if(!r.start || !r.end) return null;
    const n = daysBetweenInclusive(r.start, r.end);
    return { start: addDaysISO(r.start, -n), end: addDaysISO(r.start, -1) };
  }
  const prevName = () => st.mode === "week" ? "สัปดาห์ก่อน" : st.mode === "year" ? "ปีก่อน" : st.mode === "month" ? TH_SHORT[dOf(rangeFor("month", st.off - 1).start).getMonth()] : "ช่วงก่อนหน้า";

  // ---------- ข้อมูล (สูตรเดียวกับของเดิม) ----------
  const inAcc = e => !st.acc || (e.accountId || UNASSIGNED_ACCOUNT_ID) === st.acc;
  const inRange = (e, r) => (!r.start || e.date >= r.start) && (!r.end || e.date <= r.end);
  // รายรับจริง = ไม่รวมเงินคืนจากการยืม และการถอนเงินออม (เหมือนกราฟแนวโน้มเดิม)
  const counts = (e, type) => e.type === type && !(type === "income" && (isLoanRepaymentIncome(e) || e.category === WITHDRAW_CAT));
  function rows(r, type){ return entries.filter(e => e.date && inAcc(e) && inRange(e, r) && counts(e, type)); }
  function total(r, type){ return rows(r, type).reduce((s, e) => s + toCents(e.amount), 0) / 100; }
  function byCat(r, type){
    const m = {};
    rows(r, type).forEach(e => { (m[e.category || "-"] = m[e.category || "-"] || { cat: e.category || "-", c: 0, list: [] }); m[e.category || "-"].c += toCents(e.amount); m[e.category || "-"].list.push(e); });
    const all = Object.values(m).sort((a, b) => b.c - a.c), sum = all.reduce((s, x) => s + x.c, 0);
    return all.map(x => ({ cat: x.cat, amount: x.c / 100, pct: sum ? Math.round(x.c / sum * 100) : 0, list: x.list.sort((a, b) => b.date.localeCompare(a.date)) }));
  }
  const money = n => (n < 0 ? "-" : "") + "฿" + fmt(Math.abs(n));

  // ---------- โครงหน้า ----------
  const root = document.createElement("section");
  root.className = "v-report"; root.id = "vReport";
  root.innerHTML = `
    <div class="v-rseg" role="group" aria-label="ช่วงเวลา">
      <button type="button" data-mode="week">สัปดาห์</button><button type="button" data-mode="month">เดือน</button><button type="button" data-mode="year">ปี</button><button type="button" data-mode="other">อื่นๆ</button>
    </div>
    <div class="v-rnav">
      <button type="button" class="v-rnav-btn" id="vRepPrev" aria-label="ช่วงก่อนหน้า"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 6l-6 6 6 6"/></svg></button>
      <button type="button" class="v-rnav-label" id="vRepLabel"></button>
      <button type="button" class="v-rnav-btn" id="vRepNext" aria-label="ช่วงถัดไป"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg></button>
      <button type="button" class="ux-month-chip v-racc" id="vRepAccBtn" aria-label="เลือกบัญชี"><span id="vRepAccLabel">ทุกบัญชี</span><svg class="ux-month-chev" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg></button>
    </div>
    <div class="v-card v-rhero">
      <div class="v-rtabs" role="tablist" aria-label="ประเภท"></div>
      <div class="v-rdonut" id="vRepDonut"></div>
      <div class="v-rcmp" id="vRepCmp"></div>
      <div class="v-hint" id="vRepNote"></div>
    </div>
    <div class="v-card v-rcats"><div class="v-card-head"><h2 class="v-card-title" id="vRepCatsTitle"></h2></div><div id="vRepCats"></div></div>
    <div class="v-card v-rtrend"><div class="v-card-head"><h2 class="v-card-title" id="vRepTrendTitle"></h2><span class="v-rtrend-avg" id="vRepTrendAvg"></span></div><div class="v-rbars" id="vRepBars"></div></div>
    <div class="v-rfacts" id="vRepFacts"></div>
    <details class="v-card v-rmore" id="vRepMore"><summary><span>เทียบสองช่วงเวลาแบบกำหนดเอง</span><svg class="v-chev" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg></summary><div class="v-rmore-body"></div></details>`;
  view.insertBefore(root, view.querySelector(".ux-view-sub") ? view.querySelector(".ux-view-sub").nextSibling : view.firstChild);
  // ของเดิม: ซ่อนส่วนที่ซ้ำกับหน้ารายงานใหม่ (ยังอยู่ในหน้าเว็บ โค้ดเดิมยังทำงาน) / ย้ายตัวเทียบแบบกำหนดเองเข้าไปในส่วนพับ
  ["trendCard", "breakdownSection"].forEach(id => document.getElementById(id)?.classList.add("v-native-hidden"));
  const oldSections = [...view.querySelectorAll(":scope > .analysis-section")];
  oldSections.forEach(sec => {
    if(sec.querySelector("#compareSection")){ sec.querySelector(".section-label")?.classList.add("v-native-hidden"); root.querySelector(".v-rmore-body").append(sec); }
    else sec.classList.add("v-native-hidden");
  });

  // ---------- วาด ----------
  function draw(){
    const r = rangeFor(st.mode, st.off), prev = prevRange();
    root.querySelectorAll(".v-rseg button").forEach(b => { const on = b.dataset.mode === st.mode; b.classList.toggle("is-on", on); b.setAttribute("aria-pressed", on ? "true" : "false"); });
    document.getElementById("vRepLabel").textContent = labelFor(st.mode, st.off);
    const nav = st.mode !== "other";
    document.getElementById("vRepPrev").hidden = !nav;
    const next = document.getElementById("vRepNext"); next.hidden = !nav; next.disabled = nav && st.off >= 0;
    const acc = accounts.find(a => a.id === st.acc);
    if(st.acc && !acc) st.acc = "";
    document.getElementById("vRepAccLabel").textContent = acc ? acc.name : "ทุกบัญชี";

    // แถบประเภท (ยอดแต่ละประเภทอยู่ที่นี่ที่เดียว)
    const tabs = root.querySelector(".v-rtabs");
    tabs.innerHTML = Object.entries(TYPES).map(([k, l]) => `<button type="button" role="tab" class="v-rtab${k === st.type ? " is-on" : ""}" data-type="${k}" aria-selected="${k === st.type}"><span class="v-rtab-k">${l}</span><span class="v-rtab-v v-sens">${money(total(r, k))}</span></button>`).join("");

    CAT_COLORS = PAL[st.type].map(i => "var(--v-cat-" + i + ")");
    const cats = byCat(r, st.type), cur = total(r, st.type);
    // วงกลมแยกหมวด: 5 หมวดแรก + อื่นๆ
    const top = cats.slice(0, 5), rest = cats.slice(5).reduce((s, x) => s + x.amount, 0);
    const segs = top.map((x, i) => ({ v: x.amount, c: CAT_COLORS[i] }));
    if(rest > 0) segs.push({ v: rest, c: CAT_COLORS[5] });
    const C = 2 * Math.PI * 60, gap = segs.length > 1 ? 2 : 0; let acc0 = 0;
    const arcs = segs.map(s => { const len = cur ? s.v / cur * C : 0; const a = `<circle cx="80" cy="80" r="60" fill="none" stroke="${s.c}" stroke-width="18" stroke-dasharray="${Math.max(0, len - gap).toFixed(2)} ${C.toFixed(2)}" stroke-dashoffset="${(-acc0).toFixed(2)}"/>`; acc0 += len; return a; }).join("");
    const lead = cats[0];
    document.getElementById("vRepDonut").innerHTML = `<svg viewBox="0 0 160 160" role="img" aria-label="สัดส่วน${TYPES[st.type]}ตามหมวด"><g transform="rotate(-90 80 80)"><circle cx="80" cy="80" r="60" fill="none" stroke="var(--v-surface-2)" stroke-width="18"/>${arcs}</g></svg>
      <div class="v-rdonut-c">${lead ? `<span class="v-rdonut-k">มากสุด</span><span class="v-rdonut-v">${escapeHtml(lead.cat)}</span><span class="v-rdonut-k">${lead.pct}%</span>` : `<span class="v-rdonut-k">ไม่มี${TYPES[st.type]}</span><span class="v-rdonut-k">ในช่วงนี้</span>`}</div>`;

    // เทียบช่วงก่อน
    const cmp = document.getElementById("vRepCmp");
    const pv = prev ? total(prev, st.type) : 0;
    cmp.className = "v-rcmp"; cmp.textContent = "";
    if(prev && (pv > 0 || cur > 0)){
      if(pv === 0) cmp.textContent = prevName() + " ไม่มี" + TYPES[st.type];
      else {
        const d = Math.round((cur - pv) / pv * 100), up = cur > pv;
        const good = st.type === "expense" ? !up : up;
        cmp.textContent = d === 0 ? "เท่ากับ " + prevName() : TYPES[st.type] + (up ? "มากกว่า " : "น้อยกว่า ") + prevName() + " " + Math.abs(d) + "% (" + money(pv) + ")";
        if(d !== 0) cmp.classList.add(good ? "is-good" : "is-bad");
      }
    }
    // หมายเหตุรายรับ: บอกยอดที่ไม่ได้นับ (เงินคืนจากการยืม / ถอนเงินออม)
    const note = document.getElementById("vRepNote"); note.textContent = "";
    if(st.type === "income"){
      const skip = entries.filter(e => e.date && inAcc(e) && inRange(e, r) && e.type === "income" && !counts(e, "income")).reduce((s, e) => s + toCents(e.amount), 0) / 100;
      if(skip > 0) note.textContent = "ไม่นับเงินคืนจากการยืม/ถอนเงินออม " + money(skip) + " (เป็นเงินเดิมของเรา ไม่ใช่รายได้ใหม่)";
    }

    // รายหมวด (กดดูรายการ)
    document.getElementById("vRepCatsTitle").textContent = TYPES[st.type] + "ตามหมวด";
    const catBox = document.getElementById("vRepCats");
    catBox.innerHTML = cats.length ? cats.map((x, i) => `<details class="v-rcat"><summary>
        <span class="v-rcat-top"><i class="v-rcat-dot" style="background:${CAT_COLORS[Math.min(i, 5)]}"></i><span class="v-rcat-name">${escapeHtml(x.cat)}</span><span class="v-rcat-amt v-sens">${money(x.amount)}</span><span class="v-rcat-pct">${x.pct}%</span></span>
        <span class="v-rcat-bar"><i style="width:${x.pct}%;background:${CAT_COLORS[Math.min(i, 5)]}"></i></span></summary>
        <div class="v-rcat-list">${x.list.slice(0, 30).map(e => `<div class="v-rcat-item"><span>${escapeHtml(vaultetDateLabel(e.date))}${e.note ? " · " + escapeHtml(e.note) : ""}</span><span class="v-sens">${money(Number(e.amount) || 0)}</span></div>`).join("")}${x.list.length > 30 ? `<div class="v-rcat-item"><span>และอีก ${x.list.length - 30} รายการ</span><span></span></div>` : ""}</div></details>`).join("")
      : `<div class="v-rempty">ไม่มี${TYPES[st.type]}ในช่วงนี้</div>`;

    // กราฟ 6 ช่วง (โหมดอื่นๆ ใช้รายเดือน)
    const unit = st.mode === "other" ? "month" : st.mode;
    // ช่วงที่เลือกอยู่ช่องที่ 5 เว้นช่วงถัดไปไว้ 1 ช่อง (ถ้าเป็นช่วงปัจจุบันก็ชิดขวาเหมือนเดิม ไม่มีช่องว่างเปล่า)
    const baseOff = st.mode === "other" ? 0 : Math.min(st.off + 1, 0);
    const bars = [];
    for(let i = 5; i >= 0; i--){
      const o = baseOff - i, rr = rangeFor(unit, o), v = total(rr, st.type), s = dOf(rr.start);
      const lab = unit === "month" ? TH_SHORT[s.getMonth()] : unit === "year" ? by(s.getFullYear()) : s.getDate() + "/" + (s.getMonth() + 1);
      bars.push({ o, v, lab, on: st.mode !== "other" && o === st.off });
    }
    const mx = Math.max(1, ...bars.map(b => b.v)), avg = bars.reduce((s, b) => s + b.v, 0) / bars.length;
    document.getElementById("vRepTrendTitle").textContent = TYPES[st.type] + " 6 " + (unit === "week" ? "สัปดาห์" : unit === "year" ? "ปี" : "เดือน");
    document.getElementById("vRepTrendAvg").textContent = "เฉลี่ย " + money(Math.round(avg));
    document.getElementById("vRepBars").innerHTML = bars.map(b => `<button type="button" class="v-rbar${b.on ? " is-on" : ""}" data-off="${b.o}" ${st.mode === "other" ? "disabled" : ""} aria-label="${b.lab} ${money(b.v)}"><span class="v-rbar-col"><i style="height:${Math.round(b.v / mx * 100)}%"></i></span><span class="v-rbar-lab">${b.lab}</span></button>`).join("");

    // ตัวเลขสรุป
    const a = computePeriodAnalysisForRange(r.start, r.end, st.acc);
    const carry = r.start ? (st.acc ? computeAccountBalance(st.acc, r.start) : getTotalMoneyAllAccounts(r.start)) : null;
    const loanOut = loans.filter(l => l.date && (!r.start || l.date >= r.start) && (!r.end || l.date <= r.end) && (!st.acc || l.accountId === st.acc)).reduce((t, l) => t + toCents(l.amount), 0) / 100;
    const loanBack = entries.filter(e => e.date && inAcc(e) && inRange(e, r) && isLoanRepaymentIncome(e)).reduce((t, e) => t + toCents(e.amount), 0) / 100;
    const dayMap = {}; rows(r, "expense").forEach(e => { dayMap[e.date] = (dayMap[e.date] || 0) + toCents(e.amount); });
    const peak = Object.entries(dayMap).sort((x, y) => y[1] - x[1])[0];
    const tile = (k, v, extra, hint) => `<div class="v-rfact"><span class="v-rfact-k">${k}</span><span class="v-rfact-v v-sens"${extra || ""}>${v}</span>${hint ? `<span class="v-rfact-h">${hint}</span>` : ""}</div>`;
    document.getElementById("vRepFacts").innerHTML =
      (carry === null ? "" : tile("ยกมาก่อนช่วงนี้", money(carry))) +
      tile("คงเหลือสุทธิ", money(a.netCashFlow), a.netCashFlow < 0 ? ' style="color:var(--v-out)"' : "", "รับ − จ่าย − ออม") +
      tile("จ่ายเฉลี่ยต่อวัน", money(Math.round(a.avgExpensePerDay))) +
      (peak ? tile("วันที่จ่ายมากสุด", escapeHtml(vaultetDateLabel(peak[0])) + " · " + money(peak[1] / 100)) : "") +
      (loanOut > 0 ? tile("ให้ยืมไป", money(loanOut)) : "") +
      (loanBack > 0 ? tile("ได้คืนมา", money(loanBack)) : "");
  }

  // ---------- การกด ----------
  root.querySelector(".v-rseg").addEventListener("click", async e => {
    const b = e.target.closest("button[data-mode]"); if(!b) return;
    if(b.dataset.mode === "other"){ await pickOther(); return; }
    if(st.mode !== b.dataset.mode){ st.mode = b.dataset.mode; st.off = 0; save(); draw(); }
  });
  async function pickOther(){
    const v = await vaultetPick({ title: "เลือกช่วงเวลา", value: st.mode === "other" ? st.other : "", options: OTHER.map(([value, label]) => ({ value, label })) });
    if(v == null) return;
    if(v === "custom"){
      const s = await vaultetPickDate({ title: "เริ่มวันที่", value: st.cs || addDaysISO(todayISO(), -29) }); if(s == null) return;
      const e = await vaultetPickDate({ title: "ถึงวันที่", value: st.ce && st.ce >= s ? st.ce : todayISO() }); if(e == null) return;
      st.cs = s <= e ? s : e; st.ce = s <= e ? e : s;
    }
    st.mode = "other"; st.other = v; st.off = 0; save(); draw();
  }
  document.getElementById("vRepLabel").addEventListener("click", () => { if(st.mode === "other") pickOther(); });
  document.getElementById("vRepPrev").addEventListener("click", () => { st.off--; draw(); });
  document.getElementById("vRepNext").addEventListener("click", () => { if(st.off < 0){ st.off++; draw(); } });
  document.getElementById("vRepAccBtn").addEventListener("click", async () => {
    const v = await vaultetPick({ title: "ดูเฉพาะบัญชี", value: st.acc, options: [{ value: "", label: "ทุกบัญชี" }, ...accounts.map(a => ({ value: a.id, label: a.name }))] });
    if(v == null || v === st.acc) return;
    st.acc = v; draw();
  });
  root.querySelector(".v-rtabs").addEventListener("click", e => { const b = e.target.closest(".v-rtab"); if(!b || b.dataset.type === st.type) return; st.type = b.dataset.type; save(); draw(); });
  document.getElementById("vRepBars").addEventListener("click", e => { const b = e.target.closest(".v-rbar"); if(!b || b.disabled) return; st.off = Number(b.dataset.off); draw(); });

  const _render = render;
  render = function(){ _render.apply(this, arguments); try{ draw(); }catch(err){ console.error(err); } };
  window.vaultetReportState = st;
  draw();
})();
