// รันชุดทดสอบทั้งหมดทีละไฟล์ แล้วสรุปผล — `npm test`
// ทดสอบด้วยเบราว์เซอร์จริง (Chromium ผ่าน Playwright) ที่จอ 380px กับข้อมูลสมมติ ไม่แตะข้อมูลจริงของใคร ไม่เรียก API ภายนอก
// ตัวแปรเสริม: CHROMIUM_PATH=ที่อยู่ Chromium (ถ้าไม่ใส่ใช้ตัวที่ Playwright ติดตั้งให้)
const { spawnSync } = require('child_process');
const path = require('path');
const FILES = [
  ['tabs-no-leak.js', 'แต่ละแท็บแสดงหน้าเดียว ไม่มีเนื้อหารั่วข้ามแท็บ'],
  ['home-and-nav.js', 'หน้าหลัก แถบล่าง ทางลัด รายการ ลบรายการ'],
  ['redesign-r1.js', 'โฉมใหม่รอบ 1: แถบบน ปุ่มเดือน หน้าหลัก รายการล่าสุด หน้ารายการทั้งหมด ชิปกรอง'],
  ['add-entry.js', 'ฟอร์มเพิ่ม/แก้รายการ หมวด เทมเพลต โอนเงิน'],
  ['redesign-r2.js', 'โฉมใหม่รอบ 2: แป้นตัวเลข แท็บประเภท ไอคอนหมวด เลือกบัญชี/วันที่ บันทึกแล้วย้อนได้'],
  ['redesign-r3.js', 'โฉมใหม่รอบ 3: หน้ารายงาน ช่วงเวลา บัญชี แถบประเภท วงกลม รายหมวด กราฟ 6 ช่วง ตัวเลขสรุป'],
  ['redesign-r4.js', 'โฉมใหม่รอบ 4: เงินของฉัน มูลค่าสุทธิ บัญชี เงินกันไว้ พอร์ต เงินสำรอง/เป้าหมาย หนี้/ให้ยืม'],
  ['redesign-r5.js', 'โฉมใหม่รอบ 5: หน้าแชท AI (คำถามแนะนำ ฟองข้อความ) หน้าตั้งค่า (ไอคอน สวิตช์ แถวล็อกแอป)'],
  ['redesign-r6.js', 'เก็บตก: ไม่เหลือช่องเลือก/วันที่ของเบราว์เซอร์ เลือกในกล่องข้อความ แผ่นเลือกเดือน เตือนสำรองข้อมูลในกระดิ่ง'],
  ['redesign-r7.js', 'รูปโปรไฟล์: เลือก/เปลี่ยน/ลบ โชว์หน้าหลักกับตั้งค่า ปุ่มที่เลือกในโปรไฟล์อ่านออก'],
  ['redesign-r8.js', 'ประวัติแชทในเมนู AI: ไม่มีกากบาท แตะเปิด กดค้างเปลี่ยนชื่อ/ลบ'],
  ['plan-budget.js', 'หน้าแผน งบ สรุปรายจ่าย เงินสำรอง'],
  ['bottom-bar-ai-settings.js', 'ปุ่ม + กลางแถบล่าง ตั้งค่า (จากรูปโปรไฟล์) หน้าต่าง AI'],
  ['settings-backup-banners.js', 'หน้าตั้งค่า สำรองข้อมูล แถบเตือนทีละอัน'],
  ['debts.js', 'หนี้สิน'],
  ['accounts-reserved-loans.js', 'บัญชี เงินกันไว้ เงินให้ยืม'],
  ['dialog-component.js', 'กล่องข้อความในแอป (ยืนยัน/ฟอร์ม/ตรวจข้อมูล)'],
  ['dialog-flows.js', 'ค่าใช้จ่ายประจำ เงินให้ยืม รวมหมวด เทมเพลต เป้าหมาย ความจำ AI ล็อกแอป'],
  ['available-goals.js', 'ยอดใช้ได้จริงบนหน้าหลัก (หักเงินกันไว้) เงินเข้าเป้าหมายเป็นรายการออม'],
  ['single-account-goals.js', 'โหมดบัญชีเดียว ของที่ตัดออก เป้าหมายรวมเป็นระบบเดียว'],
  ['loans.js', 'เงินให้ยืม: คนที่คืนครบแยกไปช่องพับ ประวัติการคืนบรรทัดเดียว'],
  ['layers.js', 'ล็อกเลื่อนหน้าด้านหลัง แจ้งเตือนลอยกึ่งกลาง ทางลัดจัดเรียงเอง'],
  ['notifications.js', 'ศูนย์แจ้งเตือน ลิสต์แยกวัน หน้าตั้งค่าแยก อ่านทั้งหมด ล้างประวัติ'],
  ['openrouter.js', 'OpenRouter: แชทหลัก สำรองเงียบ ถอยรุ่น เพดานค่าใช้จ่าย หน้าตั้งค่า'],
  ['ai-action-card.js', 'การ์ดข้อเสนอของ AI (ลบ/แก้/เพิ่ม/งบ ยกเลิก เสนอแก้ ย้อนกลับ ไม่มีติ๊ก)'],
  ['ai-run-status.js', 'สถานะ AI ตามจริง (ข้อมูลที่ส่ง เวลาแยกสองช่วง คีย์เต็ม)'],
  ['ai-instructions.js', 'คำสั่งปรับแต่ง AI ทีละข้อ (เพิ่ม แก้ ลบ สวิตช์ ย้ายของเก่า)'],
  ['ai-stream.js', 'คำตอบ AI แบบค่อยๆ พิมพ์ (สตรีม) กดหยุด ถอยกลับ ตอบใหม่'],
  ['ai-snapshot.js', 'ข้อมูลที่ส่งให้ AI (พอร์ตหุ้น เป้าหมาย ประวัติ 6 เดือน)'],
  ['twin-snapshot.js', 'สรุปการเงินให้แอป Twin อ่าน (ครบ ไม่มีรายการ/ชื่อบัญชี ไม่ติดไฟล์สำรอง)'],
  ['top-spacing.js', 'เนื้อหาไม่ชิดแถบบน'],
];
const KNOWN = /^(PASS |FAIL |no js errors|no leaks|snapshot chars|\[agent-proxy\]|- .*:443 |\(oldest|For details|$)/;
let failed = 0, totalPass = 0;
for (const [file, label] of FILES) {
  const t0 = Date.now();
  const r = spawnSync(process.execPath, [path.join(__dirname, file)], { encoding: 'utf8', timeout: 240000, env: process.env });
  const lines = (r.stdout || '').split('\n');
  const pass = lines.filter(l => l.startsWith('PASS ')).length;
  const fails = lines.filter(l => l.startsWith('FAIL '));
  const odd = lines.filter(l => !KNOWN.test(l));
  const problems = [];
  if (r.status !== 0) problems.push('exit code ' + r.status + (r.error ? ' (' + r.error.code + ')' : '') + (r.stderr ? '\n    ' + r.stderr.split('\n').slice(0, 6).join('\n    ') : ''));
  fails.forEach(l => problems.push(l));
  odd.forEach(l => problems.push('unexpected output: ' + l));
  if (!pass) problems.push('no PASS lines');
  totalPass += pass;
  const secs = ((Date.now() - t0) / 1000).toFixed(0);
  if (problems.length) { failed++; console.log(`✗ ${file} — ${label} (${pass} ผ่าน, ${secs}s)`); problems.forEach(p => console.log('   ' + p)); }
  else console.log(`✓ ${file} — ${label} (${pass} ข้อ, ${secs}s)`);
}
console.log(`\n${failed ? 'มีไฟล์ที่ไม่ผ่าน ' + failed + ' จาก ' + FILES.length : 'ผ่านทั้งหมด ' + FILES.length + ' ไฟล์'} · รวม ${totalPass} ข้อ`);
process.exit(failed ? 1 : 0);
