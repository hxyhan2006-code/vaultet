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
