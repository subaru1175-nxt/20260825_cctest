/*
 * srs.js — 復習間隔（間隔反復）の計算
 *
 * 3段階の自己評価：
 *   again = 思い出せなかった → 10分後に再出題（セットの中でもすぐもう一度）
 *   hard  = あいまい         → 間隔を半分に（最短で翌日）
 *   good  = 思い出せた       → 間隔を広げる（1日 → 3日 → 約8日 → …）
 *
 * 1回答えられただけでは「定着」にしない。間隔が21日以上かつ
 * 3回続けて思い出せたときに、ようやく「定着してきた」と表示する。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./util.js'));
  } else {
    root.CIF = root.CIF || {};
    root.CIF.srs = factory(root.CIF.util);
  }
})(this, function (util) {
  'use strict';

  const RATINGS = ['again', 'hard', 'good'];
  const RATING_LABEL = { again: '思い出せなかった', hard: 'あいまい', good: '思い出せた' };
  const AGAIN_DELAY = 10 * util.MINUTE;
  const MAX_INTERVAL = 365;
  const MIN_EASE = 1.3;
  const START_EASE = 2.5;
  const HISTORY_LIMIT = 40;

  function newState() {
    return { reps: 0, lapses: 0, streak: 0, interval: 0, ease: START_EASE, due: 0, last: 0, history: [] };
  }

  /** 次の間隔（日数）。0 は「同じ日のうちにもう一度」 */
  function nextInterval(state, rating, now) {
    const s = state || newState();
    if (rating === 'again') return 0;
    if (rating === 'hard') {
      if (s.interval < 1) return 1;
      return Math.max(1, Math.round(s.interval / 2));
    }
    // good
    if (isEarly(s, now)) return s.interval; // 予定より前の復習では間隔を伸ばさない
    if (s.interval < 1) return 1;
    if (s.interval === 1) return 3;
    return Math.min(MAX_INTERVAL, Math.max(s.interval + 1, Math.round(s.interval * s.ease)));
  }

  /** 復習予定日より前に解いているか（同じ日の再出題は除く） */
  function isEarly(state, now) {
    return !!state && state.interval >= 1 && state.due > now;
  }

  /**
   * そのセットで初めて答えたときの更新。
   * 返り値は新しい状態（元の state は変更しない）。
   */
  function review(state, rating, now) {
    if (!RATINGS.includes(rating)) throw new Error('unknown rating: ' + rating);
    const prev = state || newState();
    const s = util.clone(prev);
    s.history = Array.isArray(s.history) ? s.history : [];
    const early = isEarly(prev, now);
    const ivl = nextInterval(prev, rating, now);

    if (rating === 'again') {
      if (prev.reps > 0) s.lapses += 1;
      s.streak = 0;
      s.ease = Math.max(MIN_EASE, round2(s.ease - 0.2));
      s.interval = 0;
      s.due = now + AGAIN_DELAY;
    } else if (rating === 'hard') {
      s.ease = Math.max(MIN_EASE, round2(s.ease - 0.15));
      s.interval = ivl;
      s.due = util.addDays(now, ivl);
      if (early) s.due = Math.min(prev.due, s.due);
    } else {
      if (early) {
        // 予定は変えない（前倒しで当たっても間隔は伸ばさない）
        s.interval = prev.interval;
        s.due = prev.due;
      } else {
        s.streak += 1;
        s.interval = ivl;
        s.due = util.addDays(now, ivl);
      }
    }
    s.reps += 1;
    s.last = now;
    s.history.push({ t: now, r: rating, ivl: s.interval });
    if (s.history.length > HISTORY_LIMIT) s.history = s.history.slice(-HISTORY_LIMIT);
    return s;
  }

  /**
   * 同じセット内で再出題したときの記録。予定は変えず、履歴だけ残す。
   * （「あいまい」で再出題 → 「思い出せた」でも、間隔を2回伸ばさないため）
   */
  function recordRepeat(state, rating, now) {
    const s = util.clone(state || newState());
    s.history = Array.isArray(s.history) ? s.history : [];
    s.history.push({ t: now, r: rating, re: true });
    if (s.history.length > HISTORY_LIMIT) s.history = s.history.slice(-HISTORY_LIMIT);
    if (rating === 'again') {
      // 見直した直後でも思い出せない → 今日のうちにもう一度出す
      s.interval = 0;
      s.streak = 0;
      s.due = now + AGAIN_DELAY;
    }
    return s;
  }

  /** ボタンの下に出す「次はいつ」 */
  function previewLabel(state, rating, now) {
    if (rating === 'again') return '10分後';
    const s = state || newState();
    if (rating === 'good' && isEarly(s, now)) return '予定どおり';
    const ivl = nextInterval(s, rating, now);
    if (ivl === 1) return '明日';
    return ivl + '日後';
  }

  function isDue(state, now) {
    return !!state && state.reps > 0 && state.due <= now;
  }

  /** 習得度。「完全習得」とは言わない */
  const LEVELS = {
    new: { key: 'new', label: '未学習', order: 0 },
    learning: { key: 'learning', label: '覚えはじめ', order: 1 },
    reviewing: { key: 'reviewing', label: '復習中', order: 2 },
    settled: { key: 'settled', label: '定着してきた', order: 3 },
  };

  function level(state) {
    if (!state || !state.reps) return LEVELS.new;
    if (state.interval < 3) return LEVELS.learning;
    if (state.interval >= 21 && state.streak >= 3) return LEVELS.settled;
    return LEVELS.reviewing;
  }

  function round2(n) {
    return Math.round(n * 100) / 100;
  }

  return {
    RATINGS, RATING_LABEL, AGAIN_DELAY, LEVELS,
    newState, nextInterval, isEarly, review, recordRepeat, previewLabel, isDue, level,
  };
});
