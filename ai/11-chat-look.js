// Vaultet — ai/11-chat-look.js : หน้าแชท AI โฉมใหม่ (รอบ 5, ds53)
// หน้าว่าง = คำทักทายชิดซ้ายล่าง + คำถามแนะนำเป็นแถว (สไตล์ ChatGPT; ds56) (แตะแล้วใส่ในช่องพิมพ์ ยังไม่ส่งเอง — กดส่งเองทุกครั้ง)
// หน้าตาข้อความ/ปุ่มส่งปรับด้วย CSS อย่างเดียว ไม่แตะการเรียก AI
(function(){
  // คำถามแนะนำ + ไอคอนเส้น (SVG)
  const IC = {
    sum: '<path d="M5 4h14v16H5z"/><path d="M9 9h6M9 13h6M9 17h3"/>',
    pie: '<path d="M12 3a9 9 0 109 9h-9z"/><path d="M15 3.500A9 9 0 0120.500 9H15z"/>',
    save: '<circle cx="12" cy="12" r="8.500"/><path d="M12 7.500v9M9.500 10c0-1 1-1.700 2.500-1.700s2.500.7 2.500 1.700-1 1.500-2.500 1.900S9.500 13.500 9.500 14.500s1 1.700 2.500 1.700 2.500-.7 2.500-1.700"/>',
    plan: '<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 10h16M9 3v4M15 3v4"/>'
  };
  const SUGGEST = [
    { t: "สรุปการเงินเดือนนี้ให้หน่อย", i: "sum" },
    { t: "หมวดไหนใช้เงินเยอะเกินไป", i: "pie" },
    { t: "ควรออมเดือนละเท่าไหร่ดี", i: "save" },
    { t: "ช่วยวางแผนใช้เงินเดือนหน้า", i: "plan" }
  ];
  function greeting(){
    let n = ""; try{ const p = JSON.parse(localStorage.getItem("vaultet_user_profile_v1") || "{}") || {}; n = String(p.nickname || p.firstName || "").trim(); }catch(e){}
    return n ? "สวัสดี " + n : "สวัสดี";
  }
  function decorateEmpty(){
    const body = document.getElementById("aiAnalystBody");
    const empty = body && body.querySelector(".ai-chat-empty");
    if(!empty || empty.querySelector(".v-chat-sugs")) return;
    empty.classList.add("v-chat-empty");
    empty.innerHTML = '<div class="v-chat-hello"></div><div class="v-chat-sugs" role="group" aria-label="คำถามแนะนำ"></div>';
    empty.querySelector(".v-chat-hello").textContent = greeting();
    const box = empty.querySelector(".v-chat-sugs");
    SUGGEST.forEach(q => {
      const b = document.createElement("button"); b.type = "button"; b.className = "v-chat-sug";
      b.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true">' + IC[q.i] + '</svg><span></span>';
      b.querySelector("span").textContent = q.t;
      b.addEventListener("click", () => {
        const input = document.getElementById("aiChatInput"); if(!input) return;
        input.value = q.t; input.dispatchEvent(new Event("input", { bubbles: true })); input.focus();
      });
      box.append(b);
    });
  }
  if(typeof renderAiChatBubbles === "function"){
    const _r = renderAiChatBubbles;
    renderAiChatBubbles = function(){ const out = _r.apply(this, arguments); try{ decorateEmpty(); }catch(e){ console.error(e); } return out; };
  }
  // หน้าแชทถูกวาดตอนเปิดแท็บ: ตามดูการเปลี่ยนในกล่องข้อความ เผื่อมีโค้ดอื่นวาดหน้าว่างเอง
  const body = document.getElementById("aiAnalystBody");
  if(body) new MutationObserver(() => decorateEmpty()).observe(body, { childList: true });
  decorateEmpty();
})();
