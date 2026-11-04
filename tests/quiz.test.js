/* テスト機能（回ごとのテスト・覚えていないリスト）の単体テスト */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Q = require('../js/quiz.js');
const S = require('../js/session.js');
const ST = require('../js/storage.js');
const seed = require('../js/data-seed.js');

const T0 = new Date(2026, 10, 4, 10, 0, 0).getTime();
const words = () => seed.words.map((w) => ST.normalizeWord(w).word);
const round1 = () => seed.rounds[0];

/** 並べ替えの正解（同じ語が2回出ても重ならないように番号を選ぶ） */
function orderAnswer(q) {
  return q.tokens.map((t, i) => i);
}

function respond(q, ok) {
  if (q.part === 'understand') return ok ? q.answer : (q.answer + 1) % q.choices.length;
  const right = orderAnswer(q);
  return ok ? right : right.slice().reverse();
}

test('第1回: 資料の98語。要確認（fell・brighe）を除いた用法が出題される', () => {
  const r = round1();
  assert.equal(r.title, '第1回');
  assert.equal(r.wordIds.length, 98);
  ['w-take', 'w-well', 'w-pretty', 'w-look'].forEach((id) => assert.ok(r.wordIds.includes(id), id));
  const items = Q.roundItems(words(), r);
  assert.ok(!items.some((it) => it.word.headword === 'fell' || it.word.headword === 'brighe'));
  const expected = words().filter((w) => r.wordIds.includes(w.id) && w.status !== 'needs_review').reduce((n, w) => n + w.senses.length, 0);
  assert.equal(items.length, expected);
  assert.ok(items.every((it) => it.sense.test && it.sense.test.en), 'すべての用法にテスト用の例文がある');
});

test('テストの問題: 内容理解（4択）と文章作成（並べ替え）が用法ごとに1問ずつ', () => {
  const items = Q.roundItems(words(), round1());
  const a = Q.createAttempt({ kind: 'round', roundId: 'r1', no: 1, items, pool: items, now: T0 });
  const u = a.questions.filter((q) => q.part === 'understand');
  const c = a.questions.filter((q) => q.part === 'compose');
  assert.equal(u.length, items.length);
  assert.equal(c.length, items.length);
  assert.equal(a.questions[0].part, 'understand', '内容理解が先');
  u.forEach((q) => {
    assert.equal(q.choices.length, 4, q.id);
    assert.equal(new Set(q.choices).size, 4, q.id + ' の選択肢が重複');
    assert.ok(q.answer >= 0 && q.answer < 4);
  });
  c.forEach((q) => {
    assert.ok(q.tokens.length >= 2);
    assert.ok(!q.order.every((v, i) => v === i), q.id + ' は並べ替えてある');
  });
  // 複数の用法がある語は、もう一方の意味がまぎらわしい選択肢として入る
  const pretty = u.find((q) => q.senseId === 's-pretty-adv' && q.qtype === 'meaning');
  const any = u.find((q) => q.qtype === 'meaning' && q.senseId === 's-few-few') || pretty;
  if (any) {
    const sib = any.senseId === 's-few-few' ? '（a few で）少しの、2、3の' : 'かわいい、きれいな（見た目が感じよい）';
    assert.ok(any.choices.includes(sib), '同じ単語の別の用法が選択肢にある');
  }
});

test('同じ用法でも、テストの回ごとに内容理解の出し方が変わる', () => {
  const items = Q.roundItems(words(), round1());
  const a1 = Q.createAttempt({ kind: 'round', roundId: 'r1', no: 1, items, now: T0 });
  const a2 = Q.createAttempt({ kind: 'round', roundId: 'r1', no: 2, items, now: T0 + 1 });
  const differ = a1.questions.filter((q, i) => q.part === 'understand' && q.qtype !== a2.questions[i].qtype).length;
  assert.ok(differ > items.length / 2);
  assert.ok(a1.questions.some((q) => q.qtype === 'scene') && a1.questions.some((q) => q.qtype === 'cloze') && a1.questions.some((q) => q.qtype === 'meaning'));
});

test('並べ替え: 文頭は小文字・最後の記号は外す。別の正しい語順も正解', () => {
  assert.deepEqual(Q.tokenize('Can I have [some] water, please?'), { tokens: ['can', 'I', 'have', 'some', 'water,', 'please'], end: '?' });
  assert.deepEqual(Q.tokenize("I'm [afraid] the shop is closed.").tokens[0], "I'm");
  const items = Q.roundItems(words(), round1()).filter((it) => it.sense.id === 's-terrible-adjective');
  const a = Q.createAttempt({ kind: 'round', roundId: 'r1', no: 1, items, pool: Q.roundItems(words(), round1()), now: T0 });
  const q = a.questions.find((x) => x.part === 'compose');
  const idx = (w) => q.tokens.findIndex((t) => t.toLowerCase() === w);
  const asSent = (s) => s.split(' ').map(idx);
  assert.equal(Q.judge(q, asSent('the weather was terrible yesterday')).correct, true);
  assert.equal(Q.judge(q, asSent('yesterday the weather was terrible')).correct, true, '別の語順');
  assert.equal(Q.judge(q, asSent('the weather terrible was yesterday')).correct, false);
  assert.equal(Q.judge(q, null).correct, false, 'わからない');
  assert.equal(Q.judge(q, asSent('the weather was terrible yesterday')).expected, 'The weather was terrible yesterday.');
});

test('採点: 全問正解で100点、1問まちがえると99点。間違いは覚えていないリストへ', () => {
  const items = Q.roundItems(words(), round1());
  let tests = ST.emptyTests();
  let a = Q.createAttempt({ kind: 'round', roundId: 'r1', no: 1, items, now: T0 });
  const firstQ = a.questions[0];
  let t = T0;
  while (!Q.isDone(a)) {
    const q = Q.current(a);
    const out = Q.answer(tests, a, respond(q, q !== firstQ), (t += 1000));
    tests = out.tests;
    a = out.attempt;
  }
  const fin = Q.finish(tests, a, (t += 1000));
  tests = fin.tests;
  const n = items.length;
  assert.equal(fin.summary.parts.understand.correct, n - 1);
  assert.equal(fin.summary.parts.compose.correct, n);
  assert.equal(fin.summary.score, Math.floor((50 * (n - 1)) / n) + 50);
  assert.equal(fin.summary.score, 99);
  assert.equal(fin.summary.wrongs.length, 1);
  assert.equal(fin.summary.wrongs[0].senseId, firstQ.senseId);
  assert.equal(tests.current, null);
  const open = Q.missList(tests, { status: 'open' });
  assert.equal(open.length, 1);
  assert.equal(open[0].key, firstQ.senseId + '|understand');
  assert.deepEqual(open[0].roundIds, ['r1']);

  // 2回目：全問正解 → 100点。間違えた問題は「克服」になるが、リストからは消えない
  a = Q.createAttempt({ kind: 'round', roundId: 'r1', no: Q.nextNo(tests, 'r1'), items, now: (t += 1000) });
  assert.equal(a.no, 2);
  while (!Q.isDone(a)) {
    const out = Q.answer(tests, a, respond(Q.current(a), true), (t += 1000));
    tests = out.tests;
    a = out.attempt;
  }
  const fin2 = Q.finish(tests, a, (t += 1000));
  tests = fin2.tests;
  assert.equal(fin2.summary.score, 100);
  const st = Q.roundStats(tests, 'r1');
  assert.equal(st.count, 2);
  assert.equal(st.best, 100);
  assert.equal(st.perfectAt.no, 2, '2回目で満点');
  assert.equal(Q.missList(tests, { status: 'open' }).length, 0);
  assert.equal(Q.missList(tests, { status: 'solved' }).length, 1);
  assert.equal(Q.missCounts(tests).all, 1, '記録は残る');
});

test('覚えていないリストは回をまたいでたまり、解き直しはまだ克服していない問題だけ', () => {
  const items = Q.roundItems(words(), round1());
  let tests = ST.emptyTests();
  // 第1回：3問まちがえる（内容理解2・文章作成1）
  let a = Q.createAttempt({ kind: 'round', roundId: 'r1', no: 1, items, now: T0 });
  const wrongIds = new Set([a.questions[0].id, a.questions[1].id, a.questions[items.length].id]);
  let t = T0;
  while (!Q.isDone(a)) {
    const q = Q.current(a);
    const out = Q.answer(tests, a, respond(q, !wrongIds.has(q.id)), (t += 1000));
    tests = out.tests;
    a = out.attempt;
  }
  tests = Q.finish(tests, a, (t += 1000)).tests;
  // 別の回（第2回のつもり）で、さらに1問まちがえる
  const r2items = items.slice(10, 12);
  a = Q.createAttempt({ kind: 'round', roundId: 'r2', no: 1, items: r2items, pool: items, now: (t += 1000) });
  let out = Q.answer(tests, a, respond(Q.current(a), false), (t += 1000));
  tests = out.tests;
  assert.equal(Q.missCounts(tests).open, 4, '途中でやめても、間違えた問題は残る');
  assert.equal(Q.missList(tests, { roundId: 'r2' }).length, 1);
  // 解き直し：4問だけ出題。正解すると克服
  const keys = Q.openKeys(tests);
  const review = Q.createAttempt({ kind: 'review', items, pool: items, only: keys, now: (t += 1000) });
  assert.equal(review.questions.length, 4);
  let r = review;
  while (!Q.isDone(r)) {
    out = Q.answer(tests, r, respond(Q.current(r), true), (t += 1000));
    tests = out.tests;
    r = out.attempt;
  }
  const fin = Q.finish(tests, r, (t += 1000));
  assert.equal(fin.summary.score, 100);
  assert.equal(Q.missCounts(fin.tests).open, 0);
  assert.equal(Q.roundStats(fin.tests, 'r1').count, 1, '解き直しは回のテスト回数に数えない');
});

test('保存データ: テストの記録は書き出し・読み込みで戻る', () => {
  const items = Q.roundItems(words(), round1()).slice(0, 3);
  let tests = ST.emptyTests();
  let a = Q.createAttempt({ kind: 'round', roundId: 'r1', no: 1, items, pool: Q.roundItems(words(), round1()), now: T0 });
  while (!Q.isDone(a)) {
    const out = Q.answer(tests, a, respond(Q.current(a), false), T0 + 1);
    tests = out.tests;
    a = out.attempt;
  }
  tests = Q.finish(tests, a, T0 + 2).tests;
  const state = { words: words(), rounds: seed.rounds, progress: {}, log: S.emptyLog(), settings: ST.DEFAULT_SETTINGS, tests };
  const parsed = ST.parseImport(JSON.stringify(ST.buildExport(state)));
  assert.equal(parsed.ok, true);
  assert.equal(parsed.data.tests.attempts.length, 1);
  assert.equal(Object.keys(parsed.data.tests.misses).length, 6);
  assert.equal(parsed.data.rounds[0].wordIds.length, 98);
  const next = ST.applyImport({ words: [], progress: {}, settings: ST.DEFAULT_SETTINGS, rounds: [] }, parsed.data, 'replace');
  assert.equal(next.tests.attempts[0].score, 0);
  assert.equal(next.rounds[0].id, 'r1');
});

test('回の追加: 新しい版の回は足され、すでにある回には増えた単語だけ足す', () => {
  const ids = new Set(words().map((w) => w.id).concat(['w-mine']));
  const mine = [{ id: 'r1', no: 1, title: '第1回', wordIds: ['w-begin', 'w-mine'] }];
  const { rounds, changed } = ST.mergeRounds(ST.normalizeRounds(mine), seed.rounds, ids);
  assert.ok(changed);
  assert.equal(rounds[0].wordIds.length, 99, '自分で入れた単語も残る');
  assert.equal(rounds[0].wordIds[0], 'w-begin');
  const r2 = ST.mergeRounds(rounds, seed.rounds.concat([{ id: 'r2', no: 2, title: '第2回', wordIds: ['w-light'] }]), ids);
  assert.deepEqual(r2.rounds.map((r) => r.title), ['第1回', '第2回']);
});

test('カード学習を回や覚えていないリストに絞れる', () => {
  const ws = words();
  const only = Q.roundItems(ws, round1()).map((it) => it.sense.id);
  const set = S.build(ws, {}, 'fwd', T0, { only, scope: { type: 'round', roundId: 'r1' } });
  assert.ok(set.cards.every((id) => only.includes(id)));
  assert.deepEqual(set.scope, { type: 'round', roundId: 'r1' });
  const small = S.build(ws, {}, 'fwd', T0, { only: ['s-light-adj', 's-on-contact'] });
  assert.deepEqual(small.cards.slice().sort(), ['s-light-adj', 's-on-contact']);
  const c = S.counts(ws, {}, T0, only);
  assert.equal(c.total, only.length);
});

test('途中のテストは保存データから復元できる', () => {
  const items = Q.roundItems(words(), round1()).slice(0, 3);
  let tests = ST.emptyTests();
  const a = Q.createAttempt({ kind: 'round', roundId: 'r1', no: 1, items, pool: Q.roundItems(words(), round1()), now: T0 });
  const out = Q.answer(tests, a, 0, T0 + 1);
  const restored = ST.normalizeTests(JSON.parse(JSON.stringify(out.tests)));
  assert.ok(restored.current, '途中のテストが残る');
  assert.equal(restored.current.index, 1);
  assert.equal(restored.current.questions.length, a.questions.length);
});
