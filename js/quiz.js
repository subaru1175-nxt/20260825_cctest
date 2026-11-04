/*
 * quiz.js — 回ごとのテストと「覚えていないリスト」
 *
 * テストは2部構成（合計100点）
 *   1. 内容理解（50点）… 4択。意味／場面→単語／例文の空所 を回ごとに順番に出す
 *   2. 文章作成・応用（50点）… カードにない新しい例文を、単語を並べ替えて作る
 * 間違えた問題は「覚えていないリスト」にたまっていく（回をまたいで蓄積）。
 * あとで同じ問題（同じ用法・同じ部）に正解すると「克服」になるが、記録は消さない。
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
  };

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

  function meaningChoices(item, pool, r) {
    const correct = item.sense.meaning;
    const used = new Set([correct]);
    const out = [];
    // 同じ単語のほかの用法は、見分ける練習になるので1つ入れる
    item.word.senses.forEach((s) => {
      if (out.length < 1 && s.id !== item.sense.id && s.meaning && !used.has(s.meaning) && s.status !== 'needs_review') {
        out.push(s.meaning);
        used.add(s.meaning);
      }
    });
    const others = pool.filter((p) => p.sense.id !== item.sense.id && p.word.id !== item.word.id);
    const same = others.filter((p) => p.sense.pos === item.sense.pos);
    [pick(same, 12, r), pick(others, 12, r)].forEach((cands) => {
      cands.forEach((p) => {
        if (out.length < 3 && !used.has(p.sense.meaning)) {
          out.push(p.sense.meaning);
          used.add(p.sense.meaning);
        }
      });
    });
    return out;
  }

  function wordChoices(item, pool, r) {
    const used = new Set([item.word.headword.toLowerCase()]);
    const out = [];
    const others = pool.filter((p) => p.word.id !== item.word.id);
    const same = others.filter((p) => p.sense.pos === item.sense.pos);
    [pick(same, 12, r), pick(others, 12, r)].forEach((cands) => {
      cands.forEach((p) => {
        const h = p.word.headword;
        if (out.length < 3 && !used.has(h.toLowerCase())) {
          out.push(h);
          used.add(h.toLowerCase());
        }
      });
    });
    return out;
  }

  /** 空所問題に使える例文（[ ] の語が見出し語そのままのもの） */
  function clozeExample(item) {
    const head = item.word.headword.toLowerCase();
    return (item.sense.examples || []).find((ex) => {
      const hits = util.parseMarked(ex.en).filter((p) => p.hit);
      return hits.length === 1 && hits[0].t.toLowerCase() === head;
    }) || null;
  }

  function understandQuestion(item, index, attemptNo, pool, r) {
    const types = ['meaning'];
    if (item.sense.nuance || (item.sense.scene && item.sense.scene.text)) types.push('scene');
    const cz = clozeExample(item);
    if (cz) types.push('cloze');
    const qtype = types[(index + attemptNo) % types.length];
    let choices;
    let correct;
    const prompt = { headword: item.word.headword, cue: item.sense.cue, speak: item.sense.speak || item.word.headword, ipa: item.sense.ipa };
    if (qtype === 'meaning') {
      correct = item.sense.meaning;
      choices = meaningChoices(item, pool, r);
    } else {
      correct = item.word.headword;
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
    const all = util.shuffle(choices.concat([correct]), r);
    return {
      id: 'u-' + item.sense.id,
      part: 'understand',
      qtype,
      senseId: item.sense.id,
      wordId: item.word.id,
      prompt,
      choices: all,
      answer: all.indexOf(correct),
    };
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
   *   kind 'round'  … 回のテスト（内容理解 → 文章作成。それぞれ全用法）
   *   kind 'review' … 覚えていないリストの解き直し（まだ克服していない問題だけ）
   */
  function createAttempt(opts) {
    const now = opts.now || Date.now();
    const seed = hash((opts.roundId || 'review') + ':' + (opts.no || 0) + ':' + now);
    const r = rng(seed);
    const items = opts.items || [];
    const pool = opts.pool && opts.pool.length >= 4 ? opts.pool : items;
    const want = opts.only ? new Set(opts.only) : null; // 'senseId|part'
    const u = [];
    const c = [];
    items.forEach((item, i) => {
      if (!want || want.has(item.sense.id + '|understand')) u.push(understandQuestion(item, i, opts.no || 1, pool, r));
      if (!want || want.has(item.sense.id + '|compose')) {
        const q = composeQuestion(item, r);
        if (q) c.push(q);
      }
    });
    return {
      id: util.randomId('test'),
      kind: opts.kind === 'review' ? 'review' : 'round',
      roundId: opts.roundId || '',
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

  /** 回答を判定する（response: 4択は番号、並べ替えは語の番号の並び、null は「わからない」） */
  function judge(q, response) {
    if (q.part === 'understand') {
      const ok = response === q.answer;
      return { correct: ok, given: response == null ? '（わからない）' : q.choices[response] || '', expected: q.choices[q.answer] };
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
   * 間違えた問題はすぐに覚えていないリストへ入れる（途中でやめても残る）。
   */
  function answer(tests, attempt, response, now) {
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
    if (!res.correct) {
      const e = m || { senseId: q.senseId, part: q.part, roundIds: [], count: 0, firstAt: now, lastAt: 0, solvedAt: 0, last: {} };
      e.count += 1;
      e.lastAt = now;
      e.solvedAt = 0;
      if (attempt.roundId && !e.roundIds.includes(attempt.roundId)) e.roundIds.push(attempt.roundId);
      e.last = { qtype: q.qtype, given: res.given, answer: res.expected };
      t.misses[key] = e;
    } else if (m && !m.solvedAt) {
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
          answer: q.part === 'understand' ? q.choices[q.answer] : util.plainSentence(q.prompt.sentence),
        });
      }
    });
    const total = parts.understand.total + parts.compose.total;
    const correct = parts.understand.correct + parts.compose.correct;
    let score;
    if (total && correct === total) score = 100;
    else if (attempt.kind === 'round') score = partScore(parts.understand.correct, parts.understand.total) + partScore(parts.compose.correct, parts.compose.total);
    else score = total ? Math.floor((100 * correct) / total) : 0;
    const summary = {
      id: attempt.id,
      kind: attempt.kind,
      roundId: attempt.roundId,
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

  return {
    PARTS, QTYPE, rng, hash, roundItems, testSentence, tokenize, normText,
    createAttempt, current, isDone, judge, answer, finish,
    roundAttempts, nextNo, roundStats, missList, missCounts, openKeys,
  };
});
