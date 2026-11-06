/*
 * quiz.js — テストと「覚えていないリスト」
 *
 * テストの種類（kind）
 *   round    … 回のテスト（全範囲・合計100点）
 *                1. 内容理解（50点）… 4択。意味／場面→単語／例文の空所 を回ごとに順番に出す
 *                2. 文章作成・応用（50点）… カードにない新しい例文を、単語を並べ替えて作る
 *   daily    … 今日のテスト。今日学習した単語を、回のテストと同じ形で（合計100点）
 *   retest   … 再テスト。間違えた問題を、間違えたときと同じ形式で、次の日のテストの時間に（満点まで毎日）
 *   summary  … まとめテスト（5日ごと）。応用の形式（聞き取り・新しい文の空所・つづり・並べ替え）
 *   monthly  … 月のまとめテスト（毎月1日、先月の分を約50問）。形式は summary と同じ
 *   practice … 間違えた問題の練習。いつでも解ける。覚えていないリストは変えない（記録には入れない）
 *   review   … 前の版の「解き直し」（記録を読むためだけに残す）
 * 間違えた問題は「覚えていないリスト」にたまっていく（回をまたいで蓄積）。dueAt は再テストの時刻。
 * 再テストの時刻を過ぎてから正解すると「克服」になる（同じ日のうちの正解では克服にしない）。記録は消さない。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./util.js'), require('./session.js'));
  } else {
    root.CIF = root.CIF || {};
    root.CIF.quiz = factory(root.CIF.util, root.CIF.session);
  }
})(this, function (util, SS) {
  'use strict';

  const PARTS = {
    understand: { key: 'understand', label: '内容理解', points: 50 },
    compose: { key: 'compose', label: '文章作成（応用）', points: 50 },
  };
  const QTYPE = {
    meaning: '意味を選ぶ',
    scene: '場面から単語を選ぶ',
    cloze: '例文の空所',
    order: '並べ替えて英文を作る',
    listen: '聞いて意味を選ぶ',
    context: '新しい文の空所',
    spell: 'つづりを組み立てる',
  };
  const KINDS = ['round', 'daily', 'retest', 'summary', 'monthly', 'practice', 'review'];
  const KIND_LABEL = { round: 'シリーズのテスト', daily: '今日のテスト', retest: '再テスト', summary: 'まとめテスト', monthly: '月のまとめテスト', practice: '練習', review: '解き直し' };
  /** 内容理解・文章作成をそれぞれ50点にして合計する種類（それ以外は正解の割合で100点） */
  const HALF_SCORED = ['round', 'daily'];

  /** 再現できる乱数（同じ seed なら同じ並び） */
  function rng(seed) {
    let a = seed >>> 0 || 1;
    return function () {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function hash(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  /** 回の単語から、出題できる用法（要確認を除く）を回の順に並べる */
  function roundItems(words, round) {
    const byId = new Map((words || []).map((w) => [w.id, w]));
    const out = [];
    ((round && round.wordIds) || []).forEach((id) => {
      const w = byId.get(id);
      if (!w || w.status === 'needs_review') return;
      w.senses.forEach((s) => {
        if (s.status !== 'needs_review' && s.meaning) out.push({ word: w, sense: s });
      });
    });
    return out;
  }

  /* ---------- 並べ替えの文 ---------- */

  function testSentence(sense) {
    if (sense.test && sense.test.en) return sense.test;
    const ex = sense.examples && sense.examples[sense.examples.length - 1];
    return ex ? { en: ex.en, ja: ex.ja, alts: [] } : null;
  }

  /** 文を並べ替え用の語に分ける。最後の . ? ! は外して end に。1語目は文頭とわからないよう小文字にする */
  function tokenize(en) {
    const plain = util.plainSentence(en).replace(/\s+/g, ' ').trim();
    const m = plain.match(/^(.*?)([.?!]+)$/);
    const body = m ? m[1] : plain;
    const end = m ? m[2] : '';
    const tokens = body.split(' ').filter(Boolean);
    if (tokens.length && !/^I(['’]|$)/.test(tokens[0])) {
      tokens[0] = tokens[0].charAt(0).toLowerCase() + tokens[0].slice(1);
    }
    return { tokens, end };
  }

  function normText(s) {
    return String(s || '').toLowerCase().replace(/[’]/g, "'").replace(/[.?!]+$/, '').replace(/\s+/g, ' ').trim();
  }

  /* ---------- 問題を作る ---------- */

  function pick(list, n, r) {
    return util.shuffle(list, r).slice(0, n);
  }

  /** 意味の選択肢（3つ）。{ text, sid }。sid はその意味の用法 */
  function meaningChoices(item, pool, r) {
    const correct = item.sense.meaning;
    const used = new Set([correct]);
    const out = [];
    // 同じ単語のほかの用法は、見分ける練習になるので1つ入れる
    item.word.senses.forEach((s) => {
      if (out.length < 1 && s.id !== item.sense.id && s.meaning && !used.has(s.meaning) && s.status !== 'needs_review') {
        out.push({ text: s.meaning, sid: s.id });
        used.add(s.meaning);
      }
    });
    const others = pool.filter((p) => p.sense.id !== item.sense.id && p.word.id !== item.word.id);
    const same = others.filter((p) => p.sense.pos === item.sense.pos);
    [pick(same, 12, r), pick(others, 12, r)].forEach((cands) => {
      cands.forEach((p) => {
        if (out.length < 3 && !used.has(p.sense.meaning)) {
          out.push({ text: p.sense.meaning, sid: p.sense.id });
          used.add(p.sense.meaning);
        }
      });
    });
    return out;
  }

  /** 単語の選択肢（3つ）。{ text, sid }。sid はその単語の用法の1つ */
  function wordChoices(item, pool, r) {
    const used = new Set([item.word.headword.toLowerCase()]);
    const out = [];
    const others = pool.filter((p) => p.word.id !== item.word.id);
    const same = others.filter((p) => p.sense.pos === item.sense.pos);
    [pick(same, 12, r), pick(others, 12, r)].forEach((cands) => {
      cands.forEach((p) => {
        const h = p.word.headword;
        if (out.length < 3 && !used.has(h.toLowerCase())) {
          out.push({ text: h, sid: p.sense.id });
          used.add(h.toLowerCase());
        }
      });
    });
    return out;
  }

  /** 正解と選択肢をまぜて、問題の形にする */
  function withChoices(q, correct, others, r) {
    const all = util.shuffle(others.concat([correct]), r);
    q.choices = all.map((c) => c.text);
    q.choiceIds = all.map((c) => c.sid);
    q.answer = all.indexOf(correct);
    return q;
  }

  /** 空所問題に使える例文（[ ] の語が見出し語そのままのもの） */
  function clozeExample(item) {
    const head = item.word.headword.toLowerCase();
    return (item.sense.examples || []).find((ex) => {
      const hits = util.parseMarked(ex.en).filter((p) => p.hit);
      return hits.length === 1 && hits[0].t.toLowerCase() === head;
    }) || null;
  }

  /** 内容理解の問題。want を渡すと、その形式で（作れないときは順番の形式） */
  function understandQuestion(item, index, attemptNo, pool, r, want) {
    const types = ['meaning'];
    if (item.sense.nuance || (item.sense.scene && item.sense.scene.text)) types.push('scene');
    const cz = clozeExample(item);
    if (cz) types.push('cloze');
    const qtype = types.includes(want) ? want : types[(index + attemptNo) % types.length];
    let choices;
    let correct;
    const prompt = { headword: item.word.headword, cue: item.sense.cue, speak: item.sense.speak || item.word.headword, ipa: item.sense.ipa };
    if (qtype === 'meaning') {
      correct = { text: item.sense.meaning, sid: item.sense.id };
      choices = meaningChoices(item, pool, r);
    } else {
      correct = { text: item.word.headword, sid: item.sense.id };
      choices = wordChoices(item, pool, r);
      if (qtype === 'scene') {
        prompt.scene = (item.sense.scene && item.sense.scene.text) || '';
        prompt.nuance = item.sense.nuance;
        prompt.diagram = (item.sense.scene && item.sense.scene.diagram) || '';
        prompt.role = item.sense.role;
        prompt.pos = item.sense.pos;
      } else {
        prompt.exEn = cz.en;
        prompt.exJa = cz.ja;
      }
    }
    return withChoices({
      id: 'u-' + item.sense.id,
      part: 'understand',
      qtype,
      senseId: item.sense.id,
      wordId: item.word.id,
      prompt,
    }, correct, choices, r);
  }

  /* ---------- 応用の形式（まとめテスト・月のまとめテスト） ---------- */

  /** 新しい文（テスト用の例文）の空所に入る単語を選ぶ。[ ] が見出し語1つのときだけ */
  function contextQuestion(item, pool, r, n) {
    const t = item.sense.test;
    if (!t || !t.en) return null;
    const hits = util.parseMarked(t.en).filter((p) => p.hit);
    if (hits.length !== 1 || hits[0].t.toLowerCase() !== item.word.headword.toLowerCase()) return null;
    return withChoices({
      id: 'x' + n + '-' + item.sense.id,
      part: 'understand',
      qtype: 'context',
      senseId: item.sense.id,
      wordId: item.word.id,
      prompt: { headword: item.word.headword, exEn: t.en, exJa: t.ja },
    }, { text: item.word.headword, sid: item.sense.id }, wordChoices(item, pool, r), r);
  }

  /** 英文（テスト用の例文）を聞いて、合う日本語訳を選ぶ */
  function listenQuestion(item, pool, r, n) {
    const t = testSentence(item.sense);
    if (!t || !t.ja) return null;
    const used = new Set([t.ja]);
    const others = [];
    pick(pool.filter((p) => p.sense.id !== item.sense.id), 30, r).forEach((p) => {
      const o = testSentence(p.sense);
      if (others.length < 3 && o && o.ja && !used.has(o.ja)) {
        others.push({ text: o.ja, sid: p.sense.id });
        used.add(o.ja);
      }
    });
    if (others.length < 3) return null;
    return withChoices({
      id: 'l' + n + '-' + item.sense.id,
      part: 'understand',
      qtype: 'listen',
      senseId: item.sense.id,
      wordId: item.word.id,
      prompt: { headword: item.word.headword, sentence: t.en, plain: util.plainSentence(t.en) },
    }, { text: t.ja, sid: item.sense.id }, others, r);
  }

  /** 説明の中に答えの単語が書いてあるときは、伏せる（「（Excuse me. で）」→「（＿＿＿ me. で）」） */
  function maskWord(text, head) {
    if (!text) return '';
    const re = new RegExp('\\b' + head.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'gi');
    return String(text).replace(re, '＿＿＿');
  }

  /** 意味と場面を見て、英単語のつづりを文字から組み立てる（1語で、英字だけの単語） */
  function spellQuestion(item, r, n) {
    const head = item.word.headword;
    if (!/^[A-Za-z]{3,}$/.test(head)) return null;
    const letters = head.split('');
    let order = util.shuffle(letters.map((_, i) => i), r);
    for (let k = 0; k < 5 && order.map((i) => letters[i]).join('') === letters.join(''); k++) order = util.shuffle(order, r);
    if (order.map((i) => letters[i]).join('') === letters.join('')) order = order.slice(1).concat(order[0]);
    return {
      id: 's' + n + '-' + item.sense.id,
      part: 'compose',
      qtype: 'spell',
      senseId: item.sense.id,
      wordId: item.word.id,
      prompt: {
        headword: head,
        meaning: maskWord(item.sense.meaning, head),
        nuance: maskWord(item.sense.nuance, head),
        scene: maskWord((item.sense.scene && item.sense.scene.text) || '', head),
        pos: item.sense.pos,
        role: item.sense.role,
      },
      tokens: letters,
      order,
      end: '',
      answers: [letters.join('').toLowerCase()],
    };
  }

  const APPLIED = ['context', 'listen', 'spell', 'order'];

  /** 応用の問題を1つ。type が作れないときは、ほかの形式で作る（avoid の形式は使わない） */
  function appliedQuestion(item, type, pool, r, n, avoid) {
    const tries = [type].concat(APPLIED.filter((t) => t !== type)).filter((t) => !avoid || !avoid.has(t));
    for (const t of tries) {
      let q = null;
      if (t === 'context') q = contextQuestion(item, pool, r, n);
      else if (t === 'listen') q = listenQuestion(item, pool, r, n);
      else if (t === 'spell') q = spellQuestion(item, r, n);
      else {
        q = composeQuestion(item, r);
        if (q) q.id = 'o' + n + '-' + item.sense.id;
      }
      if (q) return q;
    }
    return null;
  }

  /**
   * 再テスト・練習の問題：間違えたときと同じ形式で作る（作れないときは、その部のふつうの形式）
   *   part … 'understand' / 'compose'、qtype … 間違えたときの形式
   */
  function retestQuestion(item, part, qtype, index, attemptNo, pool, r) {
    let q = null;
    if (part === 'understand') {
      if (qtype === 'listen') q = listenQuestion(item, pool, r, 0);
      else if (qtype === 'context') q = contextQuestion(item, pool, r, 0);
      if (!q) q = understandQuestion(item, index, attemptNo, pool, r, qtype);
    } else {
      if (qtype === 'spell') q = spellQuestion(item, r, 0);
      if (!q) q = composeQuestion(item, r);
      if (!q && qtype !== 'spell') q = spellQuestion(item, r, 0);
    }
    return q;
  }

  function composeQuestion(item, r) {
    const t = testSentence(item.sense);
    if (!t) return null;
    const { tokens, end } = tokenize(t.en);
    if (tokens.length < 2) return null;
    let order = util.shuffle(tokens.map((_, i) => i), r);
    for (let k = 0; k < 5 && order.every((v, i) => v === i); k++) order = util.shuffle(order, r);
    if (order.every((v, i) => v === i)) order = order.slice(1).concat(order[0]);
    return {
      id: 'c-' + item.sense.id,
      part: 'compose',
      qtype: 'order',
      senseId: item.sense.id,
      wordId: item.word.id,
      prompt: { ja: t.ja, headword: item.word.headword, sentence: t.en },
      tokens,
      order,
      end,
      answers: [normText(tokens.join(' '))].concat((t.alts || []).map(normText)),
    };
  }

  /**
   * テスト1回分を作る。
   *   kind 'round' / 'daily' … 内容理解 → 文章作成。それぞれ items の全用法
   *   kind 'retest' / 'practice' … only の「用法|部」だけ。qtypes（「用法|部」→ 形式）があれば、その形式で
   *   kind 'summary' / 'monthly' … 応用の形式。perItem：1つの用法から何問、size：最大の問題数
   */
  function createAttempt(opts) {
    const now = opts.now || Date.now();
    const kind = KINDS.includes(opts.kind) ? opts.kind : 'round';
    const seed = hash(kind + ':' + (opts.roundId || opts.period || '') + ':' + (opts.no || 0) + ':' + now);
    const r = rng(seed);
    // 回のテストは回の順に。ほかは順番をまぜる（学習した順と同じにならないように）
    const items = kind === 'round' ? opts.items || [] : util.shuffle(opts.items || [], r);
    const pool = opts.pool && opts.pool.length >= 4 ? opts.pool : items;
    const u = [];
    const c = [];
    if (kind === 'summary' || kind === 'monthly') {
      const perItem = Math.max(1, Math.min(APPLIED.length, opts.perItem || 1));
      const size = opts.size || 50;
      // 1つの単語から2問なら「わかる（空所・聞き取り）」と「書ける（つづり・並べ替え）」を1問ずつ
      const OFFSET = [0, 2, 1, 3];
      const used = {};
      for (let k = 0; k < perItem; k++) {
        items.forEach((item, i) => {
          if (u.length + c.length >= size) return;
          const avoid = used[item.sense.id] || (used[item.sense.id] = new Set());
          const q = appliedQuestion(item, APPLIED[(i + OFFSET[k]) % APPLIED.length], pool, r, k, avoid);
          if (!q) return;
          avoid.add(q.qtype);
          (q.part === 'understand' ? u : c).push(q);
        });
      }
    } else if (kind === 'retest' || kind === 'practice') {
      const want = new Set(opts.only || []); // 'senseId|part'
      const qtypes = opts.qtypes || {};
      items.forEach((item, i) => {
        ['understand', 'compose'].forEach((part) => {
          const key = item.sense.id + '|' + part;
          if (!want.has(key)) return;
          const q = retestQuestion(item, part, qtypes[key], i, opts.no || 1, pool, r);
          if (q) (q.part === 'understand' ? u : c).push(q);
        });
      });
    } else {
      const want = opts.only ? new Set(opts.only) : null; // 'senseId|part'
      items.forEach((item, i) => {
        if (!want || want.has(item.sense.id + '|understand')) u.push(understandQuestion(item, i, opts.no || 1, pool, r));
        if (!want || want.has(item.sense.id + '|compose')) {
          const q = composeQuestion(item, r);
          if (q) c.push(q);
        }
      });
    }
    return {
      id: util.randomId('test'),
      kind,
      roundId: opts.roundId || '',
      period: opts.period || '',
      no: opts.no || 0,
      startedAt: now,
      updatedAt: now,
      questions: u.concat(c),
      index: 0,
      results: [],
    };
  }

  function current(attempt) {
    return attempt && attempt.questions[attempt.index] ? attempt.questions[attempt.index] : null;
  }

  function isDone(attempt) {
    return !attempt || attempt.index >= attempt.questions.length;
  }

  /** 回答を判定する（response: 4択は番号、並べ替え・つづりは番号の並び、null は「わからない」） */
  function judge(q, response) {
    if (q.part === 'understand') {
      const ok = response === q.answer;
      return { correct: ok, given: response == null ? '（わからない）' : q.choices[response] || '', expected: q.choices[q.answer] };
    }
    if (q.qtype === 'spell') {
      const word = Array.isArray(response) ? response.map((i) => q.tokens[i]).join('') : '';
      return { correct: !!word && q.answers.includes(word.toLowerCase()), given: word || '（わからない）', expected: q.prompt.headword };
    }
    const built = Array.isArray(response) ? response.map((i) => q.tokens[i]).join(' ') : '';
    const ok = !!built && q.answers.includes(normText(built));
    return {
      correct: ok,
      given: built ? built + q.end : '（わからない）',
      expected: util.plainSentence(q.prompt.sentence),
    };
  }

  /**
   * 回答を記録する。attempt / tests は書き換えずに新しいものを返す。
   * 間違えた問題はすぐに覚えていないリストへ入れる（途中でやめても残る）。dueAt は再テストの時刻（opts.nextDue）。
   * 正解でも、再テストの時刻より前なら克服にしない（次の日にもう一度確かめる）。
   * 練習（practice）は、覚えていないリストを変えない。
   */
  function answer(tests, attempt, response, now, opts) {
    const nextDue = (opts && opts.nextDue) || now + util.DAY;
    const q = current(attempt);
    if (!q) throw new Error('no question');
    const res = judge(q, response);
    const a = util.clone(attempt);
    a.results.push({ qid: q.id, correct: res.correct, given: res.given });
    a.index += 1;
    a.updatedAt = now;
    const t = util.clone(tests);
    t.current = a;
    const key = q.senseId + '|' + q.part;
    const m = t.misses[key];
    if (attempt.kind === 'practice') {
      // 練習は記録しない
    } else if (!res.correct) {
      const e = m || { senseId: q.senseId, part: q.part, roundIds: [], count: 0, firstAt: now, lastAt: 0, solvedAt: 0, dueAt: 0, last: {} };
      e.count += 1;
      e.lastAt = now;
      e.solvedAt = 0;
      e.dueAt = nextDue;
      if (attempt.roundId && !e.roundIds.includes(attempt.roundId)) e.roundIds.push(attempt.roundId);
      e.last = { qtype: q.qtype, given: res.given, answer: res.expected };
      t.misses[key] = e;
    } else if (m && !m.solvedAt && now >= (m.dueAt || 0)) {
      m.solvedAt = now;
    }
    return { tests: t, attempt: a, result: Object.assign({ question: q }, res) };
  }

  function partScore(correct, total) {
    return total ? Math.floor((PARTS.understand.points * correct) / total) : 0;
  }

  /** 終わったテストを集計して記録に残す */
  function finish(tests, attempt, now) {
    const t = util.clone(tests);
    const parts = { understand: { correct: 0, total: 0 }, compose: { correct: 0, total: 0 } };
    const wrongs = [];
    attempt.questions.forEach((q, i) => {
      const r = attempt.results[i];
      parts[q.part].total += 1;
      if (r && r.correct) parts[q.part].correct += 1;
      else {
        wrongs.push({
          senseId: q.senseId,
          part: q.part,
          qtype: q.qtype,
          given: r ? r.given : '（未回答）',
          answer: q.part === 'understand' ? q.choices[q.answer] : q.qtype === 'spell' ? q.prompt.headword : util.plainSentence(q.prompt.sentence),
        });
      }
    });
    const total = parts.understand.total + parts.compose.total;
    const correct = parts.understand.correct + parts.compose.correct;
    let score;
    if (total && correct === total) score = 100;
    else if (HALF_SCORED.includes(attempt.kind)) score = partScore(parts.understand.correct, parts.understand.total) + partScore(parts.compose.correct, parts.compose.total);
    else score = total ? Math.floor((100 * correct) / total) : 0;
    const summary = {
      id: attempt.id,
      kind: attempt.kind,
      roundId: attempt.roundId,
      period: attempt.period || '',
      no: attempt.no,
      startedAt: attempt.startedAt,
      finishedAt: now,
      score,
      parts,
      wrongs,
    };
    t.attempts = t.attempts.concat([summary]);
    t.current = null;
    return { tests: t, summary };
  }

  /* ---------- 集計 ---------- */

  function roundAttempts(tests, roundId) {
    return ((tests && tests.attempts) || []).filter((a) => a.kind === 'round' && a.roundId === roundId).sort((a, b) => a.no - b.no);
  }

  function nextNo(tests, roundId) {
    const list = roundAttempts(tests, roundId);
    return list.length ? list[list.length - 1].no + 1 : 1;
  }

  /** 回の成績：受験回数・最高点・前回・何回目で満点か */
  function roundStats(tests, roundId) {
    const list = roundAttempts(tests, roundId);
    const perfect = list.find((a) => a.score === 100) || null;
    return {
      attempts: list,
      count: list.length,
      best: list.length ? Math.max.apply(null, list.map((a) => a.score)) : null,
      last: list.length ? list[list.length - 1] : null,
      perfectAt: perfect,
    };
  }

  /** 覚えていないリスト。status: 'open'（まだ）/'solved'（克服）/'all' */
  function missList(tests, opts) {
    const o = opts || {};
    return Object.keys((tests && tests.misses) || {})
      .map((k) => Object.assign({ key: k }, tests.misses[k]))
      .filter((e) => (o.status === 'solved' ? e.solvedAt : o.status === 'all' ? true : !e.solvedAt))
      .filter((e) => !o.roundId || e.roundIds.includes(o.roundId))
      .sort((a, b) => b.lastAt - a.lastAt);
  }

  function missCounts(tests) {
    const all = missList(tests, { status: 'all' });
    return { open: all.filter((e) => !e.solvedAt).length, solved: all.filter((e) => e.solvedAt).length, all: all.length };
  }

  /** 覚えていないリストの解き直しに使う、用法と部の組み合わせ */
  function openKeys(tests, roundId) {
    return missList(tests, { status: 'open', roundId }).map((e) => e.key);
  }

  /** 再テストが必要な問題（まだ克服していない）。now を渡すと、いま受ける時刻になったものだけ */
  function dueKeys(tests, now) {
    return missList(tests, { status: 'open' }).filter((e) => now == null || (e.dueAt || 0) <= now).map((e) => e.key);
  }

  /** 次の再テストの時刻（まだ時刻前のものの中で、いちばん早いもの） */
  function nextRetestAt(tests, now) {
    const later = missList(tests, { status: 'open' }).map((e) => e.dueAt || 0).filter((t) => t > now);
    return later.length ? Math.min.apply(null, later) : 0;
  }

  /** その種類・期間の、受け終えたテスト（いちばん新しいもの）。なければ null */
  function takenAttempt(tests, kind, period) {
    const list = ((tests && tests.attempts) || []).filter((a) => a.kind === kind && a.period === period);
    return list.length ? list[list.length - 1] : null;
  }

  /** その種類・期間のテストを、もう受け終えたか */
  function hasTaken(tests, kind, period) {
    return !!takenAttempt(tests, kind, period);
  }

  /** since より後に、その種類のテストで満点を取ったときの記録 */
  function lastPerfect(tests, kind, since) {
    const list = ((tests && tests.attempts) || []).filter((a) => a.kind === kind && a.finishedAt >= (since || 0) && a.score === 100);
    return list.length ? list[list.length - 1] : null;
  }

  /** その種類で、いちばん新しく受け終えたテスト（since より後だけ） */
  function lastTaken(tests, kind, since) {
    const list = ((tests && tests.attempts) || []).filter((a) => a.kind === kind && a.finishedAt >= (since || 0));
    return list.length ? list.reduce((x, y) => (y.finishedAt > x.finishedAt ? y : x)) : null;
  }

  /** 覚えていないリストの問題を、再テスト・練習で同じ形式にするための表（「用法|部」→ 形式） */
  function missTypes(tests) {
    const out = {};
    missList(tests, { status: 'all' }).forEach((e) => { if (e.last && e.last.qtype) out[e.key] = e.last.qtype; });
    return out;
  }

  /** 選択肢の用法ID（前の版で作った問題にはないので、文字から探す） */
  function choiceSense(q, i, items) {
    if (Array.isArray(q.choiceIds) && q.choiceIds[i]) return q.choiceIds[i];
    const text = q.choices && q.choices[i];
    if (!text) return '';
    const word = (items || []).find((it) => it.word.headword.toLowerCase() === String(text).toLowerCase());
    if (word) return word.sense.id;
    const meaning = (items || []).find((it) => it.sense.meaning === text);
    return meaning ? meaning.sense.id : '';
  }

  return {
    PARTS, QTYPE, KINDS, KIND_LABEL, HALF_SCORED, APPLIED, rng, hash, roundItems, testSentence, tokenize, normText,
    maskWord, createAttempt, current, isDone, judge, answer, finish,
    roundAttempts, nextNo, roundStats, missList, missCounts, openKeys, dueKeys, nextRetestAt,
    takenAttempt, hasTaken, lastTaken, lastPerfect, missTypes, choiceSense,
  };
});
