// Vaultet — ui.js: พฤติกรรมเล็กๆ ของ UI ใหม่ (ซ่อนตัวเลข, ปุ่มเพิ่มเติม, พับ/กางสินทรัพย์, เลขเวอร์ชัน)
// ไม่แตะข้อมูลหรือโลจิกการเงิน — อ่าน/เขียนเฉพาะ localStorage ที่ขึ้นต้นด้วย vaultet_ui_
(function(){
  const UI_VERSION = "ds7";
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

  // ---------- หน้าต่างตั้งค่าเดิม (#settingsOverlay) แยกเป็น 3 มุมมอง: AI / Google Drive / ราคาหุ้น ----------
  // ใช้การ์ดเดิมทั้งหมด (id เดิม ตัวจัดการเดิม) แค่เลือกว่าจะโชว์การ์ดไหน ตามจุดที่เปิดมา
  const sov = document.getElementById("settingsOverlay");
  const sheet = sov && sov.querySelector(".sheet-modal");
  const TOPICS = {
    ai:    { title: "ตั้งค่า AI",     test: /Gemini|โปรไฟล์การเงิน|เป้าหมายทางการเงิน|Memory/ },
    drive: { title: "Google Drive",   test: /Drive/ },
    stock: { title: "ราคาหุ้น",        test: /Twelve|ราคาหุ้น/ }
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
  document.getElementById("vAiDataBtn")?.addEventListener("click", () => openSettingsSheet("ai"));

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
  }
  // หน้าตั้งค่าสร้างหลังโค้ดเดิมโหลดครบ (บางส่วนถูกสร้างด้วย timer) — ลองใหม่สั้นๆ จนกว่าจะพร้อม
  let tries = 0;
  (function wait(){ if(buildSettings() || ++tries > 20) return; setTimeout(wait, 150); })();
  document.getElementById("uxAvatarBtn")?.addEventListener("click", () => { buildSettings(); refreshSettings(); });

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
