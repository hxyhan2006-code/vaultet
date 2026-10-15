// Vaultet — ui.js: พฤติกรรมเล็กๆ ของ UI ใหม่ (ซ่อนตัวเลข, ปุ่มเพิ่มเติม, พับ/กางสินทรัพย์, เลขเวอร์ชัน)
// ไม่แตะข้อมูลหรือโลจิกการเงิน — อ่าน/เขียนเฉพาะ localStorage ที่ขึ้นต้นด้วย vaultet_ui_
(function(){
  const UI_VERSION = "ds18";
  const K_HIDE = "vaultet_ui_hide_numbers_v1", K_ASSETS = "vaultet_ui_assets_open_v1";
  const get = k => { try{ return localStorage.getItem(k); }catch(e){ return null; } };
  const set = (k,v) => { try{ localStorage.setItem(k,v); }catch(e){} };

  // ซ่อน/แสดงตัวเลข (จำค่าไว้ข้ามการเปิดแอป)
  const eye = document.getElementById("vEyeBtn");
  function applyHide(on){
    document.body.classList.toggle("v-hide-numbers", on);
    if(eye){ eye.setAttribute("aria-pressed", on ? "true" : "false"); eye.setAttribute("aria-label", on ? "แสดงตัวเลข" : "ซ่อนตัวเลข"); }
  }
  applyHide(get(K_HIDE) === "1");
  if(eye) eye.addEventListener("click", () => { const on = !document.body.classList.contains("v-hide-numbers"); applyHide(on); set(K_HIDE, on ? "1" : "0"); });

  // ปุ่ม "เพิ่มเติม" เปิด/ปิดทางลัดแถวที่สอง
  const more = document.getElementById("vMoreBtn"), row = document.getElementById("vMoreRow");
  if(more && row) more.addEventListener("click", () => {
    const open = row.hidden; row.hidden = !open; more.setAttribute("aria-expanded", open ? "true" : "false");
  });

  // สินทรัพย์รวม: จำสถานะพับ/กาง
  const assets = document.getElementById("vAssets");
  if(assets){
    assets.open = get(K_ASSETS) === "1";
    assets.addEventListener("toggle", () => set(K_ASSETS, assets.open ? "1" : "0"));
  }

  // ปุ่ม "เงินสำรอง" บนหน้าหลัก → ไปดูสถานะที่การ์ดเงินสำรองฉุกเฉินในแท็บแผน
  const emg = document.getElementById("vEmergencyBtn");
  if(emg) emg.addEventListener("click", () => {
    if(window.vaultetGo) window.vaultetGo("plan");
    setTimeout(() => document.getElementById("emergencyDashboardCard")?.scrollIntoView({ block: "start", behavior: "smooth" }), 120);
  });

  // ---------- หน้าต่างตั้งค่าเดิม (#settingsOverlay) แยกเป็น 3 มุมมอง: AI / Google Drive / ราคาหุ้น ----------
  // ใช้การ์ดเดิมทั้งหมด (id เดิม ตัวจัดการเดิม) แค่เลือกว่าจะโชว์การ์ดไหน ตามจุดที่เปิดมา
  const sov = document.getElementById("settingsOverlay");
  const sheet = sov && sov.querySelector(".sheet-modal");
  const TOPICS = {
    ai:    { title: "ตั้งค่า AI",     test: /Gemini|โปรไฟล์การเงิน|เป้าหมายทางการเงิน|Memory/ },
    drive: { title: "Google Drive",   test: /Drive/ },
    stock: { title: "ราคาหุ้น",        test: /Twelve|ราคาหุ้น/ },
    memory:{ title: "Memory ที่ AI จำได้", test: /Memory/ },
    aikey: { title: "Gemini API Key", test: /Gemini/ }
  };
  function openSettingsSheet(topic){
    const btn = document.getElementById("settingsBtn");
    if(!sov || !sheet || !btn || !TOPICS[topic]) return;
    btn.click(); // เปิดด้วยตัวเดิม (อัปเดตสถานะต่างๆ ให้ครบ)
    sheet.querySelectorAll(":scope > .settings-card").forEach(c => {
      const t = c.querySelector(".settings-card-title")?.textContent || "";
      c.classList.toggle("v-hide", !TOPICS[topic].test.test(t));
    });
    const title = sheet.querySelector(".modal-title"); if(title) title.textContent = TOPICS[topic].title;
    sov.dataset.topic = topic;
  }
  window.vaultetOpenAiSettings = () => openSettingsSheet("ai");
  // ปิดแล้วคืนค่าปกติ (กันกรณีมีโค้ดอื่นเปิดหน้าต่างนี้ตรงๆ)
  if(sov) new MutationObserver(() => {
    if(!sov.classList.contains("open") && sov.dataset.topic){
      delete sov.dataset.topic;
      sheet.querySelectorAll(".v-hide").forEach(c => c.classList.remove("v-hide"));
    }
  }).observe(sov, { attributes: true, attributeFilter: ["class"] });

  // ---------- หน้า "ตั้งค่า" (เปิดจากรูปโปรไฟล์มุมขวาบน) ----------
  const CHEV = '<svg class="v-row-chev" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>';
  function rowBtn(id, title, sub, onClick){
    const b = document.createElement("button");
    b.type = "button"; b.className = "v-set-row"; if(id) b.id = id;
    b.innerHTML = '<span class="v-set-main"><span class="v-set-title"></span><span class="v-set-sub"></span></span><span class="v-set-side"></span>' + CHEV;
    b.querySelector(".v-set-title").textContent = title;
    b.querySelector(".v-set-sub").textContent = sub || "";
    b.addEventListener("click", onClick);
    return b;
  }
  function group(title, ...children){
    const g = document.createElement("section"); g.className = "v-group";
    if(title){ const h = document.createElement("h3"); h.className = "v-group-title"; h.textContent = title; g.append(h); }
    const box = document.createElement("div"); box.className = "v-group-box"; box.append(...children); g.append(box);
    return g;
  }
  function timeAgo(iso){
    const d = iso ? new Date(iso) : null; if(!d || isNaN(d)) return "";
    const days = Math.floor((Date.now() - d.getTime()) / 86400000);
    return days <= 0 ? "วันนี้" : days + " วันที่แล้ว";
  }
  function fileBackupIso(){ try{ return localStorage.getItem(typeof BACKUP_KEY !== "undefined" ? BACKUP_KEY : "") || ""; }catch(e){ return ""; } }
  function unreadCount(){ try{ return loadVaultetNotifications().filter(n => !n.read).length; }catch(e){ return 0; } }

  function buildSettings(){
    const more = document.getElementById("ux-more");
    if(!more || more.querySelector(".v-group")) return true;
    const exportBtn = document.getElementById("exportBtn"), importBtn = document.getElementById("importBtn"), settingsBtn = document.getElementById("settingsBtn");
    if(!exportBtn || !importBtn || !settingsBtn) return false;

    // ซ่อนของเดิมที่ย้ายมาเป็นแถวใหม่ (ยังอยู่ใน DOM เพราะโค้ดเดิมอ้างด้วย id)
    more.querySelectorAll(".backup-row").forEach(el => el.hidden = true);
    const oldCard = settingsBtn.closest(".ux-section-card"); if(oldCard) oldCard.hidden = true;
    const lockCard = document.getElementById("lockSettingsBtn")?.closest(".ux-section-card");

    const exp = rowBtn("vSetExport", "สำรองเป็นไฟล์", "", () => { exportBtn.click(); setTimeout(refreshSettings, 600); });
    const imp = rowBtn("vSetImport", "กู้คืนจากไฟล์", "เลือกไฟล์สำรองที่เคยบันทึกไว้", () => importBtn.click());
    const drive = rowBtn("vSetDrive", "Google Drive", "", () => openSettingsSheet("drive"));
    const notif = rowBtn("vSetNotif", "การแจ้งเตือน", "ประวัติและเลือกว่าจะให้เตือนเรื่องอะไร", () => { if(typeof openVaultetNotificationCenter === "function") openVaultetNotificationCenter(); });
    const aikey = rowBtn("vSetAiKey", "Gemini API Key", "", () => openSettingsSheet("aikey"));
    const stock = rowBtn("vSetStock", "ราคาหุ้น (Twelve Data)", "", () => openSettingsSheet("stock"));

    // แสดงเศษสตางค์: ย้ายสวิตช์เดิมมาไว้หน้านี้ (id เดิม ตัวจัดการเดิมยังทำงาน) แล้วลบการ์ดเก่าที่ว่างแล้วออก
    const dec = document.getElementById("showDecimalsToggle");
    let decRow = null;
    if(dec){
      const decCard = dec.closest(".settings-card");
      decRow = document.createElement("label"); decRow.className = "v-set-row v-set-switch";
      decRow.innerHTML = '<span class="v-set-main"><span class="v-set-title">แสดงเศษสตางค์</span><span class="v-set-sub">โชว์ทศนิยมในตัวเลขเงินทุกที่</span></span>';
      dec.removeAttribute("style"); decRow.append(dec);
      decCard?.remove();
    }

    const groups = [
      group("สำรองข้อมูล", exp, imp, drive),
      group("การแจ้งเตือน", notif),
      group("AI", aikey),
      lockCard ? group("ความปลอดภัย", lockCard) : null,
      group("การแสดงผลและข้อมูล", ...[decRow, stock].filter(Boolean))
    ].filter(Boolean);
    const anchor = more.querySelector(".v-version");
    groups.forEach(g => anchor ? more.insertBefore(g, anchor) : more.append(g));
    refreshSettings();
    return true;
  }
  function refreshSettings(){
    const set = (id, text, side) => { const el = document.getElementById(id); if(!el) return; const s = el.querySelector(".v-set-sub"); if(s && text != null) s.textContent = text; const sd = el.querySelector(".v-set-side"); if(sd && side != null) sd.innerHTML = side; };
    const n = unreadCount();
    set("vSetNotif", null, n ? '<span class="v-set-badge">' + n + '</span>' : "");
    const f = timeAgo(fileBackupIso());
    set("vSetExport", f ? "สำรองเป็นไฟล์ล่าสุด: " + f : "ยังไม่เคยสำรองเป็นไฟล์");
    const conn = document.getElementById("gdriveConnStatus")?.textContent || "ยังไม่ได้เชื่อมต่อ";
    const last = document.getElementById("gdriveLastSyncStatus")?.textContent || "";
    set("vSetDrive", last && !/ยังไม่เคย/.test(last) ? conn + " · สำรองขึ้น Drive ล่าสุด " + last : conn);
    set("vSetStock", document.getElementById("pfKeyStatus2")?.textContent || "");
    set("vSetAiKey", document.getElementById("apiKeyStatus")?.textContent || "");
  }
  // หน้าตั้งค่าสร้างหลังโค้ดเดิมโหลดครบ (บางส่วนถูกสร้างด้วย timer) — ลองใหม่สั้นๆ จนกว่าจะพร้อม
  let tries = 0;
  (function wait(){ if(buildSettings() || ++tries > 20) return; setTimeout(wait, 150); })();
  // เข้า "ตั้งค่า" ได้จากแถวโปรไฟล์ล่างสุดของเมนู AI เท่านั้น (ไม่มีไอคอนโปรไฟล์ในแถบบนแล้ว)
  window.vaultetOpenSettings = () => { buildSettings(); refreshSettings(); if(window.vaultetGo) window.vaultetGo("more"); };


  // ---------- เมนูหน้า AI (จุดสามจุดมุมขวาบน) ----------
  const I = {
    hist: '<path d="M4 6h16M4 12h16M4 18h10"/>',
    mem: '<path d="M12 3a6 6 0 00-6 6c0 2 1 3.5 2 4.5V17h8v-3.5c1-1 2-2.500 2-4.500a6 6 0 00-6-6z"/><path d="M9 20h6"/>',
    tune: '<path d="M4 8h10M18 8h2M4 16h2M10 16h10"/><circle cx="16" cy="8" r="2"/><circle cx="8" cy="16" r="2"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 20c1.500-4 4.500-6 8-6s6.500 2 8 6"/>',
    chart: '<path d="M5 20V10M12 20V4M19 20v-7"/>',
    trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
    dots: '<circle cx="12" cy="5" r="1.300"/><circle cx="12" cy="12" r="1.300"/><circle cx="12" cy="19" r="1.300"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13 7l4 4"/>'
  };
  const svg = p => '<svg class="v-ic" viewBox="0 0 24 24" aria-hidden="true">' + p + '</svg>';
  function profileName(){
    try{ const p = JSON.parse(localStorage.getItem("vaultet_user_profile_v1") || "{}") || {}; return p.nickname || [p.firstName, p.lastName].filter(Boolean).join(" ") || ""; }catch(e){ return ""; }
  }
  function buildAiMenu(){
    const host = document.getElementById("uxChatTopActions");
    if(!host || document.getElementById("uxChatMenuBtn")) return !!host;
    const menuBtn = document.createElement("button");
    menuBtn.type = "button"; menuBtn.id = "uxChatMenuBtn"; menuBtn.className = "v-top-btn"; menuBtn.setAttribute("aria-label", "เมนู AI"); menuBtn.innerHTML = svg(I.dots);
    const newBtn = document.createElement("button");
    newBtn.type = "button"; newBtn.id = "uxChatNewBtn"; newBtn.className = "v-top-btn"; newBtn.setAttribute("aria-label", "แชทใหม่"); newBtn.innerHTML = svg(I.edit);
    host.append(menuBtn, newBtn);

    const back = document.createElement("div"); back.className = "v-aimenu-back"; back.id = "aiMenuBack"; back.hidden = true;
    const panel = document.createElement("aside"); panel.className = "v-aimenu"; panel.id = "aiMenu"; panel.setAttribute("role", "dialog"); panel.setAttribute("aria-label", "เมนู AI"); panel.hidden = true;
    const close = () => { back.hidden = true; panel.hidden = true; document.body.classList.remove("v-aimenu-open"); };
    const open = () => {
      const n = profileName(); const pn = panel.querySelector(".v-aimenu-name"); if(pn) pn.textContent = n || "โปรไฟล์ของคุณ";
      back.hidden = false; panel.hidden = false; document.body.classList.add("v-aimenu-open");
    };
    const item = (icon, label, fn, danger) => {
      const b = document.createElement("button"); b.type = "button"; b.className = "v-aimenu-row" + (danger ? " is-danger" : "");
      b.innerHTML = svg(icon) + "<span></span>"; b.querySelector("span").textContent = label;
      b.addEventListener("click", () => { close(); setTimeout(fn, 60); });
      return b;
    };
    const click = id => () => document.getElementById(id)?.click();
    const list = document.createElement("div"); list.className = "v-aimenu-list";
    list.append(
      item(I.hist, "ประวัติแชท", click("aiChatHistoryBtn")),
      item(I.mem, "Memory ที่ AI จำได้", () => openSettingsSheet("memory")),
      item(I.tune, "นิสัยและคำสั่งของ AI", () => { const p = document.getElementById("aiAdvisorSettingsPanel"); if(!p || !p.classList.contains("is-open")) click("aiAdvisorSettingsBtn")(); }),
      item(I.user, "ข้อมูลของฉันที่ AI ใช้", () => window.vaultetOpenProfile && window.vaultetOpenProfile()),
      item(I.chart, "รายงานรายสัปดาห์", () => { if(typeof openWeeklyAuditModal === "function") openWeeklyAuditModal(); }),
      item(I.trash, "ล้างข้อความในแชทนี้", async () => { if(await vaultetAsk("ล้าง", "ล้างข้อความทั้งหมดในแชทนี้ใช่ไหม?", true)) click("clearAiChatBtn")(); }, true)
    );
    const prof = document.createElement("button"); prof.type = "button"; prof.className = "v-aimenu-profile"; prof.id = "aiMenuProfile";
    prof.innerHTML = '<span class="v-aimenu-avatar">' + svg(I.user) + '</span><span class="v-aimenu-pinfo"><span class="v-aimenu-name"></span><span class="v-aimenu-sub">ตั้งค่า สำรองข้อมูล ล็อกแอป</span></span>' + CHEV;
    prof.addEventListener("click", () => { close(); setTimeout(() => window.vaultetOpenSettings && window.vaultetOpenSettings(), 60); });
    const head = document.createElement("div"); head.className = "v-aimenu-head"; head.textContent = "ที่ปรึกษา AI";
    panel.append(head, list, prof);
    document.body.append(back, panel);
    back.addEventListener("click", close);
    document.addEventListener("keydown", e => { if(e.key === "Escape" && !panel.hidden) close(); });
    menuBtn.addEventListener("click", open);
    newBtn.addEventListener("click", () => document.getElementById("newAiChatBtn")?.click());
    return true;
  }
  let mtries = 0;
  (function waitMenu(){ if(buildAiMenu() || ++mtries > 30) return; setTimeout(waitMenu, 150); })();

  // จุดแดงที่แท็บ AI เมื่อมีคำตอบใหม่ที่ยังไม่ได้อ่าน (เดิมอยู่ที่ปุ่มประกายลอย ซึ่งเอาออกแล้ว)
  const fab = document.getElementById("aiFabBtn"), chatTab = document.querySelector('.ux-bottom-item[data-page="chat"]');
  if(fab && chatTab){
    const sync = () => chatTab.classList.toggle("has-unread", fab.classList.contains("has-unread"));
    sync(); new MutationObserver(sync).observe(fab, { attributes: true, attributeFilter: ["class"] });
  }

  // เลขเวอร์ชันไว้เช็กว่าเห็นรุ่นล่าสุดหรือยัง (หน้า "อื่นๆ")
  const moreView = document.getElementById("ux-more");
  if(moreView){
    const v = document.createElement("div");
    v.className = "v-version"; v.textContent = "Vaultet UI " + UI_VERSION;
    moreView.append(v);
  }
})();
