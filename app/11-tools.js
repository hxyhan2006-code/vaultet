// Vaultet — app/11-tools.js : รวมหมวด, กราฟแนวโน้ม, เทมเพลต, เป้าหมาย, ปุ่มลัดจำนวน, คำแนะนำ
// (แยกจาก app.js เดิม — โหลดเรียงตามเลขไฟล์ ทุกไฟล์ใช้ตัวแปร/ฟังก์ชันร่วมกันแบบ global)
async function mergeCategories(){
  const type=formType;
  const names=[...new Set([...(CATS_BY_TYPE[type]||[]),...entries.filter(e=>e.type===type&&e.category&&!e.source).map(e=>e.category)])];
  if(names.length<2){vaultetAlert("มีหมวดไม่พอให้รวม");return;}
  const cnt=n=>entries.filter(e=>e.type===type&&e.category===n&&!e.source).length;
  const opts=names.map(n=>({value:n,label:`${n} (${cnt(n)} รายการ)`}));
  const v=await vaultetForm({title:"รวมหมวด",message:"ย้ายทุกอย่างของหมวดที่เลิกใช้ ไปรวมกับอีกหมวด",okText:"ถัดไป",fields:[
    {key:"src",label:"หมวดที่จะเลิกใช้",type:"select",options:opts,value:names[0]},
    {key:"dst",label:"รวมเข้ากับหมวด",type:"select",options:opts,value:names[1],validate:(val,out)=>val===out.src?"เลือกหมวดที่ต่างจากหมวดที่เลิกใช้":""}
  ]});
  if(!v)return;
  const src=v.src,dst=v.dst;
  if(!(await vaultetAsk("รวมหมวด", `รวม "${src}" เข้ากับ "${dst}"\n• ย้าย ${cnt(src)} รายการ + งบ + รายการประจำ\n• ลบหมวด "${src}" ออกจากตัวเลือก\nยืนยันไหม? (ควร export สำรองไว้ก่อน)`, true)))return;
  entries.forEach(e=>{if(e.type===type&&e.category===src&&!e.source)e.category=dst;});
  if(typeof budgets!=="undefined"){
    budgets=budgets.filter(x=>!(x.categories.includes(src)&&budgets.some(y=>y!==x&&y.month===x.month&&y.categories.includes(dst))));
    budgets.forEach(x=>{if(x.categories.includes(src)){x.categories=Array.from(new Set(x.categories.map(c=>c===src?dst:c)));x.category=x.name||x.categories.join(" + ");}});
    saveBudgets();
  }
  if(type==="expense"){
    recurringExpenses.forEach(r=>{if(r.category===src)r.category=dst;}); saveRecurring();
    const ess=(emergencyFundConfig.essentialCategories||[]);
    if(ess.includes(src)){emergencyFundConfig.essentialCategories=[...new Set(ess.map(c=>c===src?dst:c))];saveEmergencyFundConfig();}
  }
  if(!CATS_BY_TYPE[type].includes(dst))CATS_BY_TYPE[type].push(dst);
  CATS_BY_TYPE[type]=CATS_BY_TYPE[type].filter(c=>c!==src);
  if(selectedCategory===src)selectedCategory=dst;
  saveCategories(); saveEntries();
  renderCatGrid(); render();
  showToast(`รวม "${src}" เข้า "${dst}" แล้ว`);
}
document.addEventListener("click",e=>{if(e.target.closest&&e.target.closest("#mergeCatBtn"))mergeCategories();},true);

function renderTrendCard(){
  const card=document.getElementById("trendCard");if(!card)return;
  const TH=["ม.ค.","ก.พ.","มี.ค.","เม.ย.","พ.ค.","มิ.ย.","ก.ค.","ส.ค.","ก.ย.","ต.ค.","พ.ย.","ธ.ค."];
  const now=new Date(),keys=[];
  for(let i=5;i>=0;i--){const d=new Date(now.getFullYear(),now.getMonth()-i,1);keys.push(d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0"));}
  const fm=entries.reduce((m,e)=>e.date&&(!m||e.date.slice(0,7)<m)?e.date.slice(0,7):m,"");
  const rows=keys.filter(k=>!fm||k>=fm).map(k=>{const r={k,inc:0,exp:0,sav:0,rep:0};
    entries.forEach(e=>{if(!e.date||e.date.slice(0,7)!==k)return;const a=Number(e.amount)||0;
      if(e.type==="income"){if(e.source==="loan_repayment")r.rep+=a;else if(e.category!==WITHDRAW_CAT)r.inc+=a;}
      else if(e.type==="expense")r.exp+=a;else if(e.type==="saving")r.sav+=a;});
    return r;});
  const mx=Math.max(1,...rows.flatMap(r=>[r.inc,r.exp,r.sav]));
  const W=340,base=135,top=10,gw=W/Math.max(rows.length,4),bw=14;
  const bar=(v,x,cls)=>{const h=Math.round((v/mx)*(base-top));return `<rect class="${cls}" x="${x}" y="${base-h}" width="${bw}" height="${h}" rx="3"/>`;};
  const svg=`<svg class="v-trend-svg" viewBox="0 0 ${W} 155" role="img" aria-label="กราฟรายรับ รายจ่าย และออมรายเดือน">`+rows.map((r,i)=>{const x=i*gw+(gw-bw*3-4)/2;const m=Number(r.k.slice(5))-1;
    return bar(r.inc,x,"v-tr-in")+bar(r.exp,x+bw+2,"v-tr-out")+bar(r.sav,x+2*(bw+2),"v-tr-save")+`<text class="v-tr-txt" x="${i*gw+gw/2}" y="150" text-anchor="middle" font-size="11">${TH[m]}</text>`;}).join("")+`<line class="v-tr-axis" x1="0" x2="${W}" y1="${base}" y2="${base}"/></svg>`;
  const f=n=>"฿"+Math.round(n).toLocaleString("en-US");
  const list=rows.slice().reverse().map(r=>{const m=Number(r.k.slice(5))-1;return `<div class="v-trend-row"><span class="v-trend-m">${TH[m]}</span><span class="v-tone-in">${f(r.inc)}</span><span>${f(r.exp)}</span><span class="v-tone-save">${f(r.sav)}</span></div>`;}).join("");
  const repTotal=rows.reduce((a,r)=>a+r.rep,0);
  card.innerHTML=`<div class="v-card-head"><h2 class="v-card-title">แนวโน้มรายเดือน</h2></div>
  <div class="v-trend-legend"><span><i class="v-lg v-lg-in"></i>รายรับจริง</span><span><i class="v-lg v-lg-out"></i>รายจ่าย</span><span><i class="v-lg v-lg-save"></i>ออม</span></div>${svg}
  <div class="v-trend-row v-trend-head"><span></span><span>รับจริง</span><span>จ่าย</span><span>ออม</span></div>${list}
  <div class="v-hint">รายรับจริง = ไม่รวมเงินที่คนอื่นคืนค่ายืม (รวม ${f(repTotal)} ตามรายการ "เงินคืนจากการยืม" ซึ่งเป็นเงินเดิมที่ให้ยืมไป ไม่ใช่รายได้ใหม่)</div>`;
}

(function(){
const TK="vaultet_templates_v1",GK="vaultet_goals_v1";
const jget=(k)=>{try{return JSON.parse(localStorage.getItem(k))||[]}catch(e){return[]}};
const jput=(k,v)=>{try{localStorage.setItem(k,JSON.stringify(v))}catch(e){}};
const esc2=t=>String(t).replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const num=n=>Number(n||0).toLocaleString("en-US",{maximumFractionDigits:0});
/* ===== เทมเพลต ===== */
function renderTpl(){
  const row=document.getElementById("tplRow");if(!row)return;
  const t=jget(TK), mine=t.filter(x=>x.type===formType);
  row.innerHTML=t.map((x,i)=>x.type!==formType?"":`<span class="v-chip-wrap"><button type="button" class="v-chip" data-use="${i}">${esc2(x.name)} ฿${num(x.amount)}</button><button type="button" class="v-chip-x" data-del="${i}" aria-label="ลบเทมเพลต">×</button></span>`).join("")+`<button type="button" class="v-chip v-chip-add v-manage-only" id="tplSave">+ บันทึกเป็นเทมเพลต</button>`;
  // ไม่มีเทมเพลตของประเภทนี้ → ซ่อนหัวข้อ (ปุ่มบันทึกเป็นเทมเพลตยังโผล่ในโหมดจัดการ)
  document.getElementById("tplHead").classList.toggle("v-has-none", mine.length===0);
}
document.addEventListener("click",async e=>{
  const row=document.getElementById("tplRow");if(!row||!e.target.closest||!e.target.closest("#tplRow"))return;
  const use=e.target.closest("[data-use]"),del=e.target.closest("[data-del]");
  const t=jget(TK);
  if(use){const x=t[+use.dataset.use];if(!x)return;
    selectedCategory=x.category;setFormType(x.type,true,null);
    const a=document.getElementById("amount");a.value=x.amount;a.dispatchEvent(new Event("input"));
    document.getElementById("note").value=x.note||"";
    renderCatGrid();
  }else if(del){const x=t[+del.dataset.del];if(x&&(await vaultetAsk("ลบ", `ลบเทมเพลต "${x.name}"?`, true))){t.splice(+del.dataset.del,1);jput(TK,t);renderTpl();}}
  else if(e.target.closest("#tplSave")){
    const amt=parseFloat(document.getElementById("amount").value);
    if(formType==="transfer"||!amt||amt<=0||!selectedCategory){vaultetAlert("กรอกจำนวนเงินและเลือกหมวด (รายจ่าย/รายรับ/ออม) ก่อน แล้วค่อยกดบันทึกเป็นเทมเพลต");return;}
    const note=document.getElementById("note").value.trim();
    const name=await vaultetPrompt("ชื่อเทมเพลต",note||selectedCategory,{title:"บันทึกเป็นเทมเพลต",required:true,okText:"บันทึก"});if(!name)return;
    t.push({id:Date.now().toString(36),name:name,type:formType,category:selectedCategory,amount:amt,note});
    jput(TK,t);renderTpl();showToast("บันทึกเทมเพลตแล้ว");
  }
},true);
renderTpl();
const _sft=setFormType;setFormType=function(){const r=_sft.apply(this,arguments);renderTpl();return r;};
/* ===== เป้าหมายเก็บเงิน (ระบบเดียวของแอป — AI อ่านจากที่นี่ด้วย) ===== */
function renderGoalsBox(){
  const card=document.getElementById("goalsCard");if(!card)return;
  if(!card.dataset.bound){
    card.dataset.bound="1";
    card.addEventListener("click",async ev=>{
      const g=jget(GK);
      if(ev.target.closest("#goalAdd")){
        const gv=await vaultetForm({title:"เพิ่มเป้าหมายเก็บเงิน",okText:"เพิ่ม",fields:[
          {key:"name",label:"ชื่อเป้าหมาย",required:true,placeholder:"เช่น ซื้อโน้ตบุ๊ก"},
          {key:"target",label:"ต้องการเก็บให้ได้ (บาท)",type:"number",required:true,positive:true},
          {key:"saved",label:"ตอนนี้เก็บได้แล้ว (บาท)",type:"number",value:0,min:0},
          {key:"dl",label:"วันที่อยากได้ครบ (ไม่บังคับ)",type:"date"}
        ]});
        if(!gv)return;
        g.push({id:Date.now().toString(36),name:gv.name,target:gv.target,saved:gv.saved||0,deadline:gv.dl||""});jput(GK,g);renderGoalsBox();return;}
      const add=ev.target.closest("[data-gadd]"),del=ev.target.closest("[data-gdel]");
      if(add){const x=g.find(y=>y.id===add.dataset.gadd);if(!x)return;
        const accDef=lastUsedAccountId&&accounts.some(a=>a.id===lastUsedAccountId)?lastUsedAccountId:(accounts[0]?.id||UNASSIGNED_ACCOUNT_ID);
        const gv=await vaultetForm({title:`"${x.name}"`,okText:"บันทึก",fields:[{key:"v",label:"เพิ่มเงินเก็บกี่บาท",type:"number",required:true,hint:"เงินจะออกจากบัญชีและขึ้นเป็นรายการออม ใส่ค่าติดลบถ้าจะเอาเงินออก"},
          ...(accounts.length>1?[{key:"acc",label:"บัญชี",type:"select",options:accountOptions(),value:accDef}]:[])]});
        const v=gv?Math.round(gv.v*100)/100:0;
        if(!v)return;
        const accountId=(gv.acc)||accDef, base={id:makeId(),accountId,date:todayISO(),note:"เป้าหมาย: "+x.name,goalId:x.id};
        if(v>0){ entries.unshift({...base,type:"saving",category:goalSavingCategory(),amount:v}); }
        else{
          // เอาเงินออก: ดึงจากเงินที่ผูกกับเป้าหมายก่อน (เป็นรายการถอนเงินออมกลับเข้าบัญชี) ส่วนที่เกินหักจากยอดตั้งต้นที่จดเอง
          const out=-v, linked=goalLinkedSaved(x.id), back=Math.min(out,linked), fromBase=Math.round((out-back)*100)/100;
          if(back>0){ const src=entries.find(e=>e.goalId===x.id&&e.type==="saving"); entries.unshift({...base,type:"income",category:WITHDRAW_CAT,amount:back,fromCat:(src&&src.category)||goalSavingCategory(),costBasis:back}); }
          if(fromBase>0){ x.saved=Math.max(0,(Number(x.saved)||0)-fromBase); jput(GK,g); }
        }
        saveEntries(); render(); renderGoalsBox();
      }else if(del){const x=g.find(y=>y.id===del.dataset.gdel);if(!x)return;
        const linked=goalLinkedSaved(x.id);
        if(await vaultetAsk("ลบ", `ลบเป้าหมาย "${x.name}"?`+(linked>0?` เงินที่เก็บไว้ ฿${num(linked)} ยังอยู่ในหมวดออม ถ้าจะใช้ ให้กด "+ เงิน" ใส่ค่าติดลบก่อนลบ`:""), true)){jput(GK,g.filter(y=>y.id!==x.id));render();renderGoalsBox();}}
    });
  }
  const g=jget(GK),today=new Date();today.setHours(0,0,0,0);
  const items=g.map(x=>{
    const sv=goalSaved(x),left=Math.max(0,x.target-sv),pct=Math.min(100,Math.round(sv/x.target*100));
    let info=left===0?"ครบเป้าแล้ว":"ขาดอีก ฿"+num(left);
    if(left>0&&x.deadline){const days=Math.ceil((new Date(x.deadline+"T00:00:00")-today)/86400000);
      info+=days<=0?" · เลยกำหนดแล้ว":` · เหลือ ${days} วัน ต้องเก็บวันละ ฿${num(left/days)}`+(days>=30?` (เดือนละ ฿${num(left/(days/30))})`:"");}
    return `<div class="v-brow"><div class="v-brow-top"><span class="v-brow-name">${esc2(x.name)}</span><span class="v-brow-amt">฿${num(sv)}<small> / ฿${num(x.target)}</small></span></div><div class="v-bar v-bar-sm"><i style="width:${pct}%;background:${left===0?"var(--v-accent)":"var(--v-save)"}"></i></div><div class="v-brow-meta"><span>${pct}% · ${esc2(info)}</span><span class="v-goal-actions"><button type="button" class="v-link" data-gadd="${x.id}">+ เงิน</button><button type="button" class="v-link v-link-muted" data-gdel="${x.id}" aria-label="ลบเป้าหมาย">ลบ</button></span></div></div>`;}).join("");
  card.innerHTML=`<div class="v-card-head"><h2 class="v-card-title">เป้าหมายเก็บเงิน</h2><button type="button" id="goalAdd" class="v-link">+ เพิ่ม</button></div>${items||'<div class="v-card-sub">ยังไม่มีเป้าหมาย กด "+ เพิ่ม" เพื่อตั้งเป้าแรก (เช่น ซื้อโน้ตบุ๊ก)</div>'}<div class="v-hint">กด "+ เงิน" แล้วเงินจะออกจากบัญชีไปอยู่ในเป้าหมาย ขึ้นเป็นรายการออม ยอดใช้ได้จริงลดตาม แต่สินทรัพย์รวมเท่าเดิม · AI เห็นเป้าหมายเหล่านี้ด้วย</div>`;
}
const _rt=renderTrendCard;renderTrendCard=function(){_rt();renderGoalsBox();};
// ยอดเป้าหมายมาจากรายการด้วย: แก้/ลบรายการที่ไหนก็ต้องวาดการ์ดใหม่
const _rg=render;render=function(){const r=_rg.apply(this,arguments);try{renderGoalsBox();}catch(e){console.error(e);}return r;};
})();

(function(){
const QK="vaultet_quick_amounts_v1";
const get=()=>{const r=localStorage.getItem(QK);if(r===null)return [20,50,100,500];try{const a=JSON.parse(r);return Array.isArray(a)?a:[20,50,100,500]}catch(e){return [20,50,100,500]}};
const put=a=>{try{localStorage.setItem(QK,JSON.stringify(a))}catch(e){}};
function render(){const el=document.getElementById("qaChips");if(!el)return;
  el.innerHTML=get().map((n,i)=>`<span class="v-chip-wrap"><button type="button" class="v-chip" data-qa="${n}">+${n}</button><button type="button" class="v-chip-x" data-qd="${i}" aria-label="ลบ +${n}">×</button></span>`).join("")+`<button type="button" class="v-chip v-chip-add v-manage-only" id="qaAdd">+ เพิ่มตัวเลข</button>`;}
document.addEventListener("click",async e=>{
  if(!e.target.closest)return;const box=e.target.closest("#qaChips");if(!box)return;
  const use=e.target.closest("[data-qa]"),del=e.target.closest("[data-qd]");
  if(use){const inp=document.getElementById("amount");inp.value=(toCents(parseFloat(inp.value)||0)+toCents(parseFloat(use.dataset.qa)))/100;inp.dispatchEvent(new Event("input"));}
  else if(del){const a=get();a.splice(+del.dataset.qd,1);put(a);render();}
  else if(e.target.closest("#qaAdd")){const v=await vaultetPrompt("จำนวนเงิน (บาท)","",{title:"เพิ่มปุ่มลัดจำนวนเงิน",type:"number",required:true,positive:true,placeholder:"เช่น 40",okText:"เพิ่ม"});if(!v||v<=0)return;const a=get();if(!a.includes(v)){a.push(v);a.sort((x,y)=>x-y);put(a);}render();}
},true);
render();
try{renderTrendCard();}catch(e){console.error(e);}
})();

try{const __m=sessionStorage.getItem("vaultet_restored"); if(__m){ sessionStorage.removeItem("vaultet_restored"); setTimeout(()=>{ try{ showToast(__m); }catch(e){} },700); }}catch(e){}

(function(){
  /* --- ช่องแชท auto-grow --- */
  const el=document.getElementById('aiChatInput');
  if(el){
    const grow=()=>{
      el.style.height='auto';
      const h=el.scrollHeight;
      if(h>0) el.style.height=Math.min(h,168)+'px'; /* ถ้าซ่อนอยู่ (scrollHeight=0) ปล่อย auto ไว้ ห้ามตั้ง 0 */
    };
    try{
      const d=Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value');
      Object.defineProperty(el,'value',{
        configurable:true,
        get(){ return d.get.call(this); },
        set(v){ d.set.call(this,v); grow(); }
      });
    }catch(_){}
    el.addEventListener('input',grow);
    el.addEventListener('focus',grow);
    window.addEventListener('hashchange',()=>setTimeout(grow,60),{passive:true});
    setTimeout(grow,400);
    window.addEventListener('resize',grow,{passive:true});
    grow();
  }

  /* (ถอดการขอสิทธิ์ Drive อัตโนมัติตอนแตะครั้งแรกออกแล้ว — ใช้ป้ายเตือนแทน) */
})();

(function(){
  const ACK_KEY='vaultet_advisor_ack_v1', ACK_DAYS=3;
  const baht=n=>'฿'+fmt(Math.abs(Number(n)||0));
  const num=v=>{const x=Number(v);return Number.isFinite(x)?x:0;};
  function parseEv(arr){const o={};(arr||[]).forEach(e=>{const i=String(e).indexOf('=');if(i>0)o[e.slice(0,i)]=e.slice(i+1);});return o;}
  function plain(t){return String(t||'').replace(/discretionary/gi,'ไม่จำเป็น').replace(/cash buffer/gi,'เงินสดกันชน').replace(/buffer/gi,'เงินกันชน').replace(/baseline/gi,'ระดับปกติ');}
  function ackKey(it){const d=it.data||{};return it.type+'|'+(d.category||d.name||'');}
  function loadAck(){try{const x=JSON.parse(localStorage.getItem(ACK_KEY)||'{}');return x&&typeof x==='object'?x:{};}catch(_){return {};}}
  function isAcked(it){const t=loadAck()[ackKey(it)];return !!t && (Date.now()-t)<ACK_DAYS*86400000;}
  function ack(it){try{const x=loadAck();x[ackKey(it)]=Date.now();localStorage.setItem(ACK_KEY,JSON.stringify(x));}catch(_){}}

  /* แปลง finding → ข้อความภาษาคน */
  function human(it){
    const ev=parseEv(it.evidence), d=Object.assign({},ev,it.data||{});
    const sev=it.severity==='critical'?'critical':'normal';
    let title='สิ่งที่ควรรู้', summary=plain(it.action)||'มีประเด็นที่ควรตรวจสอบ', rows=[], meter=null;
    switch(it.type){
      case 'LIQUIDITY_FORECAST':
        title='เงินสดอาจตึงตัวก่อนสิ้นเดือน';
        summary=`คาดว่าเงินที่ใช้ได้ตอนสิ้นเดือนจะเหลือ ${num(d.forecastAvailable)<0?'ติดลบ ':''}${baht(d.forecastAvailable)} หลังหักรายจ่ายที่ระบบรู้ว่ากำลังจะมา`;
        rows=[['คาดว่าเหลือสิ้นเดือน',(num(d.forecastAvailable)<0?'-':'')+baht(d.forecastAvailable)],['รายจ่ายที่กำลังจะมา',baht(d.upcoming)]];break;
      case 'MIN_BUFFER':{
        const a=num(d.available),t=num(d.target!==undefined?d.target:d.minReserveTarget);
        title='เงินกันชนต่ำกว่าที่ตั้งไว้';
        summary=`เงินสดที่ใช้ได้รวมเงินสำรองฉุกเฉิน ${baht(a)} ต่ำกว่าเป้าขั้นต่ำที่คุณตั้งไว้ ${baht(t)}${t>a?' (ขาดอีก '+baht(t-a)+')':''}`;
        rows=[['เงินที่มีอยู่ (ใช้ได้ + สำรองฉุกเฉิน)',baht(a)],['เป้าขั้นต่ำที่ตั้งไว้',baht(t)],['ส่วนที่ขาด',baht(Math.max(0,t-a))]];
        if(t>0) meter={pct:a/t,left:baht(a)+' / '+baht(t),right:t>a?'ขาดอีก '+baht(t-a):''};break;}
      case 'OBLIGATION_SHORTFALL':{
        const st=String(d.status||'');const stT=st==='overdue'?'เลยกำหนดแล้ว':st==='dueToday'?'ครบกำหนดวันนี้':'ใกล้ถึงกำหนด';
        title=`ภาระ "${d.name||'รายการ'}" ยังกันเงินไม่พอ`;
        summary=`${d.name||'รายการนี้'} ${stT} ต้องจ่าย ${baht(d.amount)} แต่เงินที่กันไว้ยังขาดอีก ${baht(d.shortfall)}`;
        rows=[['ยอดที่ต้องจ่าย',baht(d.amount)],['ที่ยังขาด',baht(d.shortfall)],['สถานะ',stT]];
        if(d.nextDueDate)rows.push(['วันครบกำหนด',String(d.nextDueDate)]);
        if(num(d.amount)>0) meter={pct:(num(d.amount)-num(d.shortfall))/num(d.amount),left:'กันไว้ '+baht(num(d.amount)-num(d.shortfall))+' / '+baht(d.amount),right:'ขาดอีก '+baht(d.shortfall)};break;}
      case 'SPENDING_ABOVE_BASELINE':
        title='รายจ่ายรวมสูงกว่าระดับปกติ';
        summary=`เดือนนี้ใช้ไปแล้ว ${baht(d.monthToDate!==undefined?d.monthToDate:d.currentExpense)} ถ้าใช้ในจังหวะนี้ต่อ สิ้นเดือนจะอยู่ราว ${baht(d.projectedMonthEnd!==undefined?d.projectedMonthEnd:d.projectedExpense)} สูงกว่าค่าเฉลี่ยปกติ ${baht(d.baseline)}`;
        rows=[['ใช้ไปแล้วเดือนนี้',baht(d.monthToDate!==undefined?d.monthToDate:d.currentExpense)],['คาดสิ้นเดือน',baht(d.projectedMonthEnd!==undefined?d.projectedMonthEnd:d.projectedExpense)],['ค่าเฉลี่ยปกติ',baht(d.baseline)]];
        if(d.differencePct!==undefined||d.pct!==undefined)rows.push(['สูงกว่าปกติ',Math.round(num(d.differencePct!==undefined?d.differencePct:d.pct))+'%']);break;
      case 'CATEGORY_SPIKE':
        title=`หมวด ${d.category||''} สูงกว่าปกติ`;
        summary=`หมวด ${d.category||''} ใช้ไปแล้ว ${baht(d.monthToDate!==undefined?d.monthToDate:d.current)} คาดสิ้นเดือนราว ${baht(d.projectedMonthEnd!==undefined?d.projectedMonthEnd:d.projected)} ปกติอยู่ที่ ${baht(d.baseline)}`;
        rows=[['ใช้ไปแล้ว',baht(d.monthToDate!==undefined?d.monthToDate:d.current)],['คาดสิ้นเดือน',baht(d.projectedMonthEnd!==undefined?d.projectedMonthEnd:d.projected)],['ค่าเฉลี่ยปกติ',baht(d.baseline)]];break;
      case 'SAVINGS_PACE':{
        const inc=num(d.regularIncome!==undefined?d.regularIncome:d.income), sv=num(d.saving);
        title='จังหวะการออมช้าลง';
        summary=`เดือนนี้ออมไป ${baht(sv)} จากรายรับ ${baht(inc)}${inc>0?' (ประมาณ '+Math.round(sv/inc*100)+'%)':''} ถ้ากระแสเงินสดยังไหวลองกันเพิ่มได้ โดยไม่ให้เงินกันชนต่ำเกินไป`;
        rows=[['รายรับ',baht(inc)],['ออมแล้ว',baht(sv)]];break;}
      case 'INCOME_BELOW_BASELINE':
        title='รายรับต่ำกว่าระดับปกติ';
        summary=`รายรับช่วงนี้ ${baht(d.current)} ต่ำกว่าค่าเฉลี่ยปกติ ${baht(d.baseline)}`;
        rows=[['รายรับช่วงนี้',baht(d.current)],['ค่าเฉลี่ยปกติ',baht(d.baseline)]];break;
    }
    return {title,summary,rows,todo:plain(it.action),sev,meter};
  }

  let items=[];
  window.vaultetRenderAdvisorPreview=function(list){
    items=(list||[]).slice(0,3);
    const target=document.getElementById('notificationPreviewList'); if(!target)return;
    if(!items.length){target.innerHTML='<div class="notification-empty">ตอนนี้ไม่มีเรื่องสำคัญที่ต้องลงมือทำ</div>';return;}
    // เรื่องแรกโชว์เต็ม (มีแท่งถ้ามีตัวเลขเทียบเป้า ไม่มีก็โชว์ข้อความสั้น) เรื่องที่เหลือเป็นแถวเล็ก
    const warnSvg='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l9.5 17h-19z"/><path d="M12 10v4M12 17.2v.01"/></svg>';
    const okSvg='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
    const chev='<svg class="v-know-chev" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>';
    target.innerHTML=items.map((it,i)=>{
      const h=human(it), acked=isAcked(it), crit=!acked&&it.severity==='critical';
      const cls='v-know-item'+(i===0?' v-know-main':'')+(acked?' is-acked':'')+(crit?' is-crit':'');
      const icon=`<span class="v-know-ic">${acked?okSvg:warnSvg}</span>`;
      let body='';
      if(i===0){
        if(h.meter){ const p=Math.max(0,Math.min(1,h.meter.pct)); body=`<div class="v-know-meter"><i style="width:${Math.round(p*100)}%"></i></div><div class="v-know-nums"><b>${escapeHtml(h.meter.left)}</b><span>${escapeHtml(h.meter.right)}</span></div>`; }
        else body=`<div class="v-know-sum">${escapeHtml(h.summary)}</div>`;
      }
      return `<div class="${cls}" data-adv-idx="${i}" role="button" tabindex="0"><div class="v-know-top">${icon}<span class="v-know-title">${escapeHtml(h.title)}</span>${i===0?'':chev}</div>${body}</div>`;
    }).join('');
  };

  function closeSheet(){document.getElementById('advDetailOverlay')?.remove();}
  function openSheet(i){
    const it=items[i]; if(!it)return; const h=human(it); closeSheet();
    const ov=document.createElement('div'); ov.id='advDetailOverlay';
    const rowsHtml=h.rows.length?`<div class="adv-h">ตัวเลขที่เกี่ยวข้อง</div>`+h.rows.map(r=>`<div class="adv-row"><span>${escapeHtml(r[0])}</span><span>${escapeHtml(r[1])}</span></div>`).join(''):'';
    const acked=isAcked(it);
    ov.innerHTML=`<div class="adv-sheet" role="dialog" aria-modal="true"><span class="adv-chip ${h.sev}">${h.sev==='critical'?'สำคัญมาก':'ควรดู'}</span><h3 class="adv-title">${escapeHtml(h.title)}</h3><p class="adv-summary">${escapeHtml(h.summary)}</p>${rowsHtml}${h.todo?`<div class="adv-h">ควรทำอะไร</div><div class="adv-todo">${escapeHtml(h.todo)}</div>`:''}<div class="adv-actions"><button type="button" class="adv-ack">${acked?'รับทราบแล้ว':'รับทราบ'}</button><button type="button" class="adv-close">ปิด</button></div><div class="adv-note">กดรับทราบแล้วการ์ดจะเป็นสีเทา และจะกลับมาเตือนอีกถ้าเรื่องนี้ยังอยู่หลังผ่านไป ${ACK_DAYS} วัน</div></div>`;
    ov.addEventListener('click',e=>{if(e.target===ov)closeSheet();});
    ov.querySelector('.adv-close').addEventListener('click',closeSheet);
    ov.querySelector('.adv-ack').addEventListener('click',()=>{ack(it);closeSheet();window.vaultetRenderAdvisorPreview(items);try{showToast('รับทราบแล้ว');}catch(_){}});
    document.body.appendChild(ov);
  }
  document.addEventListener('click',e=>{
    const el=e.target.closest&&e.target.closest('#notificationPreviewList [data-adv-idx]');
    if(el)openSheet(Number(el.dataset.advIdx));
  });
  document.addEventListener('keydown',e=>{
    if(e.key!=='Enter'&&e.key!==' ')return;
    const el=e.target.closest&&e.target.closest('#notificationPreviewList [data-adv-idx]');
    if(el){e.preventDefault();openSheet(Number(el.dataset.advIdx));}
  });

  try{ if(typeof renderVaultetNotifications==='function') renderVaultetNotifications(); }catch(_){}
})();

/* ===== Cold Start ของแชท AI: เริ่มห้องแชทใหม่เฉพาะตอนเปิดแอปครั้งแรกของเซสชันเบราว์เซอร์ =====
   - sessionStorage 'vaultet_app_session_active' ยังไม่มี = เปิดแอปใหม่ (ปิดแท็บ/เบราว์เซอร์แล้วเปิดใหม่)
   - สลับแท็บภายในแอปไม่เรียก createNewChat() เด็ดขาด; ห้องใหม่ระหว่างใช้งานสร้างได้จากปุ่ม "+ แชทใหม่" เท่านั้น */
(window.__vaultetAiPatches=window.__vaultetAiPatches||[]).push(function(){
  try{
    if(sessionStorage.getItem('vaultet_app_session_active')) return;
    sessionStorage.setItem('vaultet_app_session_active','1');
    const cur=(typeof getActiveChat==='function')?getActiveChat():null;
    if(cur&&cur.messages&&cur.messages.length&&typeof createNewChat==='function'){
      createNewChat();
      if(typeof renderAiChatBubbles==='function'){ try{ renderAiChatBubbles(); }catch(_){} }
    }
  }catch(e){ console.error(e); }
});

// (AI) pruneEmptyChats() ย้ายไปรันท้าย ai.js
