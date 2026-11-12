/* Ритм — офлайн-кэш оболочки приложения. Данные пользователя здесь не хранятся. */
const CACHE = 'ritm-shell-v2';
const SHELL = ['./', 'index.html', 'manifest.webmanifest', 'icon.svg', 'icon-180.png', 'icon-192.png', 'css/tokens.css', 'css/app.css',
  'js/core.js', 'js/calc.js', 'js/data.js', 'js/ai.js', 'js/screens-main.js', 'js/screens-food.js', 'js/screens-health.js', 'js/sync.js', 'js/main.js'];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
// свои файлы: сначала сеть (чтобы обновления приходили сразу), при отсутствии связи — кэш; чужие запросы не трогаем
self.addEventListener('fetch', (e) => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin) return;
  e.respondWith(fetch(e.request).then((r) => { const copy = r.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); return r; }).catch(() => caches.match(e.request).then((r) => r || caches.match('index.html'))));
});
