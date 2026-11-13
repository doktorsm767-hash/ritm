/* Ритм — тренировки, анализы, показатели, лекарства, трекеры воды, сна, шагов и веса. */
(function () {
  'use strict';
  const App = window.App, { h, icon, store, calc, nf, ring, sheet, toast, haptic, uid } = App;
  const ui = App.ui, D = App.data;
  const kidsSet = App.kidsSet, kidsAdd = App.kidsAdd;
  const N = (v) => { const n = App.num(v); return n == null ? 0 : n; };
  const sortDesc = (a, k) => a.slice().sort((x, y) => (x[k] < y[k] ? 1 : x[k] > y[k] ? -1 : 0));
  const noteBox = (c, ic, title, kids) => h('div', { class: 'note', style: { '--c': c } }, h('b', { class: 'h' }, icon(ic, 15), title), kids);
  const bullets = (arr) => h('ul', null, arr.map((x) => h('li', null, String(x))));

  /* ================= ТРЕНИРОВКИ ================= */
  function trainTab() {
    const s = store.state, tp = s.trainPlan, today = App.dkey();
    if (!tp) return { title: 'Тренировки', body: [ui.empty({ icon: 'dumbbell', color: 'var(--orange)', title: 'Программа тренировок', text: 'Подберём упражнения под вашу цель, уровень и место занятий. ИИ учтёт анализы и ограничения по здоровью.',
      action: h('button', { class: 'btn primary block', type: 'button', onclick: () => ui.trainSetup() }, icon('sparkles', 20), 'Составить программу') })] };
    const wd = (new Date().getDay() + 6) % 7, monday = App.addDays(today, -wd), plan = tp.weekdays || [];
    const weekDone = s.workouts.filter((x) => x.date >= monday).length, next = s.workouts.length % tp.days.length;
    const body = [
      h('div', { class: 'card rise' },
        h('div', { style: 'display:flex;justify-content:space-between;align-items:baseline;margin-bottom:12px' }, h('div', null, h('div', { class: 'big' }, weekDone, h('small', null, 'из ' + tp.days.length)), h('div', { class: 'sub' }, 'тренировок на этой неделе')),
          h('span', { class: 'chip c', style: { '--c': 'var(--orange)' } }, icon('flame', 13), nf(s.workouts.reduce((a, x) => a + (x.minutes || 0), 0)) + ' мин всего')),
        h('div', { class: 'week' }, D.DAYSHORT.map((n, i) => { const k = App.addDays(monday, i), done = s.workouts.some((x) => x.date === k);
          return h('div', null, h('div', { class: 'd' }, n), h('div', { class: 'o' + (done ? ' done' : plan.indexOf(i) >= 0 ? ' plan' : '') + (i === wd ? ' today' : '') }, done ? icon('check', 15) : String(App.parseKey(k).getDate()))); }))),
      h('div', { class: 'section' }, ui.head(tp.title || 'Программа', 'Изменить', () => ui.trainSetup())),
      tp.days.map((d, i) => h('div', { class: 'card tap rise', role: 'button', tabindex: '0', style: { '--i': i + 1, display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '10px' }, onclick: () => ui.workout(i) },
        h('span', { class: 'ico lg' + (i === next ? '' : ' soft'), style: { '--c': 'var(--orange)' } }, icon('dumbbell', 24)),
        h('div', { style: 'flex:1;min-width:0' }, h('div', { style: 'font-weight:600' }, d.title), h('div', { class: 'sub' }, d.exercises.length + ' ' + App.plural(d.exercises.length, 'упражнение', 'упражнения', 'упражнений') + (d.focus ? ' · ' + d.focus : ''))),
        i === next ? h('span', { class: 'chip c', style: { '--c': 'var(--orange)' } }, 'следующая') : icon('chevR', 16))),
      tp.note ? h('p', { class: 'caption' }, tp.note) : null
    ];
    if (s.workouts.length) body.push(h('div', { class: 'section' }, ui.head('История')), h('div', { class: 'list' }, sortDesc(s.workouts, 'date').slice(0, 6).map((x) => ui.row({ icon: 'check', color: 'var(--green)', title: x.title, sub: App.fmtDate(x.date, { weekday: 'short', day: 'numeric', month: 'long' }), val: (x.minutes || 0) + ' мин' }))));
    return { title: 'Тренировки', body: body };
  }
  App.registerTab({ id: 'train', title: 'Тренировки', short: 'Спорт', icon: 'dumbbell', render: trainTab });

  ui.trainSetup = function () {
    const p = store.state.profile, o = { place: p.place || 'home', level: p.level || 'beginner', days: p.trainDays || 3, limits: p.limits || '' };
    const s = sheet({ title: 'Программа', build: (b) => {
      const places = h('div', { class: 'options' });
      const drawP = () => kidsSet(places, ...[{ id: 'home', t: 'Дома', d: 'Без инвентаря, с весом тела' }, { id: 'gym', t: 'В зале', d: 'Штанга, гантели, тренажёры' }].map((x) => h('button', { class: 'option' + (o.place === x.id ? ' on' : ''), type: 'button', onclick: () => { o.place = x.id; haptic(6); drawP(); } },
        h('div', null, h('div', { class: 't' }, x.t), h('div', { class: 'd' }, x.d)), h('span', { class: 'radio' }, icon('check', 14))))); drawP();
      const limits = h('textarea', { class: 'input-big', id: 'tr-limits', rows: '2', placeholder: 'Травмы и ограничения, например: болит колено' }); limits.value = o.limits;
      const save = (plan, demo) => {
        const days = (plan.days || []).map((d) => ({ title: String(d.title || 'Тренировка'), focus: String(d.focus || ''), exercises: (d.exercises || []).filter((e) => e && e.name).map((e) => ({ name: String(e.name), sets: App.clamp(Math.round(N(e.sets)) || 3, 1, 8), reps: String(e.reps || ''), rest: App.clamp(Math.round(N(e.rest)) || 60, 15, 300), tip: String(e.tip || '') })) })).filter((d) => d.exercises.length);
        if (!days.length) return false;
        const wds = (plan.weekdays || []).map(Number).filter((x) => x >= 0 && x <= 6);
        store.state.trainPlan = { createdAt: Date.now(), source: demo ? 'template' : plan.source || 'ai', title: String(plan.title || 'Программа'), note: String(plan.note || ''), weekdays: wds.length ? wds : { 2: [0, 3], 3: [0, 2, 4], 4: [0, 1, 3, 4], 5: [0, 1, 2, 4, 5] }[App.clamp(days.length, 2, 5)], days: days };
        Object.assign(store.state.profile, { place: o.place, level: o.level, trainDays: o.days, limits: o.limits });
        store.commit(); s.close(); App.go('train', { keep: true }); toast(demo ? 'Показана базовая программа' : 'Программа готова', { icon: 'dumbbell', color: 'var(--orange)' }); return true;
      };
      const start = () => { o.limits = limits.value.trim(); ui.runAI(b, 'Подбираю упражнения…', () => App.ai.trainPlan(o), (d, demo) => { if (!save(d, demo)) kidsSet(b, ui.errorView('ИИ вернул пустую программу. Попробуйте ещё раз.', start)); }); };
      kidsAdd(b, h('div', { class: 'stack' },
        h('div', null, h('div', { class: 'caption', style: 'margin-bottom:6px' }, 'Где занимаетесь'), places),
        h('div', null, h('div', { class: 'caption', style: 'margin-bottom:6px' }, 'Уровень'), App.seg([{ id: 'beginner', label: 'Новичок' }, { id: 'middle', label: 'Средний' }, { id: 'advanced', label: 'Опытный' }], o.level, (v) => { o.level = v; })),
        h('div', null, h('div', { class: 'caption', style: 'margin-bottom:6px' }, 'Тренировок в неделю'), App.seg([2, 3, 4, 5].map((n) => ({ id: n, label: String(n) })), o.days, (v) => { o.days = v; })),
        limits,
        noteBox('var(--purple)', 'flask', 'Учтём анализы', App.ai.labFlags()),
        ui.aiNote(),
        h('button', { class: 'btn primary block', type: 'button', onclick: start }, icon('sparkles', 20), 'Составить программу'),
        h('button', { class: 'btn gray block', type: 'button', onclick: () => { o.limits = limits.value.trim(); save(Object.assign(D.templateTrainPlan(Object.assign({ goal: p.goal }, o)), { source: 'template' }), true); } }, 'Базовая программа без ИИ'),
        h('p', { class: 'disclaimer' }, 'Если есть хронические заболевания или давно не занимались, согласуйте нагрузку с врачом.')));
    } });
  };

  ui.workout = function (idx) {
    const tp = store.state.trainPlan, day = tp.days[idx], started = Date.now();
    const done = day.exercises.map((e) => new Array(e.sets).fill(false));
    let tick = 0, rest = null;
    const s = sheet({ title: day.title, foot: true, onClose: () => clearInterval(tick), build: (b, api) => {
      const clock = h('span', { class: 'chip num' }, '0:00');
      api.left.appendChild(clock);
      const restBox = h('div'), progress = h('div', { class: 'sub', style: 'text-align:center;margin-bottom:8px' });
      const total = done.reduce((a, x) => a + x.length, 0);
      const count = () => done.reduce((a, x) => a + x.filter(Boolean).length, 0);
      const fmt = (sec) => Math.floor(sec / 60) + ':' + App.pad(sec % 60);
      const paintRest = () => {
        if (!rest) return kidsSet(restBox);
        const leftS = Math.max(0, Math.ceil((rest.until - Date.now()) / 1000));
        if (!leftS) { rest = null; haptic([60, 40, 60]); kidsSet(restBox); return toast('Отдых окончен — следующий подход', { icon: 'bolt', color: 'var(--orange)' }); }
        const r = ring({ size: 34, stroke: 5, value: leftS / rest.total, color: 'var(--orange)', id: 'rest' }); App.memo.rest = leftS / rest.total;
        kidsSet(restBox, h('div', { class: 'timer-pill', style: 'margin-bottom:10px' }, r, h('div', { style: 'flex:1' }, h('div', { style: 'font-weight:700' }, 'Отдых ' + fmt(leftS)), h('div', { style: 'font-size:12px;opacity:.7' }, 'Дышите ровно')),
          h('button', { class: 'btn sm', type: 'button', style: 'background:rgba(128,128,128,.3);color:inherit', onclick: () => { rest = null; paintRest(); } }, 'Пропустить')));
      };
      const paint = () => { const c = count(); progress.textContent = 'Выполнено ' + c + ' из ' + total + ' ' + App.plural(total, 'подхода', 'подходов', 'подходов'); };
      tick = setInterval(() => { clock.textContent = fmt(Math.floor((Date.now() - started) / 1000)); if (rest) paintRest(); }, 500);
      kidsAdd(b, h('div', { class: 'stack' }, day.focus ? h('p', { class: 'caption' }, 'Акцент: ' + day.focus + '. Перед началом — 5 минут разминки.') : null,
        h('div', { class: 'list' }, day.exercises.map((e, i) => h('div', { class: 'ex' },
          ui.coachThumb(e),
          h('button', { class: 'n', type: 'button', style: 'text-align:left', onclick: () => ui.coach(e) }, h('b', null, e.name), h('span', null, e.sets + ' × ' + e.reps + (e.rest ? ' · отдых ' + e.rest + ' с' : '')), e.tip ? h('span', { style: 'display:block;margin-top:3px' }, e.tip) : null),
          h('div', { class: 'sets' }, done[i].map((v, j) => { const btn = h('button', { class: 'set', type: 'button', 'aria-label': 'Подход ' + (j + 1), onclick: () => {
            done[i][j] = !done[i][j]; btn.classList.toggle('on', done[i][j]); kidsSet(btn, done[i][j] ? icon('check', 15) : String(j + 1)); haptic(12); paint();
            if (done[i][j] && count() < total) { rest = { total: e.rest || 60, until: Date.now() + (e.rest || 60) * 1000 }; App.memo.rest = 1; paintRest(); } } }, String(j + 1)); return btn; })))))));
      paint();
      kidsAdd(api.foot, restBox, progress, h('button', { class: 'btn primary block', type: 'button', onclick: async () => {
        if (count() < total && !(await App.confirm({ title: 'Завершить тренировку?', text: 'Выполнены не все подходы. Тренировка всё равно будет засчитана.', ok: 'Завершить' }))) return;
        store.state.workouts.push({ id: uid(), date: App.dkey(), day: idx, title: day.title, minutes: Math.max(1, Math.round((Date.now() - started) / 60000)) });
        store.commit(); s.close(); toast('Тренировка засчитана', { icon: 'flame', color: 'var(--orange)' });
      } }, icon('check', 20), 'Завершить тренировку'));
    } });
  };

  /* ---------- тренер ---------- */
  ui.coachThumb = (e) => {
    const b = h('button', { class: 'coach-thumb', type: 'button', 'aria-label': 'Как выполнять: ' + e.name, onclick: () => ui.coach(e) });
    const svg = App.coach.svgNode(); b.appendChild(svg);
    requestAnimationFrame(() => App.coach.mount(svg, App.coach.find(e.name), { speed: 0.9 }));
    return b;
  };
  ui.coach = function (e) {
    const id = App.coach.find(e.name), a = App.coach.ANIMS[id], cue = App.coach.CUES[id] || App.coach.CUES.march;
    sheet({ title: 'Тренер', build: (b) => {
      const phase = h('div', { class: 'coach-phase' }, a.labels[0]);
      const svg = App.coach.svgNode();
      let ctl = null, slow = false;
      const playBtn = h('button', { type: 'button', 'aria-label': 'Пауза', onclick: () => { ctl.pause(!ctl.paused); kidsSet(playBtn, icon(ctl.paused ? 'play' : 'pause', 16)); playBtn.setAttribute('aria-label', ctl.paused ? 'Продолжить' : 'Пауза'); } }, icon('pause', 16));
      const slowBtn = h('button', { type: 'button', 'aria-label': 'Медленно', title: 'Медленно', onclick: () => { slow = !slow; ctl.setSpeed(slow ? 0.45 : 1); slowBtn.style.color = slow ? 'var(--accent)' : ''; haptic(6); } }, icon('clock', 16));
      const stage = h('div', { class: 'coach-stage' }, svg, phase, h('div', { class: 'coach-ctrl' }, slowBtn, playBtn));
      kidsAdd(b, h('div', { class: 'stack' },
        stage,
        h('div', null, h('h2', { style: 'font-size:24px;letter-spacing:-.02em;line-height:1.15' }, e.name),
          h('div', { class: 'chips', style: 'margin-top:8px' }, e.sets ? h('span', { class: 'chip' }, e.sets + ' × ' + (e.reps || '')) : null, e.rest ? h('span', { class: 'chip' }, icon('clock', 13), 'отдых ' + e.rest + ' с') : null)),
        e.tip ? h('div', { class: 'note', style: { '--c': 'var(--purple)' } }, h('b', { class: 'h' }, icon('sparkles', 15), 'Совет'), e.tip) : null,
        h('div', null, h('div', { class: 'caption', style: 'margin-bottom:8px' }, 'Как выполнять'), h('div', { class: 'card' }, h('ol', { class: 'coach-steps' }, cue.steps.map((x) => h('li', null, x))))),
        h('div', { class: 'note', style: { '--c': 'var(--orange)' } }, h('b', { class: 'h' }, icon('info', 15), 'Частые ошибки'), h('ul', null, cue.errs.map((x) => h('li', null, x)))),
        h('div', { class: 'note', style: { '--c': 'var(--blue)' } }, h('b', { class: 'h' }, icon('drop', 15), 'Дыхание'), cue.breath)));
      requestAnimationFrame(() => { ctl = App.coach.mount(svg, id, { onPhase: (i) => { phase.textContent = a.labels[i] || a.labels[0]; } }); });
    } });
  };

  /* ================= ЗДОРОВЬЕ ================= */
  function healthTab() {
    const s = store.state, day = store.peek(), t = s.targets, body = [];
    const labs = sortDesc(s.labs, 'date');
    body.push(h('div', { class: 'section', style: 'margin-top:4px' }, ui.head('Анализы', labs.length ? 'Добавить' : null, () => ui.labAdd())));
    if (!labs.length) body.push(ui.empty({ icon: 'flask', color: 'var(--purple)', title: 'Анализы с разбором', text: 'Сфотографируйте бланк — ИИ распознает показатели, объяснит простым языком и подскажет, что учесть в питании.',
      action: h('button', { class: 'btn primary block', type: 'button', onclick: () => ui.labAdd() }, icon('camera', 20), 'Добавить анализы') }));
    else body.push(h('div', { class: 'list rise' }, labs.map((l) => { const off = l.markers.filter((m) => m.status !== 'normal').length;
      return ui.row({ icon: 'flask', color: 'var(--purple)', title: l.title || 'Анализы', sub: App.fmtDate(l.date, { day: 'numeric', month: 'long', year: 'numeric' }) + ' · ' + l.markers.length + ' ' + App.plural(l.markers.length, 'показатель', 'показателя', 'показателей'),
        right: h('span', { class: 'chip c', style: { '--c': off ? 'var(--orange)' : 'var(--green)' } }, off ? off + ' вне нормы' : 'в норме'), onclick: () => ui.labDetail(l.id) }); })));

    const last = (type) => sortDesc(s.vitals.filter((v) => v.type === type), 'd')[0];
    const bp = last('bp'), sg = last('sugar'), w = sortDesc(s.weights, 'd')[0];
    const tile = (o) => h('div', { class: 'card tap tile rise', role: 'button', tabindex: '0', style: { minHeight: '112px', '--i': o.i }, onclick: o.go },
      h('div', { class: 'card-title', style: { color: o.c } }, icon(o.icon, 18), o.title),
      h('div', { class: 'foot' }, h('div', { class: 'mid' }, o.val, o.unit ? h('small', null, o.unit) : null), o.info ? h('span', { class: 'chip c', style: { '--c': o.info.c, marginTop: '6px' } }, o.info.t) : h('div', { class: 'sub' }, o.sub || 'Нет записей')));
    body.push(h('div', { class: 'section' }, ui.head('Показатели')), h('div', { class: 'grid2' },
      tile({ i: 1, icon: 'heart', c: 'var(--red)', title: 'Давление', val: bp ? bp.sys + '/' + bp.dia : '—', info: bp ? calc.bpInfo(bp.sys, bp.dia) : null, go: () => ui.vitals('bp') }),
      tile({ i: 2, icon: 'pulse', c: 'var(--pink)', title: 'Пульс', val: bp && bp.pulse ? bp.pulse : '—', unit: bp && bp.pulse ? 'уд/мин' : '', info: bp && bp.pulse ? calc.pulseInfo(bp.pulse) : null, go: () => ui.vitals('bp') }),
      tile({ i: 3, icon: 'drop', c: 'var(--orange)', title: 'Сахар', val: sg ? nf(sg.value, 1) : '—', unit: sg ? 'ммоль/л' : '', info: sg ? calc.sugarInfo(sg.value, sg.fasting) : null, go: () => ui.vitals('sugar') }),
      tile({ i: 4, icon: 'scale', c: 'var(--purple)', title: 'Вес', val: w ? nf(w.kg, 1) : '—', unit: 'кг', info: calc.bmiInfo(calc.bmi(s.profile)), go: () => ui.weight() })));

    body.push(h('div', { class: 'section' }, ui.head('Лекарства и БАДы', 'Добавить', () => ui.medEdit())));
    if (!s.meds.length) body.push(h('p', { class: 'caption' }, 'Добавьте препараты и время приёма — отметки появятся на экране «Сегодня».'));
    else body.push(h('div', { class: 'list' }, s.meds.map((m) => ui.row({ icon: 'pill', color: m.kind === 'med' ? 'var(--blue)' : 'var(--green)', title: m.name, sub: [m.dose, (m.times || []).join(', ')].filter(Boolean).join(' · '), onclick: () => ui.medEdit(m.id) }))));

    body.push(h('div', { class: 'section' }, ui.head('Каждый день')), h('div', { class: 'list' },
      ui.row({ icon: 'drop', color: 'var(--blue)', title: 'Вода', val: nf(day.water / 1000, 2) + ' из ' + nf(t.water / 1000, 1) + ' л', onclick: () => ui.water() }),
      ui.row({ icon: 'moon', color: 'var(--indigo)', title: 'Сон', val: day.sleep != null ? nf(day.sleep, 1) + ' ч' : 'не отмечен', onclick: () => ui.sleep() }),
      ui.row({ icon: 'walk', color: 'var(--green)', title: 'Шаги', val: day.steps != null ? nf(day.steps) : 'не отмечены', onclick: () => ui.steps() })),
      h('p', { class: 'disclaimer', style: 'margin-top:16px' }, 'Нормы и подсказки носят справочный характер и не заменяют консультацию врача.'));
    return { title: 'Здоровье', body: body };
  }
  App.registerTab({ id: 'health', title: 'Здоровье', icon: 'heart', render: healthTab });

  /* ---------- анализы ---------- */
  const findMarker = (name) => { const n = String(name || '').toLowerCase(); return D.MARKERS.find((m) => n === m.name.toLowerCase()) || D.MARKERS.find((m) => n.indexOf(m.name.toLowerCase().split(' ')[0]) === 0); };
  function normMarkers(list) {
    const sex = store.state.profile.sex;
    return (list || []).map((m) => {
      const v = App.num(m.value); if (v == null || !m.name) return null;
      let mn = App.num(m.refMin), mx = App.num(m.refMax), unit = String(m.unit || '');
      if (mn == null && mx == null) { const cat = findMarker(m.name), r = cat && D.refFor(cat, sex); if (r && (!unit || unit === cat.unit)) { mn = r[0]; mx = r[1]; unit = unit || cat.unit; } }
      return { name: String(m.name), value: v, unit: unit, refMin: mn, refMax: mx, status: D.statusOf(v, mn, mx) };
    }).filter(Boolean);
  }
  ui.labAdd = function () {
    const key = App.ai.mode() === 'server';
    const s = sheet({ title: 'Добавить анализы', detent: 'auto', build: (b) => {
      const go = (opts) => { s.close(); setTimeout(() => ui.pickPhoto(Object.assign({ onFiles: labFromFiles }, opts)), 160); };
      kidsAdd(b, h('div', { class: 'stack' },
        h('div', { class: 'list' },
          ui.row({ icon: 'camera', color: 'var(--purple)', title: 'Сфотографировать бланк', sub: 'ИИ распознает показатели и объяснит', onclick: () => go({ capture: true, multiple: true }) }),
          ui.row({ icon: 'photo', color: 'var(--blue)', title: key ? 'Выбрать фото или PDF' : 'Выбрать фото или скриншот', sub: 'Из галереи, можно несколько страниц', onclick: () => go({ multiple: true, accept: key ? 'image/jpeg,image/png,image/webp,application/pdf' : 'image/jpeg,image/png,image/webp' }) }),
          ui.row({ icon: 'pencil', color: 'var(--indigo)', title: 'Ввести вручную', sub: 'Выберите показатели и впишите значения', onclick: () => { s.close(); setTimeout(() => ui.labManual(), 160); } })),
        ui.aiNote(),
        h('p', { class: 'disclaimer' }, 'Фото отправляется в Claude только для распознавания. Закройте на бланке ФИО, если не хотите его передавать.')));
    } });
  };
  function labFromFiles(files) {
    const s = sheet({ title: 'Разбор анализов', build: (b) => ui.runAI(b, 'Читаю бланк и сверяю с нормами…', () => App.ai.parseLab(files), (d, demo) => {
      const markers = normMarkers(d.markers);
      if (d.error || !markers.length) return kidsSet(b, ui.errorView('На фото не нашлось показателей анализов. Снимите бланк целиком, ровно и при хорошем свете — или введите значения вручную.'));
      const lab = { id: uid(), title: String(d.title || 'Анализы'), lab: String(d.lab || ''), date: /^\d{4}-\d{2}-\d{2}$/.test(d.date || '') && d.date <= App.dkey() ? d.date : App.dkey(), source: demo ? 'demo' : 'ai', markers: markers,
        doctorNote: String(d.doctorNote || ''), summary: String(d.summary || ''), nutrition: (d.nutrition || []).map(String), lifestyle: (d.lifestyle || []).map(String), doctor: (d.doctor || []).map(String) };
      store.state.labs.push(lab); store.commit(); s.close(); setTimeout(() => ui.labDetail(lab.id), 160);
      toast(demo ? 'Показан пример разбора' : 'Анализы добавлены', { icon: 'flask', color: 'var(--purple)' });
    }) });
  }
  ui.labManual = function () {
    const sex = store.state.profile.sex, rows = [];
    const s = sheet({ title: 'Анализы вручную', foot: true, build: (b, api) => {
      const title = h('input', { id: 'lm-title', placeholder: 'Например: биохимия крови', style: 'text-align:right' }), date = h('input', { id: 'lm-date', type: 'date', value: App.dkey(), max: App.dkey() });
      const note = h('textarea', { id: 'lm-note', placeholder: 'Заключение или рекомендации врача, если есть' });
      const list = h('div', { class: 'list' });
      const draw = () => {
        kidsSet(list, ...rows.map((r, i) => h('div', { class: 'field', style: 'flex-wrap:wrap;row-gap:0' },
          h('label', { for: 'lm-v' + i, style: 'flex:1;min-width:0;font-weight:600' }, r.name), r.input, h('span', { class: 'unit', style: 'min-width:54px' }, r.unit),
          h('button', { class: 'close-x', type: 'button', 'aria-label': 'Убрать', onclick: () => { rows.splice(i, 1); draw(); } }, icon('xmark', 14)),
          h('div', { class: 'sub', style: 'flex-basis:100%;padding-bottom:6px' }, r.refMin != null || r.refMax != null ? 'Норма: ' + (r.refMin != null ? nf(r.refMin, 2) : '…') + ' – ' + (r.refMax != null ? nf(r.refMax, 2) : '…') + ' ' + r.unit : 'Без референса'))),
          h('button', { class: 'add-line', type: 'button', onclick: pick }, icon('plus', 18), 'Добавить показатель'));
      };
      const pick = () => { const ps = sheet({ title: 'Показатель', build: (pb) => {
        const q = h('input', { class: 'input-big', id: 'lm-q', placeholder: 'Поиск или своё название' }), res = h('div', { class: 'stack', style: 'margin-top:12px' });
        const add = (mk) => { const r = D.refFor(mk, sex) || [null, null]; const idx = rows.length;
          rows.push({ name: mk.name, unit: mk.unit || '', refMin: r[0], refMax: r[1], input: h('input', { id: 'lm-v' + idx, inputmode: 'decimal', placeholder: '0', style: 'flex:0 0 84px' }) }); ps.close(); draw(); setTimeout(() => rows[rows.length - 1].input.focus(), 350); };
        const show = () => { const f = q.value.trim().toLowerCase(), groups = {};
          D.MARKERS.filter((m) => !f || m.name.toLowerCase().indexOf(f) >= 0).filter((m) => !rows.some((r) => r.name === m.name)).forEach((m) => (groups[m.g] = groups[m.g] || []).push(m));
          kidsSet(res, ...Object.keys(groups).map((g) => h('div', null, h('div', { class: 'caption', style: 'margin-bottom:6px' }, g), h('div', { class: 'list' }, groups[g].map((m) => ui.row({ title: m.name, val: m.unit, chev: false, onclick: () => add(m) }))))),
            f ? h('button', { class: 'btn tinted block', type: 'button', onclick: () => add({ name: q.value.trim(), unit: '' }) }, 'Добавить «' + q.value.trim() + '»') : null); };
        q.addEventListener('input', show); show(); kidsAdd(pb, q, res);
      } }); };
      draw();
      kidsAdd(b, h('div', { class: 'stack' }, h('div', { class: 'list' }, h('div', { class: 'field' }, h('label', { for: 'lm-title' }, 'Название'), title), h('div', { class: 'field' }, h('label', { for: 'lm-date' }, 'Дата сдачи'), date)), list,
        h('div', { class: 'list' }, h('div', { class: 'field col' }, h('label', { for: 'lm-note' }, 'Разбор врача'), note)),
        h('p', { class: 'caption' }, 'Нормы подставлены ориентировочно. Если на вашем бланке указаны другие — ориентируйтесь на них.')));
      api.foot.appendChild(h('button', { class: 'btn primary block', type: 'button', onclick: () => {
        const markers = normMarkers(rows.map((r) => ({ name: r.name, value: r.input.value, unit: r.unit, refMin: r.refMin, refMax: r.refMax })));
        if (!markers.length) return toast('Добавьте хотя бы один показатель со значением', { icon: 'info', color: 'var(--orange)' });
        const lab = { id: uid(), title: title.value.trim() || 'Анализы', lab: '', date: date.value || App.dkey(), source: 'manual', markers: markers, doctorNote: note.value.trim(), summary: '', nutrition: [], lifestyle: [], doctor: [] };
        store.state.labs.push(lab); store.commit(); s.close(); setTimeout(() => ui.labDetail(lab.id), 160);
      } }, 'Сохранить'));
    } });
  };
  function rangeBar(m) {
    const st = D.STATUS[m.status], mn = m.refMin, mx = m.refMax;
    if (mn == null && mx == null) return null;
    const lo0 = mn != null ? mn : 0, hi0 = mx != null ? mx : lo0 * 2 || m.value * 1.5 || 1, span = hi0 - lo0 || hi0 || 1;
    const lo = Math.min(lo0 - span * 0.5, m.value - span * 0.1), hi = Math.max(hi0 + span * 0.5, m.value + span * 0.1), pct = (v) => App.clamp(((v - lo) / (hi - lo)) * 100, 0, 100);
    const dot = h('div', { class: 'dot', style: { '--c': st.c } });
    App.animateValue(null, App.clamp(pct(m.value), 3, 97), (p) => { dot.style.left = p + '%'; }, { from: 50, response: 0.7, damping: 0.8 });
    return h('div', null, h('div', { class: 'range' }, h('div', { class: 'ok', style: { left: pct(lo0) + '%', width: pct(hi0) - pct(lo0) + '%' } }), dot),
      h('div', { class: 'ref' }, h('span', null, 'Норма ' + (mn != null ? nf(mn, 2) : '…') + ' – ' + (mx != null ? nf(mx, 2) : '…')), h('span', { style: { color: st.c, fontWeight: 600 } }, st.t)));
  }
  ui.labDetail = function (id) {
    const s = sheet({ title: 'Анализы', build: (b) => {
      const draw = () => {
        const lab = store.state.labs.find((l) => l.id === id); if (!lab) return s.close();
        const off = lab.markers.filter((m) => m.status !== 'normal'), aiBox = h('div');
        if (!lab.summary) aiBox.appendChild(h('button', { class: 'btn tinted block', type: 'button', onclick: () => ui.runAI(aiBox, 'Разбираю показатели…', () => App.ai.explainLab(lab), (d, demo) => {
          Object.assign(lab, { summary: String(d.summary || ''), nutrition: (d.nutrition || []).map(String), lifestyle: (d.lifestyle || []).map(String), doctor: (d.doctor || []).map(String), demoText: !!demo }); store.commit(); draw(); }) }, icon('sparkles', 20), 'Объяснить результаты'));
        kidsSet(b, h('div', { class: 'stack' },
          h('div', null, h('h2', { style: 'font-size:26px;letter-spacing:-.02em;line-height:1.15;text-wrap:balance' }, lab.title), h('div', { class: 'sub', style: 'margin-top:4px' }, [App.fmtDate(lab.date, { day: 'numeric', month: 'long', year: 'numeric' }), lab.lab].filter(Boolean).join(' · ')),
            h('div', { class: 'chips', style: 'margin-top:10px' }, h('span', { class: 'chip c', style: { '--c': off.length ? 'var(--orange)' : 'var(--green)' } }, off.length ? off.length + ' вне нормы' : 'Всё в норме'), h('span', { class: 'chip' }, lab.markers.length + ' ' + App.plural(lab.markers.length, 'показатель', 'показателя', 'показателей')),
              lab.source === 'demo' || lab.demoText ? ui.demoBadge() : null)),
          lab.doctorNote ? noteBox('var(--blue)', 'doc', 'Заключение врача', lab.doctorNote) : null,
          lab.summary ? noteBox('var(--purple)', 'sparkles', 'Простыми словами', lab.summary) : aiBox,
          h('div', { class: 'list' }, lab.markers.slice().sort((a, c) => (a.status === 'normal') - (c.status === 'normal')).map((m) => h('button', { class: 'marker', type: 'button', style: 'display:block;width:100%;text-align:left', onclick: () => markerTrend(m.name) },
            h('div', { class: 'top' }, h('span', { class: 'name' }, m.name), h('span', { class: 'val', style: { color: m.status === 'normal' ? null : D.STATUS[m.status].c } }, nf(m.value, 2), h('small', null, m.unit))), rangeBar(m)))),
          (lab.nutrition || []).length ? noteBox('var(--green)', 'food', 'Питание', bullets(lab.nutrition)) : null,
          (lab.lifestyle || []).length ? noteBox('var(--teal)', 'walk', 'Образ жизни', bullets(lab.lifestyle)) : null,
          (lab.doctor || []).length ? noteBox('var(--orange)', 'person', 'Обсудить с врачом', bullets(lab.doctor)) : null,
          off.length ? h('button', { class: 'btn primary block', type: 'button', onclick: () => { s.close(); setTimeout(() => ui.mealPlanMake(), 160); } }, icon('food', 20), 'Учесть в меню') : null,
          h('button', { class: 'btn gray danger block', type: 'button', onclick: async () => { if (await App.confirm({ title: 'Удалить анализы?', text: 'Запись от ' + App.fmtDate(lab.date) + ' будет удалена.', ok: 'Удалить', danger: true })) { store.state.labs = store.state.labs.filter((l) => l.id !== id); store.commit(); s.close(); } } }, 'Удалить запись'),
          h('p', { class: 'disclaimer' }, 'Разбор помогает понять результаты и подготовить вопросы к врачу. Диагноз и лечение назначает только врач.')));
      };
      draw();
    } });
  };
  function markerTrend(name) {
    const pts = store.state.labs.slice().sort((a, b) => (a.date < b.date ? -1 : 1)).map((l) => { const m = l.markers.find((x) => x.name === name); return m ? { label: App.fmtDate(l.date, { day: 'numeric', month: 'short' }), y: m.value, m: m } : null; }).filter(Boolean);
    const lastM = pts[pts.length - 1].m, st = D.STATUS[lastM.status];
    sheet({ title: name, detent: 'auto', build: (b) => kidsAdd(b, h('div', { class: 'stack' },
      h('div', { style: 'display:flex;align-items:baseline;justify-content:space-between' }, h('div', { class: 'big' }, nf(lastM.value, 2), h('small', null, lastM.unit)), h('span', { class: 'chip c', style: { '--c': st.c } }, st.t)),
      h('div', { class: 'card' }, App.lineChart(pts, { color: 'var(--purple)', decimals: 1, band: lastM.refMin != null && lastM.refMax != null ? [lastM.refMin, lastM.refMax] : null })),
      h('p', { class: 'caption' }, pts.length > 1 ? 'Зелёная полоса — диапазон нормы. Динамика по ' + pts.length + ' анализам.' : 'Добавьте следующий анализ — здесь появится динамика показателя.'))) });
  }

  /* ---------- давление, пульс, сахар ---------- */
  ui.vitals = function (type) {
    const isBp = type === 'bp';
    const s = sheet({ title: isBp ? 'Давление и пульс' : 'Сахар крови', build: (b) => {
      const draw = () => {
        const all = store.state.vitals.filter((v) => v.type === type).sort((a, c) => (a.d < c.d ? -1 : 1)), last = all[all.length - 1];
        const pts = all.slice(-12).map((v) => ({ label: App.fmtDate(v.d, { day: 'numeric', month: 'short' }), y: isBp ? v.sys : v.value, y2: isBp ? v.dia : null }));
        const info = last ? (isBp ? calc.bpInfo(last.sys, last.dia) : calc.sugarInfo(last.value, last.fasting)) : null;
        kidsSet(b, h('div', { class: 'stack' },
          last ? h('div', { style: 'display:flex;align-items:baseline;justify-content:space-between' }, h('div', { class: 'big' }, isBp ? last.sys + '/' + last.dia : nf(last.value, 1), h('small', null, isBp ? 'мм рт. ст.' : 'ммоль/л')), h('span', { class: 'chip c', style: { '--c': info.c } }, info.t)) : null,
          all.length ? h('div', { class: 'card' }, App.lineChart(pts, { color: isBp ? 'var(--red)' : 'var(--orange)', color2: 'var(--blue)', decimals: isBp ? 0 : 1, band: isBp ? null : [3.9, 5.5] }),
            isBp ? h('div', { class: 'sub', style: 'display:flex;gap:14px;justify-content:center;margin-top:6px' }, h('span', { style: 'color:var(--red)' }, '● верхнее'), h('span', { style: 'color:var(--blue)' }, '● нижнее')) : null)
            : h('div', { class: 'empty' }, h('span', { class: 'ico soft', style: { '--c': isBp ? 'var(--red)' : 'var(--orange)' } }, icon(isBp ? 'heart' : 'drop', 30)), h('b', null, 'Пока нет измерений'), h('p', null, isBp ? 'Измеряйте давление сидя, после 5 минут покоя.' : 'Записывайте сахар натощак или через 2 часа после еды.')),
          h('button', { class: 'btn primary block', type: 'button', onclick: () => ui.vitalAdd(type, draw) }, icon('plus', 20), 'Записать измерение'),
          all.length ? h('div', { class: 'list' }, all.slice().reverse().slice(0, 20).map((v) => ui.row({ title: isBp ? v.sys + '/' + v.dia + (v.pulse ? ' · пульс ' + v.pulse : '') : nf(v.value, 1) + ' ммоль/л' + (v.fasting ? ' · натощак' : ' · после еды'), sub: App.fmtDate(v.d, { weekday: 'short', day: 'numeric', month: 'long' }),
            right: h('button', { class: 'close-x', type: 'button', 'aria-label': 'Удалить', onclick: () => { store.state.vitals = store.state.vitals.filter((x) => x.id !== v.id); store.commit(); draw(); } }, icon('xmark', 14)) }))) : null,
          h('p', { class: 'disclaimer' }, isBp ? 'Ориентиры: оптимальное ниже 120/80, повышенное — от 140/90. При давлении 180/120 и выше с головной болью, болью в груди или нарушением зрения вызывайте скорую.' : 'Ориентиры: натощак 3,9–5,5 ммоль/л, через 2 часа после еды — до 7,8.')));
      };
      draw();
    } });
  };
  ui.vitalAdd = function (type, done) {
    const isBp = type === 'bp'; let fasting = true;
    const s = sheet({ title: isBp ? 'Давление' : 'Сахар', detent: 'auto', build: (b) => {
      const big = (id, ph) => h('input', { id: id, inputmode: 'decimal', placeholder: ph, style: 'width:100%;border:0;outline:0;background:var(--card-elev);border-radius:16px;padding:14px 8px;text-align:center;font:700 34px var(--font-round)' });
      const sys = big('va-sys', '120'), dia = big('va-dia', '80'), pulse = big('va-pulse', '70'), val = big('va-val', '5,2');
      const lab = (t, el) => h('label', { style: 'flex:1;min-width:0;display:flex;flex-direction:column;gap:6px;font-size:13px;color:var(--fg-2);text-align:center' }, el, t);
      kidsAdd(b, h('div', { class: 'stack' }, isBp ? h('div', { style: 'display:flex;gap:10px' }, lab('Верхнее', sys), lab('Нижнее', dia), lab('Пульс', pulse))
        : [lab('ммоль/л', val), App.seg([{ id: 1, label: 'Натощак' }, { id: 0, label: 'После еды' }], 1, (v) => { fasting = !!v; })],
        h('button', { class: 'btn primary block', type: 'button', onclick: () => {
          let rec, warn = null;
          if (isBp) { const a = Math.round(N(sys.value)), c = Math.round(N(dia.value)), p = Math.round(N(pulse.value)); if (!(a >= 60 && a <= 280 && c >= 30 && c <= 180 && a > c)) return toast('Проверьте значения давления', { icon: 'info', color: 'var(--orange)' });
            rec = { id: uid(), type: 'bp', d: App.dkey(), sys: a, dia: c, pulse: p >= 30 && p <= 230 ? p : null }; if (a >= 180 || c >= 120) warn = 'Это очень высокое давление. Измерьте ещё раз через 5 минут в покое. Если оно сохраняется или есть головная боль, боль в груди, одышка, нарушение зрения или речи — вызывайте скорую помощь: 103 или 112.';
            else if (a < 90 || c < 60) warn = 'Давление пониженное. Если есть слабость, головокружение или обморок — обратитесь к врачу.'; }
          else { const v = N(val.value); if (!(v >= 1 && v <= 40)) return toast('Проверьте значение сахара', { icon: 'info', color: 'var(--orange)' }); rec = { id: uid(), type: 'sugar', d: App.dkey(), value: +v.toFixed(1), fasting: fasting };
            if (v < 3.0) warn = 'Сахар очень низкий. Съешьте быстрые углеводы (сок, сахар) и измерьте снова через 15 минут. При спутанности сознания вызывайте скорую: 103 или 112.'; else if (v >= 13.9) warn = 'Сахар очень высокий. Свяжитесь с врачом сегодня. При сильной жажде, тошноте, запахе ацетона или спутанности сознания вызывайте скорую: 103 или 112.'; }
          store.state.vitals.push(rec); haptic(12); store.commit(); s.close(); if (done) done();
          if (warn) setTimeout(() => sheet({ title: 'Обратите внимание', detent: 'auto', build: (wb, wapi) => kidsAdd(wb, h('div', { class: 'stack' }, noteBox('var(--red)', 'info', 'Важно', warn), h('button', { class: 'btn primary block', type: 'button', onclick: () => wapi.close() }, 'Понятно'))) }), 250);
          else toast('Записано: ' + (isBp ? rec.sys + '/' + rec.dia + ' — ' + calc.bpInfo(rec.sys, rec.dia).t.toLowerCase() : nf(rec.value, 1) + ' — ' + calc.sugarInfo(rec.value, fasting).t.toLowerCase()));
        } }, 'Сохранить')));
      setTimeout(() => (isBp ? sys : val).focus(), 450);
    } });
  };

  /* ---------- лекарства и БАДы ---------- */
  ui.meds = () => App.go('health');
  ui.medEdit = function (id) {
    const ex = id ? store.state.meds.find((m) => m.id === id) : null, m = ex ? JSON.parse(JSON.stringify(ex)) : { id: uid(), name: '', dose: '', kind: 'supp', times: ['09:00'] };
    const s = sheet({ title: ex ? 'Препарат' : 'Новый препарат', detent: 'auto', build: (b) => {
      const name = h('input', { id: 'me-name', value: m.name, placeholder: 'Например: витамин D3' }), dose = h('input', { id: 'me-dose', value: m.dose, placeholder: 'Например: 2000 МЕ' });
      const times = h('div', { class: 'list' });
      const drawT = () => kidsSet(times, ...m.times.map((t, i) => h('div', { class: 'field' }, h('label', { for: 'me-t' + i }, 'Приём ' + (i + 1)), h('input', { id: 'me-t' + i, type: 'time', value: t, onchange: (e) => { m.times[i] = e.target.value || t; } }),
        m.times.length > 1 ? h('button', { class: 'close-x', type: 'button', 'aria-label': 'Убрать время', onclick: () => { m.times.splice(i, 1); drawT(); } }, icon('xmark', 14)) : null)),
        m.times.length < 6 ? h('button', { class: 'add-line', type: 'button', onclick: () => { m.times.push('20:00'); drawT(); } }, icon('plus', 18), 'Добавить время') : null);
      drawT();
      kidsAdd(b, h('div', { class: 'stack' }, App.seg([{ id: 'supp', label: 'БАД или витамин' }, { id: 'med', label: 'Лекарство' }], m.kind, (v) => { m.kind = v; }),
        h('div', { class: 'list' }, h('div', { class: 'field' }, h('label', { for: 'me-name' }, 'Название'), name), h('div', { class: 'field' }, h('label', { for: 'me-dose' }, 'Дозировка'), dose)), times,
        h('p', { class: 'caption' }, 'Отметки о приёме появятся на экране «Сегодня». Дозировку и схему определяет врач.'),
        h('div', { class: 'btn-row' }, h('button', { class: 'btn primary', type: 'button', onclick: () => {
          m.name = name.value.trim(); m.dose = dose.value.trim(); if (!m.name) return name.focus(); m.times = Array.from(new Set(m.times)).sort();
          const list = store.state.meds, i = list.findIndex((x) => x.id === m.id); if (i >= 0) list[i] = m; else list.push(m); store.commit(); s.close(); toast('Сохранено', { icon: 'pill', color: 'var(--green)' });
        } }, 'Сохранить'), ex ? h('button', { class: 'btn gray danger', type: 'button', onclick: () => { store.state.meds = store.state.meds.filter((x) => x.id !== m.id); store.commit(); s.close(); } }, 'Удалить') : null)));
    } });
  };

  /* ---------- вода, сон, шаги, вес ---------- */
  ui.water = function () {
    sheet({ title: 'Вода', detent: 'auto', build: (b) => {
      const t = store.state.targets.water, num = h('span'), sub = h('div', { class: 'sub' });
      App.memo['w:ring'] = App.clamp(store.peek().water / t, 0, 1); App.memo['w:num'] = store.peek().water / 1000;
      const ringBox = h('div', { style: 'display:grid;place-items:center' });
      const paint = () => { const w = store.peek().water;
        kidsSet(ringBox, ring({ id: 'w:ring', size: 190, stroke: 20, value: w / t, color: 'var(--blue)', center: [h('div', { class: 'big', style: 'font-size:46px' }, App.countUp(num, w / 1000, { id: 'w:num', decimals: 2 }), h('small', null, 'л')), sub] }));
        sub.textContent = w >= t ? 'Норма выполнена' : 'ещё ' + nf((t - w) / 1000, 2) + ' л до нормы'; };
      const add = (ml) => { const d = store.day(); d.water = Math.max(0, d.water + ml); haptic(10); store.commit(); paint(); };
      paint();
      kidsAdd(b, h('div', { class: 'stack', style: 'gap:18px' }, ringBox,
        h('div', { style: 'display:grid;grid-template-columns:repeat(4,1fr);gap:8px' }, [150, 250, 330, 500].map((ml) => h('button', { class: 'btn tinted', type: 'button', style: '--accent:var(--blue);padding:0;flex-direction:column;gap:0;min-height:58px', onclick: () => add(ml) }, h('span', { class: 'num' }, '+' + ml), h('span', { style: 'font-size:11px;font-weight:500;opacity:.8' }, 'мл')))),
        h('button', { class: 'btn gray block', type: 'button', onclick: () => add(-250) }, 'Убрать 250 мл'),
        h('p', { class: 'caption', style: 'text-align:center' }, 'Норма ' + nf(t / 1000, 1) + ' л рассчитана по весу: 30 мл на килограмм.')));
    } });
  };
  ui.sleep = function () {
    let v = store.peek().sleep != null ? store.peek().sleep : 7.5;
    const s = sheet({ title: 'Сон прошлой ночью', detent: 'auto', build: (b) => kidsAdd(b, h('div', { class: 'stack' },
      App.ruler({ min: 0, max: 14, step: 0.25, decimals: 2, major: 4, value: v, unit: ' ч', label: 'Сон', onChange: (x) => { v = x; } }),
      h('p', { class: 'caption', style: 'text-align:center' }, 'Взрослым обычно нужно 7–9 часов сна.'),
      h('button', { class: 'btn primary block', type: 'button', onclick: () => { store.day().sleep = v; haptic(10); store.commit(); s.close(); toast('Сон записан: ' + nf(v, 2) + ' ч', { icon: 'moon', color: 'var(--indigo)' }); } }, 'Сохранить'))) });
  };
  ui.steps = function () {
    const s = sheet({ title: 'Шаги сегодня', detent: 'auto', build: (b) => {
      const inp = h('input', { id: 'st-val', inputmode: 'numeric', placeholder: '0', value: store.peek().steps != null ? store.peek().steps : '', style: 'width:100%;border:0;outline:0;background:var(--card-elev);border-radius:16px;padding:14px;text-align:center;font:700 40px var(--font-round)' });
      kidsAdd(b, h('div', { class: 'stack' }, inp, h('div', { class: 'chips', style: 'justify-content:center' }, [1000, 2500, 5000].map((n) => h('button', { class: 'pillbtn', type: 'button', onclick: () => { inp.value = Math.round(N(inp.value)) + n; haptic(6); } }, '+' + nf(n)))),
        h('p', { class: 'caption', style: 'text-align:center' }, 'Посмотрите число в приложении «Здоровье» на телефоне или на часах. Автоматический импорт появится в версии для App Store и Google Play.'),
        h('button', { class: 'btn primary block', type: 'button', onclick: () => { const v = Math.round(N(inp.value)); if (v < 0 || v > 150000) return inp.focus(); store.day().steps = v; haptic(10); store.commit(); s.close(); toast('Шаги записаны: ' + nf(v), { icon: 'walk', color: 'var(--green)' }); } }, 'Сохранить')));
      setTimeout(() => inp.focus(), 450);
    } });
  };
  ui.weight = function () {
    const st = store.state, p = st.profile; let v = p.weight;
    const s = sheet({ title: 'Вес', build: (b) => {
      const w = st.weights.slice().sort((a, c) => (a.d < c.d ? -1 : 1)), pts = w.slice(-14).map((x) => ({ label: App.fmtDate(x.d, { day: 'numeric', month: 'short' }), y: x.kg }));
      const toGo = p.targetWeight && p.goal !== 'keep' ? p.weight - p.targetWeight : null;
      kidsAdd(b, h('div', { class: 'stack' },
        App.ruler({ min: 35, max: 200, step: 0.1, decimals: 1, value: v, unit: ' кг', label: 'Вес', onChange: (x) => { v = x; } }),
        h('button', { class: 'btn primary block', type: 'button', onclick: () => {
          st.weights = st.weights.filter((x) => x.d !== App.dkey()); st.weights.push({ d: App.dkey(), kg: v }); p.weight = v; st.targets = calc.targets(p);
          haptic(12); store.commit(); s.close(); toast('Вес записан: ' + nf(v, 1) + ' кг', { icon: 'scale', color: 'var(--purple)' });
        } }, 'Записать вес на сегодня'),
        toGo != null ? h('div', { class: 'chips', style: 'justify-content:center' }, h('span', { class: 'chip c', style: { '--c': 'var(--purple)' } }, icon('target', 13), Math.abs(toGo) < 0.1 ? 'Цель достигнута' : 'До цели ' + nf(Math.abs(toGo), 1) + ' кг')) : null,
        pts.length > 1 ? h('div', { class: 'card' }, App.lineChart(pts, { color: 'var(--purple)', decimals: 1 })) : h('p', { class: 'caption', style: 'text-align:center' }, 'Взвешивайтесь раз в несколько дней — здесь появится график.'),
        h('p', { class: 'caption', style: 'text-align:center' }, 'После записи калории и БЖУ пересчитаются под новый вес.')));
    } });
  };
})();
