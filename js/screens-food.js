/* Ритм — питание: дневник, меню, холодильник, покупки, сканер штрихкодов, карточка продукта. */
(function () {
  'use strict';
  const App = window.App, { h, icon, store, calc, nf, bar, sheet, toast, haptic, uid } = App;
  const ui = App.ui, D = App.data;
  let segId = 'diary', diaryDate = null, planDay = (new Date().getDay() + 6) % 7;

  const mealOf = (id) => D.MEALS.find((m) => m.id === id) || D.MEALS[0];
  const bju = (x) => 'Б ' + nf(x.p) + ' · Ж ' + nf(x.f) + ' · У ' + nf(x.c);
  const errorView = (msg, retry) => h('div', { class: 'empty fade' }, h('span', { class: 'ico soft', style: { '--c': 'var(--orange)' } }, icon('info', 30)), h('b', null, 'Не получилось'), h('p', null, msg),
    retry ? h('button', { class: 'btn tinted', type: 'button', onclick: retry }, 'Повторить') : null);
  async function runAI(box, label, fn, ok) {
    box.replaceChildren(ui.aiWait(label));
    try { const r = await fn(); ok(r.data || {}, r.demo); }
    catch (e) { console.error(e); box.replaceChildren(errorView(e.user || 'Что-то пошло не так. Попробуйте ещё раз.', () => runAI(box, label, fn, ok))); }
  }
  ui.runAI = runAI; ui.errorView = errorView;
  const N = (v) => { const n = App.num(v); return n == null ? 0 : n; };
  function addFood(item, meal, date) {
    store.day(date).food.push({ id: uid(), meal: meal || D.mealByTime(), name: String(item.name || 'Блюдо').slice(0, 80), grams: Math.round(N(item.grams)), kcal: Math.round(N(item.kcal)), p: +N(item.p).toFixed(1), f: +N(item.f).toFixed(1), c: +N(item.c).toFixed(1) });
  }
  const mealPicker = (value, onPick) => { const box = h('div', { class: 'chips' }); const draw = () => box.replaceChildren(...D.MEALS.map((m) => h('button', { class: 'pillbtn' + (value === m.id ? ' on' : ''), type: 'button', onclick: () => { value = m.id; onPick(m.id); draw(); } }, m.t))); draw(); return box; };

  /* ---------- вкладка ---------- */
  function foodTab() {
    const content = h('div', { style: 'margin-top:14px' });
    const draw = () => content.replaceChildren(...(segId === 'diary' ? diaryView() : segId === 'plan' ? planView() : fridgeView()));
    draw();
    return { title: 'Питание', body: [App.seg([{ id: 'diary', label: 'Дневник' }, { id: 'plan', label: 'Меню' }, { id: 'fridge', label: 'Холодильник' }], segId, (v) => { segId = v; draw(); }), content] };
  }
  App.registerTab({ id: 'food', title: 'Питание', icon: 'food', render: foodTab });
  ui.foodSeg = (v) => { segId = v; App.go('food', { keep: true }); };

  /* ---------- дневник ---------- */
  function diaryView() {
    const today = App.dkey(), date = diaryDate || today, s = store.state, t = s.targets, day = store.peek(date), sum = calc.sumFood(day.food);
    const shift = (n) => { const nd = App.addDays(date, n); if (nd > today) return; diaryDate = nd === today ? null : nd; haptic(5); App.refresh(); };
    const mini = (label, v, target, c, id) => h('div', { style: 'flex:1;min-width:0' }, h('div', { class: 'sub', style: 'display:flex;justify-content:space-between;margin-bottom:5px' }, h('span', null, label), h('span', { class: 'num' }, nf(v) + '/' + nf(target))), bar({ id: id, value: v / target, color: c }));
    const out = [
      h('div', { style: 'display:flex;align-items:center;justify-content:space-between;margin-bottom:10px' },
        h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Предыдущий день', onclick: () => shift(-1) }, icon('chevL', 18)),
        h('div', { style: 'font-weight:600' }, date === today ? 'Сегодня' : date === App.addDays(today, -1) ? 'Вчера' : App.fmtDate(date, { weekday: 'short', day: 'numeric', month: 'long' })),
        h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Следующий день', disabled: date >= today, style: date >= today ? 'opacity:.3' : '', onclick: () => shift(1) }, icon('chevR', 18))),
      h('div', { class: 'card rise' },
        h('div', { style: 'display:flex;align-items:baseline;justify-content:space-between;margin-bottom:10px' }, h('div', { class: 'big' }, nf(sum.kcal), h('small', null, 'из ' + nf(t.kcal) + ' ккал')),
          h('span', { class: 'chip c', style: { '--c': sum.kcal > t.kcal ? 'var(--red)' : 'var(--green)' } }, sum.kcal > t.kcal ? '+' + nf(sum.kcal - t.kcal) : 'ещё ' + nf(t.kcal - sum.kcal))),
        bar({ id: 'food:kcal', value: sum.kcal / t.kcal, color: sum.kcal > t.kcal ? 'var(--red)' : 'var(--pink)' }),
        h('div', { style: 'display:flex;gap:14px;margin-top:14px' }, mini('Белки', sum.p, t.p, 'var(--pink)', 'food:p'), mini('Жиры', sum.f, t.f, 'var(--orange)', 'food:f'), mini('Углеводы', sum.c, t.c, 'var(--blue)', 'food:c')))
    ];
    const planned = s.mealPlan && s.mealPlan.days[(App.parseKey(date).getDay() + 6) % 7];
    D.MEALS.forEach((m, i) => {
      const items = day.food.filter((x) => x.meal === m.id), ms = calc.sumFood(items);
      const sug = !items.length && planned ? planned.meals.find((x) => x.meal === m.id) : null;
      out.push(h('div', { class: 'list rise', style: { marginTop: '12px', '--i': i + 1 } },
        h('div', { class: 'meal-head' }, h('span', { class: 'ico soft', style: { '--c': m.c } }, icon('food', 18)), h('b', null, m.t), h('span', { class: 'kc' }, items.length ? nf(ms.kcal) + ' ккал' : '≈ ' + nf(t.kcal * m.share))),
        items.map((x) => h('button', { class: 'food-row', type: 'button', style: 'width:100%;text-align:left', onclick: () => foodItem(x, date) },
          h('div', { class: 'n' }, h('b', null, x.name), h('span', null, (x.grams ? nf(x.grams) + ' г · ' : '') + bju(x))), h('span', { class: 'k' }, nf(x.kcal)))),
        sug ? h('button', { class: 'food-row', type: 'button', style: 'width:100%;text-align:left', onclick: () => { addFood(Object.assign({ grams: sug.ingredients.reduce((a, b) => a + N(b.grams), 0) }, sug), m.id, date); haptic(10); store.commit(); toast('Добавлено в дневник'); } },
          h('div', { class: 'n' }, h('b', { style: 'color:var(--fg-2)' }, sug.name), h('span', null, 'По меню · ' + nf(sug.kcal) + ' ккал')), h('span', { class: 'chip c', style: { '--c': 'var(--green)' } }, icon('plus', 13), 'Съел')) : null,
        h('button', { class: 'add-line', type: 'button', onclick: () => ui.foodAdd(m.id, date) }, icon('plus', 18), 'Добавить')));
    });
    return out;
  }
  function foodItem(x, date) {
    const s = sheet({ title: x.name, detent: 'auto', build: (b) => {
      b.append(h('div', { class: 'stack' }, nutriGrid(x, x.grams ? 'Порция ' + nf(x.grams) + ' г' : 'Порция'),
        h('button', { class: 'btn gray danger block', type: 'button', onclick: () => { const d = store.day(date); d.food = d.food.filter((y) => y.id !== x.id); store.commit(); s.close(); } }, icon('trash', 20), 'Удалить из дневника')));
    } });
  }
  function nutriGrid(x, caption) {
    const cell = (v, label, c) => h('div', { class: 'nutri' }, h('b', { style: c ? { color: c } : null }, nf(v, v < 10 && v % 1 ? 1 : 0)), h('span', null, label));
    return h('div', null, caption ? h('div', { class: 'caption', style: 'margin-bottom:6px' }, caption) : null,
      h('div', { class: 'nutri-grid' }, cell(x.kcal, 'ккал'), cell(x.p, 'белки', 'var(--pink)'), cell(x.f, 'жиры', 'var(--orange)'), cell(x.c, 'углеводы', 'var(--blue)')));
  }
  ui.nutriGrid = nutriGrid;

  /* ---------- добавление еды ---------- */
  ui.foodAdd = function (meal, date) {
    meal = meal || D.mealByTime();
    const s = sheet({ title: 'Добавить еду', build: (b) => {
      const text = h('input', { class: 'input-big', id: 'fa-text', placeholder: 'Например: борщ и два куска хлеба', enterkeyhint: 'done' });
      const result = h('div');
      const showItems = (items, demo) => {
        if (!items.length) return result.replaceChildren(errorView('Не удалось распознать еду. Опишите подробнее или введите вручную.'));
        result.replaceChildren(h('div', { class: 'stack fade' }, demo ? ui.demoBadge() : null,
          h('div', { class: 'list' }, items.map((x) => ui.row({ title: x.name, sub: nf(x.grams) + ' г · ' + bju(x), val: nf(x.kcal) + ' ккал' }))),
          h('button', { class: 'btn primary block', type: 'button', onclick: () => { items.forEach((x) => addFood(x, meal, date)); haptic(12); store.commit(); s.close(); toast('Добавлено в дневник'); } }, 'Добавить в дневник'), demo ? ui.aiNote() : null));
      };
      const estimate = (files) => { const q = text.value.trim(); if (!q && !files) return text.focus(); runAI(result, 'Считаю калории…', () => App.ai.foodEstimate(q, files), (d, demo) => showItems((d.items || []).filter((x) => x && x.name), demo)); };
      text.addEventListener('keydown', (e) => { if (e.key === 'Enter') estimate(); });
      // недавние блюда
      const seen = {}, recent = [];
      Object.keys(store.state.days).sort().reverse().slice(0, 14).forEach((k) => store.state.days[k].food.forEach((x) => { if (x.grams && !seen[x.name] && recent.length < 6) { seen[x.name] = 1; recent.push(x); } }));
      const act = (ic, c, label, fn) => h('button', { class: 'action', type: 'button', onclick: fn }, h('span', { class: 'ico', style: { '--c': c } }, icon(ic, 26)), label);
      b.append(h('div', { class: 'stack' }, mealPicker(meal, (v) => { meal = v; }), text,
        h('button', { class: 'btn primary block', type: 'button', onclick: () => estimate() }, icon('sparkles', 20), 'Посчитать с ИИ'),
        h('div', { class: 'actions', style: 'grid-template-columns:repeat(3,1fr)' },
          act('camera', 'var(--pink)', 'Фото еды', () => ui.pickPhoto({ capture: true, onFiles: (f) => estimate(f) })),
          act('scan', 'var(--blue)', 'Штрихкод', () => { s.close(); setTimeout(() => ui.scanner({ meal: meal, date: date }), 150); }),
          act('pencil', 'var(--indigo)', 'Вручную', () => manualFood(meal, date, s))),
        result,
        recent.length ? h('div', { class: 'section', style: 'margin-top:6px' }, ui.head('Недавнее'),
          h('div', { class: 'list' }, recent.map((x) => ui.row({ title: x.name, sub: nf(x.grams) + ' г · ' + nf(x.kcal) + ' ккал', chev: false, right: h('span', { class: 'chip c', style: { '--c': 'var(--green)' } }, icon('plus', 13)), onclick: () => { addFood(x, meal, date); haptic(10); store.commit(); toast('Добавлено: ' + x.name); } })))) : null));
    } });
  };
  function manualFood(meal, date, parent) {
    const f = {}, fld = (k, label, unit, ph) => { f[k] = h('input', { id: 'mf-' + k, inputmode: k === 'name' ? 'text' : 'decimal', placeholder: ph || '0' }); return h('div', { class: 'field' }, h('label', { for: 'mf-' + k }, label), f[k], unit ? h('span', { class: 'unit' }, unit) : null); };
    const s = sheet({ title: 'Своё блюдо', detent: 'auto', build: (b) => {
      b.append(h('div', { class: 'stack' }, h('div', { class: 'list' }, fld('name', 'Название', null, 'Блюдо или продукт'), fld('grams', 'Порция', 'г'), fld('kcal', 'Калории', 'ккал'), fld('p', 'Белки', 'г'), fld('f', 'Жиры', 'г'), fld('c', 'Углеводы', 'г')),
        h('p', { class: 'caption' }, 'Значения — на всю порцию.'),
        h('button', { class: 'btn primary block', type: 'button', onclick: () => {
          if (!f.name.value.trim() || !N(f.kcal.value)) return toast('Укажите название и калории', { icon: 'info', color: 'var(--orange)' });
          addFood({ name: f.name.value.trim(), grams: f.grams.value, kcal: f.kcal.value, p: f.p.value, f: f.f.value, c: f.c.value }, meal, date);
          store.commit(); s.close(); if (parent) parent.close(); toast('Добавлено в дневник');
        } }, 'Добавить')));
    } });
  }

  /* ---------- меню ---------- */
  function planView() {
    const s = store.state, mp = s.mealPlan;
    if (!mp) return [ui.empty({ icon: 'food', color: 'var(--green)', title: 'Меню на неделю', text: 'ИИ составит меню под ваши калории и БЖУ, учтёт анализы, ограничения и продукты в холодильнике.',
      action: h('div', { class: 'stack', style: 'width:100%;gap:8px' }, h('button', { class: 'btn primary block', type: 'button', onclick: () => ui.mealPlanMake() }, icon('sparkles', 20), 'Составить меню'),
        h('button', { class: 'btn gray block', type: 'button', onclick: () => { s.mealPlan = D.templateMealPlan(s.targets); store.commit(); } }, 'Базовое меню без ИИ')) })];
    planDay = App.clamp(planDay, 0, mp.days.length - 1);
    const day = mp.days[planDay], sum = calc.sumFood(day.meals), todayIdx = (new Date().getDay() + 6) % 7;
    return [
      h('div', { class: 'daytabs' }, mp.days.map((d, i) => h('button', { class: 'daytab' + (i === planDay ? ' on' : ''), type: 'button', onclick: () => { planDay = i; haptic(5); App.refresh(); } }, D.DAYSHORT[i % 7], h('b', null, i === todayIdx ? '•' : String(i + 1))))),
      h('div', { class: 'card rise', style: 'margin-top:12px' }, h('div', { style: 'display:flex;justify-content:space-between;align-items:baseline' }, h('div', { style: 'font-weight:700;font-size:20px' }, day.title || D.DAYNAMES[planDay % 7]),
        mp.source !== 'ai' ? h('span', { class: 'chip' }, mp.source === 'demo' ? 'демо' : 'базовое') : h('span', { class: 'chip c', style: { '--c': 'var(--purple)' } }, icon('sparkles', 13), 'ИИ')),
        h('div', { class: 'sub', style: 'margin-top:4px' }, nf(sum.kcal) + ' ккал · ' + bju(sum))),
      h('div', { class: 'list rise', style: { marginTop: '12px', '--i': 1 } }, day.meals.map((m) => ui.row({ icon: 'food', soft: true, color: mealOf(m.meal).c, title: m.name, sub: mealOf(m.meal).t + ' · ' + bju(m), val: nf(m.kcal), wrap: true, onclick: () => ui.dish(m, { meal: m.meal }) }))),
      mp.note ? h('p', { class: 'caption', style: 'margin-top:10px' }, mp.note) : null,
      h('div', { class: 'btn-row', style: 'margin-top:14px' },
        h('button', { class: 'btn tinted', type: 'button', onclick: () => ui.mealPlanMake() }, icon('sparkles', 20), 'Новое меню'),
        h('button', { class: 'btn gray', type: 'button', onclick: () => planToShopping(mp) }, icon('cart', 20), 'В покупки'))
    ];
  }
  function planToShopping(mp) {
    const agg = {};
    mp.days.forEach((d) => d.meals.forEach((m) => (m.ingredients || []).forEach((i) => { const k = String(i.name).trim(); if (k) agg[k] = (agg[k] || 0) + N(i.grams); })));
    const have = store.state.fridge.map((x) => x.name.toLowerCase()), sh = store.state.shopping;
    let n = 0;
    Object.keys(agg).forEach((k) => { if (have.some((x) => x.indexOf(k.toLowerCase().split(' ')[0]) >= 0) || sh.some((x) => x.name === k)) return; sh.push({ id: uid(), name: k, qty: agg[k] ? nf(Math.round(agg[k] / 10) * 10) + ' г' : '', done: false }); n++; });
    store.commit(); segId = 'fridge'; App.refresh();
    toast(n ? 'В список покупок: ' + n : 'Всё уже есть', { icon: 'cart', color: 'var(--blue)' });
  }
  ui.mealPlanMake = function () {
    const s = sheet({ title: 'Меню на неделю', build: (b) => {
      const st = store.state, wishes = h('textarea', { class: 'input-big', id: 'mp-wish', rows: '3', placeholder: 'Например: без долгой готовки, обед беру с собой, люблю азиатскую кухню' });
      let useFridge = st.fridge.length > 0;
      const start = () => runAI(b, 'Составляю меню на неделю…', () => App.ai.mealPlan({ wishes: wishes.value.trim(), fridge: useFridge ? st.fridge.map((x) => x.name) : [] }), (d, demo) => {
        const days = (d.days || []).map((day, i) => ({ title: day.title || D.DAYNAMES[i % 7], meals: (day.meals || []).filter((m) => m && m.name).map((m) => ({
          meal: D.MEALS.some((x) => x.id === m.meal) ? m.meal : 'snack', name: String(m.name), kcal: Math.round(N(m.kcal)), p: Math.round(N(m.p)), f: Math.round(N(m.f)), c: Math.round(N(m.c)),
          ingredients: (m.ingredients || []).map((x) => ({ name: String(x.name || ''), grams: Math.round(N(x.grams)) })), steps: (m.steps || []).map(String) })) })).filter((x) => x.meals.length);
        if (!days.length) return b.replaceChildren(errorView('ИИ вернул пустое меню. Попробуйте ещё раз.', start));
        st.mealPlan = { createdAt: Date.now(), source: demo ? 'demo' : 'ai', note: d.note || '', days: days };
        planDay = (new Date().getDay() + 6) % 7; segId = 'plan'; store.commit(); s.close(); toast(demo ? 'Показано базовое меню' : 'Меню готово', { icon: 'sparkles', color: 'var(--purple)' });
      });
      const flags = App.ai.labFlags();
      b.append(h('div', { class: 'stack' },
        h('div', { class: 'note', style: { '--c': 'var(--green)' } }, h('b', { class: 'h' }, icon('target', 15), 'Что учтём'),
          h('ul', null, h('li', null, nf(st.targets.kcal) + ' ккал · Б ' + st.targets.p + ' · Ж ' + st.targets.f + ' · У ' + st.targets.c + ' г'), h('li', null, flags), st.profile.allergies ? h('li', null, 'Исключаем: ' + st.profile.allergies) : null)),
        wishes,
        st.fridge.length ? h('div', { class: 'list' }, ui.row({ icon: 'fridge', color: 'var(--orange)', title: 'Использовать продукты из холодильника', wrap: true, right: toggle(useFridge, (v) => { useFridge = v; }) })) : null,
        ui.aiNote(),
        h('button', { class: 'btn primary block', type: 'button', onclick: start }, icon('sparkles', 20), 'Составить меню')));
    } });
  };
  function toggle(on, change) {
    const knob = h('i', { style: 'display:block;width:27px;height:27px;border-radius:50%;background:#fff;box-shadow:0 2px 6px rgba(0,0,0,.25);will-change:transform' });
    const el = h('button', { type: 'button', role: 'switch', 'aria-checked': String(on), style: 'width:51px;height:31px;border-radius:99px;padding:2px;flex:none;transition:background .2s' }, knob);
    let pos = on ? 1 : 0;
    const paint = (p) => { pos = p; knob.style.transform = 'translateX(' + p * 20 + 'px)'; };
    const bg = () => { el.style.background = on ? 'var(--green)' : 'var(--fill-2)'; };
    paint(pos); bg();
    el.addEventListener('click', () => { on = !on; el.setAttribute('aria-checked', String(on)); bg(); haptic(8); App.spring({ from: pos, to: on ? 1 : 0, response: 0.3, damping: 0.75, precision: 0.005, onUpdate: paint }); change(on); });
    return el;
  }
  ui.toggle = toggle;

  // карточка блюда: состав, шаги, действия
  ui.dish = function (m, o) {
    o = o || {};
    let meal = o.meal || D.mealByTime();
    const s = sheet({ title: 'Блюдо', foot: true, build: (b, api) => {
      b.append(h('div', { class: 'stack' }, h('h2', { style: 'font-size:26px;line-height:1.15;letter-spacing:-.02em;text-wrap:balance' }, m.name),
        h('div', { class: 'chips' }, m.time ? h('span', { class: 'chip' }, icon('clock', 13), m.time + ' мин') : null, o.demo ? ui.demoBadge() : null),
        nutriGrid(m, 'На порцию'),
        m.ingredients && m.ingredients.length ? h('div', null, h('div', { class: 'caption', style: 'margin-bottom:6px' }, 'Ингредиенты'), h('div', { class: 'list' }, m.ingredients.map((i) => ui.row({ title: i.name, val: i.grams ? nf(i.grams) + ' г' : '' })))) : null,
        m.missing && m.missing.length ? h('div', { class: 'note', style: { '--c': 'var(--orange)' } }, h('b', { class: 'h' }, icon('cart', 15), 'Не хватает'), m.missing.join(', '),
          h('div', { style: 'margin-top:10px' }, h('button', { class: 'btn sm tinted', type: 'button', style: '--accent:var(--orange)', onclick: () => { m.missing.forEach((n) => store.state.shopping.push({ id: uid(), name: n, qty: '', done: false })); store.commit(); toast('Добавлено в покупки', { icon: 'cart', color: 'var(--blue)' }); } }, 'В список покупок'))) : null,
        m.steps && m.steps.length ? h('div', null, h('div', { class: 'caption', style: 'margin-bottom:6px' }, 'Как готовить'), h('div', { class: 'card' }, h('ol', { class: 'recipe-steps' }, m.steps.map((x) => h('li', null, x))))) : null,
        h('div', null, h('div', { class: 'caption', style: 'margin-bottom:6px' }, 'Приём пищи'), mealPicker(meal, (v) => { meal = v; }))));
      api.foot.appendChild(h('button', { class: 'btn primary block', type: 'button', onclick: () => { addFood(Object.assign({ grams: (m.ingredients || []).reduce((a, x) => a + N(x.grams), 0) }, m), meal, o.date); haptic(12); store.commit(); s.close(); toast('Добавлено в дневник'); } }, icon('check', 20), 'Съел — в дневник'));
    } });
  };

  /* ---------- холодильник и покупки ---------- */
  const CATS = ['Овощи и фрукты', 'Мясо и рыба', 'Молочное и яйца', 'Крупы и бакалея', 'Напитки', 'Другое'];
  const CATC = { 'Овощи и фрукты': 'var(--green)', 'Мясо и рыба': 'var(--red)', 'Молочное и яйца': 'var(--blue)', 'Крупы и бакалея': 'var(--orange)', 'Напитки': 'var(--teal)', 'Другое': 'var(--indigo)' };
  function fridgeView() {
    const s = store.state, out = [];
    out.push(h('div', { class: 'card rise', style: 'display:flex;flex-direction:column;gap:12px' },
      h('div', { style: 'display:flex;gap:14px;align-items:center' }, h('span', { class: 'ico lg', style: { '--c': 'var(--orange)' } }, icon('fridge', 24)),
        h('div', null, h('div', { style: 'font-weight:700;font-size:19px' }, s.fridge.length ? s.fridge.length + ' ' + App.plural(s.fridge.length, 'продукт', 'продукта', 'продуктов') : 'Холодильник пуст'), h('div', { class: 'sub' }, 'ИИ подскажет, что приготовить из того, что есть'))),
      h('button', { class: 'btn primary block', type: 'button', disabled: !s.fridge.length, onclick: () => ui.recipes() }, icon('sparkles', 20), 'Что приготовить?'),
      h('div', { class: 'btn-row' }, h('button', { class: 'btn tinted', type: 'button', onclick: () => fridgePhoto() }, icon('camera', 20), 'Фото'), h('button', { class: 'btn gray', type: 'button', onclick: () => ui.fridgeAdd() }, icon('plus', 20), 'Добавить'))));
    CATS.forEach((c) => {
      const items = s.fridge.filter((x) => (CATS.indexOf(x.cat) >= 0 ? x.cat : 'Другое') === c); if (!items.length) return;
      out.push(h('div', { class: 'caption', style: 'margin:16px 0 6px;text-transform:uppercase;letter-spacing:.04em;font-weight:600' }, c));
      out.push(h('div', { class: 'list' }, items.map((x) => ui.row({ icon: 'leaf', soft: true, color: CATC[c], title: x.name, val: x.qty || '', chev: false, onclick: () => fridgeItem(x) }))));
    });
    out.push(h('div', { class: 'section' }, ui.head('Список покупок', 'Добавить', () => shoppingAdd())));
    if (!s.shopping.length) out.push(h('p', { class: 'caption' }, 'Сюда попадают продукты из меню и рецептов, а также то, что вы отсканировали в магазине.'));
    else {
      out.push(h('div', { class: 'list' }, s.shopping.map((x) => h('button', { class: 'row tap', type: 'button', onclick: () => { x.done = !x.done; haptic(8); store.commit(); } },
        h('span', { class: 'set' + (x.done ? ' on' : ''), style: 'flex:none' }, x.done ? icon('check', 15) : null),
        h('div', { class: 'row-main' }, h('div', { class: 'row-title', style: x.done ? 'color:var(--fg-2);text-decoration:line-through' : '' }, x.name)), x.qty ? h('div', { class: 'row-val' }, x.qty) : null))));
      if (s.shopping.some((x) => x.done)) out.push(h('button', { class: 'btn tinted block', type: 'button', style: 'margin-top:10px', onclick: () => {
        const bought = s.shopping.filter((x) => x.done); bought.forEach((x) => s.fridge.push({ id: uid(), name: x.name, qty: x.qty || '', cat: 'Другое' })); s.shopping = s.shopping.filter((x) => !x.done);
        store.commit(); toast('Купленное — в холодильнике', { icon: 'fridge', color: 'var(--orange)' });
      } }, icon('fridge', 20), 'Купленное — в холодильник'));
    }
    return out;
  }
  function fridgeItem(x) {
    const s = sheet({ title: x.name, detent: 'auto', build: (b) => {
      const q = h('input', { id: 'fi-qty', value: x.qty || '', placeholder: 'например, 500 г' });
      b.append(h('div', { class: 'stack' }, h('div', { class: 'list' }, h('div', { class: 'field' }, h('label', { for: 'fi-qty' }, 'Количество'), q)),
        h('div', { class: 'btn-row' }, h('button', { class: 'btn primary', type: 'button', onclick: () => { x.qty = q.value.trim(); store.commit(); s.close(); } }, 'Сохранить'),
          h('button', { class: 'btn gray danger', type: 'button', onclick: () => { store.state.fridge = store.state.fridge.filter((y) => y.id !== x.id); store.commit(); s.close(); } }, 'Закончилось'))));
    } });
  }
  ui.fridgeAdd = function () {
    let cat = CATS[0];
    const s = sheet({ title: 'В холодильник', detent: 'auto', build: (b) => {
      const name = h('input', { class: 'input-big', id: 'fa-name', placeholder: 'Продукт, например «яйца»' }), qty = h('input', { class: 'input-big', id: 'fa-qty', placeholder: 'Количество (необязательно)' });
      const cats = h('div', { class: 'chips' }); const draw = () => cats.replaceChildren(...CATS.map((c) => h('button', { class: 'pillbtn' + (c === cat ? ' on' : ''), type: 'button', onclick: () => { cat = c; draw(); } }, c))); draw();
      const add = (close) => { const n = name.value.trim(); if (!n) return name.focus(); store.state.fridge.push({ id: uid(), name: n, qty: qty.value.trim(), cat: cat }); store.commit(); haptic(8); if (close) { segId = 'fridge'; s.close(); App.go('food', { keep: true }); } else { name.value = ''; qty.value = ''; name.focus(); toast('Добавлено: ' + n); } };
      b.append(h('div', { class: 'stack' }, name, qty, cats,
        h('div', { class: 'btn-row' }, h('button', { class: 'btn primary', type: 'button', onclick: () => add(true) }, 'Готово'), h('button', { class: 'btn gray', type: 'button', onclick: () => add(false) }, 'Ещё один')),
        h('button', { class: 'btn tinted block', type: 'button', onclick: () => { s.close(); setTimeout(fridgePhoto, 150); } }, icon('camera', 20), 'Сфотографировать продукты')));
    } });
  };
  function shoppingAdd() {
    const s = sheet({ title: 'В список покупок', detent: 'auto', build: (b) => {
      const name = h('input', { class: 'input-big', id: 'sh-name', placeholder: 'Что купить' });
      const add = () => { const n = name.value.trim(); if (!n) return name.focus(); store.state.shopping.push({ id: uid(), name: n, qty: '', done: false }); store.commit(); name.value = ''; name.focus(); toast('Добавлено: ' + n, { icon: 'cart', color: 'var(--blue)' }); };
      name.addEventListener('keydown', (e) => { if (e.key === 'Enter') add(); });
      b.append(h('div', { class: 'stack' }, name, h('div', { class: 'btn-row' }, h('button', { class: 'btn primary', type: 'button', onclick: add }, 'Добавить'), h('button', { class: 'btn gray', type: 'button', onclick: () => s.close() }, 'Готово'))));
    } });
  }
  function fridgePhoto() {
    ui.pickPhoto({ multiple: true, onFiles: (files) => {
      const s = sheet({ title: 'Продукты на фото', build: (b) => runAI(b, 'Смотрю, что есть в холодильнике…', () => App.ai.fridgePhoto(files), (d, demo) => {
        const items = (d.items || []).filter((x) => x && x.name).map((x) => ({ name: String(x.name), qty: String(x.qty || ''), cat: CATS.indexOf(x.cat) >= 0 ? x.cat : 'Другое', on: true }));
        if (!items.length) return b.replaceChildren(errorView('На фото не удалось распознать продукты. Попробуйте снять ближе и при хорошем свете.'));
        const list = h('div', { class: 'list' });
        const draw = () => list.replaceChildren(...items.map((x) => h('button', { class: 'row tap', type: 'button', onclick: () => { x.on = !x.on; haptic(6); draw(); } },
          h('span', { class: 'set' + (x.on ? ' on' : ''), style: 'flex:none' }, x.on ? icon('check', 15) : null), h('div', { class: 'row-main' }, h('div', { class: 'row-title' }, x.name), h('div', { class: 'row-sub' }, x.cat)), h('div', { class: 'row-val' }, x.qty))));
        draw();
        b.replaceChildren(h('div', { class: 'stack fade' }, demo ? ui.demoBadge() : null, h('p', { class: 'caption' }, 'Снимите галочки с того, что распознано неверно.'), list, demo ? ui.aiNote() : null,
          h('button', { class: 'btn primary block', type: 'button', onclick: () => { items.filter((x) => x.on).forEach((x) => store.state.fridge.push({ id: uid(), name: x.name, qty: x.qty, cat: x.cat })); segId = 'fridge'; store.commit(); s.close(); App.go('food', { keep: true }); toast('Продукты добавлены', { icon: 'fridge', color: 'var(--orange)' }); } }, 'Добавить в холодильник')));
      }) });
    } });
  }
  ui.recipes = function () {
    const st = store.state, t = st.targets, e = calc.sumFood(store.peek().food);
    const left = { kcal: Math.max(0, Math.round(t.kcal - e.kcal)), p: Math.max(0, Math.round(t.p - e.p)), f: Math.max(0, Math.round(t.f - e.f)), c: Math.max(0, Math.round(t.c - e.c)) };
    sheet({ title: 'Что приготовить', build: (b) => {
      const go = () => runAI(b, 'Подбираю блюда из ваших продуктов…', () => App.ai.recipes({ items: st.fridge.map((x) => x.name + (x.qty ? ' (' + x.qty + ')' : '')), left: left }), (d, demo) => {
        const rs = (d.recipes || []).filter((r) => r && r.name);
        if (!rs.length) return b.replaceChildren(errorView('Не удалось подобрать блюда. Попробуйте ещё раз.', go));
        b.replaceChildren(h('div', { class: 'stack fade' }, demo ? ui.demoBadge() : null, h('p', { class: 'caption' }, 'На сегодня осталось ' + nf(left.kcal) + ' ккал · ' + bju(left) + ' г'),
          rs.map((r, i) => h('div', { class: 'card tap rise', role: 'button', tabindex: '0', style: { '--i': i }, onclick: () => ui.dish(r, { demo: demo }) },
            h('div', { style: 'display:flex;justify-content:space-between;gap:10px;align-items:flex-start' }, h('div', { style: 'font-weight:700;font-size:18px;line-height:1.2' }, r.name), h('span', { class: 'mid', style: 'font-size:19px;white-space:nowrap' }, nf(r.kcal), h('small', null, 'ккал'))),
            h('div', { class: 'sub', style: 'margin:4px 0 10px' }, (r.time ? r.time + ' мин · ' : '') + bju(r)),
            h('div', { class: 'chips' }, (r.uses || []).slice(0, 4).map((u) => h('span', { class: 'chip c', style: { '--c': 'var(--green)' } }, u)), (r.missing || []).map((u) => h('span', { class: 'chip c', style: { '--c': 'var(--orange)' } }, '+ ' + u))))),
          demo ? ui.aiNote() : null, h('button', { class: 'btn gray block', type: 'button', onclick: go }, icon('refresh', 20), 'Другие варианты')));
      });
      go();
    } });
  };

  /* ---------- сканер штрихкодов ---------- */
  const loadScript = (src) => new Promise((res, rej) => { const s = h('script', { src: src }); s.onload = res; s.onerror = () => rej(new Error('script')); document.head.appendChild(s); });
  let zxing = null;
  const getZxing = () => zxing || (zxing = loadScript('https://cdn.jsdelivr.net/npm/@zxing/library@0.21.3/umd/index.min.js').then(() => window.ZXing).catch((e) => { zxing = null; throw e; }));
  const FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128'];

  async function decodeImage(file) {
    if ('BarcodeDetector' in window) {
      try { const det = new window.BarcodeDetector({ formats: FORMATS }); const bmp = await createImageBitmap(file); const r = await det.detect(bmp); if (r && r[0]) return r[0].rawValue; } catch (e) {}
    }
    const Z = await getZxing(), url = URL.createObjectURL(file);
    try { const r = await new Z.BrowserMultiFormatReader().decodeFromImageUrl(url); return r.getText(); } finally { URL.revokeObjectURL(url); }
  }

  ui.scanner = function (o) {
    o = o || {};
    let stream = null, timer = 0, stopped = false, zreader = null, found = false;
    const stop = () => { stopped = true; clearInterval(timer); try { if (zreader) zreader.reset(); } catch (e) {} if (stream) stream.getTracks().forEach((t) => t.stop()); stream = null; };
    const s = sheet({ title: 'Сканер', onClose: stop, build: (b) => {
      const video = h('video', { playsinline: true, muted: true, autoplay: true });
      const hint = h('div', { class: 'scan-hint' }, 'Наведите на штрихкод');
      const box = h('div', { class: 'scanner', hidden: true }, video, h('div', { class: 'scan-frame' }, h('div', { class: 'scan-line' })), hint);
      const status = h('p', { class: 'caption', style: 'text-align:center' });
      const code = h('input', { class: 'input-big', id: 'sc-code', inputmode: 'numeric', placeholder: 'Цифры под штрихкодом', maxlength: '14' });
      const onCode = (c) => { if (found) return; c = String(c || '').replace(/\D/g, ''); if (c.length < 8) return; found = true; haptic(30); stop(); s.close(); setTimeout(() => lookup(c, o), 160); };
      const fromPhoto = () => ui.pickPhoto({ capture: true, onFiles: async (f) => { status.textContent = 'Читаю штрихкод…'; try { onCode(await decodeImage(f[0])); if (!found) throw 0; } catch (e) { status.textContent = 'Штрихкод не читается. Снимите ближе и ровнее или введите цифры вручную.'; } } });
      b.append(h('div', { class: 'stack' }, box, status,
        h('button', { class: 'btn tinted block', type: 'button', onclick: fromPhoto }, icon('camera', 20), 'Сфотографировать штрихкод'),
        h('div', { style: 'display:flex;gap:8px' }, code, h('button', { class: 'btn primary', type: 'button', onclick: () => { if (code.value.replace(/\D/g, '').length < 8) return code.focus(); onCode(code.value); } }, 'Найти')),
        h('button', { class: 'btn gray block', type: 'button', onclick: () => { stop(); s.close(); setTimeout(() => labelPhoto(o), 160); } }, icon('sparkles', 20), 'Нет штрихкода — фото состава')));
      // живая камера: только там, где страница сама может её открыть (автономная PWA по HTTPS)
      const live = !App.ai.hosted() && navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.isSecureContext;
      if (!live) { status.textContent = App.ai.hosted() ? 'Здесь сканер работает по фото: сделайте снимок штрихкода. Живая камера доступна в установленном приложении.' : 'Камера недоступна. Сфотографируйте штрихкод или введите цифры.'; return; }
      (async () => {
        try {
          stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 } }, audio: false });
          if (stopped) return stop();
          box.hidden = false;
          if ('BarcodeDetector' in window) {
            video.srcObject = stream; await video.play().catch(() => {});
            const det = new window.BarcodeDetector({ formats: FORMATS });
            timer = setInterval(async () => { if (stopped || video.readyState < 2) return; try { const r = await det.detect(video); if (r && r[0]) onCode(r[0].rawValue); } catch (e) {} }, 220);
          } else {
            const Z = await getZxing(); if (stopped) return stop();
            zreader = new Z.BrowserMultiFormatReader(undefined, 180);
            zreader.decodeFromStream(stream, video, (r) => { if (r) onCode(r.getText()); }).catch(() => { status.textContent = 'Не удалось запустить распознавание. Сфотографируйте штрихкод или введите цифры.'; });
          }
        } catch (e) { box.hidden = true; status.textContent = 'Нет доступа к камере. Разрешите его в настройках браузера или сфотографируйте штрихкод.'; }
      })();
    } });
  };

  const ALLERGEN = { milk: 'молоко', gluten: 'глютен', eggs: 'яйца', nuts: 'орехи', peanuts: 'арахис', soybeans: 'соя', fish: 'рыба', crustaceans: 'ракообразные', 'sesame-seeds': 'кунжут', mustard: 'горчица', celery: 'сельдерей', molluscs: 'моллюски', lupin: 'люпин', 'sulphur-dioxide-and-sulphites': 'сульфиты' };
  async function lookup(code, o) {
    const s = sheet({ title: 'Продукт', build: (b) => {
      b.replaceChildren(ui.aiWait('Ищу продукт ' + code + '…'));
      (async () => {
        let p = null;
        try {
          if (App.ai.hosted()) throw new Error('offline');
          const r = await fetch('https://world.openfoodfacts.org/api/v2/product/' + encodeURIComponent(code) + '.json?lc=ru&fields=product_name,product_name_ru,generic_name_ru,brands,quantity,nutriments,ingredients_text_ru,ingredients_text,nutriscore_grade,nova_group,additives_tags,allergens_tags');
          const j = await r.json();
          if (j && j.status === 1 && j.product) {
            const x = j.product, n = x.nutriments || {}, g = (k) => (typeof n[k] === 'number' ? n[k] : App.num(n[k]));
            p = { code: code, name: x.product_name_ru || x.product_name || x.generic_name_ru || 'Продукт ' + code, brand: (x.brands || '').split(',')[0], quantity: x.quantity || '',
              per100: { kcal: g('energy-kcal_100g'), p: g('proteins_100g'), f: g('fat_100g'), c: g('carbohydrates_100g'), sugar: g('sugars_100g'), salt: g('salt_100g'), fiber: g('fiber_100g'), sat: g('saturated-fat_100g') },
              ingredients: x.ingredients_text_ru || x.ingredients_text || '', nutri: /^[a-e]$/.test(x.nutriscore_grade || '') ? x.nutriscore_grade.toUpperCase() : '', nova: x.nova_group || null,
              additives: (x.additives_tags || []).map((a) => a.replace(/^.*:/, '').toUpperCase()), allergens: (x.allergens_tags || []).map((a) => ALLERGEN[a.replace(/^.*:/, '')] || a.replace(/^.*:/, '')) };
          }
        } catch (e) { p = null; }
        if (p) { s.close(); setTimeout(() => ui.product(p, o), 140); return; }
        b.replaceChildren(h('div', { class: 'empty fade' }, h('span', { class: 'ico soft', style: { '--c': 'var(--blue)' } }, icon('barcode', 30)), h('b', null, App.ai.hosted() ? 'Код прочитан: ' + code : 'Продукта нет в базе'),
          h('p', null, App.ai.hosted() ? 'Поиск по базе продуктов работает в установленном приложении. Здесь сфотографируйте состав на упаковке — ИИ прочитает и оценит его.' : 'Код ' + code + ' не найден в Open Food Facts. Сфотографируйте состав на упаковке — ИИ прочитает и оценит его.'),
          h('button', { class: 'btn primary', type: 'button', onclick: () => { s.close(); setTimeout(() => labelPhoto(o), 150); } }, icon('camera', 20), 'Сфотографировать состав')));
      })();
    } });
  }
  function labelPhoto(o) {
    ui.pickPhoto({ capture: true, multiple: true, onFiles: (files) => {
      const s = sheet({ title: 'Продукт', build: (b) => runAI(b, 'Читаю этикетку…', () => App.ai.productLabel(files), (d, demo) => {
        if (d.error || !d.name) return b.replaceChildren(errorView('На фото не видно состава или пищевой ценности. Снимите этикетку крупнее.'));
        const p = { name: String(d.name), brand: String(d.brand || ''), per100: d.per100 || {}, ingredients: String(d.ingredients || ''), additives: [], allergens: [], ai: { verdict: d.verdict, summary: d.summary, pros: d.pros || [], cons: d.cons || [] }, demo: demo };
        s.close(); setTimeout(() => ui.product(p, o), 140);
      }) });
    } });
  }

  // светофор по ориентирам на 100 г (сахар, жиры, насыщенные жиры, соль)
  const light = (v, lo, hi) => (v == null ? null : v > hi ? 'var(--red)' : v > lo ? 'var(--orange)' : 'var(--green)');
  ui.product = function (p, o) {
    o = o || {};
    const st = store.state, n = p.per100 || {}, goal = st.profile.goal;
    let grams = 100, meal = o.meal || D.mealByTime();
    const s = sheet({ title: 'Продукт', foot: true, build: (b, api) => {
      const facts = [['Сахар', n.sugar, light(n.sugar, 5, 22.5)], ['Насыщенные жиры', n.sat, light(n.sat, 1.5, 5)], ['Соль', n.salt, light(n.salt, 0.3, 1.5)], ['Клетчатка', n.fiber, n.fiber == null ? null : n.fiber >= 3 ? 'var(--green)' : 'var(--fg-2)']].filter((x) => x[1] != null);
      // быстрый вывод по правилам — без ИИ
      const notes = [];
      if (n.sugar > 22.5) notes.push('много сахара'); if (n.sat > 5) notes.push('много насыщенных жиров'); if (n.salt > 1.5) notes.push('много соли');
      if (goal === 'lose' && n.kcal > 400) notes.push('очень калорийный для похудения'); if (n.p >= 12) notes.push('хороший источник белка'); if (n.fiber >= 6) notes.push('много клетчатки');
      const excluded = (st.profile.allergies || '').toLowerCase().split(/[,;\n]+/).map((x) => x.trim()).filter((x) => x.length > 2);
      const hay = (p.ingredients + ' ' + (p.allergens || []).join(' ')).toLowerCase();
      const hits = excluded.filter((x) => hay.indexOf(x.split(' ')[0].slice(0, Math.max(4, x.split(' ')[0].length - 2))) >= 0);
      const aiBox = h('div');
      const showAI = (a, demo) => { const c = a.verdict === 'good' ? 'var(--green)' : a.verdict === 'bad' ? 'var(--red)' : 'var(--orange)';
        aiBox.replaceChildren(h('div', { class: 'note fade', style: { '--c': c } }, h('b', { class: 'h' }, icon('sparkles', 15), a.verdict === 'good' ? 'Подходит' : a.verdict === 'bad' ? 'Лучше не брать' : 'Можно, но в меру', demo ? ui.demoBadge() : null), a.summary || '',
          (a.pros || []).length || (a.cons || []).length ? h('ul', null, (a.pros || []).map((x) => h('li', null, '＋ ' + x)), (a.cons || []).map((x) => h('li', null, '− ' + x))) : null)); };
      if (p.ai) showAI(p.ai, p.demo);
      else aiBox.appendChild(h('button', { class: 'btn tinted block', type: 'button', onclick: () => runAI(aiBox, 'Оцениваю состав…', () => App.ai.productVerdict(p), showAI) }, icon('sparkles', 20), 'Разбор состава от ИИ'));
      const gramsIn = h('input', { id: 'pr-grams', inputmode: 'decimal', value: '100' });
      const portion = h('div');
      const drawPortion = () => { grams = App.clamp(N(gramsIn.value) || 0, 0, 5000); portion.replaceChildren(nutriGrid(calc.portion(n, grams), 'В порции ' + nf(grams) + ' г')); };
      gramsIn.addEventListener('input', drawPortion); drawPortion();
      b.append(h('div', { class: 'stack' },
        h('div', { style: 'display:flex;gap:14px;align-items:flex-start' }, h('div', { style: 'flex:1;min-width:0' }, h('h2', { style: 'font-size:24px;line-height:1.15;letter-spacing:-.02em;text-wrap:balance' }, p.name), h('div', { class: 'sub', style: 'margin-top:4px' }, [p.brand, p.quantity].filter(Boolean).join(' · ') || (p.code ? 'Штрихкод ' + p.code : ''))),
          p.nutri ? h('div', { class: 'grade', title: 'Nutri-Score', style: { '--c': { A: '#1E8F4E', B: '#7AC143', C: '#F5B301', D: '#EF7D1A', E: '#E63E11' }[p.nutri] } }, p.nutri) : null),
        hits.length ? h('div', { class: 'note', style: { '--c': 'var(--red)' } }, h('b', { class: 'h' }, icon('info', 15), 'Вы это исключили'), 'В составе найдено: ' + hits.join(', ') + '.') : null,
        n.kcal != null ? nutriGrid(n, 'На 100 г') : h('div', { class: 'note', style: { '--c': 'var(--orange)' } }, 'Пищевая ценность для этого продукта не указана.'),
        facts.length ? h('div', { class: 'list' }, facts.map((x) => ui.row({ title: x[0], right: h('span', { class: 'chip c', style: { '--c': x[2] || 'var(--fg-2)' } }, nf(x[1], 1) + ' г') }))) : null,
        notes.length ? h('p', { class: 'caption' }, 'Коротко: ' + notes.join(', ') + '.') : null,
        aiBox,
        p.ingredients ? h('div', null, h('div', { class: 'caption', style: 'margin-bottom:6px' }, 'Состав'), h('div', { class: 'card', style: 'font-size:15px;line-height:1.4' }, p.ingredients)) : null,
        (p.additives || []).length || (p.allergens || []).length || p.nova ? h('div', { class: 'chips' }, (p.additives || []).slice(0, 12).map((a) => h('span', { class: 'chip' }, a)), (p.allergens || []).map((a) => h('span', { class: 'chip c', style: { '--c': 'var(--orange)' } }, a)),
          p.nova ? h('span', { class: 'chip c', style: { '--c': p.nova >= 4 ? 'var(--red)' : p.nova === 3 ? 'var(--orange)' : 'var(--green)' } }, p.nova >= 4 ? 'ультрапереработанный' : p.nova === 3 ? 'переработанный' : 'мало обработан') : null) : null,
        n.kcal != null ? h('div', null, h('div', { class: 'list' }, h('div', { class: 'field' }, h('label', { for: 'pr-grams' }, 'Порция'), gramsIn, h('span', { class: 'unit' }, 'г'))), h('div', { style: 'margin-top:10px' }, portion), h('div', { style: 'margin-top:10px' }, mealPicker(meal, (v) => { meal = v; }))) : null,
        p.code ? h('p', { class: 'disclaimer' }, 'Данные о продукте — из открытой базы Open Food Facts, их вносят пользователи. Сверяйте с упаковкой.') : null));
      api.foot.append(h('div', { class: 'btn-row' },
        n.kcal != null ? h('button', { class: 'btn primary', type: 'button', onclick: () => { if (!grams) return gramsIn.focus(); addFood(Object.assign({ name: p.name, grams: grams }, calc.portion(n, grams)), meal, o.date); haptic(12); store.commit(); s.close(); toast('Добавлено в дневник'); } }, 'Съел') : null,
        h('button', { class: 'btn gray', type: 'button', onclick: () => { st.fridge.push({ id: uid(), name: p.name, qty: p.quantity || '', cat: 'Другое' }); store.commit(); s.close(); toast('В холодильнике', { icon: 'fridge', color: 'var(--orange)' }); } }, 'Купил'),
        h('button', { class: 'btn gray', type: 'button', 'aria-label': 'В список покупок', style: 'flex:0 0 54px;padding:0', onclick: () => { st.shopping.push({ id: uid(), name: p.name, qty: '', done: false }); store.commit(); toast('В списке покупок', { icon: 'cart', color: 'var(--blue)' }); } }, icon('cart', 22))));
    } });
  };
})();
