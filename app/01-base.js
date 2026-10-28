// Vaultet — app/01-base.js : พื้นฐาน: เก็บข้อมูลถาวร, กติกาคีย์ AI, สำรองขึ้น Google Drive อัตโนมัติ, ระบบไฟล์สำรอง
// (แยกจาก app.js เดิม — โหลดเรียงตามเลขไฟล์ ทุกไฟล์ใช้ตัวแปร/ฟังก์ชันร่วมกันแบบ global)
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
  saving: ["เงินออม", "ลงทุนหุ้น", "เป้าหมาย", "อื่นๆ"],
};

const GOAL_CAT = "เป้าหมาย"; // หมวดออมของเงินที่เก็บเข้าเป้าหมาย (รายการต้องมี goalId ด้วย)
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
// (AI) AI_APIKEYS_MAX / getApiKeys / saveApiKeys ย้ายไป ai.js

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
// สรุปการเงินสั้นๆ ที่เขียนไว้ให้แอป Twin อ่าน (ข้อมูลที่คำนวณซ้ำได้ทุกครั้ง จึงไม่เอาเข้าไฟล์สำรอง)
const VAULTET_TWIN_SNAPSHOT_KEY = "vaultet_twin_snapshot_v1";
const VAULTET_BACKUP_EXCLUDED_KEYS = new Set([
  AI_APIKEY_KEY, AI_APIKEYS_KEY, VAULTET_TWIN_SNAPSHOT_KEY,
  "vaultet_ai_keystate_local",
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
    if(!silent) showToast("สำรองขึ้น Google Drive แล้ว ตรวจแล้วตรงกับต้นฉบับ");
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

// (AI) ค่าคงที่คีย์ AI (โปรไฟล์/แชท/ความจำ/Proactive) ย้ายไป ai.js
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
