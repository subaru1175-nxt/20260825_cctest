/*
 * diagrams.js — 場面・コアイメージの簡単な図（インラインSVG）
 * 色は CSS の変数（--ink, --accent など）から取るので、ダークモードでも読める。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.CIF = root.CIF || {};
    root.CIF.diagrams = factory();
  }
})(this, function () {
  'use strict';

  const svg = (body, label, h) =>
    '<svg class="dg" viewBox="0 0 240 ' + (h || 120) + '" role="img" aria-label="' + label + '">' + body + '</svg>';

  const eye = (x, y) =>
    '<path class="ln" d="M' + (x - 16) + ' ' + y + ' Q' + x + ' ' + (y - 13) + ' ' + (x + 16) + ' ' + y +
    ' Q' + x + ' ' + (y + 13) + ' ' + (x - 16) + ' ' + y + ' Z"/><circle class="ink" cx="' + x + '" cy="' + y + '" r="4.5"/>';

  const LIB = {
    'pretty-gauge': svg(
      '<rect class="fl" x="20" y="48" width="200" height="16" rx="8"/>' +
        '<rect class="ac" x="20" y="48" width="130" height="16" rx="8"/>' +
        '<path class="ac" d="M150 42 l-8 -12 h16 z"/>' +
        '<text class="te b" x="150" y="22" text-anchor="middle">pretty</text>' +
        '<text class="t b" x="150" y="84" text-anchor="middle">けっこう</text>' +
        '<line class="ln2" x1="206" y1="42" x2="206" y2="70"/>' +
        '<text class="t" x="206" y="84" text-anchor="middle">とても</text>' +
        '<text class="te s" x="206" y="100" text-anchor="middle">very</text>' +
        '<text class="t" x="40" y="84" text-anchor="middle">少し</text>',
      '程度のメーター。pretty は「とても」より少し手前の「けっこう」'
    ),

    'well-pit': svg(
      '<line class="ln2" x1="10" y1="44" x2="230" y2="44"/>' +
        '<text class="t s" x="20" y="38">地面</text>' +
        '<line class="ln" x1="84" y1="44" x2="84" y2="10"/><line class="ln" x1="156" y1="44" x2="156" y2="10"/>' +
        '<line class="ln" x1="78" y1="10" x2="162" y2="10"/>' +
        '<rect class="fl ln" x="92" y="32" width="12" height="12"/><rect class="fl ln" x="136" y="32" width="12" height="12"/>' +
        '<line class="ln2" x1="104" y1="44" x2="104" y2="112"/><line class="ln2" x1="136" y1="44" x2="136" y2="112"/>' +
        '<rect class="ac" x="104" y="94" width="32" height="18"/>' +
        '<line class="ln2" x1="120" y1="10" x2="120" y2="62"/>' +
        '<path class="fl ln" d="M110 62 h20 l-3 14 h-14 z"/>' +
        '<text class="t s" x="146" y="108">水</text>',
      '井戸の断面。地面に掘った穴の底に水があり、ロープでバケツを下ろす'
    ),

    'light-weight': svg(
      '<line class="ln2" x1="10" y1="104" x2="230" y2="104"/>' +
        '<rect class="ink" x="30" y="58" width="62" height="46" rx="4"/>' +
        '<path class="ln" d="M61 22 v22 m-8 -8 l8 8 l8 -8"/>' +
        '<text class="te s" x="61" y="14" text-anchor="middle">heavy</text>' +
        '<path class="fl ln" d="M150 44 h44 a6 6 0 0 1 6 6 v26 a6 6 0 0 1 -6 6 h-44 a6 6 0 0 1 -6 -6 v-26 a6 6 0 0 1 6 -6 z"/>' +
        '<path class="ln" d="M162 44 v-8 a10 10 0 0 1 20 0 v8"/>' +
        '<path class="acs" d="M156 94 h32 M164 100 h16"/>' +
        '<path class="acs" d="M172 30 v-20 m-7 7 l7 -7 l7 7"/>' +
        '<text class="te b" x="214" y="22" text-anchor="middle">light</text>',
      '重い箱は地面に置いたまま。軽いバッグはひょいっと持ち上がる'
    ),

    'run-loop': svg(
      '<path class="ln" d="M70 30 H170 A30 30 0 0 1 170 90 H70 A30 30 0 0 1 70 30 Z"/>' +
        '<path class="ac" d="M128 30 l-12 -7 v14 z"/><path class="ac" d="M112 90 l12 -7 v14 z"/>' +
        '<text class="t s" x="120" y="18" text-anchor="middle">毎日お店を開ける</text>' +
        '<text class="t s" x="120" y="112" text-anchor="middle">止めずに回し続ける</text>' +
        '<text class="te b" x="120" y="66" text-anchor="middle">run a café</text>',
      'お店の仕事が輪のように止まらず回り続けるイメージ'
    ),

    'get-have': svg(
      '<circle class="ln2 dash" cx="52" cy="54" r="30"/>' +
        '<text class="t s" x="52" y="58" text-anchor="middle">まだない</text>' +
        '<path class="acs" d="M92 54 H146 m-10 -9 l10 9 l-10 9"/>' +
        '<text class="te b" x="119" y="40" text-anchor="middle">get</text>' +
        '<circle class="fl ln" cx="188" cy="54" r="30"/>' +
        '<rect class="ac" x="174" y="44" width="28" height="22" rx="2"/>' +
        '<path class="ln" d="M188 44 v22 M174 52 h28"/>' +
        '<text class="t s" x="52" y="104" text-anchor="middle">持っていない</text>' +
        '<text class="t s" x="188" y="104" text-anchor="middle">手元にある</text>',
      'なかったものが、自分の手元にやってくる'
    ),

    'get-change': svg(
      '<rect class="sky" x="14" y="16" width="84" height="70" rx="8"/>' +
        '<circle class="hl" cx="56" cy="50" r="14"/>' +
        '<path class="acs" d="M108 51 H132 m-9 -8 l9 8 l-9 8"/>' +
        '<text class="te b" x="120" y="34" text-anchor="middle">get</text>' +
        '<rect class="night" x="142" y="16" width="84" height="70" rx="8"/>' +
        '<path class="moon" d="M190 36 a14 14 0 1 0 10 24 a11 11 0 1 1 -10 -24 z"/>' +
        '<text class="t s" x="56" y="106" text-anchor="middle">明るい</text>' +
        '<text class="t s" x="184" y="106" text-anchor="middle">暗い（dark）</text>',
      '明るい空から暗い空へ、様子が移っていく'
    ),

    'break-snap': svg(
      '<path class="fl ln" d="M24 52 H104 l6 6 l-6 6 l6 6 H24 Z"/>' +
        '<g transform="rotate(14 170 62)"><path class="fl ln" d="M128 52 l6 6 l-6 6 l6 6 H214 V52 Z"/></g>' +
        '<path class="acs" d="M118 34 l-4 -12 M128 34 l6 -12 M108 40 l-10 -6 M138 40 l10 -6"/>' +
        '<text class="t b" x="120" y="104" text-anchor="middle">パキッ</text>',
      'ひとつながりのものが、パキッと2つに割れる'
    ),

    'break-gap': svg(
      '<rect class="ac" x="14" y="44" width="86" height="22" rx="4"/>' +
        '<rect class="ac" x="148" y="44" width="78" height="22" rx="4"/>' +
        '<text class="t s on-ac" x="57" y="60" text-anchor="middle">作業</text>' +
        '<text class="t s on-ac" x="187" y="60" text-anchor="middle">作業</text>' +
        '<path class="fl ln" d="M112 46 h20 v14 a10 10 0 0 1 -20 0 z"/>' +
        '<path class="ln2" d="M132 50 a5 5 0 0 1 0 10"/>' +
        '<text class="te b" x="124" y="94" text-anchor="middle">a break</text>' +
        '<text class="t s" x="124" y="110" text-anchor="middle">いったん区切る</text>',
      '作業の流れの途中に、ひと休みの区切りが入る'
    ),

    'take-carry': svg(
      '<path class="fl ln" d="M18 60 L48 34 L78 60 V100 H18 Z"/>' +
        '<rect class="ln2" x="40" y="74" width="16" height="26"/>' +
        '<text class="t s" x="48" y="116" text-anchor="middle">ここ</text>' +
        '<path class="acs" d="M88 86 H196 m-10 -9 l10 9 l-10 9"/>' +
        '<path class="ac" d="M122 54 a20 18 0 0 1 40 0 z"/>' +
        '<path class="ln" d="M142 54 v20 a5 5 0 0 1 -10 0"/>' +
        '<path class="ln" d="M214 100 V40 M214 40 l18 8 l-18 8"/>' +
        '<text class="t s" x="214" y="116" text-anchor="middle">行き先</text>',
      '手に取ったものを、ここから別の場所へ持っていく'
    ),

    'take-time': svg(
      '<circle class="fl ln" cx="70" cy="60" r="40"/>' +
        '<path class="ac" d="M70 60 L70 24 A36 36 0 0 1 101.2 42 Z"/>' +
        '<path class="ln" d="M70 60 L70 32 M70 60 L88 70"/>' +
        '<circle class="ink" cx="70" cy="60" r="3.5"/>' +
        '<text class="t b big" x="172" y="58" text-anchor="middle">10分</text>' +
        '<text class="t s" x="172" y="80" text-anchor="middle">かかる</text>' +
        '<text class="te s" x="172" y="100" text-anchor="middle">It takes ten minutes.</text>',
      '時計の10分ぶんが塗られている。その事に10分必要'
    ),

    'on-contact': svg(
      '<line class="ln" x1="34" y1="10" x2="34" y2="96"/>' +
        '<rect class="fl ln" x="36" y="30" width="44" height="34"/>' +
        '<path class="ln2" d="M44 56 l10 -12 l8 8 l6 -6 l6 10"/>' +
        '<circle class="ac" cx="35" cy="36" r="4"/><circle class="ac" cx="35" cy="58" r="4"/>' +
        '<text class="te s" x="58" y="114" text-anchor="middle">on the wall</text>' +
        '<line class="ln" x1="124" y1="78" x2="226" y2="78"/>' +
        '<path class="ln" d="M134 78 v22 M216 78 v22"/>' +
        '<path class="fl ln" d="M160 54 h24 v22 h-24 z"/><path class="ln2" d="M184 60 a7 7 0 0 1 0 12"/>' +
        '<circle class="ac" cx="166" cy="78" r="4"/><circle class="ac" cx="178" cy="78" r="4"/>' +
        '<text class="te s" x="175" y="114" text-anchor="middle">on the table</text>',
      '壁の絵もテーブルのカップも、面にくっついている（色の点が接しているところ）'
    ),

    'look-see-watch': svg(
      '<rect class="frame" x="4" y="4" width="74" height="112" rx="8"/>' +
        '<text class="te b" x="41" y="22" text-anchor="middle">look</text>' +
        eye(24, 58) +
        '<path class="acs" d="M42 58 H60 m-7 -6 l7 6 l-7 6"/>' +
        '<text class="t s" x="41" y="100" text-anchor="middle">目を向ける</text>' +
        '<text class="te s" x="120" y="22" text-anchor="middle">see</text>' +
        eye(104, 58) +
        '<path class="ln2 dash" d="M142 50 L124 56 M142 66 L124 60"/>' +
        '<circle class="fl ln" cx="146" cy="58" r="5"/>' +
        '<text class="t s" x="120" y="100" text-anchor="middle">目に入る</text>' +
        '<text class="te s" x="199" y="22" text-anchor="middle">watch</text>' +
        eye(182, 66) +
        '<path class="ln2 dash" d="M176 44 Q200 30 226 44"/>' +
        '<circle class="fl ln2" cx="186" cy="38" r="3"/><circle class="fl ln2" cx="204" cy="35" r="3"/><circle class="ac" cx="222" cy="41" r="4"/>' +
        '<text class="t s" x="199" y="100" text-anchor="middle">見続ける</text>',
      'look は目を向ける、see は自然に目に入る、watch は動くものを見続ける'
    ),
  };

  function has(key) {
    return !!(key && LIB[key]);
  }

  function get(key) {
    return has(key) ? LIB[key] : '';
  }

  function keys() {
    return Object.keys(LIB);
  }

  return { has, get, keys };
});
