/* Ритм — облачная копия для версии на claude.ai.
   Данные лежат в личном разделе зрителя (data/users/<id>/…): его не видит никто, включая владельца страницы.
   Стратегия простая: при открытии берём более свежую версию (устройство или облако), дальше дописываем изменения. */
(function () {
  'use strict';
  const App = window.App, store = App.store;
  App.sync = { active: () => false };
  if (!(window.claude && typeof window.claude.use === 'function')) return;

  const SIMPLE = ['profile', 'targets', 'weights', 'vitals', 'labs', 'meds', 'fridge', 'shopping', 'mealPlan', 'trainPlan', 'workouts'];
  let col = null, known = {}, timer = 0, busy = false, again = false, applying = false;

  function pack(s) {
    const out = {};
    SIMPLE.forEach((k) => { out[k] = JSON.stringify(s[k] === undefined ? null : s[k]); });
    const months = {};
    Object.keys(s.days || {}).forEach((d) => { const m = d.slice(0, 7); (months[m] = months[m] || {})[d] = s.days[d]; });
    Object.keys(months).forEach((m) => { out['days-' + m] = JSON.stringify(months[m]); });
    out.meta = JSON.stringify({ v: 1, updatedAt: s.updatedAt || 0 });   // meta пишется последним
    return out;
  }
  function unpack(docs) {
    const s = { days: {} };
    Object.keys(docs).forEach((k) => {
      let v; try { v = JSON.parse(docs[k]); } catch (e) { return; }
      if (k.indexOf('days-') === 0) Object.assign(s.days, v || {});
      else if (k === 'meta') s.updatedAt = (v && v.updatedAt) || 0;
      else if (SIMPLE.indexOf(k) >= 0 && v !== null) s[k] = v;
    });
    return s;
  }
  async function pull() {
    const snap = await col.get(), docs = {};
    snap.docs.forEach((d) => { const b = d.data(); if (b && typeof b.json === 'string') docs[d.id] = b.json; });
    return docs;
  }
  async function push() {
    if (!col || store.state.demo) return;
    if (busy) { again = true; return; }
    busy = true;
    try {
      const docs = pack(store.state);
      for (const k of Object.keys(docs)) {
        if (known[k] === docs[k]) continue;
        if (docs[k].length > 230000) { console.warn('Ритм: раздел слишком большой для облачной копии:', k); continue; }
        await col.doc(k).set({ json: docs[k] });
        known[k] = docs[k];
      }
      for (const k of Object.keys(known)) if (k.indexOf('days-') === 0 && !(k in docs)) { await col.doc(k).delete(); delete known[k]; }
    } catch (e) { console.warn('Ритм: облачная копия не записалась', e && e.code); }
    busy = false;
    if (again) { again = false; push(); }
  }
  function adopt(docs) {
    const s = unpack(docs), at = s.updatedAt || 0;
    applying = true;
    App.memo = {};
    store.replace(s); store.state.updatedAt = at; store.save();
    applying = false;
    known = Object.assign({}, docs);
    if (App.ui.closeOnboarding) { App.ui.closeOnboarding(); App.ui.closeOnboarding = null; }
    App.go(App.currentTab() || 'today', { keep: true });
  }
  const hasProfile = (docs) => !!docs.profile && docs.profile !== 'null';
  const metaAt = (docs) => { try { return JSON.parse(docs.meta).updatedAt || 0; } catch (e) { return 0; } };

  (async () => {
    try {
      const got = await Promise.all([window.claude.use('db'), window.claude.use('user')]);
      if (!got[0] || !got[1]) return;
      const id = await got[1].id(); if (!id) return;
      col = got[0].collection('data/users/' + id);
      const docs = await pull(), local = store.state;
      known = Object.assign({}, docs);
      App.sync.active = () => true;
      if (hasProfile(docs) && (!local.profile || local.demo || metaAt(docs) > (local.updatedAt || 0))) { adopt(docs); App.toast('Данные загружены из вашей копии', { icon: 'refresh', color: 'var(--teal)' }); }
      else if (local.profile) push();
      store.subs.add(() => { if (applying) return; clearTimeout(timer); timer = setTimeout(push, 1200); });
      document.addEventListener('visibilitychange', async () => {
        if (document.visibilityState === 'hidden') { clearTimeout(timer); push(); return; }
        try {   // вернулись на страницу: вдруг данные обновились с другого устройства
          const m = await col.doc('meta').get(), b = m.exists ? m.data() : null;
          const at = b && typeof b.json === 'string' ? (JSON.parse(b.json).updatedAt || 0) : 0;
          if (at > (store.state.updatedAt || 0) + 1500 && !busy) { const fresh = await pull(); if (hasProfile(fresh)) adopt(fresh); }
        } catch (e) {}
      });
    } catch (e) { console.warn('Ритм: облачная копия недоступна', e && e.code); }
  })();
})();
