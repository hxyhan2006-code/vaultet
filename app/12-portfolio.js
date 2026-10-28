// Vaultet — app/12-portfolio.js : พอร์ตหุ้น และส่วนเสริมท้ายสุด
// (แยกจาก app.js เดิม — โหลดเรียงตามเลขไฟล์ ทุกไฟล์ใช้ตัวแปร/ฟังก์ชันร่วมกันแบบ global)
(function(){
  const INVEST_CAT='ลงทุน';
  const PF_OPEN_KEY='vaultet_portfolio_open_v1';
  const PF_PRICE_KEY='vaultet_pf_prices_v1';
  const PF_APIKEY_KEY='finance_tracker_twelvedata_key_v1';
  const DIRTY_DAY_KEY='vaultet_dirty_notice_day_v1';
  const SYNCED_HASH_KEY='vaultet_drive_synced_hash_v1';
  const DIRTY_DISMISSED_KEY='vaultet_dirty_dismissed_date';
  const PF_SELL_KEY='vaultet_portfolio_sells_v1';
  try{ [PF_PRICE_KEY,PF_APIKEY_KEY,DIRTY_DAY_KEY,SYNCED_HASH_KEY,DIRTY_DISMISSED_KEY].forEach(k=>VAULTET_BACKUP_EXCLUDED_KEYS.add(k)); }catch(_){}

  const lsGet=k=>{try{return localStorage.getItem(k);}catch(_){return null;}};
  const lsSet=(k,v)=>{try{localStorage.setItem(k,v);return true;}catch(_){return false;}};
  const esc=s=>escapeHtml(String(s==null?'':s));

  /*PF-PURE-START*/
  function pfNum(v){ const x=parseFloat(v); return Number.isFinite(x)?x:null; }
  function pfParseQuotes(json,tickers){
    const out={}, errs=[];
    if(!json||typeof json!=='object'){ errs.push('ไม่มีข้อมูลตอบกลับ'); return {out,errs}; }
    if(json.status==='error' && !tickers.some(t=>json[t])){ errs.push(json.message||('error '+json.code)); return {out,errs}; }
    const map=(tickers.length===1 && !json[tickers[0]]) ? {[tickers[0]]:json} : json;
    tickers.forEach(t=>{
      const q=map[t];
      if(!q||q.status==='error'||(typeof q.code==='number'&&q.code>=400)){ errs.push(t+': '+((q&&q.message)||'ไม่พบข้อมูล')); return; }
      const price=pfNum(q.close!==undefined?q.close:q.price);
      if(price===null||price<=0){ errs.push(t+': ไม่มีราคา'); return; }
      out[t]={price,prev:pfNum(q.previous_close),pct:pfNum(q.percent_change)};
    });
    return {out,errs};
  }
  function pfComputeHoldings(lots,quotes,fx){
    const rows=[];
    Object.keys(lots).forEach(t=>{
      const L=lots[t];
      const shares=L.reduce((s,l)=>s+l.shares,0), cost=L.reduce((s,l)=>s+l.cost,0);
      const q=(quotes&&quotes[t])||null, price=q?q.price:null;
      const valueUSD=price!==null?shares*price:null;
      const valueTHB=(valueUSD!==null&&fx>0)?valueUSD*fx:null;
      const plTHB=valueTHB!==null?valueTHB-cost:null;
      const plPct=(plTHB!==null&&cost>0)?plTHB/cost*100:null;
      const dayTHB=(q&&q.prev&&fx>0)?shares*(price-q.prev)*fx:null;
      rows.push({ticker:t,shares,cost,avgCost:shares>0?cost/shares:0,price,pct:q?q.pct:null,prev:q?q.prev:null,manual:!!(q&&q.manual),at:q?q.at:null,valueUSD,valueTHB,plTHB,plPct,dayTHB,lots:L});
    });
    const priced=rows.filter(r=>r.valueTHB!==null);
    const sum=(a,f)=>a.reduce((s,r)=>s+f(r),0);
    const value=sum(priced,r=>r.valueTHB), costPriced=sum(priced,r=>r.cost), costAll=sum(rows,r=>r.cost);
    const dayRows=rows.filter(r=>r.dayTHB!==null);
    const dayTHB=sum(dayRows,r=>r.dayTHB), dayBase=sum(dayRows,r=>r.valueTHB-r.dayTHB);
    const total={value,valueUSD:fx>0?value/fx:null,costAll,costPriced,pl:value-costPriced,plPct:costPriced>0?(value-costPriced)/costPriced*100:null,dayTHB:dayRows.length?dayTHB:null,dayPct:dayBase>0?dayTHB/dayBase*100:null,unpriced:rows.filter(r=>r.valueTHB===null).map(r=>r.ticker)};
    rows.forEach(r=>{ r.alloc=(total.value>0&&r.valueTHB!==null)?r.valueTHB/total.value*100:null; });
    return {rows,total};
  }
  function pfFmtMoney(n,d){ if(n===null||n===undefined||!Number.isFinite(n)) return '—'; const dec=d!==undefined?d:(Math.abs(n)<1000?2:0); return n.toLocaleString('en-US',{minimumFractionDigits:dec,maximumFractionDigits:dec}); }
  function pfFmtShares(n){ return (Math.round(n*1e7)/1e7).toString(); }
  function pfSign(n){ return n>0?'+':(n<0?'−':''); }
  /*PF-PURE-END*/

  /* ---------- ข้อมูล ---------- */
  function getOpen(){ try{ const a=JSON.parse(lsGet(PF_OPEN_KEY)||'[]'); return Array.isArray(a)?a:[]; }catch(_){ return []; } }
  function setOpen(a){ lsSet(PF_OPEN_KEY,JSON.stringify(a)); try{ renderAccountsSummary(); }catch(_){} }
  function getSells(){ try{ const a=JSON.parse(lsGet(PF_SELL_KEY)||'[]'); return Array.isArray(a)?a:[]; }catch(_){ return []; } }
  function setSells(a){ lsSet(PF_SELL_KEY,JSON.stringify(a)); }
  function lotsByTicker(){
    const m={}; const add=(t,l)=>{ (m[t]=m[t]||[]).push(l); };
    getOpen().forEach(o=>{ if(o&&o.ticker&&Number(o.shares)>0) add(String(o.ticker).toUpperCase(),{kind:'open',id:o.id,date:o.date||'',shares:Number(o.shares),cost:Number(o.cost)||0}); });
    entries.forEach(e=>{ if(e.type==='saving'&&e.ticker&&Number(e.shares)>0) add(String(e.ticker).toUpperCase(),{kind:'buy',id:e.id,date:e.date,shares:Number(e.shares),cost:Number(e.amount)||0}); });
    getSells().forEach(x=>{ const t=String(x.ticker||'').toUpperCase(); if(m[t]) m[t].push({kind:'sell',id:x.id,date:x.date||'',shares:-Number(x.shares),cost:-Number(x.cost)||0,proceeds:Number(x.proceeds)||0}); });
    Object.keys(m).forEach(t=>{ if(m[t].reduce((q,l)=>q+l.shares,0)<=1e-7) delete m[t]; });
    return m;
  }
  window.vaultetPortfolioSummary=function(){
    const c=readCache(), fx=c.fx?c.fx.rate:null, r=pfComputeHoldings(lotsByTicker(),c.quotes,fx);
    return {value:r.rows.reduce((q,x)=>q+(x.valueTHB!==null?x.valueTHB:x.cost),0),cost:r.total.costAll};
  };
  function realized(){ return getSells().reduce((q,x)=>q+(Number(x.proceeds)||0)-(Number(x.cost)||0),0); }
  // ข้อมูลพอร์ตแบบย่อสำหรับส่งให้ AI (ไม่มีคีย์/ข้อมูลลับ) — ว่างถ้ายังไม่มีหุ้น
  window.vaultetPortfolioForAI=function(){
    const c=readCache(), fx=c.fx?c.fx.rate:null, r=pfComputeHoldings(lotsByTicker(),c.quotes,fx);
    const un=untagged();
    if(!r.rows.length && !un.count) return null;
    const rd=(n,d)=>{ if(n===null||n===undefined||!Number.isFinite(n)) return null; const k=Math.pow(10,d===undefined?2:d); return Math.round(n*k)/k; };
    return {
      note:'priceUSD = ราคาต่อหุ้นเป็นดอลลาร์; costTHB/valueTHB/plTHB เป็นบาท; ต้นทุนมาจากรายการออม/ลงทุนที่ระบุหุ้นและจำนวนหุ้น รวมยอดยกมา; plPct เป็นเปอร์เซ็นต์',
      fxUSDTHB:rd(fx,2),
      pricesUpdatedAt:c.fetchedAt?new Date(c.fetchedAt).toISOString().slice(0,16):null,
      holdings:r.rows.map(x=>({ticker:x.ticker,shares:rd(x.shares,6),costTHB:rd(x.cost,0),avgCostTHB:rd(x.avgCost,2),priceUSD:rd(x.price,2),valueTHB:rd(x.valueTHB,0),plTHB:rd(x.plTHB,0),plPct:rd(x.plPct,1),allocationPct:rd(x.alloc,1)})),
      totals:{valueTHB:rd(r.total.value,0),costTHB:rd(r.total.costAll,0),plTHB:rd(r.total.pl,0),plPct:rd(r.total.plPct,1)},
      realizedPLTHB:rd(realized(),0),
      untaggedInvestments:un.count?{count:un.count,totalTHB:rd(un.total,0)}:null
    };
  };
  function untagged(){
    const list=entries.filter(e=>e.type==='saving'&&e.category===INVEST_CAT&&!(e.ticker&&Number(e.shares)>0));
    return {count:list.length,total:list.reduce((s,e)=>s+(Number(e.amount)||0),0)};
  }
  function readCache(){ try{ const c=JSON.parse(lsGet(PF_PRICE_KEY)||'{}'); return {fx:c.fx||null,quotes:c.quotes||{},fetchedAt:c.fetchedAt||0,error:c.error||''}; }catch(_){ return {fx:null,quotes:{},fetchedAt:0,error:''}; } }
  function writeCache(c){ lsSet(PF_PRICE_KEY,JSON.stringify(c)); try{ renderAccountsSummary(); }catch(_){} }
  const fmtTime=ms=>{ try{ return new Date(ms).toLocaleString('th-TH',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}); }catch(_){ return ''; } };

  /* ---------- ดึงราคา ---------- */
  let busy=false;
  async function getJson(url){ const r=await fetch(url,{cache:'no-store'}); if(!r.ok) throw new Error('HTTP '+r.status); return r.json(); }
  const errMsg=e=>{ const m=String(e&&e.message||e); return /Failed to fetch|NetworkError|Load failed/i.test(m)?'เชื่อมต่อไม่ได้ (เน็ตหลุด หรือเบราว์เซอร์บล็อก)':m; };
  async function refreshPrices(){
    const key=lsGet(PF_APIKEY_KEY), tickers=Object.keys(lotsByTicker());
    if(!tickers.length) return {ok:false,reason:'no_holdings'};
    if(!key) return {ok:false,reason:'no_key'};
    if(busy) return {ok:false,reason:'busy'};
    busy=true; spin(true);
    const cache=readCache(), errs=[];
    try{
      const j=await getJson('https://api.twelvedata.com/quote?symbol='+encodeURIComponent(tickers.join(','))+'&apikey='+encodeURIComponent(key));
      const r=pfParseQuotes(j,tickers);
      Object.keys(r.out).forEach(t=>{ cache.quotes[t]=Object.assign({},r.out[t],{at:Date.now(),manual:false}); });
      r.errs.forEach(x=>errs.push(x));
    }catch(e){ errs.push('ราคาหุ้น: '+errMsg(e)); }
    try{
      const f=await getJson('https://api.twelvedata.com/exchange_rate?symbol=USD/THB&apikey='+encodeURIComponent(key));
      const rate=pfNum(f&&f.rate); if(rate>0) cache.fx={rate,at:Date.now()}; else throw new Error((f&&f.message)||'no rate');
    }catch(e1){
      try{
        const g=await getJson('https://open.er-api.com/v6/latest/USD'); const rate=pfNum(g&&g.rates&&g.rates.THB);
        if(rate>0) cache.fx={rate,at:Date.now()}; else throw new Error('no rate');
      }catch(e2){ errs.push('เรต USD/THB: '+errMsg(e2)); }
    }
    cache.fetchedAt=Date.now(); cache.error=errs.join(' · ');
    writeCache(cache); busy=false; spin(false); render();
    return {ok:!errs.length,errors:errs};
  }

  /* ---------- UI ---------- */
  let sortBy='value'; const expanded=new Set();
  const overlay=document.createElement('div'); overlay.id='pfOverlay';
  overlay.innerHTML=`<div class="pf-top"><button type="button" class="pf-iconbtn" id="pfClose" aria-label="ปิด">✕</button><div class="pf-title">พอร์ตหุ้น</div><button type="button" class="pf-iconbtn" id="pfRefresh" aria-label="รีเฟรชราคา">↻</button></div><div class="pf-body" id="pfBody"></div><div class="pf-bottom"><button type="button" id="pfAddOpen">ยอดยกมา</button><button type="button" class="primary" id="pfAddBuy">+ บันทึกการซื้อ</button></div><div id="pfOpenSheet"><div class="box"><h3>ยอดยกมา</h3><p>หุ้นที่ซื้อไว้ก่อนหน้านี้ กรอกครั้งเดียวต่อหุ้น (ถือรวมกี่หุ้น จ่ายไปรวมกี่บาท) ไม่ต้องไล่แก้รายการเก่าทีละอัน</p><label>ชื่อหุ้น/ETF</label><input id="pfOpTicker" type="text" placeholder="เช่น QQQM" autocapitalize="characters" autocomplete="off"><label>จำนวนหุ้นที่ถืออยู่</label><input id="pfOpShares" type="number" inputmode="decimal" step="any" min="0" placeholder="เช่น 0.0295991"><label>ต้นทุนรวมที่จ่ายไป (บาท)</label><input id="pfOpCost" type="number" inputmode="decimal" step="any" min="0" placeholder="เช่น 100"><div class="btns"><button type="button" id="pfOpCancel">ยกเลิก</button><button type="button" class="ok" id="pfOpSave">บันทึก</button></div></div></div>`;
  document.body.appendChild(overlay);
  const body=()=>document.getElementById('pfBody');
  function spin(on){ const b=document.getElementById('pfRefresh'); if(b) b.classList.toggle('spin',!!on); }
  const colorFor=t=>{ let h=0; for(const c of t) h=(h*31+c.charCodeAt(0))%360; return `hsl(${h},48%,38%)`; };
  const cls=n=>n>0?'pos':(n<0?'neg':'mut');

  function render(){
    if(!overlay.classList.contains('open')) return;
    const cache=readCache(), lots=lotsByTicker(), fx=cache.fx?cache.fx.rate:null;
    const {rows,total}=pfComputeHoldings(lots,cache.quotes,fx);
    const key=lsGet(PF_APIKEY_KEY), un=untagged();
    let h='';
    if(!rows.length){
      h+=`<div class="pf-empty">ยังไม่มีหุ้นในพอร์ต<br>1) กด <b>+ บันทึกการซื้อ</b> เลือกหมวด “ลงทุน” แล้วใส่ชื่อหุ้นกับจำนวนหุ้น<br>2) หุ้นที่ซื้อไว้ก่อนหน้า กด <b>ยอดยกมา</b> กรอกครั้งเดียวพอ</div>`;
    }else{
      const upd=cache.fetchedAt?('อัปเดต '+fmtTime(cache.fetchedAt)):'ยังไม่เคยดึงราคา';
      h+=`<div class="pf-sum"><div class="pf-sum-label">มูลค่าพอร์ตทั้งหมด (${esc(upd)})</div><div class="pf-sum-big">${fx?'฿'+pfFmtMoney(total.value):'—'}</div>`;
      h+=`<div class="pf-sum-sub">${total.valueUSD!==null?'≈ $'+pfFmtMoney(total.valueUSD,2)+' USD':'ยังไม่มีเรต USD/THB'}${fx?' · 1 USD = '+pfFmtMoney(fx,2)+' THB':''}</div>`;
      h+=`<div class="pf-sum-line"><span class="mut">ต้นทุนรวม</span><b>฿${pfFmtMoney(total.costAll)}</b></div>`;
      h+=`<div class="pf-sum-line"><span class="mut">% เปลี่ยนแปลงจากวันก่อน</span><b class="${cls(total.dayPct)}">${total.dayPct!==null?pfSign(total.dayPct)+pfFmtMoney(Math.abs(total.dayPct),2)+'%':'—'}</b></div>`;
      h+=`<div class="pf-sum-line"><span class="mut">กำไร/ขาดทุนที่ยังไม่ขาย</span><b class="${cls(total.pl)}">${total.plPct!==null?pfSign(total.pl)+pfFmtMoney(Math.abs(total.plPct),2)+'% ('+pfSign(total.pl)+'฿'+pfFmtMoney(Math.abs(total.pl))+')':'—'}</b></div></div>`;
      if(getSells().length){ const rz=realized(); h+=`<div class="pf-sum-line"><span class="mut">กำไร/ขาดทุนที่ขายแล้ว</span><b class="${cls(rz)}">${pfSign(rz)}฿${pfFmtMoney(Math.abs(rz))}</b></div>`; }
      if(total.unpriced.length) h+=`<div class="pf-warn">ยังไม่มีราคาของ ${esc(total.unpriced.join(', '))} ${key?'· กด ↻ ดึงราคาใหม่ หรือแตะหุ้นแล้วใส่ราคาเอง':'· ใส่ API key ด้านล่างเพื่อให้ดึงราคาอัตโนมัติ'}</div>`;
      const sorted=[...rows].sort((a,b)=>{
        if(sortBy==='plpct') return (b.plPct??-1e9)-(a.plPct??-1e9);
        if(sortBy==='ticker') return a.ticker.localeCompare(b.ticker);
        return (b.valueTHB??-1)-(a.valueTHB??-1);
      });
      h+=`<div class="pf-tools"><span>${rows.length} สินทรัพย์</span><label>เรียงตาม <select id="pfSort"><option value="value"${sortBy==='value'?' selected':''}>มูลค่า</option><option value="plpct"${sortBy==='plpct'?' selected':''}>กำไร %</option><option value="ticker"${sortBy==='ticker'?' selected':''}>ชื่อ</option></select></label></div>`;
      sorted.forEach(r=>{
        const open=expanded.has(r.ticker);
        h+=`<div class="pf-row" data-t="${esc(r.ticker)}"><div class="pf-badge" style="background:${colorFor(r.ticker)}">${esc(r.ticker.slice(0,3))}</div><div><div class="pf-t">${esc(r.ticker)}</div><div class="pf-alloc">${r.alloc!==null?'◔ '+pfFmtMoney(r.alloc,2)+'%':'ยังไม่มีราคา'}</div></div><div class="pf-r"><div class="pf-v">${r.valueTHB!==null?'฿'+pfFmtMoney(r.valueTHB):'—'}</div><div class="pf-vs">${r.valueUSD!==null?'≈ $'+pfFmtMoney(r.valueUSD,2):''}</div>${r.plPct!==null?`<div class="pf-vs ${cls(r.plTHB)}">${pfSign(r.plTHB)}${pfFmtMoney(Math.abs(r.plPct),2)}% (${pfSign(r.plTHB)}฿${pfFmtMoney(Math.abs(r.plTHB))})</div>`:''}</div></div>`;
        h+=`<div class="pf-detail${open?' open':''}" data-d="${esc(r.ticker)}"><div class="pf-grid"><div><div class="pf-k">จำนวนหุ้นคงเหลือ</div><div class="pf-kv">${pfFmtShares(r.shares)}</div></div><div><div class="pf-k">ราคา (USD)${r.manual?' · ใส่เอง':''}</div><div class="pf-kv">${r.price!==null?pfFmtMoney(r.price,2):'—'}</div>${r.pct!==null?`<div class="${cls(r.pct)}" style="font-size:13px">${pfSign(r.pct)}${pfFmtMoney(Math.abs(r.pct),2)}% วันนี้</div>`:''}</div><div><div class="pf-k">ต้นทุนเฉลี่ยต่อหุ้น (฿)</div><div class="pf-kv">${pfFmtMoney(r.avgCost,2)}</div></div><div><div class="pf-k">ต้นทุนรวม (฿)</div><div class="pf-kv">${pfFmtMoney(r.cost)}</div></div></div>`;
        h+=`<div class="pf-lots"><div class="pf-k" style="margin-bottom:2px">ประวัติการซื้อ</div>${[...r.lots].sort((a,b)=>String(b.date).localeCompare(String(a.date))).map(l=>`<div class="pf-lot"><span>${esc(l.date||'—')} · ${l.kind==='open'?'ยอดยกมา':(l.kind==='sell'?'ขาย':'ซื้อ')}</span><span>${pfFmtShares(l.shares)} หุ้น · ฿${pfFmtMoney(l.cost)}</span><button type="button" data-lot="${l.kind}" data-id="${esc(l.id)}">${l.kind==='open'?'ลบ':(l.kind==='sell'?'ลบ':'แก้ไข')}</button></div>`).join('')}</div>`;
        h+=`<div class="pf-actions"><button type="button" data-manual="${esc(r.ticker)}">ใส่ราคาเอง</button><button type="button" data-sell="${esc(r.ticker)}">ขาย</button><button type="button" data-buy="${esc(r.ticker)}">+ ซื้อเพิ่ม</button></div></div>`;
      });
    }
    if(un.count>0) h+=`<div class="pf-note">มีรายการหมวด “ลงทุน” ที่ยังไม่ระบุหุ้น ${un.count} รายการ (รวม ฿${pfFmtMoney(un.total)}) ยังไม่นับในพอร์ต ใช้ปุ่ม <b>ยอดยกมา</b> ใส่ทีเดียวแทนการแก้ทีละรายการ ถ้าใส่แล้วยอดเงินออมในหน้าแรกไม่เปลี่ยน เพราะพอร์ตนี้เป็นมุมมองแยก</div>`;
    h+=`<div class="pf-note">ราคามาจาก Twelve Data (ฟรี) อาจดีเลย์ 1–15 นาที ไม่ใช่เรียลไทม์ · ตัวเลขอาจคลาดจากแอปโบรกเกอร์เล็กน้อยเพราะค่าธรรมเนียมและเรต</div>`;
    if(cache.error) h+=`<div class="pf-warn">ดึงราคาไม่สำเร็จบางส่วน: ${esc(cache.error)}</div>`;
    if(!key) h+=`<div class="pf-note">ใส่ Twelve Data API key ได้ที่ ตั้งค่า → ราคาหุ้น เพื่อให้ดึงราคาอัตโนมัติ</div>`;
    body().innerHTML=h;
  }

  function openPf(){
    overlay.classList.add('open'); render();
    const c=readCache(); if(lsGet(PF_APIKEY_KEY) && Object.keys(lotsByTicker()).length && Date.now()-c.fetchedAt>20*60*1000) refreshPrices();
  }
  function closePf(){ overlay.classList.remove('open'); }

  overlay.addEventListener('click',async e=>{
    const t=e.target;
    if(t.closest('#pfClose')) return closePf();
    if(t.closest('#pfRefresh')){ refreshPrices().then(r=>{ if(r&&r.reason==='no_key') showToast('ใส่ API key ด้านล่างก่อน'); else if(r&&r.reason==='no_holdings') showToast('ยังไม่มีหุ้นในพอร์ต'); else if(r&&r.ok) showToast('อัปเดตราคาแล้ว'); }); return; }
    if(t.closest('#pfAddBuy')) return startBuy('');
    if(t.closest('#pfAddOpen')){ document.getElementById('pfOpenSheet').classList.add('open'); return; }
    if(t.closest('#pfOpCancel')){ document.getElementById('pfOpenSheet').classList.remove('open'); return; }
    if(t.closest('#pfOpSave')){
      const tk=(document.getElementById('pfOpTicker').value||'').trim().toUpperCase().replace(/[^A-Z0-9.\-]/g,'');
      const sh=pfNum(document.getElementById('pfOpShares').value), co=pfNum(document.getElementById('pfOpCost').value);
      if(!tk||!(sh>0)||co===null||co<0){ showToast('กรอกชื่อหุ้น จำนวนหุ้น และต้นทุนให้ครบ'); return; }
      const a=getOpen(); a.push({id:makeId(),ticker:tk,shares:sh,cost:co,date:todayISO()}); setOpen(a);
      ['pfOpTicker','pfOpShares','pfOpCost'].forEach(id=>document.getElementById(id).value='');
      document.getElementById('pfOpenSheet').classList.remove('open'); render();
      if(lsGet(PF_APIKEY_KEY)) refreshPrices(); return;
    }
    if(t.closest('#pfKeySave')){
      const v=(document.getElementById('pfKeyInput').value||'').trim();
      if(!v){ showToast('วาง API key ก่อน'); return; }
      lsSet(PF_APIKEY_KEY,v); showToast('บันทึก key แล้ว'); render(); refreshPrices(); return;
    }
    const manual=t.closest('[data-manual]');
    if(manual){
      const tk=manual.dataset.manual, c=readCache(), cur=c.quotes[tk]?c.quotes[tk].price:'';
      const v=await vaultetPrompt('ราคาต่อหุ้น (USD)',cur,{title:'ราคาของ '+tk,type:'number',required:true,positive:true,okText:'บันทึกราคา'});
      const p=v===null?0:pfNum(String(v)); if(p>0){ c.quotes[tk]={price:p,prev:null,pct:null,at:Date.now(),manual:true}; writeCache(c); render(); }
      return;
    }
    const buy=t.closest('[data-buy]'); if(buy) return startBuy(buy.dataset.buy);
    const lot=t.closest('[data-lot]');
    if(lot){
      if(lot.dataset.lot==='sell'){ delSell(lot.dataset.id); } else if(lot.dataset.lot==='open'){ if((await vaultetAsk("ลบ", 'ลบยอดยกมานี้ใช่ไหม?', true))){ setOpen(getOpen().filter(o=>o.id!==lot.dataset.id)); render(); } }
      else{ const en=entries.find(x=>x.id===lot.dataset.id); if(en) openForm(en); }
      return;
    }
    const row=t.closest('.pf-row');
    if(row){ const tk=row.dataset.t; if(expanded.has(tk)) expanded.delete(tk); else expanded.add(tk); render(); }
  });
  overlay.addEventListener('change',e=>{ if(e.target&&e.target.id==='pfSort'){ sortBy=e.target.value; render(); } });

  const keyIn=document.getElementById('pfKeyInput2'), keySt=document.getElementById('pfKeyStatus2');
  const updKeySt=()=>{ if(keySt) keySt.textContent=lsGet(PF_APIKEY_KEY)?'ตั้งค่าแล้ว':'ยังไม่ได้ตั้งค่า'; }; updKeySt();
  document.getElementById('pfKeySave2')?.addEventListener('click',()=>{ const v=(keyIn.value||'').trim(); if(!v){ showToast('วาง API key ก่อน'); return; } lsSet(PF_APIKEY_KEY,v); keyIn.value=''; updKeySt(); showToast('บันทึก key แล้ว'); if(Object.keys(lotsByTicker()).length) refreshPrices(); });
  document.getElementById('pfKeyDel2')?.addEventListener('click',()=>{ try{ localStorage.removeItem(PF_APIKEY_KEY); }catch(_){} updKeySt(); showToast('ลบ key แล้ว'); });
  /* ---- ขายหุ้น ---- */
  const sell=document.createElement('div'); sell.id='pfSellSheet';
  sell.innerHTML='<div class="pf-sell-card"><div class="pf-sell-h" id="pfSellH">ขายหุ้น</div><label>จำนวนหุ้นที่ขาย</label><input id="pfSellSh" type="number" inputmode="decimal" step="any"><label>เงินบาทที่ได้รับ</label><input id="pfSellAmt" type="number" inputmode="decimal" step="any"><label>เข้าบัญชี</label><select id="pfSellAcc"></select><div class="pf-sell-act"><button type="button" id="pfSellCancel">ยกเลิก</button><button type="button" id="pfSellOk">บันทึกขาย</button></div></div>';
  overlay.appendChild(sell); let sellT='';
  function openSell(t){ const L=lotsByTicker()[t]; if(!L) return; sellT=t; const sh=L.reduce((q,l)=>q+l.shares,0);
    document.getElementById('pfSellH').textContent='ขาย '+t+' (ถืออยู่ '+pfFmtShares(sh)+' หุ้น)';
    document.getElementById('pfSellSh').value=''; document.getElementById('pfSellAmt').value='';
    document.getElementById('pfSellAcc').innerHTML=accounts.map(a=>'<option value="'+esc(a.id)+'">'+esc(a.name)+'</option>').join('');
    sell.classList.add('open'); }
  async function delSell(id){ if(!(await vaultetAsk("ลบ", 'ลบรายการขายนี้? รายรับที่เกี่ยวข้องจะถูกลบด้วย', true))) return; const a=getSells(), x=a.find(q=>q.id===id); setSells(a.filter(q=>q.id!==id));
    if(x&&x.entryId){ const i=entries.findIndex(e=>e.id===x.entryId); if(i>-1){ entries.splice(i,1); saveEntries(); } }
    render(); try{ renderAccountsSummary(); }catch(_){} }
  overlay.addEventListener('click',e=>{
    const b=e.target.closest('[data-sell]'); if(b) return openSell(b.dataset.sell);
    if(e.target.closest('#pfSellCancel')) return sell.classList.remove('open');
    if(!e.target.closest('#pfSellOk')) return;
    const L=lotsByTicker()[sellT]; if(!L) return; const sh=L.reduce((q,l)=>q+l.shares,0), cost=L.reduce((q,l)=>q+l.cost,0);
    const n=pfNum(document.getElementById('pfSellSh').value), amt=pfNum(document.getElementById('pfSellAmt').value), acc=document.getElementById('pfSellAcc').value;
    if(!(n>0)||n>sh+1e-9||!(amt>0)||!acc){ showToast('กรอกจำนวนหุ้น (ไม่เกินที่ถือ) เงินที่ได้ และบัญชีให้ครบ'); return; }
    const red=Math.round(cost*Math.min(1,n/sh)*100)/100;
    const res=commitEntry({type:'income',category:WITHDRAW_CAT,amount:amt,date:todayISO(),note:'ขายหุ้น '+sellT,accountId:acc});
    if(!res||!res.ok){ showToast('บันทึกไม่สำเร็จ: '+((res&&res.error)||'')); return; }
    res.entry.fromCat=INVEST_CAT; res.entry.costBasis=red; res.entry.sellTicker=sellT; saveEntries();
    const a=getSells(); a.push({id:makeId(),ticker:sellT,date:todayISO(),shares:n,proceeds:amt,cost:red,entryId:res.entry.id}); setSells(a);
    sell.classList.remove('open'); render(); try{ renderAccountsSummary(); }catch(_){} showToast('บันทึกการขายแล้ว');
  });
  function startBuy(ticker){
    openForm(null);
    try{ setFormType('saving'); selectedCategory=INVEST_CAT; orphanCategory=null; renderCatGrid(); }catch(_){}
    const tk=document.getElementById('investTicker'); if(tk) tk.value=ticker||'';
    syncInvestFields();
  }

  /* ---------- ฟอร์มบันทึก: ช่องหุ้นเมื่อเลือกหมวดลงทุน ---------- */
  const block=document.createElement('div'); block.id='investFields'; block.style.display='none';
  block.innerHTML=`<label class="field-label">หุ้น/ETF ที่ซื้อ</label><input id="investTicker" type="text" placeholder="เช่น QQQM" autocapitalize="characters" autocomplete="off"><label class="field-label">จำนวนหุ้นที่ได้ (ดูจากแอปโบรกเกอร์)</label><input id="investShares" type="number" inputmode="decimal" step="any" min="0" placeholder="เช่น 0.0295991"><div class="invest-hint">ไม่ใส่ก็ได้ แต่รายการนี้จะไม่นับในพอร์ต · ช่อง “จำนวนเงิน” ด้านบนคือเงินบาทที่จ่ายจริง</div>`;
  const grid=document.getElementById('catGrid'); if(grid) grid.insertAdjacentElement('afterend',block);
  function syncInvestFields(){ block.style.display=(formType==='saving'&&selectedCategory===INVEST_CAT)?'block':'none'; }
  const _rcg=renderCatGrid; renderCatGrid=function(){ _rcg.apply(this,arguments); syncInvestFields(); };
  const _of=openForm; openForm=function(entry){
    _of.apply(this,arguments);
    const tk=document.getElementById('investTicker'), sh=document.getElementById('investShares');
    if(tk) tk.value=(entry&&entry.ticker)?entry.ticker:''; if(sh) sh.value=(entry&&entry.shares)?entry.shares:'';
    syncInvestFields();
  };
  const _cf=closeForm; closeForm=function(){ _cf.apply(this,arguments); setTimeout(render,0); };
  const sb=document.getElementById('submitBtn');
  if(sb) sb.addEventListener('click',function(e){
    window.__vaultetInvestExtra=null;
    if(!(formType==='saving'&&selectedCategory===INVEST_CAT)) return;
    const tk=(document.getElementById('investTicker').value||'').trim().toUpperCase().replace(/[^A-Z0-9.\-]/g,'');
    const raw=(document.getElementById('investShares').value||'').trim(), sh=pfNum(raw);
    if(!tk&&!raw){ window.__vaultetInvestExtra={ticker:'',shares:null}; return; }
    if(!tk||!(sh>0)){ e.stopImmediatePropagation(); e.preventDefault(); showToast('ใส่ชื่อหุ้นกับจำนวนหุ้นให้ครบ หรือเว้นว่างทั้งสองช่อง'); return; }
    window.__vaultetInvestExtra={ticker:tk,shares:sh};
  },true);
  const _ce=commitEntry; commitEntry=function(payload){
    const extra=window.__vaultetInvestExtra; window.__vaultetInvestExtra=null;
    const res=_ce.apply(this,arguments);
    try{
      if(res&&res.ok&&res.entry&&res.entry.type==='saving'){
        const en=res.entry; let changed=false;
        if(en.category===INVEST_CAT&&extra){
          if(extra.ticker&&extra.shares>0){ en.ticker=extra.ticker; en.shares=extra.shares; changed=true; }
          else if('ticker' in en||'shares' in en){ delete en.ticker; delete en.shares; changed=true; }
        }else if(en.category!==INVEST_CAT&&('ticker' in en||'shares' in en)){ delete en.ticker; delete en.shares; changed=true; }
        if(changed) saveEntries();
      }
    }catch(_){}
    return res;
  };

  /* ---------- ปุ่มหน้าแรก: งบ → พอร์ตหุ้น ---------- */
  document.getElementById('openPortfolioBtn')?.addEventListener('click',openPf);

  /* ---------- ดึงราคาเองตอนเปิดแอป (ถ้าราคาล่าสุดเก่าเกิน 20 นาที) ---------- */
  setTimeout(()=>{
    try{
      const c=readCache();
      if(lsGet(PF_APIKEY_KEY) && Object.keys(lotsByTicker()).length && Date.now()-c.fetchedAt>20*60*1000) refreshPrices();
    }catch(_){}
  },2500);

  /* ---------- เตือนเมื่อมีข้อมูลที่ยังไม่ได้สำรองขึ้น Drive ---------- */
  function coreHash(){
    const o={entries,categories:CATS_BY_TYPE,accounts,reservedItems,loans,recurringExpenses,debts,budgets,emergencyFundConfig,pf:(lsGet(PF_OPEN_KEY)||'')+(lsGet(PF_SELL_KEY)||'')};
    return vaultetSha256(JSON.stringify(o));
  }
  const _up=gdriveUploadBackup;
  gdriveUploadBackup=async function(){
    let h=null; try{ h=coreHash(); }catch(_){}
    const r=await _up.apply(this,arguments);
    if(h) lsSet(SYNCED_HASH_KEY,h);
    try{ renderDirty(); }catch(_){}
    return r;
  };
  const bn=document.createElement('div'); bn.className='backup-banner dd'; bn.id='driveDirtyBanner';
  const anchor=document.getElementById('backupBanner'); if(anchor) anchor.insertAdjacentElement('afterend',bn);
  /* สถานะข้อมูลค้างซิงก์: ไม่เด้งแบนเนอร์หลังบันทึกแบบเรียลไทม์อีกต่อไป
     - ระหว่างวัน: แสดงจุดไฟเล็กๆ ที่ปุ่มตั้งค่า (#settingsBtn) แทน
     - แบนเนอร์: แสดงได้สูงสุดวันละครั้ง ตอนเปิดแอปครั้งแรกของวัน และถ้ากด ✕ จะไม่แสดงอีกทั้งวัน */
  function isDirty(){
    try{
      const clientId=lsGet(GDRIVE_CLIENT_ID_KEY), fileId=lsGet(GDRIVE_FILE_ID_KEY);
      if(!(clientId&&fileId)) return false;
      const tokenOk=!!(gdriveAccessToken&&Date.now()<gdriveAccessTokenExpiry), auto=lsGet(GDRIVE_AUTOSYNC_KEY)==='1';
      if(tokenOk&&auto) return false;
      return lsGet(SYNCED_HASH_KEY)!==coreHash();
    }catch(_){ return false; }
  }
  function updateDirtyDot(dirty){
    const btn=document.getElementById('settingsBtn'); if(!btn) return;
    let dot=btn.querySelector('.dirty-dot');
    if(dirty&&!dot){
      try{ if(getComputedStyle(btn).position==='static') btn.style.position='relative'; }catch(_){}
      dot=document.createElement('i'); dot.className='dirty-dot'; dot.setAttribute('aria-hidden','true');
      dot.style.cssText='position:absolute;top:6px;right:6px;width:8px;height:8px;border-radius:50%;background:#e9c46a;box-shadow:0 0 0 2px var(--bg,#111);pointer-events:none;display:block';
      btn.appendChild(dot);
    }
    if(dot) dot.style.display=dirty?'block':'none';
    if(dirty) btn.setAttribute('title','มีข้อมูลที่ยังไม่ได้สำรองขึ้น Google Drive'); else btn.removeAttribute('title');
  }
  function renderDirty(){
    const dirty=isDirty();
    updateDirtyDot(dirty);
    if(!dirty) bn.classList.remove('show');
  }
  function maybeShowDirtyBanner(){
    const today=todayISO();
    if(lsGet(DIRTY_DAY_KEY)===today) return; // เช็กไปแล้ววันนี้ = ไม่ใช่การเปิดแอปครั้งแรกของวัน
    lsSet(DIRTY_DAY_KEY,today);
    if(lsGet(DIRTY_DISMISSED_KEY)===today) return;
    if(!isDirty()) return;
    bn.classList.add('show','first');
    bn.innerHTML=`<span><b>มีข้อมูลที่ยังไม่ได้สำรองขึ้น Google Drive</b><small>กดสำรองเลย หน้าต่าง Google จะแวบขึ้นมาแป๊บเดียว</small></span>`
      +`<span style="display:flex;gap:6px;align-items:center"><button type="button" id="ddNow">สำรองเลย</button><button type="button" class="dismiss" id="ddX" aria-label="ปิด">✕</button></span>`;
  }
  bn.addEventListener('click',e=>{
    if(e.target.closest('#ddX')){ lsSet(DIRTY_DISMISSED_KEY,todayISO()); bn.classList.remove('show'); return; }
    if(e.target.closest('#ddNow')){ Promise.resolve(runGDriveSync(false)).then(()=>renderDirty()).catch(()=>{}); }
  });
  let dt=null; const later=ms=>{ clearTimeout(dt); dt=setTimeout(()=>{ try{renderDirty();}catch(_){} },ms); };
  try{
    const _si=localStorage.setItem.bind(localStorage), _ri=localStorage.removeItem.bind(localStorage);
    localStorage.setItem=function(k,v){ const r=_si(k,v); try{ if(shouldBackupLocalStorageKey(String(k))) later(6000); }catch(_){} return r; };
    localStorage.removeItem=function(k){ const r=_ri(k); try{ if(shouldBackupLocalStorageKey(String(k))) later(6000); }catch(_){} return r; };
  }catch(_){}
  document.addEventListener('visibilitychange',()=>{ if(document.visibilityState==='visible'){ later(1500); setTimeout(()=>{ try{maybeShowDirtyBanner();}catch(_){} },1600); } });
  setTimeout(()=>{ try{ renderDirty(); maybeShowDirtyBanner(); }catch(_){} },2500);
})();

(function(){
  const cb=document.getElementById('pfClose');
  if(cb) cb.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>';
  const b=document.getElementById('pfRefresh');
  if(b) b.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-2.64-6.36"/><path d="M21 3v6h-6"/></svg>';
  /* การขายหุ้นหักจากหมวดลงทุนด้วยต้นทุน ไม่ไปหักเงินสำรองฉุกเฉิน */
  getSavedByCategory=function(){
    const m={}, tg={}; let w=0;
    entries.forEach(e=>{
      if(e.type==='saving'){ const c=e.category||'อื่นๆ'; m[c]=(m[c]||0)+toCents(e.amount); }
      else if(e.type==='income'&&e.category===WITHDRAW_CAT){
        if(e.fromCat&&e.costBasis!=null) tg[e.fromCat]=(tg[e.fromCat]||0)+toCents(e.costBasis); else w+=toCents(e.amount);
      }
    });
    Object.keys(tg).forEach(k=>{ if(m[k]!=null) m[k]=Math.max(0,m[k]-tg[k]); });
    Object.keys(m).sort((a,b)=>(b.includes('สำรอง')?1:0)-(a.includes('สำรอง')?1:0)).forEach(k=>{ const d=Math.min(m[k],w); m[k]-=d; w-=d; });
    Object.keys(m).forEach(k=>m[k]/=100);
    return m;
  };
  try{ renderAccountsSummary(); }catch(_){}
})();

(function(){
  const J=(k,d)=>{try{const x=JSON.parse(localStorage.getItem(k)||'');return x==null?d:x;}catch(_){return d;}};
  const r2=n=>Math.round((Number(n)||0)*100)/100;
  const ym=d=>String(d||'').slice(0,7);
  function pfData(){
    const lots={}, add=(t,sh,c)=>{const l=lots[t]=lots[t]||{shares:0,cost:0};l.shares+=sh;l.cost+=c;};
    J('vaultet_portfolio_open_v1',[]).forEach(o=>{if(o&&o.ticker&&+o.shares>0)add(String(o.ticker).toUpperCase(),+o.shares,+o.cost||0);});
    const buys=entries.filter(e=>e.type==='saving'&&e.ticker&&+e.shares>0);
    buys.forEach(e=>add(String(e.ticker).toUpperCase(),+e.shares,+e.amount||0));
    let realized=0;
    J('vaultet_portfolio_sells_v1',[]).forEach(x=>{const t=String(x.ticker||'').toUpperCase(); if(lots[t]){lots[t].shares-=+x.shares;lots[t].cost-=+x.cost||0;} realized+=(+x.proceeds||0)-(+x.cost||0);});
    const pc=J('vaultet_pf_prices_v1',{}), fx=pc.fx&&pc.fx.rate>0?pc.fx.rate:null, q=pc.quotes||{};
    const hs=[]; let val=0,cost=0;
    Object.keys(lots).forEach(t=>{const L=lots[t]; if(L.shares<=1e-7)return; const p=q[t]&&q[t].price; const v=(p&&fx)?L.shares*p*fx:null;
      hs.push({ticker:t,shares:r2(L.shares*1e4)/1e4,costTHB:r2(L.cost),avgCostTHB:r2(L.cost/L.shares),priceUSD:p||null,valueTHB:v==null?null:r2(v),plTHB:v==null?null:r2(v-L.cost),plPct:(v!=null&&L.cost>0)?r2((v-L.cost)/L.cost*100):null}); cost+=L.cost; if(v!=null)val+=v;});
    hs.forEach(h=>{h.allocPct=(val>0&&h.valueTHB!=null)?r2(h.valueTHB/val*100):null;});
    const m={}; buys.forEach(e=>{const k=ym(e.date); m[k]=m[k]||{month:k,count:0,amountTHB:0}; m[k].count++; m[k].amountTHB+=+e.amount||0;});
    const months=Object.values(m).sort((a,b)=>a.month<b.month?1:-1).slice(0,6);
    const nowM=ym(todayISO());
    return {hs,val,cost,realized,fx,asOf:pc.fetchedAt?new Date(pc.fetchedAt).toISOString().slice(0,16).replace('T',' '):null,months,thisMonth:m[nowM]||{month:nowM,count:0,amountTHB:0}};
  }
  /* ---------- AI: ใส่พอร์ต + รายการล่าสุดเข้า context ---------- */
  (window.__vaultetAiPatches=window.__vaultetAiPatches||[]).push(function(){
  const origPrompt=buildFinancialAnalystSystemPrompt;
  buildFinancialAnalystSystemPrompt=function(snapshot,profile){
    let base=origPrompt(snapshot,profile), extra='';
    try{
      const d=pfData();
      extra='\n\nข้อมูลเพิ่มเติมจากแอป (ใช้อ้างอิงได้ตามจริง ห้ามเดาเกินจากนี้):\n'
       +'พอร์ตหุ้น (หน่วยบาท ต้นทุนคือเงินบาทที่จ่ายจริงตามที่ผู้ใช้บันทึก ราคาเป็น USD): '+JSON.stringify({fxUSDTHB:d.fx,priceAsOf:d.asOf,holdings:d.hs,totalValueTHB:r2(d.val),totalCostTHB:r2(d.cost),unrealizedPLTHB:r2(d.val-d.cost),realizedPLTHB:r2(d.realized),dcaThisMonth:d.thisMonth,dcaLast6Months:d.months})+'\n'
       +'แนวทางเมื่อคุยเรื่องหุ้น/การลงทุน: ใช้ตัวเลขพอร์ตจริงของผู้ใช้ คุยเรื่องวินัย DCA การกระจายความเสี่ยง (เช่น สัดส่วนหุ้นตัวเดียว ความผันผวน) ผลของค่าเงินบาท/ดอลลาร์ และเทียบกับเงินสำรองฉุกเฉิน หนี้ และกระแสเงินสดของผู้ใช้ ห้ามทำนายราคา ห้ามฟันธงให้ซื้อหรือขายหุ้นตัวใดตัวหนึ่ง ไม่มีข่าวหรือราคาเรียลไทม์ ถ้าราคาในข้อมูลเก่าให้บอกวันที่ และตัวเลขกำไรอาจคลาดจากแอปโบรกเกอร์เล็กน้อย ถ้าอ้างความรู้ทั่วไปเกี่ยวกับตัวหุ้น/กองทุน ให้บอกว่าเป็นความรู้ทั่วไป อาจไม่เป็นปัจจุบัน';
    }catch(e){}
    return base+extra;
  };
  });
  /* ---------- DCA เดือนนี้ ในหน้าพอร์ต ---------- */
  function injectDca(){
    const body=document.getElementById('pfBody'); if(!body||body.querySelector('.pf-dca'))return;
    const tools=body.querySelector('.pf-tools'); if(!tools)return;
    const t=pfData().thisMonth, prev=pfData().months.find(x=>x.month!==t.month);
    const d=document.createElement('div'); d.className='pf-dca';
    d.innerHTML='<span>DCA เดือนนี้</span><span><b>'+t.count+' ครั้ง · ฿'+Math.round(t.amountTHB).toLocaleString('en-US')+'</b>'+(prev?' <span class="mut">(เดือนก่อน '+prev.count+' ครั้ง · ฿'+Math.round(prev.amountTHB).toLocaleString('en-US')+')</span>':'')+'</span>';
    tools.parentNode.insertBefore(d,tools);
  }
  new MutationObserver(()=>injectDca()).observe(document.body,{childList:true,subtree:true});
  /* ---------- กู้ข้อมูลจาก Drive ตอนแอปว่าง ---------- */
  async function findBackup(){
    const token=await requestGDriveToken('');
    const q=encodeURIComponent("name='"+GDRIVE_BACKUP_FILENAME+"' and trashed=false");
    const r=await fetch('https://www.googleapis.com/drive/v3/files?q='+q+'&fields=files(id,modifiedTime,size)&pageSize=20',{headers:{Authorization:'Bearer '+token}});
    if(!r.ok)throw new Error('list_'+r.status);
    const fs=(await r.json()).files||[]; if(!fs.length)return null;
    fs.sort((a,b)=>(+b.size||0)-(+a.size||0)); const f=fs[0];
    const d=await fetch('https://www.googleapis.com/drive/v3/files/'+f.id+'?alt=media',{headers:{Authorization:'Bearer '+token}});
    if(!d.ok)throw new Error('dl_'+d.status);
    return {id:f.id,data:await d.json(),n:fs.length};
  }
  function showRestoreBar(){
    if(document.getElementById('vaultRestoreBar'))return;
    const b=document.createElement('div'); b.id='vaultRestoreBar';
    b.innerHTML='<span>ข้อมูลในแอปว่างอยู่ — กู้คืนจาก Google Drive ไหม?</span><button class="go" type="button">กู้คืน</button><button class="x" type="button">✕</button>';
    b.querySelector('.x').onclick=()=>{b.remove();try{sessionStorage.setItem('vaultet_restore_bar_x','1');}catch(_){}};
    b.querySelector('.go').onclick=async()=>{
      try{
        const r=await findBackup();
        if(!r){showToast('ไม่พบไฟล์สำรองใน Drive');return;}
        localStorage.setItem(GDRIVE_FILE_ID_KEY,r.id); b.remove();
        promptRestore(r.data,'Google Drive');
      }catch(e){showToast('กู้คืนจาก Drive ไม่สำเร็จ');}
    };
    document.body.appendChild(b);
  }
  setTimeout(()=>{try{
    if(sessionStorage.getItem('vaultet_restore_bar_x'))return;
    if(entries.length===0&&accounts.filter(a=>a.name!=='ไม่ระบุบัญชี').length===0&&localStorage.getItem(GDRIVE_CLIENT_ID_KEY))showRestoreBar();
  }catch(_){}},1600);
})();
