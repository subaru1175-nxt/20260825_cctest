/*
 * app.js — 画面の表示と操作
 * 画面: ホーム / カード学習 / 学習結果 / 単語一覧 / 単語詳細 / 単語の編集 / 設定
 * URL の # で画面を切り替える（#home, #study, #result, #words, #word-<id>, #edit-<id>, #new-word, #options）
 */
(function () {
  'use strict';

  const C = window.CIF;
  const util = C.util;
  const srs = C.srs;
  const SS = C.session;
  const ST = C.storage;
  const DG = C.diagrams;
  const esc = util.esc;

  const $app = document.getElementById('app');
  const $modal = document.getElementById('modal');
  const $toast = document.getElementById('toast');

  let store = null;
  let speech = null;
  let aidSeq = 0;
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
  };

  /* ================= アイコン ================= */

  const ICON = {
    speaker: '<path d="M4 9.5v5h3.5L12 18.5v-13L7.5 9.5H4z"/><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11"/>',
    slow: '<path d="M4 9.5v5h3.5L12 18.5v-13L7.5 9.5H4z"/><path d="M15.5 10.5a2 2 0 0 1 0 3"/>',
    mute: '<path d="M4 9.5v5h3.5L12 18.5v-13L7.5 9.5H4z"/><path d="M16 9.5l5 5M21 9.5l-5 5"/>',
    flame: '<path d="M12 3c.6 3.2 4.5 5 4.5 9.6A4.5 4.5 0 0 1 12 17a4.5 4.5 0 0 1-4.5-4.4c0-2 .9-3.3 1.9-4.2.1 1.6.9 2.6 2 2.9C11 9 11 5.6 12 3z"/><path d="M9.5 20.5h5"/>',
    star: '<path d="M12 3.8l2.5 5.1 5.6.8-4 3.9.9 5.6-5-2.6-5 2.6.9-5.6-4-3.9 5.6-.8z"/>',
    target: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4"/><circle cx="12" cy="12" r="0.8"/>',
    home: '<path d="M4 11l8-6.5 8 6.5"/><path d="M6 9.5V20h12V9.5"/><path d="M10 20v-5h4v5"/>',
    cards: '<rect x="3.5" y="6" width="13" height="14" rx="2"/><path d="M7.5 6V4.5a1 1 0 0 1 1-1H19a1.5 1.5 0 0 1 1.5 1.5v11.5a1 1 0 0 1-1 1H16.5"/><path d="M6.5 11h7M6.5 14.5h5"/>',
    sliders: '<path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>',
    close: '<path d="M6 6l12 12M18 6L6 18"/>',
    back: '<path d="M15 5l-7 7 7 7"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    edit: '<path d="M4 20h4L19 9l-4-4L4 16v4z"/><path d="M13.5 6.5l4 4"/>',
    trash: '<path d="M5 7h14M10 7V4.5h4V7M7 7l1 13h8l1-13"/>',
    link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
  };

  function icon(name, cls) {
    return '<svg class="ic ' + (cls || '') + '" viewBox="0 0 24 24" aria-hidden="true" focusable="false">' + ICON[name] + '</svg>';
  }

  const RATING_MARK = { good: '○', hard: '△', again: '✕' };

  /* ================= 起動 ================= */

  async function boot() {
    $app.innerHTML = '<div class="screen loading"><p>読み込み中…</p></div>';
    const backend = await ST.pickBackend();
    store = ST.createStore(backend);
    await store.init(C.seed);
    rebuildIndex();
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
    document.addEventListener('submit', (e) => e.preventDefault());
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

  /* ================= 画面の切り替え ================= */

  function parseHash() {
    let h = '';
    try { h = decodeURIComponent((location.hash || '').replace(/^#/, '')); } catch (e) { h = ''; }
    if (!h || h === 'home') return { route: 'home', param: '' };
    if (['study', 'result', 'words', 'options', 'new-word'].includes(h)) return { route: h, param: '' };
    if (h.indexOf('word-') === 0) return { route: 'word', param: h.slice(5) };
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
    }
    ui.route = r.route;
    ui.param = r.param;
    if (changed) {
      ui.hint = false;
      if (r.route === 'edit' || r.route === 'new-word') prepareEditor();
      if (r.route !== 'options') ui.importPreview = null;
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
      case 'study': html = viewStudy(); break;
      case 'result': html = viewResult(); break;
      case 'words': html = viewWords(); break;
      case 'word': html = viewWord(); break;
      case 'edit':
      case 'new-word': html = viewEdit(); break;
      case 'options': html = viewOptions(); break;
      default: html = viewHome();
    }
    if (html == null) return;
    const withNav = ['home', 'words', 'word', 'options'].includes(ui.route);
    $app.innerHTML = saveBanner() + html + (withNav ? navBar() : '');
    document.body.dataset.route = ui.route;
    if (resetScroll) window.scrollTo(0, 0);
    afterRender();
  }

  function afterRender() {
    if (ui.route === 'study' && ui.autoplayNext) {
      ui.autoplayNext = false;
      const s = store.state.session;
      if (store.state.settings.autoplay && s && !s.flipped && s.mode === 'fwd') {
        const btn = $app.querySelector('.card-front [data-action="speak"]:not([disabled])');
        if (btn) playFrom(btn);
      }
    }
    if (ui.route === 'result') {
      const h = document.getElementById('result-title');
      if (h) h.focus({ preventScroll: true });
    }
  }

  function navBar() {
    const item = (route, hash, ic, label) => {
      const cur = ui.route === route || (route === 'words' && ui.route === 'word');
      return '<a class="nav-item' + (cur ? ' is-current' : '') + '" href="#' + hash + '"' + (cur ? ' aria-current="page"' : '') + '>' +
        icon(ic) + '<span>' + label + '</span></a>';
    };
    return '<nav class="bottom-nav" aria-label="メニュー">' +
      item('home', 'home', 'home', 'ホーム') + item('words', 'words', 'cards', '単語') + item('options', 'options', 'sliders', '設定') +
      '</nav>';
  }

  function saveBanner() {
    const st = store && store.status;
    if (!st) return '';
    let msg = '';
    if (st.error) msg = st.error;
    else if (!st.persistent) msg = 'このブラウザでは学習記録を保存できません。ページを閉じると記録が消えます。設定の「書き出し」で保存してください。';
    if (!msg) return '<div id="save-banner" hidden></div>';
    return '<div id="save-banner" class="banner warn" role="alert">' + esc(msg) + '</div>';
  }

  /* ================= 共通の部品 ================= */

  function posLabel(pos) {
    return ST.POS[pos] || 'その他';
  }

  function roleLine(sense) {
    const pos = posLabel(sense.pos);
    if (!sense.role) return '<p class="role-line"><span class="chip pos">' + esc(pos) + '</span></p>';
    return '<p class="role-line"><span class="role-chip">' + esc(ST.ROLE[sense.role]) + '</span>を表す言葉<span class="role-pos">（' + esc(pos) + '）</span></p>';
  }

  function ipaOf(sense) {
    const accent = store.state.settings.accent;
    const ipa = sense.ipa || {};
    return (accent === 'uk' ? ipa.uk || ipa.us : ipa.us || ipa.uk) || '';
  }

  function speakTextOf(item) {
    return item.sense.speak || item.word.headword;
  }

  /** 音声ボタン。録音があれば「録音」、なければ合成音声（使えない時は無効＋理由） */
  function audioBtn(opts) {
    const aid = 'a' + (++aidSeq);
    const src = opts.src || '';
    const slow = !!opts.slow;
    const label = opts.label || (slow ? 'ゆっくり' : '再生');
    const synthOk = speech && speech.canSynth();
    const enabled = !!src || synthOk;
    const tag = src ? '録音' : synthOk ? '合成' : speech && speech.status === 'loading' ? '準備中' : '音声なし';
    const aria = (opts.aria || '英語を再生') + (slow ? '（ゆっくり）' : '') + '：' + (src ? '録音音声' : '合成音声');
    return '<button type="button" class="audio-btn' + (opts.small ? ' sm' : '') + (slow ? ' slow' : '') + (enabled ? '' : ' is-off') + '"' +
      ' data-action="speak" data-aid="' + aid + '" data-text="' + esc(opts.text) + '"' +
      (src ? ' data-src="' + esc(src) + '"' : '') + ' data-slow="' + (slow ? '1' : '0') + '"' +
      ' aria-label="' + esc(aria) + '"' + (enabled ? '' : ' disabled') + '>' +
      icon(enabled ? (slow ? 'slow' : 'speaker') : 'mute') +
      '<span class="ab-label">' + label + '</span><span class="src-tag">' + tag + '</span></button>';
  }

  function audioPair(text, src, aria, small) {
    return audioBtn({ text, src, aria, small }) + audioBtn({ text, src, aria, small, slow: true });
  }

  function speechBanner(hasRecorded) {
    if (!speech || speech.status === 'ready' || hasRecorded) return '<div data-speech-banner hidden></div>';
    const loading = speech.status === 'loading';
    return '<div data-speech-banner class="banner ' + (loading ? 'info' : 'warn') + '" role="status">' +
      esc(speech.message()) + (loading ? '' : ' <a href="#options">音声の設定を見る</a>') + '</div>';
  }

  function refreshAudioUI() {
    $app.querySelectorAll('.audio-btn').forEach((btn) => {
      if (btn.dataset.src) return;
      const ok = speech.canSynth();
      btn.disabled = !ok;
      btn.classList.toggle('is-off', !ok);
      const tag = btn.querySelector('.src-tag');
      if (tag) tag.textContent = ok ? '合成' : speech.status === 'loading' ? '準備中' : '音声なし';
      const ic = btn.querySelector('.ic');
      if (ic) ic.outerHTML = icon(ok ? (btn.dataset.slow === '1' ? 'slow' : 'speaker') : 'mute');
    });
    $app.querySelectorAll('[data-speech-banner]').forEach((el) => {
      el.outerHTML = speechBanner(false);
    });
    const vs = document.getElementById('voice-section');
    if (vs) vs.outerHTML = voiceSection();
  }

  function playFrom(btn) {
    const aid = btn.dataset.aid;
    const src = btn.dataset.src || '';
    const slow = btn.dataset.slow === '1';
    const text = btn.dataset.text || '';
    const onState = (state, detail) => {
      $app.querySelectorAll('.audio-btn.playing').forEach((b) => b.classList.remove('playing'));
      const b = $app.querySelector('[data-aid="' + aid + '"]');
      if (state === 'playing' && b) b.classList.add('playing');
      if (state === 'error') toast(audioError(detail, !!src));
    };
    const ok = src ? speech.play(src, { slow, onState }) : speech.speak(text, { slow, onState });
    if (!ok) toast(speech.message() || '音声を再生できません。');
  }

  function audioError(code, recorded) {
    if (recorded) return '録音音声を再生できませんでした。ファイルの場所（URL）を確認してください。';
    if (code === 'no-start') return '音声が再生されませんでした。音量やマナーモード、設定の「英語の声」を確認してください。';
    if (code === 'not-allowed') return 'ブラウザが音声を止めました。もう一度ボタンを押してください。';
    if (code === 'voice-unavailable' || code === 'language-unavailable') return '選んだ英語の声が使えません。設定で別の声を選んでください。';
    return '音声の再生に失敗しました。もう一度試すか、設定で別の声を選んでください。';
  }

  function sceneArt(sense, big) {
    const d = sense.scene && sense.scene.diagram;
    if (d && DG.has(d)) return '<div class="scene-art has-dg">' + DG.get(d) + '</div>';
    const emoji = sense.scene && sense.scene.emoji;
    if (emoji) return '<div class="scene-art emoji' + (big ? ' big' : '') + '" aria-hidden="true">' + esc(emoji) + '</div>';
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

  function exampleHtml(item, ex, i, opts) {
    const src = (item.sense.audio && item.sense.audio.examples && item.sense.audio.examples[i]) || '';
    return '<div class="ex">' +
      '<p class="ex-en" lang="en">' + util.markedHtml(ex.en) + '</p>' +
      (ex.ja ? '<p class="ex-ja">' + esc(ex.ja) + '</p>' : '') +
      '<div class="audio-row">' + audioPair(util.plainSentence(ex.en), src, '例文を再生', true) + '</div>' +
      '</div>';
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

  /* ================= ホーム ================= */

  function viewHome() {
    const st = store.state;
    const now = Date.now();
    const c = SS.counts(st.words, st.progress, now);
    const streak = SS.streak(st.log, now);
    const today = SS.today(st.log, now);
    const goal = st.settings.dailyGoal;
    const pct = Math.min(100, Math.round((today.cards / goal) * 100));
    const sess = st.session && !st.session.finished ? st.session : null;
    const recent = SS.recentDays(st.log, now, 7);
    const wk = ['日', '月', '火', '水', '木', '金', '土'];
    const fwdSize = Math.min(SS.SET_SIZE, c.total);
    const revSize = Math.min(SS.SET_SIZE, c.availableRev);
    const lv = c.levels;
    const lvTotal = Math.max(1, lv.new + lv.learning + lv.reviewing + lv.settled);
    const seg = (k) => (lv[k] ? '<span class="lv-seg lv-' + k + '" style="flex:' + lv[k] + '"></span>' : '');

    let html = '<main class="screen home" id="main">';
    html += '<header class="home-head"><h1 class="app-title" tabindex="-1">コアイメージ単語帳</h1>' +
      '<p class="tagline">英語の音 → 場面と感覚 → 使い方</p></header>';

    html += '<section class="stats" aria-label="今日の記録">' +
      '<div class="stat"><span class="stat-ic flame">' + icon('flame') + '</span><span class="stat-num">' + streak.days + '<small>日</small></span><span class="stat-label">連続学習' + (streak.days && !streak.todayDone ? '（今日まだ）' : '') + '</span></div>' +
      '<div class="stat"><span class="stat-ic star">' + icon('star') + '</span><span class="stat-num">' + st.log.totalPoints + '<small>pt</small></span><span class="stat-label">獲得ポイント（今日 +' + today.points + '）</span></div>' +
      '<div class="stat goal"><span class="stat-ic target">' + icon('target') + '</span><span class="stat-num">' + today.cards + '<small> / ' + goal + '枚</small></span><span class="stat-label">今日の目標' + (today.cards >= goal ? ' 達成！' : '') + '</span>' +
      '<span class="meter" role="progressbar" aria-label="今日の目標の進み具合" aria-valuemin="0" aria-valuemax="' + goal + '" aria-valuenow="' + Math.min(goal, today.cards) + '"><span style="width:' + pct + '%"></span></span></div>' +
      '</section>';

    if (sess) {
      const m = SS.MODES[sess.mode];
      html += '<section class="resume">' +
        '<div><p class="resume-title">途中のセットがあります</p><p class="resume-sub">' + esc(m.label) + '・残り ' + SS.remaining(sess) + '枚</p></div>' +
        '<button type="button" class="btn primary" data-action="resume">続きから再開</button></section>';
    }

    html += '<section class="mode-card main-mode">' +
      '<div class="mode-head"><h2>英語 → 場面</h2><span class="mode-sub">' + esc(SS.MODES.fwd.long) + '</span></div>' +
      '<p class="mode-counts"><span><b>' + c.dueFwd + '</b>枚 復習</span><span><b>' + c.newFwd + '</b>枚 新しい</span></p>' +
      (c.total
        ? '<button type="button" class="btn primary big" data-action="start" data-mode="fwd">' + fwdSize + '枚はじめる</button>'
        : '<p class="muted">出題できるカードがありません。単語を追加してください。</p>') +
      '</section>';

    html += '<section class="mode-card">' +
      '<div class="mode-head"><h2>場面 → 英語</h2><span class="mode-sub">' + esc(SS.MODES.rev.long) + '</span></div>' +
      (c.availableRev
        ? '<p class="mode-counts"><span><b>' + c.dueRev + '</b>枚 復習</span><span><b>' + c.newRev + '</b>枚 はじめて</span></p>' +
          '<button type="button" class="btn secondary big" data-action="start" data-mode="rev">' + revSize + '枚はじめる</button>'
        : '<p class="muted">「英語 → 場面」で一度学習したカードが、ここで練習できるようになります。</p>') +
      '</section>';

    html += '<section class="panel schedule"><h2 class="panel-title">これからの復習</h2>' +
      '<ul class="sched-list"><li><span>いま復習できる</span><b>' + (c.dueFwd + c.dueRev) + '枚</b></li>' +
      '<li><span>明日の予定</span><b>' + c.tomorrow + '枚</b></li>' +
      '<li><span>7日以内の予定</span><b>' + c.week + '枚</b></li></ul>' +
      '<div class="week" aria-label="直近7日の学習枚数">' + recent.map((d) => {
        const dt = new Date(d.ts);
        const isToday = d.key === util.dayKey(now);
        return '<div class="day' + (d.cards ? ' done' : '') + (isToday ? ' today' : '') + '"><span class="dot">' + (d.cards || '') + '</span><span class="wd">' + (isToday ? '今日' : wk[dt.getDay()]) + '</span></div>';
      }).join('') + '</div>' +
      '<h3 class="mini-title">覚え具合（英語 → 場面）</h3>' +
      '<div class="lv-bar" aria-hidden="true">' + seg('settled') + seg('reviewing') + seg('learning') + seg('new') + '</div>' +
      '<ul class="lv-legend">' +
      ['settled', 'reviewing', 'learning', 'new'].map((k) => '<li><span class="lv-dot lv-' + k + '"></span>' + srs.LEVELS[k].label + ' ' + lv[k] + '</li>').join('') +
      '</ul><p class="fine">「定着してきた」は、間隔をあけて3回続けて思い出せたカードです。その後も復習は続きます。（全' + lvTotal + '枚）</p>' +
      '</section>';

    html += '<details class="panel about"><summary>コアイメージについて</summary>' +
      '<p>コアイメージは、単語の意味や使い方をつかみやすくするための「見方」です。すべてのネイティブスピーカーが同じ映像を思い浮かべているわけではありません。</p>' +
      '<p>well の「上手に」と「井戸」のように、つづりが同じでも別の語源の単語は、無理に一つのイメージにまとめず、別々に覚えます。</p>' +
      '<p>評価のしかた：○ 思い出せた → 間隔を広げて復習／△ あいまい → 間隔を短く／✕ 思い出せなかった → このセットですぐもう一度。</p>' +
      '</details>';

    html += '</main>';
    return html;
  }

  /* ================= カード学習 ================= */

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
    const ratio = SS.progressRatio(s);
    const rem = SS.remaining(s);
    const res = s.results[sid];
    const repeat = !!(res && res.first);
    const hasRecorded = !!(item.sense.audio && item.sense.audio.word);

    let html = '<main class="screen study" id="main">';
    html += '<header class="study-bar">' +
      '<button type="button" class="icon-btn" data-action="quit" aria-label="中断してホームへ（続きは保存されます）">' + icon('close') + '</button>' +
      '<div class="progress" role="progressbar" aria-label="セットの進み具合" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + Math.round(ratio * 100) + '"><span style="width:' + Math.round(ratio * 100) + '%"></span></div>' +
      '<p class="remain">残り <b>' + rem + '</b>枚</p></header>';
    html += speechBanner(hasRecorded);

    const top = '<div class="card-top"><span class="chip mode">' + esc(SS.MODES[s.mode].label) + '</span>' +
      (repeat ? '<span class="chip again-chip">もう一度</span>' : '') +
      (item.total > 1 ? '<span class="chip ghost">用法 ' + item.n + ' / ' + item.total + '</span>' : '') + '</div>';

    if (!s.flipped) {
      html += s.mode === 'rev' ? frontRev(item, top) : frontFwd(item, top);
      html += '<div class="answer-bar"><button type="button" class="btn primary block big" data-action="flip">裏を見る</button></div>';
    } else {
      html += backCard(item, top, s.mode);
      html += rateBar(s, sid);
    }
    html += '</main>';
    return html;
  }

  function frontFwd(item, top) {
    const w = item.word;
    const sense = item.sense;
    const speakText = speakTextOf(item);
    const ipa = ipaOf(sense);
    const src = sense.audio && sense.audio.word;
    return '<article class="card card-front" data-action="flip" role="button" tabindex="0" aria-label="カードをめくって裏面を見る">' +
      top +
      '<div class="front-body">' +
      '<h2 class="headword" lang="en">' + esc(w.headword) + '</h2>' +
      (ipa ? '<p class="ipa" lang="en">' + esc(ipa) + '</p>' : '') +
      '<div class="audio-row center">' + audioPair(speakText, src, '単語を再生') + '</div>' +
      (sense.speak && sense.speak.toLowerCase() !== w.headword.toLowerCase()
        ? '<p class="speak-note">読み上げ：<span lang="en">' + esc(sense.speak) + '</span>（この用法の発音）</p>' : '') +
      (sense.cue
        ? '<div class="cue-box"><p class="cue" lang="en">' + esc(sense.cue) + '</p>' + audioBtn({ text: sense.cue, aria: 'フレーズを再生', small: true, label: 'フレーズ' }) + '</div>'
        : '') +
      '</div>' +
      '<p class="tap-hint">意味や場面を思い浮かべたら、タップして裏面へ</p>' +
      '</article>';
  }

  function frontRev(item, top) {
    const sense = item.sense;
    const cz = clozeFor(item);
    return '<article class="card card-front rev" data-action="flip" role="button" tabindex="0" aria-label="カードをめくって答えを見る">' +
      top +
      '<div class="front-body">' +
      '<p class="rev-q">この場面・感覚に合う英単語は？</p>' +
      sceneArt(sense, true) +
      (sense.scene && sense.scene.text ? '<p class="scene-text">' + esc(sense.scene.text) + '</p>' : '') +
      (sense.nuance ? '<p class="nuance-text">' + esc(sense.nuance) + '</p>' : '') +
      roleLine(sense) +
      (cz ? '<div class="cloze">' + (cz.en ? '<p class="ex-en" lang="en">' + cz.en + '</p>' : '') + (cz.ja ? '<p class="ex-ja">' + esc(cz.ja) + '</p>' : '') + '</div>' : '') +
      '<div class="hint-row">' + (ui.hint
        ? '<p class="hint" lang="en">' + esc(hintText(item.word.headword)) + '</p>'
        : '<button type="button" class="btn ghost sm" data-action="hint">ヒント：最初の文字</button>') + '</div>' +
      '</div>' +
      '<p class="tap-hint">英単語を思い浮かべたら、タップして答えを見る</p>' +
      '</article>';
  }

  function backCard(item, top, mode) {
    const w = item.word;
    const sense = item.sense;
    const ipa = ipaOf(sense);
    const src = sense.audio && sense.audio.word;
    let html = '<article class="card card-back" aria-label="カードの裏面">' + top;
    html += '<div class="back-head"><div class="bh-word"><h2 class="headword sm" lang="en">' + esc(w.headword) + '</h2>' +
      (ipa ? '<p class="ipa" lang="en">' + esc(ipa) + '</p>' : '') + '</div>' +
      '<div class="audio-row">' + audioPair(speakTextOf(item), src, '単語を再生') + '</div></div>';
    if (mode === 'rev' && sense.cue) {
      html += '<div class="cue-box inline"><p class="cue" lang="en">' + esc(sense.cue) + '</p>' + audioBtn({ text: sense.cue, aria: 'フレーズを再生', small: true, label: 'フレーズ' }) + '</div>';
    }
    html += senseBody(item, { inCard: true });
    html += '</article>';
    return html;
  }

  /** 裏面と単語詳細で共通の中身（1. ニュアンス 2. 場面 3. 意味と役割 4. 例文 ＋ くわしく） */
  function senseBody(item, opts) {
    const sense = item.sense;
    let html = '';
    if (sense.nuance) {
      html += '<section class="sec nuance"><h3 class="sec-label">一言ニュアンス</h3><p class="nuance-text"><span>' + esc(sense.nuance) + '</span></p></section>';
    }
    if ((sense.scene && sense.scene.text) || sceneArt(sense)) {
      html += '<section class="sec scene"><h3 class="sec-label">頭に浮かべる場面</h3>' + sceneArt(sense) +
        (sense.scene.text ? '<p class="scene-text">' + esc(sense.scene.text) + '</p>' : '') + '</section>';
    }
    html += '<section class="sec meaning"><h3 class="sec-label">意味と、文の中での役割</h3>' +
      '<p class="meaning-text">' + esc(sense.meaning || '（意味が未入力です）') + '</p>' + roleLine(sense) + '</section>';
    if (sense.examples.length) {
      html += '<section class="sec examples"><h3 class="sec-label">例文</h3>' +
        sense.examples.map((ex, i) => exampleHtml(item, ex, i)).join('') + '</section>';
    }
    html += '<details class="more"><summary>くわしく見る<span>役割・似た単語との違い・発音</span></summary><div class="more-body">';
    if (sense.roleText) {
      html += '<section class="sub"><h4>文の中での役割</h4><p>' + esc(sense.roleText) + '</p></section>';
    }
    if (sense.contrasts.length) {
      html += '<section class="sub"><h4>似た単語との違い</h4><ul class="contrast">' +
        sense.contrasts.map((c) => '<li><b lang="en">' + esc(c.word) + '</b><span>' + esc(c.text) + '</span></li>').join('') + '</ul></section>';
    }
    html += '<section class="sub"><h4>発音</h4>' + pronHtml(item) + '</section>';
    if (sense.note) html += '<section class="sub"><h4>補足</h4><p>' + esc(sense.note) + '</p></section>';
    if (opts && opts.inCard) {
      const others = item.word.senses.filter((x) => x.id !== sense.id);
      html += '<section class="sub"><h4>同じ単語のほかの用法</h4>' +
        (others.length ? '<ul class="others">' + others.map((o) => '<li><span class="chip pos">' + esc(posLabel(o.pos)) + '</span>' + esc(o.meaning) + '</li>').join('') + '</ul>' : '<p class="muted">このアプリに登録されている用法は、これだけです。</p>') +
        '<p><a class="text-link" href="#word-' + esc(item.word.id) + '">' + esc(item.word.headword) + ' の詳細・出典を見る</a></p></section>';
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
    const recorded = sense.audio && sense.audio.word;
    html += '<p class="fine">音声：' + (recorded ? '録音音声' : speech && speech.canSynth() ? '合成音声（' + esc(speech.currentLabel()) + '）' : '合成音声（この端末では使えません）') +
      (sense.speak && sense.speak.toLowerCase() !== item.word.headword.toLowerCase() ? '。単語ボタンでは「<span lang="en">' + esc(sense.speak) + '</span>」と読み上げます' : '') + '</p>';
    return html;
  }

  function rateBar(s, sid) {
    const now = Date.now();
    const res = s.results[sid];
    const first = !res || !res.first;
    const st = SS.stateOf(store.state.progress, sid, s.mode);
    const next = (r) => {
      if (r === 'again') return first || res.repeats < SS.REQUEUE.again.max ? 'もう一度出題' : '次は10分後';
      if (!first) return 'このセット完了';
      if (r === 'hard') return srs.previewLabel(st, 'hard', now) + '・もう一度';
      return '次は' + srs.previewLabel(st, 'good', now);
    };
    const btn = (r) => '<button type="button" class="rate r-' + r + '" data-action="rate" data-r="' + r + '">' +
      '<span class="rate-mark" aria-hidden="true">' + RATING_MARK[r] + '</span>' +
      '<span class="rate-label">' + (r === 'again' ? '思い出せ<wbr>なかった' : srs.RATING_LABEL[r]) + '</span>' +
      '<span class="rate-next">' + next(r) + '</span></button>';
    return '<div class="answer-bar rate-bar"><p class="rate-q">思い出せましたか？</p><div class="rate-row">' +
      btn('again') + btn('hard') + btn('good') + '</div></div>';
  }

  function startSet(mode) {
    const st = store.state;
    const doStart = () => {
      const s = SS.build(st.words, st.progress, mode, Date.now());
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
    const la = SS.logAnswer(st.log, out.event, now, st.settings.dailyGoal);
    let log = la.log;
    const next = out.session;
    if (la.bonus) {
      next.goalReached = true;
      next.points += la.bonus;
    }
    if (next.finished) {
      const done = SS.logSetComplete(log, now);
      log = done.log;
      next.points += done.bonus;
      next.setBonus = done.bonus;
    }
    store.set('progress', out.progress);
    store.set('log', log);
    store.set('session', next);
    ui.hint = false;
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
    const today = SS.today(st.log, now);
    const goal = st.settings.dailyGoal;
    const streak = SS.streak(st.log, now);
    const pct = Math.min(100, Math.round((today.cards / goal) * 100));
    const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let html = '<main class="screen result" id="main">';
    html += '<div class="result-hero">' +
      (reduce ? '' : '<div class="burst" aria-hidden="true">' + Array.from({ length: 12 }, (_, i) => '<i style="--i:' + i + '"></i>').join('') + '</div>') +
      '<p class="stamp" aria-hidden="true">○</p>' +
      '<h1 id="result-title" tabindex="-1">セット完了！</h1>' +
      '<p class="earned">+' + s.points + ' <small>pt</small></p>' +
      (s.goalReached ? '<p class="goal-done">今日の目標を達成しました</p>' : '') +
      '</div>';
    html += '<section class="tally" aria-label="自己評価の内訳">' +
      '<div class="t-good"><span class="rate-mark">○</span><b>' + sum.good + '</b><span>思い出せた</span></div>' +
      '<div class="t-hard"><span class="rate-mark">△</span><b>' + sum.hard + '</b><span>あいまい</span></div>' +
      '<div class="t-again"><span class="rate-mark">✕</span><b>' + sum.again + '</b><span>思い出せなかった</span></div>' +
      '</section>';
    html += '<section class="panel result-meta">' +
      '<div class="rm-row"><span>今日の目標</span><b>' + today.cards + ' / ' + goal + '枚</b></div>' +
      '<span class="meter" role="progressbar" aria-label="今日の目標の進み具合" aria-valuemin="0" aria-valuemax="' + goal + '" aria-valuenow="' + Math.min(goal, today.cards) + '"><span style="width:' + pct + '%"></span></span>' +
      '<div class="rm-row"><span>連続学習</span><b>' + streak.days + '日</b></div>' +
      '<div class="rm-row"><span>獲得ポイント合計</span><b>' + st.log.totalPoints + ' pt</b></div>' +
      (sum.repeats ? '<p class="fine">セットの中で ' + sum.repeats + '回 もう一度練習しました。</p>' : '') +
      '</section>';
    html += '<section class="panel"><h2 class="panel-title">次の復習</h2><ul class="result-list">' +
      s.cards.map((sid) => {
        const it = index.senses.get(sid);
        if (!it) return '';
        const r = s.results[sid] || {};
        const state = SS.stateOf(st.progress, sid, s.mode);
        return '<li><span class="rate-mark m-' + (r.first || 'none') + '" aria-label="' + esc(r.first ? srs.RATING_LABEL[r.first] : '未回答') + '">' + (r.first ? RATING_MARK[r.first] : '－') + '</span>' +
          '<span class="rl-word"><b lang="en">' + esc(it.word.headword) + '</b><span>' + esc(it.sense.meaning) + '</span></span>' +
          '<span class="rl-next">' + (state ? esc(util.formatDue(state.due, now)) : '') + '</span></li>';
      }).join('') + '</ul>' +
      '<p class="fine">思い出せたカードも、間隔をあけてまた出題します。</p></section>';
    html += '<div class="result-actions">' +
      '<button type="button" class="btn primary big block" data-action="start" data-mode="' + s.mode + '">もう1セット</button>' +
      '<button type="button" class="btn ghost block" data-action="home">ホームへ</button></div>';
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
    return store.state.words.filter((w) => {
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
    if (!list.length) return '<li class="empty">当てはまる単語がありません。</li>';
    return list.map((w) => {
      const dots = w.senses.map((s) => {
        const lv = srs.level(SS.stateOf(store.state.progress, s.id, 'fwd'));
        return '<span class="lv-dot lv-' + (isStudyable(w, s) ? lv.key : 'off') + '" title="' + esc(lv.label) + '"></span>';
      }).join('');
      return '<li><a class="word-row" href="#word-' + esc(w.id) + '">' +
        '<span class="wr-main"><b class="wr-head" lang="en">' + esc(w.headword) + '</b>' + statusBadge(w.status) + '</span>' +
        '<span class="wr-meanings">' + esc(w.senses.map((s) => s.meaning).join(' ／ ') || '（意味なし）') + '</span>' +
        '<span class="wr-foot"><span class="wr-dots" aria-label="用法ごとの覚え具合">' + dots + '</span><span class="wr-count">' + w.senses.length + '用法</span></span>' +
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
    const chip = (key, label) => '<button type="button" class="filter' + (ui.filter === key ? ' is-on' : '') + '" data-action="filter" data-f="' + key + '" aria-pressed="' + (ui.filter === key) + '">' + label + ' <b>' + cnt[key] + '</b></button>';
    return '<main class="screen words" id="main">' +
      '<header class="page-head"><h1 tabindex="-1">単語一覧</h1><button type="button" class="btn primary sm" data-action="new-word">' + icon('plus') + '追加</button></header>' +
      '<label class="search"><span class="sr-only">検索</span><input type="search" id="word-search" placeholder="英単語・意味で検索" value="' + esc(ui.query) + '" autocomplete="off" autocapitalize="off" spellcheck="false"></label>' +
      '<div class="filters" role="group" aria-label="絞り込み">' + chip('all', 'すべて') + chip('due', '復習待ち') + chip('review', '要確認') + chip('unverified', '未確認') + '</div>' +
      (cnt.review ? '<p class="fine">「要確認」の単語・用法は通常の出題から外しています。内容を確かめて編集すると出題されます。</p>' : '') +
      '<ul class="word-list" id="word-list">' + wordListItems() + '</ul>' +
      '</main>';
  }

  /* ================= 単語詳細 ================= */

  function viewWord() {
    const w = index.words.get(ui.param);
    if (!w) {
      return '<main class="screen" id="main"><header class="page-head"><button type="button" class="icon-btn" data-action="back" data-fallback="words" aria-label="戻る">' + icon('back') + '</button><h1>単語が見つかりません</h1></header>' +
        '<p>削除されたか、まだ読み込まれていない単語です。</p><p><a class="text-link" href="#words">単語一覧へ</a></p></main>';
    }
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
    html += '<header class="page-head"><button type="button" class="icon-btn" data-action="back" data-fallback="words" aria-label="戻る">' + icon('back') + '</button>' +
      '<span class="ph-spacer"></span><a class="btn ghost sm" href="#edit-' + esc(w.id) + '">' + icon('edit') + '編集</a></header>';
    html += '<div class="detail-head"><h1 class="headword" lang="en" tabindex="-1">' + esc(w.headword) + '</h1>' + statusBadge(w.status) +
      (firstItem && w.senses.length === 1 ? '<div class="audio-row">' + audioPair(speakTextOf(firstItem), firstSense.audio && firstSense.audio.word, '単語を再生') + '</div>' : '') +
      '</div>';
    html += speechBanner(false);

    if (w.status === 'needs_review') {
      html += '<div class="banner warn"><b>要確認：通常の出題から外しています。</b>' +
        (w.reviewReasons.length ? '<ul>' + w.reviewReasons.map((r) => '<li>' + esc(r) + '</li>').join('') + '</ul>' : '') +
        w.senses.filter((s) => s.note).map((s) => '<p class="review-note">' + esc(s.note) + '</p>').join('') +
        '内容を辞書などで確かめてから、編集で確認状況を変えてください。</div>';
    }
    html += '<p class="sense-count">用法 ' + w.senses.length + 'つ' + (groups.length > 1 ? '・' + groups.length + 'つのグループ' : '') + '</p>';
    if (groups.length > 1) {
      html += '<p class="group-note">グループが違う用法は、つづりが同じでも別の単語として覚えます。無理に一つのイメージにまとめなくて大丈夫です。</p>';
    }

    groups.forEach((g) => {
      html += '<section class="group"><h2 class="group-title"><span class="g-key">' + esc(g.key) + '</span>' +
        (w.groups[g.key] ? '<span class="g-label">' + esc(w.groups[g.key]) + '</span>' : '') + '</h2>';
      g.senses.forEach((s) => {
        const item = index.senses.get(s.id);
        const fwd = SS.stateOf(st.progress, s.id, 'fwd');
        const rev = SS.stateOf(st.progress, s.id, 'rev');
        const off = !isStudyable(w, s);
        html += '<article class="sense-card' + (off ? ' is-off' : '') + '">' +
          '<div class="sense-top"><span class="chip pos">' + esc(posLabel(s.pos)) + '</span>' +
          (s.cue ? '<span class="cue sm" lang="en">' + esc(s.cue) + '</span>' : '') +
          (s.status === 'needs_review' ? '<span class="badge st-needs_review">要確認</span>' : '') + '</div>' +
          (w.senses.length > 1 ? '<div class="audio-row">' + audioPair(speakTextOf(item), s.audio && s.audio.word, '単語を再生', true) +
            (s.cue ? audioBtn({ text: s.cue, aria: 'フレーズを再生', small: true, label: 'フレーズ' }) : '') + '</div>' : '') +
          senseBody(item, {}) +
          '<div class="learn"><h4>学習の記録</h4>' +
          '<div class="learn-row"><span class="mini-label">英語 → 場面</span>' + levelChip(fwd) + '<span class="learn-next">' + (fwd && fwd.reps ? '次の復習：' + esc(util.formatDue(fwd.due, now)) : 'まだ学習していません') + '</span></div>' +
          '<div class="learn-row"><span class="mini-label">場面 → 英語</span>' + levelChip(rev) + '<span class="learn-next">' + (rev && rev.reps ? '次の復習：' + esc(util.formatDue(rev.due, now)) : fwd && fwd.reps ? 'これから出題できます' : '英語 → 場面のあとで出題') + '</span></div>' +
          historyHtml(fwd, rev) +
          '</div>' +
          '</article>';
      });
      html += '</section>';
    });

    html += '<section class="panel sources"><h2 class="panel-title">出典と確認状況</h2>' +
      '<p>' + statusBadge(w.status) + ' ' + esc((ST.STATUS[w.status] || ST.STATUS.unverified).desc) + '</p>' +
      (w.check.date ? '<p class="fine">確認日：' + esc(w.check.date) + '</p>' : '') +
      (w.check.method ? '<p class="fine">確認方法：' + esc(w.check.method) + '</p>' : '') +
      (w.check.note ? '<p class="fine">' + esc(w.check.note) + '</p>' : '') +
      (w.sources.length
        ? '<ul class="source-list">' + w.sources.map((s) => '<li>' + (s.url ? '<a href="' + esc(s.url) + '" target="_blank" rel="noopener noreferrer">' + icon('link') + esc(s.label || s.url) + '</a>' : esc(s.label)) + '</li>').join('') + '</ul>'
        : '<p class="muted">出典はまだ登録されていません。</p>') +
      '<h3 class="mini-title">辞書で調べる</h3><div class="dict-links">' + dictLinks(w.headword) + '</div>' +
      '</section>';

    html += '<div class="danger-zone"><button type="button" class="btn danger-ghost" data-action="delete-word" data-id="' + esc(w.id) + '">' + icon('trash') + 'この単語を削除</button></div>';
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
      '<li class="m-' + h.r + '"><span class="rate-mark">' + RATING_MARK[h.r] + '</span>' +
      '<span>' + esc(util.formatDateTime(h.t)) + '</span><span class="h-mode">' + (m === 'fwd' ? '英→場面' : '場面→英') + (h.re ? '・再' : '') + '</span></li>'
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
    if (!d) {
      return '<main class="screen" id="main"><header class="page-head"><button type="button" class="icon-btn" data-action="back" data-fallback="words" aria-label="戻る">' + icon('back') + '</button><h1>単語が見つかりません</h1></header></main>';
    }
    const posOpts = Object.keys(ST.POS).map((k) => [k, ST.POS[k]]);
    const roleOpts = [['', '（選ばない）']].concat(Object.keys(ST.ROLE).map((k) => [k, ST.ROLE[k]]));
    const groupOpts = ST.GROUPS.map((g) => [g, 'グループ ' + g]);
    const statusOpts = Object.keys(ST.STATUS).map((k) => [k, ST.STATUS[k].label]);

    let html = '<main class="screen editor" id="main"><form id="edit-form" novalidate>';
    html += '<header class="page-head"><button type="button" class="icon-btn" data-action="back" data-fallback="words" aria-label="編集をやめて戻る">' + icon('back') + '</button>' +
      '<h1 tabindex="-1">' + (isNew ? '単語を追加' : '単語を編集') + '</h1></header>';
    if (ui.editErrors.length) {
      html += '<div class="banner warn" role="alert"><ul>' + ui.editErrors.map((e) => '<li>' + esc(e) + '</li>').join('') + '</ul></div>';
    }
    html += '<fieldset class="ed-sec"><legend>単語</legend>' +
      field('英単語（見出し語）', 'headword', d.headword, { required: true, lang: 'en', en: true, placeholder: '例: pretty' }) +
      selectField('確認状況', 'status', d.status, statusOpts, { help: '確認済み＝辞書などで確かめた／未確認＝出題するが未確認／要確認＝読めない文字や不明な点があり、出題しない' }) +
      field('確認メモ（確かめた方法・辞書名など）', 'check.method', d.check.method, { textarea: true, rows: 2 }) +
      '<label class="f" for="f-sources"><span class="f-label">出典（1行に1つ「名前 | URL」）</span><textarea id="f-sources" data-field="_sources" rows="3" placeholder="Cambridge Dictionary | https://dictionary.cambridge.org/..." autocapitalize="off" spellcheck="false">' + esc(ui.editSourcesText) + '</textarea></label>' +
      '<div class="f-row">' + ['A', 'B', 'C'].map((g) => field('グループ' + g + 'の説明', 'groups.' + g, d.groups[g] || '', { half: true, placeholder: g === 'A' ? '例: 「よい状態」の仲間' : '' })).join('') + '</div>' +
      '<p class="f-help">意味が離れている用法（well の「上手に」と「井戸」など）は、別のグループにしてください。</p>' +
      '</fieldset>';

    d.senses.forEach((s, i) => {
      const p = 'senses.' + i + '.';
      html += '<fieldset class="ed-sec sense-ed"><legend>用法 ' + (i + 1) + '</legend>' +
        (d.senses.length > 1 ? '<button type="button" class="btn danger-ghost sm ed-remove" data-action="remove-sense" data-i="' + i + '">この用法を削除</button>' : '') +
        '<div class="f-row">' +
        selectField('品詞', p + 'pos', s.pos, posOpts, { half: true }) +
        selectField('文の中での役割', p + 'role', s.role, roleOpts, { half: true }) +
        selectField('グループ', p + 'group', s.group, groupOpts, { half: true }) +
        '</div>' +
        field('意味（日本語）', p + 'meaning', s.meaning, { required: true, placeholder: '例: けっこう、かなり' }) +
        field('一言ニュアンス', p + 'nuance', s.nuance, { placeholder: '例: 「とても」ほどじゃないけど「けっこう」って感じ' }) +
        field('頭に浮かべる場面', p + 'scene.text', s.scene.text, { textarea: true, rows: 2, placeholder: '身近な具体的な場面を短く' }) +
        field('場面の絵文字（任意）', p + 'scene.emoji', s.scene.emoji, { half: true, placeholder: '例: 🥱' }) +
        field('表面に出すフレーズ（英語）', p + 'cue', s.cue, { lang: 'en', en: true, placeholder: '例: pretty tired', help: '同じ単語の用法を見分ける手がかりになります。' }) +
        field('役割の説明', p + 'roleText', s.roleText, { textarea: true, rows: 3, placeholder: '「どのくらい」を表す言葉です（副詞）。…' }) +
        '<div class="ed-sub"><p class="f-label">例文</p>' +
        s.examples.map((ex, j) =>
          '<div class="ed-item">' +
          field('英語', p + 'examples.' + j + '.en', ex.en, { lang: 'en', en: true, placeholder: "I'm [pretty] tired." }) +
          field('日本語訳', p + 'examples.' + j + '.ja', ex.ja, { placeholder: '今日はけっこう疲れてる。' }) +
          '<button type="button" class="btn ghost sm" data-action="remove-example" data-i="' + i + '" data-j="' + j + '">この例文を削除</button></div>'
        ).join('') +
        '<p class="f-help">英語の例文では、その用法の単語を [ ] で囲んでください（例: I\'m [pretty] tired.）。裏面では強調、「場面→英語」では空欄になります。</p>' +
        '<button type="button" class="btn ghost sm" data-action="add-example" data-i="' + i + '">' + icon('plus') + '例文を追加</button></div>' +
        '<div class="ed-sub"><p class="f-label">似た単語との違い（任意）</p>' +
        s.contrasts.map((c, j) =>
          '<div class="ed-item">' +
          field('似た単語', p + 'contrasts.' + j + '.word', c.word, { lang: 'en', en: true, half: true, placeholder: 'very' }) +
          field('使う場面の違い', p + 'contrasts.' + j + '.text', c.text, { textarea: true, rows: 2 }) +
          '<button type="button" class="btn ghost sm" data-action="remove-contrast" data-i="' + i + '" data-j="' + j + '">削除</button></div>'
        ).join('') +
        '<button type="button" class="btn ghost sm" data-action="add-contrast" data-i="' + i + '">' + icon('plus') + '似た単語を追加</button></div>' +
        '<div class="ed-sub"><p class="f-label">発音</p><div class="f-row">' +
        field('発音記号（アメリカ）', p + 'ipa.us', s.ipa.us, { half: true, lang: 'en', en: true, placeholder: '/ˈprɪti/' }) +
        field('発音記号（イギリス）', p + 'ipa.uk', s.ipa.uk, { half: true, lang: 'en', en: true, placeholder: '/ˈprɪti/' }) +
        '</div>' +
        field('強く読む位置（任意）', p + 'stress', s.stress, { lang: 'en', en: true, placeholder: 're·CORD', help: '音節を「·」で区切り、強く読む音節を大文字にします。' }) +
        field('単語ボタンで読み上げる英語（任意）', p + 'speak', s.speak, { lang: 'en', en: true, placeholder: '空欄なら見出し語', help: '品詞で発音が変わる語は「to record」「a record」のように、この用法の発音になる語句にします。' }) +
        field('録音音声のURL（任意）', p + 'audio.word', s.audio.word, { en: true, placeholder: 'https://… または audio/xxx.mp3', help: '登録すると合成音声より優先して再生し、「録音」と表示します。' }) +
        '</div>' +
        field('補足（任意）', p + 'note', s.note, { textarea: true, rows: 2 }) +
        '<label class="check"><input type="checkbox" id="f-' + i + '-status" data-field="' + p + 'status" value="needs_review"' + (s.status === 'needs_review' ? ' checked' : '') + '> この用法は要確認（出題しない）</label>' +
        '</fieldset>';
    });
    html += '<button type="button" class="btn secondary block" data-action="add-sense">' + icon('plus') + '用法を追加</button>';
    html += '<div class="ed-actions"><button type="button" class="btn ghost" data-action="back" data-fallback="words">キャンセル</button>' +
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
    if (store.state.session) store.set('session', SS.sanitize(store.state.session, store.state.words));
    ui.editErrors = [];
    toast(problems.length ? '保存しました。要確認にしています：' + problems.join('、') : '保存しました。');
    if (navStack.length > 1 && navStack[navStack.length - 2] === 'word:' + word.id) history.back();
    else go('word-' + word.id, true);
  }

  /* ================= 設定 ================= */

  function voiceSection() {
    const s = store.state.settings;
    let status;
    if (!speech) status = '';
    else if (speech.status === 'ready') status = '<p class="ok-line">合成音声（この端末の読み上げ機能）を使っています：<b>' + esc(speech.currentLabel()) + '</b></p>';
    else status = '<p class="banner ' + (speech.status === 'loading' ? 'info' : 'warn') + '">' + esc(speech.message()) + '</p>';
    const voices = speech ? speech.voices : [];
    return '<section class="panel" id="voice-section"><h2 class="panel-title">音声</h2>' + status +
      '<label class="f" for="voice-select"><span class="f-label">英語の声</span>' +
      '<select id="voice-select"' + (voices.length ? '' : ' disabled') + '>' +
      (voices.length ? voices.map((v) => '<option value="' + esc(v.voiceURI) + '"' + (speech.voice && v.voiceURI === speech.voice.voiceURI ? ' selected' : '') + '>' + esc(speech.voiceLabel(v)) + '</option>').join('') : '<option>使える英語の声がありません</option>') +
      '</select><span class="f-help">端末に入っている英語の声だけを表示しています。「オンライン」の声は通信が必要です。</span></label>' +
      '<div class="audio-row">' + audioBtn({ text: 'Hello! This is how I sound.', aria: 'テスト再生', label: 'テスト再生' }) + audioBtn({ text: 'Hello! This is how I sound.', aria: 'テスト再生', slow: true }) + '</div>' +
      '<label class="f" for="rate"><span class="f-label">通常の速さ：<b id="rate-val">' + s.rate.toFixed(2) + '</b> 倍</span><input type="range" id="rate" min="0.7" max="1.1" step="0.05" value="' + s.rate + '"></label>' +
      '<label class="f" for="slow-rate"><span class="f-label">ゆっくりの速さ：<b id="slow-rate-val">' + s.slowRate.toFixed(2) + '</b> 倍</span><input type="range" id="slow-rate" min="0.4" max="0.85" step="0.05" value="' + s.slowRate + '"></label>' +
      '<label class="check"><input type="checkbox" id="autoplay"' + (s.autoplay ? ' checked' : '') + '> カードを表示したら、単語を自動で読み上げる（英語 → 場面）</label>' +
      '<p class="fine">日本語の説明は読み上げません。録音音声が登録されたカードは「録音」と表示し、録音を優先して再生します。それ以外は「合成」と表示します。</p>' +
      '</section>';
  }

  function viewOptions() {
    const s = store.state.settings;
    const st = store.status;
    const storageText = st.backend === 'local' ? 'この端末のブラウザ（localStorage）に保存しています。ブラウザのデータを消すと記録も消えるので、ときどき書き出しておくと安心です。'
      : st.backend === 'memory' ? 'このブラウザでは保存できません。ページを閉じると記録が消えます。'
      : 'あなたのアカウントに保存しています（公開ページ版）。';
    let html = '<main class="screen options" id="main"><header class="page-head"><h1 tabindex="-1">設定</h1></header>';
    html += voiceSection();
    html += '<section class="panel"><h2 class="panel-title">学習</h2>' +
      '<label class="f" for="daily-goal"><span class="f-label">今日の目標（枚数）</span><select id="daily-goal">' +
      [10, 20, 30, 40].map((n) => '<option value="' + n + '"' + (n === s.dailyGoal ? ' selected' : '') + '>' + n + '枚（' + n / 10 + 'セット）</option>').join('') + '</select></label>' +
      '<label class="f" for="accent"><span class="f-label">発音記号の表示</span><select id="accent">' +
      '<option value="us"' + (s.accent === 'us' ? ' selected' : '') + '>アメリカ英語</option><option value="uk"' + (s.accent === 'uk' ? ' selected' : '') + '>イギリス英語</option></select></label>' +
      '</section>';

    html += '<section class="panel"><h2 class="panel-title">データの書き出し</h2>' +
      '<p class="fine">単語データと学習記録をファイル（JSON）にします。機種変更やバックアップに使えます。</p>' +
      '<label class="check"><input type="checkbox" id="include-progress"' + (ui.includeProgress ? ' checked' : '') + '> 学習履歴・復習予定・設定も含める</label>' +
      '<div class="btn-row"><button type="button" class="btn secondary" data-action="export-file">ファイルに保存</button><button type="button" class="btn ghost" data-action="export-copy">テキストでコピー</button></div>' +
      (ui.exportText ? '<label class="f" for="export-text"><span class="f-label">書き出した内容（長押しで全選択してコピーできます）</span><textarea id="export-text" rows="6" readonly>' + esc(ui.exportText) + '</textarea></label>' : '') +
      '</section>';

    html += '<section class="panel"><h2 class="panel-title">データの読み込み</h2>' +
      '<p class="fine">書き出したファイルを選ぶか、内容を貼り付けてください。読めない文字や不明な点がある単語は「要確認」にして、通常の出題から外します。</p>' +
      '<label class="f" for="import-file"><span class="f-label">ファイルを選ぶ</span><input type="file" id="import-file" accept=".json,application/json,text/plain"></label>' +
      '<label class="f" for="import-text"><span class="f-label">または貼り付け</span><textarea id="import-text" rows="4" placeholder=\'{"format":"core-image-flashcards", ...}\' spellcheck="false">' + esc(ui.importText) + '</textarea></label>' +
      '<button type="button" class="btn secondary" data-action="import-check">内容を確認</button>' +
      importPreviewHtml() +
      '</section>';

    html += '<section class="panel"><h2 class="panel-title">保存とリセット</h2><p class="fine">' + esc(storageText) + '</p>' +
      '<div class="btn-row"><button type="button" class="btn danger-ghost" data-action="reset-progress">学習記録をリセット</button>' +
      '<button type="button" class="btn danger-ghost" data-action="reset-words">単語を初期状態に戻す</button></div></section>';

    html += '<section class="panel about"><h2 class="panel-title">このアプリについて</h2>' +
      '<p>カードは「1つの意味・用法」ごとに作っています。同じ単語のほかの用法は、単語の詳細画面でまとめて見られます。</p>' +
      '<p>初期の単語は、辞書の情報と照らし合わせて意味・品詞・発音記号を確かめ、出典と確認方法を単語ごとに記録しています。例文・ニュアンス・場面の説明は、このアプリ用に作った学習用の文章です。</p>' +
      '<p>コアイメージは理解を助けるための説明で、すべてのネイティブスピーカーが同じイメージを持っているとは限りません。</p></section>';
    html += '</main>';
    return html;
  }

  function importPreviewHtml() {
    const p = ui.importPreview;
    if (!p) return '';
    if (!p.ok) return '<div class="banner warn" role="alert">' + esc(p.error) + '</div>';
    const s = p.stats;
    return '<div class="import-preview" role="status"><p><b>読み込める内容</b></p><ul>' +
      '<li>単語 ' + s.words + '語（用法 ' + s.senses + 'つ）</li>' +
      (s.needsReview ? '<li>うち要確認 ' + s.needsReview + '語（出題しません）</li>' : '') +
      '<li>学習記録 ' + (s.progress ? s.progress + '件・' + s.days + '日分' : 'なし') + '</li></ul>' +
      (p.warnings.length ? '<details><summary>注意 ' + p.warnings.length + '件</summary><ul class="warn-list">' + p.warnings.slice(0, 30).map((w) => '<li>' + esc(w) + '</li>').join('') + '</ul></details>' : '') +
      '<div class="btn-row"><button type="button" class="btn primary" data-action="import-merge">追加・更新する</button>' +
      '<button type="button" class="btn danger-ghost" data-action="import-replace">すべて置き換える</button>' +
      '<button type="button" class="btn ghost" data-action="import-cancel">やめる</button></div>' +
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
    const el = document.querySelector('.import-preview, .options .banner.warn');
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
      '<div class="btn-row end"><button type="button" class="btn ghost" data-action="modal-cancel">やめる</button>' +
      '<button type="button" class="btn ' + (m.danger ? 'danger' : 'primary') + '" data-action="modal-ok">' + esc(m.ok) + '</button></div></div>';
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
    const el = e.target.closest('[data-action]');
    if (!el) return;
    const a = el.dataset.action;
    if (el.disabled) return;
    switch (a) {
      case 'speak':
        e.stopPropagation();
        playFrom(el);
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
      case 'start':
        startSet(el.dataset.mode || 'fwd');
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
      case 'filter':
        ui.filter = el.dataset.f;
        render(false);
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
            toast('学習記録をリセットしました。');
            render(false);
          },
        });
        return;
      case 'reset-words':
        openModal({
          title: '単語を初期状態に戻しますか？',
          body: '追加・編集した単語は消え、最初から入っている ' + C.seed.words.length + '語に戻ります。学習記録は、初期の単語のぶんだけ残ります。',
          ok: '初期状態に戻す',
          danger: true,
          onOk: () => {
            setWords(C.seed.words.map((w) => ST.normalizeWord(w).word));
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
    if (t.id === 'rate' || t.id === 'slow-rate') {
      const v = Number(t.value);
      const key = t.id === 'rate' ? 'rate' : 'slowRate';
      store.set('settings', Object.assign({}, store.state.settings, { [key]: v }));
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
    const settings = store.state.settings;
    switch (t.id) {
      case 'voice-select':
        store.set('settings', Object.assign({}, settings, { voiceURI: t.value }));
        speech.selectVoice(t.value);
        toast('英語の声を変更しました。');
        return;
      case 'autoplay':
        store.set('settings', Object.assign({}, settings, { autoplay: t.checked }));
        return;
      case 'daily-goal':
        store.set('settings', Object.assign({}, settings, { dailyGoal: Number(t.value) }));
        toast('今日の目標を ' + t.value + '枚にしました。');
        return;
      case 'accent':
        store.set('settings', Object.assign({}, settings, { accent: t.value }));
        if (!settings.voiceURI) speech.refresh(false);
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

  function onKey(e) {
    if (ui.modal) {
      if (e.key === 'Escape') closeModal();
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
