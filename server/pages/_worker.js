/* Ритм — сервер-посредник для ИИ (Cloudflare Workers, один файл без зависимостей).

   Зачем: ключ Claude API хранится здесь, в секрете ANTHROPIC_API_KEY, а не в приложении.
   Приложение присылает запрос, сервер добавляет ключ и пересылает его в Claude, ответ идёт обратно потоком.

   Защита от чужих:
   - запросы принимаются только с адресов приложения (ALLOWED_ORIGINS);
   - у каждого устройства свой пропуск, подписанный сервером; новые устройства получают его,
     только пока переменная ENROLL_OPEN равна "1" — после подключения своих телефонов её ставят в "0";
   - модель, длина ответа и прочие параметры задаются здесь, приложение их менять не может;
   - ограничение частоты запросов с одного устройства;
   - главный предохранитель — лимит расходов в консоли Anthropic.

   Переменные: ANTHROPIC_API_KEY (секрет, обязательно), ENROLL_OPEN ("1" или "0"), MODEL (необязательно).

   Почему обращение к API напрямую, а не через SDK: тело запроса с фотографиями пересылается как текст,
   без разбора JSON, — это укладывается в лимит процессорного времени бесплатного тарифа Workers. */

const ALLOWED_ORIGINS = ['https://doktorsm767-hash.github.io', 'https://localhost', 'http://localhost:8765'];
const MODEL_DEFAULT = 'claude-opus-5-5';
const EFFORT = { lab: 'medium', mealPlan: 'medium', trainPlan: 'medium' };   // для остальных задач — low
const MAX_BODY = 8 * 1024 * 1024;
const RATE = { max: 40, windowMs: 10 * 60 * 1000 };
// приложение присылает только массив content; ключи верхнего уровня запроса в нём недопустимы
const FORBIDDEN = /"(model|max_tokens|messages|system|tools|tool_choice|thinking|output_config|metadata|stream|fallbacks|betas|container|mcp_servers|speed|service_tier|context_management)"\s*:/;

const enc = new TextEncoder();
const b64u = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const hits = new Map();   // частота запросов: живёт в памяти экземпляра, этого достаточно как грубый ограничитель

async function hmacKey(env) {
  const raw = await crypto.subtle.digest('SHA-256', enc.encode('ritm-device-token:' + env.ANTHROPIC_API_KEY));
  return crypto.subtle.importKey('raw', raw, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
}
async function sign(env, payload) {
  return payload + '.' + b64u(await crypto.subtle.sign('HMAC', await hmacKey(env), enc.encode(payload)));
}
function sameString(a, b) {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}
async function deviceOf(env, token) {
  const i = token.lastIndexOf('.');
  if (i < 1) return null;
  const payload = token.slice(0, i);
  return sameString(await sign(env, payload), token) ? payload.split('.')[1] : null;
}
function allowRate(device) {
  const now = Date.now(), list = (hits.get(device) || []).filter((t) => now - t < RATE.windowMs);
  if (list.length >= RATE.max) { hits.set(device, list); return false; }
  list.push(now); hits.set(device, list);
  if (hits.size > 5000) hits.clear();
  return true;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url), origin = request.headers.get('Origin') || '';
    const okOrigin = !origin || ALLOWED_ORIGINS.includes(origin);
    const cors = origin && okOrigin ? {
      'Access-Control-Allow-Origin': origin, 'Vary': 'Origin',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'authorization, content-type, x-ritm-kind',
      'Access-Control-Max-Age': '86400'
    } : {};
    const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
    const err = (status, code, message) => json(status, { error: { code, message } });

    if (!okOrigin) return err(403, 'origin', 'Запросы с этого адреса не принимаются.');
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });

    // состояние сервера: без секретов, для проверки связи
    if (request.method === 'GET' && url.pathname === '/') {
      return json(200, { ok: true, service: 'ritm-ai', configured: !!env.ANTHROPIC_API_KEY, enroll: env.ENROLL_OPEN === '1', model: env.MODEL || MODEL_DEFAULT });
    }
    if (request.method !== 'POST') return err(404, 'not_found', 'Нет такого адреса.');
    // браузер и приложение всегда присылают адрес страницы; запросы без него (скрипты, curl) не обслуживаем
    if (!origin) return err(403, 'origin', 'Запросы принимаются только из приложения.');
    if (!env.ANTHROPIC_API_KEY) return err(503, 'not_configured', 'На сервере не задан ключ Claude.');

    // выдача пропуска новому устройству
    if (url.pathname === '/enroll') {
      if (env.ENROLL_OPEN !== '1') return err(403, 'enroll_closed', 'Подключение новых устройств закрыто.');
      const id = b64u(crypto.getRandomValues(new Uint8Array(12)));
      return json(200, { token: await sign(env, 'd1.' + id + '.' + Date.now()) });
    }

    if (url.pathname !== '/ask') return err(404, 'not_found', 'Нет такого адреса.');
    const auth = request.headers.get('Authorization') || '';
    const device = auth.startsWith('Bearer ') ? await deviceOf(env, auth.slice(7).trim()) : null;
    if (!device) return err(401, 'bad_token', 'Пропуск устройства недействителен.');
    if (!allowRate(device)) return err(429, 'rate_limited', 'Слишком много запросов с этого устройства.');

    const content = await request.text();
    if (content.length > MAX_BODY) return err(413, 'too_large', 'Запрос слишком большой.');
    // тело — JSON-массив content; проверяем края без разбора всего текста (в нём могут быть мегабайты фото)
    let a = 0, z = content.length - 1;
    while (a < z && content.charCodeAt(a) <= 32) a++;
    while (z > a && content.charCodeAt(z) <= 32) z--;
    if (content[a] !== '[' || content[z] !== ']' || FORBIDDEN.test(content)) return err(400, 'bad_request', 'Неверный формат запроса.');

    const kind = request.headers.get('x-ritm-kind') || '';
    const model = env.MODEL || MODEL_DEFAULT;
    const fallbacks = !/haiku/.test(model);   // при отказе по соображениям безопасности сервер Anthropic сам переключит модель
    const body = '{"model":' + JSON.stringify(model) + ',"max_tokens":16000,"stream":true,' +
      '"output_config":{"effort":"' + (EFFORT[kind] || 'low') + '"},' + (fallbacks ? '"fallbacks":"default",' : '') +
      '"messages":[{"role":"user","content":' + content + '}]}';
    const headers = { 'content-type': 'application/json', 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2026-10-21' };
    if (fallbacks) headers['anthropic-beta'] = 'server-side-fallback-2026-07-01';

    let up;
    try { up = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', headers, body }); }
    catch (e) { return err(502, 'upstream', 'Нет связи с Claude.'); }

    if (!up.ok) {
      let detail = '';
      try { const j = await up.json(); detail = (j && j.error && j.error.message) || ''; } catch (e) {}
      if (up.status === 401 || up.status === 403) return err(502, 'key_invalid', 'Claude не принял ключ сервера.');
      if (up.status === 429) return err(429, 'rate_limited', 'Достигнут лимит запросов Claude.');
      if (up.status === 413) return err(413, 'too_large', 'Запрос слишком большой.');
      if (up.status >= 500) return err(503, 'overloaded', 'Claude сейчас недоступен.');
      return err(400, 'rejected', detail.slice(0, 300) || 'Claude отклонил запрос.');
    }
    return new Response(up.body, { status: 200, headers: { ...cors, 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-store', 'x-accel-buffering': 'no' } });
  }
};
