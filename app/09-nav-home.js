// Vaultet — app/09-nav-home.js : โครงแท็บ/แถบบน/แถบล่าง, หน้าหลักโฉมใหม่, หน้ารายการทั้งหมด, หน้าแชท, โปรไฟล์
// (แยกจาก app.js เดิม — โหลดเรียงตามเลขไฟล์ ทุกไฟล์ใช้ตัวแปร/ฟังก์ชันร่วมกันแบบ global)
/* ===== Vaultet UX/UI navigation layer — single navigation system ===== */
(function(){
  const page=document.querySelector('.page'); if(!page) return;
  const hero=page.querySelector('.hero-cards'), header=page.querySelector('header');
  const breakdown=page.querySelector('#breakdownSection');
  const analyses=[...page.querySelectorAll('.analysis-section')];
  const list=page.querySelector('.list-section');
  if(!hero||!header||!list) return;

  const cards=[...hero.children];
  const upcoming=page.querySelector('#upcomingCard');
  const proactive=page.querySelector('#aiProactiveCard');
  const budget=page.querySelector('#budgetDashboardCard');
  const emergency=page.querySelector('#emergencyDashboardCard');
  const goalsCard=page.querySelector('#goalsCard'), trendCard=page.querySelector('#trendCard');
  const notify=page.querySelector('#notificationDashboardCard');
  const backup=hero.querySelector('.backup-row');

  const shell=document.createElement('div');
  shell.className='ux-shell';
  // แถบบน: หน้าหลัก = วงกลมโปรไฟล์ + คำทักทาย + ปุ่มเดือน / แท็บอื่น = ชื่อหน้า / หน้าย่อย = ปุ่มย้อนกลับ
  const CHEV_DOWN='<svg class="ux-month-chev" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>';
  shell.innerHTML=`<div class="ux-topbar">
    <button class="ux-back" id="uxBackBtn" type="button" aria-label="ย้อนกลับ"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 6l-6 6 6 6"/></svg></button>
    <button class="ux-avatar" id="uxAvatarBtn" type="button" aria-label="ตั้งค่าและโปรไฟล์"></button>
    <div class="ux-brand">
      <div class="ux-brand-name" id="uxGreeting">สวัสดี</div>
      <div class="ux-brand-page" id="uxPageName">หน้าหลัก</div>
      <button class="ux-month-btn" id="uxMonthBtn" type="button" aria-label="เลือกเดือน"><span id="uxMonthLabel"></span>${CHEV_DOWN}</button>
    </div>
    <button class="ux-month-chip" id="uxMonthChip" type="button" aria-label="เลือกเดือน"><span id="uxMonthChipLabel"></span>${CHEV_DOWN}</button>
    <button class="ux-bell" id="uxBellBtn" aria-label="การแจ้งเตือน" aria-expanded="false">${vaultetIcon("🔔")}<i class="ux-bell-dot" id="uxBellDot" style="display:none"></i></button>
  </div>`;
  page.insertBefore(shell,page.firstChild);

  const views={};
  function makeView(id,title,sub){
    const v=document.createElement('section');
    v.className='ux-view'; v.id='ux-'+id;
    v.innerHTML=`<div class="ux-view-title">${title}</div><div class="ux-view-sub">${sub}</div>`;
    page.appendChild(v); views[id]=v; return v;
  }
  const home=makeView('home','ภาพรวม','ทุกสิ่งที่สำคัญสำหรับคุณในตอนนี้');
  const analysisV=makeView('analysis','วิเคราะห์','ดูว่าเงินไปไหน และเทียบแต่ละช่วงเวลา');
  const plan=makeView('plan','เงินของฉัน','บัญชี สินทรัพย์ เงินสำรอง เป้าหมาย และหนี้');
  const more=makeView('more','เพิ่มเติม','ตั้งค่าและเครื่องมือของ Vaultet');
  const chatV=makeView('chat','AI ที่ปรึกษา','คุยแบบอิสระกับ Vaultet ได้เหมือนคุยกับที่ปรึกษาส่วนตัว');
  const listV=makeView('list','รายการทั้งหมด','ค้นหาและกรองรายการของเดือนที่เลือก');

  // หน้าหลัก: ยอดหลัก → งบเดือนนี้ → ที่ต้องจ่ายเร็วๆ นี้ → สิ่งที่ควรรู้ → รายการล่าสุด
  home.append(header);
  if(budget) home.append(budget);
  if(upcoming) home.append(upcoming);
  // สิ่งที่ควรรู้: การ์ดเดียวบนหน้าหลัก (ข้อเสนอจากระบบ + สรุปจาก AI ถ้ามี)
  if(notify){ home.append(notify); if(proactive) notify.append(proactive); }
  else if(proactive) home.append(proactive);
  const recent=document.createElement('section');
  recent.className='v-recent'; recent.id='vRecent';
  recent.innerHTML='<div class="v-sec-head"><h2 class="v-sec-title">รายการล่าสุด</h2><button type="button" class="v-btn v-btn-text" id="vSeeAllBtn">ดูทั้งหมด</button></div><div id="vRecentList"></div>';
  home.append(recent);
  // แท็บ "เงินของฉัน": สินทรัพย์รวม → ทางลัด (พอร์ต/เงินสำรอง/หนี้/บัญชี/...) → เงินสำรองฉุกเฉิน → เป้าหมาย
  const assetsBox=hero.querySelector('#vAssets'), scBox=hero.querySelector('#vShortcuts');
  if(assetsBox&&scBox) hero.insertBefore(assetsBox,scBox);
  plan.append(hero);
  if(emergency) plan.append(emergency);
  if(goalsCard) plan.append(goalsCard);
  if(backup) more.append(backup);
  // แท็บ "รายงาน": สรุปตามหมวด + วิเคราะห์ตามช่วงเวลา + เปรียบเทียบ
  if(trendCard) analysisV.append(trendCard);
  if(breakdown) analysisV.append(breakdown);
  analyses.forEach(a=>analysisV.append(a));
  // รายการทั้งหมด (ค้นหา/กรอง) อยู่หน้าย่อยของตัวเอง เปิดจาก "ดูทั้งหมด"
  listV.append(list);

  // Dedicated AI page reuses the existing chat DOM/logic.
  const aiOverlay=document.getElementById('aiAnalystOverlay');
  const aiPanel=aiOverlay ? aiOverlay.querySelector('.sheet-modal') : null;
  if(aiPanel){
    aiPanel.classList.add('ux-chat-panel');
    const note=document.createElement('div');
    note.className='ux-chat-mode-note';
    note.textContent='คุย ถาม วิเคราะห์ และขอคำแนะนำเรื่องการเงินได้โดยตรง';
    const body=aiPanel.querySelector('#aiAnalystBody');
    if(body) aiPanel.insertBefore(note,body);
    chatV.append(aiPanel);
    aiOverlay.innerHTML='';
  }


  const aiSettings=document.getElementById('settingsBtn');
  const moreActions=document.createElement('div'); moreActions.className='ux-section-card';
  moreActions.innerHTML='<h3>ตั้งค่าและข้อมูล</h3><p>AI, สำรองข้อมูล และการตั้งค่าระบบ</p>';
  if(aiSettings) moreActions.append(aiSettings);
  more.append(moreActions);

  // Bottom navigation is the only app navigation. Transactions live at the bottom of Overview.
  const bottom=document.createElement('nav');
  bottom.className='ux-bottom-nav';
  bottom.setAttribute('aria-label','เมนูหลัก');
  bottom.innerHTML=`
    <button class="ux-bottom-item" data-page="home"><svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 11l9-7 9 7v9H3z"/></svg>หน้าหลัก</button>
    <button class="ux-bottom-item" data-page="analysis"><svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M21 12A9 9 0 1112 3v9z"/><path d="M15 3.500A9 9 0 0120.500 9H15z"/></svg>รายงาน</button>
    <button class="ux-bottom-add" id="uxAddBtn" type="button" aria-label="เพิ่มรายการ"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg></button>
    <button class="ux-bottom-item" data-page="plan"><svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 7a2 2 0 012-2h13v4M3 7v11a2 2 0 002 2h15V9H5a2 2 0 01-2-2z"/><path d="M16 14.500h.01"/></svg>เงินของฉัน</button>
    <button class="ux-bottom-item" data-page="chat"><svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l1.8 4.700L18.500 9.500l-4.700 1.800L12 16l-1.800-4.700L5.500 9.500l4.700-1.800z"/><path d="M19 15l.7 1.800 1.800.7-1.800.7L19 20l-.7-1.800-1.800-.7 1.800-.7z"/></svg>AI</button>`;
  document.body.append(bottom);

  const names={home:'หน้าหลัก',analysis:'รายงาน',plan:'เงินของฉัน',chat:'ที่ปรึกษา AI',more:'ตั้งค่า',list:'รายการทั้งหมด'};
  // หน้าย่อย (มีปุ่มย้อนกลับ ไม่จำเป็นแท็บล่าสุด)
  const SUB={more:1,list:1};
  window.vaultetLastTab='home';
  // รูปโปรไฟล์: เก็บแยกจากข้อมูลโปรไฟล์ (ไม่ส่งให้ AI) ย่อเป็นสี่เหลี่ยมจัตุรัส 256px ก่อนเก็บ
  const PHOTO_KEY='vaultet_profile_photo_v1';
  function photoChanged(){ document.dispatchEvent(new Event('vaultet-avatar-changed')); }
  window.vaultetProfilePhoto={
    get(){ try{ return localStorage.getItem(PHOTO_KEY)||''; }catch(e){ return ''; } },
    set(url){ try{ localStorage.setItem(PHOTO_KEY,url); }catch(e){ return false; } photoChanged(); return true; },
    clear(){ try{ localStorage.removeItem(PHOTO_KEY); }catch(e){} photoChanged(); },
    fromFile(file){ return new Promise((res,rej)=>{
      const fr=new FileReader(); fr.onerror=()=>rej(new Error('read'));
      fr.onload=()=>{ const im=new Image(); im.onerror=()=>rej(new Error('img'));
        im.onload=()=>{ const S=256,c=document.createElement('canvas'); c.width=c.height=S; const m=Math.min(im.width,im.height);
          c.getContext('2d').drawImage(im,(im.width-m)/2,(im.height-m)/2,m,m,0,0,S,S); res(c.toDataURL('image/jpeg',0.85)); };
        im.src=fr.result; };
      fr.readAsDataURL(file); }); }
  };
  function profileInfo(){
    let p={}; try{ p=JSON.parse(localStorage.getItem('vaultet_user_profile_v1')||'{}')||{}; }catch(e){}
    const name=String(p.nickname||p.firstName||'').trim();
    return {name, letter:name?Array.from(name)[0].toUpperCase():''};
  }
  function syncTopbar(){
    const {name,letter}=profileInfo();
    const g=document.getElementById('uxGreeting'); if(g) g.textContent=name?'สวัสดี '+name:'สวัสดี';
    const a=document.getElementById('uxAvatarBtn');
    const photo=window.vaultetProfilePhoto.get();
    if(a && photo){ a.innerHTML='<img class="ux-avatar-img" alt="">'; a.firstChild.src=photo; }
    else if(a) a.innerHTML=letter?'<span class="ux-avatar-letter"></span>':'<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 20c1.500-4 4.500-6 8-6s6.500 2 8 6"/></svg>';
    const l=a&&a.querySelector('.ux-avatar-letter'); if(l) l.textContent=letter;
  }
  document.addEventListener('vaultet-avatar-changed',syncTopbar);
  function go(id){
    if(!views[id]) id='home';
    if(!SUB[id]) window.vaultetLastTab=id;
    Object.entries(views).forEach(([k,v])=>v.classList.toggle('active',k===id));
    document.body.classList.toggle('ux-home-active',id==='home');
    document.body.classList.toggle('ux-chat-active',id==='chat');
    document.body.classList.toggle('ux-nonhome',id!=='home');
    document.body.classList.toggle('ux-more-active',id==='more');
    document.body.classList.toggle('ux-list-active',id==='list');
    document.body.classList.toggle('ux-sub-active',!!SUB[id]);
    const pageName=document.getElementById('uxPageName');
    if(pageName) pageName.textContent=names[id]||'';
    if(id==='home') syncTopbar();
    const navId=id==='list'?'home':id;
    document.querySelectorAll('.ux-bottom-item[data-page]').forEach(x=>x.classList.toggle('active',x.dataset.page===navId));
    window.scrollTo({top:0,behavior:'smooth'});
    history.replaceState(null,'','#'+id);
  }

  window.vaultetGo=go;
  document.getElementById('uxAddBtn')?.addEventListener('click',()=>openForm(null));
  document.getElementById('uxBackBtn')?.addEventListener('click',()=>go(window.vaultetLastTab||'home'));
  document.getElementById('uxAvatarBtn')?.addEventListener('click',()=>{ if(window.vaultetOpenSettings) window.vaultetOpenSettings(); else go('more'); });
  document.getElementById('vSeeAllBtn')?.addEventListener('click',()=>go('list'));
  document.querySelectorAll('.ux-bottom-item[data-page]').forEach(x=>x.addEventListener('click',()=>{
    const id=x.dataset.page;
    if(id==='chat' && window.bancheeOpenChatPage){ window.bancheeOpenChatPage(); }
    else go(id);
  }));

  const bell=document.getElementById('uxBellBtn');
  if(bell) bell.addEventListener('click',e=>{
    e.preventDefault(); e.stopPropagation();
    const ov=document.getElementById('notificationOverlay');
    if(ov?.classList.contains('open')) closeVaultetNotificationCenter();
    else openVaultetNotificationCenter();
  });

  const closeChatBtn=document.getElementById('closeAiAnalystBtn');
  if(closeChatBtn) closeChatBtn.addEventListener('click',()=>go('home'));
  window.bancheeOpenChatPage=()=>{
    hideAiCompletionNotification();
    if(typeof renderAiChatBubbles==='function') renderAiChatBubbles();
    clearAiChatUnread();
    go('chat');
    if(aiRequestState?.status==='pending') setAiChatSendBtnState(true);
  };
  window.bancheeOpenChatFromList=()=>{
    document.getElementById('aiChatListOverlay')?.classList.remove('open');
    if(typeof renderAiChatBubbles==='function') renderAiChatBubbles();
    clearAiChatUnread();
    go('chat');
  };

  // ปุ่มเดือน (แทนช่องเลือกของเบราว์เซอร์): กดแล้วเปิดแผ่นเลือกเดือนจากล่าง ค่าจริงยังอยู่ที่ #monthSelect เดิม
  const oldMonth=document.getElementById('monthSelect');
  if(oldMonth){
    const syncMonthLabel=()=>{
      const t=oldMonth.selectedOptions[0]?.textContent||'';
      ['uxMonthLabel','uxMonthChipLabel'].forEach(id=>{ const el=document.getElementById(id); if(el) el.textContent=t; });
    };
    const pickMonth=async()=>{
      if(typeof vaultetPick!=='function') return;
      const v=await vaultetPick({title:'เลือกเดือน',value:oldMonth.value,options:[...oldMonth.options].map(o=>({value:o.value,label:o.textContent}))});
      if(v==null||v===oldMonth.value) return;
      oldMonth.value=v; oldMonth.dispatchEvent(new Event('change',{bubbles:true}));
    };
    document.getElementById('uxMonthBtn')?.addEventListener('click',pickMonth);
    document.getElementById('uxMonthChip')?.addEventListener('click',pickMonth);
    oldMonth.addEventListener('change',syncMonthLabel);
    oldMonth.addEventListener('vaultet-month-sync',syncMonthLabel);
    new MutationObserver(syncMonthLabel).observe(oldMonth,{childList:true,subtree:true,characterData:true});
    syncMonthLabel();
  }

  const nb=document.getElementById('notificationUnreadBadge'), dot=document.getElementById('uxBellDot');
  if(nb&&dot){
    const sync=()=>{dot.style.display=nb.style.display==='none'?'none':'block'};
    sync();
    new MutationObserver(sync).observe(nb,{attributes:true,childList:true,subtree:true});
  }

  // Swipe-to-switch-page removed: change page only via bottom nav.

  const hash=location.hash.slice(1);
  go(views[hash]?hash:'home');
})();

/* ===== ds47: หน้าหลัก (รายการล่าสุด, งบพับได้) + หน้ารายการทั้งหมด (ชิปกรอง, ช่องค้นหา) ===== */
(function(){
  const RECENT_LIMIT=5;
  const EMPTY_IC='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3h9l3 3v15H6z"/><path d="M9 10h6M9 14h6M9 18h3"/></svg>';
  const recentBox=document.getElementById('vRecentList');
  function renderRecent(){
    if(!recentBox) return;
    const me=[...getMonthEntries()].sort((a,b)=>b.date.localeCompare(a.date));
    const all=document.getElementById('vSeeAllBtn'); if(all) all.hidden=!me.length;
    if(!me.length){
      recentBox.innerHTML=`<div class="v-empty"><div class="v-empty-ic">${EMPTY_IC}</div><div class="v-empty-t">ยังไม่มีรายการในเดือนนี้</div><div class="v-empty-s">จดรายการแรกได้เลย ใช้เวลาไม่กี่วินาที</div><button type="button" class="v-btn v-btn-go" id="vRecentAddBtn">เพิ่มรายการ</button></div>`;
      recentBox.querySelector('#vRecentAddBtn').addEventListener('click',()=>openForm(null));
      return;
    }
    recentBox.innerHTML=txListHtml(me.slice(0,RECENT_LIMIT));
    bindTxRows(recentBox);
  }

  // หน้ารายการทั้งหมด: ชิปกรองประเภท (แทนช่องเลือกเดิม ซึ่งยังซ่อนอยู่และเป็นตัวเก็บค่าจริง)
  const sel=document.getElementById('typeFilter');
  const section=document.querySelector('#ux-list .list-section');
  const FILTERS=[['all','ทั้งหมด'],['expense','รายจ่าย'],['income','รายรับ'],['saving','ออม/ลงทุน'],['transfer','โอนเงิน']];
  let chips=null;
  if(sel&&section){
    chips=document.createElement('div');
    chips.className='v-fchips'; chips.id='vTypeChips'; chips.setAttribute('role','group'); chips.setAttribute('aria-label','กรองตามประเภท');
    chips.innerHTML=FILTERS.map(([k,l])=>`<button type="button" class="v-fchip" data-f="${k}" aria-pressed="false">${l}</button>`).join('');
    section.insertBefore(chips,section.firstChild);
    chips.addEventListener('click',e=>{
      const b=e.target.closest('.v-fchip'); if(!b||b.dataset.f===sel.value) return;
      sel.value=b.dataset.f; sel.dispatchEvent(new Event('change',{bubbles:true}));
    });
    // ช่องค้นหา: ใส่ไอคอนแว่นขยาย และให้ขอบเขียวตอนพิมพ์
    const row=section.querySelector('.search-row');
    if(row){ row.classList.add('v-search'); row.insertAdjacentHTML('afterbegin','<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.500"/><path d="M16 16l4 4"/></svg>'); }
    const input=document.getElementById('searchInput'); if(input) input.setAttribute('aria-label','ค้นหาหมวดหรือโน้ต');
    // ลำดับใหม่: ชิป → ค้นหา → จำนวนรายการ → รายการ
    const head=section.querySelector('.list-header-row');
    if(head&&row){ section.insertBefore(head,row.nextSibling); head.insertAdjacentHTML('beforeend','<span class="v-list-hint">แตะรายการเพื่อแก้ไข</span>'); }
  }
  function syncChips(){
    if(!chips||!sel) return;
    chips.querySelectorAll('.v-fchip').forEach(b=>{ const on=b.dataset.f===sel.value; b.classList.toggle('is-on',on); b.setAttribute('aria-pressed',on?'true':'false'); });
  }

  // งบเดือนนี้บนหน้าหลัก: แตะที่การ์ดเพื่อกาง/พับรายหมวด (ไม่มีปุ่ม) กางแบบนุ่ม ~0.25 วิ จำค่าไว้
  const K_BUDGET='vaultet_ui_budget_open_v1';
  const bCard=document.getElementById('budgetDashboardCard'), bRows=document.getElementById('budgetDashboardRows');
  if(bCard&&bRows){
    const calm=window.matchMedia&&matchMedia('(prefers-reduced-motion: reduce)').matches;
    let open=false; try{ open=localStorage.getItem(K_BUDGET)==='1'; }catch(e){}
    let timer=0;
    const finish=()=>{ clearTimeout(timer); bRows.classList.remove('is-anim'); bRows.style.height=''; bRows.style.transition=''; bCard.classList.toggle('is-collapsed',!open); };
    const apply=(o,animate)=>{
      open=o; bCard.setAttribute('aria-expanded',o?'true':'false');
      if(!animate||calm){ finish(); return; }
      const from=o?0:bRows.offsetHeight;
      bCard.classList.remove('is-collapsed');
      const to=o?bRows.scrollHeight:0;
      bRows.classList.add('is-anim'); bRows.style.transition='none'; bRows.style.height=from+'px'; void bRows.offsetHeight;
      bRows.style.transition='height .25s ease'; bRows.style.height=to+'px';
      clearTimeout(timer); timer=setTimeout(finish,280);
    };
    bCard.tabIndex=0; bCard.setAttribute('role','group');
    apply(open,false);
    const toggle=()=>{ if(!bRows.innerHTML.trim()){ if(typeof openBudgetManager==='function') openBudgetManager(); return; } apply(!open,true); try{ localStorage.setItem(K_BUDGET,open?'1':'0'); }catch(e){} };
    bCard.addEventListener('click',e=>{
      if(e.target.closest('#budgetDashboardManageBtn, .v-brow, a, button, input, select')) return;
      toggle();
    });
    bCard.addEventListener('keydown',e=>{ if(e.target===bCard&&(e.key==='Enter'||e.key===' ')){ e.preventDefault(); toggle(); } });
  }
  // การ์ดกำลังจะต้องจ่าย: แตะที่การ์ดเพื่อเปิดรายการทั้งหมด (แผ่นจากล่าง) ไม่มีปุ่ม
  const uCard=document.getElementById('upcomingCard');
  if(uCard){
    uCard.tabIndex=0;
    const openUp=()=>{ renderUpcomingOverlay(); document.getElementById('upcomingOverlay').classList.add('open'); };
    uCard.addEventListener('click',e=>{ if(e.target.closest('a, button, input, select')) return; openUp(); });
    uCard.addEventListener('keydown',e=>{ if(e.key==='Enter'||e.key===' '){ e.preventDefault(); openUp(); } });
  }

  const __prevRender=render;
  render=function(){
    __prevRender();
    try{ renderRecent(); syncChips(); }catch(e){ console.error(e); }
    const m=document.getElementById('monthSelect'); if(m) m.dispatchEvent(new Event('vaultet-month-sync'));
  };
  renderRecent(); syncChips();
})();

/* ===== Round 6: AI chat page bridge ===== */
(function(){
  function openChatPage(){
    if(window.bancheeOpenChatPage){ window.bancheeOpenChatPage(); return; }
    document.getElementById('aiAnalystOverlay')?.classList.remove('open');
  }
  // Redirect the free-chat link from the transaction AI sheet to the dedicated page.
  // "+ แชทใหม่" should also return to the dedicated page, not the legacy bottom sheet.
  const newChat=document.getElementById('newAiChatBtn');
  if(newChat) newChat.addEventListener('click',(e)=>{
    e.stopImmediatePropagation();
    if(aiChatAbortController) aiChatAbortController.abort();
    aiChatEditingIndex=null;
    createNewChat();
    renderAiChatBubbles();
    document.getElementById('aiChatListOverlay')?.classList.remove('open');
    openChatPage();
    document.getElementById('aiChatError').style.display='none';
  },true);

  // Redirect the original async analysis result into the dedicated chat page.
  (window.__vaultetAiPatches=window.__vaultetAiPatches||[]).push(function(){
  const originalOpen=window.openAiAnalystSheet;
  if(typeof originalOpen==='function'){
    window.openAiAnalystSheet=function(query,analysisText){
      const history=loadAIChatHistory();
      history.push({role:'user',text:query});
      history.push({role:'model',text:analysisText});
      saveAIChatHistory(history);
      renderAiChatBubbles();
      openChatPage();
    };
  }
  });

  // Existing chat-list row handlers were created by the original function. Capture first so selection opens the page.
  const list=document.getElementById('aiChatListBody');
  if(list) list.addEventListener('click',(e)=>{
    const row=e.target.closest('.ai-chat-list-row');
    if(!row || e.target.closest('.delete-ai-chat-btn')) return;
    e.preventDefault(); e.stopPropagation();
    switchToChat(row.dataset.id);
    renderAiChatBubbles();
    document.getElementById('aiChatListOverlay')?.classList.remove('open');
    openChatPage();
  },true);

})();

(function(){
  const anchor=document.querySelector('.page-anchor');
  const nav=document.querySelector('.ux-bottom-nav');

  function syncFabVisibility(){
    if(!anchor) return;
    const active=document.querySelector('.ux-view.active');
    const pageId=active ? active.id.replace(/^ux-/,'') : 'home';
    anchor.classList.toggle('fab-hidden', pageId !== 'home');
  }

  if(nav) nav.addEventListener('click',()=>setTimeout(syncFabVisibility,0),true);

  const observer=new MutationObserver(syncFabVisibility);
  document.querySelectorAll('.ux-view').forEach(v=>{
    observer.observe(v,{attributes:true,attributeFilter:['class']});
  });
  syncFabVisibility();

  // หน้าหลัก: ซ่อนปุ่มลอยตอนรายการอยู่ในจอ จะได้ไม่บังแถวรายการ
  const listSection=document.querySelector('#ux-home .list-section');
  if(anchor && listSection && 'IntersectionObserver' in window){
    const listObserver=new IntersectionObserver(entries=>{
      const visible=entries.some(x=>x.isIntersecting);
      const active=document.querySelector('.ux-view.active')?.id==='ux-home';
      anchor.classList.toggle('fab-hidden', active && visible);
    },{threshold:0.08});
    listObserver.observe(listSection);
  }

  const bell=document.getElementById('uxBellBtn');
  const overlay=document.getElementById('notificationOverlay');
  if(bell && overlay){
    bell.setAttribute('aria-expanded','false');
    const stateObserver=new MutationObserver(()=>{
      bell.setAttribute('aria-expanded',overlay.classList.contains('open')?'true':'false');
    });
    stateObserver.observe(overlay,{attributes:true,attributeFilter:['class']});
  }
})();

(function(){
  const body=document.body;
  const nav=document.querySelector('.ux-bottom-nav');
  const page= document.querySelector('.page');

  // Keep the 5-tab navigation visible on AI, but hide it only while the mobile keyboard is open.
  function syncViewportMetrics(){
    const shell=document.querySelector('.ux-shell');
    if(shell){ document.documentElement.style.setProperty('--ux-topbar-space', Math.max(64, Math.ceil(shell.getBoundingClientRect().height))+'px'); }
  }

  function syncKeyboardState(){
    const vv=window.visualViewport;
    if(!vv) return;
    const keyboardOpen=(window.innerHeight-vv.height)>140;
    body.classList.toggle('ux-keyboard-open', keyboardOpen);
  }
  syncViewportMetrics();
  if(window.visualViewport){
    visualViewport.addEventListener('resize',()=>{syncViewportMetrics();syncKeyboardState()},{passive:true});
    visualViewport.addEventListener('scroll',syncKeyboardState,{passive:true});
  }
  window.addEventListener('resize',()=>{syncViewportMetrics();syncKeyboardState()},{passive:true});
  const aiInput=document.getElementById('aiChatInput');
  if(aiInput){
    aiInput.addEventListener('focus',()=>document.body.classList.add('ux-keyboard-open'));
    aiInput.addEventListener('blur',()=>setTimeout(()=>{ if(!window.visualViewport || (window.innerHeight-window.visualViewport.height)<=140) document.body.classList.remove('ux-keyboard-open'); },120));
  }
  syncViewportMetrics();
  syncKeyboardState();

  // Make notification state explicit in DOM as well as the checkbox itself.
  window.syncVaultetNotifStateUI=function(){
    const map={enabled:'notifEnabledInput',positive:'notifPositiveInput',budget:'notifBudgetInput',emergency:'notifEmergencyInput',forecast:'notifForecastInput',obligation:'notifObligationInput',behavior:'notifBehaviorInput',quiet:'notifQuietInput'};
    Object.values(map).forEach(id=>{
      const input=document.getElementById(id);
      const card=input?.closest('.notification-setting');
      if(!input||!card) return;
      card.dataset.state=input.checked?'on':'off';
      card.setAttribute('aria-checked',input.checked?'true':'false');
    });
  };
  document.addEventListener('change',e=>{
    if(e.target.matches('#notificationOverlay input[type="checkbox"]')) window.syncVaultetNotifStateUI();
  });
  const notifPanel=document.getElementById('notificationSettingsPanel');
  if(notifPanel){
    new MutationObserver(()=>window.syncVaultetNotifStateUI()).observe(notifPanel,{childList:true,subtree:true});
  }
  window.syncVaultetNotifStateUI();
})();
