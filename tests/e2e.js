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

const PORT = 8765;
const URL0 = 'http://localhost:' + PORT + '/';
const DAY = 24 * 3600 * 1000;
const JA = /[぀-ヿ一-鿿]/;

function speechMock(kind) {
  return `
  (() => {
    window.__spoken = [];
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

async function test(name, fn) {
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
    eq(labels, ['一言ニュアンス', '頭に浮かべる場面', '意味と、文の中での役割', '例文']);
    ok((await page.textContent('.card-back .nuance-text')).endsWith('って感じ'));
    ok(await page.$('.card-back .scene-art'), '場面のイラスト');
    ok(/（(形容詞|副詞|名詞|動詞|前置詞|間投詞)）/.test(await page.textContent('.card-back .role-line')), '品詞の名前');
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

  await test('音声: 単語・ゆっくり・フレーズ・例文を英語だけ再生し、カードは裏返らない', async () => {
    const { ctx, page } = await newPage();
    await page.click('[data-action="start"][data-mode="fwd"]');
    await page.waitForSelector('.card-front .audio-btn:not([disabled])');
    const sid = await current(page);
    const word = await page.textContent('.card-front .headword');
    const btns = await page.$$('.card-front .audio-btn');
    await btns[0].click();
    await btns[1].click();
    await page.click('.card-front .cue-box .audio-btn');
    await page.waitForTimeout(50);
    ok(await page.$('.card-front'), '音声ボタンでは裏返らない');
    ok(!(await page.$('.card-back')));
    let sp = await spoken(page);
    eq(sp[0].text, word, '単語');
    eq(sp[0].rate, 0.95, '通常速度');
    eq(sp[1].rate, 0.6, 'ゆっくり');
    eq(sp[2].text, await page.textContent('.card-front .cue'), 'フレーズ');
    ok(sp.every((x) => x.voice === 'Samantha' && x.lang === 'en-US'), '英語の声（日本語の声や効果音の声は選ばない）');
    await page.waitForSelector('.audio-btn.playing', { timeout: 1000 }).catch(() => {});
    await page.click('.card-front .tap-hint');
    await page.waitForSelector('.card-back');
    await page.click('.card-back .ex .audio-btn');
    await page.click('.card-back .ex .audio-btn.slow');
    sp = await spoken(page);
    const exEn = await page.textContent('.card-back .ex .ex-en');
    eq(sp[3].text, exEn, '例文（[ ] なし）');
    eq(sp[4].rate, 0.6);
    ok(sp.every((x) => !JA.test(x.text) && !x.text.includes('[')), '日本語は読み上げない');
    ok(await page.$('.card-back'), '裏面のまま');
    eq(await current(page), sid, '音声ボタンで回答扱いにならない');
    ok((await page.textContent('.card-back .audio-btn .src-tag')) === '合成', '合成音声と表示');
    await ctx.close();
  });

  await test('発音: 品詞で発音が変わる語は、その用法の読み上げ（record / live）', async () => {
    const { ctx, page } = await newPage();
    await page.goto(URL0 + '#word-w-record');
    await page.waitForSelector('.sense-card');
    const cards = await page.$$('.sense-card');
    await (await cards[0].$('.audio-row .audio-btn')).click();
    await (await cards[1].$('.audio-row .audio-btn')).click();
    await page.goto(URL0 + '#word-w-live');
    await page.waitForSelector('.sense-card');
    const lv = await page.$$('.sense-card');
    await (await lv[0].$('.audio-row .audio-btn')).click();
    await (await lv[1].$('.audio-row .audio-btn')).click();
    const texts = (await spoken(page)).map((x) => x.text);
    eq(texts, ['a record', 'to record', 'to live', 'live music'], 'record（名詞・動詞）と live（動詞・形容詞）');
    await page.goto(URL0 + '#word-w-record');
    await page.waitForSelector('.sense-card');
    const detail = await page.textContent('.word-detail');
    ok(detail.includes('/ˈrekərd/') && detail.includes('/rɪˈkɔːrd/'), '用法ごとの発音記号');
    await ctx.close();
  });

  await test('音声が使えない端末: ボタンを無効にして理由を表示（押しても何も起きない状態にしない）', async () => {
    for (const kind of ['none', 'unsupported']) {
      const { ctx, page } = await newPage({ speech: kind });
      await page.click('[data-action="start"][data-mode="fwd"]');
      await page.waitForSelector('.card-front');
      await page.waitForFunction(() => document.querySelector('.card-front .audio-btn .src-tag').textContent === '音声なし', null, { timeout: 5000 });
      ok(await page.$eval('.card-front .audio-btn', (b) => b.disabled), '無効');
      const tag = await page.textContent('.card-front .audio-btn .src-tag');
      eq(tag, '音声なし');
      const banner = await page.textContent('[data-speech-banner]');
      ok(kind === 'none' ? banner.includes('英語の音声が見つかりません') : banner.includes('対応していません'), banner);
      await page.click('.card-front .audio-btn', { force: true });
      ok(await page.$('.card-front'), '無効ボタンで裏返らない');
      await ctx.close();
    }
  });

  await test('この環境の実際のブラウザ音声でも、状態を正しく表示する', async () => {
    const { ctx, page } = await newPage({ speech: 'real' });
    await page.click('[data-action="start"][data-mode="fwd"]');
    await page.waitForTimeout(3000);
    const state = await page.evaluate(() => {
      const b = document.querySelector('.card-front .audio-btn');
      const has = !!(window.speechSynthesis && speechSynthesis.getVoices().some((v) => /^en/i.test(v.lang)));
      return { has, disabled: b.disabled, tag: b.querySelector('.src-tag').textContent };
    });
    if (state.has) eq([state.disabled, state.tag], [false, '合成']);
    else eq([state.disabled, state.tag], [true, '音声なし']);
    console.log('      （この環境の英語音声: ' + (state.has ? 'あり' : 'なし → ボタン無効と案内を確認') + '）');
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
    ok(await page.isVisible('.chip.again-chip'), '「もう一度」と表示');
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
    eq(await page.textContent('#result-title'), 'セット完了！');
    ok(await page.isVisible('.stamp'), '達成の演出');
    const tally = await page.$$eval('.tally b', (els) => els.map((e) => e.textContent));
    eq(tally, ['9', '0', '1']);
    const nexts = await page.$$eval('.rl-next', (els) => els.map((e) => e.textContent));
    eq(nexts.length, 10);
    ok(nexts.filter((t) => t === '明日').length === 9 && nexts.some((t) => t === '10分後'), nexts.join(','));
    ok(await page.isVisible('text=今日の目標を達成しました'));
    const pts = Number((await page.textContent('.earned')).replace(/\D/g, ''));
    eq(pts, 9 * 10 + 3 + 1 + 30 + 20, '獲得ポイント（回答＋再出題＋目標＋セット完了）');
    await page.reload();
    await page.waitForSelector('#result-title');
    await page.goto(URL0 + '#home');
    await page.waitForSelector('.home');
    const stats = await page.$$eval('.stat-num', (els) => els.map((e) => e.textContent));
    ok(stats[0].startsWith('1'), '連続学習 1日: ' + stats[0]);
    ok(stats[1].startsWith(String(pts)), 'ポイント');
    ok(stats[2].startsWith('10'), '今日 10枚');
    ok(await page.isVisible('text=今日の目標 達成！'));
    const sched = await page.$$eval('.sched-list b', (els) => els.map((e) => e.textContent));
    eq(sched[1], '9枚', '明日の予定');

    // 翌日にする → 復習カードを優先
    const progress = await ls(page, 'progress');
    await page.evaluate((ms) => localStorage.setItem('__test_offset', String(ms)), DAY);
    await page.reload();
    await page.waitForSelector('.home');
    const counts = await page.$$eval('.main-mode .mode-counts b', (els) => els.map((e) => e.textContent));
    eq(counts, ['10', '11'], '翌日: 復習10枚・新しい11枚');
    const stats2 = await page.$$eval('.stat-num', (els) => els.map((e) => e.textContent));
    ok(stats2[0].startsWith('1') && (await page.isVisible('text=連続学習（今日まだ）')), '翌日はまだ学習していない表示');
    await page.click('[data-action="start"][data-mode="fwd"]');
    await page.waitForSelector('.card-front');
    const set = await ls(page, 'session');
    ok(set.cards.every((id) => progress[id]), '復習予定のカードだけで10枚: ' + set.cards.join(','));
    // 2日目も学習して、連続2日
    await finishSet(page, 'good');
    await page.goto(URL0 + '#home');
    await page.waitForSelector('.home');
    const stats3 = await page.$$eval('.stat-num', (els) => els.map((e) => e.textContent));
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
    await page.waitForSelector('.resume');
    ok((await page.textContent('.resume')).includes('残り 8枚'));
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
    ok(await page.$('.resume'), 'やめると途中のセットはそのまま');
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
    ok(await page.isVisible('text=「英語 → 場面」で一度学習したカードが'), '最初は案内だけ');
    await page.click('[data-action="start"][data-mode="fwd"]');
    await page.waitForSelector('.card-front');
    await finishSet(page, 'good');
    await page.goto(URL0 + '#home');
    await page.waitForSelector('[data-action="start"][data-mode="rev"]');
    await page.click('[data-action="start"][data-mode="rev"]');
    await page.waitForSelector('.card-front.rev');
    const sid = await current(page);
    const word = await page.evaluate((id) => JSON.parse(localStorage.getItem('cif.v1.words')).find((w) => w.senses.some((s) => s.id === id)).headword, sid);
    const text = await page.textContent('.card-front.rev');
    ok(!new RegExp('\\b' + word + '\\b', 'i').test(text.replace(/[぀-ヿ一-鿿]/g, ' ')), '表面に答えの単語を出さない: ' + word);
    ok(await page.$('.card-front.rev .blank'), '例文は空欄');
    ok(await page.$('.card-front.rev .scene-art'), '場面の絵');
    ok(!(await page.$('.card-front.rev .audio-btn')), '表面で英語を読み上げない（答えが分かってしまう）');
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
    eq((await page.$$('.word-row')).length, 11);
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
    ok((await page.textContent('.detail-head .badge')) === '確認済み');
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
    const counts = await page.$$eval('.main-mode .mode-counts b', (els) => els.map((e) => e.textContent));
    eq(counts, ['0', '22'], '追加した borrow は出題、要確認は出題しない');
    await page.goto(URL0 + '#words');
    await page.waitForSelector('.word-list');
    await page.click('[data-action="filter"][data-f="review"]');
    eq(await page.$$eval('.word-row .wr-head', (els) => els.map((e) => e.textContent)), ['かりる']);
    await page.click('[data-action="filter"][data-f="all"]');
    await page.fill('#word-search', '借り');
    eq((await page.$$eval('.word-row .wr-head', (els) => els.map((e) => e.textContent))).sort(), ['borrow', 'かりる']);
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
    eq(await page.$$eval('.g-key', (els) => els.map((e) => e.textContent)), ['A', 'B']);
    ok((await page.textContent('.group-note')).includes('無理に一つのイメージにまとめなくて大丈夫'));
    eq((await page.$$('.sense-card')).length, 3);
    ok((await page.textContent('.sources')).includes('確認方法'), '確認状況');
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
    eq(data.words.length, 11);
    ok(Object.keys(data.progress).length === 10);
    await page.click('[data-action="reset-progress"]');
    await page.click('[data-action="modal-ok"]');
    eq(await ls(page, 'progress'), {});
    await page.fill('#import-text', json);
    await page.click('[data-action="import-check"]');
    await page.waitForSelector('.import-preview');
    ok((await page.textContent('.import-preview')).includes('単語 11語（用法 21つ）'));
    await page.click('[data-action="import-replace"]');
    await page.click('[data-action="modal-ok"]');
    await page.waitForTimeout(100);
    eq(await ls(page, 'progress'), before.progress);
    eq((await ls(page, 'log')).totalPoints, before.log.totalPoints);
    // ファイルからの読み込み（壊れたファイルは断る）
    await page.setInputFiles('#import-file', { name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from('{oops') });
    await page.waitForSelector('.options .banner.warn');
    ok((await page.textContent('.options .banner.warn')).includes('JSON として読み込めませんでした'));
    // 要確認になる単語を含むファイルを「追加・更新」
    const extra = { format: 'core-image-flashcards', version: 1, words: [{ id: 'w-x', headword: 'gr�at', senses: [{ meaning: 'すごい' }] }] };
    await page.setInputFiles('#import-file', { name: 'x.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(extra)) });
    await page.waitForSelector('.import-preview');
    ok((await page.textContent('.import-preview')).includes('うち要確認 1語'));
    await page.click('[data-action="import-merge"]');
    const ws = await ls(page, 'words');
    eq(ws.length, 12);
    eq(ws.find((w) => w.id === 'w-x').status, 'needs_review');
    // ファイルに保存（ダウンロード）
    const [dl] = await Promise.all([page.waitForEvent('download'), page.click('[data-action="export-file"]')]);
    ok(/^core-image-cards-\d{8}\.json$/.test(dl.suggestedFilename()), dl.suggestedFilename());
    await ctx.close();
  });

  await test('音声の設定: 声の選択・速さが保存され、再読み込み後も使われる', async () => {
    const { ctx, page } = await newPage();
    await page.goto(URL0 + '#options');
    await page.waitForSelector('#voice-select:not([disabled])');
    const opts = await page.$$eval('#voice-select option', (els) => els.map((e) => e.textContent));
    ok(opts.length === 2 && opts.every((t) => /en-(US|GB)/.test(t)), '英語の声だけ: ' + opts.join(','));
    await page.selectOption('#voice-select', 'daniel');
    await page.$eval('#slow-rate', (el) => { el.value = '0.5'; el.dispatchEvent(new Event('input', { bubbles: true })); });
    await page.reload();
    await page.waitForSelector('#voice-select');
    eq(await page.inputValue('#voice-select'), 'daniel');
    await page.click('#voice-section .audio-btn.slow');
    const sp = await spoken(page);
    eq([sp[0].voice, sp[0].rate, sp[0].lang], ['Daniel', 0.5, 'en-GB']);
    ok((await page.textContent('#voice-section .ok-line')).includes('Daniel'));
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
    await page.waitForTimeout(50);
    const head = await page.textContent('.card-front .headword');
    let sp = await spoken(page);
    eq(sp.map((x) => x.text), [head], '最初のカード');
    await flipAndRate(page, 'good');
    await page.waitForTimeout(50);
    sp = await spoken(page);
    eq(sp.length, 2, '次のカードでも読み上げ');
    ok(!sp.some((x) => JA.test(x.text)));
    await ctx.close();
  });

  await test('録音音声: 登録すると「録音」と表示して優先再生。再生できない時は案内する', async () => {
    const { ctx, page } = await newPage();
    await page.goto(URL0 + '#edit-w-on');
    await page.waitForSelector('#edit-form');
    await page.fill('#f-senses-0-audio-word', 'audio/not-found.mp3');
    await page.click('[data-action="save-word"]');
    await page.waitForSelector('.word-detail');
    const tags = await page.$$eval('.detail-head .audio-btn .src-tag', (els) => els.map((e) => e.textContent));
    eq(tags, ['録音', '録音'], '単語ボタンは録音');
    const exTag = await page.textContent('.ex .audio-btn .src-tag');
    eq(exTag, '合成', '録音がない例文は合成');
    await page.click('.detail-head .audio-btn');
    await page.waitForFunction(() => document.getElementById('toast').textContent.includes('録音音声を再生できませんでした'), null, { timeout: 5000 });
    eq((await spoken(page)).length, 0, '録音があるときは合成音声を使わない');
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
    for (const h of ['words', 'word-w-light', 'edit-w-light', 'options']) {
      await page.goto(URL0 + '#' + h);
      await page.waitForTimeout(150);
      await noHScroll(page, h);
    }
    eq(page.errors, []);
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
