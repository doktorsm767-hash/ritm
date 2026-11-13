/* Ритм — все данные с часов через Health Connect (только в приложении для Android, APK).
   Цепочка: часы Huawei → Huawei Health → приложение Health Sync → Health Connect → «Ритм».
   Читаем за последние 30 дней: шаги, расстояние, калории, пульс (средний/мин/макс), пульс в покое,
   сон с фазами, кислород в крови, вес и давление — и раскладываем по дням дневника. */
(function () {
  'use strict';
  const App = window.App, { h, icon, store, toast, haptic, kidsSet, nf } = App, ui = App.ui;
  const TYPES = ['steps', 'distance', 'totalCalories', 'calories', 'heartRate', 'restingHeartRate', 'sleep', 'weight', 'oxygenSaturation', 'bloodPressure'];
  const DAYS = 30;

  const plugin = () => { const C = window.Capacitor; return C && C.isNativePlatform && C.isNativePlatform() && C.Plugins && C.Plugins.Health ? C.Plugins.Health : null; };
  const ws = {
    native: () => !!plugin(),
    state: () => store.state.watchSync || (store.state.watchSync = { enabled: false, at: 0 }),
    busy: false
  };
  const iso = (d) => d.toISOString();
  const dayOf = (s) => App.dkey(new Date(s));

  async function safe(p) { try { return await p; } catch (e) { console.warn('Health Connect:', e && e.message); return null; } }

  ws.connect = async function () {
    const H = plugin(); if (!H) throw new Error('native');
    const av = await H.isAvailable();
    if (!av.available) { const e = new Error('unavailable'); e.reason = av.reason; throw e; }
    await H.requestAuthorization({ read: TYPES, write: [], requestHistoryAccess: true });
    ws.state().enabled = true; store.commit();
    return ws.sync();
  };

  ws.sync = async function () {
    const H = plugin(); if (!H || ws.busy) return null;
    ws.busy = true;
    const end = new Date(), start = new Date(Date.now() - DAYS * 864e5);
    const range = { startDate: iso(start), endDate: iso(end) };
    const agg = (dataType, aggregation) => safe(H.queryAggregated(Object.assign({ dataType, bucket: 'day', aggregation }, range)));
    const read = (dataType, limit) => safe(H.readSamples(Object.assign({ dataType, limit: limit || 500 }, range)));
    const got = {};
    const W = (k) => { const d = store.day(k); return d.watch || (d.watch = {}); };
    try {
      const [steps, dist, kcal, akcal, hr, rest, sleep, weight, spo2, bp] = await Promise.all([
        agg('steps', 'sum'), agg('distance', 'sum'), agg('totalCalories', 'sum'), agg('calories', 'sum'), agg('heartRate', ['average', 'min', 'max']),
        read('restingHeartRate', 200), read('sleep', 120), read('weight', 120), agg('oxygenSaturation', 'average'), read('bloodPressure', 200)]);
      (steps && steps.samples || []).forEach((s) => { if (s.value > 0) { store.day(dayOf(s.startDate)).steps = Math.round(s.value); got.steps = 1; } });
      (dist && dist.samples || []).forEach((s) => { if (s.value > 0) { W(dayOf(s.startDate)).km = +(s.value / 1000).toFixed(2); got.dist = 1; } });
      (kcal && kcal.samples || []).forEach((s) => { if (s.value > 0) { W(dayOf(s.startDate)).kcal = Math.round(s.value); got.kcal = 1; } });
      (akcal && akcal.samples || []).forEach((s) => { if (s.value > 0) { W(dayOf(s.startDate)).active = Math.round(s.value); got.kcal = 1; } });
      (hr && hr.samples || []).forEach((s) => { const v = s.values || {}; if (v.average) { const w = W(dayOf(s.startDate)); w.hrAvg = Math.round(v.average); w.hrMin = Math.round(v.min || 0) || null; w.hrMax = Math.round(v.max || 0) || null; got.hr = 1; } });
      (rest && rest.samples || []).forEach((s) => { W(dayOf(s.startDate)).rest = Math.round(s.value); got.rest = 1; });
      (spo2 && spo2.samples || []).forEach((s) => { if (s.value > 0) { W(dayOf(s.startDate)).spo2 = Math.round(s.value); got.spo2 = 1; } });
      // сон: сессия относится к дню пробуждения; считаем только время сна, без бодрствования
      const sleepBy = {};
      (sleep && sleep.samples || []).forEach((s) => {
        const k = dayOf(s.endDate), x = sleepBy[k] || (sleepBy[k] = { min: 0, deep: 0, light: 0, rem: 0, awake: 0 });
        if (s.stages && s.stages.length) s.stages.forEach((g) => { if (g.stage === 'awake' || g.stage === 'inBed') x.awake += g.durationMinutes; else { x.min += g.durationMinutes; if (x[g.stage] != null) x[g.stage] += g.durationMinutes; } });
        else x.min += s.value;
      });
      Object.keys(sleepBy).forEach((k) => { const x = sleepBy[k]; if (x.min > 30) { store.day(k).sleep = +(x.min / 60).toFixed(1); W(k).sleep = { deep: Math.round(x.deep), light: Math.round(x.light), rem: Math.round(x.rem), awake: Math.round(x.awake) }; got.sleep = 1; } });
      // вес: последняя запись за день; профиль обновляем, если запись новее
      const st = store.state;
      (weight && weight.samples || []).forEach((s) => { const k = dayOf(s.startDate), kg = +s.value.toFixed(1); st.weights = st.weights.filter((x) => x.d !== k); st.weights.push({ d: k, kg }); got.weight = 1; });
      if (got.weight) { const last = st.weights.slice().sort((a, b) => (a.d < b.d ? -1 : 1)).pop(); if (st.profile && last && Math.abs(last.kg - st.profile.weight) > 0.05) { st.profile.weight = last.kg; st.targets = App.calc.targets(st.profile); } }
      // давление: без дублей по идентификатору записи
      (bp && bp.samples || []).forEach((s) => {
        const id = 'hc-' + (s.platformId || s.startDate);
        if (s.systolic && !st.vitals.some((v) => v.id === id)) { st.vitals.push({ id, type: 'bp', d: dayOf(s.startDate), sys: Math.round(s.systolic), dia: Math.round(s.diastolic), pulse: null, src: 'watch' }); got.bp = 1; }
      });
      const s0 = ws.state(); s0.at = Date.now(); s0.got = Object.keys(got);
      store.commit();
      return s0.got;
    } finally { ws.busy = false; }
  };

  // автосинхронизация: при запуске и при возвращении в приложение, не чаще раза в 15 минут
  const auto = () => { const s = ws.state(); if (ws.native() && s.enabled && Date.now() - (s.at || 0) > 15 * 60e3) ws.sync().catch(() => {}); };
  setTimeout(auto, 2500);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') auto(); });

  /* ---------- блок «Данные с часов» для экрана «Часы» ---------- */
  ui.watchSyncBlock = function () {
    const box = h('div', { class: 'stack' });
    const draw = () => {
      const s = ws.state(), when = s.at ? new Date(s.at).toLocaleString('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }) : null;
      const btn = (txt, ic, fn, cls) => h('button', { class: 'btn block ' + (cls || 'primary'), type: 'button', onclick: fn }, icon(ic, 20), txt);
      const run = async (fn) => {
        try { const g = await fn(); haptic(12); toast(g && g.length ? 'Данные с часов обновлены' : 'Health Connect подключён, данных пока нет', { icon: 'refresh', color: 'var(--teal)' }); }
        catch (e) { toast(e.message === 'unavailable' ? 'Установите Health Connect из Google Play' : 'Не удалось получить данные: ' + (e.message || 'ошибка'), { icon: 'info', color: 'var(--orange)' }); }
        draw();
      };
      const status = !ws.native()
        ? h('div', { class: 'note', style: { '--c': 'var(--orange)' } }, h('b', { class: 'h' }, icon('info', 15), 'Нужно приложение для Android'), 'Шаги, сон и пульс за день читаются через Health Connect — это доступно только в установленном APK «Ритм».')
        : s.enabled
          ? h('div', { class: 'card', style: 'display:flex;gap:12px;align-items:center' }, h('span', { class: 'ico lg', style: { '--c': 'var(--teal)' } }, icon('check', 24)),
              h('div', null, h('div', { style: 'font-weight:600' }, 'Синхронизация включена'), h('div', { class: 'sub' }, when ? 'Обновлено ' + when + (s.got && s.got.length ? '' : ' · данных пока нет') : 'Ещё не обновлялось')))
          : null;
      kidsSet(box, h('div', { class: 'caption' }, 'Данные за день: шаги, сон, пульс, кислород, калории, вес'), status,
        ws.native() ? (s.enabled ? btn(ws.busy ? 'Обновляю…' : 'Обновить сейчас', 'refresh', () => run(ws.sync), 'tinted') : btn('Подключить Health Connect', 'heart', () => run(ws.connect))) : null,
        h('div', { class: 'card' }, h('ol', { class: 'coach-steps' },
          h('li', null, 'Установите из Google Play приложение Health Sync (от Appyhapps). Оно бесплатно на пробный период, дальше — платно.'),
          h('li', null, 'В Health Sync выберите источник «Huawei Health» и войдите в свой аккаунт Huawei, а назначение — «Health Connect».'),
          h('li', null, 'Включите синхронизацию шагов, сна, пульса, веса и кислорода.'),
          h('li', null, 'Здесь нажмите «Подключить Health Connect» и разрешите чтение данных.'))),
        h('p', { class: 'caption' }, 'Дальше «Ритм» обновляет данные сам — при каждом открытии, не чаще раза в 15 минут. Данные остаются на телефоне.'));
    };
    draw();
    return box;
  };

  App.watchSync = ws;
})();
