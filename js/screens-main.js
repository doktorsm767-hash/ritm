/* Ритм — онбординг, экран «Сегодня», профиль, меню быстрых действий. */
(function () {
  'use strict';
  const App = window.App, { h, icon, store, calc, nf, ring, bar, countUp, sheet, toast, haptic } = App;
  const ui = App.ui;
  const kidsSet = App.kidsSet, kidsAdd = App.kidsAdd;

  /* ---------- общие кирпичики ---------- */
  ui.head = (title, link, onLink) => h('div', { class: 'section-head' }, h('h2', null, title), link ? h('button', { class: 'link', type: 'button', onclick: onLink }, link) : null);
  ui.row = (o) => h(o.onclick ? 'button' : 'div', { class: 'row' + (o.onclick ? ' tap' : '') + (o.icon ? ' has-icon' : ''), type: o.onclick ? 'button' : null, onclick: o.onclick },
    o.icon ? h('span', { class: 'ico' + (o.soft ? ' soft' : ''), style: { '--c': o.color || 'var(--accent)' } }, icon(o.icon, 18)) : null,
    h('div', { class: 'row-main' }, h('div', { class: 'row-title' + (o.wrap ? ' wrap' : '') }, o.title), o.sub ? h('div', { class: 'row-sub' + (o.wrap ? ' wrap' : '') }, o.sub) : null),
    o.val != null ? h('div', { class: 'row-val num' }, o.val) : null, o.right || null,
    o.onclick && o.chev !== false ? icon('chevR', 16) : null);
  ui.empty = (o) => h('div', { class: 'card empty rise' }, h('span', { class: 'ico soft', style: { '--c': o.color || 'var(--accent)' } }, icon(o.icon, 30)), h('b', null, o.title), h('p', null, o.text), o.action || null);
  ui.aiWait = (text) => h('div', { class: 'ai-wait fade' }, h('div', { class: 'ai-orb' }), h('b', null, text || 'Claude думает…'), h('div', { class: 'sub' }, 'Обычно это занимает до минуты'));
  ui.demoBadge = () => h('span', { class: 'demo-badge' }, icon('info', 13), 'Демо-пример');
  ui.aiNote = () => {
    const m = App.ai.mode();
    return m === 'demo' ? h('div', { class: 'note', style: { '--c': 'var(--orange)' } }, h('b', { class: 'h' }, icon('info', 15), 'ИИ не подключён'),
      'Сейчас показываются примеры ответов, а не разбор ваших данных.',
      h('div', { style: 'margin-top:10px' }, h('button', { class: 'btn sm tinted', type: 'button', style: '--accent:var(--orange)', onclick: () => ui.aiSettings() }, 'Подробнее'))) : null;
  };
  // выбор фото: с камеры или из галереи
  ui.pickPhoto = (o) => {
    const inp = h('input', { type: 'file', accept: o.accept || 'image/jpeg,image/png,image/webp', hidden: true, id: 'pick-' + App.uid() });
    if (o.capture) inp.setAttribute('capture', 'environment');
    if (o.multiple) inp.multiple = true;
    inp.addEventListener('change', () => { const f = Array.from(inp.files || []); inp.remove(); if (f.length) o.onFiles(f); });
    document.body.appendChild(inp); inp.click();
  };
  const weekday = () => new Date().toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' });

  /* ---------- онбординг ---------- */
  ui.onboarding = function () {
    const year = new Date().getFullYear();
    const d = { name: '', sex: 'm', birthYear: year - 30, height: 172, weight: 72, activity: 1.375, goal: 'lose', pace: 0.5, targetWeight: null, allergies: '' };
    let step = 0, dir = 1, api;
    const top = h('div', { class: 'ob-top' }), body = h('div', { class: 'ob-body' }), foot = h('div', { class: 'ob-foot' });
    const prog = h('i');
    let progVal = 0;

    const option = (o, on, pick) => h('button', { class: 'option' + (on ? ' on' : ''), type: 'button', onclick: pick },
      o.icon ? h('span', { class: 'ico lg soft', style: { '--c': o.c || 'var(--accent)' } }, icon(o.icon, 24)) : null,
      h('div', null, h('div', { class: 't' }, o.t), o.d ? h('div', { class: 'd' }, o.d) : null), h('span', { class: 'radio' }, icon('check', 14)));
    const pickOne = (list, key, wrap) => { const box = h('div', { class: 'options' }); const draw = () => kidsSet(box, ...list.map((o) => option(o, d[key] === o.id, () => { d[key] = o.id; haptic(6); draw(); if (wrap) wrap(); }))); draw(); return box; };

    const steps = [
      { welcome: true },
      { t: 'Давайте знакомиться', lead: 'Пол нужен для точного расчёта обмена веществ и норм анализов.', build: () => {
        const name = h('input', { class: 'input-big', id: 'ob-name', placeholder: 'Ваше имя', value: d.name, autocomplete: 'given-name', maxlength: '30', oninput: (e) => { d.name = e.target.value; } });
        return [name, pickOne([{ id: 'm', t: 'Мужчина' }, { id: 'f', t: 'Женщина' }], 'sex')];
      } },
      { t: 'Сколько вам лет?', lead: 'С возрастом обмен веществ меняется — учтём это в расчёте.', build: () => App.ruler({ min: 16, max: 90, value: year - d.birthYear, unit: (v) => App.plural(v, 'год', 'года', 'лет'), major: 5, label: 'Возраст', onChange: (v) => { d.birthYear = year - v; } }) },
      { t: 'Ваш рост', lead: 'Нужен для расчёта обмена веществ и индекса массы тела.', build: () => App.ruler({ min: 130, max: 215, value: d.height, unit: ' см', label: 'Рост', onChange: (v) => { d.height = v; } }) },
      { t: 'Ваш вес сейчас', lead: 'Лучше взвеситься утром натощак.', build: () => App.ruler({ min: 35, max: 200, step: 0.1, decimals: 1, value: d.weight, unit: ' кг', label: 'Вес', onChange: (v) => { d.weight = v; } }) },
      { t: 'Насколько вы активны?', lead: 'Выберите то, что ближе к обычной неделе.', build: () => pickOne(calc.ACTIVITY, 'activity') },
      { t: 'Какая у вас цель?', lead: 'От неё зависят калории, БЖУ, меню и тренировки.', build: () => pickOne(calc.GOALS, 'goal') },
      { skip: () => d.goal === 'keep', t: 'К какому весу идём?', lead: 'Темп можно будет изменить в профиле.', build: () => {
        if (d.targetWeight == null || (d.goal === 'lose') !== (d.targetWeight < d.weight)) d.targetWeight = +(d.weight + (d.goal === 'lose' ? -5 : 4)).toFixed(1);
        const fc = h('div', { class: 'note', style: { '--c': 'var(--blue)' } });
        const paces = d.goal === 'lose' ? [0.25, 0.5, 0.75, 1] : [0.25, 0.5];
        if (paces.indexOf(d.pace) < 0) d.pace = 0.5;
        const upd = () => {
          const t = calc.targets(d), f = calc.forecast(d, t);
          kidsSet(fc, h('b', { class: 'h' }, icon('calendar', 15), 'Прогноз'), f ? 'Примерно ' + nf(f.rate, 2) + ' кг в неделю — цель к ' + f.date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' }) + '. ' : 'Укажите целевой вес. ',
            d.goal === 'lose' && d.pace >= 0.75 ? 'Быстрый темп сложнее удержать: комфортнее 0,5 кг в неделю.' : 'Плавный темп помогает сохранить результат.');
        };
        upd();
        return [
          App.ruler({ min: 35, max: 200, step: 0.5, decimals: 1, major: 10, value: d.targetWeight, unit: ' кг', label: 'Целевой вес', onChange: (v) => { d.targetWeight = v; upd(); } }),
          h('div', null, h('div', { class: 'caption', style: 'margin-bottom:8px' }, 'Темп, кг в неделю'), App.seg(paces.map((p) => ({ id: p, label: nf(p, 2) })), d.pace, (v) => { d.pace = v; upd(); })),
          fc
        ];
      } },
      { t: 'Что исключить из питания?', lead: 'Аллергии, непереносимость или просто нелюбимые продукты. Можно пропустить.', build: () => {
        const ta = h('textarea', { class: 'input-big', id: 'ob-allergies', rows: '3', placeholder: 'Например: лактоза, орехи, не ем рыбу', oninput: (e) => { d.allergies = e.target.value; } }, d.allergies);
        ta.value = d.allergies;
        const chips = ['лактоза', 'глютен', 'орехи', 'рыба и морепродукты', 'свинина', 'мясо (вегетарианство)'];
        return [ta, h('div', { class: 'chips' }, chips.map((c) => h('button', { class: 'pillbtn', type: 'button', onclick: () => { d.allergies = (d.allergies ? d.allergies.replace(/[,\s]+$/, '') + ', ' : '') + c; ta.value = d.allergies; haptic(5); } }, '+ ' + c)))];
      } },
      { result: true }
    ];

    function resultView() {
      const t = calc.targets(d), f = calc.forecast(d, t), b = calc.bmi(d), bi = calc.bmiInfo(b);
      const tile = (label, v, c, i) => h('div', { class: 'nutri pop', style: { animationDelay: 150 + i * 80 + 'ms' } }, h('b', { style: { color: c } }, countUp(h('span'), v), ' г'), h('span', null, label));
      App.memo['ob:kcal'] = 0;
      const warn = t.guard === 'minor' ? 'До 18 лет дефицит калорий подбирает врач — мы рассчитали поддерживающую норму.'
        : t.guard === 'underweight' ? 'Ваш индекс массы тела ниже нормы, снижать вес небезопасно. Рассчитана поддерживающая норма — обсудите цель с врачом.'
        : t.limited ? 'Норма ограничена безопасным минимумом. Более жёсткий дефицит — только под наблюдением врача.' : null;
      return [
        h('h1', null, (d.name ? d.name.trim() + ', в' : 'В') + 'аш план готов'),
        h('div', { class: 'card', style: 'background:var(--card-elev);display:flex;flex-direction:column;align-items:center;gap:14px;padding:22px 16px' },
          ring({ id: 'ob:kcal', size: 176, stroke: 18, value: 1, color: 'var(--pink)', center: [h('div', { class: 'big', style: 'font-size:44px' }, countUp(h('span'), t.kcal)), h('div', { class: 'sub' }, 'ккал в день')] }),
          h('div', { class: 'nutri-grid', style: 'grid-template-columns:repeat(3,1fr);width:100%' }, tile('Белки', t.p, 'var(--pink)', 0), tile('Жиры', t.f, 'var(--orange)', 1), tile('Углеводы', t.c, 'var(--blue)', 2))),
        h('div', { class: 'list', style: 'background:var(--card-elev)' },
          ui.row({ icon: 'flame', color: 'var(--orange)', soft: true, title: 'Базовый обмен', sub: 'Тратится в полном покое', val: nf(t.bmr) + ' ккал' }),
          ui.row({ icon: 'walk', color: 'var(--green)', soft: true, title: 'Расход за день', sub: 'С учётом активности', val: nf(t.tdee) + ' ккал' }),
          ui.row({ icon: t.delta < 0 ? 'down' : t.delta > 0 ? 'up' : 'target', color: 'var(--blue)', soft: true, title: t.delta < 0 ? 'Дефицит' : t.delta > 0 ? 'Профицит' : 'Баланс', sub: f ? 'Цель — к ' + f.date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' }) : 'Поддержание веса', val: (t.delta > 0 ? '+' : '') + nf(t.delta) + ' ккал' }),
          ui.row({ icon: 'scale', color: bi.c, soft: true, title: 'Индекс массы тела', sub: bi.t, val: nf(b, 1) })),
        warn ? h('div', { class: 'note', style: { '--c': 'var(--orange)' } }, h('b', { class: 'h' }, icon('info', 15), 'Важно'), warn) : null,
        h('p', { class: 'disclaimer' }, 'Расчёт по формуле Миффлина — Сан Жеора. Это ориентир, а не медицинское назначение.')
      ];
    }
    function welcomeView() {
      const rings = h('div', { style: 'position:relative;width:150px;height:150px;display:grid;place-items:center' });
      ['var(--pink)', 'var(--orange)', 'var(--blue)'].forEach((c, i) => {
        App.memo['ob:w' + i] = 0;
        const r = ring({ id: 'ob:w' + i, size: 150 - i * 42, stroke: 16, value: [0.82, 0.68, 0.9][i], color: c });
        r.style.position = 'absolute'; rings.appendChild(r);
      });
      const feat = (ic, c, t, s) => h('div', { class: 'feature' }, h('span', { class: 'ico lg soft', style: { '--c': c } }, icon(ic, 24)), h('div', null, h('b', null, t), h('span', null, s)));
      return h('div', { class: 'welcome' }, rings, h('h1', null, 'Ритм'), h('p', null, 'Питание, тренировки и анализы — в одном месте и под вашу цель'),
        h('div', { class: 'stack', style: 'margin-top:14px;width:100%;max-width:320px' },
          feat('flask', 'var(--purple)', 'Анализы с разбором', 'Фото бланка — и понятное объяснение'),
          feat('food', 'var(--green)', 'БЖУ, меню и тренировки', 'Рассчитаны под вашу цель и анализы'),
          feat('scan', 'var(--blue)', 'Холодильник и сканер', 'Что приготовить и что купить')));
    }

    function draw() {
      while (steps[step].skip && steps[step].skip()) step += dir;
      const s = steps[step], last = step === steps.length - 1;
      kidsSet(top, step > 0 ? h('button', { class: 'icon-btn plain', type: 'button', 'aria-label': 'Назад', onclick: () => { dir = -1; step--; draw(); } }, icon('chevL', 22)) : h('span', { style: 'width:36px' }),
        step > 0 ? h('div', { class: 'ob-progress' }, prog) : h('span', { style: 'flex:1' }), h('span', { style: 'width:28px' }));
      const to = step / (steps.length - 1);
      App.spring({ from: progVal, to: to, response: 0.5, damping: 1, precision: 0.002, onUpdate: (v) => { progVal = v; prog.style.transform = 'scaleX(' + v + ')'; } });
      kidsSet(body, ...(s.welcome ? [welcomeView()] : s.result ? resultView() : [h('h1', null, s.t), s.lead ? h('p', { class: 'lead' }, s.lead) : null].concat(s.build())));
      body.scrollTop = 0;
      if (!App.still() && body.animate) body.animate([{ opacity: 0, transform: 'translateX(' + 28 * dir + 'px)' }, { opacity: 1, transform: 'none' }], { duration: 340, easing: 'cubic-bezier(.2,.8,.2,1)' });
      kidsSet(foot, 
        h('button', { class: 'btn primary block', type: 'button', onclick: () => { haptic(8); if (last) return finish(); dir = 1; step++; draw(); } }, s.welcome ? 'Начать' : last ? 'Начать пользоваться' : 'Далее'),
        s.welcome ? h('button', { class: 'btn plain block', type: 'button', onclick: () => { App.data.seedDemo(); api.close(); App.go('today', { reset: true }); toast('Загружен пример', { icon: 'sparkles', color: 'var(--purple)' }); } }, 'Посмотреть на примере') : null);
    }
    function finish() {
      const s = store.state;
      d.name = d.name.trim();
      if (d.goal === 'keep') d.targetWeight = null;
      s.profile = d; s.targets = calc.targets(d); s.demo = false;
      s.weights = [{ d: App.dkey(), kg: d.weight }];
      App.memo = {};
      store.commit(); api.close(); App.go('today', { reset: true });
    }
    api = sheet({ detent: 'full', locked: true, bare: true, onClose: () => { ui.closeOnboarding = null; }, build: (b) => { b.appendChild(h('div', { class: 'ob' }, top, body, foot)); draw(); } });
    ui.closeOnboarding = () => api.close();
  };

  /* ---------- «Сегодня» ---------- */
  function medsToday(s, day) {
    const out = [];
    s.meds.forEach((m) => (m.times || []).forEach((tm) => out.push({ m: m, tm: tm, key: m.id + '@' + tm, done: !!day.meds[m.id + '@' + tm] })));
    return out.sort((a, b) => (a.tm < b.tm ? -1 : 1));
  }
  ui.toggleMed = (key) => { const d = store.day(); d.meds[key] = !d.meds[key]; haptic(10); store.commit(); };

  function todayTab() {
    const s = store.state, t = s.targets, day = store.peek(), today = App.dkey();
    const eaten = calc.sumFood(day.food), left = Math.round(t.kcal - eaten.kcal);
    const macro = (label, v, target, c, id) => h('div', { class: 'macro' }, h('div', { class: 'top' }, h('b', null, label), h('span', null, nf(v) + ' / ' + nf(target) + ' г')), bar({ id: id, value: v / target, color: c }));
    const body = [];

    if (s.demo) body.push(h('div', { class: 'note rise', style: { '--c': 'var(--purple)', marginBottom: '14px' } }, h('b', { class: 'h' }, icon('sparkles', 15), 'Это пример'),
      'Данные вымышленные — чтобы показать, как выглядит заполненное приложение.',
      h('div', { style: 'margin-top:10px' }, h('button', { class: 'btn sm tinted', type: 'button', onclick: () => { store.reset(); ui.onboarding(); } }, 'Начать со своими данными'))));

    body.push(h('div', { class: 'card tap rise', role: 'button', tabindex: '0', onclick: () => App.go('food') },
      h('div', { class: 'hero' },
        ring({ id: 'today:kcal', size: 136, stroke: 15, value: eaten.kcal / t.kcal, color: left < 0 ? 'var(--red)' : 'var(--pink)', center: [
          h('div', { class: 'big', style: 'font-size:32px' }, countUp(h('span'), Math.abs(left), { id: 'today:left' })),
          h('div', { class: 'sub' }, left >= 0 ? 'ккал осталось' : 'ккал сверх нормы')] }),
        h('div', { class: 'macros' }, macro('Белки', eaten.p, t.p, 'var(--pink)', 'today:p'), macro('Жиры', eaten.f, t.f, 'var(--orange)', 'today:f'), macro('Углеводы', eaten.c, t.c, 'var(--blue)', 'today:c'))),
      h('div', { class: 'sub', style: 'margin-top:14px;display:flex;justify-content:space-between' }, h('span', null, 'Съедено ' + nf(eaten.kcal) + ' из ' + nf(t.kcal) + ' ккал'), h('span', { style: 'color:var(--accent);font-weight:600' }, 'Дневник'))));

    // плитки трекеров
    const last7 = []; for (let i = 6; i >= 0; i--) last7.push(store.peek(App.addDays(today, -i)));
    const glassFill = h('i');
    App.animateValue('today:glass', App.clamp(day.water / t.water, 0, 1), (f) => { glassFill.style.transform = 'scaleY(' + f + ')'; });
    const w = s.weights.slice().sort((a, b) => (a.d < b.d ? -1 : 1)), lw = w[w.length - 1], fw = w[0];
    const dw = lw && fw && w.length > 1 ? lw.kg - fw.kg : null;
    const tile = (o) => h('div', { class: 'card tap tile rise', role: 'button', tabindex: '0', style: { '--i': o.i }, onclick: o.go },
      h('div', { class: 'card-title', style: { color: o.c } }, icon(o.icon, 18), o.title), o.extra || null,
      h('div', { class: 'foot' }, h('div', { class: 'mid' }, o.val, h('small', null, o.unit)), h('div', { class: 'sub' }, o.sub)));
    body.push(h('div', { class: 'grid2', style: 'margin-top:12px' },
      tile({ i: 1, icon: 'drop', c: 'var(--blue)', title: 'Вода', val: nf(day.water / 1000, 2), unit: 'л', sub: 'из ' + nf(t.water / 1000, 1) + ' л', go: () => ui.water(),
        extra: [h('div', { class: 'water-glass' }, glassFill), h('button', { class: 'btn sm tinted', type: 'button', style: '--accent:var(--blue);align-self:flex-start', onclick: (e) => { e.stopPropagation(); store.day().water += 250; haptic(10); store.commit(); } }, '+ 250 мл')] }),
      tile({ i: 2, icon: 'moon', c: 'var(--indigo)', title: 'Сон', val: day.sleep != null ? nf(day.sleep, 1) : '—', unit: day.sleep != null ? 'ч' : '', sub: day.sleep != null ? 'цель ' + t.sleep + ' ч' : 'Отметьте сон', go: () => ui.sleep(), extra: App.spark(last7.map((x) => x.sleep), 'var(--indigo)') }),
      tile({ i: 3, icon: 'walk', c: 'var(--green)', title: 'Шаги', val: day.steps != null ? nf(day.steps) : '—', unit: '', sub: 'цель ' + nf(t.steps), go: () => ui.steps(), extra: h('div', { style: 'margin-top:6px' }, bar({ id: 'today:steps', value: (day.steps || 0) / t.steps, color: 'var(--green)' })) }),
      tile({ i: 4, icon: 'scale', c: 'var(--purple)', title: 'Вес', val: lw ? nf(lw.kg, 1) : '—', unit: 'кг', sub: dw != null ? (dw > 0 ? '+' : '') + nf(dw, 1) + ' кг за период' : 'Взвесьтесь утром', go: () => ui.weight(), extra: App.spark(w.slice(-9).map((x) => x.kg), 'var(--purple)') })));

    // тренировка
    const tp = s.trainPlan;
    body.push(h('div', { class: 'section' }, ui.head('Тренировка', tp ? 'Программа' : null, () => App.go('train'))));
    if (tp && tp.days.length) {
      const doneToday = s.workouts.some((x) => x.date === today), idx = s.workouts.length % tp.days.length, dd = tp.days[idx];
      body.push(h('div', { class: 'card tap rise', role: 'button', tabindex: '0', style: 'display:flex;align-items:center;gap:14px', onclick: () => (doneToday ? App.go('train') : ui.workout(idx)) },
        h('span', { class: 'ico lg', style: { '--c': doneToday ? 'var(--green)' : 'var(--orange)' } }, icon(doneToday ? 'check' : 'dumbbell', 24)),
        h('div', { style: 'flex:1;min-width:0' }, h('div', { style: 'font-weight:600' }, doneToday ? 'Сегодня выполнено' : dd.title), h('div', { class: 'sub' }, doneToday ? 'Отличная работа' : dd.exercises.length + ' ' + App.plural(dd.exercises.length, 'упражнение', 'упражнения', 'упражнений') + ' · ' + dd.focus)),
        doneToday ? null : h('span', { class: 'btn sm primary' }, icon('play', 14), 'Начать')));
    } else body.push(h('div', { class: 'card tap rise', role: 'button', tabindex: '0', style: 'display:flex;align-items:center;gap:14px', onclick: () => ui.trainSetup() },
      h('span', { class: 'ico lg soft', style: { '--c': 'var(--orange)' } }, icon('dumbbell', 24)), h('div', { style: 'flex:1' }, h('div', { style: 'font-weight:600' }, 'Составить программу'), h('div', { class: 'sub' }, 'Под вашу цель, уровень и анализы')), icon('chevR', 16)));

    // лекарства и БАДы
    const meds = medsToday(s, day);
    if (meds.length) {
      body.push(h('div', { class: 'section' }, ui.head('Приём сегодня', 'Все', () => ui.meds())));
      body.push(h('div', { class: 'list rise' }, meds.map((x) => h('button', { class: 'row tap', type: 'button', onclick: () => ui.toggleMed(x.key) },
        h('span', { class: 'set' + (x.done ? ' on' : ''), style: 'flex:none' }, x.done ? icon('check', 15) : null),
        h('div', { class: 'row-main' }, h('div', { class: 'row-title', style: x.done ? 'color:var(--fg-2);text-decoration:line-through' : '' }, x.m.name), h('div', { class: 'row-sub' }, x.m.dose || '')),
        h('div', { class: 'row-val num' }, x.tm)))));
    }

    // анализы и показатели
    body.push(h('div', { class: 'section' }, ui.head('Здоровье', 'Открыть', () => App.go('health'))));
    const lab = s.labs.slice().sort((a, b) => (a.date < b.date ? 1 : -1))[0];
    const off = lab ? lab.markers.filter((m) => m.status !== 'normal') : [];
    const bp = s.vitals.filter((v) => v.type === 'bp').sort((a, b) => (a.d < b.d ? 1 : -1))[0];
    body.push(h('div', { class: 'list rise' },
      lab ? ui.row({ icon: 'flask', color: 'var(--purple)', title: lab.title || 'Анализы', sub: App.fmtDate(lab.date) + ' · ' + (off.length ? off.length + ' ' + App.plural(off.length, 'показатель', 'показателя', 'показателей') + ' вне нормы' : 'всё в норме'),
        right: off.length ? h('span', { class: 'chip c', style: { '--c': 'var(--orange)' } }, off.length) : h('span', { class: 'chip c', style: { '--c': 'var(--green)' } }, icon('check', 13)), onclick: () => ui.labDetail(lab.id) })
        : ui.row({ icon: 'flask', color: 'var(--purple)', title: 'Добавить анализы', sub: 'Сфотографируйте бланк — ИИ разберёт', onclick: () => ui.labAdd() }),
      bp ? ui.row({ icon: 'heart', color: 'var(--red)', title: 'Давление', sub: App.fmtDate(bp.d) + ' · ' + calc.bpInfo(bp.sys, bp.dia).t, val: bp.sys + '/' + bp.dia, onclick: () => ui.vitals('bp') })
        : ui.row({ icon: 'heart', color: 'var(--red)', title: 'Давление и пульс', sub: 'Записать измерение', onclick: () => ui.vitalAdd('bp') })));
    return { eyebrow: weekday(), title: 'Сегодня', body: body };
  }
  App.registerTab({ id: 'today', title: 'Сегодня', icon: 'rings', render: todayTab });

  /* ---------- быстрые действия (кнопка «+») ---------- */
  ui.quickAdd = function (fab) {
    fab.classList.add('open'); haptic(8);
    const acts = [
      ['scan', 'var(--blue)', 'Сканер', () => ui.scanner()], ['food', 'var(--green)', 'Еда', () => ui.foodAdd()], ['drop', 'var(--teal)', 'Вода', () => ui.water()], ['scale', 'var(--purple)', 'Вес', () => ui.weight()],
      ['flask', 'var(--indigo)', 'Анализ', () => ui.labAdd()], ['heart', 'var(--red)', 'Давление', () => ui.vitalAdd('bp')], ['moon', 'var(--indigo)', 'Сон', () => ui.sleep()], ['fridge', 'var(--orange)', 'Холодильник', () => ui.fridgeAdd()]
    ];
    const s = sheet({ title: 'Добавить', detent: 'auto', onClose: () => fab.classList.remove('open'), build: (b) => {
      b.appendChild(h('div', { class: 'actions' }, acts.map((a, i) => h('button', { class: 'action pop', type: 'button', style: { animationDelay: i * 28 + 'ms' }, onclick: () => { s.close(); setTimeout(a[3], 120); } },
        h('span', { class: 'ico', style: { '--c': a[1] } }, icon(a[0], 26)), a[2]))));
    } });
  };

  /* ---------- профиль ---------- */
  ui.profile = function () {
    let api;
    const draw = (b) => {
      const s = store.state, p = s.profile, t = s.targets, bm = calc.bmi(p), bi = calc.bmiInfo(bm), goal = calc.GOALS.find((g) => g.id === p.goal), m = App.ai.mode();
      kidsSet(b, 
        h('div', { style: 'display:flex;flex-direction:column;align-items:center;gap:8px;padding:6px 0 18px' },
          h('div', { class: 'avatar', style: 'width:84px;height:84px;font-size:36px' }, p.name ? p.name.charAt(0).toUpperCase() : icon('person', 40)),
          h('div', { style: 'font-size:24px;font-weight:700' }, p.name || 'Профиль'),
          h('div', { class: 'sub' }, calc.age(p) + ' ' + App.plural(calc.age(p), 'год', 'года', 'лет') + ' · ' + p.height + ' см · ' + nf(p.weight, 1) + ' кг'),
          h('span', { class: 'chip c', style: { '--c': bi.c } }, 'ИМТ ' + nf(bm, 1) + ' · ' + bi.t)),
        h('div', { class: 'stack' },
          h('div', { class: 'list' },
            ui.row({ icon: goal.icon, color: goal.c, title: 'Цель', sub: p.targetWeight && p.goal !== 'keep' ? 'до ' + nf(p.targetWeight, 1) + ' кг · ' + nf(p.pace, 2) + ' кг/нед' : null, val: goal.t, onclick: () => ui.profileEdit(() => draw(b)) }),
            ui.row({ icon: 'flame', color: 'var(--pink)', title: 'Калории', val: nf(t.kcal) + ' ккал' }),
            ui.row({ icon: 'target', color: 'var(--orange)', title: 'Белки · Жиры · Углеводы', val: t.p + ' · ' + t.f + ' · ' + t.c + ' г' }),
            ui.row({ icon: 'pencil', color: 'var(--blue)', title: 'Изменить данные', sub: 'Рост, вес, активность, ограничения', onclick: () => ui.profileEdit(() => draw(b)) })),
          h('div', { class: 'list' },
            ui.row({ icon: 'sparkles', color: 'var(--purple)', title: 'ИИ-помощник', sub: m === 'demo' ? 'Не подключён — показываются примеры' : 'Claude подключён', onclick: () => ui.aiSettings(() => draw(b)) })),
          h('div', { class: 'list' },
            App.sync && App.sync.active() ? ui.row({ icon: 'check', color: 'var(--teal)', title: 'Синхронизация включена', sub: 'Данные хранятся в вашей учётной записи Claude и видны только вам', wrap: true }) : null,
            ui.row({ icon: 'share', color: 'var(--green)', title: 'Резервная копия', sub: 'Сохранить все данные в файл', onclick: () => ui.backup() }),
            ui.row({ icon: 'refresh', color: 'var(--teal)', title: 'Восстановить из копии', onclick: () => ui.restore(() => { api.close(); }) }),
            ui.row({ icon: 'trash', color: 'var(--red)', title: 'Удалить все данные', chev: false, onclick: async () => { if (await App.confirm({ title: 'Удалить все данные?', text: 'Профиль, дневник, анализы и программы будут стёрты с этого устройства. Отменить это нельзя.', ok: 'Удалить', danger: true })) { store.reset(); api.close(); ui.onboarding(); } } })),
          h('p', { class: 'disclaimer' }, 'Ритм помогает вести здоровый образ жизни и не заменяет консультацию врача.')));
    };
    api = sheet({ title: 'Профиль', build: draw });
  };

  ui.profileEdit = function (done) {
    const p = Object.assign({}, store.state.profile), year = new Date().getFullYear();
    const field = (label, input, unit) => h('div', { class: 'field' }, h('label', { for: input.id }, label), input, unit ? h('span', { class: 'unit' }, unit) : null);
    const inp = (id, v, o) => h('input', Object.assign({ id: 'pe-' + id, value: v == null ? '' : v, inputmode: 'decimal' }, o || {}));
    const sel = (id, v, opts) => { const el = h('select', { id: 'pe-' + id }, opts.map((o) => h('option', { value: o[0] }, o[1]))); el.value = String(v); return el; };
    const f = {
      name: inp('name', p.name, { inputmode: 'text', maxlength: '30', placeholder: 'Имя' }), sex: sel('sex', p.sex, [['m', 'Мужской'], ['f', 'Женский']]),
      age: inp('age', year - p.birthYear), height: inp('height', p.height), weight: inp('weight', p.weight),
      activity: sel('activity', p.activity, calc.ACTIVITY.map((a) => [a.id, a.t])), goal: sel('goal', p.goal, calc.GOALS.map((g) => [g.id, g.t])),
      target: inp('target', p.targetWeight), pace: sel('pace', p.pace, [[0.25, '0,25 кг в неделю'], [0.5, '0,5 кг в неделю'], [0.75, '0,75 кг в неделю'], [1, '1 кг в неделю']]),
      allergies: h('textarea', { id: 'pe-allergies', placeholder: 'Аллергии, непереносимость, нелюбимые продукты' })
    };
    f.allergies.value = p.allergies || '';
    const s = sheet({ title: 'Мои данные', foot: true, build: (b, api) => {
      kidsAdd(b, h('div', { class: 'stack' },
        h('div', { class: 'list' }, field('Имя', f.name), field('Пол', f.sex), field('Возраст', f.age, 'лет'), field('Рост', f.height, 'см'), field('Вес', f.weight, 'кг')),
        h('div', { class: 'list' }, field('Активность', f.activity), field('Цель', f.goal), field('Целевой вес', f.target, 'кг'), field('Темп', f.pace)),
        h('div', { class: 'list' }, h('div', { class: 'field col' }, h('label', { for: 'pe-allergies' }, 'Исключить из питания'), f.allergies)),
        h('p', { class: 'caption' }, 'После сохранения калории и БЖУ пересчитаются автоматически.')));
      api.foot.appendChild(h('button', { class: 'btn primary block', type: 'button', onclick: () => {
        const age = App.num(f.age.value), hh = App.num(f.height.value), ww = App.num(f.weight.value);
        if (!(age >= 14 && age <= 100) || !(hh >= 120 && hh <= 230) || !(ww >= 30 && ww <= 300)) return toast('Проверьте возраст, рост и вес', { icon: 'info', color: 'var(--orange)' });
        Object.assign(p, { name: f.name.value.trim(), sex: f.sex.value, birthYear: year - Math.round(age), height: Math.round(hh), weight: +ww.toFixed(1), activity: +f.activity.value, goal: f.goal.value, pace: +f.pace.value, targetWeight: App.num(f.target.value), allergies: f.allergies.value.trim() });
        const st = store.state, prevW = st.profile.weight;
        st.profile = p; st.targets = calc.targets(p);
        if (prevW !== p.weight) { st.weights = st.weights.filter((x) => x.d !== App.dkey()); st.weights.push({ d: App.dkey(), kg: p.weight }); }
        store.commit(); s.close(); toast('Нормы пересчитаны'); if (done) done();
      } }, 'Сохранить'));
    } });
  };

  ui.aiSettings = function (done) {
    const ai = App.ai;
    const s = sheet({ title: 'ИИ-помощник', onClose: done, build: (b) => {
      const card = (ok, title, text) => h('div', { class: 'card', style: 'display:flex;gap:14px;align-items:center' },
        h('span', { class: 'ico lg', style: { '--c': ok ? 'var(--green)' : 'var(--orange)' } }, icon(ok ? 'check' : 'info', 24)),
        h('div', null, h('div', { style: 'font-weight:600' }, title), h('div', { class: 'sub' }, text)));
      const state = h('div');
      const about = h('p', { class: 'caption' }, 'ИИ читает фото анализов, продуктов и этикеток, составляет меню, программы тренировок и рецепты. В Claude отправляется только то, что нужно для ответа: фото и краткие данные профиля.');
      const draw = () => {
        const m = ai.mode();
        if (m === 'claude') return kidsSet(state, card(true, 'Claude подключён', 'Запросы идут через вашу учётную запись Claude.'));
        if (ai.hosted()) return kidsSet(state, card(false, 'Нужно разрешение', 'При первом обращении Claude спросит разрешение — подтвердите его. Если отказали раньше, обновите страницу.'));
        if (!ai.hasServer()) return kidsSet(state, card(false, 'ИИ пока не подключён', 'Сейчас показываются примеры ответов. Ничего вводить не нужно: ИИ заработает сам, когда будет подключён сервер приложения.'));
        kidsSet(state, card(true, 'Claude подключён', 'Проверяю связь с сервером…'));
        ai.serverStatus().then((st) => {
          if (!state.isConnected) return;
          if (st.ok) kidsSet(state, card(true, 'Claude подключён', st.device ? 'Это устройство подключено. Ничего настраивать не нужно.' : st.enroll ? 'Устройство подключится автоматически при первом запросе.' : 'Сервер работает, но подключение новых устройств закрыто.'));
          else kidsSet(state, card(false, st.reason === 'network' ? 'Нет связи с сервером ИИ' : 'Сервер ИИ не настроен', st.reason === 'network' ? 'Проверьте интернет и попробуйте ещё раз.' : 'На сервере не задан ключ Claude. Пока показываются примеры.'),
            h('button', { class: 'btn tinted block', type: 'button', style: 'margin-top:10px', onclick: draw }, icon('refresh', 20), 'Проверить ещё раз'));
        });
      };
      draw();
      kidsSet(b, h('div', { class: 'stack' }, state, about));
    } });
  };

  ui.backup = function () {
    const json = JSON.stringify(Object.assign({}, store.state, { _app: 'ritm', _exported: new Date().toISOString() }));
    const name = 'ritm-' + App.dkey() + '.json';
    sheet({ title: 'Резервная копия', detent: 'auto', build: (b, api) => {
      const ta = h('textarea', { class: 'input-big', id: 'bk-text', rows: '4', readonly: true, style: 'font-size:12px;font-family:ui-monospace,Menlo,Consolas,monospace' });
      ta.value = json;
      const copy = async () => { try { await navigator.clipboard.writeText(json); toast('Скопировано'); } catch (e) { ta.focus(); ta.select(); toast('Выделено — скопируйте вручную', { icon: 'info', color: 'var(--orange)' }); } };
      const save = async () => {
        try {
          const dl = window.claude && window.claude.use ? await window.claude.use('downloads') : null;
          if (dl) { await dl.save({ filename: name, data: new Blob([json], { type: 'application/json' }) }); return toast('Файл сохранён'); }
          if (App.ai.hosted()) return copy();
          const a = h('a', { href: URL.createObjectURL(new Blob([json], { type: 'application/json' })), download: name }); document.body.appendChild(a); a.click(); a.remove(); toast('Файл сохранён');
        } catch (e) { copy(); }
      };
      kidsAdd(b, h('div', { class: 'stack' }, h('p', { class: 'caption' }, 'В копии — профиль, дневник, анализы, программы. Храните файл в надёжном месте: в нём данные о здоровье.'), ta,
        h('div', { class: 'btn-row' }, h('button', { class: 'btn primary', type: 'button', onclick: save }, icon('share', 20), 'Сохранить файл'), h('button', { class: 'btn gray', type: 'button', onclick: copy }, 'Скопировать'))));
    } });
  };
  ui.restore = function (done) {
    ui.pickPhoto({ accept: 'application/json,.json,text/plain', onFiles: async (files) => {
      try {
        const data = JSON.parse(await files[0].text());
        if (!data || data._app !== 'ritm' || !data.profile) throw new Error('bad');
        if (!(await App.confirm({ title: 'Заменить текущие данные?', text: 'Данные из копии от ' + new Date(data._exported).toLocaleDateString('ru-RU') + ' заменят всё, что есть сейчас.', ok: 'Восстановить' }))) return;
        delete data._app; delete data._exported; App.memo = {}; store.replace(data); toast('Данные восстановлены'); if (done) done();
      } catch (e) { toast('Это не резервная копия Ритма', { icon: 'xmark', color: 'var(--red)' }); }
    } });
  };
})();
