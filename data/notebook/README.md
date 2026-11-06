# シリーズ（単語のリスト）の作り方

アプリの「シリーズ1・シリーズ2…」は、このフォルダのデータから `scripts/build-notebook.mjs` で作ります（`npm run notebook`）。
できあがりは `js/data-notebook.js`（直接は編集しない）。辞書と照合できない項目が1つでもあると、エラーで止まります（推測で通さない）。

## 新しいシリーズを足す手順

単語のリスト（写真・PDF・テキスト）が届いたら：

1. **読み取る**：リストの単語を書き出す。読めない字・意図が決められない語は、推測で埋めずに `review`（要確認の理由）を付ける。
2. **データを書く**：`data/notebook/series-N/words.mjs`（多ければ `words-1.mjs`, `words-2.mjs` …）と `data/notebook/series-N/tests.mjs` を作る（形は下の「単語のデータ」）。
   - すでにあるシリーズ・見本にある単語は `{ ref: 'w-take' }` のように指すだけにする（同じ単語を二重に作らない）。
3. **シリーズの一覧に足す**：`scripts/build-notebook.mjs` の `SERIES` に1行足す。
   ```js
   import s2 from '../data/notebook/series-2/words.mjs';
   import TESTS2 from '../data/notebook/series-2/tests.mjs';
   // …
   { id: 'r2', no: 2, title: 'シリーズ2', source: '（資料の名前）', checked: '2026-11-07', parts: [s2], tests: TESTS2 },
   ```
4. **照合して作る**：`npm install`（初回だけ）→ `npm run notebook`。エラーが出たら、データを直す（辞書の語義・発音記号・例文の [ ]・テスト例文）。
5. **AI音声を作る**：`bash scripts/audio/fetch-models.sh ~/kokoro`（素材を取ってきて sha256 を確かめる）→ `scripts/audio/README.md` の手順で `build_audio.py`。
   できたら `check_signal.py`・`check_ipa.py` で確かめる。
6. **版を上げる**：`js/data-seed.js` の `version` を1つ上げる（すでに使っている人のアプリにも、新しい単語とシリーズが足される。学習の記録は残る）。
7. **確かめて送る**：`npm test`・`npm run test:e2e` が通ったら、このブランチに送る（GitHub Pages のアプリが数分で新しくなる）。

## 単語のデータ（words-*.mjs）

```js
export default [
  {
    w: 'begin',                                   // 見出し語
    ipa: ['/bɪˈɡɪn/', '/bɪˈɡɪn/'],               // [アメリカ, イギリス]（アメリカは CMU 発音辞書と照合する）
    st: 'be·GIN',                                 // 強く読む位置（任意）
    senses: [{                                    // 用法（1つの意味・使い方 = カード1枚）
      p: 'verb', r: 'action',                     // 品詞・文の中での役割
      cue: 'begin the lesson',                    // 表に出す短いフレーズ
      nu: '「スタートの合図で、何かが動き出す」って感じ',  // 一言ニュアンス（「って感じ」で終える）
      em: '🏁', dg: '',                           // 場面の絵（任意）
      sc: 'チャイムが鳴って、授業が始まる。',       // 頭に浮かべる場面
      m: '始める、始まる',                         // 意味
      rt: '「動き」を表す言葉です（動詞）。…',      // 文の中での役割の説明
      ex: [['The lesson [begins] at nine.', '授業は9時に始まる。']],  // 例文（その用法の語を [ ] で囲む）
      cx: [['start', 'ほぼ同じ「始める」。…']],    // 似た単語との違い（任意）
      ev: { wn: ['verb', 'take the first step'] }, // 照合の根拠：WordNet の品詞と語義の一部
      // WordNet にない語（代名詞・助動詞など）は ev: { web: 0, what: '…' } と、単語の web: [{ label, url }] に出典
      // 品詞で読みが変わる語は k:（用法IDの区別）と sp:（端末の読み上げで読む語句）
    }],
  },
  { ref: 'w-take' },                              // すでにある単語を、このシリーズにも入れる
];
```

用法のIDは `s-<見出し語>-<k または品詞>`（例：`s-begin-verb`）。

## テスト用の例文（tests.mjs）

```js
export default {
  's-begin-verb': ['The movie [begins] at seven.', '映画は7時に始まる。'],
  's-absent-adjective': ['Three students were [absent] today.', '今日は3人の生徒が休みだった。', ['today three students were absent']],
};
```

- カードの例文とは別の、新しい場面の文（3〜10語）。[ ] はその用法の語。
- 3つめは、ほかに正解にしてよい語順（小文字・最後の記号なし）。
