/* Ритм — запуск. */
(function () {
  'use strict';
  const App = window.App;
  App.store.load();
  App.mount();
  const s = App.store.state;
  if (s.profile && s.targets) App.go('today');
  else App.ui.onboarding();

  // автономная PWA: офлайн-кэш оболочки (на claude.ai сервис-воркеры недоступны)
  if (!(window.claude && window.claude.use) && 'serviceWorker' in navigator && /^https:|^http:\/\/(localhost|127\.0\.0\.1)/.test(location.href)) {
    window.addEventListener('load', () => { navigator.serviceWorker.register('sw.js').catch(() => {}); });
  }
})();
