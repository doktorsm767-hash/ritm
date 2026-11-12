/* Ритм — ИИ. Три режима:
   1) страница открыта на claude.ai — встроенный Claude (capability `sample`), ключ не нужен;
   2) автономная PWA — официальный SDK Anthropic с ключом пользователя (хранится только на устройстве);
   3) ничего не подключено — демо-ответы, помеченные как пример. */
(function () {
  'use strict';
  const App = window.App;
  const CFG_KEY = 'ritm.ai.v1';
  const SDK_URL = 'https://cdn.jsdelivr.net/npm/@anthropic-ai/sdk@0.136.0/+esm';
  const MODELS = [
    { id: 'claude-opus-5-5', t: 'Claude Opus 5.5', d: 'Самый точный разбор. Рекомендуется.' },
    { id: 'claude-sonnet-5-5', t: 'Claude Sonnet 5.5', d: 'Быстрее и вдвое дешевле.' },
    { id: 'claude-haiku-5-5', t: 'Claude Haiku 5.5', d: 'Самый быстрый и недорогой.' }
  ];
  const cfg = { key: '', model: 'claude-opus-5-5' };
  try { Object.assign(cfg, JSON.parse(localStorage.getItem(CFG_KEY) || '{}')); } catch (e) {}
  const saveCfg = () => { try { localStorage.setItem(CFG_KEY, JSON.stringify(cfg)); } catch (e) {} };

  let sample = null, imgLimits = null, hosted = false, ready = false;
  const boot = (async () => {
    try {
      if (window.claude && typeof window.claude.use === 'function') {
        hosted = true;
        sample = await window.claude.use('sample');
        if (sample) { const lim = await sample.limits().catch(() => null); imgLimits = lim && lim.images ? lim.images : null; }
      }
    } catch (e) { sample = null; }
    ready = true;
    if (App.refresh) App.refresh();
  })();

  const mode = () => (sample ? 'claude' : cfg.key && !hosted ? 'key' : 'demo');
  const delay = (ms) => new Promise((r) => setTimeout(r, ms));
  const fail = (msg, code) => { const e = new Error(msg); e.user = msg; e.code = code; return e; };

  function parseJSON(text) {
    const t = String(text || '').trim();
    const tries = [t];
    const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/); if (fence) tries.push(fence[1]);
    const a = t.search(/[\[{]/), b = Math.max(t.lastIndexOf('}'), t.lastIndexOf(']'));
    if (a >= 0 && b > a) tries.push(t.slice(a, b + 1));
    for (const s of tries) { try { return JSON.parse(s); } catch (e) {} }
    throw fail('Ответ ИИ пришёл в неожиданном виде. Попробуйте ещё раз.', 'invalid_json');
  }
  const SAMPLE_ERR = {
    not_granted: 'Вы не разрешили странице обращаться к Claude. Обновите страницу и разрешите доступ.',
    sampling_disabled: 'Claude недоступен для этой учётной записи.',
    rate_limited: 'Слишком много запросов или исчерпан лимит Claude. Попробуйте позже.',
    session_expired: 'Сессия истекла. Войдите в Claude заново.',
    image_rejected: 'Не получилось прочитать фото. Попробуйте другой снимок в формате JPEG или PNG.',
    images_unavailable: 'Здесь нельзя отправлять фото в Claude. Введите данные вручную.',
    refused: 'Claude не стал обрабатывать этот запрос. Попробуйте переформулировать.',
    invalid_json: 'Ответ ИИ пришёл в неожиданном виде. Попробуйте ещё раз.',
    prompt_too_large: 'Слишком много данных для одного запроса.',
    cancelled: 'Запрос отменён.'
  };

  // фото -> JPEG не больше 1568 px по длинной стороне (для режима с ключом)
  async function toJpegB64(file) {
    const bmp = await createImageBitmap(file);
    const k = Math.min(1, 1568 / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas'); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
    c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', 0.86).split(',')[1];
  }
  const fileB64 = (file) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1]); r.onerror = rej; r.readAsDataURL(file); });

  let sdkPromise = null;
  const loadSdk = () => sdkPromise || (sdkPromise = import(SDK_URL).then((m) => m.default || m.Anthropic).catch((e) => { sdkPromise = null; throw fail('Не удалось загрузить библиотеку Claude. Проверьте интернет.', 'sdk'); }));

  async function viaKey(prompt, o) {
    const Anthropic = await loadSdk();
    const client = new Anthropic({ apiKey: cfg.key, dangerouslyAllowBrowser: true });
    const content = [];
    for (const f of o.files || []) {
      if (f.type === 'application/pdf') content.push({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: await fileB64(f) } });
      else content.push({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: await toJpegB64(f) } });
    }
    content.push({ type: 'text', text: prompt });
    const req = { model: cfg.model, max_tokens: 16000, output_config: { effort: o.effort || 'medium' }, messages: [{ role: 'user', content: content }] };
    // при отказе по соображениям безопасности сервер сам переключится на запасную модель (кроме Haiku)
    if (cfg.model !== 'claude-haiku-5-5') { req.betas = ['server-side-fallback-2026-07-01']; req.fallbacks = 'default'; }
    let res;
    try {
      res = req.betas ? await client.beta.messages.create(req, { signal: o.signal }) : await client.messages.create(req, { signal: o.signal });
    } catch (e) {
      if (o.signal && o.signal.aborted) throw fail(SAMPLE_ERR.cancelled, 'cancelled');
      if (Anthropic.AuthenticationError && e instanceof Anthropic.AuthenticationError) throw fail('Ключ API не подошёл. Проверьте его в настройках ИИ.', 'auth');
      if (Anthropic.PermissionDeniedError && e instanceof Anthropic.PermissionDeniedError) throw fail('У ключа нет доступа к этой модели.', 'auth');
      if (Anthropic.RateLimitError && e instanceof Anthropic.RateLimitError) throw fail(SAMPLE_ERR.rate_limited, 'rate_limited');
      if (Anthropic.APIConnectionError && e instanceof Anthropic.APIConnectionError) throw fail('Нет связи с сервером Claude. Проверьте интернет.', 'network');
      if (Anthropic.APIError && e instanceof Anthropic.APIError) throw fail(e.status >= 500 ? 'Сервис Claude сейчас перегружен. Попробуйте через минуту.' : 'Claude отклонил запрос (' + (e.status || 'ошибка') + ').', 'api');
      throw fail('Не удалось получить ответ ИИ. Попробуйте ещё раз.', 'unknown');
    }
    if (res.stop_reason === 'refusal') throw fail(SAMPLE_ERR.refused, 'refused');
    if (res.stop_reason === 'max_tokens') throw fail('Ответ получился слишком длинным. Попробуйте ещё раз.', 'truncated');
    return parseJSON((res.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('\n'));
  }

  async function viaSample(prompt, o) {
    const opts = { cache: false, modelTier: o.tier || 'default' };
    if (o.signal) opts.signal = o.signal;
    if (o.files && o.files.length) {
      if (!imgLimits) throw fail(SAMPLE_ERR.images_unavailable, 'images_unavailable');
      if (o.files.some((f) => f.type === 'application/pdf')) throw fail('PDF здесь не читается. Сделайте снимок экрана или фото бланка.', 'pdf');
      opts.images = o.files.slice(0, imgLimits.maxCount || 4);
    }
    try { return await sample.json(prompt, opts); }
    catch (e) { throw fail(SAMPLE_ERR[e && e.code] || 'Не удалось получить ответ ИИ. Попробуйте ещё раз.', e && e.code); }
  }

  // главный вызов: вернёт { data, demo }
  async function ask(kind, prompt, o) {
    o = o || {};
    await Promise.race([boot, delay(o.files ? 11000 : 3000)]);
    const m = mode();
    if (m === 'claude') return { data: await viaSample(prompt, o), demo: false };
    if (m === 'key') return { data: await viaKey(prompt, o), demo: false };
    await delay(1300);
    const d = App.data.DEMO[kind];
    if (!d) throw fail('ИИ не подключён. Откройте профиль → «ИИ-помощник».', 'no_ai');
    return { data: d(o.demoArg), demo: true };
  }

  /* ---------- контекст человека для запросов ---------- */
  function who() {
    const s = App.store.state, p = s.profile, t = s.targets;
    if (!p) return 'Данные о человеке не указаны.';
    const goal = { lose: 'похудеть', keep: 'поддерживать вес', gain: 'набрать массу' }[p.goal];
    let out = 'Человек: ' + (p.sex === 'm' ? 'мужчина' : 'женщина') + ', ' + App.calc.age(p) + ' лет, рост ' + p.height + ' см, вес ' + p.weight + ' кг. Цель: ' + goal +
      (p.targetWeight && p.goal !== 'keep' ? ' до ' + p.targetWeight + ' кг' : '') + '.';
    if (t) out += ' Суточная норма: ' + t.kcal + ' ккал, белки ' + t.p + ' г, жиры ' + t.f + ' г, углеводы ' + t.c + ' г.';
    if (p.allergies) out += ' Аллергии, непереносимости и нелюбимые продукты (строго исключить): ' + p.allergies + '.';
    return out;
  }
  function labFlags() {
    const labs = App.store.state.labs.slice().sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 3), seen = {}, out = [];
    labs.forEach((l) => (l.markers || []).forEach((m) => {
      if (seen[m.name]) return; seen[m.name] = 1;
      if (m.status === 'low' || m.status === 'high') out.push(m.name + ' ' + (m.status === 'low' ? 'ниже' : 'выше') + ' нормы (' + m.value + ' ' + (m.unit || '') + ')');
    }));
    return out.length ? 'Отклонения в последних анализах: ' + out.join('; ') + '.' : 'Отклонений в анализах нет или анализы не внесены.';
  }
  const SAFE = 'Ты не врач: не ставь диагнозы, не назначай лекарства и дозировки. При заметных отклонениях советуй обратиться к врачу. Пиши по-русски, просто и по делу.';
  const J = 'Ответь ТОЛЬКО одним JSON-объектом без пояснений. ';

  const api = {
    MODELS, cfg, saveCfg, mode, ready: () => ready, hosted: () => hosted, canPhoto: () => (mode() === 'claude' ? !!imgLimits : true), who, labFlags,

    parseLab: (files) => ask('lab',
      'На фото — бланк лабораторных анализов человека, который ведёт личный дневник здоровья. Извлеки данные. ' + J +
      'Формат: {"title":"краткое название, например «Общий анализ крови»","lab":"лаборатория или пустая строка","date":"ГГГГ-ММ-ДД или null",' +
      '"markers":[{"name":"показатель по-русски","value":число,"unit":"ед. изм.","refMin":число или null,"refMax":число или null}],' +
      '"doctorNote":"заключение или комментарий врача с бланка дословно, если он есть, иначе пустая строка",' +
      '"summary":"2–3 предложения простым языком: что в норме и что отклонено","nutrition":["до 4 советов по питанию"],"lifestyle":["до 3 советов по образу жизни"],"doctor":["до 3 пунктов: что обсудить с врачом и с каким"]}. ' +
      'Значения и референсы бери строго с бланка, ничего не придумывай; нечисловые результаты пропусти. Если на фото не анализы, верни {"error":"not_lab"}. ' + SAFE + '\n' + who(),
      { files: files, effort: 'medium' }),

    explainLab: (lab) => ask('lab',
      'Вот результаты анализов (показатель, значение, единицы, референс): ' + JSON.stringify((lab.markers || []).map((m) => [m.name, m.value, m.unit, m.refMin, m.refMax])) +
      (lab.doctorNote ? '. Заключение врача: «' + lab.doctorNote + '»' : '') + '. ' + J +
      'Формат: {"summary":"2–3 предложения простым языком","nutrition":["до 4 советов по питанию"],"lifestyle":["до 3 советов"],"doctor":["до 3 пунктов, что обсудить с врачом"]}. ' +
      'Если есть заключение врача, опирайся на него и не противоречь ему. ' + SAFE + '\n' + who(), { effort: 'medium' }),

    mealPlan: (o) => ask('mealPlan',
      'Составь меню на 7 дней. ' + who() + ' ' + labFlags() + (o.wishes ? ' Пожелания: ' + o.wishes + '.' : '') +
      (o.fridge && o.fridge.length ? ' В холодильнике есть (по возможности используй): ' + o.fridge.join(', ') + '.' : '') + ' ' + J +
      'Формат: {"note":"1–2 предложения: как меню учитывает цель и анализы","days":[{"title":"Понедельник","meals":[{"meal":"breakfast|lunch|dinner|snack","name":"блюдо","kcal":число,"p":число,"f":число,"c":число,' +
      '"ingredients":[{"name":"продукт","grams":число}],"steps":["до 3 коротких шагов"]}]}]}. ' +
      'В каждом дне ровно 4 приёма: breakfast, lunch, dinner, snack. Сумма калорий дня — в пределах ±5% от нормы, белок не ниже нормы. Простые блюда из доступных в России продуктов, до 6 ингредиентов. ' + SAFE,
      { effort: 'medium', tier: 'default' }),

    trainPlan: (o) => ask('trainPlan',
      'Составь программу тренировок. ' + who() + ' ' + labFlags() + ' Место: ' + (o.place === 'gym' ? 'тренажёрный зал' : 'дома без инвентаря') + '. Уровень: ' +
      ({ beginner: 'новичок', middle: 'средний', advanced: 'опытный' }[o.level] || 'средний') + '. Тренировок в неделю: ' + o.days + '.' + (o.limits ? ' Ограничения и травмы: ' + o.limits + '.' : '') + ' ' + J +
      'Формат: {"title":"название программы","note":"1–2 предложения: логика программы","weekdays":[номера дней недели 0–6, где 0 — понедельник, по одному на тренировку],' +
      '"days":[{"title":"название тренировки","focus":"акцент","exercises":[{"name":"упражнение","sets":число,"reps":"повторы или время","rest":секунды отдыха,"tip":"короткая подсказка по технике"}]}]}. ' +
      '5–7 упражнений на тренировку, безопасные для самостоятельного выполнения. Учитывай ограничения по здоровью. ' + SAFE, { effort: 'medium', demoArg: o }),

    fridgePhoto: (files) => ask('fridge',
      'На фото — содержимое холодильника или продукты. Перечисли то, что уверенно видно. ' + J +
      'Формат: {"items":[{"name":"продукт по-русски","qty":"примерное количество, например «500 г» или «2 шт»","cat":"Овощи и фрукты|Мясо и рыба|Молочное и яйца|Крупы и бакалея|Напитки|Другое"}]}. Не придумывай то, чего не видно.',
      { files: files, effort: 'low', tier: 'default' }),

    recipes: (o) => ask('recipes',
      'Предложи 3 блюда из того, что есть дома. Продукты: ' + o.items.join(', ') + '. ' + who() + ' ' + labFlags() +
      ' На сегодня осталось: ' + o.left.kcal + ' ккал, белки ' + o.left.p + ' г, жиры ' + o.left.f + ' г, углеводы ' + o.left.c + ' г.' + (o.wish ? ' Пожелание: ' + o.wish + '.' : '') + ' ' + J +
      'Формат: {"recipes":[{"name":"блюдо","time":минуты,"kcal":число,"p":число,"f":число,"c":число,"uses":["продукты из списка"],"missing":["чего не хватает, не более 2, базовое"],' +
      '"ingredients":[{"name":"продукт","grams":число}],"steps":["до 5 коротких шагов"]}]}. Значения — на одну порцию. Блюда должны вписываться в остаток дня. ' + SAFE, { effort: 'low' }),

    productLabel: (files) => ask('product',
      'На фото — упаковка или этикетка продукта (состав, пищевая ценность). Прочитай и оцени продукт для этого человека. ' + who() + ' ' + J +
      'Формат: {"name":"название","brand":"марка или пустая строка","per100":{"kcal":число,"p":число,"f":число,"c":число,"sugar":число или null,"salt":число или null,"fiber":число или null},' +
      '"ingredients":"состав одной строкой","verdict":"good|ok|bad","summary":"1–2 предложения: подходит ли под цель и почему","pros":["до 3"],"cons":["до 3"]}. ' +
      'Числа бери с этикетки; если пищевой ценности не видно, оцени по составу и скажи об этом в summary. Если на фото не продукт, верни {"error":"not_product"}.',
      { files: files, effort: 'low' }),

    productVerdict: (p) => ask('product',
      'Оцени продукт для этого человека. ' + who() + ' ' + labFlags() + ' Продукт: ' + JSON.stringify({ name: p.name, brand: p.brand, per100: p.per100, ingredients: p.ingredients, additives: p.additives, allergens: p.allergens }) + '. ' + J +
      'Формат: {"verdict":"good|ok|bad","summary":"1–2 предложения: подходит ли под цель и почему","pros":["до 3"],"cons":["до 3"]}. ' + SAFE, { effort: 'low', tier: 'quick' }),

    foodEstimate: (text, files) => ask('food',
      (files && files.length ? 'На фото — еда. ' : '') + 'Оцени, что съедено' + (text ? ': «' + text + '»' : '') + '. ' + J +
      'Формат: {"items":[{"name":"блюдо или продукт","grams":число,"kcal":число,"p":число,"f":число,"c":число}]}. Оценивай реалистичные порции; значения — на всю порцию.',
      { files: files, effort: 'low', tier: 'quick', demoArg: text })
  };

  // демо-ответы для видов запросов, которых нет в справочнике
  App.data.DEMO.mealPlan = () => { const p = App.data.templateMealPlan(App.store.state.targets); return { note: p.note, days: p.days }; };
  App.data.DEMO.trainPlan = (o) => App.data.templateTrainPlan(Object.assign({ goal: App.store.state.profile && App.store.state.profile.goal }, o || {}));
  App.data.DEMO.food = (text) => ({ items: [{ name: text ? text.slice(0, 40) : 'Блюдо с фото', grams: 300, kcal: 420, p: 24, f: 15, c: 45 }] });

  App.ai = api;
})();
