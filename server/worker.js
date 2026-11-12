/* Ритм — сервер-посредник для ИИ (Cloudflare, один файл без зависимостей).

   Зачем: ключ Claude API хранится на сервере, а не в приложении.
   Приложение присылает запрос, сервер добавляет ключ и пересылает его в Claude, ответ идёт обратно потоком.

   Где лежит ключ: в секрете ANTHROPIC_API_KEY либо в хранилище CONFIG (Workers KV), куда его кладёт
   владелец через страницу /setup. Страница принимает только рабочий ключ (проверяет его запросом в Claude)
   и только если ключ ещё не задан; сам ключ сервер никогда не отдаёт обратно.

   Защита от чужих:
   - запросы принимаются только с адресов приложения (ALLOWED_ORIGINS);
   - у каждого устройства свой пропуск, подписанный сервером; новые устройства получают его,
     только пока переменная ENROLL_OPEN равна "1" — после подключения своих телефонов её ставят в "0";
   - модель, длина ответа и прочие параметры задаются здесь, приложение их менять не может;
   - ограничение частоты запросов с одного устройства;
   - главный предохранитель — лимит расходов в консоли Anthropic.

   Переменные: ENROLL_OPEN ("1" или "0"), MODEL (необязательно), ANTHROPIC_API_KEY (секрет, необязательно, если есть CONFIG).

   Почему обращение к API напрямую, а не через SDK: тело запроса с фотографиями пересылается как текст,
   без разбора JSON, — это укладывается в лимит процессорного времени бесплатного тарифа. */

const ALLOWED_ORIGINS = ['https://doktorsm767-hash.github.io', 'https://localhost', 'http://localhost:8765'];
const MODEL_DEFAULT = 'claude-opus-5-5';
const EFFORT = { lab: 'medium', mealPlan: 'medium', trainPlan: 'medium' };   // для остальных задач — low
const MAX_BODY = 8 * 1024 * 1024;
const RATE = { max: 40, windowMs: 10 * 60 * 1000 };
const API = 'https://api.anthropic.com/v1/messages';
const API_VERSION = '2026-10-21';
// приложение присылает только массив content; ключи верхнего уровня запроса в нём недопустимы
const FORBIDDEN = /"(model|max_tokens|messages|system|tools|tool_choice|thinking|output_config|metadata|stream|fallbacks|betas|container|mcp_servers|speed|service_tier|context_management)"\s*:/;

const enc = new TextEncoder();
const b64u = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const hits = new Map();   // частота запросов: живёт в памяти экземпляра, этого достаточно как грубый ограничитель
let keyCache = { value: '', at: 0 };

// ключ: из секрета или из хранилища CONFIG (с минутным кэшем в памяти)
async function getKey(env) {
  if (env.ANTHROPIC_API_KEY) return env.ANTHROPIC_API_KEY;
  if (!env.CONFIG) return '';
  if (keyCache.value && Date.now() - keyCache.at < 60000) return keyCache.value;
  const v = (await env.CONFIG.get('anthropic_key')) || '';
  keyCache = { value: v, at: Date.now() };
  return v;
}
async function sign(apiKey, payload) {
  const raw = await crypto.subtle.digest('SHA-256', enc.encode('ritm-device-token:' + apiKey));
  const key = await crypto.subtle.importKey('raw', raw, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return payload + '.' + b64u(await crypto.subtle.sign('HMAC', key, enc.encode(payload)));
}
function sameString(a, b) {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}
async function deviceOf(apiKey, token) {
  const i = token.lastIndexOf('.');
  if (i < 1) return null;
  const payload = token.slice(0, i);
  return sameString(await sign(apiKey, payload), token) ? payload.split('.')[1] : null;
}
function allowRate(device) {
  const now = Date.now(), list = (hits.get(device) || []).filter((t) => now - t < RATE.windowMs);
  if (list.length >= RATE.max) { hits.set(device, list); return false; }
  list.push(now); hits.set(device, list);
  if (hits.size > 5000) hits.clear();
  return true;
}

// проверка ключа настоящим коротким запросом: рабочий ли он и есть ли доступ
async function checkKey(key) {
  let r;
  try {
    r = await fetch(API, { method: 'POST', headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': API_VERSION },
      body: JSON.stringify({ model: 'claude-haiku-5-5', max_tokens: 16, messages: [{ role: 'user', content: 'Ответь одним словом: да' }] }) });
  } catch (e) { return { ok: false, code: 'upstream', message: 'Нет связи с Claude. Попробуйте ещё раз.' }; }
  if (r.ok || r.status === 429 || r.status === 529) return { ok: true };
  let detail = '';
  try { const j = await r.json(); detail = (j && j.error && j.error.message) || ''; } catch (e) {}
  if (r.status === 401) return { ok: false, code: 'bad_key', message: 'Claude не принял этот ключ. Проверьте, что он скопирован целиком.' };
  if (/credit|billing|balance/i.test(detail)) return { ok: false, code: 'no_credit', message: 'Ключ верный, но на счёте Anthropic нет средств. Пополните баланс в консоли и повторите.' };
  if (r.status === 403) return { ok: false, code: 'no_access', message: 'У ключа нет доступа к Claude API: ' + detail.slice(0, 160) };
  return { ok: false, code: 'check_failed', message: 'Не удалось проверить ключ: ' + (detail.slice(0, 160) || 'ошибка ' + r.status) };
}

const SETUP_PAGE = `<!doctype html>
<html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Ритм — подключение ИИ</title>
<style>
:root{color-scheme:light dark;--bg:#F2F2F7;--card:#fff;--fg:#08080A;--fg2:rgba(60,60,67,.66);--fill:rgba(118,118,128,.12);--accent:#FF2D55;--green:#34C759;--red:#FF3B30}
@media (prefers-color-scheme:dark){:root{--bg:#000;--card:#1C1C1E;--fg:#fff;--fg2:rgba(235,235,245,.64);--fill:rgba(118,118,128,.24);--accent:#FF375F;--green:#30D158;--red:#FF453A}}
*{box-sizing:border-box}body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:20px;background:var(--bg);color:var(--fg);font:17px/1.4 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,system-ui,sans-serif}
main{width:100%;max-width:420px;display:flex;flex-direction:column;gap:14px}
h1{font-size:30px;line-height:1.12;letter-spacing:-.02em;margin:0}p{margin:0;color:var(--fg2);font-size:15px}
.card{background:var(--card);border-radius:22px;padding:18px;display:flex;flex-direction:column;gap:12px}
label{font-size:13px;color:var(--fg2)}
textarea{width:100%;min-height:96px;border:0;outline:0;resize:none;border-radius:14px;padding:12px 14px;background:var(--fill);color:var(--fg);font:15px/1.35 ui-monospace,Menlo,Consolas,monospace;word-break:break-all}
button{border:0;border-radius:14px;min-height:52px;font:600 17px inherit;font-family:inherit;background:var(--accent);color:#fff;transition:transform .12s ease-out,opacity .15s}
button:active{transform:scale(.97)}button[disabled]{opacity:.45}
.msg{border-radius:14px;padding:12px 14px;font-size:15px}.ok{background:color-mix(in srgb,var(--green) 16%,transparent)}.bad{background:color-mix(in srgb,var(--red) 14%,transparent)}
ol{margin:0;padding-left:20px;color:var(--fg2);font-size:15px}li{margin:4px 0}
</style></head><body><main>
<h1>Подключение ИИ к «Ритму»</h1>
<p>Вставьте ключ Claude API. Сервер проверит его, сохранит у себя и больше никому не покажет.</p>
<div class="card" id="form">
<label for="key">Ключ начинается с sk-ant-</label>
<textarea id="key" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="sk-ant-…"></textarea>
<button id="go" type="button">Подключить</button>
<div id="msg" hidden></div>
</div>
<ol><li>Ключ создаётся на platform.claude.com в разделе API keys.</li><li>Там же задайте месячный лимит расходов.</li></ol>
</main>
<script>
const key=document.getElementById('key'),go=document.getElementById('go'),msg=document.getElementById('msg'),form=document.getElementById('form');
const show=(text,ok)=>{msg.hidden=false;msg.className='msg '+(ok?'ok':'bad');msg.textContent=text;};
fetch('/').then(r=>r.json()).then(s=>{if(s.configured){key.hidden=true;go.hidden=true;document.querySelector('label').hidden=true;show('Ключ уже подключён. ИИ в приложении работает.',true);}else if(!s.storage){go.disabled=true;show('Сервер ещё не готов принять ключ. Откройте страницу чуть позже.',false);}}).catch(()=>{});
go.onclick=async()=>{const v=key.value.replace(/\\s+/g,'');if(!/^sk-ant-/.test(v)){show('Это не похоже на ключ Claude: он начинается с sk-ant-.',false);return;}
go.disabled=true;go.textContent='Проверяю ключ…';msg.hidden=true;
try{const r=await fetch('/setup',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({key:v})});const j=await r.json();
if(r.ok){key.value='';key.hidden=true;go.hidden=true;document.querySelector('label').hidden=true;show('Готово: ключ принят и проверен. Можно закрыть страницу и пользоваться ИИ в приложении.',true);}
else{show((j.error&&j.error.message)||'Не получилось. Попробуйте ещё раз.',false);go.disabled=false;go.textContent='Подключить';}}
catch(e){show('Нет связи с сервером. Проверьте интернет и повторите.',false);go.disabled=false;go.textContent='Подключить';}};
</script></body></html>`;

export default {
  async fetch(request, env) {
    const url = new URL(request.url), origin = request.headers.get('Origin') || '';
    const own = origin === url.origin;   // страница настройки открывается с адреса самого сервера
    const okOrigin = !origin || own || ALLOWED_ORIGINS.includes(origin);
    const cors = origin && okOrigin && !own ? {
      'Access-Control-Allow-Origin': origin, 'Vary': 'Origin',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'authorization, content-type, x-ritm-kind',
      'Access-Control-Max-Age': '86400'
    } : {};
    const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
    const err = (status, code, message) => json(status, { error: { code, message } });

    if (!okOrigin) return err(403, 'origin', 'Запросы с этого адреса не принимаются.');
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });

    const apiKey = await getKey(env);

    if (request.method === 'GET') {
      // состояние сервера: без секретов, для проверки связи
      if (url.pathname === '/') return json(200, { ok: true, service: 'ritm-ai', configured: !!apiKey, storage: !!env.CONFIG, enroll: env.ENROLL_OPEN === '1', model: env.MODEL || MODEL_DEFAULT });
      if (url.pathname === '/setup') return new Response(SETUP_PAGE, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'referrer-policy': 'no-referrer', 'x-frame-options': 'DENY' } });
      return err(404, 'not_found', 'Нет такого адреса.');
    }
    if (request.method !== 'POST') return err(404, 'not_found', 'Нет такого адреса.');
    // браузер и приложение всегда присылают адрес страницы; запросы без него (скрипты, curl) не обслуживаем
    if (!origin) return err(403, 'origin', 'Запросы принимаются только из приложения.');

    // приём ключа со страницы /setup: только с самого сервера, только если ключа ещё нет, только рабочий ключ
    if (url.pathname === '/setup') {
      if (!own) return err(403, 'origin', 'Ключ принимается только со страницы настройки.');
      if (!env.CONFIG) return err(503, 'no_storage', 'Сервер ещё не готов принять ключ.');
      if (apiKey) return err(409, 'already_set', 'Ключ уже подключён. Заменить его можно в настройках Cloudflare.');
      let key = '';
      try { key = String((await request.json()).key || '').trim(); } catch (e) {}
      if (!/^sk-ant-[A-Za-z0-9_-]{20,300}$/.test(key)) return err(400, 'bad_key', 'Это не похоже на ключ Claude: он начинается с sk-ant-.');
      const res = await checkKey(key);
      if (!res.ok) return err(400, res.code, res.message);
      await env.CONFIG.put('anthropic_key', key);
      keyCache = { value: key, at: Date.now() };
      return json(200, { ok: true });
    }

    if (!apiKey) return err(503, 'not_configured', 'На сервере не задан ключ Claude.');

    // выдача пропуска новому устройству
    if (url.pathname === '/enroll') {
      if (own) return err(403, 'origin', 'Пропуск выдаётся только приложению.');
      if (env.ENROLL_OPEN !== '1') return err(403, 'enroll_closed', 'Подключение новых устройств закрыто.');
      const id = b64u(crypto.getRandomValues(new Uint8Array(12)));
      return json(200, { token: await sign(apiKey, 'd1.' + id + '.' + Date.now()) });
    }

    if (url.pathname !== '/ask') return err(404, 'not_found', 'Нет такого адреса.');
    const auth = request.headers.get('Authorization') || '';
    const device = auth.startsWith('Bearer ') ? await deviceOf(apiKey, auth.slice(7).trim()) : null;
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
    const headers = { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': API_VERSION };
    if (fallbacks) headers['anthropic-beta'] = 'server-side-fallback-2026-07-01';

    let up;
    try { up = await fetch(API, { method: 'POST', headers, body }); }
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
