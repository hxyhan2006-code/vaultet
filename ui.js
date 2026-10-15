// Vaultet — ui.js: พฤติกรรมเล็กๆ ของ UI ใหม่ (ซ่อนตัวเลข, ปุ่มเพิ่มเติม, พับ/กางสินทรัพย์, เลขเวอร์ชัน)
// ไม่แตะข้อมูลหรือโลจิกการเงิน — อ่าน/เขียนเฉพาะ localStorage ที่ขึ้นต้นด้วย vaultet_ui_
(function(){
  const UI_VERSION = "ds6";
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

  // ---------- หน้า "ตั้งค่า": จัดเป็นกลุ่ม แต่ละเรื่องอยู่จุดเดียว ----------
  // ใช้ปุ่ม/ช่องเดิมทั้งหมด (id เดิม, ตัวจัดการเดิม) แค่ย้ายตำแหน่งและเรียกผ่านแถวใหม่
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
    if(!iso) return "ยังไม่เคยสำรอง";
    const d = new Date(iso); if(isNaN(d)) return "ยังไม่เคยสำรอง";
    const days = Math.floor((Date.now() - d.getTime()) / 86400000);
    return "สำรองล่าสุด " + (days <= 0 ? "วันนี้" : days + " วันที่แล้ว");
  }
  function lastBackupIso(){
    let a = "", b = "";
    try{ a = localStorage.getItem(typeof BACKUP_KEY !== "undefined" ? BACKUP_KEY : "") || ""; }catch(e){}
    try{ b = localStorage.getItem(typeof GDRIVE_LAST_SYNC_KEY !== "undefined" ? GDRIVE_LAST_SYNC_KEY : "") || ""; }catch(e){}
    return [a, b].filter(Boolean).sort().pop() || "";
  }
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

    const notif = rowBtn("vSetNotif", "การแจ้งเตือน", "เรื่องสำคัญที่ระบบเตือนคุณ", () => { if(typeof openVaultetNotificationCenter === "function") openVaultetNotificationCenter(); });
    const exp = rowBtn("vSetExport", "สำรองข้อมูลเป็นไฟล์", "", () => { exportBtn.click(); setTimeout(refreshSettings, 600); });
    const imp = rowBtn("vSetImport", "กู้คืนจากไฟล์", "เลือกไฟล์สำรองที่เคยบันทึกไว้", () => importBtn.click());
    const drive = rowBtn("vSetDrive", "Google Drive", "", () => {
      settingsBtn.click();
      setTimeout(() => document.getElementById("gdriveConnectBtn")?.closest(".settings-card")?.scrollIntoView({block:"start"}), 120);
    });
    const ai = rowBtn("vSetAi", "AI และการเชื่อมต่อ", "Gemini API Key, ราคาหุ้น, โปรไฟล์และเป้าหมายสำหรับ AI", () => settingsBtn.click());

    // แสดงเศษสตางค์: ย้ายสวิตช์เดิมมาไว้หน้านี้ (id เดิม ตัวจัดการเดิมยังทำงาน)
    const dec = document.getElementById("showDecimalsToggle");
    let decRow = null;
    if(dec){
      decRow = document.createElement("label"); decRow.className = "v-set-row v-set-switch";
      decRow.innerHTML = '<span class="v-set-main"><span class="v-set-title">แสดงเศษสตางค์</span><span class="v-set-sub">โชว์ทศนิยมในตัวเลขเงินทุกที่</span></span>';
      dec.removeAttribute("style"); decRow.append(dec);
      dec.closest(".settings-card")?.remove();
    }

    const groups = [
      group("การแจ้งเตือน", notif),
      group("ข้อมูลและการสำรอง", exp, imp, drive),
      lockCard ? group("ความปลอดภัย", lockCard) : null,
      decRow ? group("การแสดงผล", decRow) : null,
      group("AI", ai)
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
    set("vSetExport", timeAgo(lastBackupIso()));
    const conn = document.getElementById("gdriveConnStatus")?.textContent || "ยังไม่ได้เชื่อมต่อ";
    const last = document.getElementById("gdriveLastSyncStatus")?.textContent || "";
    set("vSetDrive", last && !/ยังไม่เคย/.test(last) ? conn + " · " + last : conn);
  }
  // หน้าตั้งค่าสร้างหลังโค้ดเดิมโหลดครบ (บางส่วนถูกสร้างด้วย timer) — ลองใหม่สั้นๆ จนกว่าจะพร้อม
  let tries = 0;
  (function wait(){ if(buildSettings() || ++tries > 20) return; setTimeout(wait, 150); })();
  document.querySelector('.ux-bottom-item[data-page="more"]')?.addEventListener("click", () => { buildSettings(); refreshSettings(); });

  // เลขเวอร์ชันไว้เช็กว่าเห็นรุ่นล่าสุดหรือยัง (หน้า "อื่นๆ")
  const moreView = document.getElementById("ux-more");
  if(moreView){
    const v = document.createElement("div");
    v.className = "v-version"; v.textContent = "Vaultet UI " + UI_VERSION;
    moreView.append(v);
  }
})();
