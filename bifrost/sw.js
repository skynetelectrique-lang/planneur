/* Bifröst : fonctionnement hors ligne */
const V = 'bifrost-v8';
const LOCAL = ['./', './index.html', './vault.js', './manifest.webmanifest', './icon-180.png', './icon-192.png', './icon-512.png', './fonts/uncial.woff2', './fonts/cinzel.woff2'];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(V).then(c => c.addAll(LOCAL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith('bifrost') && k !== V).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request, u = new URL(req.url);
  if (req.method !== 'GET' || u.hostname === 'api.github.com') return;
  const fresh = req.mode === 'navigate' || u.pathname.endsWith('.html') || u.pathname.endsWith('/') || u.pathname.endsWith('.js');
  if (fresh) {
    e.respondWith(fetch(req).then(r => { const c = r.clone(); caches.open(V).then(x => x.put(req, c)); return r; })
      .catch(() => caches.match(req).then(r => r || caches.match('./index.html'))));
    return;
  }
  e.respondWith(caches.match(req).then(r => r || fetch(req).then(res => {
    if (res.ok || res.type === 'opaque') { const c = res.clone(); caches.open(V).then(x => x.put(req, c)); }
    return res;
  })));
});
