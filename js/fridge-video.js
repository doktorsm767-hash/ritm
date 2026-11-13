/* Ритм — холодильник по видео: съёмка с рассказом голосом, разбор по кадрам (на ходу или после), запасы и что приготовить.
   Видео в ИИ целиком не отправляется: из него берутся несхожие кадры, а речь — текстом. */
(function () {
  'use strict';
  const App = window.App, { h, icon, store, sheet, toast, haptic, nf, uid } = App;
  const ui = App.ui, kidsSet = App.kidsSet, kidsAdd = App.kidsAdd;
  const K = () => App.fridgeKit;

  /* ---------- кадры ---------- */
  // «отпечаток» кадра 32×24 в оттенках серого — чтобы не брать одинаковые кадры
  const sigCanvas = document.createElement('canvas'); sigCanvas.width = 32; sigCanvas.height = 24;
  function sig(src) {
    const g = sigCanvas.getContext('2d', { willReadFrequently: true });
    g.drawImage(src, 0, 0, 32, 24);
    const d = g.getImageData(0, 0, 32, 24).data, out = new Uint8Array(768);
    for (let i = 0; i < 768; i++) out[i] = (d[i * 4] * 3 + d[i * 4 + 1] * 6 + d[i * 4 + 2]) / 10;
    return out;
  }
  const dist = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) s += Math.abs(a[i] - b[i]); return s / a.length; };
  const grab = (v, max) => new Promise((res) => {
    const k = Math.min(1, (max || 1280) / Math.max(v.videoWidth, v.videoHeight));
    const c = document.createElement('canvas'); c.width = Math.round(v.videoWidth * k); c.height = Math.round(v.videoHeight * k);
    c.getContext('2d').drawImage(v, 0, 0, c.width, c.height);
    c.toBlob((bl) => res(bl ? new File([bl], 'frame-' + Date.now() + '.jpg', { type: 'image/jpeg' }) : null), 'image/jpeg', 0.82);
  });
  // равномерно оставить n штук
  const thin = (arr, n) => (arr.length <= n ? arr : Array.from({ length: n }, (_, i) => arr[Math.round(i * (arr.length - 1) / (n - 1 || 1))]));

  // кадры из готового видеофайла
  async function framesFromFile(file, want, onProg) {
    const url = URL.createObjectURL(file);
    const v = document.createElement('video'); v.muted = true; v.playsInline = true; v.setAttribute('playsinline', ''); v.preload = 'auto';
    const wait = (ev, ms) => new Promise((res, rej) => {
      const t = setTimeout(() => { off(); rej(new Error('timeout')); }, ms);
      const ok = () => { off(); res(); }, bad = () => { off(); rej(new Error('decode')); };
      const off = () => { clearTimeout(t); v.removeEventListener(ev, ok); v.removeEventListener('error', bad); };
      v.addEventListener(ev, ok); v.addEventListener('error', bad);
    });
    try {
      const loaded = wait('loadeddata', 20000); v.src = url; await loaded;
      let dur = v.duration;
      if (!isFinite(dur) || !dur) { const sk = wait('seeked', 8000); v.currentTime = 1e7; await sk.catch(() => {}); dur = isFinite(v.duration) && v.duration ? v.duration : v.currentTime; }
      dur = dur || 1;
      const n = Math.max(8, Math.min(want * 2, Math.round(dur / 1.1))), out = [];
      let last = null;
      for (let i = 0; i < n; i++) {
        const sk = wait('seeked', 8000); v.currentTime = Math.max(0, Math.min(dur - 0.05, (i + 0.5) * dur / n)); await sk;
        if (onProg) onProg(i + 1, n);
        if (!v.videoWidth) continue;
        const sg = sig(v); if (last && dist(sg, last) < 7) continue; last = sg;
        const f = await grab(v); if (f) out.push(f);
      }
      return thin(out, want);
    } finally { v.removeAttribute('src'); v.load(); URL.revokeObjectURL(url); }
  }

  /* ---------- разбор ---------- */
  const CAT = (c) => (K().CATS.indexOf(c) >= 0 ? c : 'Другое');
  const newScan = () => ({ items: [], unclear: [], speech: '', note: '', demo: false, part: 0 });
  function merge(scan, d) {
    const got = [];
    ((d && d.items) || []).filter((x) => x && x.name).forEach((x) => {
      const it = { name: String(x.name).slice(0, 60), qty: String(x.qty || ''), cat: CAT(x.cat), zone: x.zone === 'freezer' ? 'freezer' : 'fridge', days: App.num(x.days), on: true, fresh: true };
      const was = scan.items.find((y) => y.name.toLowerCase() === it.name.toLowerCase());
      if (was) { if (it.qty) was.qty = it.qty; if (it.days != null) was.days = it.days; was.zone = it.zone; }
      else { scan.items.push(it); got.push(it); }
    });
    ((d && d.unclear) || []).filter((x) => x && x.what).forEach((x) => {
      if (!scan.unclear.some((u) => u.what === x.what)) scan.unclear.push({ what: String(x.what), why: String(x.why || ''), hint: String(x.hint || ''), busy: false });
    });
    return got;
  }
  const known = (scan) => scan.items.map((x) => x.name + (x.qty ? ' (' + x.qty + ')' : '') + (x.zone === 'freezer' ? ' [морозилка]' : ''));
  async function analyze(scan, frames, parts) {
    scan.part++;
    const r = await App.ai.fridgeScan(frames, { speech: scan.speech, known: known(scan), part: scan.part, parts: parts || scan.part, textOnly: !frames.length });
    if (r.demo) scan.demo = true;
    return merge(scan, r.data);
  }
  const batches = (frames, n) => { const out = []; for (let i = 0; i < frames.length; i += n) out.push(frames.slice(i, i + n)); return out; };

  /* ---------- распознавание речи во время съёмки (Chrome) ---------- */
  function speechRec(onText, onState) {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return null;
    let rec = null, on = false, final = '';
    const start = () => {
      try {
        rec = new SR(); rec.lang = 'ru-RU'; rec.continuous = true; rec.interimResults = true;
        rec.onresult = (e) => {
          let interim = '';
          for (let i = e.resultIndex; i < e.results.length; i++) { const t = e.results[i][0].transcript; if (e.results[i].isFinal) final += (final ? ' ' : '') + t.trim(); else interim += t; }
          onText(final, interim);
        };
        rec.onerror = (e) => { if (e.error === 'not-allowed' || e.error === 'service-not-allowed') { on = false; onState('denied'); } };
        rec.onend = () => { if (on) setTimeout(start, 150); };   // Chrome сам останавливается после паузы — продолжаем
        rec.start(); onState('on');
      } catch (e) { onState('off'); }
    };
    return { start: () => { on = true; start(); }, stop: () => { on = false; try { rec && rec.stop(); } catch (e) {} }, text: () => final };
  }

  /* ---------- выбор способа ---------- */
  // вызывается из нажатия: системный выбор файла должен открыться синхронно
  ui.fridgeVideo = function () {
    const live = ui.liveCam();
    const fromFile = (cap) => ui.openInput({ accept: 'video/*', onFiles: (f) => videoFile(f[0]) }, cap, null);
    const s = sheet({ title: 'Холодильник на видео', detent: 'auto', build: (b) => kidsAdd(b, h('div', { class: 'stack' },
      h('p', { class: 'caption' }, 'Медленно проведите камерой по полкам, дверце и морозилке и называйте вслух, что где лежит и когда куплено. Я составлю список, прикину сроки и посчитаю, на сколько дней хватит продуктов.'),
      h('div', { class: 'list' },
        live ? ui.row({ icon: 'video', color: 'var(--red)', title: 'Снимать с разбором на ходу', sub: 'Список растёт прямо во время съёмки, голос распознаётся', wrap: true, onclick: () => { s.close(); setTimeout(liveScan, 160); } }) : null,
        ui.row({ icon: 'camera', color: 'var(--pink)', title: live ? 'Снять камерой телефона' : 'Снять видео', sub: 'Откроется камера, потом разберу видео', wrap: true, onclick: () => { fromFile(true); s.close(); } }),
        ui.row({ icon: 'photo', color: 'var(--blue)', title: 'Выбрать видео из галереи', sub: 'Лучше до 1–2 минут', wrap: true, onclick: () => { fromFile(false); s.close(); } }),
        ui.row({ icon: 'mic', color: 'var(--purple)', title: 'Только рассказать', sub: 'Перечислите продукты голосом с клавиатуры или текстом', wrap: true, onclick: () => { s.close(); setTimeout(() => talkOnly(), 160); } })))) });
  };

  /* ---------- съёмка с разбором на ходу ---------- */
  function liveScan() {
    const scan = newScan(), pending = [];
    let stream = null, recording = false, busy = false, done = false, timer = null, tick = null, t0 = 0, lastSig = null, lastT = 0, kept = 0, fails = 0;
    const B = Math.min(4, App.ai.maxImages());
    let setMsgFn = () => {}, pump = () => {}, begin = () => {}, finish = () => {};
    const setMsg = (t, k) => setMsgFn(t, k);
    const subs = h('div', { class: 'scan-subs', hidden: true });
    const sr = speechRec((fin, interim) => { scan.speech = fin; subs.textContent = (fin.split(' ').slice(-14).join(' ') + ' ' + interim).trim(); subs.hidden = !subs.textContent; if (!subs.hidden && recording) setMsg('', ''); }, (st) => { if (st === 'denied') setMsg('Микрофон не разрешён — после съёмки можно дописать текстом', 'warn'); });
    const stopAll = () => { recording = false; clearInterval(timer); clearInterval(tick); if (sr) sr.stop(); if (stream) stream.getTracks().forEach((t) => t.stop()); stream = null; };
    const s = sheet({ title: 'Видео холодильника', detent: 'full', bare: true, onClose: () => { if (!done) stopAll(); }, build: (b) => {
      b.style.padding = '0';
      const video = h('video', { class: 'pc-video', autoplay: true, muted: true, playsinline: true }); video.setAttribute('playsinline', ''); video.muted = true;
      const msg = h('div', { class: 'pc-msg' }, 'Запускаю камеру…');
      const found = h('div', { class: 'scan-found' });
      const time = h('div', { class: 'scan-time', hidden: true }, '0:00');
      const status = h('div', { class: 'scan-status', hidden: true });
      const rec = h('button', { class: 'scan-rec', type: 'button', 'aria-label': 'Начать съёмку', disabled: true, onclick: () => (recording ? finish() : begin()) }, h('i'));
      kidsAdd(b, h('div', { class: 'pc-stage' }, video,
        h('div', { class: 'pc-top' }, h('div', { class: 'pc-count' }, h('div', { style: 'font-weight:700;font-size:17px' }, 'Холодильник'), time, status),
          h('div', { class: 'pc-tools' }, h('button', { class: 'pc-btn', type: 'button', 'aria-label': 'Закрыть', onclick: () => s.close() }, icon('xmark', 16)))),
        found, subs,
        h('div', { class: 'cam-bottom' }, h('div', { class: 'cam-msgline' }, msg), h('div', { class: 'cam-bar' }, rec))));
      setMsgFn = (t, kind) => { msg.textContent = t; msg.className = 'pc-msg ' + (kind || ''); msg.hidden = !t; };
      const showFound = (got) => got.forEach((x) => found.appendChild(h('span', { class: 'scan-chip' + (x.zone === 'freezer' ? ' ice' : '') }, x.name)));
      const setStatus = () => { status.hidden = !busy && !pending.length; status.textContent = busy ? 'ИИ смотрит кадры…' : pending.length ? 'Кадров в очереди: ' + pending.length : ''; };
      // отправляем накопившиеся кадры, пока снимаем
      pump = async (force) => {
        if (busy || fails >= 3 || !pending.length || (!force && pending.length < B)) return;
        busy = true; setStatus();
        const part = pending.splice(0, B);
        try { const got = await analyze(scan, part); showFound(got); fails = 0; if (got.length) haptic(8); }
        catch (e) { pending.unshift(...part); fails++; if (e.code === 'not_granted' || fails >= 3) setMsg('Разберу после съёмки', 'warn'); }
        busy = false; setStatus();
        if (recording || force) pump(force);
      };
      const sample = () => {
        if (!video.videoWidth || kept >= 40) return;
        const sg = sig(video), now = Date.now(), d = lastSig ? dist(sg, lastSig) : 99;
        if (d > 12 || (now - lastT > 4000 && d > 4)) {
          lastSig = sg; lastT = now; kept++;
          grab(video).then((f) => { if (!f) return; pending.push(f); setStatus(); pump(false); });
        }
      };
      begin = () => {
        recording = true; t0 = Date.now(); haptic(15); rec.classList.add('on'); rec.setAttribute('aria-label', 'Закончить съёмку');
        time.hidden = false; setMsg(sr ? 'Ведите камерой медленно и говорите, что где лежит' : 'Ведите камерой медленно. Голос здесь не распознаётся — после съёмки можно дописать', '');
        if (sr) sr.start();
        timer = setInterval(sample, 600); sample();
        tick = setInterval(() => { const sec = Math.round((Date.now() - t0) / 1000); time.textContent = Math.floor(sec / 60) + ':' + String(sec % 60).padStart(2, '0'); if (sec >= 180) finish(); }, 500);
      };
      finish = async () => {
        if (!recording) return;
        stopAll(); haptic(15); rec.disabled = true; rec.classList.remove('on');
        if (!kept && !scan.speech) { setMsg('Ничего не снято', 'warn'); rec.disabled = false; return; }
        setMsg('Досматриваю последние кадры…', '');
        const waitBusy = () => new Promise((r) => { const iv = setInterval(() => { if (!busy) { clearInterval(iv); r(); } }, 150); });
        await waitBusy(); fails = 0; await pump(true); await waitBusy();
        done = true; s.close(); setTimeout(() => result(scan, pending.slice()), 160);
      };
      (async () => {
        try {
          stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1440 } }, audio: false });
          if (done) return stopAll();
          video.srcObject = stream; await video.play().catch(() => {});
          rec.disabled = false; setMsg('Нажмите кнопку и начинайте с верхней полки', '');
        } catch (er) {
          setMsg('Камера не запустилась. Разрешите доступ к камере или снимите видео камерой телефона.', 'bad');
          msg.parentNode.appendChild(h('button', { class: 'cam-native big', type: 'button', onclick: () => ui.openInput({ accept: 'video/*', onFiles: (f) => videoFile(f[0]) }, true, () => { done = true; stopAll(); s.close(); }) }, 'Открыть камеру телефона'));
        }
      })();
    } });
  }

  /* ---------- готовое видео: кадры + рассказ текстом ---------- */
  function videoFile(file) {
    if (!file) return;
    const scan = newScan();
    let dict = null;
    if (window.claude && window.claude.use) window.claude.use('dictation').then((d) => { dict = d; if (micBtn) micBtn.hidden = !d; }).catch(() => {});
    let micBtn = null;
    const s = sheet({ title: 'Видео холодильника', build: (b) => {
      const box = h('div', { class: 'stack fade' });
      kidsSet(b, box);
      const want = Math.min(16, App.ai.maxImages() * 4);
      const prog = h('div', { class: 'sub' }, 'Достаю кадры из видео…');
      kidsSet(box, ui.aiWait('Смотрю видео…'), prog);
      framesFromFile(file, want, (i, n) => { prog.textContent = 'Кадр ' + i + ' из ' + n; }).then((frames) => {
        if (!frames.length) throw new Error('empty');
        const strip = h('div', { class: 'scan-strip' }, frames.map((f) => h('img', { src: URL.createObjectURL(f), alt: '' })));
        const ta = h('textarea', { class: 'input-big', id: 'fv-talk', rows: 4, placeholder: 'Что вы говорили на видео? Например: «в синем контейнере вчерашний суп, молоко открыла в понедельник, в морозилке две пачки пельменей»' });
        let hooked = false;
        micBtn = h('button', { class: 'btn sm tinted', type: 'button', hidden: !dict, onclick: () => {
          if (!dict) return;
          if (!hooked) {
            hooked = true;
            dict.onFinal(({ text }) => { ta.value = (ta.value ? ta.value.trim() + ' ' : '') + text; });
            dict.onState(({ state }) => { if (state !== 'listening') micBtn.dataset.on = ''; micBtn.lastChild.textContent = state === 'listening' ? 'Слушаю… нажмите, чтобы закончить' : 'Надиктовать'; });
          }
          if (micBtn.dataset.on === '1') { micBtn.dataset.on = ''; dict.stop().catch(() => {}); } else { micBtn.dataset.on = '1'; dict.start().catch(() => { micBtn.dataset.on = ''; }); }
        } }, icon('mic', 16), h('span', null, 'Надиктовать'));
        kidsSet(box, strip, h('p', { class: 'caption' }, 'Взял ' + frames.length + ' ' + App.plural(frames.length, 'кадр', 'кадра', 'кадров') + ' из видео. Звук из видео я не слышу — если вы что-то рассказывали, повторите здесь. Удобно надиктовать микрофоном на клавиатуре.'),
          ta, micBtn,
          h('button', { class: 'btn primary block', type: 'button', onclick: () => { scan.speech = ta.value.trim(); run(frames); } }, icon('sparkles', 20), 'Разобрать'));
      }).catch((e) => {
        console.error(e);
        kidsSet(box, ui.errorView('Не получилось открыть видео на этом устройстве. Снимите короче (до минуты) в обычном качестве или используйте фото.', null),
          h('button', { class: 'btn gray block', type: 'button', onclick: () => s.close() }, 'Закрыть'));
      });
      const run = async (frames) => {
        const parts = batches(frames, App.ai.maxImages());
        const prog2 = h('div', { class: 'sub' }), list = h('div', { class: 'chips' });
        kidsSet(box, ui.aiWait('Разбираю видео…'), prog2, list);
        try {
          for (let i = 0; i < parts.length; i++) {
            prog2.textContent = 'Часть ' + (i + 1) + ' из ' + parts.length + (scan.items.length ? ' · найдено ' + scan.items.length : '');
            const got = await analyze(scan, parts[i], parts.length);
            got.forEach((x) => list.appendChild(h('span', { class: 'chip c fade', style: { '--c': x.zone === 'freezer' ? 'var(--teal)' : 'var(--green)' } }, x.name)));
          }
          s.close(); setTimeout(() => result(scan, []), 160);
        } catch (e) {
          kidsSet(box, ui.errorView(e.user || 'Не получилось разобрать видео.', () => run(frames)));
        }
      };
    } });
  }

  /* ---------- только рассказ ---------- */
  function talkOnly() {
    const s = sheet({ title: 'Расскажите, что есть', detent: 'auto', build: (b) => {
      const ta = h('textarea', { class: 'input-big', id: 'ft-talk', rows: 5, placeholder: 'Например: «курица полкило, десяток яиц, молоко открыто, в морозилке пельмени и фарш»' });
      kidsAdd(b, h('div', { class: 'stack' }, h('p', { class: 'caption' }, 'Нажмите микрофон на клавиатуре и просто перечислите продукты — я разложу их по местам и прикину сроки.'), ta,
        h('button', { class: 'btn primary block', type: 'button', onclick: async (e) => {
          const t = ta.value.trim(); if (!t) return ta.focus();
          const btn = e.currentTarget; btn.disabled = true; btn.textContent = 'Разбираю…';
          const scan = newScan(); scan.speech = t;
          try { await analyze(scan, []); s.close(); setTimeout(() => result(scan, []), 160); }
          catch (er) { btn.disabled = false; btn.textContent = 'Разобрать'; toast(er.user || 'Не получилось. Попробуйте ещё раз.'); }
        } }, 'Разобрать')));
    } });
  }

  /* ---------- итог: список по зонам → в холодильник ---------- */
  function result(scan, left) {
    let replace = store.state.fridge.length > 0;
    const s = sheet({ title: 'Что в холодильнике', build: (b) => {
      const wrap = h('div', { class: 'stack fade' }); kidsSet(b, wrap);
      const extra = h('textarea', { class: 'input-big', id: 'fr-extra', rows: 3, placeholder: 'Что-то пропущено или неверно? Допишите или надиктуйте: «ещё кастрюля борща, сыр закончился»' });
      const reshoot = (u) => ui.pickPhoto({ capture: true, onFiles: async (f) => {
        u.busy = true; u.err = ''; draw();
        try {
          const r = await App.ai.fridgePhoto(f, { clarify: u, known: scan.items.map((x) => x.name) });
          const before = scan.items.length; scan.unclear.splice(scan.unclear.indexOf(u), 1);
          merge(scan, { items: ((r.data && r.data.items) || []).map((x) => Object.assign({ zone: /морозил/i.test(u.what) ? 'freezer' : 'fridge' }, x)), unclear: r.data && r.data.unclear });
          const n = scan.items.length - before; haptic(10); toast(n ? 'Добавлено: ' + scan.items.slice(-n).map((x) => x.name).join(', ') : 'На снимке ничего нового', n ? { icon: 'check', color: 'var(--green)' } : undefined);
        } catch (e) { u.busy = false; u.err = e.user || 'Не получилось. Попробуйте ещё раз.'; }
        draw();
      } });
      const addText = async (btn) => {
        const t = extra.value.trim(); if (!t) return extra.focus();
        btn.disabled = true; btn.lastChild.textContent = 'Разбираю…';
        const prev = scan.speech; scan.speech = t;
        try { const got = await analyze(scan, []); extra.value = ''; toast(got.length ? 'Добавлено: ' + got.map((x) => x.name).join(', ') : 'Учёл уточнение'); }
        catch (e) { toast(e.user || 'Не получилось. Попробуйте ещё раз.'); }
        scan.speech = prev + ' ' + t; draw();
      };
      const row = (x) => h('button', { class: 'row tap' + (x.fresh ? ' fade' : ''), type: 'button', onclick: () => { x.on = !x.on; haptic(6); draw(); } },
        h('span', { class: 'set' + (x.on ? ' on' : ''), style: 'flex:none' }, x.on ? icon('check', 15) : null),
        h('div', { class: 'row-main' }, h('div', { class: 'row-title' }, x.name), h('div', { class: 'row-sub' }, x.cat + (x.days != null ? ' · ' + K().expiry({ until: App.addDays(App.dkey(), Math.round(x.days)) }).t : ''))),
        h('div', { class: 'row-val' }, x.qty));
      const draw = () => {
        scan.items.forEach((x) => { x.fresh = false; });
        const z = (k) => scan.items.filter((x) => x.zone === k);
        const n = scan.items.filter((x) => x.on).length;
        const zoneBlock = (k, t, ic) => (z(k).length ? [h('div', { class: 'section-head' }, h('h2', null, icon(ic, 20), ' ', t), h('span', { class: 'caption' }, z(k).length + '')), h('div', { class: 'list' }, z(k).map(row))] : []);
        const ask = scan.unclear.length ? [h('div', { class: 'section-head' }, h('h2', null, 'Не разобрал — переснимите')),
          h('div', { class: 'list' }, scan.unclear.map((u) => h('div', { class: 'row has-icon', style: 'align-items:flex-start' },
            h('span', { class: 'ico soft', style: { '--c': 'var(--orange)' } }, icon('info', 18)),
            h('div', { class: 'row-main' }, h('div', { class: 'row-title wrap' }, u.what), h('div', { class: 'row-sub wrap' }, [u.why, u.hint].filter(Boolean).join('. ')),
              u.err ? h('div', { class: 'row-sub wrap', style: 'color:var(--red)' }, u.err) : null,
              h('div', { class: 'btn-row', style: 'margin-top:8px' },
                h('button', { class: 'btn sm tinted', type: 'button', disabled: u.busy, style: '--accent:var(--orange)', onclick: () => reshoot(u) }, icon('camera', 16), u.busy ? 'Разбираю…' : 'Переснять'),
                h('button', { class: 'btn sm gray', type: 'button', disabled: u.busy, onclick: () => { scan.unclear.splice(scan.unclear.indexOf(u), 1); draw(); } }, 'Пропустить'))))))] : [];
        const modeChips = store.state.fridge.length ? h('div', { class: 'chips' }, [[true, 'Заменить список'], [false, 'Добавить к списку']].map(([v, t]) => h('button', { class: 'pillbtn' + (replace === v ? ' on' : ''), type: 'button', onclick: () => { replace = v; draw(); } }, t))) : null;
        const addBtn = h('button', { class: 'btn sm gray', type: 'button', onclick: (e) => addText(e.currentTarget) }, icon('plus', 16), h('span', null, 'Дописать'));
        kidsSet(wrap, scan.demo ? ui.demoBadge() : null,
          scan.items.length ? h('p', { class: 'caption' }, 'Найдено ' + scan.items.length + ' ' + App.plural(scan.items.length, 'продукт', 'продукта', 'продуктов') + '. Снимите галочки с того, что распознано неверно. Сроки — примерные.') : h('p', { class: 'caption' }, 'Продуктов пока не нашлось. Допишите их ниже или переснимите видео ближе и при хорошем свете.'),
          ...zoneBlock('fridge', 'Холодильник', 'fridge'), ...zoneBlock('freezer', 'Морозилка', 'snow'), ...ask,
          scan.speech ? h('details', { class: 'scan-said' }, h('summary', null, 'Что вы сказали'), h('p', null, scan.speech)) : null,
          extra, addBtn,
          scan.demo ? ui.aiNote() : null, modeChips,
          h('button', { class: 'btn primary block', type: 'button', disabled: !n, onclick: () => save(true) }, icon('sparkles', 20), 'Сохранить и посчитать запасы'),
          h('button', { class: 'btn gray block', type: 'button', disabled: !n, onclick: () => save(false) }, 'Только сохранить'));
      };
      const save = (thenStock) => {
        const st = store.state, today = App.dkey();
        const add = scan.items.filter((x) => x.on).map((x) => ({ id: uid(), name: x.name, qty: x.qty, cat: x.cat, zone: x.zone, until: x.days != null ? App.addDays(today, Math.max(0, Math.round(x.days))) : null, added: today }));
        if (replace) st.fridge = add;
        else add.forEach((x) => { const was = st.fridge.find((y) => y.name.toLowerCase() === x.name.toLowerCase()); if (was) Object.assign(was, x, { id: was.id }); else st.fridge.push(x); });
        store.commit(); s.close(); K().open();
        toast('В холодильнике ' + st.fridge.length + ' ' + App.plural(st.fridge.length, 'продукт', 'продукта', 'продуктов'), { icon: 'fridge', color: 'var(--orange)' });
        if (thenStock) setTimeout(() => ui.stock(), 350);
      };
      draw();
    } });
  }

  /* ---------- запасы ---------- */
  ui.stock = function () {
    const st = store.state, t = st.targets || { kcal: 2000, p: 100 };
    sheet({ title: 'Запасы', build: (b) => {
      const go = () => ui.runAI(b, 'Считаю запасы и подбираю блюда…', () => App.ai.stock({ items: st.fridge.map((x) => { const d = K().daysLeft(x); return [x.name, x.qty || '?', x.zone === 'freezer' ? 'морозилка' : 'холодильник', d == null ? '?' : d]; }) }), (d, demo) => {
        const dayW = (v) => (Math.round(v * 10) % 10 ? 'дня' : App.plural(Math.round(v), 'день', 'дня', 'дней'));
        const days = App.num(d.days) != null ? App.num(d.days) : App.num(d.kcalTotal) ? App.num(d.kcalTotal) / t.kcal : null;
        const pd = App.num(d.proteinDays);
        const first = (d.first || []).filter((x) => x && x.name), dishes = (d.dishes || []).filter((x) => x && x.name), buy = (d.buy || []).filter(Boolean);
        const hero = h('div', { class: 'card rise', style: 'text-align:center;padding:22px 16px' },
          h('div', { class: 'caption' }, 'Продуктов хватит примерно на'),
          h('div', { class: 'mid', style: 'font-size:52px;line-height:1.05;margin:6px 0' }, days != null ? nf(days, days < 10 ? 1 : 0) : '—', h('small', { style: 'font-size:20px;margin-left:6px' }, days != null ? dayW(days) : '')),
          h('div', { class: 'sub' }, 'по вашей норме ' + nf(t.kcal) + ' ккал в день' + (App.num(d.kcalTotal) ? ' · всего ≈ ' + nf(App.num(d.kcalTotal)) + ' ккал' : '')),
          pd != null ? h('div', { class: 'chips', style: 'justify-content:center;margin-top:12px' }, h('span', { class: 'chip c', style: { '--c': pd < (days || 0) ? 'var(--orange)' : 'var(--green)' } }, 'Белка — на ' + nf(pd, pd < 10 ? 1 : 0) + ' ' + dayW(pd))) : null,
          d.note ? h('p', { class: 'caption', style: 'margin-top:12px;text-align:left' }, d.note) : null);
        kidsSet(b, h('div', { class: 'stack fade' }, demo ? ui.demoBadge() : null, hero,
          first.length ? h('div', null, ui.head('Съесть в первую очередь'), h('div', { class: 'list' }, first.map((x) => ui.row({ icon: 'info', soft: true, color: 'var(--orange)', title: x.name, sub: x.why, wrap: true })))) : null,
          dishes.length ? h('div', null, ui.head('Что приготовить'), h('div', { class: 'stack' }, dishes.map((r, i) => h('div', { class: 'card tap rise', role: 'button', tabindex: '0', style: { '--i': i }, onclick: () => ui.dish(r, { demo: demo }) },
            h('div', { style: 'display:flex;justify-content:space-between;gap:10px;align-items:flex-start' }, h('div', { style: 'font-weight:700;font-size:18px;line-height:1.2' }, r.name), h('span', { class: 'mid', style: 'font-size:19px;white-space:nowrap' }, nf(r.kcal), h('small', null, 'ккал'))),
            h('div', { class: 'sub', style: 'margin:4px 0 10px' }, (r.time ? r.time + ' мин · ' : '') + K().bju(r)),
            h('div', { class: 'chips' }, (r.uses || []).slice(0, 4).map((u) => h('span', { class: 'chip c', style: { '--c': 'var(--green)' } }, u)), (r.missing || []).map((u) => h('span', { class: 'chip c', style: { '--c': 'var(--orange)' } }, '+ ' + u))))))) : null,
          buy.length ? h('div', null, ui.head('Стоит докупить'), h('div', { class: 'chips' }, buy.map((x) => h('span', { class: 'chip' }, x))),
            h('button', { class: 'btn tinted block', type: 'button', style: 'margin-top:10px', onclick: (e) => {
              const have = st.shopping.map((x) => x.name.toLowerCase()); let n = 0;
              buy.forEach((x) => { if (have.indexOf(String(x).toLowerCase()) < 0) { st.shopping.push({ id: uid(), name: String(x), qty: '', done: false }); n++; } });
              store.commit(); e.currentTarget.disabled = true; toast(n ? 'В списке покупок +' + n : 'Уже в списке', { icon: 'cart', color: 'var(--blue)' });
            } }, icon('cart', 20), 'В список покупок')) : null,
          demo ? ui.aiNote() : null,
          h('button', { class: 'btn gray block', type: 'button', onclick: go }, icon('refresh', 20), 'Пересчитать')));
      });
      go();
    } });
  };
})();
