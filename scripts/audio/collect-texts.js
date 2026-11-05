/*
 * 音声パックで読み上げる英語を集める: node scripts/audio/collect-texts.js > texts.json
 *
 * 1件 = { key, text, wordId, kind, pos }
 *   単語    … key は '#用法ID'。text は見出し語だけ（文やフレーズにしない）。
 *             pos（品詞）を渡して、record（名詞 /ˈrekərd/・動詞 /rɪˈkɔːrd/）のように、
 *             用法ごとの発音で単語だけを読む。
 *   フレーズ … 表面に出すフレーズ（cue）。key = text
 *   文      … 例文・テスト用の例文（[ ] を外したもの）。key = text
 * 日本語は含めない。要確認の単語・用法は除く。
 */
'use strict';
const util = require('../../js/util.js');
const seed = require('../../js/data-seed.js');

const out = [];
const seen = new Set();
function add(key, text, wordId, kind, pos) {
  const t = String(text || '').trim();
  if (!t || seen.has(key)) return;
  seen.add(key);
  out.push({ key, text: t, wordId, kind, pos: pos || '' });
}
seed.words.forEach((w) => {
  if (w.status === 'needs_review') return;
  w.senses.forEach((s) => {
    if (s.status === 'needs_review') return;
    add('#' + s.id, w.headword, w.id, 'word', s.pos);
  });
});
seed.words.forEach((w) => {
  if (w.status === 'needs_review') return;
  w.senses.forEach((s) => {
    if (s.status === 'needs_review') return;
    if (s.cue) add(s.cue.trim(), s.cue, w.id, 'phrase');
    (s.examples || []).forEach((e) => {
      const t = util.plainSentence(e.en);
      add(t, t, w.id, 'sentence');
    });
    if (s.test) {
      const t = util.plainSentence(s.test.en);
      add(t, t, w.id, 'sentence');
    }
  });
});
add('Hello! This is how I sound.', 'Hello! This is how I sound.', 'w-settings', 'sentence');
process.stdout.write(JSON.stringify(out, null, 1));
