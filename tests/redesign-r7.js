// รูปโปรไฟล์ (ds55): เลือก/เปลี่ยน/ลบรูป โชว์ที่หน้าหลักกับหน้าตั้งค่า ไม่เข้าข้อมูลที่ส่งให้ AI + ปุ่มที่เลือกในโปรไฟล์อ่านออก
const { chromium } = require('playwright');
const http=require('http'),fs=require('fs'),path=require('path');const root=require('path').resolve(__dirname,'..');
const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png'};
const srv=http.createServer((q,s)=>{let p=q.url.split('?')[0];if(p==='/')p='/index.html';const f=path.join(root,p);fs.readFile(f,(e,d)=>{if(e){s.writeHead(404);s.end();return}s.writeHead(200,{'content-type':types[path.extname(f)]||'text/plain'});s.end(d)})});
(async()=>{await new Promise(r=>srv.listen(8207,r));
const b=await chromium.launch({...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{}),args:['--no-sandbox']});
const pg=await (await b.newContext({viewport:{width:380,height:820},serviceWorkers:'block'})).newPage();
const errs=[];pg.on('pageerror',e=>errs.push(e.message));
await pg.route(/accounts\.google\.com|fonts\./,r=>r.abort());
await pg.addInitScript(()=>{if(localStorage.getItem('__s'))return;localStorage.setItem('__s','1');
 localStorage.setItem('vaultet_user_profile_v1',JSON.stringify({nickname:'Han',statuses:['นักเรียน']}));});
await pg.goto('http://localhost:8207/index.html');await pg.waitForTimeout(1500);
const ok=(n,c)=>console.log((c?'PASS ':'FAIL ')+n);
// รูปจำลอง 600x400 สีแดง
const png=await pg.evaluate(()=>{const c=document.createElement('canvas');c.width=600;c.height=400;const x=c.getContext('2d');x.fillStyle='#d33';x.fillRect(0,0,600,400);return c.toDataURL('image/png');});
const buf=Buffer.from(png.split(',')[1],'base64');

ok('home avatar starts as a letter', (await pg.textContent('#uxAvatarBtn')).trim()==='H');
await pg.evaluate(()=>vaultetOpenProfile()); await pg.waitForTimeout(300);
ok('profile sheet: pick button says "เลือกรูป", delete hidden', (await pg.textContent('#vpPhotoPick')).trim()==='เลือกรูป' && !(await pg.isVisible('#vpPhotoClear')));
// ปุ่มที่เลือก: ตัวหนังสือต้องไม่กลืนพื้น
await pg.evaluate(()=>{const l=[...document.querySelectorAll('label.profile-check')].find(x=>x.querySelector('input').checked);l.scrollIntoView();});
const col=await pg.evaluate(()=>{const l=[...document.querySelectorAll('label.profile-check')].find(x=>x.querySelector('input').checked);return getComputedStyle(l).color;});
ok('selected status chip text is light ('+col+')', /rgb\((2\d\d|1[5-9]\d)/.test(col));

await pg.setInputFiles('#vpPhotoFile',{name:'a.png',mimeType:'image/png',buffer:buf}); await pg.waitForTimeout(600);
const stored=await pg.evaluate(()=>localStorage.getItem('vaultet_profile_photo_v1')||'');
ok('photo stored as small jpeg', stored.startsWith('data:image/jpeg') && stored.length<60000);
const dim=await pg.evaluate(()=>new Promise(r=>{const i=new Image();i.onload=()=>r([i.width,i.height]);i.src=localStorage.getItem('vaultet_profile_photo_v1');}));
ok('photo is a 256x256 square', dim[0]===256&&dim[1]===256);
ok('profile sheet shows the photo + button becomes "เปลี่ยนรูป"', await pg.isVisible('.profile-big-avatar img') && (await pg.textContent('#vpPhotoPick')).trim()==='เปลี่ยนรูป' && await pg.isVisible('#vpPhotoClear'));
ok('home avatar shows the photo', await pg.evaluate(()=>!!document.querySelector('#uxAvatarBtn img.ux-avatar-img')));
await pg.evaluate(()=>{document.getElementById('vaultetProfileOverlay').classList.remove('open');vaultetOpenSettings();}); await pg.waitForTimeout(500);
ok('settings profile card shows the photo', await pg.isVisible('#ux-more .ux-user-context-avatar.has-photo img'));
ok('photo is not inside the profile data sent to AI', !(await pg.evaluate(()=>localStorage.getItem('vaultet_user_profile_v1'))).includes('data:image'));
ok('photo is part of backups (not excluded)', await pg.evaluate(()=>!VAULTET_BACKUP_EXCLUDED_KEYS.has('vaultet_profile_photo_v1')));

// ลบรูป → กลับเป็นตัวอักษร
await pg.evaluate(()=>{vaultetGo('home');vaultetOpenProfile();}); await pg.waitForTimeout(300);
await pg.click('#vpPhotoClear'); await pg.waitForTimeout(300);
ok('after delete: storage empty, letter back on home', !(await pg.evaluate(()=>localStorage.getItem('vaultet_profile_photo_v1'))) && (await pg.textContent('#uxAvatarBtn')).trim()==='H');
ok('after delete: settings card goes back to letter', await pg.evaluate(()=>{const a=document.querySelector('#ux-more .ux-user-context-avatar');return !a.querySelector('img')&&a.textContent.trim()==='H';}));
// ไฟล์ที่ไม่ใช่รูป → ไม่พัง
await pg.setInputFiles('#vpPhotoFile',{name:'x.png',mimeType:'image/png',buffer:Buffer.from('not an image')}); await pg.waitForTimeout(500);
ok('non-image file: nothing stored, no crash', !(await pg.evaluate(()=>localStorage.getItem('vaultet_profile_photo_v1'))) && errs.length===0);
if(errs.length) console.log('errors: '+errs.join(' | '));
await b.close();srv.close();})();
