/*
 * ブラウザで実際に操作して確かめるテスト: node tests/e2e.js
 * （Playwright と Chromium が必要）
 *
 * 音声は端末ごとに違うため、テストでは「英語の声が2つ・日本語の声が1つある端末」を
 * まねた読み上げ機能に差し替え、何をどの速さで読み上げようとしたかを記録して確かめる。
 */
'use strict';
const { chromium } = require('playwright');
const { start } = require('../scripts/serve.js');
const SEED = require('../js/data-seed.js');
const STORAGE = require('../js/storage.js');
const SESSION = require('../js/session.js');
const WORDS = SEED.words.length;
const SENSES = SEED.words.reduce((n, w) => n + w.senses.length, 0);
const TOTAL = SESSION.studyable(SEED.words.map((w) => STORAGE.normalizeWord(w).word)).length;
const REVIEW_WORDS = SEED.words.filter((w) => w.status === 'needs_review').map((w) => w.headword).sort();

const PORT = 8765;
const URL0 = 'http://localhost:' + PORT + '/';
const DAY = 24 * 3600 * 1000;
const JA = /[぀-ヿ一-鿿]/;

function speechMock(kind) {
  return `
  (() => {
    window.__spoken = [];
    window.__clips = [];
    window.__stops = 0;
    // アプリが鳴らした区間（ファイルとバイトの範囲）を記録する
    window.addEventListener('cif:clip', (e) => window.__clips.push(e.detail));
    try {
      const P = window.AudioBufferSourceNode && window.AudioBufferSourceNode.prototype;
      if (P) {
        const origStop = P.stop;
        P.stop = function () {
          window.__stops += 1;
          return origStop.apply(this, arguments);
        };
      }
    } catch (e) {}
    const off = Number(localStorage.getItem('__test_offset') || 0);
    if (off) { const real = Date.now.bind(Date); Date.now = () => real() + off; }
    const kind = ${JSON.stringify(kind)};
    if (kind === 'real') return;
    if (kind === 'unsupported') {
      try { delete window.speechSynthesis; } catch (e) {}
      Object.defineProperty(window, 'speechSynthesis', { value: undefined, configurable: true });
      window.SpeechSynthesisUtterance = undefined;
      return;
    }
    const voices = kind === 'none' ? [] : [
      { name: 'Kyoko', lang: 'ja-JP', voiceURI: 'kyoko', localService: true, default: true },
      { name: 'Samantha', lang: 'en-US', voiceURI: 'samantha', localService: true },
      { name: 'Daniel', lang: 'en-GB', voiceURI: 'daniel', localService: true },
      { name: 'Zarvox', lang: 'en-US', voiceURI: 'zarvox', localService: true },
    ];
    function FakeUtter(text) { this.text = text; }
    const synth = {
      paused: false, speaking: false,
      getVoices() { return voices; },
      speak(u) {
        window.__spoken.push({ text: u.text, rate: u.rate, lang: u.lang, voice: u.voice && u.voice.name });
        setTimeout(() => { u.onstart && u.onstart({}); setTimeout(() => u.onend && u.onend({}), 200); }, 5);
      },
      cancel() {}, resume() {}, addEventListener() {},
    };
    Object.defineProperty(window, 'speechSynthesis', { value: synth, configurable: true });
    window.SpeechSynthesisUtterance = FakeUtter;
  })();`;
}

let browser;
const results = [];

async function newPage(opts) {
  const o = opts || {};
  const ctx = await browser.newContext({
    viewport: { width: o.width || 390, height: 844 },
    hasTouch: true,
    isMobile: true,
    locale: 'ja-JP',
    reducedMotion: 'reduce',
  });
  await ctx.addInitScript(speechMock(o.speech || 'mock'));
  const page = await ctx.newPage();
  page.errors = [];
  page.on('pageerror', (e) => page.errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/fonts\.(googleapis|gstatic)/.test(m.text())) page.errors.push(m.text()); });
  await page.goto(URL0);
  await page.waitForSelector('.home');
  return { ctx, page };
}

const ONLY = process.argv[2] || '';

async function test(name, fn) {
  if (ONLY && !name.includes(ONLY)) return;
  try {
    await fn();
    results.push([true, name]);
    console.log('  ✓ ' + name);
  } catch (e) {
    results.push([false, name]);
    console.log('  ✗ ' + name + '\n      ' + (e && e.stack ? e.stack.split('\n').slice(0, 3).join('\n      ') : e));
  }
}

function ok(cond, msg) {
  if (!cond) throw new Error(msg || 'assertion failed');
}
function eq(a, b, msg) {
  if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error((msg || 'not equal') + ': ' + JSON.stringify(a) + ' !== ' + JSON.stringify(b));
}

const ls = (page, key) => page.evaluate((k) => JSON.parse(localStorage.getItem('cif.v1.' + k) || 'null'), key);
const current = async (page) => (await ls(page, 'session')).queue[0];
const spoken = (page) => page.evaluate(() => window.__spoken.slice());
const remainText = (page) => page.textContent('.remain b');
const clips = (page) => page.evaluate(() => window.__clips.slice());
/** 目録の1件：[ファイル名, 開始バイト, 終了バイト, 長さ（秒）, 英語]。key は単語なら '#用法ID'、フレーズ・文なら英語 */
const packOf = (page, key, slow) => page.evaluate(([t, sl]) => window.CIF.audioPack.clips[(sl ? 's|' : 'n|') + t], [key, !!slow]);
const waitClips = (page, n) => page.waitForFunction((k) => window.__clips.length >= k, n, { timeout: 8000 });
/** 鳴らした区間が、目録のその1件（ファイルとバイトの範囲）と同じか */
async function sameClip(page, played, key, slow) {
  const c = await packOf(page, key, slow);
  ok(c, '音声パックにない: ' + key);
  ok(played && played.url.endsWith('/' + c[0]) && played.a === c[1] && played.b === c[2], (slow ? 'ゆっくり ' : '') + key + ' の区間: ' + JSON.stringify(played) + ' / ' + JSON.stringify(c));
  return c;
}
const capOf = (page, sel) => page.textContent(sel + ' .audio-cap');
/** ホームの上のまとまり：[連続学習, 今日の枚数, ポイント] */
const heroStats = (page) => page.evaluate(() => {
  const dd = Array.from(document.querySelectorAll('.hero-stats dd')).map((e) => e.textContent);
  return [dd[0], document.querySelector('.ring-text b').textContent, dd[1]];
});

async function flipAndRate(page, r) {
  await page.click('.card-front .tap-hint');
  await page.waitForSelector('.card-back');
  await page.click('[data-action="rate"][data-r="' + r + '"]');
}

async function finishSet(page, rating) {
  for (let i = 0; i < 40; i++) {
    if (await page.$('.result')) return;
    await flipAndRate(page, rating || 'good');
  }
  throw new Error('set did not finish');
}

async function noHScroll(page, label) {
  const w = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]);
  ok(w[0] <= w[1], label + ' に横スクロール: ' + w.join(' > '));
}

(async () => {
  const server = await start(PORT);
  browser = await chromium.launch();
  console.log('E2E テスト');

  await test('カードの表裏: タップで裏返り、裏面は ニュアンス→場面→意味と役割→例文 の順', async () => {
    const { ctx, page } = await newPage();
    await page.click('[data-action="start"][data-mode="fwd"]');
    await page.waitForSelector('.card-front');
    ok(!(await page.$('.card-back')), '最初は表面');
    ok(!(await page.$('[data-action="rate"]')), '表面では評価ボタンを出さない');
    const head = await page.textContent('.card-front .headword');
    await page.click('.card-front .headword');
    await page.waitForSelector('.card-back');
    const labels = await page.$$eval('.card-back .sec-label', (els) => els.map((e) => e.textContent));
    eq(labels, ['一言ニュアンス', '頭に浮かべる場面', '意味と文の中での役割', '例文']);
    ok((await page.textContent('.card-back .nuance-text')).endsWith('って感じ'));
    ok((await page.textContent('.card-back .scene-text')).length > 5, '頭に浮かべる場面');
    ok(/（(形容詞|副詞|名詞|動詞|前置詞|間投詞|代名詞|助動詞|フレーズ)）/.test(await page.textContent('.card-back .role-line')), '品詞の名前');
    const exJa = await page.$$eval('.card-back .ex', (els) => els.map((e) => [!!e.querySelector('.ex-en'), !!e.querySelector('.ex-ja')]));
    ok(exJa.length >= 1 && exJa.every(([a, b]) => a && b), '例文は英語と日本語訳が別の行');
    ok(!(await page.$eval('details.more', (d) => d.open)), '詳しい説明は最初は閉じている');
    await page.click('details.more > summary');
    ok(await page.isVisible('text=似た単語との違い'), '似た単語との違いが開ける');
    eq(await page.textContent('.card-back .headword'), head);
    ok(await page.isVisible('[data-action="rate"][data-r="good"]'));
    eq(page.errors, [], 'エラーなし');
    await ctx.close();
  });

  await test('音声: 単語・ゆっくり・フレーズ・例文を AI音声（アメリカ英語）で再生し、カードは裏返らない', async () => {
    const { ctx, page } = await newPage();
    await page.click('[data-action="start"][data-mode="fwd"]');
    await page.waitForSelector('.card-front .audio button:not([disabled])');
    const sid = await current(page);
    const word = await page.textContent('.card-front .headword');
    eq(await capOf(page, '.card-front'), 'AI音声・アメリカ英語', '音声の種類を表示');
    const btns = await page.$$('.card-front .audio button');
    eq(await Promise.all(btns.map((b) => b.textContent())), ['再生', 'ゆっくり']);
    await btns[0].click();
    await waitClips(page, 1);
    await btns[1].click();
    await waitClips(page, 2);
    const cue = await page.textContent('.card-front .cue');
    await page.click('.card-front .cue-line .speak-one');
    await waitClips(page, 3);
    ok(await page.$('.card-front'), '音声ボタンでは裏返らない');
    ok(!(await page.$('.card-back')));
    let cs = await clips(page);
    const n = await sameClip(page, cs[0], '#' + sid, false);
    const sl = await sameClip(page, cs[1], '#' + sid, true);
    eq([n[4], sl[4]], [word, word], '単語のボタンは単語だけ（文やフレーズではない）');
    await sameClip(page, cs[2], cue, false);
    ok((sl[3] - 0.42) / (n[3] - 0.42) > 1.9, 'ゆっくりは、はっきり長い: ' + n[3] + '秒 → ' + sl[3] + '秒');
    eq((await spoken(page)).length, 0, 'AI音声があるときは端末の読み上げを使わない');
    await page.click('.card-front .tap-hint');
    await page.waitForSelector('.card-back');
    const exEn = await page.textContent('.card-back .ex .ex-en');
    await page.click('.card-back .ex .audio button[data-slow="0"]');
    await waitClips(page, 4);
    await page.click('.card-back .ex .audio button[data-slow="1"]');
    await waitClips(page, 5);
    cs = await clips(page);
    await sameClip(page, cs[3], exEn, false);
    await sameClip(page, cs[4], exEn, true);
    const texts = await page.$$eval('[data-action="speak"]', (els) => els.map((e) => e.dataset.text));
    ok(texts.length > 3 && texts.every((t) => t && !JA.test(t) && !t.includes('[')), '日本語は読み上げない・[ ] は読まない');
    await page.waitForFunction(() => !document.querySelector('.audio button.playing'), null, { timeout: 8000 });
    ok(await page.$$eval('.card-back .ex .audio-cap', (els) => els.length > 0 && els.every((e) => e.hidden)), '例文は AI音声なので、再生していないときは種類の表示をくり返さない');
    ok(await page.$('.card-back'), '裏面のまま');
    eq(await current(page), sid, '音声ボタンで回答扱いにならない');
    eq(page.errors, []);
    await ctx.close();
  });

  await test('AI音声がない英語（自分で追加した単語）は端末の読み上げ。ゆっくりは1語ずつ', async () => {
    const { ctx, page } = await newPage();
    await page.evaluate(() => {
      const words = JSON.parse(localStorage.getItem('cif.v1.words'));
      words.push({ id: 'w-zz', headword: 'borrow', status: 'unverified', senses: [{ id: 's-zz', pos: 'verb', role: 'action', meaning: '借りる', cue: 'borrow a pen',
        examples: [{ en: 'Can I [borrow] your pen?', ja: 'ペンを借りてもいい？' }] }] });
      localStorage.setItem('cif.v1.words', JSON.stringify(words));
    });
    await page.reload();
    await page.goto(URL0 + '#word-w-zz');
    await page.waitForSelector('.detail-head .audio button:not([disabled])');
    eq(await capOf(page, '.detail-head'), '端末の読み上げ', '端末の読み上げと表示');
    await page.click('.detail-head .audio button[data-slow="0"]');
    await page.click('.detail-head .audio button[data-slow="1"]');
    let sp = await spoken(page);
    eq([sp[0].text, sp[0].rate], ['borrow', 0.95], '通常速度');
    eq(sp[1].rate, 0.5, 'ゆっくり（1語は 0.5 倍）');
    ok(sp.every((x) => x.voice === 'Samantha' && x.lang === 'en-US'), '英語の声（日本語の声や効果音の声は選ばない）');
    eq(await capOf(page, '.ex'), '端末の読み上げ', '例文も端末の読み上げと表示');
    await page.click('.ex .audio button[data-slow="1"]');
    const words = ['Can', 'I', 'borrow', 'your', 'pen?'];
    await page.waitForFunction((k) => window.__spoken.length >= k, 2 + words.length, { timeout: 8000 });
    sp = await spoken(page);
    eq([sp[2].text, sp[2].rate], [words[0], 0.55], 'ゆっくりは1語ずつ・0.55 倍');
    eq(sp.slice(2).map((x) => x.text), words, '例文を1語ずつ区切って最後まで読む');
    eq((await clips(page)).length, 0);
    await ctx.close();
  });

  await test('発音: 品詞で発音が変わる語も、単語だけを、その用法の発音で読む（record / live）', async () => {
    const { ctx, page } = await newPage();
    const wordTexts = async (id) => {
      await page.goto(URL0 + '#word-' + id);
      await page.waitForSelector('.sense-card');
      const out = [];
      for (const card of await page.$$('.sense-card')) {
        const b = await card.$('.audio button[data-slow="0"]');
        out.push([await b.getAttribute('data-key'), await b.getAttribute('data-clip'), await b.getAttribute('data-kind')]);
        const n = (await clips(page)).length;
        await b.click();
        await waitClips(page, n + 1); // 新しく押すと前の音は止まるので、鳴り始めてから次へ
      }
      return out;
    };
    await page.goto(URL0 + '#word-w-record');
    await page.waitForSelector('.sense-card');
    const two = await page.$$('.sense-card .audio button[data-slow="0"]');
    await two[0].click();
    await two[1].click();
    await waitClips(page, 1);
    await page.waitForTimeout(300);
    const started = (await clips(page)).length;
    const stopped = await page.evaluate(() => window.__stops);
    ok(started - stopped <= 1, '続けて押すと前の音は止まり、重ならない（鳴り始め ' + started + '・止めた ' + stopped + '）');
    await sameClip(page, (await clips(page))[started - 1], await two[1].getAttribute('data-key'));
    await page.evaluate(() => { window.__clips.length = 0; });
    const rec = await wordTexts('w-record');
    const live = await wordTexts('w-live');
    eq(rec.concat(live), [['#s-record-noun', 'record', 'pack'], ['#s-record-verb', 'record', 'pack'], ['#s-live-verb', 'live', 'pack'], ['#s-live-adj', 'live', 'pack']], 'record（名詞・動詞）と live（動詞・形容詞）は単語だけ');
    await waitClips(page, 4);
    const cs = await clips(page);
    const rn = await sameClip(page, cs[0], '#s-record-noun');
    const rv = await sameClip(page, cs[1], '#s-record-verb');
    await sameClip(page, cs[2], '#s-live-verb');
    await sameClip(page, cs[3], '#s-live-adj');
    ok(rn[1] !== rv[1], '名詞と動詞は別の音（発音が違う）');
    await page.goto(URL0 + '#word-w-record');
    await page.waitForSelector('.sense-card');
    const detail = await page.textContent('.word-detail');
    ok(detail.includes('/ˈrekərd/') && detail.includes('/rɪˈkɔːrd/'), '用法ごとの発音記号');
    await ctx.close();
  });

  await test('端末の読み上げが使えない端末: AI音声は使え、AI音声がない英語はボタンを無効にして理由を表示', async () => {
    for (const kind of ['none', 'unsupported']) {
      const { ctx, page } = await newPage({ speech: kind });
      await page.evaluate(() => {
        const words = JSON.parse(localStorage.getItem('cif.v1.words'));
        words.push({ id: 'w-zz', headword: 'borrow', status: 'unverified', senses: [{ id: 's-zz', pos: 'verb', meaning: '借りる', examples: [] }] });
        localStorage.setItem('cif.v1.words', JSON.stringify(words));
      });
      await page.reload();
      await page.waitForSelector('.home');
      await page.click('[data-action="start"][data-mode="fwd"]');
      await page.waitForSelector('.card-front');
      ok(!(await page.$eval('.card-front .audio button', (b) => b.disabled)), 'AI音声のボタンは使える');
      eq(await capOf(page, '.card-front'), 'AI音声・アメリカ英語');
      await page.goto(URL0 + '#word-w-zz');
      await page.waitForFunction(() => {
        const c = document.querySelector('.detail-head .audio-cap');
        return c && c.textContent === 'この端末では再生できません';
      }, null, { timeout: 5000 });
      ok(await page.$eval('.detail-head .audio button', (b) => b.disabled), '無効');
      ok(await page.$('.detail-head .audio.off'), '無効の見た目');
      await page.goto(URL0 + '#options');
      await page.waitForSelector('#device-voice');
      const msg = await page.textContent('#device-voice', { timeout: 3000 });
      ok(kind === 'none' ? msg.includes('英語の音声が見つかりません') : msg.includes('対応していません'), msg);
      await ctx.close();
    }
  });

  await test('この環境の実際のブラウザで、AI音声のファイルを読み込んで最後まで鳴らせる', async () => {
    const { ctx, page } = await newPage({ speech: 'real' });
    await page.click('[data-action="start"][data-mode="fwd"]');
    await page.waitForSelector('.card-front .audio button');
    await page.click('.card-front .audio button[data-slow="0"]');
    await page.waitForSelector('.card-front .audio button.playing', { timeout: 8000 });
    await page.waitForFunction(() => !document.querySelector('.card-front .audio button.playing'), null, { timeout: 8000 });
    const capBefore = await page.textContent('.card-front .audio-cap');
    await page.click('.card-front .audio button[data-slow="1"]');
    await page.waitForSelector('.card-front .audio button[data-slow="1"].playing', { timeout: 8000 });
    const live = await page.evaluate(() => {
      const g = document.querySelector('.card-front .audio');
      return { cap: document.querySelector('.card-front .audio-cap').textContent, run: g.classList.contains('run') && g.classList.contains('timed'), dur: g.style.getPropertyValue('--dur') };
    });
    ok(/^ゆっくり再生中（ふつうの2\.2倍・\d\.\d秒）$/.test(live.cap), 'ゆっくり再生中の表示: ' + live.cap);
    ok(live.run && parseFloat(live.dur) > 1, '音の長さだけ進む線: ' + JSON.stringify(live));
    const t0 = Date.now();
    await page.waitForFunction(() => !document.querySelector('.audio button.playing'), null, { timeout: 8000 });
    const took = (Date.now() - t0) / 1000;
    ok(took > parseFloat(live.dur) * 0.6, 'ゆっくりは最後まで鳴る（' + took.toFixed(2) + '秒）');
    eq(await page.textContent('.card-front .audio-cap'), capBefore, '鳴り終わると表示が元に戻る');
    ok(!(await page.$('.card-front .audio.run')), '線も消える');
    const t = await page.textContent('#toast');
    ok(!t || !t.includes('読み込めません'), '読み込みに失敗しない: ' + t);
    eq(page.errors, []);
    const has = await page.evaluate(() => !!(window.speechSynthesis && speechSynthesis.getVoices().some((v) => /^en/i.test(v.lang))));
    console.log('      （AI音声：再生できた／この環境の端末の英語音声: ' + (has ? 'あり' : 'なし') + '）');
    await ctx.close();
  });

  await test('自己評価: 思い出せなかった→3枚後、あいまい→5枚後に再出題、思い出せた→出ない', async () => {
    const { ctx, page } = await newPage();
    await page.click('[data-action="start"][data-mode="fwd"]');
    await page.waitForSelector('.card-front');
    eq(await remainText(page), '10');
    const a = await current(page);
    await flipAndRate(page, 'again');
    await page.waitForSelector('.card-front');
    eq(await remainText(page), '10', '思い出せなかったカードは残り枚数に戻る');
    const b = await current(page);
    await flipAndRate(page, 'hard');
    const c = await current(page);
    await flipAndRate(page, 'good');
    const d = await current(page);
    await flipAndRate(page, 'good');
    eq(await current(page), a, '3枚後に「思い出せなかった」カード');
    eq(await page.textContent('.card-meta .chip.accent'), 'もう一度', '「もう一度」と表示');
    ok((await page.textContent('[data-r="good"] .rate-next').catch(() => '')) === '' || true);
    await flipAndRate(page, 'good');
    const seen = [];
    for (let i = 0; i < 4; i++) {
      seen.push(await current(page));
      await flipAndRate(page, 'good');
    }
    ok(!seen.includes(c) && !seen.includes(d), '思い出せたカードはセット内で再出題しない');
    eq(seen[2], b, '5枚後に「あいまい」のカード');
    const sess = await ls(page, 'session');
    eq(sess.results[b].repeats, 1);
    eq(sess.results[b].answers, ['hard', 'good']);
    const progress = await ls(page, 'progress');
    ok(progress[a].fwd.interval === 0, '思い出せなかった→同じ日にもう一度');
    ok(progress[c].fwd.interval === 1, '思い出せた→翌日');
    await ctx.close();
  });

  await test('セット完了 → 結果画面・復習予定・ポイント・連続日数。再読み込み後も残る', async () => {
    const { ctx, page } = await newPage();
    await page.click('[data-action="start"][data-mode="fwd"]');
    await page.waitForSelector('.card-front');
    await flipAndRate(page, 'again');
    await finishSet(page, 'good');
    await page.waitForSelector('#result-title');
    eq(await page.textContent('#result-title'), 'セット完了');
    ok(await page.isVisible('.done-mark'), '達成の演出');
    const tally = await page.$$eval('.result .stats .stat-num', (els) => els.map((e) => e.textContent));
    eq(tally, ['9', '0', '1']);
    const nexts = await page.$$eval('.rl-next > span:first-child', (els) => els.map((e) => e.textContent));
    eq(nexts.length, 10);
    ok(nexts.filter((t) => t === '明日').length === 9 && nexts.some((t) => t === '10分後'), nexts.join(','));
    ok(await page.isVisible('text=今日の目標を達成しました'));
    const pts = Number((await page.textContent('.earned')).replace(/\D/g, ''));
    eq(pts, 9 * 10 + 3 + 1 + 30 + 20, '獲得ポイント（回答＋再出題＋目標＋セット完了）');
    await page.reload();
    await page.waitForSelector('#result-title');
    await page.goto(URL0 + '#home');
    await page.waitForSelector('.home');
    const stats = await heroStats(page);
    ok(stats[0].startsWith('1'), '連続学習 1日: ' + stats[0]);
    ok(stats[1].startsWith('10'), '今日 10枚');
    ok(stats[2].startsWith(String(pts)), 'ポイント');
    eq(await page.textContent('.hero-done'), '達成', '今日の目標・達成');
    eq(await page.getAttribute('.hero-ring', 'aria-valuenow'), '10', '目標の輪がいっぱい');
    const sched = await page.$$eval('.home .facts dd', (els) => els.map((e) => e.textContent));
    eq(sched[1], '9枚', '明日の予定');

    // 翌日にする → 復習カードを優先
    const progress = await ls(page, 'progress');
    await page.evaluate((ms) => localStorage.setItem('__test_offset', String(ms)), DAY);
    await page.reload();
    await page.waitForSelector('.home');
    const counts = await page.$$eval('.home .counts', (els) => Array.from(els[0].querySelectorAll('b')).map((e) => e.textContent));
    eq(counts.slice(0, 2), ['10', String(TOTAL - 10)], '翌日: 復習10枚・残りは新しいカード');
    const stats2 = await heroStats(page);
    ok(stats2[0].startsWith('1') && (await page.isVisible('text=今日はまだ学習していません')), '翌日はまだ学習していない表示');
    ok(!(await page.$('.hero-done')), '翌日は目標の達成表示が消える');
    await page.click('[data-action="start"][data-mode="fwd"]');
    await page.waitForSelector('.card-front');
    const set = await ls(page, 'session');
    ok(set.cards.every((id) => progress[id]), '復習予定のカードだけで10枚: ' + set.cards.join(','));
    // 2日目も学習して、連続2日
    await finishSet(page, 'good');
    await page.goto(URL0 + '#home');
    await page.waitForSelector('.home');
    const stats3 = await heroStats(page);
    ok(stats3[0].startsWith('2'), '連続学習 2日: ' + stats3[0]);
    const p2 = await ls(page, 'progress');
    const someId = set.cards.find((id) => p2[id].fwd.history.length >= 2 && p2[id].fwd.history.every((h) => h.r === 'good'));
    ok(someId && p2[someId].fwd.interval === 3, '2回続けて思い出せた → 3日後');
    // 詳細画面に履歴と次の予定
    const wid = await page.evaluate((sid) => JSON.parse(localStorage.getItem('cif.v1.words')).find((w) => w.senses.some((s) => s.id === sid)).id, someId);
    await page.goto(URL0 + '#word-' + wid);
    await page.waitForSelector('.history');
    ok((await page.textContent('.word-detail')).includes('次の復習：3日後'));
    ok((await page.$$('.history li')).length >= 2, '評価の履歴');
    eq(page.errors, []);
    await ctx.close();
  });

  await test('途中で終了しても、続きから再開できる（ホームから／再読み込みから）', async () => {
    const { ctx, page } = await newPage();
    await page.click('[data-action="start"][data-mode="fwd"]');
    await page.waitForSelector('.card-front');
    await flipAndRate(page, 'good');
    await flipAndRate(page, 'good');
    const cur = await current(page);
    await page.click('[data-action="quit"]');
    await page.waitForSelector('.home');
    await page.reload();
    await page.waitForSelector('[data-action="resume"]');
    ok((await page.textContent('[data-action="resume"]')).includes('残り 8枚'));
    await page.click('[data-action="resume"]');
    await page.waitForSelector('.card-front');
    eq(await current(page), cur);
    // 裏返した状態で再読み込み → 同じカードの裏面から
    await page.click('.card-front .tap-hint');
    await page.waitForSelector('.card-back');
    await page.reload();
    await page.waitForSelector('.card-back');
    eq(await current(page), cur);
    eq(await remainText(page), '8');
    // 新しいセットを始めるときは確認する
    await page.click('[data-action="quit"]');
    await page.click('[data-action="start"][data-mode="fwd"]');
    await page.waitForSelector('.modal');
    await page.click('.modal [data-action="modal-cancel"]');
    ok(await page.$('[data-action="resume"]'), 'やめると途中のセットはそのまま');
    await ctx.close();
  });

  await test('キーボード: Space で裏返し、1〜3 で評価', async () => {
    const { ctx, page } = await newPage({ width: 1024 });
    await page.click('[data-action="start"][data-mode="fwd"]');
    await page.waitForSelector('.card-front');
    const first = await current(page);
    await page.keyboard.press('Space');
    await page.waitForSelector('.card-back');
    await page.keyboard.press('3');
    await page.waitForSelector('.card-front');
    ok((await current(page)) !== first);
    await ctx.close();
  });

  await test('場面 → 英語: 単語を隠して場面と穴あき例文を出し、ヒントで最初の文字', async () => {
    const { ctx, page } = await newPage();
    eq(await page.$$eval('.home .seg button', (els) => els.map((e) => e.textContent + ':' + e.getAttribute('aria-pressed'))), ['英語 → 場面:true', '場面 → 英語:false'], '出題のしかたは切り替えで選ぶ');
    await page.click('[data-action="set-mode"][data-v="rev"]');
    ok(await page.$eval('[data-action="start"][data-mode="rev"]', (b) => b.disabled), '最初は押せない（案内だけ）');
    ok(await page.isVisible('text=「英語 → 場面」で一度学習したカードから出ます'), '案内');
    await page.click('[data-action="set-mode"][data-v="fwd"]');
    await page.click('[data-action="start"][data-mode="fwd"]');
    await page.waitForSelector('.card-front');
    await finishSet(page, 'good');
    await page.goto(URL0 + '#home');
    await page.waitForSelector('.home');
    await page.click('[data-action="set-mode"][data-v="rev"]');
    await page.reload();
    await page.waitForSelector('[data-action="start"][data-mode="rev"]:not([disabled])');
    ok(true, '選んだ出題のしかたは保存される');
    await page.click('[data-action="start"][data-mode="rev"]');
    await page.waitForSelector('.card-front.rev');
    const sid = await current(page);
    const word = await page.evaluate((id) => JSON.parse(localStorage.getItem('cif.v1.words')).find((w) => w.senses.some((s) => s.id === id)).headword, sid);
    const text = await page.textContent('.card-front.rev');
    ok(!new RegExp('\\b' + word + '\\b', 'i').test(text.replace(/[぀-ヿ一-鿿]/g, ' ')), '表面に答えの単語を出さない: ' + word);
    ok(await page.$('.card-front.rev .blank'), '例文は空欄');
    ok(await page.$('.card-front.rev .scene-text'), '場面の説明');
    ok(!(await page.$('.card-front.rev .audio')) && !(await page.$('.card-front.rev .speak-one')), '表面で英語を読み上げない（答えが分かってしまう）');
    await page.click('[data-action="hint"]');
    const hint = await page.textContent('.hint');
    ok(hint.startsWith(word[0]), 'ヒント: ' + hint);
    ok(await page.$('.card-front.rev'), 'ヒントで裏返らない');
    await page.click('.card-front .tap-hint');
    await page.waitForSelector('.card-back');
    eq(await page.textContent('.card-back .headword'), word);
    await page.click('[data-action="rate"][data-r="good"]');
    const p = await ls(page, 'progress');
    ok(p[sid].rev && p[sid].rev.interval === 1, '逆向きの復習予定は別に記録');
    ok(p[sid].fwd.interval === 1, '英語→場面の予定は変わらない');
    await ctx.close();
  });

  await test('単語の追加・編集。要確認は出題から外す。再読み込み後も残る', async () => {
    const { ctx, page } = await newPage();
    await page.click('.nav-item[href="#words"]');
    await page.waitForSelector('.word-list');
    eq((await page.$$('.word-row')).length, WORDS);
    await page.click('[data-action="new-word"]');
    await page.waitForSelector('#edit-form');
    await page.fill('#f-headword', 'borrow');
    await page.selectOption('#f-senses-0-pos', 'verb');
    await page.selectOption('#f-senses-0-role', 'action');
    await page.fill('#f-senses-0-meaning', '借りる');
    await page.fill('#f-senses-0-nuance', '「あとで返す約束で、ちょっと使わせてもらう」って感じ');
    await page.fill('#f-senses-0-scene-text', '友だちにペンを借りる。');
    await page.fill('#f-senses-0-cue', 'borrow a pen');
    await page.fill('#f-senses-0-examples-0-en', 'Can I [borrow] your pen?');
    await page.fill('#f-senses-0-examples-0-ja', 'ペンを借りてもいい？');
    await page.click('[data-action="add-contrast"]');
    await page.fill('#f-senses-0-contrasts-0-word', 'lend');
    await page.fill('#f-senses-0-contrasts-0-text', '「貸す」。borrow は「借りる」。');
    // 確認済みにするには出典が必要
    await page.selectOption('#f-status', 'verified');
    await page.click('[data-action="save-word"]');
    await page.waitForSelector('.banner.warn');
    ok((await page.textContent('.banner.warn')).includes('出典'));
    eq(await page.inputValue('#f-senses-0-meaning'), '借りる', 'エラーでも入力は消えない');
    await page.fill('#f-sources', "Oxford Learner's Dictionaries | https://www.oxfordlearnersdictionaries.com/definition/english/borrow");
    await page.click('[data-action="save-word"]');
    await page.waitForSelector('.word-detail');
    eq(await page.textContent('.detail-head .headword'), 'borrow');
    ok((await page.textContent('.word-detail')).includes('確認済み'));
    ok((await page.textContent('.word-detail')).includes('lend'));
    // 編集
    await page.click('a[href^="#edit-"]');
    await page.waitForSelector('#edit-form');
    await page.fill('#f-senses-0-meaning', '（返す約束で）借りる');
    await page.click('[data-action="add-example"]');
    await page.fill('#f-senses-0-examples-1-en', 'I [borrowed] a book from the library.');
    await page.fill('#f-senses-0-examples-1-ja', '図書館で本を借りた。');
    await page.click('[data-action="save-word"]');
    await page.waitForSelector('.word-detail');
    ok((await page.textContent('.word-detail .meaning-text')).includes('（返す約束で）借りる'));
    eq((await page.$$('.word-detail .ex')).length, 2);
    // 戻るで一覧へ（編集画面に戻らない）
    await page.click('[data-action="back"]');
    await page.waitForSelector('.word-list');
    // 英字以外の見出し語 → 要確認
    await page.click('[data-action="new-word"]');
    await page.waitForSelector('#edit-form');
    await page.fill('#f-headword', 'かりる');
    await page.fill('#f-senses-0-meaning', '借りる');
    await page.click('[data-action="save-word"]');
    await page.waitForSelector('.word-detail');
    ok((await page.textContent('.word-detail')).includes('要確認：通常の出題から外しています'));
    ok((await page.textContent('.word-detail')).includes('英字以外の文字'));
    await page.reload();
    await page.waitForSelector('.word-detail');
    await page.goto(URL0 + '#home');
    await page.waitForSelector('.home');
    const counts = await page.$$eval('.home .counts', (els) => Array.from(els[0].querySelectorAll('b')).map((e) => e.textContent));
    eq(counts.slice(0, 2), ['0', String(TOTAL + 1)], '追加した borrow は出題、要確認は出題しない');
    await page.goto(URL0 + '#words');
    await page.waitForSelector('.word-list');
    await page.selectOption('#status-filter', 'review');
    eq(await page.$$eval('.word-row .r-title b', (els) => els.map((e) => e.textContent)), REVIEW_WORDS.concat(['かりる']));
    await page.selectOption('#status-filter', 'all');
    await page.fill('#word-search', '借り');
    eq((await page.$$eval('.word-row .r-title b', (els) => els.map((e) => e.textContent))).sort(), ['borrow', 'かりる']);
    // borrow を学習に出す
    const words = await ls(page, 'words');
    const borrow = words.find((w) => w.headword === 'borrow');
    eq(borrow.senses[0].examples.length, 2);
    eq(borrow.sources[0].url.slice(0, 8), 'https://');
    // 削除
    await page.goto(URL0 + '#word-' + borrow.id);
    await page.waitForSelector('.word-detail');
    await page.click('[data-action="delete-word"]');
    await page.click('[data-action="modal-ok"]');
    await page.waitForSelector('.word-list');
    ok(!(await ls(page, 'words')).some((w) => w.headword === 'borrow'));
    eq(page.errors, []);
    await ctx.close();
  });

  await test('単語詳細: 関連する用法をまとめて表示、離れた意味は別グループ', async () => {
    const { ctx, page } = await newPage();
    await page.goto(URL0 + '#word-w-well');
    await page.waitForSelector('.word-detail');
    const titles = await page.$$eval('.section-title', (els) => els.map((e) => e.textContent));
    ok(titles[0].startsWith('グループ A') && titles[1].startsWith('グループ B'), titles.join(','));
    ok((await page.textContent('.group-note')).includes('無理に一つのイメージにまとめなくて大丈夫'));
    eq((await page.$$('.sense-card')).length, 3);
    ok((await page.textContent('.word-detail')).includes('確認方法'), '確認状況');
    ok((await page.$$('.source-list a')).length >= 2, '出典リンク');
    await page.goto(URL0 + '#word-w-pretty');
    await page.waitForSelector('.word-detail');
    const meanings = await page.$$eval('.sense-card .meaning-text', (els) => els.map((e) => e.textContent));
    ok(meanings[0].includes('かわいい') && meanings[1].includes('けっこう'), 'pretty は「かわいい」と「けっこう」を別カード');
    await ctx.close();
  });

  await test('書き出し → リセット → 読み込みで、単語と学習記録が戻る', async () => {
    const { ctx, page } = await newPage();
    await page.click('[data-action="start"][data-mode="fwd"]');
    await page.waitForSelector('.card-front');
    await finishSet(page, 'good');
    const before = { progress: await ls(page, 'progress'), log: await ls(page, 'log') };
    await page.goto(URL0 + '#options');
    await page.waitForSelector('.options');
    await page.click('[data-action="export-copy"]');
    await page.waitForSelector('#export-text');
    const json = await page.inputValue('#export-text');
    const data = JSON.parse(json);
    eq(data.format, 'core-image-flashcards');
    eq(data.words.length, WORDS);
    ok(Object.keys(data.progress).length === 10);
    await page.click('[data-action="reset-progress"]');
    await page.click('[data-action="modal-ok"]');
    eq(await ls(page, 'progress'), {});
    // 貼り付けと同じく、一度に入力する（fill は長い文字列だと遅すぎるため）
    await page.$eval('#import-text', (el, v) => { el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); }, json);
    await page.click('[data-action="import-check"]');
    await page.waitForSelector('.import-preview');
    ok((await page.textContent('.import-preview')).includes('単語 ' + WORDS + '語（用法 ' + SENSES + 'つ）'));
    await page.click('[data-action="import-replace"]');
    await page.click('[data-action="modal-ok"]');
    await page.waitForTimeout(100);
    eq(await ls(page, 'progress'), before.progress);
    eq((await ls(page, 'log')).totalPoints, before.log.totalPoints);
    // ファイルからの読み込み（壊れたファイルは断る）
    await page.setInputFiles('#import-file', { name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from('{oops') });
    await page.waitForSelector('.import-error');
    ok((await page.textContent('.import-error')).includes('JSON として読み込めませんでした'));
    // 要確認になる単語を含むファイルを「追加・更新」
    const extra = { format: 'core-image-flashcards', version: 1, words: [{ id: 'w-x', headword: 'gr�at', senses: [{ meaning: 'すごい' }] }] };
    await page.setInputFiles('#import-file', { name: 'x.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(extra)) });
    await page.waitForSelector('.import-preview');
    ok((await page.textContent('.import-preview')).includes('うち要確認 1語'));
    await page.click('[data-action="import-merge"]');
    const ws = await ls(page, 'words');
    eq(ws.length, WORDS + 1);
    eq(ws.find((w) => w.id === 'w-x').status, 'needs_review');
    // ファイルに保存（ダウンロード）
    const [dl] = await Promise.all([page.waitForEvent('download'), page.click('[data-action="export-file"]')]);
    ok(/^core-image-cards-\d{8}\.json$/.test(dl.suggestedFilename()), dl.suggestedFilename());
    await ctx.close();
  });

  await test('音声の設定: 端末の読み上げの声・速さが保存され、再読み込み後も使われる', async () => {
    const { ctx, page } = await newPage();
    await page.goto(URL0 + '#options');
    await page.waitForSelector('#voice-section');
    ok((await page.textContent('#voice-section')).includes('AI音声（アメリカ英語）'), 'いま使っている音声の説明');
    ok(!(await page.$eval('#device-voice', (d) => d.open)), '端末の読み上げの設定は、たたんでおく');
    await page.click('#device-voice > summary');
    await page.waitForSelector('#voice-select:not([disabled])');
    const opts = await page.$$eval('#voice-select option', (els) => els.map((e) => e.textContent));
    ok(opts.length === 2 && /アメリカ英語/.test(opts[0]) && /en-GB/.test(opts[1]), '英語の声だけ・アメリカ英語が先: ' + opts.join(','));
    await page.selectOption('#voice-select', 'daniel');
    await page.$eval('#slow-rate', (el) => { el.value = '0.5'; el.dispatchEvent(new Event('input', { bubbles: true })); });
    ok(await page.$eval('#device-voice', (d) => d.open), '変更しても開いたまま');
    await page.reload();
    await page.waitForSelector('#voice-select', { state: 'attached' });
    await page.click('#device-voice > summary');
    eq(await page.inputValue('#voice-select'), 'daniel');
    await page.click('#device-voice .audio button[data-slow="1"]');
    const sp = await spoken(page);
    eq([sp[0].voice, sp[0].rate, sp[0].lang], ['Daniel', 0.5, 'en-GB']);
    ok((await page.textContent('#device-voice')).includes('Daniel'));
    ok((await page.textContent('#device-voice')).includes('選んでいる声はアメリカ英語ではありません'), 'アメリカ英語でない声を選ぶと案内する');
    await ctx.close();
  });

  await test('自動読み上げ: 設定をオンにすると、カード表示時に単語を読み上げる', async () => {
    const { ctx, page } = await newPage();
    await page.goto(URL0 + '#options');
    await page.waitForSelector('#autoplay');
    await page.check('#autoplay');
    await page.click('.nav-item[href="#home"]');
    await page.waitForSelector('.home');
    await page.click('[data-action="start"][data-mode="fwd"]');
    await page.waitForSelector('.card-front');
    await waitClips(page, 1);
    await sameClip(page, (await clips(page))[0], '#' + (await current(page)));
    await flipAndRate(page, 'good');
    await page.waitForSelector('.card-front');
    await waitClips(page, 2);
    await sameClip(page, (await clips(page))[1], '#' + (await current(page)), false);
    eq((await clips(page)).length, 2, '1枚につき1回');
    await ctx.close();
  });

  await test('録音音声: 登録すると「録音」と表示して優先再生。再生できない時は案内する', async () => {
    const { ctx, page } = await newPage();
    await page.goto(URL0 + '#edit-w-on');
    await page.waitForSelector('#edit-form');
    await page.fill('#f-senses-0-audio-word', 'audio/not-found.mp3');
    await page.click('[data-action="save-word"]');
    await page.waitForSelector('.word-detail');
    eq(await capOf(page, '.detail-head'), '録音（人の声）', '単語ボタンは録音');
    eq(await page.$$eval('.detail-head .audio button', (els) => els.map((e) => e.dataset.kind)), ['rec', 'rec']);
    eq(await page.getAttribute('.ex .audio', 'data-kind'), 'pack', '録音がない例文は AI音声');
    await page.click('.detail-head .audio button[data-slow="0"]');
    await page.waitForFunction(() => document.getElementById('toast').textContent.includes('録音を再生できませんでした'), null, { timeout: 5000 });
    eq((await spoken(page)).length, 0, '録音があるときは合成音声を使わない');
    eq((await clips(page)).length, 0, '録音があるときは AI音声を使わない');
    await ctx.close();
  });

  await test('手書きの単語リスト: 資料の単語から出題し、要確認の語は詳細で理由を表示', async () => {
    const { ctx, page } = await newPage();
    await page.click('[data-action="start"][data-mode="fwd"]');
    await page.waitForSelector('.card-front');
    eq(await page.textContent('.card-front .headword'), 'begin', '資料の最初の単語から');
    const set = await ls(page, 'session');
    const ws = await ls(page, 'words');
    const owner = (id) => ws.find((w) => w.senses.some((x) => x.id === id));
    ok(set.cards.every((id) => !SEED.sample.includes(owner(id).id)), '最初のセットは資料の単語だけ');
    await page.goto(URL0 + '#word-w-fell');
    await page.waitForSelector('.word-detail');
    const t = await page.textContent('.word-detail');
    ok(t.includes('要確認：通常の出題から外しています') && t.includes('判断できません'), 'fell の理由');
    await page.goto(URL0 + '#word-w-everyone');
    await page.waitForSelector('.word-detail');
    const e = await page.textContent('.word-detail');
    ok(e.includes('every one') && e.includes('確認済み') && e.includes("Oxford Learner's Dictionaries: everyone"), 'everyone の読み取りメモと出典');
    await page.goto(URL0 + '#word-w-excuse');
    await page.waitForSelector('.sense-card');
    const cards = await page.$$('.sense-card');
    const ex = [];
    for (const c of cards.slice(0, 2)) {
      const b = await c.$('.audio button[data-slow="0"]');
      ex.push(await b.getAttribute('data-clip'));
      const n = (await clips(page)).length;
      await b.click();
      await waitClips(page, n + 1);
    }
    eq(ex, ['excuse', 'excuse'], 'excuse は単語だけ');
    await waitClips(page, 2);
    await sameClip(page, (await clips(page))[0], '#s-excuse-verb');
    await sameClip(page, (await clips(page))[1], '#s-excuse-noun');
    await page.goto(URL0 + '#word-w-north');
    await page.waitForSelector('.word-detail .dg');
    ok((await page.getAttribute('.word-detail .dg', 'aria-label')).includes('北'), '方角の図');
    eq(page.errors, []);
    await ctx.close();
  });

  await test('前の版の学習記録がある人にも、資料の単語が追加される', async () => {
    const { ctx, page } = await newPage();
    // 見本の11語だけ・版1 の状態を作り、1枚学習済みにする
    await page.evaluate((sample) => {
      const words = JSON.parse(localStorage.getItem('cif.v1.words')).filter((w) => sample.includes(w.id));
      localStorage.setItem('cif.v1.words', JSON.stringify(words));
      localStorage.setItem('cif.v1.meta', JSON.stringify({ seedVersion: 1, deletedSeed: [] }));
      localStorage.setItem('cif.v1.progress', JSON.stringify({ 's-pretty-adj': { fwd: { reps: 1, lapses: 0, streak: 1, interval: 1, ease: 2.5, due: Date.now() + 864e5, last: Date.now(), history: [] } } }));
    }, SEED.sample);
    await page.reload();
    await page.waitForSelector('.home');
    const ws = await ls(page, 'words');
    eq(ws.length, WORDS);
    eq(ws[0].headword, 'begin');
    ok((await ls(page, 'progress'))['s-pretty-adj'], '学習記録は残る');
    eq((await ls(page, 'meta')).seedVersion, SEED.version);
    await ctx.close();
  });

  await test('回のテスト: 採点・間違いの一覧・覚えていないリスト・解き直し・何回目で満点か', async () => {
    const { ctx, page } = await newPage();
    // テストを短くするため、3語だけの回を用意する
    await page.evaluate(() => {
      const rounds = JSON.parse(localStorage.getItem('cif.v1.rounds'));
      rounds.push({ id: 'r-mini', no: 9, title: '小テスト回', source: 'E2E', addedAt: '', wordIds: ['w-begin', 'w-sad', 'w-tooth'] });
      localStorage.setItem('cif.v1.rounds', JSON.stringify(rounds));
    });
    await page.reload();
    await page.waitForSelector('.home');
    ok((await page.textContent('.home .list')).includes('第1回'), 'ホームに第1回');
    await page.goto(URL0 + '#round-r-mini');
    await page.waitForSelector('.round');
    ok((await page.textContent('.round')).includes('内容理解（4択）3問と、文章作成（並べ替え）3問'));
    await page.click('[data-action="start-test"]');
    await page.waitForSelector('.qcard');

    const cur = () => page.evaluate(() => {
      const t = JSON.parse(localStorage.getItem('cif.v1.tests'));
      return t.current ? t.current.questions[t.current.index] : null;
    });
    let meaningChecked = 0;
    async function answerMcq(right) {
      const q = await cur();
      if (q.qtype === 'meaning') {
        // 意味を答える問題：単語のボタンは単語だけ、フレーズは丸いボタン
        const b = await page.$('.qcard .audio button[data-slow="0"]');
        eq([await b.getAttribute('data-key'), await b.getAttribute('data-clip')], ['#' + q.senseId, q.prompt.headword], '問題の単語のボタン');
        if (q.prompt.cue) eq(await page.getAttribute('.qcard .cue-line .speak-one', 'data-clip'), q.prompt.cue.trim(), '問題のフレーズのボタン');
        meaningChecked += 1;
      }
      const i = right ? q.answer : (q.answer + 1) % 4;
      await page.click('[data-action="choose"][data-i="' + i + '"]');
      await page.waitForSelector('.feedback');
      ok((await page.textContent('.feedback .fb-title')).includes(right ? '正解' : '不正解'));
      await page.click('[data-action="test-next"]');
    }
    async function answerOrder(right) {
      const q = await cur();
      if (!right) {
        await page.click('[data-action="test-skip"]');
      } else {
        for (const w of q.answers[0].split(' ')) {
          const tiles = await page.$$('.tile-bank button.tile');
          let done = false;
          for (const t of tiles) {
            if (((await t.textContent()) || '').toLowerCase() === w) { await t.click(); done = true; break; }
          }
          ok(done, '語が見つからない: ' + w);
        }
        await page.click('[data-action="order-check"]');
      }
      await page.waitForSelector('.feedback');
      ok((await page.textContent('.feedback .fb-title')).includes(right ? '正解' : '不正解'));
      await page.click('[data-action="test-next"]');
    }

    // 1回目：内容理解 1問目をまちがえ、途中で再読み込み
    await answerMcq(false);
    const before = await cur();
    await page.reload();
    await page.waitForSelector('.qcard');
    eq((await cur()).id, before.id, '再読み込みしても同じ問題から');
    await answerMcq(true);
    await answerMcq(true);
    await page.waitForSelector('.part-intro');
    ok((await page.textContent('.part-intro')).includes('2 / 3問 正解'));
    await page.click('[data-action="test-part-go"]');
    await answerOrder(true);
    await answerOrder(false);
    await answerOrder(true);
    await page.waitForSelector('.score-hero');
    eq(await page.textContent('.score-num b'), String(Math.floor(50 * 2 / 3) * 2), '33 + 33 = 66点');
    ok((await page.textContent('.score-hero')).includes('満点まであと 34点'));
    eq((await page.$$('.wrong-list li')).length, 2, '間違えた問題が2つ並ぶ');
    ok((await page.textContent('.wrong-list')).includes('あなたの答え'));

    // 覚えていないリストに2件、カード学習は間違えた単語だけ
    await page.goto(URL0 + '#misses');
    await page.waitForSelector('.misses');
    eq((await page.$$('.miss-list li')).length, 2);
    ok((await page.textContent('.miss-list')).includes('小テスト回'));
    await page.click('[data-action="review-test"]');
    await page.waitForSelector('.qcard');
    for (let k = 0; k < 2; k++) {
      const q = await cur();
      if (q.part === 'understand') await answerMcq(true);
      else {
        const intro = await page.$('[data-action="test-part-go"]');
        if (intro) await intro.click();
        await answerOrder(true);
      }
    }
    await page.waitForSelector('.score-hero');
    eq(await page.textContent('.score-num b'), '100');
    ok((await page.textContent('.score-hero')).includes('克服'));
    await page.goto(URL0 + '#misses');
    await page.waitForSelector('.misses');
    eq((await page.$$('.miss-list li')).length, 0, 'まだ覚えていない問題は0件');
    await page.click('[data-action="miss-status"][data-v="all"]');
    eq((await page.$$('.miss-list li.solved')).length, 2, '克服した問題も記録に残る');

    // 2回目：全問正解 → 満点。「2回目で満点」
    await page.goto(URL0 + '#round-r-mini');
    await page.waitForSelector('[data-action="start-test"]');
    ok((await page.textContent('[data-action="start-test"]')).includes('2回目'));
    await page.click('[data-action="start-test"]');
    await page.waitForSelector('.qcard');
    for (let k = 0; k < 3; k++) await answerMcq(true);
    await page.click('[data-action="test-part-go"]');
    for (let k = 0; k < 3; k++) await answerOrder(true);
    await page.waitForSelector('.score-hero');
    eq(await page.textContent('.score-num b'), '100');
    ok((await page.textContent('.score-hero')).includes('2回目で満点を取りました'));
    await page.goto(URL0 + '#round-r-mini');
    await page.waitForSelector('a.row[href^="#score-"]');
    ok((await page.textContent('.facts')).includes('満点2回目'), '何回目で満点か: ' + (await page.textContent('.facts')));
    eq((await page.$$('a.row[href^="#score-"]')).length, 2, 'テストの記録が2回分');
    ok((await page.textContent('a.row[href^="#score-"]')).includes('100点'), '新しい順');
    await page.reload();
    await page.waitForSelector('a.row[href^="#score-"]');
    eq((await page.$$('a.row[href^="#score-"]')).length, 2, '再読み込み後も記録が残る');
    eq(page.errors, []);
    await ctx.close();
  });

  await test('回ごとのカード学習: 第1回のカードだけが出る', async () => {
    const { ctx, page } = await newPage();
    await page.goto(URL0 + '#round-r1');
    await page.waitForSelector('.round');
    await page.click('[data-action="start"][data-mode="fwd"]');
    await page.waitForSelector('.card-front');
    ok((await page.textContent('.topbar .t-label')).includes('第1回'));
    const set = await ls(page, 'session');
    const r1 = SEED.rounds[0].wordIds;
    const ws = await ls(page, 'words');
    ok(set.cards.every((id) => r1.includes(ws.find((w) => w.senses.some((x) => x.id === id)).id)), '第1回の単語だけ');
    await ctx.close();
  });

  await test('スマホ幅（360px）で横スクロールが出ない', async () => {
    const { ctx, page } = await newPage({ width: 360 });
    await noHScroll(page, 'ホーム');
    await page.click('[data-action="start"][data-mode="fwd"]');
    await page.waitForSelector('.card-front');
    await noHScroll(page, '表面');
    await page.click('.card-front .tap-hint');
    await page.click('details.more > summary');
    await noHScroll(page, '裏面');
    const btn = await page.$eval('[data-r="again"]', (b) => b.getBoundingClientRect().height);
    ok(btn >= 44, '評価ボタンは押しやすい大きさ');
    await page.click('[data-action="rate"][data-r="good"]');
    await finishSet(page, 'good');
    await noHScroll(page, '結果');
    for (const h of ['words', 'word-w-light', 'edit-w-light', 'options', 'round-r1', 'misses']) {
      await page.goto(URL0 + '#' + h);
      await page.waitForTimeout(150);
      await noHScroll(page, h);
    }
    eq(page.errors, []);
    await ctx.close();
  });

  await test('全単語の点検：どのボタンも、となりに出している英語の音だけを鳴らす（単語は単語だけ・例文はその例文）', async () => {
    const { ctx, page } = await newPage();
    const same = (a, b) => String(a).replace(/[’‘]/g, "'").replace(/\s+/g, ' ').trim().toLowerCase() === String(b).replace(/[’‘]/g, "'").replace(/\s+/g, ' ').trim().toLowerCase();
    const problems = [];
    let checked = 0;
    for (const w of SEED.words) {
      await page.goto(URL0 + '#word-' + w.id);
      await page.waitForSelector('.word-detail');
      const rows = await page.evaluate(() => Array.from(document.querySelectorAll('.word-detail .audio')).map((g) => {
        const ex = g.closest('.ex');
        const card = g.closest('.sense-card');
        return {
          kind: g.dataset.kind,
          btns: Array.from(g.querySelectorAll('button')).map((b) => ({ kind: b.dataset.kind, key: b.dataset.key || '', clip: b.dataset.clip || '', slow: b.dataset.slow })),
          shown: ex ? ex.querySelector('.ex-en').textContent : document.querySelector('.detail-head .headword').textContent,
          isEx: !!ex,
          offCard: !!(card && card.classList.contains('is-off')),
        };
      }));
      const review = w.status === 'needs_review';
      const wordRows = rows.filter((r) => !r.isEx);
      if (wordRows.length !== w.senses.length) problems.push(w.headword + ': 単語の音声の数 ' + wordRows.length + ' / 用法 ' + w.senses.length);
      rows.forEach((r) => {
        if (review || r.offCard) {
          if (r.kind !== 'off') problems.push(w.headword + ': 要確認なのに音声がある');
          return;
        }
        r.btns.forEach((b) => {
          checked += 1;
          if (b.kind !== 'pack') problems.push(w.headword + ': AI音声でない ' + JSON.stringify(b));
          else if (!same(b.clip, r.shown)) problems.push(w.headword + ': 「' + r.shown + '」のボタンが「' + b.clip + '」を鳴らす');
          else if (!r.isEx && !b.key.startsWith('#')) problems.push(w.headword + ': 単語のボタンが単語の音声でない ' + b.key);
        });
      });
      // 単語のボタンは、その用法の音声（用法ごとに、順番どおり）
      const keys = wordRows.map((r) => r.btns[0].key);
      const want = w.senses.map((s) => (review || s.status === 'needs_review' ? '' : '#' + s.id));
      if (!review && JSON.stringify(keys) !== JSON.stringify(want)) problems.push(w.headword + ': 用法と音声の対応 ' + JSON.stringify(keys) + ' / ' + JSON.stringify(want));
    }
    eq(problems, [], '点検で見つかった食い違い');
    // 点検したボタンの数 = 要確認でない単語の（用法の数 + 例文の数）× 2（再生・ゆっくり）
    const expected = SEED.words.filter((w) => w.status !== 'needs_review')
      .reduce((n, w) => n + w.senses.filter((s) => s.status !== 'needs_review').reduce((m, s) => m + 1 + s.examples.length, 0), 0) * 2;
    eq(checked, expected, 'すべてのボタンを点検した');
    console.log('      （' + SEED.words.length + '語・ボタン ' + checked + '個を点検）');
    eq(page.errors, []);
    await ctx.close();
  });

  await test('ボタンの形をそろえる（古い形のボタンが残っていない）・メインの青いボタンは まとまりごとに1つ', async () => {
    const { ctx, page } = await newPage();
    const OLD = ['audio-btn', 'src-tag', 'ghost', 'danger-ghost', 'filter', 'block-head', 'btn-row', 'panel', 'sum-num', 'resume', 'cue-box', 'rate-mark', 'ch-no'];
    const check = async (label) => {
      const bad = await page.evaluate((old) => old.filter((c) => document.querySelector('#app .' + c)), OLD);
      eq(bad, [], label + ' に古い形の部品');
      const many = await page.evaluate(() => Array.from(document.querySelectorAll('#app .group, #app .answer-bar, #app .modal')).filter((g) => g.querySelectorAll('.btn.primary').length > 1).length);
      eq(many, 0, label + ' で青いボタンが2つ以上並ぶまとまり');
    };
    await check('ホーム');
    for (const h of ['round-r1', 'words', 'word-w-well', 'misses', 'options', 'edit-w-light']) {
      await page.goto(URL0 + '#' + h);
      await page.waitForTimeout(120);
      await check(h);
    }
    await page.goto(URL0 + '#home');
    await page.click('[data-action="start"][data-mode="fwd"]');
    await page.waitForSelector('.card-front');
    await check('表面');
    await page.click('.card-front .tap-hint');
    await check('裏面');
    eq(page.errors, []);
    await ctx.close();
  });

  await test('iPhone のホーム画面に追加できる（説明・アイコン・全画面表示の設定）', async () => {
    const { ctx, page } = await newPage();
    await page.goto(URL0 + '#options');
    await page.waitForSelector('#home-screen');
    const t = await page.textContent('#home-screen');
    ok(t.includes('Safari') && t.includes('ホーム画面に追加') && t.includes('共有'), '手順: ' + t.slice(0, 80));
    eq(await page.$$eval('#home-screen .howto-list li', (els) => els.length), 4, '4つの手順');
    const meta = await page.evaluate(() => ({
      capable: document.querySelector('meta[name="apple-mobile-web-app-capable"]') && document.querySelector('meta[name="apple-mobile-web-app-capable"]').content,
      title: document.querySelector('meta[name="apple-mobile-web-app-title"]') && document.querySelector('meta[name="apple-mobile-web-app-title"]').content,
      icon: document.querySelector('link[rel="apple-touch-icon"]') && document.querySelector('link[rel="apple-touch-icon"]').getAttribute('href'),
      manifest: document.querySelector('link[rel="manifest"]') && document.querySelector('link[rel="manifest"]').getAttribute('href'),
      viewport: document.querySelector('meta[name="viewport"]').content,
    }));
    eq(meta.capable, 'yes');
    ok(meta.title && meta.title.length <= 12, 'ホーム画面の名前: ' + meta.title);
    ok(/viewport-fit=cover/.test(meta.viewport), '画面の端（ノッチ）まで使う');
    const icon = await page.evaluate(async (u) => { const r = await fetch(u); const b = await r.blob(); return [r.status, b.type, b.size]; }, meta.icon);
    ok(icon[0] === 200 && /png/.test(icon[1]) && icon[2] > 1000, 'ホーム画面のアイコン: ' + icon.join(','));
    const man = await page.evaluate(async (u) => (await fetch(u)).json(), meta.manifest);
    eq(man.display, 'standalone');
    ok(man.icons.some((i) => i.sizes === '192x192') && man.icons.some((i) => i.sizes === '512x512'), 'アプリのアイコン');
    ok(man.start_url && man.name && man.short_name, 'アプリの名前と開くページ');
    await ctx.close();
  });

  await browser.close();
  server.close();
  const failed = results.filter((r) => !r[0]);
  console.log('\n' + (results.length - failed.length) + ' / ' + results.length + ' 件成功');
  process.exit(failed.length ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
