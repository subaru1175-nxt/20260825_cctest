/*
 * 1つのHTMLファイルにまとめる: node scripts/build-single.js
 *   → dist/core-image-cards.html（CSS と JS を埋め込んだ版。ファイルを開くだけで動く）
 *
 *   AI音声のファイル（audio/）は1つにまとめられないので、この版は端末の読み上げを使う。
 *
 * node scripts/build-single.js --artifact <出力パス> [--url <公開ページのリンク>]
 *   → claude.ai の公開ページ（Artifact）用。保存先に公開ページの保存領域を使う。
 *     AI音声は audio/*.mp3 をページと一緒に公開する（ページから audio/xxx.mp3 で読める）。
 *     --url：「ホーム画面に追加」の画面で、コピーできるように出すリンク（https://claude.ai/artifact/…）
 */
'use strict';
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

const html = read('index.html');
const scripts = Array.from(html.matchAll(/<script src="([^"]+)"><\/script>/g)).map((m) => m[1]);
const css = read('css/style.css');
const fontLink = (html.match(/<link rel="stylesheet" href="https:\/\/fonts[^>]+>/) || [''])[0];
const body = '<div id="app"></div>\n<div id="modal" hidden></div>\n<div id="toast" role="status" aria-live="polite"></div>';
const inlineJs = (file) => '<script>\n' + read(file).replace(/<\/script/gi, '<\\/script') + '\n</script>';

/**
 * extra: app.js の前に足すスクリプト
 * noPack: AI音声の目録を入れない（1つのファイルだけで配る版には、音声ファイルが一緒に付かないため）
 */
function scriptTags(extra, noPack) {
  let list = scripts.slice();
  if (noPack) list = list.filter((f) => f !== 'js/audio-pack.js');
  if (extra) list.splice(list.indexOf('js/app.js'), 0, extra);
  return list.map(inlineJs).join('\n');
}

function standalone() {
  const icon = 'data:image/svg+xml;base64,' + Buffer.from(read('icons/icon.svg')).toString('base64');
  return [
    '<!doctype html>',
    '<html lang="ja">',
    '<head>',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">',
    '<title>暗記CARD</title>',
    '<meta name="theme-color" content="#e8eaee">',
    '<link rel="icon" href="' + icon + '">',
    fontLink,
    '<style>\n' + css + '\n</style>',
    '</head>',
    '<body>',
    body,
    '<script>window.CIF_NO_SW = true;</script>',
    scriptTags(null, true),
    '</body>',
    '</html>',
    '',
  ].join('\n');
}

function artifact(url) {
  // 公開ページは <html><head><body> を自動で付けるので、中身だけを書く
  return [
    '<title>暗記CARD</title>',
    '<meta name="claude:viewport-fit-sides" content="cover">',
    fontLink,
    '<style>\n' + css + '\n</style>',
    body,
    url ? '<script>window.CIF_APP_URL = ' + JSON.stringify(url) + ';</script>' : '',
    scriptTags('js/artifact-backend.js'),
    '',
  ].join('\n');
}

const args = process.argv.slice(2);
const ai = args.indexOf('--artifact');
if (ai >= 0) {
  const out = path.resolve(args[ai + 1] || path.join(root, 'dist', 'artifact.html'));
  const ui = args.indexOf('--url');
  const url = ui >= 0 ? args[ui + 1] : '';
  if (url && !/^https:\/\/claude\.ai\/artifact\/[A-Za-z0-9-]+$/.test(url)) throw new Error('--url は https://claude.ai/artifact/… の形にしてください: ' + url);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, artifact(url));
  console.log('wrote ' + out);
} else {
  const out = path.join(root, 'dist', 'core-image-cards.html');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, standalone());
  console.log('wrote ' + path.relative(root, out));
}
