/* Ритм — пульс с часов в реальном времени.
   Часы Huawei (и любые другие с «трансляцией пульса») отдают пульс по стандартному Bluetooth-профилю Heart Rate.
   Подключение через Web Bluetooth: работает в Chrome на Android, на сайте и в приложении, установленном из Chrome. */
(function () {
  'use strict';
  const App = window.App, { h, icon, sheet, toast, haptic, kidsSet, kidsAdd, store } = App, ui = App.ui;
  const KEY = 'ritm.hr.device';

  const hr = {
    bpm: null, at: 0, device: null, name: '', status: 'off', subs: new Set(),
    available: () => !(window.claude && window.claude.use) && !!(navigator.bluetooth && navigator.bluetooth.requestDevice) && window.isSecureContext,
    live: () => hr.status === 'on' && Date.now() - hr.at < 6000,
    on(f) { hr.subs.add(f); return () => hr.subs.delete(f); },
    emit() { hr.subs.forEach((f) => { try { f(hr); } catch (e) {} }); }
  };
  // разбор пакета Heart Rate Measurement: бит 0 флагов — 16-битное значение
  const parse = (dv) => (dv.getUint8(0) & 1 ? dv.getUint16(1, true) : dv.getUint8(1));

  async function attach(device) {
    hr.device = device; hr.name = device.name || 'Часы'; hr.status = 'connecting'; hr.emit();
    try { localStorage.setItem(KEY, hr.name); } catch (e) {}
    device.addEventListener('gattserverdisconnected', onDrop);
    const server = await device.gatt.connect();
    const svc = await server.getPrimaryService('heart_rate');
    const ch = await svc.getCharacteristic('heart_rate_measurement');
    ch.addEventListener('characteristicvaluechanged', (e) => {
      const v = parse(e.target.value);
      if (v > 25 && v < 240) { hr.bpm = v; hr.at = Date.now(); hr.status = 'on'; hr.emit(); }
    });
    await ch.startNotifications();
    hr.status = 'on'; hr.emit();
  }
  let retry = 0;
  function onDrop() {
    if (hr.status === 'off') return;
    hr.status = 'reconnecting'; hr.emit();
    // часы могут ненадолго пропадать — пробуем переподключиться несколько раз
    if (retry++ < 5) setTimeout(() => { if (hr.device && hr.status !== 'off') attach(hr.device).then(() => { retry = 0; }).catch(onDrop); }, 1500 * retry);
    else { hr.status = 'lost'; hr.emit(); }
  }
  hr.connect = async function () {
    const device = await navigator.bluetooth.requestDevice({ filters: [{ services: ['heart_rate'] }] });
    retry = 0;
    await attach(device);
  };
  hr.disconnect = function () {
    hr.status = 'off'; hr.bpm = null; hr.emit();
    try { if (hr.device && hr.device.gatt.connected) hr.device.gatt.disconnect(); } catch (e) {}
    hr.device = null;
  };
  // зоны пульса от максимального (220 − возраст)
  hr.zone = (bpm) => {
    const p = store.state.profile, max = 220 - (p ? App.calc.age(p) : 30), k = bpm / max;
    return k < 0.6 ? { n: 1, t: 'Разминка', c: 'var(--blue)' } : k < 0.7 ? { n: 2, t: 'Жиросжигание', c: 'var(--green)' }
      : k < 0.8 ? { n: 3, t: 'Аэробная', c: 'var(--yellow)' } : k < 0.9 ? { n: 4, t: 'Анаэробная', c: 'var(--orange)' } : { n: 5, t: 'Максимум', c: 'var(--red)' };
  };

  // значок пульса для экранов тренировки и камеры: обновляется сам
  ui.hrChip = (dark) => {
    const val = h('b', { class: 'num' }, '—');
    const el = h('button', { class: 'hr-chip' + (dark ? ' dark' : ''), type: 'button', 'aria-label': 'Пульс с часов', onclick: () => ui.watch() }, h('span', { class: 'hr-heart' }, icon('heart', 15)), val);
    let seen = false;
    const paint = () => {
      if (el.isConnected) seen = true; else if (seen) { off(); return; }
      const on = hr.live();
      el.classList.toggle('on', on);
      val.textContent = on ? String(hr.bpm) : hr.status === 'reconnecting' || hr.status === 'connecting' ? '…' : 'Часы';
      if (on) { const z = hr.zone(hr.bpm); el.style.setProperty('--z', z.c); el.querySelector('.hr-heart').style.animationDuration = (60 / hr.bpm).toFixed(2) + 's'; }
    };
    const off = hr.on(paint);
    setTimeout(paint, 0);
    return hr.available() ? el : null;
  };

  // экран «Часы»: подключение и живой пульс
  ui.watch = function () {
    sheet({ title: 'Часы', build: (b) => {
      const big = h('div', { class: 'hr-big num' }, '—'), zone = h('div', { class: 'sub' }), state = h('div');
      const draw = () => {
        if (!b.isConnected) { off(); return; }
        const on = hr.live();
        big.textContent = on ? hr.bpm : '—';
        const z = on ? hr.zone(hr.bpm) : null;
        zone.textContent = z ? 'Зона ' + z.n + ' · ' + z.t : hr.status === 'connecting' ? 'Подключаю…' : hr.status === 'reconnecting' ? 'Связь прервалась, переподключаю…' : hr.status === 'lost' ? 'Часы не отвечают' : 'Не подключены';
        big.style.color = z ? z.c : 'var(--fg-3)';
        kidsSet(state, hr.status === 'off' || hr.status === 'lost'
          ? h('button', { class: 'btn primary block', type: 'button', onclick: async () => {
              try { await hr.connect(); haptic(12); toast('Часы подключены: ' + hr.name, { icon: 'heart', color: 'var(--red)' }); }
              catch (e) { if (e && e.name !== 'NotFoundError') toast('Не удалось подключиться. Включите трансляцию пульса на часах.', { icon: 'info', color: 'var(--orange)' }); hr.status = 'off'; hr.emit(); }
            } }, icon('heart', 20), 'Подключить часы')
          : h('button', { class: 'btn gray block', type: 'button', onclick: () => hr.disconnect() }, 'Отключить ' + (hr.name || 'часы')));
      };
      const off = hr.on(draw);
      kidsAdd(b, h('div', { class: 'stack' },
        h('div', { class: 'card', style: 'display:flex;flex-direction:column;align-items:center;gap:4px;padding:22px' }, h('span', { class: 'hr-heart big-h' }, icon('heart', 34)), big, h('div', { class: 'sub' }, 'уд/мин'), zone),
        state,
        hr.available() ? null : h('div', { class: 'note', style: { '--c': 'var(--orange)' } }, h('b', { class: 'h' }, icon('info', 15), 'Здесь подключение недоступно'),
          'Пульс с часов работает в Chrome на Android: откройте сайт приложения в Chrome или установите его оттуда через «Добавить на главный экран».'),
        h('div', null, h('div', { class: 'caption', style: 'margin-bottom:8px' }, 'Как подключить Huawei Watch Fit 3'),
          h('div', { class: 'card' }, h('ol', { class: 'coach-steps' },
            h('li', null, 'На часах откройте список приложений → Настройки → «Трансляция пульса» (HR Data Broadcasts) и включите её.'),
            h('li', null, 'На телефоне включите Bluetooth и геолокацию — без неё Android не ищет устройства.'),
            h('li', null, 'Нажмите «Подключить часы» и выберите свои часы в списке.')))),
        h('p', { class: 'caption' }, 'Пока идёт трансляция, часы могут отключиться от приложения Huawei Health — после тренировки выключите трансляцию, и синхронизация вернётся. Если пункта «Трансляция пульса» нет, эта модель её не поддерживает.')));
      draw();
    } });
  };

  App.hr = hr;
})();
