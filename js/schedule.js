/*
 * schedule.js — 1日の区切りと、テストの時間割
 *
 *   1日の区切り … 朝 4:00。夜ふかしの時間（0:00〜4:00）は前の日として数える
 *   毎日のテスト … 毎日 testTime（はじめは 20:00）から、次の朝 4:00 まで受けられる
 *   再テスト     … テストで間違えた問題は「次の日のテストの時間」に必須。また間違えたら、その次の日も（満点まで続く）
 *   まとめテスト … 使いはじめた日を1日目として、5日目・10日目…の日のテストの時間から。前の回のあとに学習した単語を、応用の形式で
 *   月のまとめ   … 毎月1日のテストの時間から。先月に学習した単語を、応用の形式で約50問
 *   通知         … カレンダーの予定（.ics）にして、端末のカレンダーから時間に通知が来るようにする
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./util.js'));
  } else {
    root.CIF = root.CIF || {};
    root.CIF.schedule = factory(root.CIF.util);
  }
})(this, function (util) {
  'use strict';

  const HOUR = 60 * util.MINUTE;
  const DAY_START = 4;
  const SUMMARY_EVERY = 5;
  const DEFAULT_TIME = '20:00';
  const TIMES = ['18:00', '18:30', '19:00', '19:30', '20:00', '20:30', '21:00', '21:30', '22:00'];

  function parseTime(t) {
    const m = /^(\d{1,2}):(\d{2})$/.exec(String(t || ''));
    if (!m) return { h: 20, m: 0 };
    return { h: Math.min(23, Number(m[1])), m: Math.min(59, Number(m[2])) };
  }

  /** 選べる時刻（TIMES）にそろえる。それ以外は 20:00 */
  function normalizeTime(t) {
    const p = parseTime(t);
    const s = String(p.h).padStart(2, '0') + ':' + String(p.m).padStart(2, '0');
    return TIMES.includes(s) ? s : DEFAULT_TIME;
  }

  /** その日（dayTs の日）の h:m の時刻 */
  function timeOn(dayTs, testTime) {
    const { h, m } = parseTime(testTime);
    const d = new Date(util.startOfDay(dayTs));
    d.setHours(h, m, 0, 0);
    return d.getTime();
  }

  function at4(dayTs) {
    const d = new Date(util.startOfDay(dayTs));
    d.setHours(DAY_START, 0, 0, 0);
    return d.getTime();
  }

  /** 日付の数え方に使う時刻（朝4:00より前は前の日になる）。学習記録の日付・連続日数に使う */
  function dayClock(now) {
    return now - DAY_START * HOUR;
  }

  /** いまの「学習の日」（その日の 0:00）。朝4:00より前は前の日 */
  function studyDay(now) {
    return util.startOfDay(dayClock(now));
  }

  /** いまの学習の日の範囲：その日の朝4:00 〜 次の日の朝4:00 */
  function dayRange(now) {
    const day = studyDay(now);
    return { day, from: at4(day), to: at4(util.addDays(day, 1)) };
  }

  /**
   * いまのテストの時間帯
   *   open  … いまテストを受けられるか（テストの時刻から、次の朝4:00まで）
   *   day   … 学習の日（0:00）
   *   start … その日のテストの時刻
   *   end   … 受けられる時間の終わり（次の朝4:00）
   */
  function windowAt(now, testTime) {
    const r = dayRange(now);
    const start = timeOn(r.day, testTime);
    return { open: now >= start && now < r.to, day: r.day, start, end: r.to };
  }

  /** 間違えた問題の再テストの時刻：次の日のテストの時間 */
  function retestDue(now, testTime) {
    return timeOn(util.addDays(studyDay(now), 1), testTime);
  }

  /** startDayTs から数えて k 回目のまとめテストの日 */
  function summaryDay(startDayTs, k) {
    return util.addDays(util.startOfDay(startDayTs), k * SUMMARY_EVERY - 1);
  }

  /**
   * まとめテスト（5日ごと）。いま受けられる（または受けた）いちばん新しい回。まだなければ null。
   *   from〜to … この回で出す単語を学習した時間（前の回が始まってから、この回が始まるまで）
   */
  function summaryPeriod(now, testTime, startDayTs) {
    const n = util.daysBetween(util.startOfDay(startDayTs), studyDay(now)) + 1;
    let k = Math.floor(n / SUMMARY_EVERY);
    if (k >= 1 && now < timeOn(summaryDay(startDayTs, k), testTime)) k -= 1;
    if (k < 1) return null;
    const dueDay = summaryDay(startDayTs, k);
    const opensAt = timeOn(dueDay, testTime);
    return {
      key: util.dayKey(dueDay),
      no: k,
      dueDay,
      opensAt,
      from: k === 1 ? 0 : timeOn(summaryDay(startDayTs, k - 1), testTime),
      to: opensAt,
      firstDay: k === 1 ? util.startOfDay(startDayTs) : util.addDays(dueDay, -(SUMMARY_EVERY - 1)),
    };
  }

  /** 次のまとめテストの日（今日がその日で、まだテストの時間前なら今日） */
  function nextSummaryDay(now, testTime, startDayTs) {
    const n = util.daysBetween(util.startOfDay(startDayTs), studyDay(now)) + 1;
    let k = Math.max(1, Math.ceil(n / SUMMARY_EVERY));
    if (now >= timeOn(summaryDay(startDayTs, k), testTime)) k += 1;
    return summaryDay(startDayTs, k);
  }

  function monthKey(ts) {
    const d = new Date(ts);
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
  }

  function firstOfMonth(ts, add) {
    const d = new Date(ts);
    return new Date(d.getFullYear(), d.getMonth() + (add || 0), 1).getTime();
  }

  /**
   * 月のまとめテスト：毎月1日のテストの時間から、先月の分。
   * 1日のテストの時間より前なら、まだ前の月の回（その前の月の分）。
   */
  function monthlyPeriod(now, testTime) {
    let first = firstOfMonth(studyDay(now));
    if (now < timeOn(first, testTime)) first = firstOfMonth(first, -1);
    const prev = firstOfMonth(first, -1);
    return {
      key: monthKey(prev),
      month: new Date(prev).getMonth() + 1,
      opensAt: timeOn(first, testTime),
      from: at4(prev),
      to: at4(first),
    };
  }

  /** 次の月のまとめテストの日（今日が1日で、まだテストの時間前なら今日） */
  function nextMonthlyDay(now, testTime) {
    const first = firstOfMonth(studyDay(now));
    if (now < timeOn(first, testTime)) return first;
    return firstOfMonth(first, 1);
  }

  /** from〜to のあいだに学習した（カードで評価した）用法 */
  function studiedBetween(items, progress, from, to) {
    return (items || []).filter((it) => ['fwd', 'rev'].some((mode) => {
      const st = progress && progress[it.sense.id] && progress[it.sense.id][mode];
      return st && Array.isArray(st.history) && st.history.some((h) => h.t >= from && h.t < to);
    }));
  }

  /** 時刻の表示（「20:00」） */
  function clock(ts) {
    const d = new Date(ts);
    return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  }

  /** あとどのくらいか（「2時間5分」「15分」） */
  function untilText(ms) {
    const min = Math.max(1, Math.ceil(ms / util.MINUTE));
    const h = Math.floor(min / 60);
    const m = min % 60;
    return h ? h + '時間' + (m ? m + '分' : '') : m + '分';
  }

  /* ---------- 通知（カレンダーの予定） ---------- */

  function icsText(s) {
    return String(s).replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/([,;])/g, '\\$1');
  }

  /** 端末の時刻のまま書く（タイムゾーンを書かない） */
  function localStamp(ts) {
    const d = new Date(ts);
    const p = (n) => String(n).padStart(2, '0');
    return d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + 'T' + p(d.getHours()) + p(d.getMinutes()) + '00';
  }

  function utcStamp(ts) {
    return new Date(ts).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
  }

  /** 1行75バイトまで（それより長い行は折り返す） */
  function fold(line) {
    const out = [];
    let cur = '';
    let bytes = 0;
    for (const ch of line) {
      const cp = ch.codePointAt(0);
      const b = cp < 0x80 ? 1 : cp < 0x800 ? 2 : cp < 0x10000 ? 3 : 4;
      if (bytes + b > (out.length ? 74 : 75)) {
        out.push(cur);
        cur = '';
        bytes = 0;
      }
      cur += ch;
      bytes += b;
    }
    out.push(cur);
    return out.join('\r\n ');
  }

  /** カレンダーに入れる予定：毎日のテスト・まとめテスト（5日ごと）・月のまとめテスト（毎月1日） */
  function events(opts) {
    const now = opts.now || Date.now();
    const t = normalizeTime(opts.testTime);
    const name = opts.appName || '暗記CARD';
    return [
      { uid: 'daily-test', day: studyDay(now), rule: 'FREQ=DAILY', title: name + '　テストの時間', text: '今日のテストと、必須の再テストを受けましょう（再テストは満点まで毎日続きます）。' },
      { uid: 'summary-test', day: nextSummaryDay(now, t, opts.startDay || now), rule: 'FREQ=DAILY;INTERVAL=' + SUMMARY_EVERY, title: name + '　まとめテスト（5日ごと）', text: 'この5日間に学習した単語の、まとめテストの日です。' },
      { uid: 'monthly-test', day: nextMonthlyDay(now, t), rule: 'FREQ=MONTHLY;BYMONTHDAY=1', title: name + '　月のまとめテスト', text: '先月に学習した単語の、まとめテスト（約50問）の日です。' },
    ].map((e) => Object.assign(e, { start: timeOn(e.day, t) }));
  }

  /** 端末のカレンダーに入れる予定（.ics）。どれも、その時刻に通知する */
  function calendar(opts) {
    const now = opts.now || Date.now();
    const name = opts.appName || '暗記CARD';
    const url = opts.url || '';
    const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//ankicard//JP', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'X-WR-CALNAME:' + icsText(name)];
    events(opts).forEach((e) => {
      lines.push(
        'BEGIN:VEVENT',
        'UID:' + e.uid + '@ankicard',
        'DTSTAMP:' + utcStamp(now),
        'DTSTART:' + localStamp(e.start),
        'DURATION:PT30M',
        'RRULE:' + e.rule,
        'SUMMARY:' + icsText(e.title),
        'DESCRIPTION:' + icsText(e.text + (url ? '\n' + url : '')),
        'BEGIN:VALARM',
        'ACTION:DISPLAY',
        'TRIGGER:PT0M',
        'DESCRIPTION:' + icsText(e.title),
        'END:VALARM',
        'END:VEVENT'
      );
    });
    lines.push('END:VCALENDAR');
    return lines.map(fold).join('\r\n') + '\r\n';
  }

  /** Googleカレンダーの「予定を作る」画面（uid：daily-test / summary-test / monthly-test） */
  function googleCalendarUrl(opts, uid) {
    const e = events(opts).find((x) => x.uid === (uid || 'daily-test'));
    const q = [
      ['action', 'TEMPLATE'],
      ['text', e.title],
      ['dates', localStamp(e.start) + '/' + localStamp(e.start + 30 * util.MINUTE)],
      ['recur', 'RRULE:' + e.rule],
      ['details', e.text + (opts.url ? '\n' + opts.url : '')],
    ];
    return 'https://calendar.google.com/calendar/render?' + q.map(([k, v]) => k + '=' + encodeURIComponent(v)).join('&');
  }

  return {
    HOUR, DAY_START, SUMMARY_EVERY, DEFAULT_TIME, TIMES,
    parseTime, normalizeTime, timeOn, dayClock, studyDay, dayRange, windowAt, retestDue,
    summaryDay, summaryPeriod, nextSummaryDay, monthKey, monthlyPeriod, nextMonthlyDay, studiedBetween,
    clock, untilText, events, calendar, googleCalendarUrl,
  };
});
