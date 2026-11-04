/*
 * 音声パックで読み上げる英語を集める: node scripts/audio/collect-texts.js > texts.json
 * 単語（読み上げ用の語句）・表面のフレーズ・例文・テスト用の例文。日本語は含めない。
 */
'use strict';
const util = require('../../js/util.js');
const seed = require('../../js/data-seed.js');

const out = [];
const seen = new Set();
function add(text, wordId, kind) {
  const t = String(text || '').trim();
  if (!t || seen.has(t)) return;
  seen.add(t);
  out.push({ text: t, wordId, kind });
}
seed.words.forEach((w) => {
  if (w.status === 'needs_review') return;
  w.senses.forEach((s) => {
    if (s.status === 'needs_review') return;
    add(s.speak || w.headword, w.id, 'word');
    add(s.cue, w.id, 'phrase');
    (s.examples || []).forEach((e) => add(util.plainSentence(e.en), w.id, 'sentence'));
    if (s.test) add(util.plainSentence(s.test.en), w.id, 'sentence');
  });
});
add('Hello! This is how I sound.', 'w-settings', 'sentence');
process.stdout.write(JSON.stringify(out, null, 1));
