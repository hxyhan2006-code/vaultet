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
// (AI) aiProfileDraft ย้ายไป ai.js

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
const SHOW_DECIMALS_KEY = "vaultet_show_decimals_v1";
function getShowDecimals(){
  try{ return localStorage.getItem(SHOW_DECIMALS_KEY) === "1"; }catch(e){ return false; }
}
function fmt(n){
  if(getShowDecimals()){
    return new Intl.NumberFormat("th-TH",{maximumFractionDigits:2}).format(n);
  }
  const r = Math.round(n);
  return new Intl.NumberFormat("th-TH",{maximumFractionDigits:0}).format(r === 0 ? 0 : r);
}
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

// (AI) markAiChatUnread / clearAiChatUnread ย้ายไป ai.js

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

// (AI) Settings panel — API Key(s) ย้ายไป ai.js
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
/* ===== ตั้งค่า: เปิด/ปิดการแสดงเศษสตางค์ (ทศนิยม) — ไม่กระทบพอร์ตหุ้น (ใช้ pfFmtMoney/pfFmtShares ของตัวเอง) ===== */
(function(){
  const tg = document.getElementById("showDecimalsToggle");
  if(!tg) return;
  const sync = () => { tg.checked = getShowDecimals(); };
  sync();
  document.getElementById("settingsBtn").addEventListener("click", sync);
  tg.addEventListener("change", () => {
    try{ localStorage.setItem(SHOW_DECIMALS_KEY, tg.checked ? "1" : "0"); }catch(e){}
    render();
  });
})();
// (AI) ปุ่มบันทึก API Key ย้ายไป ai.js

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

// (AI) ระบบ AI ทั้งหมด (โปรไฟล์/ความจำ/Gemini/แชท/Advisor/Proactive/Confirm) ย้ายไป ai.js

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
// (AI) refreshApiKeyStatus(); refreshProactiveCard(); ย้ายไปรันท้าย ai.js

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
function renderFinancialBrainCard(){const card=document.getElementById("financialBrainCard");if(!card)return;if(typeof buildFinancialSnapshot!=="function")return;const s=buildFinancialSnapshot(),h=s.financialBrain,b=s.behaviorSummary;card.style.display="block";document.getElementById("brainScore").textContent=h.score;document.getElementById("brainFill").style.width=h.score+"%";const m=h.status==='CRITICAL'?{l:'ต้องจัดการเร่งด่วน',c:'critical'}:h.status==='WATCH'?{l:'ควรเฝ้าดู',c:'watch'}:{l:'สุขภาพดี ✓',c:'healthy'};const st=document.getElementById("brainStatus");st.className='brain-status '+m.c;st.textContent=m.l;
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
  (window.__vaultetAiPatches=window.__vaultetAiPatches||[]).push(function(){
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
  });
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

// (AI) pruneEmptyChats() ย้ายไปรันท้าย ai.js

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
  (window.__vaultetAiPatches=window.__vaultetAiPatches||[]).push(function(){
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
