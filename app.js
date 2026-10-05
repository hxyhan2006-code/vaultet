// ขอให้เบราว์เซอร์เก็บข้อมูลแบบถาวร (ลดโอกาสโดนล้างอัตโนมัติ) + ลงทะเบียน service worker เพื่อให้ติดตั้งเป็นแอปได้
(function(){
  try{ if(navigator.storage && navigator.storage.persist) navigator.storage.persist(); }catch(e){}
  try{ if('serviceWorker' in navigator) window.addEventListener('load',function(){ navigator.serviceWorker.register('sw.js').catch(function(){}); }); }catch(e){}
})();

const THAI_MONTHS_FULL = ["มกราคม","กุมภาพันธ์","มีนาคม","เมษายน","พฤษภาคม","มิถุนายน","กรกฎาคม","สิงหาคม","กันยายน","ตุลาคม","พฤศจิกายน","ธันวาคม"];
const THAI_MONTHS_SHORT = ["ม.ค.","ก.พ.","มี.ค.","เม.ย.","พ.ค.","มิ.ย.","ก.ค.","ส.ค.","ก.ย.","ต.ค.","พ.ย.","ธ.ค."];

const DEFAULT_CATS = {
  income: ["กยศ.", "เงินคืนจากการยืม", "เงินแม่", "ยูทูป", "อื่นๆ"],
  expense: ["กิน", "คาเฟ่", "ค่าหอ (น้ำ/ไฟ)", "ค่าเดินทาง", "ของใช้จำเป็น", "ของชอบ", "เงินหาย/จิปาถะ"],
  saving: ["เงินออม", "ลงทุนหุ้น", "อื่นๆ"],
};

const WITHDRAW_CAT = "ถอนเงินออม"; // รายรับหมวดนี้ = ดึงเงินออมกลับมาใช้ (ไม่นับเป็นรายได้จริง)
const ENTRIES_KEY = "finance_tracker_entries_v1";
const CATS_KEY = "finance_tracker_categories_v1";
const LAST_CAT_KEY = "finance_tracker_last_cat_v1";
const BACKUP_KEY = "finance_tracker_last_backup_v1";
const ACCOUNTS_KEY = "finance_tracker_accounts_v1";
const LAST_ACC_KEY = "finance_tracker_last_account_v1";
const RESERVED_KEY = "finance_tracker_reserved_v1";
const LOANS_KEY = "finance_tracker_loans_v1";
const RECURRING_KEY = "finance_tracker_recurring_v1";
// ===== AI Layer (Milestone 1) =====
// กฎเหล็ก: ห้ามเพิ่มคีย์นี้เข้าไปใน object ของ exportBtn (บรรทัดที่ประกอบ payload สำรองข้อมูล) เด็ดขาด
// เพราะเป็น secret เฉพาะเครื่อง ไม่ใช่ข้อมูลทางการเงินที่ควรอยู่ในไฟล์ backup ที่แชร์ได้
const AI_APIKEY_KEY = "finance_tracker_ai_apikey_v1"; // คีย์เดี่ยวแบบเก่า — เก็บไว้เผื่อ migrate เป็น AI_APIKEYS_KEY เท่านั้น ห้ามอ่าน/เขียนตรงๆ อีก ให้ใช้ getApiKeys()/saveApiKeys() แทน
const AI_APIKEYS_KEY = "finance_tracker_ai_apikeys_v1"; // รายการ Gemini API Key (สูงสุด AI_APIKEYS_MAX อัน) — คีย์แรก=หลัก ที่เหลือ=สำรอง สลับอัตโนมัติเมื่อเจอโควต้าเต็ม (429)
const AI_APIKEYS_MAX = 3;

// คืน array ของ API key ที่ตั้งค่าไว้ (เรียงตามลำดับที่จะลองใช้ก่อน-หลัง) — migrate คีย์เดี่ยวแบบเก่าให้อัตโนมัติครั้งเดียวถ้ามี
function getApiKeys(){
  let arr;
  try{ arr = JSON.parse(localStorage.getItem(AI_APIKEYS_KEY) || "null"); }catch(e){ arr = null; }
  if(Array.isArray(arr)) return arr;
  const legacy = localStorage.getItem(AI_APIKEY_KEY);
  if(legacy){
    arr = [legacy];
    localStorage.setItem(AI_APIKEYS_KEY, JSON.stringify(arr));
    localStorage.removeItem(AI_APIKEY_KEY);
    return arr;
  }
  return [];
}
// สำคัญ: เก็บเฉพาะคีย์เหล่านี้ ห้ามนำไปรวมกับ payload ของ exportBtn เด็ดขาด (ดูคอมเมนต์ด้านบน)
function saveApiKeys(arr){
  localStorage.setItem(AI_APIKEYS_KEY, JSON.stringify(arr));
}

// ===== Google Drive Auto-Backup =====
// ทำงานทั้งหมดฝั่ง client ล้วนๆ ผ่าน Google Identity Services + Drive API ตรงๆ ไม่มี server กลาง
// scope "drive.file" คือ scope แคบสุด — แอปเข้าถึงได้แค่ไฟล์ที่แอปนี้สร้างขึ้นเองเท่านั้น แตะไฟล์อื่นใน Drive ผู้ใช้ไม่ได้เลย
const GDRIVE_CLIENT_ID_KEY = "finance_tracker_gdrive_client_id_v1"; // OAuth Client ID ของผู้ใช้เอง — เป็น public identifier ไม่ใช่ secret แต่ยังเก็บเฉพาะเครื่อง ไม่รวมใน exportBtn
const GDRIVE_FILE_ID_KEY = "finance_tracker_gdrive_file_id_v1"; // Drive fileId ของไฟล์ backup ที่เคยสร้างไว้แล้ว — อัปเดตทับไฟล์เดิมเสมอ ไม่สร้างไฟล์ซ้ำ
const GDRIVE_LAST_SYNC_KEY = "finance_tracker_gdrive_last_sync_v1";
const GDRIVE_AUTOSYNC_KEY = "finance_tracker_gdrive_autosync_v1"; // "1" = เปิดสำรองอัตโนมัติ
const GDRIVE_SCOPE = "https://www.googleapis.com/auth/drive.file";
const GDRIVE_BACKUP_FILENAME = "finance-tracker-backup.json";

let gdriveTokenClient = null;
let gdriveAccessToken = null; // เก็บใน memory เท่านั้น ไม่เขียนลง localStorage
let gdriveAccessTokenExpiry = 0;
let gdriveAutoSyncTimer = null;
let gdriveLastAutoError = "";
let gdriveSyncBusy = false;

function initGDriveTokenClient(){
  const clientId = localStorage.getItem(GDRIVE_CLIENT_ID_KEY);
  if(!clientId || typeof google === "undefined" || !google.accounts || !google.accounts.oauth2) return null;
  gdriveTokenClient = google.accounts.oauth2.initTokenClient({
    client_id: clientId,
    scope: GDRIVE_SCOPE,
    callback: "" // ตั้งทับใหม่ทุกครั้งก่อนขอ token จริงในฟังก์ชัน requestGDriveToken()
  });
  return gdriveTokenClient;
}
// promptMode: "" = ลองแบบเงียบๆ ก่อน (ใช้ session ที่ล็อกอิน Google ไว้อยู่แล้ว ไม่มี popup ถ้าเคย consent แล้ว)
//             "consent" = เปิด popup ให้ผู้ใช้ล็อกอิน/ยืนยันสิทธิ์ใหม่ (ต้องเรียกจาก user gesture เท่านั้น กันโดน popup blocker)
function requestGDriveToken(promptMode){
  return new Promise((resolve, reject) => {
    if(!gdriveTokenClient) initGDriveTokenClient();
    if(!gdriveTokenClient){ reject(new Error("no_client_id")); return; }
    gdriveTokenClient.callback = (resp) => {
      if(!resp || resp.error){ reject(resp || new Error("token_error")); return; }
      gdriveAccessToken = resp.access_token;
      gdriveAccessTokenExpiry = Date.now() + (resp.expires_in * 1000 - 60000);
      resolve(gdriveAccessToken);
    };
    gdriveTokenClient.requestAccessToken({ prompt: promptMode });
  });
}
// คืน access token ที่ใช้ได้ — ใช้ตัวที่ cache ไว้ถ้ายังไม่หมดอายุ ไม่งั้นลองขอเงียบๆ ก่อน
async function ensureGDriveToken(){
  if(gdriveAccessToken && Date.now() < gdriveAccessTokenExpiry) return gdriveAccessToken;
  return await requestGDriveToken("");
}

// ===== Vaultet Backup Engine (A+) =====
// ศูนย์กลาง Backup/Restore ของแอป: เก็บข้อมูลที่จำเป็นต่อการกู้ Vaultet
// พร้อมจับ localStorage namespace ใหม่ๆ โดยอัตโนมัติ เพื่อไม่ต้องแก้ buildBackupPayload() ทุกครั้งที่เพิ่มฟีเจอร์
const VAULTET_BACKUP_SCHEMA_VERSION = 3;
const VAULTET_BACKUP_EXCLUDED_KEYS = new Set([
  AI_APIKEY_KEY, AI_APIKEYS_KEY,
  GDRIVE_CLIENT_ID_KEY, GDRIVE_FILE_ID_KEY, GDRIVE_LAST_SYNC_KEY, GDRIVE_AUTOSYNC_KEY,
  BACKUP_KEY
]);
const VAULTET_BACKUP_ALLOWED_PREFIXES = ["finance_tracker_", "vaultet_"];
const VAULTET_BACKUP_EXCLUDED_PREFIXES = [
  "gdrive_access_token", "oauth_", "session_", "cache_", "tmp_"
];

function shouldBackupLocalStorageKey(key){
  if(!key || VAULTET_BACKUP_EXCLUDED_KEYS.has(key)) return false;
  if(!VAULTET_BACKUP_ALLOWED_PREFIXES.some(prefix => key.startsWith(prefix))) return false;
  return !VAULTET_BACKUP_EXCLUDED_PREFIXES.some(prefix => key.startsWith(prefix));
}

function collectVaultetLocalStorage(){
  const out = {};
  try{
    for(let i=0;i<localStorage.length;i++){
      const key = localStorage.key(i);
      if(!shouldBackupLocalStorageKey(key)) continue;
      const value = localStorage.getItem(key);
      if(value !== null) out[key] = value;
    }
  }catch(e){}
  return out;
}

function getVaultetAppVersion(){
  return document.querySelector('meta[name=\"apple-mobile-web-app-title\"]')?.content || 'Vaultet';
}

// Backup envelope มีทั้งข้อมูลแบบเดิม (เพื่อ backward compatibility) และ localStorage snapshot
// จึงรองรับข้อมูลฟีเจอร์ใหม่ที่ถูก persist ใน localStorage โดยไม่ต้องแก้รายการทุกครั้ง
// SHA-256 แบบ sync (ใช้ได้ทุกบริบท ไม่พึ่ง crypto.subtle) — ใช้ตรวจว่าไฟล์สำรองไม่เสีย/ไม่ถูกแก้
function vaultetSha256(str){
  const K=[],H=[]; let p=2;
  while(K.length<64){ let ok=true; for(let i=2;i*i<=p;i++){ if(p%i===0){ok=false;break;} } if(ok){ K.push(Math.floor((Math.cbrt(p)%1)*4294967296)); if(H.length<8) H.push(Math.floor((Math.sqrt(p)%1)*4294967296)); } p++; }
  const data=new TextEncoder().encode(str), l=data.length, total=((l+9+63)>>6)<<6, buf=new Uint8Array(total);
  buf.set(data); buf[l]=0x80;
  const dv=new DataView(buf.buffer); dv.setUint32(total-8,Math.floor(l/536870912)); dv.setUint32(total-4,(l<<3)>>>0);
  const w=new Uint32Array(64), h=Uint32Array.from(H), rr=(x,n)=>(x>>>n)|(x<<(32-n));
  for(let o=0;o<total;o+=64){
    for(let i=0;i<16;i++) w[i]=dv.getUint32(o+i*4);
    for(let i=16;i<64;i++){ const a=w[i-15], b=w[i-2], s0=rr(a,7)^rr(a,18)^(a>>>3), s1=rr(b,17)^rr(b,19)^(b>>>10); w[i]=(w[i-16]+s0+w[i-7]+s1)>>>0; }
    let [a,b,c,d,e,f,g,hh]=h;
    for(let i=0;i<64;i++){ const S1=rr(e,6)^rr(e,11)^rr(e,25), ch=(e&f)^(~e&g), t1=(hh+S1+ch+K[i]+w[i])>>>0, S0=rr(a,2)^rr(a,13)^rr(a,22), mj=(a&b)^(a&c)^(b&c), t2=(S0+mj)>>>0; hh=g; g=f; f=e; e=(d+t1)>>>0; d=c; c=b; b=a; a=(t1+t2)>>>0; }
    h[0]=(h[0]+a)>>>0; h[1]=(h[1]+b)>>>0; h[2]=(h[2]+c)>>>0; h[3]=(h[3]+d)>>>0; h[4]=(h[4]+e)>>>0; h[5]=(h[5]+f)>>>0; h[6]=(h[6]+g)>>>0; h[7]=(h[7]+hh)>>>0;
  }
  return Array.from(h).map(x=>x.toString(16).padStart(8,"0")).join("");
}
function verifyBackupIntegrity(data){
  const ig=data&&data.integrity; if(!ig||!ig.hash) return {status:"none"};
  try{ const copy=Object.assign({},data); delete copy.integrity; const h=vaultetSha256(JSON.stringify(copy)); return {status:h===ig.hash?"ok":"mismatch",hash:h,expected:ig.hash}; }catch(e){ return {status:"none"}; }
}
function buildBackupPayload(){
  const ls=collectVaultetLocalStorage();
  const payload={
    backupSchemaVersion: VAULTET_BACKUP_SCHEMA_VERSION,
    app: "Vaultet",
    appVersion: getVaultetAppVersion(),
    exportedAt: new Date().toISOString(),
    timezone: (()=>{ try{ return Intl.DateTimeFormat().resolvedOptions().timeZone||""; }catch(e){ return ""; } })(),
    entries,
    categories: CATS_BY_TYPE,
    accounts,
    reservedItems,
    loans,
    recurringExpenses,
    debts,
    budgets,
    emergencyFundConfig,
    appState: { localStorage: ls }
  };
  const sumBy=t=>entries.filter(e=>e.type===t).reduce((a,e)=>a+toCents(e.amount),0)/100;
  const text=JSON.stringify(payload);
  payload.integrity={ algorithm:"sha256", hash:vaultetSha256(text), chars:text.length,
    counts:{ entries:entries.length, accounts:accounts.length, reservedItems:reservedItems.length, loans:loans.length, recurringExpenses:recurringExpenses.length, debts:debts.length, budgets:budgets.length, storageKeys:Object.keys(ls).length },
    totals:{ income:sumBy("income"), expense:sumBy("expense"), saving:sumBy("saving") } };
  return payload;
}
function downloadJsonFile(obj,filename){
  const blob=new Blob([JSON.stringify(obj,null,2)],{type:"application/json"}), url=URL.createObjectURL(blob), a=document.createElement("a");
  a.href=url; a.download=filename; document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(url),4000);
}
function backupStamp(){ const d=new Date(), p=n=>String(n).padStart(2,"0"); return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`; }

// ถ้ามีฟีเจอร์ใหม่เขียน localStorage ในอนาคต มันจะเข้าคิว auto-sync เองเมื่อเปิดไว้
(function installBackupStorageWatcher(){
  if(window.__vaultetBackupStorageWatcherInstalled) return;
  window.__vaultetBackupStorageWatcherInstalled = true;
  try{
    const originalSetItem = localStorage.setItem.bind(localStorage);
    const originalRemoveItem = localStorage.removeItem.bind(localStorage);
    localStorage.setItem = function(key,value){
      const result = originalSetItem(key,value);
      if(shouldBackupLocalStorageKey(String(key)) && typeof scheduleGDriveAutoSync === 'function') scheduleGDriveAutoSync();
      return result;
    };
    localStorage.removeItem = function(key){
      const result = originalRemoveItem(key);
      if(shouldBackupLocalStorageKey(String(key)) && typeof scheduleGDriveAutoSync === 'function') scheduleGDriveAutoSync();
      return result;
    };
  }catch(e){}
})();

// สร้าง/อัปเดตไฟล์ backup เดิมบน Drive (multipart upload ตาม Drive API v3) — คืน Drive file object เมื่อสำเร็จ
async function gdriveUploadBackup(){
  const token = await ensureGDriveToken();
  const payload = buildBackupPayload();
  const fileId = localStorage.getItem(GDRIVE_FILE_ID_KEY);
  // กันข้อมูลในเครื่องว่าง (เช่น ล้างเบราว์เซอร์) ไปทับไฟล์สำรองดีๆ บน Drive
  if(fileId && !payload.entries.length && !payload.accounts.length) throw new Error("empty_state_guard");
  const metadata = fileId ? {} : { name: GDRIVE_BACKUP_FILENAME, mimeType: "application/json" };
  const boundary = "finance_tracker_backup_boundary";
  const body =
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n` +
    `--${boundary}\r\nContent-Type: application/json\r\n\r\n${JSON.stringify(payload, null, 2)}\r\n` +
    `--${boundary}--`;
  const url = fileId
    ? `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=multipart`
    : `https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart`;
  const res = await fetch(url, {
    method: fileId ? "PATCH" : "POST",
    headers: { "Authorization": "Bearer " + token, "Content-Type": `multipart/related; boundary=${boundary}` },
    body
  });
  if(!res.ok) throw new Error("upload_failed_" + res.status);
  const data = await res.json();
  if(!fileId && data.id) localStorage.setItem(GDRIVE_FILE_ID_KEY, data.id);
  // อ่านไฟล์กลับจาก Drive มาเทียบรหัสตรวจกับต้นฉบับ เพื่อยืนยันว่าบันทึกครบตรงจริง
  const vid = fileId || data.id;
  const back = await fetch(`https://www.googleapis.com/drive/v3/files/${vid}?alt=media`, { headers: { "Authorization": "Bearer " + token } });
  if(!back.ok) throw new Error("verify_failed_" + back.status);
  const parsed = await back.json();
  if(verifyBackupIntegrity(parsed).hash !== payload.integrity.hash) throw new Error("verify_failed");
  localStorage.setItem(GDRIVE_LAST_SYNC_KEY, new Date().toISOString());
  return data;
}
// ดึงไฟล์ backup ล่าสุดกลับมาจาก Drive เป็น object เดียวกับที่ import ไฟล์ธรรมดาใช้
async function gdriveDownloadBackup(){
  const token = await ensureGDriveToken();
  const fileId = localStorage.getItem(GDRIVE_FILE_ID_KEY);
  if(!fileId) throw new Error("no_backup_file_yet");
  const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
    headers: { "Authorization": "Bearer " + token }
  });
  if(!res.ok) throw new Error("download_failed_" + res.status);
  return await res.json();
}
// เรียกจากท้าย render() ทุกครั้ง — debounce ไว้ 4 วิ กันยิงอัปโหลดรัวๆ ตอนแก้ข้อมูลติดกันหลายจุด
function scheduleGDriveAutoSync(){
  if(localStorage.getItem(GDRIVE_AUTOSYNC_KEY) !== "1") return;
  if(!localStorage.getItem(GDRIVE_CLIENT_ID_KEY)) return;
  clearTimeout(gdriveAutoSyncTimer);
  gdriveAutoSyncTimer = setTimeout(() => {
    // Auto-sync may upload only when an already-valid token exists.
    // It must never initiate OAuth/popup after page load or refresh.
    runGDriveSync(true);
  }, 4000);
}
function scheduleGDriveAutoSyncIfReady(){
  if(localStorage.getItem(GDRIVE_AUTOSYNC_KEY)==="1" && gdriveAccessToken && Date.now()<gdriveAccessTokenExpiry){
    scheduleGDriveAutoSync();
  }
}
window.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')scheduleGDriveAutoSyncIfReady();});
window.addEventListener('focus',scheduleGDriveAutoSyncIfReady);
// silent=true คือเรียกจาก auto-sync เบื้องหลัง (ห้ามโชว์ toast ถ้าพลาด แค่อัปเดตสถานะเงียบๆ ให้ผู้ใช้เห็นตอนเข้าตั้งค่า)
async function runGDriveSync(silent){
  // Never request Google OAuth from a background timer.
  // requestAccessToken() may open a browser popup when the token is missing/expired,
  // and Chrome blocks that because there is no direct user gesture.
  if(silent && !(gdriveAccessToken && Date.now() < gdriveAccessTokenExpiry)) return;
  if(gdriveSyncBusy) return;
  gdriveSyncBusy = true;
  try{
    await gdriveUploadBackup();
    gdriveLastAutoError="";
    if(!silent) showToast("สำรองขึ้น Google Drive แล้ว ✓ ตรวจแล้วตรงกับต้นฉบับ");
  }catch(e){
    if(String(e?.message||e).includes("upload_failed_401") || String(e?.message||e).includes("upload_failed_403")){ gdriveAccessToken=null; gdriveAccessTokenExpiry=0; }
    gdriveLastAutoError = (String(e?.message||e).includes("401") || String(e?.message||e).includes("403")) ? "Auto Backup ใช้งานไม่ได้ — ต้องเชื่อมต่อ Google Drive ใหม่" : "Auto Backup ล่าสุดไม่สำเร็จ — ตรวจสอบการเชื่อมต่อ Google Drive";
    if(/empty_state_guard/.test(String(e?.message||e))){ gdriveLastAutoError="ข้อมูลในเครื่องว่าง จึงไม่ทับไฟล์สำรองบน Drive — กู้คืนจาก Drive ก่อน"; if(!silent) showToast(gdriveLastAutoError); }
    else if(/verify_failed/.test(String(e?.message||e))){ gdriveLastAutoError="อัปโหลดแล้วแต่ตรวจกลับไม่ตรงกับต้นฉบับ — ลองสำรองใหม่อีกครั้ง"; if(!silent) showToast(gdriveLastAutoError); }
    else if(!silent) showToast("สำรองขึ้น Drive ไม่สำเร็จ — ลองเชื่อมต่อ Google Drive ใหม่");
  }finally{
    gdriveSyncBusy = false;
    if(document.getElementById("settingsOverlay").classList.contains("open")) refreshGDriveStatus();
  }
}

// ===== AI Layer (Milestone 3) =====
// กฎเหล็กเดียวกับ AI_APIKEY_KEY: ห้ามเพิ่มคีย์นี้เข้าไปใน object ของ exportBtn เด็ดขาด — เป็นข้อมูลเฉพาะเครื่อง ไม่ใช่ backup การเงิน
const AI_PROFILE_KEY = "finance_tracker_ai_profile_v1";
const AI_CHAT_KEY = "finance_tracker_ai_chat_v1"; // ประวัติแชทแบบเก่า (เดี่ยว) — เก็บไว้เผื่อ migrate เป็น AI_CHATS_KEY
const AI_CHATS_KEY = "finance_tracker_ai_chats_v1"; // ระบบแชทหลายรายการ (เหมือน ChatGPT/Gemini) — {chats:[{id,title,messages,createdAt,updatedAt}], activeId}
const AI_MEMORY_KEY = "finance_tracker_ai_memory_v1"; // ความจำระยะยาวของ AI ที่ปรึกษาการเงิน — [{id,text,createdAt}]
const AI_ADVISOR_INSTRUCTION_KEY = "finance_tracker_ai_advisor_instruction_v1"; // คำสั่งปรับบุคลิก/รูปแบบคำตอบของที่ปรึกษา AI
// Milestone 4: แคชผลวิเคราะห์ Proactive Insight — เก็บแยกจากทุกคีย์ข้างบน ห้ามรวมเข้า exportBtn backup
const AI_PROACTIVE_KEY = "finance_tracker_ai_proactive_v1";
// Milestone 5: หนี้สิน (เช่น กยศ.) — เก็บรวมกับ exportBtn backup ได้ตามปกติ (ไม่ใช่ secret เฉพาะเครื่อง)
const DEBTS_KEY = "finance_tracker_debts_v1";
const BUDGETS_KEY = "finance_tracker_budgets_v1"; // Round 1 Budget Engine
const EMERGENCY_KEY = "finance_tracker_emergency_fund_v1"; // Round 2 Emergency Fund
let emergencyFundConfig = { targetMonths:3, essentialCategories:["กิน","ค่าหอ (น้ำ/ไฟ)","ค่าเดินทาง","ของใช้จำเป็น"] };
const UNASSIGNED_ACCOUNT_ID = "unassigned";

let entries = [];
let CATS_BY_TYPE = { income: [...DEFAULT_CATS.income], expense: [...DEFAULT_CATS.expense], saving: [...DEFAULT_CATS.saving] };
let lastUsedCat = { income: "", expense: "", saving: "" };
let accounts = []; // { id, name, initialBalance }
let lastUsedAccountId = "";
let reservedItems = []; // { id, name, amount, dueDate, note }
let loans = []; // { id, person, amount, date, dueDate, note, accountId, repayments:[{id,amount,date,accountId}] }
// debt: { id, name, type, outstandingBalance, gracePeriod, note, history:[{id,type:"increase"|"adjustment"|"repayment",amount,date,note}] }
let debts = [];
const BRAIN_TARGETS = { savingsRatePct:20, essentialMaxPct:50, discretionaryMaxPct:30, emergencyMonths:3 }; // เกณฑ์กลางที่ AI ต้องใช้ให้ตรงกับหน้า Brain
const BRAIN_TARGETS_KEY = "vaultet_brain_targets_v1"; // {months:{"YYYY-MM":{savingsRatePct,essentialMaxPct,discretionaryMaxPct}}}
function getBrainTargets(month){ month=month||monthKey(todayISO()); try{ const o=JSON.parse(localStorage.getItem(BRAIN_TARGETS_KEY)||"{}"); const m=o.months&&o.months[month]; if(m) return Object.assign({},BRAIN_TARGETS,m,{custom:true}); }catch(e){} return Object.assign({},BRAIN_TARGETS,{custom:false}); }
let budgets = []; // { id, category, amount, period:"monthly", month:"YYYY-MM", enabled, createdAt, updatedAt }
// ===== Phase 4: Recurring Expenses + Upcoming Payments =====
// recurringExpenses: { id, name, amount, category, accountId, frequency, nextDueDate, startDate, endDate, note, status, reservedItemId, lastPaidDate }
// frequency: weekly | monthly | bimonthly | quarterly | yearly
// status: active | paused | cancelled  (นี่คือสถานะที่ผู้ใช้ตั้งเอง แยกจาก "overdue/dueToday/upcoming" ที่คำนวณจากวันที่)
let recurringExpenses = [];
let upcomingFilter = "30d"; // 7d | 30d | thisMonth | nextMonth | all
let markPaidRecurringId = null;
let analysisPreset = "thisMonth";
let analysisStart = "";
let analysisEnd = "";
let analysisAccountFilter = "";
// ===== Phase 3: Compare Period state =====
let comparePreset = "thisMonthVsLastMonth";
let compareAccountFilter = "";
let compareAStart = "";
let compareAEnd = "";
let compareBStart = "";
let compareBEnd = "";
let compareCategorySort = "changed"; // changed | increase | decrease | total
let compareDetailExpanded = false;
let selectedMonth = "";
let typeFilter = "all";
let searchQuery = "";
let formType = "expense";
let selectedCategory = "";
let orphanCategory = null; // category from an existing entry that no longer exists in CATS_BY_TYPE; kept visible so editing doesn't silently reassign it
let editingId = null;
let searchAllMonths = false;
let expandedBreakdown = { income:false, expense:false, saving:false }; // แต่ละบล็อก breakdown พับ/กางแยกกัน
// ===== Phase 5: Cash Flow Forecast state =====
let forecastRangePreset = "30"; // "7" | "30" | "60" | "90" | "custom"
let forecastCustomDays = 30;
let forecastTimelineExpanded = false;
// ===== AI Layer (Milestone 3) state =====
// สำเนาโปรไฟล์ที่กำลังแก้ไขอยู่ในหน้า Settings — sync กับ localStorage ทันทีทุกครั้งที่เพิ่ม/ลบเป้าหมาย
let aiProfileDraft = null;

function makeId(){
  if(window.crypto && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 9);
}
// รวมเงินด้วยหน่วยสตางค์ (integer) ก่อน แล้วค่อยหารคืนเป็นบาท กันปัญหา floating point เพี้ยนสะสม เช่น 0.1+0.2
function toCents(n){ return Math.round(Number(n || 0) * 100); }

function todayISO(){
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth()+1).padStart(2,"0");
  const day = String(d.getDate()).padStart(2,"0");
  return `${y}-${m}-${day}`;
}
function monthKey(d){ return d.slice(0,7); }
function fmt(n){ return new Intl.NumberFormat("th-TH",{maximumFractionDigits:2}).format(n); }
function monthLabel(mk){
  const [rawY,m] = String(mk).split("-").map(Number);
  // เก็บ key ภายในเป็น ค.ศ.; ถ้าเจอ พ.ศ. จากข้อมูลเก่าให้ไม่บวก 543 ซ้ำ
  const y = rawY > 2400 ? rawY : rawY + 543;
  return `${THAI_MONTHS_FULL[m-1]||""} ${y}`;
}
function dayLabel(iso){
  const [y,m,d] = iso.split("-").map(Number);
  return `${d} ${THAI_MONTHS_SHORT[m-1]}`;
}
function escapeHtml(s){
  const d = document.createElement("div");
  d.textContent = s == null ? "" : String(s);
  return d.innerHTML;
}
function showToast(msg){
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(showToast._timer);
  showToast._timer = setTimeout(() => t.classList.remove("show"), 2200);
}

// แจ้งเตือนคำตอบ AI พร้อมแล้ว — ใช้ตอนผู้ใช้ปิดหน้าต่างแชท (หรือกด "หน้าหลัก" ไปดูอย่างอื่นในแอป) ระหว่างรอ AI ตอบ
// หมายเหตุ: ทำงานได้เฉพาะตอนที่ยังเปิดแท็บ/แอปนี้ค้างอยู่เท่านั้น (การเรียก fetch ยังทำงานต่อในพื้นหลังของหน้านี้ได้ปกติแม้ปิดชีทแชท)
// ถ้าผู้ใช้ปิดแท็บ/ออกจากแอปไปจริงๆ คำขอจะถูกตัดตามข้อจำกัดของเบราว์เซอร์ ต้องมีฝั่งเซิร์ฟเวอร์ + push notification ถึงจะแจ้งเตือนได้แม้ปิดแอป
function markAiChatUnread(){
  document.getElementById("aiFabBtn").classList.add("has-unread");
}
function clearAiChatUnread(){
  document.getElementById("aiFabBtn").classList.remove("has-unread");
}

function loadEntries(){
  try{
    const raw = localStorage.getItem(ENTRIES_KEY);
    entries = raw ? JSON.parse(raw) : [];
  }catch(e){ entries = []; }
}
function saveEntries(){
  try{
    const res = localStorage.setItem(ENTRIES_KEY, JSON.stringify(entries));
    document.getElementById("errorBanner").style.display = "none";
    refreshProactiveCard();
    return true;
  }catch(e){
    document.getElementById("errorBanner").style.display = "block";
    return false;
  }
}
function loadCategories(){
  try{
    const raw = localStorage.getItem(CATS_KEY);
    if(raw){
      const parsed = JSON.parse(raw);
      CATS_BY_TYPE = {
        income: parsed.income && parsed.income.length ? parsed.income : [...DEFAULT_CATS.income],
        expense: parsed.expense && parsed.expense.length ? parsed.expense : [...DEFAULT_CATS.expense],
        saving: parsed.saving && parsed.saving.length ? parsed.saving : [...DEFAULT_CATS.saving],
      };
    }
  }catch(e){ /* keep defaults */ }
  try{ if(!localStorage.getItem("vaultet_wd_cat_v1")){ if(!CATS_BY_TYPE.income.includes(WITHDRAW_CAT)){ CATS_BY_TYPE.income.push(WITHDRAW_CAT); saveCategories(); } localStorage.setItem("vaultet_wd_cat_v1","1"); } }catch(e){}
}
function saveCategories(){
  try{ localStorage.setItem(CATS_KEY, JSON.stringify(CATS_BY_TYPE)); }catch(e){}
}
function loadLastCat(){
  try{
    const raw = localStorage.getItem(LAST_CAT_KEY);
    if(raw){
      const parsed = JSON.parse(raw);
      lastUsedCat = { income: parsed.income || "", expense: parsed.expense || "", saving: parsed.saving || "" };
    }
  }catch(e){ /* keep defaults */ }
}
function saveLastCat(){
  try{ localStorage.setItem(LAST_CAT_KEY, JSON.stringify(lastUsedCat)); }catch(e){}
}
function loadAccounts(){
  try{
    const raw = localStorage.getItem(ACCOUNTS_KEY);
    accounts = raw ? JSON.parse(raw) : [];
  }catch(e){ accounts = []; }
  if(!accounts.length){
    // บัญชีเริ่มต้นสำหรับข้อมูลเก่าที่ยังไม่เคยมีระบบบัญชี — รายการเก่าทั้งหมดจะถูกนับรวมอยู่ในนี้
    accounts = [{ id: UNASSIGNED_ACCOUNT_ID, name: "ไม่ระบุบัญชี", initialBalance: 0 }];
    saveAccounts();
  }
}
function saveAccounts(){
  try{ localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(accounts)); }catch(e){}
}
function loadLastAccount(){
  try{ lastUsedAccountId = localStorage.getItem(LAST_ACC_KEY) || ""; }catch(e){ lastUsedAccountId = ""; }
}
function saveLastAccount(){
  try{ localStorage.setItem(LAST_ACC_KEY, lastUsedAccountId); }catch(e){}
}
function loadReserved(){
  try{
    const raw = localStorage.getItem(RESERVED_KEY);
    reservedItems = raw ? JSON.parse(raw) : [];
  }catch(e){ reservedItems = []; }
}
function saveReserved(){
  try{ localStorage.setItem(RESERVED_KEY, JSON.stringify(reservedItems)); }catch(e){}
}
function loadLoans(){
  try{
    const raw = localStorage.getItem(LOANS_KEY);
    loans = raw ? JSON.parse(raw) : [];
  }catch(e){ loans = []; }
  loans.forEach(l => { if(!Array.isArray(l.repayments)) l.repayments = []; if(!Array.isArray(l.adjustments)) l.adjustments = []; });
}
function saveLoans(){
  try{ localStorage.setItem(LOANS_KEY, JSON.stringify(loans)); }catch(e){}
  refreshProactiveCard();
}
// ===== Milestone 5: Debt Management Engine — storage =====
function loadDebts(){
  try{
    const raw = localStorage.getItem(DEBTS_KEY);
    debts = raw ? JSON.parse(raw) : [];
    if(!Array.isArray(debts)) debts = [];
  }catch(e){ debts = []; }
  debts.forEach(d => { if(!Array.isArray(d.history)) d.history = []; });
}
function saveDebts(){
  try{ localStorage.setItem(DEBTS_KEY, JSON.stringify(debts)); }catch(e){}
  refreshProactiveCard();
}

// ===== Round 2: Emergency Fund — storage + deterministic calculations =====
const DEFAULT_ESSENTIAL_CATS = ["กิน","ค่าหอ (น้ำ/ไฟ)","ค่าเดินทาง","ของใช้จำเป็น"];
function normalizeEmergencyConfig(raw){
  const r = raw && typeof raw === "object" ? raw : {};
  let months = Number(r.targetMonths);
  if(!isFinite(months) || months <= 0) months = 3;
  months = Math.min(24, Math.max(1, Math.round(months*10)/10));
  const cats = Array.isArray(r.essentialCategories) ? r.essentialCategories.map(String) : DEFAULT_ESSENTIAL_CATS.slice();
  return { targetMonths:months, essentialCategories:[...new Set(cats)] };
}
function loadEmergencyFundConfig(){
  try{ const raw=localStorage.getItem(EMERGENCY_KEY); emergencyFundConfig=normalizeEmergencyConfig(raw?JSON.parse(raw):null); }catch(e){ emergencyFundConfig=normalizeEmergencyConfig(null); }
}
function saveEmergencyFundConfig(){ try{ localStorage.setItem(EMERGENCY_KEY,JSON.stringify(emergencyFundConfig)); }catch(e){} }
function getEmergencyEssentialCategories(){
  const available=CATS_BY_TYPE.expense||[];
  const chosen=(emergencyFundConfig.essentialCategories||[]).filter(c=>available.includes(c));
  return chosen.length ? chosen : available.filter(c=>DEFAULT_ESSENTIAL_CATS.includes(c));
}
function computeEssentialExpenseForMonth(month,categories){
  const bounds=monthBoundsISO(Number(month.slice(0,4)),Number(month.slice(5,7))-1);
  const a=computePeriodAnalysisForRange(bounds.start,bounds.end,null);
  const wanted=new Set(categories);
  return a.breakdown.filter(r=>wanted.has(r.cat)).reduce((sum,r)=>sum+Number(r.amount||0),0);
}
function computeEmergencyFund(){
  const cats=getEmergencyEssentialCategories();
  const now=new Date();
  const currentMonth=monthKey(todayISO());
  const months=[];
  for(let i=1;i<=3;i++){ const d=new Date(now.getFullYear(),now.getMonth()-i,1); months.push(monthKey(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-01`)); }
  const firstDate=[...entries.map(e=>e.date),...loans.map(l=>l.date)].filter(Boolean).sort()[0];
  const firstMonth=firstDate?monthKey(firstDate):currentMonth;
  const completed=months.filter(m=>m>=firstMonth).map(m=>computeEssentialExpenseForMonth(m,cats)).filter(v=>isFinite(v)); // ไม่เอาเดือนก่อนเริ่มใช้งานมาหาร
  const currentEssential=computeEssentialExpenseForMonth(currentMonth,cats);
  const avgBase=completed.length && completed.some(v=>v>0) ? completed.reduce((a,b)=>a+b,0)/completed.length : currentEssential;
  const essentialMonthly=Math.max(0,avgBase||0);
  const targetMonths=Math.max(1,Number(emergencyFundConfig.targetMonths)||3);
  const recommended=Math.max(0,essentialMonthly*targetMonths);
  const currentAvailable=Math.max(0,getTotalMoneyAllAccounts()-getTotalReserved())+getEmergencySaved();
  const coverage=essentialMonthly>0 ? currentAvailable/essentialMonthly : 0;
  const progress=recommended>0 ? Math.min(100,currentAvailable/recommended*100) : (currentAvailable>0?100:0);
  let status="CRITICAL";
  if(recommended<=0) status=currentAvailable>0?"HEALTHY":"WATCH";
  else if(currentAvailable>=recommended) status="HEALTHY";
  else if(currentAvailable>=recommended*0.5) status="WATCH";
  return { emergencySaved:getEmergencySaved(), cashAvailable:Math.max(0,getTotalMoneyAllAccounts()-getTotalReserved()), targetMonths, essentialCategories:cats, monthlyEssentialExpense:essentialMonthly, recommendedEmergencyFund:recommended, currentAvailableReserve:currentAvailable, reserveCoverageMonths:coverage, reserveProgressPercent:progress, reserveShortfall:Math.max(0,recommended-currentAvailable), status, historicalEssentialExpenses:completed, currentMonthEssentialExpense:currentEssential };
}

// ===== Round 1: Budget Engine storage + deterministic calculations =====
function bKey(month,cats,kind){ return (kind==="saving"?"S|":"")+month+"|"+(cats||[]).slice().sort().join("+"); }
function budgetKey(b){ return bKey(b.month,(b.categories||[b.category]),b.kind); }
function getMonthSavingByCategories(month,cats){ const set=new Set(cats||[]); return entries.filter(e=>e.type==="saving" && monthKey(e.date)===month && set.has(e.category)).reduce((s,e)=>s+toCents(e.amount),0)/100; }
// ===== เงินสำรองเผื่อเหตุไม่คาดฝันรายเดือน (buffer) =====
const BUFFER_KEY="vaultet_buffer_v1";
function __readBuffer(){ let o={}; try{o=JSON.parse(localStorage.getItem(BUFFER_KEY)||"{}");}catch(e){} o.months=o.months||{}; return o; }
function getBufferInfo(month=monthKey(todayISO())){
  const amt=__readBuffer().months[month]; if(amt==null) return null;
  const covered=new Set(); budgets.filter(b=>b.enabled!==false&&(b.kind||"expense")==="expense"&&b.month===month).forEach(b=>(b.categories||[]).forEach(c=>covered.add(c)));
  const used=covered.size?entries.filter(e=>e.type==="expense"&&monthKey(e.date)===month&&!covered.has(e.category)).reduce((t,e)=>t+toCents(e.amount),0)/100:0;
  const swept=Number((__readBuffer().swept||{})[month]||0);
  return {month,amount:Number(amt),used,swept,remaining:Number(amt)-used-swept,daysLeft:getBudgetRemainingDays(month)};
}
// ===== รายรับฐาน: เฉลี่ยย้อนหลังสูงสุด 3 เดือนที่ผ่านมาแล้ว (ไม่นับถอนเงินออม/เงินที่ถูกคืนจากการยืม) =====
function sweepBufferToSaving(month,amount,category){
  const bf=getBufferInfo(month); if(!bf) return {ok:false,msg:"ยังไม่ได้ตั้งเงินสำรองเดือนนี้"};
  const amt=Math.round(Number(amount)*100)/100; if(!(amt>0)) return {ok:false,msg:"จำนวนเงินไม่ถูกต้อง"};
  if(amt>bf.remaining+0.005) return {ok:false,msg:`เงินสำรองเหลือแค่ ฿${fmt(Math.max(0,bf.remaining))}`};
  const sc=CATS_BY_TYPE.saving||[], cat=sc.includes(category)?category:(sc.includes("เงินออม")?"เงินออม":sc[0]); if(!cat) return {ok:false,msg:"ยังไม่มีหมวดออม"};
  const acc=accounts.find(x=>x.id!==UNASSIGNED_ACCOUNT_ID)||accounts[0];
  const r=commitEntry({type:"saving",category:cat,accountId:acc?acc.id:UNASSIGNED_ACCOUNT_ID,amount:amt,date:todayISO(),note:"ย้ายเศษเงินสำรอง "+monthLabel(month)});
  if(!r||!r.ok) return {ok:false,msg:"บันทึกรายการออมไม่สำเร็จ"};
  const o=__readBuffer(); o.swept=o.swept||{}; o.swept[month]=Math.round((Number(o.swept[month]||0)+amt)*100)/100; localStorage.setItem(BUFFER_KEY,JSON.stringify(o));
  return {ok:true,entry:r.entry,amount:amt,category:cat};
}
// แผนปิดเดือนที่คำนวณด้วยโค้ด (AI ไม่ต้องคิดเลขเอง): เงินสำรองที่เหลือ → เติมเงินสำรองฉุกเฉิน → เป้าออมเดือนนี้ → ออมเพิ่ม
function buildMonthEndPlan(snapshot){
  const month=monthKey(todayISO()), bf=getBufferInfo(month), sv=computeBudgetSummary(month,"saving"), ex=computeBudgetSummary(month);
  const ef=(snapshot&&snapshot.emergencyFund)||{}, efGap=Math.max(0,Number(ef.reserveShortfall||0)), sc=CATS_BY_TYPE.saving||[];
  const defCat=sc.includes("เงินออม")?"เงินออม":(sc[0]||null), emCat=sc.find(c=>c.includes("สำรอง"))||defCat;
  let left=bf?Math.max(0,Math.round(bf.remaining*100)/100):0;
  const toEm=Math.min(left,efGap); left=Math.round((left-toEm)*100)/100;
  const goalGap=Math.max(0,sv.totalRemaining||0), toGoal=Math.min(left,goalGap); left=Math.round((left-toGoal)*100)/100;
  const waterfall=[{to:"เติมเงินสำรองฉุกเฉิน",category:emCat,amount:Math.round(toEm*100)/100},{to:"เติมเป้าออมเดือนนี้",category:defCat,amount:Math.round(toGoal*100)/100},{to:"ออมเพิ่ม (หรือเก็บไว้เป็น buffer เดือนหน้า)",category:defCat,amount:left}].filter(x=>x.amount>0&&x.category);
  return {month,daysLeft:getBudgetRemainingDays(month),buffer:bf,emergencyFundGap:efGap,savingGoalGap:goalGap,overBudget:ex.rows.filter(r=>r.status==="OVER").map(r=>({category:r.category,over:Math.round(-r.remaining)})),waterfall,note:bf?(bf.remaining<0?"ใช้เกินเงินสำรอง":""):"ยังไม่ได้ตั้ง buffer เดือนนี้"};
}
function getIncomeBaseline(){
  const cur=monthKey(todayISO()), tot={};
  entries.forEach(e=>{ if(e.type!=="income"||e.category===WITHDRAW_CAT||e.source==="loan_repayment"||e.category==="เงินคืนจากการยืม") return; const m=monthKey(e.date); if(m>=cur) return; tot[m]=(tot[m]||0)+toCents(e.amount); });
  const ms=Object.keys(tot).sort().reverse().slice(0,3), v=ms.map(m=>tot[m]/100).filter(x=>x>0);
  if(!v.length) return {months:0};
  const avg=v.reduce((a,b)=>a+b,0)/v.length, sd=Math.sqrt(v.reduce((a,b)=>a+(b-avg)*(b-avg),0)/v.length);
  return {months:v.length,avg:Math.round(avg),min:Math.round(Math.min(...v)),max:Math.round(Math.max(...v)),volatilityPct:avg>0?Math.round(sd/avg*100):0};
}
function getMonthExpenseByCategories(month, cats){ const set=new Set(cats||[]); return entries.filter(e=>e.type==="expense" && monthKey(e.date)===month && set.has(e.category)).reduce((s,e)=>s+toCents(e.amount),0)/100; }
function normalizeBudget(b){
  if(!b || typeof b !== "object") return null;
  const amount = Number(b.amount);
  if(!b.id || !(b.category || (Array.isArray(b.categories)&&b.categories.length)) || !isFinite(amount) || amount < 0) return null;
  const month = /^\d{4}-\d{2}$/.test(String(b.month || "")) ? String(b.month) : monthKey(todayISO());
  const cats=(Array.isArray(b.categories)&&b.categories.length?b.categories:[b.category]).map(String).filter(Boolean);
  const name=b.name?String(b.name):"";
  return { id:String(b.id), kind:(b.kind==="saving"?"saving":"expense"), category:name||cats.join(" + "), categories:cats, name, amount:Math.round(amount*100)/100, period:"monthly", month,
    enabled:b.enabled !== false, createdAt:b.createdAt || new Date().toISOString(), updatedAt:b.updatedAt || b.createdAt || new Date().toISOString() };
}
function loadBudgets(){
  try{
    const raw=localStorage.getItem(BUDGETS_KEY); const parsed=raw?JSON.parse(raw):[];
    budgets=Array.isArray(parsed)?parsed.map(normalizeBudget).filter(Boolean):[];
    const map=new Map();
    budgets.forEach(b=>{ const k=budgetKey(b); const old=map.get(k); if(!old || String(b.updatedAt)>String(old.updatedAt)) map.set(k,b); });
    budgets=Array.from(map.values()); saveBudgets();
  }catch(e){ budgets=[]; }
}
function saveBudgets(){ try{ localStorage.setItem(BUDGETS_KEY, JSON.stringify(budgets)); }catch(e){} }
function getMonthExpenseByCategory(month, category){
  return entries.filter(e=>e.type==="expense" && monthKey(e.date)===month && e.category===category).reduce((s,e)=>s+toCents(e.amount),0)/100;
}
function getDaysInMonth(month){ const [y,m]=month.split("-").map(Number); return new Date(y,m,0).getDate(); }
function getBudgetElapsedDays(month){ const today=todayISO(), cur=monthKey(today); if(month<cur) return getDaysInMonth(month); if(month>cur) return 0; return new Date().getDate(); }
function getBudgetRemainingDays(month){ const cur=monthKey(todayISO()); if(month<cur) return 0; if(month>cur) return getDaysInMonth(month); return Math.max(0,getDaysInMonth(month)-new Date().getDate()); }
function getBudgetStatus(spent,budget,projected){
  if(budget<=0) return spent>0?"OVER":"SAFE";
  if(spent>budget) return "OVER";
  if(projected>budget || spent>=budget*0.8) return "WATCH";
  return "SAFE";
}
function computeBudgetSummary(month=monthKey(todayISO()),kind="expense"){
  const rows=budgets.filter(b=>b.enabled!==false && b.period==="monthly" && b.month===month && (b.kind||"expense")===kind).map(b=>{
    const spent=(kind==="saving"?getMonthSavingByCategories:getMonthExpenseByCategories)(month,b.categories), days=getDaysInMonth(month), elapsed=getBudgetElapsedDays(month), remainingDays=getBudgetRemainingDays(month);
    const remaining=b.amount-spent, pct=b.amount>0?(spent/b.amount)*100:(spent>0?100:0), projected=elapsed>0?(spent/elapsed)*days:spent;
    return {id:b.id,category:b.category,categories:b.categories,budget:b.amount,spent,remaining,pct,projected,dailyAllowance:remainingDays>0?Math.max(0,remaining)/remainingDays:0,status:kind==="saving"?(spent>=b.amount?"DONE":"SAVING"):getBudgetStatus(spent,b.amount,projected),kind,elapsedDays:elapsed,remainingDays,daysInMonth:days};
  });
  const totalBudget=rows.reduce((s,r)=>s+r.budget,0), totalSpent=rows.reduce((s,r)=>s+r.spent,0);
  return {month,daysInMonth:getDaysInMonth(month),elapsedDays:getBudgetElapsedDays(month),remainingDays:getBudgetRemainingDays(month),rows,totalBudget,totalSpent,totalRemaining:totalBudget-totalSpent,totalPct:totalBudget>0?totalSpent/totalBudget*100:0,projectedTotal:getBudgetElapsedDays(month)>0?totalSpent/getBudgetElapsedDays(month)*getDaysInMonth(month):totalSpent,overCount:rows.filter(r=>r.status==="OVER").length,watchCount:rows.filter(r=>r.status==="WATCH").length,budgetCount:rows.length};
}
function getBudgetFindingData(){ const s=computeBudgetSummary(); return {month:s.month,totalBudget:s.totalBudget,totalSpent:s.totalSpent,totalRemaining:s.totalRemaining,totalPct:s.totalPct,overCount:s.overCount,watchCount:s.watchCount,rows:s.rows.map(r=>({category:r.category,budget:r.budget,spent:r.spent,remaining:r.remaining,pct:r.pct,projected:r.projected,dailyAllowance:r.dailyAllowance,status:r.status}))}; }
function getTotalDebts(){
  return debts.reduce((s,d) => s + toCents(d.outstandingBalance), 0) / 100;
}
function debtHistoryLabel(type){
  return { increase:"เพิ่มยอด", adjustment:"แก้ยอด", repayment:"ชำระคืน" }[type] || type;
}
// เพิ่ม/ลดยอดหนี้แบบ relative (ใช้กับปุ่มลัดเพิ่มยอด และบันทึกชำระคืน) — บันทึก history เสมอ
function addDebtHistory(debtId, type, amount, note, date){
  const d = debts.find(x => x.id === debtId);
  if(!d) return false;
  const amt = Math.round(parseFloat(amount) * 100) / 100;
  if(!amt || amt <= 0) return false;
  const signedCents = (type === "repayment") ? -toCents(amt) : toCents(amt);
  d.outstandingBalance = Math.max(0, toCents(d.outstandingBalance) + signedCents) / 100;
  d.history.unshift({ id: makeId(), type, amount: amt, date: date || todayISO(), note: (note || "").trim() });
  saveDebts();
  return true;
}
// แก้ยอดคงค้างตรงๆ (ไม่ใช่ relative) — ใช้ตอนแก้ยอดให้ตรงกับความเป็นจริง เช่น หลังเช็คสมุด กยศ.
function setDebtBalance(debtId, newBalance, note){
  const d = debts.find(x => x.id === debtId);
  if(!d) return false;
  const nb = Math.round(parseFloat(newBalance) * 100) / 100;
  if(isNaN(nb) || nb < 0) return false;
  const diff = Math.round((toCents(nb) - toCents(d.outstandingBalance))) / 100;
  d.outstandingBalance = nb;
  d.history.unshift({ id: makeId(), type:"adjustment", amount: diff, date: todayISO(), note: (note || "แก้ยอดคงค้างด้วยตนเอง").trim() });
  saveDebts();
  return true;
}
// สร้างหนี้ กยศ. เริ่มต้นให้อัตโนมัติครั้งแรกที่เปิดใช้งาน ตามยอดจริงของผู้ใช้ตอนเริ่ม Milestone 5 — ทำครั้งเดียวถ้ายังไม่เคยมีข้อมูลหนี้เลย
function ensureDefaultDebts(){
  // Never create a synthetic liability on a fresh install. Existing debt data is preserved.
  if(debts.length) return;
  if(entries.some(e => e.type === "income" && e.category === "กยศ.")) return;
  return;
  /*
  debts.push({
    id: makeId(), name: "กยศ.", type: "student_loan",
    outstandingBalance: 121600, gracePeriod: true, note: "",
    history: [{ id: makeId(), type:"adjustment", amount:121600, date: todayISO(), note:"ยอดเริ่มต้นตอนเปิดใช้งาน Debt Management" }]
  });
  saveDebts();
  */
}
function loadRecurring(){
  try{
    const raw = localStorage.getItem(RECURRING_KEY);
    recurringExpenses = raw ? JSON.parse(raw) : [];
    if(!Array.isArray(recurringExpenses)) recurringExpenses = [];
  }catch(e){ recurringExpenses = []; }
}
function saveRecurring(){
  try{ localStorage.setItem(RECURRING_KEY, JSON.stringify(recurringExpenses)); }catch(e){}
}
function loanOutstanding(loan){
  const repaidCents = (loan.repayments || []).reduce((s,r) => s + toCents(r.amount), 0);
  const adjustmentCents = (loan.adjustments || []).reduce((s,a) => s + toCents(a.amount), 0);
  return Math.max(0, (toCents(loan.amount) + adjustmentCents - repaidCents) / 100);
}
function getTotalReserved(){
  return reservedItems.reduce((s,r) => s + toCents(r.amount), 0) / 100;
}
function getTotalReceivablesOutstanding(){
  return loans.reduce((s,l) => s + toCents(loanOutstanding(l)), 0) / 100;
}

// ===== Phase 4: Recurring Expenses + Upcoming Payments — core logic =====
// เพิ่มจำนวนเดือนให้กับวันที่ ISO โดย "clamp" วันที่ให้อยู่ในช่วงที่ถูกต้องของเดือนปลายทางเสมอ
// เช่น 31 ม.ค. +1 เดือน -> 28 หรือ 29 ก.พ. (แล้วแต่ปีอธิกสุรทิน), ไม่มีวันที่ invalid หลุดออกมา
function addMonthsClamped(iso, months){
  const [y,m,d] = iso.split("-").map(Number);
  const targetMonthIndex = (m-1) + months;
  const targetYear = y + Math.floor(targetMonthIndex/12);
  const targetMonth0 = ((targetMonthIndex % 12) + 12) % 12;
  const lastDay = new Date(targetYear, targetMonth0+1, 0).getDate();
  const day = Math.min(d, lastDay);
  return `${targetYear}-${String(targetMonth0+1).padStart(2,"0")}-${String(day).padStart(2,"0")}`;
}
function computeNextDueDate(currentISO, frequency){
  switch(frequency){
    case "weekly": return addDaysISO(currentISO, 7);
    case "monthly": return addMonthsClamped(currentISO, 1);
    case "bimonthly": return addMonthsClamped(currentISO, 2);
    case "quarterly": return addMonthsClamped(currentISO, 3);
    case "yearly": return addMonthsClamped(currentISO, 12);
    default: return addMonthsClamped(currentISO, 1);
  }
}
function frequencyLabel(f){
  return { weekly:"รายสัปดาห์", monthly:"รายเดือน", bimonthly:"ทุก 2 เดือน", quarterly:"รายไตรมาส", yearly:"รายปี" }[f] || f;
}
// สถานะที่คำนวณจากวันที่ (เฉพาะรายการที่ status="active" เท่านั้นที่จะมีสถานะเหล่านี้)
function getDueStatus(r){
  const today = todayISO();
  if(r.nextDueDate < today) return "overdue";
  if(r.nextDueDate === today) return "dueToday";
  return "upcoming";
}
function statusLabel(s){
  return { active:"ใช้งานอยู่", paused:"หยุดชั่วคราว", cancelled:"ยกเลิกแล้ว", overdue:"เลยกำหนด", dueToday:"ครบกำหนดวันนี้", upcoming:"กำลังจะถึง" }[s] || s;
}
function getActiveRecurring(){
  return recurringExpenses.filter(r => r.status === "active");
}
// จำนวนวันนับจากวันนี้ถึง iso (0 = วันนี้, ค่าลบ = เลยมาแล้วกี่วัน)
function daysUntil(iso){
  return daysBetweenInclusive(todayISO(), iso) - 1;
}
// เงินกันไว้ (Reserved Money) ที่เชื่อมกับ recurring expense นี้ — Reserved ยังคงเป็น "เงินที่กันไว้" ไม่ใช่ Expense
function getReservedLinkInfo(r){
  if(!r.reservedItemId) return null;
  const item = reservedItems.find(x => x.id === r.reservedItemId);
  if(!item) return null;
  const shortfall = Math.max(0, toCents(r.amount) - toCents(item.amount)) / 100;
  return { item, reservedAmount: item.amount, shortfall };
}
// รายการ Upcoming ตามช่วงเวลาที่เลือก — Overdue จะโผล่มาเสมอไม่ว่าจะเลือกช่วงไหน
function getUpcomingOccurrences(filter){
  const today = todayISO();
  let rangeStart = today, rangeEnd = null;
  if(filter === "7d") rangeEnd = addDaysISO(today, 7);
  else if(filter === "30d") rangeEnd = addDaysISO(today, 30);
  else if(filter === "thisMonth"){
    const now = new Date();
    rangeEnd = monthBoundsISO(now.getFullYear(), now.getMonth()).end;
  }else if(filter === "nextMonth"){
    const now = new Date();
    const nm = now.getMonth()+1 > 11 ? 0 : now.getMonth()+1;
    const ny = now.getMonth()+1 > 11 ? now.getFullYear()+1 : now.getFullYear();
    const bounds = monthBoundsISO(ny, nm);
    rangeStart = bounds.start; rangeEnd = bounds.end;
  }
  // filter === "all" -> ไม่มี upper bound
  return getActiveRecurring()
    .filter(r => {
      const status = getDueStatus(r);
      if(status === "overdue") return true; // overdue โผล่เสมอ
      if(filter === "nextMonth") return r.nextDueDate >= rangeStart && r.nextDueDate <= rangeEnd;
      if(rangeEnd) return r.nextDueDate <= rangeEnd;
      return true;
    })
    .map(r => ({ r, status: getDueStatus(r), days: daysUntil(r.nextDueDate) }))
    .sort((a,b) => a.r.nextDueDate.localeCompare(b.r.nextDueDate));
}
function getUpcomingSummary(){
  const today = todayISO();
  const in7 = addDaysISO(today, 7), in30 = addDaysISO(today, 30);
  let total=0, within7=0, within30=0, overdue=0, count=0;
  getActiveRecurring().forEach(r => {
    const amtCents = toCents(r.amount);
    const status = getDueStatus(r);
    count++;
    total += amtCents;
    if(status === "overdue"){ overdue += amtCents; return; }
    if(r.nextDueDate <= in7) within7 += amtCents;
    if(r.nextDueDate <= in30) within30 += amtCents;
  });
  return { total: total/100, within7: within7/100, within30: within30/100, overdue: overdue/100, count };
}
// "ประมาณการ" ค่าใช้จ่ายประจำต่อเดือน — ไม่ใช่ยอด Expense จริง แค่ค่าเฉลี่ยเพื่อดูภาพรวม
function computeMonthlyRecurringCost(){
  const cents = getActiveRecurring().reduce((s,r) => {
    const amt = toCents(r.amount);
    let monthly;
    switch(r.frequency){
      case "weekly": monthly = amt * 30 / 7; break;
      case "bimonthly": monthly = amt / 2; break;
      case "quarterly": monthly = amt / 3; break;
      case "yearly": monthly = amt / 12; break;
      case "monthly": default: monthly = amt;
    }
    return s + monthly;
  }, 0);
  return cents / 100;
}

// ===== Phase 5: Cash Flow Forecast — PURE CALCULATION, read-only =====
// ห้ามแก้ accounts / entries / recurringExpenses / reservedItems ใดๆ ทั้งสิ้น — คำนวณจากข้อมูลปัจจุบันแล้ว render อย่างเดียว
function getForecastDays(){
  if(forecastRangePreset === "custom"){
    const n = parseInt(forecastCustomDays);
    return (n > 0 && n <= 3650) ? n : 30;
  }
  return parseInt(forecastRangePreset) || 30;
}
// occurrence ในอนาคตของ recurring ที่ active เท่านั้น ภายใน horizon (รวม overdue ที่ยังไม่ mark paid)
//
// หมายเหตุสำคัญเรื่อง day-31 rollover (แก้เฉพาะ Phase 5 เท่านั้น):
// computeNextDueDate()/addMonthsClamped() ของ Phase 4 เดิม จะ "จำ" วันที่ของรอบก่อนหน้าไว้แล้วบวกเดือนต่อไปเรื่อยๆ
// ผลคือถ้าวันที่ตั้งต้นคือ 31 แล้วโดน clamp เหลือ 28 ที่ ก.พ. เดือนถัดๆ ไปจะค้างที่ 28 ไม่กลับไป 31 อีก
// (เช่น 31 ม.ค. → 28 ก.พ. → 28 มี.ค. → ... ) — เป็นพฤติกรรมที่ถูกต้องแล้วสำหรับ Phase 4 เพราะ nextDueDate
// ต้องอิงจากวันที่ "จ่ายจริงครั้งล่าสุด" ที่บันทึกไว้ ไม่ใช่ค่าที่ Forecast ควรไปยุ่งด้วย จึงห้ามแก้ฟังก์ชันนั้น
//
// แต่ผู้ใช้ต้องการให้ Forecast (ซึ่งเป็นการจำลอง ไม่ใช่ของจริง) แสดง pattern แบบ
// 31 ม.ค. → 28/29 ก.พ. → 31 มี.ค. → 30 เม.ย. → 31 พ.ค. คือ "กลับไปวันเดิมทุกครั้งที่เดือนนั้นมีวันนั้นจริง"
// จึงเพิ่มฟังก์ชันใหม่ getForecastNextDate() ที่ใช้เฉพาะใน Forecast เท่านั้น โดยอิงจาก "anchor day" —
// วันที่ตั้งใจไว้ตอนสร้าง recurring (เอาจาก r.startDate ซึ่ง Phase 4 ตั้งไว้ครั้งเดียวตอนสร้างและไม่เคยแก้ทับ)
// แทนที่จะอิงวันที่ของรอบก่อนหน้าที่อาจถูก clamp ไปแล้ว
//
// ผลกระทบ: ไม่มี — ฟังก์ชันนี้เป็นฟังก์ชันใหม่แยกต่างหาก ไม่ได้ไปแก้ไข/เรียกทับ computeNextDueDate() หรือ
// addMonthsClamped() เดิม, ไม่แตะ r.nextDueDate จริงใน storage, Mark as Paid ของ Phase 4 ยังคำนวณรอบถัดไป
// ด้วย computeNextDueDate() เดิมเป๊ะๆ เหมือนเดิมทุกประการ — Forecast แค่ "มองไปข้างหน้า" ต่างไปเท่านั้น
function getForecastNextDate(currentISO, frequency, anchorDay){
  if(frequency === "weekly") return addDaysISO(currentISO, 7); // รายสัปดาห์ไม่มีปัญหาวันที่ล้นเดือน ใช้ตรงๆ ได้
  const monthsToAdd = { monthly:1, bimonthly:2, quarterly:3, yearly:12 }[frequency] || 1;
  const [y,m] = currentISO.split("-").map(Number);
  const targetMonthIndex = (m-1) + monthsToAdd;
  const targetYear = y + Math.floor(targetMonthIndex/12);
  const targetMonth0 = ((targetMonthIndex % 12) + 12) % 12;
  const lastDay = new Date(targetYear, targetMonth0+1, 0).getDate();
  const day = Math.min(anchorDay, lastDay); // ใช้วัน anchor เดิม ไม่ใช่วันของรอบก่อนหน้าที่อาจถูก clamp มาแล้ว
  return `${targetYear}-${String(targetMonth0+1).padStart(2,"0")}-${String(day).padStart(2,"0")}`;
}
// reuse getActiveRecurring()/getDueStatus() จาก Phase 4 เดิม — ไม่สร้าง status logic ใหม่
function getForecastOccurrences(horizonEnd){
  const today = todayISO();
  const occurrences = [];
  getActiveRecurring().forEach(r => {
    // anchor day: ใช้วัน (1-31) จาก startDate ที่ตั้งไว้ตอนสร้าง ถ้าไม่มี/ไม่ valid ให้ fallback เป็นวันของ nextDueDate ปัจจุบัน
    // (รองรับข้อมูลเก่าก่อนมี Forecast โดยไม่ต้องแก้ schema หรือ backfill ข้อมูลใดๆ)
    const anchorSource = isValidISODate(r.startDate) ? r.startDate : r.nextDueDate;
    const anchorDay = parseInt(anchorSource.split("-")[2], 10) || parseInt(r.nextDueDate.split("-")[2], 10) || 1;
    let dueDate = r.nextDueDate; // occurrence แรกใช้ nextDueDate จริงเสมอ — เป็นวัน authoritative ตาม Phase 4
    let guard = 0; // กัน infinite loop ถ้าข้อมูลผิดปกติ
    while(dueDate && dueDate <= horizonEnd && guard < 1000){
      occurrences.push({
        recurringId: r.id, name: r.name, amount: r.amount, accountId: r.accountId,
        category: r.category, date: dueDate, isOverdue: dueDate < today,
      });
      dueDate = getForecastNextDate(dueDate, r.frequency, anchorDay);
      guard++;
    }
  });
  occurrences.sort((a,b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name));
  return occurrences;
}
// คำนวณ Forecast ทั้งหมด — deterministic, ไม่แตะ localStorage, เรียกกี่ครั้งก็ได้ผลเหมือนเดิมถ้าข้อมูลจริงไม่เปลี่ยน
function computeForecast(days){
  const today = todayISO();
  const horizonEnd = addDaysISO(today, days);
  const occurrences = getForecastOccurrences(horizonEnd);

  const actualTotalCents = toCents(getTotalMoneyAllAccounts());
  const reservedTotalCents = toCents(getTotalReserved());
  const upcomingTotalCents = occurrences.reduce((s,o) => s + toCents(o.amount), 0);
  const forecastTotalCents = actualTotalCents - upcomingTotalCents;
  const forecastAvailableCents = forecastTotalCents - reservedTotalCents;

  // แยกตามบัญชี + running balance ต่อบัญชี เพื่อตรวจว่ามีจุดไหนติดลบระหว่างทางหรือไม่
  const perAccount = accounts.map(a => {
    const currentCents = toCents(computeAccountBalance(a.id));
    const accOccs = occurrences.filter(o => o.accountId === a.id);
    let running = currentCents;
    let firstNegative = null;
    accOccs.forEach(o => {
      running -= toCents(o.amount);
      if(running < 0 && !firstNegative) firstNegative = { date: o.date, balanceCents: running };
    });
    const futureCents = accOccs.reduce((s,o) => s + toCents(o.amount), 0);
    return {
      account: a,
      current: currentCents / 100,
      future: futureCents / 100,
      forecast: (currentCents - futureCents) / 100,
      firstNegative: firstNegative ? { date: firstNegative.date, balance: firstNegative.balanceCents / 100 } : null,
    };
  });

  // Timeline รวมทุกบัญชี — running total หลังแต่ละ occurrence เรียงตามวัน
  let runningTotal = actualTotalCents;
  const timeline = occurrences.map(o => {
    runningTotal -= toCents(o.amount);
    return { ...o, runningTotal: runningTotal / 100 };
  });

  return {
    days, horizonEnd,
    current: actualTotalCents / 100,
    reserved: reservedTotalCents / 100,
    upcoming: upcomingTotalCents / 100,
    forecast: forecastTotalCents / 100,
    forecastAvailable: forecastAvailableCents / 100,
    occurrenceCount: occurrences.length,
    timeline, perAccount,
    negativeAccounts: perAccount.filter(p => p.firstNegative),
    totalNegative: forecastTotalCents < 0,
  };
}

// ===== Phase 2: Custom Date Range + Period Analysis =====
function addDaysISO(iso, days){
  const [y,m,d] = iso.split("-").map(Number);
  const dt = new Date(y, m-1, d);
  dt.setDate(dt.getDate() + days);
  return `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,"0")}-${String(dt.getDate()).padStart(2,"0")}`;
}
function daysBetweenInclusive(startISO, endISO){
  const [y1,m1,d1] = startISO.split("-").map(Number);
  const [y2,m2,d2] = endISO.split("-").map(Number);
  const t1 = Date.UTC(y1,m1-1,d1), t2 = Date.UTC(y2,m2-1,d2);
  return Math.round((t2 - t1) / 86400000) + 1;
}
function monthBoundsISO(y, m){ // m: 0-based month index
  const start = `${y}-${String(m+1).padStart(2,"0")}-01`;
  const lastDay = new Date(y, m+1, 0).getDate();
  const end = `${y}-${String(m+1).padStart(2,"0")}-${String(lastDay).padStart(2,"0")}`;
  return { start, end };
}
// คืนค่า {start, end} เป็น ISO date string (inclusive) หรือ {start:null,end:null} สำหรับ "ทั้งหมด"
function getAnalysisRange(){
  const today = todayISO();
  const now = new Date();
  switch(analysisPreset){
    case "today": return { start: today, end: today };
    case "7d": return { start: addDaysISO(today, -6), end: today };
    case "thisMonth": return monthBoundsISO(now.getFullYear(), now.getMonth());
    case "lastMonth": {
      const m = now.getMonth()===0 ? 11 : now.getMonth()-1;
      const y = now.getMonth()===0 ? now.getFullYear()-1 : now.getFullYear();
      return monthBoundsISO(y, m);
    }
    case "3m": return { start: addDaysISO(today, -89), end: today };
    case "6m": return { start: addDaysISO(today, -179), end: today };
    case "thisYear": return { start: `${now.getFullYear()}-01-01`, end: `${now.getFullYear()}-12-31` };
    case "lastYear": return { start: `${now.getFullYear()-1}-01-01`, end: `${now.getFullYear()-1}-12-31` };
    case "custom": return { start: analysisStart || null, end: analysisEnd || null };
    case "all": default: return { start: null, end: null };
  }
}
function computePeriodAnalysis(){
  const { start, end } = getAnalysisRange();
  return computePeriodAnalysisForRange(start, end, analysisAccountFilter);
}
// เวอร์ชัน parametrized ของ computePeriodAnalysis เดิม — Phase 2 (computePeriodAnalysis) และ Phase 3 (Compare)
// เรียกฟังก์ชันนี้ร่วมกัน เพื่อให้ logic การคำนวณตรงกันเสมอ ไม่มีสูตรซ้ำซ้อน/ขัดแย้งกัน
function computePeriodAnalysisForRange(start, end, accountFilter){
  // รายการที่ไม่ใช่ transfer เท่านั้น (transfer ไม่ใช่รายรับ/รายจ่าย) และกรองตามบัญชีถ้าเลือกไว้
  let rangeEntries = entries.filter(e => e.type !== "transfer");
  if(start) rangeEntries = rangeEntries.filter(e => e.date >= start);
  if(end) rangeEntries = rangeEntries.filter(e => e.date <= end);
  if(accountFilter) rangeEntries = rangeEntries.filter(e => (e.accountId || UNASSIGNED_ACCOUNT_ID) === accountFilter);

  const sumOf = t => rangeEntries.filter(e => e.type===t).reduce((s,e) => s + toCents(e.amount), 0) / 100;
  const income = sumOf("income"), expense = sumOf("expense"), saving = sumOf("saving");
  const loanRepaymentIncome = rangeEntries.filter(e => e.type === "income" && e.source === "loan_repayment").reduce((s,e) => s + toCents(e.amount), 0) / 100;
  const withdrawIncome = rangeEntries.filter(e => e.type === "income" && e.category === WITHDRAW_CAT).reduce((s,e) => s + toCents(e.amount), 0) / 100;
  const nonLoanIncome = income - loanRepaymentIncome - withdrawIncome;
  const netCashFlow = income - expense - saving;

  let effStart = start, effEnd = end;
  if(!effStart || !effEnd){
    // "ทั้งหมด" — ใช้ช่วงจากรายการจริงที่มีอยู่ (ถ้าไม่มีรายการเลย ใช้ 1 วันกันหารด้วยศูนย์)
    const dates = rangeEntries.map(e => e.date).sort();
    effStart = start || dates[0] || today0();
    effEnd = end || dates[dates.length-1] || today0();
  }
  const days = Math.max(1, daysBetweenInclusive(effStart, effEnd));

  // ค่าเฉลี่ย/วัน: ถ้าช่วงที่เลือกมีวันในอนาคตรวมอยู่ด้วย (เช่น "เดือนนี้"/"ปีนี้" ที่ยังไม่จบเดือน/ปี)
  // ให้หารด้วยจำนวนวันที่ผ่านไปจริงถึงวันนี้เท่านั้น (เช่น วันนี้ที่ 5 ก็หาร 5) ไม่หารด้วยความยาวเต็มช่วง (30/31 วัน)
  // ส่วนช่วงที่จบไปแล้วทั้งหมด (เดือนที่แล้ว, ช่วงกำหนดเองในอดีต) ยังคงหารด้วยความยาวเต็มช่วงตามเดิม
  const todayStr = today0();
  const avgDivisorEnd = effEnd > todayStr ? todayStr : effEnd;
  const avgDays = avgDivisorEnd < effStart ? days : Math.max(1, daysBetweenInclusive(effStart, avgDivisorEnd));

  const expenseEntries = rangeEntries.filter(e => e.type==="expense");
  const avgIncomePerDay = income / days;
  const avgExpensePerDay = expense / avgDays;
  const avgExpensePerTxn = expenseEntries.length ? expense / expenseEntries.length : 0;

  const catMap = {};
  expenseEntries.forEach(e => { catMap[e.category] = (catMap[e.category]||0) + toCents(e.amount); });
  const breakdown = Object.keys(catMap).map(cat => ({ cat, amount: catMap[cat]/100 }))
    .sort((a,b) => b.amount - a.amount)
    .map(r => ({ ...r, pct: expense ? Math.round((r.amount/expense)*100) : 0 }));

  return {
    income, loanRepaymentIncome, nonLoanIncome, expense, saving, netCashFlow,
    count: rangeEntries.length,
    avgIncomePerDay, avgExpensePerDay, avgExpensePerTxn,
    topCategory: breakdown[0]?.cat || "-",
    breakdown,
  };
}
function today0(){ return todayISO(); }

function renderPeriodAnalysis(){
  const accSelect = document.getElementById("analysisAccountFilter");
  const accOptsHtml = `<option value="">ทุกบัญชี</option>` + accounts.map(a => `<option value="${a.id}">${escapeHtml(a.name)}</option>`).join("");
  if(accSelect.innerHTML !== accOptsHtml) accSelect.innerHTML = accOptsHtml;
  accSelect.value = analysisAccountFilter;
  document.getElementById("customRangeRow").style.display = analysisPreset === "custom" ? "flex" : "none";

  const a = computePeriodAnalysis();
  const container = document.getElementById("periodAnalysisSection");
  const statBox = (label, val, color) => `<div class="stat-box"><div class="stat-box-label">${label}</div><div class="stat-box-num mono" ${color?`style="color:${color}"`:""}>${val}</div></div>`;
  const money = n => (n<0?"-":"") + "฿" + fmt(Math.abs(n));
  container.innerHTML = `
    <div class="stats-grid">
      ${statBox("รายรับ", money(a.income), "var(--income)")}
      ${statBox("รายจ่าย", money(a.expense), "var(--expense)")}
      ${statBox("ออม/ลงทุน", money(a.saving), "var(--saving)")}
      ${statBox("Net Cash Flow", money(a.netCashFlow), a.netCashFlow<0?"var(--expense)":"var(--ink)")}
      ${statBox("จำนวนรายการ", a.count + " รายการ")}
      ${statBox("รายจ่ายเฉลี่ย/รายการ", money(a.avgExpensePerTxn))}
      ${statBox("รายรับเฉลี่ย/วัน", money(a.avgIncomePerDay))}
      ${statBox("รายจ่ายเฉลี่ย/วัน", money(a.avgExpensePerDay))}
    </div>
    <div style="margin-top:16px">
      <span class="section-label">รายจ่ายตามหมวด (ช่วงที่เลือก)</span>
      <div style="margin-top:8px">
        ${a.breakdown.length===0 ? `<div class="empty-state">ไม่มีรายจ่ายในช่วงเวลานี้</div>` :
          a.breakdown.map(r => `
            <div class="bar-row">
              <div class="bar-row-top"><span>${escapeHtml(r.cat)}</span><span class="mono">฿${fmt(r.amount)} (${r.pct}%)</span></div>
              <div class="bar-track"><div class="bar-fill" style="width:${r.pct}%;background:var(--expense)"></div></div>
            </div>
          `).join("")}
      </div>
    </div>
  `;
}
document.getElementById("analysisPreset").addEventListener("change", (e) => {
  analysisPreset = e.target.value;
  if(analysisPreset === "custom" && !analysisStart && !analysisEnd){
    analysisStart = todayISO();
    analysisEnd = todayISO();
    document.getElementById("analysisStartInput").value = analysisStart;
    document.getElementById("analysisEndInput").value = analysisEnd;
  }
  renderPeriodAnalysis();
});
document.getElementById("analysisAccountFilter").addEventListener("change", (e) => {
  analysisAccountFilter = e.target.value;
  renderPeriodAnalysis();
});
document.getElementById("analysisStartInput").addEventListener("change", (e) => {
  analysisStart = e.target.value;
  renderPeriodAnalysis();
});
document.getElementById("analysisEndInput").addEventListener("change", (e) => {
  analysisEnd = e.target.value;
  renderPeriodAnalysis();
});

// ===== Phase 3: Compare Period =====
// คืนค่า label สำหรับช่วงเวลาแบบ custom (ใช้ตอนไม่มี start/end ให้แสดง "ทั้งหมด")
function compareRangeLabel(range){
  if(range.start && range.end) return `${dayLabel(range.start)} – ${dayLabel(range.end)}`;
  if(range.start) return `จาก ${dayLabel(range.start)}`;
  if(range.end) return `ถึง ${dayLabel(range.end)}`;
  return "ทั้งหมด";
}
// คืนค่า { A, B, labelA, labelB } โดย A คือช่วงปัจจุบัน/ใหม่กว่า, B คือช่วงก่อนหน้าที่จะเทียบด้วย
function getComparePeriods(){
  const today = todayISO();
  const now = new Date();
  switch(comparePreset){
    case "thisMonthVsLastMonth": {
      const A = monthBoundsISO(now.getFullYear(), now.getMonth());
      const m = now.getMonth()===0 ? 11 : now.getMonth()-1;
      const y = now.getMonth()===0 ? now.getFullYear()-1 : now.getFullYear();
      const B = monthBoundsISO(y, m);
      return { A, B, labelA: "เดือนนี้", labelB: "เดือนที่แล้ว" };
    }
    case "7dVsPrev7d": {
      const A = { start: addDaysISO(today, -6), end: today };
      const B = { start: addDaysISO(today, -13), end: addDaysISO(today, -7) };
      return { A, B, labelA: "7 วันล่าสุด", labelB: "7 วันก่อนหน้า" };
    }
    case "3mVsPrev3m": {
      const A = { start: addDaysISO(today, -89), end: today };
      const B = { start: addDaysISO(today, -179), end: addDaysISO(today, -90) };
      return { A, B, labelA: "3 เดือนล่าสุด", labelB: "3 เดือนก่อนหน้า" };
    }
    case "yearVsLastYear": {
      const A = { start: `${now.getFullYear()}-01-01`, end: `${now.getFullYear()}-12-31` };
      const B = { start: `${now.getFullYear()-1}-01-01`, end: `${now.getFullYear()-1}-12-31` };
      return { A, B, labelA: "ปีนี้", labelB: "ปีที่แล้ว" };
    }
    case "custom":
    default: {
      const A = { start: compareAStart || null, end: compareAEnd || null };
      const B = { start: compareBStart || null, end: compareBEnd || null };
      return { A, B, labelA: compareRangeLabel(A), labelB: compareRangeLabel(B) };
    }
  }
}
// เปรียบเทียบค่า current vs previous แบบปลอดภัย (ไม่มี NaN/Infinity)
// isMoney=true ใช้หน่วยสตางค์ (toCents) เหมือนส่วนอื่นของระบบ, isMoney=false ใช้จำนวนเต็มตรงๆ (เช่น จำนวนรายการ)
function computeChangeGeneric(current, previous, isMoney){
  const curUnits = isMoney ? toCents(current) : Math.round(current || 0);
  const prevUnits = isMoney ? toCents(previous) : Math.round(previous || 0);
  const diffUnits = curUnits - prevUnits;
  const diff = isMoney ? diffUnits/100 : diffUnits;
  const dir = diffUnits>0 ? "up" : diffUnits<0 ? "down" : "flat";
  const fmtAbs = v => isMoney ? ("฿"+fmt(Math.abs(v))) : fmt(Math.abs(v));
  if(curUnits===0 && prevUnits===0){
    return { diff:0, dir:"flat", diffLabel: fmtAbs(0), pctLabel:"—", hasBase:false, noData:true };
  }
  const sign = diffUnits>0 ? "+" : diffUnits<0 ? "-" : "";
  const diffLabel = sign + fmtAbs(diff);
  if(prevUnits===0){
    // ไม่มีฐานสำหรับคำนวณ % (previous = 0) — แสดงจำนวนเงินที่เปลี่ยนได้ แต่ไม่แสดง % เพื่อกัน Infinity
    return { diff, dir, diffLabel, pctLabel:"—", hasBase:false, noData:false };
  }
  const pct = (diffUnits/prevUnits)*100;
  const pctSign = pct>0 ? "+" : pct<0 ? "-" : "";
  const pctLabel = pctSign + fmt(Math.abs(pct)) + "%";
  return { diff, dir, diffLabel, pctLabel, hasBase:true, noData:false };
}
// รวมข้อมูลเปรียบเทียบทั้งหมด: เรียก computePeriodAnalysisForRange() ของ Phase 2 สำหรับทั้งสองช่วง
// เพื่อให้ Accounting Logic (transfer/money lent/loan repayment ไม่นับ, ไม่ double count) ตรงกับ Period Analysis เป๊ะๆ
function computeCompareAnalysis(){
  const { A, B, labelA, labelB } = getComparePeriods();
  const analysisA = computePeriodAnalysisForRange(A.start, A.end, compareAccountFilter);
  const analysisB = computePeriodAnalysisForRange(B.start, B.end, compareAccountFilter);

  const METRICS = [
    { key:"income", label:"รายรับ", isMoney:true },
    { key:"expense", label:"รายจ่าย", isMoney:true },
    { key:"saving", label:"ออม/ลงทุน", isMoney:true },
    { key:"netCashFlow", label:"Net Cash Flow", isMoney:true },
    { key:"count", label:"จำนวนรายการ", isMoney:false },
    { key:"avgExpensePerTxn", label:"รายจ่ายเฉลี่ย/รายการ", isMoney:true },
    { key:"avgIncomePerDay", label:"รายรับเฉลี่ย/วัน", isMoney:true },
    { key:"avgExpensePerDay", label:"รายจ่ายเฉลี่ย/วัน", isMoney:true },
  ];
  const rows = METRICS.map(m => ({
    ...m,
    curVal: analysisA[m.key],
    prevVal: analysisB[m.key],
    change: computeChangeGeneric(analysisA[m.key], analysisB[m.key], m.isMoney),
  }));

  // รวมหมวดหมู่จากทั้งสองช่วงเข้าด้วยกัน (union) เพื่อไม่ให้หมวดที่มีเฉพาะช่วงใดช่วงหนึ่งหายไป
  const catSet = new Set([...analysisA.breakdown.map(r=>r.cat), ...analysisB.breakdown.map(r=>r.cat)]);
  let catRows = Array.from(catSet).map(cat => {
    const aAmt = analysisA.breakdown.find(r=>r.cat===cat)?.amount || 0;
    const bAmt = analysisB.breakdown.find(r=>r.cat===cat)?.amount || 0;
    const change = computeChangeGeneric(aAmt, bAmt, true);
    return { cat, aAmt, bAmt, change };
  });
  switch(compareCategorySort){
    case "increase": catRows.sort((x,y) => y.change.diff - x.change.diff); break;
    case "decrease": catRows.sort((x,y) => x.change.diff - y.change.diff); break;
    case "total": catRows.sort((x,y) => Math.max(y.aAmt,y.bAmt) - Math.max(x.aAmt,x.bAmt)); break;
    default: catRows.sort((x,y) => Math.abs(y.change.diff) - Math.abs(x.change.diff));
  }

  return { analysisA, analysisB, labelA, labelB, rows, catRows };
}
// สร้าง insight จากข้อมูลจริงล้วนๆ (ไม่ใช้ AI) — ถ้าฐานข้อมูลไม่พอ (previous=0 หรือไม่เปลี่ยนแปลง) จะไม่พูดถึง metric นั้น
function buildCompareInsights(compare){
  const lines = [];
  const byKey = k => compare.rows.find(r => r.key===k);
  const dirWord = dir => dir==="up" ? "เพิ่มขึ้น" : dir==="down" ? "ลดลง" : "";
  [["income","รายรับ"], ["expense","รายจ่าย"], ["saving","เงินออม/ลงทุน"]].forEach(([key,label]) => {
    const r = byKey(key);
    if(r && r.change.hasBase && r.change.dir !== "flat"){
      lines.push(`${label}${dirWord(r.change.dir)} ${r.change.pctLabel.replace(/^[+-]/,"")}`);
    }
  });
  const changedCats = compare.catRows.filter(r => r.change.diff !== 0);
  if(changedCats.length){
    const top = changedCats.reduce((best,r) => Math.abs(r.change.diff) > Math.abs(best.change.diff) ? r : best, changedCats[0]);
    lines.push(`หมวด${top.cat}เป็นหมวดที่ใช้เงิน${dirWord(top.change.dir)}มากที่สุด (${top.change.diffLabel})`);
  }
  return lines;
}
function renderCompareSection(){
  const accSelect = document.getElementById("compareAccountFilter");
  const accOptsHtml = `<option value="">ทุกบัญชี</option>` + accounts.map(a => `<option value="${a.id}">${escapeHtml(a.name)}</option>`).join("");
  if(accSelect.innerHTML !== accOptsHtml) accSelect.innerHTML = accOptsHtml;
  accSelect.value = compareAccountFilter;
  document.getElementById("compareCustomARow").style.display = comparePreset === "custom" ? "flex" : "none";
  document.getElementById("compareCustomBRow").style.display = comparePreset === "custom" ? "flex" : "none";

  const compare = computeCompareAnalysis();
  const container = document.getElementById("compareSection");
  const money = n => (n<0?"-":"") + "฿" + fmt(Math.abs(n));
  const arrowGlyph = dir => dir==="up" ? "↑" : dir==="down" ? "↓" : "→";
  const arrowColor = dir => dir==="up" ? "var(--income)" : dir==="down" ? "var(--expense)" : "var(--faint)";

  const headlineKeys = ["income","expense","saving"];
  const headlineRows = compare.rows.filter(r => headlineKeys.includes(r.key));
  const otherRows = compare.rows.filter(r => !headlineKeys.includes(r.key));

  const insights = buildCompareInsights(compare);

  const noDataAtAll = compare.analysisA.count===0 && compare.analysisB.count===0;

  container.innerHTML = `
    <div class="compare-vs-row">
      <div class="compare-period-pill">${escapeHtml(compare.labelA)}</div>
      <div class="compare-vs-label">VS</div>
      <div class="compare-period-pill">${escapeHtml(compare.labelB)}</div>
    </div>
    ${noDataAtAll ? `<div class="empty-state">ไม่มีข้อมูลในทั้งสองช่วงเวลานี้</div>` : `
      <div class="compare-headline-grid">
        ${headlineRows.map(r => `
          <div class="compare-headline-row">
            <span class="compare-headline-label">${escapeHtml(r.label)}</span>
            <span class="compare-headline-val mono">${money(r.curVal)}</span>
            <span class="compare-headline-change mono" style="color:${arrowColor(r.change.dir)}">${arrowGlyph(r.change.dir)} ${r.change.noData ? "—" : r.change.pctLabel}</span>
          </div>
        `).join("")}
      </div>
      ${insights.length ? `<div class="insight-box">${insights.map(l => `<div>${escapeHtml(l)}</div>`).join("")}</div>` : ""}
      <button class="breakdown-toggle" id="compareDetailToggle" style="margin-bottom:10px;">${compareDetailExpanded ? "ซ่อนรายละเอียด" : "+ ดูรายละเอียดเพิ่มเติม"}</button>
      ${compareDetailExpanded ? `
        <div style="margin-bottom:16px;">
          ${otherRows.map(r => `
            <div class="compare-detail-row">
              <span style="flex:1.4">${escapeHtml(r.label)}</span>
              <span class="compare-detail-col mono">${r.isMoney ? money(r.curVal) : fmt(r.curVal)}</span>
              <span class="compare-detail-col mono" style="color:var(--faint)">${r.isMoney ? money(r.prevVal) : fmt(r.prevVal)}</span>
              <span class="compare-detail-col mono" style="color:${arrowColor(r.change.dir)}">${r.change.diffLabel}</span>
            </div>
          `).join("")}
        </div>
        <div style="margin-bottom:8px;">
          <div style="display:flex; justify-content:space-between; align-items:baseline; margin-bottom:8px;">
            <span class="section-label">รายจ่ายตามหมวด (เปรียบเทียบ)</span>
            <select id="compareCategorySort" style="font-size:12px;">
              <option value="changed">เปลี่ยนแปลงมากที่สุด</option>
              <option value="increase">เพิ่มขึ้นมากที่สุด</option>
              <option value="decrease">ลดลงมากที่สุด</option>
              <option value="total">ยอดรวมสูงสุด</option>
            </select>
          </div>
          ${compare.catRows.length===0 ? `<div class="empty-state">ไม่มีรายจ่ายในทั้งสองช่วงเวลานี้</div>` :
            compare.catRows.map(r => `
              <div class="compare-cat-row">
                <div class="compare-cat-top"><span>${escapeHtml(r.cat)}</span><span class="mono" style="color:${arrowColor(r.change.dir)}">${r.change.diffLabel}${r.change.hasBase ? ` (${r.change.pctLabel})` : ""}</span></div>
                <div class="compare-cat-sub"><span>${escapeHtml(compare.labelA)}: ฿${fmt(r.aAmt)}</span><span>${escapeHtml(compare.labelB)}: ฿${fmt(r.bAmt)}</span></div>
              </div>
            `).join("")}
        </div>
      ` : ""}
    `}
  `;

  const toggleBtn = document.getElementById("compareDetailToggle");
  if(toggleBtn){
    toggleBtn.addEventListener("click", () => {
      compareDetailExpanded = !compareDetailExpanded;
      renderCompareSection();
    });
  }
  const catSortSelect = document.getElementById("compareCategorySort");
  if(catSortSelect){
    catSortSelect.value = compareCategorySort;
    catSortSelect.addEventListener("change", (e) => {
      compareCategorySort = e.target.value;
      renderCompareSection();
    });
  }
}
document.getElementById("comparePreset").addEventListener("change", (e) => {
  comparePreset = e.target.value;
  if(comparePreset === "custom" && !compareAStart && !compareAEnd && !compareBStart && !compareBEnd){
    compareAStart = todayISO();
    compareAEnd = todayISO();
    compareBStart = todayISO();
    compareBEnd = todayISO();
    document.getElementById("compareAStartInput").value = compareAStart;
    document.getElementById("compareAEndInput").value = compareAEnd;
    document.getElementById("compareBStartInput").value = compareBStart;
    document.getElementById("compareBEndInput").value = compareBEnd;
  }
  renderCompareSection();
});
document.getElementById("compareAccountFilter").addEventListener("change", (e) => {
  compareAccountFilter = e.target.value;
  renderCompareSection();
});
document.getElementById("compareAStartInput").addEventListener("change", (e) => { compareAStart = e.target.value; renderCompareSection(); });
document.getElementById("compareAEndInput").addEventListener("change", (e) => { compareAEnd = e.target.value; renderCompareSection(); });
document.getElementById("compareBStartInput").addEventListener("change", (e) => { compareBStart = e.target.value; renderCompareSection(); });
document.getElementById("compareBEndInput").addEventListener("change", (e) => { compareBEnd = e.target.value; renderCompareSection(); });

// ยอดคงเหลือของบัญชี = ยอดเริ่มต้น + รายรับ - รายจ่าย - ออม/ลงทุน + โอนเข้า - โอนออก (คำนวณจากรายการทั้งหมดตลอดเวลา ไม่ใช่แค่เดือนที่เลือก)
function computeAccountBalance(accountId, beforeDate){
  let cents = toCents(accounts.find(a => a.id===accountId)?.initialBalance || 0);
  entries.forEach(e => {
    if(beforeDate && e.date >= beforeDate) return;
    const acc = e.accountId || UNASSIGNED_ACCOUNT_ID;
    if(e.type === "transfer"){
      if(e.fromAccountId === accountId) cents -= toCents(e.amount);
      if(e.toAccountId === accountId) cents += toCents(e.amount);
    }else if(acc === accountId){
      if(e.type === "income") cents += toCents(e.amount);
      else if(e.type === "expense" || e.type === "saving") cents -= toCents(e.amount);
    }
  });
  loans.forEach(l => {
    if(beforeDate && l.date && l.date >= beforeDate) return;
    if(l.accountId === accountId) cents -= toCents(l.amount); // เงินต้นออกจากบัญชี
    // Repayment cash is represented by a canonical income entry (source=loan_repayment).
    // Do NOT add repayments here again, otherwise the same cash inflow would be double-counted.
    // syncLoanRepaymentEntries() migrates legacy repayments to entries on load.
    // adjustment เป็นการแก้ยอดคงเหลือ: บวก = เพิ่มเงินที่ถูกให้ยืมออก, ลบ = เงินที่ควรได้คืนเข้าบัญชี
    (l.adjustments || []).forEach(a => { if(a.accountId === accountId) cents -= toCents(a.amount); });
  });
  return cents / 100;
}
function getTotalMoneyAllAccounts(beforeDate){
  return accounts.reduce((s,a) => s + toCents(computeAccountBalance(a.id, beforeDate)), 0) / 100;
}
// เงินออม/ลงทุนสะสม (ออกจากบัญชีแล้วแต่ยังเป็นสินทรัพย์ของเรา) แยกตามหมวด
function getSavedByCategory(){
  const m = {};
  let w = 0; // ยอดถอนเงินออมสะสม (หักจากหมวดสำรองก่อน แล้วค่อยหมวดอื่น)
  entries.forEach(e => {
    if(e.type === "saving"){ const c = e.category || "อื่นๆ"; m[c] = (m[c] || 0) + toCents(e.amount); }
    else if(e.type === "income" && e.category === WITHDRAW_CAT) w += toCents(e.amount);
  });
  Object.keys(m).sort((a,b) => (b.includes("สำรอง")?1:0) - (a.includes("สำรอง")?1:0)).forEach(k => { const d = Math.min(m[k], w); m[k] -= d; w -= d; });
  Object.keys(m).forEach(k => m[k] /= 100);
  return m;
}
function getTotalSaved(){ return Object.values(getSavedByCategory()).reduce((s,v) => s + toCents(v), 0) / 100; }
function getEmergencySaved(){ return Object.entries(getSavedByCategory()).filter(([c]) => c.includes("สำรอง")).reduce((s,[,v]) => s + toCents(v), 0) / 100; }
function getLastBackup(){
  try{ return localStorage.getItem(BACKUP_KEY) || ""; }catch(e){ return ""; }
}
function setLastBackup(iso){
  try{ localStorage.setItem(BACKUP_KEY, iso); }catch(e){}
}
function refreshBackupBanner(){
  const banner = document.getElementById("backupBanner");
  if(!entries.length){ banner.classList.remove("show"); return; }
  const lastBackup = getLastBackup();
  let driveLast=""; try{ driveLast=localStorage.getItem(GDRIVE_LAST_SYNC_KEY)||""; }catch(_){}
  const lastAny=[lastBackup,driveLast].filter(Boolean).sort().pop();
  const staleBackup = !lastAny || (Date.now()-new Date(lastAny).getTime())>7*86400000;
  const dismissedThisMonth = sessionStorage.getItem("backupDismissedMonth") === monthKey(todayISO());
  banner.classList.toggle("show", staleBackup && !dismissedThisMonth);
}

function getMonths(){
  const set = new Set(entries.map(e => monthKey(e.date)));
  const now = new Date();
  for(let i=0; i<12; i++){
    const y = now.getFullYear();
    const m = now.getMonth() - i;
    const d2 = new Date(y, m, 1);
    const mk = `${d2.getFullYear()}-${String(d2.getMonth()+1).padStart(2,"0")}`;
    set.add(mk);
  }
  return Array.from(set).sort().reverse();
}
function getMonthEntries(){
  return entries.filter(e => monthKey(e.date) === selectedMonth);
}
function getTotals(){
  const me = getMonthEntries();
  const sumOf = t => me.filter(e => e.type === t).reduce((s,e) => s + toCents(e.amount), 0) / 100;
  const income = sumOf("income"), expense = sumOf("expense"), saving = sumOf("saving");
  return { income, expense, saving, balance: income - expense - saving };
}
function getByCategory(type, totals){
  const cats = CATS_BY_TYPE[type];
  const me = getMonthEntries();
  const totalForType = totals[type];
  return cats.map(cat => ({
    cat,
    amount: me.filter(e => e.type === type && e.category === cat).reduce((s,e) => s + toCents(e.amount), 0) / 100
  })).filter(c => c.amount > 0)
    .sort((a,b) => b.amount - a.amount)
    .map(c => ({ ...c, pct: totalForType ? Math.round((c.amount/totalForType)*100) : 0 }));
}

function vaultetAssets(){
  const total=getTotalMoneyAllAccounts(), em=getEmergencySaved(), other=Math.max(0,getTotalSaved()-em);
  let pf={value:0,cost:0}; try{ pf=(window.vaultetPortfolioSummary&&window.vaultetPortfolioSummary())||pf; }catch(e){}
  const rest=Math.max(0,other-pf.cost);
  return {total,em,stock:pf.value,rest,assets:total+em+rest+pf.value};
}
function renderAccountsSummary(){
  const total = getTotalMoneyAllAccounts();
  const reserved = getTotalReserved();
  const A = vaultetAssets(), vis=(id,on)=>{ const el=document.getElementById(id); const r=el&&(el.classList.contains("networth-sub")?el:el.parentElement); if(r) r.style.display=on?"":"none"; };
  document.getElementById("totalMoneyNum").textContent = "฿" + fmt(A.assets);
  document.getElementById("inAccountsNum").textContent = "฿" + fmt(total);
  document.getElementById("inAccLabel").textContent = reserved > 0 ? "ในบัญชี" : "ในบัญชี (ใช้ได้จริง)";
  document.getElementById("reservedNum").textContent = "฿" + fmt(reserved);
  document.getElementById("availableNum").textContent = "฿" + fmt(total - reserved);
  vis("reservedRow", reserved > 0); vis("availRow", reserved > 0);
  document.getElementById("emergencySavedNum").textContent = "฿" + fmt(A.em); vis("emergencySavedNum", A.em > 0);
  document.getElementById("stockNum").textContent = "฿" + fmt(A.stock); vis("stockRow", A.stock > 0);
  document.getElementById("otherSavedNum").textContent = "฿" + fmt(A.rest); vis("otherSavedRow", A.rest > 0);
  const rc = getTotalReceivablesOutstanding(), db = getTotalDebts();
  document.getElementById("receivablesNum").textContent = "฿" + fmt(rc); vis("receivablesNum", rc > 0);
  document.getElementById("totalDebtsNum").textContent = "฿" + fmt(db); vis("totalDebtsNum", db > 0);
  const listEl = document.getElementById("accountsList");
  listEl.innerHTML = accounts.map(a => `
    <div class="account-row"><span class="acc-name">${escapeHtml(a.name)}</span><span class="mono">฿${fmt(computeAccountBalance(a.id))}</span></div>
  `).join("");
}

function render(){
  refreshBackupBanner();
  renderAccountsSummary();
  renderUpcomingWidget();
  renderPeriodAnalysis();
  renderCompareSection();
  const months = getMonths();
  const monthSelect = document.getElementById("monthSelect");
  monthSelect.innerHTML = months.map(m => `<option value="${m}" ${m===selectedMonth?"selected":""}>${monthLabel(m)}</option>`).join("");

  const totals = getTotals();
  const carry = getTotalMoneyAllAccounts(selectedMonth + "-01"); // ยอดยกมาจากเดือนก่อน
  const nm = new Date(Number(selectedMonth.slice(0,4)), Number(selectedMonth.slice(5,7)), 1);
  const nextMonthStart = `${nm.getFullYear()}-${String(nm.getMonth()+1).padStart(2,"0")}-01`;
  // เดือนก่อนเริ่มใช้งานจริง (ก่อนรายการแรก) ไม่ต้องโชว์ยอดเริ่มต้นบัญชี
  const firstDate = [...entries.map(e => e.date), ...loans.map(l => l.date)].filter(Boolean).sort()[0];
  const beforeStart = !firstDate || nextMonthStart <= firstDate;
  const heroBal = beforeStart ? 0 : getTotalMoneyAllAccounts(nextMonthStart); // เงินจริง ณ สิ้นเดือนที่เลือก (รวมเงินให้ยืมที่ออกไปด้วย)
  const loanOut = loans.filter(l => l.date && monthKey(l.date) === selectedMonth).reduce((a,l) => a + toCents(l.amount), 0) / 100;
  document.getElementById("balanceNum").textContent = (heroBal<0?"-":"") + "฿" + fmt(Math.abs(heroBal));
  document.getElementById("balanceNum").style.color = heroBal<0 ? "var(--expense)" : "var(--ink)";
  document.getElementById("carryNum").textContent = beforeStart ? "ยังไม่ได้เริ่มใช้งานในเดือนนี้" : (monthKey(firstDate) === selectedMonth ? "ยอดตั้งต้นบัญชี " : "ยกมาจากเดือนก่อน ") + (carry<0?"-":"") + "฿" + fmt(Math.abs(carry)) + (loanOut>0 ? " · ให้ยืมไป ฿" + fmt(loanOut) : "");
  // มูลค่าสุทธิที่แท้จริง = เงินรวมทุกบัญชี (นับรวมเงินออม/เงินลงทุนที่อยู่ในบัญชีอยู่แล้ว) + เงินที่คนอื่นติดค้างเรา − หนี้สินรวม (Milestone 5)
  // ไม่ใช่รายรับลบรายจ่ายของเดือนนี้ ซึ่งเป็นคนละความหมายกัน (นั่นคือกระแสเงินสดของเดือน ไม่ใช่มูลค่าสุทธิสะสม)
  const netWorth = getTotalMoneyAllAccounts() + (vaultetAssets().assets-getTotalMoneyAllAccounts()) + getTotalReceivablesOutstanding() - getTotalDebts();
  document.getElementById("netWorthNum").textContent =
    "มูลค่าสุทธิรวม (สินทรัพย์รวม + เงินให้ยืม − หนี้สิน): " + (netWorth<0?"-":"") + "฿" + fmt(Math.abs(netWorth));
  document.getElementById("pillIncome").textContent = "฿"+fmt(totals.income);
  document.getElementById("pillExpense").textContent = "฿"+fmt(totals.expense);
  document.getElementById("pillSaving").textContent = "฿"+fmt(totals.saving);

  const breakdownSection = document.getElementById("breakdownSection");
  const blocks = [
    { key:"income", label:"รายรับตามหมวด", color:"var(--income)" },
    { key:"expense", label:"รายจ่ายตามหมวด", color:"var(--expense)" },
    { key:"saving", label:"ออม/ลงทุนตามหมวด", color:"var(--saving)" },
  ];
  const BREAKDOWN_LIMIT = 5;
  breakdownSection.innerHTML = blocks.map(b => {
    const rows = getByCategory(b.key, totals);
    if(rows.length===0) return "";
    const expanded = expandedBreakdown[b.key];
    const visibleRows = expanded ? rows : rows.slice(0, BREAKDOWN_LIMIT);
    const hiddenCount = rows.length - visibleRows.length;
    return `<div>
      <span class="section-label">${escapeHtml(b.label)}</span>
      <div style="margin-top:8px">
        ${visibleRows.map(r => `
          <div class="bar-row">
            <div class="bar-row-top"><span>${escapeHtml(r.cat)}</span><span class="mono">฿${fmt(r.amount)}</span></div>
            <div class="bar-track"><div class="bar-fill" style="width:${r.pct}%;background:${b.color}"></div></div>
          </div>
        `).join("")}
        ${hiddenCount>0 ? `<button class="breakdown-toggle" data-toggle="${b.key}">+ ดูอีก ${hiddenCount} หมวด</button>` : ""}
        ${expanded && rows.length>BREAKDOWN_LIMIT ? `<button class="breakdown-toggle" data-toggle="${b.key}">ย่อ</button>` : ""}
      </div>
    </div>`;
  }).join("");
  breakdownSection.querySelectorAll("[data-toggle]").forEach(btn => {
    btn.addEventListener("click", () => {
      const key = btn.dataset.toggle;
      expandedBreakdown[key] = !expandedBreakdown[key];
      render();
    });
  });

  document.getElementById("typeFilter").value = typeFilter;
  const q = searchQuery.trim().toLowerCase();
  const me = [...getMonthEntries()]
    .filter(e => typeFilter==="all" || e.type===typeFilter)
    .filter(e => !q || (e.category || "").toLowerCase().includes(q) || (e.note || "").toLowerCase().includes(q))
    .sort((a,b) => b.date.localeCompare(a.date));
  document.getElementById("countLabel").textContent = me.length + " รายการ";
  const ss = document.getElementById("searchSummary"), sumG = {};
  const sumSrc = searchAllMonths ? entries.filter(e => (typeFilter==="all" || e.type===typeFilter) && ((e.category||"").toLowerCase().includes(q) || (e.note||"").toLowerCase().includes(q))) : me;
  sumSrc.forEach(e => { if(e.type==="transfer") return; const g = sumG[e.type] = sumG[e.type] || {n:0,c:0}; g.n++; g.c += toCents(e.amount); });
  const sumNames = {income:"รายรับ", expense:"รายจ่าย", saving:"ออม"};
  if(q && Object.keys(sumG).length){ ss.innerHTML = "สรุป “" + escapeHtml(searchQuery.trim()) + "” " + (searchAllMonths ? "ทุกเดือน" : "เดือนนี้") + ` · <button id="sumToggle" style="background:none;border:none;color:var(--saving);font:inherit;padding:0;cursor:pointer">${searchAllMonths ? "ดูเฉพาะเดือนนี้" : "ดูทุกเดือน"}</button><br>` + Object.keys(sumG).map(k => `${sumNames[k]} <b>${sumG[k].n}</b> ครั้ง · <b class="mono">฿${fmt(sumG[k].c/100)}</b>`).join("<br>"); ss.style.display = "block"; }
  else ss.style.display = "none";
  ss.onclick = ev => { if(ev.target.id === "sumToggle"){ searchAllMonths = !searchAllMonths; render(); } };
  const listContainer = document.getElementById("listContainer");
  if(me.length===0){
    listContainer.innerHTML = `<div class="empty-state">ยังไม่มีรายการในเดือนนี้ — กดปุ่ม + เพื่อเริ่มจด</div>`;
  }else{
    listContainer.innerHTML = `<ul class="list">
      ${me.map(e => {
        if(e.type === "transfer"){
          const fromName = accounts.find(a=>a.id===e.fromAccountId)?.name || "บัญชีที่ถูกลบ";
          const toName = accounts.find(a=>a.id===e.toAccountId)?.name || "บัญชีที่ถูกลบ";
          return `<li class="list-item" data-id="${e.id}">
            <div class="list-item-left">
              <span class="list-icon" style="background:var(--transfer-soft);color:var(--transfer)">⇄</span>
              <div>
                <div class="list-cat transfer-label">โอน: ${escapeHtml(fromName)} → ${escapeHtml(toName)}</div>
                <div class="list-note">${dayLabel(e.date)}${e.note ? " · "+escapeHtml(e.note) : ""}</div>
              </div>
            </div>
            <div class="list-item-right">
              <span class="mono" style="font-weight:700;color:var(--transfer)">฿${fmt(e.amount)}</span>
              <button class="icon-btn edit-btn" data-id="${e.id}" aria-label="แก้ไข">✏️</button>
              <button class="icon-btn delete-btn" data-id="${e.id}" aria-label="ลบ">🗑</button>
            </div>
          </li>`;
        }
        const color = e.type==="income" ? "var(--income)" : e.type==="saving" ? "var(--saving)" : "var(--expense)";
        const soft = e.type==="income" ? "var(--income-soft)" : e.type==="saving" ? "var(--saving-soft)" : "var(--expense-soft)";
        const sign = e.type==="income" ? "+" : e.type==="saving" ? "→" : "−";
        const glyph = e.type==="income" ? "↑" : e.type==="saving" ? "◆" : "↓";
        return `<li class="list-item" data-id="${e.id}">
          <div class="list-item-left">
            <span class="list-icon" style="background:${soft};color:${color}">${e.recurringId ? "🔁" : glyph}</span>
            <div>
              <div class="list-cat">${escapeHtml(e.category)}</div>
              <div class="list-note">${dayLabel(e.date)}${e.note ? " · "+escapeHtml(e.note) : ""}</div>
            </div>
          </div>
          <div class="list-item-right">
            <span class="mono" style="font-weight:700;color:${color}">${sign}฿${fmt(e.amount)}</span>
            <button class="icon-btn edit-btn" data-id="${e.id}" aria-label="แก้ไข">✏️</button>
            <button class="icon-btn delete-btn" data-id="${e.id}" aria-label="ลบ">🗑</button>
          </div>
        </li>`;
      }).join("")}
    </ul>`;
    listContainer.querySelectorAll(".delete-btn").forEach(btn => {
      btn.addEventListener("click", (ev) => {
        ev.stopPropagation();
        if(!confirm("ลบรายการนี้ใช่ไหม?")) return;
        const target = entries.find(e => e.id === btn.dataset.id);
        if(!target) return;
        if(target.source === "loan_repayment"){
          const result=deleteLoanRepayment(target.loanId,target.repaymentId);
          if(!result.ok && result.error !== "cancelled") showToast("ลบเงินคืนไม่สำเร็จ");
          return;
        }
        syncStudentLoanEntry(target, {...target, type:"__deleted__", category:""});
        entries = entries.filter(e => e.id !== btn.dataset.id);
        saveEntries();
        render();
      });
    });
    listContainer.querySelectorAll(".edit-btn").forEach(btn => {
      btn.addEventListener("click", (ev) => {
        ev.stopPropagation();
        const entry = entries.find(e => e.id === btn.dataset.id);
        if(entry) openForm(entry);
      });
    });
    listContainer.querySelectorAll(".list-item").forEach(li => {
      li.addEventListener("click", () => {
        const entry = entries.find(e => e.id === li.dataset.id);
        if(entry) openForm(entry);
      });
    });
  }
  scheduleGDriveAutoSync();
}

function renderCatGrid(){
  const cats = CATS_BY_TYPE[formType];
  const catGrid = document.getElementById("catGrid");
  // ถ้าหมวดเดิมของรายการที่กำลังแก้ไขถูกลบไปแล้ว ให้แสดงเป็นชิปชั่วคราว (orphan) แทนการเปลี่ยนหมวดให้เงียบๆ
  const showOrphan = orphanCategory && !cats.includes(orphanCategory);
  const chips = showOrphan ? [{ name: orphanCategory, orphan: true }, ...cats.map(c => ({ name: c, orphan: false }))]
                            : cats.map(c => ({ name: c, orphan: false }));
  catGrid.innerHTML = chips.map(({ name: c, orphan }) => {
    const sel = selectedCategory===c ? "selected-"+formType : "";
    const delBtn = orphan
      ? ""
      : `<button type="button" class="cat-chip-del" data-cat="${escapeHtml(c)}" aria-label="ลบหมวด ${escapeHtml(c)}">×</button>`;
    const label = orphan ? `${escapeHtml(c)} (หมวดถูกลบ)` : escapeHtml(c);
    return `<span class="cat-chip-wrap ${sel} ${orphan?"orphan":""}">
      <button type="button" class="cat-chip-label" data-cat="${escapeHtml(c)}">${label}</button>
      ${delBtn}
    </span>`;
  }).join("") + `<button type="button" class="cat-chip add-chip" id="addCatBtn">+ เพิ่มหมวด</button><button type="button" class="cat-chip add-chip" id="mergeCatBtn">⇄ รวมหมวด</button>`;

  catGrid.querySelectorAll(".cat-chip-label").forEach(btn => {
    btn.addEventListener("click", () => {
      selectedCategory = btn.dataset.cat;
      // เลือกหมวดจริงแล้ว ไม่ต้องเตือนเรื่องหมวดที่ถูกลบอีก
      if(cats.includes(selectedCategory)) orphanCategory = null;
      renderCatGrid();
    });
  });
  catGrid.querySelectorAll(".cat-chip-del").forEach(btn => {
    btn.addEventListener("click", (ev) => {
      ev.stopPropagation();
      const cat = btn.dataset.cat;
      if(CATS_BY_TYPE[formType].length <= 1){
        showToast("ต้องเหลืออย่างน้อย 1 หมวด");
        return;
      }
      const inUse = entries.some(e => e.type===formType && e.category===cat);
      const msg = inUse
        ? `หมวด "${cat}" มีรายการที่บันทึกไว้อยู่ ลบหมวดนี้ออกจากตัวเลือกใช่ไหม? (รายการเดิมจะไม่หาย)`
        : `ลบหมวด "${cat}" ใช่ไหม?`;
      if(!confirm(msg)) return;
      CATS_BY_TYPE[formType] = CATS_BY_TYPE[formType].filter(x => x !== cat);
      saveCategories();
      if(selectedCategory === cat){
        orphanCategory = null;
        selectedCategory = CATS_BY_TYPE[formType][0] || "";
      }
      renderCatGrid();
    });
  });
  document.getElementById("addCatBtn").addEventListener("click", () => {
    const name = prompt("ชื่อหมวดใหม่:");
    if(!name) return;
    const trimmed = name.trim();
    if(!trimmed) return;
    orphanCategory = null;
    if(CATS_BY_TYPE[formType].includes(trimmed)){
      selectedCategory = trimmed;
      renderCatGrid();
      return;
    }
    CATS_BY_TYPE[formType].push(trimmed);
    saveCategories();
    selectedCategory = trimmed;
    renderCatGrid();
  });
}

function populateAccountSelects(){
  const opts = accounts.map(a => `<option value="${a.id}">${escapeHtml(a.name)}</option>`).join("");
  document.getElementById("entryAccount").innerHTML = opts;
  document.getElementById("fromAccount").innerHTML = opts;
  document.getElementById("toAccount").innerHTML = opts;
}

function setFormType(t, isInit, entry){
  formType = t;
  const isTransfer = t === "transfer";
  document.getElementById("categoryFieldGroup").style.display = isTransfer ? "none" : "block";
  document.getElementById("transferFieldGroup").style.display = isTransfer ? "block" : "none";
  if(isTransfer){
    if(accounts.length < 2){
      showToast("ต้องมีอย่างน้อย 2 บัญชีก่อนถึงจะโอนเงินได้");
    }
    populateAccountSelects();
    document.getElementById("fromAccount").value = entry ? entry.fromAccountId : (accounts[0]?.id || "");
    document.getElementById("toAccount").value = entry ? entry.toAccountId : (accounts[1]?.id || accounts[0]?.id || "");
    document.querySelectorAll(".type-btn").forEach(b => {
      b.classList.remove("active-expense","active-income","active-saving","active-transfer");
      if(b.dataset.type===t) b.classList.add("active-transfer");
    });
    document.getElementById("submitBtn").style.background = "var(--transfer)";
    return;
  }
  const cats = CATS_BY_TYPE[t] || [];
  if(!cats.includes(selectedCategory)){
    if(isInit && selectedCategory){
      // กำลังเปิดฟอร์มแก้ไขรายการเดิม และหมวดของรายการนั้นถูกลบไปแล้ว — คงค่าไว้เป็น orphan แทนการสลับเงียบๆ
      orphanCategory = selectedCategory;
    }else{
      // รายการใหม่ หรือผู้ใช้กดสลับประเภทเอง — เลือกหมวดล่าสุดที่เคยใช้กับประเภทนี้ ถ้ามี ไม่งั้นเลือกหมวดแรก
      orphanCategory = null;
      const last = lastUsedCat[t];
      selectedCategory = (last && cats.includes(last)) ? last : (cats.length ? cats[0] : "");
    }
  }else{
    orphanCategory = null;
  }
  document.querySelectorAll(".type-btn").forEach(b => {
    b.classList.remove("active-expense","active-income","active-saving","active-transfer");
    if(b.dataset.type===t) b.classList.add("active-"+t);
  });
  document.getElementById("submitBtn").style.background = `var(--${t})`;
  populateAccountSelects();
  document.getElementById("entryAccount").value = entry ? (entry.accountId || UNASSIGNED_ACCOUNT_ID) : (lastUsedAccountId && accounts.some(a=>a.id===lastUsedAccountId) ? lastUsedAccountId : (accounts[0]?.id || ""));
  renderCatGrid();
}

function openForm(entry){
  editingId = entry ? entry.id : null;
  document.getElementById("modalTitle").textContent = entry ? "แก้ไขรายการ" : "เพิ่มรายการ";
  document.getElementById("overlay").classList.add("open");
  document.getElementById("date").value = entry ? entry.date : todayISO();
  document.getElementById("amount").value = entry ? entry.amount : "";
  document.getElementById("note").value = entry ? (entry.note || "") : "";
  selectedCategory = entry ? entry.category : "";
  orphanCategory = null;
  setFormType(entry ? entry.type : "expense", true, entry);
  const v = parseFloat(document.getElementById("amount").value);
  document.getElementById("submitBtn").disabled = !v || v<=0;
  document.getElementById("amount").focus();
}
function closeForm(){
  document.getElementById("overlay").classList.remove("open");
  editingId = null;
}

document.getElementById("fabBtn").addEventListener("click", () => openForm(null));
document.getElementById("closeBtn").addEventListener("click", closeForm);
document.getElementById("overlay").addEventListener("click", closeForm);
document.querySelectorAll(".type-btn").forEach(btn => {
  btn.addEventListener("click", () => setFormType(btn.dataset.type));
});
document.getElementById("amount").addEventListener("input", () => {
  const v = parseFloat(document.getElementById("amount").value);
  document.getElementById("submitBtn").disabled = !v || v<=0;
});
document.querySelectorAll(".quick-amount-btn[data-add]").forEach(btn => {
  btn.addEventListener("click", () => {
    const amountInput = document.getElementById("amount");
    const current = parseFloat(amountInput.value) || 0;
    const add = parseFloat(btn.dataset.add) || 0;
    // รวมด้วยหน่วยสตางค์ก่อนหารกลับ กันปัญหา floating point เพี้ยนสะสม
    amountInput.value = Math.max(0, toCents(current) + toCents(add)) / 100;
    amountInput.dispatchEvent(new Event("input"));
  });
});
document.getElementById("quickAmountClear").addEventListener("click", () => {
  const amountInput = document.getElementById("amount");
  amountInput.value = "";
  amountInput.dispatchEvent(new Event("input"));
  amountInput.focus();
});
document.getElementById("monthSelect").addEventListener("change", (e) => {
  selectedMonth = e.target.value;
  render();
});
document.getElementById("typeFilter").addEventListener("change", (e) => {
  typeFilter = e.target.value;
  render();
});
// ===== AI Layer integration point: pure data-in commit function =====
// รับ payload ตรงๆ ไม่พึ่ง DOM เพื่อให้ทั้ง UI ฟอร์มเดิม และ AI Confirmation Sheet
// เรียกจุดเดียวกันได้ ผลลัพธ์และ side-effect เหมือนโค้ดเดิมทุกประการ
// payload: { type, category, accountId, fromAccountId, toAccountId, amount, date, note, editingId }
// return: { ok:true, entry } | { ok:false, error }
function findStudentLoanDebt(){ return debts.find(d => d.type === "student_loan") || debts.find(d => d.name === "กยศ.") || null; }
function ensureStudentLoanDebt(){
  let d=findStudentLoanDebt();
  if(d) return d;
  d={id:makeId(),name:"กยศ.",type:"student_loan",outstandingBalance:0,gracePeriod:true,note:"",history:[]};
  debts.push(d); saveDebts(); return d;
}
function applyStudentLoanImpact(entry, delta){
  if(!entry || entry.type!=="income" || entry.category!=="กยศ.") return;
  const cents=toCents(delta); if(!cents) return;
  const d=entry.debtId ? debts.find(x=>x.id===entry.debtId) : findStudentLoanDebt();
  const debt=d || ensureStudentLoanDebt();
  debt.outstandingBalance=Math.max(0,(toCents(debt.outstandingBalance)+cents)/100);
  debt.history.unshift({id:makeId(),type:cents>0?"increase":"adjustment",amount:cents/100,date:entry.date||todayISO(),note:"เชื่อมกับรายการ กยศ. #"+entry.id.slice(0,8),entryId:entry.id});
  entry.debtId=debt.id; entry.debtPrincipalImpact=cents/100;
  saveDebts();
}
function reverseStudentLoanImpact(entry){
  if(!entry || !entry.debtId || !entry.debtPrincipalImpact) return;
  const d=debts.find(x=>x.id===entry.debtId); if(!d) return;
  const cents=toCents(entry.debtPrincipalImpact);
  d.outstandingBalance=Math.max(0,(toCents(d.outstandingBalance)-cents)/100);
  d.history.unshift({id:makeId(),type:"adjustment",amount:-entry.debtPrincipalImpact,date:todayISO(),note:"ย้อนผลจากการแก้ไข/ลบรายการ กยศ.",entryId:entry.id});
  saveDebts();
  entry.debtId=null; entry.debtPrincipalImpact=0;
}
function syncStudentLoanEntry(oldEntry, newEntry){
  const oldImpact=oldEntry?.debtPrincipalImpact || 0;
  if(oldEntry?.debtId && oldImpact){
    const d=debts.find(x=>x.id===oldEntry.debtId);
    if(d){ d.outstandingBalance=Math.max(0,(toCents(d.outstandingBalance)-toCents(oldImpact))/100); d.history.unshift({id:makeId(),type:"adjustment",amount:-oldImpact,date:todayISO(),note:"ย้อนผลก่อนอัปเดตรายการ กยศ.",entryId:oldEntry.id}); saveDebts(); }
  }
  if(newEntry?.type==="income" && newEntry?.category==="กยศ."){
    const d=findStudentLoanDebt() || ensureStudentLoanDebt();
    d.outstandingBalance=Math.max(0,(toCents(d.outstandingBalance)+toCents(newEntry.amount))/100);
    d.history.unshift({id:makeId(),type:"increase",amount:Number(newEntry.amount),date:newEntry.date||todayISO(),note:"เชื่อมกับรายการ กยศ.",entryId:newEntry.id});
    newEntry.debtId=d.id; newEntry.debtPrincipalImpact=Number(newEntry.amount);
    saveDebts();
  }else{ newEntry.debtId=null; newEntry.debtPrincipalImpact=0; }
}

function commitEntry(payload){
  let amount=parseFloat(payload.amount); if(!Number.isFinite(amount)||amount<=0) return {ok:false,error:"invalid_amount"};
  amount=Math.round(amount*100)/100; const date=payload.date||todayISO(); const note=(payload.note||"").trim(); const editingId=payload.editingId||null; const type=payload.type;
  if(editingId){
    const existing=entries.find(e=>e.id===editingId);
    if(existing?.source === "loan_repayment"){
      if(type!=="income" || payload.category!==existing.category) return {ok:false,error:"loan_repayment_category_locked"};
      const loan=loans.find(l=>l.id===existing.loanId), repayment=loan?.repayments?.find(r=>r.id===existing.repaymentId);
      if(!loan||!repayment) return {ok:false,error:"loan_repayment_link_missing"};
      const max=getLoanRepaymentGrossCap(loan,repayment.id);
      if(toCents(amount)>toCents(max)) return {ok:false,error:"invalid_repayment_amount"};
      repayment.amount=amount; repayment.accountId=payload.accountId||repayment.accountId; repayment.date=date; repayment.note=note||repayment.note||`รับคืนเงินจาก ${loan.person}`; repayment.financialEntryId=existing.id;
      Object.assign(existing,{type:"income",category:loanRepaymentCategory(),accountId:repayment.accountId,amount,date,note:repayment.note,source:"loan_repayment",loanId:loan.id,repaymentId:repayment.id});
      saveEntries();saveLoans();return{ok:true,entry:existing};
    }
  }
  if(type==="transfer"){
    const fromAccountId=payload.fromAccountId,toAccountId=payload.toAccountId;
    if(!fromAccountId||!toAccountId||fromAccountId===toAccountId) return {ok:false,error:"invalid_transfer_accounts"};
    let entry;
    if(editingId){ const idx=entries.findIndex(e=>e.id===editingId); if(idx===-1)return{ok:false,error:"entry_not_found"}; entry=entries[idx]; const old={...entry}; Object.assign(entry,{type:"transfer",category:undefined,fromAccountId,toAccountId,amount,date,note}); syncStudentLoanEntry(old,entry); }
    else { entry={id:makeId(),type:"transfer",fromAccountId,toAccountId,amount,date,note}; entries.unshift(entry); }
    saveEntries(); return {ok:true,entry};
  }
  const accountId=payload.accountId||UNASSIGNED_ACCOUNT_ID,category=payload.category; let entry;
  if(editingId){ const idx=entries.findIndex(e=>e.id===editingId); if(idx===-1)return{ok:false,error:"entry_not_found"}; const old={...entries[idx]}; entry=entries[idx]; Object.assign(entry,{type,category,accountId,amount,date,note}); syncStudentLoanEntry(old,entry); }
  else { entry={id:makeId(),type,category,accountId,amount,date,note}; entries.unshift(entry); if(type==="income"&&category==="กยศ."){ syncStudentLoanEntry(null,entry); } }
  lastUsedCat[type]=category; saveLastCat(); lastUsedAccountId=accountId; saveLastAccount(); saveEntries();
  return {ok:true,entry};
}

document.getElementById("submitBtn").addEventListener("click", () => {
  const amountRaw = document.getElementById("amount").value;
  const date = document.getElementById("date").value || todayISO();
  const note = document.getElementById("note").value;

  const payload = formType === "transfer"
    ? {
        type: "transfer",
        fromAccountId: document.getElementById("fromAccount").value,
        toAccountId: document.getElementById("toAccount").value,
        amount: amountRaw, date, note, editingId
      }
    : {
        type: formType,
        category: selectedCategory,
        accountId: document.getElementById("entryAccount").value,
        amount: amountRaw, date, note, editingId
      };

  const result = commitEntry(payload);
  if(!result.ok){
    if(result.error === "invalid_transfer_accounts") showToast("เลือกบัญชีต้นทางกับปลายทางให้ต่างกัน");
    // invalid_amount: เดิมไม่มี toast (ปุ่มถูก disable อยู่แล้วเมื่อจำนวนเงินไม่ถูกต้อง) — คงพฤติกรรมเดิม
    return;
  }

  closeForm();
  selectedMonth = monthKey(result.entry.date);
  render();
});

document.getElementById("searchInput").addEventListener("input", (e) => {
  searchQuery = e.target.value;
  render();
});
document.getElementById("backupNowBtn").addEventListener("click", () => {
  document.getElementById("exportBtn").click();
});
document.getElementById("backupDismissBtn").addEventListener("click", () => {
  sessionStorage.setItem("backupDismissedMonth", monthKey(todayISO()));
  document.getElementById("backupBanner").classList.remove("show");
});

document.getElementById("exportBtn").addEventListener("click", () => {
  const payload = buildBackupPayload();
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `finance-backup-${backupStamp()}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  setLastBackup(todayISO());
  refreshBackupBanner();
  showToast(`ดาวน์โหลดไฟล์สำรองแล้ว ✓ ${payload.integrity.counts.entries} รายการ · ${payload.integrity.counts.storageKeys} ชุดข้อมูล · รหัสตรวจ ${payload.integrity.hash.slice(0,8)}`);
});

document.getElementById("importBtn").addEventListener("click", () => {
  document.getElementById("importFile").click();
});
// รวมข้อมูลจาก backup object (data) เข้ากับข้อมูลปัจจุบัน แบบ merge-by-id (ไม่ทับของเดิม แค่เติมของที่ยังไม่มี)
// ใช้ร่วมกันทั้งกู้คืนจากไฟล์ (importFile) และกู้คืนจาก Google Drive — คืน true ถ้าสำเร็จ, false ถ้าข้อมูลไม่ถูกต้อง
function applyImportedBackup(data){
  if(!data || typeof data !== 'object') return false;
  // รองรับทั้ง Backup แบบใหม่ (envelope) และ Backup รุ่นเก่าที่มี fields อยู่ top-level
  const source = data.data && typeof data.data === 'object' ? data.data : data;
  if(!Array.isArray(source.entries)) return false;
  // Restore persisted app state ก่อน แล้วค่อย merge ข้อมูลการเงินแบบเดิม
  // Secret/API key และ state ของ OAuth/Drive จะไม่ถูกนำกลับมาโดยเด็ดขาด
  const storedState = data.appState?.localStorage || source.appState?.localStorage;
  if(storedState && typeof storedState === 'object'){
    try{
      Object.entries(storedState).forEach(([key,value]) => {
        if(shouldBackupLocalStorageKey(key) && typeof value === 'string') localStorage.setItem(key,value);
      });
    }catch(e){}
  }
  const existingIds = new Set(entries.map(en => en.id));
  const merged = [...entries];
  source.entries.forEach(en => { if(!existingIds.has(en.id)) merged.push(en); });
  entries = merged;
  if(source.categories){
    ["income","expense","saving"].forEach(t => {
      if(Array.isArray(source.categories[t])){
        const set = new Set([...CATS_BY_TYPE[t], ...source.categories[t]]);
        CATS_BY_TYPE[t] = Array.from(set);
      }
    });
    saveCategories();
  }
  if(Array.isArray(source.accounts)){
    const existingAccIds = new Set(accounts.map(a => a.id));
    source.accounts.forEach(a => { if(a && a.id && !existingAccIds.has(a.id)) accounts.push(a); });
    saveAccounts();
  }
  if(Array.isArray(source.reservedItems)){
    const existingResIds = new Set(reservedItems.map(r => r.id));
    source.reservedItems.forEach(r => { if(r && r.id && !existingResIds.has(r.id)) reservedItems.push(r); });
    saveReserved();
  }
  if(Array.isArray(source.loans)){
    const existingLoanIds = new Set(loans.map(l => l.id));
    source.loans.forEach(l => { if(l && l.id && !existingLoanIds.has(l.id)){ if(!Array.isArray(l.repayments)) l.repayments=[]; loans.push(l); } });
    saveLoans();
  }
  // Backup เก่าที่ไม่มี recurringExpenses เลย ให้ถือเป็น [] (ค่าเริ่มต้น) โดยไม่ทำให้ restore พัง
  if(Array.isArray(source.recurringExpenses)){
    const existingRecIds = new Set(recurringExpenses.map(r => r.id));
    source.recurringExpenses.forEach(r => { if(r && r.id && !existingRecIds.has(r.id)) recurringExpenses.push(r); });
    saveRecurring();
  }
  // Backup เก่าที่ไม่มี debts เลย (ก่อน Milestone 5) ให้ถือเป็น [] โดยไม่ทำให้ restore พัง
  if(Array.isArray(source.debts)){
    const existingDebtIds = new Set(debts.map(d => d.id));
    source.debts.forEach(d => { if(d && d.id && !existingDebtIds.has(d.id)){ if(!Array.isArray(d.history)) d.history=[]; debts.push(d); } });
    saveDebts();
  }
  if(Array.isArray(source.budgets)){
    const existingBudgetIds = new Set(budgets.map(b => b.id));
    source.budgets.map(normalizeBudget).filter(Boolean).forEach(b => { if(!existingBudgetIds.has(b.id)) budgets.push(b); });
    const map=new Map(); budgets.forEach(b=>{ const k=budgetKey(b); const old=map.get(k); if(!old || String(b.updatedAt)>String(old.updatedAt)) map.set(k,b); });
    budgets=Array.from(map.values()); saveBudgets();
  }
  if(source.emergencyFundConfig && typeof source.emergencyFundConfig === "object"){ emergencyFundConfig=normalizeEmergencyConfig(source.emergencyFundConfig); saveEmergencyFundConfig(); }
  saveEntries();
  render();
  return true;
}


// ===== กู้คืนข้อมูล: ตรวจไฟล์ → เทียบจำนวน → เลือก "แทนที่ทั้งหมด" (ตรงไฟล์เป๊ะ) หรือ "รวมเข้ากับของเดิม" =====
function promptRestore(data,label){
  const source=data&&data.data&&typeof data.data==="object"?data.data:data;
  if(!source||!Array.isArray(source.entries)){ showToast("ไฟล์ไม่ถูกต้อง กู้คืนไม่สำเร็จ"); return; }
  const ver=verifyBackupIntegrity(data), stored=(data.appState&&data.appState.localStorage)||(source.appState&&source.appState.localStorage);
  const canReplace=!!stored&&typeof stored==="object"&&ver.status!=="mismatch";
  const c=a=>Array.isArray(a)?a.length:0;
  const rows=[["รายการเงิน",c(source.entries),entries.length],["บัญชี",c(source.accounts),accounts.length],["งบประมาณ",c(source.budgets),budgets.length],["หนี้",c(source.debts),debts.length],["เงินให้ยืม",c(source.loans),loans.length],["รายจ่ายประจำ",c(source.recurringExpenses),recurringExpenses.length],["เงินที่กันไว้",c(source.reservedItems),reservedItems.length]];
  const vtxt=ver.status==="ok"?`<span style="color:#52b788">✓ ผ่านการตรวจความถูกต้อง (รหัส ${escapeHtml(ver.hash.slice(0,8))})</span>`:ver.status==="mismatch"?`<span style="color:#ef5350">✗ ไฟล์ไม่ตรงกับรหัสตรวจ — อาจเสียหายหรือถูกแก้ไข จึงปิดโหมดแทนที่</span>`:`<span style="color:#e9c46a">ไฟล์รุ่นเก่า ไม่มีรหัสตรวจ (ตรวจความถูกต้องไม่ได้)</span>`;
  const when=data.exportedAt?new Date(data.exportedAt).toLocaleString("th-TH"):"ไม่ทราบ";
  const ov=document.createElement("div");
  ov.style.cssText="position:fixed;inset:0;z-index:4000;background:rgba(0,0,0,.65);display:flex;align-items:center;justify-content:center;padding:16px;";
  const bs="width:100%;padding:13px 0;border-radius:14px;font-size:14.5px;font-weight:700;font-family:inherit;cursor:pointer;margin-top:8px;";
  ov.innerHTML=`<div style="background:var(--surface,#161618);color:var(--ink,#F5F5F7);border:1px solid var(--line,#2a2a2e);border-radius:18px;padding:18px;max-width:420px;width:100%;max-height:88vh;overflow:auto;">
    <div style="font-weight:800;font-size:16px;margin-bottom:4px;">กู้คืนข้อมูลจาก ${escapeHtml(label||"ไฟล์")}</div>
    <div style="font-size:12px;color:var(--faint,#8E8E93);margin-bottom:8px;">สำรองเมื่อ ${escapeHtml(when)}</div>
    <div style="font-size:12.5px;margin-bottom:10px;">${vtxt}</div>
    <div style="font-size:12.5px;border:1px solid var(--line,#2a2a2e);border-radius:12px;padding:8px 10px;"><div style="display:flex;justify-content:space-between;color:var(--faint,#8E8E93);"><span></span><span>ในไฟล์ / ตอนนี้</span></div>${rows.map(r=>`<div style="display:flex;justify-content:space-between;padding:3px 0;"><span>${r[0]}</span><span class="mono">${r[1]} / ${r[2]}</span></div>`).join("")}</div>
    <button type="button" id="rsReplace" ${canReplace?"":"disabled"} style="${bs}border:none;background:${canReplace?"var(--accent1,#1DB954)":"#333"};color:${canReplace?"#0A0A0C":"#777"};">♻️ แทนที่ทั้งหมด (ให้ตรงไฟล์เป๊ะ)</button>
    <div style="font-size:11px;color:var(--faint,#8E8E93);margin:4px 2px 0;">${canReplace?"ข้อมูลปัจจุบันจะถูกดาวน์โหลดเก็บไว้เป็นไฟล์ก่อนเสมอ แล้วแอปจะโหลดใหม่":"ใช้ไม่ได้: ไฟล์ไม่มีข้อมูลสถานะแอป หรือรหัสตรวจไม่ตรง"}</div>
    <button type="button" id="rsMerge" style="${bs}border:1px solid var(--line,#2a2a2e);background:var(--surface-2,#1c1c1f);color:var(--ink,#F5F5F7);">➕ รวมเข้ากับข้อมูลเดิม (ไม่ลบอะไร)</button>
    <button type="button" id="rsCancel" style="${bs}border:none;background:transparent;color:var(--faint,#8E8E93);">ยกเลิก</button></div>`;
  document.body.appendChild(ov);
  const close=()=>ov.remove();
  ov.querySelector("#rsCancel").onclick=close;
  ov.querySelector("#rsMerge").onclick=()=>{ close(); try{ if(!applyImportedBackup(data)) throw new Error("invalid"); showToast("รวมข้อมูลสำเร็จ"); }catch(e){ showToast("กู้คืนไม่สำเร็จ"); } };
  ov.querySelector("#rsReplace").onclick=()=>{
    if(!canReplace) return;
    if(!confirm("ข้อมูลในเครื่องจะถูกแทนที่ด้วยข้อมูลในไฟล์ทั้งหมด (รวมรายการที่ไม่มีในไฟล์จะหายไป)\nระบบจะดาวน์โหลดข้อมูลปัจจุบันเก็บไว้ให้ก่อน ดำเนินการต่อไหม?")) return;
    try{
      downloadJsonFile(buildBackupPayload(),`finance-before-restore-${backupStamp()}.json`);
      const keep=new Set(Object.keys(stored).filter(k=>shouldBackupLocalStorageKey(k)&&typeof stored[k]==="string")), drop=[];
      for(let i=0;i<localStorage.length;i++){ const k=localStorage.key(i); if(shouldBackupLocalStorageKey(k)&&!keep.has(k)) drop.push(k); }
      setTimeout(()=>{
        try{
          drop.forEach(k=>localStorage.removeItem(k));
          keep.forEach(k=>localStorage.setItem(k,stored[k]));
          sessionStorage.setItem("vaultet_restored",`กู้คืนแบบแทนที่ทั้งหมดสำเร็จ ✓ (${c(source.entries)} รายการ) — ไฟล์ข้อมูลก่อนกู้คืนถูกดาวน์โหลดเก็บไว้แล้ว`);
          location.reload();
        }catch(e){ showToast("กู้คืนไม่สำเร็จ: "+(e&&e.message||e)); }
      },1200);
      close(); showToast("กำลังเก็บไฟล์ข้อมูลเดิม แล้วกู้คืน…");
    }catch(e){ showToast("กู้คืนไม่สำเร็จ: "+(e&&e.message||e)); }
  };
}

document.getElementById("importFile").addEventListener("change", (e) => {
  const file = e.target.files[0];
  if(!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try{
      const data = JSON.parse(reader.result);
      promptRestore(data, "ไฟล์ " + file.name);
    }catch(err){
      showToast("ไฟล์ไม่ถูกต้อง กู้คืนไม่สำเร็จ");
    }
    e.target.value = "";
  };
  reader.readAsText(file);
});

// ===== AI Layer (Milestone 1): Settings panel — API Key(s) =====
// โชว์คีย์แบบปิดบังส่วนใหญ่ไว้ เหลือ 4 ตัวท้ายให้เห็น พอแยกออกว่าเป็นคีย์ไหน
function maskApiKey(key){
  if(!key) return "";
  const tail = key.slice(-4);
  const hidden = Math.max(4, key.length - 4);
  return "•".repeat(Math.min(hidden, 24)) + tail;
}
function renderApiKeyList(){
  const el = document.getElementById("apiKeyList");
  const keys = getApiKeys();
  const input = document.getElementById("apiKeyInput");
  if(!keys.length){
    el.innerHTML = "";
  }else{
    el.innerHTML = keys.map((k, i) => `
      <div class="memory-row">
        <div>
          <div class="memory-row-text">คีย์ที่ ${i+1}${i === 0 ? " (หลัก)" : " (สำรอง)"}</div>
          <div class="memory-row-meta">${escapeHtml(maskApiKey(k))}</div>
        </div>
        <button class="icon-btn delete-api-key-btn" data-index="${i}" aria-label="ลบคีย์นี้">🗑</button>
      </div>
    `).join("");
    el.querySelectorAll(".delete-api-key-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        const idx = parseInt(btn.dataset.index, 10);
        const cur = getApiKeys();
        cur.splice(idx, 1);
        saveApiKeys(cur);
        refreshApiKeyStatus();
        showToast("ลบ API Key แล้ว");
      });
    });
  }
  const atMax = keys.length >= AI_APIKEYS_MAX;
  input.disabled = atMax;
  input.placeholder = atMax ? `ใส่ได้สูงสุด ${AI_APIKEYS_MAX} คีย์` : "วาง Gemini API Key ที่นี่";
  document.getElementById("saveApiKeyBtn").disabled = atMax;
}
function refreshApiKeyStatus(){
  const keys = getApiKeys();
  const has = keys.length > 0;
  const statusEl = document.getElementById("apiKeyStatus");
  statusEl.textContent = has ? `ตั้งค่าแล้ว ${keys.length} คีย์ ✓` : "ยังไม่ได้ตั้งค่า";
  statusEl.style.color = has ? "var(--income)" : "var(--faint)";
  renderApiKeyList();
}
document.getElementById("settingsBtn").addEventListener("click", () => {
  document.getElementById("apiKeyInput").value = "";
  refreshApiKeyStatus();
  refreshGDriveStatus();
  aiProfileDraft = loadAIProfile() || { nickname:"", monthlyIncomeEstimate:null, minReserveTarget:null, financialGoals:[], notes:"" };
  renderAIProfileForm();
  renderAIMemoryList();
  document.getElementById("settingsOverlay").classList.add("open");
});
document.getElementById("closeSettingsBtn").addEventListener("click", () => {
  document.getElementById("settingsOverlay").classList.remove("open");
});
document.getElementById("settingsOverlay").addEventListener("click", () => {
  document.getElementById("settingsOverlay").classList.remove("open");
});
document.getElementById("saveApiKeyBtn").addEventListener("click", () => {
  const val = document.getElementById("apiKeyInput").value.trim();
  if(!val){ showToast("กรอก API Key ก่อน"); return; }
  const cur = getApiKeys();
  if(cur.length >= AI_APIKEYS_MAX){ showToast(`ใส่ได้สูงสุด ${AI_APIKEYS_MAX} คีย์`); return; }
  if(cur.includes(val)){ showToast("คีย์นี้ถูกเพิ่มไว้แล้ว"); return; }
  cur.push(val);
  saveApiKeys(cur);
  document.getElementById("apiKeyInput").value = "";
  refreshApiKeyStatus();
  showToast(cur.length === 1 ? "บันทึก API Key แล้ว" : "เพิ่ม API Key สำรองแล้ว");
});

// ===== Google Drive Auto-Backup: Settings panel =====
function gdriveTimeLabel(iso){
  if(!iso) return "ยังไม่เคย";
  const d = new Date(iso);
  const pad = n => String(n).padStart(2,"0");
  return `${pad(d.getDate())}/${pad(d.getMonth()+1)}/${d.getFullYear()+543} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function refreshGDriveStatus(){
  const clientId = localStorage.getItem(GDRIVE_CLIENT_ID_KEY);
  const fileId = localStorage.getItem(GDRIVE_FILE_ID_KEY);
  const connected = !!clientId && !!fileId; // ถือว่า "เชื่อมต่อแล้ว" หลังเคยสำรองสำเร็จอย่างน้อย 1 ครั้ง (มี fileId)
  const connStatusEl = document.getElementById("gdriveConnStatus");
  connStatusEl.textContent = connected ? "เชื่อมต่อแล้ว ✓" : (clientId ? "ตั้งค่า Client ID แล้ว ยังไม่เคยสำรอง" : "ยังไม่ได้เชื่อมต่อ");
  connStatusEl.style.color = connected ? "var(--income)" : "var(--faint)";
  document.getElementById("gdriveLastSyncStatus").textContent = gdriveTimeLabel(localStorage.getItem(GDRIVE_LAST_SYNC_KEY));
  document.getElementById("gdriveClientIdInput").value = clientId || "";
  document.getElementById("gdriveConnectBtn").style.display = clientId ? "block" : "none";
  document.getElementById("gdriveDisconnectBtn").style.display = (clientId || fileId) ? "block" : "none";
  document.getElementById("gdriveSyncNowBtn").disabled = !clientId;
  document.getElementById("gdriveRestoreBtn").disabled = !fileId;
  const autoOn=localStorage.getItem(GDRIVE_AUTOSYNC_KEY)==="1";
  const tokenReady=!!(gdriveAccessToken && Date.now()<gdriveAccessTokenExpiry);
  document.getElementById("gdriveAutoSyncToggle").checked = autoOn;
  document.getElementById("gdriveAutoSyncToggle").disabled = !clientId;
  const autoStatus=document.getElementById("gdriveAutoStatus");
  if(autoStatus){
    autoStatus.textContent=!autoOn ? "Auto Backup ปิดอยู่" : gdriveLastAutoError ? gdriveLastAutoError : tokenReady ? "Auto Backup พร้อมทำงานในเซสชันนี้" : fileId ? "Auto Backup เปิดอยู่ แต่ต้องเชื่อมต่อ Google Drive ใหม่ก่อนจึงจะสำรองเบื้องหลังได้" : "Auto Backup เปิดอยู่ แต่ยังไม่มีไฟล์สำรองบน Drive";
    autoStatus.dataset.state=!autoOn?'off':gdriveLastAutoError?'error':tokenReady?'ready':'needs-auth';
  }
}
document.getElementById("saveGDriveClientIdBtn").addEventListener("click", () => {
  const val = document.getElementById("gdriveClientIdInput").value.trim();
  if(!val){ showToast("กรอก Client ID ก่อน"); return; }
  localStorage.setItem(GDRIVE_CLIENT_ID_KEY, val);
  gdriveTokenClient = null; // บังคับสร้าง token client ใหม่ด้วย client id ล่าสุด
  initGDriveTokenClient();
  refreshGDriveStatus();
  showToast("บันทึก Client ID แล้ว — กด \"เชื่อมต่อ Google Drive\" ต่อได้เลย");
});
document.getElementById("gdriveConnectBtn").addEventListener("click", async () => {
  if(!localStorage.getItem(GDRIVE_CLIENT_ID_KEY)){ showToast("ใส่ Client ID แล้วกดบันทึกก่อน"); return; }
  try{
    await requestGDriveToken("consent"); // ต้องมี user gesture (มาจาก click นี้แหละ) ถึงจะเปิด popup ได้
    await runGDriveSync(false); // สำรองครั้งแรกทันทีหลังเชื่อมต่อสำเร็จ เพื่อสร้างไฟล์บน Drive และยืนยันว่าเชื่อมต่อได้จริง
    refreshGDriveStatus();
  }catch(e){
    showToast("เชื่อมต่อ Google Drive ไม่สำเร็จ ลองใหม่อีกครั้ง");
  }
});
document.getElementById("gdriveDisconnectBtn").addEventListener("click", () => {
  gdriveAccessToken = null;
  gdriveAccessTokenExpiry = 0;
  gdriveTokenClient = null;
  localStorage.removeItem(GDRIVE_CLIENT_ID_KEY);
  localStorage.removeItem(GDRIVE_FILE_ID_KEY);
  localStorage.removeItem(GDRIVE_LAST_SYNC_KEY);
  localStorage.removeItem(GDRIVE_AUTOSYNC_KEY);
  refreshGDriveStatus();
  showToast("ยกเลิกการเชื่อมต่อ Google Drive แล้ว (ไฟล์ backup บน Drive จริงยังอยู่ ไม่ถูกลบ)");
});
document.getElementById("gdriveSyncNowBtn").addEventListener("click", async () => {
  await runGDriveSync(false);
  refreshGDriveStatus();
});
document.getElementById("gdriveRestoreBtn").addEventListener("click", async () => {
  try{
    const data = await gdriveDownloadBackup();
    promptRestore(data, "Google Drive");
  }catch(e){
    showToast("กู้คืนจาก Drive ไม่สำเร็จ");
  }
});
document.getElementById("gdriveAutoSyncToggle").addEventListener("change", (e) => {
  localStorage.setItem(GDRIVE_AUTOSYNC_KEY, e.target.checked ? "1" : "0");
  if(e.target.checked) scheduleGDriveAutoSync();
  refreshGDriveStatus();
});

// ===== AI Layer (Milestone 3): Profile / Memory — storage helpers =====
// คืน null ถ้าผู้ใช้ยังไม่เคยตั้งค่าอะไรเลย (แยกจากกรณีตั้งค่าแล้วแต่ทุกฟิลด์ว่าง) — สำคัญสำหรับ analyzeFinancialQuery()
function loadAIProfile(){
  try{
    const raw = localStorage.getItem(AI_PROFILE_KEY);
    if(!raw) return null;
    const parsed = JSON.parse(raw);
    return {
      nickname: parsed.nickname || "",
      monthlyIncomeEstimate: (typeof parsed.monthlyIncomeEstimate === "number" && !isNaN(parsed.monthlyIncomeEstimate)) ? parsed.monthlyIncomeEstimate : null,
      minReserveTarget: (typeof parsed.minReserveTarget === "number" && !isNaN(parsed.minReserveTarget)) ? parsed.minReserveTarget : null,
      financialGoals: Array.isArray(parsed.financialGoals) ? parsed.financialGoals : [],
      notes: parsed.notes || "",
    };
  }catch(e){ return null; }
}
function saveAIProfile(profile){
  try{ localStorage.setItem(AI_PROFILE_KEY, JSON.stringify(profile)); return true; }catch(e){ return false; }
}
function hasAIProfileContent(p){
  if(!p) return false;
  return !!(p.nickname || p.monthlyIncomeEstimate!=null || p.minReserveTarget!=null || p.notes || (p.financialGoals && p.financialGoals.length));
}
function refreshAIProfileStatus(){
  const has = !!localStorage.getItem(AI_PROFILE_KEY);
  const statusEl = document.getElementById("aiProfileStatus");
  statusEl.textContent = has ? "ตั้งค่าแล้ว ✓" : "ยังไม่ได้ตั้งค่า";
  statusEl.style.color = has ? "var(--income)" : "var(--faint)";
}

// ===== AI Layer (Milestone 3): Profile / Memory — form rendering =====
function renderAIProfileForm(){
  refreshAIProfileStatus();
  document.getElementById("aiProfileNickname").value = aiProfileDraft.nickname || "";
  document.getElementById("aiProfileIncome").value = aiProfileDraft.monthlyIncomeEstimate!=null ? aiProfileDraft.monthlyIncomeEstimate : "";
  document.getElementById("aiProfileReserve").value = aiProfileDraft.minReserveTarget!=null ? aiProfileDraft.minReserveTarget : "";
  document.getElementById("aiProfileNotes").value = aiProfileDraft.notes || "";
  renderAIGoalsList();
}
function renderAIGoalsList(){
  const el = document.getElementById("aiGoalsList");
  const goals = aiProfileDraft.financialGoals || [];
  if(!goals.length){
    el.innerHTML = `<div class="empty-state">ยังไม่มีเป้าหมาย</div>`;
    return;
  }
  el.innerHTML = goals.map(g => `
    <div class="goal-row">
      <div class="goal-row-info">
        <span class="goal-row-name">${escapeHtml(g.name)}</span>
        <span class="goal-row-meta mono">฿${fmt(g.targetAmount)}${g.deadline ? ` · ครบกำหนด ${dayLabel(g.deadline)}` : ""}</span>
      </div>
      <button class="icon-btn ai-icon-btn delete-ai-goal-btn" data-id="${g.id}" aria-label="ลบเป้าหมาย"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7h14M9 7V5h6v2M8 10v8M12 10v8M16 10v8M6 7l1 14h10l1-14"/></svg></button>
    </div>
  `).join("");
  el.querySelectorAll(".delete-ai-goal-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      aiProfileDraft.financialGoals = (aiProfileDraft.financialGoals || []).filter(g => g.id !== btn.dataset.id);
      saveAIProfile(aiProfileDraft);
      refreshAIProfileStatus();
      renderAIGoalsList();
      showToast("ลบเป้าหมายแล้ว");
    });
  });
}
// เพิ่มเป้าหมายจากฟอร์มแนวนอนแล้วบันทึกทันที — ห้ามใช้ window.prompt() ตามข้อกำหนด
document.getElementById("addAiGoalBtn").addEventListener("click", () => {
  const nameEl = document.getElementById("aiGoalNameInput");
  const amountEl = document.getElementById("aiGoalAmountInput");
  const deadlineEl = document.getElementById("aiGoalDeadlineInput");
  const name = nameEl.value.trim();
  const amount = parseFloat(amountEl.value);
  const deadline = deadlineEl.value ? deadlineEl.value.trim() : null;
  if(!name){ showToast("กรอกชื่อเป้าหมายก่อน"); return; }
  if(!amount || amount <= 0){ showToast("กรอกยอดเงินให้ถูกต้อง"); return; }

  // เก็บตกบั๊ก Milestone 3: ดึงค่าจาก input อื่นๆ (nickname/income/reserve/notes) มารวมบันทึกด้วยเสมอ
  // ป้องกันข้อมูลที่พิมพ์ค้างไว้ในฟอร์มหลุดหายตอนกด "+ เพิ่มเป้าหมาย" โดยยังไม่ได้กด "บันทึกโปรไฟล์"
  const nicknameVal = document.getElementById("aiProfileNickname").value.trim();
  const incomeVal = parseFloat(document.getElementById("aiProfileIncome").value);
  const reserveVal = parseFloat(document.getElementById("aiProfileReserve").value);
  const notesVal = document.getElementById("aiProfileNotes").value.trim();
  aiProfileDraft.nickname = nicknameVal;
  aiProfileDraft.monthlyIncomeEstimate = (!isNaN(incomeVal) && incomeVal >= 0) ? incomeVal : null;
  aiProfileDraft.minReserveTarget = (!isNaN(reserveVal) && reserveVal >= 0) ? reserveVal : null;
  aiProfileDraft.notes = notesVal;

  aiProfileDraft.financialGoals = aiProfileDraft.financialGoals || [];
  aiProfileDraft.financialGoals.push({ id: makeId(), name, targetAmount: amount, deadline: deadline || null });
  saveAIProfile(aiProfileDraft);
  refreshAIProfileStatus();

  nameEl.value = ""; amountEl.value = ""; deadlineEl.value = "";
  renderAIGoalsList();
  showToast("เพิ่มเป้าหมายแล้ว");
  refreshProactiveCard(true);
});

// ===== Memory ที่ AI จำได้ — จัดการในหน้าตั้งค่า (ดู/ลบ/เพิ่มเองได้) =====
function renderAIMemoryList(){
  const el = document.getElementById("aiMemoryList");
  const mem = loadAIMemory();
  if(!mem.length){
    el.innerHTML = `<div class="empty-state">ยังไม่มีอะไรถูกจำไว้ — คุยกับ AI แล้วบอกว่า "จำไว้ด้วย" หรือเพิ่มเองด้านล่างได้เลย</div>`;
    return;
  }
  const sorted = [...mem].sort((a,b) => (b.createdAt||"").localeCompare(a.createdAt||""));
  el.innerHTML = sorted.map(m => `
    <div class="memory-row">
      <div>
        <div class="memory-row-text">${escapeHtml(m.text)}</div>
        <div class="memory-row-meta">${m.createdAt ? chatTimeLabel(m.createdAt) : ""}</div>
      </div>
      <button class="icon-btn ai-icon-btn delete-ai-memory-btn" data-id="${m.id}" aria-label="ลบความจำนี้"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7h14M9 7V5h6v2M8 10v8M12 10v8M16 10v8M6 7l1 14h10l-1-14"/></svg></button>
    </div>
  `).join("");
  el.querySelectorAll(".delete-ai-memory-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      deleteMemoryEntry(btn.dataset.id);
      renderAIMemoryList();
      showToast("ลบความจำแล้ว");
    });
  });
}
document.getElementById("addAiMemoryBtn").addEventListener("click", () => {
  const input = document.getElementById("aiMemoryInput");
  const text = input.value.trim();
  if(!text){ showToast("พิมพ์สิ่งที่อยากให้จำก่อน"); return; }
  addMemoryEntry(text);
  input.value = "";
  renderAIMemoryList();
  showToast("เพิ่มความจำแล้ว");
});
document.getElementById("aiMemoryInput").addEventListener("keydown", (e) => {
  if(e.key === "Enter"){ e.preventDefault(); document.getElementById("addAiMemoryBtn").click(); }
});

document.getElementById("saveAIProfileBtn").addEventListener("click", () => {
  const nickname = document.getElementById("aiProfileNickname").value.trim();
  const incomeVal = parseFloat(document.getElementById("aiProfileIncome").value);
  const reserveVal = parseFloat(document.getElementById("aiProfileReserve").value);

  aiProfileDraft.nickname = nickname;
  aiProfileDraft.monthlyIncomeEstimate = (!isNaN(incomeVal) && incomeVal >= 0) ? incomeVal : null;
  aiProfileDraft.minReserveTarget = (!isNaN(reserveVal) && reserveVal >= 0) ? reserveVal : null;
  aiProfileDraft.notes = document.getElementById("aiProfileNotes").value.trim();
  aiProfileDraft.financialGoals = aiProfileDraft.financialGoals || [];

  saveAIProfile(aiProfileDraft);
  refreshAIProfileStatus();
  showToast("บันทึกโปรไฟล์แล้ว");
  refreshProactiveCard(true);
});
document.getElementById("clearAIProfileBtn").addEventListener("click", () => {
  if(!confirm("ลบโปรไฟล์การเงินทั้งหมด (รวมเป้าหมายทุกรายการ) ใช่ไหม?")) return;
  localStorage.removeItem(AI_PROFILE_KEY);
  aiProfileDraft = { nickname:"", monthlyIncomeEstimate:null, minReserveTarget:null, financialGoals:[], notes:"" };
  renderAIProfileForm();
  showToast("ลบโปรไฟล์แล้ว");
  refreshProactiveCard(true);
});

// ===== AI Layer (Milestone 1): Context builder =====
// ส่งเฉพาะ enum/id ที่จำเป็นต่อการตัดสินใจของ AI (บัญชี, หมวดหมู่, ค่าที่ใช้ล่าสุด, วันนี้)
// ไม่ส่ง entries/transactions ย้อนหลังเพื่อความเร็วและประหยัด token
function buildAIContext(){
  return {
    today: todayISO(),
    accounts: accounts.map(a => ({ id: a.id, name: a.name })),
    categories: CATS_BY_TYPE,
    lastUsedAccountId: lastUsedAccountId || null,
    lastUsedCat: lastUsedCat
  };
}

function buildAISystemPrompt(context){
  return [
    "คุณคือตัวแปลงข้อความภาษาไทย (ภาษาพูดก็ได้) ให้เป็นข้อมูลธุรกรรมการเงินแบบมีโครงสร้าง สำหรับแอป Vaultet",
    "ตอบกลับเป็น JSON ล้วนตาม schema ที่กำหนดเท่านั้น ห้ามมีข้อความอื่นนอก JSON",
    "",
    "Context ปัจจุบันของผู้ใช้:",
    JSON.stringify(context),
    "",
    "กติกาการแปล:",
    '- action มีได้แค่ 5 ค่า: "expense" (รายจ่าย), "income" (รายรับ), "saving" (เงินออม/ลงทุน), "transfer" (โอนเงินข้ามบัญชี), "lend" (ให้ยืมเงิน)',
    "- amount ต้องเป็นตัวเลขบวกเสมอ ถ้าข้อความไม่มีจำนวนเงินที่ชัดเจน ให้เดาที่ใกล้เคียงที่สุดไม่ได้ ให้ใส่ 0 และเพิ่ม \"amount\" เข้าไปใน ambiguousFields",
    "- date: ถ้าไม่ได้ระบุ ให้เป็น null (ระบบจะใช้วันนี้เอง) ถ้าระบุเป็นคำ เช่น เมื่อวาน/พรุ่งนี้ ให้คำนวณจาก today ใน context แล้วตอบเป็น YYYY-MM-DD",
    "- category: ต้องเลือกจากรายการใน categories[action] เท่านั้น (เฉพาะ expense/income/saving) ถ้าข้อความไม่ตรงกับหมวดไหนชัดเจน ให้เดาหมวดที่ใกล้เคียงที่สุด และเพิ่ม \"category\" เข้า ambiguousFields",
    "- accountId: ต้องเป็น id จาก accounts ใน context เท่านั้น ถ้าผู้ใช้ไม่ได้ระบุบัญชี ให้ใช้ lastUsedAccountId เป็นค่าเริ่มต้น (ถ้ามี) และเพิ่ม \"accountId\" เข้า ambiguousFields เสมอเมื่อเป็นการเดา ไม่ใช่ระบุตรงๆ",
    "- fromAccountId/toAccountId: ใช้เฉพาะ action=transfer ต้องเป็น id จาก accounts และห้ามเหมือนกัน ถ้าเดาไม่ได้ให้เป็น null และเพิ่มใน ambiguousFields",
    "- person: ใช้เฉพาะ action=lend คือชื่อคนที่ให้ยืม",
    "- dueDate: ใช้เฉพาะ action=lend ถ้าไม่ได้ระบุให้เป็น null",
    "- lend บังคับต้องมี accountId เสมอ (เงินให้ยืมต้องตัดออกจากบัญชีจริง) ถ้าเดาบัญชีไม่ได้เลย ให้ใช้ lastUsedAccountId และเพิ่ม \"accountId\" เข้า ambiguousFields",
    "- confidence: \"high\" ถ้าทุกฟิลด์ที่จำเป็นระบุชัดเจนในข้อความหรือเดาได้อย่างมั่นใจ, \"needs_confirmation\" ถ้ามีฟิลด์ใดๆ ใน ambiguousFields",
    "- ambiguousFields: array ของชื่อฟิลด์ (string) ที่เป็นการเดา/fallback ไม่ใช่สิ่งที่ผู้ใช้ระบุตรงๆ ถ้าไม่มีให้เป็น array ว่าง",
    "- note: สรุปสั้นๆ จากข้อความต้นฉบับ (ถ้ามีรายละเอียดเพิ่มเติมนอกเหนือจากฟิลด์อื่น)",
    "",
    "ตัวอย่างภาษาพูดที่ต้องเข้าใจ:",
    '- "กินข้าว เมื่อวาน 43" => expense, amount 43, date = เมื่อวานจาก today, note = "กินข้าว", category = หมวดที่ใกล้เคียง เช่น "กิน"',
    '- "กาแฟ 60" => expense, amount 60, date = null, note = "กาแฟ"',
    '- "ได้เงินเดือนวันนี้ 25000" => income, amount 25000, date = วันนี้, note = "ได้เงินเดือน"',
    '- "โอนให้แม่ 500" => transfer หรือ expense ตามความหมายที่ระบุและ context; ถ้าระบุบัญชีไม่พอให้ใส่ ambiguousFields',
    "ผู้ใช้ไม่จำเป็นต้องพิมพ์คำว่า บันทึก/จ่าย เสมอไป: ชื่อสิ่งที่ซื้อ + จำนวนเงิน + เวลา เช่น กินข้าว เมื่อวาน 43 คือธุรกรรมรายจ่าย"
  ].join("\n");
}

// ===== AI model routing =====
// ใช้โมเดล Flash ตัวเดียวกับ AI ที่ปรึกษา เพื่อให้พฤติกรรมสอดคล้องกัน
// แต่ flow พิมพ์รายการมี local fast-path ก่อน เพื่อไม่ต้องรอ API สำหรับประโยคสั้นชัดเจน
const AI_TRANSACTION_MODEL = "gemini-3.6-flash";
const AI_ADVISOR_MODEL = AI_TRANSACTION_MODEL;

// ===== AI Layer (Milestone 1): Gemini call =====
const AI_RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    action: { type: "STRING", enum: ["expense","income","saving","transfer","lend"] },
    amount: { type: "NUMBER" },
    date: { type: "STRING", nullable: true },
    note: { type: "STRING" },
    category: { type: "STRING", nullable: true },
    accountId: { type: "STRING", nullable: true },
    fromAccountId: { type: "STRING", nullable: true },
    toAccountId: { type: "STRING", nullable: true },
    person: { type: "STRING", nullable: true },
    dueDate: { type: "STRING", nullable: true },
    confidence: { type: "STRING", enum: ["high","needs_confirmation"] },
    ambiguousFields: { type: "ARRAY", items: { type: "STRING" } }
  },
  required: ["action","amount","note","confidence","ambiguousFields"]
};

// เรียก Gemini API พร้อมกันโควต้าเต็ม (HTTP 429) 2 ชั้น:
// 1) auto-retry เงียบๆ กับคีย์เดิมก่อน (หน่วงเวลาเพิ่มทีละรอบ) เหมือนเดิม
// 2) ถ้าคีย์เดิม retry แล้วยัง 429 อยู่ ให้สลับไปลองคีย์สำรองถัดไปในลิสต์ทันที (ถ้าตั้งค่าไว้หลายคีย์)
// buildUrl: function(apiKey) => url เต็มพร้อม query key (เพราะแต่ละคีย์ต้องประกอบ url ใหม่)
// ผู้ใช้จะไม่เห็น error 429 เลยถ้าคีย์ใดคีย์หนึ่งในลิสต์ผ่านได้ภายในเงื่อนไขนี้
async function fetchGeminiWithRetry(buildUrl, options, maxRetriesPerKey = 2){
  const keys = getApiKeys();
  let res = null;
  for(let i = 0; i < keys.length; i++){
    const url = buildUrl(keys[i]);
    let attempt = 0;
    while(true){
      res = await fetch(url, options);
      if((res.status !== 429 && res.status !== 503) || attempt >= maxRetriesPerKey) break;
      attempt++;
      await new Promise(r => setTimeout(r, 1500 * attempt)); // หน่วงเพิ่มขึ้นทีละรอบ: 1.5s, 3s
    }
    if(res.status !== 429 && res.status !== 503) return res; // สำเร็จ หรือ error อื่นที่ไม่ใช่โควต้าเต็ม → ไม่ต้องลองคีย์ถัดไป
    // คีย์นี้โควต้าเต็มแม้ retry แล้ว → ลองคีย์สำรองถัดไปทันที ไม่ต้องหน่วงเพิ่ม
  }
  return res; // ทุกคีย์โดน 429 หมด (หรือไม่มีคีย์เลย) — คืนตัวสุดท้ายให้ caller จัดการ error ตามปกติ
}

// Local fast-path สำหรับภาษาพูดสั้น ๆ ที่ชัดเจน เช่น "กินข้าว เมื่อวาน 43"
// ลด latency โดยไม่ต้องเรียก AI 2 รอบ และ fallback ไป Gemini Flash เมื่อกำกวม
function thaiDigitsToArabic(value){
  return String(value||'').replace(/[๐-๙]/g, ch => String('๐๑๒๓๔๕๖๗๘๙'.indexOf(ch)));
}
function isoDaysFromToday(delta){
  const d=new Date(); d.setHours(12,0,0,0); d.setDate(d.getDate()+delta);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function parseSpokenTransactionFast(text){
  const raw=String(text||'').trim();
  if(!raw) return null;
  const normalized=thaiDigitsToArabic(raw).replace(/,/g,'');
  const nums=[...normalized.matchAll(/(?:^|\s)(\d+(?:\.\d+)?)(?=\s|$)/g)].map(m=>Number(m[1]));
  if(!nums.length) return null;
  const amount=nums[nums.length-1];
  if(!Number.isFinite(amount)||amount<=0) return null;
  let date=null;
  if(/เมื่อวาน/.test(normalized)) date=isoDaysFromToday(-1);
  else if(/วันนี้/.test(normalized)) date=todayISO();
  else if(/พรุ่งนี้/.test(normalized)) date=isoDaysFromToday(1);
  const expenseWords=/กิน|ข้าว|กาแฟ|อาหาร|ขนม|รถ|แท็กซี่|ค่าเดินทาง|เติมน้ำมัน|ซื้อ|จ่าย|เซเว่น|7-?11|ร้าน/;
  const incomeWords=/เงินเดือน|ได้เงิน|รายได้|โบนัส|ขายของ/;
  const savingWords=/ออม|ลงทุน|กองทุน/;
  let action='';
  if(savingWords.test(normalized)) action='saving';
  else if(incomeWords.test(normalized)) action='income';
  else if(expenseWords.test(normalized)) action='expense';
  else return null;
  let category=null;
  const cats=CATS_BY_TYPE[action]||[];
  if(action==='expense'){
    category=cats.find(c=>/กิน|อาหาร/.test(c))||cats.find(c=>/อาหาร|กิน/.test(c))||null;
  }
  const note=normalized
    .replace(/(?:^|\s)\d+(?:\.\d+)?(?=\s|$)/g,' ')
    .replace(/เมื่อวาน|วันนี้|พรุ่งนี้/g,' ')
    .replace(/\s+/g,' ').trim();
  const ambiguousFields=[];
  if(action!=='transfer' && !category) ambiguousFields.push('category');
  if(!lastUsedAccountId) ambiguousFields.push('accountId');
  return {
    action, amount, date, note:note||raw, category,
    accountId:lastUsedAccountId||null, fromAccountId:null, toAccountId:null, person:null, dueDate:null,
    confidence:ambiguousFields.length?'needs_confirmation':'high', ambiguousFields
  };
}

// รับข้อความภาษาคน คืน { ok:true, payload } ตาม schema ในข้อ 2 ของแผน หรือ { ok:false, error }
async function parseNaturalLanguageEntry(text){
  const fastPayload=parseSpokenTransactionFast(text);
  if(fastPayload) return { ok:true, payload:fastPayload, fast:true };
  if(getApiKeys().length === 0) return { ok:false, error:"missing_api_key" };
  if(!text || !text.trim()) return { ok:false, error:"empty_input" };

  const context = buildAIContext();
  const systemPrompt = buildAISystemPrompt(context);

  let res;
  try{
    res = await fetchGeminiWithRetry(
      (apiKey) => `https://generativelanguage.googleapis.com/v1beta/models/${AI_TRANSACTION_MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: text.trim() }] }],
          systemInstruction: { parts: [{ text: systemPrompt }] },
          generationConfig: {
            response_mime_type: "application/json",
            response_schema: AI_RESPONSE_SCHEMA
          }
        })
      }
    );
  }catch(e){
    return { ok:false, error:"network_error" };
  }

  if(!res.ok){
    let detail = "";
    try{ detail = (await res.text()).slice(0,300); }catch(e){}
    return { ok:false, error: res.status === 400 ? "invalid_api_key" : "api_error", detail, status: res.status };
  }

  let data;
  try{ data = await res.json(); }catch(e){ return { ok:false, error:"invalid_json" }; }

  const raw = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if(!raw) return { ok:false, error:"empty_response" };

  let payload;
  try{ payload = JSON.parse(raw); }catch(e){ return { ok:false, error:"invalid_json" }; }

  return { ok:true, payload };
}

// ===== AI Layer (Milestone 2): Dual-Intent Router =====
const INTENT_RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    intent: { type: "STRING", enum: ["transaction","query"] }
  },
  required: ["intent"]
};

// ตรวจว่าข้อความของผู้ใช้เป็น "transaction" (ต้องการบันทึกรายการ) หรือ "query" (คำถาม/ขอวิเคราะห์)
// ด่านแรกก่อนเข้า flow ใดๆ — คืน { ok:true, intent } หรือ { ok:false, error } รูปแบบเดียวกับ parseNaturalLanguageEntry
async function classifyIntent(text){
  if(!text || !text.trim()) return { ok:false, error:"empty_input" };
  // ประโยคสั้นที่ local parser เข้าใจได้ ให้เป็น transaction ทันที — เร็วกว่าเรียก AI และแก้เคส "กินข้าว เมื่อวาน 43"
  if(parseSpokenTransactionFast(text)) return { ok:true, intent:"transaction", fast:true };
  if(getApiKeys().length === 0) return { ok:false, error:"missing_api_key" };

  const systemPrompt = [
    "คุณคือตัวจัดประเภทข้อความสำหรับแอปการเงินส่วนตัว Vaultet",
    "หน้าที่ของคุณคือดูข้อความที่ผู้ใช้พิมพ์ แล้วตัดสินว่าเป็นประเภทไหนใน 2 แบบนี้เท่านั้น:",
    '- "transaction": ข้อความที่มีเจตนา "บันทึก" ธุรกรรมการเงินใหม่ รวมถึงภาษาพูดที่ไม่มีกริยาบันทึก เช่น "กินข้าว เมื่อวาน 43", "กาแฟ 60", "รถไฟฟ้า 45" หากมีชื่อสิ่งที่ซื้อ/กิจกรรม + จำนวนเงิน ให้ถือเป็น transaction',
    '- "query": ข้อความที่เป็นคำถาม ขอให้วิเคราะห์ หรือสงสัยเกี่ยวกับสถานะการเงิน เช่น ถามยอดเงินคงเหลือ ถามว่าเดือนนี้ใช้จ่ายไปเท่าไหร่ เทียบเดือนที่แล้วเป็นยังไง จะมีเงินพอจ่ายไหม ไม่ใช่การขอให้บันทึกรายการใหม่',
    "ถ้าข้อความกำกวมมีทั้งสองอย่างปนกัน ให้เลือกตามเจตนาหลักที่เด่นที่สุดของข้อความ",
    "ตอบกลับเป็น JSON ล้วนตาม schema ที่กำหนดเท่านั้น ห้ามมีข้อความอื่นนอก JSON"
  ].join("\n");

  let res;
  try{
    res = await fetchGeminiWithRetry(
      (apiKey) => `https://generativelanguage.googleapis.com/v1beta/models/${AI_TRANSACTION_MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: text.trim() }] }],
          systemInstruction: { parts: [{ text: systemPrompt }] },
          generationConfig: {
            response_mime_type: "application/json",
            response_schema: INTENT_RESPONSE_SCHEMA
          }
        })
      }
    );
  }catch(e){
    return { ok:false, error:"network_error" };
  }

  if(!res.ok){
    let detail = "";
    try{ detail = (await res.text()).slice(0,300); }catch(e){}
    return { ok:false, error: res.status === 400 ? "invalid_api_key" : "api_error", detail, status: res.status };
  }

  let data;
  try{ data = await res.json(); }catch(e){ return { ok:false, error:"invalid_json" }; }

  const raw = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if(!raw) return { ok:false, error:"empty_response" };

  let payload;
  try{ payload = JSON.parse(raw); }catch(e){ return { ok:false, error:"invalid_json" }; }

  // fallback ที่ปลอดภัย: ถ้า AI ตอบค่าแปลกๆ นอก enum ให้ถือเป็น transaction (flow เดิมที่มี validation ของตัวเองอยู่แล้ว)
  const intent = (payload && payload.intent === "query") ? "query" : "transaction";
  return { ok:true, intent };
}

// ===== AI Layer (Milestone 2): Deterministic Financial Snapshot =====
// ฟังก์ชัน Pure — ไม่แตะ DOM/localStorage ใดๆ คำนวณจากข้อมูลปัจจุบันแล้วคืนตัวเลขที่ผ่านการคำนวณแล้วเท่านั้น
// ห้ามส่ง raw entries ทั้งหมดให้ AI — ส่งเฉพาะ Snapshot นี้
// หมายเหตุ: เรียก computePeriodAnalysisForRange() ตรงๆ กำหนดช่วงวันเองจาก monthBoundsISO() แทนการเรียก
// computePeriodAnalysis()/getTotals() ที่ผูกกับ Global State (analysisPreset/selectedMonth) เพื่อกันปัญหา
// Snapshot ไปติดอยู่กับตัวกรองที่ผู้ใช้เผลอตั้งไว้บนหน้าจอ
function buildFinancialSnapshot(){
  const today = todayISO();
  const now = new Date();

  const thisMonthBounds = monthBoundsISO(now.getFullYear(), now.getMonth());
  const lastMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lastMonthBounds = monthBoundsISO(lastMonthDate.getFullYear(), lastMonthDate.getMonth());

  const thisMonthAnalysis = computePeriodAnalysisForRange(thisMonthBounds.start, thisMonthBounds.end, null);
  const lastMonthAnalysis = computePeriodAnalysisForRange(lastMonthBounds.start, lastMonthBounds.end, null);

  const top5 = (analysis) => analysis.breakdown.slice(0, 5).map(r => ({ category: r.cat, amount: r.amount, pct: r.pct }));

  const totalMoney = getTotalMoneyAllAccounts();
  const reserved = getTotalReserved();
  const receivables = getTotalReceivablesOutstanding();

  // จำนวนวันที่เหลือจริงถึงสิ้นเดือน (รวมวันนี้) — ถ้าวันนี้เลยสิ้นเดือนไปแล้ว (ไม่ควรเกิดขึ้น) กันขั้นต่ำไว้ที่ 1 วัน
  const daysRemainingInMonth = Math.max(1, daysBetweenInclusive(today, thisMonthBounds.end));
  const forecastToMonthEnd = computeForecast(daysRemainingInMonth);
  const forecast30d = computeForecast(30);

  const cashByAccount = accounts.map(a => ({ id:a.id, name:a.name, balance:computeAccountBalance(a.id) }));
  const snapshot = {
    generatedAt: today,
    netWorth: {
      totalMoneyAllAccounts: totalMoney,
      reserved: reserved,
      available: totalMoney - reserved,
      receivablesOutstanding: receivables,
      savedTotal: getTotalSaved(),
      emergencySaved: getEmergencySaved(),
      liabilities: getTotalDebts(),
    },
    cash: { total:totalMoney, available:totalMoney-reserved, byAccount:cashByAccount },
    incomeContext: {
      total:thisMonthAnalysis.income,
      loanRepayment:thisMonthAnalysis.loanRepaymentIncome,
      nonLoanIncome:thisMonthAnalysis.nonLoanIncome,
      note:"loanRepayment เป็นการเปลี่ยน receivable กลับเป็น cash ไม่ใช่ earned income"
    },
    thisMonth: {
      range: thisMonthBounds,
      income: thisMonthAnalysis.income,
      loanRepaymentIncome: thisMonthAnalysis.loanRepaymentIncome,
      nonLoanIncome: thisMonthAnalysis.nonLoanIncome,
      expense: thisMonthAnalysis.expense,
      saving: thisMonthAnalysis.saving,
      netCashFlow: thisMonthAnalysis.netCashFlow,
      transactionCount: thisMonthAnalysis.count,
      topExpenseCategories: top5(thisMonthAnalysis),
    },
    lastMonth: {
      range: lastMonthBounds,
      income: lastMonthAnalysis.income,
      expense: lastMonthAnalysis.expense,
      saving: lastMonthAnalysis.saving,
      netCashFlow: lastMonthAnalysis.netCashFlow,
      transactionCount: lastMonthAnalysis.count,
      topExpenseCategories: top5(lastMonthAnalysis),
      // Milestone 4 fix: breakdown เต็มทุกหมวด (ไม่ตัดเหลือ Top 5) ใช้เทียบใน Rule B ของ evaluateProactiveRules()
      // เพื่อไม่ให้หมวดอันดับ 6 ลงไปถูกมองเป็น ฿0 อย่างผิดๆ (False Alarm)
      expenseBreakdownFull: lastMonthAnalysis.breakdown.map(r => ({ category: r.cat, amount: r.amount, pct: r.pct })),
    },
    monthComparison: {
      incomeChange: thisMonthAnalysis.income - lastMonthAnalysis.income,
      expenseChange: thisMonthAnalysis.expense - lastMonthAnalysis.expense,
      savingChange: thisMonthAnalysis.saving - lastMonthAnalysis.saving,
      netCashFlowChange: thisMonthAnalysis.netCashFlow - lastMonthAnalysis.netCashFlow,
    },
    upcoming: getUpcomingSummary(),
    forecastToMonthEnd: {
      daysRemaining: daysRemainingInMonth,
      currentTotalMoney: forecastToMonthEnd.current,
      reserved: forecastToMonthEnd.reserved,
      upcomingPayments: forecastToMonthEnd.upcoming,
      forecastTotalMoney: forecastToMonthEnd.forecast,
      forecastAvailable: forecastToMonthEnd.forecastAvailable,
    },
    forecast30d: {
      currentTotalMoney: forecast30d.current,
      reserved: forecast30d.reserved,
      upcomingPayments: forecast30d.upcoming,
      forecastTotalMoney: forecast30d.forecast,
      forecastAvailable: forecast30d.forecastAvailable,
    },
    // Milestone 5: หนี้สิน — ตั้งใจไม่รวมใน forecastToMonthEnd/forecast30d ด้านบน (ยังไม่ตัดเงินสด)
    debts: {
      totalDebt: getTotalDebts(),
      list: debts.map(d => ({ name: d.name, outstandingBalance: d.outstandingBalance, gracePeriod: !!d.gracePeriod })),
    },
    budgetSummary: getBudgetFindingData(),
    emergencyFund: computeEmergencyFund(),
    recurringExpenses: { monthlyEstimated:computeMonthlyRecurringCost(), upcoming:getUpcomingSummary() },
    goals: typeof goals!=='undefined' ? goals : [],
  };
  // Round 12: normalized intelligence context. Keep calculations deterministic and local;
  // the LLM receives this structured result instead of reconstructing finance from raw entries.
  snapshot.advisorContext = buildAdvisorContext(snapshot);
  snapshot.behaviorSummary = computeFinancialBehavior(snapshot);
  snapshot.financialBrain = computeFinancialHealth(snapshot);
  snapshot.advisorContext = buildAdvisorContext(snapshot);
  return snapshot;
}

// ===== Round 12: Financial Advisor Intelligence Layer =====
// Lightweight decision-support only — not a validated financial-health score.
function buildAdvisorHistoricalBaseline(snapshot){
  const now=new Date();
  const completed=[];
  for(let i=1;i<=3;i++){
    const d=new Date(now.getFullYear(),now.getMonth()-i,1);
    const b=monthBoundsISO(d.getFullYear(),d.getMonth());
    const a=computePeriodAnalysisForRange(b.start,b.end,null);
    completed.push({range:b,income:Number(a.income||0),expense:Number(a.expense||0),saving:Number(a.saving||0),netCashFlow:Number(a.netCashFlow||0),breakdown:(a.breakdown||[]).map(r=>({category:r.cat,amount:Number(r.amount||0),count:Number(r.count||0)})),transactionCount:Number(a.count||0)});
  }
  const usable=completed.filter(x=>x.transactionCount>=3 || x.income>0 || x.expense>0);
  const avg=(key)=>usable.length?usable.reduce((s,x)=>s+x[key],0)/usable.length:null;
  const catMap={};
  usable.forEach(m=>m.breakdown.forEach(r=>{if(!catMap[r.category])catMap[r.category]=[];catMap[r.category].push(r.amount);}));
  const categoryBaseline=Object.entries(catMap).map(([category,values])=>({category,months:values.length,average:values.reduce((a,b)=>a+b,0)/values.length}));
  return {monthsConsidered:usable.length,requiredForStrongBaseline:2,monthlyAverage:{income:avg('income'),expense:avg('expense'),saving:avg('saving'),netCashFlow:avg('netCashFlow')},categoryBaseline};
}

function buildAdvisorContext(snapshot){
  const baseline=buildAdvisorHistoricalBaseline(snapshot);
  const expenseDays=Math.max(1,Number(snapshot.behaviorSummary?.spendingDaysElapsed||new Date().getDate()));
  const avgDaily=Number(snapshot.behaviorSummary?.averageDailyExpense||0);
  const available=Number(snapshot.cash?.available||0);
  const runwayDays=avgDaily>0?available/avgDaily:null;
  const forecast=snapshot.forecastToMonthEnd||{};
  return {
    baseline,
    cashRunway:{estimatedDays:runwayDays,assumption:`ใช้ค่าใช้จ่ายเฉลี่ยต่อวันของเดือนปัจจุบันจาก ${expenseDays} วันที่ผ่านไป`,availableCash:available},
    forecast:{monthEndAvailable:forecast.forecastAvailable,thirtyDayAvailable:snapshot.forecast30d?.forecastAvailable,assumption:'หักเฉพาะ recurring/upcoming expenses ที่ระบบรู้จัก ยังไม่สมมติรายรับในอนาคต'},
    incomeClassification:{regularOrNonLoan:Number(snapshot.incomeContext?.nonLoanIncome||0),loanRepayment:Number(snapshot.incomeContext?.loanRepayment||0),rule:'loan repayment ไม่ใช่ earned/regular income และ transfers/savings are not income'},
    dataQuality:{historicalMonths:baseline.monthsConsidered,hasStrongBaseline:baseline.monthsConsidered>=2}
  };
}

function advisorFinding(id,severity,urgency,impact,confidence,evidence,action,stateKey,state='new',extra={}){
  const score=Math.round((severity*urgency*impact*confidence)*100)/100;
  return {id,severity,urgency,impact,confidence,evidence,action,stateKey,state,priorityScore:score,...extra};
}
function advisorSeverity(n){return n>=4?'critical':n>=3?'important':n>=2?'watch':'info';}

function buildAdvisorFindings(snapshot,profile){
  const out=[]; const b=snapshot.behaviorSummary||{}, c=snapshot.cash||{}, fc=snapshot.forecastToMonthEnd||{}, base=snapshot.advisorContext?.baseline||{};
  const available=Number(c.available||0);
  // Liquidity: only strong when the model has a real forward obligation/forecast signal.
  if(Number(fc.forecastAvailable)<0){
    out.push(advisorFinding('LIQUIDITY_FORECAST','critical',4,4,0.98,[`forecastAvailable=${fc.forecastAvailable}`,`upcoming=${fc.upcoming}`],'ชะลอรายจ่ายที่ไม่จำเป็นและตรวจสอบภาระที่กำลังจะถึงก่อนรายรับครั้งถัดไป','liquidity|forecast-negative','new'));
  }
  const minReserve=Number(profile?.minReserveTarget||0);
  const reserveHeld=available+Number(snapshot.netWorth?.emergencySaved||0); // เงินสดที่ใช้ได้ + เงินสำรองที่ออมไว้
  if(minReserve>0 && reserveHeld<minReserve){
    const ratio=minReserve>0?available/minReserve:1;
    out.push(advisorFinding('MIN_BUFFER','critical',4,3,0.95,[`available=${reserveHeld}`,`minReserveTarget=${minReserve}`],'รักษาเงินกันชนขั้นต่ำและเลื่อนรายจ่ายที่ไม่จำเป็นหากทำได้','liquidity|min-buffer','new',{data:{available:reserveHeld,target:minReserve,shortfall:minReserve-reserveHeld}}));
  }
  // Upcoming obligations: use the existing recurring engine and only surface material shortfall.
  const upcomingOccurrences=typeof getUpcomingOccurrences==='function' ? getUpcomingOccurrences('7d') : [];
  upcomingOccurrences.slice(0,20).forEach(o=>{
    const amount=Number(o.r?.amount ?? o.amount ?? 0);
    if(amount<=0)return;
    const record=o.r||o; const link=typeof getReservedLinkInfo==='function' ? getReservedLinkInfo(record) : null; const shortfall=link?Number(link.shortfall||0):amount;
    const status=o.status||record.status||'';
    if(shortfall>0 && (status==='overdue'||status==='dueToday')){
      const name=record.name||record.title||'รายการ'; const due=record.nextDueDate||record.date||'';
      out.push(advisorFinding('OBLIGATION_SHORTFALL','critical',4,4,0.94,[`name=${name}`,`amount=${amount}`,`shortfall=${shortfall}`,`status=${status}`],'จัดลำดับภาระนี้ก่อนรายจ่าย discretionary และกันเงินตามจำนวนที่ขาด','obligation|'+name+'|'+due,'new',{data:{name,amount,shortfall,status,nextDueDate:due}}));
    }
  });
  // Spending baseline: require >=2 completed months and meaningful transaction history.
  const currentExpense=Number(snapshot.thisMonth?.expense||0), avgExpense=Number(base.monthlyAverage?.expense||0);
  const elapsedDays=Math.max(1,new Date().getDate());
  const daysInMonth=new Date(new Date().getFullYear(),new Date().getMonth()+1,0).getDate();
  const projectedExpense=elapsedDays>=7 ? currentExpense/elapsedDays*daysInMonth : null;
  if(base.monthsConsidered>=2 && avgExpense>0 && projectedExpense!=null && projectedExpense>=avgExpense*1.25 && projectedExpense-avgExpense>=500){
    const pct=((projectedExpense-avgExpense)/avgExpense)*100;
    const confidence=Math.min(0.95,0.65+(elapsedDays/30)*0.3);
    out.push(advisorFinding('SPENDING_ABOVE_BASELINE','important',2,3,confidence,[`monthToDate=${currentExpense}`,`projectedMonthEnd=${projectedExpense}`,`baseline=${avgExpense}`,`differencePct=${pct}`,`baselineMonths=${base.monthsConsidered}`],'ทบทวนหมวดที่เร่งตัวขึ้นและตั้งเพดาน discretionary ที่เหมาะกับเงินคงเหลือ','spending|overall','new',{data:{currentExpense,baseline:avgExpense,projectedExpense,pct,elapsedDays}}));
  }
  // Category-level meaningful deviations, with a minimum absolute amount to avoid tiny noise.
  if(base.monthsConsidered>=2){
    const currentMap=Object.fromEntries((snapshot.thisMonth?.topExpenseCategories||[]).map(x=>[x.category,Number(x.amount||0)]));
    base.categoryBaseline.forEach(r=>{
      const cur=currentMap[r.category]||0;
      const expectedToDate=r.average*elapsedDays/daysInMonth;
      const projected=elapsedDays>=7 ? cur/elapsedDays*daysInMonth : null;
      if(projected!=null&&r.average>0&&projected>=r.average*1.3&&projected-r.average>=300){
        out.push(advisorFinding('CATEGORY_SPIKE','important',2,2,Math.min(0.93,0.65+(elapsedDays/30)*0.3),[`category=${r.category}`,`monthToDate=${cur}`,`projectedMonthEnd=${projected}`,`baseline=${r.average}`,`expectedToDate=${expectedToDate}`,`months=${r.months}`],`พิจารณาคุมหมวด ${r.category} ให้อยู่ใกล้ระดับปกติในช่วงที่เหลือของเดือน`,`spending|category|${r.category}`,'new',{data:{category:r.category,current:cur,baseline:r.average,projected,pct:((projected-r.average)/r.average)*100,months:r.months}}));
      }
    });
  }
  const saving=Number(snapshot.thisMonth?.saving||0), income=Number(snapshot.incomeContext?.nonLoanIncome||0);
  if(income>0 && saving/income<0.1){
    out.push(advisorFinding('SAVINGS_PACE','important',2,2,0.9,[`regularIncome=${income}`,`saving=${saving}`,`savingsRate=${saving/income}`],'ถ้ากระแสเงินสดยังรองรับ ลองกันเงินออมเพิ่มตามจำนวนที่ไม่ทำให้ buffer ต่ำกว่าระดับปลอดภัย','savings|rate','new',{data:{saving,income,savingsRate:saving/income*100}}));
  }
  if(base.monthsConsidered>=2 && base.monthlyAverage.income>0 && income<base.monthlyAverage.income*0.8){
    out.push(advisorFinding('INCOME_BELOW_BASELINE','important',3,3,0.88,[`current=${income}`,`baseline=${base.monthlyAverage.income}`,`months=${base.monthsConsidered}`],'เผื่อ cash buffer มากขึ้นจนกว่าจะเห็นว่ารายรับกลับสู่ระดับปกติ','income|below-baseline','new',{data:{current:income,baseline:base.monthlyAverage.income,pct:((income-base.monthlyAverage.income)/base.monthlyAverage.income)*100}}));
  }
  // Positive state only when there is genuinely nothing important to act on.
  if(!out.length){
    out.push(advisorFinding('STABLE','info',1,1,Math.min(1,base.monthsConsidered>=2?0.95:0.65),['no material critical/important findings'],'ยังไม่มีสิ่งที่ต้องลงมือทำเป็นพิเศษ — รักษาแผนปัจจุบันและทบทวนอีกครั้งเมื่อมีข้อมูลใหม่','global|stable','new',{data:{baselineMonths:base.monthsConsidered}}));
  }
  return out.sort((a,b)=>b.priorityScore-a.priorityScore);
}

function getAdvisorStateStore(){try{const x=JSON.parse(localStorage.getItem('vaultet_advisor_issue_states_v1')||'{}');return x&&typeof x==='object'&&!Array.isArray(x)?x:{};}catch(e){return {};}}
function saveAdvisorStateStore(x){try{localStorage.setItem('vaultet_advisor_issue_states_v1',JSON.stringify(x));}catch(e){}}
function resolveAdvisorStates(findings){
  const states=getAdvisorStateStore(),now=new Date().toISOString();
  const active=new Set(findings.map(f=>f.stateKey));
  Object.keys(states).forEach(k=>{if(!active.has(k)&&states[k]?.status!=='resolved')states[k]={...states[k],status:'resolved',resolvedAt:now};});
  findings.forEach(f=>{const prev=states[f.stateKey];if(!prev){f.state='new';}else if(prev.status==='resolved'){f.state='new';}else if(f.priorityScore>(prev.priorityScore||0)*1.2){f.state='worsening';}else if(f.priorityScore<(prev.priorityScore||0)*0.8){f.state='improving';}else{f.state='unchanged';}states[f.stateKey]={status:'active',priorityScore:f.priorityScore,lastSeen:now};});
  saveAdvisorStateStore(states);
  return findings;
}

function getAdvisorIntelligence(snapshot,profile){
  const findings=resolveAdvisorStates(buildAdvisorFindings(snapshot,profile));
  const top=findings.filter(f=>f.id!=='STABLE').slice(0,3);
  return {generatedAt:new Date().toISOString(),status:top.some(f=>f.severity==='critical')?'needs attention':top.length?'watch':'stable',topPriorities:top,allFindings:findings,dataQuality:snapshot.advisorContext?.dataQuality||{}};
}

// ===== Round 3: Financial Brain =====
function computeFinancialBehavior(snapshot){
  const now=new Date(), daysThisMonth=Math.max(1,now.getDate());
  const a=computePeriodAnalysisForRange(snapshot.thisMonth.range.start,snapshot.thisMonth.range.end,null);
  const prev=computePeriodAnalysisForRange(snapshot.lastMonth.range.start,snapshot.lastMonth.range.end,null);
  const full=a.breakdown||[], last=prev.breakdown||[];
  const map=arr=>Object.fromEntries(arr.map(r=>[r.cat,Number(r.amount||0)]));
  const tm=map(full),lm=map(last);
  const cats=[...new Set([...Object.keys(tm),...Object.keys(lm)])];
  const trends=cats.map(category=>{const current=tm[category]||0,previous=lm[category]||0;return {category,current,previous,change:current-previous,pctChange:previous>0?((current-previous)/previous)*100:null};}).filter(r=>r.current>0||r.previous>0).sort((x,y)=>y.current-x.current);
  const essentialCats=new Set(getEmergencyEssentialCategories());
  const essential=full.filter(r=>essentialCats.has(r.cat)).reduce((x,r)=>x+Number(r.amount||0),0);
  const expense=Number(a.expense||0),income=Number(a.income||0),saving=Number(a.saving||0);
  return {spendingTrend:{currentMonthlyExpense:expense,previousMonthlyExpense:Number(prev.expense||0),change:expense-Number(prev.expense||0),pctChange:prev.expense>0?((expense-prev.expense)/prev.expense)*100:null},incomeTrend:{current:income,previous:Number(prev.income||0),change:income-Number(prev.income||0),pctChange:prev.income>0?((income-prev.income)/prev.income)*100:null},averageDailyExpense:expense/daysThisMonth,essentialExpense:essential,discretionaryExpense:Math.max(0,expense-essential),discretionaryRatio:expense>0?Math.max(0,expense-essential)/expense*100:0,savingsRate:income>0?saving/income*100:0,topCategories:trends.slice(0,5),categoryTrends:trends.slice(0,20),frequentCategories:full.slice().sort((x,y)=>Number(y.count||0)-Number(x.count||0)).slice(0,5).map(r=>({category:r.cat,count:Number(r.count||0),amount:Number(r.amount||0)})),spendingDaysElapsed:daysThisMonth};
}
function computeFinancialHealth(snapshot){
  const b=snapshot.behaviorSummary||{}, budget=snapshot.budgetSummary||{}, ef=snapshot.emergencyFund||{}, fc=snapshot.forecastToMonthEnd||{}, income=Number(snapshot.thisMonth?.income||0);
  let score=50;const factors=[];const add=(label,points,status)=>{score+=points;factors.push({label,points,status});};
  const flow=Number(snapshot.thisMonth?.netCashFlow||0); if(flow>0)add('กระแสเงินสดเป็นบวก',15,'positive'); else if(flow<0)add('กระแสเงินสดติดลบ',-20,'negative');
  if(budget.budgetCount){if(budget.overCount>0)add(`เกินงบ ${budget.overCount} หมวด`,-15,'negative');else if(budget.watchCount>0)add(`ต้องเฝ้าดูงบ ${budget.watchCount} หมวด`,-6,'warning');else add('คุมงบได้ดี',10,'positive');}
  if(ef.recommendedEmergencyFund>0){if(ef.currentAvailableReserve>=ef.recommendedEmergencyFund)add('เงินสำรองถึงเป้าหมาย',15,'positive');else if(ef.currentAvailableReserve>=ef.recommendedEmergencyFund*.5)add('เงินสำรองกำลังสร้าง',6,'warning');else add('เงินสำรองยังต่ำ',-12,'negative');}
  if(income>0){const __S=getBrainTargets().savingsRatePct;if(b.savingsRate>=__S)add('อัตราออมแข็งแรง',10,'positive');else if(b.savingsRate>=__S/2)add('มีการออมสม่ำเสมอ',5,'warning');else add('อัตราออมต่ำ',-7,'warning');}
  if(Number(fc.forecastAvailable||0)<0)add('คาดการณ์เงินใช้ได้ติดลบ',-20,'negative'); else if(Number(fc.forecastAvailable||0)>0)add('คาดการณ์เงินใช้ได้ยังเป็นบวก',5,'positive');
  if(b.discretionaryRatio>60)add('รายจ่ายไม่จำเป็นมีสัดส่วนสูง',-8,'warning');
  if(Number(snapshot.monthComparison?.incomeChange||0)<0&&income>0)add('รายรับลดจากเดือนก่อน',-5,'warning');
  score=Math.max(0,Math.min(100,Math.round(score)));const status=score<40?'CRITICAL':score<70?'WATCH':'HEALTHY';
  const __T=getBrainTargets(),benchmark={essentialTargetPct:__T.essentialMaxPct,discretionaryTargetPct:__T.discretionaryMaxPct,savingTargetPct:__T.savingsRatePct,essentialPct:income>0?b.essentialExpense/income*100:null,discretionaryPct:income>0?b.discretionaryExpense/income*100:null,savingPct:income>0?Number(snapshot.thisMonth?.saving||0)/income*100:null};
  return {score,status,factors,negativeFactorCount:factors.filter(x=>x.status==='negative').length,benchmark,strengths:factors.filter(x=>x.status==='positive').map(x=>x.label),risks:factors.filter(x=>x.status!=='positive').map(x=>x.label)};
}
function buildFinancialBrainContext(snapshot,profile){
  const advisor=getAdvisorIntelligence(snapshot,profile||{});
  return {financialBrain:snapshot.financialBrain,advisorIntelligence:advisor,cash:snapshot.cash,incomeContext:snapshot.incomeContext,behaviorSummary:snapshot.behaviorSummary,budgetSummary:snapshot.budgetSummary,emergencyFund:snapshot.emergencyFund,forecastToMonthEnd:snapshot.forecastToMonthEnd,forecast30d:snapshot.forecast30d,recurring:snapshot.recurringExpenses||snapshot.upcoming,debts:snapshot.debts,netWorth:snapshot.netWorth,goals:typeof goals!=='undefined'?goals:[],profile:profile||{},memory:loadAIMemory().slice(-20)};
}
function financialBrainRuleFindings(snapshot){
  const f=[],b=snapshot.behaviorSummary||{};
  if(snapshot.thisMonth.netCashFlow<0)f.push({id:'CASHFLOW_NEGATIVE',severity:'critical',data:{netCashFlow:snapshot.thisMonth.netCashFlow}});
  if(snapshot.forecastToMonthEnd.forecastAvailable<0)f.push({id:'FORECAST_NEGATIVE',severity:'critical',data:{forecastAvailable:snapshot.forecastToMonthEnd.forecastAvailable}});
  if(snapshot.budgetSummary.overCount>0)f.push({id:'BUDGET_OVER',severity:'warning',data:snapshot.budgetSummary});
  if(snapshot.budgetSummary.watchCount>0&&snapshot.budgetSummary.overCount===0)f.push({id:'BUDGET_PACE_HIGH',severity:'warning',data:snapshot.budgetSummary});
  if(snapshot.emergencyFund.recommendedEmergencyFund>0&&snapshot.emergencyFund.currentAvailableReserve<snapshot.emergencyFund.recommendedEmergencyFund*.5)f.push({id:'EMERGENCY_LOW',severity:'critical',data:snapshot.emergencyFund});
  if(snapshot.emergencyFund.recommendedEmergencyFund>0&&snapshot.emergencyFund.currentAvailableReserve>=snapshot.emergencyFund.recommendedEmergencyFund)f.push({id:'EMERGENCY_HEALTHY',severity:'positive',data:snapshot.emergencyFund});
  if(b.discretionaryRatio>60)f.push({id:'HIGH_DISCRETIONARY_SPENDING',severity:'warning',data:{discretionaryRatio:b.discretionaryRatio}});
  if(Number(b.spendingTrend?.pctChange||0)>=30&&Number(b.spendingTrend?.change||0)>=500)f.push({id:'SPENDING_SPIKE',severity:'warning',data:b.spendingTrend});
  if(Number(b.incomeTrend?.pctChange||0)<=-20&&Number(b.incomeTrend?.change||0)<0)f.push({id:'INCOME_DROP',severity:'warning',data:b.incomeTrend});
  if(b.savingsRate<getBrainTargets().savingsRatePct/2&&Number(snapshot.thisMonth.income||0)>0)f.push({id:'SAVINGS_RATE_LOW',severity:'warning',data:{savingsRate:b.savingsRate}});
  if(!f.length)f.push({id:'FINANCIAL_STRENGTH',severity:'positive',data:{score:snapshot.financialBrain?.score}});
  const rank={critical:4,warning:3,info:2,positive:1};return f.sort((a,z)=>(rank[z.severity]||0)-(rank[a.severity]||0));
}

function extractAdvisorAmount(text){
  const q=String(text||'');
  const matches=[...q.matchAll(/(?:฿|บาท|ราคา|ซื้อ|จ่าย|ค่าใช้จ่าย)\s*([0-9][0-9,]*(?:\.[0-9]+)?)/gi)].map(m=>Number(String(m[1]).replace(/,/g,''))).filter(Number.isFinite);
  if(matches.length)return matches[0];
  const standalone=[...q.matchAll(/\b([0-9]{2,}(?:,[0-9]{3})*(?:\.[0-9]+)?)\b/g)].map(m=>Number(String(m[1]).replace(/,/g,''))).filter(Number.isFinite);
  return standalone.length===1?standalone[0]:null;
}
function extractHypotheticalIncome(q){
  q=String(q||""); if(!/(รายรับ|รายได้|เงินเข้า|เงินเดือน|เข้ามา)/.test(q)||!/(สมมติ|ถ้า|พอ|ประมาณ)/.test(q)) return null;
  const re=/([0-9][0-9,]*(?:\.[0-9]+)?)\s*(k|K|พัน|หมื่น)?/g; let m;
  while((m=re.exec(q))){ let v=Number(m[1].replace(/,/g,'')); if(m[2]==='k'||m[2]==='K'||m[2]==='พัน')v*=1000; else if(m[2]==='หมื่น')v*=10000; if(v>=1000) return v; }
  return null;
}
function buildAdvisorQueryContext(query,snapshot,profile){
  const hypo=extractHypotheticalIncome(query);
  if(hypo!=null){
    const T=getBrainTargets(),ef=snapshot.emergencyFund||{},gap=Math.max(0,Number(ef.recommendedEmergencyFund||0)-Number(ef.currentAvailableReserve||0));
    return {mode:'income_allocation',hypotheticalIncome:hypo,plan:{saveAtLeast:Math.round(hypo*T.savingsRatePct/100),essentialMax:Math.round(hypo*T.essentialMaxPct/100),discretionaryMax:Math.round(hypo*T.discretionaryMaxPct/100)},targetsPct:T,emergencyFundGap:gap,incomeBaseline:getIncomeBaseline(),bufferSuggested:{min:Math.round(hypo*0.05),max:Math.round(hypo*0.10)},upcomingBills30d:(()=>{try{return Math.round(getUpcomingOccurrences("30d").reduce((t,o)=>t+Number((o.r||o).amount||0),0));}catch(e){return null;}})()};
  }
  if(/สิ้นเดือน|ปิดเดือน|สรุปเดือน|เศษเงิน|เงินเหลือ|เหลือเท่า|ย้าย.{0,6}(ออม|สำรอง)|buffer|บัฟเฟอร์/i.test(String(query||""))){
    return {mode:"month_end",plan:buildMonthEndPlan(snapshot)};
  }
  const amount=extractAdvisorAmount(query);
  if(amount==null)return {mode:'general',note:'ไม่ได้ระบุจำนวนเงินที่ตรวจสอบ affordability ได้ชัดเจน'};
  const available=Number(snapshot.cash?.available||0);
  const upcoming=(typeof getUpcomingOccurrences==='function'?getUpcomingOccurrences('7d'):[]).reduce((sum,o)=>sum+Number((o.r||o).amount||0),0);
  const reserveTarget=Math.max(0,Number(profile?.minReserveTarget||0));
  const afterPurchase=available-amount;
  const afterKnownObligations=available-upcoming-amount;
  return {mode:'affordability',purchaseAmount:amount,availableCash:available,upcoming7d:upcoming,minReserveTarget:reserveTarget,remainingAfterPurchase:afterPurchase,bufferAfterKnownObligations:afterKnownObligations,passesCashCheck:afterPurchase>=0,passesKnownObligationsCheck:afterKnownObligations>=0,passesReserveCheck:reserveTarget<=0||afterKnownObligations>=reserveTarget,assumptions:['ใช้เงินสดที่ใช้ได้หลังหักเงินกันไว้แล้ว','หักเฉพาะ recurring/upcoming obligations ที่ระบบรู้จักภายใน 7 วัน','ไม่สมมติรายรับในอนาคต','เงินสำรองขั้นต่ำใช้เฉพาะเมื่อผู้ใช้ตั้งค่าไว้']};
}

function buildFinancialAnalystSystemPrompt(snapshot, profile){
  const hasProfile = hasAIProfileContent(profile);
  const lines = [
    "คุณคือ Personal Financial Manager ส่วนตัวของผู้ใช้แอปการเงิน Vaultet ทำหน้าที่ตอบคำถาม/วิเคราะห์สถานะการเงินของผู้ใช้",
    "ตอบโดยอิงจากตัวเลขใน Financial Snapshot ด้านล่างเท่านั้น ห้ามคำนวณตัวเลขเอง ห้ามประมาณ/เดาตัวเลขที่ไม่มีอยู่ใน Snapshot",
    "ตอบให้สั้นก่อนเสมอ: โดยทั่วไป 1-4 ประโยค หรือไม่เกิน 3 bullet เมื่อมีหลายประเด็น; อย่าเปิดรายงานการเงินเต็มรูปแบบถ้าผู้ใช้ไม่ได้ขอ",
    "ใช้ภาษาคนที่คุยง่ายและเป็นธรรมชาติ แต่ยังแม่นและมืออาชีพ; หลีกเลี่ยงศัพท์ corporate/financial jargon ที่ไม่จำเป็น ไม่ต้องมีคำนำหรือคำลงท้าย",
    "โครงสร้างตามธรรมชาติ: คำตอบตรงๆ → เหตุผลสั้นๆ ถ้าจำเป็น → สิ่งที่ควรทำต่อถ้ามี; ไม่จำเป็นต้องมีครบทุกส่วนทุกครั้ง",
    "ถ้าการเงินปกติ ให้บอกสั้นๆ ว่าปกติ/ยังไม่มีอะไรน่ากังวล และอย่าสร้างปัญหาเพื่อให้ดูฉลาด",
    "ใช้ **ข้อความ** ล้อมรอบตัวเลขเงินหรือประเด็นสำคัญที่ต้องการเน้นให้ผู้ใช้เห็นชัด",
    "ถ้าคำถามของผู้ใช้ต้องการข้อมูลที่ไม่มีอยู่ใน Snapshot ให้บอกตรงๆ ว่าไม่มีข้อมูลส่วนนั้น อย่าสร้างตัวเลขขึ้นมาเอง",
    `เกณฑ์สุขภาพการเงินของเดือนนี้ในระบบ (หน้า Financial Brain ใช้ค่านี้): ออม ≥${getBrainTargets().savingsRatePct}% , จำเป็น ≤${getBrainTargets().essentialMaxPct}% , ไม่จำเป็น ≤${getBrainTargets().discretionaryMaxPct}% ของรายรับ`,
    "ถ้า queryContext.mode=income_allocation (ผู้ใช้สมมติรายรับ) ใช้ queryContext.plan เป็นฐาน แต่ปรับสัดส่วนให้เหมาะกับสถานการณ์ได้ (เช่น เงินสำรองยังไม่ถึงเป้า → ออมมากขึ้น) โดยต้องบอกเปอร์เซ็นต์ที่ใช้ชัดเจน และต้องเสนอ action set_brain_targets ให้หน้า Brain ตรงกับแผนที่เสนอ",
    `การสั่งแก้ระบบ: ถ้าผู้ใช้ขอให้ตั้ง/ปรับ/ลบงบประมาณหรือเกณฑ์ Brain ให้ **เสนอ** การเปลี่ยนแปลงด้วยการเพิ่มบรรทัดท้ายคำตอบ รูปแบบ JSON บรรทัดเดียว ต่อ 1 action: @@ACTION@@ {"type":"set_budget","month":"YYYY-MM","name":"ชื่อกลุ่ม(ไม่บังคับ)","categories":["หมวด1","หมวด2"],"amount":3720} | {"type":"delete_budget","month":"YYYY-MM","categories":[...]} | {"type":"set_brain_targets","month":"YYYY-MM","savingsRatePct":20,"essentialMaxPct":50,"discretionaryMaxPct":30} | {"type":"reset_brain_targets","month":"YYYY-MM"} | {"type":"add_entry","entryType":"income|expense","category":"หมวด","amount":123,"date":"YYYY-MM-DD","note":"","account":"ชื่อบัญชี(ไม่บังคับ)"} | {"type":"edit_entry","id":"รหัสรายการ","amount":123,"category":"หมวด","date":"YYYY-MM-DD","note":""(ใส่เฉพาะช่องที่จะแก้)} | {"type":"delete_entry","id":"รหัสรายการ"} | {"type":"add_recurring","name":"ชื่อ","amount":199,"category":"หมวดรายจ่าย","frequency":"weekly|monthly|bimonthly|quarterly|yearly","nextDueDate":"YYYY-MM-DD"} | {"type":"set_emergency_target","targetMonths":3}. add_entry ใช้เมื่อผู้ใช้บอกชัดว่ามีรายการเกิดขึ้นจริงให้บันทึก (ไม่ใช่การสมมติ) และ categories ของรายรับ: ${JSON.stringify(CATS_BY_TYPE.income||[])}; ห้ามเดาจำนวนเงินหรือวันที่ที่ผู้ใช้ไม่ได้บอก ถ้าไม่ชัดให้ถามก่อน`,
    `- เดือนปัจจุบัน ${monthKey(todayISO())}; categories ต้องเป็นชื่อหมวดรายจ่ายที่มีจริงเท่านั้น: ${JSON.stringify(CATS_BY_TYPE.expense||[])}; 1 หมวดอยู่ได้แค่งบเดียวต่อเดือน; ออม+จำเป็น+ไม่จำเป็นรวมกันต้องไม่เกิน 100%`,
    `- รายการที่แก้/ลบได้ (ล่าสุด 40 รายการ; ใช้ id ตามนี้เท่านั้น ห้ามเดา id; ถ้าผู้ใช้พูดคลุมเครือว่าหมายถึงรายการไหน ให้ถามก่อน และห้ามเสนอลบ/แก้หลายรายการพร้อมกันถ้าไม่ชัดเจน): ${JSON.stringify(entries.filter(e=>(e.type==="income"||e.type==="expense")&&!e.source&&!e.recurringId&&e.category!=="กยศ.").slice(0,40).map(e=>({id:e.id,date:e.date,type:e.type,category:e.category,amount:e.amount,note:e.note||""})))}`,
    "- ผู้ใช้ต้องกดยืนยันก่อนระบบถึงจะเปลี่ยนจริง ดังนั้นห้ามบอกว่า \"ปรับให้แล้ว\" ให้บอกว่าเสนอแล้วให้กดยืนยันด้านล่าง และห้ามใส่ action ถ้าผู้ใช้แค่ถามหรือขอคำแนะนำเฉยๆ ที่ไม่ได้ขอให้ปรับระบบ; ห้ามเปิดเผยบรรทัด @@ACTION@@ ในเนื้อหาคำตอบ",
    `- งบรายออม: set_budget/delete_budget ใส่ "kind":"saving" ได้ โดย categories ต้องเป็นหมวดออมเท่านั้น: ${JSON.stringify(CATS_BY_TYPE.saving||[])} (หน้าแผนจะแสดงว่าเดือนนี้ออมไปแล้วเท่าไหร่เทียบเป้า) | เงินสำรองเผื่อเหตุไม่คาดฝัน: {"type":"set_buffer","month":"YYYY-MM","amount":1500} | ย้ายเศษเงินสำรองไปออม: {"type":"sweep_buffer","month":"YYYY-MM","amount":800,"category":"หมวดออม"} (เสนอได้หลายบรรทัดเพื่อแยกหมวด แต่ผลรวมต้องไม่เกินเงินสำรองที่เหลือ)`,
    (()=>{const bf=getBufferInfo();return `- บทบาท: คุณคือผู้จัดการการเงินส่วนตัวที่ฉลาด ไม่ใช่แค่เครื่องคิดเลข ทุกครั้งที่จัดสรรรายรับ/วางแผนงบ ต้องกันเงินสำรองเผื่อเหตุไม่คาดฝัน (ซ่อมรถ/ค่ารักษา/ของพัง/งานด่วน) ราว 5-10% ของรายรับ (หรือประมาณ 1 เดือนของค่าใช้จ่ายผันแปร ถ้าเงินสำรองฉุกเฉินยังไม่ถึงเป้าให้เลือกต่ำ-กลาง) แยกเป็นก้อนชัดเจน บอกเหตุผลสั้นๆ และเสนอ set_buffer คู่กับงบอื่นเสมอ; จัดลำดับ: เงินสำรองฉุกเฉินไม่ถึงเป้า > buffer > หนี้ดอกแพง > ออม/ลงทุน > ใช้ชีวิต; ${bf?`buffer เดือนนี้ตั้งไว้ ฿${bf.amount}, ใช้ไปแล้ว(รายจ่ายนอกหมวดที่ตั้งงบ) ฿${bf.used}, คงเหลือ ฿${bf.remaining}, เหลืออีก ${bf.daysLeft} วันจะสิ้นเดือน`:"ยังไม่ได้ตั้ง buffer เดือนนี้"}; ถ้าใกล้สิ้นเดือน(เหลือ ≤5 วัน) หรือผู้ใช้ถามสรุปเดือน และ buffer ยังเหลือ ให้แนะนำชัดว่าควรย้ายเศษไปไหน พร้อมจำนวนเงิน ตามลำดับความสำคัญข้างต้น (เช่น เติมเงินสำรองฉุกเฉิน → โปะหนี้ → ออมเพิ่ม) แล้วเสนอ action ที่เกี่ยวข้อง; ถ้า buffer ถูกใช้เกินให้เตือนและเสนอวิธีชดเชยจากหมวดไม่จำเป็นเดือนหน้า`;})(),
    "ถ้า queryContext.mode=month_end ให้ใช้ queryContext.plan.waterfall เป็นคำตอบหลักตามลำดับที่ให้มาโดยตรง ห้ามคำนวณใหม่ อธิบายเหตุผลของแต่ละก้อนสั้นๆ แล้วเสนอ sweep_buffer หนึ่งบรรทัดต่อหนึ่งก้อน (ใช้ category ตามที่ระบุ) ถ้า plan.note บอกว่าใช้เกิน/ยังไม่ตั้ง buffer ให้บอกตรงๆ และเสนอวิธีแก้ (เช่น ลดหมวดไม่จำเป็นเดือนหน้า หรือ set_buffer เดือนหน้า) ถ้า overBudget ไม่ว่าง ให้เตือนหมวดที่เกินด้วย",
    "ถ้า queryContext.mode=income_allocation: (1) เสนอการจัดสรรให้ครบ 100% ของรายรับ โดยมีก้อน buffer ชัดเจนในช่วง queryContext.bufferSuggested (ถ้าเงินสำรองฉุกเฉินยังขาดมากให้เลือกฝั่งต่ำของช่วง) ให้หัก buffer จากส่วน \"ไม่จำเป็น\" ก่อน เพื่อไม่ให้เปอร์เซ็นต์ออม/จำเป็นเพี้ยน (2) ตรวจว่าก้อน \"จำเป็น\" ครอบคลุมรายจ่ายประจำที่รอตัด/queryContext.upcomingBills30d แล้ว ถ้าไม่พอให้เตือนและปรับ (3) สรุปตัวเลขทุกก้อนให้รวมเท่ากับรายรับ (4) เสนอ action ให้ครบชุดในคำตอบเดียว: set_brain_targets + set_buffer และ set_budget/ออมรายหมวดถ้าเกี่ยวข้อง ไม่ต้องรอให้ถามซ้ำ",
    "หลักการทั่วไป: ตอบแบบผู้จัดการการเงินที่ลงมือทำ — เริ่มจากข้อสรุป/คำแนะนำที่ชัด ตามด้วยตัวเลขที่อ้างจาก Snapshot เท่านั้น ถ้าข้อมูลที่จำเป็นขาด (เช่น ไม่รู้รายรับจริง) ให้ถามกลับสั้นๆ 1 ข้อ แทนการเดา และถ้าผู้ใช้เสนอแก้แผนให้ปรับเฉพาะส่วนที่ขอ พร้อมบอกว่าอะไรเปลี่ยนจากเดิม",
    (()=>{const ib=getIncomeBaseline();return ib.months>=2?`- ฐานรายรับ: รายรับจริงเฉลี่ย ${ib.months} เดือนที่ผ่านมา ฿${ib.avg} (ต่ำสุด ฿${ib.min} สูงสุด ฿${ib.max}, ผันผวน ${ib.volatilityPct}%). ถ้าผันผวน >25% หรือรายรับที่ผู้ใช้สมมติสูงกว่าค่าเฉลี่ย >20% ให้คำนวณงบหมวดจำเป็นและเป้าออมจากค่าเฉลี่ย (ถ้าผันผวนมากใช้ใกล้ยอดต่ำสุด) ส่วนที่เกินให้เข้า buffer/เงินสำรองฉุกเฉินก่อน และต้องบอกผู้ใช้ชัดเจนว่าใช้ฐานไหนเพราะอะไร`:"- ฐานรายรับ: ข้อมูลรายรับย้อนหลังยังไม่พอ (<2 เดือน) ให้ใช้ยอดที่ผู้ใช้บอก แต่แนะนำให้เผื่อ buffer เพิ่มเพราะยังประเมินความผันผวนไม่ได้";})(),
    "ถ้า Snapshot มี queryContext.mode=affordability ให้ใช้ผลคำนวณนั้นโดยตรงในการอธิบายว่าเงินก้อนนี้กระทบ cash, known obligations และ minimum reserve อย่างไร ห้ามคำนวณซ้ำเอง",
    "",
    "เรื่องหนี้สิน (debts): หนี้ กยศ. เป็นหนี้เพื่อการศึกษาที่ยังอยู่ใน Grace Period (ระหว่างศึกษา) — ยังไม่มีดอกเบี้ยเดินและยังไม่ต้องผ่อนชำระรายเดือนตอนนี้",
    "ห้ามเอา debts.totalDebt ไปหักออกจาก netWorth.available หรือมองว่ากระทบสภาพคล่อง/กระแสเงินสดของเดือนนี้เด็ดขาด (Cash Flow Forecast ในระบบก็ไม่ได้หักหนี้นี้ออกเช่นกัน)",
    "ให้มองหนี้นี้เป็นภาระผูกพันระยะยาวที่แยกต่างหากจากสภาพคล่องปัจจุบัน แต่ให้นำมาพิจารณาประกอบเวลาประเมินภาพรวม Net Worth หรือแผนการเงินระยะยาวของผู้ใช้",
  ];

  if(hasProfile){
    lines.push(
      "",
      "ผู้ใช้มี User Profile (บริบท/เป้าหมาย/ข้อจำกัดทางการเงินของผู้ใช้) แนบมาด้วย — ให้นำไปใช้ประกอบคำแนะนำเสมอ ไม่ใช่ดูแค่ตัวเลขดิบใน Snapshot:",
      profile.nickname ? `- ถ้าเหมาะสม เรียกผู้ใช้ว่า "${profile.nickname}" ในคำตอบได้` : null,
      "- ถ้ามีการตั้ง minReserveTarget ไว้ ให้เทียบกับ netWorth.available เสมอ: ถ้า available ต่ำกว่า minReserveTarget อยู่แล้ว หรือจะทำให้ต่ำกว่าหลังจ่ายตามที่ผู้ใช้ถาม ให้แจ้งผลกระทบต่อเงินสำรองนี้เป็นเรื่องแรกก่อนเรื่องอื่น โดยเฉพาะเวลาผู้ใช้ถามว่าจะซื้อของชิ้นไหนไหวไหม",
      "- ถ้ามีการตั้ง monthlyIncomeEstimate ไว้ ให้เทียบกับ thisMonth.income ใน Snapshot เพื่อประเมินว่าเดือนนี้รายรับเข้ามาตามที่คาดไว้ ต่ำกว่า หรือสูงกว่า แล้วนำผลนั้นไปประกอบคำแนะนำ",
      "- ถ้ามี financialGoals ให้พิจารณาว่าคำถาม/รายจ่ายที่ผู้ใช้ถามถึง จะกระทบความคืบหน้าไปสู่เป้าหมายเหล่านั้นอย่างไร (เช่น ทำให้ต้องเลื่อนเป้าหมาย หรือยังไปถึงได้ตามกำหนด)",
      "- ถ้ามี notes (ข้อจำกัด/นิสัยการเงิน) ให้เคารพข้อจำกัดเหล่านั้นในคำแนะนำด้วย เช่น ถ้าโน้ตบอกว่าห้ามแตะเงินในบัญชีออม ก็ไม่ควรแนะนำให้ดึงเงินออมมาใช้",
      "- ห้ามฟันธงแทนผู้ใช้ว่า \"ซื้อได้\"/\"ห้ามซื้อ\" เด็ดขาด ให้อธิบายผลกระทบต่อเงินสำรอง/เป้าหมายอย่างตรงไปตรงมา แล้วให้ผู้ใช้ตัดสินใจเอง",
      "",
      "User Profile:",
      JSON.stringify(profile),
      profile.firstName || profile.lastName || profile.age!=null ? `บริบทตัวตน: ${[profile.firstName,profile.lastName].filter(Boolean).join(" ") || ""}${profile.age!=null?` อายุ ${profile.age} ปี`:""}` : null,
      profile.statuses?.length || profile.occupation || profile.education ? `บริบทชีวิต: ${[...(profile.statuses||[]),profile.occupation,profile.workType,profile.education].filter(Boolean).join(" · ")}` : null,
      profile.personalContext ? `เกี่ยวกับผู้ใช้: ${profile.personalContext}` : null,
      profile.priorities?.length ? `สิ่งสำคัญสำหรับผู้ใช้: ${profile.priorities.join(", ")}` : null,
      profile.habits ? `นิสัยการใช้เงิน: ${profile.habits}` : null,
      profile.aiHelp ? `สิ่งที่ผู้ใช้อยากให้ AI ช่วย: ${profile.aiHelp}` : null
    );
  }

  lines.push(
    "",
    "Financial Snapshot (ตัวเลขที่คำนวณไว้แล้วทั้งหมด หน่วยเป็นบาท):",
    JSON.stringify(snapshot)
  );

  // ===== Memory ระยะยาว — ข้อมูลสำคัญที่ผู้ใช้เคยขอให้จำไว้ข้ามการสนทนา =====
  const memory = (profile?.permissions?.memory === false ? [] : loadAIMemory().slice(-20)); // ผู้ใช้ควบคุมได้ว่า AI จะใช้ Memory หรือไม่
  lines.push(
    "",
    "ความจำระยะยาว (Memory) — ข้อมูลสำคัญที่ผู้ใช้เคยขอให้จำไว้ใช้ข้ามการสนทนา แต่ละอันมี id กำกับ:",
    memory.length ? JSON.stringify(memory) : "(ยังไม่มีอะไรถูกจำไว้)",
    "",
    "กติกาการอัปเดต Memory (สำคัญ):",
    "- ถ้าผู้ใช้เล่าข้อมูลสำคัญที่ควรใช้ได้ในการสนทนาครั้งต่อๆ ไป (เช่น วันเงินเดือนออก นิสัย/เป้าหมายการเงิน ข้อจำกัดสำคัญ) หรือบอกตรงๆ ว่า \"จำไว้ด้วย\"/\"บันทึกไว้\" ให้เพิ่มบรรทัดต่อท้ายคำตอบ (บรรทัดใหม่ แยกจากเนื้อหา) รูปแบบ: @@MEMORY_ADD@@ ข้อความที่ต้องการจำ (เขียนสั้น กระชับ ได้ใจความ เป็นข้อความเดี่ยวๆ ไม่ต้องมีวันที่กำกับ)",
    "- ถ้าผู้ใช้ขอให้ลืม/ลบความจำเรื่องใดเรื่องหนึ่ง ให้เพิ่มบรรทัด: @@MEMORY_DELETE@@ ตามด้วย id ของรายการนั้น (คัดลอก id จากรายการด้านบนให้ตรงเป๊ะ)",
    "- ใส่ directive ได้หลายบรรทัดถ้าจำเป็น แต่ให้ใส่เฉพาะข้อมูลที่สำคัญจริงๆ เท่านั้น ห้ามจำคำถามทั่วไป เรื่องชั่วคราว หรือสิ่งที่ไม่เกี่ยวกับผู้ใช้ในระยะยาว",
    "- ผู้ใช้จะไม่เห็น directive พวกนี้ (ระบบตัดออกก่อนแสดงผลให้ผู้ใช้) จึงห้ามพูดถึงมันในเนื้อหาคำตอบที่ผู้ใช้เห็น เช่น ห้ามเขียนว่า \"ผมจดไว้แล้วนะ\" ให้ตอบตามปกติแล้วแปะ directive ต่อท้ายเงียบๆ"
  );

  return lines.filter(l => l !== null).join("\n");
}

// ส่ง Snapshot + Profile + คำถามผู้ใช้ ให้ Gemini วิเคราะห์ คืน { ok:true, text } หรือ { ok:false, error }
async function analyzeFinancialQuery(query, snapshot){
  if(getApiKeys().length === 0) return { ok:false, error:"missing_api_key" };
  if(!query || !query.trim()) return { ok:false, error:"empty_input" };

  const profile = loadAIProfile(); // null ถ้าผู้ใช้ยังไม่เคยตั้งค่า — ไม่ทำให้ query flow พังถ้าไม่มีโปรไฟล์
  const queryContext=buildAdvisorQueryContext(query,snapshot,profile);
  const systemPrompt = buildFinancialAnalystSystemPrompt({...snapshot,queryContext}, profile);

  let res;
  try{
    res = await fetchGeminiWithRetry(
      (apiKey) => `https://generativelanguage.googleapis.com/v1beta/models/${AI_TRANSACTION_MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: query.trim() }] }],
          systemInstruction: { parts: [{ text: systemPrompt }] },
          generationConfig: { maxOutputTokens: 4096 }
        })
      }
    );
  }catch(e){
    return { ok:false, error:"network_error" };
  }

  if(!res.ok){
    let detail = "";
    try{ detail = (await res.text()).slice(0,300); }catch(e){}
    return { ok:false, error: res.status === 400 ? "invalid_api_key" : "api_error", detail, status: res.status };
  }

  let data;
  try{ data = await res.json(); }catch(e){ return { ok:false, error:"invalid_json" }; }

  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if(!text) return { ok:false, error:"empty_response" };

  return { ok:true, text };
}

// ===== Persistent AI Chat (ที่ปรึกษาการเงิน) — ระบบหลายแชท (เหมือน ChatGPT/Gemini) เก็บไว้ในเครื่องนี้เท่านั้น =====
// โครงสร้าง: { chats:[{id,title,messages,createdAt,updatedAt}], activeId }
function loadAllChats(){
  try{
    const raw = localStorage.getItem(AI_CHATS_KEY);
    if(raw){
      const parsed = JSON.parse(raw);
      if(parsed && Array.isArray(parsed.chats) && parsed.chats.length) return parsed;
    }
  }catch(e){}

  // ยังไม่เคยมีข้อมูลแบบหลายแชท — migrate จากประวัติแชทเดี่ยวแบบเก่า (ถ้ามี) มาเป็นแชทแรกให้อัตโนมัติ
  let migratedMessages = [];
  try{
    const oldRaw = localStorage.getItem(AI_CHAT_KEY);
    if(oldRaw){
      const oldHistory = JSON.parse(oldRaw);
      if(Array.isArray(oldHistory)) migratedMessages = oldHistory;
    }
  }catch(e){}

  const now = new Date().toISOString();
  const firstChat = {
    id: makeId(),
    title: migratedMessages.length ? chatTitleFrom(migratedMessages) : null,
    messages: migratedMessages,
    createdAt: now,
    updatedAt: now,
  };
  const data = { chats: [firstChat], activeId: firstChat.id };
  saveAllChats(data);
  return data;
}
function saveAllChats(data){
  try{ localStorage.setItem(AI_CHATS_KEY, JSON.stringify(data)); }catch(e){}
}
function chatTitleFrom(messages){
  const firstUser = (messages || []).find(m => m.role === "user");
  if(!firstUser || !firstUser.text) return "แชทใหม่";
  const t = firstUser.text.trim().replace(/\s+/g, " ");
  return t.length > 34 ? t.slice(0, 34) + "…" : (t || "แชทใหม่");
}
function chatTimeLabel(iso){
  try{
    const d = new Date(iso);
    const hh = String(d.getHours()).padStart(2,"0");
    const mm = String(d.getMinutes()).padStart(2,"0");
    return `${d.getDate()} ${THAI_MONTHS_SHORT[d.getMonth()]} ${hh}:${mm}`;
  }catch(e){ return ""; }
}
function getActiveChat(){
  const data = loadAllChats();
  let chat = data.chats.find(c => c.id === data.activeId);
  if(!chat){
    // activeId เพี้ยน/ถูกลบไปแล้ว — fallback ไปแชทล่าสุดในลิสต์
    chat = data.chats[data.chats.length - 1];
    if(chat){ data.activeId = chat.id; saveAllChats(data); }
  }
  return chat || null;
}
function loadAIChatHistory(){
  const chat = getActiveChat();
  return chat ? chat.messages : [];
}
function saveAIChatHistory(history){
  const data = loadAllChats();
  let chat = data.chats.find(c => c.id === data.activeId);
  if(!chat){
    chat = { id: makeId(), title: null, messages: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    data.chats.push(chat);
    data.activeId = chat.id;
  }
  chat.messages = history.slice(-40); // เก็บย้อนหลังไม่เกิน 40 ข้อความต่อแชท กันไฟล์บวม
  chat.updatedAt = new Date().toISOString();
  if(!chat.title) chat.title = chatTitleFrom(chat.messages);
  saveAllChats(data);
}
// ล้างเฉพาะข้อความในแชทที่เปิดอยู่ (แชทยังอยู่ในลิสต์ แต่ว่างเปล่า) — ใช้กับปุ่ม 🗑️ ในหน้าต่างแชท
function clearAIChatHistory(){
  const data = loadAllChats();
  const chat = data.chats.find(c => c.id === data.activeId);
  if(chat){ chat.messages = []; chat.title = null; chat.updatedAt = new Date().toISOString(); saveAllChats(data); }
}
// เริ่มแชทใหม่ทั้งหมด (ว่างเปล่า) แล้วสลับไปเป็นแชทที่เปิดอยู่
function createNewChat(){
  const data = loadAllChats();
  // ถ้าแชทที่เปิดอยู่ยังว่าง ใช้อันเดิมต่อ ไม่สร้างแชทว่างซ้อน
  const cur = data.chats.find(c => c.id === data.activeId);
  if(cur && (!cur.messages || cur.messages.length === 0)) return cur;
  const now = new Date().toISOString();
  const chat = { id: makeId(), title: null, messages: [], createdAt: now, updatedAt: now };
  data.chats.unshift(chat);
  data.activeId = chat.id;
  saveAllChats(data);
  return chat;
}
// สลับไปแชทอื่นตาม id
function switchToChat(id){
  const data = loadAllChats();
  if(data.chats.some(c => c.id === id)){
    // ออกจากแชทว่างที่ไม่เคยคุย → ลบทิ้ง ไม่ให้ค้างในรายการ
    const prev = data.chats.find(c => c.id === data.activeId);
    if(prev && prev.id !== id && (!prev.messages || prev.messages.length === 0)){
      data.chats = data.chats.filter(c => c.id !== prev.id);
    }
    data.activeId = id; saveAllChats(data);
  }
}
// เคลียร์แชทว่างเก่าที่ค้างอยู่ (เก็บแชทที่เปิดอยู่ไว้เสมอ แม้ว่าง)
function pruneEmptyChats(){
  try{
    const data = loadAllChats();
    const keep = data.chats.filter(c => (c.messages && c.messages.length) || c.id === data.activeId);
    if(keep.length !== data.chats.length){ data.chats = keep; saveAllChats(data); }
  }catch(e){}
}
// ลบแชททิ้งทั้งอัน — ถ้าลบอันที่กำลังเปิดอยู่ จะสลับไปแชทอื่นที่อัปเดตล่าสุด หรือสร้างแชทใหม่ถ้าไม่เหลือเลย
function deleteChat(id){
  const data = loadAllChats();
  data.chats = data.chats.filter(c => c.id !== id);
  if(!data.chats.length){
    const now = new Date().toISOString();
    data.chats.push({ id: makeId(), title: null, messages: [], createdAt: now, updatedAt: now });
  }
  if(data.activeId === id){
    const sorted = [...data.chats].sort((a,b) => (b.updatedAt||"").localeCompare(a.updatedAt||""));
    data.activeId = sorted[0].id;
  }
  saveAllChats(data);
}

// ===== Memory ระยะยาว (เหมือนระบบ Memory ของ AI ทั่วไป) — [{id,text,createdAt}] เก็บในเครื่องนี้เท่านั้น =====
function loadAIMemory(){
  try{
    const raw = localStorage.getItem(AI_MEMORY_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  }catch(e){ return []; }
}
function saveAIMemory(list){
  try{ localStorage.setItem(AI_MEMORY_KEY, JSON.stringify(list)); }catch(e){}
}
function addMemoryEntry(text){
  const t = (text || "").trim();
  if(!t) return;
  const mem = loadAIMemory();
  mem.push({ id: makeId(), text: t, createdAt: new Date().toISOString() });
  saveAIMemory(mem);
}
function deleteMemoryEntry(id){
  saveAIMemory(loadAIMemory().filter(m => m.id !== id));
}
// AI แปะ directive ท้ายคำตอบเพื่อขอเพิ่ม/ลบความจำเอง เช่น "@@MEMORY_ADD@@ ข้อความ" หรือ "@@MEMORY_DELETE@@ id"
// ฟังก์ชันนี้ดึง directive ออกมา พร้อมคืนข้อความที่ตัด directive ออกแล้ว (สำหรับเอาไปแสดง/บันทึกในแชทจริง)
function extractMemoryDirectives(text){
  if(!text) return { cleaned: text, adds: [], dels: [] };
  const adds = [];
  const dels = [];
  const addRe = /^@@MEMORY_ADD@@\s*(.+)$/gm;
  const delRe = /^@@MEMORY_DELETE@@\s*(.+)$/gm;
  let m;
  while((m = addRe.exec(text))) adds.push(m[1].trim());
  while((m = delRe.exec(text))) dels.push(m[1].trim());
  const cleaned = text
    .replace(/^@@MEMORY_ADD@@.*$/gm, "")
    .replace(/^@@MEMORY_DELETE@@.*$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return { cleaned, adds, dels };
}
function applyMemoryDirectives(adds, dels){
  if(!adds.length && !dels.length) return;
  let mem = loadAIMemory();
  dels.forEach(d => {
    if(!d) return;
    // ลบตาม id ตรงๆ ถ้ามี หรือลบรายการที่เนื้อหาตรงกับข้อความที่ AI ส่งมา (กันกรณี AI จำ id ไม่แม่น)
    mem = mem.filter(item => item.id !== d && item.text !== d);
  });
  adds.forEach(a => { if(a) mem.push({ id: makeId(), text: a, createdAt: new Date().toISOString() }); });
  saveAIMemory(mem);
}
// จัดการผลลัพธ์จาก AI ก่อนเอาไปแสดง/บันทึกจริง — ดึง directive ออก อัปเดต memory แล้วคืนข้อความที่สะอาดแล้ว
let __pendingActions=[];
function takePendingActions(){ const a=__pendingActions; __pendingActions=[]; return a; }
function sanitizeAiAction(a){
  if(!a||typeof a!=="object") return null;
  const month=/^\d{4}-\d{2}$/.test(String(a.month||""))?String(a.month):monthKey(todayISO());
  const valid=new Set(a.kind==="saving"?(CATS_BY_TYPE.saving||[]):(CATS_BY_TYPE.expense||[])), kind=(a.kind==="saving"?"saving":"expense"), cats=Array.isArray(a.categories)?Array.from(new Set(a.categories.map(String))).filter(c=>valid.has(c)):[];
  const n=v=>{v=Number(v);return isFinite(v)&&v>=0&&v<=100?Math.round(v):null;};
  if(a.type==="set_budget"){ const amount=Number(a.amount); if(!cats.length||!isFinite(amount)||amount<0) return null; return {type:a.type,kind,month,categories:cats,name:String(a.name||"").slice(0,30),amount:Math.round(amount*100)/100,status:"pending"}; }
  if(a.type==="delete_budget"){ if(!cats.length) return null; return {type:a.type,kind,month,categories:cats,status:"pending"}; }
  if(a.type==="sweep_buffer"){ const amount=Number(a.amount); if(!isFinite(amount)||amount<=0||amount>10000000) return null; const sc=CATS_BY_TYPE.saving||[]; const cat=sc.includes(String(a.category||""))?String(a.category):(sc.includes("เงินออม")?"เงินออม":sc[0]); if(!cat) return null; return {type:a.type,month,amount:Math.round(amount*100)/100,category:cat,status:"pending"}; }
  if(a.type==="set_buffer"){ const amount=Number(a.amount); if(!isFinite(amount)||amount<0||amount>10000000) return null; return {type:a.type,month,amount:Math.round(amount*100)/100,status:"pending"}; }
  if(a.type==="set_brain_targets"){ const s=n(a.savingsRatePct),e=n(a.essentialMaxPct),d=n(a.discretionaryMaxPct); if(s==null||e==null||d==null||s+e+d>100) return null; return {type:a.type,month,savingsRatePct:s,essentialMaxPct:e,discretionaryMaxPct:d,status:"pending"}; }
  if(a.type==="reset_brain_targets") return {type:a.type,month,status:"pending"};
  if(a.type==="add_entry"){ const type=a.type2||a.entryType||a.kind; const et=(a.entryType==="income"||a.entryType==="expense")?a.entryType:null, amount=Number(a.amount), date=/^\d{4}-\d{2}-\d{2}$/.test(String(a.date||""))?String(a.date):todayISO(), cat=String(a.category||"");
    if(!et||!isFinite(amount)||amount<=0||!(CATS_BY_TYPE[et]||[]).includes(cat)) return null;
    return {type:"add_entry",entryType:et,category:cat,amount:Math.round(amount*100)/100,date,note:String(a.note||"").slice(0,80),account:String(a.account||"").slice(0,40),status:"pending"}; }
  if(a.type==="edit_entry"||a.type==="delete_entry"){
    const e=entries.find(x=>x.id===String(a.id||"")); if(!e||(e.type!=="income"&&e.type!=="expense")||e.source||e.recurringId||e.category==="กยศ.") return null;
    if(a.type==="delete_entry") return {type:a.type,id:e.id,status:"pending"};
    const ch={}; if(a.amount!=null){const v=Number(a.amount); if(!isFinite(v)||v<=0) return null; ch.amount=Math.round(v*100)/100;}
    if(a.category!=null){ if(!(CATS_BY_TYPE[e.type]||[]).includes(String(a.category))||a.category==="กยศ.") return null; ch.category=String(a.category); }
    if(a.date!=null){ if(!/^\d{4}-\d{2}-\d{2}$/.test(String(a.date))) return null; ch.date=String(a.date); }
    if(a.note!=null) ch.note=String(a.note).slice(0,80);
    if(!Object.keys(ch).length) return null; return {type:a.type,id:e.id,changes:ch,status:"pending"};
  }
  if(a.type==="add_recurring"){ const amount=Number(a.amount), cat=String(a.category||""), fr=["weekly","monthly","bimonthly","quarterly","yearly"].includes(a.frequency)?a.frequency:"monthly", due=/^\d{4}-\d{2}-\d{2}$/.test(String(a.nextDueDate||""))?String(a.nextDueDate):null, name=String(a.name||"").trim().slice(0,40);
    if(!name||!isFinite(amount)||amount<=0||!(CATS_BY_TYPE.expense||[]).includes(cat)||!due) return null;
    return {type:"add_recurring",name,amount:Math.round(amount*100)/100,category:cat,frequency:fr,nextDueDate:due,account:String(a.account||"").slice(0,40),status:"pending"}; }
  if(a.type==="set_emergency_target"){ const m=Number(a.targetMonths); if(!isFinite(m)||m<1||m>24) return null; return {type:a.type,targetMonths:Math.round(m*10)/10,status:"pending"}; }
  return null;
}
function describeAiAction(a){
  const ml=monthLabel(a.month), nm=a.name||(a.categories||[]).join(" + ");
  if(a.type==="set_budget") return `${a.kind==="saving"?"ตั้งเป้าออม":"ตั้งงบ"} "${nm}" ${ml} = ฿${fmt(a.amount)}`;
  if(a.type==="delete_budget") return `ลบ${a.kind==="saving"?"เป้าออม":"งบ"} "${nm}" ${ml}`;
  if(a.type==="sweep_buffer") return `ย้ายเศษเงินสำรอง ฿${fmt(a.amount)} ไปออมหมวด "${a.category}"`;
  if(a.type==="set_buffer") return `ตั้งเงินสำรองเผื่อเหตุไม่คาดฝัน ${ml} = ฿${fmt(a.amount)}`;
  if(a.type==="set_brain_targets"){ const o=getBrainTargets(a.month); return `เกณฑ์ Brain ${ml}: ออม ≥${a.savingsRatePct}% · จำเป็น ≤${a.essentialMaxPct}% · ไม่จำเป็น ≤${a.discretionaryMaxPct}% (เดิม ${o.savingsRatePct}/${o.essentialMaxPct}/${o.discretionaryMaxPct})`; }
  if(a.type==="add_entry") return `บันทึก${a.entryType==="income"?"รายรับ":"รายจ่าย"} ${a.category} ฿${fmt(a.amount)} วันที่ ${a.date}${a.note?` (${a.note})`:""}`;
  if(a.type==="edit_entry"||a.type==="delete_entry"){ const e=entries.find(x=>x.id===a.id); const row=e?`${e.date} ${e.category} ฿${fmt(e.amount)}${e.note?` (${e.note})`:""}`:"(ไม่พบรายการแล้ว)";
    if(a.type==="delete_entry") return `ลบรายการ: ${row}`;
    const c=a.changes||{}; return `แก้รายการ: ${row} → ${[c.category,c.amount!=null?"฿"+fmt(c.amount):null,c.date,c.note!=null?`"${c.note}"`:null].filter(Boolean).join(" · ")}`; }
  if(a.type==="add_recurring") return `เพิ่มรายจ่ายประจำ "${a.name}" ฿${fmt(a.amount)} (${a.category}) ครบกำหนดแรก ${a.nextDueDate}`;
  if(a.type==="set_emergency_target") return `ตั้งเป้าเงินสำรองฉุกเฉิน ${a.targetMonths} เดือน (เดิม ${emergencyFundConfig.targetMonths})`;
  return `คืนเกณฑ์ Brain ${ml} เป็นค่าเริ่มต้น`;
}
function __aiAcct(name){ const n=String(name||"").trim(); return (n&&accounts.find(x=>x.name===n))||accounts.find(x=>x.id!==UNASSIGNED_ACCOUNT_ID)||accounts[0]; }
function __readTargets(){ let o={}; try{o=JSON.parse(localStorage.getItem(BRAIN_TARGETS_KEY)||"{}");}catch(e){} o.months=o.months||{}; return o; }
function executeAiAction(a){
  const now=new Date().toISOString();
  if(a.type==="set_budget"||a.type==="delete_budget"){
    const kind=a.kind==="saving"?"saving":"expense", key=bKey(a.month,a.categories,kind);
    const clash=budgets.find(x=>x.enabled!==false&&x.month===a.month&&(x.kind||"expense")===kind&&budgetKey(x)!==key&&x.categories.some(c=>a.categories.includes(c)));
    if(a.type==="set_budget"&&clash) return {ok:false,msg:`หมวดซ้ำกับงบ "${clash.category}"`};
    const ex=budgets.find(x=>x.enabled!==false&&budgetKey(x)===key), prev=ex?JSON.parse(JSON.stringify(ex)):null;
    if(a.type==="delete_budget"){ if(!ex) return {ok:false,msg:"ไม่พบงบนี้"}; budgets=budgets.filter(x=>x!==ex); saveBudgets(); return {ok:true,undo:{kind:"budget",key,prev}}; }
    if(ex){ ex.amount=a.amount; ex.name=a.name; ex.category=a.name||a.categories.join(" + "); ex.updatedAt=now; }
    else budgets.push({id:makeId(),kind,category:a.name||a.categories.join(" + "),categories:a.categories,name:a.name,amount:a.amount,period:"monthly",month:a.month,enabled:true,createdAt:now,updatedAt:now});
    saveBudgets(); return {ok:true,undo:{kind:"budget",key,prev}};
  }
  if(a.type==="sweep_buffer"){ const r=sweepBufferToSaving(a.month,a.amount,a.category); if(!r.ok) return {ok:false,msg:r.msg}; return {ok:true,undo:{kind:"sweep",month:a.month,entryId:r.entry.id,amount:r.amount}}; }
  if(a.type==="set_buffer"){ const o=__readBuffer(), prev=o.months[a.month]==null?null:o.months[a.month]; o.months[a.month]=a.amount; localStorage.setItem(BUFFER_KEY,JSON.stringify(o)); return {ok:true,undo:{kind:"buffer",month:a.month,prev}}; }
  if(a.type==="set_brain_targets"||a.type==="reset_brain_targets"){
    const o=__readTargets(), prev=o.months[a.month]||null;
    if(a.type==="set_brain_targets") o.months[a.month]={savingsRatePct:a.savingsRatePct,essentialMaxPct:a.essentialMaxPct,discretionaryMaxPct:a.discretionaryMaxPct}; else delete o.months[a.month];
    localStorage.setItem(BRAIN_TARGETS_KEY,JSON.stringify(o)); return {ok:true,undo:{kind:"targets",month:a.month,prev}};
  }
  if(a.type==="add_entry"){
    const acc=__aiAcct(a.account), r=commitEntry({type:a.entryType,category:a.category,accountId:acc?acc.id:UNASSIGNED_ACCOUNT_ID,amount:a.amount,date:a.date,note:a.note});
    if(!r||!r.ok) return {ok:false,msg:"บันทึกรายการไม่สำเร็จ"}; return {ok:true,undo:{kind:"entry",id:r.entry.id}};
  }
  if(a.type==="edit_entry"||a.type==="delete_entry"){
    const idx=entries.findIndex(x=>x.id===a.id); if(idx<0) return {ok:false,msg:"ไม่พบรายการนี้แล้ว"};
    const prev=JSON.parse(JSON.stringify(entries[idx]));
    if(a.type==="delete_entry") entries.splice(idx,1); else Object.assign(entries[idx],a.changes);
    saveEntries(); return {ok:true,undo:{kind:a.type,prev,idx}};
  }
  if(a.type==="add_recurring"){
    const acc=__aiAcct(a.account); if(!acc) return {ok:false,msg:"ยังไม่มีบัญชี"};
    const id=makeId(); recurringExpenses.push({id,name:a.name,amount:a.amount,category:a.category,accountId:acc.id,frequency:a.frequency,nextDueDate:a.nextDueDate,startDate:a.nextDueDate,endDate:"",note:"",status:"active",reservedItemId:"",lastPaidDate:""});
    saveRecurring(); return {ok:true,undo:{kind:"recurring",id}};
  }
  if(a.type==="set_emergency_target"){ const prev=emergencyFundConfig.targetMonths; emergencyFundConfig=normalizeEmergencyConfig({targetMonths:a.targetMonths,essentialCategories:emergencyFundConfig.essentialCategories}); saveEmergencyFundConfig(); return {ok:true,undo:{kind:"emergency",prev}}; }
  return {ok:false,msg:"ไม่รู้จักคำสั่ง"};
}
function undoAiAction(u){
  if(u.kind==="budget"){ budgets=budgets.filter(x=>!(x.enabled!==false&&budgetKey(x)===u.key)); if(u.prev) budgets.push(normalizeBudget(u.prev)); saveBudgets(); }
  else if(u.kind==="sweep"){ entries=entries.filter(e=>e.id!==u.entryId); saveEntries(); const o=__readBuffer(); o.swept=o.swept||{}; o.swept[u.month]=Math.max(0,Math.round((Number(o.swept[u.month]||0)-u.amount)*100)/100); localStorage.setItem(BUFFER_KEY,JSON.stringify(o)); }
  else if(u.kind==="buffer"){ const o=__readBuffer(); if(u.prev==null) delete o.months[u.month]; else o.months[u.month]=u.prev; localStorage.setItem(BUFFER_KEY,JSON.stringify(o)); }
  else if(u.kind==="targets"){ const o=__readTargets(); if(u.prev) o.months[u.month]=u.prev; else delete o.months[u.month]; localStorage.setItem(BRAIN_TARGETS_KEY,JSON.stringify(o)); }
  else if(u.kind==="entry"){ entries=entries.filter(e=>e.id!==u.id); saveEntries(); }
  else if(u.kind==="delete_entry"){ if(!entries.some(e=>e.id===u.prev.id)) entries.splice(Math.min(u.idx,entries.length),0,u.prev); saveEntries(); }
  else if(u.kind==="edit_entry"){ const i=entries.findIndex(e=>e.id===u.prev.id); if(i>=0) entries[i]=u.prev; saveEntries(); }
  else if(u.kind==="recurring"){ recurringExpenses=recurringExpenses.filter(r=>r.id!==u.id); saveRecurring(); }
  else if(u.kind==="emergency"){ emergencyFundConfig=normalizeEmergencyConfig({targetMonths:u.prev,essentialCategories:emergencyFundConfig.essentialCategories}); saveEmergencyFundConfig(); }
}
function renderAiActionCard(m,idx){
  if(!Array.isArray(m.actions)||!m.actions.length) return "";
  const st={pending:"",done:" ✓ ทำแล้ว",cancelled:" (ยกเลิก)",revised:" (ขอปรับ — พิมพ์ข้อเสนอของคุณด้านล่าง)",undone:" (ย้อนกลับแล้ว)",failed:" ✗ ทำไม่ได้"};
  const btn=(op,ai,t)=>`<button type="button" data-aiact="${op}" data-mi="${idx}" data-ai="${ai}" style="padding:9px 14px;min-height:38px;border-radius:999px;border:1px solid var(--line);background:var(--surface-2);color:var(--ink);font-size:13px;cursor:pointer;position:relative;z-index:3;pointer-events:auto;touch-action:manipulation;">${t}</button>`;
  return `<div style="margin:8px 0 0;padding:10px 12px;border:1px solid var(--line);border-radius:12px;background:var(--surface-2);font-size:12.5px;"><div style="font-weight:700;margin-bottom:6px;">🛠 สิ่งที่ AI เสนอให้ปรับ</div>${m.actions.map((a,ai)=>`<div style="padding:6px 0;border-top:1px solid var(--line);"><div>${escapeHtml(describeAiAction(a))}<span style="color:var(--faint)">${st[a.status]||""}</span>${a.msg?`<div style="color:var(--expense)">${escapeHtml(a.msg)}</div>`:""}</div><div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:8px;">${a.status==="pending"?btn("ok",ai,"✓ ยืนยัน")+btn("rev",ai,"💬 เสนอแก้")+btn("no",ai,"ยกเลิก"):a.status==="done"?btn("undo",ai,"↩ ย้อนกลับ"):""}</div></div>`).join("")}</div>`;
}
document.addEventListener("click",e=>{
  const b=e.target.closest&&e.target.closest("[data-aiact]"); if(!b) return;
  e.preventDefault(); e.stopPropagation();
  try{
    const op=b.dataset.aiact, mi=Number(b.dataset.mi), ai=Number(b.dataset.ai), cid=loadAllChats().activeId, h=loadAIChatHistory(), a=h[mi]&&h[mi].actions&&h[mi].actions[ai];
    if(!a){ showToast("ไม่พบข้อเสนอนี้แล้ว"); return; }
    if(op==="ok"&&a.status==="pending"){ const r=executeAiAction(a); if(r.ok){a.status="done";a.undo=r.undo;showToast("ปรับระบบแล้ว ✓");}else{a.status="failed";a.msg=r.msg;showToast(r.msg||"ทำไม่สำเร็จ");} }
    else if(op==="no"&&a.status==="pending"){ a.status="cancelled"; }
    else if(op==="rev"&&a.status==="pending"){ a.status="revised"; const inp=document.getElementById("aiChatInput"); if(inp){ inp.value="ขอปรับข้อเสนอนี้: "+describeAiAction(a)+" → อยากให้ปรับเป็น "; inp.focus(); try{inp.setSelectionRange(inp.value.length,inp.value.length);}catch(_){} } showToast("พิมพ์สิ่งที่อยากปรับแล้วกดส่งได้เลย"); }
    else if(op==="undo"&&a.status==="done"&&a.undo){ undoAiAction(a.undo); a.status="undone"; delete a.undo; showToast("ย้อนกลับแล้ว"); }
    saveAIChatHistoryForChat(cid,h);
    renderAiChatBubbles();
    try{ render(); }catch(err){ console.error("render after ai action",err); }
  }catch(err){ console.error("ai action click",err); showToast("เกิดข้อผิดพลาด: "+(err&&err.message||err)); }
},true);
function processAiReplyForMemory(text){
  { const acts=[]; const re=/^@@ACTION@@\s*(\{.*\})\s*$/gm; let m; while((m=re.exec(text||""))){ try{ const s=sanitizeAiAction(JSON.parse(m[1])); if(s) acts.push(s); }catch(e){} } __pendingActions=acts.slice(0,6); text=String(text||"").replace(/^@@ACTION@@.*$/gm,""); }
  const { cleaned, adds, dels } = extractMemoryDirectives(text);
  applyMemoryDirectives(adds, dels);
  return cleaned;
}

function renderAiChatBubbles(){
  const history = loadAIChatHistory();
  const body = document.getElementById("aiAnalystBody");
  if(!body) return;
  if(!history.length){
    body.innerHTML = `<div class="ai-chat-empty">เริ่มคุยกับที่ปรึกษาการเงิน AI ได้เลย ถามอะไรก็ได้เกี่ยวกับสถานะการเงินของคุณ หรือแค่อยากระบายก็ได้</div>`;
    return;
  }
  let lastModelIdx = -1;
  for(let i = history.length - 1; i >= 0; i--){ if(history[i].role === "model"){ lastModelIdx = i; break; } }

  body.innerHTML = history.map((m, idx) => {
    const isUser = m.role === "user";
    const bubbleCls = isUser ? "ai-chat-user" : "ai-chat-model";
    const inner = isUser ? escapeHtml(m.text) : simpleMarkdownToHtml(m.text);
    const icons={
      edit:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 16.5V20h3.5L18.8 8.7l-3.5-3.5L4 16.5Zm11.8-9.9 1.6-1.6a1 1 0 0 1 1.4 0l.2.2a1 1 0 0 1 0 1.4l-1.6 1.6-1.6-1.6Z"/></svg>',
      copy:'<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="8" width="11" height="11" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/></svg>',
      refresh:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 11a8 8 0 0 0-14.7-4L4 9"/><path d="M4 5v4h4"/><path d="M4 13a8 8 0 0 0 14.7 4L20 15"/><path d="M20 19v-4h-4"/></svg>'
    };
    const actions = isUser
      ? `<div class="ai-chat-actions"><button type="button" data-action="edit" data-idx="${idx}">${icons.edit}<span>แก้ไข</span></button></div>`
      : `<div class="ai-chat-actions"><button type="button" data-action="copy" data-idx="${idx}">${icons.copy}<span>คัดลอก</span></button>${idx === lastModelIdx ? `<button type="button" data-action="regenerate" data-idx="${idx}">${icons.refresh}<span>ตอบใหม่</span></button>` : ""}</div>`;
    return `<div class="ai-chat-msg role-${m.role}" data-idx="${idx}"><div class="ai-chat-bubble ${bubbleCls}">${inner}</div>${renderAiActionCard(m,idx)}${actions}</div>`;
  }).join("");
  body.scrollTop = body.scrollHeight;
  const activeChatId=loadAllChats().activeId;
  if(aiRequestState?.status==='pending' && aiRequestState.chatId===activeChatId){
    showAiChatTyping();
  }
}

// ตัวบอกสถานะ "AI กำลังพิมพ์" — เป็น DOM ชั่วคราว ไม่เก็บลงประวัติ
function showAiChatTyping(){
  const body = document.getElementById("aiAnalystBody");
  if(!body || document.getElementById("aiChatTypingIndicator")) return;
  const div = document.createElement("div");
  div.id = "aiChatTypingIndicator";
  div.className = "ai-chat-typing";
  div.innerHTML = "<span></span><span></span><span></span>";
  body.appendChild(div);
  body.scrollTop = body.scrollHeight;
}
function hideAiChatTyping(){
  const el = document.getElementById("aiChatTypingIndicator");
  if(el) el.remove();
}
// สลับปุ่มส่ง/ยกเลิกตามสถานะกำลังเรียก AI — เปลี่ยนเฉพาะ presentation ไม่แตะ request behavior
function syncAiChatSendBtnVisibility(){
  const btn = document.getElementById("aiChatSendBtn");
  const input = document.getElementById("aiChatInput");
  if(!btn) return;
  const hasText = !!input && input.value.trim().length > 0;
  const show = !!aiChatBusy || hasText;
  btn.classList.toggle("is-composer-empty", !show);
}

function setAiChatSendBtnState(isBusy){
  const btn = document.getElementById("aiChatSendBtn");
  if(!btn) return;
  if(isBusy){
    btn.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="7" y="7" width="10" height="10" rx="2"/></svg>';
    btn.classList.add("stop-btn");
    btn.title = "ยกเลิกการส่ง";
    btn.setAttribute("aria-label","ยกเลิกการส่ง");
  }else{
    btn.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 19V5"/><path d="m5 12 7-7 7 7"/></svg>';
    btn.classList.remove("stop-btn");
    btn.title = "ส่งข้อความ";
    btn.setAttribute("aria-label","ส่งข้อความ");
  }
  syncAiChatSendBtnVisibility();
}

function loadAIAdvisorInstruction(){ return (localStorage.getItem(AI_ADVISOR_INSTRUCTION_KEY) || "").trim().slice(0,2000); }
function saveAIAdvisorInstruction(value){ localStorage.setItem(AI_ADVISOR_INSTRUCTION_KEY, String(value || "").trim().slice(0,2000)); }

// ระบบพรอมป์เดียวกับ buildFinancialAnalystSystemPrompt แต่เปิดกว้างขึ้นสำหรับการคุยแบบต่อเนื่อง/พูดคุยทั่วไป ไม่ใช่แค่ถามตัวเลข
function buildAIChatSystemPrompt(snapshot, profile){
  const base = buildFinancialAnalystSystemPrompt(snapshot, profile);
  return base + "\n\n" +
    [
      "หมายเหตุเพิ่มเติมสำหรับโหมดแชทต่อเนื่องนี้:",
      "- นี่คือการสนทนาต่อเนื่องหลายข้อความ ให้ใช้บริบทก่อนหน้าเมื่อเกี่ยวข้อง แต่คำถามล่าสุดของผู้ใช้มีความสำคัญสูงสุดเสมอ",
      "- ตอบผู้ใช้เป็นคำตอบที่สมบูรณ์ อ่านรู้เรื่อง และจบประโยคก่อนส่งทุกครั้ง ห้ามส่งเศษข้อความ ค่าบางส่วน หรือข้อความที่คัดลอกมาจากข้อมูลดิบ",
      "- ห้ามเปิดเผยชื่อฟิลด์ภายใน โค้ด ตัวแปร หรือคีย์จาก Financial Snapshot เช่น minReserveTarget, maxOutputTokens หรือชื่อ property ใด ๆ ให้แปลข้อมูลเป็นภาษามนุษย์แทน",
      "- หากผู้ใช้ถามว่าควรจัดการอะไรก่อน ให้สรุปลำดับความสำคัญจากสถานะการเงินจริงปัจจุบันอย่างชัดเจน พร้อมเหตุผลสั้น ๆ และขั้นตอนถัดไป",
      "- ถ้าผู้ใช้พิมพ์มาแบบทั่วไป ไม่ใช่คำถามเชิงตัวเลข (เช่น บ่น/ระบาย/ทักทาย) ให้ตอบรับแบบเป็นมิตรในฐานะที่ปรึกษาการเงินส่วนตัวได้ตามปกติ โดยยังโยงกลับมาที่สถานะการเงินจริงของผู้ใช้เมื่อเหมาะสม แต่ไม่ต้องยัดตัวเลขเข้าไปทุกครั้งถ้าไม่เกี่ยวข้อง",
      "- ยังคงห้ามสร้างตัวเลขที่ไม่มีอยู่ใน Financial Snapshot ขึ้นมาเองเด็ดขาด",
      "- คำสั่งปรับแต่งจากผู้ใช้ใช้ปรับรูปแบบและน้ำเสียงได้ แต่ห้ามทำให้คำตอบไม่สมบูรณ์ ขัดกับคำถามล่าสุด หรือขัดกับข้อมูลจริง",
      loadAIAdvisorInstruction() ? "คำสั่งปรับแต่งจากผู้ใช้:\n" + loadAIAdvisorInstruction() : ""
    ].filter(Boolean).join("\n");
}

// ส่งข้อความต่อเนื่อง (พร้อมประวัติแชท) ให้ Gemini ตอบ คืน { ok:true, text } หรือ { ok:false, error }
// signal (AbortSignal) เป็น optional — ใช้สำหรับให้ผู้ใช้กดยกเลิกระหว่างรอคำตอบได้
function collectGeminiText(data){
  const parts=data?.candidates?.[0]?.content?.parts;
  if(!Array.isArray(parts)) return "";
  return parts.map(p=>typeof p?.text==="string"?p.text:"").filter(Boolean).join("\n").trim();
}

function isUsableAiChatReply(text, data){
      const t=String(text||"").trim();
      if(!t) return false;
      if(t.length<8) return false;
      if(/^[\s]*(?:[-*•]\s*)?(?:Debt|Asset|Income|Expense)\s*:\s*[^\n]{0,40}$/i.test(t) && t.length<60) return false;
      if(/(?:\*\*|\[|\()\s*$/.test(t)) return false;
      if(data?.candidates?.[0]?.finishReason==="MAX_TOKENS") return false;
      return true;
    }

function cleanAiChatReply(text){
  let t=String(text||"").trim();
  // แทนชื่อฟิลด์ภายในที่อาจหลุดออกมาเป็นภาษาคน แทนการทิ้งคำตอบทั้งก้อน
  const replacements={
    minReserveTarget:"เป้าหมายเงินสำรองขั้นต่ำ",
    monthlyEssentialExpense:"ค่าใช้จ่ายจำเป็นต่อเดือน",
    reserveCoverageMonths:"จำนวนเดือนที่เงินสำรองครอบคลุม",
    maxOutputTokens:"ความยาวคำตอบ"
  };
  Object.keys(replacements).forEach(k=>{
    t=t.replace(new RegExp('\\b'+k+'\\b','g'),replacements[k]);
  });
  return t.replace(/\n{3,}/g,'\n\n').trim();
}

function isSafeHistoryMessage(m){
  if(!m || !m.text || !String(m.text).trim()) return false;
  return m.role!=="model" || isUsableAiChatReply(m.text, null);
}

// ส่งข้อความต่อเนื่อง (พร้อมประวัติแชท) ให้ Gemini ตอบ และตรวจคำตอบที่ถูกตัด/เป็นข้อมูลดิบก่อนบันทึก
async function generateChatReply(priorHistory, userText, snapshot, profile, signal){
  if(getApiKeys().length === 0) return { ok:false, error:"missing_api_key" };
  if(!userText || !userText.trim()) return { ok:false, error:"empty_input" };

  const baseSystemPrompt = buildAIChatSystemPrompt(snapshot, profile);
  // ไม่ส่งคำตอบ AI เก่าที่เป็นเศษข้อความกลับเข้าไปเป็นบริบท เพราะจะทำให้ความเพี้ยนสะสม
  const recentHistory = priorHistory.filter(isSafeHistoryMessage).slice(-16);
  const contents = recentHistory
    .map(m => ({ role: m.role === "user" ? "user" : "model", parts:[{ text: String(m.text).trim() }] }))
    .concat([{ role:"user", parts:[{ text: userText.trim() }] }]);

  async function requestReply(extraInstruction){
    let res;
    try{
      res = await fetchGeminiWithRetry(
        (apiKey) => `https://generativelanguage.googleapis.com/v1beta/models/${AI_ADVISOR_MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents,
            systemInstruction: { parts: [{ text: baseSystemPrompt + (extraInstruction ? "\n\n" + extraInstruction : "") }] },
            generationConfig: { temperature: 0.25, maxOutputTokens: 4096 }
          }),
          signal
        },
        1
      );
    }catch(e){
      if(e && e.name === "AbortError") return { ok:false, error:"aborted" };
      return { ok:false, error:"network_error" };
    }

    if(!res.ok){
      let detail = "";
      try{ detail = (await res.text()).slice(0,300); }catch(e){}
      return { ok:false, error: res.status === 400 ? "invalid_api_key" : "api_error", detail, status: res.status };
    }

    let data;
    try{ data = await res.json(); }catch(e){ return { ok:false, error:"invalid_json" }; }
    const rawText = collectGeminiText(data);
    if(!rawText) return { ok:false, error:"empty_response" };
    const text = cleanAiChatReply(rawText);
    return { ok:true, text, data };
  }

  let result=await requestReply("");
  if(!result.ok) return result;
  if(isUsableAiChatReply(result.text,result.data)) return { ok:true, text:result.text };

  // ถ้ารอบแรกถูกตัดหรือคืนเศษข้อมูล ให้ลองใหม่ครั้งเดียวด้วยกติกาที่เข้มขึ้น แทนการบันทึกคำตอบเสียลงประวัติ
  result=await requestReply("คำตอบรอบก่อนมีความเสี่ยงเป็นเศษข้อความหรือถูกตัด ให้ตอบคำถามล่าสุดใหม่ทั้งหมดเป็นภาษาไทยแบบสมบูรณ์ ห้ามอ้างชื่อฟิลด์ภายใน และต้องจบคำตอบอย่างเป็นธรรมชาติ.");
  if(!result.ok) return result;
  if(!isUsableAiChatReply(result.text,result.data)) return { ok:false, error:"invalid_ai_response" };
  return { ok:true, text:result.text };
}

// แปลง Markdown พื้นฐาน (**ตัวหนา** และขึ้นบรรทัดใหม่) เป็น HTML อย่างปลอดภัย — escapeHtml() ก่อนเสมอ กัน XSS จากคำตอบ AI
function simpleMarkdownToHtml(text){
  const escaped = escapeHtml(text);
  return escaped
    .replace(/\*\*(.+?)\*\*/g, '<strong style="color:var(--accent1)">$1</strong>')
    .replace(/\n/g, "<br>");
}

// ===== AI Layer (Milestone 4): Proactive Financial Advisor =====

// --- Deterministic Rule Engine — Pure Local Function 100%, ไม่ยิง Network ---
function evaluateProactiveRules(snapshot, profile){
  const intelligence=getAdvisorIntelligence(snapshot,profile||{});
  const findings=[];
  // Adapter layer: retain the existing notification IDs/UI while the intelligence layer owns priority.
  intelligence.allFindings.forEach(f=>{
    let id='ADVISOR_'+f.id, severity=f.severity==='critical'?'critical':f.severity==='important'?'warning':'info';
    const d=f.data||{};
    if(f.id==='LIQUIDITY_FORECAST')id='D';
    else if(f.id==='MIN_BUFFER')id='A';
    else if(f.id==='OBLIGATION_SHORTFALL')id='C';
    else if(f.id==='SPENDING_ABOVE_BASELINE'||f.id==='CATEGORY_SPIKE')id='B';
    else if(f.id==='SAVINGS_PACE')id='SAVINGS_RATE_LOW';
    else if(f.id==='INCOME_BELOW_BASELINE')id='INCOME_DROP';
    else if(f.id==='STABLE')id='OK';
    findings.push({id,severity,data:d,priorityScore:f.priorityScore,evidence:f.evidence,action:f.action,stateKey:f.stateKey,state:f.state,confidence:f.confidence,urgency:f.urgency,impact:f.impact,insightType:f.id==='STABLE'?'progress':(severity==='critical'?'action':severity==='warning'?'warning':'insight'),sourceFindingId:f.id});
  });
  const top=findings.filter(f=>f.id!=='OK').sort((a,b)=>b.priorityScore-a.priorityScore).slice(0,3);
  const stable=findings.find(f=>f.id==='OK');
  return {severity:top[0]?.severity || 'positive',topRuleId:top[0]?.id || 'OK',findings:top.length?top:(stable?[stable]:[]),intelligence};
}

// --- Smart Cache & Invalidation ---
// dataFingerprint ครอบคลุมทั้งการให้ยืมเงิน (loans), การแก้ตัวเลข (edit), และการเพิ่ม/ลบรายการ
function getProactiveDataFingerprint(snapshot){
  // Include the actual financial state, not only array lengths/first entry.
  // This prevents stale Advisor/AI insight after editing an older repayment or loan.
  const compactEntries=entries.map(e=>({id:e.id,type:e.type,category:e.category,accountId:e.accountId,fromAccountId:e.fromAccountId,toAccountId:e.toAccountId,amount:e.amount,date:e.date,source:e.source,loanId:e.loanId,repaymentId:e.repaymentId,debtId:e.debtId,debtPrincipalImpact:e.debtPrincipalImpact}));
  const compactLoans=loans.map(l=>({id:l.id,amount:l.amount,accountId:l.accountId,adjustments:l.adjustments,repayments:l.repayments}));
  return `${JSON.stringify(compactEntries)}|${JSON.stringify(compactLoans)}|${JSON.stringify(debts)}|${JSON.stringify(budgets)}|${JSON.stringify(snapshot.budgetSummary)}|${JSON.stringify(snapshot.emergencyFund)}|${JSON.stringify(snapshot.financialBrain)}|${JSON.stringify(snapshot.behaviorSummary)}`;
}
function loadProactiveCache(){
  try{
    const raw = localStorage.getItem(AI_PROACTIVE_KEY);
    return raw ? JSON.parse(raw) : null;
  }catch(e){ return null; }
}
function saveProactiveCache(cache){
  try{ localStorage.setItem(AI_PROACTIVE_KEY, JSON.stringify(cache)); }catch(e){}
}

function proactiveRuleLabel(id){
  return { A:"เงินสำรองเสี่ยง", B:"ค่าใช้จ่ายพุ่งผิดปกติ", C:"ภาระใกล้ถึงกำหนด", D:"กระแสเงินสดตึงตัว", BUDGET_OVER:"งบประมาณเกิน", BUDGET_PACE_HIGH:"ใช้เงินเร็วเกินงบ", EMERGENCY_LOW:"เงินสำรองฉุกเฉินยังไม่พอ", EMERGENCY_HEALTHY:"เงินสำรองฉุกเฉินแข็งแรง", CASHFLOW_NEGATIVE:"กระแสเงินสดติดลบ", FORECAST_NEGATIVE:"เงินอาจไม่พอถึงสิ้นช่วง", HIGH_DISCRETIONARY_SPENDING:"รายจ่ายไม่จำเป็นสูง", SPENDING_SPIKE:"รายจ่ายพุ่งผิดปกติ", INCOME_DROP:"รายรับลดลง", SAVINGS_RATE_LOW:"อัตราออมต่ำ", FINANCIAL_STRENGTH:"สุขภาพการเงินแข็งแรง", OK:"ภาพรวมการเงิน" }[id] || "ภาพรวมการเงิน";
}

function buildProactiveSystemPrompt(evalResult, snapshot, profile){
  const hasProfile = hasAIProfileContent(profile);
  const lines = [
    "คุณคือ Personal Financial Manager ของแอป Vaultet ทำหน้าที่เขียนข้อความสั้นๆ แสดงบนการ์ด Financial Review หน้า Dashboard",
    "บุคลิก: calm, professional, practical, honest, context-aware, ไม่ตื่นตูมและไม่รายงานทุกอย่างที่เกิดขึ้น",
    "ถ้าสถานะการเงินปกติ ให้เงียบหรือสรุปสั้นๆ ว่าไม่มีเรื่องเร่งด่วน ไม่ต้องหาเรื่องมาเตือน",
    "ทำหน้าที่เหมือน Personal Financial Manager: ตีความ → อธิบาย → จัดลำดับ → เสนอ action ไม่ใช่รายงานทุก transaction",
    "แยก regular/non-loan income ออกจาก loan repayment เสมอ; loan repayment คือการเปลี่ยน receivable กลับเป็น cash ไม่ใช่ earned income",
    "ถ้าข้อมูลย้อนหลังไม่พอสำหรับ baseline ให้บอกว่าไม่พอ ห้ามสร้างคำว่า unusual จากข้อมูลน้อย",
    "ถ้าเป็น forecast ให้ระบุสมมติฐานและใช้คำว่า estimated/based on current pattern ไม่ใช่คำรับรอง",
    "เขียนแบบคนคุยกับเจ้าของเงินจริงๆ: สั้น กระชับ เป็นธรรมชาติ ไม่เป็นภาษารายงานบริษัท; โดยทั่วไป 1-3 ประโยค และใช้เฉพาะตัวเลขที่จำเป็น",
    "ถ้าต้องแนะนำ ให้พูดสิ่งที่ควรทำต่อแบบ practical ไม่สั่งสอน ไม่ตื่นตูม; ถ้าไม่มีอะไรสำคัญ ให้บอกสั้นๆ ว่าทุกอย่างยังโอเค",
    "ใช้ **ตัวหนา** ล้อมรอบตัวเลขเงินหรือหมวดหมู่/รายการที่สำคัญที่สุดที่ต้องการเน้น",
    "อ้างอิงเฉพาะตัวเลขจาก Findings/Snapshot ด้านล่างเท่านั้น ห้ามคำนวณหรือสร้างตัวเลขขึ้นมาเอง",
    `เรื่องที่สำคัญที่สุดตอนนี้คือ: ${proactiveRuleLabel(evalResult.topRuleId)} (severity: ${evalResult.severity})`,
    evalResult.severity === "positive"
      ? "ไม่มีความเสี่ยงเร่งด่วน — ให้ชมเชยสั้นๆ หรือสรุปความคืบหน้าไปเป้าหมาย/สถานะการเงินโดยรวมในเชิงบวก"
      : "ให้เตือนเฉพาะเรื่องที่สำคัญที่สุด (ตาม Findings อันดับแรก) อย่างตรงไปตรงมา ไม่ต้องพูดถึงทุกเรื่องพร้อมกัน",
  ];
  if(hasProfile){
    lines.push(
      "",
      profile.nickname ? `- ถ้าเหมาะสม เรียกผู้ใช้ว่า "${profile.nickname}" ในข้อความได้` : null,
      "User Profile:",
      JSON.stringify(profile)
    );
  }
  lines.push("", "Advisor Intelligence (Top priorities + evidence + action):", JSON.stringify(evalResult.intelligence||{}));
  lines.push("", "Findings (เรียงตามความสำคัญแล้ว):", JSON.stringify(evalResult.findings));
  lines.push("", "Financial Snapshot:", JSON.stringify(snapshot));
  lines.push("", "Financial Brain Context:", JSON.stringify(buildFinancialBrainContext(snapshot, profile)));
  return lines.filter(l => l !== null).join("\n");
}

// ส่ง Findings + Snapshot + Profile ให้ Gemini เรียบเรียงเป็นข้อความ คืน { ok:true, text } หรือ { ok:false, error }
async function generateProactiveInsight(evalResult, snapshot, profile){
  if(getApiKeys().length === 0) return { ok:false, error:"missing_api_key" };

  const systemPrompt = buildProactiveSystemPrompt(evalResult, snapshot, profile);

  let res;
  try{
    res = await fetchGeminiWithRetry(
      (apiKey) => `https://generativelanguage.googleapis.com/v1beta/models/${AI_TRANSACTION_MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: "สร้างข้อความสำหรับการ์ด Insight ตาม system prompt ด้านบน" }] }],
          systemInstruction: { parts: [{ text: systemPrompt }] },
          generationConfig: { maxOutputTokens: 4096 }
        })
      }
    );
  }catch(e){
    return { ok:false, error:"network_error" };
  }

  if(!res.ok){
    let detail = "";
    try{ detail = (await res.text()).slice(0,300); }catch(e){}
    return { ok:false, error: res.status === 400 ? "invalid_api_key" : "api_error", detail, status: res.status };
  }

  let data;
  try{ data = await res.json(); }catch(e){ return { ok:false, error:"invalid_json" }; }

  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if(!text) return { ok:false, error:"empty_response" };

  return { ok:true, text };
}

// ===== Vaultet Notification Center: functional local engine =====
const VAULTET_NOTIF_KEY="vaultet_notifications_v1", VAULTET_NOTIF_SETTINGS_KEY="vaultet_notification_settings_v1", VAULTET_NOTIF_STATE_KEY="vaultet_notification_states_v2", VAULTET_ADVISOR_ACTIVE_KEY="vaultet_advisor_active_v1";
const DEFAULT_NOTIF_SETTINGS=Object.freeze({enabled:true,positive:true,budget:true,emergency:true,forecast:true,obligation:true,behavior:true,quiet:true});
const NOTIF_SETTING_KEYS=Object.keys(DEFAULT_NOTIF_SETTINGS);
function normalizeVaultetNotifSettings(raw){const out={...DEFAULT_NOTIF_SETTINGS};if(raw&&typeof raw==="object"&&!Array.isArray(raw))NOTIF_SETTING_KEYS.forEach(k=>{if(Object.prototype.hasOwnProperty.call(raw,k))out[k]=raw[k]===true});return out;}
function loadVaultetNotifSettings(){try{const raw=localStorage.getItem(VAULTET_NOTIF_SETTINGS_KEY);return normalizeVaultetNotifSettings(raw?JSON.parse(raw):null)}catch(e){return {...DEFAULT_NOTIF_SETTINGS}}}
function saveVaultetNotifSettings(value){const normalized=normalizeVaultetNotifSettings(value);try{localStorage.setItem(VAULTET_NOTIF_SETTINGS_KEY,JSON.stringify(normalized));return true}catch(e){return false}}
function syncVaultetNotifControls(){const s=loadVaultetNotifSettings();NOTIF_SETTING_KEYS.forEach(k=>{const el=document.getElementById({enabled:"notifEnabledInput",positive:"notifPositiveInput",budget:"notifBudgetInput",emergency:"notifEmergencyInput",forecast:"notifForecastInput",obligation:"notifObligationInput",behavior:"notifBehaviorInput",quiet:"notifQuietInput"}[k]);if(el)el.checked=s[k]});return s;}
function loadVaultetNotifications(){try{const a=JSON.parse(localStorage.getItem(VAULTET_NOTIF_KEY)||"[]");return Array.isArray(a)?a:[]}catch(e){return []}}
function saveVaultetNotifications(a){try{localStorage.setItem(VAULTET_NOTIF_KEY,JSON.stringify(a.slice(0,80)))}catch(e){}}
function loadVaultetNotifStates(){try{const x=JSON.parse(localStorage.getItem(VAULTET_NOTIF_STATE_KEY)||"{}");return x&&typeof x==="object"&&!Array.isArray(x)?x:{}}catch(e){return {}}}
function saveVaultetNotifStates(x){try{localStorage.setItem(VAULTET_NOTIF_STATE_KEY,JSON.stringify(x))}catch(e){}}
function loadVaultetAdvisorActive(){try{const x=JSON.parse(localStorage.getItem(VAULTET_ADVISOR_ACTIVE_KEY)||"[]");return Array.isArray(x)?x:[]}catch(e){return []}}
function compactVaultetNotificationHistory(){try{const a=loadVaultetNotifications(),seen=new Set(),out=[];for(const n of a){const k=`${n.day||""}|${n.type||""}|${n.title||""}|${n.body||""}`;if(seen.has(k))continue;seen.add(k);out.push(n);if(out.length>=40)break;}if(out.length!==a.length)saveVaultetNotifications(out);}catch(e){}}
function migrateVaultetNotificationHistory(){
  const key="vaultet_notification_history_v3_migrated";
  try{if(localStorage.getItem(key)==="1")return;
    const a=loadVaultetNotifications(),seen=new Set(),out=[];
    for(const n of a){
      // New philosophy: historical notifications are limited to actionable critical events.
      if(n.severity!=="critical")continue;
      const k=n.fingerprint||`${n.day||""}|${n.type||""}|${n.title||""}|${n.body||""}`;
      if(seen.has(k))continue; seen.add(k); out.push(n); if(out.length>=40)break;
    }
    saveVaultetNotifications(out); localStorage.setItem(key,"1");
  }catch(e){}
}

function saveVaultetAdvisorActive(x){try{localStorage.setItem(VAULTET_ADVISOR_ACTIVE_KEY,JSON.stringify(x.slice(0,3)))}catch(e){}}
function notifTypeEnabled(id,s){if(["EMERGENCY_LOW","A"].includes(id))return s.emergency;if(["BUDGET_OVER","BUDGET_PACE_HIGH"].includes(id))return s.budget;if(["D","CASHFLOW_NEGATIVE","FORECAST_NEGATIVE"].includes(id))return s.forecast;if(["C"].includes(id))return s.obligation;if(["B","SPENDING_SPIKE","INCOME_DROP"].includes(id))return s.behavior;if(["EMERGENCY_HEALTHY","FINANCIAL_STRENGTH"].includes(id))return s.positive;return false;}
function notificationFromFinding(f){const d=f.data||{},money=n=>`฿${fmt(Math.abs(Number(n)||0))}`;const map={BUDGET_OVER:["งบประมาณเกิน",`หมวด ${d.category||""} ใช้ไป ${money(d.spent)} จากงบ ${money(d.budget)}`],BUDGET_PACE_HIGH:["ใช้เงินเร็วเกินงบ",`หมวด ${d.category||""} มีแนวโน้มเกินงบในเดือนนี้`],EMERGENCY_LOW:["เงินสำรองฉุกเฉินต่ำ",`เงินสำรอง ${money(d.currentAvailableReserve)} ยังต่ำกว่าเป้าหมาย ${money(d.recommendedEmergencyFund)}`],A:["เงินสดต่ำกว่าเงินสำรองขั้นต่ำ",`เงินที่ใช้ได้ ${money(d.available)} ต่ำกว่าเป้าหมาย ${money(d.target)}`],D:["กระแสเงินสดตึงตัว",`คาดการณ์เงินใช้ได้ ${money(d.forecastAvailable)} — ควรเช็กภาระที่กำลังจะถึง`],C:["มีภาระสำคัญใกล้ถึงกำหนด",`${d.name||"รายการ"} ${money(d.amount)} ยังกันเงินไม่พอ`],CASHFLOW_NEGATIVE:["กระแสเงินสดติดลบ","รายจ่ายมากกว่ารายรับในช่วงปัจจุบัน"],FORECAST_NEGATIVE:["เงินอาจไม่พอถึงสิ้นช่วง","Forecast ส่งสัญญาณว่าเงินใช้ได้อาจติดลบ"],B:["ค่าใช้จ่ายหมวดหนึ่งพุ่งผิดปกติ",`หมวด ${d.category||"ไม่ระบุ"} เพิ่มขึ้นเป็น ${money(d.thisMonthAmt)} จาก ${money(d.lastMonthAmt)} เดือนก่อน`],SPENDING_SPIKE:["รายจ่ายพุ่งผิดปกติ","มีหมวดรายจ่ายที่เพิ่มขึ้นมากกว่าปกติ"],INCOME_DROP:["รายรับลดลงอย่างมีนัยสำคัญ","รายรับช่วงปัจจุบันลดลงจากช่วงก่อนหน้า"],EMERGENCY_HEALTHY:["เงินสำรองถึงเป้าหมาย","เงินสำรองของคุณอยู่ในระดับที่ตั้งไว้แล้ว"],FINANCIAL_STRENGTH:["สุขภาพการเงินแข็งแรง","ภาพรวมการเงินอยู่ในสถานะที่ดี"]};const v=map[f.id]||[proactiveRuleLabel(f.id),"มีประเด็นการเงินที่ควรตรวจสอบ"];return{title:v[0],body:v[1],icon:f.severity==="critical"?"🚨":f.severity==="warning"?"⚠️":"💡"};}
function notificationIdentity(f){
  const d=f.data||{};
  const target=d.category||d.name||d.loanId||d.debtId||d.id||f.stateKey||"global";
  let state=f.state||"active";
  if(f.id==="A")state=d.available<d.target?"critical-low":"warning-near";
  else if(f.id==="C")state=`${d.status||"upcoming"}|${d.nextDueDate||""}|${Math.round(Number(d.shortfall||0)/100)*100}`;
  else if(f.id==="B")state=`${Math.round(Number(d.pct||0)/10)*10}`;
  else if(f.id==="D")state=`${Math.round(Number(d.forecastAvailable||0)/500)*500}`;
  return {key:`${f.id}|${target}`,state};
}
function advisorPriorityScore(f){
  const base={critical:100,warning:60,positive:10}[f.severity]||0;
  const urgency={D:24,FORECAST_NEGATIVE:24,C:22,A:20,EMERGENCY_LOW:18,CASHFLOW_NEGATIVE:16,BUDGET_OVER:10,BUDGET_PACE_HIGH:7,B:6,SPENDING_SPIKE:6,INCOME_DROP:5,EMERGENCY_HEALTHY:1}[f.id]||0;
  const d=f.data||{};
  let impact=0;
  if(Number(d.shortfall)>0) impact=Math.min(15,Number(d.shortfall)/1000);
  if(Number(d.diff)>0) impact=Math.min(10,Number(d.diff)/1000);
  if(Number(d.forecastAvailable)<0) impact=Math.min(15,Math.abs(Number(d.forecastAvailable))/1000);
  return base+urgency+impact;
}
function advisorNotificationFindings(evalResult){
  const allowed=new Set(["A","B","BUDGET_OVER","BUDGET_PACE_HIGH","EMERGENCY_LOW","D","C","CASHFLOW_NEGATIVE","FORECAST_NEGATIVE","SPENDING_SPIKE","INCOME_DROP","EMERGENCY_HEALTHY"]);
  const seen=new Set(),out=[];
  const rawFindings=(evalResult.findings||[]);
  const hasForecastRisk=rawFindings.some(f=>f.id==="D"&&f.severity==="critical");
  rawFindings.forEach(f=>{
    if(hasForecastRisk && ["CASHFLOW_NEGATIVE","FORECAST_NEGATIVE"].includes(f.id)) return;
    if(!allowed.has(f.id))return;
    const ident=notificationIdentity(f), dedupeKey=ident.key+"|"+ident.state;
    if(seen.has(dedupeKey))return; seen.add(dedupeKey);
    out.push({...f,_identity:ident,priorityScore:advisorPriorityScore(f)});
  });
  return out.sort((a,b)=>b.priorityScore-a.priorityScore);
}
const VAULTET_NOTIFICATION_COOLDOWN_MS = 24*60*60*1000;
function addVaultetNotification(f,states){
  const s=loadVaultetNotifSettings();
  // Notification is reserved for genuinely actionable critical events.
  // Warnings/insights remain visible in Advisor but do not create notification history.
  if(!s.enabled||!notifTypeEnabled(f.id,s)||f.severity!=="critical")return false;
  const identity=f._identity||notificationIdentity(f), key=identity.key, prev=states[key];
  const now=Date.now();
  const previousSeverity=prev?.severity||"";
  const escalated=previousSeverity!=="critical";
  // Active + unchanged = dedupe. Once the issue is resolved, a later re-entry is a real state transition
  // and is allowed to notify again; this prevents the 24h cooldown from hiding a genuinely recurring problem.
  if(prev && prev.state===identity.state && !prev.resolvedAt)return false;
  if(prev?.resolvedAt && prev.state===identity.state && !escalated) { /* resolved → re-entered: allow one new notification */ }
  const h=new Date().getHours();
  if(s.quiet&&h>=23&&h<7){states[key]={state:identity.state,severity:f.severity,lastSeen:todayISO(),resolvedAt:null};return false;}
  const a=loadVaultetNotifications(),m=notificationFromFinding(f);
  a.unshift({id:makeId(),day:todayISO(),createdAt:new Date().toISOString(),fingerprint:key+"|"+identity.state,type:f.id,severity:f.severity,title:m.title,body:m.body,icon:m.icon,read:false,priority:f.priorityScore||f.severity});
  saveVaultetNotifications(a);
  states[key]={state:identity.state,severity:f.severity,lastSeen:todayISO(),lastNotifiedAt:new Date(now).toISOString(),resolvedAt:null};
  return true;
}
function renderVaultetNotifications(){
  const a=loadVaultetNotifications(),unread=a.filter(n=>!n.read).length,badge=document.getElementById("notificationUnreadBadge"),dot=document.getElementById("uxBellDot");
  if(badge){badge.textContent=unread;badge.style.display=unread?"flex":"none"}if(dot)dot.style.display=unread?"block":"none";
  const draw=(arr,target)=>{if(!target)return;target.innerHTML=arr.length?arr.map(n=>`<div class="notification-item ${n.read?"":"unread"}" data-notif-id="${escapeHtml(n.id)}"><div class="notification-icon">${n.icon||"🔔"}</div><div class="notification-content"><div class="notification-item-title">${escapeHtml(n.title)}</div><div class="notification-item-body">${escapeHtml(n.body)}</div></div><div class="notification-time">${escapeHtml((n.day||todayISO())===todayISO() ? (n.createdAt ? new Date(n.createdAt).toLocaleTimeString("th-TH",{hour:"2-digit",minute:"2-digit"}) : "ตอนนี้") : dayLabel(n.day||todayISO()))}</div></div>`).join(""):"<div class=\"notification-empty\">ตอนนี้ยังไม่มีเรื่องสำคัญที่ต้องแจ้ง 🎉</div>";target.querySelectorAll("[data-notif-id]").forEach(el=>el.onclick=()=>{const x=loadVaultetNotifications(),n=x.find(v=>v.id===el.dataset.notifId);if(n)n.read=true;saveVaultetNotifications(x);renderVaultetNotifications()})};
  const active=loadVaultetAdvisorActive();
  const current=active.slice(0,3);
  const dashboardTarget=document.getElementById("notificationPreviewList");
  if(dashboardTarget && window.vaultetRenderAdvisorPreview){ window.vaultetRenderAdvisorPreview(current); }
  draw(a,document.getElementById("notificationFullList"));const countEl=document.getElementById("notificationHistoryCount");if(countEl)countEl.textContent=String(a.length);const sub=document.getElementById("notificationDashboardSub");if(sub)sub.textContent=current.length?`คัดมา ${current.length} เรื่องที่สำคัญที่สุด` : "ตอนนี้ไม่มีเรื่องสำคัญ — Insight อื่นอยู่ใน Advisor";
}
function toggleNotificationSettings(){const panel=document.getElementById("notificationSettingsPanel"),btn=document.getElementById("notificationSettingsToggle");if(!panel||!btn)return;const open=panel.hidden;panel.hidden=!open;btn.setAttribute("aria-expanded",String(open));if(open)setTimeout(()=>panel.querySelector("input,button")?.focus({preventScroll:true}),0);}
function openVaultetNotificationCenter(){syncVaultetNotifControls();renderVaultetNotifications();document.getElementById("notificationOverlay")?.classList.add("open")}
function closeVaultetNotificationCenter(){document.getElementById("notificationOverlay")?.classList.remove("open")}
function renderAdvisorReviewCard(snapshot,profile){
  const card=document.getElementById('notificationDashboardCard'); if(!card)return;
  const result=getAdvisorIntelligence(snapshot,profile||{});
  const current=result.topPriorities||[];
  const sub=document.getElementById('notificationDashboardSub');
  if(sub)sub.textContent=current.length?`คัดมา ${current.length} เรื่องที่มีผลกระทบสูงสุด`:'ตอนนี้ไม่มีเรื่องสำคัญที่ต้องลงมือทำ';
  const target=document.getElementById('notificationPreviewList');
  if(!target)return;
  if(!current.length){target.innerHTML='<div class="notification-empty">ตอนนี้ทุกอย่างค่อนข้างเสถียร — ไม่มีเรื่องที่ต้องจัดการเป็นพิเศษ 🎉</div>';return;}
  if(window.vaultetRenderAdvisorPreview) window.vaultetRenderAdvisorPreview(current.map(f=>({type:f.id,severity:f.severity,evidence:f.evidence||[],action:f.action||'',data:f.data||{}})));
}
function checkVaultetNotifications(){try{
  const snap=buildFinancialSnapshot();
  const result=evaluateProactiveRules(snap,loadAIProfile());
  const current=advisorNotificationFindings(result),states=loadVaultetNotifStates(),activeKeys=new Set(current.map(f=>f._identity.key));
  const nowIso=new Date().toISOString();
  Object.keys(states).forEach(k=>{
    if(!activeKeys.has(k) && !states[k].resolvedAt) states[k]={...states[k],resolvedAt:nowIso};
  });
  current.forEach(f=>addVaultetNotification(f,states));
  saveVaultetNotifStates(states);
  const activeForAdvisor=(result.intelligence?.topPriorities||[]).slice(0,3).map(f=>{
    const m=notificationFromFinding(f);
    const title=f.id==='CATEGORY_SPIKE'?`หมวด ${f.data?.category||''} สูงกว่าปกติ`:f.id==='SPENDING_ABOVE_BASELINE'?'รายจ่ายรวมสูงกว่าระดับปกติ':f.id==='SAVINGS_PACE'?'จังหวะการออมช้าลง':f.id==='INCOME_BELOW_BASELINE'?'รายรับต่ำกว่าระดับปกติ':m.title;
    return{type:f.id,severity:f.severity,title,body:f.action||m.body,icon:f.severity==='critical'?'🚨':'⚠️',priority:f.priorityScore,state:f.state,confidence:f.confidence,evidence:f.evidence||[],action:f.action||'',data:f.data||{}};
  });
  saveVaultetAdvisorActive(activeForAdvisor);
  renderAdvisorReviewCard(snap,loadAIProfile());
}catch(e){}renderVaultetNotifications();}
function initVaultetNotifications(){
  migrateVaultetNotificationHistory();
  syncVaultetNotifControls();
  const ids={enabled:"notifEnabledInput",positive:"notifPositiveInput",budget:"notifBudgetInput",emergency:"notifEmergencyInput",forecast:"notifForecastInput",obligation:"notifObligationInput",behavior:"notifBehaviorInput",quiet:"notifQuietInput"};
  Object.entries(ids).forEach(([key,id])=>{const el=document.getElementById(id);if(!el||el.dataset.vaultetBound==="1")return;el.dataset.vaultetBound="1";el.addEventListener("change",()=>{const current=loadVaultetNotifSettings();current[key]=!!el.checked;saveVaultetNotifSettings(current);syncVaultetNotifControls();checkVaultetNotifications();});});
  document.getElementById("closeNotificationBtn")?.addEventListener("click",closeVaultetNotificationCenter);document.getElementById("notificationOverlay")?.addEventListener("click",e=>{if(e.target.id==="notificationOverlay")closeVaultetNotificationCenter()});document.getElementById("markNotificationsReadBtn")?.addEventListener("click",()=>{const a=loadVaultetNotifications();a.forEach(n=>n.read=true);saveVaultetNotifications(a);renderVaultetNotifications();showToast("อ่านการแจ้งเตือนทั้งหมดแล้ว")});document.getElementById("clearNotificationsBtn")?.addEventListener("click",()=>{saveVaultetNotifications([]);renderVaultetNotifications();showToast("ล้างประวัติการแจ้งเตือนแล้ว")});
  document.getElementById("requestNotificationBtn")?.addEventListener("click",async()=>{if(!("Notification"in window)){showToast("เบราว์เซอร์นี้ไม่รองรับการแจ้งเตือน");return}try{const p=await Notification.requestPermission();document.getElementById("notificationPermissionBox").textContent=p==="granted"?"เปิดการแจ้งเตือนบนเครื่องแล้ว":"ยังไม่ได้อนุญาตการแจ้งเตือนบนเครื่อง"}catch(e){showToast("เปิดการแจ้งเตือนไม่สำเร็จ")} });
  compactVaultetNotificationHistory(); window.addEventListener("storage",e=>{if(e.key===VAULTET_NOTIF_SETTINGS_KEY){syncVaultetNotifControls();renderVaultetNotifications();}});renderVaultetNotifications();setTimeout(checkVaultetNotifications,300);setInterval(checkVaultetNotifications,300000);
}
setTimeout(initVaultetNotifications,0);
window.addEventListener("storage",e=>{if(e.key===VAULTET_NOTIF_SETTINGS_KEY){syncVaultetNotifControls();renderVaultetNotifications()}});

// --- UI: #aiProactiveCard บน Dashboard ---
const PROACTIVE_SEVERITY_META = {
  critical: { icon:"🚨", color:"var(--expense)" },
  warning:  { icon:"⚠️", color:"var(--transfer)" },
  positive: { icon:"💡", color:"var(--saving)" },
};
let proactiveCardBusy = false;
// ===== Persistent AI Chat: state สำหรับ typing indicator / ยกเลิกการเรียก / แก้ไขข้อความ =====
let aiChatBusy = false;
let aiChatAbortController = null;
let aiChatEditingIndex = null; // ถ้าไม่ใช่ null แปลว่ากำลังแก้ไขข้อความเดิม index นี้อยู่ — ตอนส่งใหม่จะตัดประวัติตั้งแต่จุดนี้ก่อน
// Request state อยู่ระดับ app/session ไม่ผูกกับหน้า Advisor เพื่อให้ loading อยู่ต่อเมื่อเปลี่ยนหน้า
let aiRequestState = null;
function getChatById(id){
  const data=loadAllChats();
  return data.chats.find(c=>c.id===id)||null;
}
function saveAIChatHistoryForChat(chatId, history){
  if(!chatId) return false;
  const data=loadAllChats();
  const chat=data.chats.find(c=>c.id===chatId);
  if(!chat) return false;
  chat.messages=history.slice(-40);
  chat.updatedAt=new Date().toISOString();
  if(!chat.title) chat.title=chatTitleFrom(chat.messages);
  saveAllChats(data);
  return true;
}
function isAiRequestCurrent(requestId){ return !!(aiRequestState && aiRequestState.id===requestId && aiRequestState.status==='pending'); }
function isAdvisorPageActive(){ return document.body.classList.contains('ux-chat-active'); }

function renderProactiveCard(severity, text, state, errorInfo){
  const card = document.getElementById("aiProactiveCard");
  if(!card) return;
  const meta = PROACTIVE_SEVERITY_META[severity] || PROACTIVE_SEVERITY_META.positive;
  card.style.display = "block";
  card.style.borderColor = meta.color;
  document.getElementById("aiProactiveIcon").textContent = meta.icon;

  const bodyEl = document.getElementById("aiProactiveBody");
  if(state === "loading"){
    bodyEl.innerHTML = `<span style="color:var(--faint)">กำลังวิเคราะห์สถานะการเงิน...</span>`;
  }else if(state === "needsApiKey"){
    bodyEl.innerHTML = `<span style="color:var(--faint)">ตั้งค่า API Key (⚙️) เพื่อเปิดใช้งานการวิเคราะห์อัตโนมัติ</span>`;
  }else if(state === "error" && !text){
    const label = (errorInfo && AI_ERROR_MESSAGES[errorInfo.error]) || "เรียก AI ไม่สำเร็จ";
    const codeLine = errorInfo && errorInfo.error ? `<br><span style="font-size:11px;opacity:0.65;">โค้ด: ${escapeHtml(errorInfo.error)}${errorInfo.status ? " (HTTP " + errorInfo.status + ")" : ""}</span>` : "";
    const detailLine = errorInfo && errorInfo.detail ? `<br><span style="font-size:11px;opacity:0.65;">${escapeHtml(errorInfo.detail)}</span>` : "";
    bodyEl.innerHTML = `<span style="color:var(--faint)">${label} — กด 🔄 เพื่อลองใหม่${codeLine}${detailLine}</span>`;
  }else if(text){
    bodyEl.innerHTML = simpleMarkdownToHtml(text);
  }else{
    card.style.display = "none";
  }
}

// เรียกประเมิน + สร้างการ์ดใหม่เฉพาะเมื่อจำเป็น (cache miss หรือ force=true)
async function refreshProactiveCard(force){
  if(proactiveCardBusy) return;
  const card = document.getElementById("aiProactiveCard");
  if(!card) return;

  const snapshot = buildFinancialSnapshot();
  const profile = loadAIProfile();
  const evalResult = evaluateProactiveRules(snapshot, profile);
  const fingerprint = getProactiveDataFingerprint(snapshot) + '|' + JSON.stringify(evalResult.intelligence?.topPriorities||[]);

  const cache = loadProactiveCache();
  // Milestone 4 fix: ต้องเช็ควันที่ด้วยเสมอ — ข้ามวันใหม่ต้องประเมิน/ดึง Insight ใหม่ทุกครั้ง แม้ fingerprint จะเหมือนเดิม
  const cacheValid = !!cache && cache.generatedAt === todayISO() && cache.fingerprint === fingerprint
    && cache.topRuleId === evalResult.topRuleId && cache.severity === evalResult.severity;

  if(cacheValid && !force){
    renderProactiveCard(evalResult.severity, cache.text);
    return;
  }

  if(getApiKeys().length === 0){
    renderProactiveCard(evalResult.severity, null, "needsApiKey");
    return;
  }

  proactiveCardBusy = true;
  renderProactiveCard(evalResult.severity, null, "loading");

  const result = await generateProactiveInsight(evalResult, snapshot, profile);
  proactiveCardBusy = false;

  if(!result.ok){
    // เรียก AI ไม่สำเร็จ — ถ้ามีแคชเก่าอยู่ (แม้ fingerprint จะเปลี่ยนไปแล้ว) ให้โชว์ไว้ก่อนดีกว่าไม่มีอะไรเลย
    renderProactiveCard(evalResult.severity, cache ? cache.text : null, "error", { error: result.error, detail: result.detail, status: result.status });
    return;
  }

  saveProactiveCache({
    fingerprint, topRuleId: evalResult.topRuleId, severity: evalResult.severity,
    text: result.text, generatedAt: todayISO()
  });
  renderProactiveCard(evalResult.severity, result.text);
}

document.getElementById("aiProactiveRefreshBtn").addEventListener("click", (e) => {
  e.stopPropagation();
  refreshProactiveCard(true);
});

// ===== AI Layer (Milestone 1): NL Input UI (Bottom Sheet) =====
function closeAiInputSheet(){
  document.getElementById("aiInputOverlay").classList.remove("open");
}
document.getElementById("aiFabBtn").addEventListener("click", () => {
  if(getApiKeys().length === 0){
    showToast("ยังไม่ได้ตั้งค่า API Key — กดไอคอน ⚙️ เพื่อตั้งค่าก่อน");
    return;
  }
  document.getElementById("aiInputText").value = "";
  document.getElementById("aiInputError").style.display = "none";
  document.getElementById("aiInputOverlay").classList.add("open");
  document.getElementById("aiInputText").focus();
});
document.getElementById("closeAiInputBtn").addEventListener("click", closeAiInputSheet);
document.getElementById("aiInputOverlay").addEventListener("click", closeAiInputSheet);

const AI_ERROR_MESSAGES = {
  missing_api_key: "ยังไม่ได้ตั้งค่า API Key",
  empty_input: "พิมพ์ข้อความก่อน",
  invalid_api_key: "API Key ไม่ถูกต้อง หรือหมดสิทธิ์ใช้งาน",
  api_error: "เรียก AI ไม่สำเร็จ ลองใหม่อีกครั้ง",
  empty_response: "AI ไม่ตอบกลับข้อมูล ลองพิมพ์ใหม่อีกครั้ง",
  invalid_ai_response: "AI ตอบกลับมาไม่สมบูรณ์ ลองพิมพ์ใหม่อีกครั้ง",
  invalid_json: "แปลผลลัพธ์จาก AI ไม่สำเร็จ ลองพิมพ์ใหม่อีกครั้ง",
  network_error: "เชื่อมต่อไม่สำเร็จ ตรวจสอบอินเทอร์เน็ต",
  aborted: "ยกเลิกแล้ว"
};
// ข้อความ error ที่เป็นมิตร — เคส HTTP 429 อธิบายละเอียดกว่าเดิม เพราะเป็นได้ทั้ง 2 แบบ:
// (1) โควต้าฟรีต่อนาทีเต็มชั่วคราว — ระบบ retry อัตโนมัติไปแล้วแต่ยังไม่ผ่าน รอไม่นานก็หาย
// (2) โควต้าฟรีต่อวันเต็ม (ใช้ถี่ทั้งวัน) — retry ไม่ช่วย ต้องรอข้ามวันหรือเช็ค Google AI Studio
function aiErrorLabel(result){
  if(result && result.status === 429){
    return "Gemini แจ้งว่าเรียกถี่/บ่อยเกินไป (โควต้าฟรีเต็มชั่วคราว) — ระบบลองซ้ำอัตโนมัติให้แล้วแต่ยังไม่ผ่าน ลองรอสัก 1-2 นาทีแล้วกดใหม่ ถ้ารอนานแล้วยังไม่หาย อาจเป็นโควต้ารายวันเต็ม (ต้องรอข้ามวัน หรือเช็คโควต้า Key ที่ aistudio.google.com)";
  }
  if(result && result.status === 503) return "เซิร์ฟเวอร์ Gemini ยุ่งอยู่ (503) ระบบลองซ้ำให้แล้วแต่ยังไม่ผ่าน รอสักครู่แล้วกดใหม่";
  const base = (result && AI_ERROR_MESSAGES[result.error]) || "เกิดข้อผิดพลาด ลองใหม่อีกครั้ง";
  return base + (result && result.status ? ` (รหัส ${result.status})` : "");
}

// ===== AI Layer (Milestone 2 → อัปเกรดเป็นแชทถาวร): Financial Advisor sheet =====
// บันทึกคำถาม+คำตอบลงประวัติแชทถาวร (ไม่ใช่ popup ครั้งเดียวทิ้งเหมือนเดิม) แล้วเปิดหน้าต่างแชท
function openAiAnalystSheet(query, analysisText){
  const history = loadAIChatHistory();
  history.push({ role:"user", text: query });
  history.push({ role:"model", text: analysisText });
  saveAIChatHistory(history);
  renderAiChatBubbles();
  document.getElementById("aiAnalystOverlay").classList.add("open");
  clearAiChatUnread();
}
function closeAiAnalystSheet(){
  document.getElementById("aiAnalystOverlay").classList.remove("open");
}
document.getElementById("aiAnalystOverlay").addEventListener("click", closeAiAnalystSheet);

document.getElementById("clearAiChatBtn").addEventListener("click", (e) => {
  e.stopPropagation();
  if(aiChatAbortController) aiChatAbortController.abort();
  aiChatEditingIndex = null;
  clearAIChatHistory();
  renderAiChatBubbles();
  document.getElementById("aiChatError").style.display = "none";
});

// ===== รายการแชททั้งหมด (หลายแชทแบบ ChatGPT/Gemini) =====
function renderAiChatList(){
  const el = document.getElementById("aiChatListBody");
  const data = loadAllChats();
  const sorted = [...data.chats].sort((a,b) => (b.updatedAt||"").localeCompare(a.updatedAt||""));
  el.innerHTML = sorted.map(c => {
    const title = c.title || chatTitleFrom(c.messages) || "แชทใหม่";
    const isActive = c.id === data.activeId;
    return `
    <div class="ai-chat-list-row${isActive ? " active" : ""}" data-id="${c.id}">
      <div class="ai-chat-list-info">
        <span class="ai-chat-list-title">${escapeHtml(title)}</span>
        <span class="ai-chat-list-meta">${c.messages.length} ข้อความ · ${chatTimeLabel(c.updatedAt)}</span>
      </div>
      <button class="icon-btn ai-icon-btn delete-ai-chat-btn" data-id="${c.id}" aria-label="ลบแชทนี้"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7h14M9 7V5h6v2M8 10v8M12 10v8M16 10v8M6 7l1 14h10l1-14"/></svg></button>
    </div>`;
  }).join("");

  el.querySelectorAll(".ai-chat-list-row").forEach(row => {
    row.addEventListener("click", (e) => {
      if(e.target.closest(".delete-ai-chat-btn")) return;
      switchToChat(row.dataset.id);
      renderAiChatBubbles();
      document.getElementById("aiChatListOverlay").classList.remove("open");
      document.getElementById("aiAnalystOverlay").classList.add("open");
      clearAiChatUnread();
    });
  });
  el.querySelectorAll(".delete-ai-chat-btn").forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      if(!confirm("ลบแชทนี้ทั้งหมดใช่ไหม? กู้คืนไม่ได้")) return;
      deleteChat(btn.dataset.id);
      renderAiChatList();
      renderAiChatBubbles();
      showToast("ลบแชทแล้ว");
    });
  });
}
document.getElementById("aiChatHistoryBtn").addEventListener("click", (e) => {
  e.stopPropagation();
  renderAiChatList();
  document.getElementById("aiChatListOverlay").classList.add("open");
});
document.getElementById("closeAiChatListBtn").addEventListener("click", () => {
  document.getElementById("aiChatListOverlay").classList.remove("open");
});
document.getElementById("aiChatListOverlay").addEventListener("click", () => {
  document.getElementById("aiChatListOverlay").classList.remove("open");
});
document.getElementById("newAiChatBtn").addEventListener("click", () => {
  if(aiChatAbortController) aiChatAbortController.abort();
  aiChatEditingIndex = null;
  createNewChat();
  renderAiChatBubbles();
  document.getElementById("aiChatListOverlay").classList.remove("open");
  document.getElementById("aiAnalystOverlay").classList.add("open");
  clearAiChatUnread();
  document.getElementById("aiChatError").style.display = "none";
});

// คลิกปุ่ม แก้ไข/คัดลอก/ตอบใหม่ บนแต่ละข้อความ (event delegation — ปุ่มถูกสร้างใหม่ทุกครั้งที่ render)
document.getElementById("aiAnalystBody").addEventListener("click", (e) => {
  const actionBtn = e.target.closest("[data-action]");
  if(!actionBtn) return;
  const idx = parseInt(actionBtn.dataset.idx, 10);
  const action = actionBtn.dataset.action;
  const history = loadAIChatHistory();
  const msg = history[idx];
  if(!msg) return;

  if(action === "copy"){
    if(navigator.clipboard && navigator.clipboard.writeText){
      navigator.clipboard.writeText(msg.text).then(() => showToast("คัดลอกแล้ว")).catch(() => {});
    }
    return;
  }
  if(action === "edit"){
    document.getElementById("aiChatInput").value = msg.text;
    document.getElementById("aiChatInput").focus();
    aiChatEditingIndex = idx; // ตอนกดส่ง จะตัดประวัติตั้งแต่ข้อความนี้ (รวมคำตอบเดิมหลังจากนี้) ออกก่อนส่งใหม่
    showToast("แก้ไขข้อความแล้วกดส่งได้เลย — คำตอบเดิมหลังจากนี้จะถูกแทนที่");
    return;
  }
  if(action === "regenerate"){
    if(idx < 1) return;
    const beforeThisReply = history.slice(0, idx); // ตัดคำตอบเดิม (idx) ออก เหลือแค่ก่อนหน้า
    const lastUserMsg = beforeThisReply[beforeThisReply.length - 1];
    if(!lastUserMsg || lastUserMsg.role !== "user") return;
    regenerateLastReply(beforeThisReply.slice(0, -1), lastUserMsg.text);
    return;
  }
});

const aiAdvisorSettingsBtn = document.getElementById("aiAdvisorSettingsBtn");
const aiAdvisorSettingsPanel = document.getElementById("aiAdvisorSettingsPanel");
const aiAdvisorInstructionEl = document.getElementById("aiAdvisorInstruction");
const aiAdvisorInstructionStatus = document.getElementById("aiAdvisorInstructionStatus");
if(aiAdvisorInstructionEl) aiAdvisorInstructionEl.value = loadAIAdvisorInstruction();
aiAdvisorSettingsBtn?.addEventListener("click", () => {
  aiAdvisorSettingsPanel?.classList.toggle("is-open");
  if(aiAdvisorSettingsPanel?.classList.contains("is-open")) aiAdvisorInstructionEl?.focus();
});
document.getElementById("saveAiAdvisorInstructionBtn")?.addEventListener("click", () => {
  saveAIAdvisorInstruction(aiAdvisorInstructionEl?.value || "");
  if(aiAdvisorInstructionStatus) aiAdvisorInstructionStatus.textContent = "บันทึกแล้ว — จะใช้กับข้อความถัดไปทันที";
});
document.getElementById("resetAiAdvisorInstructionBtn")?.addEventListener("click", () => {
  if(aiAdvisorInstructionEl) aiAdvisorInstructionEl.value = "";
  saveAIAdvisorInstruction("");
  if(aiAdvisorInstructionStatus) aiAdvisorInstructionStatus.textContent = "รีเซ็ตเป็นรูปแบบมาตรฐานแล้ว";
});

function hideAiCompletionNotification(){
  document.getElementById('aiCompletionNotice')?.classList.remove('show');
}
function showAiCompletionNotification(chatId){
  if(isAdvisorPageActive()) return;
  const el=document.getElementById('aiCompletionNotice');
  if(!el) return;
  el.dataset.chatId=chatId||'';
  el.classList.add('show');
}
function openAiCompletionChat(){
  const el=document.getElementById('aiCompletionNotice');
  const chatId=el?.dataset.chatId;
  if(chatId && getChatById(chatId)){ switchToChat(chatId); }
  hideAiCompletionNotification();
  window.bancheeOpenChatPage?.();
}
document.getElementById('aiCompletionOpenBtn')?.addEventListener('click',openAiCompletionChat);
document.getElementById('aiCompletionDismissBtn')?.addEventListener('click',hideAiCompletionNotification);

// ส่งข้อความต่อเนื่องในหน้าต่างแชท (ไม่ผ่านการคัดกรองแบบหน้าพิมพ์รายการ — คุยได้อิสระเต็มที่)
document.getElementById("aiChatSendBtn").addEventListener("click", async () => {
  // ถ้ากำลังรอ AI ตอบอยู่ ปุ่มนี้ทำหน้าที่เป็นปุ่ม "หยุด" แทน
  if(aiChatBusy){
    if(aiChatAbortController) aiChatAbortController.abort();
    return;
  }

  const input = document.getElementById("aiChatInput");
  const text = input.value.trim();
  const errBox = document.getElementById("aiChatError");
  errBox.style.display = "none";
  if(!text) return;

  if(getApiKeys().length === 0){
    errBox.textContent = AI_ERROR_MESSAGES.missing_api_key;
    errBox.style.display = "block";
    return;
  }

  let priorHistory = loadAIChatHistory();
  if(aiChatEditingIndex !== null){
    priorHistory = priorHistory.slice(0, aiChatEditingIndex); // ตัดตั้งแต่ข้อความที่แก้ไข (รวมคำตอบเดิม) ออกทั้งหมด
    aiChatEditingIndex = null;
  }

  const historyWithUserMsg = priorHistory.concat([{ role:"user", text }]);
  saveAIChatHistory(historyWithUserMsg);
  renderAiChatBubbles();
  input.value = "";

  const requestId=makeId();
  const requestChatId=loadAllChats().activeId;
  aiRequestState={id:requestId,chatId:requestChatId,status:'pending',startedAt:Date.now(),userText:text};
  aiChatBusy = true;
  setAiChatSendBtnState(true);
  input.disabled = true;
  showAiChatTyping();

  const snapshot = buildFinancialSnapshot();
  const profile = loadAIProfile();
  aiChatAbortController = new AbortController();
  const aiRequestStartedAt = performance.now();
  const result = await generateChatReply(priorHistory, text, snapshot, profile, aiChatAbortController.signal);
  const aiElapsedMs = Math.round(performance.now() - aiRequestStartedAt);
  aiChatAbortController = null;

  if(!isAiRequestCurrent(requestId)) return;
  aiRequestState.status=result.ok?'completed':(result.error==='aborted'?'cancelled':'error');
  aiChatBusy = false;
  hideAiChatTyping();
  setAiChatSendBtnState(false);
  input.disabled = false;

  if(!result.ok){
    if(result.error === "aborted"){ aiRequestState=null; renderAiChatBubbles(); return; }
    const label = aiErrorLabel(result);
    const codeLine = result.error ? ` (โค้ด: ${result.error}${result.status ? " HTTP " + result.status : ""})` : "";
    errBox.textContent = label + codeLine + " — ข้อความที่พิมพ์ไว้ยังอยู่ ลองกดส่งใหม่ได้เลย";
    errBox.style.display = "block";
    aiRequestState=null;
    renderAiChatBubbles();
    return;
  }

  const historyWithReply = historyWithUserMsg.concat([{ role:"model", text: processAiReplyForMemory(result.text), actions: takePendingActions() }]);
  saveAIChatHistoryForChat(requestChatId, historyWithReply);
  aiRequestState=null;
  renderAiChatBubbles();
  const latencyEl = document.createElement("div");
  latencyEl.className = "ai-chat-latency";
  latencyEl.textContent = `ตอบใน ${(aiElapsedMs/1000).toFixed(1)} วินาที`;
  if(isAdvisorPageActive()) document.getElementById("aiAnalystBody")?.appendChild(latencyEl);

  // แจ้งเฉพาะเมื่อผู้ใช้ไม่ได้อยู่หน้า Advisor ตอนคำตอบเสร็จ และแจ้งครั้งเดียวต่อ request
  if(!isAdvisorPageActive()){
    markAiChatUnread();
    showAiCompletionNotification(requestChatId);
  }
});
document.getElementById("aiChatInput").addEventListener("input", () => {
  syncAiChatSendBtnVisibility();
});
document.getElementById("aiChatInput").addEventListener("keydown", (e) => {
  if(e.key === "Enter"){
    const touchDevice = window.matchMedia && window.matchMedia("(pointer: coarse)").matches;
    if(touchDevice || e.shiftKey || e.isComposing) return; // มือถือ: Enter = ขึ้นบรรทัดใหม่ ส่งด้วยปุ่มลูกศร
    e.preventDefault();
    document.getElementById("aiChatSendBtn").click();
  }
});
syncAiChatSendBtnVisibility();

// ใช้ตอนกด "🔄 ตอบใหม่" — ตัดคำตอบ AI อันเดิมทิ้ง แล้วยิงคำถามเดิมซ้ำ
async function regenerateLastReply(priorHistory, userText){
  const errBox = document.getElementById("aiChatError");
  errBox.style.display = "none";

  saveAIChatHistory(priorHistory.concat([{ role:"user", text: userText }]));
  renderAiChatBubbles();

  const requestId=makeId();
  const requestChatId=loadAllChats().activeId;
  aiRequestState={id:requestId,chatId:requestChatId,status:'pending',startedAt:Date.now(),userText:userText};
  aiChatBusy = true;
  setAiChatSendBtnState(true);
  document.getElementById("aiChatInput").disabled = true;
  showAiChatTyping();

  const snapshot = buildFinancialSnapshot();
  const profile = loadAIProfile();
  aiChatAbortController = new AbortController();
  const result = await generateChatReply(priorHistory, userText, snapshot, profile, aiChatAbortController.signal);
  aiChatAbortController = null;

  if(!isAiRequestCurrent(requestId)) return;
  aiRequestState.status=result.ok?'completed':(result.error==='aborted'?'cancelled':'error');
  hideAiChatTyping();
  aiChatBusy = false;
  setAiChatSendBtnState(false);
  document.getElementById("aiChatInput").disabled = false;

  if(!result.ok){
    if(result.error === "aborted"){aiRequestState=null;renderAiChatBubbles();return;}
    const label = aiErrorLabel(result);
    errBox.textContent = label + " — ลองตอบใหม่อีกครั้ง";
    errBox.style.display = "block";
    aiRequestState=null; renderAiChatBubbles(); return;
  }

  saveAIChatHistoryForChat(requestChatId,priorHistory.concat([{ role:"user", text: userText }, { role:"model", text: processAiReplyForMemory(result.text), actions: takePendingActions() }]));
  aiRequestState=null;
  renderAiChatBubbles();

  if(!isAdvisorPageActive()){
    markAiChatUnread();
    showAiCompletionNotification(requestChatId);
  }
}

document.getElementById("aiProcessBtn").addEventListener("click", async () => {
  const text = document.getElementById("aiInputText").value.trim();
  const errBox = document.getElementById("aiInputError");
  errBox.style.display = "none";
  if(!text) return;

  const btn = document.getElementById("aiProcessBtn");
  const originalLabel = btn.textContent;
  btn.disabled = true;
  btn.textContent = "กำลังคัดกรอง...";

  // ด่านแรกเสมอ: ตัดสินว่าข้อความนี้คือ "บันทึกรายการ" หรือ "คำถาม/ขอวิเคราะห์"
  const intentResult = await classifyIntent(text);

  if(!intentResult.ok){
    btn.disabled = false;
    btn.textContent = originalLabel;
    errBox.textContent = aiErrorLabel(intentResult);
    errBox.style.display = "block";
    return;
  }

  if(intentResult.intent === "query"){
    // Flow วิเคราะห์การเงิน — ไม่แตะ Flow บันทึกรายการเดิมเลย
    btn.textContent = "กำลังวิเคราะห์ข้อมูลการเงิน...";
    const snapshot = buildFinancialSnapshot();
    const analysisResult = await analyzeFinancialQuery(text, snapshot);

    btn.disabled = false;
    btn.textContent = originalLabel;

    if(!analysisResult.ok){
      errBox.textContent = aiErrorLabel(analysisResult);
      errBox.style.display = "block";
      return;
    }

    closeAiInputSheet();
    openAiAnalystSheet(text, processAiReplyForMemory(analysisResult.text));
    return;
  }

  // Flow บันทึกรายการเดิม (ห้ามแตะต้อง) — เดิมเรียก parseNaturalLanguageEntry() ตรงๆ ทันที
  btn.textContent = "กำลังตีความรายการ...";
  const result = await parseNaturalLanguageEntry(text);

  btn.disabled = false;
  btn.textContent = originalLabel;

  if(!result.ok){
    errBox.textContent = aiErrorLabel(result);
    errBox.style.display = "block";
    return;
  }

  closeAiInputSheet();
  handleAiParseResult(result.payload, text);
});

// ===== AI Layer (Milestone 1) Phase 3: Confirmation Bottom Sheet =====
let aiConfirmType = null;

function handleAiParseResult(payload, originalText){
  openAiConfirmSheet(payload, originalText);
}

function closeAiConfirmSheet(){
  document.getElementById("aiConfirmOverlay").classList.remove("open");
}

function clearAmbiguousMarks(){
  document.querySelectorAll("#aiConfirmOverlay .field-ambiguous").forEach(el => el.classList.remove("field-ambiguous"));
  document.querySelectorAll("#aiConfirmOverlay .ambiguous-hint").forEach(el => el.remove());
}
function markAmbiguous(el){
  if(!el) return;
  el.classList.add("field-ambiguous");
  const hint = document.createElement("div");
  hint.className = "ambiguous-hint";
  hint.textContent = "*(แนะนำให้ตรวจสอบ)*";
  el.insertAdjacentElement("afterend", hint);
}

function openAiConfirmSheet(payload, originalText){
  aiConfirmType = ["expense","income","saving","transfer","lend"].includes(payload.action) ? payload.action : "expense";
  document.getElementById("aiConfirmError").style.display = "none";
  document.getElementById("aiConfirmQuote").textContent = `ตีความจาก: "${originalText}"`;

  const badgeLabel = { expense:"รายจ่าย", income:"รายรับ", saving:"ออม/ลงทุน", transfer:"โอนเงิน", lend:"ให้ยืมเงิน" }[aiConfirmType];
  const badgeEl = document.getElementById("aiConfirmBadge");
  badgeEl.textContent = badgeLabel;
  badgeEl.className = "ai-confirm-badge badge-" + aiConfirmType;

  const isCatType = aiConfirmType === "expense" || aiConfirmType === "income" || aiConfirmType === "saving";
  const isTransfer = aiConfirmType === "transfer";
  const isLend = aiConfirmType === "lend";

  document.getElementById("aiConfirmCategoryGroup").style.display = isCatType ? "block" : "none";
  document.getElementById("aiConfirmTransferGroup").style.display = isTransfer ? "block" : "none";
  document.getElementById("aiConfirmLendGroup").style.display = isLend ? "block" : "none";

  document.getElementById("aiConfirmAmount").value = payload.amount || "";
  document.getElementById("aiConfirmDate").value = isValidISODate(payload.date) ? payload.date : todayISO();
  document.getElementById("aiConfirmNote").value = payload.note || "";

  const accOptsHtml = accounts.map(a => `<option value="${a.id}">${escapeHtml(a.name)}</option>`).join("");
  const isValidAccountId = (id) => !!id && accounts.some(a => a.id === id);
  const fallbackAccountId = () => (isValidAccountId(lastUsedAccountId) ? lastUsedAccountId : (accounts[0]?.id || ""));

  if(isCatType){
    const cats = CATS_BY_TYPE[aiConfirmType] || [];
    document.getElementById("aiConfirmCategory").innerHTML = cats.map(c => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join("");
    const lastCat = lastUsedCat[aiConfirmType];
    const cat = (payload.category && cats.includes(payload.category)) ? payload.category
      : (lastCat && cats.includes(lastCat)) ? lastCat
      : (cats[0] || "");
    document.getElementById("aiConfirmCategory").value = cat;

    document.getElementById("aiConfirmAccount").innerHTML = accOptsHtml;
    document.getElementById("aiConfirmAccount").value = isValidAccountId(payload.accountId) ? payload.accountId : fallbackAccountId();
  }

  if(isTransfer){
    document.getElementById("aiConfirmFromAccount").innerHTML = accOptsHtml;
    document.getElementById("aiConfirmToAccount").innerHTML = accOptsHtml;
    const fromId = isValidAccountId(payload.fromAccountId) ? payload.fromAccountId : fallbackAccountId();
    const toId = (isValidAccountId(payload.toAccountId) && payload.toAccountId !== fromId)
      ? payload.toAccountId
      : (accounts.find(a => a.id !== fromId)?.id || fromId);
    document.getElementById("aiConfirmFromAccount").value = fromId;
    document.getElementById("aiConfirmToAccount").value = toId;
  }

  if(isLend){
    document.getElementById("aiConfirmPerson").value = payload.person || "";
    document.getElementById("aiConfirmLendAccount").innerHTML = accOptsHtml;
    // กฎเหล็ก: บัญชีสำหรับ lend ห้าม null เสมอ — ถ้า AI เดาไม่ได้เลยก็ยังต้อง fallback ให้มีค่าเสมอ
    document.getElementById("aiConfirmLendAccount").value = isValidAccountId(payload.accountId) ? payload.accountId : fallbackAccountId();
    document.getElementById("aiConfirmDueDate").value = isValidISODate(payload.dueDate) ? payload.dueDate : "";
  }

  clearAmbiguousMarks();
  const ambiguous = Array.isArray(payload.ambiguousFields) ? payload.ambiguousFields : [];
  ambiguous.forEach(field => {
    if(field === "amount") markAmbiguous(document.getElementById("aiConfirmAmount"));
    else if(field === "date") markAmbiguous(document.getElementById("aiConfirmDate"));
    else if(field === "category" && isCatType) markAmbiguous(document.getElementById("aiConfirmCategory"));
    else if(field === "accountId"){
      if(isCatType) markAmbiguous(document.getElementById("aiConfirmAccount"));
      else if(isLend) markAmbiguous(document.getElementById("aiConfirmLendAccount"));
    }
    else if(field === "fromAccountId" && isTransfer) markAmbiguous(document.getElementById("aiConfirmFromAccount"));
    else if(field === "toAccountId" && isTransfer) markAmbiguous(document.getElementById("aiConfirmToAccount"));
    else if(field === "person" && isLend) markAmbiguous(document.getElementById("aiConfirmPerson"));
    else if(field === "dueDate" && isLend) markAmbiguous(document.getElementById("aiConfirmDueDate"));
  });

  document.getElementById("aiConfirmOverlay").classList.add("open");
}

document.getElementById("closeAiConfirmBtn").addEventListener("click", closeAiConfirmSheet);
document.getElementById("aiConfirmOverlay").addEventListener("click", closeAiConfirmSheet);
document.getElementById("aiConfirmCancelBtn").addEventListener("click", closeAiConfirmSheet);

const AI_CONFIRM_ERROR_MESSAGES = {
  invalid_amount: "จำนวนเงินไม่ถูกต้อง",
  invalid_transfer_accounts: "เลือกบัญชีต้นทางกับปลายทางให้ต่างกัน",
  entry_not_found: "ไม่พบรายการที่จะแก้ไข",
  missing_person: "กรอกชื่อคนยืมก่อน",
  missing_account: "เลือกบัญชีที่หักเงินก่อน",
  loan_not_found: "ไม่พบรายการเงินให้ยืมที่จะแก้ไข"
};

document.getElementById("aiConfirmSubmitBtn").addEventListener("click", () => {
  const errBox = document.getElementById("aiConfirmError");
  errBox.style.display = "none";

  const amount = document.getElementById("aiConfirmAmount").value;
  const date = document.getElementById("aiConfirmDate").value || todayISO();
  const note = document.getElementById("aiConfirmNote").value;

  let result;
  if(aiConfirmType === "transfer"){
    result = commitEntry({
      type: "transfer",
      fromAccountId: document.getElementById("aiConfirmFromAccount").value,
      toAccountId: document.getElementById("aiConfirmToAccount").value,
      amount, date, note
    });
  }else if(aiConfirmType === "lend"){
    result = commitLoan({
      person: document.getElementById("aiConfirmPerson").value,
      amount,
      accountId: document.getElementById("aiConfirmLendAccount").value,
      dueDate: document.getElementById("aiConfirmDueDate").value,
      date, note
    });
  }else{
    result = commitEntry({
      type: aiConfirmType,
      category: document.getElementById("aiConfirmCategory").value,
      accountId: document.getElementById("aiConfirmAccount").value,
      amount, date, note
    });
  }

  if(!result.ok){
    errBox.textContent = AI_CONFIRM_ERROR_MESSAGES[result.error] || "บันทึกไม่สำเร็จ ลองใหม่อีกครั้ง";
    errBox.style.display = "block";
    return;
  }

  closeAiConfirmSheet();
  if(aiConfirmType !== "lend"){
    selectedMonth = monthKey(result.entry.date);
  }
  render();
  if(aiConfirmType === "lend"){
    renderLoansManageList();
  }
  const doneLabel = { expense:"รายจ่าย", income:"รายรับ", saving:"ออม/ลงทุน", transfer:"โอนเงิน", lend:"ให้ยืมเงิน" }[aiConfirmType];
  showToast(`บันทึก${doneLabel}เรียบร้อย ✓`);
});

loadEntries();
loadCategories();
loadLastCat();
loadAccounts();
loadLastAccount();
loadReserved();
loadLoans();
loadRecurring();
loadDebts();
loadBudgets();
loadEmergencyFundConfig();
ensureDefaultDebts();
selectedMonth = monthKey(todayISO());
render();
refreshApiKeyStatus();
refreshProactiveCard();

function renderAccountsManageList(){
  const el = document.getElementById("accountsManageList");
  el.innerHTML = accounts.map(a => `
    <div class="account-row">
      <span class="acc-name">${escapeHtml(a.name)} <span class="mono" style="color:var(--faint)">฿${fmt(computeAccountBalance(a.id))}</span></span>
      <span class="acc-actions">
        <button class="icon-btn rename-acc-btn" data-id="${a.id}" aria-label="แก้ไข">✏️</button>
        <button class="icon-btn delete-acc-btn" data-id="${a.id}" aria-label="ลบ">🗑</button>
      </span>
    </div>
  `).join("");
  el.querySelectorAll(".rename-acc-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const acc = accounts.find(a => a.id === btn.dataset.id);
      if(!acc) return;
      const name = prompt("ชื่อบัญชี:", acc.name);
      if(!name || !name.trim()) return;
      acc.name = name.trim();
      const balStr = prompt("ยอดเริ่มต้นของบัญชี (บาท) — ใช้ตอนสร้างบัญชีครั้งแรกเท่านั้น ไม่กระทบรายการที่บันทึกไปแล้ว:", acc.initialBalance || 0);
      const bal = parseFloat(balStr);
      if(!isNaN(bal)) acc.initialBalance = bal;
      saveAccounts();
      renderAccountsManageList();
      render();
    });
  });
  el.querySelectorAll(".delete-acc-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      if(accounts.length <= 1){
        showToast("ต้องเหลืออย่างน้อย 1 บัญชี");
        return;
      }
      const acc = accounts.find(a => a.id === btn.dataset.id);
      if(!acc) return;
      const inUse = entries.some(e => e.accountId===acc.id || e.fromAccountId===acc.id || e.toAccountId===acc.id)
        || loans.some(l => l.accountId===acc.id || l.repayments.some(r => r.accountId===acc.id));
      const fallback = accounts.find(a => a.id !== acc.id);
      const msg = inUse
        ? `บัญชี "${acc.name}" มีรายการผูกอยู่ ลบแล้วรายการเหล่านั้นจะถูกย้ายไปที่ "${fallback.name}" — ยืนยันไหม?`
        : `ลบบัญชี "${acc.name}" ใช่ไหม?`;
      if(!confirm(msg)) return;
      if(inUse){
        entries.forEach(e => {
          if(e.accountId === acc.id) e.accountId = fallback.id;
          if(e.fromAccountId === acc.id) e.fromAccountId = fallback.id;
          if(e.toAccountId === acc.id) e.toAccountId = fallback.id;
        });
        saveEntries();
        loans.forEach(l => {
          if(l.accountId === acc.id) l.accountId = fallback.id;
          l.repayments.forEach(r => { if(r.accountId === acc.id) r.accountId = fallback.id; });
        });
        saveLoans();
      }
      accounts = accounts.filter(a => a.id !== acc.id);
      saveAccounts();
      renderAccountsManageList();
      render();
    });
  });
}

document.getElementById("manageAccountsBtn").addEventListener("click", () => {
  renderAccountsManageList();
  document.getElementById("accountsOverlay").classList.add("open");
});
document.getElementById("closeAccountsBtn").addEventListener("click", () => {
  document.getElementById("accountsOverlay").classList.remove("open");
});
document.getElementById("accountsOverlay").addEventListener("click", () => {
  document.getElementById("accountsOverlay").classList.remove("open");
});
document.getElementById("addAccountBtn").addEventListener("click", () => {
  const name = prompt("ชื่อบัญชีใหม่ เช่น ธนาคาร, เงินสด, Wallet, เงินออม:");
  if(!name || !name.trim()) return;
  const balStr = prompt("ยอดเงินเริ่มต้นในบัญชีนี้ตอนนี้ (บาท):", "0");
  const bal = parseFloat(balStr) || 0;
  accounts.push({ id: makeId(), name: name.trim(), initialBalance: bal });
  saveAccounts();
  renderAccountsManageList();
  render();
});

// ===== เงินกันไว้ / Reserved Money =====
function renderReservedManageList(){
  const el = document.getElementById("reservedManageList");
  if(!reservedItems.length){
    el.innerHTML = `<div class="empty-state">ยังไม่มีเงินกันไว้</div>`;
    return;
  }
  el.innerHTML = reservedItems.map(r => `
    <div class="account-row">
      <span class="acc-name">${escapeHtml(r.name)} <span class="mono" style="color:var(--faint)">฿${fmt(r.amount)}</span>${r.dueDate ? ` <span style="color:var(--faint)">(${dayLabel(r.dueDate)})</span>` : ""}</span>
      <span class="acc-actions">
        <button class="icon-btn edit-reserved-btn" data-id="${r.id}" aria-label="แก้ไข">✏️</button>
        <button class="icon-btn delete-reserved-btn" data-id="${r.id}" aria-label="ลบ">🗑</button>
      </span>
    </div>
  `).join("");
  el.querySelectorAll(".edit-reserved-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const r = reservedItems.find(x => x.id === btn.dataset.id);
      if(!r) return;
      const name = prompt("ชื่อรายการ:", r.name);
      if(!name || !name.trim()) return;
      const amtStr = prompt("จำนวนเงินที่กันไว้ (บาท):", r.amount);
      const amt = parseFloat(amtStr);
      if(!amt || amt<=0) return;
      const due = prompt("วันครบกำหนด (YYYY-MM-DD, เว้นว่างได้):", r.dueDate || "");
      r.name = name.trim(); r.amount = amt; r.dueDate = due ? due.trim() : "";
      saveReserved();
      renderReservedManageList();
      render();
    });
  });
  el.querySelectorAll(".delete-reserved-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      if(!confirm("ลบรายการเงินกันไว้นี้ใช่ไหม?")) return;
      reservedItems = reservedItems.filter(x => x.id !== btn.dataset.id);
      saveReserved();
      renderReservedManageList();
      render();
    });
  });
}
document.getElementById("manageReservedBtn").addEventListener("click", () => {
  renderReservedManageList();
  document.getElementById("reservedOverlay").classList.add("open");
});
document.getElementById("closeReservedBtn").addEventListener("click", () => {
  document.getElementById("reservedOverlay").classList.remove("open");
});
document.getElementById("reservedOverlay").addEventListener("click", () => {
  document.getElementById("reservedOverlay").classList.remove("open");
});
document.getElementById("addReservedBtn").addEventListener("click", () => {
  const name = prompt("กันเงินไว้สำหรับอะไร เช่น ค่าเช่าห้อง, ค่าเน็ต:");
  if(!name || !name.trim()) return;
  const amtStr = prompt("จำนวนเงินที่กันไว้ (บาท):");
  const amt = parseFloat(amtStr);
  if(!amt || amt<=0) return;
  const due = prompt("วันครบกำหนด (YYYY-MM-DD, เว้นว่างได้):", "");
  reservedItems.push({ id: makeId(), name: name.trim(), amount: amt, dueDate: due ? due.trim() : "", note: "" });
  saveReserved();
  renderReservedManageList();
  render();
});

// ===== เงินให้คนอื่นยืม / Receivables =====
function loanRepaymentCategory(){ return "เงินคืนจากการยืม"; }

function ensureLoanRepaymentCategory(){
  if(!Array.isArray(CATS_BY_TYPE.income)) CATS_BY_TYPE.income=[];
  if(!CATS_BY_TYPE.income.includes(loanRepaymentCategory())){
    CATS_BY_TYPE.income.splice(1,0,loanRepaymentCategory());
    saveCategories();
  }
}
function findLoanRepaymentEntry(loanId, repaymentId){
  return entries.find(e => e.source === "loan_repayment" && e.loanId === loanId && e.repaymentId === repaymentId) || null;
}
function createLoanRepaymentEntry(loan, repayment){
  ensureLoanRepaymentCategory();
  const entry={
    id:makeId(),
    type:"income",
    category:loanRepaymentCategory(),
    accountId:repayment.accountId,
    amount:Number(repayment.amount),
    date:repayment.date||todayISO(),
    note:(repayment.note||`รับคืนเงินจาก ${loan.person}`).trim(),
    source:"loan_repayment",
    loanId:loan.id,
    repaymentId:repayment.id
  };
  entries.unshift(entry);
  repayment.financialEntryId=entry.id;
  return entry;
}
function syncLoanRepaymentEntries(){
  let changed=false;
  ensureLoanRepaymentCategory();
  const valid=new Set();
  loans.forEach(loan=>{
    if(!Array.isArray(loan.repayments)) loan.repayments=[];
    loan.repayments.forEach(r=>{
      valid.add(`${loan.id}|${r.id}`);
      const linkedMatches=entries.filter(e=>e.source === "loan_repayment" && e.loanId === loan.id && e.repaymentId === r.id);
      let entry=(r.financialEntryId && entries.find(e=>e.id===r.financialEntryId && e.source === "loan_repayment")) || linkedMatches[0] || null;
      if(!entry){
        createLoanRepaymentEntry(loan,r); changed=true;
      }else{
        // Keep exactly one canonical financial entry per repayment; remove any duplicate legacy copies.
        if(linkedMatches.length>1){
          const keepId=entry.id;
          entries=entries.filter(e=>!(e.source === "loan_repayment" && e.loanId === loan.id && e.repaymentId === r.id && e.id !== keepId));
          changed=true;
        }
        const before=JSON.stringify([entry.type,entry.category,entry.accountId,entry.amount,entry.date,entry.note,entry.source,entry.loanId,entry.repaymentId]);
        entry.type="income"; entry.category=loanRepaymentCategory(); entry.accountId=r.accountId||entry.accountId||UNASSIGNED_ACCOUNT_ID;
        entry.amount=Number(r.amount); entry.date=r.date||entry.date||todayISO(); entry.note=(r.note||`รับคืนเงินจาก ${loan.person}`).trim();
        entry.source="loan_repayment"; entry.loanId=loan.id; entry.repaymentId=r.id; r.financialEntryId=entry.id;
        if(before!==JSON.stringify([entry.type,entry.category,entry.accountId,entry.amount,entry.date,entry.note,entry.source,entry.loanId,entry.repaymentId])) changed=true;
      }
    });
  });
  const orphanRepaymentEntries=entries.filter(e=>e.source==="loan_repayment" && !valid.has(`${e.loanId}|${e.repaymentId}`));
  if(orphanRepaymentEntries.length){
    const ids=new Set(orphanRepaymentEntries.map(e=>e.id));
    entries=entries.filter(e=>!ids.has(e.id)); changed=true;
  }
  if(changed){ saveEntries(); saveLoans(); }
  return changed;
}
function getLoanRepaymentGrossCap(loan, repaymentId){
  const gross=toCents(loan.amount)+(loan.adjustments||[]).reduce((sum,a)=>sum+toCents(a.amount),0);
  const other=(loan.repayments||[]).reduce((sum,r)=>r.id===repaymentId?sum:sum+toCents(r.amount),0);
  return Math.max(0,(gross-other)/100);
}
function chooseAccountForLoanMovement(defaultAccountId){
  if(!accounts.length) return null;
  if(accounts.length===1) return accounts[0].id;
  const currentIndex=Math.max(0,accounts.findIndex(a=>a.id===defaultAccountId));
  const names=accounts.map((a,i)=>`${i+1}. ${a.name}`).join("\n");
  const raw=prompt(`เงินเข้าบัญชีไหน?\n${names}\nพิมพ์หมายเลข:`,String(currentIndex+1));
  if(raw===null) return null;
  const idx=(parseInt(raw)||currentIndex+1)-1;
  return accounts[idx]?.id || null;
}
function createLoanRepayment(loanId, amount, accountId, date=todayISO(), note=""){
  const loan=loans.find(l=>l.id===loanId); if(!loan) return {ok:false,error:"loan_not_found"};
  if(!Array.isArray(loan.repayments)) loan.repayments=[];
  const outstanding=loanOutstanding(loan);
  const cents=toCents(amount);
  if(cents<=0||cents>toCents(outstanding)) return {ok:false,error:"invalid_amount"};
  if(!accountId||!accounts.some(a=>a.id===accountId)) return {ok:false,error:"missing_account"};
  ensureLoanRepaymentCategory();
  const repayment={id:makeId(),amount:cents/100,date:date||todayISO(),accountId,note:(note||`รับคืนเงินจาก ${loan.person}`).trim()};
  loan.repayments.push(repayment);
  createLoanRepaymentEntry(loan,repayment);
  saveEntries(); saveLoans();
  return {ok:true,repayment,entry:findLoanRepaymentEntry(loan.id,repayment.id)};
}
function editLoanRepayment(loanId, repaymentId){
  const loan=loans.find(l=>l.id===loanId); if(!loan) return {ok:false,error:"loan_not_found"};
  const r=(loan.repayments||[]).find(x=>x.id===repaymentId); if(!r) return {ok:false,error:"repayment_not_found"};
  const max=getLoanRepaymentGrossCap(loan,repaymentId);
  const raw=prompt(`แก้ยอดเงินคืนของ ${loan.person} (สูงสุด ฿${fmt(max)}):`,String(r.amount));
  if(raw===null) return {ok:false,error:"cancelled"};
  const amount=Math.round(parseFloat(raw)*100)/100;
  if(!Number.isFinite(amount)||amount<=0||amount>max){showToast(`ยอดเงินคืนต้องอยู่ระหว่าง 0 ถึง ฿${fmt(max)}`);return {ok:false,error:"invalid_amount"};}
  const accountId=chooseAccountForLoanMovement(r.accountId); if(!accountId) return {ok:false,error:"cancelled"};
  const dateRaw=prompt("วันที่รับเงินคืน (YYYY-MM-DD):",r.date||todayISO()); if(dateRaw===null)return{ok:false,error:"cancelled"};
  const date=/^\d{4}-\d{2}-\d{2}$/.test(dateRaw.trim())?dateRaw.trim():r.date||todayISO();
  const note=prompt("โน้ต (ไม่บังคับ):",r.note||`รับคืนเงินจาก ${loan.person}`); if(note===null)return{ok:false,error:"cancelled"};
  r.amount=amount; r.accountId=accountId; r.date=date; r.note=note.trim();
  const entry=(r.financialEntryId&&entries.find(e=>e.id===r.financialEntryId))||findLoanRepaymentEntry(loanId,repaymentId)||createLoanRepaymentEntry(loan,r);
  entry.type="income";entry.category=loanRepaymentCategory();entry.accountId=accountId;entry.amount=amount;entry.date=date;entry.note=r.note;entry.source="loan_repayment";entry.loanId=loanId;entry.repaymentId=repaymentId;r.financialEntryId=entry.id;
  saveEntries();saveLoans();renderLoansManageList();render();
  return {ok:true,repayment:r,entry};
}
function deleteLoanRepayment(loanId, repaymentId){
  const loan=loans.find(l=>l.id===loanId); if(!loan)return{ok:false,error:"loan_not_found"};
  const idx=(loan.repayments||[]).findIndex(x=>x.id===repaymentId);if(idx<0)return{ok:false,error:"repayment_not_found"};
  if(!confirm("ลบรายการรับเงินคืนนี้ใช่ไหม? เงินที่เคยรับคืนจะถูกหักกลับจากบัญชีโดยอัตโนมัติ"))return{ok:false,error:"cancelled"};
  const r=loan.repayments[idx]; const entryId=r.financialEntryId; loan.repayments.splice(idx,1);
  entries=entries.filter(e=>!(e.source==="loan_repayment"&&(e.id===entryId||(e.loanId===loanId&&e.repaymentId===repaymentId))));
  saveEntries();saveLoans();renderLoansManageList();render();
  return{ok:true};
}
function renderLoansManageList(){
  const el = document.getElementById("loansManageList");
  if(!loans.length){
    el.innerHTML = `<div class="empty-state">ยังไม่มีรายการเงินให้ยืม</div>`;
    return;
  }
  el.innerHTML = loans.map(l => {
    const outstanding = loanOutstanding(l);
    const status = outstanding<=0 ? "คืนครบแล้ว" : (l.dueDate && l.dueDate < todayISO() ? "เลยกำหนด" : "ค้างคืน");
    return `<div class="account-row" style="align-items:flex-start;">
      <span class="acc-name" style="flex-direction:column; align-items:flex-start; display:flex;">
        <span>${escapeHtml(l.person)} <span style="color:var(--faint)">— ${status}</span></span>
        <span class="mono" style="font-size:12px;color:var(--faint)">ยืม ฿${fmt(l.amount)} · ค้าง ฿${fmt(outstanding)}</span>
        ${(l.repayments||[]).length ? `<span style="font-size:10px;color:var(--faint);margin-top:5px;display:block">คืนแล้ว: ${(l.repayments||[]).map(r=>`฿${fmt(r.amount)} · ${escapeHtml(r.date||'') } <button type="button" class="icon-btn edit-repayment-btn" data-loan-id="${l.id}" data-repayment-id="${r.id}" aria-label="แก้เงินคืน">✏️</button><button type="button" class="icon-btn delete-repayment-btn" data-loan-id="${l.id}" data-repayment-id="${r.id}" aria-label="ลบเงินคืน">🗑</button>`).join(' · ')}</span>` : ''}
      </span>
      <span class="acc-actions">
        ${outstanding>0 ? `<button class="icon-btn repay-loan-btn" data-id="${l.id}" aria-label="รับคืน">💰</button>` : ""}
        <button class="icon-btn edit-loan-btn" data-id="${l.id}" aria-label="แก้ไข">✏️</button><button class="icon-btn delete-loan-btn" data-id="${l.id}" aria-label="ลบ">🗑</button>
      </span>
    </div>`;
  }).join("");
  el.querySelectorAll(".repay-loan-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const l = loans.find(x => x.id === btn.dataset.id);
      if(!l) return;
      const outstanding = loanOutstanding(l);
      const amtStr = prompt(`${l.person} คืนเงินเท่าไหร่ (บาท) — ค้างอยู่ ฿${fmt(outstanding)}:`, outstanding);
      const amt = parseFloat(amtStr);
      if(!amt || amt<=0) return;
      if(!accounts.length) return;
      const accNames = accounts.map((a,i) => `${i+1}. ${a.name}`).join("\n");
      const accIdxStr = accounts.length===1 ? "1" : prompt(`เงินเข้าบัญชีไหน?\n${accNames}\nพิมพ์หมายเลข:`, "1");
      const accIdx = (parseInt(accIdxStr) || 1) - 1;
      const accountId = accounts[accIdx]?.id || accounts[0].id;
      const result=createLoanRepayment(l.id, Math.min(amt, outstanding), accountId, todayISO());
      if(!result.ok){ showToast("บันทึกเงินคืนไม่สำเร็จ"); return; }
      renderLoansManageList();
      render();
    });
  });
  el.querySelectorAll(".edit-loan-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const l = loans.find(x => x.id === btn.dataset.id);
      if(!l) return;
      const current = loanOutstanding(l);
      const next = prompt(`ยอดหนี้คงเหลือของ ${l.person} ต้องการแก้เป็นเท่าไหร่?
ปัจจุบัน ฿${fmt(current)}
การแก้จะปรับเงินกลางเฉพาะส่วนต่าง และไม่ซ้ำกับยอดที่คืนไปแล้ว`, current);
      if(next === null) return;
      const desired = parseFloat(next);
      if(!Number.isFinite(desired) || desired < 0){ showToast("ยอดหนี้ไม่ถูกต้อง"); return; }
      if(!accounts.some(a=>a.id===l.accountId)){ showToast("บัญชีเดิมของรายการนี้หายไปแล้ว"); return; }
      const result = commitLoan({ person:l.person, amount:desired, accountId:l.accountId, dueDate:l.dueDate, note:l.note, editingId:l.id });
      if(!result.ok){ showToast("แก้ไขรายการไม่สำเร็จ"); return; }
      renderLoansManageList(); render(); showToast("แก้ยอดหนี้แล้ว ✓");
    });
  });
  el.querySelectorAll(".edit-repayment-btn").forEach(btn => {
    btn.addEventListener("click", () => editLoanRepayment(btn.dataset.loanId, btn.dataset.repaymentId));
  });
  el.querySelectorAll(".delete-repayment-btn").forEach(btn => {
    btn.addEventListener("click", () => deleteLoanRepayment(btn.dataset.loanId, btn.dataset.repaymentId));
  });
  el.querySelectorAll(".delete-loan-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      if(!confirm("ลบรายการเงินให้ยืมนี้ใช่ไหม? (เงินที่หักออกจากบัญชีไปแล้วจะถูกคืนกลับเข้าบัญชี)")) return;
      const loanId=btn.dataset.id;
      entries=entries.filter(e=>!(e.source==="loan_repayment"&&e.loanId===loanId));
      loans = loans.filter(x => x.id !== loanId);
      saveEntries(); saveLoans();
      renderLoansManageList();
      render();
    });
  });
}
document.getElementById("manageLoansBtn").addEventListener("click", () => {
  renderLoansManageList();
  document.getElementById("loansOverlay").classList.add("open");
});
document.getElementById("closeLoansBtn").addEventListener("click", () => {
  document.getElementById("loansOverlay").classList.remove("open");
});
document.getElementById("loansOverlay").addEventListener("click", () => {
  document.getElementById("loansOverlay").classList.remove("open");
});
// ===== AI Layer integration point: pure data-in commit function =====
// payload: { person, amount, accountId, dueDate, date, note, editingId }
// return: { ok:true, loan } | { ok:false, error }
// กฎเหล็ก: accountId บังคับเสมอ (เงินให้ยืมต้องตัดออกจากบัญชีจริง ห้ามเป็น null)
function commitLoan(payload){
  const person = (payload.person || "").trim();
  if(!person) return { ok:false, error:"missing_person" };
  let amount = parseFloat(payload.amount);
  if(!Number.isFinite(amount) || amount<=0) return { ok:false, error:"invalid_amount" };
  amount = Math.round(amount * 100) / 100;
  const accountId = payload.accountId;
  if(!accountId || !accounts.some(a => a.id === accountId)) return { ok:false, error:"missing_account" };
  const dueDate = payload.dueDate ? String(payload.dueDate).trim() : "";
  const note = (payload.note || "").trim();
  const editingId = payload.editingId || null;

  if(editingId){
    const idx = loans.findIndex(l => l.id === editingId);
    if(idx === -1) return { ok:false, error:"loan_not_found" };
    const loan = loans[idx];
    if(!Array.isArray(loan.repayments)) loan.repayments=[];
    if(!Array.isArray(loan.adjustments)) loan.adjustments=[];
    const oldOutstanding = loanOutstanding(loan);
    // In edit mode the entered amount means the desired CURRENT outstanding balance.
    // Store only the delta as an adjustment so repayments are never counted twice.
    const delta = Math.round((amount - oldOutstanding) * 100) / 100;
    if(Math.abs(delta) > 0.000001){
      loan.adjustments.unshift({ id:makeId(), amount:delta, date:payload.date || todayISO(), accountId:loan.accountId, note:"ปรับยอดหนี้คงเหลือ" });
    }
    loan.person = person;
    loan.dueDate = dueDate;
    loan.note = note;
    // Keep the original cash account authoritative for historical movements.
    saveLoans();
    render();
    return { ok:true, loan };
  }

  const date = payload.date || todayISO();
  const loan = { id:makeId(), person, amount, date, dueDate, note, accountId, repayments:[], adjustments:[] };
  loans.push(loan);
  saveLoans();
  return { ok:true, loan };
}

document.getElementById("addLoanBtn").addEventListener("click", () => {
  if(!accounts.length){ showToast("ยังไม่มีบัญชีเลย เพิ่มบัญชีก่อน"); return; }
  const person = prompt("ให้ใครยืม:");
  if(!person || !person.trim()) return;
  const amtStr = prompt("จำนวนเงินที่ให้ยืม (บาท):");
  const amt = parseFloat(amtStr);
  if(!amt || amt<=0) return;
  const accNames = accounts.map((a,i) => `${i+1}. ${a.name}`).join("\n");
  const accIdxStr = accounts.length===1 ? "1" : prompt(`เงินออกจากบัญชีไหน?\n${accNames}\nพิมพ์หมายเลข:`, "1");
  const accIdx = (parseInt(accIdxStr) || 1) - 1;
  const accountId = accounts[accIdx]?.id || accounts[0].id;
  const due = prompt("วันครบกำหนดคืน (YYYY-MM-DD, เว้นว่างได้):", "");

  const result = commitLoan({ person, amount: amt, accountId, dueDate: due });
  if(!result.ok) return; // เดิม validate ผ่าน prompt flow ครบแล้ว จุดนี้ไม่ควรพลาดในทางปฏิบัติ

  renderLoansManageList();
  render();
});

syncLoanRepaymentEntries();

// ===== Milestone 5: Debt Management Engine — UI =====
function renderDebtsManageList(){
  const el = document.getElementById("debtsManageList");
  let seeded=false;
  debts.forEach(d=>{ if(!Array.isArray(d.quick)){ d.quick = /^กยศ/.test(d.name||"") ? [{amount:3000,note:"ค่าครองชีพ"},{amount:9250,note:"ค่าเทอม"}] : []; seeded=true; } });
  if(seeded) saveDebts();
  const eff = h => h.type==="repayment" ? -Math.abs(h.amount) : h.type==="increase" ? Math.abs(h.amount) : Number(h.amount)||0;
  if(!debts.length){
    el.innerHTML = `<div class="empty-state">ยังไม่มีข้อมูลหนี้สิน กด "+ เพิ่มหนี้ใหม่" ด้านล่าง</div>`;
  }else{
    el.innerHTML = debts.map(d => `
      <div class="debt-card" data-id="${d.id}">
        <div class="debt-card-top">
          <div>
            <div class="debt-name">${escapeHtml(d.name)}${d.gracePeriod ? `<span class="debt-grace-badge">Grace Period</span>` : ""}</div>
            <div class="debt-balance mono">฿${fmt(d.outstandingBalance)}</div>
          </div>
          <button class="icon-btn delete-debt-btn" data-id="${d.id}" aria-label="ลบหนี้นี้" title="ลบหนี้นี้ทั้งก้อน">🗑</button>
        </div>
        <div class="debt-quick-row">
          <button class="debt-quick-btn" data-act="increase" data-id="${d.id}">＋ เพิ่มยอด</button>
          <button class="debt-quick-btn" data-act="repayment" data-id="${d.id}">− ชำระคืน</button>
          <button class="debt-quick-btn" data-act="set" data-id="${d.id}">✎ แก้ยอด</button>
        </div>
        <div class="debt-quick-row" style="flex-wrap:wrap;align-items:center">
          ${d.quick.map((x,i)=>`<span class="cat-chip-wrap"><button type="button" class="cat-chip-label" data-qi="${i}" data-id="${d.id}">+${fmt(x.amount)} ${escapeHtml(x.note||"")}</button><button type="button" class="cat-chip-del" data-qd="${i}" data-id="${d.id}" aria-label="ลบปุ่มลัด">×</button></span>`).join("")}
          <button type="button" class="cat-chip add-chip" data-act="addq" data-id="${d.id}">+ ปุ่มลัด</button>
        </div>
        <div class="debt-history">
          ${d.history.length ? d.history.slice(0,8).map(h => { const e=eff(h); return `
            <div class="debt-history-row" style="align-items:center">
              <span style="flex:1">${dayLabel(h.date)} · ${debtHistoryLabel(h.type)}${h.note ? " · "+escapeHtml(h.note) : ""}</span>
              <span class="mono" style="color:${e>0 ? 'var(--expense)' : 'var(--income)'}">${e>=0?'+':'−'}฿${fmt(Math.abs(e))}</span>
              ${h.entryId ? `<span title="เชื่อมกับรายการ กยศ. — ลบที่รายการนั้น" style="width:28px;text-align:center">🔗</span>` : `<button type="button" class="icon-btn" data-undo="${h.id}" data-id="${d.id}" aria-label="ยกเลิกรายการนี้" title="ยกเลิกรายการนี้" style="width:28px">↶</button>`}
            </div>`; }).join("") : `<div class="empty-state" style="padding:6px 0;">ยังไม่มีประวัติ</div>`}
        </div>
      </div>
    `).join("");
  }

  const select = document.getElementById("debtActionSelect");
  const prevSelected = select.value;
  select.innerHTML = debts.map(d => `<option value="${d.id}">${escapeHtml(d.name)}</option>`).join("");
  if(debts.some(d => d.id === prevSelected)) select.value = prevSelected;
  document.getElementById("debtActionAmount").value = "";
  document.getElementById("debtActionNote").value = "";

  if(el._bound) return; el._bound = true;
  el.addEventListener("click", ev => {
    const btn = ev.target.closest("button"); if(!btn) return;
    const d = debts.find(x => x.id === btn.dataset.id); if(!d) return;
    const done = msg => { renderDebtsManageList(); render(); if(msg) showToast(msg); };
    if(btn.dataset.qi !== undefined){               // ปุ่มลัด: ถามยืนยันกันกดพลาด
      const q = d.quick[+btn.dataset.qi]; if(!q) return;
      if(confirm(`เพิ่มหนี้ "${d.name}" +฿${fmt(q.amount)} (${q.note||"ไม่มีโน้ต"}) ใช่ไหม?`)){ addDebtHistory(d.id,"increase",q.amount,q.note); done("บันทึกยอดหนี้เพิ่มแล้ว (กด ↶ ถ้าพลาดได้)"); }
    }else if(btn.dataset.qd !== undefined){
      const q = d.quick[+btn.dataset.qd];
      if(q && confirm(`ลบปุ่มลัด "+${fmt(q.amount)} ${q.note||""}" ?`)){ d.quick.splice(+btn.dataset.qd,1); saveDebts(); done(); }
    }else if(btn.dataset.act === "addq"){
      const amt = parseFloat(prompt(`ปุ่มลัดของ "${d.name}" — จำนวนเงิน (บาท):`)); if(!amt || amt<=0) return;
      const note = prompt("ชื่อปุ่ม/โน้ต เช่น ค่าเทอม:","") || "";
      d.quick.push({amount:amt,note:note.trim()}); saveDebts(); done();
    }else if(btn.dataset.act){                       // เพิ่มยอด / ชำระคืน / แก้ยอด -> ชี้ฟอร์มด้านล่างมาที่หนี้นี้
      const t = btn.dataset.act;
      document.getElementById("debtActionSelect").value = d.id;
      document.getElementById("debtActionType").value = t;
      const lb = document.querySelector(".debt-action-row .field-label");
      if(lb) lb.textContent = `${{increase:"เพิ่มยอด",repayment:"ชำระคืน",set:"แก้ยอดคงค้างของ"}[t]} · ${d.name}`;
      const inp = document.getElementById("debtActionAmount");
      inp.scrollIntoView({block:"center",behavior:"smooth"}); setTimeout(()=>inp.focus(),300);
    }else if(btn.dataset.undo){                      // ยกเลิกรายการประวัติ (ย้อนยอดกลับ)
      const h = d.history.find(x => x.id === btn.dataset.undo); if(!h) return;
      const e = eff(h);
      if(!confirm(`ยกเลิกรายการนี้?\n${debtHistoryLabel(h.type)} ${e>=0?"+":"−"}฿${fmt(Math.abs(e))}${h.note?" ("+h.note+")":""}\nยอดหนี้จะย้อนกลับ ${e>=0?"ลดลง":"เพิ่มขึ้น"} ฿${fmt(Math.abs(e))}`)) return;
      d.outstandingBalance = Math.max(0, toCents(d.outstandingBalance) - toCents(e)) / 100;
      d.history = d.history.filter(x => x.id !== h.id); saveDebts(); done("ยกเลิกรายการแล้ว");
    }else if(btn.classList.contains("delete-debt-btn")){
      const linked = entries.filter(e => e.debtId===d.id && Number(e.debtPrincipalImpact||0)!==0);
      const msg = linked.length
        ? `หนี้ "${d.name}" เชื่อมกับ ${linked.length} รายการรับเงิน กยศ.\\nถ้าลบ รายการรับเงินเหล่านั้นจะยังอยู่ แต่เลิกเชื่อมกับหนี้นี้\\nลบหนี้พร้อมประวัติทั้งหมดใช่ไหม?`
        : `ลบหนี้ "${d.name}" พร้อมประวัติทั้งหมดใช่ไหม?`;
      if(!confirm(msg.replace(/\\n/g,"\n"))) return;
      linked.forEach(e => { e.debtId = null; e.debtPrincipalImpact = 0; });
      if(linked.length) saveEntries();
      debts = debts.filter(x => x.id !== d.id); saveDebts(); done("ลบหนี้แล้ว");
    }
  });
}
document.getElementById("manageDebtsBtn").addEventListener("click", () => {
  document.getElementById("debtAddForm").style.display = "none";
  renderDebtsManageList();
  document.getElementById("debtsOverlay").classList.add("open");
});
document.getElementById("closeDebtsBtn").addEventListener("click", () => {
  document.getElementById("debtsOverlay").classList.remove("open");
});
document.getElementById("debtsOverlay").addEventListener("click", () => {
  document.getElementById("debtsOverlay").classList.remove("open");
});

// ฟอร์มแก้ไข/บันทึกรายการหนี้ — ไม่ใช้ window.prompt() เด็ดขาด ใช้ input ใน Modal เท่านั้น
document.getElementById("debtActionSubmitBtn").addEventListener("click", () => {
  const debtId = document.getElementById("debtActionSelect").value;
  const actionType = document.getElementById("debtActionType").value;
  const amount = document.getElementById("debtActionAmount").value;
  const note = document.getElementById("debtActionNote").value;
  if(!debtId){ showToast("ยังไม่มีรายการหนี้ให้เลือก — เพิ่มหนี้ใหม่ก่อน"); return; }
  const amt = parseFloat(amount);
  if(!amt || amt<=0){ showToast("กรอกจำนวนเงินให้ถูกต้อง"); return; }

  const ok = (actionType === "set")
    ? setDebtBalance(debtId, amt, note)
    : addDebtHistory(debtId, actionType, amt, note);

  if(!ok){ showToast("บันทึกไม่สำเร็จ ลองใหม่อีกครั้ง"); return; }
  renderDebtsManageList();
  render();
  showToast("บันทึกแล้ว");
});

// ฟอร์มเพิ่มหนี้ใหม่ (แสดง/ซ่อนแบบ inline แทน prompt())
document.getElementById("addDebtBtn").addEventListener("click", () => {
  const formEl = document.getElementById("debtAddForm");
  const showing = formEl.style.display !== "none";
  formEl.style.display = showing ? "none" : "flex";
  if(!showing){
    document.getElementById("debtNewName").value = "";
    document.getElementById("debtNewAmount").value = "";
    document.getElementById("debtNewGrace").checked = true;
    document.getElementById("debtNewName").focus();
  }
});
document.getElementById("debtNewSubmitBtn").addEventListener("click", () => {
  const name = document.getElementById("debtNewName").value.trim();
  const amt = parseFloat(document.getElementById("debtNewAmount").value);
  const grace = document.getElementById("debtNewGrace").checked;
  if(!name){ showToast("กรอกชื่อหนี้ก่อน"); return; }
  if(isNaN(amt) || amt<0){ showToast("กรอกยอดคงค้างเริ่มต้นให้ถูกต้อง"); return; }

  debts.push({
    id: makeId(), name, type: "other", outstandingBalance: amt, gracePeriod: grace, note: "",
    history: [{ id: makeId(), type:"adjustment", amount: amt, date: todayISO(), note:"ยอดเริ่มต้น" }]
  });
  saveDebts();
  document.getElementById("debtAddForm").style.display = "none";
  renderDebtsManageList();
  render();
  showToast("เพิ่มหนี้ใหม่แล้ว");
});

// ===== Milestone 5: แจ้งเตือนเสนอเพิ่มยอดหนี้อัตโนมัติ เมื่อบันทึกรายรับหมวด "กยศ." =====
let pendingDebtBump = null; // { debtId, amount }
function showDebtBumpBanner(debt, amount){
  if(!debt) return;
  pendingDebtBump = { debtId: debt.id, amount };
  document.getElementById("debtBumpText").textContent =
    `บันทึกรายรับ "กยศ." ฿${fmt(amount)} — เพิ่มยอดหนี้ ${debt.name} ตามนี้ด้วยไหม?`;
  document.getElementById("debtBumpBanner").classList.add("show");
}
function hideDebtBumpBanner(){
  pendingDebtBump = null;
  document.getElementById("debtBumpBanner").classList.remove("show");
}
document.getElementById("debtBumpConfirmBtn").addEventListener("click", () => {
  if(!pendingDebtBump) return;
  addDebtHistory(pendingDebtBump.debtId, "increase", pendingDebtBump.amount, "จากรายรับ กยศ. อัตโนมัติ");
  hideDebtBumpBanner();
  render();
  showToast("เพิ่มยอดหนี้แล้ว");
});
document.getElementById("debtBumpDismissBtn").addEventListener("click", hideDebtBumpBanner);

// ===== Phase 4: Recurring Expenses + Upcoming Payments — UI =====

function promptFrequency(defaultVal){
  const opts = [["1","weekly","รายสัปดาห์"],["2","monthly","รายเดือน"],["3","bimonthly","ทุก 2 เดือน"],["4","quarterly","รายไตรมาส"],["5","yearly","รายปี"]];
  const defIdx = opts.findIndex(o => o[1] === defaultVal);
  const msg = "ความถี่:\n" + opts.map(o => `${o[0]}. ${o[2]}`).join("\n") + "\nพิมพ์หมายเลข:";
  const ans = prompt(msg, defIdx>=0 ? opts[defIdx][0] : "2");
  if(ans === null) return null;
  const found = opts.find(o => o[0] === String(ans).trim());
  return found ? found[1] : (defaultVal || "monthly");
}
function isValidISODate(s){
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s.trim()) && !isNaN(new Date(s.trim()).getTime());
}

// ----- Dashboard widget (แสดงย่อ 3-5 รายการใกล้ที่สุด) -----
function renderUpcomingWidget(){
  const card = document.getElementById("upcomingCard");
  if(!recurringExpenses.length){ card.style.display = "none"; return; }
  const summary = getUpcomingSummary();
  card.style.display = "block";
  document.getElementById("upcomingTotalNum").textContent = "฿" + fmt(summary.total);
  const items = getUpcomingOccurrences("30d").slice(0, 5);
  const listEl = document.getElementById("upcomingPreviewList");
  let html = "";
  if(summary.overdue > 0){
    html += `<div class="networth-sub" style="color:var(--expense)"><span>ค้างจ่าย (Overdue)</span><span class="mono">฿${fmt(summary.overdue)}</span></div>`;
  }
  if(!items.length){
    html += `<div class="networth-sub"><span>ไม่มีรายการใน 30 วันข้างหน้า</span><span></span></div>`;
  }else{
    html += items.map(({r, status, days}) => {
      const dayText = status==="overdue" ? `เลยกำหนด ${Math.abs(days)} วัน` : status==="dueToday" ? "วันนี้" : `อีก ${days} วัน`;
      const color = status==="overdue" ? "var(--expense)" : "var(--faint)";
      return `<div class="networth-sub"><span style="color:var(--ink)">${escapeHtml(r.name)} <span style="color:${color}">· ${dayText}</span></span><span class="mono">฿${fmt(r.amount)}</span></div>`;
    }).join("");
  }
  listEl.innerHTML = html;
}

// ----- Upcoming overlay: filter, summary stats, full list, mark paid / skip -----
function renderUpcomingOverlay(){
  document.getElementById("upcomingFilterSelect").value = upcomingFilter;
  const summary = getUpcomingSummary();
  document.getElementById("upcomingStatsGrid").innerHTML = `
    <div class="stat-box"><div class="stat-box-label">ค่าใช้จ่ายที่กำลังจะถึง</div><div class="stat-box-num">฿${fmt(summary.total)}</div></div>
    <div class="stat-box"><div class="stat-box-label">จำนวนรายการ</div><div class="stat-box-num">${summary.count} รายการ</div></div>
    <div class="stat-box"><div class="stat-box-label">ภายใน 7 วัน</div><div class="stat-box-num">฿${fmt(summary.within7)}</div></div>
    <div class="stat-box"><div class="stat-box-label">ภายใน 30 วัน</div><div class="stat-box-num">฿${fmt(summary.within30)}</div></div>
    <div class="stat-box"><div class="stat-box-label" style="color:var(--expense)">Overdue</div><div class="stat-box-num" style="color:var(--expense)">฿${fmt(summary.overdue)}</div></div>
    <div class="stat-box"><div class="stat-box-label">ประมาณต่อเดือน</div><div class="stat-box-num">฿${fmt(computeMonthlyRecurringCost())}</div></div>
  `;
  const items = getUpcomingOccurrences(upcomingFilter);
  const listEl = document.getElementById("upcomingFullList");
  if(!items.length){
    listEl.innerHTML = `<div class="empty-state">ไม่มีรายการที่กำลังจะถึงในช่วงนี้</div>`;
    return;
  }
  listEl.innerHTML = items.map(({r, status, days}) => {
    const dayText = status==="overdue" ? `เลยกำหนดมาแล้ว ${Math.abs(days)} วัน` : status==="dueToday" ? "ครบกำหนดวันนี้" : `อีก ${days} วัน`;
    const color = status==="overdue" ? "var(--expense)" : status==="dueToday" ? "var(--locked)" : "var(--ink)";
    const accName = accounts.find(a => a.id===r.accountId)?.name || "บัญชีที่ถูกลบ";
    const link = getReservedLinkInfo(r);
    let reservedLine;
    if(!link){
      reservedLine = `<div class="list-note">ยังไม่ได้กันเงิน</div>`;
    }else if(link.shortfall <= 0){
      reservedLine = `<div class="list-note" style="color:var(--income)">กันไว้แล้ว ฿${fmt(link.reservedAmount)} · ครบแล้ว</div>`;
    }else{
      reservedLine = `<div class="list-note" style="color:var(--expense)">กันไว้แล้ว ฿${fmt(link.reservedAmount)} · ยังขาด ฿${fmt(link.shortfall)}</div>`;
    }
    return `<div class="upcoming-item">
      <div>
        <div class="list-cat" style="color:${color}">${escapeHtml(r.name)} · ${dayText}</div>
        <div class="list-note">${frequencyLabel(r.frequency)} · ${escapeHtml(accName)} · ฿${fmt(r.amount)}</div>
        ${reservedLine}
      </div>
      <div class="upcoming-actions">
        <span class="mono" style="font-weight:600;color:var(--expense)">฿${fmt(r.amount)}</span>
        <button class="small-btn primary mark-paid-btn" data-id="${r.id}">บันทึกว่าจ่ายแล้ว</button>
        <button class="small-btn skip-recurring-btn" data-id="${r.id}">ข้ามรอบนี้</button>
      </div>
    </div>`;
  }).join("");
  listEl.querySelectorAll(".mark-paid-btn").forEach(btn => {
    btn.addEventListener("click", () => openMarkPaid(btn.dataset.id));
  });
  listEl.querySelectorAll(".skip-recurring-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const r = recurringExpenses.find(x => x.id === btn.dataset.id);
      if(!r) return;
      if(!confirm(`ข้ามรอบนี้ของ "${r.name}" ใช่ไหม? จะไม่สร้างรายจ่าย และเลื่อนไปกำหนดครั้งถัดไป`)) return;
      r.nextDueDate = computeNextDueDate(r.nextDueDate, r.frequency);
      saveRecurring();
      renderUpcomingOverlay();
      renderUpcomingWidget();
      showToast("ข้ามรอบนี้แล้ว");
    });
  });
}
document.getElementById("upcomingFilterSelect").addEventListener("change", (e) => {
  upcomingFilter = e.target.value;
  renderUpcomingOverlay();
});
document.getElementById("viewUpcomingBtn").addEventListener("click", () => {
  renderUpcomingOverlay();
  document.getElementById("upcomingOverlay").classList.add("open");
});
document.getElementById("closeUpcomingBtn").addEventListener("click", () => {
  document.getElementById("upcomingOverlay").classList.remove("open");
});
document.getElementById("upcomingOverlay").addEventListener("click", () => {
  document.getElementById("upcomingOverlay").classList.remove("open");
});

// ----- Recurring management overlay (add / edit / pause / resume / cancel / delete) -----
function renderRecurringManageList(){
  document.getElementById("monthlyRecurringNum").textContent = "฿" + fmt(computeMonthlyRecurringCost());
  const el = document.getElementById("recurringManageList");
  if(!recurringExpenses.length){
    el.innerHTML = `<div class="empty-state">ยังไม่มีค่าใช้จ่ายประจำ</div>`;
    return;
  }
  const sorted = [...recurringExpenses].sort((a,b) => a.nextDueDate.localeCompare(b.nextDueDate));
  el.innerHTML = sorted.map(r => {
    const accName = accounts.find(a => a.id===r.accountId)?.name || "บัญชีที่ถูกลบ";
    const displayStatus = r.status === "active" ? getDueStatus(r) : r.status;
    const badgeColor = (displayStatus==="overdue") ? "var(--expense)" : (displayStatus==="paused"||displayStatus==="cancelled") ? "var(--faint)" : "var(--income)";
    return `<div class="account-row" style="align-items:flex-start;">
      <span class="acc-name" style="flex-direction:column; align-items:flex-start; display:flex;">
        <span>${escapeHtml(r.name)} <span style="color:${badgeColor}">— ${statusLabel(displayStatus)}</span></span>
        <span class="mono" style="font-size:12px;color:var(--faint)">฿${fmt(r.amount)} · ${frequencyLabel(r.frequency)} · ${escapeHtml(accName)} · ครบกำหนด ${r.nextDueDate}</span>
      </span>
      <span class="acc-actions">
        <button class="icon-btn edit-recurring-btn" data-id="${r.id}" aria-label="แก้ไข">✏️</button>
        ${r.status==="active" ? `<button class="icon-btn pause-recurring-btn" data-id="${r.id}" aria-label="หยุดชั่วคราว">⏸</button>` : `<button class="icon-btn resume-recurring-btn" data-id="${r.id}" aria-label="เปิดใช้งาน">▶️</button>`}
        ${r.status!=="cancelled" ? `<button class="icon-btn cancel-recurring-btn" data-id="${r.id}" aria-label="ยกเลิก">🚫</button>` : ""}
        <button class="icon-btn delete-recurring-btn" data-id="${r.id}" aria-label="ลบ">🗑</button>
      </span>
    </div>`;
  }).join("");

  el.querySelectorAll(".edit-recurring-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const r = recurringExpenses.find(x => x.id === btn.dataset.id);
      if(!r) return;
      const name = prompt("ชื่อค่าใช้จ่ายประจำ:", r.name);
      if(!name || !name.trim()) return;
      const amtStr = prompt("จำนวนเงินโดยประมาณ (บาท):", r.amount);
      const amt = parseFloat(amtStr);
      if(!amt || amt<=0) return;
      const cats = CATS_BY_TYPE.expense;
      const catNames = cats.map((c,i) => `${i+1}. ${c}`).join("\n");
      const curCatIdx = cats.indexOf(r.category);
      const catIdxStr = prompt(`หมวดหมู่:\n${catNames}\nพิมพ์หมายเลข:`, curCatIdx>=0 ? String(curCatIdx+1) : "1");
      const catIdx = (parseInt(catIdxStr) || 1) - 1;
      const category = cats[catIdx] || r.category;
      const accNames = accounts.map((a,i) => `${i+1}. ${a.name}`).join("\n");
      const curAccIdx = accounts.findIndex(a => a.id === r.accountId);
      const accIdxStr = accounts.length===1 ? "1" : prompt(`หักจากบัญชีไหน?\n${accNames}\nพิมพ์หมายเลข:`, curAccIdx>=0 ? String(curAccIdx+1) : "1");
      const accIdx = (parseInt(accIdxStr) || 1) - 1;
      const accountId = accounts[accIdx]?.id || r.accountId;
      const frequency = promptFrequency(r.frequency);
      if(frequency === null) return;
      const nextDue = prompt("วันครบกำหนดจ่ายครั้งถัดไป (YYYY-MM-DD):", r.nextDueDate);
      if(!isValidISODate(nextDue || "")){ showToast("รูปแบบวันที่ไม่ถูกต้อง"); return; }
      const endDate = prompt("วันสิ้นสุด (YYYY-MM-DD, เว้นว่างได้):", r.endDate || "");
      const note = prompt("โน้ต:", r.note || "");
      let reservedItemId = r.reservedItemId || "";
      if(reservedItems.length){
        const curLinkIdx = reservedItems.findIndex(x => x.id === reservedItemId);
        const linkNames = "0. ไม่เชื่อมกับเงินกันไว้\n" + reservedItems.map((x,i) => `${i+1}. ${x.name} (฿${fmt(x.amount)})`).join("\n");
        const linkAns = prompt(`เชื่อมกับเงินกันไว้รายการไหน?\n${linkNames}\nพิมพ์หมายเลข:`, curLinkIdx>=0 ? String(curLinkIdx+1) : "0");
        if(linkAns !== null){
          const linkIdx = parseInt(linkAns);
          reservedItemId = (linkIdx>0 && reservedItems[linkIdx-1]) ? reservedItems[linkIdx-1].id : "";
        }
      }
      r.name = name.trim(); r.amount = amt; r.category = category; r.accountId = accountId;
      r.frequency = frequency; r.nextDueDate = nextDue.trim(); r.endDate = endDate ? endDate.trim() : "";
      r.note = note || ""; r.reservedItemId = reservedItemId;
      saveRecurring();
      renderRecurringManageList();
      renderUpcomingWidget();
      showToast("บันทึกการแก้ไขแล้ว");
    });
  });
  el.querySelectorAll(".pause-recurring-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const r = recurringExpenses.find(x => x.id === btn.dataset.id);
      if(!r) return;
      r.status = "paused"; saveRecurring(); renderRecurringManageList(); renderUpcomingWidget();
      showToast("หยุดชั่วคราวแล้ว");
    });
  });
  el.querySelectorAll(".resume-recurring-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const r = recurringExpenses.find(x => x.id === btn.dataset.id);
      if(!r) return;
      r.status = "active"; saveRecurring(); renderRecurringManageList(); renderUpcomingWidget();
      showToast("เปิดใช้งานแล้ว");
    });
  });
  el.querySelectorAll(".cancel-recurring-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      if(!confirm("ยกเลิกค่าใช้จ่ายประจำนี้ใช่ไหม? จะไม่แสดงใน Upcoming อีก แต่ประวัติการจ่ายเดิมจะยังอยู่เหมือนเดิม")) return;
      const r = recurringExpenses.find(x => x.id === btn.dataset.id);
      if(!r) return;
      r.status = "cancelled"; saveRecurring(); renderRecurringManageList(); renderUpcomingWidget();
    });
  });
  el.querySelectorAll(".delete-recurring-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      if(!confirm("ลบค่าใช้จ่ายประจำนี้ใช่ไหม? รายการที่เคยบันทึกว่าจ่ายไปแล้วจะไม่ถูกลบ")) return;
      recurringExpenses = recurringExpenses.filter(x => x.id !== btn.dataset.id);
      saveRecurring(); renderRecurringManageList(); renderUpcomingWidget();
    });
  });
}
document.getElementById("manageRecurringBtn")?.addEventListener("click", () => {
  renderRecurringManageList();
  document.getElementById("recurringOverlay").classList.add("open");
});
document.getElementById("openRecurringFromUpcomingBtn").addEventListener("click", () => {
  document.getElementById("upcomingOverlay").classList.remove("open");
  renderRecurringManageList();
  document.getElementById("recurringOverlay").classList.add("open");
});
document.getElementById("closeRecurringBtn").addEventListener("click", () => {
  document.getElementById("recurringOverlay").classList.remove("open");
});
document.getElementById("recurringOverlay").addEventListener("click", () => {
  document.getElementById("recurringOverlay").classList.remove("open");
});
document.getElementById("addRecurringBtn").addEventListener("click", () => {
  if(!accounts.length){ showToast("ยังไม่มีบัญชีเลย เพิ่มบัญชีก่อน"); return; }
  const name = prompt("ชื่อค่าใช้จ่ายประจำ เช่น ค่าเช่าห้อง, Netflix:");
  if(!name || !name.trim()) return;
  const amtStr = prompt("จำนวนเงินโดยประมาณ (บาท):");
  const amt = parseFloat(amtStr);
  if(!amt || amt<=0) return;
  const cats = CATS_BY_TYPE.expense;
  if(!cats.length){ showToast("ยังไม่มีหมวดรายจ่ายเลย เพิ่มหมวดก่อน"); return; }
  const catNames = cats.map((c,i) => `${i+1}. ${c}`).join("\n");
  const catIdxStr = prompt(`หมวดหมู่:\n${catNames}\nพิมพ์หมายเลข:`, "1");
  const catIdx = (parseInt(catIdxStr) || 1) - 1;
  const category = cats[catIdx] || cats[0];
  const accNames = accounts.map((a,i) => `${i+1}. ${a.name}`).join("\n");
  const accIdxStr = accounts.length===1 ? "1" : prompt(`หักจากบัญชีไหน?\n${accNames}\nพิมพ์หมายเลข:`, "1");
  const accIdx = (parseInt(accIdxStr) || 1) - 1;
  const accountId = accounts[accIdx]?.id || accounts[0].id;
  const frequency = promptFrequency("monthly");
  if(frequency === null) return;
  const nextDueDate = prompt("วันครบกำหนดจ่ายครั้งถัดไป (YYYY-MM-DD):", todayISO());
  if(!isValidISODate(nextDueDate || "")){ showToast("รูปแบบวันที่ไม่ถูกต้อง"); return; }
  const note = prompt("โน้ต (ไม่บังคับ):", "");
  let reservedItemId = "";
  if(reservedItems.length){
    const linkNames = "0. ไม่เชื่อมกับเงินกันไว้\n" + reservedItems.map((x,i) => `${i+1}. ${x.name} (฿${fmt(x.amount)})`).join("\n");
    const linkAns = prompt(`เชื่อมกับเงินกันไว้รายการไหนไหม? (ไม่บังคับ)\n${linkNames}\nพิมพ์หมายเลข:`, "0");
    if(linkAns !== null){
      const linkIdx = parseInt(linkAns);
      reservedItemId = (linkIdx>0 && reservedItems[linkIdx-1]) ? reservedItems[linkIdx-1].id : "";
    }
  }
  recurringExpenses.push({
    id: makeId(), name: name.trim(), amount: amt, category, accountId,
    frequency, nextDueDate: nextDueDate.trim(), startDate: nextDueDate.trim(), endDate: "",
    note: note || "", status: "active", reservedItemId, lastPaidDate: ""
  });
  saveRecurring();
  renderRecurringManageList();
  renderUpcomingWidget();
  showToast("เพิ่มค่าใช้จ่ายประจำแล้ว");
});

// ----- Forecast overlay: read-only cash flow projection (Phase 5) -----
function renderForecastOverlay(){
  document.getElementById("forecastRangeSelect").value = forecastRangePreset;
  document.getElementById("forecastCustomRow").style.display = forecastRangePreset === "custom" ? "flex" : "none";
  document.getElementById("forecastCustomDays").value = forecastCustomDays;

  const days = getForecastDays();
  const f = computeForecast(days);

  document.getElementById("forecastSummary").innerHTML = `
    <div class="networth-card" style="margin-top:4px;">
      <div class="networth-top">
        <span class="networth-label">เงินจริงตอนนี้ (ทุกบัญชี)</span>
        <span class="mono networth-num">฿${fmt(f.current)}</span>
      </div>
      <div class="networth-sub"><span>ค่าใช้จ่ายประจำที่จะถึง (${f.occurrenceCount} รายการ)</span><span class="mono" style="color:var(--expense)">-฿${fmt(f.upcoming)}</span></div>
      <div class="networth-sub" style="font-size:13.5px; font-weight:600; color:var(--ink); margin-top:10px; padding-top:10px; border-top:1px solid var(--line);">
        <span>ยอดคาดการณ์ (${days} วัน)</span>
        <span class="mono" style="color:${f.forecast<0?"var(--expense)":"var(--ink)"}">${f.forecast<0?"-":""}฿${fmt(Math.abs(f.forecast))}</span>
      </div>
      <div class="networth-sub"><span>กันไว้ (ไม่เปลี่ยนแปลง)</span><span class="mono">฿${fmt(f.reserved)}</span></div>
      <div class="networth-sub"><span>คาดการณ์ใช้ได้จริง</span><span class="mono real">${f.forecastAvailable<0?"-":""}฿${fmt(Math.abs(f.forecastAvailable))}</span></div>
    </div>
  `;

  const warnEl = document.getElementById("forecastWarnings");
  let warnHtml = "";
  f.negativeAccounts.forEach(p => {
    warnHtml += `
      <div class="forecast-warning">
        <div style="font-weight:600; color:var(--expense);">⚠️ เงินอาจไม่พอ — ${escapeHtml(p.account.name)}</div>
        <div class="list-note">คาดว่าจะติดลบวันที่ ${dayLabel(p.firstNegative.date)} · ยอดคาดการณ์ ${p.firstNegative.balance<0?"-":""}฿${fmt(Math.abs(p.firstNegative.balance))}</div>
      </div>`;
  });
  if(f.totalNegative){
    warnHtml += `
      <div class="forecast-warning">
        <div style="font-weight:600; color:var(--expense);">⚠️ ยอดรวมคาดการณ์อาจติดลบ</div>
        <div class="list-note">ภายใน ${days} วัน ยอดรวมคาดการณ์ ${f.forecast<0?"-":""}฿${fmt(Math.abs(f.forecast))}</div>
      </div>`;
  }
  warnEl.innerHTML = warnHtml;

  const timelineEl = document.getElementById("forecastTimeline");
  if(!f.timeline.length){
    timelineEl.innerHTML = `<span class="section-label">ไทม์ไลน์</span><div class="empty-state">ไม่มีค่าใช้จ่ายประจำในช่วงนี้</div>`;
  }else{
    const TIMELINE_LIMIT = 8;
    const visible = forecastTimelineExpanded ? f.timeline : f.timeline.slice(0, TIMELINE_LIMIT);
    const hiddenCount = f.timeline.length - visible.length;
    timelineEl.innerHTML = `
      <span class="section-label">ไทม์ไลน์</span>
      <div class="timeline-row">
        <span class="timeline-date">วันนี้</span>
        <div style="flex:1;"><div class="list-cat">เงินคงเหลือตอนนี้</div></div>
        <span class="mono" style="font-weight:600;">฿${fmt(f.current)}</span>
      </div>
      ${visible.map(o => {
        const accName = accounts.find(a=>a.id===o.accountId)?.name || "บัญชีที่ถูกลบ";
        return `
        <div class="timeline-row">
          <span class="timeline-date">${dayLabel(o.date)}</span>
          <div style="flex:1;">
            <div class="list-cat">${o.isOverdue ? "⚠️ ค้างจ่าย · " : "🔁 "}${escapeHtml(o.name)}</div>
            <div class="list-note">${escapeHtml(accName)}</div>
          </div>
          <span class="mono" style="text-align:right;">
            <span style="display:block; color:var(--expense);">-฿${fmt(o.amount)}</span>
            <span style="display:block; font-size:11px; color:var(--faint);">เหลือ ฿${fmt(o.runningTotal)}</span>
          </span>
        </div>`;
      }).join("")}
      ${forecastTimelineExpanded ? `<button class="breakdown-toggle" id="forecastTimelineToggle">ย่อ</button>` : (hiddenCount>0 ? `<button class="breakdown-toggle" id="forecastTimelineToggle">+ ดูอีก ${hiddenCount} รายการ</button>` : "")}
    `;
    const toggleBtn = document.getElementById("forecastTimelineToggle");
    if(toggleBtn){
      toggleBtn.addEventListener("click", () => {
        forecastTimelineExpanded = !forecastTimelineExpanded;
        renderForecastOverlay();
      });
    }
  }

  const accEl = document.getElementById("forecastByAccount");
  accEl.innerHTML = `
    <span class="section-label">แยกตามบัญชี</span>
    <div style="margin-top:8px;">
      ${f.perAccount.map(p => `
        <div class="account-row" style="align-items:flex-start;">
          <span class="acc-name" style="flex-direction:column; align-items:flex-start; display:flex;">
            <span>${escapeHtml(p.account.name)}</span>
            <span class="mono" style="font-size:12px;color:var(--faint)">ปัจจุบัน ฿${fmt(p.current)} · อนาคต -฿${fmt(p.future)}</span>
          </span>
          <span class="mono" style="font-weight:600; color:${p.forecast<0?"var(--expense)":"var(--ink)"}">${p.forecast<0?"-":""}฿${fmt(Math.abs(p.forecast))}</span>
        </div>
      `).join("")}
    </div>
  `;
}

document.getElementById("openForecastBtn").addEventListener("click", () => {
  forecastTimelineExpanded = false;
  renderForecastOverlay();
  document.getElementById("forecastOverlay").classList.add("open");
});
document.getElementById("closeForecastBtn").addEventListener("click", () => {
  document.getElementById("forecastOverlay").classList.remove("open");
});
document.getElementById("forecastOverlay").addEventListener("click", () => {
  document.getElementById("forecastOverlay").classList.remove("open");
});
document.getElementById("forecastRangeSelect").addEventListener("change", (e) => {
  forecastRangePreset = e.target.value;
  forecastTimelineExpanded = false;
  renderForecastOverlay();
});
document.getElementById("forecastCustomDays").addEventListener("input", (e) => {
  const n = parseInt(e.target.value);
  forecastCustomDays = (n > 0 && n <= 3650) ? n : forecastCustomDays;
  forecastTimelineExpanded = false;
  renderForecastOverlay();
});

// ----- Mark as Paid: สร้าง Expense Transaction จริงเมื่อกดยืนยันเท่านั้น -----
function openMarkPaid(id){
  const r = recurringExpenses.find(x => x.id === id);
  if(!r) return;
  markPaidRecurringId = id;
  document.getElementById("markPaidTitle").textContent = `บันทึกว่าจ่ายแล้ว — ${r.name}`;
  document.getElementById("markPaidAmount").value = r.amount;
  const cats = CATS_BY_TYPE.expense.length ? CATS_BY_TYPE.expense : [r.category];
  document.getElementById("markPaidCategory").innerHTML = cats.map(c =>
    `<option value="${escapeHtml(c)}" ${c===r.category ? "selected" : ""}>${escapeHtml(c)}</option>`
  ).join("");
  document.getElementById("markPaidAccount").innerHTML = accounts.map(a =>
    `<option value="${a.id}" ${a.id===r.accountId ? "selected" : ""}>${escapeHtml(a.name)}</option>`
  ).join("");
  document.getElementById("markPaidDate").value = todayISO();
  document.getElementById("markPaidNote").value = r.note || "";
  document.getElementById("upcomingOverlay").classList.remove("open");
  document.getElementById("markPaidOverlay").classList.add("open");
}
document.getElementById("closeMarkPaidBtn").addEventListener("click", () => {
  document.getElementById("markPaidOverlay").classList.remove("open");
  markPaidRecurringId = null;
});
document.getElementById("markPaidOverlay").addEventListener("click", () => {
  document.getElementById("markPaidOverlay").classList.remove("open");
  markPaidRecurringId = null;
});
document.getElementById("markPaidSubmitBtn").addEventListener("click", () => {
  const r = recurringExpenses.find(x => x.id === markPaidRecurringId);
  if(!r){ showToast("ไม่พบรายการ"); return; }
  const amt = parseFloat(document.getElementById("markPaidAmount").value);
  if(!amt || amt<=0){ showToast("กรอกจำนวนเงินให้ถูกต้อง"); return; }
  const category = document.getElementById("markPaidCategory").value || r.category;
  const accountId = document.getElementById("markPaidAccount").value || r.accountId;
  const date = document.getElementById("markPaidDate").value || todayISO();
  if(!isValidISODate(date)){ showToast("วันที่ไม่ถูกต้อง"); return; }
  const note = document.getElementById("markPaidNote").value.trim();
  // สร้าง Expense Transaction จริง — ใช้ยอดที่จ่ายจริง (อาจต่างจากยอดประมาณการของ recurring)
  entries.unshift({ id: makeId(), type: "expense", amount: amt, category, accountId, date, note, recurringId: r.id });
  saveEntries();
  r.lastPaidDate = date;
  r.nextDueDate = computeNextDueDate(r.nextDueDate, r.frequency); // เลื่อนไปครั้งถัดไป ไม่สร้างซ้ำ
  saveRecurring();
  document.getElementById("markPaidOverlay").classList.remove("open");
  markPaidRecurringId = null;
  render();
  showToast("บันทึกว่าจ่ายแล้ว");
});

// ===== Round 2: Emergency Fund UI =====
function emergencyStatusMeta(status){ return {CRITICAL:{label:"ยังไม่ถึงครึ่งเป้าหมาย",cls:"critical"},WATCH:{label:"กำลังสร้างเงินสำรอง",cls:"watch"},HEALTHY:{label:"ถึงเป้าหมายแล้ว ✓",cls:"healthy"}}[status] || {label:"กำลังประเมิน",cls:"watch"}; }
function renderEmergencyCategories(){
  const el=document.getElementById("emergencyEssentialCategories"); if(!el)return;
  const cats=CATS_BY_TYPE.expense||[]; const chosen=new Set(emergencyFundConfig.essentialCategories||[]);
  el.innerHTML=cats.map(c=>`<label class="essential-cat"><input type="checkbox" value="${escapeHtml(c)}" ${chosen.has(c)?"checked":""}> <span>${escapeHtml(c)}</span></label>`).join("");
}
function renderEmergencyPreview(){
  const e=computeEmergencyFund();
  const avg=document.getElementById("emergencyEssentialAvg"), target=document.getElementById("emergencyRecommendedTarget");
  if(avg)avg.textContent="฿"+fmt(e.monthlyEssentialExpense); if(target)target.textContent="฿"+fmt(e.recommendedEmergencyFund);
}
function openEmergencyManager(){
  const months=Number(emergencyFundConfig.targetMonths)||3; const preset=[3,6].includes(months)?String(months):"custom";
  document.getElementById("emergencyMonthsInput").value=preset;
  document.getElementById("emergencyCustomMonthsWrap").style.display=preset==="custom"?"block":"none";
  document.getElementById("emergencyCustomMonthsInput").value=preset==="custom"?months:"";
  renderEmergencyCategories(); renderEmergencyPreview(); document.getElementById("emergencyOverlay").classList.add("open");
}
function renderEmergencyDashboard(){
  const card=document.getElementById("emergencyDashboardCard"); if(!card)return; const e=computeEmergencyFund();
  card.style.display="block";
  const meta=emergencyStatusMeta(e.status);
  document.getElementById("emergencyDashboardSplit").textContent=`ออมไว้ ฿${fmt(e.emergencySaved)} + เงินสดใช้ได้ ฿${fmt(e.cashAvailable)}`;
  document.getElementById("emergencyDashboardAmount").textContent="฿"+fmt(e.currentAvailableReserve);
  document.getElementById("emergencyDashboardTarget").textContent="฿"+fmt(e.recommendedEmergencyFund);
  document.getElementById("emergencyDashboardCoverage").textContent=e.monthlyEssentialExpense>0?fmt(e.reserveCoverageMonths)+" เดือน":"ยังประเมินไม่ได้";
  document.getElementById("emergencyDashboardSub").textContent=e.recommendedEmergencyFund>0?`เป้าหมาย ${fmt(e.targetMonths)} เดือน · ค่าใช้จ่ายจำเป็นเฉลี่ย ฿${fmt(e.monthlyEssentialExpense)}`:"ยังไม่มีข้อมูลค่าใช้จ่ายจำเป็นเพียงพอ";
  const fill=document.getElementById("emergencyDashboardFill"); fill.style.width=Math.min(100,Math.max(0,e.reserveProgressPercent))+"%"; fill.style.background=e.status==="CRITICAL"?"var(--expense)":e.status==="WATCH"?"#d99a00":"var(--income)";
  document.getElementById("emergencyDashboardStatus").innerHTML=`<span class="emergency-status ${meta.cls}">${meta.label}${e.reserveShortfall>0?` · ขาด ฿${fmt(e.reserveShortfall)}`:""}</span>`;
}
document.getElementById("emergencyDashboardManageBtn")?.addEventListener("click",openEmergencyManager);
document.getElementById("closeEmergencyBtn")?.addEventListener("click",()=>document.getElementById("emergencyOverlay").classList.remove("open"));
document.getElementById("emergencyOverlay")?.addEventListener("click",()=>document.getElementById("emergencyOverlay").classList.remove("open"));
document.getElementById("emergencyMonthsInput")?.addEventListener("change",e=>{ const custom=e.target.value==="custom"; document.getElementById("emergencyCustomMonthsWrap").style.display=custom?"block":"none"; renderEmergencyPreview(); });
document.getElementById("emergencyCustomMonthsInput")?.addEventListener("input",renderEmergencyPreview);
document.getElementById("saveEmergencyBtn")?.addEventListener("click",()=>{
  const sel=document.getElementById("emergencyMonthsInput").value; let months=sel==="custom"?Number(document.getElementById("emergencyCustomMonthsInput").value):Number(sel);
  if(!isFinite(months)||months<1||months>24){showToast("จำนวนเดือนต้องอยู่ระหว่าง 1–24 เดือน");return;}
  const cats=[...document.querySelectorAll("#emergencyEssentialCategories input:checked")].map(x=>x.value);
  if(!cats.length){showToast("เลือกอย่างน้อย 1 หมวดค่าใช้จ่ายจำเป็น");return;}
  emergencyFundConfig=normalizeEmergencyConfig({targetMonths:months,essentialCategories:cats}); saveEmergencyFundConfig();
  document.getElementById("emergencyOverlay").classList.remove("open"); renderEmergencyDashboard(); render(); refreshProactiveCard(true); showToast("บันทึกเป้าหมายเงินสำรองแล้ว ✓");
});

// ===== Round 1: Budget Engine UI =====
let budgetEditingId = null;
let budgetFormKind = "expense";
function updateBudgetKindUI(){ document.querySelectorAll("#budgetKindToggle [data-bk]").forEach(b=>{const on=b.dataset.bk===budgetFormKind; b.style.background=on?"var(--accent1)":""; b.style.color=on?"#0A0A0C":""; b.style.fontWeight=on?"700":"";}); const a=document.getElementById("budgetAmountInput"); if(a) a.placeholder=budgetFormKind==="saving"?"เป้าออมต่อเดือน เช่น 3000":"เช่น 5000"; const l=document.querySelector("#budgetCategoryInput")?.previousElementSibling; if(l) l.textContent=budgetFormKind==="saving"?"เลือกหมวดออม (เลือกได้หลายอัน)":"เลือกหมวดรายจ่าย (เลือกได้หลายอัน)"; }
document.getElementById("budgetKindToggle")?.addEventListener("click",e=>{const b=e.target.closest("[data-bk]"); if(!b) return; budgetFormKind=b.dataset.bk; budgetEditingId=null; document.getElementById("saveBudgetBtn").textContent="เพิ่ม / อัปเดตงบ"; renderBudgetCategorySelect([]); updateBudgetKindUI();});
function budgetStatusMeta(status){ return {DONE:{label:"ครบเป้า ✓",cls:"safe"},SAVING:{label:"กำลังออม",cls:"watch"},SAFE:{label:"ปกติ",cls:"safe"},WATCH:{label:"เฝ้าดู",cls:"watch"},OVER:{label:"เกินงบ",cls:"over"}}[status] || {label:"ปกติ",cls:"safe"}; }
function renderBudgetCategorySelect(selected){ const el=document.getElementById("budgetCategoryInput"); if(!el)return; const cats=CATS_BY_TYPE[budgetFormKind]||[]; const sel=new Set(selected||getBudgetSelectedCats()); el.innerHTML=cats.map(c=>`<label style="display:inline-flex;align-items:center;gap:5px;padding:6px 10px;border:1px solid var(--line);border-radius:999px;font-size:12.5px;cursor:pointer;"><input type="checkbox" value="${escapeHtml(c)}" ${sel.has(c)?"checked":""} style="accent-color:var(--income);" />${escapeHtml(c)}</label>`).join(""); }
function getBudgetSelectedCats(){ return Array.from(document.querySelectorAll("#budgetCategoryInput input:checked")).map(x=>x.value); }
function openBudgetManager(){ budgetEditingId=null; budgetFormKind="expense"; document.getElementById("budgetMonthInput").value=monthKey(todayISO()); document.getElementById("budgetAmountInput").value=""; document.getElementById("saveBudgetBtn").textContent="เพิ่ม / อัปเดตงบ"; renderBudgetCategorySelect([]); document.getElementById("budgetNameInput").value=""; updateBudgetKindUI(); renderBudgetManager(); document.getElementById("budgetOverlay").classList.add("open"); }
function budgetRowHtml(r,manage){
  const sv=r.kind==="saving", m=budgetStatusMeta(r.status), w=Math.min(100,Math.max(0,r.pct));
  const col=sv?"var(--saving)":(r.status==="OVER"?"var(--expense)":r.status==="WATCH"?"#d99a00":"var(--income)");
  const rem=sv?(r.remaining<=0?`เกินเป้า ฿${fmt(Math.abs(r.remaining))} 🎉`:`อีก ฿${fmt(r.remaining)} ถึงเป้า`):(r.remaining<0?`เกิน ฿${fmt(Math.abs(r.remaining))}`:`เหลือ ฿${fmt(r.remaining)}`);
  const left=sv?`ออมแล้ว ฿${fmt(r.spent)} / ฿${fmt(r.budget)}`:`฿${fmt(r.spent)} / ฿${fmt(r.budget)}`;
  const pace=sv?(r.remainingDays>0&&r.remaining>0?`ออมเฉลี่ย ฿${fmt(r.remaining/r.remainingDays)}/วัน ที่เหลือ`:(r.remaining>0?"หมดเดือนแล้ว ยังไม่ถึงเป้า":"ถึงเป้าแล้ว")):(r.remainingDays>0?`ใช้ได้เฉลี่ย ฿${fmt(r.dailyAllowance)}/วัน`:(r.projected>r.budget?"pace สูงกว่างบ":"ครบช่วงเดือนแล้ว"));
  const tail=sv?`${fmt(r.pct)}%`:`คาดทั้งเดือน ฿${fmt(r.projected)}`;
  return `<div class="budget-row"><div class="budget-row-top"><span style="font-weight:700;">${sv?"🌱 ":""}${escapeHtml(r.category)}</span><span class="budget-status ${m.cls}">${m.label}${manage?"":" · "+fmt(r.pct)+"%"}</span></div><div class="budget-row-meta"><span>${left}</span><span>${escapeHtml(rem)}</span></div><div class="budget-mini-track"><div class="budget-mini-fill" style="width:${w}%;background:${col}"></div></div><div class="budget-row-meta"><span>${escapeHtml(pace)}</span><span>${tail}</span></div>${manage?`<div style="display:flex;justify-content:flex-end;gap:8px;margin-top:5px;"><button class="icon-btn budget-edit-btn" data-id="${escapeHtml(r.id)}">✏️</button><button class="icon-btn budget-delete-btn" data-id="${escapeHtml(r.id)}">🗑</button></div>`:""}</div>`;
}
function renderBudgetManager(){
  const month=document.getElementById("budgetMonthInput")?.value||monthKey(todayISO()), s=computeBudgetSummary(month), sv=computeBudgetSummary(month,"saving"), summaryEl=document.getElementById("budgetManageSummary"), listEl=document.getElementById("budgetManageList");
  if(summaryEl){
    let h="";
    if(s.budgetCount) h+=`<div class="networth-sub"><span>งบรายจ่ายรวม</span><span class="mono">฿${fmt(s.totalBudget)}</span></div><div class="networth-sub"><span>ใช้ไป</span><span class="mono" style="color:var(--expense)">฿${fmt(s.totalSpent)}</span></div><div class="networth-sub"><span>เหลือ</span><span class="mono" style="color:${s.totalRemaining<0?"var(--expense)":"var(--ink)"}">${s.totalRemaining<0?"-":""}฿${fmt(Math.abs(s.totalRemaining))}</span></div>`;
    if(sv.budgetCount) h+=`<div class="networth-sub"><span>เป้าออมรวม</span><span class="mono">฿${fmt(sv.totalBudget)}</span></div><div class="networth-sub"><span>ออมแล้ว</span><span class="mono" style="color:var(--saving)">฿${fmt(sv.totalSpent)} (${fmt(sv.totalPct)}%)</span></div>`;
    summaryEl.innerHTML=h||`<div class="budget-empty">ยังไม่ได้ตั้งงบสำหรับเดือน ${escapeHtml(monthLabel(month))}</div>`;
  }
  if(!listEl) return;
  const rows=s.rows.concat(sv.rows);
  listEl.innerHTML=rows.map(r=>budgetRowHtml(r,true)).join("");
  listEl.querySelectorAll(".budget-edit-btn").forEach(btn=>btn.addEventListener("click",()=>{const b=budgets.find(x=>x.id===btn.dataset.id);if(!b)return;budgetEditingId=b.id;budgetFormKind=b.kind==="saving"?"saving":"expense";document.getElementById("budgetMonthInput").value=b.month;renderBudgetCategorySelect(b.categories);updateBudgetKindUI();document.getElementById("budgetNameInput").value=b.name||"";document.getElementById("budgetAmountInput").value=b.amount;document.getElementById("saveBudgetBtn").textContent="บันทึกการแก้ไข";}));
  listEl.querySelectorAll(".budget-delete-btn").forEach(btn=>btn.addEventListener("click",()=>{const b=budgets.find(x=>x.id===btn.dataset.id);if(!b)return;if(!confirm(`ลบงบ ${b.category} เดือน ${monthLabel(b.month)} ใช่ไหม?`))return;budgets=budgets.filter(x=>x.id!==b.id);saveBudgets();budgetEditingId=null;renderBudgetManager();render();showToast("ลบงบประมาณแล้ว");}));
}
function renderBudgetDashboard(){
  const card=document.getElementById("budgetDashboardCard");if(!card)return;
  const s=computeBudgetSummary(), sv=computeBudgetSummary(monthKey(todayISO()),"saving"), bf=getBufferInfo();
  if(!s.budgetCount&&!sv.budgetCount&&!bf){card.style.display="none";return;}card.style.display="block";
  const rem=document.getElementById("budgetDashboardRemaining"), sub=document.getElementById("budgetDashboardSub"), fill=document.getElementById("budgetDashboardFill");
  if(s.budgetCount){
    rem.textContent=(s.totalRemaining<0?"-":"")+"฿"+fmt(Math.abs(s.totalRemaining));rem.style.color=s.totalRemaining<0?"var(--expense)":"var(--ink)";
    sub.textContent=`ใช้ ฿${fmt(s.totalSpent)} จาก ฿${fmt(s.totalBudget)} · ${s.overCount?`เกินงบ ${s.overCount} หมวด`:s.watchCount?`ควรเฝ้าดู ${s.watchCount} หมวด`:"อยู่ในกรอบงบ"} · เหลือ ${s.remainingDays} วัน`;
    fill.style.width=Math.min(100,Math.max(0,s.totalPct))+"%";fill.style.background=s.totalRemaining<0?"var(--expense)":s.totalPct>=80?"#d99a00":"var(--income)";
  } else {
    rem.textContent="฿"+fmt(sv.totalSpent);rem.style.color="var(--saving)";
    sub.textContent=`ออมแล้ว ฿${fmt(sv.totalSpent)} จากเป้า ฿${fmt(sv.totalBudget)} · เหลือ ${sv.remainingDays} วัน`;
    fill.style.width=Math.min(100,Math.max(0,sv.totalPct))+"%";fill.style.background="var(--saving)";
  }
  const order={OVER:0,WATCH:1,SAFE:2};
  let html=s.rows.slice().sort((a,b)=>order[a.status]-order[b.status]).map(r=>budgetRowHtml(r,false)).join("");
  if(sv.budgetCount){
    html+=`<div style="margin:14px 0 6px;font-size:12.5px;font-weight:700;display:flex;justify-content:space-between;"><span>🌱 งบรายออมเดือนนี้</span><span class="mono" style="color:var(--saving)">฿${fmt(sv.totalSpent)} / ฿${fmt(sv.totalBudget)} · ${fmt(sv.totalPct)}%</span></div>`+sv.rows.map(r=>budgetRowHtml(r,false)).join("");
  }
  if(bf){
    const low=bf.remaining<0, col=low?"var(--expense)":"var(--income)", w=bf.amount>0?Math.min(100,Math.max(0,bf.used/bf.amount*100)):0;
    html+=`<div class="budget-row" style="margin-top:12px;"><div class="budget-row-top"><span style="font-weight:700;">🛟 เงินสำรองเผื่อเหตุไม่คาดฝัน</span><span class="budget-status ${low?"over":"safe"}">${low?"เกินสำรอง":"พร้อมใช้"}</span></div><div class="budget-row-meta"><span>ใช้ไปนอกงบ ฿${fmt(bf.used)} / ฿${fmt(bf.amount)}</span><span>${low?"เกิน":"เหลือ"} ฿${fmt(Math.abs(bf.remaining))}</span></div><div class="budget-mini-track"><div class="budget-mini-fill" style="width:${w}%;background:${col}"></div></div><div class="budget-row-meta"><span>${bf.swept>0?`ย้ายไปออมแล้ว ฿${fmt(bf.swept)}`:"ถ้าสิ้นเดือนเหลือ ย้ายไปออมได้เลย"}</span><span></span></div>${bf.remaining>0?`<button type="button" id="bufferSweepBtn" class="quick-amount-btn" style="width:100%;margin-top:8px;padding:10px 0;">➡️ ย้ายเศษ ฿${fmt(bf.remaining)} ไปเป็นเงินออม</button>`:""}</div>`;
  }
  // เตือนช่วงท้ายเดือน (เหลือ ≤5 วัน)
  if(s.remainingDays<=5){
    const tips=[];
    if(bf&&bf.remaining>0) tips.push(`เงินสำรองเผื่อเหตุไม่คาดฝันเหลือ ฿${fmt(bf.remaining)} → ย้ายไปออมได้`);
    if(bf&&bf.remaining<0) tips.push(`ใช้เกินเงินสำรอง ฿${fmt(Math.abs(bf.remaining))} → เดือนหน้าลดหมวดไม่จำเป็นชดเชย`);
    if(sv.budgetCount&&sv.totalRemaining>0) tips.push(`เป้าออมยังขาด ฿${fmt(sv.totalRemaining)}`);
    if(s.overCount) tips.push(`เกินงบ ${s.overCount} หมวด`);
    if(tips.length){
      html=`<div style="margin:0 0 12px;padding:10px 12px;border:1px solid var(--line);border-radius:12px;background:var(--surface-2);font-size:12.5px;line-height:1.6;"><div style="font-weight:700;margin-bottom:2px;">🗓 ใกล้สิ้นเดือน (เหลือ ${s.remainingDays} วัน)</div>${tips.map(t=>"• "+escapeHtml(t)).join("<br>")}</div>`+html;
      try{
        const mk=monthKey(todayISO()), nid="monthend-"+mk, list=loadVaultetNotifications();
        if(!list.some(n=>n.id===nid)){ list.unshift({id:nid,icon:"🗓",title:"ใกล้สิ้นเดือนแล้ว",body:tips.join(" · "),read:false,day:todayISO(),createdAt:new Date().toISOString()}); saveVaultetNotifications(list); if(typeof renderVaultetNotifications==="function") renderVaultetNotifications(); }
      }catch(err){ console.error(err); }
    }
  }
  document.getElementById("budgetDashboardRows").innerHTML=html;
}
document.addEventListener("click",e=>{
  const b=e.target.closest&&e.target.closest("#bufferSweepBtn"); if(!b) return;
  const bf=getBufferInfo(); if(!bf||bf.remaining<=0){ showToast("ไม่มีเศษเงินสำรองให้ย้าย"); return; }
  const amt=Math.round(bf.remaining*100)/100;
  if(!confirm(`ย้ายเศษเงินสำรอง ฿${fmt(amt)} ไปบันทึกเป็นรายการออมใช่ไหม?`)) return;
  const r=sweepBufferToSaving(bf.month,amt,"เงินออม");
  if(!r.ok){ showToast(r.msg||"บันทึกไม่สำเร็จ"); return; }
  render(); showToast("ย้ายไปออมแล้ว ✓ (ลบได้ที่รายการออมถ้ากดผิด)");
});
document.getElementById("manageBudgetsBtn")?.addEventListener("click",openBudgetManager);
document.getElementById("budgetDashboardManageBtn")?.addEventListener("click",openBudgetManager);
document.getElementById("closeBudgetBtn")?.addEventListener("click",()=>document.getElementById("budgetOverlay").classList.remove("open"));
document.getElementById("budgetOverlay")?.addEventListener("click",()=>document.getElementById("budgetOverlay").classList.remove("open"));
document.getElementById("budgetMonthInput")?.addEventListener("change",()=>{budgetEditingId=null;document.getElementById("budgetAmountInput").value="";document.getElementById("saveBudgetBtn").textContent="เพิ่ม / อัปเดตงบ";renderBudgetManager();});
document.getElementById("saveBudgetBtn")?.addEventListener("click",()=>{
  const kind=budgetFormKind, month=document.getElementById("budgetMonthInput").value||monthKey(todayISO()), cats=getBudgetSelectedCats(), name=(document.getElementById("budgetNameInput").value||"").trim(), category=name||cats.join(" + "), amount=Number(document.getElementById("budgetAmountInput").value);
  if(!/^\d{4}-\d{2}$/.test(month)){showToast("เลือกเดือนให้ถูกต้อง");return;}
  if(!cats.length){showToast(kind==="saving"?"เลือกหมวดออมอย่างน้อย 1 หมวด":"เลือกหมวดรายจ่ายอย่างน้อย 1 หมวด");return;}
  const clash=budgets.find(x=>x.enabled!==false&&x.month===month&&x.id!==budgetEditingId&&(x.kind||"expense")===kind&&x.categories.some(c=>cats.includes(c))&&budgetKey(x)!==bKey(month,cats,kind));
  if(clash){showToast(`หมวดซ้ำกับงบ "${clash.category}" แล้ว`);return;}
  if(!isFinite(amount)||amount<0){showToast("กรอกจำนวนเงินให้ถูกต้อง");return;}
  const now=new Date().toISOString(), amt=Math.round(amount*100)/100;
  if(budgetEditingId){const b=budgets.find(x=>x.id===budgetEditingId);if(b){b.month=month;b.kind=kind;b.category=category;b.categories=cats;b.name=name;b.amount=amt;b.updatedAt=now;b.enabled=true;}}
  else{const existing=budgets.find(x=>x.enabled!==false&&budgetKey(x)===bKey(month,cats,kind));if(existing){existing.amount=amt;existing.updatedAt=now;}else budgets.push({id:makeId(),kind,category,categories:cats,name,amount:amt,period:"monthly",month,enabled:true,createdAt:now,updatedAt:now});}
  saveBudgets();budgetEditingId=null;document.getElementById("budgetAmountInput").value="";document.getElementById("budgetNameInput").value="";renderBudgetCategorySelect([]);document.getElementById("saveBudgetBtn").textContent="เพิ่ม / อัปเดตงบ";renderBudgetManager();render();showToast("บันทึกแล้ว ✓");
});
function renderFinancialBrainCard(){const card=document.getElementById("financialBrainCard");if(!card)return;const s=buildFinancialSnapshot(),h=s.financialBrain,b=s.behaviorSummary;card.style.display="block";document.getElementById("brainScore").textContent=h.score;document.getElementById("brainFill").style.width=h.score+"%";const m=h.status==='CRITICAL'?{l:'ต้องจัดการเร่งด่วน',c:'critical'}:h.status==='WATCH'?{l:'ควรเฝ้าดู',c:'watch'}:{l:'สุขภาพดี ✓',c:'healthy'};const st=document.getElementById("brainStatus");st.className='brain-status '+m.c;st.textContent=m.l;
const empty=s.thisMonth.income===0&&s.thisMonth.expense===0;
document.getElementById("brainSub").textContent=empty?'เดือนนี้ยังไม่มีรายการ คะแนนจึงยังไม่สะท้อนความจริง — บันทึกรายรับ/รายจ่ายก่อน':'คะแนนเต็ม 100 ยิ่งสูงยิ่งดี คิดจาก 6 ข้อด้านล่าง (ของเดือนที่ดูอยู่)';
const BT=getBrainTargets();const pct=x=>x==null?'—':fmt(x)+'%';const tm=Number(emergencyFundConfig.targetMonths)||3;
const lv=(v,good,ok,rev)=>v==null?0:(rev?(v<=good?1:v<=ok?2:3):(v>=good?1:v>=ok?2:3));
const net=s.thisMonth.netCashFlow;
const rows=[
{k:'cash',l:'เงินเข้า − เงินออก',v:empty?'—':(net<0?'ติดลบ ':'เหลือ ')+'฿'+fmt(Math.abs(net)),t:empty?0:net<0?3:1,d:'รายรับลบรายจ่ายของเดือนนี้ ควรเป็นบวก',a:net<0?'ลดรายจ่ายที่ไม่จำเป็นก่อน':''},
{k:'save',l:'อัตราออม',v:pct(b.savingsRate),t:lv(b.savingsRate,BT.savingsRatePct,BT.savingsRatePct/2),d:`ออมกี่ % ของรายรับ เป้าหมาย ${BT.savingsRatePct}% ขึ้นไป${BT.custom?' (ปรับเองเดือนนี้)':''}`,a:''},
{k:'ess',l:'ค่าใช้จ่ายจำเป็น',v:pct(h.benchmark.essentialPct),t:lv(h.benchmark.essentialPct,BT.essentialMaxPct,BT.essentialMaxPct+15,true),d:`ค่ากิน ค่าห้อง ค่าเดินทาง ฯลฯ ต่อรายรับ ไม่ควรเกิน ${BT.essentialMaxPct}%`,a:''},
{k:'dis',l:'ค่าใช้จ่ายไม่จำเป็น',v:pct(h.benchmark.discretionaryPct),t:lv(h.benchmark.discretionaryPct,BT.discretionaryMaxPct,BT.discretionaryMaxPct+10,true),d:`ของชอบ ฟุ่มเฟือย ต่อรายรับ ไม่ควรเกิน ${BT.discretionaryMaxPct}%`,a:''},
{k:'res',l:'เงินสำรองฉุกเฉิน',v:s.emergencyFund.monthlyEssentialExpense>0?fmt(s.emergencyFund.reserveCoverageMonths)+' เดือน':'—',t:s.emergencyFund.monthlyEssentialExpense>0?lv(s.emergencyFund.reserveCoverageMonths,tm,1):0,d:'ถ้าไม่มีรายได้ เงินที่มีอยู่อยู่ได้กี่เดือน เป้าหมาย '+tm+' เดือน',a:''},
{k:'bud',l:'งบประมาณ',v:s.budgetSummary.budgetCount?`${s.budgetSummary.overCount} เกินงบ · ${s.budgetSummary.watchCount} ใกล้เต็ม`:'ยังไม่ได้ตั้ง',t:s.budgetSummary.budgetCount?(s.budgetSummary.overCount?3:s.budgetSummary.watchCount?2:1):0,d:'ตั้งงบรายหมวดได้ในหน้า "แผน"',a:''}];
let hid=[];try{hid=JSON.parse(localStorage.getItem('vaultet_brain_hidden')||'[]')}catch(e){}
const ic=['⚪','🟢','🟡','🔴'],co=['var(--faint)','#52b788','#e9c46a','#ef5350'];
const shown=rows.filter(r=>!hid.includes(r.k));const edit=!!window.__brainEdit;const list=edit?rows:shown;
const fe=document.getElementById("brainFactors");fe.style.gridTemplateColumns='1fr';
fe.innerHTML=list.map(r=>{const off=hid.includes(r.k);return `<div class="brain-factor" style="${off?'opacity:.45':''}"><div style="display:flex;justify-content:space-between;align-items:center;gap:8px"><div class="brain-factor-label">${ic[r.t]} ${escapeHtml(r.l)}</div>${edit?`<button type="button" data-tog="${r.k}" class="quick-amount-btn" style="padding:4px 12px">${off?'แสดง':'ซ่อน'}</button>`:''}</div><div class="brain-factor-value" style="color:${co[r.t]}">${escapeHtml(String(r.v))}</div><div style="font-size:11px;color:var(--faint);margin-top:2px">${escapeHtml(r.d)}${r.a?' · '+escapeHtml(r.a):''}</div></div>`}).join('')+`<button type="button" id="brainEditBtn" class="manage-accounts-btn" style="width:100%">${edit?'✓ เสร็จ':'⚙ เลือกข้อที่แสดง'}</button>`;
fe.querySelectorAll('[data-tog]').forEach(x=>x.onclick=()=>{const k=x.dataset.tog;hid=hid.includes(k)?hid.filter(y=>y!==k):[...hid,k];localStorage.setItem('vaultet_brain_hidden',JSON.stringify(hid));renderFinancialBrainCard()});
document.getElementById('brainEditBtn').onclick=()=>{window.__brainEdit=!window.__brainEdit;renderFinancialBrainCard()};
const bad=shown.filter(r=>r.t===3).map(r=>r.l);
document.getElementById("brainInsight").innerHTML=empty?'🟢 ดี · 🟡 พอใช้ · 🔴 ควรแก้ · ⚪ ยังไม่มีข้อมูล':bad.length?`สิ่งที่ควรแก้ก่อน: ${escapeHtml(bad.join(', '))}`:'ตอนนี้ไม่มีข้อที่อยู่ในโซนแดง 👍';try{if(typeof renderTrendCard==='function')renderTrendCard()}catch(e){console.error(e)}}
const __baseVaultetRender=render;render=function(){__baseVaultetRender();renderBudgetDashboard();renderEmergencyDashboard();renderFinancialBrainCard();};renderBudgetDashboard();renderEmergencyDashboard();renderFinancialBrainCard();

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
  const brain=page.querySelector('#financialBrainCard');
  const notify=page.querySelector('#notificationDashboardCard');
  const backup=hero.querySelector('.backup-row');

  const shell=document.createElement('div');
  shell.className='ux-shell';
  shell.innerHTML=`<div class="ux-topbar">
    <div class="ux-brand"><div class="ux-brand-name">Vaultet</div><div class="ux-brand-page" id="uxPageName">ภาพรวม</div></div>
    <select class="ux-month" id="uxMonthSelect" aria-label="เลือกเดือน"></select>
    <button class="ux-bell" id="uxBellBtn" aria-label="การแจ้งเตือน" aria-expanded="false">🔔<i class="ux-bell-dot" id="uxBellDot" style="display:none"></i></button>
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
  const tx=makeView('transactions','รายการเงิน','ดู ค้นหา และจัดการรายรับรายจ่ายทั้งหมด');
  const plan=makeView('plan','วางแผนการเงิน','กำหนดกรอบการใช้เงินและสร้างความปลอดภัยให้การเงิน');
  const brainV=makeView('brain','Financial Brain','ให้ Vaultet วิเคราะห์สุขภาพและพฤติกรรมการเงินของคุณ');
  const more=makeView('more','เพิ่มเติม','ตั้งค่าและเครื่องมือของ Vaultet');
  const chatV=makeView('chat','AI ที่ปรึกษา','คุยแบบอิสระกับ Vaultet ได้เหมือนคุยกับที่ปรึกษาส่วนตัว');

  home.append(header,hero);
  if(upcoming) home.append(upcoming);
  if(proactive) home.append(proactive);
  if(budget) plan.append(budget);
  if(emergency) plan.append(emergency);
  if(brain) brainV.append(brain);
  if(notify) more.append(notify);
  if(backup) more.append(backup);
  if(breakdown) tx.append(breakdown);
  analyses.forEach(a=>tx.append(a));
  // Transaction history/search/filter now live at the very bottom of Overview.
  home.append(list);

  // Dedicated AI page reuses the existing chat DOM/logic.
  const aiOverlay=document.getElementById('aiAnalystOverlay');
  const aiPanel=aiOverlay ? aiOverlay.querySelector('.sheet-modal') : null;
  if(aiPanel){
    aiPanel.classList.add('ux-chat-panel');
    const note=document.createElement('div');
    note.className='ux-chat-mode-note';
    note.textContent='💬 คุย ถาม วิเคราะห์ และขอคำแนะนำเรื่องการเงินได้โดยตรง';
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
    <button class="ux-bottom-item" data-page="home"><span class="ico">⌂</span>ภาพรวม</button>
    <button class="ux-bottom-item" data-page="plan"><span class="ico">◫</span>แผน</button>
    <button class="ux-bottom-item" data-page="brain"><span class="ico">◉</span>Brain</button>
    <button class="ux-bottom-item" data-page="chat"><span class="ico">✦</span>ที่ปรึกษา AI</button>
    <button class="ux-bottom-item" data-page="more"><span class="ico">•••</span>อื่นๆ</button>`;
  document.body.append(bottom);

  const names={home:'ภาพรวม',transactions:'รายการเงิน',plan:'วางแผนการเงิน',brain:'Financial Brain',chat:'ที่ปรึกษา AI',more:'เพิ่มเติม'};
  function go(id){
    if(!views[id]) id='home';
    Object.entries(views).forEach(([k,v])=>v.classList.toggle('active',k===id));
    document.body.classList.toggle('ux-home-active',id==='home');
    document.body.classList.toggle('ux-chat-active',id==='chat');
    document.body.classList.toggle('ux-nonhome',id!=='home');
    document.body.classList.toggle('ux-more-active',id==='more');
    const pageName=document.getElementById('uxPageName');
    if(pageName) pageName.textContent=names[id]||'';
    document.querySelectorAll('.ux-bottom-item[data-page]').forEach(x=>x.classList.toggle('active',x.dataset.page===id));
    window.scrollTo({top:0,behavior:'smooth'});
    history.replaceState(null,'','#'+id);
  }

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

  const oldMonth=document.getElementById('monthSelect'), newMonth=document.getElementById('uxMonthSelect');
  if(oldMonth&&newMonth){
    newMonth.innerHTML=oldMonth.innerHTML; newMonth.value=oldMonth.value;
    newMonth.onchange=()=>{oldMonth.value=newMonth.value;oldMonth.dispatchEvent(new Event('change',{bubbles:true}))};
    oldMonth.addEventListener('change',()=>{newMonth.innerHTML=oldMonth.innerHTML;newMonth.value=oldMonth.value});
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

  // On Overview, hide floating actions while the transaction list is actually in view so they can never cover rows.
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
  // Upgrade the existing AI profile storage without breaking existing data.
  const oldLoad=window.loadAIProfile;
  window.loadAIProfile=function(){
    const canonicalRaw=localStorage.getItem(KEY);
    const base=oldLoad?oldLoad():null;
    if(!canonicalRaw){ return base || null; }
    const p=read();
    const q=p.permissions||DEFAULT.permissions;
    const out={};
    // Canonical rule: when vaultet_user_profile_v1 exists, it is authoritative.
    // Never fall back field-by-field to the legacy AI profile, otherwise an intentional
    // blank value could resurrect stale data from finance_tracker_ai_profile_v1.
    if(q.identity){out.nickname=p.nickname||'';out.firstName=p.firstName||'';out.lastName=p.lastName||'';out.age=p.age??null;} else {out.nickname='';out.firstName='';out.lastName='';out.age=null;}
    if(q.life){out.statuses=Array.isArray(p.statuses)?p.statuses:[];out.occupation=p.occupation||'';out.workType=p.workType||'';out.education=p.education||'';out.location=p.location||'';} else {out.statuses=[];out.occupation='';out.workType='';out.education='';out.location='';}
    if(q.financial){out.monthlyIncomeEstimate=p.monthlyIncomeEstimate??null;out.minReserveTarget=p.minReserveTarget??null;out.financialGoals=Array.isArray(p.financialGoals)?p.financialGoals:[];} else {out.monthlyIncomeEstimate=null;out.minReserveTarget=null;out.financialGoals=[];}
    if(q.personal){out.notes=p.notes||'';out.personalContext=p.personalContext||'';out.priorities=Array.isArray(p.priorities)?p.priorities:[];out.habits=p.habits||'';out.aiHelp=p.aiHelp||'';} else {out.notes='';out.personalContext='';out.priorities=[];out.habits='';out.aiHelp='';}
    out.permissions=q;
    // Deterministically mirror the canonical profile into the legacy key for compatibility.
    if(typeof saveAIProfile==='function') saveAIProfile({nickname:out.nickname,monthlyIncomeEstimate:out.monthlyIncomeEstimate,minReserveTarget:out.minReserveTarget,financialGoals:out.financialGoals,notes:[out.notes,out.personalContext,out.habits,out.aiHelp].filter(Boolean).join(' | '),userProfile:p});
    return out;
  };
  function summary(p){const name=p.nickname||[p.firstName,p.lastName].filter(Boolean).join(' ')||'โปรไฟล์ของฉัน';const life=p.statuses?.length?p.statuses.join(' · '):(p.occupation||'ตั้งค่าโปรไฟล์');return {name,life};}
  function refreshTrigger(){const b=document.getElementById('uxProfileTrigger');if(!b)return;const p=profile(),s=summary(p);b.querySelector('strong').textContent=s.name;b.querySelector('span').textContent=s.life;}
  function open(){const p=profile();
    const ov=document.getElementById('vaultetProfileOverlay'); if(!ov)return;
    const set=(id,v)=>{const e=document.getElementById(id);if(e)e.value=v??''};
    set('vpFirst',p.firstName);set('vpLast',p.lastName);set('vpNick',p.nickname);set('vpAge',p.age);set('vpOccupation',p.occupation);set('vpWorkType',p.workType);set('vpEducation',p.education);set('vpLocation',p.location);set('vpIncome',p.monthlyIncomeEstimate);set('vpReserve',p.minReserveTarget);set('vpNotes',p.notes);set('vpContext',p.personalContext);set('vpHabits',p.habits);set('vpHelp',p.aiHelp);
    document.querySelectorAll('[data-vp-status]').forEach(x=>x.checked=(p.statuses||[]).includes(x.value));
    document.querySelectorAll('[data-vp-priority]').forEach(x=>x.checked=(p.priorities||[]).includes(x.value));
    document.querySelectorAll('[data-vp-perm]').forEach(x=>x.checked=p.permissions[x.dataset.vpPerm]!==false); renderGoals();
    ov.classList.add('open');
  }
  function save(){const old=profile();const val=id=>document.getElementById(id)?.value?.trim()||'';const num=id=>{const n=parseFloat(document.getElementById(id)?.value);return Number.isFinite(n)&&n>=0?n:null};
    const p=Object.assign({},old,{firstName:val('vpFirst'),lastName:val('vpLast'),nickname:val('vpNick'),age:num('vpAge'),occupation:val('vpOccupation'),workType:val('vpWorkType'),education:val('vpEducation'),location:val('vpLocation'),monthlyIncomeEstimate:num('vpIncome'),minReserveTarget:num('vpReserve'),notes:val('vpNotes'),personalContext:val('vpContext'),habits:val('vpHabits'),aiHelp:val('vpHelp'),statuses:[...document.querySelectorAll('[data-vp-status]:checked')].map(x=>x.value),priorities:[...document.querySelectorAll('[data-vp-priority]:checked')].map(x=>x.value),permissions:Object.fromEntries([...document.querySelectorAll('[data-vp-perm]')].map(x=>[x.dataset.vpPerm,x.checked]))});
    p.financialGoals=old.financialGoals||[];
    if(!write(p)){ if(typeof showToast==='function')showToast('บันทึกโปรไฟล์ไม่สำเร็จ — พื้นที่จัดเก็บอาจเต็ม'); return; }
    // Keep the legacy AI profile key in sync only after the canonical write succeeds.
    if(typeof saveAIProfile==='function') saveAIProfile({nickname:p.nickname||[p.firstName,p.lastName].filter(Boolean).join(' '),monthlyIncomeEstimate:p.monthlyIncomeEstimate,minReserveTarget:p.minReserveTarget,financialGoals:p.financialGoals,notes:[p.notes,p.personalContext,p.habits,p.aiHelp].filter(Boolean).join(' | '),userProfile:p});
    refreshTrigger(); if(typeof refreshAIProfileStatus==='function')refreshAIProfileStatus(); if(typeof refreshProactiveCard==='function')refreshProactiveCard(true); document.getElementById('vaultetProfileOverlay')?.classList.remove('open'); if(typeof showToast==='function')showToast('บันทึกโปรไฟล์แล้ว');
  }
  function renderGoals(){const p=profile(),el=document.getElementById('vpGoalsList');if(!el)return;const gs=p.financialGoals||[];el.innerHTML=gs.length?gs.map(g=>`<div class="profile-permission"><span>${esc(g.name)}<small>เป้าหมาย ฿${typeof fmt==='function'?fmt(g.targetAmount):Number(g.targetAmount||0).toLocaleString('th-TH')}</small></span><button type="button" class="icon-btn vp-del-goal" data-id="${esc(g.id)}">🗑</button></div>`).join(''):'<div class="hint">ยังไม่มีเป้าหมาย — เพิ่มได้ด้านล่าง</div>';el.querySelectorAll('.vp-del-goal').forEach(b=>b.onclick=()=>{const x=profile();x.financialGoals=(x.financialGoals||[]).filter(g=>g.id!==b.dataset.id);write(x);renderGoals();refreshTrigger();if(typeof refreshProactiveCard==='function')refreshProactiveCard(true);});}
  function build(){
    const ov=document.createElement('div');ov.id='vaultetProfileOverlay';ov.className='profile-overlay';ov.innerHTML=`<div class="profile-sheet" role="dialog" aria-modal="true" aria-label="โปรไฟล์ของฉัน"><div class="profile-head"><div class="profile-big-avatar">👤</div><div><h2>โปรไฟล์ของฉัน</h2><p>ข้อมูลนี้ช่วยให้ Vaultet และ AI เข้าใจคุณมากขึ้น</p></div><button class="icon-btn profile-close" id="vpClose" aria-label="ปิด">✕</button></div><div class="profile-grid">
      <section class="profile-card"><h3>👤 ตัวตน</h3><div class="profile-fields two"><label><span class="profile-label">ชื่อ</span><input class="profile-input" id="vpFirst" placeholder="ชื่อจริง"></label><label><span class="profile-label">นามสกุล</span><input class="profile-input" id="vpLast" placeholder="นามสกุล"></label><label><span class="profile-label">ชื่อที่อยากให้เรียก</span><input class="profile-input" id="vpNick" placeholder="เช่น กอล์ฟ"></label><label><span class="profile-label">อายุ</span><input class="profile-input" id="vpAge" type="number" min="0" max="120" inputmode="numeric" placeholder="ปี"></label></div></section>
      <section class="profile-card"><h3>🎓 ชีวิตตอนนี้</h3><div class="profile-checks"><label class="profile-check"><input type="checkbox" data-vp-status value="นักเรียน">นักเรียน</label><label class="profile-check"><input type="checkbox" data-vp-status value="นักศึกษา">นักศึกษา</label><label class="profile-check"><input type="checkbox" data-vp-status value="ทำงาน">ทำงาน</label><label class="profile-check"><input type="checkbox" data-vp-status value="Freelance">Freelance</label><label class="profile-check"><input type="checkbox" data-vp-status value="ธุรกิจส่วนตัว">ธุรกิจส่วนตัว</label></div><div class="profile-fields two" style="margin-top:9px"><label><span class="profile-label">อาชีพ / งาน</span><input class="profile-input" id="vpOccupation" placeholder="เช่น Developer"></label><label><span class="profile-label">รูปแบบงาน</span><input class="profile-input" id="vpWorkType" placeholder="Full-time / Part-time"></label><label><span class="profile-label">การศึกษา</span><input class="profile-input" id="vpEducation" placeholder="มหาวิทยาลัย / คณะ"></label><label><span class="profile-label">พื้นที่ที่อยู่ (ไม่บังคับ)</span><input class="profile-input" id="vpLocation" placeholder="จังหวัด / ประเทศ"></label></div></section>
      <section class="profile-card"><h3>💰 การเงิน</h3><div class="profile-fields two"><label><span class="profile-label">รายได้ประมาณต่อเดือน</span><input class="profile-input" id="vpIncome" type="number" min="0" inputmode="decimal" placeholder="บาท"></label><label><span class="profile-label">เงินสำรองขั้นต่ำ</span><input class="profile-input" id="vpReserve" type="number" min="0" inputmode="decimal" placeholder="บาท"></label></div><div id="vpGoalsList" class="profile-fields" style="margin-top:10px"></div><div class="profile-fields two" style="margin-top:9px"><label><span class="profile-label">เพิ่มเป้าหมาย</span><input class="profile-input" id="vpGoalName" placeholder="เช่น เงินสำรอง / ซื้อรถ"></label><label><span class="profile-label">ยอดเป้าหมาย</span><input class="profile-input" id="vpGoalAmount" type="number" min="0" inputmode="decimal" placeholder="บาท"></label></div><button type="button" class="profile-save" id="vpAddGoal" style="margin-top:9px;background:var(--surface);color:var(--ink);border:1px solid var(--line)">+ เพิ่มเป้าหมาย</button><p class="hint" style="margin-top:9px">ข้อมูลบัญชีและธุรกรรมจริงยังอยู่ในระบบการเงินเดิม และ AI ใช้ประกอบคำแนะนำได้ตามสิทธิ์ที่ตั้งไว้</p></section>
      <section class="profile-card"><h3>🧭 สิ่งสำคัญสำหรับฉัน</h3><div class="profile-checks"><label class="profile-check"><input type="checkbox" data-vp-priority value="ความมั่นคง">ความมั่นคง</label><label class="profile-check"><input type="checkbox" data-vp-priority value="เก็บเงิน">เก็บเงิน</label><label class="profile-check"><input type="checkbox" data-vp-priority value="ลงทุน">ลงทุน</label><label class="profile-check"><input type="checkbox" data-vp-priority value="ท่องเที่ยว">ท่องเที่ยว</label><label class="profile-check"><input type="checkbox" data-vp-priority value="ครอบครัว">ครอบครัว</label></div></section>
      <section class="profile-card full"><h3>🧠 ให้ AI รู้จักฉัน</h3><p class="hint">ใส่บริบทที่ช่วยให้คำแนะนำเข้ากับชีวิตจริงของคุณ เช่น นิสัย เป้าหมายระยะยาว หรือสิ่งที่อยากให้ AI ช่วย</p><div class="profile-fields"><label><span class="profile-label">เกี่ยวกับฉัน</span><textarea class="profile-textarea" id="vpContext" placeholder="เช่น กำลังเรียนและทำงานพาร์ตไทม์ ปีนี้อยากเก็บเงินไปเที่ยว..."></textarea></label><label><span class="profile-label">นิสัยการใช้เงิน</span><textarea class="profile-textarea" id="vpHabits" placeholder="เช่น เวลาเครียดมักซื้อของออนไลน์..."></textarea></label><label><span class="profile-label">สิ่งที่อยากให้ AI ช่วย</span><textarea class="profile-textarea" id="vpHelp" placeholder="เช่น ช่วยเตือนเมื่อใช้เงินเกิน และช่วยวางแผนก่อนสิ้นเดือน..."></textarea></label><label><span class="profile-label">ข้อจำกัด / หมายเหตุทางการเงิน</span><textarea class="profile-textarea" id="vpNotes" placeholder="เช่น ห้ามแตะเงินออม..."></textarea></label></div></section>
      <section class="profile-card full"><h3>🤖 ข้อมูลที่ AI เข้าถึงได้</h3><p class="hint">คุณควบคุมได้ว่า AI จะนำข้อมูลประเภทไหนไปปรับคำตอบ ข้อมูลที่ปิดจะไม่ถูกใส่เป็นบริบทโปรไฟล์ของ AI</p><label class="profile-permission"><span>ตัวตน<small>ชื่อ อายุ และชื่อที่อยากให้เรียก</small></span><input class="profile-switch" type="checkbox" data-vp-perm="identity"></label><label class="profile-permission"><span>ชีวิต / การเรียน / งาน<small>สถานะ อาชีพ การศึกษา และรูปแบบงาน</small></span><input class="profile-switch" type="checkbox" data-vp-perm="life"></label><label class="profile-permission"><span>การเงินและเป้าหมาย<small>รายได้ เงินสำรอง และเป้าหมายจากโปรไฟล์</small></span><input class="profile-switch" type="checkbox" data-vp-perm="financial"></label><label class="profile-permission"><span>บริบทส่วนตัว<small>ความสนใจ นิสัย ลำดับความสำคัญ และสิ่งที่อยากให้ช่วย</small></span><input class="profile-switch" type="checkbox" data-vp-perm="personal"></label><label class="profile-permission"><span>Memory จากบทสนทนา<small>ความจำที่ AI บันทึกไว้แยกจากโปรไฟล์</small></span><input class="profile-switch" type="checkbox" data-vp-perm="memory"></label></section>
      </div><button class="profile-save" id="vpSave">บันทึกโปรไฟล์</button><button class="profile-danger" id="vpClear">ล้างข้อมูลโปรไฟล์ของฉัน</button></div>`;document.body.append(ov);
    ov.addEventListener('click',e=>{if(e.target===ov)ov.classList.remove('open')});document.getElementById('vpClose').onclick=()=>ov.classList.remove('open');document.getElementById('vpSave').onclick=save;document.getElementById('vpClear').onclick=()=>{if(confirm('ล้างข้อมูลโปรไฟล์ทั้งหมดใช่ไหม?')){localStorage.removeItem(KEY);if(typeof localStorage!=='undefined')localStorage.removeItem(AI_PROFILE_KEY);refreshTrigger();ov.classList.remove('open');if(typeof showToast==='function')showToast('ล้างโปรไฟล์แล้ว')}};document.getElementById('vpAddGoal').onclick=()=>{const n=document.getElementById('vpGoalName').value.trim(),a=parseFloat(document.getElementById('vpGoalAmount').value);if(!n||!Number.isFinite(a)||a<=0){if(typeof showToast==='function')showToast('กรอกชื่อและยอดเป้าหมายให้ถูกต้อง');return;}const x=profile();x.financialGoals=x.financialGoals||[];x.financialGoals.push({id:(typeof makeId==='function'?makeId():Date.now().toString(36)),name:n,targetAmount:a,deadline:null});if(!write(x)){if(typeof showToast==='function')showToast('บันทึกเป้าหมายไม่สำเร็จ — พื้นที่จัดเก็บอาจเต็ม');return;}document.getElementById('vpGoalName').value='';document.getElementById('vpGoalAmount').value='';renderGoals();if(typeof showToast==='function')showToast('เพิ่มเป้าหมายแล้ว');};
  }
  window.vaultetOpenProfile=open;
  function init(){build();const top=document.querySelector('.ux-topbar');if(top){const b=document.createElement('button');b.className='ux-profile-trigger';b.id='uxProfileTrigger';b.innerHTML='<div class="ux-profile-avatar">👤</div><div class="ux-profile-mini"><strong>โปรไฟล์ของฉัน</strong><span>ตั้งค่าข้อมูลส่วนตัว</span></div>';b.onclick=open;top.insertBefore(b,top.querySelector('.ux-month')||null);refreshTrigger();}}
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
    const goal=(p.financialGoals||[]).find(x=>x&&x.name);
    return {name,meta,goal:goal?`เป้าหมาย: ${goal.name}`:''};
  }
  function ensureContext(viewId){
    if(!['plan','brain','more'].includes(viewId)) return;
    const view=document.getElementById('ux-'+viewId); if(!view||view.querySelector('.ux-user-context')) return;
    const card=document.createElement('div'); card.className='ux-user-context';
    card.innerHTML='<div class="ux-user-context-avatar">👤</div><div class="ux-user-context-main"><div class="ux-user-context-name"></div><div class="ux-user-context-meta"></div><div class="ux-user-context-goal"></div></div>';
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
    ['plan','brain','more'].forEach(ensureContext);
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

  // Generic overlay scroll lock with restoration. Nested overlays are supported.
  let lockDepth=0, savedY=0;
  function syncModalLock(){
    const openCount=document.querySelectorAll('.overlay.open,.profile-overlay.open').length;
    if(openCount && lockDepth===0){
      savedY=window.scrollY||0; body.classList.add('app-modal-open'); body.style.position='fixed'; body.style.top=`-${savedY}px`; body.style.width='100%';
      lockDepth=1;
    }else if(!openCount && lockDepth){
      body.classList.remove('app-modal-open'); body.style.position=''; body.style.top=''; body.style.width=''; window.scrollTo(0,savedY); lockDepth=0;
    }
  }
  new MutationObserver(syncModalLock).observe(body,{subtree:true,attributes:true,attributeFilter:['class']});
  syncModalLock();

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

  function prepareFreshChatForSession(){
    if(window.__vaultetAiChatEntryPrepared) return;
    window.__vaultetAiChatEntryPrepared=true;
    try{
      if(typeof loadAllChats!=='function' || typeof createNewChat!=='function') return;
      const data=loadAllChats();
      const active=data?.chats?.find(c=>c.id===data.activeId);
      if(active && Array.isArray(active.messages) && active.messages.length) createNewChat();
    }catch(e){}
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
        prepareFreshChatForSession();
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
      prepareFreshChatForSession();
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
ov.innerHTML='<div style="font-size:42px">🔒</div><div style="font-size:18px;font-weight:700">Vaultet</div><input id="lockPin" type="password" inputmode="numeric" maxlength="6" placeholder="รหัส 6 หลัก" autocomplete="off" style="width:200px;text-align:center;font-size:24px;letter-spacing:8px;padding:10px;border-radius:12px;border:1px solid #333;background:#151518;color:#fff"><div id="lockMsg" style="color:#ef5350;min-height:18px;font-size:13px"></div><button id="lockForgot" style="background:none;border:0;color:#9aa;font-size:14px;text-decoration:underline">ลืมรหัส?</button>';
document.body.appendChild(ov);
const pin=ov.querySelector("#lockPin"),msg=ov.querySelector("#lockMsg");
const show=()=>{const c=get();if(!c||!c.on)return;ov.style.display="flex";pin.value="";msg.textContent="";setTimeout(()=>pin.focus(),50);};
const hide=()=>{ov.style.display="none";};
pin.addEventListener("input",()=>{const c=get();if(pin.value.length<6)return;if(c&&H(pin.value,c.salt)===c.pin)hide();else{msg.textContent="รหัสไม่ถูกต้อง";pin.value="";}});
const ask6=t=>{const p=prompt(t);if(p===null)return null;if(!/^\d{6}$/.test(p)){alert("ต้องเป็นตัวเลข 6 หลักเท่านั้น");return null;}return p;};
const newPin=()=>{const p=ask6("ตั้งรหัสใหม่ (ตัวเลข 6 หลัก):");if(!p)return null;if(prompt("พิมพ์รหัสซ้ำอีกครั้ง:")!==p){alert("รหัสไม่ตรงกัน");return null;}return p;};
const newQA=salt=>{const q=prompt("เขียนคำถามไว้กู้รหัส (เช่น สัตว์เลี้ยงตัวแรกชื่ออะไร):");if(!q||!q.trim())return null;const a=prompt("คำตอบของคำถามนี้:");if(!a||!a.trim())return null;return {q:q.trim(),a:H(a.trim().toLowerCase(),salt)};};
const verify=c=>{const o=prompt("ใส่รหัสปัจจุบัน:");if(o===null)return false;if(H(o,c.salt)!==c.pin){alert("รหัสไม่ถูกต้อง");return false;}return true;};
ov.querySelector("#lockForgot").onclick=()=>{const c=get();if(!c)return;const a=prompt("คำถามกู้รหัส:\n"+c.q);if(a===null)return;if(H(a.trim().toLowerCase(),c.salt)!==c.a){alert("คำตอบไม่ถูกต้อง");return;}const p=newPin();if(!p)return;c.pin=H(p,c.salt);c.on=true;put(c);hide();};
const openLockMenu=()=>{
  const c=get();
  if(!c){const p=newPin();if(!p)return;const salt=Math.random().toString(36).slice(2),qa=newQA(salt);if(!qa){alert("ต้องมีคำถามและคำตอบกู้รหัส");return;}put({on:true,salt,pin:H(p,salt),q:qa.q,a:qa.a});alert("เปิดล็อกแอปแล้ว");return;}
  const x=prompt("ล็อกแอป: "+(c.on?"เปิดอยู่":"ปิดอยู่")+"\n1 = "+(c.on?"ปิด":"เปิด")+"ล็อก\n2 = เปลี่ยนรหัส\n3 = เปลี่ยนคำถาม/คำตอบกู้รหัส\n4 = ลบการตั้งค่าล็อกทั้งหมด");
  if(!x||!["1","2","3","4"].includes(x.trim()))return;
  if(!verify(c))return;
  if(x==="1"){c.on=!c.on;put(c);alert(c.on?"เปิดล็อกแล้ว":"ปิดล็อกแล้ว");}
  else if(x==="2"){const p=newPin();if(p){c.pin=H(p,c.salt);put(c);alert("เปลี่ยนรหัสแล้ว");}}
  else if(x==="3"){const qa=newQA(c.salt);if(qa){c.q=qa.q;c.a=qa.a;put(c);alert("เปลี่ยนแล้ว");}}
  else{localStorage.removeItem(K);alert("ลบการตั้งค่าล็อกแล้ว");}
};
document.addEventListener("click",e=>{if(e.target.closest&&e.target.closest("#lockSettingsBtn"))openLockMenu();},true);
const addLockBtn=()=>{const more=document.getElementById("ux-more");if(!more||document.getElementById("lockSettingsBtn"))return !!more;
  const c=document.createElement("div");c.className="ux-section-card";
  c.innerHTML='<div style="font-weight:700">🔒 ล็อกแอป</div><div style="font-size:12px;color:var(--faint);margin-top:2px">ตั้งรหัส PIN 6 หลักก่อนเข้าแอป</div><button type="button" id="lockSettingsBtn" class="manage-accounts-btn" style="width:auto;padding:8px 18px;margin-top:10px">ตั้งค่าล็อก</button>';
  more.appendChild(c);return true;};
if(!addLockBtn()){let n=0;const iv=setInterval(()=>{if(addLockBtn()||++n>40)clearInterval(iv);},250);}
let t0=0;document.addEventListener("visibilitychange",()=>{if(document.hidden)t0=Date.now();else if(t0&&Date.now()-t0>60000)show();});
show();
})();

function mergeCategories(){
  const type=formType;
  const names=[...new Set([...(CATS_BY_TYPE[type]||[]),...entries.filter(e=>e.type===type&&e.category&&!e.source).map(e=>e.category)])];
  if(names.length<2){alert("มีหมวดไม่พอให้รวม");return;}
  const cnt=n=>entries.filter(e=>e.type===type&&e.category===n&&!e.source).length;
  const list=names.map((n,i)=>`${i+1}. ${n} (${cnt(n)} รายการ)`).join("\n");
  const a=prompt("รวมหมวด — เลือกหมวดที่จะ 'เลิกใช้' (พิมพ์เลข):\n"+list); if(a===null)return;
  const src=names[parseInt(a,10)-1]; if(!src){alert("เลขไม่ถูกต้อง");return;}
  const b=prompt(`ย้ายทุกอย่างของ "${src}" ไปรวมกับหมวดไหน (พิมพ์เลข):\n`+list); if(b===null)return;
  const dst=names[parseInt(b,10)-1]; if(!dst||dst===src){alert("เลขไม่ถูกต้อง หรือเลือกหมวดเดียวกัน");return;}
  if(!confirm(`รวม "${src}" เข้ากับ "${dst}"\n• ย้าย ${cnt(src)} รายการ + งบ + รายการประจำ\n• ลบหมวด "${src}" ออกจากตัวเลือก\nยืนยันไหม? (ควร export สำรองไว้ก่อน)`))return;
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
  const card=document.getElementById("financialBrainCard");if(!card)return;
  let box=document.getElementById("trendBox");
  if(!box){box=document.createElement("div");box.id="trendBox";box.style.cssText="margin-top:18px;padding-top:14px;border-top:1px solid var(--border,#2a2a2e)";card.appendChild(box);}
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
  const bar=(v,x,c)=>{const h=Math.round((v/mx)*(base-top));return `<rect x="${x}" y="${base-h}" width="${bw}" height="${h}" rx="3" fill="${c}"/>`;};
  const svg=`<svg viewBox="0 0 ${W} 155" style="width:100%;height:auto">`+rows.map((r,i)=>{const x=i*gw+(gw-bw*3-4)/2;const m=Number(r.k.slice(5))-1;
    return bar(r.inc,x,"#52b788")+bar(r.exp,x+bw+2,"#ef5350")+bar(r.sav,x+2*(bw+2),"#7aa2f7")+`<text x="${i*gw+gw/2}" y="150" text-anchor="middle" font-size="11" fill="#8a8a93">${TH[m]}</text>`;}).join("")+`<line x1="0" x2="${W}" y1="${base}" y2="${base}" stroke="#2a2a2e"/></svg>`;
  const f=n=>"฿"+Math.round(n).toLocaleString("en-US");
  const cur=rows[rows.length-1];
  const list=rows.slice().reverse().map(r=>{const m=Number(r.k.slice(5))-1;return `<div style="display:grid;grid-template-columns:44px 1fr 1fr 1fr;gap:6px;font-size:12px;padding:4px 0;border-top:1px solid #1d1d21"><span style="color:#8a8a93">${TH[m]}</span><span style="color:#52b788">${f(r.inc)}</span><span style="color:#ef5350">${f(r.exp)}</span><span style="color:#7aa2f7">${f(r.sav)}</span></div>`;}).join("");
  const repTotal=rows.reduce((a,r)=>a+r.rep,0);
  box.innerHTML=`<div style="font-weight:700;margin-bottom:2px">📈 แนวโน้มรายเดือน (สูงสุด 6 เดือน)</div>
  <div style="font-size:12px;color:var(--faint);margin-bottom:6px"><span style="color:#52b788">■</span> รายรับจริง <span style="color:#ef5350">■</span> รายจ่าย <span style="color:#7aa2f7">■</span> ออม</div>${svg}
  <div style="display:grid;grid-template-columns:44px 1fr 1fr 1fr;gap:6px;font-size:11px;color:#8a8a93;margin-top:6px"><span></span><span>รับจริง</span><span>จ่าย</span><span>ออม</span></div>${list}
  <div style="font-size:12px;color:var(--faint);margin-top:8px">รายรับจริง = ไม่รวมเงินที่คนอื่นคืนค่ายืม (รวม ${f(repTotal)} ตามรายการ "เงินคืนจากการยืม" ซึ่งเป็นเงินเดิมที่ให้ยืมไป ไม่ใช่รายได้ใหม่) และเงินที่ถอนจากเงินออม</div>`;
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
  const t=jget(TK);
  row.innerHTML=t.map((x,i)=>x.type!==formType?"":`<span class="cat-chip-wrap"><button type="button" class="cat-chip-label" data-use="${i}">⚡ ${esc2(x.name)} ฿${num(x.amount)}</button><button type="button" class="cat-chip-del" data-del="${i}" aria-label="ลบเทมเพลต">×</button></span>`).join("")+`<button type="button" class="cat-chip add-chip" id="tplSave">+ บันทึกเป็นเทมเพลต</button>`;
}
document.addEventListener("click",e=>{
  const row=document.getElementById("tplRow");if(!row||!e.target.closest||!e.target.closest("#tplRow"))return;
  const use=e.target.closest("[data-use]"),del=e.target.closest("[data-del]");
  const t=jget(TK);
  if(use){const x=t[+use.dataset.use];if(!x)return;
    selectedCategory=x.category;setFormType(x.type,true,null);
    const a=document.getElementById("amount");a.value=x.amount;a.dispatchEvent(new Event("input"));
    document.getElementById("note").value=x.note||"";
    renderCatGrid();
  }else if(del){const x=t[+del.dataset.del];if(x&&confirm(`ลบเทมเพลต "${x.name}"?`)){t.splice(+del.dataset.del,1);jput(TK,t);renderTpl();}}
  else if(e.target.closest("#tplSave")){
    const amt=parseFloat(document.getElementById("amount").value);
    if(formType==="transfer"||!amt||amt<=0||!selectedCategory){alert("กรอกจำนวนเงินและเลือกหมวด (รายจ่าย/รายรับ/ออม) ก่อน แล้วค่อยกดบันทึกเป็นเทมเพลต");return;}
    const note=document.getElementById("note").value.trim();
    const name=prompt("ตั้งชื่อเทมเพลต:",note||selectedCategory);if(!name||!name.trim())return;
    t.push({id:Date.now().toString(36),name:name.trim(),type:formType,category:selectedCategory,amount:amt,note});
    jput(TK,t);renderTpl();showToast("บันทึกเทมเพลตแล้ว");
  }
},true);
renderTpl();
const _sft=setFormType;setFormType=function(){const r=_sft.apply(this,arguments);renderTpl();return r;};
/* ===== เป้าหมายเก็บเงิน ===== */
function renderGoalsBox(){
  const card=document.getElementById("financialBrainCard");if(!card)return;
  let box=document.getElementById("goalsBox");
  if(!box){box=document.createElement("div");box.id="goalsBox";box.style.cssText="margin-top:18px;padding-top:14px;border-top:1px solid var(--border,#2a2a2e)";card.appendChild(box);
    box.addEventListener("click",ev=>{
      const g=jget(GK);
      if(ev.target.closest("#goalAdd")){
        const name=prompt("ชื่อเป้าหมาย (เช่น ซื้อโน้ตบุ๊ก):");if(!name||!name.trim())return;
        const target=parseFloat(prompt("ต้องการเก็บให้ได้กี่บาท:"));if(!target||target<=0){alert("จำนวนเงินไม่ถูกต้อง");return;}
        const saved=parseFloat(prompt("ตอนนี้เก็บได้แล้วเท่าไร (ไม่มีใส่ 0):","0"))||0;
        const dl=(prompt("วันที่อยากได้ครบ รูปแบบ ปปปป-ดด-วว เช่น 2026-12-31 (ไม่กำหนดให้เว้นว่าง):","")||"").trim();
        if(dl&&!/^\d{4}-\d{2}-\d{2}$/.test(dl)){alert("รูปแบบวันที่ไม่ถูกต้อง");return;}
        g.push({id:Date.now().toString(36),name:name.trim(),target,saved,deadline:dl});jput(GK,g);renderGoalsBox();return;}
      const add=ev.target.closest("[data-gadd]"),del=ev.target.closest("[data-gdel]");
      if(add){const x=g.find(y=>y.id===add.dataset.gadd);if(!x)return;
        const v=parseFloat(prompt(`"${x.name}" — เพิ่มเงินเก็บกี่บาท (ใส่ติดลบถ้าเอาออก):`));
        if(!v)return;x.saved=Math.max(0,(x.saved||0)+v);jput(GK,g);renderGoalsBox();
      }else if(del){const x=g.find(y=>y.id===del.dataset.gdel);if(x&&confirm(`ลบเป้าหมาย "${x.name}"?`)){jput(GK,g.filter(y=>y.id!==x.id));renderGoalsBox();}}
    });}
  const g=jget(GK),today=new Date();today.setHours(0,0,0,0);
  const items=g.map(x=>{
    const left=Math.max(0,x.target-(x.saved||0)),pct=Math.min(100,Math.round((x.saved||0)/x.target*100));
    let info=left===0?"🎉 ครบเป้าแล้ว!":"ขาดอีก ฿"+num(left);
    if(left>0&&x.deadline){const days=Math.ceil((new Date(x.deadline+"T00:00:00")-today)/86400000);
      info+=days<=0?" · เลยกำหนดแล้ว":` · เหลือ ${days} วัน ต้องเก็บวันละ ฿${num(left/days)}`+(days>=30?` (เดือนละ ฿${num(left/(days/30))})`:"");}
    return `<div style="padding:10px 0;border-top:1px solid #1d1d21"><div style="display:flex;justify-content:space-between;align-items:center;gap:8px"><b>${esc2(x.name)}</b><span><button type="button" data-gadd="${x.id}" class="quick-amount-btn">＋เงิน</button> <button type="button" data-gdel="${x.id}" style="background:none;border:0;color:var(--faint)">🗑</button></span></div><div style="height:8px;border-radius:6px;background:#26262b;margin:8px 0 4px"><div style="height:8px;border-radius:6px;width:${pct}%;background:#52b788"></div></div><div style="font-size:12px;color:var(--faint)">฿${num(x.saved||0)} / ฿${num(x.target)} (${pct}%) · ${esc2(info)}</div></div>`;}).join("");
  box.innerHTML=`<div style="display:flex;justify-content:space-between;align-items:center"><div style="font-weight:700">🎯 เป้าหมายเก็บเงิน</div><button type="button" id="goalAdd" class="quick-amount-btn">+ เพิ่ม</button></div>${items||'<div style="font-size:12px;color:var(--faint);margin-top:8px">ยังไม่มีเป้าหมาย กด + เพิ่ม ได้เลย</div>'}<div style="font-size:11px;color:var(--faint);margin-top:8px">ยอดในเป้าหมายจดเองด้วยปุ่ม ＋เงิน ไม่ได้ผูกกับยอดบัญชี</div>`;
}
const _rt=renderTrendCard;renderTrendCard=function(){_rt();renderGoalsBox();};
})();

(function(){
const QK="vaultet_quick_amounts_v1";
const get=()=>{const r=localStorage.getItem(QK);if(r===null)return [20,50,100,500];try{const a=JSON.parse(r);return Array.isArray(a)?a:[20,50,100,500]}catch(e){return [20,50,100,500]}};
const put=a=>{try{localStorage.setItem(QK,JSON.stringify(a))}catch(e){}};
function render(){const el=document.getElementById("qaChips");if(!el)return;
  el.innerHTML=get().map((n,i)=>`<span class="cat-chip-wrap"><button type="button" class="cat-chip-label" data-qa="${n}">+${n}</button><button type="button" class="cat-chip-del" data-qd="${i}" aria-label="ลบ +${n}">×</button></span>`).join("")+`<button type="button" class="cat-chip add-chip" id="qaAdd">+ เพิ่มตัวเลข</button>`;}
document.addEventListener("click",e=>{
  if(!e.target.closest)return;const box=e.target.closest("#qaChips");if(!box)return;
  const use=e.target.closest("[data-qa]"),del=e.target.closest("[data-qd]");
  if(use){const inp=document.getElementById("amount");inp.value=(toCents(parseFloat(inp.value)||0)+toCents(parseFloat(use.dataset.qa)))/100;inp.dispatchEvent(new Event("input"));}
  else if(del){const a=get();a.splice(+del.dataset.qd,1);put(a);render();}
  else if(e.target.closest("#qaAdd")){const v=parseFloat(prompt("เพิ่มตัวเลขปุ่มลัด (บาท) เช่น 40:"));if(!v||v<=0)return;const a=get();if(!a.includes(v)){a.push(v);a.sort((x,y)=>x-y);put(a);}render();}
},true);
render();
try{renderTrendCard();}catch(e){console.error(e);}
})();

function renderSpendCard(){
  const plan=document.getElementById("ux-plan");if(!plan)return;
  let card=document.getElementById("spendSummaryCard");
  if(!card){card=document.createElement("div");card.id="spendSummaryCard";
    const ref=document.getElementById("emergencyDashboardCard");card.className=ref?ref.className:"";card.style.display="block";
    const bud=document.getElementById("budgetDashboardCard");
    if(bud&&bud.parentNode===plan)bud.after(card);else plan.appendChild(card);}
  const esc=t=>String(t).replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
  const f=n=>"฿"+Math.round(n).toLocaleString("en-US");
  const mk=selectedMonth,[y,m]=mk.split("-").map(Number);
  const pk=new Date(y,m-2,1);const prevKey=pk.getFullYear()+"-"+String(pk.getMonth()+1).padStart(2,"0");
  const inM=k=>entries.filter(e=>e.type==="expense"&&e.date&&e.date.slice(0,7)===k);
  const ex=inM(mk),total=ex.reduce((a,e)=>a+(Number(e.amount)||0),0),prev=inM(prevKey).reduce((a,e)=>a+(Number(e.amount)||0),0);
  const now=new Date(),isCur=now.getFullYear()===y&&now.getMonth()+1===m;
  const days=isCur?now.getDate():new Date(y,m,0).getDate();
  const head=`<div style="display:flex;justify-content:space-between;align-items:baseline"><div style="font-weight:700;font-size:16px">📊 เงินเดือนนี้ไปไหนบ้าง</div><div class="mono" style="font-size:20px;font-weight:700;color:var(--expense,#ef5350)">${f(total)}</div></div>`;
  if(!ex.length){card.innerHTML=head+'<div style="font-size:12px;color:var(--faint);margin-top:8px">ยังไม่มีรายจ่ายในเดือนนี้</div>';return;}
  const cats={};
  ex.forEach(e=>{const c=e.category||"อื่นๆ",a=Number(e.amount)||0;const o=cats[c]||(cats[c]={sum:0,n:0,items:{}});o.sum+=a;o.n++;
    const nm=(e.note||"").trim()||"(ไม่มีโน้ต)";const it=o.items[nm.toLowerCase()]||(o.items[nm.toLowerCase()]={name:nm,sum:0,n:0});it.sum+=a;it.n++;});
  const list=Object.entries(cats).sort((a,b)=>b[1].sum-a[1].sum);
  const big=ex.reduce((a,e)=>(Number(e.amount)||0)>(Number(a.amount)||0)?e:a,ex[0]);
  const byDay={};ex.forEach(e=>byDay[e.date]=(byDay[e.date]||0)+(Number(e.amount)||0));
  const bd=Object.entries(byDay).sort((a,b)=>b[1]-a[1])[0];
  const diff=prev>0?Math.round((total-prev)/prev*100):null;
  const cmp=prev>0?`เดือนก่อน ${f(prev)} (${diff>0?"▲ +":diff<0?"▼ ":""}${diff}%)`:"ยังไม่มีข้อมูลเดือนก่อนให้เทียบ";
  const pal=["#ef5350","#f4a261","#e9c46a","#52b788","#7aa2f7","#b388eb","#8a8a93"];
  const rows=list.map(([c,o],i)=>{const pct=Math.round(o.sum/total*100),col=pal[Math.min(i,pal.length-1)];
    const items=Object.values(o.items).sort((a,b)=>b.sum-a.sum).map(it=>`<div style="display:flex;justify-content:space-between;gap:8px;font-size:12px;padding:5px 0 0;color:var(--faint)"><span>${esc(it.name)} · ${it.n} ครั้ง</span><span class="mono">${f(it.sum)}</span></div>`).join("");
    return `<details style="padding:10px 0;border-top:1px solid var(--line,#26262b)"><summary style="list-style:none;cursor:pointer"><div style="display:flex;justify-content:space-between;gap:8px"><b>${esc(c)}</b><span class="mono">${f(o.sum)}</span></div><div style="height:7px;border-radius:5px;background:#26262b;margin:6px 0 3px"><div style="height:7px;border-radius:5px;width:${pct}%;background:${col}"></div></div><div style="font-size:11px;color:var(--faint)">${o.n} ครั้ง · เฉลี่ยครั้งละ ${f(o.sum/o.n)} · ${pct}% ของรายจ่าย ▾</div></summary>${items}</details>`;}).join("");
  card.innerHTML=head+`<div style="font-size:12px;color:var(--faint);margin:4px 0 10px">${ex.length} ครั้ง · เฉลี่ยวันละ ${f(total/days)} · ${cmp}</div>`+rows+
   `<div style="font-size:12px;color:var(--faint);border-top:1px solid var(--line,#26262b);padding-top:10px;margin-top:2px;line-height:1.7">💸 ก้อนใหญ่สุด: ${esc((big.note||"").trim()||big.category||"-")} ${f(big.amount)}<br>📅 วันที่ใช้เยอะสุด: ${bd[0].slice(8)}/${bd[0].slice(5,7)} (${f(bd[1])})</div><div style="font-size:11px;color:var(--faint);margin-top:6px">แตะที่หมวดเพื่อดูว่าใช้กับรายการอะไรบ้าง</div>`;
}
(function(){const _r=render;render=function(){_r();try{renderSpendCard()}catch(e){console.error(e)}};setTimeout(()=>{try{renderSpendCard()}catch(e){console.error(e)}},600);})();

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
    let title='สิ่งที่ควรรู้', summary=plain(it.action)||'มีประเด็นที่ควรตรวจสอบ', rows=[];
    switch(it.type){
      case 'LIQUIDITY_FORECAST':
        title='เงินสดอาจตึงตัวก่อนสิ้นเดือน';
        summary=`คาดว่าเงินที่ใช้ได้ตอนสิ้นเดือนจะเหลือ ${num(d.forecastAvailable)<0?'ติดลบ ':''}${baht(d.forecastAvailable)} หลังหักรายจ่ายที่ระบบรู้ว่ากำลังจะมา`;
        rows=[['คาดว่าเหลือสิ้นเดือน',(num(d.forecastAvailable)<0?'-':'')+baht(d.forecastAvailable)],['รายจ่ายที่กำลังจะมา',baht(d.upcoming)]];break;
      case 'MIN_BUFFER':{
        const a=num(d.available),t=num(d.target!==undefined?d.target:d.minReserveTarget);
        title='เงินกันชนต่ำกว่าที่ตั้งไว้';
        summary=`เงินสดที่ใช้ได้รวมเงินสำรองฉุกเฉิน ${baht(a)} ต่ำกว่าเป้าขั้นต่ำที่คุณตั้งไว้ ${baht(t)}${t>a?' (ขาดอีก '+baht(t-a)+')':''}`;
        rows=[['เงินที่มีอยู่ (ใช้ได้ + สำรองฉุกเฉิน)',baht(a)],['เป้าขั้นต่ำที่ตั้งไว้',baht(t)],['ส่วนที่ขาด',baht(Math.max(0,t-a))]];break;}
      case 'OBLIGATION_SHORTFALL':{
        const st=String(d.status||'');const stT=st==='overdue'?'เลยกำหนดแล้ว':st==='dueToday'?'ครบกำหนดวันนี้':'ใกล้ถึงกำหนด';
        title=`ภาระ "${d.name||'รายการ'}" ยังกันเงินไม่พอ`;
        summary=`${d.name||'รายการนี้'} ${stT} ต้องจ่าย ${baht(d.amount)} แต่เงินที่กันไว้ยังขาดอีก ${baht(d.shortfall)}`;
        rows=[['ยอดที่ต้องจ่าย',baht(d.amount)],['ที่ยังขาด',baht(d.shortfall)],['สถานะ',stT]];
        if(d.nextDueDate)rows.push(['วันครบกำหนด',String(d.nextDueDate)]);break;}
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
    return {title,summary,rows,todo:plain(it.action),sev};
  }

  let items=[];
  window.vaultetRenderAdvisorPreview=function(list){
    items=(list||[]).slice(0,3);
    const target=document.getElementById('notificationPreviewList'); if(!target)return;
    if(!items.length){target.innerHTML='<div class="notification-empty">ตอนนี้ไม่มีเรื่องสำคัญที่ต้องลงมือทำ 🎉</div>';return;}
    target.innerHTML=items.map((it,i)=>{
      const h=human(it), acked=isAcked(it);
      const icon=acked?'✅':(it.severity==='critical'?'🚨':'⚠️');
      return `<div class="notification-item ${(!acked&&it.severity==='critical')?'unread':''} ${acked?'acked':''}" data-adv-idx="${i}"><div class="notification-icon">${icon}</div><div class="notification-content"><div class="notification-item-title">${escapeHtml(h.title)}</div><div class="notification-item-body">${escapeHtml(h.summary)}</div></div><div class="adv-chevron">›</div></div>`;
    }).join('');
  };

  function closeSheet(){document.getElementById('advDetailOverlay')?.remove();}
  function openSheet(i){
    const it=items[i]; if(!it)return; const h=human(it); closeSheet();
    const ov=document.createElement('div'); ov.id='advDetailOverlay';
    const rowsHtml=h.rows.length?`<div class="adv-h">ตัวเลขที่เกี่ยวข้อง</div>`+h.rows.map(r=>`<div class="adv-row"><span>${escapeHtml(r[0])}</span><span>${escapeHtml(r[1])}</span></div>`).join(''):'';
    const acked=isAcked(it);
    ov.innerHTML=`<div class="adv-sheet" role="dialog" aria-modal="true"><span class="adv-chip ${h.sev}">${h.sev==='critical'?'สำคัญมาก':'ควรดู'}</span><h3 class="adv-title">${escapeHtml(h.title)}</h3><p class="adv-summary">${escapeHtml(h.summary)}</p>${rowsHtml}${h.todo?`<div class="adv-h">ควรทำอะไร</div><div class="adv-todo">${escapeHtml(h.todo)}</div>`:''}<div class="adv-actions"><button type="button" class="adv-ack">${acked?'รับทราบแล้ว ✓':'รับทราบ'}</button><button type="button" class="adv-close">ปิด</button></div><div class="adv-note">กดรับทราบแล้วการ์ดจะเป็นสีเทา และจะกลับมาเตือนอีกถ้าเรื่องนี้ยังอยู่หลังผ่านไป ${ACK_DAYS} วัน</div></div>`;
    ov.addEventListener('click',e=>{if(e.target===ov)closeSheet();});
    ov.querySelector('.adv-close').addEventListener('click',closeSheet);
    ov.querySelector('.adv-ack').addEventListener('click',()=>{ack(it);closeSheet();window.vaultetRenderAdvisorPreview(items);try{showToast('รับทราบแล้ว ✓');}catch(_){}});
    document.body.appendChild(ov);
  }
  document.addEventListener('click',e=>{
    const el=e.target.closest&&e.target.closest('#notificationPreviewList .notification-item[data-adv-idx]');
    if(el)openSheet(Number(el.dataset.advIdx));
  });
  try{ if(typeof renderVaultetNotifications==='function') renderVaultetNotifications(); }catch(_){}
})();

try{pruneEmptyChats();}catch(e){}

(function(){
  const INVEST_CAT='ลงทุน';
  const PF_OPEN_KEY='vaultet_portfolio_open_v1';
  const PF_PRICE_KEY='vaultet_pf_prices_v1';
  const PF_APIKEY_KEY='finance_tracker_twelvedata_key_v1';
  const DIRTY_DAY_KEY='vaultet_dirty_notice_day_v1';
  const SYNCED_HASH_KEY='vaultet_drive_synced_hash_v1';
  const PF_SELL_KEY='vaultet_portfolio_sells_v1';
  try{ [PF_PRICE_KEY,PF_APIKEY_KEY,DIRTY_DAY_KEY,SYNCED_HASH_KEY].forEach(k=>VAULTET_BACKUP_EXCLUDED_KEYS.add(k)); }catch(_){}

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
  overlay.innerHTML=`<div class="pf-top"><button type="button" class="pf-iconbtn" id="pfClose" aria-label="ปิด">✕</button><div class="pf-title">📈 พอร์ตหุ้น</div><button type="button" class="pf-iconbtn" id="pfRefresh" aria-label="รีเฟรชราคา">↻</button></div><div class="pf-body" id="pfBody"></div><div class="pf-bottom"><button type="button" id="pfAddOpen">ยอดยกมา</button><button type="button" class="primary" id="pfAddBuy">+ บันทึกการซื้อ</button></div><div id="pfOpenSheet"><div class="box"><h3>ยอดยกมา</h3><p>หุ้นที่ซื้อไว้ก่อนหน้านี้ กรอกครั้งเดียวต่อหุ้น (ถือรวมกี่หุ้น จ่ายไปรวมกี่บาท) ไม่ต้องไล่แก้รายการเก่าทีละอัน</p><label>ชื่อหุ้น/ETF</label><input id="pfOpTicker" type="text" placeholder="เช่น QQQM" autocapitalize="characters" autocomplete="off"><label>จำนวนหุ้นที่ถืออยู่</label><input id="pfOpShares" type="number" inputmode="decimal" step="any" min="0" placeholder="เช่น 0.0295991"><label>ต้นทุนรวมที่จ่ายไป (บาท)</label><input id="pfOpCost" type="number" inputmode="decimal" step="any" min="0" placeholder="เช่น 100"><div class="btns"><button type="button" id="pfOpCancel">ยกเลิก</button><button type="button" class="ok" id="pfOpSave">บันทึก</button></div></div></div>`;
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
    const c=readCache(); if(lsGet(PF_APIKEY_KEY) && Object.keys(lotsByTicker()).length && Date.now()-c.fetchedAt>6*3600*1000) refreshPrices();
  }
  function closePf(){ overlay.classList.remove('open'); }

  overlay.addEventListener('click',e=>{
    const t=e.target;
    if(t.closest('#pfClose')) return closePf();
    if(t.closest('#pfRefresh')){ refreshPrices().then(r=>{ if(r&&r.reason==='no_key') showToast('ใส่ API key ด้านล่างก่อน'); else if(r&&r.reason==='no_holdings') showToast('ยังไม่มีหุ้นในพอร์ต'); else if(r&&r.ok) showToast('อัปเดตราคาแล้ว ✓'); }); return; }
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
      const v=prompt('ราคาต่อหุ้นของ '+tk+' (USD):',cur);
      const p=pfNum(v); if(p>0){ c.quotes[tk]={price:p,prev:null,pct:null,at:Date.now(),manual:true}; writeCache(c); render(); }
      return;
    }
    const buy=t.closest('[data-buy]'); if(buy) return startBuy(buy.dataset.buy);
    const lot=t.closest('[data-lot]');
    if(lot){
      if(lot.dataset.lot==='sell'){ delSell(lot.dataset.id); } else if(lot.dataset.lot==='open'){ if(confirm('ลบยอดยกมานี้ใช่ไหม?')){ setOpen(getOpen().filter(o=>o.id!==lot.dataset.id)); render(); } }
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
  function delSell(id){ if(!confirm('ลบรายการขายนี้? รายรับที่เกี่ยวข้องจะถูกลบด้วย')) return; const a=getSells(), x=a.find(q=>q.id===id); setSells(a.filter(q=>q.id!==id));
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
    sell.classList.remove('open'); render(); try{ renderAccountsSummary(); }catch(_){} showToast('บันทึกการขายแล้ว ✓');
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
  const old=document.getElementById('manageBudgetsBtn');
  if(old){ const nb=old.cloneNode(true); nb.id='openPortfolioBtn'; nb.textContent='📈 พอร์ตหุ้น'; old.replaceWith(nb); nb.addEventListener('click',openPf); }

  /* ---------- ดึงราคาเองวันละครั้งตอนเปิดแอป ---------- */
  setTimeout(()=>{
    try{
      const c=readCache(), today=new Date().toDateString();
      if(lsGet(PF_APIKEY_KEY) && Object.keys(lotsByTicker()).length && (!c.fetchedAt || new Date(c.fetchedAt).toDateString()!==today)) refreshPrices();
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
  let firstOfDay=null;
  function renderDirty(){
    let show=false;
    try{
      const clientId=lsGet(GDRIVE_CLIENT_ID_KEY), fileId=lsGet(GDRIVE_FILE_ID_KEY);
      if(clientId&&fileId&&!sessionStorage.getItem('vaultet_dirty_dismissed')){
        const tokenOk=!!(gdriveAccessToken&&Date.now()<gdriveAccessTokenExpiry), auto=lsGet(GDRIVE_AUTOSYNC_KEY)==='1';
        if(!(tokenOk&&auto)) show=(lsGet(SYNCED_HASH_KEY)!==coreHash());
      }
    }catch(_){ show=false; }
    if(show&&firstOfDay===null){ firstOfDay=(lsGet(DIRTY_DAY_KEY)!==todayISO()); lsSet(DIRTY_DAY_KEY,todayISO()); }
    bn.classList.toggle('show',show);
    if(!show) return;
    bn.classList.toggle('first',!!firstOfDay);
    bn.innerHTML=(firstOfDay
      ?`<span><b>☁️ มีข้อมูลที่ยังไม่ได้สำรองขึ้น Google Drive</b><small>กดสำรองเลย หน้าต่าง Google จะแวบขึ้นมาแป๊บเดียว</small></span>`
      :`<span>วันนี้ยังไม่ได้สำรองขึ้น Drive</span>`)
      +`<span style="display:flex;gap:6px;align-items:center"><button type="button" id="ddNow">สำรองเลย</button><button type="button" class="dismiss" id="ddX" aria-label="ปิด">✕</button></span>`;
  }
  bn.addEventListener('click',e=>{
    if(e.target.closest('#ddX')){ try{ sessionStorage.setItem('vaultet_dirty_dismissed','1'); }catch(_){} bn.classList.remove('show'); return; }
    if(e.target.closest('#ddNow')){ Promise.resolve(runGDriveSync(false)).then(()=>renderDirty()).catch(()=>{}); }
  });
  let dt=null; const later=ms=>{ clearTimeout(dt); dt=setTimeout(()=>{ try{renderDirty();}catch(_){} },ms); };
  try{
    const _si=localStorage.setItem.bind(localStorage), _ri=localStorage.removeItem.bind(localStorage);
    localStorage.setItem=function(k,v){ const r=_si(k,v); try{ if(shouldBackupLocalStorageKey(String(k))) later(6000); }catch(_){} return r; };
    localStorage.removeItem=function(k){ const r=_ri(k); try{ if(shouldBackupLocalStorageKey(String(k))) later(6000); }catch(_){} return r; };
  }catch(_){}
  document.addEventListener('visibilitychange',()=>{ if(document.visibilityState==='visible') later(1500); });
  later(2500);
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
  const origPrompt=buildFinancialAnalystSystemPrompt;
  buildFinancialAnalystSystemPrompt=function(snapshot,profile){
    let base=origPrompt(snapshot,profile), extra='';
    try{
      const d=pfData();
      const acc=id=>(accounts.find(a=>a.id===id)||{}).name||'';
      const recent=entries.slice().sort((a,b)=>String(b.date).localeCompare(String(a.date))).slice(0,60).map(e=>({d:e.date,t:e.type,c:e.category||'',a:+e.amount||0,n:e.note||'',acc:acc(e.accountId)}));
      extra='\n\nข้อมูลเพิ่มเติมจากแอป (ใช้อ้างอิงได้ตามจริง ห้ามเดาเกินจากนี้):\n'
       +'พอร์ตหุ้น (หน่วยบาท ต้นทุนคือเงินบาทที่จ่ายจริงตามที่ผู้ใช้บันทึก ราคาเป็น USD): '+JSON.stringify({fxUSDTHB:d.fx,priceAsOf:d.asOf,holdings:d.hs,totalValueTHB:r2(d.val),totalCostTHB:r2(d.cost),unrealizedPLTHB:r2(d.val-d.cost),realizedPLTHB:r2(d.realized),dcaThisMonth:d.thisMonth,dcaLast6Months:d.months})+'\n'
       +'รายการล่าสุด 60 รายการ (d=วันที่ t=ประเภท c=หมวด a=จำนวนเงิน n=โน้ต acc=บัญชี): '+JSON.stringify(recent)+'\n'
       +'แนวทางเมื่อคุยเรื่องหุ้น/การลงทุน: ใช้ตัวเลขพอร์ตจริงของผู้ใช้ คุยเรื่องวินัย DCA การกระจายความเสี่ยง (เช่น สัดส่วนหุ้นตัวเดียว ความผันผวน) ผลของค่าเงินบาท/ดอลลาร์ และเทียบกับเงินสำรองฉุกเฉิน หนี้ และกระแสเงินสดของผู้ใช้ ห้ามทำนายราคา ห้ามฟันธงให้ซื้อหรือขายหุ้นตัวใดตัวหนึ่ง ไม่มีข่าวหรือราคาเรียลไทม์ ถ้าราคาในข้อมูลเก่าให้บอกวันที่ และตัวเลขกำไรอาจคลาดจากแอปโบรกเกอร์เล็กน้อย ถ้าอ้างความรู้ทั่วไปเกี่ยวกับตัวหุ้น/กองทุน ให้บอกว่าเป็นความรู้ทั่วไป อาจไม่เป็นปัจจุบัน';
    }catch(e){}
    return base+extra;
  };
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
