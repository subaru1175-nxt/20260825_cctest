/*
 * speech.js — 英語音声の再生
 *
 * 音声の種類（画面に表示して区別する）
 *   録音   … 人が読んだ録音ファイル（単語ごとに URL を登録できる）
 *   AI音声 … あらかじめ作った高品質な音声（音声パック js/audio-pack.js。Kokoro・アメリカ英語）
 *   端末   … 端末のブラウザの読み上げ機能（合成音声）
 *
 * 音声パックは単語ごとの1本のファイルに入っている。中身は「1つの英語 × 速さ」ごとに別々に作った MP3 を
 * つないだもので、バイトの範囲で1つを取り出して、それだけを Web Audio で鳴らす（時間の位置は使わない）。
 * （iPhone ではマナーモードでも鳴るように audioSession を playback にする）
 *
 * 端末の読み上げでは、アメリカ英語（en-US）の声を最優先し、その中でも
 * Premium / Enhanced / Natural など高品質な声を選ぶ。
 * 「ゆっくり」は速さを下げたうえで、複数語の文は 1 語ずつ間をあけて読む（細かく聞き取れるように）。
 * 日本語は読み上げない（英語の文字列だけを渡す）。
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
  const HIGH = /(premium|enhanced|natural|neural|siri|プレミアム|拡張|google us english)/i;

  const MESSAGES = {
    loading: '音声を準備しています…',
    ready: '',
    'no-english': 'この端末で使える英語の音声が見つかりません。設定の「きれいな発音にするには」を見て、英語（アメリカ）の声を追加してください。',
    unsupported: 'このブラウザは音声の読み上げに対応していません。別のブラウザ（Safari や Chrome）で開くと使えます。',
  };

  function normLang(lang) {
    return String(lang || '').replace('_', '-');
  }

  function isEnglish(v) {
    return /^en(-|$)/i.test(normLang(v.lang));
  }

  function isUS(v) {
    return /^en-us$/i.test(normLang(v.lang));
  }

  function isHighQuality(v) {
    return !!v && (HIGH.test(v.name || '') || HIGH.test(v.voiceURI || '') || /(Microsoft .+ Online)/i.test(v.name || ''));
  }

  function score(v) {
    const name = v.name || '';
    const uri = v.voiceURI || '';
    let s = isUS(v) ? 50 : 10;
    if (/premium|プレミアム/i.test(name + uri)) s += 30;
    else if (/enhanced|拡張/i.test(name + uri)) s += 25;
    if (/(Natural|Neural)/i.test(name) || /Microsoft .+ Online/i.test(name)) s += 25;
    if (/siri/i.test(name + uri)) s += 20;
    if (/Google US English/i.test(name)) s += 18;
    if (/\b(Ava|Samantha|Allison|Susan|Zoe|Evan|Nathan|Tom|Aria|Jenny|Guy|Michelle|Joelle|Noelle)\b/i.test(name)) s += 6;
    if (/compact/i.test(uri)) s -= 5;
    if (NOVELTY.test(name)) s -= 100;
    if (v.default) s += 1;
    return s;
  }

  /** ゆっくり用に、文を1語ずつに分ける */
  function slowChunks(text) {
    return String(text || '').trim().split(/\s+/).filter(Boolean);
  }

  /**
   * @param {Window} win
   * @param {() => object} getSettings  { voiceURI, rate, slowRate, slowGap, slowWordByWord }
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
      isHighQuality,
      isUS,
      refresh,
      selectVoice,
      speak,
      play,
      playClip,
      preload,
      packFailed: false,
      stop,
      voiceLabel,
      currentLabel,
    };
    let token = 0;
    let audioEl = null;
    let timer = null;
    let actx = null;
    let curSrc = null;
    const decoded = new Map();

    /** Web Audio を準備する（最初はボタンを押したときに呼ぶ） */
    function audioCtx(create) {
      if (actx) {
        if (actx.state === 'suspended') { try { actx.resume(); } catch (e) { /* noop */ } }
        return actx;
      }
      if (!create) return null;
      const AC = win.AudioContext || win.webkitAudioContext;
      if (!AC) return null;
      try {
        if (win.navigator && win.navigator.audioSession) win.navigator.audioSession.type = 'playback';
      } catch (e) { /* noop */ }
      try {
        actx = new AC();
        // 古い iOS 向け：無音を一度鳴らして、音を出せる状態にする
        const b = actx.createBuffer(1, 1, 22050);
        const src = actx.createBufferSource();
        src.buffer = b;
        src.connect(actx.destination);
        src.start(0);
        if (actx.state === 'suspended') actx.resume();
      } catch (e) {
        actx = null;
      }
      return actx;
    }

    /** ファイル全体（バイト列）。単語ごとに1本。最近使ったものだけ残す */
    const files = new Map();
    function loadFile(url) {
      if (files.has(url)) {
        const p = files.get(url);
        files.delete(url);
        files.set(url, p);
        return p;
      }
      const p = win.fetch(url).then((r) => {
        if (!r.ok) throw new Error('http ' + r.status);
        return r.arrayBuffer();
      });
      p.catch(() => files.delete(url));
      files.set(url, p);
      while (files.size > 16) files.delete(files.keys().next().value);
      return p;
    }

    /**
     * 1つの区間（バイトの a〜b）を、音として使える形にする。
     * 区間は、それだけで再生できる MP3 なので、時間の位置に頼らない（となりの音が鳴ることがない）。
     */
    function loadClip(url, a, b) {
      const key = url + '#' + a + '-' + b;
      if (decoded.has(key)) {
        const p = decoded.get(key);
        decoded.delete(key);
        decoded.set(key, p);
        return p;
      }
      const p = loadFile(url).then((ab) => {
        if (!(a >= 0 && b > a && b <= ab.byteLength)) throw new Error('range');
        const part = ab.slice(a, b); // 写しを渡す（decodeAudioData は渡したものを使えなくすることがある）
        return new Promise((res, rej) => {
          const q = actx.decodeAudioData(part, res, rej);
          if (q && q.then) q.then(res, rej);
        });
      });
      p.catch(() => decoded.delete(key));
      decoded.set(key, p);
      while (decoded.size > 48) decoded.delete(decoded.keys().next().value);
      return p;
    }

    /**
     * 次に使いそうな音を先に読み込む。
     * ボタンを一度押したあと（Web Audio の準備ができたあと）は、区間を音の形にまでしておく。
     * それまではファイルを取ってくるだけ。
     */
    function preload(url, a, b) {
      if (!url || !win.fetch || api.packFailed) return;
      if (actx && a != null && b != null) {
        loadClip(url, a, b).catch(() => {});
        return;
      }
      loadFile(url).catch(() => {});
    }

    /** 再生した区間を知らせる（画面のテストで、どの音が鳴ったかを確かめるため） */
    function announce(url, a, b) {
      try {
        if (typeof win.CustomEvent === 'function' && win.dispatchEvent) win.dispatchEvent(new win.CustomEvent('cif:clip', { detail: { url, a, b } }));
      } catch (e) { /* noop */ }
    }

    /** AI音声の1つの区間（バイトの a〜b）を鳴らす */
    function playClip(url, a, b, opts) {
      const o = opts || {};
      const cb = o.onState || function () {};
      stop();
      const my = ++token;
      const ctx = audioCtx(true);
      if (!ctx || !win.fetch) return playBlob(url, a, b, cb, my);
      loadClip(url, a, b).then((buf) => {
        if (my !== token) return;
        const src = ctx.createBufferSource();
        src.buffer = buf;
        src.connect(ctx.destination);
        src.onended = () => {
          if (my === token) {
            curSrc = null;
            cb('ended');
          }
        };
        curSrc = src;
        src.start(0);
        announce(url, a, b);
        cb('playing', buf.duration);
      }).catch(() => {
        if (my === token) playBlob(url, a, b, cb, my);
      });
      return true;
    }

    /** Web Audio が使えないときの予備：その区間だけを取り出して audio 要素で鳴らす */
    function playBlob(url, a, b, cb, my) {
      const fail = () => {
        if (my !== token) return;
        api.packFailed = true;
        cb('error', 'pack');
      };
      if (!win.fetch || !win.Blob || !win.URL || !win.Audio) {
        fail();
        return false;
      }
      loadFile(url).then((ab) => {
        if (my !== token) return;
        if (!(a >= 0 && b > a && b <= ab.byteLength)) throw new Error('range');
        const u = win.URL.createObjectURL(new win.Blob([ab.slice(a, b)], { type: 'audio/mpeg' }));
        const el = new win.Audio(u);
        audioEl = el;
        const done = () => { try { win.URL.revokeObjectURL(u); } catch (e) { /* noop */ } };
        el.onplaying = () => {
          if (my !== token) return;
          announce(url, a, b);
          cb('playing', el.duration);
        };
        el.onended = () => {
          done();
          if (my === token) cb('ended');
        };
        el.onerror = () => {
          done();
          fail();
        };
        const q = el.play();
        if (q && q.catch) q.catch(() => { done(); fail(); });
      }).catch(fail);
      return true;
    }

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
      english.sort((a, b) => score(b) - score(a));
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
      clearTimeout(timer);
      if (curSrc) {
        try { curSrc.stop(); } catch (e) { /* noop */ }
        curSrc = null;
      }
      try { if (synth) synth.cancel(); } catch (e) { /* noop */ }
      if (audioEl) {
        try { audioEl.pause(); } catch (e) { /* noop */ }
        audioEl = null;
      }
    }

    /**
     * 端末の読み上げ機能で読む。クリック処理の中から同期的に呼ぶこと（iOS の制限）。
     * cb(state, detail): 'playing' | 'ended' | 'error'
     */
    function speak(text, opts) {
      const o = opts || {};
      const cb = o.onState || function () {};
      if (api.status !== 'ready' || !api.voice) return false;
      stop();
      const my = ++token;
      const settings = getSettings() || {};
      const words = slowChunks(text);
      const byWord = !!o.slow && settings.slowWordByWord !== false && words.length > 1;
      const parts = byWord ? words : [String(text)];
      const slowRate = settings.slowRate || 0.55;
      const rate = o.slow ? (byWord ? slowRate : Math.min(slowRate, 0.5)) : settings.rate || 0.95;
      const gap = settings.slowGap == null ? 300 : settings.slowGap;
      let started = false;
      const watchdog = setTimeout(() => {
        if (!started && my === token) {
          try { synth.cancel(); } catch (e) { /* noop */ }
          cb('error', 'no-start');
        }
      }, 4000);

      function say(i) {
        if (my !== token) return;
        const u = new Utter(parts[i]);
        u.voice = api.voice;
        u.lang = normLang(api.voice.lang) || 'en-US';
        u.rate = rate;
        u.pitch = 1;
        u.onstart = () => {
          if (!started) {
            started = true;
            clearTimeout(watchdog);
            if (my === token) cb('playing');
          }
        };
        u.onend = () => {
          if (my !== token) return;
          if (i + 1 < parts.length) timer = setTimeout(() => say(i + 1), gap);
          else cb('ended');
        };
        u.onerror = (e) => {
          clearTimeout(watchdog);
          if (my !== token) return;
          const code = e && e.error;
          if (code === 'interrupted' || code === 'canceled') cb('ended');
          else cb('error', code || 'error');
        };
        synth.speak(u);
        if (synth.paused) synth.resume();
      }

      try {
        say(0);
      } catch (e) {
        clearTimeout(watchdog);
        cb('error', 'exception');
        return false;
      }
      return true;
    }

    /** 音声ファイル（録音・高品質音声）の再生。slowUrl がなければ再生速度を下げる */
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
        a.playbackRate = o.slow && !o.isSlowFile ? 0.7 : 1;
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
      const tags = [];
      if (isUS(v)) tags.push('アメリカ英語');
      else tags.push(normLang(v.lang));
      if (isHighQuality(v)) tags.push('高品質');
      if (v.localService === false) tags.push('オンライン');
      return v.name + '（' + tags.join('・') + '）';
    }

    function currentLabel() {
      return api.voice ? voiceLabel(api.voice) : '';
    }

    return api;
  }

  return { create, score, isEnglish, isUS, isHighQuality, slowChunks, MESSAGES };
});
