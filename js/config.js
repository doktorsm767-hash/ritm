/* Ритм — настройки развёртывания. Меняются здесь, в одном месте. */
window.RITM_CONFIG = {
  // Адрес сервера-посредника для ИИ (server/worker.js). Если оставить пустым — ИИ в автономной версии показывает примеры.
  // Размещён на Cloudflare Pages: домен pages.dev доступен из сети пользователя, workers.dev — нет.
  aiServer: 'https://ritm-ai.pages.dev',
  // Версия приложения на claude.ai: там ИИ работает по подписке Claude, без ключа.
  // Приложение предлагает её, пока на сервере нет ключа.
  aiPage: 'https://claude.ai/artifact/3ztRJzXWGvxdYQhAFvWzXF'
};
