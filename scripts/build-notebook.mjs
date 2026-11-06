/*
 * シリーズ（単語のリスト）のデータを辞書と照合して、js/data-notebook.js を作る
 *   npm install（初回だけ）→ node scripts/build-notebook.mjs（npm run notebook）
 *
 * シリーズは下の SERIES に並べる。新しい単語のリストが届いたら、data/notebook/ にデータを足して、
 * SERIES に1つ足す（書き方は data/notebook/README.md）。
 *
 * 照合すること
 *   - 品詞・意味：Princeton WordNet 3.1 に、その品詞の語義があり、指定した説明文を含むか
 *     （WordNet にない代名詞・助動詞などは、Web検索で照合した出典を記録）
 *   - 米音の発音記号：CMU Pronouncing Dictionary の発音と、音の並びが一致するか
 *   - 例文に [ ] の印があるか、ニュアンスが「〜って感じ」で終わるか、ID が重複しないか
 * 1つでも合わなければエラーで止まる（推測で通さない）。
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import { dictionary as CMU } from 'cmu-pronouncing-dictionary';
import part1 from '../data/notebook/words-1.mjs';
import part2 from '../data/notebook/words-2.mjs';
import part3 from '../data/notebook/words-3.mjs';
import TESTS1 from '../data/notebook/tests.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WN_DIR = path.join(root, 'node_modules', 'wordnet-db', 'dict');
/**
 * シリーズの一覧（この順にアプリに並ぶ）
 *   id … r1, r2, …（一度決めたら変えない）　checked … 辞書と照合した日（追加した日）
 *   parts … 単語のデータ（words-*.mjs）　tests … 文章作成のテスト用の例文（用法ID → [英文, 日本語, 別の正解]）
 */
const SERIES = [
  { id: 'r1', no: 1, title: 'シリーズ1', source: '手書きの単語リスト（Untitled_Notebook.pdf）', checked: '2026-11-04', parts: [part1, part2, part3], tests: TESTS1 },
];
const TESTS = Object.assign({}, ...SERIES.map((x) => x.tests));
const CHECKED = SERIES.map((x) => x.checked).sort().pop();
const POS_JA = { noun: '名詞', verb: '動詞', adjective: '形容詞', adverb: '副詞', pronoun: '代名詞', interjection: '間投詞', auxiliary: '助動詞', phrase: 'フレーズ', preposition: '前置詞', other: 'その他' };
const WN_POS = { noun: 'noun', verb: 'verb', adj: 'adj', adv: 'adv' };

/* ---------- WordNet ---------- */
const wnIndex = {};
function loadIndex(pos) {
  if (wnIndex[pos]) return wnIndex[pos];
  const m = new Map();
  for (const line of fs.readFileSync(path.join(WN_DIR, 'index.' + pos), 'utf8').split('\n')) {
    if (!line || line.startsWith(' ')) continue;
    const f = line.split(' ');
    const pcnt = Number(f[3]);
    m.set(f[0], f.slice(4 + pcnt + 2).filter(Boolean));
  }
  return (wnIndex[pos] = m);
}
const dataText = {};
function glossAt(pos, offset) {
  if (!dataText[pos]) dataText[pos] = fs.readFileSync(path.join(WN_DIR, 'data.' + pos));
  const buf = dataText[pos];
  const start = Number(offset);
  const end = buf.indexOf(10, start);
  const line = buf.slice(start, end).toString('utf8');
  return (line.split('| ')[1] || '').trim();
}
function wnFind(lemma, pos, needle) {
  const offs = loadIndex(WN_POS[pos]).get(lemma.toLowerCase().replace(/ /g, '_')) || [];
  const glosses = offs.map((o) => glossAt(WN_POS[pos], o));
  const hit = glosses.find((g) => g.toLowerCase().includes(needle.toLowerCase()));
  return { hit, count: glosses.length };
}

/* ---------- CMU（ARPAbet → 比較用の音の並び） ---------- */
const V = { AA: 'ɑ', AE: 'æ', AO: 'ɑ', AW: 'aʊ', AY: 'aɪ', EH: 'e', EY: 'eɪ', IH: 'ə', IY: 'i', OW: 'oʊ', OY: 'ɔɪ', UH: 'ʊ', UW: 'u', AH: 'ə', ER: 'ər' };
const C = { B: 'b', CH: 'tʃ', D: 'd', DH: 'ð', F: 'f', G: 'ɡ', HH: 'h', JH: 'dʒ', K: 'k', L: 'l', M: 'm', N: 'n', NG: 'ŋ', P: 'p', R: 'r', S: 's', SH: 'ʃ', T: 't', TH: 'θ', V: 'v', W: 'w', Y: 'j', Z: 'z', ZH: 'ʒ' };
function arpaKey(arpa) {
  return canon(arpa.split(' ').map((p) => {
    const base = p.replace(/[012]$/, '');
    if (base === 'AH' && /1|2$/.test(p)) return 'ʌ';
    if (base === 'IH' && /1|2$/.test(p)) return 'ɪ';
    return V[base] || C[base];
  }).join(''));
}
/** 表記の流儀の違い（強勢記号・長音記号・あいまい母音・成節子音など）をそろえて、音の並びだけを比べる */
function canon(s) {
  return s
    .replace(/[/ˈˌ.()]/g, '')
    .replace(/ː/g, '')
    .replace(/ɔ(?!ɪ)/g, 'ɑ')
    .replace(/ɒ/g, 'ɑ')
    .replace(/ɜ/g, 'ə')
    .replace(/ɪ(?=r)/g, 'i')
    .replace(/ʊ(?=r)/g, 'u')
    .replace(/ɪ/g, 'ə')
    .replace(/ə/g, '');
}
function cmuKeys(word) {
  const keys = new Set();
  const w = word.toLowerCase();
  if (CMU[w]) keys.add(arpaKey(CMU[w]));
  for (let i = 1; i < 6; i++) if (CMU[w + '(' + i + ')']) keys.add(arpaKey(CMU[w + '(' + i + ')']));
  return keys;
}
function ipaMatches(headword, ipa) {
  const tokens = headword.toLowerCase().split(' ');
  const parts = ipa.replace(/^\/|\/$/g, '').split(' ');
  if (tokens.length !== parts.length) return { ok: false, why: '語数が合わない' };
  for (let i = 0; i < tokens.length; i++) {
    const keys = cmuKeys(tokens[i]);
    if (!keys.size) return { ok: false, why: tokens[i] + ' が CMU にない' };
    if (!keys.has(canon(parts[i]))) return { ok: false, why: tokens[i] + ': ' + canon(parts[i]) + ' ∉ {' + [...keys].join(', ') + '}' };
  }
  return { ok: true };
}

/* ---------- 生成 ---------- */
const slug = (t) => t.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const errors = [];
const seenSense = new Set();
const seenWord = new Set();
const report = [];

function buildWord(src, series) {
  const id = 'w-' + slug(src.w);
  if (seenWord.has(id)) errors.push('重複した単語: ' + src.w);
  seenWord.add(id);
  const review = Array.isArray(src.review) && src.review.length;
  const evidence = [];
  const problems = [];
  const senses = src.senses.map((s, i) => {
    const sid = 's-' + slug(src.w) + '-' + (s.k || s.p);
    if (seenSense.has(sid)) errors.push('重複した用法ID: ' + sid);
    seenSense.add(sid);
    const ipa = s.ipa || src.ipa || ['', ''];
    if (!review) {
      if (!s.nu.endsWith('って感じ')) errors.push(sid + ': ニュアンスが「って感じ」で終わっていない');
      if (!s.ex.length) errors.push(sid + ': 例文がない');
      s.ex.forEach(([en]) => { if (!/\[[^\]]+\]/.test(en)) errors.push(sid + ': 例文に [ ] がない: ' + en); });
      if (!s.m || !s.rt || !s.cue || !s.sc) errors.push(sid + ': 必須項目が空');
    }
    // 意味の照合
    const posJa = POS_JA[s.p] || s.p;
    if (s.ev && s.ev.wn) {
      const [pos, needle] = s.ev.wn;
      const { hit, count } = wnFind(src.w, pos, needle);
      if (!hit) errors.push(sid + ': WordNet（' + pos + '、' + count + '語義）に「' + needle + '」がない');
      else evidence.push(posJa + '「' + (s.m || '').split('、')[0] + '」→ WordNet: ' + hit.split(';')[0]);
    } else if (s.ev && s.ev.web !== undefined) {
      const ref = (src.web || [])[s.ev.web];
      if (!ref) errors.push(sid + ': web 出典がない');
      else evidence.push(posJa + '「' + (s.m || '').split('、')[0] + '」→ ' + ref.label + '：' + s.ev.what);
    } else if (!review) {
      errors.push(sid + ': 照合の根拠（ev）がない');
    }
    // 発音の照合（米音）
    if (!src.noIpa) {
      const m = ipaMatches(src.w, ipa[0]);
      if (!m.ok && !src.ipaWhy) errors.push(sid + ': 発音記号が CMU と合わない（' + ipa[0] + '）' + m.why);
      if (!m.ok && src.ipaWhy && i === 0) evidence.push('発音：' + src.ipaWhy);
    }
    let test = null;
    if (!review) {
      const t = TESTS[sid];
      if (!t) errors.push(sid + ': テスト用の例文（data/notebook/tests.mjs）がない');
      else {
        const [en, ja, alts] = t;
        if (!/\[[^\]]+\]/.test(en)) errors.push(sid + ': テスト例文に [ ] がない');
        const n = en.replace(/[\[\]]/g, '').trim().split(/\s+/).length;
        if (n < 3 || n > 10) errors.push(sid + ': テスト例文の語数が ' + n + '（3〜10語にする）');
        if (s.ex.some(([e]) => e.replace(/[\[\]]/g, '') === en.replace(/[\[\]]/g, ''))) errors.push(sid + ': テスト例文がカードの例文と同じ');
        test = { en, ja, alts: alts || [] };
      }
    }
    return {
      id: sid,
      group: s.g || 'A',
      pos: s.p,
      role: s.r || '',
      cue: s.cue || '',
      speak: s.sp || '',
      ipa: { us: src.noIpa ? '' : ipa[0], uk: src.noIpa ? '' : ipa[1] },
      stress: s.st || src.st || '',
      nuance: s.nu || '',
      scene: { emoji: s.em || '', diagram: s.dg || '', text: s.sc || '' },
      meaning: s.m || '',
      roleText: s.rt || '',
      examples: (s.ex || []).map(([en, ja]) => ({ en, ja })),
      contrasts: (s.cx || []).map(([word, text]) => ({ word, text })),
      note: s.note || '',
      status: review ? 'needs_review' : '',
      audio: { word: '', examples: [] },
      test,
    };
  });

  const status = review ? 'needs_review' : src.unverified ? 'unverified' : 'verified';
  const method = review
    ? '手書きの資料を読み取った段階で、意図が判断できなかったため、内容を確定していません。'
    : '品詞・意味：Princeton WordNet 3.1 の語義（WordNet にない代名詞・助動詞などは、Web検索で表示された辞書の該当ページ）と照合。' +
      '米音の発音記号：CMU Pronouncing Dictionary の発音と照合し、Oxford 式の表記にそろえました。英音の発音記号は辞書と照合していません。';
  const noteLines = [];
  if (src.readNote) noteLines.push('資料の読み取り：' + src.readNote);
  if (src.unverified) noteLines.push('未確認の理由：' + src.unverified);
  evidence.forEach((e) => noteLines.push('照合：' + e));
  if (!review) noteLines.push('例文・一言ニュアンス・場面の説明は、このアプリ用に作った学習用の文章です。');

  const sources = [{ label: series.source + (src.src ? '（表記：' + src.src + '）' : ''), url: '' }];
  if (!review) {
    sources.push({ label: 'Princeton WordNet 3.1', url: 'https://wordnet.princeton.edu/' });
    sources.push({ label: 'CMU Pronouncing Dictionary', url: 'http://www.speech.cs.cmu.edu/cgi-bin/cmudict' });
  }
  (src.web || []).forEach((r) => sources.push({ label: r.label, url: r.url }));

  report.push('| ' + src.w + ' | ' + (src.src || '') + ' | ' + { verified: '確認済み', unverified: '未確認', needs_review: '要確認' }[status] + ' | ' + senses.length + ' |');
  problems.forEach((p) => errors.push(p));
  return {
    id,
    headword: src.w,
    status,
    check: { date: series.checked, method, note: noteLines.join('\n') },
    sources,
    groups: src.groups || {},
    senses,
    reviewReasons: review ? src.review : [],
    createdAt: 0,
    updatedAt: 0,
  };
}

const words = [];
const rounds = SERIES.map((se) => {
  const all = se.parts.flat();
  all.filter((x) => !x.ref).forEach((x) => words.push(buildWord(x, se)));
  return { id: se.id, no: se.no, title: se.title, source: se.source, addedAt: se.checked, wordIds: all.map((x) => (x.ref ? x.ref : 'w-' + slug(x.w))) };
});
// { ref } で指している単語が、どこかにあるか（このファイルの単語か、data-seed.js の見本の単語）
const known = new Set(words.map((w) => w.id).concat(createRequire(import.meta.url)('../js/data-seed.js').sample));
rounds.forEach((r) => r.wordIds.forEach((id) => { if (!known.has(id)) errors.push(r.title + ': 見つからない単語 ' + id); }));
const unused = Object.keys(TESTS).filter((k) => !seenSense.has(k));
if (unused.length) errors.push('使われていないテスト例文: ' + unused.join(', '));
if (errors.length) {
  console.error('照合できなかった項目があります:\n  ' + errors.join('\n  '));
  process.exit(1);
}

const body = JSON.stringify({ source: SERIES.map((x) => x.source).join(' / '), checked: CHECKED, rounds, words }, null, 1);
const out = `/*
 * data-notebook.js — 手書きの単語リスト（Untitled_Notebook.pdf）から作った単語データ
 * このファイルは scripts/build-notebook.mjs で自動生成しています。直接は編集しないでください。
 * 元データ: data/notebook/words-*.mjs
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.CIF = root.CIF || {};
    root.CIF.notebook = factory();
  }
})(this, function () {
  'use strict';
  return ${body};
});
`;
fs.writeFileSync(path.join(root, 'js', 'data-notebook.js'), out);

const counts = { verified: 0, unverified: 0, needs_review: 0 };
words.forEach((w) => counts[w.status]++);
const senses = words.reduce((n, w) => n + w.senses.length, 0);
fs.writeFileSync(path.join(root, 'data', 'notebook', 'REPORT.md'),
  '# 手書きの単語リストの照合結果\n\n' +
  '自動生成：`node scripts/build-notebook.mjs`（' + CHECKED + '）\n\n' +
  '- 単語 ' + words.length + '語・用法 ' + senses + 'つ\n' +
  '- 確認済み ' + counts.verified + '語／未確認 ' + counts.unverified + '語／要確認 ' + counts.needs_review + '語\n' +
  rounds.map((r) => '- ' + r.title + '：' + r.source + ' の ' + r.wordIds.length + '語（' + r.addedAt + '）\n').join('') +
  '- シリーズ1 は、すでに入っていた take, well, pretty, look を含みます（重複して追加していません）\n' +
  '- テスト（文章作成）用の例文：' + Object.keys(TESTS).length + '文（カードの例文とは別の文）\n\n' +
  '| 単語 | 資料の表記 | 確認状況 | 用法 |\n| --- | --- | --- | --- |\n' + report.join('\n') + '\n');
console.log('wrote js/data-notebook.js — ' + words.length + ' words, ' + senses + ' senses', counts);
