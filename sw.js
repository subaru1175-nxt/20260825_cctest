/*
 * sw.js — オフラインでも開けるようにする（https または localhost のときだけ動く）
 * いつもはネットから最新を取り、つながらない時だけ保存しておいたものを使う。
 */
const CACHE = 'cif-v1';
const FILES = [
  './', './index.html', './css/style.css', './manifest.webmanifest', './icons/icon.svg',
  './js/util.js', './js/srs.js', './js/session.js', './js/storage.js', './js/data-seed.js',
  './js/diagrams.js', './js/speech.js', './js/app.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith(
    fetch(req)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
        return res;
      })
      .catch(() => caches.match(req).then((hit) => hit || caches.match('./index.html')))
  );
});
