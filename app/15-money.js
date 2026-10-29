// Vaultet — app/15-money.js : หน้า "เงินของฉัน" โฉมใหม่ (รอบ 4, ds52)
// มูลค่าสุทธิ + แถบสัดส่วน (กดดูที่มาของตัวเลข), บัญชี (+เงินกันไว้), ลงทุน (พอร์ตหุ้น), เงินสำรองและเป้าหมาย, หนี้และเงินให้ยืม
// ตัวเลขทั้งหมดมาจากฟังก์ชันเดิม (vaultetAssets, vaultetNetWorth, computeAccountBalance ...) ไม่มีสูตรใหม่
// ปุ่มทางลัดเดิมยังอยู่ในหน้าเว็บ (ซ่อนไว้) แถวใหม่กดแล้วสั่งปุ่มเดิมให้ทำงาน จึงเปิดหน้าต่างเดิมทุกอย่าง
(function(){
  const view = document.getElementById("ux-plan");
  if(!view) return;
  const money = n => (n < 0 ? "-" : "") + "฿" + fmt(Math.abs(n));
  const tap = id => document.getElementById(id)?.click();
  const IC = {
    bank: '<path d="M3 10l9-6 9 6M5 10v8M10 10v8M14 10v8M19 10v8M3 21h18"/>',
    cash: '<rect x="3" y="7" width="18" height="10" rx="2"/><circle cx="12" cy="12" r="2.500"/>',
    wallet: '<path d="M3 7a2 2 0 012-2h13v4M3 7v11a2 2 0 002 2h15V9H5a2 2 0 01-2-2z"/><path d="M16 14.500h.01"/>',
    shield: '<path d="M12 3l8 3v6c0 4.500-3.200 7.600-8 9-4.800-1.400-8-4.500-8-9V6z"/>',
    chart: '<path d="M3 17l6-6 4 4 8-8M15 7h6v6"/>',
    chev: '<path d="M9 6l6 6-6 6"/>'
  };
  const svg = (p, cls) => '<svg class="' + (cls || "v-m-ic") + '" viewBox="0 0 24 24" aria-hidden="true">' + p + "</svg>";
  const accIcon = name => /เงินสด|cash/i.test(name) ? IC.cash : /วอลเล็ท|wallet|truemoney|ทรูมันนี่|เป๋าตัง/i.test(name) ? IC.wallet : IC.bank;

  // ---------- โครงหน้า ----------
  const hero = document.createElement("section");
  hero.className = "v-card v-mhero"; hero.id = "vMoneyHero";
  hero.innerHTML = `<span class="v-mhero-k">มูลค่าสุทธิ</span><span class="v-mhero-v v-sens" id="vMoneyNet"></span>
    <div class="v-mbar" id="vMoneyBar" aria-hidden="true"></div><div class="v-mlegend" id="vMoneyLegend"></div>
    <div class="v-mhero-debt" id="vMoneyDebtNote"></div>`;
  const sec = (id, title, action) => { const s = document.createElement("section"); s.className = "v-msec"; s.id = id;
    s.innerHTML = `<div class="v-msec-head"><h2 class="v-msec-title">${title}</h2>${action ? `<button type="button" class="v-iconbtn" data-act="${action[0]}" aria-label="${action[1]}" title="${action[1]}"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="5" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="19" cy="12" r="1.3"/></svg></button>` : ""}</div><div class="v-msec-body"></div>`; return s; };
  const accSec = sec("vMoneyAccounts", "บัญชี", ["accounts", "จัดการ"]);
  const invSec = sec("vMoneyInvest", "ลงทุน");
  const keepSec = sec("vMoneyKeep", "เงินสำรองและเป้าหมาย");
  const owedSec = sec("vMoneyOwed", "หนี้และเงินให้ยืม");

  // ของเดิม: สินทรัพย์รวม (พับได้) ย้ายเข้าการ์ดมูลค่าสุทธิเป็น "ที่มาของตัวเลข" / ทางลัดซ่อน (แถวใหม่แทน)
  const assets = document.getElementById("vAssets");
  const shortcuts = document.getElementById("vShortcuts");
  const cards = view.querySelector(".hero-cards");
  const emergency = document.getElementById("emergencyDashboardCard"), goals = document.getElementById("goalsCard");
  view.insertBefore(hero, cards || view.firstChild);
  if(assets) hero.append(assets);
  if(shortcuts) shortcuts.classList.add("v-native-hidden");
  hero.after(accSec); accSec.after(invSec); invSec.after(keepSec); keepSec.after(owedSec);
  const keepBody = keepSec.querySelector(".v-msec-body");
  if(emergency) keepBody.append(emergency);
  if(goals) keepBody.append(goals);
  accSec.querySelector('[data-act="accounts"]').addEventListener("click", () => tap("manageAccountsBtn"));

  // ---------- วาด ----------
  function draw(){
    const A = vaultetAssets(), net = vaultetNetWorth(), debt = getTotalDebts(), owed = getTotalReceivablesOutstanding(), reserved = getTotalReserved();
    document.getElementById("vMoneyNet").textContent = money(net);
    if(net < 0) document.getElementById("vMoneyNet").style.color = "var(--v-out)"; else document.getElementById("vMoneyNet").style.color = "";
    // แถบสัดส่วน: เฉพาะส่วนที่เป็นบวก
    const parts = [["ในบัญชี", Math.max(0, A.total), "var(--v-accent)"], ["พอร์ตหุ้น", A.stock, "var(--v-xfer)"], ["เป้าหมาย", A.goals, "var(--v-save)"],
      ["เงินสำรอง", A.em, "var(--v-cat-4)"], ["ออม/ลงทุนอื่น", A.rest, "#b39ddb"], ["คนอื่นติดเรา", owed, "var(--v-muted)"]].filter(p => p[1] > 0);
    const sum = parts.reduce((s, p) => s + p[1], 0);
    document.getElementById("vMoneyBar").innerHTML = sum ? parts.map(p => `<i style="flex:${p[1]};background:${p[2]}"></i>`).join("") : "<i></i>";
    document.getElementById("vMoneyLegend").innerHTML = parts.map(p => `<span><i style="background:${p[2]}"></i>${p[0]} ${Math.round(p[1] / sum * 100)}%</span>`).join("");
    document.getElementById("vMoneyDebtNote").textContent = debt > 0 ? "หักหนี้แล้ว " + money(debt) : "";

    // บัญชี + เงินกันไว้
    const accBody = accSec.querySelector(".v-msec-body");
    accBody.innerHTML = `<div class="v-mlist">${accounts.map(a => `<button type="button" class="v-mrow" data-acc="${escapeHtml(a.id)}"><span class="v-mrow-ic">${svg(accIcon(a.name))}</span><span class="v-mrow-main"><span class="v-mrow-t">${escapeHtml(a.name)}</span></span><span class="v-mrow-v v-sens">${money(computeAccountBalance(a.id))}</span></button>`).join("")}
      ${reserved > 0 ? `<button type="button" class="v-mrow" id="vMoneyReservedRow"><span class="v-mrow-ic">${svg(IC.shield)}</span><span class="v-mrow-main"><span class="v-mrow-t">เงินกันไว้</span><span class="v-mrow-s">ใช้ได้จริง ${money(A.total - reserved)}</span></span><span class="v-mrow-v v-sens">${money(reserved)}</span></button>` : `<button type="button" class="v-mrow v-mrow-add" id="vMoneyReservedRow"><span class="v-mrow-ic">${svg(IC.shield)}</span><span class="v-mrow-main"><span class="v-mrow-t">เงินกันไว้</span><span class="v-mrow-s">กันเงินไว้จ่ายเรื่องที่รู้ล่วงหน้า</span></span>${svg(IC.chev, "v-mrow-chev")}</button>`}</div>`;
    accBody.querySelectorAll("[data-acc]").forEach(b => b.addEventListener("click", () => tap("manageAccountsBtn")));
    accBody.querySelector("#vMoneyReservedRow").addEventListener("click", () => tap("manageReservedBtn"));

    // ลงทุน
    let pf = { value: 0, cost: 0 }; try{ pf = (window.vaultetPortfolioSummary && window.vaultetPortfolioSummary()) || pf; }catch(e){}
    const pl = pf.value - pf.cost, has = pf.cost > 0 || pf.value > 0;
    invSec.querySelector(".v-msec-body").innerHTML = `<button type="button" class="v-mrow v-mrow-card" id="vMoneyPfRow"><span class="v-mrow-ic v-mrow-ic-pf">${svg(IC.chart)}</span>
      <span class="v-mrow-main"><span class="v-mrow-t">พอร์ตหุ้น</span><span class="v-mrow-s">${has ? "มูลค่าตามราคาล่าสุดที่ดึงได้" : "ยังไม่มีหุ้น · แตะเพื่อเริ่ม"}</span></span>
      ${has ? `<span class="v-mrow-side"><span class="v-mrow-v v-sens">${money(pf.value)}</span>${Math.abs(pl) >= 0.5 ? `<span class="v-mrow-pl v-sens ${pl >= 0 ? "is-up" : "is-down"}">${pl >= 0 ? "+" : "−"}${money(Math.abs(pl)).replace("-", "")} (${pf.cost ? Math.abs(pl / pf.cost * 100).toFixed(1) : "0"}%)</span>` : ""}</span>` : svg(IC.chev, "v-mrow-chev")}</button>`;
    invSec.querySelector("#vMoneyPfRow").addEventListener("click", () => tap("openPortfolioBtn"));

    // หนี้และเงินให้ยืม
    const nDebt = debts.filter(d => toCents(d.outstandingBalance) > 0).length;
    const nLoan = loans.filter(l => toCents(loanOutstanding(l)) > 0).length;
    owedSec.querySelector(".v-msec-body").innerHTML = `<div class="v-mtiles">
      <button type="button" class="v-mtile" id="vMoneyDebtTile"><span class="v-mtile-k">ฉันติดคนอื่น</span><span class="v-mtile-v v-sens${debt > 0 ? " is-debt" : ""}">${money(debt)}</span><span class="v-mtile-s">${nDebt ? nDebt + " รายการ" : "ไม่มีหนี้ค้าง"}</span></button>
      <button type="button" class="v-mtile" id="vMoneyLoanTile"><span class="v-mtile-k">คนอื่นติดฉัน</span><span class="v-mtile-v v-sens">${money(owed)}</span><span class="v-mtile-s">${nLoan ? nLoan + " คน/รายการ" : "ไม่มีค้าง"}</span></button></div>`;
    owedSec.querySelector("#vMoneyDebtTile").addEventListener("click", () => tap("manageDebtsBtn"));
    owedSec.querySelector("#vMoneyLoanTile").addEventListener("click", () => tap("manageLoansBtn"));
  }
  const safeDraw = () => { try{ draw(); }catch(e){ console.error(e); } };
  const _render = render;
  render = function(){ _render.apply(this, arguments); safeDraw(); };
  // ราคาหุ้นอัปเดต → renderAccountsSummary ถูกเรียก (ไม่ผ่าน render) จึงต้องวาดตามด้วย
  const _ras = renderAccountsSummary;
  renderAccountsSummary = function(){ _ras.apply(this, arguments); safeDraw(); };
  // ปุ่ม "เงินสำรอง" (ทางลัดเดิม) ยังเลื่อนไปการ์ดเงินสำรองได้เหมือนเดิม
  safeDraw();
})();
