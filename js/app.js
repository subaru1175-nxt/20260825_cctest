/*
 * app.js — 画面の表示と操作
 * 画面: タイトル / ホーム（今日の学習・テスト）/ 回 / カード学習 / 学習結果 / ミスの確認 / テスト / テスト結果 /
 *       覚えていないリスト / 単語一覧 / 単語詳細 / 単語の編集 / 設定
 * URL の # で画面を切り替える（タイトルは # なし, #home, #round-<id>, #study, #result, #check, #test, #score-<id>, #misses,
 *   #words, #word-<id>, #edit-<id>, #new-word, #options）
 *
 * 毎日の順番（ホームの「今日の学習」）
 *   ① 単語を覚える（英語 → 場面）② 逆から思い出す（場面 → 英語）③ ミスを確認 ④ 間違えた問題を解く（練習）⑤ テスト（20:00 から）
 * テスト：今日のテスト／再テスト（必須。満点になるまで毎日）／まとめテスト（5日ごと）／月のまとめテスト（毎月1日）。
 * 1日の区切りは朝4:00（夜ふかしの時間は前の日）。時刻の決まりは schedule.js
 *
 * 操作の決まり（どの画面でも同じ形にする）
 *   青いボタン     … そのまとまりでいちばん大事な操作（1つだけ）
 *   白いボタン     … もう一つの操作
 *   › のある行     … 別の画面へ移る（赤い文字の行は、消す操作）
 *   切り替え       … 出題のしかたなど、2〜3個から選ぶもの
 *   再生｜ゆっくり … 英語の音声。下の小さな文字が音声の種類（AI音声・録音・端末の読み上げ）
 */
(function () {
  'use strict';

  const C = window.CIF;
  const util = C.util;
  const srs = C.srs;
  const SS = C.session;
  const ST = C.storage;
  const DG = C.diagrams;
  const Q = C.quiz;
  const Sched = C.schedule;
  const esc = util.esc;

  const $app = document.getElementById('app');
  const $modal = document.getElementById('modal');
  const $toast = document.getElementById('toast');

  const SAMPLE_TEXT = 'Hello! This is how I sound.';
  const APP_NAME = '暗記CARD';
  const DAILY_MAX = 20; // 今日のテストに出す単語の上限
  const SUMMARY_MIN = 3; // まとめテストに必要な単語の数
  const STEP_NO = ['①', '②', '③', '④', '⑤'];

  let store = null;
  let speech = null;
  let aidSeq = 0;
  let packNoticeShown = false;
  const index = { words: new Map(), senses: new Map() };
  const navStack = [];
  const ui = {
    route: '',
    param: '',
    query: '',
    filter: 'all',
    hint: false,
    autoplayNext: false,
    editDraft: null,
    editErrors: [],
    editSourcesText: '',
    importPreview: null,
    importText: '',
    exportText: '',
    includeProgress: true,
    modal: null,
    roundFilter: 'all',
    missStatus: 'open',
    missRound: 'all',
    order: [],
    testFeedback: null,
    testIntro: '',
    fbTimer: null,
    editRound: '',
    deviceOpen: false,
    listenPlayed: '',
    alertTimer: null,
  };

  /* ================= アイコン ================= */

  const ICON = {
    speaker: '<path d="M4 9.5v5h3.5L12 18.5v-13L7.5 9.5H4z"/><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11"/>',
    slow: '<path d="M4 9.5v5h3.5L12 18.5v-13L7.5 9.5H4z"/><path d="M15.5 10.5a2 2 0 0 1 0 3"/>',
    mute: '<path d="M4 9.5v5h3.5L12 18.5v-13L7.5 9.5H4z"/><path d="M16 9.5l5 5M21 9.5l-5 5"/>',
    home: '<path d="M4 11l8-6.5 8 6.5"/><path d="M6 9.5V20h12V9.5"/><path d="M10 20v-5h4v5"/>',
    cards: '<rect x="3.5" y="6" width="13" height="14" rx="2"/><path d="M7.5 6V4.5a1 1 0 0 1 1-1H19a1.5 1.5 0 0 1 1.5 1.5v11.5a1 1 0 0 1-1 1H16.5"/><path d="M6.5 11h7M6.5 14.5h5"/>',
    sliders: '<path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>',
    close: '<path d="M6 6l12 12M18 6L6 18"/>',
    back: '<path d="M15 5l-7 7 7 7"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
    check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
    list: '<path d="M9 6h11M9 12h11M9 18h11"/><path d="M4.5 6h.01M4.5 12h.01M4.5 18h.01"/>',
    chevron: '<path d="M9 5l7 7-7 7"/>',
    share: '<path d="M8.5 9H7a1.5 1.5 0 0 0-1.5 1.5v8A1.5 1.5 0 0 0 7 20h10a1.5 1.5 0 0 0 1.5-1.5v-8A1.5 1.5 0 0 0 17 9h-1.5"/><path d="M12 3.5v10M8.8 6.6L12 3.4l3.2 3.2"/>',
    calendar: '<rect x="4" y="5.5" width="16" height="14.5" rx="2"/><path d="M4 10h16M8.5 3.5v4M15.5 3.5v4"/>',
    bell: '<path d="M6.5 16.5V11a5.5 5.5 0 0 1 11 0v5.5l1.5 1.5H5l1.5-1.5z"/><path d="M10 20.5a2.2 2.2 0 0 0 4 0"/>',
    clock: '<circle cx="12" cy="12" r="8"/><path d="M12 7.5V12l3 2"/>',
  };

  function icon(name, cls) {
    return '<svg class="ic' + (cls ? ' ' + cls : '') + '" viewBox="0 0 24 24" aria-hidden="true" focusable="false">' + ICON[name] + '</svg>';
  }

  /* ================= 起動 ================= */

  async function boot() {
    $app.innerHTML = '<div class="screen loading"><p>読み込み中…</p></div>';
    const backend = await ST.pickBackend();
    store = ST.createStore(backend);
    await store.init(C.seed);
    rebuildIndex();
    ensureStartDay();
    if (store.state.session) {
      const fixed = SS.sanitize(store.state.session, store.state.words);
      store.set('session', fixed);
    }
    speech = C.speech.create(window, () => store.state.settings);
    speech.onChange(refreshAudioUI);
    store.onStatus(() => {
      const el = document.getElementById('save-banner');
      if (el) el.outerHTML = saveBanner();
      else if (store.status.error) render(false);
    });

    window.addEventListener('hashchange', () => onRoute(false));
    document.addEventListener('click', onClick);
    document.addEventListener('input', onInput);
    document.addEventListener('change', onChange);
    document.addEventListener('keydown', onKey);
    document.addEventListener('toggle', onToggle, true);
    document.addEventListener('submit', (e) => e.preventDefault());
    document.addEventListener('visibilitychange', onVisible);
    setInterval(tick, 30000);
    scheduleAlert();
    onRoute(true);
  }

  function rebuildIndex() {
    index.words = new Map();
    index.senses = new Map();
    store.state.words.forEach((w) => {
      index.words.set(w.id, w);
      w.senses.forEach((s, i) => index.senses.set(s.id, { word: w, sense: s, n: i + 1, total: w.senses.length }));
    });
  }

  function setWords(words) {
    store.set('words', words);
    rebuildIndex();
  }

  function setSettings(patch) {
    store.set('settings', Object.assign({}, store.state.settings, patch));
  }

  /* ================= 画面の切り替え ================= */

  function parseHash() {
    let h = '';
    try { h = decodeURIComponent((location.hash || '').replace(/^#/, '')); } catch (e) { h = ''; }
    if (!h || h === 'title') return { route: 'title', param: '' };
    if (h === 'home') return { route: 'home', param: '' };
    if (['study', 'result', 'words', 'options', 'new-word', 'test', 'misses', 'check', 'install'].includes(h)) return { route: h, param: '' };
    if (h.indexOf('word-') === 0) return { route: 'word', param: h.slice(5) };
    if (h.indexOf('round-') === 0) return { route: 'round', param: h.slice(6) };
    if (h.indexOf('score-') === 0) return { route: 'score', param: h.slice(6) };
    if (h.indexOf('edit-') === 0) return { route: 'edit', param: h.slice(5) };
    return { route: 'home', param: '' };
  }

  /** how: 'push'（go で進む）/ 'replace'（入れ替え）/ なし（ブラウザの戻る・進む・リンク） */
  function onRoute(force, how) {
    const r = parseHash();
    const changed = r.route !== ui.route || r.param !== ui.param;
    if (!changed && !force) return;
    if (changed) {
      const key = r.route + ':' + r.param;
      if (how === 'replace' && navStack.length) navStack[navStack.length - 1] = key;
      else if (how === 'push') navStack.push(key);
      else if (navStack.length > 1 && navStack[navStack.length - 2] === key) navStack.pop();
      else navStack.push(key);
      if (navStack.length > 60) navStack.shift();
      if (speech) speech.stop();
    }
    ui.route = r.route;
    ui.param = r.param;
    if (changed) {
      ui.hint = false;
      if (r.route === 'edit' || r.route === 'new-word') prepareEditor();
      if (r.route !== 'options') ui.importPreview = null;
      // ③ ミスを確認：この画面を開いたら「確認した」にする
      if (r.route === 'check') store.set('meta', Object.assign({}, store.state.meta, { checkAt: Date.now() }));
    }
    render(true);
  }

  /**
   * 画面を移動する（クリック処理の中ですぐ描画するので、音声の自動再生も動く）
   * replace: 履歴に残さず今の画面と入れ替える（リダイレクトや保存後の移動）
   */
  function go(hash, replace) {
    if (('#' + hash) !== location.hash) {
      if (replace) location.replace('#' + hash);
      else location.hash = hash;
    }
    onRoute(true, replace ? 'replace' : 'push');
  }

  function goBack(fallback) {
    if (navStack.length > 1) history.back();
    else go(fallback, true);
  }

  function render(resetScroll) {
    let html = null;
    switch (ui.route) {
      case 'title': html = viewTitle(); break;
      case 'study': html = viewStudy(); break;
      case 'result': html = viewResult(); break;
      case 'words': html = viewWords(); break;
      case 'word': html = viewWord(); break;
      case 'edit':
      case 'new-word': html = viewEdit(); break;
      case 'options': html = viewOptions(); break;
      case 'round': html = viewRound(); break;
      case 'test': html = viewTest(); break;
      case 'score': html = viewScore(); break;
      case 'misses': html = viewMisses(); break;
      case 'check': html = viewCheck(); break;
      case 'install': html = viewInstall(); break;
      default: html = viewHome();
    }
    if (html == null) return;
    const withNav = ['home', 'words', 'word', 'options', 'round', 'score', 'misses', 'check', 'install'].includes(ui.route);
    $app.innerHTML = saveBanner() + html + (withNav ? navBar() : '');
    document.body.dataset.route = ui.route;
    if (resetScroll) window.scrollTo(0, 0);
    afterRender();
  }

  function afterRender() {
    if (ui.route === 'study') {
      const s = store.state.session;
      if (ui.autoplayNext) {
        ui.autoplayNext = false;
        if (store.state.settings.autoplay && s && !s.flipped && s.mode === 'fwd') {
          const btn = $app.querySelector('.card-front .audio button[data-slow="0"]:not([disabled])');
          if (btn) playFrom(btn);
        }
      }
      preloadStudy(s);
    }
    if (ui.route === 'result') {
      const h = document.getElementById('result-title');
      if (h) h.focus({ preventScroll: true });
    }
    if (ui.route === 'test') {
      // 聞き取りの問題は、出したときに英文を1回鳴らす
      const a = store.state.tests.current;
      const q = a && !ui.testFeedback ? Q.current(a) : null;
      if (q && q.qtype === 'listen' && ui.listenPlayed !== a.id + q.id) {
        ui.listenPlayed = a.id + q.id;
        const btn = $app.querySelector('.qcard .audio button[data-slow="0"]:not([disabled])');
        if (btn) playFrom(btn);
      }
    }
  }

  function navBar() {
    const item = (route, hash, ic, label) => {
      const cur = ui.route === route || (route === 'words' && ui.route === 'word') || (route === 'home' && ['round', 'score', 'check'].includes(ui.route));
      return '<a class="nav-item' + (cur ? ' is-current' : '') + '" href="#' + hash + '"' + (cur ? ' aria-current="page"' : '') + '>' +
        icon(ic) + '<span>' + label + '</span></a>';
    };
    return '<nav class="bottom-nav" aria-label="メニュー">' +
      item('home', 'home', 'home', 'ホーム') + item('words', 'words', 'cards', '単語') + item('misses', 'misses', 'list', '復習リスト') + item('options', 'options', 'sliders', '設定') +
      '</nav>';
  }

  function saveBanner() {
    const st = store && store.status;
    if (!st) return '';
    let msg = '';
    if (st.error) msg = st.error;
    else if (!st.persistent) msg = 'このブラウザでは学習記録を保存できません。ページを閉じると記録が消えます。設定の「ファイルに書き出す」で保存してください。';
    if (!msg) return '<div id="save-banner" hidden></div>';
    return '<div id="save-banner" class="banner warn" role="alert">' + esc(msg) + '</div>';
  }

  /* ================= 共通の部品 ================= */

  /** 見出し（戻るボタン・題名・右側の操作） */
  function pageHead(title, opts) {
    const o = opts || {};
    const right = o.right ? '<div class="side right">' + o.right + '</div>' : '';
    if (!o.back) return '<header class="page-head"><h1 tabindex="-1">' + esc(title) + '</h1>' + right + '</header>';
    return '<header class="page-head sub"><div class="side"><button type="button" class="icon-btn" data-action="back" data-fallback="' + esc(o.back) + '" aria-label="戻る">' + icon('back') + '</button></div>' +
      '<h1 tabindex="-1">' + esc(title) + '</h1>' + (right || '<div class="side right"></div>') + '</header>';
  }

  function section(title, body, opts) {
    const o = opts || {};
    return '<section class="section"' + (o.id ? ' id="' + o.id + '"' : '') + '>' +
      (title ? '<h2 class="section-title">' + esc(title) + (o.note ? '<span>' + esc(o.note) + '</span>' : '') + '</h2>' : '') +
      body + '</section>';
  }

  /** 一覧の行。title / sub は文字列、detail は HTML。cls に danger / action を入れると › を出さない */
  function rowInner(title, sub, detail, cls) {
    const chev = !/\b(danger|action)\b/.test(cls || '');
    return '<span class="r-main"><span class="r-title">' + esc(title) + '</span>' + (sub ? '<span class="r-sub">' + esc(sub) + '</span>' : '') + '</span>' +
      (detail ? '<span class="r-detail">' + detail + '</span>' : '') + (chev ? icon('chevron') : '');
  }

  function rowLink(href, title, sub, detail, cls) {
    return '<a class="row' + (cls ? ' ' + cls : '') + '" href="' + esc(href) + '">' + rowInner(title, sub, detail, cls) + '</a>';
  }

  function rowBtn(action, attrs, title, sub, detail, cls) {
    return '<button type="button" class="row' + (cls ? ' ' + cls : '') + '" data-action="' + action + '"' + (attrs || '') + '>' + rowInner(title, sub, detail, cls) + '</button>';
  }

  function segButtons(action, current, items, label) {
    return '<div class="seg" role="group" aria-label="' + esc(label) + '">' + items.map(([v, l]) =>
      '<button type="button" data-action="' + action + '" data-v="' + esc(v) + '" aria-pressed="' + (v === current) + '">' + esc(l) + '</button>').join('') + '</div>';
  }

  function selectBox(id, current, items, label) {
    return '<div class="select"><select id="' + id + '" aria-label="' + esc(label) + '">' +
      items.map(([v, l]) => '<option value="' + esc(v) + '"' + (v === current ? ' selected' : '') + '>' + esc(l) + '</option>').join('') + '</select></div>';
  }

  function toggleRow(id, label, checked, sub) {
    return '<label class="toggle" for="' + id + '"><span class="t-text"><span>' + esc(label) + '</span>' + (sub ? '<span class="r-sub">' + esc(sub) + '</span>' : '') + '</span>' +
      '<input type="checkbox" id="' + id + '" role="switch"' + (checked ? ' checked' : '') + '></label>';
  }

  function posLabel(pos) {
    return ST.POS[pos] || 'その他';
  }

  function roleLine(sense) {
    const pos = posLabel(sense.pos);
    if (!sense.role) return '<p class="role-line"><span class="role-chip">' + esc(pos) + '</span></p>';
    return '<p class="role-line"><span class="role-chip">' + esc(ST.ROLE[sense.role]) + '</span>を表す言葉<span class="role-pos">（' + esc(pos) + '）</span></p>';
  }

  function ipaOf(sense) {
    const accent = store.state.settings.accent;
    const ipa = sense.ipa || {};
    return (accent === 'uk' ? ipa.uk || ipa.us : ipa.us || ipa.uk) || '';
  }

  /* ----- 音声 ----- */

  /** AI音声（音声パック）の中の、この英語の部分（ファイル・開始秒・終了秒） */
  /** 英語を比べるための形（大文字・小文字、’ と '、空白の違いを無視） */
  function sameText(a, b) {
    const f = (x) => String(x || '').replace(/[’‘]/g, "'").replace(/\s+/g, ' ').trim().toLowerCase();
    return f(a) === f(b);
  }

  /**
   * AI音声の中の1つの区間。key は単語なら '#用法ID'、フレーズ・文なら英語そのもの。
   * expect：画面でボタンのとなりに出している英語。目録の英語と同じときだけ使う（違う音は鳴らさない）。
   */
  function packClip(key, slow, expect) {
    const pack = C.audioPack;
    if (!pack || !pack.clips || (speech && speech.packFailed)) return null;
    const c = pack.clips[(slow ? 's|' : 'n|') + String(key || '').trim()];
    if (!c || c.length < 5 || !(c[2] > c[1])) return null;
    if (expect != null && !sameText(c[4], expect)) return null;
    return { url: (pack.base || '') + c[0], a: c[1], b: c[2], dur: c[3], text: c[4], key: String(key).trim() };
  }

  function packCount() {
    const pack = C.audioPack;
    return pack && pack.clips ? Object.keys(pack.clips).filter((k) => k.indexOf('n|') === 0).length : 0;
  }

  /**
   * 使う音声の種類：録音 → AI音声 → 端末の読み上げ
   * o: { text（端末の読み上げで読む英語）, key（AI音声のキー。なければ text）, expect（となりに出している英語。なければ text）,
   *      src（録音URL）, synth（端末の読み上げを試すとき）, off（要確認などで鳴らさない） }
   */
  function audioSource(o) {
    if (o.off) return { kind: 'off' };
    if (o.synth) return { kind: 'synth' };
    if (o.src) return { kind: 'rec' };
    const key = o.key || o.text;
    const expect = o.expect != null ? o.expect : o.text;
    const n = packClip(key, false, expect);
    const s = n && packClip(key, true, expect);
    if (n && s) return { kind: 'pack', n, s };
    return { kind: 'synth' };
  }

  /** 単語の音声：用法ごとに、見出し語だけを、その用法の発音で（AI音声のキー '#用法ID'） */
  function wordAudio(item) {
    const s = item.sense;
    return {
      key: '#' + s.id,
      expect: item.word.headword,
      // 端末の読み上げは発音を指定できないので、品詞で読みが変わる語だけ、その発音になる語句（speak）を読む
      text: s.speak || item.word.headword,
      src: s.audio && s.audio.word,
      off: !isStudyable(item.word, s),
    };
  }

  function capText(kind) {
    if (kind === 'off') return '要確認のため、音声はありません';
    if (kind === 'rec') return '録音（人の声）';
    if (kind === 'pack') return 'AI音声・アメリカ英語';
    if (speech && speech.canSynth()) return '端末の読み上げ';
    if (speech && speech.status === 'loading') return '音声を準備中…';
    return 'この端末では再生できません';
  }

  function audioAttrs(src, text, slow, recorded) {
    const aid = 'a' + (++aidSeq);
    let a = ' data-action="speak" data-aid="' + aid + '" data-kind="' + src.kind + '" data-text="' + esc(text) + '" data-slow="' + (slow ? '1' : '0') + '"';
    if (src.kind === 'rec') a += ' data-src="' + esc(recorded) + '"';
    if (src.kind === 'pack') {
      const c = slow ? src.s : src.n;
      a += ' data-src="' + esc(c.url) + '" data-a="' + c.a + '" data-b="' + c.b + '" data-dur="' + c.dur + '" data-key="' + esc(c.key) + '" data-clip="' + esc(c.text) + '"';
    }
    return a;
  }

  /**
   * 音声の操作（どの画面でも同じ形）：［再生｜ゆっくり］と、その下に音声の種類
   * opts: text, src（録音URL）, what（何を読むか）, sm, left,
   *       cap（true=いつも種類を出す / 'auto'=AI音声以外のときだけ出す）
   */
  function audioCtl(opts) {
    const text = String(opts.text || '').trim();
    const src = audioSource(Object.assign({}, opts, { text }));
    const enabled = src.kind === 'pack' || src.kind === 'rec' || (src.kind === 'synth' && !!(speech && speech.canSynth()));
    const what = opts.what || '英語';
    const kindName = src.kind === 'rec' ? '録音' : src.kind === 'pack' ? 'AI音声' : '端末の読み上げ';
    const btn = (slow) => '<button type="button"' + audioAttrs(src, text, slow, opts.src) +
      ' aria-label="' + esc(what + 'を' + (slow ? 'ゆっくり' : '') + '再生（' + kindName + '）') + '"' + (enabled ? '' : ' disabled') + '>' +
      icon(enabled ? (slow ? 'slow' : 'speaker') : 'mute') + '<span>' + (slow ? 'ゆっくり' : '再生') + '</span></button>';
    const showCap = opts.cap === true || (opts.cap === 'auto' && src.kind !== 'pack') || src.kind === 'off';
    const cap = capText(src.kind);
    // 種類の表示は、AI音声の例文などではふだん隠し、再生中だけ「何倍で再生しているか」を出す
    return '<div class="audio-wrap' + (opts.left ? ' left' : '') + '">' +
      '<div class="audio' + (opts.sm ? ' sm' : '') + (enabled ? '' : ' off') + '" role="group" aria-label="' + esc(what + 'の音声') + '" data-kind="' + src.kind + '">' + btn(false) + btn(true) + '</div>' +
      '<span class="audio-cap" aria-live="polite" data-cap="' + esc(cap) + '"' + (showCap ? '' : ' data-hide="1" hidden') + '>' + esc(cap) + '</span></div>';
  }

  /** ゆっくりの倍率（音声パックの設定から。1語・2〜4語・5語以上） */
  function slowFactor(text) {
    const sl = (C.audioPack && C.audioPack.slow) || {};
    const n = String(text || '').trim().split(/\s+/).length;
    return n === 1 ? sl['1'] : n <= 4 ? sl['2-4'] : sl['5+'];
  }

  /** 再生中に出す文（ゆっくりは、ふつうの何倍の長さか・何秒か） */
  function playingText(btn, kind, slow) {
    if (kind === 'pack') {
      const pad = ((C.audioPack && C.audioPack.pad) || [0, 0]).reduce((x, y) => x + y, 0);
      const sec = Math.max(0.1, Number(btn.dataset.dur) - pad).toFixed(1);
      if (!slow) return '再生中（' + sec + '秒）';
      const f = slowFactor(btn.dataset.clip || btn.dataset.text);
      return 'ゆっくり再生中（' + (f ? 'ふつうの' + f + '倍・' : '') + sec + '秒）';
    }
    if (!slow) return '再生中';
    return kind === 'rec' ? 'ゆっくり再生中（録音）' : 'ゆっくり再生中（端末の読み上げ）';
  }

  /** 再生中の表示をすべて元に戻す */
  function clearPlaying() {
    $app.querySelectorAll('.audio button.playing, .speak-one.playing').forEach((b) => b.classList.remove('playing'));
    $app.querySelectorAll('.audio.run').forEach((g) => {
      g.classList.remove('run', 'timed');
      const cap = g.parentElement && g.parentElement.querySelector('.audio-cap');
      if (cap) {
        cap.textContent = cap.dataset.cap || '';
        cap.hidden = cap.dataset.hide === '1';
        cap.classList.remove('live');
      }
    });
  }

  /** 丸い再生ボタン（表面のフレーズ用） */
  function speakOne(text, what, off) {
    const t = String(text || '').trim();
    const src = audioSource({ text: t, off });
    const enabled = src.kind === 'pack' || (src.kind === 'synth' && !!(speech && speech.canSynth()));
    return '<button type="button" class="speak-one"' + audioAttrs(src, t, false, '') +
      ' aria-label="' + esc((what || 'フレーズ') + 'を再生') + '"' + (enabled ? '' : ' disabled') + '>' + icon(enabled ? 'speaker' : 'mute') + '</button>';
  }

  /** 端末の読み上げを使うのに、声がまだ・ないときだけ出すお知らせ */
  function speechBanner(kind) {
    const need = kind === 'synth' && speech && speech.status !== 'ready';
    if (!need) return '<div data-speech-banner data-kind="' + kind + '" hidden></div>';
    const loading = speech.status === 'loading';
    return '<div data-speech-banner data-kind="' + kind + '" class="banner ' + (loading ? 'info' : 'warn') + '" role="status">' +
      esc(speech.message()) + (loading ? '' : ' <a href="#options">音声の設定</a>') + '</div>';
  }

  /** 端末の声が使えるようになったら、表示中のボタンを更新する */
  function refreshAudioUI() {
    const ok = speech.canSynth();
    $app.querySelectorAll('.audio[data-kind="synth"]').forEach((g) => {
      g.classList.toggle('off', !ok);
      g.querySelectorAll('button').forEach((b) => {
        b.disabled = !ok;
        const ic = b.querySelector('.ic');
        if (ic) ic.outerHTML = icon(ok ? (b.dataset.slow === '1' ? 'slow' : 'speaker') : 'mute');
      });
      const cap = g.parentElement && g.parentElement.querySelector('.audio-cap');
      if (cap && !cap.classList.contains('live')) {
        cap.dataset.cap = capText('synth');
        cap.textContent = cap.dataset.cap;
      }
    });
    $app.querySelectorAll('.speak-one[data-kind="synth"]').forEach((b) => {
      b.disabled = !ok;
      const ic = b.querySelector('.ic');
      if (ic) ic.outerHTML = icon(ok ? 'speaker' : 'mute');
    });
    $app.querySelectorAll('[data-speech-banner]').forEach((el) => {
      el.outerHTML = speechBanner(el.dataset.kind || 'synth');
    });
    const dv = document.getElementById('device-voice');
    if (dv) dv.outerHTML = deviceVoiceHtml();
  }

  function playFrom(btn) {
    const aid = btn.dataset.aid;
    const kind = btn.dataset.kind;
    const slow = btn.dataset.slow === '1';
    const text = btn.dataset.text || '';
    const mark = (on) => {
      clearPlaying();
      if (!on) return;
      const b = $app.querySelector('[data-aid="' + aid + '"]');
      if (!b) return;
      b.classList.add('playing');
      const g = b.closest('.audio');
      if (!g) return;
      // 再生の長さだけ進む線（AI音声は長さが分かる。それ以外は動き続ける線）
      const dur = kind === 'pack' ? Number(b.dataset.dur) : 0;
      g.style.setProperty('--dur', (dur || 1.2) + 's');
      g.classList.toggle('timed', !!dur);
      g.classList.add('run');
      const cap = g.parentElement && g.parentElement.querySelector('.audio-cap');
      if (cap) {
        cap.textContent = playingText(b, kind, slow);
        cap.hidden = false;
        cap.classList.add('live');
      }
    };
    const synthState = (state, detail) => {
      mark(state === 'playing');
      if (state === 'error') toast(audioError(detail, false));
    };
    const onState = (state, detail) => {
      mark(state === 'playing');
      if (state !== 'error') return;
      if (detail === 'pack') {
        // AI音声を読み込めなかった → 端末の読み上げに切り替える
        if (!packNoticeShown) {
          packNoticeShown = true;
          toast('AI音声を読み込めませんでした。端末の読み上げに切り替えます。');
        }
        render(false);
        if (speech.canSynth()) speech.speak(text, { slow, onState: synthState });
        return;
      }
      toast(audioError(detail, kind === 'rec'));
    };
    let ok;
    if (kind === 'pack') ok = speech.playClip(btn.dataset.src, Number(btn.dataset.a), Number(btn.dataset.b), { onState });
    else if (kind === 'rec') ok = speech.play(btn.dataset.src, { slow, isSlowFile: false, onState });
    else ok = speech.speak(text, { slow, onState });
    if (!ok) toast(speech.message() || '音声を再生できません。');
  }

  function audioError(code, recorded) {
    if (recorded) return '録音を再生できませんでした。ファイルの場所（URL）を確認してください。';
    if (code === 'no-start') return '音声が再生されませんでした。音量や、設定の「端末の読み上げ」の声を確認してください。';
    if (code === 'not-allowed') return 'ブラウザが音声を止めました。もう一度ボタンを押してください。';
    if (code === 'voice-unavailable' || code === 'language-unavailable') return '選んだ英語の声が使えません。設定で別の声を選んでください。';
    return '音声の再生に失敗しました。もう一度試してください。';
  }

  /** 次に出るカードの音声を先に読み込んでおく */
  function preloadStudy(s) {
    if (!s || !speech || !s.queue) return;
    s.queue.slice(0, 2).forEach((sid, i) => {
      const it = index.senses.get(sid);
      if (!it) return;
      [false, true].forEach((slow) => {
        if (slow && i > 0) return;
        const c = packClip('#' + sid, slow, it.word.headword);
        if (c) speech.preload(c.url, c.a, c.b);
      });
    });
  }

  /* ----- カードの中身 ----- */

  function sceneArt(sense) {
    const d = sense.scene && sense.scene.diagram;
    if (d && DG.has(d)) return '<div class="scene-art has-dg">' + DG.get(d) + '</div>';
    return '';
  }

  function stressHtml(stress) {
    if (!stress) return '';
    const parts = stress.split(/[·・\-\s]+/).filter(Boolean);
    if (parts.length < 2) return '';
    return '<span class="stress" aria-label="強く読む位置：' + esc(parts.filter((p) => p === p.toUpperCase()).join('').toLowerCase()) + '">' +
      parts.map((p) => {
        const strong = p === p.toUpperCase() && /[A-Z]/.test(p);
        return '<span class="syl' + (strong ? ' strong' : '') + '"><i></i>' + esc(p.toLowerCase()) + '</span>';
      }).join('') + '</span>';
  }

  function exampleHtml(item, ex, i) {
    const src = (item.sense.audio && item.sense.audio.examples && item.sense.audio.examples[i]) || '';
    return '<div class="ex">' +
      '<p class="ex-en" lang="en">' + util.markedHtml(ex.en) + '</p>' +
      (ex.ja ? '<p class="ex-ja">' + esc(ex.ja) + '</p>' : '') +
      audioCtl({ text: util.plainSentence(ex.en), src, what: '例文', sm: true, left: true, cap: 'auto', off: !isStudyable(item.word, item.sense) }) +
      '</div>';
  }

  /** 端末の読み上げで、品詞で読みが変わる語を語句で読むときだけ、そのことを書く */
  function speakNote(item) {
    const sp = item.sense.speak;
    if (!sp || sameText(sp, item.word.headword)) return '';
    if (audioSource(wordAudio(item)).kind !== 'synth') return '';
    return '<p class="speak-note">端末の読み上げでは、この用法の発音にするため「<span lang="en">' + esc(sp) + '</span>」と読みます</p>';
  }

  /** 場面→英語の練習用に、例文の単語を空欄にする（空欄にできない例文は英語を出さない） */
  function clozeFor(item) {
    const head = item.word.headword;
    for (const ex of item.sense.examples) {
      if (util.parseMarked(ex.en).some((p) => p.hit)) return { en: util.clozeHtml(ex.en), ja: ex.ja };
      const re = new RegExp('\\b' + head.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\w*', 'i');
      if (re.test(ex.en)) {
        return { en: util.clozeHtml(ex.en.replace(re, (m) => '[' + m + ']')), ja: ex.ja };
      }
    }
    const first = item.sense.examples[0];
    return first && first.ja ? { en: '', ja: first.ja } : null;
  }

  function hintText(head) {
    return head.split(' ').map((w) => w.charAt(0) + ' ' + Array(Math.max(0, w.length - 1)).fill('_').join(' ')).join('　') +
      '（' + head.replace(/\s/g, '').length + '文字）';
  }

  function statusBadge(status) {
    const s = ST.STATUS[status] || ST.STATUS.unverified;
    return '<span class="badge st-' + s.key + '">' + s.label + '</span>';
  }

  function levelChip(state) {
    const lv = srs.level(state);
    return '<span class="level lv-' + lv.key + '">' + lv.label + '</span>';
  }

  function isStudyable(word, sense) {
    return word.status !== 'needs_review' && sense.status !== 'needs_review';
  }

  function doneMark() {
    return '<svg class="done-mark" viewBox="0 0 52 52" aria-hidden="true"><circle cx="26" cy="26" r="24"/><path d="M15 27l7 7 15-15"/></svg>';
  }

  /* ================= 1日の流れ・テストの時間 ================= */

  function testTime() {
    return Sched.normalizeTime(store.state.settings.testTime);
  }

  /** 学習記録の日付に使う時刻（朝4:00より前は前の日として数える） */
  function dnow(now) {
    return Sched.dayClock(now);
  }

  /** 使いはじめた日（まとめテストを数える1日目） */
  function startDayTs() {
    const k = store.state.meta && store.state.meta.startDay;
    return /^\d{4}-\d{2}-\d{2}$/.test(k || '') ? util.parseDayKey(k) : Sched.studyDay(Date.now());
  }

  /** 使いはじめた日がまだ決まっていなければ、いちばん古い学習記録の日（なければ今日）にする */
  function ensureStartDay() {
    const meta = store.state.meta || {};
    if (/^\d{4}-\d{2}-\d{2}$/.test(meta.startDay || '')) return;
    const today = util.dayKey(Sched.studyDay(Date.now()));
    const days = Object.keys((store.state.log && store.state.log.days) || {}).filter((k) => /^\d{4}-\d{2}-\d{2}$/.test(k) && k <= today).sort();
    store.set('meta', Object.assign({}, meta, { startDay: days.length ? days[0] : today }));
  }

  function studyableItems() {
    return SS.studyable(store.state.words).filter((it) => it.sense.meaning);
  }

  /** 覚えていないリストのキー（用法|部）が、いま出題できる用法か */
  function liveKey(k) {
    const it = index.senses.get(String(k).split('|')[0]);
    return !!(it && isStudyable(it.word, it.sense) && it.sense.meaning);
  }

  /** 「今日 20:00」「明日 20:00」「11月8日（日） 20:00」（カレンダーの日付で） */
  function whenLabel(ts, now) {
    const d = util.daysBetween(now, ts);
    const t = Sched.clock(ts);
    if (d === 0) return '今日 ' + t;
    if (d === 1) return '明日 ' + t;
    return todayLabel(ts) + ' ' + t;
  }

  function shortDate(ts) {
    const d = new Date(ts);
    return (d.getMonth() + 1) + '/' + d.getDate();
  }

  /** 今日（学習の日）のカード学習：学習した用法と、最初に「思い出せなかった・あいまい」だった用法 */
  function dayInfo(now) {
    const st = store.state;
    const range = Sched.dayRange(now);
    const out = { range, fwd: [], rev: [], weak: [], studied: [], lastAt: 0 };
    SS.studyable(st.words).forEach((it) => {
      const sid = it.sense.id;
      let any = false;
      ['fwd', 'rev'].forEach((mode) => {
        const s = SS.stateOf(st.progress, sid, mode);
        const h = ((s && s.history) || []).filter((x) => x.t >= range.from && x.t < range.to && x.t <= now);
        if (!h.length) return;
        any = true;
        out[mode].push(sid);
        let first = h[0];
        h.forEach((x) => {
          if (x.t < first.t) first = x;
          if (x.t > out.lastAt) out.lastAt = x.t;
        });
        if (first.r === 'again' || first.r === 'hard') out.weak.push({ sid, mode, r: first.r, t: first.t });
      });
      if (any) out.studied.push(sid);
    });
    return out;
  }

  /**
   * ② で出す用法
   *   routine … 今日 ① で覚えて、まだ ② をしていないもの
   *   review  … 場面→英語の復習の時期になったもの（前の日までに学習したもの）
   *   relearn … 今日 ② で思い出せず、もう一度の時期になったもの（してもしなくてもよい）
   */
  function revPlan(now, d) {
    const st = store.state;
    const fwd = new Set(d.fwd);
    const rev = new Set(d.rev);
    const out = { routine: [], review: [], relearn: [] };
    SS.studyable(st.words).forEach((it) => {
      if (!SS.eligible(it, st.progress, 'rev')) return;
      const sid = it.sense.id;
      const r = SS.stateOf(st.progress, sid, 'rev');
      const due = !!(r && r.reps && r.due <= now);
      if (fwd.has(sid) && !rev.has(sid)) out.routine.push(sid);
      else if (due && !rev.has(sid)) out.review.push(sid);
      else if (due) out.relearn.push(sid);
    });
    out.must = out.routine.concat(out.review);
    out.all = out.must.concat(out.relearn);
    return out;
  }

  /** ② のセットに入れる用法（しなければいけないもの → もう一度のもの） */
  function revTargets(now, d) {
    return revPlan(now, d).all;
  }

  /** ③④ のミス：テストで間違えた問題（まだ克服していない）と、今日のカードで最初に思い出せなかった・あいまいだった単語 */
  function mistakes(now, d) {
    const st = store.state;
    const test = Q.missList(st.tests, { status: 'open' }).filter((e) => liveKey(e.key));
    const seen = new Set();
    const weak = d.weak.filter((w) => {
      const it = index.senses.get(w.sid);
      if (!it || !it.sense.meaning || seen.has(w.sid)) return false;
      seen.add(w.sid);
      return true;
    });
    const keys = test.map((e) => e.key);
    const types = Q.missTypes(st.tests);
    weak.forEach((w) => {
      const k = w.sid + '|understand';
      if (keys.includes(k)) return;
      keys.push(k);
      types[k] = w.mode === 'rev' ? 'scene' : 'meaning';
    });
    const lastAt = Math.max(0, ...test.map((e) => e.lastAt || 0), ...weak.map((w) => w.t));
    return { test, weak, keys, types, lastAt };
  }

  /** 今日のテストに出す単語：前の「今日のテスト」（または回のテスト）のあとに学習した用法（新しい順に最大20） */
  function dailyItems(now) {
    const st = store.state;
    const lastD = Q.lastTaken(st.tests, 'daily');
    const lastR = Q.lastTaken(st.tests, 'round');
    const since = Math.max(lastD ? lastD.finishedAt : 0, lastR ? lastR.finishedAt : 0, Sched.dayRange(now).from - 6 * util.DAY);
    const list = [];
    studyableItems().forEach((it) => {
      let t = 0;
      ['fwd', 'rev'].forEach((mode) => {
        const s = SS.stateOf(st.progress, it.sense.id, mode);
        ((s && s.history) || []).forEach((h) => { if (h.t > since && h.t <= now && h.t > t) t = h.t; });
      });
      if (t) list.push({ it, t });
    });
    list.sort((a, b) => b.t - a.t);
    return list.slice(0, DAILY_MAX).map((x) => x.it);
  }

  /** まとめテストの問題の数：1つの単語から何問・最大何問（単語が少ないときは1語から2〜3問） */
  function summaryPlan(kind, n) {
    if (kind === 'monthly') {
      const perItem = Math.min(3, Math.max(1, Math.ceil(50 / Math.max(1, n))));
      return { perItem, size: 50, count: Math.min(50, n * perItem) };
    }
    const perItem = n >= 15 ? 1 : 2;
    return { perItem, size: 30, count: Math.min(30, n * perItem) };
  }

  /** テストのようす：いま受けられるか・再テスト・今日のテスト・まとめテスト・月のまとめテスト */
  function testInfo(now) {
    const st = store.state;
    const t = testTime();
    const win = Sched.windowAt(now, t);
    const range = Sched.dayRange(now);
    const openList = Q.missList(st.tests, { status: 'open' }).filter((e) => liveKey(e.key));
    const due = openList.filter((e) => (e.dueAt || 0) <= now).map((e) => e.key);
    const tonight = openList.filter((e) => (e.dueAt || 0) <= win.start).map((e) => e.key);
    const items = studyableItems();
    const sp = Sched.summaryPeriod(now, t, startDayTs());
    const summary = {
      period: sp,
      next: Sched.nextSummaryDay(now, t, startDayTs()),
      items: sp ? Sched.studiedBetween(items, st.progress, sp.from, sp.to) : [],
      taken: sp ? Q.takenAttempt(st.tests, 'summary', sp.key) : null,
    };
    summary.ready = !!sp && !summary.taken && summary.items.length >= SUMMARY_MIN;
    const mp = Sched.monthlyPeriod(now, t);
    const monthly = {
      period: mp,
      next: Sched.nextMonthlyDay(now, t),
      items: Sched.studiedBetween(items, st.progress, mp.from, mp.to),
      taken: Q.takenAttempt(st.tests, 'monthly', mp.key),
    };
    monthly.ready = !monthly.taken && monthly.items.length >= SUMMARY_MIN;
    const today = (st.tests.attempts || []).filter((a) => a.finishedAt >= range.from && a.finishedAt < range.to && a.kind !== 'practice');
    return { win, range, open: openList.map((e) => e.key), due, tonight, daily: dailyItems(now), summary, monthly, today };
  }

  /**
   * 今日の学習の5つの手順。
   *   state … todo（これから）/ done（終わった）/ locked（時間前）/ wait（前の手順のあと）/ none（今日はない）
   *   stat  … 右に出す短い数（10/10・あと10・2件・20:00 など）
   *   desc  … いまの手順にだけ出す一言（HTML）　go … いまの手順のボタン
   */
  function stepsInfo(now) {
    const st = store.state;
    const goal = st.settings.dailyGoal;
    const tt = testTime();
    const d = dayInfo(now);
    const t = testInfo(now);
    const c = SS.counts(st.words, st.progress, now);
    const list = [];

    // ① 単語を覚える（英語 → 場面）
    const left1 = c.newFwd + c.dueFwd;
    const n1 = d.fwd.length;
    list.push({
      title: '単語を覚える', mode: '英語 → 場面',
      state: n1 >= goal || (n1 > 0 && !left1) ? 'done' : left1 ? 'todo' : 'none',
      stat: n1 + '/' + goal,
      desc: left1 ? '英語を見て、場面を思い浮かべます' + (c.dueFwd ? '・復習 ' + c.dueFwd + '枚' : '') : 'いまは覚える単語がありません',
      act: left1 ? ' data-action="start" data-mode="fwd" data-scope="all"' : '',
      go: n1 ? '続きを覚える' : '覚える',
    });

    // ② 逆から思い出す（場面 → 英語）。今日思い出せなかったカードの「もう一度」は、してもしなくてもよい
    const p2 = revPlan(now, d);
    const n2 = d.rev.length;
    list.push({
      title: '逆から思い出す', mode: '場面 → 英語',
      state: p2.must.length ? 'todo' : n2 ? 'done' : n1 ? 'none' : 'wait',
      stat: p2.must.length ? 'あと' + p2.must.length : n2 ? n2 + '枚' : '—',
      desc: p2.must.length ? '場面を見て、英語を思い出します' : '場面から出せる単語がありません',
      act: p2.all.length ? ' data-action="start" data-mode="rev" data-scope="today"' : '',
      go: '思い出す',
    });

    // ③ ミスを確認 ④ 間違えた問題を解く（⑤ が終わった日は、その日の分は終わり）
    const m = mistakes(now, d);
    const has = m.keys.length > 0;
    const tested = t.today.length > 0 && !t.due.length && !t.daily.length;
    const checked = (st.meta.checkAt || 0) >= m.lastAt;
    const lastP = Q.lastTaken(st.tests, 'practice', m.lastAt);
    const parts = [];
    if (m.weak.length) parts.push('思い出せなかった単語 ' + m.weak.length);
    if (m.test.length) parts.push('テストのミス ' + m.test.length);
    list.push({
      title: 'ミスを確認', mode: '',
      state: !has ? (d.studied.length ? 'none' : 'wait') : checked || tested ? 'done' : 'todo',
      stat: has ? (m.test.length + m.weak.length) + '件' : d.studied.length ? '0件' : '—',
      desc: parts.join('・'),
      act: has ? ' data-action="goto" data-to="check"' : '',
      go: '確認する',
    });
    list.push({
      title: '間違えた問題を解く', mode: '練習',
      state: !has ? (d.studied.length ? 'none' : 'wait') : (lastP && lastP.score === 100) || tested ? 'done' : 'todo',
      stat: has ? m.keys.length + '問' : '—',
      desc: '何度でも解けます（記録には入りません）' + (lastP ? '・前回 ' + lastP.score + '点' : ''),
      act: has ? ' data-action="start-kind" data-kind="practice"' : '',
      go: lastP ? 'もう一度解く' : '解く',
    });

    // ⑤ テスト（毎日 20:00 から）
    let s5;
    if (!t.win.open) {
      const extra = [];
      if (t.tonight.length) extra.push('再テスト ' + t.tonight.length + '問');
      if (t.daily.length) extra.push('今日の単語 ' + t.daily.length + '語');
      s5 = {
        state: 'locked',
        stat: tt,
        desc: 'あと <span data-until="' + t.win.start + '">' + esc(Sched.untilText(t.win.start - now)) + '</span>' + (extra.length ? '・' + extra.join('・') : ''),
      };
    } else if (t.due.length) {
      s5 = {
        state: 'todo',
        stat: '必須',
        desc: '再テスト ' + t.due.length + '問' + (t.daily.length ? '・今日の単語 ' + t.daily.length + '語' : '') + '・朝4:00まで',
        act: ' data-action="start-kind" data-kind="retest"',
        go: '再テストを受ける（' + t.due.length + '問）',
      };
    } else if (t.daily.length) {
      s5 = {
        state: 'todo',
        stat: t.daily.length + '語',
        desc: '今日学習した単語のテスト・朝4:00まで',
        act: ' data-action="start-kind" data-kind="daily"',
        go: '今日のテストを受ける',
      };
    } else if (t.today.length) {
      s5 = { state: 'done', stat: t.today[t.today.length - 1].score + '点', desc: '今日のテストは終わりました' };
    } else {
      s5 = { state: 'none', stat: '—', desc: '今日は受けるテストがありません' };
    }
    list.push(Object.assign({ title: 'テスト', mode: tt + '〜' }, s5));

    const current = list.findIndex((x) => x.state === 'todo' || x.state === 'locked');
    const done = list.filter((x) => x.state === 'done' || x.state === 'none').length;
    return { list, current, done, day: d, tests: t };
  }

  /** ホームの「今日の学習」：5つの手順。ふだんは名前と数だけ。いまの手順にだけ一言と青いボタン */
  function stepsHtml(info) {
    const allDone = info.current < 0 && info.list[4].state === 'done';
    return '<ol class="steps" aria-label="今日の学習の順番">' + info.list.map((s, i) => {
      const cur = i === info.current;
      const cls = 'step st-' + s.state + (cur ? ' is-current' : '');
      const no = '<span class="step-no" aria-hidden="true">' + (s.state === 'done' ? icon('check') : i + 1) + '</span>';
      const head = '<span class="step-main"><span class="step-title">' + esc(s.title) + '</span>' +
        (s.mode ? '<span class="step-mode">' + esc(s.mode) + '</span>' : '') + '</span>' +
        '<span class="step-stat">' + esc(s.stat) + '</span>';
      if (cur) {
        return '<li class="' + cls + '"><div class="step-row">' + no + head + '</div>' +
          '<div class="step-more"><p class="step-desc">' + (s.state === 'locked' ? icon('clock') : '') + '<span>' + s.desc + '</span></p>' +
          (s.act && s.state !== 'locked'
            ? '<button type="button" class="btn primary block step-go"' + s.act + ' aria-label="' + esc(STEP_NO[i] + ' ' + s.title + '：' + s.go) + '">' + esc(s.go) + '</button>'
            : '') +
          '</div></li>';
      }
      const label = ' aria-label="' + esc(STEP_NO[i] + ' ' + s.title + (s.mode ? '（' + s.mode + '）' : '') + '・' + s.stat) + '"';
      if (s.act) return '<li class="' + cls + '"><button type="button" class="step-row"' + s.act + label + '>' + no + head + icon('chevron') + '</button></li>';
      return '<li class="' + cls + '"><div class="step-row">' + no + head + '</div></li>';
    }).join('') + '</ol>' +
      (allDone ? '<p class="steps-done">' + icon('check') + '今日の学習は完了です。明日もこの順番で。</p>' : '');
  }

  /** ホームの「テスト」：受けられる時間と、4つのテスト。右に短い数だけ */
  function testsHtml(t, now) {
    const st = store.state;
    const tt = testTime();
    const open = t.win.open;
    const head = open
      ? '<div class="row static test-window is-open">' + icon('bell') + rowInner('いま受けられます', '', '朝4:00まで', 'action') + '</div>'
      : '<div class="row static test-window">' + icon('clock') + rowInner('テストは ' + tt + ' から', '', 'あと <span data-until="' + t.win.start + '">' + esc(Sched.untilText(t.win.start - now)) + '</span>', 'action') + '</div>';
    const row = (kind, title, sub, ready, detail) => ready && open
      ? rowBtn('start-kind', ' data-kind="' + kind + '" data-row="' + kind + '"', title, sub, detail, 'accent')
      : '<div class="row static' + (ready ? '' : ' dim') + '" data-row="' + kind + '">' + rowInner(title, sub, detail, 'action') + '</div>';
    let rows = '';
    // 再テスト（必須）：間違えた問題。満点になるまで毎日
    const nRe = open ? t.due.length : t.tonight.length;
    const later = t.open.length - nRe;
    rows += row('retest', '再テスト', '必須・満点になるまで毎日', nRe > 0,
      nRe ? (open ? '<span class="badge must">必須</span>' : esc(tt) + '・') + nRe + '問' : later ? '明日・' + later + '問' : '—');
    // 今日のテスト
    const doneD = t.today.filter((a) => a.kind === 'daily');
    rows += row('daily', '今日のテスト', '今日学習した単語', t.daily.length > 0,
      t.daily.length ? (open ? '' : esc(tt) + '・') + t.daily.length + '語' : doneD.length ? doneD[doneD.length - 1].score + '点' : '—');
    // まとめテスト（5日ごと）
    const s = t.summary;
    let sSub = '5日ごと・応用の形式';
    let sVal = esc(shortDate(s.next));
    if (s.ready) {
      sSub = '第' + s.period.no + '回・' + shortDate(s.period.firstDay) + '〜' + shortDate(s.period.dueDay) + ' の単語';
      sVal = (open ? '' : esc(tt) + '・') + summaryPlan('summary', s.items.length).count + '問';
    } else if (s.taken) {
      sSub = '5日ごと・次は ' + shortDate(s.next);
      sVal = s.taken.score + '点';
    } else if (s.period && util.dayKey(s.period.dueDay) === util.dayKey(t.win.day)) {
      sSub = '今日の分は、学習した単語が少ないためなし';
    }
    rows += row('summary', 'まとめテスト', sSub, s.ready, sVal);
    // 月のまとめテスト（毎月1日）
    const mo = t.monthly;
    let mSub = '毎月1日・先月の単語';
    let mVal = esc(shortDate(mo.next));
    if (mo.ready) {
      mSub = mo.period.month + '月の単語';
      mVal = (open ? '' : esc(tt) + '・') + summaryPlan('monthly', mo.items.length).count + '問';
    } else if (mo.taken) {
      mSub = '毎月1日・次は ' + shortDate(mo.next);
      mVal = mo.taken.score + '点';
    }
    rows += row('monthly', '月のまとめテスト', mSub, mo.ready, mVal);
    // 通知：カレンダーに入れるまでは、ここにも出す
    if (!st.meta.calendarAt) rows += rowBtn('goto-notify', '', tt + ' に通知を受け取る', 'カレンダーに予定を入れます', '', '');
    return '<div class="list tests-list">' + head + rows + '</div>';
  }

  /* ================= タイトル ================= */

  /** タイトル：ロゴと一言だけ。どこをタップしてもホームへ */
  function viewTitle() {
    return '<main class="screen title-screen" id="main" data-action="enter" role="button" tabindex="0" aria-label="' + APP_NAME + '。タップしてはじめる">' +
      '<div class="title-body">' +
      '<h1 class="wordmark"><span class="wm-ja">暗記</span><span class="wm-en">CARD</span></h1>' +
      '<span class="title-rule" aria-hidden="true"></span>' +
      '<p class="title-tag">英語を、音と場面で覚える</p>' +
      '</div>' +
      '<p class="title-tap">タップしてはじめる</p>' +
      '</main>';
  }

  /* ================= ホーム ================= */

  /** ホームの上：今日の目標・連続日数・ポイントを1行で */
  function statsStrip(streak, today, goal, points) {
    const done = Math.min(goal, today.cards);
    const pct = Math.round((done / goal) * 100);
    return '<section class="stats" aria-label="今日の記録">' +
      '<div class="stat-cell" role="progressbar" aria-label="今日の目標の進み具合" aria-valuemin="0" aria-valuemax="' + goal + '" aria-valuenow="' + done + '">' +
      '<span class="stat-k">今日の目標' + (today.cards >= goal ? '<span class="stat-done">達成</span>' : '') + '</span>' +
      '<span class="stat-v"><b>' + today.cards + '</b><small>/' + goal + '</small></span>' +
      '<span class="stat-bar" aria-hidden="true"><i style="width:' + pct + '%"></i></span></div>' +
      '<div class="stat-cell"><span class="stat-k">連続</span><span class="stat-v"><b>' + streak.days + '</b><small>日</small></span></div>' +
      '<div class="stat-cell"><span class="stat-k">ポイント</span><span class="stat-v"><b>' + points + '</b></span></div>' +
      '</section>' +
      (streak.days && !streak.todayDone ? '<p class="stats-note">今日はまだ学習していません</p>' : '');
  }

  function todayLabel(now) {
    const d = new Date(now);
    return (d.getMonth() + 1) + '月' + d.getDate() + '日（' + '日月火水木金土'.charAt(d.getDay()) + '）';
  }

  /** カード学習を始めるまとまり：出題のしかた（切り替え）＋ 枚数 ＋ 青いボタン */
  function studyGroup(c, scope) {
    const mode = store.state.settings.studyMode === 'rev' ? 'rev' : 'fwd';
    const fwd = mode === 'fwd';
    const can = fwd ? c.total > 0 : c.availableRev > 0;
    const counts = fwd
      ? '<span><b>' + c.dueFwd + '</b>復習</span><span><b>' + c.newFwd + '</b>新しい</span>'
      : '<span><b>' + c.dueRev + '</b>復習</span><span><b>' + c.newRev + '</b>新しい</span>';
    return '<div class="group">' +
      segButtons('set-mode', mode, [['fwd', '英語 → 場面'], ['rev', '場面 → 英語']], '出題のしかた') +
      '<p class="counts">' + counts + '</p>' +
      '<button type="button" class="btn primary block" data-action="start" data-mode="' + mode + '" data-scope="' + esc(scope) + '"' + (can ? '' : ' disabled') + '>カードで学習する</button>' +
      (!fwd && !c.availableRev ? '<p class="fine">「場面 → 英語」は、「英語 → 場面」で一度学習したカードから出ます。</p>' : '') +
      '</div>';
  }

  function viewHome() {
    const st = store.state;
    const now = Date.now();
    const streak = SS.streak(st.log, dnow(now));
    const today = SS.today(st.log, dnow(now));
    const goal = st.settings.dailyGoal;
    const sess = st.session && !st.session.finished ? st.session : null;
    const cur = st.tests && st.tests.current;
    const mc = Q.missCounts(st.tests);
    const info = stepsInfo(now);
    const d = new Date(now);

    let html = '<main class="screen home" id="main">';
    html += '<header class="home-head"><h1 tabindex="-1" class="brand"><span class="wm-ja">暗記</span><span class="wm-en">CARD</span></h1>' +
      '<p class="home-date"><span>' + (d.getMonth() + 1) + '.' + String(d.getDate()).padStart(2, '0') + '</span>' + '日月火水木金土'.charAt(d.getDay()) + '</p></header>';
    html += statsStrip(streak, today, goal, st.log.totalPoints);
    html += installTip();

    if (sess || cur) {
      html += section('途中から', '<div class="list">' +
        (sess ? rowBtn('resume', '', 'カード学習の続き', scopeLabel(sess.scope) + '・' + SS.MODES[sess.mode].label + '・残り ' + SS.remaining(sess) + '枚', '', 'accent') : '') +
        (cur ? rowBtn('resume-test', '', (cur.kind === 'practice' ? '練習' : 'テスト') + 'の続き', attemptTitle(cur) + '・残り ' + (cur.questions.length - cur.index) + '問', '', 'accent') : '') +
        '</div>');
    }

    html += section('今日の学習', stepsHtml(info), { note: info.done + ' / 5', id: 'today' });
    html += section('テスト', testsHtml(info.tests, now), { note: '毎日 ' + testTime() + '〜4:00', id: 'tests' });
    html += section('回', st.rounds.length
      ? '<div class="list">' + st.rounds.map(roundRow).join('') + '</div>'
      : '<p class="section-note">まだ回がありません。</p>');
    html += section('復習', '<div class="list">' +
      rowLink('#misses', '覚えていないリスト', mc.solved ? '克服 ' + mc.solved + '件' : '', '<b>' + mc.open + '</b>件') +
      '</div>');
    html += '</main>';
    return html;
  }

  /** ホームに並べる回の行：名前・覚え具合の線・学習した数 */
  function roundRow(r) {
    const st = store.state;
    const items = Q.roundItems(st.words, r);
    const lv = { new: 0, learning: 0, reviewing: 0, settled: 0 };
    items.forEach((it) => { lv[srs.level(SS.stateOf(st.progress, it.sense.id, 'fwd')).key] += 1; });
    const seg = (k) => (lv[k] ? '<span class="lv-seg lv-' + k + '" style="flex:' + lv[k] + '"></span>' : '');
    const stats = Q.roundStats(st.tests, r.id);
    const studied = items.length - lv.new;
    const sub = r.wordIds.length + '語' + (stats.count ? '・最高 ' + stats.best + '点' : '');
    return '<a class="row round-row" href="#round-' + esc(r.id) + '"><span class="r-main"><span class="r-title">' + esc(r.title) + '</span>' +
      '<span class="r-sub">' + esc(sub) + '</span>' +
      '<span class="lv-bar" aria-hidden="true">' + seg('settled') + seg('reviewing') + seg('learning') + seg('new') + '</span></span>' +
      '<span class="r-detail"><b>' + studied + '</b>/' + items.length + '</span>' +
      icon('chevron') + '</a>';
  }

  /* ================= ホーム画面に追加（iPhone） ================= */

  function isIOS() {
    const ua = (navigator && navigator.userAgent) || '';
    return /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && (navigator.maxTouchPoints || 0) > 1);
  }

  /** このアプリのリンク（公開ページ版は claude.ai のリンク。1ファイル版はなし） */
  function appLink() {
    if (typeof window.CIF_APP_URL === 'string' && /^https:\/\//.test(window.CIF_APP_URL)) return window.CIF_APP_URL;
    if (/^https?:$/.test(location.protocol)) return location.href.split('#')[0];
    return '';
  }

  /** iPhone の Safari で開いているときだけ、ホームに小さく出す（閉じたら出さない） */
  function installTip() {
    if (isStandalone() || !isIOS() || store.state.meta.installHidden) return '';
    return '<div class="install-tip">' +
      '<button type="button" class="install-open" data-action="goto" data-to="install">' + icon('share', 'install-ic') +
      '<span class="r-main"><span class="r-title">ホーム画面に追加</span><span class="r-sub">アプリのように全画面で開けます</span></span>' + icon('chevron') + '</button>' +
      '<button type="button" class="icon-btn bare" data-action="hide-install" aria-label="閉じる">' + icon('close') + '</button></div>';
  }

  function viewInstall() {
    const link = appLink();
    const onClaude = /^https:\/\/claude\.ai\//.test(link);
    let html = '<main class="screen install" id="main">' + pageHead('ホーム画面に追加', { back: 'home' });
    if (isStandalone()) {
      html += '<section class="install-done">' + doneMark() +
        '<p class="install-done-t">ホーム画面から開いています</p>' +
        '<p class="fine">次からも、ホーム画面の「' + APP_NAME + '」から開けます。</p></section></main>';
      return html;
    }
    html += '<p class="lead">iPhone のホーム画面に「' + APP_NAME + '」を置くと、アプリのように全画面で開けます。</p>';
    const step = (title, body) => '<li><span class="is-no" aria-hidden="true"></span><div class="is-body"><p class="is-title">' + title + '</p>' + body + '</div></li>';
    html += '<ol class="install-steps">' +
      step('Safari でこのアプリを開く',
        (link
          ? '<div class="link-box"><input id="app-link" type="text" readonly value="' + esc(link) + '" aria-label="このアプリのリンク" autocapitalize="off" spellcheck="false">' +
            '<button type="button" class="btn secondary sm" data-action="copy-link">コピー</button></div>' +
            '<p class="fine">Claude アプリで見ているときは、リンクをコピーして Safari のアドレス欄に貼り付けて開きます。</p>'
          : '<p class="fine">このファイルの版はホーム画面に追加できません。公開ページのリンクを Safari で開いてください。</p>')) +
      step('共有ボタン ' + icon('share', 'share-ic') + ' をタップ', '<p class="fine">画面の下にあります（iPad は右上）。見つからないときは、アドレス欄の「…」から「共有」。</p>') +
      step('「ホーム画面に追加」をタップ', '<p class="fine">共有のメニューを下にスクロールすると出てきます。</p>') +
      step('名前を「' + APP_NAME + '」にして「追加」', '<p class="fine">「Webアプリとして開く」はオンのままにします。' + (onClaude ? 'アイコンの絵は claude.ai のものになります。' : '') + '</p>') +
      step('ホーム画面の「' + APP_NAME + '」から開く', '<p class="fine">' + (onClaude
        ? 'はじめて開いたときに claude.ai のログイン画面が出たら、いつものアカウントでログインしてください。学習の記録はアカウントに保存されているので、続きから使えます。'
        : '学習の記録は、この端末に保存されます。') + '</p>') +
      '</ol>';
    html += '<p class="section-note">Android（Chrome）は、右上の「⋮」から「ホーム画面に追加」。</p>';
    html += '</main>';
    return html;
  }

  /* ================= カード学習 ================= */

  function topbar(quitAction, label, ratio, remainHtml, progressLabel) {
    const pct = Math.round(ratio * 100);
    return '<header class="topbar">' +
      '<button type="button" class="icon-btn" data-action="' + quitAction + '" aria-label="中断してホームへ（続きは保存されます）">' + icon('close') + '</button>' +
      '<div class="t-mid"><span class="t-label">' + esc(label) + '</span>' +
      '<div class="progress" role="progressbar" aria-label="' + esc(progressLabel) + '" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + pct + '"><span style="width:' + pct + '%"></span></div></div>' +
      '<p class="remain">' + remainHtml + '</p></header>';
  }

  function cardMeta(item, repeat) {
    if (item.total <= 1 && !repeat) return '';
    return '<div class="card-meta">' +
      (item.total > 1 ? '<span class="tag">用法 ' + item.n + ' / ' + item.total + '</span>' : '<span></span>') +
      (repeat ? '<span class="chip accent">もう一度</span>' : '') + '</div>';
  }

  function viewStudy() {
    const st = store.state;
    let s = st.session;
    if (!s) { go('home', true); return null; }
    if (s.finished) { go('result', true); return null; }
    let sid = SS.current(s);
    let item = index.senses.get(sid);
    if (!item || !isStudyable(item.word, item.sense)) {
      s = SS.sanitize(s, st.words);
      store.set('session', s);
      if (!s || s.finished) { go('home', true); return null; }
      sid = SS.current(s);
      item = index.senses.get(sid);
    }
    const res = s.results[sid];
    const repeat = !!(res && res.first);
    const kind = audioSource(wordAudio(item)).kind;

    let html = '<main class="screen study" id="main">';
    html += topbar('quit', scopeLabel(s.scope) + '・' + SS.MODES[s.mode].label, SS.progressRatio(s), '残り <b>' + SS.remaining(s) + '</b>枚', 'セットの進み具合');
    html += speechBanner(kind);
    const meta = cardMeta(item, repeat);
    if (!s.flipped) {
      html += s.mode === 'rev' ? frontRev(item, meta) : frontFwd(item, meta);
      html += '<div class="answer-bar"><button type="button" class="btn primary block" data-action="flip">裏を見る</button></div>';
    } else {
      html += backCard(item, meta, s.mode);
      html += rateBar(s, sid);
    }
    html += '</main>';
    return html;
  }

  function frontFwd(item, meta) {
    const w = item.word;
    const sense = item.sense;
    const ipa = ipaOf(sense);
    return '<article class="card card-front" data-action="flip" role="button" tabindex="0" aria-label="カードをめくって裏を見る">' + meta +
      '<div class="front-body">' +
      '<h2 class="headword" lang="en">' + esc(w.headword) + '</h2>' +
      (ipa ? '<p class="ipa" lang="en">' + esc(ipa) + '</p>' : '') +
      audioCtl(Object.assign(wordAudio(item), { what: '単語', cap: true })) +
      speakNote(item) +
      (sense.cue ? '<div class="cue-line"><p class="cue" lang="en">' + esc(sense.cue) + '</p>' + speakOne(sense.cue, 'フレーズ') + '</div>' : '') +
      '</div>' +
      '<p class="tap-hint">意味と場面を思い浮かべたら、タップ</p>' +
      '</article>';
  }

  function frontRev(item, meta) {
    const sense = item.sense;
    const cz = clozeFor(item);
    return '<article class="card card-front rev" data-action="flip" role="button" tabindex="0" aria-label="カードをめくって答えを見る">' + meta +
      '<div class="front-body">' +
      '<p class="rev-q">この場面に合う英語は？</p>' +
      sceneArt(sense) +
      (sense.scene && sense.scene.text ? '<p class="scene-text">' + esc(sense.scene.text) + '</p>' : '') +
      (sense.nuance ? '<p class="nuance-text">' + esc(sense.nuance) + '</p>' : '') +
      roleLine(sense) +
      (cz ? '<div class="cloze">' + (cz.en ? '<p class="ex-en" lang="en">' + cz.en + '</p>' : '') + (cz.ja ? '<p class="ex-ja">' + esc(cz.ja) + '</p>' : '') + '</div>' : '') +
      (ui.hint
        ? '<p class="hint" lang="en">' + esc(hintText(item.word.headword)) + '</p>'
        : '<button type="button" class="btn text sm" data-action="hint">ヒントを見る</button>') +
      '</div>' +
      '<p class="tap-hint">英語を思い浮かべたら、タップ</p>' +
      '</article>';
  }

  function backCard(item, meta, mode) {
    const w = item.word;
    const sense = item.sense;
    const ipa = ipaOf(sense);
    let html = '<article class="card card-back" aria-label="カードの裏">' + meta;
    html += '<div class="back-head"><div class="bh-line"><h2 class="headword sm" lang="en">' + esc(w.headword) + '</h2>' +
      (ipa ? '<span class="ipa" lang="en">' + esc(ipa) + '</span>' : '') + '</div>' +
      audioCtl(Object.assign(wordAudio(item), { what: '単語', cap: true, left: true })) +
      speakNote(item) +
      (mode === 'rev' && sense.cue ? '<div class="cue-line"><p class="cue" lang="en">' + esc(sense.cue) + '</p>' + speakOne(sense.cue, 'フレーズ') + '</div>' : '') +
      '</div>';
    html += senseBody(item, { inCard: true });
    html += '</article>';
    return html;
  }

  /** 裏面と単語詳細で共通の中身（ニュアンス → 場面 → 意味と役割 → 例文 ＋ くわしく） */
  function senseBody(item, opts) {
    const sense = item.sense;
    let html = '';
    if (sense.nuance) {
      html += '<section class="sec"><h3 class="sec-label">一言ニュアンス</h3><p class="nuance-text">' + esc(sense.nuance) + '</p></section>';
    }
    const art = sceneArt(sense);
    if ((sense.scene && sense.scene.text) || art) {
      html += '<section class="sec"><h3 class="sec-label">頭に浮かべる場面</h3>' + art +
        (sense.scene.text ? '<p class="scene-text">' + esc(sense.scene.text) + '</p>' : '') + '</section>';
    }
    html += '<section class="sec"><h3 class="sec-label">意味と文の中での役割</h3>' +
      '<p class="meaning-text">' + esc(sense.meaning || '（意味が未入力です）') + '</p>' + roleLine(sense) + '</section>';
    if (sense.examples.length) {
      html += '<section class="sec"><h3 class="sec-label">例文</h3>' +
        sense.examples.map((ex, i) => exampleHtml(item, ex, i)).join('') + '</section>';
    }
    html += '<details class="more"><summary>似た単語との違い・発音</summary><div class="more-body">';
    if (sense.contrasts.length) {
      html += '<section class="sub"><h4>似た単語との違い</h4><ul class="contrast">' +
        sense.contrasts.map((c) => '<li><b lang="en">' + esc(c.word) + '</b><span>' + esc(c.text) + '</span></li>').join('') + '</ul></section>';
    }
    if (sense.roleText) {
      html += '<section class="sub"><h4>文の中での役割</h4><p>' + esc(sense.roleText) + '</p></section>';
    }
    html += '<section class="sub"><h4>発音</h4>' + pronHtml(item) + '</section>';
    if (sense.note) html += '<section class="sub"><h4>補足</h4><p>' + esc(sense.note) + '</p></section>';
    if (opts && opts.inCard) {
      const others = item.word.senses.filter((x) => x.id !== sense.id);
      html += '<section class="sub"><h4>同じ単語のほかの用法</h4>' +
        (others.length ? '<ul class="others">' + others.map((o) => '<li><span class="chip">' + esc(posLabel(o.pos)) + '</span>' + esc(o.meaning) + '</li>').join('') + '</ul>' : '<p class="muted">登録されている用法は、これだけです。</p>') +
        '<p><a href="#word-' + esc(item.word.id) + '">' + esc(item.word.headword) + ' の詳しい説明と出典</a></p></section>';
      html += '<p class="fine">コアイメージは理解を助けるための説明です。すべてのネイティブスピーカーが同じイメージを持っているとは限りません。</p>';
    }
    html += '</div></details>';
    return html;
  }

  function pronHtml(item) {
    const sense = item.sense;
    const ipa = sense.ipa || {};
    const rows = [];
    if (ipa.us) rows.push('<li><span class="mini-label">アメリカ</span><span class="ipa" lang="en">' + esc(ipa.us) + '</span></li>');
    if (ipa.uk) rows.push('<li><span class="mini-label">イギリス</span><span class="ipa" lang="en">' + esc(ipa.uk) + '</span></li>');
    let html = rows.length ? '<ul class="pron">' + rows.join('') + '</ul>' : '<p class="muted">発音記号は未入力です。</p>';
    const stress = stressHtml(sense.stress);
    if (stress) html += '<p class="stress-line">強く読む位置：' + stress + '</p>';
    const kind = audioSource(wordAudio(item)).kind;
    html += '<p class="fine">音声：' + (kind === 'rec' ? '録音（人の声）'
      : kind === 'pack' ? 'AI音声（アメリカ英語）'
      : speech && speech.canSynth() ? '端末の読み上げ（' + esc(speech.currentLabel()) + '）' : '端末の読み上げ（この端末では使えません）') + '</p>';
    return html;
  }

  function rateBar(s, sid) {
    const now = Date.now();
    const res = s.results[sid];
    const first = !res || !res.first;
    const st = SS.stateOf(store.state.progress, sid, s.mode);
    const next = (r) => {
      if (r === 'again') return first || res.repeats < SS.REQUEUE.again.max ? 'もう一度出ます' : '10分後';
      if (!first) return 'このセット完了';
      if (r === 'hard') return srs.previewLabel(st, 'hard', now) + '・もう一度';
      return srs.previewLabel(st, 'good', now);
    };
    const label = { again: '思い出せ<wbr>なかった', hard: esc(srs.RATING_LABEL.hard), good: esc(srs.RATING_LABEL.good) };
    const btn = (r) => '<button type="button" class="rate r-' + r + '" data-action="rate" data-r="' + r + '">' +
      '<span class="rate-label">' + label[r] + '</span><span class="rate-next">' + esc(next(r)) + '</span></button>';
    return '<div class="answer-bar"><p class="rate-q">思い出せましたか？</p><div class="rate-row">' +
      btn('again') + btn('hard') + btn('good') + '</div></div>';
  }

  function startSet(mode, scopeKeyStr) {
    const st = store.state;
    const doStart = () => {
      const { scope, only } = parseScope(scopeKeyStr || 'all');
      if (only && !only.length) {
        toast('出題できるカードがありません。');
        return;
      }
      const s = SS.build(st.words, st.progress, mode, Date.now(), { only, scope });
      if (!s) {
        toast(mode === 'rev' ? '「英語 → 場面」で学習したカードがまだありません。' : '出題できるカードがありません。');
        return;
      }
      store.set('session', s);
      ui.hint = false;
      ui.autoplayNext = true;
      go('study', ui.route === 'result');
    };
    if (st.session && !st.session.finished) {
      openModal({
        title: '新しいセットを始めますか？',
        body: '途中のセット（残り ' + SS.remaining(st.session) + '枚）は終了します。これまでの回答はすでに保存されています。',
        ok: '新しく始める',
        onOk: doStart,
      });
      return;
    }
    doStart();
  }

  function flip() {
    const s = store.state.session;
    if (!s || s.finished || s.flipped) return;
    s.flipped = true;
    store.set('session', s);
    render(true);
  }

  function rate(r) {
    const st = store.state;
    const s = st.session;
    if (!s || s.finished || !s.flipped) return;
    const now = Date.now();
    const out = SS.answer(s, st.progress, r, now);
    const la = SS.logAnswer(st.log, out.event, dnow(now), st.settings.dailyGoal);
    let log = la.log;
    const next = out.session;
    if (la.bonus) {
      next.goalReached = true;
      next.points += la.bonus;
    }
    if (next.finished) {
      const done = SS.logSetComplete(log, dnow(now));
      log = done.log;
      next.points += done.bonus;
      next.setBonus = done.bonus;
    }
    store.set('progress', out.progress);
    store.set('log', log);
    store.set('session', next);
    ui.hint = false;
    speech.stop();
    if (next.finished) {
      go('result', true);
    } else {
      ui.autoplayNext = true;
      render(true);
    }
  }

  /* ================= 学習結果 ================= */

  function viewResult() {
    const st = store.state;
    const s = st.session;
    if (!s || !s.finished) { go('home', true); return null; }
    const now = Date.now();
    const sum = SS.summary(s);
    const today = SS.today(st.log, dnow(now));
    const goal = st.settings.dailyGoal;
    const streak = SS.streak(st.log, dnow(now));
    const pct = Math.min(100, Math.round((today.cards / goal) * 100));
    let html = '<main class="screen result" id="main">';
    html += '<div class="result-hero">' + doneMark() +
      '<p class="eyebrow">' + esc(scopeLabel(s.scope)) + '・' + esc(SS.MODES[s.mode].label) + '</p>' +
      '<h1 id="result-title" tabindex="-1">セット完了</h1>' +
      '<p class="earned">+' + s.points + ' pt</p>' +
      (s.goalReached ? '<p class="goal-done">今日の目標を達成しました</p>' : '') +
      '</div>';
    html += '<section class="group" aria-label="自己評価の内訳"><div class="stats">' +
      '<div class="stat"><span class="stat-num m-good">' + sum.good + '</span><span class="stat-label">思い出せた</span></div>' +
      '<div class="stat"><span class="stat-num m-hard">' + sum.hard + '</span><span class="stat-label">あいまい</span></div>' +
      '<div class="stat"><span class="stat-num m-again">' + sum.again + '</span><span class="stat-label">思い出せなかった</span></div>' +
      '</div></section>';
    html += '<section class="group"><dl class="facts">' +
      '<div><dt>今日の目標</dt><dd>' + today.cards + '<small>/' + goal + '</small></dd></div>' +
      '<div><dt>連続学習</dt><dd>' + streak.days + '<small>日</small></dd></div>' +
      '<div><dt>ポイント合計</dt><dd>' + st.log.totalPoints + '</dd></div>' +
      '</dl><span class="meter" role="progressbar" aria-label="今日の目標の進み具合" aria-valuemin="0" aria-valuemax="' + goal + '" aria-valuenow="' + Math.min(goal, today.cards) + '"><span style="width:' + pct + '%"></span></span>' +
      (sum.repeats ? '<p class="fine">セットの中で ' + sum.repeats + '回、もう一度練習しました。</p>' : '') +
      '</section>';
    html += section('次の復習', '<ul class="list result-list">' +
      s.cards.map((sid) => {
        const it = index.senses.get(sid);
        if (!it) return '';
        const r = s.results[sid] || {};
        const state = SS.stateOf(st.progress, sid, s.mode);
        return '<li><span class="rl-word"><b lang="en">' + esc(it.word.headword) + '</b><span>' + esc(it.sense.meaning) + '</span></span>' +
          '<span class="rl-next"><span>' + (state ? esc(util.formatDue(state.due, now)) : '') + '</span>' +
          '<span class="rl-rate m-' + (r.first || 'none') + '">' + esc(r.first ? srs.RATING_LABEL[r.first] : '未回答') + '</span></span></li>';
      }).join('') + '</ul><p class="section-note">思い出せたカードも、間隔をあけてまた出題します。</p>');
    // 次の手順（今日の学習の順番）を案内する
    const info = stepsInfo(now);
    const nx = info.current >= 0 ? info.list[info.current] : null;
    const again = ' data-action="start" data-mode="' + s.mode + '" data-scope="' + esc(scopeKey(s.scope)) + '"';
    const canAgain = s.scope && s.scope.type === 'today' ? revTargets(now, info.day).length > 0 : true;
    let btns = '';
    if (nx && nx.state === 'todo' && nx.act) {
      btns += '<button type="button" class="btn primary block"' + nx.act + '>次は ' + STEP_NO[info.current] + ' ' + esc(nx.title) + (nx.mode ? '（' + esc(nx.mode) + '）' : '') + '</button>';
      if (canAgain && nx.act !== again) btns += '<button type="button" class="btn secondary block"' + again + '>もう1セット</button>';
    } else {
      if (nx && nx.state === 'locked') html += '<p class="next-note">' + icon('bell') + '次は ' + STEP_NO[4] + ' テスト。' + esc(testTime()) + ' から受けられます。</p>';
      if (canAgain) btns += '<button type="button" class="btn primary block"' + again + '>もう1セット</button>';
    }
    html += '<div class="btn-col">' + btns + '<button type="button" class="btn text block" data-action="home">ホームへ</button></div>';
    html += '</main>';
    return html;
  }

  /* ================= 回・テスト・覚えていないリスト ================= */

  function roundById(id) {
    return (store.state.rounds || []).find((r) => r.id === id) || null;
  }

  function roundTitle(id) {
    const r = roundById(id);
    return r ? r.title : '';
  }

  function scopeKey(scope) {
    if (!scope || scope.type === 'all') return 'all';
    if (scope.type === 'round') return 'round:' + scope.roundId;
    if (scope.type === 'misses') return 'misses' + (scope.roundId ? ':' + scope.roundId : '');
    if (scope.type === 'wrong') return 'wrong:' + scope.attemptId;
    if (scope.type === 'today') return 'today';
    return 'all';
  }

  function scopeLabel(scope) {
    if (!scope || scope.type === 'all') return 'すべての回';
    if (scope.type === 'round') return roundTitle(scope.roundId) || '回';
    if (scope.type === 'misses') return '覚えていないリスト' + (scope.roundId ? '（' + roundTitle(scope.roundId) + '）' : '');
    if (scope.type === 'wrong') return 'テストで間違えた単語';
    if (scope.type === 'today') return '今日の単語';
    return 'すべての回';
  }

  /** 'round:r1' などの文字列から、範囲と出題してよい用法IDを作る */
  function parseScope(key) {
    const st = store.state;
    const [type, arg] = String(key || 'all').split(':');
    if (type === 'round') {
      const r = roundById(arg);
      return { scope: { type: 'round', roundId: arg }, only: r ? Q.roundItems(st.words, r).map((it) => it.sense.id) : [] };
    }
    if (type === 'misses') {
      const ids = Array.from(new Set(Q.missList(st.tests, { status: 'open', roundId: arg || undefined }).map((e) => e.senseId)));
      return { scope: { type: 'misses', roundId: arg || '' }, only: ids.filter((id) => index.senses.has(id)) };
    }
    if (type === 'wrong') {
      const a = (st.tests.attempts || []).find((x) => x.id === arg);
      const ids = a ? Array.from(new Set(a.wrongs.map((w) => w.senseId))) : [];
      return { scope: { type: 'wrong', attemptId: arg }, only: ids.filter((id) => index.senses.has(id)) };
    }
    if (type === 'today') {
      // ② 逆から思い出す：今日覚えた単語（まだ ② をしていないもの）と、場面→英語の復習の時期のもの
      const now = Date.now();
      return { scope: { type: 'today' }, only: revTargets(now, dayInfo(now)) };
    }
    return { scope: { type: 'all' }, only: null };
  }

  function roundOptions(withNone) {
    return [['all', 'すべての回']].concat(store.state.rounds.map((r) => [r.id, r.title])).concat(withNone ? [['none', '回に入っていない単語']] : []);
  }

  function attemptTitle(a) {
    const md = (k) => (/^\d{4}-\d{2}-\d{2}$/.test(k || '') ? '（' + shortDate(util.parseDayKey(k)) + '）' : '');
    switch (a.kind) {
      case 'review': return '覚えていないリストの解き直し';
      case 'practice': return '間違えた問題の練習';
      case 'daily': return '今日のテスト' + md(a.period) + (a.no > 1 ? ' ' + a.no + '回目' : '');
      case 'retest': return '再テスト' + md(a.period);
      case 'summary': return 'まとめテスト' + (a.no ? ' 第' + a.no + '回' : '');
      case 'monthly': return (/^\d{4}-\d{2}$/.test(a.period || '') ? Number(a.period.slice(5)) + '月の' : '月の') + 'まとめテスト';
      default: return (roundTitle(a.roundId) || '回') + ' テスト ' + a.no + '回目';
    }
  }

  function notFound(title, fallback) {
    return '<main class="screen" id="main">' + pageHead(title, { back: fallback }) + '</main>';
  }

  /* ----- 回の画面 ----- */

  function viewRound() {
    const st = store.state;
    const r = roundById(ui.param);
    if (!r) return notFound('回が見つかりません', 'home');
    const now = Date.now();
    const items = Q.roundItems(st.words, r);
    const only = items.map((it) => it.sense.id);
    const c = SS.counts(st.words, st.progress, now, only);
    const stats = Q.roundStats(st.tests, r.id);
    const cur = st.tests.current;
    const mine = cur && cur.kind === 'round' && cur.roundId === r.id ? cur : null;
    const openMiss = Q.missList(st.tests, { status: 'open', roundId: r.id }).length;
    const review = r.wordIds.map((id) => index.words.get(id)).filter((w) => w && w.status === 'needs_review');
    const nextNo = Q.nextNo(st.tests, r.id);
    const open = Sched.windowAt(now, testTime()).open;

    let html = '<main class="screen round" id="main">';
    html += pageHead(r.title, { back: 'home' });
    html += '<p class="lead center">' + r.wordIds.length + '語・カード ' + items.length + '枚' + (r.addedAt ? '・' + esc(r.addedAt) + ' 追加' : '') + '</p>';

    html += section('1　カードで覚える', studyGroup(c, 'round:' + r.id));

    html += section('2　回のテスト', '<div class="group">' +
      '<dl class="facts">' +
      '<div><dt>受験</dt><dd>' + stats.count + '<small>回</small></dd></div>' +
      '<div><dt>最高点</dt><dd>' + (stats.best == null ? '—' : stats.best + '<small>点</small>') + '</dd></div>' +
      '<div><dt>満点</dt><dd>' + (stats.perfectAt ? stats.perfectAt.no + '<small>回目</small>' : '<small>まだ</small>') + '</dd></div>' +
      '</dl>' +
      '<p class="fine">内容理解（4択）' + items.length + '問と、文章作成（並べ替え）' + items.length + '問。それぞれ50点で、合計100点です。テストは毎日 ' + esc(testTime()) + ' から朝4:00まで。間違えた問題は「覚えていないリスト」に入り、次の日の ' + esc(testTime()) + ' に再テスト（必須）です。途中でやめても続きから再開できます。</p>' +
      (mine
        ? '<button type="button" class="btn primary block" data-action="resume-test">テストの続き（残り ' + (mine.questions.length - mine.index) + '問）</button>'
        : open
          ? '<button type="button" class="btn primary block" data-action="start-test" data-round="' + esc(r.id) + '">テストを受ける（' + nextNo + '回目）</button>'
          : '<button type="button" class="btn primary block" disabled>' + esc(testTime()) + ' から受けられます</button>') +
      '</div>', { note: '全範囲・100点満点' });

    if (stats.count) {
      html += section('テストの記録', '<div class="list">' +
        stats.attempts.slice().reverse().map((a) => rowLink('#score-' + a.id, a.no + '回目',
          util.formatDate(a.finishedAt) + '・内容理解 ' + a.parts.understand.correct + '/' + a.parts.understand.total + '・文章作成 ' + a.parts.compose.correct + '/' + a.parts.compose.total,
          '<b>' + a.score + '</b>点' + (a.score === 100 ? ' <span class="badge st-verified">満点</span>' : ''))).join('') +
        '</div>');
    }

    html += section('この回の単語', '<div class="list">' +
      rowBtn('goto-misses', ' data-round="' + esc(r.id) + '"', '覚えていないリスト', '', '<b>' + openMiss + '</b>件') +
      rowBtn('goto-words', ' data-round="' + esc(r.id) + '"', '単語の一覧', '', r.wordIds.length + '語') +
      '</div>' +
      (review.length ? '<p class="section-note">要確認の単語（' + review.map((w) => '<a href="#word-' + esc(w.id) + '" lang="en">' + esc(w.headword) + '</a>').join('、') + '）は、確かめられるまで出題とテストから外しています。</p>' : ''));
    html += '</main>';
    return html;
  }

  /* ----- テスト ----- */

  /** テストの時間か（そうでなければ知らせる） */
  function testOpen(now) {
    if (Sched.windowAt(now, testTime()).open) return true;
    toast('テストは毎日 ' + testTime() + ' から朝4:00まで受けられます。');
    return false;
  }

  /** テスト（または練習）を作って始める */
  function beginAttempt(opts, emptyMsg) {
    confirmReplaceTest(() => {
      const a = Q.createAttempt(Object.assign({ now: Date.now() }, opts));
      if (!a.questions.length) {
        toast(emptyMsg || '出題できる問題がありません。');
        return;
      }
      store.set('tests', Object.assign({}, store.state.tests, { current: a }));
      resetTestUi();
      go('test');
    });
  }

  function startTest(roundId) {
    const st = store.state;
    const r = roundById(roundId);
    if (!r) return;
    const items = Q.roundItems(st.words, r);
    if (!items.length) {
      toast('この回には出題できる単語がありません。');
      return;
    }
    if (!testOpen(Date.now())) return;
    const pool = items.length >= 8 ? items : studyableItems();
    beginAttempt({ kind: 'round', roundId, no: Q.nextNo(st.tests, roundId), items, pool });
  }

  /** 用法|部 のキーから、出題する用法を集める */
  function itemsOfKeys(keys) {
    const want = new Set(keys.map((k) => k.split('|')[0]));
    return studyableItems().filter((it) => want.has(it.sense.id));
  }

  /** 間違えた問題の練習（覚えていないリストは変えない）。keys がなければ ③ のミスすべて */
  function startPractice(keys, qtypes) {
    let k = keys;
    let types = qtypes;
    if (!k) {
      const now = Date.now();
      const m = mistakes(now, dayInfo(now));
      k = m.keys;
      types = m.types;
    }
    k = (k || []).filter(liveKey);
    if (!k.length) {
      toast('練習する問題はありません。');
      return;
    }
    beginAttempt({ kind: 'practice', items: itemsOfKeys(k), pool: studyableItems(), only: k, qtypes: types || Q.missTypes(store.state.tests) });
  }

  /** ホームのテスト：retest（再テスト）/ daily（今日のテスト）/ summary（まとめ）/ monthly（月のまとめ）/ practice（練習） */
  function startKind(kind) {
    if (kind === 'practice') {
      startPractice();
      return;
    }
    const now = Date.now();
    if (!testOpen(now)) return;
    const st = store.state;
    const t = testInfo(now);
    const all = studyableItems();
    const day = util.dayKey(t.win.day);
    if (kind === 'retest') {
      if (!t.due.length) { toast('いま受ける再テストはありません。'); return; }
      beginAttempt({ kind, items: itemsOfKeys(t.due), pool: all, only: t.due, qtypes: Q.missTypes(st.tests), period: day });
    } else if (kind === 'daily') {
      if (!t.daily.length) { toast('今日学習した単語が、まだありません。'); return; }
      const no = (st.tests.attempts || []).filter((a) => a.kind === 'daily' && a.period === day).length + 1;
      beginAttempt({ kind, items: t.daily, pool: all, period: day, no });
    } else if (kind === 'summary') {
      const sm = t.summary;
      if (!sm.ready) { toast(sm.taken ? 'このまとめテストは受けました。' : 'まとめテストは、まだありません。'); return; }
      const plan = summaryPlan('summary', sm.items.length);
      beginAttempt({ kind, items: sm.items, pool: all, period: sm.period.key, no: sm.period.no, perItem: plan.perItem, size: plan.size });
    } else if (kind === 'monthly') {
      const mo = t.monthly;
      if (!mo.ready) { toast(mo.taken ? 'この月のまとめテストは受けました。' : '月のまとめテストは、まだありません。'); return; }
      const plan = summaryPlan('monthly', mo.items.length);
      beginAttempt({ kind, items: mo.items, pool: all, period: mo.period.key, perItem: plan.perItem, size: plan.size });
    }
  }

  function confirmReplaceTest(doStart) {
    const cur = store.state.tests.current;
    if (!cur) {
      doStart();
      return;
    }
    openModal({
      title: '新しいテストを始めますか？',
      body: '途中のテスト（' + attemptTitle(cur) + '・残り ' + (cur.questions.length - cur.index) + '問）は採点せずに終了します。ここまでに間違えた問題は、覚えていないリストに残っています。',
      ok: '新しく始める',
      onOk: doStart,
    });
  }

  function resetTestUi() {
    clearTimeout(ui.fbTimer);
    ui.testFeedback = null;
    ui.order = [];
    ui.testIntro = '';
    ui.listenPlayed = '';
  }

  function viewTest() {
    const st = store.state;
    const a = st.tests.current;
    if (!a) { go('home', true); return null; }
    const fb = ui.testFeedback;
    if (!fb && Q.isDone(a)) {
      finishTest();
      return null;
    }
    const q = fb ? fb.question : Q.current(a);
    const half = Q.HALF_SCORED.includes(a.kind);
    const uTotal = a.questions.filter((x) => x.part === 'understand').length;
    const cTotal = a.questions.length - uTotal;
    const ratio = a.questions.length ? (a.index / a.questions.length) : 1;
    const qi = a.questions.findIndex((x) => x.id === q.id);
    const partIndex = q.part === 'understand' ? qi + 1 : qi - uTotal + 1;
    const partTotal = q.part === 'understand' ? uTotal : cTotal;
    // 内容理解と文章作成に分けて採点するテスト（回のテスト・今日のテスト）は、2つの部の間に区切りを入れる
    const intro = half && !fb && q.part === 'compose' && a.index === uTotal && uTotal > 0 && ui.testIntro !== a.id;
    const label = half
      ? attemptTitle(a) + '・' + Q.PARTS[q.part].label + (intro ? '' : ' ' + partIndex + '/' + partTotal)
      : attemptTitle(a) + ' ' + (qi + 1) + '/' + a.questions.length;

    let html = '<main class="screen test" id="main">';
    html += topbar('quit-test', label, ratio, '残り <b>' + (a.questions.length - a.index) + '</b>問', 'テストの進み具合');

    if (intro) {
      const uCorrect = a.results.slice(0, uTotal).filter((x) => x.correct).length;
      html += '<section class="card part-intro"><p class="eyebrow">' + esc(attemptTitle(a)) + '</p>' +
        '<h2>内容理解が終わりました</h2><p class="big-num">' + uCorrect + '<small> / ' + uTotal + '問 正解</small></p>' +
        '<p>次は<b>文章作成（応用）</b>です。日本語の意味になるように、単語を並べて英文を作ります。カードには出てこない新しい文です。</p></section>';
      html += '<div class="answer-bar"><button type="button" class="btn primary block" data-action="test-part-go" data-id="' + esc(a.id) + '">文章作成を始める（' + cTotal + '問）</button></div>';
      html += '</main>';
      return html;
    }

    if (q.part === 'understand') html += mcqView(q, fb);
    else html += q.qtype === 'spell' ? spellView(q, fb) : orderView(q, fb);
    if (fb) {
      html += '<div class="answer-bar"><button type="button" class="btn primary block" data-action="test-next">' + (Q.isDone(a) ? '結果を見る' : '次へ') + '</button></div>';
    } else if (q.part === 'understand') {
      html += '<div class="answer-bar"><button type="button" class="btn secondary block" data-action="test-skip">わからない</button></div>';
    } else {
      const full = ui.order.length === q.tokens.length;
      html += '<div class="answer-bar"><div class="bar-row">' +
        '<button type="button" class="btn text" data-action="order-clear"' + (ui.order.length ? '' : ' disabled') + '>やり直す</button>' +
        '<button type="button" class="btn text" data-action="test-skip">わからない</button>' +
        '<button type="button" class="btn primary" data-action="order-check"' + (full ? '' : ' disabled') + '>答え合わせ</button>' +
        '</div></div>';
    }
    html += '</main>';
    return html;
  }

  /** 選択肢の単語（英単語の選択肢はその単語。意味の選択肢は、その意味の英単語）。聞き取りの問題（日本語の文）はなし */
  function choiceItem(q, i) {
    if (!q || q.part !== 'understand' || q.qtype === 'listen') return null;
    const sid = Q.choiceSense(q, i, studyableItems());
    const it = sid ? index.senses.get(sid) : null;
    return it && isStudyable(it.word, it.sense) ? it : null;
  }

  /**
   * 単語の音をすぐ鳴らす（テストの選択肢・つづりの答え）。クリック処理の中から呼ぶこと（iPhone の制限）。
   * onEnd：鳴り終わったとき（鳴らせなかったときも）
   */
  function sayWord(it, onEnd) {
    const wa = wordAudio(it);
    const src = audioSource(wa);
    let ended = false;
    const end = () => {
      if (ended) return;
      ended = true;
      if (onEnd) onEnd();
    };
    const synth = () => (speech.canSynth() ? speech.speak(wa.text, { onState: (st) => { if (st !== 'playing') end(); } }) : false);
    const onState = (state, detail) => {
      if (state === 'playing') return;
      if (state === 'error' && detail === 'pack') {
        // AI音声を読み込めないときは、端末の読み上げで
        if (!synth()) end();
        return;
      }
      end();
    };
    if (src.kind === 'pack') return speech.playClip(src.n.url, src.n.a, src.n.b, { onState });
    if (src.kind === 'rec') return speech.play(wa.src, { onState });
    if (src.kind === 'synth') return synth();
    return false;
  }

  function mcqView(q, fb) {
    const p = q.prompt;
    let body = '<p class="q-label">' + esc(Q.QTYPE[q.qtype] || '') + '</p>';
    if (q.qtype === 'meaning') {
      // 単語のボタンは単語だけ、フレーズは丸いボタンで（カードの表と同じ形）
      const it = index.senses.get(q.senseId);
      const wa = it ? wordAudio(it) : { key: '#' + q.senseId, expect: p.headword, text: p.speak || p.headword };
      body += '<h2 class="headword q-word" lang="en">' + esc(p.headword) + '</h2>' +
        audioCtl(Object.assign(wa, { what: '単語', sm: true, cap: 'auto' })) +
        (p.cue ? '<div class="cue-line"><p class="cue" lang="en">' + esc(p.cue) + '</p>' + speakOne(p.cue, 'フレーズ') + '</div>' : '') +
        '<p class="q-text">この使い方の意味は？</p>';
    } else if (q.qtype === 'scene') {
      body += (p.diagram && DG.has(p.diagram) ? '<div class="scene-art has-dg">' + DG.get(p.diagram) + '</div>' : '') +
        (p.scene ? '<p class="scene-text">' + esc(p.scene) + '</p>' : '') +
        (p.nuance ? '<p class="nuance-text">' + esc(p.nuance) + '</p>' : '') +
        (p.role ? '<p class="role-line"><span class="role-chip">' + esc(ST.ROLE[p.role] || '') + '</span>を表す言葉<span class="role-pos">（' + esc(posLabel(p.pos)) + '）</span></p>' : '') +
        '<p class="q-text">この場面に合う英語は？</p>';
    } else if (q.qtype === 'listen') {
      body += '<div class="listen-box">' + icon('speaker', 'listen-ic') +
        audioCtl({ text: p.plain, what: '英文', cap: 'auto' }) + '</div>' +
        (fb ? '<p class="ex-en listen-text" lang="en">' + util.markedHtml(p.sentence) + '</p>' : '') +
        '<p class="q-text">聞こえた英文の意味は？</p>';
    } else {
      body += '<p class="ex-en" lang="en">' + util.clozeHtml(p.exEn) + '</p>' +
        '<p class="ex-ja">' + esc(p.exJa) + '</p>' +
        '<p class="q-text">空所に入る英語は？</p>';
    }
    const isWord = !['meaning', 'listen'].includes(q.qtype);
    const choices = '<div class="choices' + (q.qtype === 'listen' ? ' long' : '') + '" role="group" aria-label="選択肢">' + q.choices.map((c, i) => {
      const it = choiceItem(q, i);
      let cls = 'choice';
      if (fb) {
        if (i === q.answer) cls += ' is-correct';
        else if (i === fb.choice) cls += ' is-wrong';
      }
      // 答えたあとは、選択肢をタップすると、その単語の音が鳴る（意味の選択肢には英単語も出す）
      const attrs = !fb ? ' data-action="choose"'
        : it ? ' data-action="choice-say" aria-label="' + esc(c + '（' + it.word.headword + '）を再生') + '"' : ' disabled';
      return '<button type="button" class="' + cls + '"' + attrs + ' data-i="' + i + '">' +
        '<span class="ch-text"' + (isWord ? ' lang="en"' : '') + '>' + esc(c) +
        (fb && q.qtype === 'meaning' && it ? '<span class="ch-en" lang="en">' + esc(it.word.headword) + '</span>' : '') + '</span>' +
        (fb && i === q.answer ? icon('check', 'ch-ic') : fb && it ? icon('speaker', 'ch-ic say') : '') + '</button>';
    }).join('') + '</div>';
    return '<article class="card qcard">' + body + '</article>' + choices + (fb ? feedbackHtml(q, fb) : '');
  }

  function orderView(q, fb) {
    const picked = fb ? [] : ui.order;
    let body = '<p class="q-label">' + esc(Q.QTYPE.order) + '</p>' +
      '<p class="ja-prompt">' + esc(q.prompt.ja) + '</p>';
    if (!fb) {
      body += '<div class="order-answer" aria-label="あなたの英文">' +
        (picked.length ? picked.map((ti, k) => '<button type="button" class="tile placed" lang="en" data-action="tile-unpick" data-k="' + k + '">' + esc(q.tokens[ti]) + '</button>').join('') : '<span class="order-hint">下の語をタップして並べます</span>') +
        '<span class="order-end" lang="en">' + esc(q.end) + '</span></div>' +
        '<div class="tile-bank">' + q.order.map((ti) => picked.includes(ti)
          ? '<span class="tile ghost" aria-hidden="true">' + esc(q.tokens[ti]) + '</span>'
          : '<button type="button" class="tile" lang="en" data-action="tile-pick" data-i="' + ti + '">' + esc(q.tokens[ti]) + '</button>').join('') + '</div>';
    }
    return '<article class="card qcard">' + body + '</article>' + (fb ? feedbackHtml(q, fb) : '');
  }

  /** つづりを組み立てる：意味と場面を見て、文字を並べる */
  function spellView(q, fb) {
    const p = q.prompt;
    const picked = fb ? [] : ui.order;
    let body = '<p class="q-label">' + esc(Q.QTYPE.spell) + '</p>' +
      '<p class="meaning-text spell-meaning">' + esc(p.meaning) + '</p>' +
      (p.nuance ? '<p class="nuance-text">' + esc(p.nuance) + '</p>' : '') +
      (p.scene ? '<p class="scene-text">' + esc(p.scene) + '</p>' : '') +
      '<p class="q-text">この意味の英単語は？<span class="q-count">' + q.tokens.length + '文字</span></p>';
    if (!fb) {
      body += '<div class="order-answer spell-answer" aria-label="あなたのつづり">' +
        (picked.length ? picked.map((ti, k) => '<button type="button" class="tile letter placed" lang="en" data-action="tile-unpick" data-k="' + k + '">' + esc(q.tokens[ti]) + '</button>').join('') : '<span class="order-hint">下の文字をタップして並べます</span>') +
        '</div>' +
        '<div class="tile-bank">' + q.order.map((ti) => picked.includes(ti)
          ? '<span class="tile letter ghost" aria-hidden="true">' + esc(q.tokens[ti]) + '</span>'
          : '<button type="button" class="tile letter" lang="en" data-action="tile-pick" data-i="' + ti + '">' + esc(q.tokens[ti]) + '</button>').join('') + '</div>';
    }
    return '<article class="card qcard">' + body + '</article>' + (fb ? feedbackHtml(q, fb) : '');
  }

  function feedbackHtml(q, fb) {
    const it = index.senses.get(q.senseId);
    const meaning = it ? it.sense.meaning : '';
    const kind = store.state.tests.current ? store.state.tests.current.kind : '';
    let html = '<section class="feedback ' + (fb.correct ? 'ok' : 'ng') + '" role="status">' +
      '<p class="fb-title">' + (fb.correct ? icon('check') + '正解' : '不正解') + '</p>';
    if (q.qtype === 'spell') {
      html += '<p class="fb-label">正しいつづり</p><p class="fb-spell" lang="en">' + esc(q.prompt.headword) + '</p>' +
        (it ? audioCtl(Object.assign(wordAudio(it), { what: '単語', sm: true, left: true, cap: 'auto' })) : '');
      if (!fb.correct) html += '<p class="fb-label">あなたの答え</p><p class="fb-given" lang="en">' + esc(fb.given) + '</p>';
    } else if (q.part === 'compose') {
      html += '<p class="fb-label">正しい英文</p><p class="ex-en" lang="en">' + util.markedHtml(q.prompt.sentence) + '</p>' +
        audioCtl({ text: util.plainSentence(q.prompt.sentence), what: '英文', sm: true, left: true, cap: 'auto' });
      if (!fb.correct) html += '<p class="fb-label">あなたの答え</p><p class="fb-given" lang="en">' + esc(fb.given) + '</p>';
    } else if (!fb.correct) {
      html += '<p class="fb-label">正解</p><p class="fb-answer"' + (['meaning', 'listen'].includes(q.qtype) ? '' : ' lang="en"') + '>' + esc(fb.expected) + '</p>';
    }
    html += '<p class="fb-word"><b lang="en">' + esc(q.prompt.headword) + '</b>：' + esc(meaning) + '</p>';
    if (!fb.correct) {
      html += '<p class="fine">' + (kind === 'practice'
        ? '練習なので、記録は変わりません。答えを確かめて、もう一度解いてみましょう。'
        : '「覚えていないリスト」に入りました。明日 ' + esc(testTime()) + ' に再テスト（必須）です。') + '</p>';
    }
    return html + '</section>';
  }

  /** 4択を選ぶ：選んだ瞬間に、その選択肢の単語の音を鳴らしてから答え合わせ */
  function chooseAnswer(i) {
    const a = store.state.tests.current;
    if (!a || ui.testFeedback) return;
    const q = Q.current(a);
    if (!q || q.part !== 'understand' || !q.choices[i]) return;
    const it = choiceItem(q, i);
    const said = it ? !!sayWord(it, () => {
      // 正解のときは、単語の音が終わってから次の問題へ
      const fb = ui.testFeedback;
      if (fb && fb.correct && fb.question.id === q.id) autoNext(q.id, 450);
    }) : false;
    answerTest(i, said);
  }

  function autoNext(qid, ms) {
    clearTimeout(ui.fbTimer);
    ui.fbTimer = setTimeout(() => {
      if (ui.route === 'test' && ui.testFeedback && ui.testFeedback.question.id === qid) nextQuestion();
    }, ms);
  }

  function answerTest(response, said) {
    const st = store.state;
    const a = st.tests.current;
    if (!a || ui.testFeedback) return;
    const q = Q.current(a);
    if (!q) return;
    const now = Date.now();
    const out = Q.answer(st.tests, a, response, now, { nextDue: Sched.retestDue(now, testTime()) });
    store.set('tests', out.tests);
    ui.testFeedback = { question: q, correct: out.result.correct, given: out.result.given, expected: out.result.expected, choice: q.part === 'understand' ? response : null };
    ui.order = [];
    render(false);
    // 組み立てる問題（並べ替え・つづり）は、答え合わせのときに正しい英語（文・単語）を鳴らす
    if (q.part === 'compose') {
      const btn = $app.querySelector('.feedback .audio button[data-slow="0"]:not([disabled])');
      if (btn) playFrom(btn);
    }
    // 正解の4択は自動で次へ（単語の音を鳴らしたときは、鳴り終わってから。鳴らないときの予備に少し長め）
    if (out.result.correct && q.part === 'understand') autoNext(q.id, said ? 2600 : 800);
  }

  function nextQuestion() {
    clearTimeout(ui.fbTimer);
    ui.testFeedback = null;
    ui.order = [];
    speech.stop();
    render(true);
  }

  function finishTest() {
    const st = store.state;
    const out = Q.finish(st.tests, st.tests.current, Date.now());
    store.set('tests', out.tests);
    resetTestUi();
    go('score-' + out.summary.id, true);
  }

  /* ----- テストの結果 ----- */

  function viewScore() {
    const st = store.state;
    const a = (st.tests.attempts || []).find((x) => x.id === ui.param);
    if (!a) return notFound('結果が見つかりません', 'home');
    const isRound = a.kind === 'round';
    const half = Q.HALF_SCORED.includes(a.kind);
    const tt = testTime();
    const stats = isRound ? Q.roundStats(st.tests, a.roundId) : null;
    const first = stats && stats.perfectAt;
    const total = a.parts.understand.total + a.parts.compose.total;
    const correct = a.parts.understand.correct + a.parts.compose.correct;
    const nWrong = a.wrongs.length;
    let html = '<main class="screen score" id="main">';
    html += pageHead(a.kind === 'practice' ? '練習の結果' : 'テストの結果', { back: isRound ? 'round-' + a.roundId : 'home' });
    html += '<section class="score-hero">' + (a.score === 100 ? doneMark() : '') +
      '<p class="eyebrow">' + esc(attemptTitle(a)) + '・' + esc(util.formatDateTime(a.finishedAt)) + '</p>' +
      '<p class="score-num"><b>' + a.score + '</b><span>点</span></p><p class="score-max">100点満点・' + correct + ' / ' + total + '問 正解</p>';
    if (isRound) {
      if (a.score === 100) html += '<p class="perfect">満点です。' + (first && first.no === a.no ? a.no + '回目で満点を取りました。' : '満点は ' + first.no + '回目で達成しています。') + '</p>';
      else html += '<p class="to-perfect">満点まであと ' + (100 - a.score) + '点' + (first ? '（満点は ' + first.no + '回目で達成済み）' : '') + '。間違えた ' + nWrong + '問は、明日 ' + esc(tt) + ' に再テスト（必須）です。</p>';
    } else if (a.kind === 'practice') {
      html += '<p class="to-perfect">' + (nWrong ? '練習は記録に入りません。間違えた問題を、もう一度解いてみましょう。' : '全問正解です。' + esc(tt) + ' からのテストで確かめます。') + '</p>';
    } else if (a.kind === 'retest') {
      html += '<p class="' + (nWrong ? 'to-perfect' : 'perfect') + '">' + (nWrong
        ? correct + '問を克服しました。間違えた ' + nWrong + '問は、明日 ' + esc(tt) + ' にもう一度（満点になるまで毎日続きます）。'
        : '満点です。再テストは、これで終わりです。') + '</p>';
    } else if (a.kind === 'review') {
      html += '<p class="to-perfect">' + correct + ' / ' + total + '問 正解。</p>';
    } else {
      html += '<p class="' + (nWrong ? 'to-perfect' : 'perfect') + '">' + (nWrong
        ? '間違えた ' + nWrong + '問は「覚えていないリスト」に入りました。明日 ' + esc(tt) + ' に再テスト（必須）です。'
        : '満点です。') + '</p>';
    }
    html += '</section>';
    const partRow = (key) => {
      const p = a.parts[key];
      const pts = half ? (a.score === 100 ? 50 : (p.total ? Math.floor((50 * p.correct) / p.total) : 0)) : null;
      return '<div class="part-row"><span class="pr-label">' + esc(Q.PARTS[key].label) + '<span class="r-sub">　' + p.correct + ' / ' + p.total + '問</span></span>' +
        (pts != null ? '<span class="pr-pts"><b>' + pts + '</b> / 50点</span>' : '<span></span>') +
        '<span class="meter"><span style="width:' + (p.total ? Math.round((100 * p.correct) / p.total) : 0) + '%"></span></span></div>';
    };
    html += '<section class="group">' + (a.parts.understand.total ? partRow('understand') : '') + (a.parts.compose.total ? partRow('compose') : '') + '</section>';

    let wrongs = '';
    ['understand', 'compose'].forEach((part) => {
      const list = a.wrongs.filter((w) => w.part === part);
      if (!list.length) return;
      wrongs += '<details class="wrong-part"' + (list.length <= 15 ? ' open' : '') + '><summary>' + esc(Q.PARTS[part].label) + '<span>' + list.length + '問</span></summary><ul class="wrong-list">' + list.map((w) => {
        const it = index.senses.get(w.senseId);
        const enAns = part === 'compose' || !['meaning', 'listen'].includes(w.qtype);
        return '<li>' + (it ? '<a href="#word-' + esc(it.word.id) + '" class="wl-word"><b lang="en">' + esc(it.word.headword) + '</b><span>' + esc(it.sense.meaning) + '</span></a>' : '<span class="muted">削除された単語</span>') +
          '<span class="wl-q">' + esc(Q.QTYPE[w.qtype] || '') + '</span>' +
          '<span class="wl-ans"><span class="mini-label">あなたの答え</span><span' + (part === 'compose' ? ' lang="en"' : '') + '>' + esc(w.given) + '</span></span>' +
          '<span class="wl-ans ok"><span class="mini-label">正解</span><span' + (enAns ? ' lang="en"' : '') + '>' + esc(w.answer) + '</span></span></li>';
      }).join('') + '</ul></details>';
    });
    html += section('間違えた問題', nWrong ? '<div class="list">' + wrongs + '</div>' : '<div class="list"><p class="empty-note">ありません。</p></div>', { note: nWrong + '問' });

    if (a.kind === 'practice' && nWrong) {
      html += '<div class="btn-col"><button type="button" class="btn primary block" data-action="start-kind" data-kind="practice">もう一度解く</button></div>';
    } else if (nWrong) {
      html += '<div class="btn-col"><button type="button" class="btn primary block" data-action="start" data-mode="fwd" data-scope="wrong:' + esc(a.id) + '">間違えた単語をカードで学習</button></div>';
    }
    html += '<div class="list">' + rowLink('#misses', '覚えていないリスト', 'すべての間違えた問題・再テストの予定') +
      (isRound ? rowLink('#round-' + a.roundId, roundTitle(a.roundId) || '回', 'カード学習・テストの記録') : rowLink('#home', 'ホーム', '今日の学習・テスト')) +
      '</div>';
    html += '</main>';
    return html;
  }

  /* ----- ③ ミスを確認 ----- */

  function viewCheck() {
    const now = Date.now();
    const tt = testTime();
    const m = mistakes(now, dayInfo(now));
    let html = '<main class="screen check" id="main">';
    html += pageHead('ミスを確認', { back: 'home' });
    html += '<p class="lead">正しい答えと使い方を、音と一緒に確かめましょう。確かめたら ④ で問題を解きます。</p>';
    if (!m.keys.length) {
      html += '<div class="list"><p class="empty-note">いまは、ミスはありません。</p></div></main>';
      return html;
    }
    const head = (it) => '<div class="ci-head"><a href="#word-' + esc(it.word.id) + '" class="ci-word"><b lang="en">' + esc(it.word.headword) + '</b></a>' +
      audioCtl(Object.assign(wordAudio(it), { what: '単語', sm: true, cap: 'auto' })) + '</div>' +
      '<p class="ci-meaning">' + esc(it.sense.meaning) + '</p>';
    if (m.test.length) {
      html += section('テストで間違えた問題', '<ul class="list check-list">' + m.test.map((e) => {
        const it = index.senses.get(e.senseId);
        const due = (e.dueAt || 0) <= now ? (Sched.windowAt(now, tt).open ? 'いま受けられます' : whenLabel(Sched.windowAt(now, tt).start, now)) : whenLabel(e.dueAt, now);
        const enAns = e.part === 'compose' || !['meaning', 'listen'].includes(e.last.qtype);
        return '<li class="check-item">' + head(it) +
          '<p class="ci-meta"><span class="chip">' + esc(Q.QTYPE[e.last.qtype] || Q.PARTS[e.part].label) + '</span><span>再テスト：' + esc(due) + '</span><span>' + e.count + '回まちがえた</span></p>' +
          (e.last.answer ? '<p class="ci-ans"><span class="mini-label">正解</span><span' + (enAns ? ' lang="en"' : '') + '>' + esc(e.last.answer) + '</span></p>' : '') +
          (e.last.given ? '<p class="ci-ans ng"><span class="mini-label">あなたの答え</span><span' + (e.part === 'compose' ? ' lang="en"' : '') + '>' + esc(e.last.given) + '</span></p>' : '') +
          '</li>';
      }).join('') + '</ul>', { note: m.test.length + '件・再テストは ' + tt });
    }
    if (m.weak.length) {
      html += section('今日のカードで思い出せなかった単語', '<ul class="list check-list">' + m.weak.map((w) => {
        const it = index.senses.get(w.sid);
        const ex = it.sense.examples[0];
        return '<li class="check-item">' + head(it) +
          '<p class="ci-meta"><span class="chip">' + esc(SS.MODES[w.mode].label) + '</span><span class="m-' + w.r + '">' + esc(w.r === 'again' ? '思い出せなかった' : 'あいまい') + '</span></p>' +
          (it.sense.nuance ? '<p class="ci-nuance">' + esc(it.sense.nuance) + '</p>' : '') +
          (ex ? '<p class="ex-en" lang="en">' + util.markedHtml(ex.en) + '</p>' + (ex.ja ? '<p class="ex-ja">' + esc(ex.ja) + '</p>' : '') : '') +
          '</li>';
      }).join('') + '</ul>', { note: m.weak.length + '枚' });
    }
    html += '<div class="btn-col"><button type="button" class="btn primary block" data-action="start-kind" data-kind="practice">' + STEP_NO[3] + ' 間違えた問題を解く（' + m.keys.length + '問）</button></div>';
    html += '<p class="section-note">練習は何度でも解けます。覚えていないリストの「克服」は、' + esc(tt) + ' からのテストで正解したときです。</p>';
    html += '</main>';
    return html;
  }

  /* ----- 覚えていないリスト ----- */

  function viewMisses() {
    const st = store.state;
    const roundId = ui.missRound !== 'all' ? ui.missRound : undefined;
    const list = Q.missList(st.tests, { status: ui.missStatus, roundId });
    const counts = Q.missCounts(st.tests);
    const openKeys = Q.openKeys(st.tests, roundId).filter(liveKey);
    const openSenses = new Set(openKeys.map((k) => k.split('|')[0]));
    const now = Date.now();
    let html = '<main class="screen misses" id="main">';
    html += pageHead('覚えていないリスト');
    html += '<p class="lead">テストで間違えた問題を、すべてためています。次の日の ' + esc(testTime()) + ' に再テスト（必須）があり、そこで正解すると「克服」になります。満点になるまで毎日続きます（記録は残ります）。</p>';
    html += '<section class="group"><dl class="facts"><div><dt>覚えていない</dt><dd>' + counts.open + '<small>件</small></dd></div><div><dt>克服した</dt><dd>' + counts.solved + '<small>件</small></dd></div><div><dt>これまで</dt><dd>' + counts.all + '<small>件</small></dd></div></dl>' +
      (openKeys.length
        ? '<div class="btn-col"><button type="button" class="btn primary block" data-action="start" data-mode="fwd" data-scope="misses' + (roundId ? ':' + esc(roundId) : '') + '">カードで学習（' + openSenses.size + '枚）</button>' +
          '<button type="button" class="btn secondary block" data-action="practice-misses">問題を練習する（' + openKeys.length + '問）</button></div>'
        : '') +
      '</section>';
    html += '<div class="filters">' + segButtons('miss-status', ui.missStatus, [['open', '覚えていない'], ['solved', '克服した'], ['all', 'すべて']], '状態') +
      (st.rounds.length > 1 || ui.missRound !== 'all' ? selectBox('miss-round', ui.missRound, roundOptions(false), '回') : '') + '</div>';
    if (!list.length) {
      html += '<div class="list"><p class="empty-note">' + (counts.all ? '当てはまる問題はありません。' : 'まだありません。回のテストで間違えた問題が、ここにたまっていきます。') + '</p></div>';
    } else {
      html += '<ul class="list miss-list">' + list.map((e) => {
        const it = index.senses.get(e.senseId);
        const rounds = e.roundIds.map(roundTitle).filter(Boolean).join('・');
        return '<li class="miss' + (e.solvedAt ? ' solved' : '') + '">' +
          (it ? '<a class="miss-head" href="#word-' + esc(it.word.id) + '"><b lang="en">' + esc(it.word.headword) + '</b><span>' + esc(it.sense.meaning) + '</span></a>' : '<span class="muted">削除された単語</span>') +
          '<span class="miss-meta"><span class="chip">' + esc(Q.PARTS[e.part].label) + '</span>' + (rounds ? '<span>' + esc(rounds) + '</span>' : '') +
          '<span>' + e.count + '回まちがえた</span><span>最後 ' + esc(util.formatDate(e.lastAt)) + '</span>' +
          (!e.solvedAt ? '<span class="miss-due">再テスト：' + esc((e.dueAt || 0) <= now ? (Sched.windowAt(now, testTime()).open ? 'いま受けられます' : whenLabel(Sched.windowAt(now, testTime()).start, now)) : whenLabel(e.dueAt, now)) + '</span>' : '') +
          (e.solvedAt ? '<span class="badge st-verified">克服 ' + esc(util.formatDate(e.solvedAt)) + '</span>' : '') + '</span>' +
          (e.last && e.last.answer ? '<span class="miss-last"><span class="mini-label">正解</span><span' + (e.part === 'compose' || !['meaning', 'listen'].includes(e.last.qtype) ? ' lang="en"' : '') + '>' + esc(e.last.answer) + '</span></span>' : '') +
          '</li>';
      }).join('') + '</ul>';
    }
    html += '</main>';
    return html;
  }

  /* ================= 単語一覧 ================= */

  function wordFlags(w, now) {
    const st = store.state;
    let due = false;
    w.senses.forEach((s) => {
      ['fwd', 'rev'].forEach((m) => {
        const x = SS.stateOf(st.progress, s.id, m);
        if (x && srs.isDue(x, now) && isStudyable(w, s)) due = true;
      });
    });
    const review = w.status === 'needs_review' || w.senses.some((s) => s.status === 'needs_review');
    return { due, review, unverified: w.status === 'unverified' };
  }

  function filteredWords() {
    const now = Date.now();
    const q = ui.query.trim().toLowerCase();
    const round = ui.roundFilter !== 'all' && ui.roundFilter !== 'none' ? roundById(ui.roundFilter) : null;
    const inAny = new Set();
    store.state.rounds.forEach((r) => r.wordIds.forEach((id) => inAny.add(id)));
    return store.state.words.filter((w) => {
      if (round && !round.wordIds.includes(w.id)) return false;
      if (ui.roundFilter === 'none' && inAny.has(w.id)) return false;
      const f = wordFlags(w, now);
      if (ui.filter === 'due' && !f.due) return false;
      if (ui.filter === 'review' && !f.review) return false;
      if (ui.filter === 'unverified' && !f.unverified) return false;
      if (!q) return true;
      const hay = [w.headword].concat(w.senses.map((s) => s.meaning + ' ' + s.nuance + ' ' + s.cue)).join(' ').toLowerCase();
      return hay.includes(q);
    }).sort((a, b) => a.headword.localeCompare(b.headword));
  }

  function wordListItems() {
    const list = filteredWords();
    if (!list.length) return '<li class="empty-note">当てはまる単語がありません。</li>';
    return list.map((w) => {
      const dots = w.senses.map((s) => {
        const lv = srs.level(SS.stateOf(store.state.progress, s.id, 'fwd'));
        return '<span class="lv-dot lv-' + (isStudyable(w, s) ? lv.key : 'off') + '" title="' + esc(lv.label) + '"></span>';
      }).join('');
      return '<li><a class="row word-row" href="#word-' + esc(w.id) + '">' +
        '<span class="r-main"><span class="r-title"><b lang="en">' + esc(w.headword) + '</b>' + (w.status === 'verified' ? '' : statusBadge(w.status)) + '</span>' +
        '<span class="r-sub">' + esc(w.senses.map((s) => s.meaning).join(' ／ ') || '（意味なし）') + '</span></span>' +
        '<span class="wr-dots" aria-label="用法ごとの覚え具合">' + dots + '</span>' + icon('chevron') +
        '</a></li>';
    }).join('');
  }

  function viewWords() {
    const now = Date.now();
    const all = store.state.words;
    const cnt = { all: all.length, due: 0, review: 0, unverified: 0 };
    all.forEach((w) => {
      const f = wordFlags(w, now);
      if (f.due) cnt.due += 1;
      if (f.review) cnt.review += 1;
      if (f.unverified) cnt.unverified += 1;
    });
    const statusOpts = [['all', 'すべて（' + cnt.all + '）'], ['due', '復習待ち（' + cnt.due + '）'], ['review', '要確認（' + cnt.review + '）'], ['unverified', '未確認（' + cnt.unverified + '）']];
    return '<main class="screen words" id="main">' +
      pageHead('単語', { right: '<button type="button" class="btn text" data-action="new-word">' + icon('plus') + '追加</button>' }) +
      '<label class="search"><span class="sr-only">検索</span><input type="search" id="word-search" placeholder="英語・意味で検索" value="' + esc(ui.query) + '" autocomplete="off" autocapitalize="off" spellcheck="false"></label>' +
      '<div class="filters two">' + selectBox('round-filter', ui.roundFilter, roundOptions(true), '回で絞り込み') + selectBox('status-filter', ui.filter, statusOpts, '状態で絞り込み') + '</div>' +
      '<ul class="list word-list" id="word-list">' + wordListItems() + '</ul>' +
      (cnt.review ? '<p class="section-note">「要確認」の単語・用法は通常の出題から外しています。内容を確かめて編集すると出題されます。</p>' : '') +
      '</main>';
  }

  /* ================= 単語詳細 ================= */

  function viewWord() {
    const w = index.words.get(ui.param);
    if (!w) return notFound('単語が見つかりません', 'words');
    const now = Date.now();
    const st = store.state;
    const groups = [];
    w.senses.forEach((s) => {
      let g = groups.find((x) => x.key === s.group);
      if (!g) groups.push((g = { key: s.group, senses: [] }));
      g.senses.push(s);
    });
    groups.sort((a, b) => a.key.localeCompare(b.key));
    const firstSense = w.senses[0];
    const firstItem = firstSense ? index.senses.get(firstSense.id) : null;

    let html = '<main class="screen word-detail" id="main">';
    html += '<header class="page-head sub"><div class="side"><button type="button" class="icon-btn" data-action="back" data-fallback="words" aria-label="戻る">' + icon('back') + '</button></div><h1 class="sr-only">' + esc(w.headword) + '</h1>' +
      '<div class="side right"><a class="btn text" href="#edit-' + esc(w.id) + '">編集</a></div></header>';
    html += '<div class="detail-head"><p class="headword" lang="en">' + esc(w.headword) + '</p>' + (w.status === 'verified' ? '' : statusBadge(w.status)) +
      (firstItem && w.senses.length === 1 ? audioCtl(Object.assign(wordAudio(firstItem), { what: '単語', cap: true })) : '') +
      '</div>';

    if (w.status === 'needs_review') {
      html += '<div class="banner warn"><b>要確認：通常の出題から外しています。</b>' +
        (w.reviewReasons.length ? '<ul>' + w.reviewReasons.map((r) => '<li>' + esc(r) + '</li>').join('') + '</ul>' : '') +
        w.senses.filter((s) => s.note).map((s) => '<p class="review-note">' + esc(s.note) + '</p>').join('') +
        '内容を辞書などで確かめてから、編集で確認状況を変えてください。</div>';
    }
    if (groups.length > 1) {
      html += '<p class="group-note">グループが違う用法は、つづりが同じでも別の単語として覚えます。無理に一つのイメージにまとめなくて大丈夫です。</p>';
    }

    groups.forEach((g) => {
      let body = '';
      g.senses.forEach((s) => {
        const item = index.senses.get(s.id);
        const fwd = SS.stateOf(st.progress, s.id, 'fwd');
        const rev = SS.stateOf(st.progress, s.id, 'rev');
        const off = !isStudyable(w, s);
        body += '<article class="group sense-card' + (off ? ' is-off' : '') + '">' +
          '<div class="sense-head"><span class="chip">' + esc(posLabel(s.pos)) + '</span>' +
          (s.cue ? '<span class="cue" lang="en">' + esc(s.cue) + '</span>' : '<span></span>') +
          (s.status === 'needs_review' ? '<span class="badge st-needs_review">要確認</span>' : '') + '</div>' +
          (w.senses.length > 1 ? audioCtl(Object.assign(wordAudio(item), { what: '単語', sm: true, left: true, cap: true })) : '') +
          senseBody(item, {}) +
          '<div class="learn"><p class="sec-label">学習の記録</p>' +
          '<div class="learn-row"><span class="mini-label">英語 → 場面</span>' + levelChip(fwd) + '<span class="learn-next">' + (fwd && fwd.reps ? '次の復習：' + esc(util.formatDue(fwd.due, now)) : 'まだ学習していません') + '</span></div>' +
          '<div class="learn-row"><span class="mini-label">場面 → 英語</span>' + levelChip(rev) + '<span class="learn-next">' + (rev && rev.reps ? '次の復習：' + esc(util.formatDue(rev.due, now)) : fwd && fwd.reps ? 'これから出題できます' : '英語 → 場面のあとで出題') + '</span></div>' +
          historyHtml(fwd, rev) +
          '</div></article>';
      });
      const title = groups.length > 1 ? 'グループ ' + g.key + (w.groups[g.key] ? '・' + w.groups[g.key] : '') : '用法 ' + w.senses.length + 'つ';
      html += section(title, body);
    });

    html += section('出典と確認状況', '<div class="group">' +
      '<p>' + statusBadge(w.status) + ' <span class="fine">' + esc((ST.STATUS[w.status] || ST.STATUS.unverified).desc) + '</span></p>' +
      (w.check.date ? '<p class="fine">確認日：' + esc(w.check.date) + '</p>' : '') +
      (w.check.method ? '<p class="fine">確認方法：' + esc(w.check.method) + '</p>' : '') +
      (w.check.note ? '<p class="fine">' + esc(w.check.note) + '</p>' : '') +
      (w.sources.length
        ? '<ul class="source-list">' + w.sources.map((s) => '<li>' + (s.url ? '<a href="' + esc(s.url) + '" target="_blank" rel="noopener noreferrer">' + icon('link') + esc(s.label || s.url) + '</a>' : esc(s.label)) + '</li>').join('') + '</ul>'
        : '<p class="muted">出典はまだ登録されていません。</p>') +
      '<p class="sec-label">辞書で調べる</p><div class="dict-links">' + dictLinks(w.headword) + '</div>' +
      '</div>');

    html += '<div class="list">' + rowBtn('delete-word', ' data-id="' + esc(w.id) + '"', 'この単語を削除', '', '', 'danger') + '</div>';
    html += '</main>';
    return html;
  }

  function historyHtml(fwd, rev) {
    const items = [];
    [['fwd', fwd], ['rev', rev]].forEach(([m, st]) => {
      if (!st || !st.history) return;
      st.history.forEach((h) => items.push({ m, h }));
    });
    if (!items.length) return '';
    items.sort((a, b) => b.h.t - a.h.t);
    return '<ol class="history" aria-label="最近の自己評価">' + items.slice(0, 8).map(({ m, h }) =>
      '<li class="m-' + h.r + '"><b>' + esc(srs.RATING_LABEL[h.r] || '') + '</b>' +
      '<span>' + esc(util.formatDateTime(h.t)) + '・' + (m === 'fwd' ? '英→場面' : '場面→英') + (h.re ? '・再' : '') + '</span></li>'
    ).join('') + '</ol>';
  }

  function dictLinks(word) {
    const q = encodeURIComponent(word.toLowerCase());
    const links = [
      ['Cambridge（英和）', 'https://dictionary.cambridge.org/dictionary/english-japanese/' + q],
      ["Oxford Learner's", 'https://www.oxfordlearnersdictionaries.com/search/english/?q=' + q],
      ['Merriam-Webster', 'https://www.merriam-webster.com/dictionary/' + q],
      ['英辞郎 on the WEB', 'https://eow.alc.co.jp/search?q=' + q],
    ];
    return links.map(([l, u]) => '<a href="' + esc(u) + '" target="_blank" rel="noopener noreferrer">' + icon('link') + esc(l) + '</a>').join('');
  }

  function deleteWord(id) {
    const w = index.words.get(id);
    if (!w) return;
    openModal({
      title: '「' + w.headword + '」を削除しますか？',
      body: 'この単語の用法 ' + w.senses.length + 'つと、その学習記録も消えます。元に戻せません（書き出したファイルがあれば読み込みで戻せます）。',
      ok: '削除する',
      danger: true,
      onOk: () => {
        const st = store.state;
        const progress = Object.assign({}, st.progress);
        w.senses.forEach((s) => delete progress[s.id]);
        const meta = Object.assign({}, st.meta);
        if (C.seed.words.some((x) => x.id === id)) meta.deletedSeed = Array.from(new Set((meta.deletedSeed || []).concat(id)));
        setWords(st.words.filter((x) => x.id !== id));
        store.set('progress', progress);
        store.set('meta', meta);
        store.set('rounds', st.rounds.map((r) => Object.assign({}, r, { wordIds: r.wordIds.filter((x) => x !== id) })));
        if (st.session) store.set('session', SS.sanitize(st.session, store.state.words));
        toast('「' + w.headword + '」を削除しました。');
        go('words', true);
      },
    });
  }

  /* ================= 単語の追加・編集 ================= */

  function emptySense() {
    return {
      id: '', group: 'A', pos: 'noun', role: '', cue: '', speak: '', ipa: { us: '', uk: '' }, stress: '',
      nuance: '', scene: { emoji: '', diagram: '', text: '' }, meaning: '', roleText: '',
      examples: [{ en: '', ja: '' }], contrasts: [], note: '', status: '', audio: { word: '', examples: [] },
    };
  }

  function prepareEditor() {
    ui.editErrors = [];
    if (ui.route === 'edit') {
      const w = index.words.get(ui.param);
      ui.editDraft = w ? util.clone(w) : null;
    } else {
      ui.editDraft = {
        id: '', headword: '', status: 'unverified', check: { date: '', method: '', note: '' }, sources: [],
        groups: {}, senses: [emptySense()], reviewReasons: [],
      };
    }
    ui.editSourcesText = ui.editDraft ? ui.editDraft.sources.map((s) => (s.url ? s.label + ' | ' + s.url : s.label)).join('\n') : '';
    const inRound = ui.editDraft && ui.editDraft.id ? store.state.rounds.find((r) => r.wordIds.includes(ui.editDraft.id)) : null;
    ui.editRound = inRound ? inRound.id : ui.roundFilter !== 'all' && ui.roundFilter !== 'none' && ui.route === 'new-word' ? ui.roundFilter : '';
  }

  function field(label, path, value, opts) {
    const o = opts || {};
    const id = 'f-' + path.replace(/\./g, '-');
    const attrs = ' id="' + id + '" data-field="' + path + '"' + (o.lang ? ' lang="' + o.lang + '"' : '') +
      (o.placeholder ? ' placeholder="' + esc(o.placeholder) + '"' : '') + (o.required ? ' required aria-required="true"' : '') +
      (o.en ? ' autocapitalize="off" autocomplete="off" spellcheck="false"' : '');
    const input = o.textarea
      ? '<textarea' + attrs + ' rows="' + (o.rows || 2) + '">' + esc(value) + '</textarea>'
      : '<input type="' + (o.type || 'text') + '"' + attrs + ' value="' + esc(value) + '">';
    return '<label class="f' + (o.half ? ' half' : '') + '" for="' + id + '"><span class="f-label">' + label + (o.required ? '<em>必須</em>' : '') + '</span>' + input +
      (o.help ? '<span class="f-help">' + o.help + '</span>' : '') + '</label>';
  }

  function selectField(label, path, value, options, opts) {
    const o = opts || {};
    const id = 'f-' + path.replace(/\./g, '-');
    return '<label class="f' + (o.half ? ' half' : '') + '" for="' + id + '"><span class="f-label">' + label + '</span>' +
      '<select id="' + id + '" data-field="' + path + '">' +
      options.map(([v, l]) => '<option value="' + esc(v) + '"' + (v === value ? ' selected' : '') + '>' + esc(l) + '</option>').join('') +
      '</select>' + (o.help ? '<span class="f-help">' + o.help + '</span>' : '') + '</label>';
  }

  function viewEdit() {
    const d = ui.editDraft;
    const isNew = ui.route === 'new-word';
    if (!d) return notFound('単語が見つかりません', 'words');
    const posOpts = Object.keys(ST.POS).map((k) => [k, ST.POS[k]]);
    const roleOpts = [['', '（選ばない）']].concat(Object.keys(ST.ROLE).map((k) => [k, ST.ROLE[k]]));
    const groupOpts = ST.GROUPS.map((g) => [g, 'グループ ' + g]);
    const statusOpts = Object.keys(ST.STATUS).map((k) => [k, ST.STATUS[k].label]);

    let html = '<main class="screen editor" id="main"><form id="edit-form" novalidate>';
    html += pageHead(isNew ? '単語を追加' : '単語を編集', { back: 'words' });
    if (ui.editErrors.length) {
      html += '<div class="banner warn" role="alert"><ul>' + ui.editErrors.map((e) => '<li>' + esc(e) + '</li>').join('') + '</ul></div>';
    }
    html += '<fieldset class="ed-sec"><legend>単語</legend>' +
      field('英単語（見出し語）', 'headword', d.headword, { required: true, lang: 'en', en: true, placeholder: '例: pretty' }) +
      '<label class="f" for="f-round"><span class="f-label">回</span><select id="f-round">' +
      [['', '（回に入れない）']].concat(store.state.rounds.map((r) => [r.id, r.title])).map(([v, l]) => '<option value="' + esc(v) + '"' + (v === ui.editRound ? ' selected' : '') + '>' + esc(l) + '</option>').join('') +
      '</select><span class="f-help">回に入れると、その回のカード学習とテストに出ます。</span></label>' +
      selectField('確認状況', 'status', d.status, statusOpts, { help: '確認済み＝辞書などで確かめた／未確認＝出題するが未確認／要確認＝読めない文字や不明な点があり、出題しない' }) +
      field('確認メモ（確かめた方法・辞書名など）', 'check.method', d.check.method, { textarea: true, rows: 2 }) +
      '<label class="f" for="f-sources"><span class="f-label">出典（1行に1つ「名前 | URL」）</span><textarea id="f-sources" data-field="_sources" rows="3" placeholder="Cambridge Dictionary | https://dictionary.cambridge.org/..." autocapitalize="off" spellcheck="false">' + esc(ui.editSourcesText) + '</textarea></label>' +
      '<div class="f-row">' + ['A', 'B', 'C'].map((g) => field('グループ' + g + 'の説明', 'groups.' + g, d.groups[g] || '', { half: true, placeholder: g === 'A' ? '例: 「よい状態」の仲間' : '' })).join('') + '</div>' +
      '<p class="f-help">意味が離れている用法（well の「上手に」と「井戸」など）は、別のグループにしてください。</p>' +
      '</fieldset>';

    d.senses.forEach((s, i) => {
      const p = 'senses.' + i + '.';
      html += '<fieldset class="ed-sec sense-ed"><legend><span>用法 ' + (i + 1) + '</span>' +
        (d.senses.length > 1 ? '<button type="button" class="btn text danger sm" data-action="remove-sense" data-i="' + i + '">削除</button>' : '') + '</legend>' +
        '<div class="f-row">' +
        selectField('品詞', p + 'pos', s.pos, posOpts, { half: true }) +
        selectField('文の中での役割', p + 'role', s.role, roleOpts, { half: true }) +
        selectField('グループ', p + 'group', s.group, groupOpts, { half: true }) +
        '</div>' +
        field('意味（日本語）', p + 'meaning', s.meaning, { required: true, placeholder: '例: けっこう、かなり' }) +
        field('一言ニュアンス', p + 'nuance', s.nuance, { placeholder: '例: 「とても」ほどじゃないけど「けっこう」って感じ' }) +
        field('頭に浮かべる場面', p + 'scene.text', s.scene.text, { textarea: true, rows: 2, placeholder: '身近な具体的な場面を短く' }) +
        field('表面に出すフレーズ（英語）', p + 'cue', s.cue, { lang: 'en', en: true, placeholder: '例: pretty tired', help: '同じ単語の用法を見分ける手がかりになります。' }) +
        field('役割の説明', p + 'roleText', s.roleText, { textarea: true, rows: 3, placeholder: '「どのくらい」を表す言葉です（副詞）。…' }) +
        '<div class="ed-sub"><p class="f-label">例文</p>' +
        s.examples.map((ex, j) =>
          '<div class="ed-item">' +
          field('英語', p + 'examples.' + j + '.en', ex.en, { lang: 'en', en: true, placeholder: "I'm [pretty] tired." }) +
          field('日本語訳', p + 'examples.' + j + '.ja', ex.ja, { placeholder: '今日はけっこう疲れてる。' }) +
          '<button type="button" class="btn text danger sm" data-action="remove-example" data-i="' + i + '" data-j="' + j + '">この例文を削除</button></div>'
        ).join('') +
        '<p class="f-help">英語の例文では、その用法の単語を [ ] で囲んでください（例: I\'m [pretty] tired.）。裏面では強調、「場面 → 英語」では空欄になります。</p>' +
        '<button type="button" class="btn text sm" data-action="add-example" data-i="' + i + '">' + icon('plus') + '例文を追加</button></div>' +
        '<div class="ed-sub"><p class="f-label">似た単語との違い（任意）</p>' +
        s.contrasts.map((c, j) =>
          '<div class="ed-item">' +
          field('似た単語', p + 'contrasts.' + j + '.word', c.word, { lang: 'en', en: true, half: true, placeholder: 'very' }) +
          field('使う場面の違い', p + 'contrasts.' + j + '.text', c.text, { textarea: true, rows: 2 }) +
          '<button type="button" class="btn text danger sm" data-action="remove-contrast" data-i="' + i + '" data-j="' + j + '">削除</button></div>'
        ).join('') +
        '<button type="button" class="btn text sm" data-action="add-contrast" data-i="' + i + '">' + icon('plus') + '似た単語を追加</button></div>' +
        '<div class="ed-sub"><p class="f-label">発音</p><div class="f-row">' +
        field('発音記号（アメリカ）', p + 'ipa.us', s.ipa.us, { half: true, lang: 'en', en: true, placeholder: '/ˈprɪti/' }) +
        field('発音記号（イギリス）', p + 'ipa.uk', s.ipa.uk, { half: true, lang: 'en', en: true, placeholder: '/ˈprɪti/' }) +
        '</div>' +
        field('強く読む位置（任意）', p + 'stress', s.stress, { lang: 'en', en: true, placeholder: 're·CORD', help: '音節を「·」で区切り、強く読む音節を大文字にします。' }) +
        field('端末の読み上げで読む語句（任意）', p + 'speak', s.speak, { lang: 'en', en: true, placeholder: '空欄なら見出し語', help: 'AI音声がない単語を、端末の読み上げで読むときだけ使います。品詞で発音が変わる語は「to record」「a record」のように、この用法の発音になる語句にします。AI音声がある単語は、いつも見出し語だけを、その用法の発音で読みます。' }) +
        field('録音音声のURL（任意）', p + 'audio.word', s.audio.word, { en: true, placeholder: 'https://… または audio/xxx.mp3', help: '登録すると AI音声より優先して再生し、「録音」と表示します。' }) +
        '</div>' +
        field('補足（任意）', p + 'note', s.note, { textarea: true, rows: 2 }) +
        '<div class="ed-sub"><p class="f-label">テスト用の例文（文章作成・任意）</p>' +
        field('英語', p + 'test.en', (s.test && s.test.en) || '', { lang: 'en', en: true, placeholder: 'The exam was [pretty] hard.' }) +
        field('日本語訳', p + 'test.ja', (s.test && s.test.ja) || '', { placeholder: '試験はけっこう難しかった。' }) +
        '<p class="f-help">テストの並べ替え問題に使います。カードの例文とは別の文にすると、応用の力がつきます。空欄なら最後の例文を使います。</p></div>' +
        '<label class="check"><input type="checkbox" id="f-' + i + '-status" data-field="' + p + 'status" value="needs_review"' + (s.status === 'needs_review' ? ' checked' : '') + '> この用法は要確認（出題しない）</label>' +
        '</fieldset>';
    });
    html += '<button type="button" class="btn secondary block" data-action="add-sense">' + icon('plus') + '用法を追加</button>';
    html += '<p class="fine">新しく追加した単語の音声は、端末の読み上げになります（AI音声は、あらかじめ作った単語だけです）。</p>';
    html += '<div class="ed-actions"><button type="button" class="btn secondary" data-action="back" data-fallback="words">キャンセル</button>' +
      '<button type="button" class="btn primary" data-action="save-word">保存する</button></div>';
    html += '</form></main>';
    return html;
  }

  function setPath(obj, path, value) {
    const parts = path.split('.');
    let o = obj;
    for (let i = 0; i < parts.length - 1; i++) {
      const k = /^\d+$/.test(parts[i]) ? Number(parts[i]) : parts[i];
      if (o[k] == null) o[k] = /^\d+$/.test(parts[i + 1]) ? [] : {};
      o = o[k];
    }
    o[parts[parts.length - 1]] = value;
  }

  function parseSources(text) {
    return String(text || '').split(/\n+/).map((line) => line.trim()).filter(Boolean).map((line) => {
      const m = line.split('|');
      if (m.length >= 2) return { label: m[0].trim(), url: m.slice(1).join('|').trim() };
      if (/^https?:\/\//i.test(line)) return { label: line, url: line };
      return { label: line, url: '' };
    });
  }

  function saveWord() {
    const d = util.clone(ui.editDraft);
    const errors = [];
    d.headword = String(d.headword || '').trim();
    if (!d.headword) errors.push('英単語（見出し語）を入力してください。');
    d.sources = parseSources(ui.editSourcesText);
    d.senses.forEach((s, i) => {
      if (!String(s.meaning || '').trim()) errors.push('用法 ' + (i + 1) + ' の「意味（日本語）」を入力してください。');
      s.examples = (s.examples || []).filter((e) => String(e.en || '').trim() || String(e.ja || '').trim());
      s.examples.forEach((e, j) => {
        if (!String(e.en || '').trim()) errors.push('用法 ' + (i + 1) + ' の例文 ' + (j + 1) + ' に英語がありません。');
      });
    });
    const badUrl = d.sources.find((s) => s.url && !ST.safeUrl(s.url));
    if (badUrl) errors.push('出典のURLは http:// か https:// で始まるものにしてください（' + badUrl.url + '）。');
    if (d.status === 'verified' && !d.sources.length) errors.push('「確認済み」にするときは、出典を1つ以上入力してください。');
    d.senses.forEach((s, i) => {
      if (s.test && !String(s.test.en || '').trim()) s.test = null;
      else if (s.test && !/\[[^\]]+\]/.test(s.test.en)) errors.push('用法 ' + (i + 1) + ' のテスト用の例文で、その単語を [ ] で囲んでください。');
    });
    const dupe = store.state.words.find((w) => w.id !== d.id && w.headword.toLowerCase() === d.headword.toLowerCase());
    if (dupe && !errors.length && !ui.confirmedDupe) {
      ui.editErrors = [];
      openModal({
        title: '同じ単語がすでにあります',
        body: '「' + dupe.headword + '」は登録済みです。別の単語として保存すると、一覧に2つ並びます。既存の単語に用法を追加したい場合は、そちらを編集してください。',
        ok: '別の単語として保存',
        onOk: () => { ui.confirmedDupe = true; saveWord(); ui.confirmedDupe = false; },
      });
      return;
    }
    if (errors.length) {
      ui.editErrors = errors;
      render(true);
      return;
    }
    const now = Date.now();
    if (!d.id) d.id = util.randomId('w-' + util.slug(d.headword));
    d.senses.forEach((s) => { if (!s.id) s.id = util.randomId('s-' + util.slug(d.headword)); });
    const prev = index.words.get(d.id);
    if (d.status === 'verified' && (!prev || prev.status !== 'verified' || !d.check.date)) d.check.date = util.dayKey(now);
    d.updatedAt = now;
    if (!prev) d.createdAt = now;
    const { word, problems } = ST.normalizeWord(d);
    const words = store.state.words.slice();
    const at = words.findIndex((w) => w.id === word.id);
    if (at >= 0) words[at] = word;
    else words.push(word);
    setWords(words);
    // 回への出し入れ
    const prevRound = store.state.rounds.find((r) => r.wordIds.includes(word.id));
    if ((prevRound ? prevRound.id : '') !== ui.editRound) {
      store.set('rounds', store.state.rounds.map((r) => {
        const ids = r.wordIds.filter((x) => x !== word.id);
        if (r.id === ui.editRound) ids.push(word.id);
        return Object.assign({}, r, { wordIds: ids });
      }));
    }
    if (store.state.session) store.set('session', SS.sanitize(store.state.session, store.state.words));
    ui.editErrors = [];
    toast(problems.length ? '保存しました。要確認にしています：' + problems.join('、') : '保存しました。');
    if (navStack.length > 1 && navStack[navStack.length - 2] === 'word:' + word.id) history.back();
    else go('word-' + word.id, true);
  }

  /* ================= 設定 ================= */

  function isStandalone() {
    try {
      return window.navigator.standalone === true || window.matchMedia('(display-mode: standalone)').matches;
    } catch (e) {
      return false;
    }
  }

  /** テストの時間と通知：時刻を選ぶ・カレンダーに予定（通知つき）を入れる */
  function notifySection() {
    const tt = testTime();
    const opts = { now: Date.now(), testTime: tt, startDay: startDayTs(), appName: APP_NAME };
    const g = (uid, title, sub) => '<a class="row" data-cal="1" href="' + esc(Sched.googleCalendarUrl(opts, uid)) + '" target="_blank" rel="noopener noreferrer">' + rowInner(title, 'Googleカレンダーに追加・' + sub, '', '') + '</a>';
    return section('テストの時間と通知', '<div class="group">' +
      '<div class="f"><span class="f-label">毎日のテストの時間</span>' +
      selectBox('test-time', tt, Sched.TIMES.map((x) => [x, x + (x === Sched.DEFAULT_TIME ? '（はじめの設定）' : '')]), '毎日のテストの時間') + '</div>' +
      '<ul class="plain-list fine sched-list">' +
      '<li><b>毎日のテスト</b>：' + esc(tt) + ' から朝4:00まで。今日学習した単語と、必須の再テスト</li>' +
      '<li><b>再テスト</b>：間違えた問題は次の日の ' + esc(tt) + ' に必須。満点になるまで毎日</li>' +
      '<li><b>まとめテスト</b>：5日ごと（次は ' + esc(todayLabel(Sched.nextSummaryDay(Date.now(), tt, startDayTs()))) + '）</li>' +
      '<li><b>月のまとめテスト</b>：毎月1日。先月の単語を約50問</li></ul>' +
      '<button type="button" class="btn primary block" data-action="add-calendar">' + icon('calendar') + 'カレンダーに通知を追加</button>' +
      '<p class="fine">毎日の ' + esc(tt) + '、まとめテストの日、毎月1日に、端末のカレンダーから通知が届きます。保存されたファイル（.ics）を開いて、予定を追加してください（iPhone は「すべてを追加」）。</p>' +
      '</div>' +
      '<div class="list">' + g('daily-test', '毎日のテスト', tt + '・毎日') +
      g('summary-test', 'まとめテスト', tt + '・5日ごと') + g('monthly-test', '月のまとめテスト', tt + '・毎月1日') + '</div>' +
      '<p class="section-note">ホーム画面のアプリやブラウザは、閉じているあいだ自分では通知を出せません。そのため、カレンダーの予定の通知を使います。アプリを開いているときは、' + esc(tt) + ' になると画面でもお知らせします。時間を変えたら、カレンダーの予定も入れ直してください。</p>',
    { id: 'notify' });
  }

  /** カレンダーに予定を入れた（ホームの「通知を受け取る」を出さない） */
  function markCalendar() {
    if (!store.state.meta.calendarAt) store.set('meta', Object.assign({}, store.state.meta, { calendarAt: Date.now() }));
  }

  /** カレンダーの予定（.ics）を保存する */
  function addCalendar() {
    const tt = testTime();
    const url = typeof C.saveFile === 'function' ? '' : location.href.split('#')[0];
    const text = Sched.calendar({ now: Date.now(), testTime: tt, startDay: startDayTs(), appName: APP_NAME, url });
    const name = 'ankicard-' + tt.replace(':', '') + '.ics';
    const fail = () => toast('保存できませんでした。下の Googleカレンダーの行を使ってください。');
    markCalendar();
    if (typeof C.saveFile === 'function') {
      C.saveFile(name, text).then((ok) => (ok ? toast('カレンダーのファイルを保存しました。開いて予定を追加してください。') : fail()), fail);
      return;
    }
    try {
      const blob = new Blob([text], { type: 'text/calendar;charset=utf-8' });
      const href = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = href;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(href), 4000);
      toast('カレンダーのファイルを保存しました。開いて予定を追加してください。');
    } catch (e) {
      fail();
    }
  }

  /** 設定の「ホーム画面」：手順の画面へ */
  function homeScreenSection() {
    if (isStandalone()) {
      return section('ホーム画面', '<div class="group"><p class="ok-line">ホーム画面から開いています。</p></div>', { id: 'home-screen' });
    }
    return section('ホーム画面', '<div class="list">' + rowLink('#install', 'ホーム画面に追加（iPhone）', 'アプリのように全画面で開けます') + '</div>', { id: 'home-screen' });
  }

  function audioSection() {
    const s = store.state.settings;
    const n = packCount();
    let info;
    if (n && !(speech && speech.packFailed)) {
      info = '<div class="audio-info"><p class="r-title">AI音声（アメリカ英語）</p>' +
        '<p class="fine">やわらかく聞き取りやすい、アメリカ英語の女性の声です。' +
        '単語・フレーズ・例文 ' + n + '件を、ふつうの速さと「ゆっくり」の2種類で用意しています。「ゆっくり」は、単語なら2.2倍・2〜4語なら1.8倍・文なら1.6倍の長さで、一つひとつの音を聞き取れる速さです。再生中は、ボタンの下に何倍で再生しているかを出します。</p></div>';
    } else if (n) {
      info = '<p class="banner warn">AI音声を読み込めなかったため、端末の読み上げを使っています。通信できる状態で、アプリを開き直してください。</p>';
    } else {
      info = '<p class="fine">AI音声がないため、端末の読み上げを使います。</p>';
    }
    return section('音声', '<div class="group">' + info +
      audioCtl({ text: SAMPLE_TEXT, what: 'テスト音声', cap: true, left: true }) +
      toggleRow('autoplay', 'カードを表示したら、単語を自動で再生', s.autoplay) +
      '</div>' + deviceVoiceHtml(), { id: 'voice-section' });
  }

  /** 端末の読み上げ（AI音声がない英語のとき、予備として使う）。たたんで表示する */
  function deviceVoiceHtml() {
    const s = store.state.settings;
    let status = '';
    if (speech && speech.status === 'ready') {
      const v = speech.voice;
      const good = speech.isUS(v) && speech.isHighQuality(v);
      status = '<p class="' + (good ? 'ok-line' : 'banner warn') + '">いまの声：<b>' + esc(speech.currentLabel()) + '</b>' +
        (good ? '' : '<br>' + (speech.isUS(v)
          ? 'この声は標準品質です。下の方法で、高品質なアメリカ英語の声を追加できます。'
          : speech.voices.some((x) => speech.isUS(x))
            ? '選んでいる声はアメリカ英語ではありません。一覧から「アメリカ英語」の声を選んでください。'
            : 'アメリカ英語の声が見つかりません。下の方法で、アメリカ英語の声を追加してください。')) + '</p>';
    } else if (speech) {
      status = '<p class="banner ' + (speech.status === 'loading' ? 'info' : 'warn') + '">' + esc(speech.message()) + '</p>';
    }
    const voices = speech ? speech.voices : [];
    return '<details class="group fold" id="device-voice"' + (ui.deviceOpen ? ' open' : '') + '><summary>端末の読み上げ<span>AI音声がない英語に使います</span></summary><div class="fold-body">' +
      status +
      '<label class="f" for="voice-select"><span class="f-label">英語の声</span>' +
      '<select id="voice-select"' + (voices.length ? '' : ' disabled') + '>' +
      (voices.length ? voices.map((v) => '<option value="' + esc(v.voiceURI) + '"' + (speech.voice && v.voiceURI === speech.voice.voiceURI ? ' selected' : '') + '>' + esc(speech.voiceLabel(v)) + '</option>').join('') : '<option>使える英語の声がありません</option>') +
      '</select><span class="f-help">アメリカ英語・高品質の声を上に並べています。</span></label>' +
      audioCtl({ text: SAMPLE_TEXT, what: '端末の声', cap: true, left: true, synth: true }) +
      '<label class="f" for="rate"><span class="f-label">ふつうの速さ：<b id="rate-val">' + s.rate.toFixed(2) + '</b> 倍</span><input type="range" id="rate" min="0.7" max="1.1" step="0.05" value="' + s.rate + '"></label>' +
      '<label class="f" for="slow-rate"><span class="f-label">ゆっくりの速さ：<b id="slow-rate-val">' + s.slowRate.toFixed(2) + '</b> 倍</span><input type="range" id="slow-rate" min="0.3" max="0.8" step="0.05" value="' + s.slowRate + '"></label>' +
      toggleRow('slow-by-word', 'ゆっくりのとき、文を1語ずつ区切って読む', s.slowWordByWord) +
      '<label class="f" for="slow-gap"><span class="f-label">区切りの間：<b id="slow-gap-val">' + (s.slowGap / 1000).toFixed(1) + '</b> 秒</span><input type="range" id="slow-gap" min="0" max="1000" step="100" value="' + s.slowGap + '"></label>' +
      '<p class="sec-label">高品質な声を追加するには</p>' +
      '<ul class="plain-list fine">' +
      '<li><b>iPhone</b>：設定 → アクセシビリティ → 読み上げコンテンツ → 声 → 英語 → 英語（米国）→「Ava（プレミアム）」などをダウンロード</li>' +
      '<li><b>Android</b>：設定 → システム → 言語と入力 → テキスト読み上げ → Google 音声サービス → 英語（米国）の音声データ</li>' +
      '<li><b>Mac</b>：システム設定 → アクセシビリティ → 読み上げコンテンツ → システムの声 → 英語（米国）の高品質な声</li>' +
      '<li><b>Windows</b>：Microsoft Edge で開くと「Microsoft Aria Online (Natural)」などの自然な声を使えます</li>' +
      '</ul></div></details>';
  }

  function viewOptions() {
    const s = store.state.settings;
    const st = store.status;
    const storageText = st.backend === 'local' ? '記録はこの端末のブラウザに保存しています。ブラウザのデータを消すと記録も消えるので、ときどき書き出しておくと安心です。'
      : st.backend === 'memory' ? 'このブラウザでは保存できません。ページを閉じると記録が消えます。'
      : '記録はあなたのアカウントに保存しています。';
    let html = '<main class="screen options" id="main">' + pageHead('設定');
    html += notifySection();
    html += homeScreenSection();
    html += audioSection();

    html += section('学習', '<div class="group">' +
      '<div class="f"><span class="f-label">今日の目標</span>' + selectBox('daily-goal', String(s.dailyGoal), [10, 20, 30, 40].map((n) => [String(n), n + '枚（' + n / 10 + 'セット）']), '今日の目標') + '</div>' +
      '<div class="f"><span class="f-label">発音記号の表示</span>' + segButtons('set-accent', s.accent, [['us', 'アメリカ英語'], ['uk', 'イギリス英語']], '発音記号') + '</div>' +
      '</div>');

    html += section('データ', '<div class="list">' +
      rowBtn('export-file', '', 'ファイルに書き出す', 'バックアップや機種変更に', '', 'action') +
      rowBtn('export-copy', '', 'テキストでコピー', 'メモアプリなどに貼って保存', '', 'action') +
      '<div class="row static">' + toggleRow('include-progress', '学習記録・設定も含める', ui.includeProgress) + '</div>' +
      '</div>' +
      (ui.exportText ? '<label class="f" for="export-text"><span class="f-label">書き出した内容（長押しで全選択してコピーできます）</span><textarea id="export-text" rows="6" readonly>' + esc(ui.exportText) + '</textarea></label>' : '') +
      '<div class="group"><p class="r-title">読み込み</p>' +
      '<p class="fine">書き出したファイルを選ぶか、内容を貼り付けてください。読めない文字や不明な点がある単語は「要確認」にして、通常の出題から外します。</p>' +
      '<label class="f" for="import-file"><span class="f-label">ファイルを選ぶ</span><input type="file" id="import-file" accept=".json,application/json,text/plain"></label>' +
      '<label class="f" for="import-text"><span class="f-label">または貼り付け</span><textarea id="import-text" rows="4" placeholder=\'{"format":"core-image-flashcards", ...}\' spellcheck="false">' + esc(ui.importText) + '</textarea></label>' +
      '<button type="button" class="btn secondary block" data-action="import-check">内容を確認</button>' +
      importPreviewHtml() +
      '</div>');

    html += section('リセット', '<div class="list">' +
      rowBtn('reset-progress', '', 'カードの学習記録をリセット', '', '', 'danger') +
      rowBtn('reset-tests', '', 'テストの記録と覚えていないリストをリセット', '', '', 'danger') +
      rowBtn('reset-words', '', '単語と回を初期状態に戻す', '', '', 'danger') +
      '</div><p class="section-note">' + esc(storageText) + '</p>');

    html += section('このアプリについて', '<div class="group about">' +
      '<p>カードは「1つの意味・用法」ごとに作っています。同じ単語のほかの用法は、単語の詳細画面でまとめて見られます。</p>' +
      '<p>コアイメージは、単語の意味や使い方をつかみやすくするための「見方」です。すべてのネイティブスピーカーが同じイメージを持っているとは限りません。well の「上手に」と「井戸」のように語源が違う単語は、無理に一つのイメージにまとめず、別々に覚えます。</p>' +
      '<p>評価のしかた：思い出せた → 間隔を広げて復習／あいまい → 間隔を短く／思い出せなかった → このセットですぐもう一度。</p>' +
      '<p>初期の単語は、辞書の情報と照らし合わせて意味・品詞・発音記号を確かめ、出典と確認方法を単語ごとに記録しています。例文・ニュアンス・場面の説明は、このアプリ用に作った学習用の文章です。</p>' +
      '<p>毎日の順番：① 単語を覚える（英語 → 場面）→ ② 逆から思い出す（場面 → 英語）→ ③ ミスを確認 → ④ 間違えた問題を解く → ⑤ ' + esc(testTime()) + ' からテスト。テストで間違えた問題は、次の日に再テスト（必須）で、満点になるまで毎日続きます。5日ごとのまとめテストと、毎月1日の月のまとめテストで、長く覚えているかを確かめます。</p>' +
      '<p class="fine">AI音声：Kokoro-82M（Apache-2.0）と発音辞書 misaki（Apache-2.0）で作成。日本語は読み上げません。</p>' +
      '</div>');
    html += '</main>';
    return html;
  }

  function importPreviewHtml() {
    const p = ui.importPreview;
    if (!p) return '';
    if (!p.ok) return '<div class="banner warn import-error" role="alert">' + esc(p.error) + '</div>';
    const s = p.stats;
    return '<div class="import-preview" role="status"><p><b>読み込める内容</b></p><ul>' +
      '<li>単語 ' + s.words + '語（用法 ' + s.senses + 'つ）</li>' +
      (s.needsReview ? '<li>うち要確認 ' + s.needsReview + '語（出題しません）</li>' : '') +
      '<li>学習記録 ' + (s.progress ? s.progress + '件・' + s.days + '日分' : 'なし') + '</li></ul>' +
      (p.warnings.length ? '<details><summary>注意 ' + p.warnings.length + '件</summary><ul class="warn-list">' + p.warnings.slice(0, 30).map((w) => '<li>' + esc(w) + '</li>').join('') + '</ul></details>' : '') +
      '<div class="btn-col"><button type="button" class="btn primary block" data-action="import-merge">追加・更新する</button>' +
      '<button type="button" class="btn secondary block" data-action="import-replace">すべて置き換える</button>' +
      '<button type="button" class="btn text block" data-action="import-cancel">やめる</button></div>' +
      '<p class="fine">追加・更新：同じIDの単語は上書きし、新しい単語は追加します。今の学習記録は残します。<br>すべて置き換える：今の単語と学習記録を、ファイルの内容に置き換えます。</p></div>';
  }

  function exportJson() {
    return JSON.stringify(ST.buildExport(store.state, { includeProgress: ui.includeProgress }), null, 2);
  }

  function exportFile() {
    const text = exportJson();
    ui.exportText = text;
    if (typeof C.saveFile === 'function') {
      // 公開ページ版など、専用の保存方法がある場合
      C.saveFile(ST.exportFileName(Date.now()), text).then(
        (ok) => toast(ok ? 'ファイルを保存しました。' : '保存できませんでした。「テキストでコピー」を使ってください。'),
        () => toast('保存できませんでした。「テキストでコピー」を使ってください。')
      );
      render(false);
      return;
    }
    try {
      const blob = new Blob([text], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = ST.exportFileName(Date.now());
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
      toast('ファイルを保存しました。保存されない場合は「テキストでコピー」を使ってください。');
    } catch (e) {
      toast('ファイルを保存できませんでした。「テキストでコピー」を使ってください。');
    }
    render(false);
  }

  function exportCopy() {
    const text = exportJson();
    ui.exportText = text;
    const done = () => toast('コピーしました。メモアプリなどに貼り付けて保存できます。');
    const fail = () => {
      toast('自動でコピーできませんでした。下の欄を長押しして全選択・コピーしてください。');
      const ta = document.getElementById('export-text');
      if (ta) { ta.focus(); ta.select(); }
    };
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, fail);
      else setTimeout(fail, 0);
    } catch (e) {
      setTimeout(fail, 0);
    }
    render(false);
  }

  function importCheck(text) {
    ui.importText = text;
    ui.importPreview = ST.parseImport(text);
    render(false);
    const el = document.querySelector('.import-preview, .import-error');
    if (el) el.scrollIntoView({ block: 'nearest' });
  }

  function importApply(mode) {
    const p = ui.importPreview;
    if (!p || !p.ok) return;
    const apply = () => {
      const next = ST.applyImport(store.state, p.data, mode);
      Object.keys(next).forEach((k) => store.set(k, next[k]));
      rebuildIndex();
      if (store.state.session) store.set('session', SS.sanitize(store.state.session, store.state.words));
      if (mode === 'replace') speech.refresh(false);
      ui.importPreview = null;
      ui.importText = '';
      toast('読み込みました（単語 ' + p.stats.words + '語）。');
      render(true);
    };
    if (mode === 'replace') {
      openModal({
        title: 'すべて置き換えますか？',
        body: '今の単語データと学習記録は消え、ファイルの内容になります。必要なら先に書き出してください。',
        ok: '置き換える',
        danger: true,
        onOk: apply,
      });
    } else {
      apply();
    }
  }

  /* ================= モーダル・トースト ================= */

  function openModal(m) {
    ui.modal = m;
    $modal.innerHTML = '<div class="modal-back" data-action="modal-cancel"></div>' +
      '<div class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">' +
      '<h2 id="modal-title">' + esc(m.title) + '</h2><p>' + esc(m.body) + '</p>' +
      '<div class="btn-col"><button type="button" class="btn block ' + (m.danger ? 'danger' : 'primary') + '" data-action="modal-ok">' + esc(m.ok) + '</button>' +
      '<button type="button" class="btn text block" data-action="modal-cancel">やめる</button></div></div>';
    $modal.hidden = false;
    const okBtn = $modal.querySelector('[data-action="modal-ok"]');
    if (okBtn) okBtn.focus();
  }

  function closeModal() {
    ui.modal = null;
    $modal.innerHTML = '';
    $modal.hidden = true;
  }

  let toastTimer = null;
  function toast(msg) {
    $toast.textContent = msg;
    $toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => $toast.classList.remove('show'), Math.max(2600, msg.length * 90));
  }

  /* ================= 操作 ================= */

  function onClick(e) {
    if (e.target.closest && e.target.closest('a[data-cal]')) markCalendar();
    const el = e.target.closest('[data-action]');
    if (!el) return;
    const a = el.dataset.action;
    if (el.disabled) return;
    switch (a) {
      case 'speak':
        e.stopPropagation();
        playFrom(el);
        return;
      case 'enter':
        go('home', true);
        return;
      case 'goto':
        go(el.dataset.to || 'home');
        return;
      case 'goto-notify':
        go('options');
        setTimeout(() => {
          const sec = document.getElementById('notify');
          if (sec) sec.scrollIntoView({ block: 'start' });
        }, 0);
        return;
      case 'start-kind':
        startKind(el.dataset.kind);
        return;
      case 'practice-misses': {
        const roundId = ui.missRound !== 'all' ? ui.missRound : undefined;
        startPractice(Q.openKeys(store.state.tests, roundId).filter(liveKey), Q.missTypes(store.state.tests));
        return;
      }
      case 'choice-say': {
        const fb = ui.testFeedback;
        const it = fb ? choiceItem(fb.question, Number(el.dataset.i)) : null;
        if (it) sayWord(it);
        return;
      }
      case 'add-calendar':
        addCalendar();
        return;
      case 'copy-link': {
        const input = document.getElementById('app-link');
        const text = input ? input.value : appLink();
        const done = () => toast('リンクをコピーしました。Safari のアドレス欄に貼り付けて開いてください。');
        const fail = () => {
          if (input) { input.focus(); input.select(); }
          toast('自動でコピーできませんでした。リンクを長押しして「すべてを選択」→「コピー」してください。');
        };
        try {
          if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, fail);
          else fail();
        } catch (err) {
          fail();
        }
        return;
      }
      case 'hide-install':
        store.set('meta', Object.assign({}, store.state.meta, { installHidden: true }));
        render(false);
        return;
      case 'flip':
        flip();
        return;
      case 'rate':
        rate(el.dataset.r);
        return;
      case 'hint':
        ui.hint = true;
        render(false);
        return;
      case 'set-mode':
        setSettings({ studyMode: el.dataset.v === 'rev' ? 'rev' : 'fwd' });
        render(false);
        return;
      case 'set-accent':
        setSettings({ accent: el.dataset.v === 'uk' ? 'uk' : 'us' });
        if (!store.state.settings.voiceURI) speech.refresh(false);
        render(false);
        return;
      case 'start':
        startSet(el.dataset.mode || 'fwd', el.dataset.scope || 'all');
        return;
      case 'resume':
        ui.autoplayNext = true;
        go('study');
        return;
      case 'quit':
        speech.stop();
        toast('ここまでの回答は保存しました。ホームから続きを再開できます。');
        go('home');
        return;
      case 'home':
        goBack('home');
        return;
      case 'start-test':
        startTest(el.dataset.round);
        return;
      case 'resume-test':
        resetTestUi();
        go('test');
        return;
      case 'review-test':
        startPractice(Q.openKeys(store.state.tests).filter(liveKey), Q.missTypes(store.state.tests));
        return;
      case 'quit-test':
        resetTestUi();
        speech.stop();
        toast('ここまでの回答は保存しました。続きから再開できます。');
        go('home');
        return;
      case 'choose':
        chooseAnswer(Number(el.dataset.i));
        return;
      case 'test-skip':
        answerTest(null);
        return;
      case 'test-next':
        nextQuestion();
        return;
      case 'test-part-go':
        ui.testIntro = el.dataset.id;
        render(true);
        return;
      case 'tile-pick':
        if (!ui.order.includes(Number(el.dataset.i))) ui.order = ui.order.concat(Number(el.dataset.i));
        render(false);
        return;
      case 'tile-unpick':
        ui.order = ui.order.filter((_, k) => k !== Number(el.dataset.k));
        render(false);
        return;
      case 'order-clear':
        ui.order = [];
        render(false);
        return;
      case 'order-check':
        answerTest(ui.order.slice());
        return;
      case 'miss-status':
        ui.missStatus = el.dataset.v;
        render(false);
        return;
      case 'goto-misses':
        ui.missRound = el.dataset.round || 'all';
        ui.missStatus = 'open';
        go('misses');
        return;
      case 'goto-words':
        ui.roundFilter = el.dataset.round || 'all';
        ui.filter = 'all';
        go('words');
        return;
      case 'reset-tests':
        openModal({
          title: 'テストの記録をリセットしますか？',
          body: 'すべての回のテストの点数・受験回数と、覚えていないリストが消えます。カードの学習記録と単語は残ります。',
          ok: 'リセットする',
          danger: true,
          onOk: () => {
            store.set('tests', ST.emptyTests());
            resetTestUi();
            toast('テストの記録をリセットしました。');
            render(false);
          },
        });
        return;
      case 'new-word':
        go('new-word');
        return;
      case 'back':
        speech.stop();
        goBack(el.dataset.fallback || 'home');
        return;
      case 'delete-word':
        deleteWord(el.dataset.id);
        return;
      case 'add-sense':
        ui.editDraft.senses.push(Object.assign(emptySense(), { group: (ui.editDraft.senses[ui.editDraft.senses.length - 1] || {}).group || 'A' }));
        render(false);
        return;
      case 'remove-sense':
        ui.editDraft.senses.splice(Number(el.dataset.i), 1);
        render(false);
        return;
      case 'add-example':
        ui.editDraft.senses[Number(el.dataset.i)].examples.push({ en: '', ja: '' });
        render(false);
        return;
      case 'remove-example':
        ui.editDraft.senses[Number(el.dataset.i)].examples.splice(Number(el.dataset.j), 1);
        render(false);
        return;
      case 'add-contrast':
        ui.editDraft.senses[Number(el.dataset.i)].contrasts.push({ word: '', text: '' });
        render(false);
        return;
      case 'remove-contrast':
        ui.editDraft.senses[Number(el.dataset.i)].contrasts.splice(Number(el.dataset.j), 1);
        render(false);
        return;
      case 'save-word':
        saveWord();
        return;
      case 'export-file':
        exportFile();
        return;
      case 'export-copy':
        exportCopy();
        return;
      case 'import-check': {
        const ta = document.getElementById('import-text');
        importCheck(ta ? ta.value : ui.importText);
        return;
      }
      case 'import-merge':
        importApply('merge');
        return;
      case 'import-replace':
        importApply('replace');
        return;
      case 'import-cancel':
        ui.importPreview = null;
        render(false);
        return;
      case 'reset-progress':
        openModal({
          title: '学習記録をリセットしますか？',
          body: '復習予定・評価の履歴・ポイント・連続日数がすべて消えます。単語データは残ります。',
          ok: 'リセットする',
          danger: true,
          onOk: () => {
            store.set('progress', {});
            store.set('log', SS.emptyLog());
            store.set('session', null);
            store.set('meta', Object.assign({}, store.state.meta, { startDay: util.dayKey(Sched.studyDay(Date.now())), checkAt: 0 }));
            toast('学習記録をリセットしました。');
            render(false);
          },
        });
        return;
      case 'reset-words':
        openModal({
          title: '単語を初期状態に戻しますか？',
          body: '追加・編集した単語は消え、最初から入っている ' + C.seed.words.length + '語と回に戻ります。学習記録とテストの記録は残ります。',
          ok: '初期状態に戻す',
          danger: true,
          onOk: () => {
            setWords(C.seed.words.map((w) => ST.normalizeWord(w).word));
            store.set('rounds', ST.normalizeRounds(C.seed.rounds || []));
            store.set('meta', Object.assign({}, store.state.meta, { deletedSeed: [] }));
            store.set('session', null);
            toast('単語を初期状態に戻しました。');
            render(false);
          },
        });
        return;
      case 'modal-ok': {
        const m = ui.modal;
        closeModal();
        if (m && m.onOk) m.onOk();
        return;
      }
      case 'modal-cancel':
        closeModal();
        return;
      default:
    }
  }

  function onInput(e) {
    const t = e.target;
    if (t.id === 'word-search') {
      ui.query = t.value;
      const list = document.getElementById('word-list');
      if (list) list.innerHTML = wordListItems();
      return;
    }
    if (t.dataset && t.dataset.field && ui.editDraft && t.type !== 'checkbox' && t.tagName !== 'SELECT') {
      if (t.dataset.field === '_sources') ui.editSourcesText = t.value;
      else setPath(ui.editDraft, t.dataset.field, t.value);
      return;
    }
    if (t.id === 'import-text') {
      ui.importText = t.value;
      return;
    }
    if (t.id === 'slow-gap') {
      const v = Number(t.value);
      setSettings({ slowGap: v });
      const lbl = document.getElementById('slow-gap-val');
      if (lbl) lbl.textContent = (v / 1000).toFixed(1);
      return;
    }
    if (t.id === 'rate' || t.id === 'slow-rate') {
      const v = Number(t.value);
      setSettings({ [t.id === 'rate' ? 'rate' : 'slowRate']: v });
      const lbl = document.getElementById(t.id + '-val');
      if (lbl) lbl.textContent = v.toFixed(2);
    }
  }

  function onChange(e) {
    const t = e.target;
    if (t.dataset && t.dataset.field && ui.editDraft) {
      if (t.type === 'checkbox') setPath(ui.editDraft, t.dataset.field, t.checked ? t.value : '');
      else if (t.tagName === 'SELECT') setPath(ui.editDraft, t.dataset.field, t.value);
      return;
    }
    switch (t.id) {
      case 'voice-select':
        setSettings({ voiceURI: t.value });
        speech.selectVoice(t.value);
        toast('英語の声を変更しました。');
        return;
      case 'slow-by-word':
        setSettings({ slowWordByWord: t.checked });
        return;
      case 'f-round':
        ui.editRound = t.value;
        return;
      case 'autoplay':
        setSettings({ autoplay: t.checked });
        return;
      case 'daily-goal':
        setSettings({ dailyGoal: Number(t.value) });
        toast('今日の目標を ' + t.value + '枚にしました。');
        return;
      case 'test-time':
        setSettings({ testTime: Sched.normalizeTime(t.value) });
        scheduleAlert();
        render(false);
        toast('テストの時間を ' + testTime() + ' にしました。カレンダーの予定も入れ直してください。');
        return;
      case 'round-filter':
        ui.roundFilter = t.value;
        render(false);
        return;
      case 'status-filter':
        ui.filter = t.value;
        render(false);
        return;
      case 'miss-round':
        ui.missRound = t.value;
        render(false);
        return;
      case 'include-progress':
        ui.includeProgress = t.checked;
        ui.exportText = '';
        render(false);
        return;
      case 'import-file': {
        const f = t.files && t.files[0];
        if (!f) return;
        const reader = new FileReader();
        reader.onload = () => importCheck(String(reader.result || ''));
        reader.onerror = () => toast('ファイルを読み込めませんでした。');
        reader.readAsText(f, 'utf-8');
        return;
      }
      default:
    }
  }

  /** たたんだ部分の開閉を覚えておく（描き直しても閉じないように） */
  function onToggle(e) {
    if (e.target && e.target.id === 'device-voice') ui.deviceOpen = e.target.open;
  }

  function onKey(e) {
    if (ui.modal) {
      if (e.key === 'Escape') closeModal();
      return;
    }
    if (ui.route === 'title' && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      go('home', true);
      return;
    }
    if (ui.route === 'test') {
      if (e.target.closest && e.target.closest('input, textarea, select')) return;
      if (ui.testFeedback && e.key === 'Enter') {
        e.preventDefault();
        nextQuestion();
      } else if (!ui.testFeedback && ['1', '2', '3', '4'].includes(e.key)) {
        const q = Q.current(store.state.tests.current);
        if (q && q.part === 'understand') chooseAnswer(Number(e.key) - 1);
      }
      return;
    }
    if (ui.route !== 'study') return;
    if (e.target.closest && e.target.closest('input, textarea, select, button, a, summary')) return;
    const s = store.state.session;
    if (!s || s.finished) return;
    if (!s.flipped && (e.key === ' ' || e.key === 'Enter')) {
      e.preventDefault();
      flip();
    } else if (s.flipped && ['1', '2', '3'].includes(e.key)) {
      e.preventDefault();
      rate(['again', 'hard', 'good'][Number(e.key) - 1]);
    }
  }

  /* ================= テストの時間のお知らせ ================= */

  /** 次のテストの時刻に、画面でお知らせする（アプリを開いているあいだ） */
  function scheduleAlert() {
    clearTimeout(ui.alertTimer);
    const now = Date.now();
    const w = Sched.windowAt(now, testTime());
    const next = now < w.start ? w.start : Sched.timeOn(util.addDays(w.day, 1), testTime());
    const ms = next - now;
    if (!(ms > 0) || ms > 0x7fffffff) return;
    ui.alertTimer = setTimeout(() => {
      testTimeAlert();
      scheduleAlert();
    }, ms + 1000);
  }

  function testTimeAlert() {
    const t = testInfo(Date.now());
    if (!t.win.open) return;
    const what = [];
    if (t.due.length) what.push('再テスト ' + t.due.length + '問（必須）');
    if (t.daily.length) what.push('今日のテスト');
    if (t.summary.ready) what.push('まとめテスト');
    if (t.monthly.ready) what.push('月のまとめテスト');
    toast(testTime() + '、テストの時間です。' + (what.length ? what.join('・') + 'を受けましょう。' : ''));
    if (['home', 'title', 'round', 'check', 'misses'].includes(ui.route)) render(false);
  }

  /** 「あと 2時間5分」を進める */
  function tick() {
    const now = Date.now();
    $app.querySelectorAll('[data-until]').forEach((el) => {
      el.textContent = Sched.untilText(Number(el.dataset.until) - now);
    });
  }

  /** アプリに戻ってきたら、日付やテストの時間が変わっているかもしれないので描き直す */
  function onVisible() {
    if (document.visibilityState !== 'visible' || !store) return;
    scheduleAlert();
    if (['home', 'title', 'round', 'check', 'misses'].includes(ui.route) && !ui.modal) render(false);
  }

  /* ================= オフライン用（対応ブラウザのみ） ================= */

  function registerSW() {
    if (!('serviceWorker' in navigator) || location.protocol !== 'https:' && location.hostname !== 'localhost') return;
    if (window.CIF_NO_SW) return;
    try {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    } catch (e) { /* noop */ }
  }

  boot().then(registerSW).catch((e) => {
    $app.innerHTML = '<main class="screen"><div class="banner warn">アプリを起動できませんでした：' + esc(e && e.message) + '</div></main>';
  });
})();
