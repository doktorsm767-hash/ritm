/* Ритм — проверка техники камерой.
   Поза распознаётся прямо на телефоне (MediaPipe Pose Landmarker, файлы лежат в vendor/mediapipe):
   видео никуда не отправляется. По суставам считаются углы, повторы и типичные ошибки,
   подсказки показываются на экране и произносятся голосом. */
(function () {
  'use strict';
  const App = window.App, { h, icon, sheet, toast, haptic, kidsSet, kidsAdd } = App, ui = App.ui;

  const available = () => !(window.claude && window.claude.use) && !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia) && window.isSecureContext;

  /* ---------- геометрия ---------- */
  const IDX = { nose: 0, sh: [11, 12], el: [13, 14], wr: [15, 16], hip: [23, 24], kn: [25, 26], an: [27, 28], ft: [31, 32] };
  const ang = (a, b, c) => {   // угол abc в градусах
    const v1 = [a.x - b.x, a.y - b.y], v2 = [c.x - b.x, c.y - b.y];
    const d = Math.hypot(v1[0], v1[1]) * Math.hypot(v2[0], v2[1]) || 1;
    return Math.acos(Math.max(-1, Math.min(1, (v1[0] * v2[0] + v1[1] * v2[1]) / d))) * 180 / Math.PI;
  };
  const fromVert = (a, b) => Math.atan2(Math.abs(b.x - a.x), Math.abs(b.y - a.y)) * 180 / Math.PI;   // наклон отрезка от вертикали
  function frame(lm, W, H) {
    const P = lm.map((p) => ({ x: p.x * W, y: p.y * H, v: p.visibility == null ? 1 : p.visibility }));
    const vis = (s) => ['sh', 'hip', 'kn', 'an'].reduce((a, k) => a + P[IDX[k][s]].v, 0);
    const s = vis(0) >= vis(1) ? 0 : 1;   // сторона, лучше видная камере
    const j = (k, side) => P[IDX[k][side == null ? s : side]];
    const both = (k) => P[IDX[k][0]].v > 0.6 && P[IDX[k][1]].v > 0.6;
    return { P, j, both, s };
  }
  // линия тела: где таз относительно прямой плечо—лодыжка (+ ниже линии, − выше)
  const hipOff = (F) => { const a = F.j('sh'), b = F.j('an'), m = F.j('hip'); const k = (m.x - a.x) / ((b.x - a.x) || 1); return m.y - (a.y + (b.y - a.y) * k); };

  /* ---------- правила по упражнениям ----------
     metric — главный угол; повтор: опускание ниже down и возврат выше up (или наоборот при inv);
     rep(min,max,F) — проверка после повтора; live(F,m) — проверка в каждом кадре; need — какие суставы должны быть видны. */
  const knee = (F) => ang(F.j('hip'), F.j('kn'), F.j('an'));
  const elbow = (F) => ang(F.j('sh'), F.j('el'), F.j('wr'));
  const line = (F) => ang(F.j('sh'), F.j('hip'), F.j('an'));
  const lean = (F) => fromVert(F.j('hip'), F.j('sh'));
  const bodyLine = (F) => { if (line(F) > 160) return null; return hipOff(F) > 0 ? 'Не провисайте в пояснице — подтяните живот' : 'Опустите таз — тело в одну линию'; };
  const RULES = {
    squat: { view: 'Встаньте боком к камере, всё тело в кадре', need: ['hip', 'kn', 'an', 'sh'], metric: knee, down: 120, up: 160,
      rep: (mn) => (mn > 105 ? 'Присядьте глубже — бёдра до параллели с полом' : null),
      live: (F, m) => {
        if (m < 135 && lean(F) > 52) return 'Грудь выше — не заваливайтесь вперёд';
        if (m < 140 && F.both('kn') && F.both('an')) { const kd = Math.abs(F.P[25].x - F.P[26].x), ad = Math.abs(F.P[27].x - F.P[28].x); if (ad > 20 && kd < ad * 0.75) return 'Колени наружу — по линии носков'; }
        return null;
      } },
    lunge: { view: 'Встаньте боком к камере', need: ['hip', 'kn', 'an', 'sh'], metric: (F) => Math.min(ang(F.j('hip', 0), F.j('kn', 0), F.j('an', 0)), ang(F.j('hip', 1), F.j('kn', 1), F.j('an', 1))), down: 125, up: 160,
      rep: (mn) => (mn > 105 ? 'Опускайтесь ниже — колено почти до пола' : null),
      live: (F, m) => (m < 140 && lean(F) > 25 ? 'Держите корпус вертикально' : null) },
    pushup: { view: 'Поставьте телефон сбоку на уровне пола', need: ['sh', 'el', 'wr', 'hip', 'an'], metric: elbow, down: 115, up: 155,
      rep: (mn) => (mn > 100 ? 'Опускайтесь ниже — грудь к полу' : null), live: (F) => bodyLine(F) },
    plank: { view: 'Телефон сбоку, на уровне пола', need: ['sh', 'hip', 'an'], hold: true, live: (F) => bodyLine(F) },
    bridge: { view: 'Лягте боком к камере', need: ['sh', 'hip', 'kn'], metric: (F) => ang(F.j('sh'), F.j('hip'), F.j('kn')), inv: true, down: 135, up: 155,
      rep: (mn, mx) => (mx < 165 ? 'Поднимите таз выше — до прямой линии' : null) },
    rdl: { view: 'Встаньте боком к камере', need: ['sh', 'hip', 'kn', 'an'], metric: lean, inv: true, down: 25, up: 50,
      live: (F, m) => (m > 40 && knee(F) < 140 ? 'Меньше сгибайте колени — отводите таз назад' : null) },
    bent_row: { view: 'Встаньте боком к камере', need: ['sh', 'el', 'wr', 'hip'], metric: elbow, down: 110, up: 150,
      live: (F) => (lean(F) < 30 ? 'Наклонитесь ниже — корпус почти параллельно полу' : null) },
    curl: { view: 'Встаньте боком к камере', need: ['sh', 'el', 'wr'], metric: elbow, down: 75, up: 145,
      rep: (mn) => (mn > 65 ? 'Поднимайте гантель выше — к плечу' : null),
      live: (F) => (fromVert(F.j('sh'), F.j('el')) > 28 ? 'Прижмите локоть к корпусу' : null) },
    shoulder_press: { view: 'Сядьте лицом или боком к камере', need: ['sh', 'el', 'wr'], metric: elbow, inv: true, down: 105, up: 150,
      rep: (mn, mx) => (mx < 160 ? 'Выпрямляйте руки полностью вверху' : null),
      live: (F) => (lean(F) > 20 ? 'Не прогибайтесь назад' : null) },
    lateral: { view: 'Встаньте лицом к камере', need: ['sh', 'el', 'wr', 'hip'], metric: (F) => ang(F.j('hip'), F.j('sh'), F.j('wr')), inv: true, down: 35, up: 70,
      rep: (mn, mx) => (mx > 110 ? 'Не поднимайте руки выше плеч' : mx < 75 ? 'Поднимайте руки до уровня плеч' : null) },
    jack: { view: 'Встаньте лицом к камере', need: ['sh', 'wr', 'hip'], metric: (F) => ang(F.j('hip'), F.j('sh'), F.j('wr')), inv: true, down: 60, up: 130 },
    pushdown: { view: 'Встаньте боком к камере', need: ['sh', 'el', 'wr'], metric: elbow, inv: true, down: 110, up: 150,
      live: (F) => (fromVert(F.j('sh'), F.j('el')) > 25 ? 'Прижмите локти к корпусу' : null) },
    dips: { view: 'Телефон сбоку', need: ['sh', 'el', 'wr'], metric: elbow, down: 115, up: 150,
      rep: (mn) => (mn > 100 ? 'Опускайтесь ниже — до прямого угла в локтях' : null) },
    march: { view: 'Встаньте лицом или боком к камере', need: ['hip', 'kn'], metric: (F) => Math.min(ang(F.j('sh', 0), F.j('hip', 0), F.j('kn', 0)), ang(F.j('sh', 1), F.j('hip', 1), F.j('kn', 1))), down: 125, up: 155 }
  };
  const ALIAS = { squat_bar: 'squat', side_plank: 'plank', pushup: 'pushup', burpee: 'squat', calf: null, crunch: null, superman: null, leg_press: null, leg_curl: null, bench: null, incline: null, pulldown: null, seated_row: null, hyper: null };
  const ruleFor = (id) => RULES[id] || (ALIAS[id] && RULES[ALIAS[id]]) || null;

  // соединения скелета для рисования
  const BONES = [[11, 12], [11, 13], [13, 15], [12, 14], [14, 16], [11, 23], [12, 24], [23, 24], [23, 25], [25, 27], [27, 31], [24, 26], [26, 28], [28, 32]];

  /* ---------- голос ---------- */
  const voice = { on: true, last: {}, say(text, key, gap) {
    if (!this.on || !window.speechSynthesis) return;
    const now = Date.now(); key = key || text;
    if (this.last[key] && now - this.last[key] < (gap || 4000)) return;
    this.last[key] = now;
    try { speechSynthesis.cancel(); const u = new SpeechSynthesisUtterance(text); u.lang = 'ru-RU'; u.rate = 1.05; speechSynthesis.speak(u); } catch (e) {}
  } };

  /* ---------- загрузка модели (один раз) ---------- */
  let modelP = null;
  function loadModel() {
    if (modelP) return modelP;
    const base = new URL('vendor/mediapipe/', location.href).href;
    modelP = (async () => {
      const vision = await import(base + 'vision_bundle.mjs');
      const files = await vision.FilesetResolver.forVisionTasks(base + 'wasm');
      const opts = (delegate) => ({ baseOptions: { modelAssetPath: base + 'pose_landmarker_lite.task', delegate }, runningMode: 'VIDEO', numPoses: 1,
        minPoseDetectionConfidence: 0.5, minPosePresenceConfidence: 0.5, minTrackingConfidence: 0.5 });
      try { return await vision.PoseLandmarker.createFromOptions(files, opts('GPU')); }
      catch (e) { return await vision.PoseLandmarker.createFromOptions(files, opts('CPU')); }
    })();
    modelP.catch(() => { modelP = null; });
    return modelP;
  }

  /* ---------- анализ потока поз ---------- */
  function Analyzer(rule) {
    const st = { phase: 'top', reps: 0, good: 0, mn: 999, mx: -999, holdMs: 0, issue: null, issueSince: 0, lastT: 0, feedback: null, lastRep: null, sm: null };
    return {
      st,
      push(F, t) {
        const dt = st.lastT ? Math.min(200, t - st.lastT) : 0; st.lastT = t;
        const out = { issue: null, rep: false };
        if (rule.metric) {
          let m = rule.metric(F);
          st.sm = st.sm == null ? m : st.sm * 0.6 + m * 0.4; m = st.sm;   // сглаживание дрожания
          const work = rule.inv ? m > rule.up : m < rule.down, rest = rule.inv ? m < rule.down : m > rule.up;
          // неполный повтор: ушли за середину амплитуды, но не дошли до нижней точки — подсказываем, не засчитываем
          const mid = (rule.up + rule.down) / 2, half = rule.inv ? m > mid : m < mid;
          if (st.phase === 'top') {
            if (half) { st.partial = true; st.pmn = Math.min(st.pmn == null ? m : st.pmn, m); st.pmx = Math.max(st.pmx == null ? m : st.pmx, m); }
            if (rest && st.partial && !work) { out.repMsg = rule.rep ? rule.rep(st.pmn, st.pmx, F) : null; out.partial = true; st.partial = false; st.pmn = st.pmx = null; }
          }
          if (st.phase === 'top' && work) { st.phase = 'work'; st.mn = m; st.mx = m; st.partial = false; st.pmn = st.pmx = null; }
          if (st.phase === 'work') { st.mn = Math.min(st.mn, m); st.mx = Math.max(st.mx, m); if (rest) {
            st.phase = 'top'; st.reps++; out.rep = true;
            const bad = rule.rep ? rule.rep(st.mn, st.mx, F) : null;
            if (!bad) st.good++;
            st.lastRep = bad; out.repMsg = bad;
          } }
          out.m = m;
        }
        let issue = rule.live ? rule.live(F, out.m) : null;
        // ошибка засчитывается, если держится дольше 0,4 с — чтобы не дёргать из-за одного кадра
        if (issue !== st.issue) { st.issue = issue; st.issueSince = t; }
        out.issue = issue && t - st.issueSince > 400 ? issue : null;
        if (rule.hold && !out.issue) st.holdMs += dt;
        return out;
      }
    };
  }

  /* ---------- экран камеры ---------- */
  ui.poseCheck = function (e) {
    const id = App.coach.find(e.name), rule = ruleFor(id), cue = App.coach.CUES[id];
    let stream = null, raf = 0, stopped = false, facing = 'user', model = null, lastVT = -1, an = rule ? Analyzer(rule) : null;
    const stop = () => { stopped = true; cancelAnimationFrame(raf); if (stream) stream.getTracks().forEach((t) => t.stop()); stream = null; try { speechSynthesis.cancel(); } catch (er) {} };
    const s = sheet({ title: 'Проверка техники', detent: 'full', bare: true, onClose: stop, build: (b) => {
      b.style.padding = '0';
      const video = h('video', { playsinline: true, muted: true, autoplay: true, class: 'pc-video' });
      video.setAttribute('playsinline', ''); video.muted = true;
      const cv = h('canvas', { class: 'pc-canvas' });
      const reps = h('div', { class: 'pc-reps num' }, rule && rule.hold ? '0 с' : '0');
      const repsLbl = h('div', { class: 'pc-reps-l' }, rule && rule.hold ? 'в правильной позе' : 'повторов');
      const msg = h('div', { class: 'pc-msg' }, 'Запускаю камеру…');
      const mini = App.coach.svgNode();
      const voiceBtn = h('button', { class: 'pc-btn', type: 'button', 'aria-label': 'Голосовые подсказки', onclick: () => { voice.on = !voice.on; voiceBtn.classList.toggle('off', !voice.on); haptic(6); } }, icon('info', 18));
      const flipBtn = h('button', { class: 'pc-btn', type: 'button', 'aria-label': 'Сменить камеру', onclick: () => { facing = facing === 'user' ? 'environment' : 'user'; start(); } }, icon('refresh', 18));
      const closeBtn = h('button', { class: 'pc-btn', type: 'button', 'aria-label': 'Закрыть', onclick: () => s.close() }, icon('xmark', 16));
      const stage = h('div', { class: 'pc-stage' }, video, cv,
        h('div', { class: 'pc-top' }, h('div', { class: 'pc-count' }, reps, repsLbl, ui.hrChip ? ui.hrChip(true) : null), h('div', { class: 'pc-tools' }, voiceBtn, flipBtn, closeBtn)),
        h('div', { class: 'pc-mini' }, mini),
        h('div', { class: 'pc-bottom' }, h('div', { class: 'pc-name' }, e.name), msg));
      kidsAdd(b, stage);
      requestAnimationFrame(() => App.coach.mount(mini, id, { speed: 1 }));
      const setMsg = (text, kind) => { msg.textContent = text; msg.className = 'pc-msg ' + (kind || ''); };

      async function start() {
        if (stream) stream.getTracks().forEach((t) => t.stop());
        video.classList.toggle('mirror', facing === 'user'); cv.classList.toggle('mirror', facing === 'user');
        try {
          stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: facing }, width: { ideal: 640 }, height: { ideal: 480 } }, audio: false });
        } catch (er) { return setMsg('Нет доступа к камере. Разрешите его в настройках телефона для этого приложения.', 'bad'); }
        if (stopped) return stop();
        video.srcObject = stream; await video.play().catch(() => {});
        if (!model) {
          setMsg('Загружаю распознавание позы… Это нужно один раз, около 15 МБ.');
          try { model = await loadModel(); } catch (er) { return setMsg('Не удалось загрузить распознавание позы. Проверьте интернет и откройте снова.', 'bad'); }
        }
        if (stopped) return;
        setMsg(rule ? rule.view : 'Встаньте так, чтобы всё тело было в кадре. Это упражнение я пока не оцениваю — показываю скелет.');
        voice.say(rule ? rule.view : 'Покажу скелет. Оценку этого упражнения добавим позже.', 'view', 8000);
        if (!raf) loop();
      }

      let lastSeen = 0, okSince = 0, lastSec = -1;
      function loop() {
        raf = requestAnimationFrame(loop);
        if (stopped || !model || video.readyState < 2 || video.currentTime === lastVT) return;
        lastVT = video.currentTime;
        const t = performance.now();
        let res; try { res = model.detectForVideo(video, t); } catch (er) { return; }
        const W = video.videoWidth, H = video.videoHeight;
        if (cv.width !== W) { cv.width = W; cv.height = H; }
        const ctx = cv.getContext('2d'); ctx.clearRect(0, 0, W, H);
        const lm = res && res.landmarks && res.landmarks[0];
        if (!lm) { if (t - lastSeen > 1500) setMsg('Не вижу вас — отойдите, чтобы всё тело попало в кадр', 'warn'); return; }
        lastSeen = t;
        const F = frame(lm, W, H);
        // видны ли нужные суставы
        const need = rule ? rule.need : ['sh', 'hip'];
        const missing = need.some((k) => { const i = IDX[k][F.s]; return F.P[i].v < 0.5; });
        let out = null;
        if (rule && !missing) out = an.push(F, t);
        const bad = out && (out.issue || out.repMsg);
        drawSkeleton(ctx, F, bad ? '#FF9F0A' : '#30D158', Math.max(W, H));
        if (missing) { setMsg('Отойдите дальше: в кадре должно быть всё тело', 'warn'); voice.say('Отойдите дальше, мне не видно всё тело', 'far', 6000); return; }
        if (!rule) return;
        const st = an.st;
        if (rule.hold) {
          const sec = Math.floor(st.holdMs / 1000);
          if (sec !== lastSec) { lastSec = sec; reps.textContent = sec + ' с'; if (sec && sec % 10 === 0) voice.say(sec + ' секунд', 'sec'); }
        }
        if (out.partial && out.repMsg) { setMsg(out.repMsg, 'warn'); voice.say(out.repMsg, 'rep-' + out.repMsg, 3000); okSince = t; return; }
        if (out.rep) {
          reps.textContent = String(st.reps); haptic(15);
          reps.classList.remove('pop'); void reps.offsetWidth; reps.classList.add('pop');
          if (out.repMsg) { setMsg(out.repMsg, 'warn'); voice.say(out.repMsg, 'rep-' + out.repMsg, 3000); }
          else { setMsg('Отлично! Повтор засчитан правильно', 'good'); voice.say(String(st.reps), 'n', 300); }
          okSince = t;
          return;
        }
        if (out.issue) { setMsg(out.issue, 'warn'); voice.say(out.issue, out.issue, 4500); okSince = 0; }
        else if (t - okSince > 2500) { setMsg(rule.hold ? 'Хорошо, держите' : 'Техника в порядке — продолжайте', 'good'); okSince = t; }
      }
      function drawSkeleton(ctx, F, color, size) {
        const lw = Math.max(3, size / 160);
        ctx.lineCap = 'round'; ctx.lineWidth = lw; ctx.strokeStyle = color; ctx.fillStyle = '#fff';
        BONES.forEach(([a, c]) => { const p = F.P[a], q = F.P[c]; if (p.v < 0.4 || q.v < 0.4) return; ctx.globalAlpha = 0.9; ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y); ctx.stroke(); });
        [11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28].forEach((i) => { const p = F.P[i]; if (p.v < 0.4) return; ctx.globalAlpha = 1; ctx.beginPath(); ctx.arc(p.x, p.y, lw * 1.3, 0, 7); ctx.fill(); });
        ctx.globalAlpha = 1;
      }
      start();
    } });
  };

  App.pose = { available, ruleFor, RULES, Analyzer, frame, loadModel };
})();
