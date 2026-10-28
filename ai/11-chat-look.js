// Vaultet — ai/11-chat-look.js : หน้าแชท AI โฉมใหม่ (รอบ 5, ds53)
// หน้าว่าง = ไอคอน + ข้อความสั้น + คำถามแนะนำ (แตะแล้วใส่ในช่องพิมพ์ ยังไม่ส่งเอง — กดส่งเองทุกครั้ง)
// หน้าตาข้อความ/ปุ่มส่งปรับด้วย CSS อย่างเดียว ไม่แตะการเรียก AI
(function(){
  const SUGGEST = ["สรุปการเงินเดือนนี้ให้หน่อย", "หมวดไหนใช้เงินเยอะเกินไป", "ควรออมเดือนละเท่าไหร่ดี", "ช่วยวางแผนใช้เงินเดือนหน้า"];
  const SPARK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l1.800 4.700L18.500 9.500l-4.700 1.800L12 16l-1.800-4.700L5.500 9.500l4.700-1.800z"/><path d="M19 15l.700 1.800 1.800.700-1.800.700L19 20l-.700-1.800-1.800-.700 1.800-.700z"/></svg>';
  function decorateEmpty(){
    const body = document.getElementById("aiAnalystBody");
    const empty = body && body.querySelector(".ai-chat-empty");
    if(!empty || empty.querySelector(".v-chat-sugs")) return;
    const msg = empty.textContent.trim();
    empty.classList.add("v-chat-empty");
    empty.innerHTML = '<span class="v-chat-empty-ic">' + SPARK + '</span><span class="v-chat-empty-s"></span><div class="v-chat-sugs" role="group" aria-label="คำถามแนะนำ"></div>';
    empty.querySelector(".v-chat-empty-s").textContent = msg;
    const box = empty.querySelector(".v-chat-sugs");
    SUGGEST.forEach(q => {
      const b = document.createElement("button"); b.type = "button"; b.className = "v-chat-sug"; b.textContent = q;
      b.addEventListener("click", () => {
        const input = document.getElementById("aiChatInput"); if(!input) return;
        input.value = q; input.dispatchEvent(new Event("input", { bubbles: true })); input.focus();
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
