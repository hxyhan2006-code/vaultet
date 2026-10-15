const { chromium } = require('playwright');
const http=require('http'),fs=require('fs'),path=require('path');const root=require('path').resolve(__dirname,'..');
const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png'};
const srv=http.createServer((q,s)=>{let p=q.url.split('?')[0];if(p==='/')p='/index.html';const f=path.join(root,p);fs.readFile(f,(e,d)=>{if(e){s.writeHead(404);s.end();return}s.writeHead(200,{'content-type':types[path.extname(f)]||'text/plain'});s.end(d)})});
const shots=require('os').tmpdir()+'/vaultet-test-shots/'; require('fs').mkdirSync(shots,{recursive:true});
(async()=>{await new Promise(r=>srv.listen(8141,r));
const b=await chromium.launch({...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{}),args:['--no-sandbox']});
const pg=await (await b.newContext({viewport:{width:380,height:820},deviceScaleFactor:2,serviceWorkers:'block'})).newPage();
const errs=[];pg.on('pageerror',e=>errs.push(e.message));
let native=0;pg.on('dialog',d=>{native++;d.dismiss()});
await pg.route(/accounts\.google\.com|fonts\./,r=>r.abort());
await pg.goto('http://localhost:8141/index.html');await pg.waitForTimeout(900);
const ok=(n,c)=>console.log((c?'PASS ':'FAIL ')+n);
// confirm yes/no
let p=pg.evaluate(()=>vaultetConfirm('ลบรายการนี้ใช่ไหม?',{okText:'ลบ',danger:true,title:'ยืนยันการลบ'}));
await pg.waitForSelector('.v-dlg'); ok('confirm shows', (await pg.textContent('.v-dlg')).includes('ลบรายการนี้ใช่ไหม?'));
await pg.screenshot({path:shots+'dlg-confirm.png'});
await pg.click('.v-dlg-ok'); ok('confirm OK -> true', (await p)===true); ok('dialog removed', (await pg.locator('.v-dlg').count())===0);
p=pg.evaluate(()=>vaultetConfirm('x')); await pg.waitForSelector('.v-dlg'); await pg.click('.v-dlg-cancel'); ok('confirm cancel -> false', (await p)===false);
p=pg.evaluate(()=>vaultetConfirm('x')); await pg.waitForSelector('.v-dlg'); await pg.keyboard.press('Escape'); ok('Esc cancels -> false', (await p)===false);
// form: validation + success
p=pg.evaluate(()=>vaultetForm({title:'เพิ่มบัญชี',fields:[{key:'name',label:'ชื่อบัญชี',required:true,placeholder:'เช่น เงินสด'},{key:'bal',label:'ยอดเริ่มต้น (บาท)',type:'number',value:0},{key:'d',label:'วันที่',type:'date',value:'2026-10-15'},{key:'acc',label:'บัญชี',type:'select',options:[{value:'a1',label:'กสิกร'},{value:'a2',label:'เงินสด'}],value:'a2'}]}));
await pg.waitForSelector('.v-dlg'); await pg.screenshot({path:shots+'dlg-form.png'});
await pg.click('.v-dlg-ok'); ok('required field blocks submit and shows error', (await pg.isVisible('.v-dlg-err')) && (await pg.locator('.v-dlg').count())===1);
await pg.fill('input[name=name]','  ออมทรัพย์ '); await pg.fill('input[name=bal]','1250.5'); await pg.keyboard.press('Enter');
const r=await p; ok('form returns trimmed text, numbers and select', r.name==='ออมทรัพย์' && r.bal===1250.5 && r.acc==='a2' && r.d==='2026-10-15');
// number validation
p=pg.evaluate(()=>vaultetForm({fields:[{key:'n',label:'จำนวน',type:'number',positive:true,required:true}]}));
await pg.waitForSelector('.v-dlg'); await pg.fill('input[name=n]','-5'); await pg.click('.v-dlg-ok'); ok('positive rule rejects -5', (await pg.textContent('.v-dlg-err')).includes('มากกว่า 0'));
await pg.fill('input[name=n]','5'); await pg.click('.v-dlg-ok'); ok('then accepts 5', (await p).n===5);
// cancel form -> null
p=pg.evaluate(()=>vaultetForm({fields:[{key:'a',label:'a'}]})); await pg.waitForSelector('.v-dlg'); await pg.click('.v-dlg-cancel'); ok('form cancel -> null', (await p)===null);
// prompt convenience
p=pg.evaluate(()=>vaultetPrompt('ชื่อหมวดใหม่','',{title:'เพิ่มหมวด',required:true})); await pg.waitForSelector('.v-dlg'); await pg.fill('input[name=v]','ของเล่น'); await pg.keyboard.press('Enter'); ok('prompt returns string', (await p)==='ของเล่น');
// alert
p=pg.evaluate(()=>vaultetAlert('ต้องเป็นตัวเลข 6 หลัก')); await pg.waitForSelector('.v-dlg'); await pg.click('.v-dlg-ok'); await p; ok('alert resolves', true);
// queue: two at once show one after another
const both=pg.evaluate(()=>Promise.all([vaultetConfirm('A'),vaultetConfirm('B')]));
await pg.waitForSelector('.v-dlg'); ok('only one dialog at a time', (await pg.locator('.v-dlg').count())===1);
await pg.click('.v-dlg-ok'); await pg.waitForTimeout(150); await pg.click('.v-dlg-ok'); const bb=await both; ok('queued dialogs both resolve', bb[0]===true&&bb[1]===true);
ok('no native browser dialogs were used', native===0);
console.log(errs.join('\n')||'no js errors');
await b.close();srv.close()})();
