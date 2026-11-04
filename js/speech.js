/*
 * speech.js — 英語音声の再生
 *
 * - 録音音声（URL）があればそれを優先し「録音」と表示する。
 * - なければブラウザの読み上げ（合成音声）を使い「合成」と表示する。
 *   端末に実際にある英語の声だけを候補にし、聞き取りやすい声を優先して選ぶ。
 * - 日本語は読み上げない（英語の文字列だけを渡す）。
 * - 使えないときは status で理由を返し、画面側でボタンを無効にして理由を表示する。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.CIF = root.CIF || {};
    root.CIF.speech = factory();
  }
})(this, function () {
  'use strict';

  // 聞き取りにくい・効果音的な声（macOS / iOS の一部）
  const NOVELTY = /\b(Albert|Bad News|Bahh|Bells|Boing|Bubbles|Cellos|Deranged|Good News|Hysterical|Jester|Organ|Superstar|Trinoids|Whisper|Wobble|Zarvox|Junior|Ralph|Fred|Kathy|Princess|Grandma|Grandpa|Rocko|Shelley|Flo|Eddy|Reed|Sandy)\b/i;

  const MESSAGES = {
    loading: '音声を準備しています…',
    ready: '',
    'no-english': 'この端末で使える英語の音声が見つかりません。端末の設定で英語の読み上げ音声を追加すると使えるようになります。',
    unsupported: 'このブラウザは音声の読み上げに対応していません。別のブラウザ（Safari や Chrome）で開くと使えます。',
  };

  function normLang(lang) {
    return String(lang || '').replace('_', '-');
  }

  function isEnglish(v) {
    return /^en(-|$)/i.test(normLang(v.lang));
  }

  function score(v, accent) {
    const lang = normLang(v.lang).toLowerCase();
    const name = v.name || '';
    let s = 0;
    const want = accent === 'uk' ? 'en-gb' : 'en-us';
    if (lang === want) s += 30;
    else if (lang === 'en-us' || lang === 'en-gb') s += 25;
    else s += 18;
    if (/(Natural|Neural)/i.test(name)) s += 15;
    if (/(Enhanced|Premium|Siri)/i.test(name)) s += 12;
    if (/Google/i.test(name)) s += 10;
    if (/\b(Samantha|Alex|Daniel|Karen|Moira|Tessa|Serena|Ava|Allison|Susan|Zoe|Evan|Nathan|Aria|Jenny|Guy|Libby|Sonia|Ryan)\b/i.test(name)) s += 6;
    if (NOVELTY.test(name)) s -= 100;
    if (v.default) s += 2;
    return s;
  }

  /**
   * @param {Window} win
   * @param {() => object} getSettings  { voiceURI, rate, slowRate, accent }
   */
  function create(win, getSettings) {
    const synth = win && win.speechSynthesis;
    const Utter = win && win.SpeechSynthesisUtterance;
    const listeners = [];
    const api = {
      status: synth && Utter ? 'loading' : 'unsupported',
      voices: [],
      voice: null,
      message() {
        return MESSAGES[api.status] || '';
      },
      canSynth() {
        return api.status === 'ready';
      },
      onChange(fn) {
        listeners.push(fn);
      },
      refresh,
      selectVoice,
      speak,
      play,
      stop,
      voiceLabel,
      currentLabel,
    };
    let token = 0;
    let audioEl = null;

    function emit() {
      listeners.forEach((fn) => {
        try { fn(api); } catch (e) { /* noop */ }
      });
    }

    function refresh(final) {
      if (!synth || !Utter) return;
      let list = [];
      try { list = synth.getVoices() || []; } catch (e) { list = []; }
      const settings = getSettings() || {};
      const english = list.filter(isEnglish).filter((v) => !NOVELTY.test(v.name || ''));
      english.sort((a, b) => score(b, settings.accent) - score(a, settings.accent));
      api.voices = english;
      const before = api.status + '|' + (api.voice && api.voice.voiceURI);
      if (english.length) {
        api.voice = english.find((v) => v.voiceURI === settings.voiceURI) || english[0];
        api.status = 'ready';
      } else {
        api.voice = null;
        if (final || list.length) api.status = 'no-english';
      }
      if (before !== api.status + '|' + (api.voice && api.voice.voiceURI)) emit();
    }

    function selectVoice(uri) {
      const v = api.voices.find((x) => x.voiceURI === uri);
      if (v) {
        api.voice = v;
        emit();
      }
      return !!v;
    }

    if (synth && Utter) {
      refresh(false);
      try {
        if (synth.addEventListener) synth.addEventListener('voiceschanged', () => refresh(false));
        else synth.onvoiceschanged = () => refresh(false);
      } catch (e) { /* noop */ }
      // voiceschanged が来ないブラウザもあるので数回確認する
      [300, 800, 1600].forEach((ms) => setTimeout(() => refresh(false), ms));
      setTimeout(() => refresh(true), 2600);
    }

    function stop() {
      token += 1;
      try { if (synth) synth.cancel(); } catch (e) { /* noop */ }
      if (audioEl) {
        try { audioEl.pause(); } catch (e) { /* noop */ }
        audioEl = null;
      }
    }

    /**
     * 合成音声で読み上げる。クリック処理の中から同期的に呼ぶこと（iOS の制限）。
     * cb(state, detail): 'playing' | 'ended' | 'error'
     */
    function speak(text, opts) {
      const o = opts || {};
      const cb = o.onState || function () {};
      if (api.status !== 'ready' || !api.voice) return false;
      stop();
      const my = ++token;
      const settings = getSettings() || {};
      const u = new Utter(String(text));
      u.voice = api.voice;
      u.lang = normLang(api.voice.lang) || 'en-US';
      u.rate = o.slow ? settings.slowRate || 0.6 : settings.rate || 0.95;
      u.pitch = 1;
      let started = false;
      const watchdog = setTimeout(() => {
        if (!started && my === token) {
          try { synth.cancel(); } catch (e) { /* noop */ }
          cb('error', 'no-start');
        }
      }, 4000);
      u.onstart = () => {
        started = true;
        if (my === token) cb('playing');
      };
      u.onend = () => {
        clearTimeout(watchdog);
        if (my === token) cb('ended');
      };
      u.onerror = (e) => {
        clearTimeout(watchdog);
        if (my !== token) return;
        const code = e && e.error;
        if (code === 'interrupted' || code === 'canceled') cb('ended');
        else cb('error', code || 'error');
      };
      try {
        synth.speak(u);
        if (synth.paused) synth.resume();
      } catch (e) {
        clearTimeout(watchdog);
        cb('error', 'exception');
        return false;
      }
      return true;
    }

    /** 録音音声の再生 */
    function play(url, opts) {
      const o = opts || {};
      const cb = o.onState || function () {};
      stop();
      const my = ++token;
      let a;
      try {
        a = new win.Audio(url);
      } catch (e) {
        cb('error', 'audio');
        return false;
      }
      audioEl = a;
      try {
        a.preservesPitch = true;
        a.playbackRate = o.slow ? 0.75 : 1;
      } catch (e) { /* noop */ }
      a.onplaying = () => my === token && cb('playing');
      a.onended = () => my === token && cb('ended');
      a.onerror = () => my === token && cb('error', 'audio');
      const p = a.play();
      if (p && p.catch) p.catch(() => my === token && cb('error', 'audio'));
      return true;
    }

    function voiceLabel(v) {
      if (!v) return '';
      const online = v.localService === false ? '・オンライン' : '';
      return v.name + '（' + normLang(v.lang) + online + '）';
    }

    function currentLabel() {
      return api.voice ? voiceLabel(api.voice) : '';
    }

    return api;
  }

  return { create, score, isEnglish, MESSAGES };
});
