const VER = '1.210.7.64';   // 与 app.js 的 APP_VER 同步；改动任何网页文件都要升版本，否则离线缓存不更新
const CACHE = 'nd-home-' + VER;
const FILES = ['./','./index.html','./style.css?v=1.210.7.64','./core.js?v=1.210.7.64','./app.js?v=1.210.7.64','./data.js?v=1.210.7.64','./manifest.json'];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => e.waitUntil(
  caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim())
));
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(caches.match(e.request).then(r => r || fetch(e.request).then(res => {
    const copy = res.clone();
    caches.open(CACHE).then(c => c.put(e.request, copy)).catch(()=>{});
    return res;
  }).catch(() => caches.match('./index.html'))));
});
