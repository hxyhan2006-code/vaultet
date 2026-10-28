// Vaultet — app/10-ai-ui-lock.js : จัดหน้าแชท AI ตอนคีย์บอร์ดเปิด, ปุ่มหัวหน้าแชท, ล็อกแอป
// (แยกจาก app.js เดิม — โหลดเรียงตามเลขไฟล์ ทุกไฟล์ใช้ตัวแปร/ฟังก์ชันร่วมกันแบบ global)
(function(){
  const root=document.documentElement, body=document.body;
  function syncVV(){
    const vv=window.visualViewport;
    const h=Math.round(vv?.height||window.innerHeight||0);
    if(h>0) root.style.setProperty('--ux-vv-height',h+'px');
  }
  syncVV();
  window.visualViewport?.addEventListener('resize',syncVV,{passive:true});
  window.visualViewport?.addEventListener('scroll',syncVV,{passive:true});
  window.addEventListener('resize',syncVV,{passive:true});

  // การล็อกเลื่อนหน้าด้านหลังตอนมีหน้าต่างเปิด อยู่ใน ui.js (ที่เดียว ครอบคลุมทุกชนิดของหน้าต่าง/แผ่น/เมนู)

  // Advisor page entry never creates a new chat automatically.
  // loadAllChats()/getActiveChat() already provide the existing chat (including an empty one);
  // createNewChat() remains reserved for the explicit “แชทใหม่” action.

  // Make notification settings accessible even if an older inline handler is missing.
  window.toggleNotificationSettings=window.toggleNotificationSettings||function(){
    const p=document.getElementById('notificationSettingsPanel'),b=document.getElementById('notificationSettingsToggle');
    if(!p||!b)return; const isOpen=p.hidden; p.hidden=!isOpen; b.setAttribute('aria-expanded',String(isOpen));
  };
})();

(function(){
  const root=document.documentElement, body=document.body, overlay=document.getElementById('aiInputOverlay');
  if(!overlay) return;
  function syncVoiceViewport(){
    const vv=window.visualViewport;
    const h=Math.round(vv?.height||window.innerHeight||0);
    if(h>0) root.style.setProperty('--ux-voice-vv-height',h+'px');
    if(vv){
      root.style.setProperty('--ux-vv-height',h+'px');
    }
  }
  syncVoiceViewport();
  window.visualViewport?.addEventListener('resize',syncVoiceViewport,{passive:true});
  window.visualViewport?.addEventListener('scroll',syncVoiceViewport,{passive:true});
  window.addEventListener('resize',syncVoiceViewport,{passive:true});
  const input=document.getElementById('aiInputText');
  if(input){
    input.addEventListener('focus',()=>{
      body.classList.add('ux-voice-input-active');
      syncVoiceViewport();
    },{passive:true});
    input.addEventListener('blur',()=>{
      setTimeout(()=>body.classList.remove('ux-voice-input-active'),120);
    },{passive:true});
  }
})();

(function(){
  function moveAiHeaderActions(){
    const topbar=document.querySelector('.ux-topbar');
    const aiPanel=document.querySelector('#aiAnalystOverlay .sheet-modal');
    if(!topbar || !aiPanel) return false;

    let host=document.getElementById('uxChatTopActions');
    if(!host){
      host=document.createElement('div');
      host.id='uxChatTopActions';
      host.className='ux-chat-top-actions';
      host.setAttribute('aria-label','เครื่องมือแชท AI');
      topbar.appendChild(host);
    }

    /* Move the actual existing buttons (not clones), so their original listeners/IDs remain valid. */
    ['aiAdvisorSettingsBtn','aiChatHistoryBtn','clearAiChatBtn'].forEach(id=>{
      const btn=document.getElementById(id);
      if(btn && !host.contains(btn)) host.appendChild(btn);
    });

    /* Remove the old title/actions wrapper after its real buttons have been relocated. */
    const oldHeader=aiPanel.querySelector('.modal-header');
    if(oldHeader && !oldHeader.contains(host)) oldHeader.remove();

    return ['aiAdvisorSettingsBtn','aiChatHistoryBtn','clearAiChatBtn'].every(id=>!!document.getElementById(id)?.closest('#uxChatTopActions'));
  }

  function refreshChatPage(){
    moveAiHeaderActions();
    if(typeof renderAiChatBubbles==='function') renderAiChatBubbles();
    if(typeof syncAiChatSendBtnVisibility==='function') syncAiChatSendBtnVisibility();
    if(typeof aiRequestState!=='undefined' && aiRequestState?.status==='pending' && typeof setAiChatSendBtnState==='function') setAiChatSendBtnState(true);
  }

  function patchChatEntry(){
    if(typeof window.bancheeOpenChatPage==='function' && !window.__vaultetAiChatEntryPatched){
      const original=window.bancheeOpenChatPage;
      window.bancheeOpenChatPage=function(){
        const result=original.apply(this,arguments);
        moveAiHeaderActions();
        return result;
      };
      window.__vaultetAiChatEntryPatched=true;
    }
  }

  function init(){
    moveAiHeaderActions();
    patchChatEntry();
    if(location.hash==='#chat'){
      refreshChatPage();
    }
    const observer=new MutationObserver(()=>{
      moveAiHeaderActions();
      patchChatEntry();
    });
    const top=document.querySelector('.ux-topbar');
    if(top) observer.observe(top,{childList:true,subtree:true});
    document.addEventListener('click',()=>{moveAiHeaderActions();patchChatEntry();},{capture:true,passive:true});
  }

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',init); else init();
})();

(function(){
  function ensureSendArrow(){
    const btn=document.getElementById('aiChatSendBtn');
    const input=document.getElementById('aiChatInput');
    if(!btn || !input || typeof aiChatBusy!=='boolean') return;
    if(!aiChatBusy && input.value.trim()){
      if(!btn.querySelector('svg')){
        btn.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 19V5"/><path d="m5 12 7-7 7 7"/></svg>';
      }
      btn.classList.remove('stop-btn');
      btn.classList.remove('is-composer-empty');
      btn.setAttribute('aria-label','ส่งข้อความ');
      btn.title='ส่งข้อความ';
    }
  }
  const input=document.getElementById('aiChatInput');
  if(input) input.addEventListener('input',ensureSendArrow,{capture:true});
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',ensureSendArrow); else ensureSendArrow();
})();

(function(){
  function moveAiHeaderActionsFinal(){
    const topbar=document.querySelector('body.ux-chat-active .ux-topbar, .ux-topbar');
    const panel=document.querySelector('.ux-chat-panel, #ux-chat .sheet-modal, #aiAnalystOverlay .sheet-modal');
    if(!topbar || !panel) return false;

    let host=document.getElementById('uxChatTopActions');
    if(!host){
      host=document.createElement('div');
      host.id='uxChatTopActions';
      host.className='ux-chat-top-actions';
      host.setAttribute('aria-label','เครื่องมือแชท AI');
      topbar.appendChild(host);
    }else if(host.parentElement!==topbar){
      topbar.appendChild(host);
    }

    ['aiAdvisorSettingsBtn','aiChatHistoryBtn','clearAiChatBtn'].forEach(function(id){
      const btn=document.getElementById(id);
      if(btn && btn.parentElement!==host) host.appendChild(btn);
    });

    const oldHeader=panel.querySelector('.modal-header');
    if(oldHeader) oldHeader.remove();
    return true;
  }

  function ensureFirstTypedMessageArrow(){
    const btn=document.getElementById('aiChatSendBtn');
    const input=document.getElementById('aiChatInput');
    if(!btn || !input) return;
    const hasText=input.value.trim().length>0;
    if(hasText && !(typeof aiChatBusy!=='undefined' && aiChatBusy)){
      if(typeof setAiChatSendBtnState==='function') setAiChatSendBtnState(false);
      btn.classList.remove('is-composer-empty');
    }
  }

  function syncFinal(){
    moveAiHeaderActionsFinal();
    ensureFirstTypedMessageArrow();
  }

  function init(){
    syncFinal();
    const input=document.getElementById('aiChatInput');
    if(input) input.addEventListener('input',function(){
      moveAiHeaderActionsFinal();
      ensureFirstTypedMessageArrow();
    },{capture:true});
    window.addEventListener('hashchange',syncFinal,{passive:true});
    const observer=new MutationObserver(function(){
      if(document.body.classList.contains('ux-chat-active')) moveAiHeaderActionsFinal();
    });
    observer.observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:['class']});
    setInterval(function(){
      if(document.body.classList.contains('ux-chat-active')) syncFinal();
    },300);
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',init); else init();
})();

(function(){
const K="vlock_v1";
const H=(s,salt)=>{let a=0xdeadbeef,b=0x41c6ce57;const t=salt+"|"+s;for(let i=0;i<t.length;i++){const c=t.charCodeAt(i);a=Math.imul(a^c,2654435761);b=Math.imul(b^c,1597334677);}a=Math.imul(a^(a>>>16),2246822507)^Math.imul(b^(b>>>13),3266489909);b=Math.imul(b^(b>>>16),2246822507)^Math.imul(a^(a>>>13),3266489909);return (4294967296*(2097151&b)+(a>>>0)).toString(36);};
const get=()=>{try{return JSON.parse(localStorage.getItem(K))}catch(e){return null}};
const put=v=>{try{localStorage.setItem(K,JSON.stringify(v))}catch(e){}};
const ov=document.createElement("div");
ov.style.cssText="position:fixed;inset:0;z-index:99999;background:#0a0a0c;display:none;flex-direction:column;align-items:center;justify-content:center;gap:14px;padding:24px;color:#fff";
ov.innerHTML='<div style="color:var(--v-muted)"><svg class="v-ic" style="width:42px;height:42px" viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 018 0v3"/></svg></div><div style="font-size:18px;font-weight:700">Vaultet</div><input id="lockPin" type="password" inputmode="numeric" maxlength="6" placeholder="รหัส 6 หลัก" autocomplete="off" style="width:200px;text-align:center;font-size:24px;letter-spacing:8px;padding:10px;border-radius:12px;border:1px solid #333;background:#151518;color:#fff"><div id="lockMsg" style="color:#ef5350;min-height:18px;font-size:13px"></div><button id="lockForgot" style="background:none;border:0;color:#9aa;font-size:14px;text-decoration:underline">ลืมรหัส?</button>';
document.body.appendChild(ov);
const pin=ov.querySelector("#lockPin"),msg=ov.querySelector("#lockMsg");
const show=()=>{const c=get();if(!c||!c.on)return;ov.style.display="flex";pin.value="";msg.textContent="";setTimeout(()=>pin.focus(),50);};
const hide=()=>{ov.style.display="none";};
pin.addEventListener("input",()=>{const c=get();if(pin.value.length<6)return;if(c&&H(pin.value,c.salt)===c.pin)hide();else{msg.textContent="รหัสไม่ถูกต้อง";pin.value="";}});
const pinField=(key,label)=>({key,label,type:"password",inputmode:"numeric",maxlength:6,required:true,pattern:"^\\d{6}$",patternMessage:"ต้องเป็นตัวเลข 6 หลักเท่านั้น"});
const newPin=async()=>{
  const v=await vaultetForm({title:"ตั้งรหัสล็อกแอป",okText:"ตั้งรหัส",fields:[pinField("p","รหัสใหม่ (ตัวเลข 6 หลัก)"),Object.assign(pinField("p2","พิมพ์รหัสซ้ำอีกครั้ง"),{validate:(val,out)=>val!==out.p?"รหัสไม่ตรงกัน":""})]});
  return v?v.p:null;
};
const newQA=async salt=>{
  const v=await vaultetForm({title:"คำถามกู้รหัส",message:"ไว้ใช้ตอนลืมรหัส ตอบคำถามนี้ได้ถึงจะตั้งรหัสใหม่ได้",okText:"บันทึก",fields:[{key:"q",label:"คำถาม",required:true,placeholder:"เช่น สัตว์เลี้ยงตัวแรกชื่ออะไร"},{key:"a",label:"คำตอบของคำถามนี้",required:true}]});
  return v?{q:v.q,a:H(v.a.toLowerCase(),salt)}:null;
};
const verify=async c=>{
  const v=await vaultetForm({title:"ยืนยันตัวตน",okText:"ยืนยัน",fields:[pinField("o","ใส่รหัสปัจจุบัน")]});
  if(!v)return false;
  if(H(v.o,c.salt)!==c.pin){await vaultetAlert("รหัสไม่ถูกต้อง");return false;}
  return true;
};
ov.querySelector("#lockForgot").onclick=async()=>{
  const c=get();if(!c)return;
  const v=await vaultetForm({title:"กู้รหัส",message:"คำถามกู้รหัส: "+c.q,okText:"ตรวจคำตอบ",fields:[{key:"a",label:"คำตอบ",required:true}]});
  if(!v)return;
  if(H(v.a.toLowerCase(),c.salt)!==c.a){await vaultetAlert("คำตอบไม่ถูกต้อง");return;}
  const p=await newPin();if(!p)return;c.pin=H(p,c.salt);c.on=true;put(c);hide();
};
const openLockMenu=async()=>{
  const c=get();
  if(!c){
    const p=await newPin();if(!p)return;
    const salt=Math.random().toString(36).slice(2),qa=await newQA(salt);
    if(!qa){await vaultetAlert("ต้องมีคำถามและคำตอบกู้รหัส");return;}
    put({on:true,salt,pin:H(p,salt),q:qa.q,a:qa.a});await vaultetAlert("เปิดล็อกแอปแล้ว");return;
  }
  const x=await vaultetChoice({title:"ล็อกแอป: "+(c.on?"เปิดอยู่":"ปิดอยู่"),options:[{value:"1",label:(c.on?"ปิด":"เปิด")+"ล็อก"},{value:"2",label:"เปลี่ยนรหัส"},{value:"3",label:"เปลี่ยนคำถาม/คำตอบกู้รหัส"},{value:"4",label:"ลบการตั้งค่าล็อกทั้งหมด",danger:true}]});
  if(!x)return;
  if(!(await verify(c)))return;
  if(x==="1"){c.on=!c.on;put(c);await vaultetAlert(c.on?"เปิดล็อกแล้ว":"ปิดล็อกแล้ว");}
  else if(x==="2"){const p=await newPin();if(p){c.pin=H(p,c.salt);put(c);await vaultetAlert("เปลี่ยนรหัสแล้ว");}}
  else if(x==="3"){const qa=await newQA(c.salt);if(qa){c.q=qa.q;c.a=qa.a;put(c);await vaultetAlert("เปลี่ยนแล้ว");}}
  else{localStorage.removeItem(K);await vaultetAlert("ลบการตั้งค่าล็อกแล้ว");}
};
document.addEventListener("click",e=>{if(e.target.closest&&e.target.closest("#lockSettingsBtn"))openLockMenu();},true);
const addLockBtn=()=>{const more=document.getElementById("ux-more");if(!more||document.getElementById("lockSettingsBtn"))return !!more;
  const c=document.createElement("div");c.className="ux-section-card";
  c.innerHTML='<div style="font-weight:600">ล็อกแอป</div><div style="font-size:12px;color:var(--faint);margin-top:2px">ตั้งรหัส PIN 6 หลักก่อนเข้าแอป</div><button type="button" id="lockSettingsBtn" class="manage-accounts-btn" style="width:auto;padding:8px 18px;margin-top:10px">ตั้งค่าล็อก</button>';
  more.appendChild(c);return true;};
if(!addLockBtn()){let n=0;const iv=setInterval(()=>{if(addLockBtn()||++n>40)clearInterval(iv);},250);}
let t0=0;document.addEventListener("visibilitychange",()=>{if(document.hidden)t0=Date.now();else if(t0&&Date.now()-t0>60000)show();});
show();
})();
