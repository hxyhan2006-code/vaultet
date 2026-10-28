// Vaultet — app/16-polish.js : งานเก็บตกหลังปรับโฉม (ds54)
// 1) แถบเตือน "ยังไม่ได้สำรองข้อมูล" ย้ายจากหน้าหลักไปอยู่ในกระดิ่งแจ้งเตือน (แตะแล้วไปหน้าสำรองข้อมูล)
// 2) สวิตช์สำรองขึ้น Drive อัตโนมัติ เป็นสวิตช์เลื่อนแบบเดียวกับหน้าตั้งค่า
(function(){
  const g = document.getElementById("gdriveAutoSyncToggle");
  if(g){ g.removeAttribute("style"); g.classList.add("v-switch"); g.setAttribute("role", "switch"); }

  // ใช้เงื่อนไขเดิมของแถบเตือน (refreshBackupBanner: มีรายการ และไม่ได้สำรองเกิน 7 วัน) แต่แสดงในกระดิ่งแทน
  function syncBackupNotice(){
    if(typeof loadVaultetNotifications !== "function" || typeof saveVaultetNotifications !== "function") return;
    const banner = document.getElementById("backupBanner"); if(!banner) return;
    const due = banner.classList.contains("show");
    const id = "backup-" + monthKey(todayISO());
    const list = loadVaultetNotifications(), has = list.find(n => n.id === id);
    let changed = false;
    if(due && !has){
      list.unshift({ id, icon: "⚠️", title: "ยังไม่ได้สำรองข้อมูล", body: "ไม่ได้สำรองมาเกิน 7 วัน หรือยังไม่เคยสำรอง แตะเพื่อไปหน้าสำรองข้อมูล", read: false, day: todayISO(), createdAt: new Date().toISOString() });
      changed = true;
    }else if(!due && has && !has.read){ has.read = true; changed = true; }
    if(changed){ saveVaultetNotifications(list); if(typeof renderVaultetNotifications === "function") renderVaultetNotifications(); }
  }
  const _rb = refreshBackupBanner;
  refreshBackupBanner = function(){ _rb.apply(this, arguments); try{ syncBackupNotice(); }catch(e){ console.error(e); } };
  // ระบบแจ้งเตือนโหลดทีหลัง (ai/) → เช็กอีกครั้งเมื่อหน้าโหลดครบ
  const late = () => { try{ refreshBackupBanner(); }catch(e){ console.error(e); } };
  if(document.readyState === "complete") setTimeout(late, 0); else window.addEventListener("load", late);
  // แตะการแจ้งเตือนเรื่องสำรองข้อมูล → ไปหน้าตั้งค่า (มีปุ่มสำรองขึ้น Drive / สำรองเป็นไฟล์)
  document.addEventListener("click", e => {
    if(!e.target.closest || !e.target.closest('[data-notif-id^="backup-"]')) return;
    setTimeout(() => {
      if(typeof closeVaultetNotificationCenter === "function") closeVaultetNotificationCenter();
      if(window.vaultetOpenSettings) window.vaultetOpenSettings();
    }, 0);
  });
})();

// ===== ปุ่มย้อนกลับของมือถือ (ds69) =====
// กดย้อนกลับ 1 ครั้ง = ปิดชั้นบนสุดที่เปิดอยู่ 1 ชั้น (กล่องข้อความ → แผ่น/หน้าต่าง → แป้นตัวเลข → หน้าย่อย → กลับหน้าหลัก)
// ถึงหน้าหลักแล้วไม่มีอะไรให้ปิด กดอีกครั้งถึงออกจากแอป
// วิธีทำ: ใส่รายการกั้นไว้ 1 อัน (ใส่หลังแตะจอครั้งแรก เพราะ Chrome ข้ามรายการที่หน้าเว็บใส่เองโดยผู้ใช้ยังไม่ได้แตะอะไร)
// พอกดย้อนแล้วปิดอะไรได้ ก็ใส่รายการกั้นกลับเข้าไปใหม่ ถ้าไม่มีอะไรให้ปิดก็ปล่อยให้ย้อนต่อ (ออกจากแอป)
(function(){
  const $ = s => document.querySelector(s);
  const lastOf = s => { const l = document.querySelectorAll(s); return l.length ? l[l.length - 1] : null; };
  const steps = [
    // กล่องข้อความ/แผ่นเลือกของแอป (dialog.js) — เหมือนแตะพื้นหลัง = ยกเลิก
    () => { const d = lastOf(".v-dlg-back"); if(!d) return false; d.dispatchEvent(new MouseEvent("mousedown", { bubbles: true })); return true; },
    () => { const p = $(".v-aimenu-pop-back"); if(!p) return false; p.click(); return true; },
    () => { const m = $("#aiMenuBack.is-open"); if(!m) return false; m.click(); return true; },
    () => { const a = $("#advDetailOverlay"); if(!a) return false; a.click(); return true; },
    () => { const p = $("#vaultetProfileOverlay.open"); if(!p) return false; p.classList.remove("open"); return true; },
    () => { const s = $("#pfOpenSheet.open"); if(!s) return false; s.classList.remove("open"); return true; },
    () => { const p = $("#pfOverlay.open"); if(!p) return false; const b = p.querySelector("#pfClose"); if(b) b.click(); else p.classList.remove("open"); return true; },
    // หน้าต่างแบบแผ่นจากล่างทั้งหมด
    () => {
      const o = lastOf(".overlay.open"); if(!o) return false;
      if(o.id === "overlay"){
        // ฟอร์มเพิ่มรายการ: ย้อนครั้งแรกปิดแป้นตัวเลข ครั้งที่สองปิดฟอร์ม
        const sheet = o.querySelector(".v-sheet");
        if(sheet && !sheet.classList.contains("v-kp-off")){ sheet.classList.add("v-kp-off"); return true; }
        if(typeof closeForm === "function") closeForm(); else o.classList.remove("open");
        return true;
      }
      const c = o.querySelector(".close-btn, [id^='close']");
      if(c) c.click(); else o.click();
      return true;
    },
    // หน้าย่อย (ตั้งค่า/รายการทั้งหมด) → กลับแท็บเดิม
    () => { if(!document.body.classList.contains("ux-sub-active")) return false; $("#uxBackBtn")?.click(); return true; },
    // แท็บอื่น → หน้าหลัก
    () => { if(document.body.classList.contains("ux-home-active") || typeof vaultetGo !== "function") return false; vaultetGo("home"); return true; },
  ];
  function closeTop(){
    for(const s of steps){ try{ if(s()) return true; }catch(e){ console.error(e); } }
    return false;
  }
  window.vaultetBackStep = closeTop;

  // แตะที่ยอดเงินเพื่อเปิดแป้นตัวเลขกลับมา (หลังปิดด้วยปุ่มย้อนกลับ)
  document.addEventListener("click", e => {
    const a = e.target.closest && e.target.closest("#overlay .v-amount"); if(!a) return;
    const sheet = a.closest(".v-sheet"); if(!sheet || !sheet.classList.contains("v-kp-off")) return;
    if(document.activeElement && document.activeElement !== document.body) document.activeElement.blur();
    sheet.classList.remove("v-kp-off");
  }, true); // ใช้ capture เพราะแผ่นฟอร์มหยุดการส่งต่อคลิกไว้ (stopPropagation)

  let armed = false;
  const guard = () => { try{ history.pushState({ vaultetGuard: 1 }, "", location.href); }catch(e){} };
  const arm = () => {
    if(armed) return; armed = true; guard();
    ["pointerdown", "touchstart", "keydown"].forEach(ev => window.removeEventListener(ev, arm, true));
  };
  ["pointerdown", "touchstart", "keydown"].forEach(ev => window.addEventListener(ev, arm, { capture: true, passive: true }));
  window.addEventListener("popstate", () => {
    if(!armed) return;
    if(closeTop()){ guard(); return; }
    armed = false; history.back(); // ไม่มีอะไรให้ปิดแล้ว: ปล่อยให้ย้อนต่อ (ออกจากแอป)
  });
})();
