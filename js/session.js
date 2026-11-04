/*
 * session.js — 1セット（基本10枚）の組み立てと、回答ごとの進め方
 *
 * 出題の優先順：
 *   1. 復習予定日を過ぎたカード（遅れている順）
 *   2. まだ学習していないカード
 *   3. それでも足りなければ、復習予定が近いカード（前倒し）
 * セット内では「思い出せなかった」は3枚後、「あいまい」は5枚後にもう一度出す。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./util.js'), require('./srs.js'));
  } else {
    root.CIF = root.CIF || {};
    root.CIF.session = factory(root.CIF.util, root.CIF.srs);
  }
})(this, function (util, srs) {
  'use strict';

  const SET_SIZE = 10;
  const MODES = {
    fwd: { key: 'fwd', label: '英語 → 場面', long: '英単語を見て・聞いて、場面と感覚を思い出す' },
    rev: { key: 'rev', label: '場面 → 英語', long: '場面や短い説明から、英単語を思い出す' },
  };
  const POINTS = { good: 10, hard: 6, again: 3, repeat: 1, setBonus: 20, goalBonus: 30 };
  const REQUEUE = {
    again: { gap: 3, max: 3 },
    hard: { gap: 5, max: 1 },
  };

  /** 「要確認」を除いた、出題してよい用法の一覧 */
  function studyable(words) {
    const out = [];
    (words || []).forEach((w) => {
      if (!w || w.status === 'needs_review') return;
      (w.senses || []).forEach((s) => {
        if (!s || s.status === 'needs_review') return;
        out.push({ word: w, sense: s });
      });
    });
    return out;
  }

  function stateOf(progress, senseId, mode) {
    const p = progress && progress[senseId];
    return (p && p[mode]) || null;
  }

  /** 逆向き（場面→英語）に出せるのは、英語→場面で一度でも学習した用法だけ */
  function eligible(item, progress, mode) {
    if (mode === 'fwd') return true;
    const f = stateOf(progress, item.sense.id, 'fwd');
    const hasCue = !!(item.sense.nuance || (item.sense.scene && item.sense.scene.text));
    return !!(f && f.reps > 0 && hasCue);
  }

  function pickCards(words, progress, mode, now, size) {
    const items = studyable(words).filter((it) => eligible(it, progress, mode));
    const due = [];
    const fresh = [];
    const later = [];
    items.forEach((it, index) => {
      const st = stateOf(progress, it.sense.id, mode);
      if (!st || !st.reps) fresh.push({ it, index });
      else if (st.due <= now) due.push({ it, st });
      else later.push({ it, st });
    });
    due.sort((a, b) => a.st.due - b.st.due || b.st.lapses - a.st.lapses);
    later.sort((a, b) => a.st.due - b.st.due);
    const picked = [];
    const early = {};
    due.forEach((d) => picked.length < size && picked.push(d.it.sense.id));
    fresh.forEach((f) => picked.length < size && picked.push(f.it.sense.id));
    later.forEach((l) => {
      if (picked.length < size) {
        picked.push(l.it.sense.id);
        early[l.it.sense.id] = true;
      }
    });
    return { ids: spreadSameWord(picked, words), early };
  }

  /** 同じ単語のカードが続かないように、できる範囲で並べ替える */
  function spreadSameWord(ids, words) {
    const owner = {};
    (words || []).forEach((w) => (w.senses || []).forEach((s) => (owner[s.id] = w.id)));
    const rest = ids.slice();
    const out = [];
    while (rest.length) {
      const prevOwner = out.length ? owner[out[out.length - 1]] : null;
      let i = rest.findIndex((id) => owner[id] !== prevOwner);
      if (i < 0) i = 0;
      out.push(rest.splice(i, 1)[0]);
    }
    return out;
  }

  function build(words, progress, mode, now, opts) {
    const size = (opts && opts.size) || SET_SIZE;
    const { ids, early } = pickCards(words, progress, mode, now, size);
    if (!ids.length) return null;
    return {
      id: util.randomId('set'),
      mode,
      createdAt: now,
      updatedAt: now,
      cards: ids.slice(),
      queue: ids.slice(),
      early,
      results: {},
      answered: 0,
      points: 0,
      flipped: false,
      finished: false,
      goalReached: false,
    };
  }

  function current(session) {
    return session && session.queue.length ? session.queue[0] : null;
  }

  function remaining(session) {
    return session ? session.queue.length : 0;
  }

  /** 進捗バー用（再出題で分母が増える） */
  function progressRatio(session) {
    if (!session) return 0;
    const total = session.answered + session.queue.length;
    return total ? session.answered / total : 1;
  }

  /**
   * 回答を反映する。session / progress は書き換えずに新しいものを返す。
   * 戻り値: { session, progress, event }
   */
  function answer(session, progress, rating, now) {
    if (!srs.RATINGS.includes(rating)) throw new Error('unknown rating');
    const sid = current(session);
    if (!sid) throw new Error('no current card');
    const s = util.clone(session);
    const p = Object.assign({}, progress);
    const mode = s.mode;
    const entry = Object.assign({}, p[sid] || {});
    const result = s.results[sid] || { first: null, answers: [], repeats: 0 };
    const isFirst = result.first === null;
    let points;

    if (isFirst) {
      entry[mode] = srs.review(entry[mode], rating, now);
      result.first = rating;
      points = POINTS[rating];
    } else {
      entry[mode] = srs.recordRepeat(entry[mode], rating, now);
      points = POINTS.repeat;
    }
    result.answers = result.answers.concat(rating);
    result.nextDue = entry[mode].due;
    p[sid] = entry;

    s.queue.shift();
    const rule = REQUEUE[rating];
    const mayRepeat = rule && result.repeats < rule.max && (rating === 'again' || isFirst);
    if (mayRepeat) {
      const at = Math.min(rule.gap, s.queue.length);
      s.queue.splice(at, 0, sid);
      result.repeats += 1;
    }
    s.results[sid] = result;
    s.answered += 1;
    s.points += points;
    s.flipped = false;
    s.updatedAt = now;
    if (!s.queue.length) s.finished = true;

    return {
      session: s,
      progress: p,
      event: { senseId: sid, rating, first: isFirst, points, requeued: !!mayRepeat, finished: s.finished },
    };
  }

  /** 保存してあったセットを再開できる形に整える（削除された単語を除く） */
  function sanitize(session, words) {
    if (!session || !Array.isArray(session.queue)) return null;
    const ids = new Set();
    studyable(words).forEach((it) => ids.add(it.sense.id));
    const s = util.clone(session);
    s.queue = s.queue.filter((id) => ids.has(id));
    s.cards = (s.cards || []).filter((id) => ids.has(id));
    s.results = s.results || {};
    s.flipped = !!s.flipped;
    if (!s.queue.length) s.finished = true;
    return s;
  }

  function summary(session) {
    const out = { good: 0, hard: 0, again: 0, cards: 0, repeats: 0 };
    if (!session) return out;
    Object.keys(session.results).forEach((id) => {
      const r = session.results[id];
      if (r.first) {
        out[r.first] += 1;
        out.cards += 1;
      }
      out.repeats += Math.max(0, r.answers.length - 1);
    });
    return out;
  }

  /** ホーム画面用の件数 */
  function counts(words, progress, now) {
    const items = studyable(words);
    const res = {
      total: items.length,
      dueFwd: 0, newFwd: 0, dueRev: 0, availableRev: 0, newRev: 0,
      tomorrow: 0, week: 0, levels: { new: 0, learning: 0, reviewing: 0, settled: 0 },
    };
    const tomorrowEnd = util.addDays(now, 2);
    const weekEnd = util.addDays(now, 8);
    items.forEach((it) => {
      const f = stateOf(progress, it.sense.id, 'fwd');
      const r = stateOf(progress, it.sense.id, 'rev');
      res.levels[srs.level(f).key] += 1;
      if (!f || !f.reps) res.newFwd += 1;
      else if (f.due <= now) res.dueFwd += 1;
      if (eligible(it, progress, 'rev')) {
        res.availableRev += 1;
        if (!r || !r.reps) res.newRev += 1;
        else if (r.due <= now) res.dueRev += 1;
      }
      [f, r].forEach((st) => {
        if (!st || !st.reps || st.due <= now) return;
        if (st.due < tomorrowEnd && st.due >= util.addDays(now, 1)) res.tomorrow += 1;
        if (st.due < weekEnd) res.week += 1;
      });
    });
    return res;
  }

  /* ---------- 学習記録（日ごと）・ポイント・連続日数 ---------- */

  function emptyLog() {
    return { days: {}, totalPoints: 0 };
  }

  function day(log, now) {
    const key = util.dayKey(now);
    if (!log.days[key]) log.days[key] = { cards: 0, answers: 0, good: 0, hard: 0, again: 0, points: 0, sets: 0 };
    return log.days[key];
  }

  /** 1回の回答を日ごとの記録に足す。目標に届いたらボーナスを返す */
  function logAnswer(log, event, now, dailyGoal) {
    const l = util.clone(log || emptyLog());
    const d = day(l, now);
    const before = d.cards;
    d.answers += 1;
    d.points += event.points;
    l.totalPoints += event.points;
    let bonus = 0;
    if (event.first) {
      d.cards += 1;
      d[event.rating] += 1;
      if (dailyGoal && before < dailyGoal && d.cards >= dailyGoal) {
        bonus = POINTS.goalBonus;
        d.points += bonus;
        l.totalPoints += bonus;
        d.goalReached = true;
      }
    }
    return { log: l, bonus };
  }

  function logSetComplete(log, now) {
    const l = util.clone(log || emptyLog());
    const d = day(l, now);
    d.sets += 1;
    d.points += POINTS.setBonus;
    l.totalPoints += POINTS.setBonus;
    return { log: l, bonus: POINTS.setBonus };
  }

  /** 連続学習日数（1枚でも学習した日が続いた数）。今日まだなら昨日までで数える */
  function streak(log, now) {
    const days = (log && log.days) || {};
    const studied = (ts) => {
      const d = days[util.dayKey(ts)];
      return !!(d && d.cards > 0);
    };
    const todayDone = studied(now);
    let cursor = todayDone ? now : util.addDays(now, -1);
    let n = 0;
    while (studied(cursor)) {
      n += 1;
      cursor = util.addDays(cursor, -1);
      if (n > 3650) break;
    }
    return { days: n, todayDone };
  }

  function today(log, now) {
    const d = log && log.days && log.days[util.dayKey(now)];
    return d || { cards: 0, answers: 0, good: 0, hard: 0, again: 0, points: 0, sets: 0 };
  }

  /** 直近 n 日の学習枚数（古い順） */
  function recentDays(log, now, n) {
    const out = [];
    for (let i = n - 1; i >= 0; i--) {
      const ts = util.addDays(now, -i);
      const d = log && log.days && log.days[util.dayKey(ts)];
      out.push({ ts, key: util.dayKey(ts), cards: d ? d.cards : 0 });
    }
    return out;
  }

  return {
    SET_SIZE, MODES, POINTS, REQUEUE,
    studyable, stateOf, eligible, pickCards, build, current, remaining, progressRatio,
    answer, sanitize, summary, counts,
    emptyLog, logAnswer, logSetComplete, streak, today, recentDays,
  };
});
