/* Ритм — тренер: анимированный персонаж показывает технику упражнений.
   Персонаж и все позы нарисованы с нуля: скелет из 2D-суставов, позы задаются углами, движение — интерполяция
   между ключевыми позами с плавным замедлением. Углы: dir(a) = (sin a, cos a), ось y вниз:
   0 — вниз, 90 — вперёд (персонаж смотрит вправо), 180 — вверх, 270 — назад. */
(function () {
  'use strict';
  const App = window.App;
  const L = { T: 44, NK: 14, HR: 10, UA: 30, FA: 27, TH: 36, SH: 36, FT: 12 };
  const PAD = { hip: 7, sh: 7, head: L.HR, el: 4, ha: 3, kn: 5, an: 4, to: 2 };   // толщина тела для касания пола
  const FLOOR = 168, CX = 120;
  const rad = Math.PI / 180;
  const dir = (a) => [Math.sin(a * rad), Math.cos(a * rad)];
  const add = (p, a, len) => { const d = dir(a); return [p[0] + d[0] * len, p[1] + d[1] * len]; };
  const lerpA = (a, b, k) => a + ((((b - a) % 360) + 540) % 360 - 180) * k;   // кратчайший путь по углу
  const ease = (k) => 0.5 - Math.cos(Math.PI * k) / 2;

  /* ---------- позы ---------- */
  const S0 = { T: 180, ua: 4, fa: 8, t: 0, s: 0 };
  const P = (o) => Object.assign({}, S0, o);
  const ANIMS = {
    squat: { focus: ['TH', 'SH'], labels: ['Исходное положение', 'Таз назад и вниз'],
      kf: [P({ ua: 6, fa: 6 }), P({ T: 140, ua: 92, fa: 90, t: 84, s: -24 })] },
    squat_bar: { focus: ['TH', 'SH'], props: ['barback'], labels: ['Штанга на трапециях', 'Присед до параллели'],
      kf: [P({ T: 178, ua: 330, fa: 150 }), P({ T: 142, ua: 295, fa: 115, t: 84, s: -24 })] },
    lunge: { focus: ['TH', 'SH'], labels: ['Ноги вместе', 'Шаг назад, колено к полу'],
      kf: [P({}), P({ t: 76, s: 2, t2: 345, s2: 273, f2: 15 })] },
    bridge: { focus: ['T', 'TH'], anchor: 'an', labels: ['Лёжа, стопы у таза', 'Таз вверх, сожмите ягодицы'],
      kf: [{ T: 270, H: 270, ua: 90, fa: 90, t: 148, s: 12 }, { T: 300, H: 270, ua: 90, fa: 90, t: 100, s: 12 }] },
    plank: { focus: ['T'], anchor: 'ha', dur: 4.2, labels: ['Тело — прямая линия', 'Держите и дышите'],
      kf: [{ T: 101, ua: 0, fa: 90, t: 281, s: 281, f: 0 }, { T: 102, ua: 0, fa: 90, t: 282, s: 282, f: 0 }] },
    side_plank: { focus: ['T'], anchor: 'ha2', dur: 4.2, labels: ['Упор на предплечье', 'Таз вверх, держите'],
      kf: [{ T: 101, ua: 180, fa: 180, ua2: 0, fa2: 90, t: 281, s: 281, f: 0 }, { T: 104, ua: 182, fa: 182, ua2: 0, fa2: 90, t: 284, s: 284, f: 0 }] },
    pushup: { focus: ['UA', 'FA', 'T'], anchor: 'ha', labels: ['Упор лёжа', 'Грудь к полу'],
      kf: [{ T: 113, ua: 0, fa: 0, t: 293, s: 293, f: 0 }, { T: 97, ua: 297.5, fa: 65.4, t: 277, s: 277, f: 0 }] },
    dips: { focus: ['UA', 'FA'], anchor: 'ha', props: ['chair'], labels: ['Руки на опоре сзади', 'Опуститесь, локти назад'],
      kf: [{ T: 180, ua: 345, fa: 345, t: 75, s: 75 }, { T: 180, ua: 297.4, fa: 27.8, t: 89.5, s: 89.5 }] },
    superman: { focus: ['T'], anchor: 'hip', labels: ['Лёжа на животе', 'Руки и ноги вверх'],
      kf: [{ T: 90, H: 90, ua: 90, fa: 90, t: 270, s: 270, f: 270 }, { T: 99, H: 100, ua: 104, fa: 106, t: 261, s: 258, f: 258 }] },
    burpee: { focus: ['TH', 'T', 'UA'], dur: 1.7, labels: ['Стойка', 'Присед, руки в пол', 'Прыжок в планку', 'Ноги к рукам', 'Прыжок вверх'],
      kf: [P({}), P({ T: 118, ua: 25, fa: 10, t: 95, s: -30, anchor: 'an', keep: true }),
        { T: 113, ua: 0, fa: 0, t: 293, s: 293, f: 0, anchor: 'ha', keep: true },
        P({ T: 118, ua: 25, fa: 10, t: 95, s: -30, anchor: 'ha', keep: true }),
        P({ ua: 175, fa: 178, f: 40, anchor: 'an', keep: true, lift: -14 })] },
    jack: { front: true, focus: ['TH', 'SH', 'UA'], anchor: 'hip', dur: 1.3, labels: ['Ноги вместе', 'Прыжок: ноги врозь, руки вверх'],
      kf: [P({ ua: 12, fa: 8, t: 3, s: 3 }), P({ ua: 160, fa: 172, t: 16, s: 16, lift: -8 })] },
    crunch: { focus: ['T'], anchor: 'hip', labels: ['Лёжа, колени согнуты', 'Лопатки от пола, выдох'],
      kf: [{ T: 270, H: 270, ua: 90, fa: 90, t: 148, s: 12 }, { T: 240, H: 228, ua: 115, fa: 105, t: 148, s: 12 }] },
    leg_press: { focus: ['TH', 'SH'], anchor: 'hip', props: ['seat', 'platform'], labels: ['Колени к груди', 'Выжмите платформу'],
      kf: [{ T: 228, H: 215, ua: 20, fa: 80, t: 145, s: 95, f: 180 }, { T: 228, H: 215, ua: 20, fa: 80, t: 118, s: 116, f: 206 }] },
    rdl: { focus: ['TH', 'T'], props: ['bar'], labels: ['Штанга у бёдер', 'Таз назад, спина прямая'],
      kf: [P({ ua: 0, fa: 0 }), P({ T: 96, H: 105, ua: 0, fa: 0, t: 12, s: -6 })] },
    leg_curl: { focus: ['TH', 'SH'], anchor: 'hip', fy: 128, props: ['padlegs'], labels: ['Лёжа, ноги прямые', 'Пятки к ягодицам'],
      kf: [{ T: 90, H: 95, ua: 25, fa: 80, t: 270, s: 270, f: 250 }, { T: 90, H: 95, ua: 25, fa: 80, t: 272, s: 190, f: 120 }] },
    bench: { focus: ['UA', 'FA', 'T'], anchor: 'hip', props: ['pad', 'bar'], labels: ['Штанга над плечами', 'Опустите к низу груди'],
      kf: [{ T: 270, H: 270, ua: 180, fa: 180, t: 62, s: 0 }, { T: 270, H: 270, ua: 65, fa: 170, t: 62, s: 0 }] },
    incline: { focus: ['UA', 'FA', 'T'], anchor: 'hip', props: ['pad', 'db'], labels: ['Гантели у груди', 'Выжмите вверх'],
      kf: [{ T: 228, H: 215, ua: 20, fa: 165, t: 92, s: 0 }, { T: 228, H: 215, ua: 150, fa: 150, t: 92, s: 0 }] },
    shoulder_press: { focus: ['UA', 'FA'], anchor: 'hip', props: ['box', 'db'], labels: ['Гантели у плеч', 'Выжмите над головой'],
      kf: [{ T: 180, ua: 20, fa: 178, t: 88, s: 2 }, { T: 180, ua: 176, fa: 178, t: 88, s: 2 }] },
    lateral: { front: true, focus: ['UA'], anchor: 'hip', props: ['db'], labels: ['Гантели у бёдер', 'Руки в стороны до плеч'],
      kf: [P({ ua: 8, fa: 6, t: 3, s: 3 }), P({ ua: 84, fa: 88, t: 3, s: 3 })] },
    pushdown: { focus: ['FA'], props: ['cable_top'], labels: ['Локти прижаты', 'Разогните руки вниз'],
      kf: [P({ T: 172, ua: 6, fa: 150 }), P({ T: 172, ua: 6, fa: 12 })] },
    pulldown: { focus: ['UA', 'T'], anchor: 'hip', props: ['box', 'cable_up'], labels: ['Руки вверху', 'Гриф к груди'],
      kf: [{ T: 180, ua: 172, fa: 176, t: 88, s: 4 }, { T: 172, ua: 12, fa: 168, t: 88, s: 4 }] },
    bent_row: { focus: ['UA', 'T'], props: ['bar'], labels: ['Наклон, руки прямые', 'Тяга к поясу'],
      kf: [P({ T: 118, H: 110, ua: 0, fa: 0, t: 22, s: -12 }), P({ T: 118, H: 110, ua: 288, fa: 72, t: 22, s: -12 })] },
    seated_row: { focus: ['UA', 'T'], anchor: 'hip', props: ['cable_front'], labels: ['Руки вперёд', 'Локти назад, лопатки вместе'],
      kf: [{ T: 172, ua: 90, fa: 90, t: 86, s: 88, f: 175 }, { T: 186, ua: 288, fa: 84, t: 86, s: 88, f: 175 }] },
    hyper: { focus: ['T'], anchor: 'to', props: ['padhyper'], labels: ['Корпус внизу', 'Поднимитесь до прямой линии'],
      kf: [{ T: 55, H: 55, ua: 235, fa: 95, t: 312, s: 312, f: 40 }, { T: 132, H: 132, ua: 330, fa: 150, t: 312, s: 312, f: 40 }] },
    curl: { focus: ['FA'], props: ['db'], labels: ['Руки прямые', 'Согните к плечам'],
      kf: [P({ ua: 4, fa: 4 }), P({ ua: 12, fa: 162 })] },
    calf: { focus: ['SH'], labels: ['Стопы на полу', 'Подъём на носки'],
      kf: [P({}), P({ f: 40 })] },
    march: { focus: ['TH'], anchor: 'hip', dur: 1.6, labels: ['Колено вверх', 'Смена ноги'],
      kf: [P({ ua: 30, fa: 60, ua2: 330, fa2: 350, t: 85, s: 0, t2: 0, s2: 0 }), P({ ua: 330, fa: 350, ua2: 30, fa2: 60, t: 0, s: 0, t2: 85, s2: 0 })] }
  };

  /* ---------- подсказки по технике ---------- */
  const C = (steps, errs, breath) => ({ steps, errs, breath });
  const CUES = {
    squat: C(['Стопы на ширине плеч, носки чуть развёрнуты.', 'Отводите таз назад, будто садитесь на стул.', 'Опуститесь до параллели бёдер с полом и встаньте, толкаясь пятками.'],
      ['Колени заваливаются внутрь.', 'Пятки отрываются от пола.'], 'Вниз — вдох, вверх — выдох.'),
    squat_bar: C(['Штанга на трапециях, лопатки сведены.', 'Таз назад и вниз, спина сохраняет естественный прогиб.', 'Встаньте, толкаясь всей стопой.'],
      ['Круглая спина в нижней точке.', 'Колени уходят внутрь.'], 'Вдох перед опусканием, выдох после трудной точки.'),
    lunge: C(['Встаньте прямо, руки на поясе.', 'Шагните назад и опустите заднее колено почти до пола.', 'Вернитесь, толкаясь пяткой передней ноги.'],
      ['Переднее колено уходит далеко за носок.', 'Корпус заваливается вперёд.'], 'Вниз — вдох, вверх — выдох.'),
    bridge: C(['Лягте на спину, стопы близко к тазу.', 'Поднимите таз до прямой линии от плеч до коленей.', 'Задержитесь на секунду и плавно опуститесь.'],
      ['Прогиб в пояснице вместо работы ягодиц.', 'Опора на носки вместо пяток.'], 'Вверх — выдох, вниз — вдох.'),
    plank: C(['Локти под плечами, предплечья на полу.', 'Тело — прямая линия от головы до пяток.', 'Напрягите пресс и ягодицы, держите время.'],
      ['Провисший таз.', 'Задранный вверх таз.'], 'Дышите ровно, не задерживайте дыхание.'),
    side_plank: C(['Лягте на бок, локоть под плечом.', 'Поднимите таз, тело — прямая линия.', 'Держите, затем смените сторону.'],
      ['Таз проваливается к полу.', 'Плечо уходит к уху.'], 'Ровное дыхание.'),
    pushup: C(['Ладони чуть шире плеч, тело прямое.', 'Опуститесь грудью к полу, локти под углом 45°.', 'Выжмите себя вверх, не теряя прямой линии.'],
      ['Провисает поясница.', 'Локти разведены в стороны под 90°.'], 'Вниз — вдох, вверх — выдох.'),
    dips: C(['Ладони на краю опоры за спиной, ноги вперёд.', 'Согните руки, опуская таз вниз, локти назад.', 'Разогните руки, поднимая тело.'],
      ['Локти расходятся в стороны.', 'Плечи поднимаются к ушам.'], 'Вниз — вдох, вверх — выдох.'),
    superman: C(['Лягте на живот, руки вытянуты вперёд.', 'Одновременно поднимите руки, грудь и ноги.', 'Задержитесь на 1–2 секунды и опуститесь.'],
      ['Резкий рывок вместо плавного подъёма.', 'Голова сильно запрокинута.'], 'Вверх — выдох, вниз — вдох.'),
    burpee: C(['Присядьте и поставьте ладони на пол.', 'Прыжком отведите ноги назад в планку.', 'Верните ноги к рукам и выпрыгните вверх.'],
      ['Провисшая поясница в планке.', 'Приземление на прямые ноги.'], 'Дышите в ритме движения, не задерживайте дыхание.'),
    jack: C(['Ноги вместе, руки вдоль тела.', 'Прыжком разведите ноги и поднимите руки над головой.', 'Прыжком вернитесь в исходное положение.'],
      ['Приземление на пятки.', 'Прямые колени при приземлении.'], 'Дышите свободно и ритмично.'),
    crunch: C(['Лягте на спину, колени согнуты, стопы на полу.', 'Оторвите лопатки от пола за счёт пресса.', 'Плавно вернитесь, не опуская голову полностью.'],
      ['Тянете голову руками.', 'Отрываете поясницу от пола.'], 'Вверх — выдох, вниз — вдох.'),
    leg_press: C(['Спина и таз прижаты к спинке.', 'Опустите платформу, сгибая колени к груди.', 'Выжмите платформу, не выпрямляя колени до конца.'],
      ['Таз отрывается от сиденья.', 'Колени «защёлкиваются» в верхней точке.'], 'Вниз — вдох, вверх — выдох.'),
    rdl: C(['Штанга у бёдер, колени слегка согнуты.', 'Отводите таз назад, штанга скользит по ногам.', 'Почувствуйте растяжение бедра сзади и вернитесь.'],
      ['Круглая спина.', 'Штанга уходит далеко от ног.'], 'Вниз — вдох, вверх — выдох.'),
    leg_curl: C(['Лягте на тренажёр, валик над пятками.', 'Согните ноги, подтягивая пятки к ягодицам.', 'Медленно верните ноги.'],
      ['Таз поднимается от скамьи.', 'Рывковое движение.'], 'Сгибание — выдох, разгибание — вдох.'),
    bench: C(['Лопатки сведены, стопы на полу.', 'Опустите штангу к низу груди.', 'Выжмите вверх по небольшой дуге к плечам.'],
      ['Таз отрывается от скамьи.', 'Штанга отбивается от груди.'], 'Вниз — вдох, вверх — выдох.'),
    incline: C(['Скамья под углом 30–45°, гантели у груди.', 'Выжмите гантели вверх.', 'Медленно опустите до уровня груди.'],
      ['Слишком большой угол скамьи.', 'Гантели стукаются вверху.'], 'Вниз — вдох, вверх — выдох.'),
    shoulder_press: C(['Сядьте прямо, гантели у плеч.', 'Выжмите гантели над головой.', 'Опустите до уровня ушей.'],
      ['Сильный прогиб в пояснице.', 'Неполная амплитуда.'], 'Вверх — выдох, вниз — вдох.'),
    lateral: C(['Гантели у бёдер, локти чуть согнуты.', 'Поднимите руки в стороны до уровня плеч.', 'Медленно опустите.'],
      ['Раскачка корпусом.', 'Плечи тянутся к ушам.'], 'Вверх — выдох, вниз — вдох.'),
    pushdown: C(['Локти прижаты к корпусу.', 'Разогните руки вниз до конца.', 'Верните рукоять до уровня груди.'],
      ['Локти уходят вперёд.', 'Наклон всем корпусом.'], 'Вниз — выдох, вверх — вдох.'),
    pulldown: C(['Возьмитесь за гриф шире плеч.', 'Тяните гриф к верху груди, сводя лопатки.', 'Плавно верните руки вверх.'],
      ['Тяга за голову.', 'Сильное отклонение назад.'], 'Вниз — выдох, вверх — вдох.'),
    bent_row: C(['Наклонитесь вперёд, спина прямая.', 'Тяните штангу к поясу, локти назад.', 'Опустите, не округляя спину.'],
      ['Круглая спина.', 'Рывок корпусом.'], 'Тяга — выдох, опускание — вдох.'),
    seated_row: C(['Сядьте прямо, руки вперёд.', 'Тяните рукоять к животу, сводя лопатки.', 'Плавно верните руки.'],
      ['Раскачка корпусом.', 'Плечи тянутся вверх.'], 'Тяга — выдох, возврат — вдох.'),
    hyper: C(['Валик под тазом, руки на груди.', 'Опустите корпус вниз с прямой спиной.', 'Поднимитесь до прямой линии тела.'],
      ['Переразгибание в пояснице вверху.', 'Рывок вместо плавного подъёма.'], 'Вверх — выдох, вниз — вдох.'),
    curl: C(['Локти прижаты к корпусу.', 'Согните руки, поднимая гантели к плечам.', 'Медленно опустите.'],
      ['Раскачка корпусом.', 'Локти уходят вперёд.'], 'Вверх — выдох, вниз — вдох.'),
    calf: C(['Встаньте прямо, стопы на ширине таза.', 'Поднимитесь на носки как можно выше.', 'Медленно опуститесь.'],
      ['Слишком быстрые повторы.', 'Неполная амплитуда.'], 'Вверх — выдох, вниз — вдох.'),
    march: C(['Встаньте прямо.', 'Поднимайте колени поочерёдно до уровня таза.', 'Работайте руками в такт.'],
      ['Сутулая спина.', 'Слишком низкое колено.'], 'Дышите ритмично.')
  };

  // название упражнения → анимация (по ключевым словам, самые точные — первыми)
  const MAP = [
    [/боков.*планк/, 'side_plank'], [/планк/, 'plank'], [/болгар|выпад/, 'lunge'],
    [/(присед|squat).*(штанг|фронт)|(штанг|фронт).*присед/, 'squat_bar'], [/присед|гоблет|squat/, 'squat'],
    [/ягодичн|мост/, 'bridge'], [/носк|икр/, 'calf'], [/обратн.*отжим|от стул|от скам|брус/, 'dips'], [/отжим/, 'pushup'],
    [/супермен|лодочк/, 'superman'], [/берпи/, 'burpee'], [/джек|jumping|звёздочк|звездочк/, 'jack'],
    [/скручив|пресс|crunch|велосипед/, 'crunch'], [/жим ног/, 'leg_press'], [/румын|станов|мёртв|мертв/, 'rdl'],
    [/сгибан.*ног|бицепс бедр/, 'leg_curl'], [/наклонн.*жим|жим.*наклонн/, 'incline'], [/жим.*(лёж|леж)/, 'bench'],
    [/жим.*(сид|сто|над голов)|армейск/, 'shoulder_press'], [/развед|махи/, 'lateral'], [/разгиб|трицепс|французск/, 'pushdown'],
    [/тяга верхн|подтяг|вертикальн/, 'pulldown'], [/тяга.*наклон|тяга гантел/, 'bent_row'], [/тяга нижн|горизонтальн/, 'seated_row'],
    [/гиперэкст/, 'hyper'], [/бицепс|сгибан.*рук|молот/, 'curl']
  ];
  const find = (name) => { const n = String(name || '').toLowerCase(); for (const m of MAP) if (m[0].test(n)) return m[1]; return 'march'; };

  /* ---------- кинематика ---------- */
  const DEF = ['T', 'H', 'ua', 'fa', 'ua2', 'fa2', 't', 's', 't2', 's2', 'f', 'f2', 'lift'];
  function norm(p) {
    const q = Object.assign({ f: 90, lift: 0 }, p);
    if (q.H == null) q.H = q.T;
    ['ua', 'fa', 't', 's', 'f'].forEach((k) => { if (q[k + '2'] == null) q[k + '2'] = q[k]; });
    return q;
  }
  function fk(p, front) {
    const hip = [0, 0], sh = add(hip, p.T, L.T), head = add(sh, p.H, L.NK);
    const mir = (a) => (front ? 360 - a : a);
    const sh1 = front ? [sh[0] + 13, sh[1]] : sh, sh2 = front ? [sh[0] - 13, sh[1]] : sh;
    const hp1 = front ? [7, 0] : hip, hp2 = front ? [-7, 0] : hip;
    const el = add(sh1, p.ua, L.UA), ha = add(el, p.fa, L.FA);
    const el2 = add(sh2, mir(p.ua2), L.UA), ha2 = add(el2, mir(p.fa2), L.FA);
    const kn = add(hp1, p.t, L.TH), an = add(kn, p.s, L.SH), to = add(an, p.f, front ? 4 : L.FT);
    const kn2 = add(hp2, mir(p.t2), L.TH), an2 = add(kn2, mir(p.s2), L.SH), to2 = add(an2, mir(p.f2), front ? 4 : L.FT);
    return { hip, sh, head, sh1, sh2, hp1, hp2, el, ha, el2, ha2, kn, an, to, kn2, an2, to2 };
  }
  const BOTTOM = [['hip', 'hip'], ['sh', 'sh'], ['head', 'head'], ['el', 'el'], ['ha', 'ha'], ['el2', 'el'], ['ha2', 'ha'], ['kn', 'kn'], ['an', 'an'], ['to', 'to'], ['kn2', 'kn'], ['an2', 'an'], ['to2', 'to']];
  const lowest = (J) => { let m = -1e9; for (const b of BOTTOM) m = Math.max(m, J[b[0]][1] + PAD[b[1]]); return m; };

  // подготовка анимации: позы с умолчаниями, положение корня по опорной точке, центрирование
  const cache = {};
  function prep(id) {
    if (cache[id]) return cache[id];
    const a = ANIMS[id] || ANIMS.march, fy = a.fy || FLOOR;
    let prevW = null;
    const kf = a.kf.map((raw) => {
      const p = norm(raw), J = fk(p, a.front), anc = raw.anchor || a.anchor || 'an';
      const dy = fy - lowest(J);
      let rootX = 0;
      if (raw.keep && prevW) rootX = prevW[anc][0] - J[anc][0];
      const W = {}; for (const k in J) W[k] = [J[k][0] + rootX, J[k][1] + dy];
      prevW = W;
      return { p, rootX, W };
    });
    let mn = 1e9, mx = -1e9;
    kf.forEach((k) => { for (const n in k.W) { mn = Math.min(mn, k.W[n][0]); mx = Math.max(mx, k.W[n][0]); } });
    const shift = CX - (mn + mx) / 2;
    kf.forEach((k) => { k.rootX += shift; for (const n in k.W) k.W[n][0] += shift; });
    return (cache[id] = { id, a, kf, fy, W0: kf[0].W });
  }

  /* ---------- отрисовка ---------- */
  const NS = 'http://www.w3.org/2000/svg';
  const el = (tag, attrs, parent) => { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); if (parent) parent.appendChild(e); return e; };
  const line = (e, a, b) => { e.setAttribute('x1', a[0].toFixed(1)); e.setAttribute('y1', a[1].toFixed(1)); e.setAttribute('x2', b[0].toFixed(1)); e.setAttribute('y2', b[1].toFixed(1)); };
  const perp = (a, b) => { let dx = b[0] - a[0], dy = b[1] - a[1]; const l = Math.hypot(dx, dy) || 1; dx /= l; dy /= l; let n = [-dy, dx]; if (n[1] < 0 || (n[1] === 0 && n[0] < 0)) n = [dy, -dx]; return n; };

  // объёмные формы: «капсула» между двумя суставами с разными радиусами
  const f1 = (v) => v.toFixed(1);
  // окружность; sw — направление обхода (должно совпадать с контуром, иначе при наложении появляется дыра)
  const circ = (c, r, sw) => { const f = sw ? '1' : '0'; return 'M' + f1(c[0] - r) + ' ' + f1(c[1]) + 'a' + f1(r) + ' ' + f1(r) + ' 0 1 ' + f + ' ' + f1(2 * r) + ' 0a' + f1(r) + ' ' + f1(r) + ' 0 1 ' + f + ' ' + f1(-2 * r) + ' 0Z'; };
  const cw = (pts) => { let a = 0; for (let i = 0; i < pts.length; i++) { const p = pts[i], q = pts[(i + 1) % pts.length]; a += p[0] * q[1] - q[0] * p[1]; } return a > 0; };
  function capsule(A, B, rA, rB) {
    let dx = B[0] - A[0], dy = B[1] - A[1]; const l = Math.hypot(dx, dy) || 1; dx /= l; dy /= l;
    const nx = -dy, ny = dx;
    const q = [[A[0] + nx * rA, A[1] + ny * rA], [B[0] + nx * rB, B[1] + ny * rB], [B[0] - nx * rB, B[1] - ny * rB], [A[0] - nx * rA, A[1] - ny * rA]], sw = cw(q);
    return 'M' + q.map((p) => f1(p[0]) + ' ' + f1(p[1])).join('L') + 'Z' + circ(A, rA, sw) + circ(B, rB, sw);
  }
  // плавный контур по точкам (квадратичные кривые через середины)
  function smooth(pts) {
    let d = 'M' + f1((pts[0][0] + pts[1][0]) / 2) + ' ' + f1((pts[0][1] + pts[1][1]) / 2);
    for (let i = 1; i <= pts.length; i++) {
      const p = pts[i % pts.length], q = pts[(i + 1) % pts.length];
      d += 'Q' + f1(p[0]) + ' ' + f1(p[1]) + ' ' + f1((p[0] + q[0]) / 2) + ' ' + f1((p[1] + q[1]) / 2);
    }
    return d + 'Z';
  }
  // рельефная конечность: радиусы вдоль кости (5 точек) отдельно для передней и задней стороны
  function muscle(A, B, pf, pb, front) {
    let dx = B[0] - A[0], dy = B[1] - A[1]; const l = Math.hypot(dx, dy) || 1; dx /= l; dy /= l;
    let nx = -dy, ny = dx;
    // «перед» конечности — сторона, куда смотрит персонаж (вправо), у горизонтальных — вверх
    if (front) { pf = pf.map((v, i) => (v + pb[i]) / 2); pb = pf; }
    else if (nx < -0.25 || (Math.abs(nx) <= 0.25 && ny > 0)) { nx = -nx; ny = -ny; }
    const pts = [];
    for (let i = 0; i < 5; i++) { const k = i / 4; pts.push([A[0] + dx * l * k + nx * pf[i], A[1] + dy * l * k + ny * pf[i]]); }
    for (let i = 4; i >= 0; i--) { const k = i / 4; pts.push([A[0] + dx * l * k - nx * pb[i], A[1] + dy * l * k - ny * pb[i]]); }
    const sw = cw(pts);
    return smooth(pts) + circ(A, Math.min(pf[0], pb[0]), sw) + circ(B, Math.min(pf[4], pb[4]), sw);
  }
  const PROF = {
    th: [[7.4, 8.2, 7.4, 6.2, 5.2], [7.2, 6.8, 6.2, 5.5, 5.0]],
    sh: [[4.9, 4.4, 3.9, 3.4, 3.1], [5.0, 6.1, 5.2, 3.9, 3.2]],
    ua: [[5.2, 5.0, 5.3, 4.4, 3.8], [5.2, 4.9, 4.6, 4.1, 3.7]],
    fa: [[3.8, 4.2, 3.7, 3.0, 2.6], [3.8, 3.7, 3.3, 2.9, 2.6]]
  };

  // корпус: таз, талия, грудь, плечи; спереди грудь выпуклее, сзади — ягодицы
  function torsoPath(hip, sh, front, breath) {
    let ux = sh[0] - hip[0], uy = sh[1] - hip[1]; const l = Math.hypot(ux, uy) || 1; ux /= l; uy /= l;
    const fx = -uy, fy = ux;   // «вперёд» — в сторону груди
    const W = front ? [[0, 11, 11], [0.42, 9.2, 9.2], [0.74, 12.6 * breath, 12.6 * breath], [1, 13.5, 13.5]]
      : [[-0.06, 7.5, 9.6], [0.4, 6.4, 6.6], [0.74, 9.6 * breath, 7.2], [1, 6.8, 7]];
    const at = (k, side, w) => [hip[0] + ux * l * k + fx * w * side, hip[1] + uy * l * k + fy * w * side];
    const pts = W.map((r) => at(r[0], 1, r[1])).concat(W.slice().reverse().map((r) => at(r[0], -1, r[2])));
    return smooth(pts);
  }

  function build(svg, id) {
    const st = prep(id), a = st.a, F = new Set(a.focus || []), front = !!a.front, W0 = st.W0, fy = st.fy;
    svg.setAttribute('viewBox', '0 0 240 190');
    svg.classList.add('coach-svg');
    const uidg = 'cg' + Math.random().toString(36).slice(2, 8);
    const defs = el('defs', {}, svg);
    const rg = el('radialGradient', { id: uidg + 's' }, defs);
    el('stop', { offset: '0', 'stop-color': 'currentColor', 'stop-opacity': '.22' }, rg);
    el('stop', { offset: '1', 'stop-color': 'currentColor', 'stop-opacity': '0' }, rg);
    // светотень: свет сверху-слева, у каждого материала свой градиент
    const MAT = { skin: '--c-skin', top: '--c-top', bot: '--c-bot', shoe: '--c-shoe', hair: '--c-hair' };
    const fillOf = {};
    Object.keys(MAT).forEach((m) => {
      const g = el('linearGradient', { id: uidg + m, x1: '0', y1: '0', x2: '1', y2: '1' }, defs);
      el('stop', { offset: '0', style: 'stop-color:color-mix(in srgb,var(' + MAT[m] + ') 72%,#fff)' }, g);
      el('stop', { offset: '.5', style: 'stop-color:var(' + MAT[m] + ')' }, g);
      el('stop', { offset: '1', style: 'stop-color:color-mix(in srgb,var(' + MAT[m] + ') 74%,#000)' }, g);
      fillOf[m] = 'url(#' + uidg + m + ')';
    });
    const back = el('g', { class: 'cp' }, svg);
    const props = new Set(a.props || []);
    if (fy < FLOOR) el('line', { x1: 0, x2: 240, y1: FLOOR + 1, y2: FLOOR + 1, class: 'cfl' }, back);
    el('line', { x1: 0, x2: 240, y1: fy + 1, y2: fy + 1, class: 'cfl' }, back);
    const shadow = el('ellipse', { cx: 120, cy: FLOOR + 1.5, rx: 40, ry: 5, fill: 'url(#' + uidg + 's)', class: 'csh2' }, back);
    const pad = (from, to, off, stand) => {
      const A = W0[from], B = W0[to], n = perp(A, B);
      const a1 = [A[0] + n[0] * off, A[1] + n[1] * off], b1 = [B[0] + n[0] * off, B[1] + n[1] * off];
      line(el('line', { class: 'cpad' }, back), a1, b1);
      if (stand) { const m = [(a1[0] + b1[0]) / 2, (a1[1] + b1[1]) / 2]; line(el('line', { class: 'cleg' }, back), [m[0], m[1] + 3], [m[0], FLOOR]); }
    };
    if (props.has('pad')) pad('sh', 'hip', 11, true);
    if (props.has('padlegs')) pad('sh', 'kn', 11, true);
    if (props.has('padhyper')) pad('hip', 'kn', 10, true);
    if (props.has('seat')) { pad('sh', 'hip', 11, false); const h0 = W0.hip; el('rect', { x: h0[0] - 22, y: h0[1] + 8, width: 36, height: FLOOR - h0[1] - 8, rx: 5, class: 'cbox' }, back); }
    if (props.has('box')) { const h0 = W0.hip; el('rect', { x: h0[0] - 18, y: h0[1] + 8, width: 30, height: FLOOR - h0[1] - 8, rx: 5, class: 'cbox' }, back); }
    if (props.has('chair')) { const hd = W0.ha; el('rect', { x: hd[0] - 30, y: hd[1] + 3, width: 36, height: 6, rx: 3, class: 'cbox' }, back); line(el('line', { class: 'cleg' }, back), [hd[0] - 26, hd[1] + 9], [hd[0] - 26, FLOOR]); line(el('line', { class: 'cleg' }, back), [hd[0] + 2, hd[1] + 9], [hd[0] + 2, FLOOR]); }
    let cable = null, cableFrom = null, plate = null;
    if (props.has('cable_top')) cableFrom = [W0.ha[0] + 16, 14];
    if (props.has('cable_up')) cableFrom = [W0.ha[0], 6];
    if (props.has('cable_front')) { cableFrom = [W0.to[0] + 22, W0.ha[1]]; el('rect', { x: cableFrom[0], y: cableFrom[1] - 30, width: 8, height: FLOOR - cableFrom[1] + 30, rx: 3, class: 'cbox' }, back); }
    if (cableFrom) { if (!props.has('cable_front')) el('rect', { x: cableFrom[0] - 4, y: 0, width: 8, height: cableFrom[1], class: 'cbox' }, back); el('circle', { cx: cableFrom[0], cy: cableFrom[1], r: 4, class: 'cpul' }, back); cable = el('line', { class: 'ccab' }, back); }
    if (props.has('platform')) plate = el('line', { class: 'cpad' }, back);
    const barback = props.has('barback') ? el('circle', { r: 10, class: 'cplate' }, back) : null;

    // тело: дальние конечности (в тени), корпус и голова, ближние конечности; поверх — подсветка работающих мышц
    const MATCLS = { cskin: 'skin', ctop: 'top', cbot: 'bot', cshoe: 'shoe', chair: 'hair' };
    const path = (cls, parent) => { const p = el('path', { class: cls }, parent); if (MATCLS[cls]) p.setAttribute('fill', fillOf[MATCLS[cls]]); return p; };
    const farG = el('g', { class: front ? 'cfar0' : 'cfar' }, svg);
    const mk = (g, hl) => ({ th: path('cbot', g), sh: path('cbot', g), ft: path('cshoe', g), sole: path('csole', g), fa: path('cskin', g), ua: path('ctop', g), delt: path('ctop', g), hand: path('cskin', g),
      hlth: hl && F.has('TH') ? path('chl', g) : null, hlsh: hl && F.has('SH') ? path('chl', g) : null, hlua: hl && F.has('UA') ? path('chl', g) : null, hlfa: hl && F.has('FA') ? path('chl', g) : null });
    const far = mk(farG, front);
    const neck = path('cskin', svg);
    const torso = path('ctop', svg);
    const shorts = path('cbot', svg);
    const hlT = F.has('T') ? path('chl', svg) : null;
    const hair = path('chair', svg), face = path('cskin', svg), nose = path('cskin', svg), ear = path('cskin', svg), eye = path('ceye', svg), brow = path('chair', svg);
    const nearG = el('g', {}, svg);
    const near = mk(nearG, true);
    const fr = el('g', { class: 'cp' }, svg);
    const db1 = props.has('db') ? el('rect', { width: 16, height: 7, rx: 3, class: 'cdb' }, fr) : null;
    const db2 = props.has('db') && front ? el('rect', { width: 16, height: 7, rx: 3, class: 'cdb' }, fr) : null;
    const bar = props.has('bar') ? el('circle', { r: 12, class: 'cplate' }, fr) : null;

    const limb = (S, hip, sh, kn, an, to, el_, ha, Ln) => {
      const thP = muscle(hip, kn, PROF.th[0], PROF.th[1], front), shP = muscle(kn, an, PROF.sh[0], PROF.sh[1], front);
      S.th.setAttribute('d', thP); S.sh.setAttribute('d', shP);
      // стопа: от пятки к носку
      let dx = to[0] - an[0], dy = to[1] - an[1]; const l = Math.hypot(dx, dy) || 1; dx /= l; dy /= l;
      const heel = [an[0] - dx * 3, an[1] - dy * 3];
      S.ft.setAttribute('d', capsule(heel, to, 3.7, 2.7));
      // подошва — тонкая тёмная полоса снизу стопы
      const sn = front ? [0, 1] : (dx < 0 ? [dy, -dx] : [-dy, dx]);
      const snn = sn[1] < 0 ? [-sn[0], -sn[1]] : sn;
      S.sole.setAttribute('d', capsule([heel[0] + snn[0] * 2.6, heel[1] + snn[1] * 2.6], [to[0] + snn[0] * 1.8, to[1] + snn[1] * 1.8], 1.3, 1.1));
      const uaP = muscle(sh, el_, PROF.ua[0], PROF.ua[1], front), faP = muscle(el_, ha, PROF.fa[0], PROF.fa[1], front);
      S.ua.setAttribute('d', uaP); S.fa.setAttribute('d', faP); S.hand.setAttribute('d', circ(ha, 3.4));
      S.delt.setAttribute('d', circ(sh, front ? 5.8 : 6.2));
      if (S.hlth) S.hlth.setAttribute('d', thP); if (S.hlsh) S.hlsh.setAttribute('d', shP);
      if (S.hlua) S.hlua.setAttribute('d', uaP); if (S.hlfa) S.hlfa.setAttribute('d', faP);
    };

    return function draw(P, rootX, lift, t) {
      const J = fk(P, front), dy = fy - lowest(J) + (lift || 0);
      const W = {}; for (const k in J) W[k] = [J[k][0] + rootX, J[k][1] + dy];
      const breath = 1 + 0.035 * Math.sin((t || 0) * 2 * Math.PI / 3.4);
      limb(far, W.hp2, W.sh2, W.kn2, W.an2, W.to2, W.el2, W.ha2);
      limb(near, W.hp1, W.sh1, W.kn, W.an, W.to, W.el, W.ha);
      torso.setAttribute('d', torsoPath(W.hip, W.sh, front, breath));
      if (hlT) hlT.setAttribute('d', torsoPath(W.hip, W.sh, front, breath));
      // шорты/пояс: нижняя часть корпуса
      const sx = W.sh[0] - W.hip[0], sy = W.sh[1] - W.hip[1];
      shorts.setAttribute('d', torsoPath(W.hip, [W.hip[0] + sx * 0.3, W.hip[1] + sy * 0.3], front, 1).replace(/Z$/, 'Z'));
      // шея и голова: волосы на затылке, лицо и нос смотрят вперёд
      let ux = W.head[0] - W.sh[0], uy = W.head[1] - W.sh[1]; const ul = Math.hypot(ux, uy) || 1; ux /= ul; uy /= ul;
      const fx = front ? 0 : -uy, fy2 = front ? 0 : ux;
      neck.setAttribute('d', capsule(W.sh, [W.sh[0] + ux * 9, W.sh[1] + uy * 9], 3.8, 3.6));
      const hc = W.head;
      hair.setAttribute('d', circ([hc[0] - fx * 1.6 + ux * 1.1, hc[1] - fy2 * 1.6 + uy * 1.1], 10));
      face.setAttribute('d', circ([hc[0] + fx * 1.2 - ux * 0.6, hc[1] + fy2 * 1.2 - uy * 0.6], 9));
      nose.setAttribute('d', front ? '' : circ([hc[0] + fx * 9.4 - ux * 0.5, hc[1] + fy2 * 9.4 - uy * 0.5], 1.9));
      ear.setAttribute('d', front ? circ([hc[0] - 9.2, hc[1]], 2.2) + circ([hc[0] + 9.2, hc[1]], 2.2) : circ([hc[0] - fx * 1.4 - ux * 0.4, hc[1] - fy2 * 1.4 - uy * 0.4], 2.4));
      eye.setAttribute('d', front ? circ([hc[0] - 3.4, hc[1] - 0.6], 1.1) + circ([hc[0] + 3.4, hc[1] - 0.6], 1.1) : circ([hc[0] + fx * 5.6 + ux * 1.4, hc[1] + fy2 * 5.6 + uy * 1.4], 1.1));
      brow.setAttribute('d', front ? capsule([hc[0] - 5, hc[1] - 3.4], [hc[0] - 2, hc[1] - 3.8], 0.7, 0.7) + capsule([hc[0] + 2, hc[1] - 3.8], [hc[0] + 5, hc[1] - 3.4], 0.7, 0.7)
        : capsule([hc[0] + fx * 4.2 + ux * 3.4, hc[1] + fy2 * 4.2 + uy * 3.4], [hc[0] + fx * 7 + ux * 3.2, hc[1] + fy2 * 7 + uy * 3.2], 0.7, 0.6));
      // тень под телом
      const xs = [W.an[0], W.an2[0], W.to[0], W.to2[0], W.hip[0], W.sh[0]];
      const mnx = Math.min.apply(null, xs), mxx = Math.max.apply(null, xs);
      shadow.setAttribute('cx', f1((mnx + mxx) / 2)); shadow.setAttribute('rx', f1(Math.max(20, (mxx - mnx) / 2 + 16)));
      shadow.setAttribute('opacity', Math.max(0.3, 1 + (lift || 0) / 25).toFixed(2));
      if (cable) line(cable, cableFrom, W.ha);
      if (plate) { const n = perp(W.kn, W.an), c = [W.to[0] + 3, W.to[1]]; line(plate, [c[0] - n[0] * 22, c[1] - n[1] * 22], [c[0] + n[0] * 22, c[1] + n[1] * 22]); }
      if (db1) { db1.setAttribute('x', f1(W.ha[0] - 8)); db1.setAttribute('y', f1(W.ha[1] - 3.5)); }
      if (db2) { db2.setAttribute('x', f1(W.ha2[0] - 8)); db2.setAttribute('y', f1(W.ha2[1] - 3.5)); }
      if (bar) { bar.setAttribute('cx', f1(W.ha[0])); bar.setAttribute('cy', f1(W.ha[1])); }
      if (barback) { const l2 = Math.hypot(sx, sy) || 1; barback.setAttribute('cx', f1(W.sh[0] - sx / l2 * 4 - 3)); barback.setAttribute('cy', f1(W.sh[1] - sy / l2 * 4)); }
    };
  }

  // поза в момент времени: удержание, плавный переход; руки и голова чуть запаздывают — как у живого человека
  const LAG = { ua: 0.08, fa: 0.12, ua2: 0.08, fa2: 0.12, H: 0.05 };
  const CONC_FIRST = { bridge: 1, superman: 1, curl: 1, lateral: 1, shoulder_press: 1, pushdown: 1, leg_curl: 1, hyper: 1, calf: 1, crunch: 1, leg_press: 1, pulldown: 1, seated_row: 1, bent_row: 1, incline: 1 };
  function sample(st, time, speed) {
    const a = st.a, n = st.kf.length, segDur = (a.dur || 2.2) / (speed || 1);
    // темп: уступающая фаза (опускание) медленнее преодолевающей (подъёма)
    const wts = n === 2 ? (CONC_FIRST[st.id] ? [0.8, 1.25] : [1.25, 0.8]) : new Array(n).fill(1);
    const total = wts.reduce((x, y) => x + y, 0), cyc = (time / segDur) % total;
    let i = 0, acc = 0; while (i < n - 1 && cyc >= acc + wts[i]) { acc += wts[i]; i++; }
    const loc = (cyc - acc) / wts[i], j = (i + 1) % n, HOLD = 0.22;
    const kAt = (lag) => { const x = (loc - HOLD - lag) / (1 - HOLD - lag); return x <= 0 ? 0 : x >= 1 ? 1 : ease(x); };
    const k = kAt(0);
    const A = st.kf[i], B = st.kf[j], P = {};
    DEF.forEach((key) => { const kk = LAG[key] ? kAt(LAG[key]) : k; P[key] = key === 'lift' ? A.p.lift + (B.p.lift - A.p.lift) * k : lerpA(A.p[key], B.p[key], kk); });
    return { P, rootX: A.rootX + (B.rootX - A.rootX) * k, lift: P.lift, phase: k > 0.5 ? j : i };
  }

  /* ---------- общий цикл анимации для всех персонажей на экране ---------- */
  const live = new Set();
  let raf = 0;
  const reduce = () => window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  function loop(now) {
    raf = 0;
    live.forEach((f) => {
      if (!f.svg.isConnected) { live.delete(f); return; }
      if (f.paused) return;
      const t = (now - f.t0) / 1000;
      let s;
      if (reduce()) { const st = prep(f.id), n = st.kf.length, i = Math.floor(t / 1.8) % n; s = { P: st.kf[i].p, rootX: st.kf[i].rootX, lift: 0, phase: i }; }
      else s = sample(prep(f.id), t, f.speed);
      f.draw(s.P, s.rootX, s.lift, t);
      if (f.onPhase && s.phase !== f.ph) { f.ph = s.phase; f.onPhase(s.phase); }
    });
    if (live.size && document.visibilityState !== 'hidden') raf = requestAnimationFrame(loop);
  }
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && live.size && !raf) raf = requestAnimationFrame(loop); });

  function mount(svg, id, o) {
    o = o || {};
    const st = prep(id), f = { svg, id, draw: build(svg, id), t0: performance.now(), speed: o.speed || 1, paused: false, onPhase: o.onPhase, ph: -1 };
    f.draw(st.kf[0].p, st.kf[0].rootX, 0);
    live.add(f);
    if (!raf) raf = requestAnimationFrame(loop);
    return {
      setSpeed(v) { const now = performance.now(), t = (now - f.t0) / 1000 * f.speed; f.speed = v; f.t0 = now - t / v * 1000; },
      pause(v) { if (v) { f.pausedAt = performance.now(); f.paused = true; } else { f.t0 += performance.now() - (f.pausedAt || performance.now()); f.paused = false; if (!raf) raf = requestAnimationFrame(loop); } },
      get paused() { return f.paused; }
    };
  }
  const svgNode = (cls) => { const s = document.createElementNS(NS, 'svg'); s.setAttribute('class', cls || ''); s.setAttribute('aria-hidden', 'true'); return s; };

  // неподвижный кадр ключевой позы (для просмотра и проверки)
  const still = (svg, id, i) => { const st = prep(id), k = st.kf[i || 0]; build(svg, id)(k.p, k.rootX, k.p.lift); };
  App.coach = { ANIMS, CUES, find, mount, svgNode, prep, still };
})();
