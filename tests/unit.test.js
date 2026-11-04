/* 単体テスト: node --test tests/ */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const util = require('../js/util.js');
const srs = require('../js/srs.js');
const S = require('../js/session.js');
const ST = require('../js/storage.js');
const seed = require('../js/data-seed.js');

const DAY = util.DAY;
// 2026-11-04 10:00（端末の時刻）
const T0 = new Date(2026, 10, 4, 10, 0, 0).getTime();
const words = () => seed.words.map((w) => ST.normalizeWord(w).word);
const TOTAL = S.studyable(words()).length; // 出題できる用法の数（要確認を除く）
const SENSES = seed.words.reduce((n, w) => n + w.senses.length, 0);

test('思い出せた: 1日 → 3日 → 8日 と間隔が広がる', () => {
  let s = srs.review(null, 'good', T0);
  assert.equal(s.interval, 1);
  assert.equal(s.due, util.addDays(T0, 1));
  assert.equal(s.streak, 1);
  s = srs.review(s, 'good', s.due + 9 * 3600e3);
  assert.equal(s.interval, 3);
  s = srs.review(s, 'good', s.due + 3600e3);
  assert.equal(s.interval, 8);
  assert.equal(s.reps, 3);
});

test('思い出せなかった: 10分後に再出題、失敗回数が増える', () => {
  let s = srs.review(null, 'good', T0);
  s = srs.review(s, 'again', s.due + 1000);
  assert.equal(s.interval, 0);
  assert.equal(s.lapses, 1);
  assert.equal(s.streak, 0);
  assert.ok(s.due - (util.addDays(T0, 1) + 1000) === srs.AGAIN_DELAY);
  // 次に思い出せたら翌日から
  const s2 = srs.review(s, 'good', s.due + 1);
  assert.equal(s2.interval, 1);
});

test('あいまい: 間隔を半分に（最短で翌日）', () => {
  let s = { reps: 3, lapses: 0, streak: 3, interval: 8, ease: 2.5, due: T0, last: T0 - 8 * DAY, history: [] };
  s = srs.review(s, 'hard', T0 + 1);
  assert.equal(s.interval, 4);
  assert.equal(s.due, util.addDays(T0, 4));
  assert.equal(s.streak, 3, 'あいまいは連続回数をリセットしない（増やしもしない）');
  const fresh = srs.review(null, 'hard', T0);
  assert.equal(fresh.interval, 1);
});

test('予定より前の復習で思い出せても、間隔は伸ばさない', () => {
  const s = srs.review(null, 'good', T0); // 明日が予定
  const early = srs.review(s, 'good', T0 + 3600e3);
  assert.equal(early.interval, 1);
  assert.equal(early.due, s.due);
  assert.equal(early.streak, 1);
  assert.equal(srs.previewLabel(s, 'good', T0 + 3600e3), '予定どおり');
});

test('1回答えただけでは「定着」にならない', () => {
  let s = srs.review(null, 'good', T0);
  assert.equal(srs.level(s).key, 'learning');
  let t = T0;
  for (let i = 0; i < 3; i++) {
    t = s.due + 3600e3;
    s = srs.review(s, 'good', t);
  }
  // 1 → 3 → 8 → 20日。まだ21日未満
  assert.equal(s.interval, 20);
  assert.equal(srs.level(s).key, 'reviewing');
  s = srs.review(s, 'good', s.due + 3600e3);
  assert.ok(s.interval >= 21);
  assert.equal(srs.level(s).key, 'settled');
  // 失敗すると戻る
  s = srs.review(s, 'again', s.due + 1);
  assert.equal(srs.level(s).key, 'learning');
});

test('再出題の回答では予定を変えず、履歴だけ増える', () => {
  const s = srs.review(null, 'hard', T0);
  const r = srs.recordRepeat(s, 'good', T0 + 60e3);
  assert.equal(r.due, s.due);
  assert.equal(r.interval, s.interval);
  assert.equal(r.history.length, 2);
  assert.equal(r.history[1].re, true);
  const r2 = srs.recordRepeat(s, 'again', T0 + 60e3);
  assert.equal(r2.interval, 0);
  assert.equal(r2.due, T0 + 60e3 + srs.AGAIN_DELAY);
});

test('セット: 10枚。復習予定のカードを新しいカードより先に出す', () => {
  const ws = words();
  const ids = S.studyable(ws).map((x) => x.sense.id);
  assert.equal(ids.length, TOTAL);
  const progress = {};
  // 最後の2枚を「復習予定日を過ぎた」状態にする
  const dueIds = ids.slice(-2);
  dueIds.forEach((id, i) => {
    progress[id] = { fwd: { reps: 1, lapses: 0, streak: 1, interval: 1, ease: 2.5, due: T0 - (i + 1) * DAY, last: T0 - 2 * DAY, history: [] } };
  });
  const set = S.build(ws, progress, 'fwd', T0);
  assert.equal(set.cards.length, 10);
  assert.ok(set.cards.slice(0, 2).every((id) => dueIds.includes(id)), '復習カードが先頭');
  assert.equal(set.cards[0], dueIds[1], 'より遅れているカードが先');
});

test('セット: 同じ単語のカードは続けて出さない', () => {
  const set = S.build(words(), {}, 'fwd', T0);
  const owner = {};
  words().forEach((w) => w.senses.forEach((s) => (owner[s.id] = w.id)));
  for (let i = 1; i < set.cards.length; i++) {
    assert.notEqual(owner[set.cards[i]], owner[set.cards[i - 1]]);
  }
});

test('要確認の単語・用法は出題しない', () => {
  const ws = words();
  ws[0].status = 'needs_review';
  const two = ws.find((w) => w.senses.length >= 2 && w.status !== 'needs_review');
  two.senses[0].status = 'needs_review';
  const ids = S.studyable(ws).map((x) => x.sense.id);
  assert.ok(!ids.includes(ws[0].senses[0].id));
  assert.ok(!ids.includes(two.senses[0].id));
  assert.ok(ids.includes(two.senses[1].id));
});

test('場面→英語は、英語→場面で学習したカードだけ', () => {
  const ws = words();
  assert.equal(S.build(ws, {}, 'rev', T0), null);
  const id = ws[0].senses[0].id;
  const progress = { [id]: { fwd: srs.review(null, 'good', T0) } };
  const set = S.build(ws, progress, 'rev', T0 + 1000);
  assert.deepEqual(set.cards, [id]);
});

test('思い出せなかった → 3枚後、あいまい → 5枚後に再出題。思い出せた → 出題終了', () => {
  let set = S.build(words(), {}, 'fwd', T0);
  let progress = {};
  const first = S.current(set);
  let out = S.answer(set, progress, 'again', T0);
  set = out.session;
  progress = out.progress;
  assert.equal(set.queue[3], first, '3枚後に戻ってくる');
  assert.equal(set.queue.length, 10);
  assert.equal(out.event.first, true);
  assert.equal(progress[first].fwd.due, T0 + srs.AGAIN_DELAY);

  const second = S.current(set);
  out = S.answer(set, progress, 'hard', T0 + 1000);
  set = out.session;
  progress = out.progress;
  assert.equal(set.queue[5], second, '5枚後に戻ってくる');

  const third = S.current(set);
  out = S.answer(set, progress, 'good', T0 + 2000);
  set = out.session;
  progress = out.progress;
  assert.ok(!set.queue.includes(third));
  assert.equal(progress[third].fwd.interval, 1);
});

test('再出題で思い出せても、間隔を2回伸ばさない', () => {
  let set = S.build(words(), {}, 'fwd', T0, { size: 2 });
  let progress = {};
  const id = S.current(set);
  let out = S.answer(set, progress, 'hard', T0); // 1枚しか残りがないので直後に戻る
  set = out.session;
  progress = out.progress;
  const dueAfterFirst = progress[id].fwd.due;
  // 残りのカードを片づけて、再出題を待つ
  while (S.current(set) !== id) {
    out = S.answer(set, progress, 'good', T0 + 1000);
    set = out.session;
    progress = out.progress;
  }
  out = S.answer(set, progress, 'good', T0 + 2000);
  assert.equal(out.event.first, false);
  assert.equal(out.progress[id].fwd.due, dueAfterFirst);
  assert.equal(out.progress[id].fwd.reps, 1);
  assert.equal(out.session.finished, true);
});

test('思い出せないカードを無限に繰り返さない（最大3回）', () => {
  let set = S.build(words(), {}, 'fwd', T0, { size: 1 });
  let progress = {};
  let n = 0;
  while (!set.finished && n < 20) {
    const out = S.answer(set, progress, 'again', T0 + n * 1000);
    set = out.session;
    progress = out.progress;
    n += 1;
  }
  assert.equal(n, 4, '最初の1回＋再出題3回');
  assert.ok(set.finished);
});

test('進捗・残り枚数・まとめ', () => {
  let set = S.build(words(), {}, 'fwd', T0);
  assert.equal(S.remaining(set), 10);
  assert.equal(S.progressRatio(set), 0);
  let progress = {};
  const out = S.answer(set, progress, 'good', T0);
  set = out.session;
  assert.equal(S.remaining(set), 9);
  assert.equal(S.progressRatio(set), 0.1);
  const sum = S.summary(set);
  assert.equal(sum.good, 1);
  assert.equal(sum.cards, 1);
});

test('途中のセットの復元: 削除された単語のカードを除く', () => {
  const ws = words();
  const set = S.build(ws, {}, 'fwd', T0);
  const firstWord = ws.find((w) => w.senses.some((x) => x.id === set.queue[0]));
  const removed = ws.filter((w) => w.id !== firstWord.id);
  const fixed = S.sanitize(JSON.parse(JSON.stringify(set)), removed);
  assert.ok(!fixed.queue.includes(set.queue[0]));
  assert.equal(fixed.queue.length, set.queue.length - 1);
  assert.equal(fixed.finished, false);
});

test('ポイント・今日の目標・連続学習日数', () => {
  let log = S.emptyLog();
  let bonusSeen = 0;
  for (let i = 0; i < 10; i++) {
    const r = S.logAnswer(log, { first: true, rating: 'good', points: 10 }, T0 + i, 10);
    log = r.log;
    bonusSeen += r.bonus;
  }
  assert.equal(bonusSeen, S.POINTS.goalBonus, '目標達成ボーナスは1回だけ');
  assert.equal(S.today(log, T0).cards, 10);
  assert.equal(log.totalPoints, 100 + S.POINTS.goalBonus);
  log = S.logSetComplete(log, T0).log;
  assert.equal(S.today(log, T0).sets, 1);
  // 昨日・おととい も学習 → 3日連続
  log = S.logAnswer(log, { first: true, rating: 'hard', points: 6 }, T0 - DAY, 10).log;
  log = S.logAnswer(log, { first: true, rating: 'hard', points: 6 }, T0 - 2 * DAY, 10).log;
  assert.deepEqual(S.streak(log, T0), { days: 3, todayDone: true });
  // 明日まだ学習していなければ、昨日までの3日を表示
  assert.deepEqual(S.streak(log, T0 + DAY), { days: 3, todayDone: false });
  // 1日空くと途切れる
  assert.equal(S.streak(log, T0 + 2 * DAY).days, 0);
});

test('ホームの件数', () => {
  const ws = words();
  const c = S.counts(ws, {}, T0);
  assert.equal(c.total, TOTAL);
  assert.equal(c.newFwd, TOTAL);
  assert.equal(c.availableRev, 0);
  const id = ws[0].senses[0].id;
  const progress = { [id]: { fwd: srs.review(null, 'good', T0) } };
  const c2 = S.counts(ws, progress, T0 + 1000);
  assert.equal(c2.newFwd, TOTAL - 1);
  assert.equal(c2.tomorrow, 1);
  assert.equal(c2.availableRev, 1);
  const c3 = S.counts(ws, progress, util.addDays(T0, 1) + 1);
  assert.equal(c3.dueFwd, 1);
});

test('初期データ: すべて必須項目があり、例文に [ ] の印がある（要確認の語を除く）', () => {
  assert.ok(seed.words.length >= 10);
  const ids = new Set();
  seed.words.forEach((w) => {
    const { word, problems } = ST.normalizeWord(w);
    assert.deepEqual(problems, [], w.headword);
    if (word.status === 'needs_review') {
      assert.ok(word.reviewReasons.length > 0, w.headword + ' に要確認の理由');
      return;
    }
    assert.ok(['verified', 'unverified'].includes(word.status), w.headword);
    if (word.status === 'unverified') assert.ok(word.check.note.includes('未確認の理由'), w.headword + ' に未確認の理由');
    assert.ok(word.sources.length > 0, w.headword + ' に出典');
    assert.ok(word.check.date && word.check.method, w.headword + ' に確認状況');
    word.senses.forEach((s) => {
      assert.ok(!ids.has(s.id), '重複ID ' + s.id);
      ids.add(s.id);
      ['nuance', 'meaning', 'roleText', 'cue'].forEach((k) => assert.ok(s[k], s.id + ' の ' + k));
      assert.ok(s.nuance.endsWith('って感じ'), s.id + ' のニュアンスは「〜って感じ」');
      assert.ok(s.scene.text && (s.scene.emoji || s.scene.diagram), s.id + ' の場面');
      assert.ok(s.ipa.us && s.ipa.uk, s.id + ' の発音記号');
      assert.ok(s.examples.length >= 1, s.id + ' の例文');
      s.examples.forEach((e) => {
        assert.ok(/\[[^\]]+\]/.test(e.en), s.id + ' の例文に [ ] : ' + e.en);
        assert.ok(e.ja, s.id + ' の訳');
      });
    });
  });
});

test('初期データ: 品詞で発音が変わる語は、用法ごとに読み上げと発音記号が違う', () => {
  const ws = words();
  const rec = ws.find((w) => w.headword === 'record');
  const [noun, verb] = rec.senses;
  assert.equal(noun.speak, 'a record');
  assert.equal(verb.speak, 'to record');
  assert.notEqual(noun.ipa.us, verb.ipa.us);
  const live = ws.find((w) => w.headword === 'live');
  assert.equal(live.senses[0].ipa.us, '/lɪv/');
  assert.equal(live.senses[1].ipa.us, '/laɪv/');
  const well = ws.find((w) => w.headword === 'well');
  assert.deepEqual(Array.from(new Set(well.senses.map((s) => s.group))), ['A', 'B'], 'well の井戸は別グループ');
});

test('データの整形: 読めない文字・英字以外の見出し語は要確認', () => {
  const garbled = ST.normalizeWord({ headword: 'pr�tty', status: 'verified', senses: [{ meaning: 'かわいい' }] });
  assert.equal(garbled.word.status, 'needs_review');
  assert.ok(garbled.problems.some((p) => p.includes('読めない')));
  const ja = ST.normalizeWord({ headword: 'かわいい', senses: [{ meaning: 'pretty' }] });
  assert.equal(ja.word.status, 'needs_review');
  const noMeaning = ST.normalizeWord({ headword: 'run', senses: [{ nuance: 'x' }] });
  assert.equal(noMeaning.word.senses[0].status, 'needs_review', '意味がない用法は要確認');
  const ok = ST.normalizeWord({ headword: 'take off', senses: [{ meaning: '離陸する' }] });
  assert.equal(ok.word.status, 'unverified');
  assert.deepEqual(ok.problems, []);
});

test('データの整形: 危険なURLは捨てる', () => {
  const { word } = ST.normalizeWord({
    headword: 'test',
    sources: [{ label: 'x', url: 'javascript:alert(1)' }, { label: 'ok', url: 'https://example.com/a' }],
    senses: [{ meaning: 'テスト', audio: { word: 'javascript:alert(1)', examples: ['audio/a.mp3', '../x.mp3'] } }],
  });
  assert.equal(word.sources[0].url, '');
  assert.equal(word.sources[1].url, 'https://example.com/a');
  assert.equal(word.senses[0].audio.word, '');
  assert.deepEqual(word.senses[0].audio.examples, ['audio/a.mp3', '']);
});

test('書き出し → 読み込み で同じ内容に戻る', () => {
  const state = {
    words: words(),
    progress: { 's-pretty-adj': { fwd: srs.review(null, 'good', T0) } },
    log: S.logAnswer(S.emptyLog(), { first: true, rating: 'good', points: 10 }, T0, 10).log,
    settings: Object.assign({}, ST.DEFAULT_SETTINGS, { rate: 0.9 }),
  };
  const text = JSON.stringify(ST.buildExport(state));
  const parsed = ST.parseImport(text);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.stats.words, seed.words.length);
  assert.equal(parsed.stats.senses, SENSES);
  assert.equal(parsed.stats.progress, 1);
  const next = ST.applyImport({ words: [], progress: {}, settings: ST.DEFAULT_SETTINGS }, parsed.data, 'replace');
  assert.deepEqual(next.words, state.words);
  assert.deepEqual(next.progress, ST.normalizeProgress(state.progress));
  assert.equal(next.settings.rate, 0.9);
  assert.equal(next.log.totalPoints, 10);
});

test('読み込み: 追加・更新は学習記録を残し、壊れたファイルは断る', () => {
  assert.equal(ST.parseImport('{not json').ok, false);
  assert.equal(ST.parseImport('{"hello":1}').ok, false);
  assert.equal(ST.parseImport('{"format":"other","words":[]}').ok, false);
  const incoming = ST.parseImport(JSON.stringify({ format: ST.FORMAT, words: [{ id: 'w-new', headword: 'new', senses: [{ meaning: '新しい' }] }, { id: 'w-bad', headword: '??', senses: [] }] }));
  assert.equal(incoming.ok, true);
  assert.equal(incoming.stats.needsReview, 1);
  assert.ok(incoming.warnings.length >= 1);
  const base = { words: words(), progress: { 's-pretty-adj': { fwd: srs.review(null, 'good', T0) } } };
  const merged = ST.applyImport(base, incoming.data, 'merge');
  assert.equal(merged.words.length, seed.words.length + 2);
  assert.ok(merged.progress['s-pretty-adj']);
});

test('保存ストア: 初回は初期データ、保存した内容は再読み込み後も残る', async () => {
  const backend = ST.memoryBackend();
  const a = ST.createStore(backend);
  await a.init(seed);
  assert.equal(a.state.words.length, seed.words.length);
  await a.set('progress', { 's-pretty-adj': { fwd: srs.review(null, 'good', T0) } });
  await a.set('settings', Object.assign({}, a.state.settings, { voiceURI: 'v1', slowRate: 0.5 }));
  const w = a.state.words.slice();
  w.push(ST.normalizeWord({ id: 'w-mine', headword: 'mine', senses: [{ meaning: '私のもの' }] }).word);
  await a.set('words', w);
  const b = ST.createStore(backend);
  await b.init(seed);
  assert.equal(b.state.words.length, seed.words.length + 1);
  assert.equal(b.state.settings.voiceURI, 'v1');
  assert.equal(b.state.settings.slowRate, 0.5);
  assert.equal(b.state.progress['s-pretty-adj'].fwd.interval, 1);
});

test('保存ストア: 初期データが増えた版では、削除していない新しい単語だけ足す', async () => {
  const backend = ST.memoryBackend();
  await backend.save('words', [seed.words[0]]);
  await backend.save('meta', { seedVersion: 0, deletedSeed: ['w-well'] });
  const st = ST.createStore(backend);
  await st.init(seed);
  const ids = st.state.words.map((w) => w.id);
  assert.ok(ids.includes('w-pretty'));
  assert.ok(!ids.includes('w-well'), 'ユーザーが削除した単語は戻さない');
  assert.ok(ids.includes('w-light'));
  assert.equal(st.state.meta.seedVersion, seed.version);
});

test('localStorage への保存（同期書き込み）', async () => {
  const mem = {};
  const fake = {
    getItem: (k) => (k in mem ? mem[k] : null),
    setItem: (k, v) => { mem[k] = String(v); },
    removeItem: (k) => { delete mem[k]; },
  };
  const b = ST.localBackend(fake);
  const st = ST.createStore(b);
  await st.init(seed);
  st.set('session', { queue: ['x'] });
  assert.ok(mem['cif.v1.session'].includes('"x"'));
  st.set('session', null);
  assert.ok(!('cif.v1.session' in mem));
});

test('例文の [ ] の扱い', () => {
  assert.equal(util.plainSentence("I'm [pretty] tired."), "I'm pretty tired.");
  assert.equal(util.markedHtml('a [<b>] c'), 'a <mark class="hit">&lt;b&gt;</mark> c');
  assert.ok(util.clozeHtml('[Look] at it').startsWith('<span class="blank"'));
});

test('復習予定の表示', () => {
  assert.equal(util.formatDue(T0 + 10 * 60e3, T0), '10分後');
  assert.equal(util.formatDue(util.addDays(T0, 1), T0), '明日');
  assert.equal(util.formatDue(util.addDays(T0, 3), T0), '3日後');
  assert.equal(util.formatDue(T0 - 1, T0), '今すぐ');
});

test('手書きの単語リスト: 資料の単語が先、読めない・意図が不明な語は要確認で出題しない', () => {
  const ws = words();
  assert.equal(ws[0].headword, 'begin', '資料の単語から先に並ぶ');
  const sample = new Set(seed.sample);
  assert.ok(ws.findIndex((w) => sample.has(w.id)) > 90, '見本の単語は後ろ');
  for (const h of ['fell', 'brighe']) {
    const w = ws.find((x) => x.headword === h);
    assert.equal(w.status, 'needs_review', h);
    assert.ok(w.reviewReasons[0].includes('判断できません') || w.reviewReasons[0].includes('見つかりません'), h);
    assert.ok(!S.studyable(ws).some((it) => it.word.id === w.id), h + ' は出題しない');
  }
  // 資料にあってすでに入っていた語は重複させない
  for (const h of ['take', 'well', 'pretty', 'look']) assert.equal(ws.filter((x) => x.headword === h).length, 1, h);
  // 表記を直した語は、元の表記と理由を記録している
  const everyone = ws.find((x) => x.headword === 'everyone');
  assert.ok(everyone.check.note.includes('every one'));
  assert.ok(everyone.sources[0].label.includes('every one'));
  const become = ws.find((x) => x.headword === 'become');
  assert.ok(become.check.note.includes('became'));
  // 品詞で発音が変わる excuse は、用法ごとに読み上げと発音記号が違う
  const excuse = ws.find((x) => x.headword === 'excuse');
  assert.deepEqual(excuse.senses.map((x) => x.speak), ['Excuse me.', 'an excuse']);
  assert.deepEqual(excuse.senses.map((x) => x.ipa.us), ['/ɪkˈskjuːz/', '/ɪkˈskjuːs/']);
  // would / should は辞書で確認できなかったので未確認
  assert.equal(ws.find((x) => x.headword === 'would').status, 'unverified');
  assert.equal(ws.find((x) => x.headword === 'should').status, 'unverified');
  // 確認済みの語は、WordNet などの照合結果を記録している
  const begin = ws.find((x) => x.headword === 'begin');
  assert.equal(begin.status, 'verified');
  assert.ok(begin.check.note.includes('WordNet: take the first step'));
});

test('保存ストア: 新しい版で増えた資料の単語は先頭に並び、自分で追加した単語は残る', async () => {
  const backend = ST.memoryBackend();
  const sampleWords = seed.words.filter((w) => seed.sample.includes(w.id));
  const mine = { id: 'w-mine', headword: 'mine', senses: [{ meaning: '私のもの' }] };
  await backend.save('words', sampleWords.concat([mine]));
  await backend.save('meta', { seedVersion: 1, deletedSeed: [] });
  const st = ST.createStore(backend);
  await st.init(seed);
  const ids = st.state.words.map((w) => w.id);
  assert.equal(ids[0], 'w-begin');
  assert.equal(ids[ids.length - 1], 'w-mine');
  assert.equal(ids.length, seed.words.length + 1);
});

test('音声: アメリカ英語の高品質な声を最優先し、ゆっくりは1語ずつ区切る', () => {
  const SP = require('../js/speech.js');
  const v = (name, lang, uri) => ({ name, lang, voiceURI: uri || name });
  const list = [
    v('Daniel', 'en-GB'),
    v('Samantha', 'en-US', 'com.apple.voice.compact.en-US.Samantha'),
    v('Ava (Premium)', 'en-US', 'com.apple.voice.premium.en-US.Ava'),
    v('Microsoft Aria Online (Natural) - English (United States)', 'en-US'),
    v('Zarvox', 'en-US'),
  ];
  const sorted = list.slice().sort((a, b) => SP.score(b) - SP.score(a)).map((x) => x.name);
  assert.ok(sorted.indexOf('Ava (Premium)') < sorted.indexOf('Samantha'));
  assert.ok(sorted.indexOf('Samantha') < sorted.indexOf('Daniel'), 'アメリカ英語が先');
  assert.equal(sorted[sorted.length - 1], 'Zarvox');
  assert.ok(SP.isHighQuality(list[2]) && SP.isHighQuality(list[3]) && !SP.isHighQuality(list[1]));
  assert.deepEqual(SP.slowChunks("I'm pretty tired today."), ["I'm", 'pretty', 'tired', 'today.']);
});
