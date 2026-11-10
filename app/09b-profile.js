// Vaultet — app/09b-profile.js : โปรไฟล์ของฉัน (ฟอร์ม, เป้าหมายเดิม→แผน, การ์ดโปรไฟล์ในหน้าเงินของฉัน/ตั้งค่า) แยกจาก 09-nav-home.js เดิม โหลดต่อจาก 09 ทันที
(function(){
  const KEY='vaultet_user_profile_v1';
  const DEFAULT={firstName:'',lastName:'',nickname:'',age:null,statuses:[],occupation:'',workType:'',education:'',location:'',monthlyIncomeEstimate:null,minReserveTarget:null,financialGoals:[],notes:'',personalContext:'',priorities:[],habits:'',aiHelp:'',permissions:{identity:true,life:true,financial:true,personal:true,memory:true}};
  function read(){try{const x=JSON.parse(localStorage.getItem(KEY)||'null');return Object.assign({},DEFAULT,x||{}, {permissions:Object.assign({},DEFAULT.permissions,(x&&x.permissions)||{})});}catch(e){return Object.assign({},DEFAULT);}}
  function write(x){try{
    const payload=Object.assign({},DEFAULT,x||{}, {permissions:Object.assign({},DEFAULT.permissions,(x&&x.permissions)||{})});
    localStorage.setItem(KEY,JSON.stringify(payload));
    const verified=JSON.parse(localStorage.getItem(KEY)||'null');
    return !!verified && JSON.stringify(verified)===JSON.stringify(payload);
  }catch(e){return false}}
  function esc(v){return typeof escapeHtml==='function'?escapeHtml(String(v||'')):String(v||'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));}
  function profile(){return read();}
  window.vaultetUserProfile={read,write,KEY};
  // ---- เป้าหมาย: ระบบเดียว = เป้าหมายเก็บเงินในแท็บแผน (vaultet_goals_v1) ----
  const PLAN_GOALS_KEY='vaultet_goals_v1', GOALS_MERGED_FLAG='vaultet_goals_merged_v1', LEGACY_AI_PROFILE_KEY='finance_tracker_ai_profile_v1';
  function readPlanGoals(){try{const g=JSON.parse(localStorage.getItem(PLAN_GOALS_KEY)||'[]');return Array.isArray(g)?g:[];}catch(e){return [];}}
  function planGoalsForAI(){return readPlanGoals().filter(x=>x&&x.name).map(x=>({id:x.id,name:x.name,targetAmount:Number(x.target)||0,saved:goalSaved(x),deadline:x.deadline||null}));}
  window.vaultetPlanGoals=planGoalsForAI;
  // ย้ายเป้าหมายเก่าจากโปรไฟล์มารวมในแท็บแผนครั้งเดียว (ไม่ซ้ำ ไม่หาย): ลบจากโปรไฟล์เฉพาะเมื่อเขียนฝั่งแผนสำเร็จและตรวจแล้ว
  function migrateProfileGoalsToPlan(){
    try{
      if(localStorage.getItem(GOALS_MERGED_FLAG)) return;
      const p=read(); let lg=null; try{lg=JSON.parse(localStorage.getItem(LEGACY_AI_PROFILE_KEY)||'null');}catch(e){}
      const old=[...(p.financialGoals||[]),...((lg&&Array.isArray(lg.financialGoals))?lg.financialGoals:[])];
      const plan=readPlanGoals(); let added=0;
      old.forEach(g=>{
        if(!g||!g.name) return;
        const tgt=Number(g.targetAmount!=null?g.targetAmount:g.target)||0; if(tgt<=0) return;
        const dup=plan.some(x=>String(x.name).trim().toLowerCase()===String(g.name).trim().toLowerCase()&&Math.round(Number(x.target))===Math.round(tgt));
        if(dup) return;
        plan.push({id:(g.id?String(g.id):Date.now().toString(36))+'m'+added,name:String(g.name),target:tgt,saved:Number(g.saved)||0,deadline:g.deadline||''}); added++;
      });
      if(added){
        localStorage.setItem(PLAN_GOALS_KEY,JSON.stringify(plan));
        const back=readPlanGoals(); if(back.length!==plan.length) return; // เขียนไม่สำเร็จ: ไม่แตะของเดิม ลองใหม่รอบหน้า
      }
      if((p.financialGoals||[]).length){ p.financialGoals=[]; if(!write(p)) return; }
      if(lg&&Array.isArray(lg.financialGoals)&&lg.financialGoals.length){ lg.financialGoals=[]; localStorage.setItem(LEGACY_AI_PROFILE_KEY,JSON.stringify(lg)); }
      localStorage.setItem(GOALS_MERGED_FLAG,'1');
      if(added){ setTimeout(()=>{ try{renderTrendCard();}catch(e){} },0); }
    }catch(e){ console.error(e); }
  }
  migrateProfileGoalsToPlan();
  // Upgrade the existing AI profile storage without breaking existing data.
  (window.__vaultetAiPatches=window.__vaultetAiPatches||[]).push(function(){
  const oldLoad=window.loadAIProfile;
  window.loadAIProfile=function(){
    const canonicalRaw=localStorage.getItem(KEY);
    const base=oldLoad?oldLoad():null;
    if(!canonicalRaw){ if(base) base.financialGoals=planGoalsForAI(); return base || null; }
    const p=read();
    const q=p.permissions||DEFAULT.permissions;
    const out={};
    // Canonical rule: when vaultet_user_profile_v1 exists, it is authoritative.
    // Never fall back field-by-field to the legacy AI profile, otherwise an intentional
    // blank value could resurrect stale data from finance_tracker_ai_profile_v1.
    if(q.identity){out.nickname=p.nickname||'';out.firstName=p.firstName||'';out.lastName=p.lastName||'';out.age=p.age??null;} else {out.nickname='';out.firstName='';out.lastName='';out.age=null;}
    if(q.life){out.statuses=Array.isArray(p.statuses)?p.statuses:[];out.occupation=p.occupation||'';out.workType=p.workType||'';out.education=p.education||'';out.location=p.location||'';} else {out.statuses=[];out.occupation='';out.workType='';out.education='';out.location='';}
    if(q.financial){out.monthlyIncomeEstimate=p.monthlyIncomeEstimate??null;out.minReserveTarget=p.minReserveTarget??null;out.financialGoals=planGoalsForAI();} else {out.monthlyIncomeEstimate=null;out.minReserveTarget=null;out.financialGoals=[];}
    if(q.personal){out.notes=p.notes||'';out.personalContext=p.personalContext||'';out.priorities=Array.isArray(p.priorities)?p.priorities:[];out.habits=p.habits||'';out.aiHelp=p.aiHelp||'';} else {out.notes='';out.personalContext='';out.priorities=[];out.habits='';out.aiHelp='';}
    out.permissions=q;
    // Deterministically mirror the canonical profile into the legacy key for compatibility.
    if(typeof saveAIProfile==='function') saveAIProfile({nickname:out.nickname,monthlyIncomeEstimate:out.monthlyIncomeEstimate,minReserveTarget:out.minReserveTarget,financialGoals:[],notes:[out.notes,out.personalContext,out.habits,out.aiHelp].filter(Boolean).join(' | '),userProfile:p});
    return out;
  };
  });
  function summary(p){const name=p.nickname||[p.firstName,p.lastName].filter(Boolean).join(' ')||'โปรไฟล์ของฉัน';const life=p.statuses?.length?p.statuses.join(' · '):(p.occupation||'ตั้งค่าโปรไฟล์');return {name,life};}
  function refreshTrigger(){const b=document.getElementById('uxProfileTrigger');if(!b)return;const p=profile(),s=summary(p);b.querySelector('strong').textContent=s.name;b.querySelector('span').textContent=s.life;}
  function paintPhoto(){
    const big=document.querySelector('#vaultetProfileOverlay .profile-big-avatar'),photo=window.vaultetProfilePhoto.get();
    const pick=document.getElementById('vpPhotoPick'),clr=document.getElementById('vpPhotoClear');
    if(pick) pick.textContent=photo?'เปลี่ยนรูป':'เลือกรูป'; if(clr) clr.hidden=!photo;
    if(!big) return;
    if(photo){ if(!big.querySelector('img')) big.innerHTML='<img alt="">'; const im=big.firstChild; if(im.src!==photo) im.src=photo; }
    else if(big.querySelector('img')) big.innerHTML='<svg class="v-ic" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 20c1.5-4 4.5-6 8-6s6.5 2 8 6"/></svg>';
  }
  document.addEventListener('vaultet-avatar-changed',paintPhoto);
  function open(){const p=profile();paintPhoto();
    const ov=document.getElementById('vaultetProfileOverlay'); if(!ov)return;
    const set=(id,v)=>{const e=document.getElementById(id);if(e)e.value=v??''};
    set('vpFirst',p.firstName);set('vpLast',p.lastName);set('vpNick',p.nickname);set('vpAge',p.age);set('vpOccupation',p.occupation);set('vpWorkType',p.workType);set('vpEducation',p.education);set('vpLocation',p.location);set('vpIncome',p.monthlyIncomeEstimate);set('vpReserve',p.minReserveTarget);set('vpNotes',p.notes);set('vpContext',p.personalContext);set('vpHabits',p.habits);set('vpHelp',p.aiHelp);
    document.querySelectorAll('[data-vp-status]').forEach(x=>x.checked=(p.statuses||[]).includes(x.value));
    document.querySelectorAll('[data-vp-priority]').forEach(x=>x.checked=(p.priorities||[]).includes(x.value));
    document.querySelectorAll('[data-vp-perm]').forEach(x=>x.checked=p.permissions[x.dataset.vpPerm]!==false);
    ov.classList.add('open');
  }
  function save(){const old=profile();const val=id=>document.getElementById(id)?.value?.trim()||'';const num=id=>{const n=parseFloat(document.getElementById(id)?.value);return Number.isFinite(n)&&n>=0?n:null};
    const p=Object.assign({},old,{firstName:val('vpFirst'),lastName:val('vpLast'),nickname:val('vpNick'),age:num('vpAge'),occupation:val('vpOccupation'),workType:val('vpWorkType'),education:val('vpEducation'),location:val('vpLocation'),monthlyIncomeEstimate:num('vpIncome'),minReserveTarget:num('vpReserve'),notes:val('vpNotes'),personalContext:val('vpContext'),habits:val('vpHabits'),aiHelp:val('vpHelp'),statuses:[...document.querySelectorAll('[data-vp-status]:checked')].map(x=>x.value),priorities:[...document.querySelectorAll('[data-vp-priority]:checked')].map(x=>x.value),permissions:Object.fromEntries([...document.querySelectorAll('[data-vp-perm]')].map(x=>[x.dataset.vpPerm,x.checked]))});
    p.financialGoals=[]; // เป้าหมายอยู่ที่แท็บแผนแล้ว (ระบบเดียว)
    if(!write(p)){ if(typeof showToast==='function')showToast('บันทึกโปรไฟล์ไม่สำเร็จ — พื้นที่จัดเก็บอาจเต็ม'); return; }
    // Keep the legacy AI profile key in sync only after the canonical write succeeds.
    if(typeof saveAIProfile==='function') saveAIProfile({nickname:p.nickname||[p.firstName,p.lastName].filter(Boolean).join(' '),monthlyIncomeEstimate:p.monthlyIncomeEstimate,minReserveTarget:p.minReserveTarget,financialGoals:[],notes:[p.notes,p.personalContext,p.habits,p.aiHelp].filter(Boolean).join(' | '),userProfile:p});
    refreshTrigger(); if(typeof refreshAIProfileStatus==='function')refreshAIProfileStatus(); if(typeof refreshProactiveCard==='function')refreshProactiveCard(true); document.getElementById('vaultetProfileOverlay')?.classList.remove('open'); if(typeof showToast==='function')showToast('บันทึกโปรไฟล์แล้ว');
  }
  function build(){
    const ov=document.createElement('div');ov.id='vaultetProfileOverlay';ov.className='profile-overlay';ov.innerHTML=`<div class="profile-sheet" role="dialog" aria-modal="true" aria-label="โปรไฟล์ของฉัน"><div class="profile-head"><div class="profile-big-avatar"><svg class="v-ic" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 20c1.5-4 4.5-6 8-6s6.5 2 8 6"/></svg></div><div><h2>โปรไฟล์ของฉัน</h2><p>ข้อมูลนี้ช่วยให้ Vaultet และ AI เข้าใจคุณมากขึ้น</p></div><button class="icon-btn profile-close" id="vpClose" aria-label="ปิด">✕</button></div><div class="profile-photo-row"><button type="button" class="v-btn v-btn-quiet" id="vpPhotoPick">เลือกรูป</button><button type="button" class="v-btn v-btn-text" id="vpPhotoClear">ลบรูป</button><input type="file" id="vpPhotoFile" accept="image/*" hidden></div><div class="profile-grid">
      <section class="profile-card"><h3>ตัวตน</h3><div class="profile-fields two"><label><span class="profile-label">ชื่อ</span><input class="profile-input" id="vpFirst" placeholder="ชื่อจริง"></label><label><span class="profile-label">นามสกุล</span><input class="profile-input" id="vpLast" placeholder="นามสกุล"></label><label><span class="profile-label">ชื่อที่อยากให้เรียก</span><input class="profile-input" id="vpNick" placeholder="เช่น กอล์ฟ"></label><label><span class="profile-label">อายุ</span><input class="profile-input" id="vpAge" type="number" min="0" max="120" inputmode="numeric" placeholder="ปี"></label></div></section>
      <section class="profile-card"><h3>ชีวิตตอนนี้</h3><div class="profile-checks"><label class="profile-check"><input type="checkbox" data-vp-status value="นักเรียน">นักเรียน</label><label class="profile-check"><input type="checkbox" data-vp-status value="นักศึกษา">นักศึกษา</label><label class="profile-check"><input type="checkbox" data-vp-status value="ทำงาน">ทำงาน</label><label class="profile-check"><input type="checkbox" data-vp-status value="Freelance">Freelance</label><label class="profile-check"><input type="checkbox" data-vp-status value="ธุรกิจส่วนตัว">ธุรกิจส่วนตัว</label></div><div class="profile-fields two" style="margin-top:9px"><label><span class="profile-label">อาชีพ / งาน</span><input class="profile-input" id="vpOccupation" placeholder="เช่น Developer"></label><label><span class="profile-label">รูปแบบงาน</span><input class="profile-input" id="vpWorkType" placeholder="Full-time / Part-time"></label><label><span class="profile-label">การศึกษา</span><input class="profile-input" id="vpEducation" placeholder="มหาวิทยาลัย / คณะ"></label><label><span class="profile-label">พื้นที่ที่อยู่ (ไม่บังคับ)</span><input class="profile-input" id="vpLocation" placeholder="จังหวัด / ประเทศ"></label></div></section>
      <section class="profile-card"><h3>การเงิน</h3><div class="profile-fields two"><label><span class="profile-label">รายได้ประมาณต่อเดือน</span><input class="profile-input" id="vpIncome" type="number" min="0" inputmode="decimal" placeholder="บาท"></label><label><span class="profile-label">เงินสำรองขั้นต่ำ</span><input class="profile-input" id="vpReserve" type="number" min="0" inputmode="decimal" placeholder="บาท"></label></div><p class="hint" style="margin-top:12px">เป้าหมายเก็บเงินอยู่ที่แท็บ "แผน" (มียอดที่เก็บแล้วและวันที่ต้องการ) AI เห็นเป้าหมายเหล่านั้นด้วย</p><button type="button" class="profile-save" id="vpGoalsLink" style="margin-top:9px;background:var(--surface);color:var(--ink);border:1px solid var(--line)">ไปที่เป้าหมายเก็บเงิน</button><p class="hint" style="margin-top:9px">ข้อมูลบัญชีและธุรกรรมจริงยังอยู่ในระบบการเงินเดิม และ AI ใช้ประกอบคำแนะนำได้ตามสิทธิ์ที่ตั้งไว้</p></section>
      <section class="profile-card"><h3>สิ่งสำคัญสำหรับฉัน</h3><div class="profile-checks"><label class="profile-check"><input type="checkbox" data-vp-priority value="ความมั่นคง">ความมั่นคง</label><label class="profile-check"><input type="checkbox" data-vp-priority value="เก็บเงิน">เก็บเงิน</label><label class="profile-check"><input type="checkbox" data-vp-priority value="ลงทุน">ลงทุน</label><label class="profile-check"><input type="checkbox" data-vp-priority value="ท่องเที่ยว">ท่องเที่ยว</label><label class="profile-check"><input type="checkbox" data-vp-priority value="ครอบครัว">ครอบครัว</label></div></section>
      <section class="profile-card full"><h3>ให้ AI รู้จักฉัน</h3><p class="hint">ใส่บริบทที่ช่วยให้คำแนะนำเข้ากับชีวิตจริงของคุณ เช่น นิสัย เป้าหมายระยะยาว หรือสิ่งที่อยากให้ AI ช่วย</p><div class="profile-fields"><label><span class="profile-label">เกี่ยวกับฉัน</span><textarea class="profile-textarea" id="vpContext" placeholder="เช่น กำลังเรียนและทำงานพาร์ตไทม์ ปีนี้อยากเก็บเงินไปเที่ยว..."></textarea></label><label><span class="profile-label">นิสัยการใช้เงิน</span><textarea class="profile-textarea" id="vpHabits" placeholder="เช่น เวลาเครียดมักซื้อของออนไลน์..."></textarea></label><label><span class="profile-label">สิ่งที่อยากให้ AI ช่วย</span><textarea class="profile-textarea" id="vpHelp" placeholder="เช่น ช่วยเตือนเมื่อใช้เงินเกิน และช่วยวางแผนก่อนสิ้นเดือน..."></textarea></label><label><span class="profile-label">ข้อจำกัด / หมายเหตุทางการเงิน</span><textarea class="profile-textarea" id="vpNotes" placeholder="เช่น ห้ามแตะเงินออม..."></textarea></label></div></section>
      <section class="profile-card full"><h3>ข้อมูลที่ AI เข้าถึงได้</h3><p class="hint">คุณควบคุมได้ว่า AI จะนำข้อมูลประเภทไหนไปปรับคำตอบ ข้อมูลที่ปิดจะไม่ถูกใส่เป็นบริบทโปรไฟล์ของ AI</p><label class="profile-permission"><span>ตัวตน<small>ชื่อ อายุ และชื่อที่อยากให้เรียก</small></span><input class="profile-switch" type="checkbox" data-vp-perm="identity"></label><label class="profile-permission"><span>ชีวิต / การเรียน / งาน<small>สถานะ อาชีพ การศึกษา และรูปแบบงาน</small></span><input class="profile-switch" type="checkbox" data-vp-perm="life"></label><label class="profile-permission"><span>การเงินและเป้าหมาย<small>รายได้ เงินสำรอง และเป้าหมายจากโปรไฟล์</small></span><input class="profile-switch" type="checkbox" data-vp-perm="financial"></label><label class="profile-permission"><span>บริบทส่วนตัว<small>ความสนใจ นิสัย ลำดับความสำคัญ และสิ่งที่อยากให้ช่วย</small></span><input class="profile-switch" type="checkbox" data-vp-perm="personal"></label><label class="profile-permission"><span>Memory จากบทสนทนา<small>ความจำที่ AI บันทึกไว้แยกจากโปรไฟล์</small></span><input class="profile-switch" type="checkbox" data-vp-perm="memory"></label></section>
      </div><button class="profile-save" id="vpSave">บันทึกโปรไฟล์</button><button class="profile-danger" id="vpClear">ล้างข้อมูลโปรไฟล์ของฉัน</button></div>`;document.body.append(ov);
    ov.addEventListener('click',e=>{if(e.target===ov)ov.classList.remove('open')});document.getElementById('vpClose').onclick=()=>ov.classList.remove('open');document.getElementById('vpSave').onclick=save;
    const file=document.getElementById('vpPhotoFile');
    document.getElementById('vpPhotoPick').onclick=()=>file.click();
    document.getElementById('vpPhotoClear').onclick=()=>{window.vaultetProfilePhoto.clear();if(typeof showToast==='function')showToast('ลบรูปแล้ว');};
    file.onchange=async()=>{const f=file.files&&file.files[0];file.value='';if(!f)return;
      try{ if(!window.vaultetProfilePhoto.set(await window.vaultetProfilePhoto.fromFile(f))){ if(typeof showToast==='function')showToast('เก็บรูปไม่สำเร็จ — พื้นที่จัดเก็บอาจเต็ม'); return; } if(typeof showToast==='function')showToast('เปลี่ยนรูปโปรไฟล์แล้ว'); }
      catch(e){ if(typeof showToast==='function')showToast('ใช้รูปนี้ไม่ได้ ลองรูปอื่น'); } };document.getElementById('vpClear').onclick=async ()=>{if((await vaultetAsk("ล้างข้อมูล", 'ล้างข้อมูลโปรไฟล์ทั้งหมดใช่ไหม?', true))){localStorage.removeItem(KEY);window.vaultetProfilePhoto.clear();if(typeof localStorage!=='undefined')localStorage.removeItem(AI_PROFILE_KEY);refreshTrigger();ov.classList.remove('open');if(typeof showToast==='function')showToast('ล้างโปรไฟล์แล้ว')}};document.getElementById('vpGoalsLink').onclick=()=>{ov.classList.remove('open');if(window.vaultetGo)window.vaultetGo('plan');setTimeout(()=>document.getElementById('goalsCard')?.scrollIntoView({block:'start'}),80);};
  }
  window.vaultetOpenProfile=open;
  function init(){build();const top=document.querySelector('.ux-topbar');if(top){const b=document.createElement('button');b.className='ux-profile-trigger';b.id='uxProfileTrigger';b.innerHTML='<div class="ux-profile-avatar"><svg class="v-ic" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 20c1.5-4 4.5-6 8-6s6.5 2 8 6"/></svg></div><div class="ux-profile-mini"><strong>โปรไฟล์ของฉัน</strong><span>ตั้งค่าข้อมูลส่วนตัว</span></div>';b.onclick=open;top.insertBefore(b,top.querySelector('.ux-month')||null);refreshTrigger();}}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();

(function(){
  const profileKey='vaultet_user_profile_v1';
  const statusLabels={student:'นักเรียน',university:'นักศึกษา',work:'ทำงาน',freelance:'ฟรีแลนซ์',business:'ทำธุรกิจ'};
  function readProfile(){try{return JSON.parse(localStorage.getItem(profileKey)||'{}')||{};}catch(e){return {};}}
  function esc(v){return String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));}
  function profileSummary(p){
    const name=p.nickname||[p.firstName,p.lastName].filter(Boolean).join(' ')||'โปรไฟล์ของฉัน';
    const statuses=(p.statuses||[]).map(x=>statusLabels[x]||x).filter(Boolean);
    if(p.occupation && !statuses.includes(p.occupation)) statuses.push(p.occupation);
    const meta=statuses.slice(0,2).join(' · ')||'เพิ่มข้อมูลเกี่ยวกับตัวคุณได้ในโปรไฟล์';
    const goal=((typeof window.vaultetPlanGoals==='function'?window.vaultetPlanGoals():p.financialGoals)||[]).find(x=>x&&x.name);
    return {name,meta,goal:goal?`เป้าหมาย: ${goal.name}`:''};
  }
  function ensureContext(viewId){
    if(!['plan','more'].includes(viewId)) return;
    const view=document.getElementById('ux-'+viewId); if(!view||view.querySelector('.ux-user-context')) return;
    const card=document.createElement('div'); card.className='ux-user-context';
    card.innerHTML='<div class="ux-user-context-avatar"><svg class="v-ic" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 20c1.5-4 4.5-6 8-6s6.5 2 8 6"/></svg></div><div class="ux-user-context-main"><div class="ux-user-context-name"></div><div class="ux-user-context-meta"></div><div class="ux-user-context-goal"></div></div>';
    const title=view.querySelector('.ux-view-title');
    if(title) title.after(card); else view.prepend(card);
  }
  function refreshContexts(){
    const p=readProfile(), s=profileSummary(p);
    document.querySelectorAll('.ux-user-context').forEach(card=>{
      const n=card.querySelector('.ux-user-context-name'),m=card.querySelector('.ux-user-context-meta'),g=card.querySelector('.ux-user-context-goal');
      if(n)n.textContent=s.name;if(m)m.textContent=s.meta;if(g){g.textContent=s.goal;g.style.display=s.goal?'block':'none';}
    });
  }
  function setup(){
    ['plan','more'].forEach(ensureContext);
    const more=document.getElementById('ux-more');
    if(more){
      // Keep exactly one profile/context card on Other. It is also the entry point to the full editor.
      more.querySelectorAll('.ux-profile-manage-entry').forEach(el=>el.remove());
      const contexts=more.querySelectorAll('.ux-user-context');
      contexts.forEach((el,i)=>{ if(i>0) el.remove(); });
      const card=more.querySelector('.ux-user-context');
      if(card){
        card.setAttribute('role','button');
        card.setAttribute('tabindex','0');
        card.setAttribute('aria-label','เปิดโปรไฟล์ของฉัน');
        const openProfile=()=>{ if(window.vaultetOpenProfile) window.vaultetOpenProfile(); else document.getElementById('vaultetProfileOverlay')?.classList.add('open'); };
        card.onclick=openProfile;
        card.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();openProfile();}};
      }
    }
    refreshContexts();
    const originalGo=window.go;
    /* Navigation function is local in the shell script, so observe body state instead. */
    const observer=new MutationObserver(()=>{refreshContexts();});
    observer.observe(document.body,{attributes:true,attributeFilter:['class']});
    document.getElementById('uxProfileTrigger')?.addEventListener('click',()=>setTimeout(refreshContexts,50));
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',setup);else setup();
})();
