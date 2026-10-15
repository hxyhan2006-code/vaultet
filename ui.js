// Vaultet — ui.js: พฤติกรรมเล็กๆ ของ UI ใหม่ (ซ่อนตัวเลข, ปุ่มเพิ่มเติม, พับ/กางสินทรัพย์, เลขเวอร์ชัน)
// ไม่แตะข้อมูลหรือโลจิกการเงิน — อ่าน/เขียนเฉพาะ localStorage ที่ขึ้นต้นด้วย vaultet_ui_
(function(){
  const UI_VERSION = "ds4";
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

  // "ดูทั้งหมด" ในรายการล่าสุด → ไปแท็บ "รายการ"
  const all = document.getElementById("vRecentAll");
  if(all) all.addEventListener("click", () => { if(window.vaultetGo) window.vaultetGo("transactions"); });

  // แท็บ "รายการ": สลับระหว่าง "รายการ" กับ "วิเคราะห์" (เดิมวิเคราะห์ไปอยู่ท้ายสุดของหน้ายาวๆ)
  const txView = document.getElementById("ux-transactions");
  if(txView){
    const listPart = txView.querySelector(".list-section");
    const analysisParts = [...txView.querySelectorAll("#breakdownSection, .analysis-section")];
    const K_TX = "vaultet_ui_tx_mode_v1";
    const seg = document.createElement("div");
    seg.className = "v-seg"; seg.setAttribute("role", "tablist");
    seg.innerHTML = '<button type="button" role="tab" data-mode="list">รายการ</button><button type="button" role="tab" data-mode="analysis">วิเคราะห์</button>';
    txView.prepend(seg);
    const setMode = mode => {
      listPart && listPart.classList.toggle("v-off", mode !== "list");
      analysisParts.forEach(el => el.classList.toggle("v-off", mode !== "analysis"));
      seg.querySelectorAll("button").forEach(b => { const on = b.dataset.mode === mode; b.classList.toggle("is-on", on); b.setAttribute("aria-selected", on ? "true" : "false"); });
      set(K_TX, mode);
    };
    seg.addEventListener("click", e => { const b = e.target.closest("button[data-mode]"); if(b) setMode(b.dataset.mode); });
    setMode(get(K_TX) === "analysis" ? "analysis" : "list");
  }

  // เลขเวอร์ชันไว้เช็กว่าเห็นรุ่นล่าสุดหรือยัง (หน้า "อื่นๆ")
  const moreView = document.getElementById("ux-more");
  if(moreView){
    const v = document.createElement("div");
    v.className = "v-version"; v.textContent = "Vaultet UI " + UI_VERSION;
    moreView.append(v);
  }
})();
