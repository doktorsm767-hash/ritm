/* Ритм — ядро: DOM-помощники, пружинная анимация, хранилище, вкладки, листы, компоненты. */
(function () {
  'use strict';
  const App = (window.App = { memo: {}, tabs: [], ui: {} });
  const RM = window.matchMedia ? matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };
  const still = () => RM.matches || document.visibilityState === 'hidden';

  /* ---------- DOM ---------- */
  function append(el, kid) {
    if (kid == null || kid === false || kid === true) return;
    if (Array.isArray(kid)) { for (const k of kid) append(el, k); return; }
    el.appendChild(kid.nodeType ? kid : document.createTextNode(String(kid)));
  }
  function h(tag, attrs) {
    const el = document.createElement(tag);
    if (attrs) for (const k in attrs) {
      const v = attrs[k];
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'style') {
        if (typeof v === 'string') el.style.cssText = v;
        else for (const s in v) { if (s.startsWith('--')) el.style.setProperty(s, v[s]); else el.style[s] = v[s]; }
      }
      else if (k === 'text') el.textContent = v;
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
      else if (k === 'value' || k === 'checked' || k === 'disabled' || k === 'hidden') el[k] = v;
      else el.setAttribute(k, v === true ? '' : v);
    }
    for (let i = 2; i < arguments.length; i++) append(el, arguments[i]);
    return el;
  }

  /* ---------- иконки (собственные, линейные) ---------- */
  const I = {
    rings: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4.6"/>',
    food: '<path d="M6 3v6a2.5 2.5 0 0 0 5 0V3M8.5 11.5V21M17.5 3c-1.9 1.3-3.2 3.7-3.2 7 0 1.7 1.1 2.6 3.2 2.6V21"/>',
    dumbbell: '<path d="M2.8 10v4M6 6.8v10.4M18 6.8v10.4M21.2 10v4M6 12h12"/>',
    heart: '<path d="M12 20.3s-7.6-4.5-7.6-10.1A4.3 4.3 0 0 1 12 7.5a4.3 4.3 0 0 1 7.6 2.7c0 5.6-7.6 10.1-7.6 10.1z"/>',
    pulse: '<path d="M3 12.5h3.6l2-5 3.3 10 2.4-6.2 1.3 1.2H21"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    scan: '<path d="M4 8V6.5A2.5 2.5 0 0 1 6.500 4H8M16 4h1.500A2.5 2.5 0 0 1 20 6.500V8M20 16v1.500a2.500 2.500 0 0 1-2.500 2.500H16M8 20H6.500A2.500 2.500 0 0 1 4 17.500V16M8 9v6M11 9v6M13.500 9v6M16 9v6"/>',
    drop: '<path d="M12 3.4s6 6.300 6 10.600a6 6 0 0 1-12 0c0-4.300 6-10.600 6-10.600z"/>',
    moon: '<path d="M20 14.600A8.500 8.500 0 1 1 9.400 4 7 7 0 0 0 20 14.600z"/>',
    walk: '<circle cx="13.5" cy="4.6" r="1.7"/><path d="M12.600 8.200l-3.200 2.200-1.100 3.200M12.600 8.200l1.100 4.900 3.300 2.300.900 4.300M13.500 12.500l-1.800 3.900-3.300 3.400M13.200 9.800l2.500 2.300 3-.400"/>',
    scale: '<path d="M5.500 4h13A2.500 2.500 0 0 1 21 6.500v11a2.500 2.500 0 0 1-2.500 2.500h-13A2.500 2.500 0 0 1 3 17.500v-11A2.500 2.500 0 0 1 5.500 4zM8.300 9.200a5.200 5.200 0 0 1 7.400 0l-2.200 2.600h-3l-2.200-2.600z"/>',
    pill: '<path d="M4.300 12.700l8.400-8.400a4.950 4.950 0 0 1 7 7l-8.400 8.400a4.950 4.950 0 0 1-7-7zM8.500 8.500l7 7"/>',
    flask: '<path d="M9 3h6M10 3v6l-5.200 9a2 2 0 0 0 1.800 3h10.800a2 2 0 0 0 1.800-3L14 9V3M7.300 15h9.400"/>',
    fridge: '<path d="M7.500 3h9A2.500 2.500 0 0 1 19 5.500v13a2.500 2.500 0 0 1-2.500 2.500h-9A2.500 2.500 0 0 1 5 18.500v-13A2.500 2.500 0 0 1 7.500 3zM5 10h14M8.500 6v1.800M8.500 13v3"/>',
    camera: '<path d="M4.500 8H7l1.600-2.500h6.800L17 8h2.500A1.500 1.500 0 0 1 21 9.500v8a1.500 1.500 0 0 1-1.500 1.500h-15A1.500 1.500 0 0 1 3 17.500v-8A1.500 1.500 0 0 1 4.500 8z"/><circle cx="12" cy="13.200" r="3.400"/>',
    photo: '<path d="M5.500 4h13A2.500 2.500 0 0 1 21 6.500v11a2.500 2.500 0 0 1-2.500 2.500h-13A2.500 2.500 0 0 1 3 17.500v-11A2.500 2.500 0 0 1 5.500 4zM3.500 16.500l4.500-4.500 4 4 3-3 5.500 5.500"/><circle cx="15.600" cy="8.800" r="1.200"/>',
    chevR: '<path d="M9 5l7 7-7 7"/>', chevL: '<path d="M15 5l-7 7 7 7"/>', chevD: '<path d="M5 9l7 7 7-7"/>',
    xmark: '<path d="M6 6l12 12M18 6L6 18"/>',
    check: '<path d="M5 12.600l4.600 4.600L19 7.400"/>',
    person: '<circle cx="12" cy="8" r="4"/><path d="M4.500 20.500c1-3.600 4-5.500 7.500-5.500s6.500 1.900 7.500 5.500"/>',
    sparkles: '<path d="M11 3.500l1.900 4.900 4.900 1.900-4.900 1.900L11 17.100l-1.900-4.900-4.900-1.900 4.900-1.900L11 3.500zM18.500 14.500l.900 2.100 2.100.900-2.100.900-.900 2.100-.900-2.100-2.100-.900 2.100-.900.900-2.100z"/>',
    cart: '<path d="M3 4.500h2.300l2.300 10.300h9.900l1.900-7.300H6.600"/><circle cx="9.500" cy="19" r="1.300"/><circle cx="16.500" cy="19" r="1.300"/>',
    trash: '<path d="M5 7h14M10 4h4M6.800 7l.900 11.600A1.500 1.500 0 0 0 9.200 20h5.600a1.500 1.500 0 0 0 1.500-1.400L17.200 7M10.300 11v5.500M13.700 11v5.500"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7.300V12l3.200 2"/>',
    flame: '<path d="M12.200 3c.800 3.600 5 5.600 5 10.300A5.100 5.100 0 0 1 12 21a5.100 5.100 0 0 1-5.200-5c0-2.200 1.200-3.600 2.300-4.700.300 1.700 1.200 2.500 1.900 2.600-.700-3.300-.100-8 1.200-10.900z"/>',
    chart: '<path d="M4 19.500V5M4 19.500h16M7.800 15.200l3.500-4.200 3 2.500 4.400-5.500"/>',
    pencil: '<path d="M4 20l1.100-4.200L16.400 4.500a2.100 2.100 0 0 1 3 3L8.200 18.900 4 20zM14.500 6.500l3 3"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5.500M12 7.700v.200"/>',
    calendar: '<path d="M5.500 5h13A2.500 2.500 0 0 1 21 7.500v11a2.500 2.500 0 0 1-2.500 2.500h-13A2.500 2.500 0 0 1 3 18.500v-11A2.500 2.500 0 0 1 5.500 5zM3 10h18M8 3v4M16 3v4"/>',
    sliders: '<path d="M4 7h9M17.500 7H20M4 17h2.500M11 17h9M15.300 4.500v5M8.700 14.500v5"/>',
    play: '<path d="M8 5.200v13.600l11-6.800-11-6.800z"/>',
    pause: '<path d="M8.500 5v14M15.500 5v14"/>',
    bolt: '<path d="M13 3L5 13.500h6L10 21l8-10.500h-6L13 3z"/>',
    list: '<path d="M9 7h11M9 12h11M9 17h11M4.500 7h.010M4.500 12h.010M4.500 17h.010"/>',
    up: '<path d="M12 19V5M6 11l6-6 6 6"/>', down: '<path d="M12 5v14M6 13l6 6 6-6"/>',
    bed: '<path d="M3 18.500V6.500M3 14h18v4.500M21 14v-1.500a3 3 0 0 0-3-3h-7V14"/><circle cx="7" cy="11" r="1.600"/>',
    share: '<path d="M12 15V4M8 8l4-4 4 4M5 13v4.500A2.500 2.500 0 0 0 7.500 20h9a2.500 2.500 0 0 0 2.500-2.500V13"/>',
    key: '<circle cx="8" cy="15" r="4"/><path d="M11 12.200L19.500 4M16 7.500l2.500 2.500"/>',
    leaf: '<path d="M5 19c0-8 5-13 15-14-.500 9.500-5 15-13 14.500M5 19c2-4 5-7 9-9"/>',
    doc: '<path d="M7 3h7l5 5v10.500A2.500 2.500 0 0 1 16.500 21h-9A2.500 2.500 0 0 1 5 18.500v-13A2.500 2.500 0 0 1 7 3zM14 3v5h5M8.500 13h7M8.500 16.500h5"/>',
    refresh: '<path d="M19.500 12a7.500 7.500 0 1 1-2.200-5.300M19.500 4.500v4h-4"/>',
    barcode: '<path d="M4 6v12M7 6v12M10.500 6v12M13 6v12M16.500 6v12M20 6v12"/>',
    target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
    stop: '<rect x="6.500" y="6.500" width="11" height="11" rx="2.500"/>'
  };
  const FILLED = new Set(['sparkles', 'play', 'bolt', 'flame', 'stop']);
  function icon(name, size) {
    const s = size || 24, f = FILLED.has(name);
    const t = document.createElement('template');
    t.innerHTML = '<svg viewBox="0 0 24 24" width="' + s + '" height="' + s + '" fill="' + (f ? 'currentColor' : 'none') +
      '" stroke="' + (f ? 'none' : 'currentColor') + '" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      (I[name] || I.info) + '</svg>';
    return t.content.firstChild;
  }

  /* ---------- утилиты ---------- */
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const pad = (n) => String(n).padStart(2, '0');
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const dkey = (d) => { d = d || new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); };
  const parseKey = (k) => { const p = String(k).split('-').map(Number); return new Date(p[0], (p[1] || 1) - 1, p[2] || 1); };
  const addDays = (k, n) => { const d = parseKey(k); d.setDate(d.getDate() + n); return dkey(d); };
  const fmtDate = (k, o) => parseKey(k).toLocaleDateString('ru-RU', o || { day: 'numeric', month: 'long' });
  const nf = (v, dec) => (v == null || isNaN(v)) ? '—' : Number(v).toLocaleString('ru-RU', { minimumFractionDigits: 0, maximumFractionDigits: dec == null ? 0 : dec });
  const num = (v) => { if (typeof v === 'number') return v; const n = parseFloat(String(v == null ? '' : v).replace(',', '.').replace(/[^\d.\-]/g, '')); return isNaN(n) ? null : n; };
  const plural = (n, a, b, c) => { n = Math.abs(n) % 100; const k = n % 10; return n > 10 && n < 20 ? c : k === 1 ? a : k >= 2 && k <= 4 ? b : c; };
  const haptic = (ms) => { try { const ua = navigator.userActivation; if (navigator.vibrate && (!ua || ua.hasBeenActive)) navigator.vibrate(ms || 8); } catch (e) {} };

  /* ---------- пружина: response/damping как у Apple, прерываемая, с передачей скорости ---------- */
  function spring(o) {
    const resp = o.response || 0.4, zeta = o.damping == null ? 1 : o.damping;
    const k = Math.pow((2 * Math.PI) / resp, 2), c = (4 * Math.PI * zeta) / resp;
    let x = o.from, v = o.velocity || 0, to = o.to, raf = 0, done = false, last = 0, ticked = false, guard = 0, starve = 0;
    const prec = o.precision || 0.01;
    const finish = () => { done = true; clearTimeout(guard); clearTimeout(starve); x = to; o.onUpdate(x, 0); if (o.onRest) o.onRest(); };
    if (still() || x === to && !v) { finish(); return { stop() {}, value: () => to, velocity: () => 0 }; }
    function frame(now) {
      if (done) return;
      ticked = true;
      if (document.visibilityState === 'hidden') return finish();
      let dt = Math.min(0.064, (now - last) / 1000); last = now;
      const n = Math.max(1, Math.ceil(dt / 0.004)), hs = dt / n;
      for (let i = 0; i < n; i++) { const a = -k * (x - to) - c * v; v += a * hs; x += v * hs; }
      if (Math.abs(x - to) < prec && Math.abs(v) < prec * 20) return finish();
      o.onUpdate(x, v);
      raf = requestAnimationFrame(frame);
    }
    last = performance.now();
    raf = requestAnimationFrame(frame);
    // страховка: если кадры не идут (страница в фоне, снимок превью), сразу показываем конечное состояние
    starve = setTimeout(() => { if (!done && !ticked) { cancelAnimationFrame(raf); finish(); } }, 160);
    guard = setTimeout(() => { if (!done) { cancelAnimationFrame(raf); finish(); } }, 2500);
    return { stop() { if (!done) { done = true; cancelAnimationFrame(raf); clearTimeout(guard); clearTimeout(starve); } }, value: () => x, velocity: () => v };
  }
  // проекция импульса: куда «долетит» жест (формула из Designing Fluid Interfaces)
  const project = (v, d) => { d = d || 0.998; return (v / 1000) * d / (1 - d); };
  const rubber = (over, dim, c) => { c = c || 0.55; return (over * dim * c) / (dim + c * Math.abs(over)); };

  // анимация значения с памятью: продолжает с того, что было на экране
  function animateValue(id, to, set, o) {
    const from = id && App.memo[id] != null ? App.memo[id] : (o && o.from != null ? o.from : 0);
    if (id) App.memo[id] = to;
    set(from);
    if (from === to) return;
    spring(Object.assign({ from: from, to: to, response: 0.75, damping: 0.86, precision: 0.001, onUpdate: set }, o || {}));
  }
  function countUp(el, to, o) {
    o = o || {};
    const dec = o.decimals || 0;
    animateValue(o.id, to, (v) => { el.textContent = nf(v, dec) + (o.suffix || ''); }, { response: 0.6, damping: 1, precision: dec ? 0.01 : 0.4 });
    return el;
  }

  /* ---------- хранилище ---------- */
  const KEY = 'ritm.state.v1';
  const blankDay = () => ({ food: [], water: 0, sleep: null, steps: null, meds: {} });
  const defaults = () => ({
    v: 1, profile: null, targets: null, days: {}, weights: [], vitals: [], labs: [], meds: [],
    fridge: [], shopping: [], mealPlan: null, trainPlan: null, workouts: [], demo: false,
    settings: { theme: 'auto' }
  });
  const store = {
    state: defaults(), subs: new Set(), _t: 0,
    load() {
      try {
        const raw = localStorage.getItem(KEY);
        if (raw) { const s = JSON.parse(raw); this.state = Object.assign(defaults(), s); this.state.settings = Object.assign(defaults().settings, s.settings || {}); }
      } catch (e) { /* нет доступа к хранилищу — работаем в памяти */ }
    },
    save() {
      clearTimeout(this._t);
      this._t = setTimeout(() => { try { localStorage.setItem(KEY, JSON.stringify(this.state)); } catch (e) {} }, 120);
    },
    commit() { this.state.updatedAt = Date.now(); this.save(); this.subs.forEach((f) => { try { f(); } catch (e) { console.error(e); } }); },
    day(k) { k = k || dkey(); const d = this.state.days; return d[k] || (d[k] = blankDay()); },
    peek(k) { return this.state.days[k || dkey()] || blankDay(); },
    replace(s) { this.state = Object.assign(defaults(), s); this.commit(); },
    reset() { this.state = defaults(); App.memo = {}; this.commit(); }
  };

  /* ---------- кольцо, шкала, графики ---------- */
  function ring(o) {
    const size = o.size || 120, sw = o.stroke || 14, r = (size - sw) / 2, C = 2 * Math.PI * r, m = size / 2;
    const el = h('div', { class: 'ring', style: { width: size + 'px', height: size + 'px', '--c': o.color || 'var(--accent)' } });
    const t = document.createElement('template');
    t.innerHTML = '<svg width="' + size + '" height="' + size + '" viewBox="0 0 ' + size + ' ' + size + '"><circle class="track" cx="' + m + '" cy="' + m + '" r="' + r +
      '" stroke-width="' + sw + '"/><circle class="bar" cx="' + m + '" cy="' + m + '" r="' + r + '" stroke-width="' + sw + '" stroke-dasharray="' + C + '" stroke-dashoffset="' + C + '"/></svg>';
    el.appendChild(t.content.firstChild);
    const bar = el.querySelector('.bar');
    animateValue(o.id, clamp(o.value || 0, 0, 1), (f) => { bar.style.strokeDashoffset = C * (1 - clamp(f, 0, 1)); bar.style.opacity = f <= 0.002 ? 0 : 1; });
    if (o.center) el.appendChild(h('div', { class: 'ring-center' }, o.center));
    return el;
  }
  function bar(o) {
    const fill = h('i');
    const el = h('div', { class: 'bar', style: { '--c': o.color || 'var(--accent)' } }, fill);
    animateValue(o.id, clamp(o.value || 0, 0, 1), (f) => { fill.style.transform = 'scaleX(' + clamp(f, 0, 1) + ')'; });
    return el;
  }
  function svgEl(markup) { const t = document.createElement('template'); t.innerHTML = markup; return t.content.firstChild; }
  function spark(values, color) {
    const W = 120, H = 36, vals = values.filter((v) => v != null);
    if (vals.length < 2) return svgEl('<svg class="spark" viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none"><path d="M2 ' + (H - 6) + 'H' + (W - 2) + '" stroke="var(--fill-2)" stroke-width="2" stroke-dasharray="3 5" fill="none" stroke-linecap="round"/></svg>');
    const mn = Math.min.apply(null, vals), mx = Math.max.apply(null, vals), span = mx - mn || 1;
    const pts = vals.map((v, i) => [3 + (i * (W - 6)) / (vals.length - 1), 5 + (1 - (v - mn) / span) * (H - 10)]);
    const d = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join('');
    const lp = pts[pts.length - 1];
    return svgEl('<svg class="spark" viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none" style="color:' + color + '"><path d="' + d + '" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke"/><circle cx="' + lp[0].toFixed(1) + '" cy="' + lp[1].toFixed(1) + '" r="3" fill="currentColor"/></svg>');
  }
  // линейный график: points = [{label, y, y2?}], band = [min,max] подсветка нормы
  function lineChart(points, o) {
    o = o || {};
    const W = 340, H = 150, L = 34, R = 10, T = 12, B = 22;
    const ys = []; points.forEach((p) => { if (p.y != null) ys.push(p.y); if (p.y2 != null) ys.push(p.y2); });
    if (o.band) { ys.push(o.band[0]); ys.push(o.band[1]); }
    if (!ys.length) return h('div', { class: 'sub', style: 'padding:20px 0;text-align:center' }, 'Пока нет данных');
    let mn = Math.min.apply(null, ys), mx = Math.max.apply(null, ys);
    const padY = (mx - mn || Math.abs(mx) * 0.1 || 1) * 0.18; mn -= padY; mx += padY;
    const X = (i) => points.length === 1 ? (L + (W - R)) / 2 : L + (i * (W - L - R)) / (points.length - 1);
    const Y = (v) => T + (1 - (v - mn) / (mx - mn)) * (H - T - B);
    const col = o.color || 'var(--accent)', gid = 'g' + uid();
    let s = '<svg class="chart" viewBox="0 0 ' + W + ' ' + H + '" role="img" style="color:' + col + ';height:auto">';
    s += '<defs><linearGradient id="' + gid + '" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="currentColor" stop-opacity=".28"/><stop offset="1" stop-color="currentColor" stop-opacity="0"/></linearGradient></defs>';
    if (o.band) s += '<rect x="' + L + '" y="' + Y(o.band[1]).toFixed(1) + '" width="' + (W - L - R) + '" height="' + Math.max(2, Y(o.band[0]) - Y(o.band[1])).toFixed(1) + '" rx="4" fill="var(--green)" opacity=".13"/>';
    for (let g = 0; g < 3; g++) {
      const v = mn + ((mx - mn) * (g + 0.5)) / 3, y = Y(v).toFixed(1);
      s += '<line class="grid" x1="' + L + '" x2="' + (W - R) + '" y1="' + y + '" y2="' + y + '"/><text x="' + (L - 6) + '" y="' + (+y + 3.5) + '" text-anchor="end">' + nf(v, o.decimals == null ? 0 : o.decimals) + '</text>';
    }
    const path = (key) => points.map((p, i) => p[key] == null ? '' : [X(i), Y(p[key])]).filter(Boolean);
    const draw = (pts, c, fillIt) => {
      if (!pts.length) return '';
      const d = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join('');
      let out = '';
      if (fillIt && pts.length > 1) out += '<path d="' + d + 'L' + pts[pts.length - 1][0].toFixed(1) + ' ' + (H - B) + 'L' + pts[0][0].toFixed(1) + ' ' + (H - B) + 'Z" fill="url(#' + gid + ')"/>';
      out += '<path d="' + d + '" fill="none" stroke="' + c + '" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>';
      pts.forEach((p, i) => { const lastP = i === pts.length - 1; out += '<circle cx="' + p[0].toFixed(1) + '" cy="' + p[1].toFixed(1) + '" r="' + (lastP ? 4.5 : 2.6) + '" fill="' + (lastP ? c : 'var(--card-elev)') + '" stroke="' + c + '" stroke-width="2"/>'; });
      return out;
    };
    s += draw(path('y'), 'currentColor', true);
    if (points.some((p) => p.y2 != null)) s += draw(path('y2'), o.color2 || 'var(--blue)', false);
    const step = Math.max(1, Math.ceil(points.length / 5));
    points.forEach((p, i) => { if (i % step === 0 || i === points.length - 1) s += '<text x="' + X(i).toFixed(1) + '" y="' + (H - 6) + '" text-anchor="' + (i === 0 ? 'start' : i === points.length - 1 ? 'end' : 'middle') + '">' + String(p.label).replace(/[<>&]/g, '') + '</text>'; });
    return svgEl(s + '</svg>');
  }

  /* ---------- сегментированный переключатель ---------- */
  function seg(items, value, onChange) {
    const el = h('div', { class: 'seg', role: 'tablist' });
    const thumb = h('div', { class: 'seg-thumb', style: { width: 'calc((100% - 4px)/' + items.length + ')' } });
    el.appendChild(thumb);
    let idx = Math.max(0, items.findIndex((i) => i.id === value)), pos = idx, anim = null;
    const setPos = (p) => { pos = p; thumb.style.transform = 'translateX(' + p * 100 + '%)'; };
    setPos(idx);
    const btns = items.map((it, i) => {
      const b = h('button', { class: i === idx ? 'on' : '', role: 'tab', type: 'button', onclick: () => {
        if (i === idx) return;
        btns[idx].classList.remove('on'); b.classList.add('on'); idx = i; haptic(6);
        if (anim) anim.stop();
        anim = spring({ from: pos, to: i, response: 0.32, damping: 0.82, precision: 0.002, onUpdate: setPos });
        onChange(it.id);
      } }, it.label);
      el.appendChild(b); return b;
    });
    return el;
  }

  /* ---------- линейка-пикер (нативная инерция прокрутки) ---------- */
  function ruler(o) {
    const TICK = 10, step = o.step || 1, dec = o.decimals || 0, major = o.major || 10;
    const n = Math.round((o.max - o.min) / step);
    const valEl = h('span', { class: 'big' });
    const track = h('div', { class: 'ruler-track' });
    for (let i = 0; i <= n; i++) {
      const m = i % major === 0;
      track.appendChild(h('div', { class: 'tick' + (m ? ' m' : '') }, m ? h('b', null, nf(o.min + i * step, 0)) : null));
    }
    const sc = h('div', { class: 'ruler-scroll', tabindex: '0', role: 'slider', 'aria-label': o.label || '', 'aria-valuemin': o.min, 'aria-valuemax': o.max }, track);
    let val = clamp(o.value, o.min, o.max), ready = false;
    const show = () => { valEl.replaceChildren(nf(val, dec), h('small', null, o.unit || '')); sc.setAttribute('aria-valuenow', val); };
    show();
    sc.addEventListener('scroll', () => {
      if (!ready) return;
      const v = clamp(+(o.min + Math.round(sc.scrollLeft / TICK) * step).toFixed(dec), o.min, o.max);
      if (v !== val) { val = v; show(); if (o.onChange) o.onChange(v); }
    }, { passive: true });
    sc.addEventListener('keydown', (e) => { if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { sc.scrollLeft += (e.key === 'ArrowRight' ? 1 : -1) * TICK; e.preventDefault(); } });
    const place = (tries) => {
      if (ready) return;
      if (!sc.clientWidth) { if (tries > 0) setTimeout(() => place(tries - 1), 50); return; }
      sc.scrollLeft = ((val - o.min) / step) * TICK; ready = true;
    };
    requestAnimationFrame(() => place(40)); setTimeout(() => place(40), 90);
    return h('div', { class: 'ruler-wrap no-drag' }, h('div', { class: 'ruler-val' }, valEl), h('div', { class: 'ruler' }, sc));
  }

  /* ---------- листы ---------- */
  const stack = [];
  function sheet(o) {
    const host = document.getElementById('sheets'), root = document.getElementById('root'), app = document.getElementById('app');
    const detent = o.detent || 'large', locked = !!o.locked;
    const wrap = h('div', { class: 'sheet-wrap' });
    const scrim = h('div', { class: 'sheet-scrim' });
    const panel = h('div', { class: 'sheet ' + detent, role: 'dialog', 'aria-modal': 'true', 'aria-label': o.title || 'Окно' });
    const body = h('div', { class: 'sheet-body' });
    const titleEl = h('div', { class: 'sheet-title' }, o.title || '');
    const l = h('div', { class: 'l' }), r = h('div', { class: 'r' });
    const api = { body: body, panel: panel, close: close, setTitle: (t) => { titleEl.textContent = t; }, left: l, right: r, foot: null };
    if (!locked) r.appendChild(h('button', { class: 'close-x', type: 'button', 'aria-label': 'Закрыть', onclick: () => close() }, icon('xmark', 14)));
    const grab = h('div', { class: 'sheet-grab' }, locked ? null : h('i'));
    const head = h('div', { class: 'sheet-head' }, l, titleEl, r);
    if (o.bare) { panel.appendChild(body); body.style.padding = '0'; }
    else panel.append(grab, head, body);
    if (o.foot) { api.foot = h('div', { class: 'sheet-foot' }); panel.appendChild(api.foot); }
    wrap.append(scrim, panel); host.appendChild(wrap);
    const pushBack = detent === 'large' && stack.length === 0;
    let H = 0, y = 0, anim = null, closed = false;
    stack.push(api);

    function apply(yy) {
      y = yy;
      panel.style.transform = 'translate3d(0,' + yy.toFixed(2) + 'px,0)';
      const p = H ? clamp(1 - yy / H, 0, 1) : 0;
      scrim.style.opacity = detent === 'full' ? 0 : 0.42 * p;
      if (pushBack) {
        root.style.transform = p > 0.001 ? 'translateY(' + (10 * p).toFixed(2) + 'px) scale(' + (1 - 0.065 * p).toFixed(4) + ')' : '';
        root.style.borderRadius = p > 0.001 ? (26 * p).toFixed(1) + 'px' : '';
      }
    }
    function open() {
      H = panel.offsetHeight || 600;
      if (pushBack) app.style.background = '#000';
      apply(H);
      anim = spring({ from: H, to: 0, response: 0.44, damping: 0.88, precision: 0.3, onUpdate: apply });
    }
    function close(v) {
      if (closed) return; closed = true;
      H = panel.offsetHeight || H; if (anim) anim.stop();
      wrap.style.pointerEvents = 'none';
      const i = stack.indexOf(api); if (i >= 0) stack.splice(i, 1);
      anim = spring({ from: y, to: H + 24, velocity: v || 0, response: 0.36, damping: 1, precision: 0.5, onUpdate: apply, onRest: () => {
        wrap.remove();
        if (pushBack) { root.style.transform = ''; root.style.borderRadius = ''; app.style.background = ''; }
        if (o.onClose) o.onClose();
      } });
    }

    // жест: лист следует за пальцем, отпускание передаёт скорость пружине
    let samples = [], base = 0, dragging = false;
    const track = (cy) => { const t = performance.now(); samples.push([t, cy]); while (samples.length > 6 || (samples.length > 2 && t - samples[0][0] > 120)) samples.shift(); };
    const vel = () => { if (samples.length < 2) return 0; const a = samples[0], b = samples[samples.length - 1]; const dt = (b[0] - a[0]) / 1000; return dt > 0.005 ? (b[1] - a[1]) / dt : 0; };
    const startDrag = (cy) => { H = panel.offsetHeight || H; if (anim) anim.stop(); base = y; samples = []; track(cy); dragging = true; };
    const moveDrag = (dy) => { let ny = base + dy; if (ny < 0) ny = -rubber(-ny, H, 0.25); apply(ny); };
    const endDrag = () => {
      dragging = false; const v = vel(), proj = y + project(v);
      if (proj > H * 0.5 || (v > 900 && y > 24)) close(v);
      else anim = spring({ from: y, to: 0, velocity: v, response: 0.38, damping: 0.84, precision: 0.3, onUpdate: apply });
    };
    if (!locked) {
      scrim.addEventListener('click', () => close());
      [grab, head].forEach((z) => {
        let sy = 0, pid = null;
        z.addEventListener('pointerdown', (e) => { if (e.target.closest('button,a,input')) return; pid = e.pointerId; try { z.setPointerCapture(pid); } catch (er) {} sy = e.clientY; startDrag(sy); });
        z.addEventListener('pointermove', (e) => { if (e.pointerId !== pid || !dragging) return; track(e.clientY); moveDrag(e.clientY - sy); });
        const up = (e) => { if (e.pointerId !== pid) return; pid = null; if (dragging) endDrag(); };
        z.addEventListener('pointerup', up); z.addEventListener('pointercancel', up);
      });
      let ts = null;
      body.addEventListener('touchstart', (e) => { ts = e.touches.length === 1 ? { y: e.touches[0].clientY, x: e.touches[0].clientX, drag: false, ok: body.scrollTop <= 0 } : null; }, { passive: true });
      body.addEventListener('touchmove', (e) => {
        if (!ts || !ts.ok) return;
        const t = e.touches[0], dy = t.clientY - ts.y, dx = t.clientX - ts.x;
        if (!ts.drag) {
          if (dy > 8 && Math.abs(dy) > Math.abs(dx) * 1.3 && body.scrollTop <= 0 && !e.target.closest('.no-drag,input[type=range],textarea')) { ts.drag = true; ts.y = t.clientY; startDrag(t.clientY); }
          else if (dy < -4 || Math.abs(dx) > 12) ts.ok = false;
          return;
        }
        if (e.cancelable) e.preventDefault();
        track(t.clientY); moveDrag(t.clientY - ts.y);
      }, { passive: false });
      const tend = () => { if (ts && ts.drag) endDrag(); ts = null; };
      body.addEventListener('touchend', tend); body.addEventListener('touchcancel', tend);
    }
    if (o.build) o.build(body, api);
    open();
    return api;
  }
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && stack.length) { const top = stack[stack.length - 1]; if (!top.panel.classList.contains('full')) top.close(); } });

  // подтверждение (системные confirm/alert на странице недоступны)
  function confirmSheet(o) {
    return new Promise((res) => {
      let answered = false;
      const s = sheet({ title: o.title || 'Подтвердите', detent: 'auto', onClose: () => { if (!answered) res(false); }, build: (b) => {
        b.append(
          o.text ? h('p', { class: 'muted', style: 'text-align:center;font-size:15px;line-height:1.4;margin:0 8px 16px' }, o.text) : null,
          h('div', { class: 'stack', style: 'gap:8px' },
            h('button', { class: 'btn block ' + (o.danger ? 'gray danger' : 'primary'), type: 'button', onclick: () => { answered = true; res(true); s.close(); } }, o.ok || 'Да'),
            h('button', { class: 'btn block gray', type: 'button', onclick: () => s.close() }, 'Отмена'))
        );
      } });
    });
  }

  /* ---------- тост ---------- */
  function toast(text, o) {
    o = o || {};
    const host = document.getElementById('toasts');
    const t = h('div', { class: 'toast', role: 'status' }, h('span', { class: 'ico', style: { '--c': o.color || 'var(--green)' } }, icon(o.icon || 'check', 15)), text);
    host.appendChild(t);
    const set = (yy) => { t.style.transform = 'translateY(' + yy.toFixed(1) + 'px)'; t.style.opacity = clamp(1 + yy / 60, 0, 1); };
    set(-70);
    spring({ from: -70, to: 0, response: 0.42, damping: 0.72, onUpdate: set });
    setTimeout(() => spring({ from: 0, to: -80, response: 0.3, damping: 1, onUpdate: set, onRest: () => t.remove() }), o.ms || 2200);
  }

  /* ---------- вкладки ---------- */
  let current = null, thumbPos = 0, thumbAnim = null, pendingRefresh = 0;
  function registerTab(def) { App.tabs.push(def); }
  function renderTab(tab, first) {
    if (!store.state.profile || !store.state.targets) return;
    const v = tab.el, st = v.scrollTop;
    const d = tab.render() || {};
    const p = store.state.profile;
    const avatar = h('button', { class: 'avatar', type: 'button', 'aria-label': 'Профиль', onclick: () => App.ui.profile && App.ui.profile() }, p && p.name ? p.name.trim().charAt(0).toUpperCase() : icon('person', 18));
    v.classList.toggle('no-anim', !first);
    v.replaceChildren(
      h('div', { class: 'navbar' }, h('div', { class: 'nav-side' }), h('div', { class: 'nav-title' }, d.title || tab.title), h('div', { class: 'nav-side' }, d.right || null)),
      h('div', { class: 'gutter' },
        h('div', { class: 'large-title' }, h('div', null, d.eyebrow ? h('div', { class: 'eyebrow' }, d.eyebrow) : null, h('h1', null, d.title || tab.title)), avatar),
        d.body || null)
    );
    v.scrollTop = st;
  }
  function go(id, opts) {
    const tab = App.tabs.find((t) => t.id === id); if (!tab) return;
    const idx = App.tabs.indexOf(tab);
    const same = current === tab;
    if (!same) {
      // кольца и шкалы на новой вкладке заполняются с нуля
      Object.keys(App.memo).forEach((k) => { if (k.indexOf(id + ':') === 0) delete App.memo[k]; });
      App.tabs.forEach((t) => { t.el.hidden = t !== tab; t.btn.classList.toggle('on', t === tab); t.btn.setAttribute('aria-selected', t === tab ? 'true' : 'false'); });
      current = tab;
      if (opts && opts.reset) tab.el.scrollTop = 0;
      if (thumbAnim) thumbAnim.stop();
      const thumb = document.querySelector('.tab-thumb');
      thumbAnim = spring({ from: thumbPos, to: idx, response: 0.36, damping: 0.8, precision: 0.002, onUpdate: (p) => { thumbPos = p; thumb.style.transform = 'translateX(' + p * 100 + '%)'; } });
      if (!still() && tab.el.animate) tab.el.animate([{ opacity: 0, transform: 'scale(.985)' }, { opacity: 1, transform: 'none' }], { duration: 260, easing: 'cubic-bezier(.2,.8,.2,1)' });
      haptic(5);
    } else if (!opts || !opts.keep) {
      tab.el.scrollTo({ top: 0, behavior: still() ? 'auto' : 'smooth' });
    }
    renderTab(tab, !same);
  }
  function refresh() {
    if (pendingRefresh) return;
    pendingRefresh = requestAnimationFrame(() => { pendingRefresh = 0; if (current) renderTab(current, false); });
    setTimeout(() => { if (pendingRefresh) { cancelAnimationFrame(pendingRefresh); pendingRefresh = 0; if (current) renderTab(current, false); } }, 120);
  }
  function mount() {
    const app = document.getElementById('app');
    const views = h('main', { id: 'views' });
    const tabs = h('div', { class: 'tabs', role: 'tablist' }, h('div', { class: 'tab-thumb' }));
    App.tabs.forEach((t) => {
      t.el = h('section', { class: 'view', hidden: true, 'aria-label': t.title });
      t.el.addEventListener('scroll', () => t.el.classList.toggle('scrolled', t.el.scrollTop > 34), { passive: true });
      views.appendChild(t.el);
      t.btn = h('button', { class: 'tab', type: 'button', role: 'tab', onclick: () => go(t.id) }, icon(t.icon), h('span', null, t.short || t.title));
      tabs.appendChild(t.btn);
    });
    const fab = h('button', { class: 'fab', type: 'button', 'aria-label': 'Добавить', onclick: () => App.ui.quickAdd && App.ui.quickAdd(fab) }, icon('plus', 28));
    app.replaceChildren(
      h('div', { id: 'root' }, views, h('nav', { id: 'tabbar' }, tabs, fab)),
      h('div', { id: 'sheets' }), h('div', { id: 'toasts', 'aria-live': 'polite' })
    );
    store.subs.add(refresh);
  }

  Object.assign(App, {
    h, icon, clamp, uid, dkey, parseKey, addDays, fmtDate, nf, num, plural, haptic, pad,
    spring, project, rubber, animateValue, countUp, store, ring, bar, spark, lineChart, seg, ruler,
    sheet, confirm: confirmSheet, toast, registerTab, go, refresh, mount, still,
    currentTab: () => current && current.id
  });
})();
