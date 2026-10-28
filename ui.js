// Vaultet — ui.js: พฤติกรรมเล็กๆ ของ UI ใหม่ (ซ่อนตัวเลข, ปุ่มเพิ่มเติม, พับ/กางสินทรัพย์, เลขเวอร์ชัน)
// ไม่แตะข้อมูลหรือโลจิกการเงิน — อ่าน/เขียนเฉพาะ localStorage ที่ขึ้นต้นด้วย vaultet_ui_
(function(){
  const UI_VERSION = "ds47";
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

  // ---------- จัดเรียงทางลัดเอง: 3 อันแรกอยู่แถวบน ที่เหลืออยู่ใน "เพิ่มเติม" ----------
  const K_SC = "vaultet_ui_shortcuts_v1";
  const SC_DEFAULT = ["openPortfolioBtn", "vEmergencyBtn", "manageDebtsBtn", "manageAccountsBtn", "manageReservedBtn", "manageLoansBtn"];
  const scGrid = document.getElementById("vShortcuts");
  function scOrder(){
    let saved = []; try{ saved = JSON.parse(get(K_SC) || "[]"); }catch(e){}
    if(!Array.isArray(saved)) saved = [];
    const ids = saved.filter(id => SC_DEFAULT.includes(id));
    SC_DEFAULT.forEach(id => { if(!ids.includes(id)) ids.push(id); });
    return ids;
  }
  function scApply(){
    if(!scGrid || !more || !row) return;
    const order = scOrder();
    order.forEach((id, i) => {
      const b = document.getElementById(id); if(!b) return;
      if(i < 3) scGrid.insertBefore(b, more); else row.append(b);
    });
    const edit = document.getElementById("vScEdit"); if(edit) row.append(edit);
  }
  function scLabel(id){ return document.getElementById(id)?.querySelector("span")?.textContent || id; }
  function scIcon(id){ return document.getElementById(id)?.querySelector("i")?.innerHTML || ""; }
  if(scGrid && more && row){
    const edit = document.createElement("button");
    edit.type = "button"; edit.className = "v-sc"; edit.id = "vScEdit";
    edit.innerHTML = '<i><svg viewBox="0 0 24 24"><path d="M4 8h10M18 8h2M4 16h2M10 16h10"/><circle cx="16" cy="8" r="2"/><circle cx="8" cy="16" r="2"/></svg></i><span>จัดเรียง</span>';
    row.append(edit);
    scApply();
    edit.addEventListener("click", () => {
      window.__vaultetShow(ctx => {
        ctx.cancelValue = null;
        const box = ctx.box;
        box.insertAdjacentHTML("beforeend", '<h2 class="v-dlg-title">จัดเรียงทางลัด</h2><p class="v-dlg-msg">3 อันแรกอยู่บนหน้าหลัก ที่เหลืออยู่ใต้ปุ่ม "เพิ่มเติม"</p>');
        const list = document.createElement("div"); list.className = "v-sc-sort";
        const draw = () => {
          list.innerHTML = "";
          const order = scOrder();
          order.forEach((id, i) => {
            const r = document.createElement("div"); r.className = "v-sc-sort-row" + (i === 3 ? " is-split" : "");
            r.innerHTML = '<span class="v-sc-sort-ic"><svg viewBox="0 0 24 24">' + scIcon(id) + '</svg></span><span class="v-sc-sort-name"></span><span class="v-sc-sort-where"></span><button type="button" class="v-sc-sort-btn" data-d="-1" aria-label="เลื่อนขึ้น"><svg viewBox="0 0 24 24"><path d="M6 14l6-6 6 6"/></svg></button><button type="button" class="v-sc-sort-btn" data-d="1" aria-label="เลื่อนลง"><svg viewBox="0 0 24 24"><path d="M6 10l6 6 6-6"/></svg></button>';
            r.querySelector(".v-sc-sort-name").textContent = scLabel(id);
            r.querySelector(".v-sc-sort-where").textContent = i < 3 ? "หน้าหลัก" : "เพิ่มเติม";
            r.querySelectorAll("[data-d]").forEach(btn => {
              const d = Number(btn.dataset.d), j = i + d;
              btn.disabled = j < 0 || j >= order.length;
              btn.addEventListener("click", () => { const o = scOrder(); [o[i], o[j]] = [o[j], o[i]]; set(K_SC, JSON.stringify(o)); scApply(); draw(); });
            });
            list.append(r);
          });
        };
        draw();
        box.append(list);
        const actions = document.createElement("div"); actions.className = "v-dlg-actions";
        const reset = document.createElement("button"); reset.type = "button"; reset.className = "v-dlg-cancel"; reset.textContent = "คืนค่าเดิม";
        reset.addEventListener("click", () => { set(K_SC, JSON.stringify(SC_DEFAULT)); scApply(); draw(); });
        const done = document.createElement("button"); done.type = "button"; done.className = "v-dlg-ok"; done.textContent = "เสร็จ"; done.setAttribute("data-autofocus", "");
        done.addEventListener("click", () => ctx.close(true));
        actions.append(reset, done); box.append(actions);
      });
    });
  }

  // ---------- ล็อกการเลื่อนหน้าด้านหลังตอนมีหน้าต่าง/แผ่น/เมนูเปิดอยู่ ----------
  (function(){
    let locked = false, savedY = 0, raf = 0;
    const isOpenLayer = () => {
      if(document.querySelector(".v-dlg-back, #advDetailOverlay")) return true;
      for(const el of document.body.children){   // ชั้นที่สร้างด้วย inline style เต็มจอ (หน้าล็อกแอป, ตัวเลือกกู้คืน)
        if(el.style && el.style.position === "fixed" && /inset:\s*0|top:\s*0/.test(el.style.cssText) && getComputedStyle(el).display !== "none") return true;
      }
      for(const el of document.querySelectorAll(".open, .is-open, .show")){
        const cs = getComputedStyle(el);
        if(cs.position === "fixed" && cs.display !== "none" && cs.visibility !== "hidden" && el.getBoundingClientRect().height > 40 && !/toast|notice|bell|ux-bottom|ux-month/.test(el.className + el.id)) return true;
      }
      return false;
    };
    const apply = () => {
      raf = 0;
      const want = isOpenLayer();
      if(want === locked) return;
      locked = want;
      if(want){
        savedY = window.scrollY || document.documentElement.scrollTop || 0;
        document.body.style.top = (-savedY) + "px";
        document.body.classList.add("v-scroll-locked");
      }else{
        document.body.classList.remove("v-scroll-locked");
        document.body.style.top = "";
        window.scrollTo(0, savedY);
      }
    };
    const kick = () => { if(!raf) raf = requestAnimationFrame(apply); };
    new MutationObserver(kick).observe(document.body, { attributes: true, attributeFilter: ["class"], subtree: true, childList: true });
    window.vaultetRefreshScrollLock = kick;
  })();

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
    aikey: { title: "Gemini API Key", test: /Gemini/ },
    or:    { title: "OpenRouter", test: /OpenRouter/ }
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

    const backupNow = rowBtn("vSetBackupNow", "สำรองขึ้น Google Drive ตอนนี้", "", async () => {
      const hasFile = !!localStorage.getItem(typeof GDRIVE_FILE_ID_KEY !== "undefined" ? GDRIVE_FILE_ID_KEY : "");
      if(!hasFile){ openSettingsSheet("drive"); return; }
      const b = document.getElementById("vSetBackupNow"); b.classList.add("is-busy");
      try{ document.getElementById("gdriveSyncNowBtn")?.click(); }catch(e){}
      setTimeout(() => { b.classList.remove("is-busy"); refreshSettings(); }, 1500);
    });
    backupNow.classList.add("v-set-primary");
    const exp = rowBtn("vSetExport", "สำรองเป็นไฟล์", "", () => { exportBtn.click(); setTimeout(refreshSettings, 600); });
    const imp = rowBtn("vSetImport", "กู้คืนจากไฟล์", "เลือกไฟล์สำรองที่เคยบันทึกไว้", () => importBtn.click());
    const drive = rowBtn("vSetDrive", "Google Drive", "", () => openSettingsSheet("drive"));
    const notif = rowBtn("vSetNotif", "การแจ้งเตือน", "ประวัติและเลือกว่าจะให้เตือนเรื่องอะไร", () => { if(typeof openVaultetNotificationCenter === "function") openVaultetNotificationCenter(); });
    const aikey = rowBtn("vSetAiKey", "Gemini API Key", "", () => openSettingsSheet("aikey"));
    // ค่า AI วันนี้/เดือนนี้ แสดงบนหน้านี้เลย ไม่ต้องกดเข้าไปดู (เฉพาะดูอย่างเดียว)
    const costBox = document.createElement("div"); costBox.id = "vSetAiCost"; costBox.className = "v-set-cost"; costBox.hidden = true;
    const orRow = rowBtn("vSetOR", "OpenRouter · AI หลายค่าย", "", () => openSettingsSheet("or"));
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
      group("AI", costBox, aikey, orRow),
      group("สำรองข้อมูล", backupNow, exp, imp, drive),
      group("การแจ้งเตือน", notif),
      lockCard ? group("ความปลอดภัย", lockCard) : null,
      group("การแสดงผลและข้อมูล", ...[decRow, stock].filter(Boolean))
    ].filter(Boolean);
    const anchor = more.querySelector(".v-version");
    groups.forEach(g => anchor ? more.insertBefore(g, anchor) : more.append(g));
    refreshSettings();
    return true;
  }
  function renderAiCost(){
    const box = document.getElementById("vSetAiCost"), R = window.vaultetOR;
    if(!box) return;
    if(!R || !R.hasKey()){ box.hidden = true; return; }
    const u = R.usageCache(), cap = R.caps(), fx = R.fxRate();
    const usd = n => "$" + (Number(n) || 0).toFixed(2);
    const pill = (v, c) => '<b class="v-or-pill' + (c > 0 && v >= c ? " is-over" : "") + '">' + usd(v) + (c > 0 ? " / " + usd(c) : "") + "</b>";
    box.hidden = false;
    if(!u || u.error){ box.innerHTML = '<div class="v-or-urow"><span>ค่า AI</span><span class="v-set-cost-note">' + (u && u.error ? "ดึงยอดไม่ได้ (เช็กคีย์)" : "กำลังดึงยอดใช้…") + "</span></div>"; return; }
    box.innerHTML = '<div class="v-or-urow"><span>ค่า AI วันนี้</span>' + pill(u.day, cap.day) + '</div>'
      + '<div class="v-or-urow"><span>ค่า AI เดือนนี้' + (fx ? '<small> ≈ ' + Math.round(u.month * fx).toLocaleString("en-US") + " บาท</small>" : "") + "</span>" + pill(u.month, cap.month) + "</div>"
      + '<div class="v-set-cost-note v-set-cost-foot">"วันนี้" นับตามเวลา UTC (รีเซ็ต 07:00 น.)</div>';
  }
  document.addEventListener("vaultet-or-usage", renderAiCost);
  new MutationObserver(() => { if(document.body.classList.contains("ux-more-active")){ renderAiCost(); if(window.vaultetOR && window.vaultetOR.hasKey()) window.vaultetOR.refreshUsage(false); } }).observe(document.body, { attributes: true, attributeFilter: ["class"] });
  function refreshSettings(){
    const set = (id, text, side) => { const el = document.getElementById(id); if(!el) return; const s = el.querySelector(".v-set-sub"); if(s && text != null) s.textContent = text; const sd = el.querySelector(".v-set-side"); if(sd && side != null) sd.innerHTML = side; };
    const n = unreadCount();
    set("vSetNotif", null, n ? '<span class="v-set-badge">' + n + '</span>' : "");
    const f = timeAgo(fileBackupIso());
    const hasDrive = !!localStorage.getItem(typeof GDRIVE_FILE_ID_KEY !== "undefined" ? GDRIVE_FILE_ID_KEY : "");
    set("vSetBackupNow", hasDrive ? "ล่าสุด: " + (document.getElementById("gdriveLastSyncStatus")?.textContent || "ยังไม่เคย") : "ยังไม่ได้เชื่อม Drive — แตะเพื่อตั้งค่า");
    set("vSetExport", f ? "สำรองเป็นไฟล์ล่าสุด: " + f : "ยังไม่เคยสำรองเป็นไฟล์");
    const conn = document.getElementById("gdriveConnStatus")?.textContent || "ยังไม่ได้เชื่อมต่อ";
    const last = document.getElementById("gdriveLastSyncStatus")?.textContent || "";
    set("vSetDrive", last && !/ยังไม่เคย/.test(last) ? conn + " · สำรองขึ้น Drive ล่าสุด " + last : conn);
    set("vSetStock", document.getElementById("pfKeyStatus2")?.textContent || "");
    renderAiCost();
    set("vSetAiKey", typeof aiGeminiSummary === "function" ? aiGeminiSummary() : (document.getElementById("apiKeyStatus")?.textContent || ""));
    set("vSetOR", typeof aiORSummary === "function" ? aiORSummary() : "");
  }
  // หน้าตั้งค่าสร้างหลังโค้ดเดิมโหลดครบ (บางส่วนถูกสร้างด้วย timer) — ลองใหม่สั้นๆ จนกว่าจะพร้อม
  let tries = 0;
  (function wait(){ if(buildSettings() || ++tries > 20) return; setTimeout(wait, 150); })();
  // เข้า "ตั้งค่า" ได้จากแถวโปรไฟล์ล่างสุดของเมนู AI เท่านั้น (ไม่มีไอคอนโปรไฟล์ในแถบบนแล้ว)
  window.vaultetOpenSettings = () => { buildSettings(); refreshSettings(); if(window.vaultetGo) window.vaultetGo("more"); };


  // ---------- เมนูหน้า AI (จุดสามจุดมุมขวาบน) — หน้าตาแบบเมนูข้างของ Claude/Gemini ----------
  const I = {
    mem: '<path d="M12 3a6 6 0 00-6 6c0 2 1 3.500 2 4.500V17h8v-3.500c1-1 2-2.500 2-4.500a6 6 0 00-6-6z"/><path d="M9 20h6"/>',
    tune: '<path d="M4 8h10M18 8h2M4 16h2M10 16h10"/><circle cx="16" cy="8" r="2"/><circle cx="8" cy="16" r="2"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 20c1.500-4 4.500-6 8-6s6.500 2 8 6"/>',
    chart: '<path d="M5 20V10M12 20V4M19 20v-7"/>',
    trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
    dots: '<circle cx="12" cy="5" r="1.300"/><circle cx="12" cy="12" r="1.300"/><circle cx="12" cy="19" r="1.300"/>',
    edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13 7l4 4"/>',
    search: '<circle cx="11" cy="11" r="6.500"/><path d="M16 16l4 4"/>',
    x: '<path d="M6 6l12 12M18 6L6 18"/>',
    chat: '<path d="M5 6h14a1 1 0 011 1v9a1 1 0 01-1 1h-7l-4 3v-3H5a1 1 0 01-1-1V7a1 1 0 011-1z"/>'
  };
  const svg = p => '<svg class="v-ic" viewBox="0 0 24 24" aria-hidden="true">' + p + '</svg>';
  function profileName(){
    try{ const p = JSON.parse(localStorage.getItem("vaultet_user_profile_v1") || "{}") || {}; return p.nickname || [p.firstName, p.lastName].filter(Boolean).join(" ") || ""; }catch(e){ return ""; }
  }
  const chatsData = () => { try{ return typeof loadAllChats === "function" ? loadAllChats() : { chats: [], activeId: null }; }catch(e){ return { chats: [], activeId: null }; } };
  function buildAiMenu(){
    const host = document.getElementById("uxChatTopActions");
    if(!host || document.getElementById("uxChatMenuBtn")) return !!host;
    const newBtn = document.createElement("button");
    newBtn.type = "button"; newBtn.id = "uxChatNewBtn"; newBtn.className = "v-top-btn"; newBtn.setAttribute("aria-label", "แชทใหม่"); newBtn.innerHTML = svg(I.edit);
    const menuBtn = document.createElement("button");
    menuBtn.type = "button"; menuBtn.id = "uxChatMenuBtn"; menuBtn.className = "v-top-btn"; menuBtn.setAttribute("aria-label", "เมนู AI"); menuBtn.innerHTML = svg(I.dots);
    host.append(newBtn, menuBtn);

    const back = document.createElement("div"); back.className = "v-aimenu-back"; back.id = "aiMenuBack";
    const panel = document.createElement("aside"); panel.className = "v-aimenu"; panel.id = "aiMenu"; panel.setAttribute("role", "dialog"); panel.setAttribute("aria-label", "เมนู AI");
    const head = document.createElement("div"); head.className = "v-aimenu-head";
    head.innerHTML = '<span class="v-aimenu-title">ที่ปรึกษา AI</span><button type="button" class="v-aimenu-search-btn" id="aiMenuSearchBtn" aria-label="ค้นหาแชท">' + svg(I.search) + '</button>';
    const searchWrap = document.createElement("div"); searchWrap.className = "v-aimenu-search"; searchWrap.hidden = true;
    searchWrap.innerHTML = svg(I.search) + '<input type="search" id="aiMenuSearch" placeholder="ค้นหาแชท" autocomplete="off" enterkeyhint="search">';
    const list = document.createElement("div"); list.className = "v-aimenu-list";
    const hist = document.createElement("div"); hist.className = "v-aimenu-hist"; hist.id = "aiMenuHist";
    const histLabel = document.createElement("div"); histLabel.className = "v-aimenu-label"; histLabel.textContent = "ประวัติแชท";
    const prof = document.createElement("button"); prof.type = "button"; prof.className = "v-aimenu-profile"; prof.id = "aiMenuProfile";
    prof.innerHTML = '<span class="v-aimenu-avatar"></span><span class="v-aimenu-pinfo"><span class="v-aimenu-name"></span><span class="v-aimenu-sub">ตั้งค่า</span></span>';

    let closeTimer = 0;
    const close = () => { panel.classList.remove("is-open"); back.classList.remove("is-open"); document.body.classList.remove("v-aimenu-open"); };
    const chatActive = () => document.body.classList.contains("ux-chat-active");
    const isOpenEl = el => el.classList.contains("open") || el.classList.contains("is-open");
    // เปิดหน้าย่อยจากเมนูแล้วปิดออก → กลับมาที่เมนูเดิม (ไม่ใช่หลุดไปหน้าแชทเลย)
    function armReturn(){
      const els = ["vaultetProfileOverlay", "settingsOverlay", "weeklyAuditOverlay", "aiAdvisorSettingsPanel"].map(id => document.getElementById(id)).filter(Boolean);
      let armed = null; const t0 = Date.now();
      const iv = setInterval(() => {
        if(!armed){ armed = els.find(isOpenEl) || null; if(!armed && Date.now() - t0 > 1500) clearInterval(iv); return; }
        if(!isOpenEl(armed)){ clearInterval(iv); setTimeout(() => { if(chatActive()) open(); }, 140); }
      }, 120);
    }
    const after = (fn, ret) => { close(); setTimeout(() => { fn(); if(ret) armReturn(); }, 230); };   // รอเมนูเลื่อนออกก่อนค่อยเปิดอย่างอื่น ไม่ให้กระตุก
    let fromMenu = false;
    const renderHist = () => {
      const q = (document.getElementById("aiMenuSearch").value || "").trim().toLowerCase();
      const data = chatsData();
      const rows = [...(data.chats || [])].sort((x, y) => (y.updatedAt || "").localeCompare(x.updatedAt || ""))
        .map(c => ({ c, title: c.title || (typeof chatTitleFrom === "function" ? chatTitleFrom(c.messages) : "") || "แชทใหม่" }))
        .filter(r => !q || r.title.toLowerCase().includes(q) || (r.c.messages || []).some(m => String(m.text || "").toLowerCase().includes(q)));
      hist.innerHTML = "";
      if(!rows.length){ const e = document.createElement("div"); e.className = "v-aimenu-empty"; e.textContent = q ? "ไม่พบแชทที่ค้นหา" : "ยังไม่มีแชท"; hist.append(e); return; }
      rows.forEach(({ c, title }) => {
        const b = document.createElement("div"); b.className = "v-aimenu-chat" + (c.id === data.activeId ? " is-active" : "");
        b.innerHTML = '<button type="button" class="v-aimenu-chat-main">' + svg(I.chat) + '<span></span></button><button type="button" class="v-aimenu-chat-del" aria-label="ลบแชทนี้">' + svg(I.x) + '</button>';
        b.querySelector("span").textContent = title;
        b.querySelector(".v-aimenu-chat-main").addEventListener("click", () => after(() => {
          if(typeof switchToChat === "function") switchToChat(c.id);
          if(typeof renderAiChatBubbles === "function") renderAiChatBubbles();
          if(typeof clearAiChatUnread === "function") clearAiChatUnread();
        }));
        b.querySelector(".v-aimenu-chat-del").addEventListener("click", async () => {
          if(!(await vaultetAsk("ลบ", "ลบแชทนี้ทั้งหมดใช่ไหม? กู้คืนไม่ได้", true))) return;
          if(typeof deleteChat === "function") deleteChat(c.id);
          if(typeof renderAiChatBubbles === "function") renderAiChatBubbles();
          renderHist();
        });
        hist.append(b);
      });
    };
    const open = () => {
      const n = profileName();
      prof.querySelector(".v-aimenu-name").textContent = n || "โปรไฟล์ของคุณ";
      prof.querySelector(".v-aimenu-avatar").textContent = n ? Array.from(n)[0].toUpperCase() : "";
      if(!n) prof.querySelector(".v-aimenu-avatar").innerHTML = svg(I.user);
      searchWrap.hidden = true; document.getElementById("aiMenuSearch").value = "";
      renderHist();
      back.classList.add("is-open"); panel.classList.add("is-open"); document.body.classList.add("v-aimenu-open");
    };
    const item = (icon, label, fn, danger, ret) => {
      const b = document.createElement("button"); b.type = "button"; b.className = "v-aimenu-row" + (danger ? " is-danger" : "");
      b.innerHTML = svg(icon) + "<span></span>"; b.querySelector("span").textContent = label;
      b.addEventListener("click", () => after(fn, ret));
      return b;
    };
    const click = id => () => document.getElementById(id)?.click();
    list.append(
      item(I.user, "ข้อมูลของฉันที่ AI ใช้", () => window.vaultetOpenProfile && window.vaultetOpenProfile(), false, true),
      item(I.mem, "Memory ที่ AI จำได้", () => openSettingsSheet("memory"), false, true),
      item(I.tune, "นิสัยและคำสั่งของ AI", () => { const p = document.getElementById("aiAdvisorSettingsPanel"); if(!p || !p.classList.contains("is-open")) click("aiAdvisorSettingsBtn")(); }, false, true),
      item(I.chart, "รายงานรายสัปดาห์", () => { if(typeof openWeeklyAuditModal === "function") openWeeklyAuditModal(); }, false, true),
      item(I.trash, "ล้างข้อความในแชทนี้", async () => { if(await vaultetAsk("ล้าง", "ล้างข้อความทั้งหมดในแชทนี้ใช่ไหม?", true)) click("clearAiChatBtn")(); }, true)
    );
    panel.append(head, searchWrap, list, histLabel, hist, prof);
    document.body.append(back, panel);
    back.addEventListener("click", close);
    document.addEventListener("keydown", e => { if(e.key === "Escape" && panel.classList.contains("is-open")) close(); });
    menuBtn.addEventListener("click", open);
    newBtn.addEventListener("click", () => document.getElementById("newAiChatBtn")?.click());
    prof.addEventListener("click", () => { fromMenu = true; after(() => window.vaultetOpenSettings && window.vaultetOpenSettings()); });
    // กดย้อนกลับจากหน้าตั้งค่า (ที่เปิดมาจากเมนู AI) → กลับมาที่เมนู
    document.getElementById("uxBackBtn")?.addEventListener("click", () => { if(!fromMenu) return; fromMenu = false; setTimeout(() => { if(chatActive()) open(); }, 280); });
    document.querySelectorAll(".ux-bottom-item, #uxAddBtn").forEach(b => b.addEventListener("click", () => { fromMenu = false; }));
    // ปุ่ม ✕ + ฉากหลังของแผง "ปรับแต่ง AI"
    const adv = document.getElementById("aiAdvisorSettingsPanel");
    if(adv){
      const advBack = document.createElement("div"); advBack.className = "v-sheet-back"; advBack.id = "aiAdvBack"; document.body.append(advBack);
      const advClose = () => adv.classList.remove("is-open");
      advBack.addEventListener("click", advClose);
      document.getElementById("aiAdvisorCloseBtn")?.addEventListener("click", advClose);
      const sync = () => advBack.classList.toggle("is-open", adv.classList.contains("is-open"));
      new MutationObserver(sync).observe(adv, { attributes: true, attributeFilter: ["class"] }); sync();
      document.addEventListener("keydown", e => { if(e.key === "Escape" && adv.classList.contains("is-open")) advClose(); });
    }
    document.getElementById("aiMenuSearchBtn").addEventListener("click", () => {
      searchWrap.hidden = !searchWrap.hidden;
      if(!searchWrap.hidden) document.getElementById("aiMenuSearch").focus(); else { document.getElementById("aiMenuSearch").value = ""; renderHist(); }
    });
    document.getElementById("aiMenuSearch").addEventListener("input", renderHist);
    return true;
  }
  let mtries = 0;
  (function waitMenu(){ if(buildAiMenu() || ++mtries > 30) return; setTimeout(waitMenu, 150); })();

  // ---------- ศูนย์แจ้งเตือน: ลิสต์เป็นหลัก ตั้งค่าอยู่ในหน้าแยก (กดเฟือง) ----------
  (function(){
    const sheet = document.querySelector("#notificationOverlay .notification-sheet");
    const panel = document.getElementById("notificationSettingsPanel");
    const title = document.getElementById("notificationModalTitle");
    const gear = document.getElementById("notificationSettingsGear");
    if(!sheet || !panel || !gear || !title) return;
    const sync = () => {
      const on = !panel.hidden;
      sheet.classList.toggle("is-settings", on);
      title.textContent = on ? "ตั้งค่าการแจ้งเตือน" : "การแจ้งเตือน";
      gear.setAttribute("aria-label", on ? "กลับไปรายการแจ้งเตือน" : "ตั้งค่าการแจ้งเตือน");
    };
    new MutationObserver(sync).observe(panel, { attributes: true, attributeFilter: ["hidden"] });
    gear.addEventListener("click", () => { if(typeof toggleNotificationSettings === "function") toggleNotificationSettings(); });
    // เปิดศูนย์แจ้งเตือนครั้งใหม่ → เริ่มที่รายการเสมอ
    new MutationObserver(() => { if(!document.getElementById("notificationOverlay").classList.contains("open") && !panel.hidden){ panel.hidden = true; } }).observe(document.getElementById("notificationOverlay"), { attributes: true, attributeFilter: ["class"] });
    sync();
  })();

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
