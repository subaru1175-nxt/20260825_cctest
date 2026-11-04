/*
 * artifact-backend.js — claude.ai の公開ページ（Artifact）版だけで使う保存先
 *
 * 公開ページでは、学習記録を「あなた専用の保存領域（db の data/users/<あなたのID>/）」に保存する。
 * 使えないとき（サインインしていない・許可されなかった等）は localStorage に切り替わる。
 * 通常の index.html では読み込まないので、影響しない。
 */
(function () {
  'use strict';
  const C = (window.CIF = window.CIF || {});
  window.CIF_NO_SW = true; // 公開ページでは Service Worker を使わない
  const claude = window.claude;
  if (!claude || typeof claude.use !== 'function') return;

  const withTimeout = (p, ms) => Promise.race([p, new Promise((r) => setTimeout(() => r(null), ms))]);

  C.extraBackend = async function () {
    const [db, user] = await Promise.all([withTimeout(claude.use('db'), 10000), withTimeout(claude.use('user'), 10000)]);
    if (!db || !user) return null;
    const uid = await withTimeout(user.id(), 10000);
    if (!uid) return null;
    const ref = (key) => db.doc('data/users/' + uid + '/' + key);
    try {
      // 最初の読み込みで使えるか確かめる（許可の確認が出ることがある）
      const probe = await withTimeout(ref('meta').get(), 15000);
      if (!probe) return null;
    } catch (e) {
      return null;
    }
    let cache = null;
    try { cache = C.storage.localBackend(); } catch (e) { cache = null; }
    return {
      name: 'db',
      persistent: true,
      async load(key) {
        const snap = await ref(key).get();
        if (!snap.exists) return cache ? cache.load(key) : undefined;
        const body = snap.data() || {};
        return typeof body.json === 'string' ? JSON.parse(body.json) : undefined;
      },
      async save(key, value) {
        if (cache) { try { cache.saveSync(key, value); } catch (e) { /* 予備なので無視 */ } }
        try {
          if (value === undefined || value === null) await ref(key).delete();
          else await ref(key).set({ json: JSON.stringify(value), savedAt: Date.now() });
        } catch (e) {
          if (e && (e.code === 'quota_exceeded' || e.code === 'invalid_argument')) {
            const err = new Error('quota');
            err.name = 'QuotaExceededError';
            throw err;
          }
          if (e && e.code === 'unavailable') {
            await new Promise((r) => setTimeout(r, 400 + Math.random() * 600));
            if (value === undefined || value === null) await ref(key).delete();
            else await ref(key).set({ json: JSON.stringify(value), savedAt: Date.now() });
            return;
          }
          throw e;
        }
      },
    };
  };

  C.saveFile = async function (filename, text) {
    const downloads = await withTimeout(claude.use('downloads'), 10000);
    if (!downloads) return false;
    try {
      await downloads.save({ filename, data: text });
      return true;
    } catch (e) {
      return false;
    }
  };
})();
