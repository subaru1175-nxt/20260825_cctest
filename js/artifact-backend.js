/*
 * artifact-backend.js — claude.ai の公開ページ（Artifact）版だけで使う保存先
 *
 * 公開ページでは、学習記録を「あなた専用の保存領域（db の data/users/<あなたのID>/）」に保存する。
 * 使えないとき（サインインしていない・許可されなかった等）は localStorage に切り替わる。
 * 通常の index.html では読み込まないので、影響しない。
 *
 * 1件の大きさに上限（256KiB）があるため、大きなデータは分けて保存する。
 *   1. 新しい分割データ（<key>-p-<版>-<番号>）を書く
 *   2. 目次（<key>）を新しい版に書きかえる
 *   3. 古い版の分割データを消す
 * 途中で止まっても、目次は常に「書き終えた版」を指すので壊れない。
 */
(function () {
  'use strict';
  const C = (window.CIF = window.CIF || {});
  window.CIF_NO_SW = true; // 公開ページでは Service Worker を使わない
  const claude = window.claude;
  if (!claude || typeof claude.use !== 'function') return;

  const CHUNK = 40000; // 文字数（日本語は1文字3バイトなので、1件 120KB 程度まで）
  const withTimeout = (p, ms) => Promise.race([p, new Promise((r) => setTimeout(() => r(null), ms))]);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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
    const heads = {}; // 最後に読んだ・書いた目次（古い分割データの片づけに使う）

    async function retry(fn) {
      try {
        return await fn();
      } catch (e) {
        if (e && e.code === 'unavailable') {
          await sleep(400 + Math.random() * 600);
          return fn();
        }
        if (e && (e.code === 'quota_exceeded' || e.code === 'invalid_argument')) {
          const err = new Error('quota');
          err.name = 'QuotaExceededError';
          throw err;
        }
        throw e;
      }
    }

    async function readKey(key) {
      const snap = await ref(key).get();
      if (!snap.exists) return undefined;
      const head = snap.data() || {};
      heads[key] = { ver: head.ver, parts: head.parts };
      if (typeof head.json !== 'string') return undefined;
      let text = head.json;
      const parts = Number(head.parts) || 1;
      for (let i = 1; i < parts; i++) {
        const p = await ref(key + '-p-' + head.ver + '-' + i).get();
        const body = p.exists ? p.data() || {} : {};
        if (typeof body.json !== 'string') throw new Error('missing part ' + i + ' of ' + key);
        text += body.json;
      }
      return JSON.parse(text);
    }

    return {
      name: 'db',
      persistent: true,
      async load(key) {
        try {
          const v = await readKey(key);
          if (v !== undefined) return v;
        } catch (e) {
          // 読めなかったときは、この端末に残っている控えを使う
          if (cache) return cache.load(key);
          throw e;
        }
        return cache ? cache.load(key) : undefined;
      },
      async save(key, value) {
        if (cache) { try { cache.saveSync(key, value); } catch (e) { /* 控えなので無視 */ } }
        if (value === undefined || value === null) {
          await retry(() => ref(key).delete());
          return;
        }
        const text = JSON.stringify(value);
        const chunks = [];
        for (let i = 0; i < text.length; i += CHUNK) chunks.push(text.slice(i, i + CHUNK));
        if (!chunks.length) chunks.push('');
        const old = heads[key] || null;
        const ver = Date.now().toString(36);
        for (let i = 1; i < chunks.length; i++) {
          await retry(() => ref(key + '-p-' + ver + '-' + i).set({ json: chunks[i] }));
        }
        await retry(() => ref(key).set({ json: chunks[0], parts: chunks.length, ver, savedAt: Date.now() }));
        heads[key] = { ver, parts: chunks.length };
        if (old && old.ver && old.ver !== ver) {
          for (let i = 1; i < (Number(old.parts) || 1); i++) {
            try { await ref(key + '-p-' + old.ver + '-' + i).delete(); } catch (e) { /* 片づけなので無視 */ }
          }
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
