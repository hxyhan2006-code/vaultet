// Vaultet service worker (ds91): เปิดเร็วด้วยไฟล์ที่เก็บไว้ในเครื่อง ไม่ยุ่งกับข้อมูลใน localStorage
// - ไฟล์ที่มี ?v=dsN เนื้อหาไม่เปลี่ยนตามเลขเวอร์ชัน → ใช้ของในเครื่องทันที ไม่ถามเซิร์ฟเวอร์
// - หน้า index.html ถามเซิร์ฟเวอร์ก่อน แต่รอไม่เกิน HTML_WAIT มิลลิวินาที แล้วใช้ของที่เก็บไว้ (เน็ตช้าก็ไม่ค้าง)
// - ตอนติดตั้งจะโหลดไฟล์ทั้งหมดที่ index.html ใช้เก็บไว้ครบ เปิดออฟไลน์ได้
const CACHE = 'vaultet-shell-v8', HTML_WAIT = 1200;
const SHELL = ['./', './index.html', './manifest.webmanifest', './icon-d-192.png', './icon-d-512.png'];
self.addEventListener('install', e => {
  self.skipWaiting();
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    await Promise.all(SHELL.map(u => c.add(u).catch(() => {})));
    try {
      const html = await (await fetch('./index.html', { cache: 'reload' })).text();
      const urls = [...html.matchAll(/(?:src|href)="([^"]+\?v=ds\d+)"/g)].map(m => m[1]).filter(u => !/^https?:/.test(u));
      await Promise.all(urls.map(u => c.add(u).catch(() => {})));
    } catch (err) {}
  })());
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
const keep = (req, res) => { if (res && res.ok) { const cp = res.clone(); caches.open(CACHE).then(c => c.put(req, cp)); } return res; };
self.addEventListener('fetch', e => {
  const r = e.request, u = new URL(r.url);
  if (r.method !== 'GET' || u.origin !== location.origin) return;
  if (u.searchParams.has('chk')) return;   // เช็กรุ่นใหม่ ต้องไปถามเซิร์ฟเวอร์จริง
  const isPage = r.mode === 'navigate' || /\/(index\.html)?$/.test(u.pathname);
  if (isPage) {
    e.respondWith((async () => {
      const cached = await caches.match('./index.html');
      const net = fetch(r).then(res => { if (res.ok) { const cp = res.clone(); caches.open(CACHE).then(c => c.put('./index.html', cp)); } return res; });
      if (!cached) return net;
      return Promise.race([net.catch(() => cached), new Promise(ok => setTimeout(() => ok(cached), HTML_WAIT))]);
    })());
    return;
  }
  if (u.searchParams.has('v')) {
    e.respondWith(caches.match(r).then(m => m || fetch(r).then(res => keep(r, res)).catch(() => caches.match(r))));
    return;
  }
  e.respondWith(caches.match(r).then(m => { const net = fetch(r).then(res => keep(r, res)).catch(() => m); return m || net; }));
});
