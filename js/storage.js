/*
 * storage.js — 保存・読み込み・書き出し・データの整形
 *
 * 保存先（backend）は差し替えられる：
 *   - local  : ブラウザの localStorage（通常はこれ）
 *   - memory : 保存できない環境での一時保存（再読み込みで消える → 画面で警告）
 *   - その他 : window.CIF.extraBackend が用意されていればそれを優先（公開ページ版など）
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./util.js'));
  } else {
    root.CIF = root.CIF || {};
    root.CIF.storage = factory(root.CIF.util);
  }
})(this, function (util) {
  'use strict';

  const PREFIX = 'cif.v1.';
  const KEYS = ['words', 'progress', 'log', 'settings', 'session', 'meta', 'rounds', 'tests'];
  const FORMAT = 'core-image-flashcards';
  const FORMAT_VERSION = 1;

  const STATUS = {
    verified: { key: 'verified', label: '確認済み', desc: '辞書などで確認した内容。出典を記録しています。' },
    unverified: { key: 'unverified', label: '未確認', desc: '自分で入力した内容など。出題はしますが、辞書での確認はまだです。' },
    needs_review: { key: 'needs_review', label: '要確認', desc: '読めない文字や意図が不明な点があるため、通常の出題から外しています。' },
  };

  const POS = {
    noun: '名詞', verb: '動詞', adjective: '形容詞', adverb: '副詞',
    preposition: '前置詞', interjection: '間投詞', conjunction: '接続詞', pronoun: '代名詞',
    auxiliary: '助動詞', phrase: 'フレーズ', other: 'その他',
  };

  const ROLE = {
    thing: 'もの・こと', action: '動き', state: '状態', change: '変化（〜になる）',
    quality: 'どんな（様子）', manner: 'どんなふうに', degree: 'どのくらい',
    relation: '位置・関係', connector: '気持ち・話のつなぎ',
    person: '人', amount: '数・量', place: '場所・方角', time: '時・回数', addition: '付け加え（〜も）',
    mood: '話し手の気持ち',
  };

  const GROUPS = ['A', 'B', 'C', 'D'];

  const DEFAULT_SETTINGS = {
    voiceURI: '',
    rate: 0.95,
    slowRate: 0.55,
    slowGap: 300,
    slowWordByWord: true,
    dailyGoal: 10,
    accent: 'us',
    autoplay: false,
    studyMode: 'fwd',
  };

  /* ---------- 保存先 ---------- */

  function localBackend(storage) {
    const ls = storage || (typeof localStorage !== 'undefined' ? localStorage : null);
    // 書き込めるか試す（プライベートモード等で例外になることがある）
    ls.setItem(PREFIX + '_probe', '1');
    ls.removeItem(PREFIX + '_probe');
    return {
      name: 'local',
      persistent: true,
      async load(key) {
        const raw = ls.getItem(PREFIX + key);
        return raw == null ? undefined : JSON.parse(raw);
      },
      async save(key, value) {
        if (value === undefined || value === null) ls.removeItem(PREFIX + key);
        else ls.setItem(PREFIX + key, JSON.stringify(value));
      },
      saveSync(key, value) {
        if (value === undefined || value === null) ls.removeItem(PREFIX + key);
        else ls.setItem(PREFIX + key, JSON.stringify(value));
      },
    };
  }

  function memoryBackend() {
    const mem = {};
    return {
      name: 'memory',
      persistent: false,
      async load(key) {
        return mem[key] === undefined ? undefined : util.clone(mem[key]);
      },
      async save(key, value) {
        mem[key] = util.clone(value);
      },
    };
  }

  async function pickBackend() {
    const g = typeof window !== 'undefined' ? window : {};
    if (g.CIF && typeof g.CIF.extraBackend === 'function') {
      try {
        const b = await g.CIF.extraBackend();
        if (b) return b;
      } catch (e) {
        /* 使えなければ localStorage へ */
      }
    }
    try {
      return localBackend();
    } catch (e) {
      return memoryBackend();
    }
  }

  /* ---------- ストア（画面からはこれを使う） ---------- */

  function createStore(backend) {
    const state = { words: [], progress: {}, log: null, settings: null, session: null, meta: {}, rounds: [], tests: null };
    const status = { backend: backend.name, persistent: backend.persistent, error: '' };
    const pending = {};
    const writing = {};
    const listeners = [];

    function notify() {
      listeners.forEach((fn) => {
        try { fn(status); } catch (e) { /* noop */ }
      });
    }

    async function flush(key) {
      if (writing[key]) return;
      writing[key] = true;
      try {
        while (Object.prototype.hasOwnProperty.call(pending, key)) {
          const value = pending[key];
          delete pending[key];
          await backend.save(key, value);
        }
        if (status.error) {
          status.error = '';
          notify();
        }
      } catch (e) {
        status.error = saveErrorMessage(e);
        notify();
      } finally {
        writing[key] = false;
      }
    }

    function persist(key) {
      const value = state[key];
      if (backend.saveSync) {
        try {
          backend.saveSync(key, value);
          if (status.error) {
            status.error = '';
            notify();
          }
        } catch (e) {
          status.error = saveErrorMessage(e);
          notify();
        }
        return Promise.resolve();
      }
      pending[key] = util.clone(value);
      return flush(key);
    }

    return {
      state,
      status,
      onStatus(fn) { listeners.push(fn); },
      async init(seed) {
        const loaded = {};
        for (const key of KEYS) {
          try {
            loaded[key] = await backend.load(key);
          } catch (e) {
            loaded[key] = undefined;
            status.error = '保存データの一部を読み込めませんでした（' + key + '）。';
          }
        }
        const meta = loaded.meta && typeof loaded.meta === 'object' ? loaded.meta : {};
        let words;
        if (Array.isArray(loaded.words)) {
          words = loaded.words.map((w) => normalizeWord(w).word).filter(Boolean);
          const merged = mergeNewSeedWords(words, seed, meta);
          words = merged.words;
          if (merged.added) loaded._wordsChanged = true;
        } else {
          words = (seed ? seed.words : []).map((w) => normalizeWord(w).word);
          meta.seedVersion = seed ? seed.version : 0;
          loaded._wordsChanged = true;
        }
        state.words = words;
        state.progress = normalizeProgress(loaded.progress);
        state.log = normalizeLog(loaded.log);
        state.settings = normalizeSettings(loaded.settings);
        state.session = loaded.session && typeof loaded.session === 'object' ? loaded.session : null;
        state.meta = Object.assign({ deletedSeed: [] }, meta, { seedVersion: seed ? seed.version : meta.seedVersion || 0 });
        const rounds = mergeRounds(normalizeRounds(loaded.rounds), seed && seed.rounds, new Set(words.map((w) => w.id)));
        state.rounds = rounds.rounds;
        state.tests = normalizeTests(loaded.tests);
        if (loaded._wordsChanged) {
          persist('words');
          persist('meta');
        }
        if (rounds.changed) persist('rounds');
        return state;
      },
      set(key, value) {
        if (!KEYS.includes(key)) throw new Error('unknown key ' + key);
        state[key] = value;
        return persist(key);
      },
      setMany(obj) {
        return Promise.all(Object.keys(obj).map((k) => this.set(k, obj[k])));
      },
    };
  }

  function saveErrorMessage(e) {
    const name = e && (e.name || e.code);
    if (name === 'QuotaExceededError' || name === 'quota_exceeded' || name === 'NS_ERROR_DOM_QUOTA_REACHED') {
      return '保存できる容量がいっぱいです。不要な単語を削除するか、データを書き出してください。';
    }
    return '学習データを保存できませんでした。ブラウザの設定（プライベートモードなど）を確認してください。';
  }

  /** 新しいバージョンで増えた初期単語を追加（ユーザーが削除したものは戻さない） */
  function mergeNewSeedWords(words, seed, meta) {
    if (!seed || !(seed.version > (meta.seedVersion || 0))) return { words, added: 0 };
    const have = new Set(words.map((w) => w.id));
    const deleted = new Set(meta.deletedSeed || []);
    const add = seed.words.filter((w) => !have.has(w.id) && !deleted.has(w.id)).map((w) => normalizeWord(w).word);
    // 初期データの単語は新しい版の並び順にそろえる（新しい単語から出題されるように）。自分で追加した単語はそのあと。
    const order = new Map(seed.words.map((w, i) => [w.id, i]));
    const merged = words.concat(add).map((w, i) => ({ w, k: order.has(w.id) ? order.get(w.id) : seed.words.length + i }));
    merged.sort((a, b) => a.k - b.k);
    return { words: merged.map((x) => x.w), added: add.length };
  }

  /* ---------- データの整形・チェック ---------- */

  const MAX_TEXT = 2000;
  const REPLACEMENT = /\uFFFD/;
  const HEADWORD_OK = /^[A-Za-z][A-Za-z '’.\-]*$/;

  function str(v, max) {
    if (v == null) return '';
    const s = typeof v === 'string' ? v : typeof v === 'number' ? String(v) : '';
    return s.trim().slice(0, max || MAX_TEXT);
  }

  function safeUrl(v) {
    const s = str(v, 500);
    if (!s) return '';
    if (/^https?:\/\//i.test(s)) return s;
    // 同じフォルダの録音ファイル（audio/xxx.mp3 など）も許可
    if (/^[\w\-./]+\.(mp3|m4a|aac|wav|ogg|oga|webm)$/i.test(s) && !s.includes('..')) return s;
    return '';
  }

  function safeId(v, prefix, fallbackText) {
    const s = str(v, 64);
    if (/^[A-Za-z0-9][A-Za-z0-9-]*$/.test(s)) return s;
    return util.randomId(prefix + '-' + util.slug(fallbackText));
  }

  function hasBrokenText(obj) {
    return REPLACEMENT.test(JSON.stringify(obj || ''));
  }

  /**
   * 単語データを安全な形にそろえる。
   * 見出し語が英字でない・文字化けがある・意味が空 などは「要確認」にして理由を残す。
   */
  function normalizeWord(raw) {
    if (!raw || typeof raw !== 'object') return { word: null, problems: ['データの形が正しくありません'] };
    const problems = [];
    const headword = str(raw.headword, 60);
    const w = {
      id: safeId(raw.id, 'w', headword),
      headword,
      status: STATUS[raw.status] ? raw.status : 'unverified',
      check: {
        date: str(raw.check && raw.check.date, 20),
        method: str(raw.check && raw.check.method),
        note: str(raw.check && raw.check.note),
      },
      sources: Array.isArray(raw.sources)
        ? raw.sources
            .map((s) => ({ label: str(s && s.label, 200), url: safeUrl(s && s.url) }))
            .filter((s) => s.label || s.url)
            .slice(0, 10)
        : [],
      groups: {},
      senses: [],
      reviewReasons: [],
      createdAt: Number(raw.createdAt) || 0,
      updatedAt: Number(raw.updatedAt) || 0,
    };
    if (raw.groups && typeof raw.groups === 'object') {
      GROUPS.forEach((g) => {
        const t = str(raw.groups[g], 300);
        if (t) w.groups[g] = t;
      });
    }
    const seenIds = new Set();
    (Array.isArray(raw.senses) ? raw.senses : []).slice(0, 12).forEach((s) => {
      const sense = normalizeSense(s, headword);
      if (!sense) return;
      if (seenIds.has(sense.id)) sense.id = util.randomId('s-' + util.slug(headword));
      seenIds.add(sense.id);
      w.senses.push(sense);
    });

    if (!headword) problems.push('見出し語がありません');
    else if (REPLACEMENT.test(headword)) problems.push('見出し語に読めない文字（\uFFFD）があります');
    else if (!HEADWORD_OK.test(headword)) problems.push('見出し語に英字以外の文字が含まれています');
    if (!w.senses.length) problems.push('意味・用法が登録されていません');
    if (hasBrokenText(raw.senses)) problems.push('説明や例文に読めない文字（\uFFFD）があります');
    if (problems.length) {
      w.status = 'needs_review';
      w.reviewReasons = problems;
    } else if (Array.isArray(raw.reviewReasons) && raw.status === 'needs_review') {
      w.reviewReasons = raw.reviewReasons.map((r) => str(r, 200)).filter(Boolean).slice(0, 5);
    }
    return { word: w, problems };
  }

  function normalizeSense(s, headword) {
    if (!s || typeof s !== 'object') return null;
    const sense = {
      test: normalizeTestSentence(s.test),
      id: safeId(s.id, 's', headword),
      group: GROUPS.includes(s.group) ? s.group : 'A',
      pos: POS[s.pos] ? s.pos : 'other',
      role: ROLE[s.role] ? s.role : '',
      cue: str(s.cue, 120),
      speak: str(s.speak, 120),
      ipa: { us: str(s.ipa && s.ipa.us, 60), uk: str(s.ipa && s.ipa.uk, 60) },
      stress: str(s.stress, 60),
      nuance: str(s.nuance, 200),
      scene: {
        emoji: str(s.scene && s.scene.emoji, 16),
        diagram: str(s.scene && s.scene.diagram, 40),
        text: str(s.scene && s.scene.text, 300),
      },
      meaning: str(s.meaning, 200),
      roleText: str(s.roleText, 600),
      examples: (Array.isArray(s.examples) ? s.examples : [])
        .map((e) => ({ en: str(e && e.en, 300), ja: str(e && e.ja, 300) }))
        .filter((e) => e.en)
        .slice(0, 6),
      contrasts: (Array.isArray(s.contrasts) ? s.contrasts : [])
        .map((c) => ({ word: str(c && c.word, 60), text: str(c && c.text, 400) }))
        .filter((c) => c.word || c.text)
        .slice(0, 6),
      note: str(s.note, 600),
      status: s.status === 'needs_review' ? 'needs_review' : '',
      audio: {
        word: safeUrl(s.audio && s.audio.word),
        examples: (s.audio && Array.isArray(s.audio.examples) ? s.audio.examples : []).map(safeUrl).slice(0, 6),
      },
    };
    if (!sense.meaning) sense.status = 'needs_review';
    return sense;
  }

  function num(v, d) {
    const n = Number(v);
    return Number.isFinite(n) ? n : d;
  }

  function normalizeState(st) {
    if (!st || typeof st !== 'object') return null;
    return {
      reps: Math.max(0, Math.floor(num(st.reps, 0))),
      lapses: Math.max(0, Math.floor(num(st.lapses, 0))),
      streak: Math.max(0, Math.floor(num(st.streak, 0))),
      interval: Math.max(0, Math.min(365, Math.floor(num(st.interval, 0)))),
      ease: Math.max(1.3, Math.min(3.5, num(st.ease, 2.5))),
      due: Math.max(0, num(st.due, 0)),
      last: Math.max(0, num(st.last, 0)),
      history: (Array.isArray(st.history) ? st.history : [])
        .filter((h) => h && ['again', 'hard', 'good'].includes(h.r))
        .map((h) => {
          const e = { t: num(h.t, 0), r: h.r };
          if (h.re) e.re = true;
          if (h.ivl != null) e.ivl = num(h.ivl, 0);
          return e;
        })
        .slice(-40),
    };
  }

  function normalizeProgress(p) {
    const out = {};
    if (!p || typeof p !== 'object') return out;
    Object.keys(p).forEach((id) => {
      if (!/^[A-Za-z0-9][A-Za-z0-9-]*$/.test(id)) return;
      const e = p[id] || {};
      const fwd = normalizeState(e.fwd);
      const rev = normalizeState(e.rev);
      if (fwd || rev) {
        out[id] = {};
        if (fwd) out[id].fwd = fwd;
        if (rev) out[id].rev = rev;
      }
    });
    return out;
  }

  function normalizeLog(l) {
    const out = { days: {}, totalPoints: 0 };
    if (!l || typeof l !== 'object') return out;
    out.totalPoints = Math.max(0, Math.floor(num(l.totalPoints, 0)));
    const days = l.days && typeof l.days === 'object' ? l.days : {};
    Object.keys(days).forEach((k) => {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(k)) return;
      const d = days[k] || {};
      out.days[k] = {
        cards: Math.max(0, Math.floor(num(d.cards, 0))),
        answers: Math.max(0, Math.floor(num(d.answers, 0))),
        good: Math.max(0, Math.floor(num(d.good, 0))),
        hard: Math.max(0, Math.floor(num(d.hard, 0))),
        again: Math.max(0, Math.floor(num(d.again, 0))),
        points: Math.max(0, Math.floor(num(d.points, 0))),
        sets: Math.max(0, Math.floor(num(d.sets, 0))),
        goalReached: !!d.goalReached,
      };
    });
    return out;
  }

  function normalizeTestSentence(t) {
    if (!t || typeof t !== 'object') return null;
    const en = str(t.en, 300);
    if (!en) return null;
    return {
      en,
      ja: str(t.ja, 300),
      alts: (Array.isArray(t.alts) ? t.alts : []).map((a) => str(a, 300)).filter(Boolean).slice(0, 6),
    };
  }

  /* ---------- 回（第1回・第2回…） ---------- */

  function normalizeRounds(list) {
    if (!Array.isArray(list)) return [];
    const seen = new Set();
    return list
      .filter((r) => r && typeof r === 'object' && /^[A-Za-z0-9-]+$/.test(String(r.id || '')))
      .filter((r) => !seen.has(r.id) && seen.add(r.id))
      .map((r) => ({
        id: String(r.id),
        no: Math.max(1, Math.floor(num(r.no, 1))),
        title: str(r.title, 40) || '第' + Math.max(1, Math.floor(num(r.no, 1))) + '回',
        source: str(r.source, 200),
        addedAt: str(r.addedAt, 20),
        wordIds: (Array.isArray(r.wordIds) ? r.wordIds : []).map((x) => str(x, 64)).filter((x) => /^[A-Za-z0-9][A-Za-z0-9-]*$/.test(x)),
      }))
      .sort((a, b) => a.no - b.no);
  }

  /** 初期データの回を足す。すでにある回には、新しく増えた単語だけを足す（自分で入れた単語は残す） */
  function mergeRounds(rounds, seedRounds, wordIds) {
    let changed = false;
    const out = rounds.map((r) => Object.assign({}, r, { wordIds: r.wordIds.slice() }));
    normalizeRounds(seedRounds || []).forEach((sr) => {
      const cur = out.find((r) => r.id === sr.id);
      if (!cur) {
        out.push(sr);
        changed = true;
        return;
      }
      const have = new Set(cur.wordIds);
      const add = sr.wordIds.filter((id) => !have.has(id));
      if (add.length) {
        cur.wordIds = sr.wordIds.concat(cur.wordIds.filter((id) => !sr.wordIds.includes(id)));
        changed = true;
      }
    });
    out.forEach((r) => {
      const before = r.wordIds.length;
      r.wordIds = r.wordIds.filter((id) => wordIds.has(id));
      if (r.wordIds.length !== before) changed = true;
    });
    out.sort((a, b) => a.no - b.no);
    return { rounds: out, changed };
  }

  /* ---------- テストの記録 ---------- */

  const PARTS = ['understand', 'compose'];

  function emptyTests() {
    return { attempts: [], current: null, misses: {} };
  }

  function normalizeTests(t) {
    const out = emptyTests();
    if (!t || typeof t !== 'object') return out;
    const part = (p) => ({
      correct: Math.max(0, Math.floor(num(p && p.correct, 0))),
      total: Math.max(0, Math.floor(num(p && p.total, 0))),
    });
    out.attempts = (Array.isArray(t.attempts) ? t.attempts : []).slice(-500).filter((a) => a && typeof a === 'object').map((a) => ({
      id: str(a.id, 40),
      kind: a.kind === 'review' ? 'review' : 'round',
      roundId: str(a.roundId, 40),
      no: Math.max(0, Math.floor(num(a.no, 0))),
      startedAt: num(a.startedAt, 0),
      finishedAt: num(a.finishedAt, 0),
      score: Math.max(0, Math.min(100, Math.floor(num(a.score, 0)))),
      parts: { understand: part(a.parts && a.parts.understand), compose: part(a.parts && a.parts.compose) },
      wrongs: (Array.isArray(a.wrongs) ? a.wrongs : []).slice(0, 400).map((w) => ({
        senseId: str(w && w.senseId, 64),
        part: PARTS.includes(w && w.part) ? w.part : 'understand',
        qtype: str(w && w.qtype, 20),
        given: str(w && w.given, 300),
        answer: str(w && w.answer, 300),
      })).filter((w) => w.senseId),
    }));
    if (t.current && typeof t.current === 'object' && Array.isArray(t.current.questions) && Array.isArray(t.current.results)) out.current = t.current;
    const m = t.misses && typeof t.misses === 'object' ? t.misses : {};
    Object.keys(m).forEach((k) => {
      const e = m[k];
      if (!e || !/^[A-Za-z0-9][A-Za-z0-9-]*\|(understand|compose)$/.test(k)) return;
      out.misses[k] = {
        senseId: str(e.senseId, 64),
        part: PARTS.includes(e.part) ? e.part : 'understand',
        roundIds: (Array.isArray(e.roundIds) ? e.roundIds : []).map((x) => str(x, 40)).filter(Boolean),
        count: Math.max(1, Math.floor(num(e.count, 1))),
        firstAt: num(e.firstAt, 0),
        lastAt: num(e.lastAt, 0),
        solvedAt: e.solvedAt ? num(e.solvedAt, 0) : 0,
        last: e.last && typeof e.last === 'object'
          ? { qtype: str(e.last.qtype, 20), given: str(e.last.given, 300), answer: str(e.last.answer, 300) }
          : { qtype: '', given: '', answer: '' },
      };
    });
    return out;
  }

  function normalizeSettings(s) {
    const out = Object.assign({}, DEFAULT_SETTINGS);
    if (!s || typeof s !== 'object') return out;
    out.voiceURI = str(s.voiceURI, 300);
    out.rate = Math.max(0.5, Math.min(1.3, num(s.rate, DEFAULT_SETTINGS.rate)));
    out.slowRate = Math.max(0.3, Math.min(1, num(s.slowRate, DEFAULT_SETTINGS.slowRate)));
    out.slowGap = Math.max(0, Math.min(1200, Math.round(num(s.slowGap, DEFAULT_SETTINGS.slowGap))));
    out.slowWordByWord = s.slowWordByWord !== false;
    out.dailyGoal = [10, 20, 30, 40].includes(Number(s.dailyGoal)) ? Number(s.dailyGoal) : DEFAULT_SETTINGS.dailyGoal;
    out.accent = s.accent === 'uk' ? 'uk' : 'us';
    out.autoplay = !!s.autoplay;
    out.studyMode = s.studyMode === 'rev' ? 'rev' : 'fwd';
    return out;
  }

  /* ---------- 書き出し・読み込み ---------- */

  function buildExport(state, opts) {
    const includeProgress = !opts || opts.includeProgress !== false;
    const data = {
      format: FORMAT,
      version: FORMAT_VERSION,
      exportedAt: new Date().toISOString(),
      words: state.words,
      rounds: state.rounds || [],
    };
    if (includeProgress) {
      data.progress = state.progress;
      data.log = state.log;
      data.settings = state.settings;
      data.tests = Object.assign({}, state.tests || emptyTests(), { current: null });
    }
    return data;
  }

  function exportFileName(now) {
    return 'core-image-cards-' + util.dayKey(now || Date.now()).replace(/-/g, '') + '.json';
  }

  /**
   * 読み込むテキストを確認する。
   * 戻り値: { ok, error?, data?, stats?, warnings? }
   */
  function parseImport(text) {
    let json;
    try {
      json = JSON.parse(String(text || '').replace(/^\uFEFF/, ''));
    } catch (e) {
      return { ok: false, error: 'JSON として読み込めませんでした。書き出したファイルをそのまま選んでください。' };
    }
    let rawWords;
    if (Array.isArray(json)) rawWords = json;
    else if (json && Array.isArray(json.words)) rawWords = json.words;
    else return { ok: false, error: '単語データ（words）が見つかりません。' };
    if (json && json.format && json.format !== FORMAT) {
      return { ok: false, error: 'このアプリのデータ形式ではありません（format: ' + str(json.format, 40) + '）。' };
    }
    const warnings = [];
    const words = [];
    const ids = new Set();
    rawWords.slice(0, 2000).forEach((raw, i) => {
      const { word, problems } = normalizeWord(raw);
      if (!word) {
        warnings.push((i + 1) + '件目: 形式が正しくないため読み飛ばしました');
        return;
      }
      if (ids.has(word.id)) word.id = util.randomId('w-' + util.slug(word.headword));
      ids.add(word.id);
      if (problems.length) warnings.push('「' + (word.headword || (i + 1) + '件目') + '」は要確認にしました: ' + problems.join('、'));
      words.push(word);
    });
    const hasProgress = !!(json && !Array.isArray(json) && json.progress);
    const data = {
      words,
      progress: hasProgress ? normalizeProgress(json.progress) : null,
      log: json && json.log ? normalizeLog(json.log) : null,
      settings: json && json.settings ? normalizeSettings(json.settings) : null,
      rounds: json && Array.isArray(json.rounds) ? normalizeRounds(json.rounds) : null,
      tests: json && json.tests ? normalizeTests(json.tests) : null,
    };
    const stats = {
      words: words.length,
      senses: words.reduce((n, w) => n + w.senses.length, 0),
      needsReview: words.filter((w) => w.status === 'needs_review').length,
      progress: data.progress ? Object.keys(data.progress).length : 0,
      days: data.log ? Object.keys(data.log.days).length : 0,
      rounds: data.rounds ? data.rounds.length : 0,
      attempts: data.tests ? data.tests.attempts.length : 0,
    };
    return { ok: true, data, stats, warnings };
  }

  /**
   * mode: 'merge'（同じIDは更新・新しい単語は追加。学習記録は今のものを残す）
   *       'replace'（ファイルの内容に置き換える）
   */
  function applyImport(state, data, mode) {
    if (mode === 'replace') {
      const ids = new Set(data.words.map((w) => w.id));
      return {
        words: data.words,
        progress: data.progress || {},
        log: data.log || { days: {}, totalPoints: 0 },
        settings: data.settings || state.settings,
        session: null,
        rounds: mergeRounds(data.rounds || [], [], ids).rounds,
        tests: data.tests || emptyTests(),
      };
    }
    const byId = new Map(state.words.map((w) => [w.id, w]));
    data.words.forEach((w) => byId.set(w.id, w));
    const words = Array.from(byId.values());
    const progress = Object.assign({}, state.progress);
    if (data.progress) {
      Object.keys(data.progress).forEach((id) => {
        if (!progress[id]) progress[id] = data.progress[id];
      });
    }
    const ids = new Set(words.map((w) => w.id));
    const rounds = mergeRounds(state.rounds || [], data.rounds || [], ids).rounds;
    return { words, progress, rounds };
  }

  return {
    PREFIX, KEYS, FORMAT, STATUS, POS, ROLE, GROUPS, DEFAULT_SETTINGS,
    localBackend, memoryBackend, pickBackend, createStore,
    normalizeWord, normalizeSense, normalizeProgress, normalizeLog, normalizeSettings,
    normalizeRounds, mergeRounds, normalizeTests, emptyTests,
    buildExport, exportFileName, parseImport, applyImport, safeUrl,
  };
});
