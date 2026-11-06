/*
 * sfx.js — 効果音（タップ・カードをめくる・正解・不正解・完了）
 *
 * 音のファイルは使わず、その場で短い音を作る（読み込み待ちがなく、オフラインでも鳴る）。
 * 英語の音声と同じ AudioContext を使う（iPhone では、タップの中で一度鳴らすと、その後も鳴らせる）。
 * 設定の「効果音」がオフのときは鳴らさない。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.CIF = root.CIF || {};
    root.CIF.sfx = factory();
  }
})(this, function () {
  'use strict';

  // 音の高さ（Hz）
  const N = { G5: 783.99, A5: 880, C6: 1046.5, D6: 1174.66, E6: 1318.51, G6: 1567.98, A6: 1760, C7: 2093 };

  /**
   * 鳴らす音の一覧。[開始(秒), 高さ(Hz), 長さ(秒), 大きさ, 波形, 終わりの高さ]
   *   tap … ボタンを押した（ごく短い、やわらかい音）
   *   tick … 選ぶ・並べる（もっと短い音）
   *   flip … カードをめくる
   *   correct / wrong … 正解・不正解
   *   step … 今日の手順が1つ終わった
   *   done … セット・テストが終わった
   *   perfect … 満点・全部「思い出せた」
   *   open … タイトルからアプリに入る
   */
  const SOUNDS = {
    tap: [[0, 1500, 0.035, 0.05, 'sine', 1100]],
    tick: [[0, 2100, 0.025, 0.04, 'sine', 1800]],
    flip: [[0, 520, 0.09, 0.05, 'triangle', 860]],
    correct: [[0, N.A5, 0.12, 0.08, 'sine'], [0.09, N.E6, 0.22, 0.08, 'sine']],
    wrong: [[0, 247, 0.2, 0.08, 'triangle', 196]],
    step: [[0, N.G5, 0.12, 0.07, 'sine'], [0.1, N.C6, 0.24, 0.07, 'sine']],
    done: [[0, N.C6, 0.12, 0.07, 'sine'], [0.1, N.E6, 0.12, 0.07, 'sine'], [0.2, N.G6, 0.32, 0.07, 'sine']],
    perfect: [[0, N.C6, 0.11, 0.07, 'sine'], [0.09, N.E6, 0.11, 0.07, 'sine'], [0.18, N.G6, 0.11, 0.07, 'sine'], [0.27, N.C7, 0.5, 0.07, 'sine'], [0.27, N.G6, 0.5, 0.035, 'sine']],
    open: [[0, N.D6, 0.1, 0.05, 'sine'], [0.08, N.A6, 0.26, 0.05, 'sine']],
  };

  /**
   * getContext：AudioContext を返す関数（英語の音声と同じもの）
   * enabled：鳴らしてよいか（設定）
   */
  function create(getContext, enabled) {
    let last = { name: '', at: 0 };
    function play(name) {
      const spec = SOUNDS[name];
      if (!spec || !enabled()) return false;
      let ctx = null;
      try { ctx = getContext(); } catch (e) { ctx = null; }
      if (!ctx || typeof ctx.createOscillator !== 'function') return false;
      // 同じ音を続けて押したときに重ならないようにする
      const nowMs = Date.now();
      if (last.name === name && nowMs - last.at < 40) return false;
      last = { name, at: nowMs };
      try {
        if (ctx.state === 'suspended' && ctx.resume) ctx.resume();
        const t0 = ctx.currentTime + 0.005;
        const out = ctx.createGain();
        out.gain.value = 1;
        out.connect(ctx.destination);
        spec.forEach(([at, freq, dur, vol, type, to]) => {
          const o = ctx.createOscillator();
          const g = ctx.createGain();
          o.type = type || 'sine';
          o.frequency.setValueAtTime(freq, t0 + at);
          if (to) o.frequency.exponentialRampToValueAtTime(to, t0 + at + dur);
          g.gain.setValueAtTime(0.0001, t0 + at);
          g.gain.exponentialRampToValueAtTime(vol, t0 + at + Math.min(0.012, dur / 4));
          g.gain.exponentialRampToValueAtTime(0.0001, t0 + at + dur);
          o.connect(g);
          g.connect(out);
          o.start(t0 + at);
          o.stop(t0 + at + dur + 0.02);
        });
        if (typeof window !== 'undefined' && window.dispatchEvent && typeof window.CustomEvent === 'function') {
          window.dispatchEvent(new window.CustomEvent('cif:sfx', { detail: { name } }));
        }
        return true;
      } catch (e) {
        return false;
      }
    }
    return { play, names: Object.keys(SOUNDS) };
  }

  return { create, SOUNDS };
});
