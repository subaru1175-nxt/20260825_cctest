/*
 * audio-pack.js — 高品質な音声ファイル（音声パック）の目録
 *
 * ここに「読み上げる英語 → 音声ファイル」の対応を入れると、音声ボタンは端末の読み上げより
 * こちらを優先して再生し、「高品質」と表示する。
 *   files: { 'normal|<英文>': 'xxx.mp3', 'slow|<英文>': 'xxx-slow.mp3' }
 * 音声パックはまだ入っていない（空）。
 */
(function (root) {
  root.CIF = root.CIF || {};
  root.CIF.audioPack = root.CIF.audioPack || { base: 'audio/', files: {} };
})(this);
