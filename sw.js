/* Ритм — офлайн-кэш оболочки приложения. Данные пользователя здесь не хранятся. */
const CACHE = 'ritm-shell-7e7cffc6';
const SHELL = ['./', 'index.html', 'manifest.webmanifest', 'icon.svg', 'icon-180.png', 'icon-192.png', 'css/tokens.css', 'css/app.css',
  'js/config.js', 'js/core.js', 'js/calc.js', 'js/data.js', 'js/ai.js', 'js/screens-main.js', 'js/screens-food.js', 'js/coach.js', 'js/screens-health.js', 'js/sync.js', 'js/main.js'];
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL.map((u) => new Request(u, { cache: 'no-cache' })))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
// Свои файлы: сначала сеть с обязательной сверкой версии (обновления приходят сразу), без связи — кэш.
// Чужие запросы (ИИ, база продуктов, шрифты) не трогаем.
self.addEventListener('fetch', (e) => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin) return;
  e.respondWith(
    fetch(e.request.url, { cache: 'no-cache' })
      .then((r) => { if (r.ok) { const copy = r.clone(); caches.open(CACHE).then((c) => c.put(e.request.url, copy)); } return r; })
      .catch(() => caches.match(e.request.url, { ignoreSearch: true }).then((r) => r || caches.match('index.html')))
  );
});
