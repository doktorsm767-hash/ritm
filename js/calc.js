/* Ритм — расчёты: обмен веществ, калории, БЖУ, нормы. */
(function () {
  'use strict';
  const App = window.App;

  const ACTIVITY = [
    { id: 1.2, t: 'Сидячий образ жизни', d: 'Работа за столом, мало ходьбы' },
    { id: 1.375, t: 'Лёгкая активность', d: 'Прогулки или 1–3 тренировки в неделю' },
    { id: 1.55, t: 'Умеренная активность', d: '3–5 тренировок в неделю' },
    { id: 1.725, t: 'Высокая активность', d: 'Интенсивные тренировки 6–7 раз в неделю' },
    { id: 1.9, t: 'Очень высокая', d: 'Физическая работа и спорт каждый день' }
  ];
  const GOALS = [
    { id: 'lose', t: 'Похудеть', d: 'Дефицит калорий, больше белка, чтобы сохранить мышцы', icon: 'down', c: 'var(--blue)' },
    { id: 'keep', t: 'Поддерживать вес', d: 'Баланс калорий и сбалансированные БЖУ', icon: 'target', c: 'var(--green)' },
    { id: 'gain', t: 'Набрать массу', d: 'Умеренный профицит и силовые тренировки', icon: 'up', c: 'var(--orange)' }
  ];

  const age = (p) => new Date().getFullYear() - p.birthYear;
  // Миффлин — Сан Жеор
  const bmr = (p) => 10 * p.weight + 6.25 * p.height - 5 * age(p) + (p.sex === 'm' ? 5 : -161);
  const tdee = (p) => bmr(p) * (p.activity || 1.375);
  const bmi = (p) => { const m = p.height / 100; return p.weight / (m * m); };
  const bmiInfo = (v) => v < 18.5 ? { t: 'Ниже нормы', c: 'var(--blue)' } : v < 25 ? { t: 'Норма', c: 'var(--green)' } : v < 30 ? { t: 'Выше нормы', c: 'var(--orange)' } : { t: 'Ожирение', c: 'var(--red)' };

  function targets(p) {
    const B = bmr(p), T = tdee(p), pace = p.pace || 0.5;
    let delta = 0, guard = null;
    // защита: подросткам и людям с дефицитом массы тела дефицит калорий не назначаем
    if (p.goal === 'lose' && age(p) < 18) guard = 'minor';
    else if (p.goal === 'lose' && bmi(p) < 18.5) guard = 'underweight';
    if (p.goal === 'lose' && !guard) delta = -Math.min((pace * 7700) / 7, T * 0.25);
    if (p.goal === 'gain') delta = Math.min((pace * 7700) / 7, T * 0.2);
    let kcal = T + delta, limited = false;
    const floor = p.sex === 'm' ? 1500 : 1200;   // ниже — только под наблюдением врача
    if (kcal < floor) { kcal = floor; limited = true; }
    kcal = Math.round(kcal / 10) * 10;
    // при ИМТ > 30 считаем белок и жир от «скорректированного» веса
    const m = p.height / 100, ref = bmi(p) > 30 ? 27 * m * m : p.weight;
    const pk = p.goal === 'keep' ? 1.4 : 1.8;
    let fk = p.goal === 'lose' ? 0.8 : p.goal === 'gain' ? 1.0 : 0.9;
    let prot = Math.round(pk * ref);
    let fat = Math.round(App.clamp(fk * ref, (kcal * 0.2) / 9, (kcal * 0.35) / 9));
    let carb = Math.round((kcal - prot * 4 - fat * 9) / 4);
    if (carb < 90) { fat = Math.round(Math.max(0.6 * ref, (kcal * 0.2) / 9)); carb = Math.round((kcal - prot * 4 - fat * 9) / 4); }
    if (carb < 50) { carb = 50; prot = Math.max(60, Math.round((kcal - fat * 9 - carb * 4) / 4)); }
    return {
      kcal: kcal, p: prot, f: fat, c: carb,
      water: App.clamp(Math.round((p.weight * 30) / 50) * 50, 1500, 3500),
      steps: p.goal === 'lose' ? 10000 : 8000, sleep: 8,
      bmr: Math.round(B), tdee: Math.round(T), delta: Math.round(kcal - T), limited: limited, guard: guard
    };
  }
  // реальный темп, кг/нед, и срок до цели
  function forecast(p, t) {
    if (!p.targetWeight || p.goal === 'keep') return null;
    const rate = Math.abs(t.delta) * 7 / 7700;
    const diff = Math.abs(p.weight - p.targetWeight);
    if (rate < 0.05 || diff < 0.1) return null;
    const weeks = Math.ceil(diff / rate), d = new Date(); d.setDate(d.getDate() + weeks * 7);
    return { rate: rate, weeks: weeks, date: d };
  }
  function sumFood(list) {
    const s = { kcal: 0, p: 0, f: 0, c: 0 };
    (list || []).forEach((x) => { s.kcal += +x.kcal || 0; s.p += +x.p || 0; s.f += +x.f || 0; s.c += +x.c || 0; });
    return s;
  }
  // пересчёт продукта «на 100 г» в порцию
  const portion = (per100, grams) => ({
    kcal: Math.round(((per100.kcal || 0) * grams) / 100), p: +(((per100.p || 0) * grams) / 100).toFixed(1),
    f: +(((per100.f || 0) * grams) / 100).toFixed(1), c: +(((per100.c || 0) * grams) / 100).toFixed(1)
  });

  // оценка давления (ориентиры ESC/ESH), пульса, сахара
  function bpInfo(sys, dia) {
    if (sys < 90 || dia < 60) return { t: 'Пониженное', c: 'var(--blue)' };
    if (sys < 120 && dia < 80) return { t: 'Оптимальное', c: 'var(--green)' };
    if (sys < 130 && dia < 85) return { t: 'Нормальное', c: 'var(--green)' };
    if (sys < 140 && dia < 90) return { t: 'Высокое нормальное', c: 'var(--yellow)' };
    if (sys < 160 && dia < 100) return { t: 'Повышенное', c: 'var(--orange)' };
    return { t: 'Высокое', c: 'var(--red)' };
  }
  const pulseInfo = (v) => v < 50 ? { t: 'Низкий', c: 'var(--blue)' } : v <= 90 ? { t: 'В норме', c: 'var(--green)' } : v <= 100 ? { t: 'Учащённый', c: 'var(--orange)' } : { t: 'Высокий', c: 'var(--red)' };
  function sugarInfo(v, fasting) {
    if (v < 3.9) return { t: 'Низкий', c: 'var(--blue)' };
    if (fasting ? v <= 5.5 : v <= 7.8) return { t: 'В норме', c: 'var(--green)' };
    if (fasting ? v < 7.0 : v < 11.1) return { t: 'Повышен', c: 'var(--orange)' };
    return { t: 'Высокий', c: 'var(--red)' };
  }

  App.calc = { ACTIVITY, GOALS, age, bmr, tdee, bmi, bmiInfo, targets, forecast, sumFood, portion, bpInfo, pulseInfo, sugarInfo };
})();
