/*
 * util.js — 日付・文字列などの小さな共通処理
 * ブラウザでは window.CIF.util、Node（テスト）では require() で使う。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.CIF = root.CIF || {};
    root.CIF.util = factory();
  }
})(this, function () {
  'use strict';

  const MINUTE = 60 * 1000;
  const DAY = 24 * 60 * MINUTE;

  /** その日の 0:00（端末のタイムゾーン）のタイムスタンプ */
  function startOfDay(ts) {
    const d = new Date(ts);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  }

  /** ts の日の 0:00 から n 日後の 0:00（夏時間でもずれない） */
  function addDays(ts, n) {
    const d = new Date(startOfDay(ts));
    d.setDate(d.getDate() + n);
    return d.getTime();
  }

  /** 'YYYY-MM-DD'（端末のタイムゾーン） */
  function dayKey(ts) {
    const d = new Date(ts);
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return d.getFullYear() + '-' + m + '-' + day;
  }

  /** 'YYYY-MM-DD' → その日の 0:00 */
  function parseDayKey(key) {
    const [y, m, d] = key.split('-').map(Number);
    return new Date(y, m - 1, d).getTime();
  }

  /** 2つの日付の「日数の差」（カレンダー上） */
  function daysBetween(fromTs, toTs) {
    return Math.round((startOfDay(toTs) - startOfDay(fromTs)) / DAY);
  }

  /** 復習予定を「今日」「明日」「3日後」「11/12」のように表す */
  function formatDue(due, now) {
    if (!due) return '未定';
    if (due <= now) return '今すぐ';
    const diffMin = Math.round((due - now) / MINUTE);
    if (startOfDay(due) === startOfDay(now)) {
      if (diffMin < 60) return diffMin + '分後';
      return '今日 ' + Math.round(diffMin / 60) + '時間後';
    }
    const days = daysBetween(now, due);
    if (days === 1) return '明日';
    if (days < 7) return days + '日後';
    const d = new Date(due);
    return (d.getMonth() + 1) + '/' + d.getDate() + '（' + days + '日後）';
  }

  /** 「11月4日」のような短い日付 */
  function formatDate(ts) {
    const d = new Date(ts);
    return (d.getMonth() + 1) + '月' + d.getDate() + '日';
  }

  function formatDateTime(ts) {
    const d = new Date(ts);
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    return (d.getMonth() + 1) + '/' + d.getDate() + ' ' + hh + ':' + mm;
  }

  /** HTML に入れる文字列のエスケープ */
  function esc(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /**
   * 例文の [ ] で囲んだ部分（その用法の単語）を取り出す。
   * "I'm [pretty] tired." → [{t:"I'm "}, {t:"pretty", hit:true}, {t:" tired."}]
   */
  function parseMarked(text) {
    const parts = [];
    const re = /\[([^\]]+)\]/g;
    let last = 0;
    let m;
    const s = String(text || '');
    while ((m = re.exec(s))) {
      if (m.index > last) parts.push({ t: s.slice(last, m.index) });
      parts.push({ t: m[1], hit: true });
      last = re.lastIndex;
    }
    if (last < s.length) parts.push({ t: s.slice(last) });
    return parts;
  }

  /** 読み上げ用に [ ] を外した文 */
  function plainSentence(text) {
    return String(text || '').replace(/\[([^\]]+)\]/g, '$1');
  }

  /** 例文の [ ] の部分を強調した HTML */
  function markedHtml(text) {
    return parseMarked(text)
      .map((p) => (p.hit ? '<mark class="hit">' + esc(p.t) + '</mark>' : esc(p.t)))
      .join('');
  }

  /** 例文の [ ] の部分を空欄にした HTML（場面→英語の練習用） */
  function clozeHtml(text) {
    return parseMarked(text)
      .map((p) => (p.hit ? '<span class="blank" aria-label="空欄">＿＿＿</span>' : esc(p.t)))
      .join('');
  }

  /** ID に使える短いランダム文字列 */
  function randomId(prefix) {
    const r = Math.random().toString(36).slice(2, 8);
    const t = Date.now().toString(36).slice(-4);
    return (prefix || 'id') + '-' + t + r;
  }

  /** 英単語から ID 用の文字列を作る */
  function slug(text) {
    return String(text || '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 24) || 'word';
  }

  function clone(obj) {
    return obj == null ? obj : JSON.parse(JSON.stringify(obj));
  }

  /** 配列を並べ替えた新しい配列（rng を渡すとテストで再現できる） */
  function shuffle(arr, rng) {
    const a = arr.slice();
    const rand = rng || Math.random;
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  return {
    MINUTE, DAY, startOfDay, addDays, dayKey, parseDayKey, daysBetween,
    formatDue, formatDate, formatDateTime, esc, parseMarked, plainSentence,
    markedHtml, clozeHtml, randomId, slug, clone, shuffle,
  };
});
