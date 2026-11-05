/* 1日の区切り・テストの時間割・通知（カレンダー）と、今日のテスト・練習・再テストの決まりの単体テスト（日本時間で確かめる） */
'use strict';
process.env.TZ = 'Asia/Tokyo';
const test = require('node:test');
const assert = require('node:assert/strict');
const util = require('../js/util.js');
const Sc = require('../js/schedule.js');
const Q = require('../js/quiz.js');
const ST = require('../js/storage.js');
const seed = require('../js/data-seed.js');

const T = (s) => new Date(s + '+09:00').getTime();
const key = (ts) => util.dayKey(ts);
const words = () => seed.words.map((w) => ST.normalizeWord(w).word);

test('1日の区切りは朝4:00。テストは毎日 20:00 から朝4:00まで（夜ふかしの時間は前の日）', () => {
  assert.equal(new Date(T('2026-11-05T12:00:00')).getHours(), 12, '日本時間で計算している');
  const w = (s) => Sc.windowAt(T(s), '20:00');
  assert.equal(w('2026-11-05T15:00:00').open, false);
  assert.equal(w('2026-11-05T19:59:59').open, false);
  assert.equal(w('2026-11-05T20:00:00').open, true);
  assert.equal(w('2026-11-05T23:30:00').open, true);
  assert.equal(w('2026-11-06T01:30:00').open, true, '夜中の1:30は前の日のテストの時間');
  assert.equal(key(w('2026-11-06T01:30:00').day), '2026-11-05');
  assert.equal(w('2026-11-06T04:00:00').open, false, '朝4:00で終わり');
  assert.equal(key(w('2026-11-06T04:00:00').day), '2026-11-06');
  assert.equal(w('2026-11-05T15:00:00').start, T('2026-11-05T20:00:00'));
  assert.equal(w('2026-11-05T15:00:00').end, T('2026-11-06T04:00:00'));
  // 学習記録の日付も朝4:00で区切る
  assert.equal(key(Sc.dayClock(T('2026-11-06T03:59:00'))), '2026-11-05');
  assert.equal(key(Sc.dayClock(T('2026-11-06T04:00:00'))), '2026-11-06');
  const r = Sc.dayRange(T('2026-11-06T01:00:00'));
  assert.deepEqual([r.from, r.to], [T('2026-11-05T04:00:00'), T('2026-11-06T04:00:00')]);
  // 時間は選べる（決まった時刻だけ）。おかしな値は 20:00
  assert.equal(Sc.normalizeTime('21:30'), '21:30');
  assert.equal(Sc.normalizeTime('9:00'), '20:00');
  assert.equal(Sc.normalizeTime('<b>'), '20:00');
  assert.equal(Sc.windowAt(T('2026-11-05T20:30:00'), '21:00').open, false);
  assert.equal(ST.normalizeSettings({ testTime: '21:00' }).testTime, '21:00');
  assert.equal(ST.normalizeSettings({ testTime: '25:00' }).testTime, '20:00');
  assert.equal(ST.normalizeSettings({}).testTime, '20:00');
});

test('間違えた問題の再テストは、次の日のテストの時間（夜中に受けたときも、その次の日の 20:00）', () => {
  assert.equal(Sc.retestDue(T('2026-11-05T20:30:00'), '20:00'), T('2026-11-06T20:00:00'));
  assert.equal(Sc.retestDue(T('2026-11-06T02:00:00'), '20:00'), T('2026-11-06T20:00:00'));
  assert.equal(Sc.retestDue(T('2026-11-30T21:00:00'), '20:00'), T('2026-12-01T20:00:00'), '月をまたぐ');
});

test('まとめテストは5日ごと（使いはじめた日が1日目）。5日目のテストの時間から、次の回まで', () => {
  const start = util.parseDayKey('2026-11-04');
  const p = (s) => Sc.summaryPeriod(T(s), '20:00', start);
  assert.equal(p('2026-11-08T19:59:00'), null, '5日目でも 20:00 前はまだ');
  const a = p('2026-11-08T20:00:00');
  assert.equal(a.key, '2026-11-08');
  assert.equal(a.no, 1);
  assert.equal(a.from, 0);
  assert.equal(a.to, T('2026-11-08T20:00:00'));
  assert.equal(key(a.firstDay), '2026-11-04');
  assert.equal(p('2026-11-13T19:59:00').key, '2026-11-08', '次の回の時間までは同じ回');
  const b = p('2026-11-13T20:00:00');
  assert.deepEqual([b.key, b.no, b.from, b.to], ['2026-11-13', 2, T('2026-11-08T20:00:00'), T('2026-11-13T20:00:00')]);
  assert.equal(key(b.firstDay), '2026-11-09');
  assert.equal(key(Sc.nextSummaryDay(T('2026-11-05T10:00:00'), '20:00', start)), '2026-11-08');
  assert.equal(key(Sc.nextSummaryDay(T('2026-11-08T19:00:00'), '20:00', start)), '2026-11-08', '当日の 20:00 前は今日');
  assert.equal(key(Sc.nextSummaryDay(T('2026-11-08T21:00:00'), '20:00', start)), '2026-11-13');
});

test('月のまとめテストは毎月1日のテストの時間から、先月の分（11/1・12/1・1/1・2/1…）', () => {
  const m = (s) => Sc.monthlyPeriod(T(s), '20:00');
  assert.equal(m('2026-11-05T21:00:00').key, '2026-10');
  assert.equal(m('2026-12-01T19:59:00').key, '2026-10', '1日の 20:00 前は、まだ前の回');
  const d = m('2026-12-01T20:00:00');
  assert.deepEqual([d.key, d.month, d.from, d.to, d.opensAt], ['2026-11', 11, T('2026-11-01T04:00:00'), T('2026-12-01T04:00:00'), T('2026-12-01T20:00:00')]);
  assert.equal(m('2027-01-01T20:30:00').key, '2026-12', '年をまたぐ');
  assert.equal(m('2027-02-01T20:30:00').key, '2027-01');
  assert.equal(key(Sc.nextMonthlyDay(T('2026-11-05T10:00:00'), '20:00')), '2026-12-01');
  assert.equal(key(Sc.nextMonthlyDay(T('2026-12-01T10:00:00'), '20:00')), '2026-12-01');
  assert.equal(key(Sc.nextMonthlyDay(T('2026-12-31T23:00:00'), '20:00')), '2027-01-01');
  // 学習した時間で単語を選ぶ
  const items = [{ sense: { id: 'a' } }, { sense: { id: 'b' } }, { sense: { id: 'c' } }];
  const progress = {
    a: { fwd: { history: [{ t: T('2026-11-10T10:00:00'), r: 'good' }] } },
    b: { rev: { history: [{ t: T('2026-10-31T23:00:00'), r: 'good' }] } },
  };
  assert.deepEqual(Sc.studiedBetween(items, progress, d.from, d.to).map((x) => x.sense.id), ['a']);
});

test('通知：カレンダー（.ics）に毎日・5日ごと・毎月1日の予定。どれもテストの時刻に通知する', () => {
  const ics = Sc.calendar({ now: T('2026-11-05T15:00:00'), testTime: '20:00', startDay: util.parseDayKey('2026-11-04'), appName: '暗記CARD' });
  assert.ok(ics.startsWith('BEGIN:VCALENDAR\r\n') && ics.endsWith('END:VCALENDAR\r\n'));
  assert.equal((ics.match(/BEGIN:VEVENT/g) || []).length, 3);
  assert.ok(ics.includes('DTSTART:20261105T200000\r\nDURATION:PT30M\r\nRRULE:FREQ=DAILY\r\n'));
  assert.ok(ics.includes('DTSTART:20261108T200000\r\nDURATION:PT30M\r\nRRULE:FREQ=DAILY;INTERVAL=5\r\n'));
  assert.ok(ics.includes('DTSTART:20261201T200000\r\nDURATION:PT30M\r\nRRULE:FREQ=MONTHLY;BYMONTHDAY=1\r\n'));
  assert.equal((ics.match(/BEGIN:VALARM\r\nACTION:DISPLAY\r\nTRIGGER:PT0M\r\n/g) || []).length, 3);
  // 1行は75バイトまで（長い行は折り返す）
  ics.split('\r\n').forEach((line) => assert.ok(Buffer.byteLength(line, 'utf8') <= 75, line));
  const url = decodeURIComponent(Sc.googleCalendarUrl({ now: T('2026-11-05T15:00:00'), testTime: '21:30', startDay: util.parseDayKey('2026-11-04') }, 'monthly-test'));
  assert.ok(url.startsWith('https://calendar.google.com/calendar/render?action=TEMPLATE'));
  assert.ok(url.includes('dates=20261201T213000/20261201T220000') && url.includes('recur=RRULE:FREQ=MONTHLY;BYMONTHDAY=1'), url);
});

test('今日のテストは回のテストと同じく 内容理解50点＋文章作成50点。練習は覚えていないリストを変えない', () => {
  const items = Q.roundItems(words(), seed.rounds[0]);
  const pick = items.slice(0, 4);
  let tests = ST.emptyTests();
  let a = Q.createAttempt({ kind: 'daily', period: '2026-11-05', items: pick, pool: items, now: T('2026-11-05T20:30:00') });
  assert.equal(a.questions.length, 8);
  assert.deepEqual(a.questions.map((q) => q.part), ['understand', 'understand', 'understand', 'understand', 'compose', 'compose', 'compose', 'compose']);
  let t = T('2026-11-05T20:30:00');
  // 内容理解を1問まちがえる → 内容理解 37点 + 文章作成 50点
  while (!Q.isDone(a)) {
    const q = Q.current(a);
    const out = Q.answer(tests, a, q.part === 'understand' && a.index === 0 ? (q.answer + 1) % 4 : q.part === 'understand' ? q.answer : q.tokens.map((_, i) => i), (t += 1000), { nextDue: Sc.retestDue(t, '20:00') });
    tests = out.tests;
    a = out.attempt;
  }
  const fin = Q.finish(tests, a, (t += 1000));
  assert.equal(fin.summary.score, 37 + 50);
  const miss = Object.values(fin.tests.misses);
  assert.equal(miss.length, 1);
  assert.equal(miss[0].dueAt, T('2026-11-06T20:00:00'), '再テストは次の日の 20:00');
  // 練習：まちがえても正解しても、覚えていないリストは変わらない
  tests = fin.tests;
  const keys = Q.openKeys(tests);
  let p = Q.createAttempt({ kind: 'practice', items: pick, pool: items, only: keys, qtypes: Q.missTypes(tests), now: t });
  assert.equal(p.questions.length, 1);
  assert.equal(p.questions[0].qtype, miss[0].last.qtype, '間違えたときと同じ形式');
  const before = JSON.stringify(tests.misses);
  let out = Q.answer(tests, p, (p.questions[0].answer + 1) % 4, (t += 1000));
  assert.equal(JSON.stringify(out.tests.misses), before, '練習でまちがえても記録しない');
  p = Q.createAttempt({ kind: 'practice', items: pick, pool: items, only: keys, qtypes: Q.missTypes(tests), now: t });
  out = Q.answer(tests, p, p.questions[0].answer, (t += 1000));
  assert.equal(JSON.stringify(out.tests.misses), before, '練習で正解しても克服にしない');
  const pf = Q.finish(out.tests, out.attempt, (t += 1000));
  assert.equal(pf.summary.kind, 'practice');
  assert.equal(pf.summary.score, 100);
  assert.ok(Q.lastPerfect(pf.tests, 'practice', 0));
  assert.equal(Q.lastPerfect(pf.tests, 'practice', t + 1), null);
  assert.equal(Q.roundStats(pf.tests, 'r1').count, 0, '練習・今日のテストは回の記録に入らない');
  assert.equal(Q.takenAttempt(pf.tests, 'daily', '2026-11-05').score, 87);
  // 保存しても種類が残る
  const back = ST.normalizeTests(JSON.parse(JSON.stringify(pf.tests)));
  assert.deepEqual(back.attempts.map((x) => x.kind), ['daily', 'practice']);
});

test('つづりの問題：1語の英字の単語だけ。説明の中の答えの単語は伏せる', () => {
  const all = words();
  const item = (id) => {
    const w = all.find((x) => x.id === id);
    return { word: w, sense: w.senses[0] };
  };
  const pool = Q.roundItems(all, seed.rounds[0]);
  // excuse：意味に「Excuse me.」と書いてある → 伏せる
  const ex = all.find((w) => w.headword === 'excuse');
  const a = Q.createAttempt({ kind: 'summary', items: [{ word: ex, sense: ex.senses[0] }], pool, perItem: 4, size: 10, now: 1 });
  const spell = a.questions.find((q) => q.qtype === 'spell');
  assert.ok(spell, 'つづりの問題がある');
  ['meaning', 'nuance', 'scene'].forEach((k) => assert.ok(!/excuse/i.test(spell.prompt[k]), k + ': ' + spell.prompt[k]));
  assert.ok(spell.prompt.meaning.includes('＿＿＿'));
  // 2語の見出し語（a lot）は、つづりの問題にしない
  const lot = all.find((w) => w.headword === 'a lot');
  const b = Q.createAttempt({ kind: 'summary', items: [{ word: lot, sense: lot.senses[0] }], pool, perItem: 4, size: 10, now: 1 });
  assert.ok(!b.questions.some((q) => q.qtype === 'spell'));
  assert.ok(b.questions.length >= 2, '別の形式で出す');
  assert.equal(new Set(b.questions.map((q) => q.qtype)).size, b.questions.length, '同じ単語で同じ形式はくり返さない');
  assert.ok(item('w-begin').word);
});
