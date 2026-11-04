/*
 * data-seed.js — 初期の単語データ（11語・21用法）
 *
 * 1カード = 1つの意味・用法（sense）。
 * 例文の [ ] は、その用法の単語（変化した形を含む）を示す。
 *   - 英語→場面では強調表示、場面→英語では空欄になる。
 * group … 関連する用法のまとまり。グループが違う用法は「別の単語」として扱い、
 *         無理に1つのイメージへ結びつけない（well の「上手に」と「井戸」など）。
 * speak … 単語ボタンで読み上げる文字列。品詞で発音が変わる語（record, live）は、
 *         その用法の発音になるよう短い語句で読み上げる。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./data-notebook.js'));
  } else {
    root.CIF = root.CIF || {};
    root.CIF.seed = factory(root.CIF.notebook);
  }
})(this, function (notebook) {
  'use strict';

  const CHECKED = '2026-11-04';
  const METHOD =
    'Web検索で表示された辞書の該当ページ（Oxford Learner\'s Dictionaries など）の情報と照らし合わせ、品詞・意味・発音記号を確認しました。' +
    '作成環境からは辞書サイトの本文を直接開けなかったため、気になる点は出典リンクから確認してください。';
  const NOTE = '例文・一言ニュアンス・場面の説明は、このアプリ用に作った学習用の文章です。';
  const OXF = 'https://www.oxfordlearnersdictionaries.com/definition/english/';

  function check(extra) {
    return { date: CHECKED, method: METHOD, note: extra ? NOTE + extra : NOTE };
  }

  const words = [
    {
      id: 'w-pretty',
      headword: 'pretty',
      status: 'verified',
      check: check(),
      sources: [
        { label: "Oxford Learner's Dictionaries: pretty（形容詞）", url: OXF + 'pretty_1' },
        { label: 'Merriam-Webster: pretty', url: 'https://www.merriam-webster.com/dictionary/pretty' },
      ],
      groups: {
        A: '同じ pretty から広がった使い方。ただ「かわいい」と「けっこう」のつながりは感じにくいので、別々に覚えて大丈夫です。',
      },
      senses: [
        {
          id: 's-pretty-adj',
          test: { en: 'She wore a [pretty] dress.', ja: '彼女はかわいいドレスを着ていた。', alts: [] },
          group: 'A',
          pos: 'adjective',
          role: 'quality',
          cue: 'a pretty flower',
          ipa: { uk: '/ˈprɪti/', us: '/ˈprɪti/' },
          stress: 'PRET·ty',
          nuance: '見ていて、ほっと和む「かわいい・きれい」って感じ',
          scene: {
            emoji: '🌷',
            diagram: '',
            text: '道ばたに小さな花が咲いていて、思わず「かわいい」と顔がゆるむ。',
          },
          meaning: 'かわいい、きれいな（見た目が感じよい）',
          roleText:
            '人やものが「どんな見た目か」を表す言葉です（形容詞）。a pretty flower のように「もの」の前に置いたり、It\'s pretty. のように be 動詞のあとに置いたりします。',
          examples: [
            { en: 'What a [pretty] flower!', ja: 'なんてかわいい花！' },
            { en: 'This is a [pretty] little town.', ja: 'ここはこぢんまりとした、きれいな町だ。' },
          ],
          contrasts: [
            { word: 'beautiful', text: '心を打つほどの「美しい」。pretty はもっと軽くて親しみのある「かわいい・きれい」。' },
            { word: 'cute', text: '小さな子どもや動物などの「守りたくなる愛らしさ」。pretty は見た目の整った「きれいさ」寄り。' },
          ],
          note: '',
        },
        {
          id: 's-pretty-adv',
          test: { en: 'The exam was [pretty] hard.', ja: '試験はけっこう難しかった。', alts: [] },
          group: 'A',
          pos: 'adverb',
          role: 'degree',
          cue: 'pretty tired',
          ipa: { uk: '/ˈprɪti/', us: '/ˈprɪti/' },
          stress: 'PRET·ty',
          nuance: '「とても」ほどじゃないけど「けっこう」って感じ',
          scene: {
            emoji: '🥱',
            diagram: 'pretty-gauge',
            text: '部活のあと。倒れるほどではないけれど、けっこう疲れた。',
          },
          meaning: 'けっこう、かなり、わりと',
          roleText:
            '「どのくらい」を表す言葉です（副詞）。tired（疲れた）や good（よい）など、様子を表す言葉の前に置いて、その強さを調整します。',
          examples: [
            { en: "I'm [pretty] tired today.", ja: '今日はけっこう疲れてる。' },
            { en: 'The test was [pretty] easy.', ja: 'テストはわりと簡単だった。' },
          ],
          contrasts: [
            { word: 'very', text: '「とても」とはっきり強め。pretty は会話でよく使う、少しくだけた「けっこう・わりと」。' },
          ],
          note: '「かわいい」という意味は入っていません。後ろの言葉の「程度」だけを表します。会話でよく使うくだけた言い方です。',
        },
      ],
    },

    {
      id: 'w-well',
      headword: 'well',
      status: 'verified',
      check: check(' 「井戸」の well が別の語源であることは、語源辞典（Etymonline など）の情報で確認しました。'),
      sources: [
        { label: 'Merriam-Webster: well', url: 'https://www.merriam-webster.com/dictionary/well' },
        { label: 'Online Etymology Dictionary: well', url: 'https://www.etymonline.com/word/well' },
        { label: "Oxford Learner's Dictionaries（検索）", url: 'https://www.oxfordlearnersdictionaries.com/search/english/?q=well' },
      ],
      groups: {
        A: '「よい・うまくいっている」に関係する well。',
        B: '「井戸」の well。つづりと発音は同じですが、A とは別の語源の単語として扱われます。無理に結びつけなくて大丈夫です。',
      },
      senses: [
        {
          id: 's-well-adv',
          test: { en: 'He speaks English very [well].', ja: '彼は英語をとても上手に話す。', alts: [] },
          group: 'A',
          pos: 'adverb',
          role: 'manner',
          cue: 'sing well',
          ipa: { uk: '/wel/', us: '/wel/' },
          nuance: '「ちゃんと、うまくできている」って感じ',
          scene: {
            emoji: '🎤',
            diagram: '',
            text: 'カラオケで、友だちが音程ばっちりで気持ちよく歌っている。',
          },
          meaning: '上手に、よく',
          roleText:
            '「どんなふうに」を表す言葉です（副詞）。sing（歌う）や sleep（眠る）などの「動き」のあとに置いて、そのやり方や出来ばえを表します。',
          examples: [
            { en: 'She sings really [well].', ja: '彼女は本当に歌が上手だ。' },
            { en: 'Did you sleep [well]?', ja: 'よく眠れた？' },
          ],
          contrasts: [
            { word: 'good', text: 'good は「人・もの」がどんなか（a good singer）。well は「動き」がどんなふうか（sing well）。' },
          ],
          note: '',
        },
        {
          id: 's-well-interj',
          test: { en: '[Well], let me think.', ja: 'うーん、ちょっと考えさせて。', alts: [] },
          group: 'A',
          pos: 'interjection',
          role: 'connector',
          cue: 'Well, ...',
          ipa: { uk: '/wel/', us: '/wel/' },
          nuance: '「うーん」「さて」と、ひと呼吸おくって感じ',
          scene: {
            emoji: '🤔',
            diagram: '',
            text: '「どうだった？」と聞かれて、少し考えながら答えはじめる。',
          },
          meaning: 'うーん、ええと、さて（話のつなぎ）',
          roleText:
            '気持ちをつなぐ言葉です（間投詞）。文の最初に置いて、「考えている」「言いにくい」「話を切り替える」といった気持ちを表します。',
          examples: [
            { en: "[Well], I'm not sure.", ja: 'うーん、よくわからないな。' },
            { en: "[Well], let's get started.", ja: 'さて、始めましょう。' },
          ],
          contrasts: [
            { word: 'um', text: '言葉が出てこない時の「えーと」という音。well は「さて」「まあ」と、気持ちの切り替えにも使える。' },
          ],
          note: '',
        },
        {
          id: 's-well-noun',
          test: { en: 'The [well] was full of water.', ja: '井戸は水でいっぱいだった。', alts: [] },
          group: 'B',
          pos: 'noun',
          role: 'thing',
          cue: 'an old well',
          ipa: { uk: '/wel/', us: '/wel/' },
          nuance: '「地面を深く掘った、水をくむ穴」って感じ',
          scene: {
            emoji: '🪣',
            diagram: 'well-pit',
            text: '村の真ん中にある石の井戸。ロープでバケツを下ろして水をくむ。',
          },
          meaning: '井戸',
          roleText: '「もの」を表す言葉です（名詞）。数えられるので a well（1つの井戸）、two wells（2つの井戸）と言います。',
          examples: [
            { en: 'There is an old [well] in the village.', ja: 'その村には古い井戸がある。' },
            { en: 'They got water from the [well].', ja: '彼らは井戸から水をくんだ。' },
          ],
          contrasts: [],
          note: '「上手に」の well とは、つづりと発音が同じなだけで、別の語源の単語とされています。',
        },
      ],
    },

    {
      id: 'w-light',
      headword: 'light',
      status: 'verified',
      check: check(' 「光」と「軽い」が別の語源であることは、語源辞典（Etymonline など）の情報で確認しました。'),
      sources: [
        { label: "Oxford Learner's Dictionaries（検索）", url: 'https://www.oxfordlearnersdictionaries.com/search/english/?q=light' },
        { label: 'Online Etymology Dictionary: light', url: 'https://www.etymonline.com/word/light' },
        { label: 'Grammarphobia: light', url: 'https://www.grammarphobia.com/blog/2018/01/light.html' },
      ],
      groups: {
        A: '「光・明かり」の light。',
        B: '「軽い」の light。A とは語源が別で、つづりと発音が同じになっただけとされています。別の単語として覚えましょう。',
      },
      senses: [
        {
          id: 's-light-noun',
          group: 'A',
          pos: 'noun',
          role: 'thing',
          cue: 'turn on the light',
          ipa: { uk: '/laɪt/', us: '/laɪt/' },
          nuance: '「パッと照らして、見えるようにしてくれるもの」って感じ',
          scene: {
            emoji: '💡',
            diagram: '',
            text: '暗い部屋に入って、スイッチを押すと明かりがつく。',
          },
          meaning: '明かり、光、電灯',
          roleText:
            '「もの・こと」を表す言葉です（名詞）。電灯の「明かり」は a light / the light と数えます。「光」そのものは数えずに light と言います。',
          examples: [
            { en: 'Can you turn on the [light]?', ja: '明かりをつけてくれる？' },
            { en: 'The room is full of [light].', ja: '部屋は光でいっぱいだ。' },
          ],
          contrasts: [
            { word: 'lamp', text: '電気スタンドなど、照明の「器具」そのもの。light は天井の電灯も日の光も含む「明かり」全般。' },
          ],
          note: '',
        },
        {
          id: 's-light-adj',
          group: 'B',
          pos: 'adjective',
          role: 'quality',
          cue: 'a light bag',
          ipa: { uk: '/laɪt/', us: '/laɪt/' },
          nuance: '「片手でひょいっと持ち上がる」って感じ',
          scene: {
            emoji: '🎒',
            diagram: 'light-weight',
            text: '中身がほとんど入っていないリュックを、片手でひょいっと持ち上げる。',
          },
          meaning: '軽い',
          roleText:
            '「どんな様子か」を表す言葉です（形容詞）。ものの重さが小さいことを表します。反対は heavy（重い）。',
          examples: [
            { en: 'This bag is very [light].', ja: 'このバッグはとても軽い。' },
            { en: 'I had a [light] lunch.', ja: '軽めの昼ごはんを食べた。' },
          ],
          contrasts: [
            { word: 'heavy', text: '「重い」。light の反対。' },
          ],
          note: 'a light lunch（軽めの昼食）のように、「量が少ない・負担が小さい」ことにも使います。',
        },
      ],
    },

    {
      id: 'w-record',
      headword: 'record',
      status: 'verified',
      check: check(' 名詞と動詞で強く読む位置が変わることを確認済み。'),
      sources: [
        { label: "Oxford Learner's Dictionaries: record（名詞）", url: OXF + 'record_1' },
        { label: "Oxford Learner's Dictionaries: record（動詞）", url: OXF + 'record_2' },
      ],
      groups: {
        A: 'どちらも「あとに残す」に関係する record。ただし名詞と動詞で強く読む位置が変わります。',
      },
      senses: [
        {
          id: 's-record-noun',
          group: 'A',
          pos: 'noun',
          role: 'thing',
          cue: 'a world record',
          speak: 'a record',
          ipa: { uk: '/ˈrekɔːd/', us: '/ˈrekərd/' },
          stress: 'REC·ord',
          nuance: '「あとで見返せるように残したもの」って感じ',
          scene: {
            emoji: '🏆',
            diagram: '',
            text: '陸上の大会で、電光掲示板に「世界新記録！」と表示される。',
          },
          meaning: '記録、（スポーツの）最高記録',
          roleText: '「もの・こと」を表す言葉です（名詞）。a record（1つの記録）と数えます。',
          examples: [
            { en: 'He broke the world [record].', ja: '彼は世界記録を破った。' },
            { en: 'I keep a [record] of my study time.', ja: '勉強時間の記録をつけている。' },
          ],
          contrasts: [
            { word: 'record（動詞）', text: '「記録する・録音する」。動詞は後ろを強く re-CORD、名詞は前を強く REC-ord と読む。' },
          ],
          note: '単語ボタンでは、名詞の発音になるよう「a record」と読み上げます。',
        },
        {
          id: 's-record-verb',
          group: 'A',
          pos: 'verb',
          role: 'action',
          cue: 'record a video',
          speak: 'to record',
          ipa: { uk: '/rɪˈkɔːd/', us: '/rɪˈkɔːrd/' },
          stress: 're·CORD',
          nuance: '「今の音や様子を、あとまで残るように取っておく」って感じ',
          scene: {
            emoji: '📱',
            diagram: '',
            text: 'ライブ会場で、スマホを掲げて好きな曲を録画している。',
          },
          meaning: '録音する、録画する、記録する',
          roleText: '「動き」を表す言葉です（動詞）。「何を」残すかを後ろに置きます（record a song）。',
          examples: [
            { en: 'Can I [record] your talk?', ja: 'あなたの話を録音してもいい？' },
            { en: 'We [recorded] a song together.', ja: 'いっしょに歌を録音した。' },
          ],
          contrasts: [
            { word: 'write down', text: '「紙に書き留める」。record は音・映像・数字など、形を問わず残すときに使える。' },
            { word: 'record（名詞）', text: '「記録」。名詞は前を強く REC-ord と読む。' },
          ],
          note: '単語ボタンでは、動詞の発音になるよう「to record」と読み上げます。',
        },
      ],
    },

    {
      id: 'w-live',
      headword: 'live',
      status: 'verified',
      check: check(' 動詞 /lɪv/ と形容詞 /laɪv/ で発音が違うことを確認済み。'),
      sources: [
        { label: 'Dictionary.com: live', url: 'https://www.dictionary.com/browse/live' },
        { label: "Oxford Learner's Dictionaries（検索）", url: 'https://www.oxfordlearnersdictionaries.com/search/english/?q=live' },
      ],
      groups: {
        A: '「住む・暮らす」の live（動詞）。発音は /lɪv/。',
        B: '「生の・ライブの」の live（形容詞）。発音は /laɪv/ で、A とは音が違います。',
      },
      senses: [
        {
          id: 's-live-verb',
          group: 'A',
          pos: 'verb',
          role: 'state',
          cue: 'live in Tokyo',
          speak: 'to live',
          ipa: { uk: '/lɪv/', us: '/lɪv/' },
          nuance: '「その場所で、毎日を過ごしている」って感じ',
          scene: {
            emoji: '🏠',
            diagram: '',
            text: '東京のアパートで、朝起きてごはんを食べ、仕事に出かける毎日。',
          },
          meaning: '住む、暮らす、生きる',
          roleText:
            'ずっと続いている「状態」を表す言葉です（動詞）。「どこに」は in などを使って後ろに続けます（live in Tokyo）。',
          examples: [
            { en: 'I [live] in Tokyo.', ja: '私は東京に住んでいます。' },
            { en: 'My grandma [lives] alone.', ja: '祖母はひとりで暮らしている。' },
          ],
          contrasts: [
            { word: 'stay', text: '旅行などで「一時的に泊まる・いる」。live は「生活の拠点としてそこにいる」。' },
            { word: 'live（形容詞）', text: '「生の・ライブの」。発音が /laɪv/ に変わる別カード。' },
          ],
          note: '単語ボタンでは、動詞の発音になるよう「to live」と読み上げます。',
        },
        {
          id: 's-live-adj',
          group: 'B',
          pos: 'adjective',
          role: 'quality',
          cue: 'live music',
          speak: 'live music',
          ipa: { uk: '/laɪv/', us: '/laɪv/' },
          nuance: '「録画じゃなく、今まさにその場で起きている」って感じ',
          scene: {
            emoji: '🎸',
            diagram: '',
            text: '録音された音ではなく、目の前のステージでバンドが演奏している。',
          },
          meaning: '生の、ライブの、生放送の',
          roleText:
            '「どんな様子か」を表す言葉です（形容詞）。music（音楽）や show（番組）など、「もの・こと」の前に置きます。',
          examples: [
            { en: 'I love [live] music.', ja: '生演奏の音楽が大好き。' },
            { en: 'This is a [live] broadcast.', ja: 'これは生放送です。' },
          ],
          contrasts: [
            { word: 'recorded', text: '「録音・録画された」。live の反対。' },
            { word: 'live（動詞）', text: '「住む」。発音が /lɪv/ で、音が違う。' },
          ],
          note: '単語ボタンでは、形容詞の発音になるよう「live music」と読み上げます。合成音声が /lɪv/ に聞こえるときは、発音記号 /laɪv/ を目安にしてください。',
        },
      ],
    },

    {
      id: 'w-run',
      headword: 'run',
      status: 'verified',
      check: check(),
      sources: [
        { label: "Oxford Learner's Dictionaries: run（動詞）", url: OXF + 'run_1' },
      ],
      groups: {
        A: '「止まらずに動き続ける」という見方でつなげると覚えやすい run。（コアイメージは理解を助けるための説明です）',
      },
      senses: [
        {
          id: 's-run-move',
          group: 'A',
          pos: 'verb',
          role: 'action',
          cue: 'run to the station',
          ipa: { uk: '/rʌn/', us: '/rʌn/' },
          nuance: '「足を速く動かして、止まらずに進む」って感じ',
          scene: {
            emoji: '🏃',
            diagram: '',
            text: '電車に遅れそうで、駅まで全力で走る。',
          },
          meaning: '走る',
          roleText: '「動き」を表す言葉です（動詞）。「どこへ」は to で表します（run to the station）。過去形は ran。',
          examples: [
            { en: 'I [ran] to the station.', ja: '駅まで走った。' },
            { en: 'My dog [runs] very fast.', ja: 'うちの犬はとても速く走る。' },
          ],
          contrasts: [
            { word: 'walk', text: '「歩く」。' },
            { word: 'jog', text: '「ゆっくり走る（ジョギングする）」。run は全力で走るときにも使える。' },
          ],
          note: '',
        },
        {
          id: 's-run-manage',
          group: 'A',
          pos: 'verb',
          role: 'action',
          cue: 'run a café',
          ipa: { uk: '/rʌn/', us: '/rʌn/' },
          nuance: '「お店や仕組みを、止めずに回し続ける」って感じ',
          scene: {
            emoji: '☕',
            diagram: 'run-loop',
            text: '小さなカフェを毎日開けて、仕入れも接客もひとりで切り盛りしている。',
          },
          meaning: '経営する、運営する',
          roleText:
            '「動き」を表す言葉です（動詞）。「何を」動かし続けるかを後ろに置きます（run a shop / run a club）。',
          examples: [
            { en: 'She [runs] a small café.', ja: '彼女は小さなカフェを経営している。' },
            { en: 'My uncle [runs] a bike shop.', ja: 'おじは自転車屋をやっている。' },
          ],
          contrasts: [
            { word: 'manage', text: '「管理する・なんとかやりくりする」。run は会話でよく使う「（お店などを）やっている」。' },
          ],
          note: '「走る」と同じく「止まらずに動き続ける」と考えるとつながります。あくまで覚えるための見方です。',
        },
      ],
    },

    {
      id: 'w-get',
      headword: 'get',
      status: 'verified',
      check: check(),
      sources: [
        { label: "Oxford Learner's Dictionaries: get", url: OXF + 'get' },
      ],
      groups: {
        A: '「今と違う状態へ移る（ないものが手元に来る／様子が変わる）」と考えるとつながる get。（理解を助けるための見方です）',
      },
      senses: [
        {
          id: 's-get-obtain',
          group: 'A',
          pos: 'verb',
          role: 'action',
          cue: 'get a new bike',
          ipa: { uk: '/ɡet/', us: '/ɡet/' },
          nuance: '「なかったものが、自分の手元にやってくる」って感じ',
          scene: {
            emoji: '🚲',
            diagram: 'get-have',
            text: '誕生日に、ずっとほしかった新しい自転車が手に入った。',
          },
          meaning: '手に入れる、もらう、受け取る',
          roleText: '「動き」を表す言葉です（動詞）。「何を」手に入れるかを後ろに置きます。過去形は got。',
          examples: [
            { en: 'I [got] a new bike.', ja: '新しい自転車を手に入れた。' },
            { en: 'Did you [get] my message?', ja: '私のメッセージ、届いた？' },
          ],
          contrasts: [
            { word: 'buy', text: '「お金を払って買う」。get は買う・もらう・受け取るなど、手に入れ方を問わない。' },
          ],
          note: '',
        },
        {
          id: 's-get-become',
          group: 'A',
          pos: 'verb',
          role: 'change',
          cue: 'get dark',
          ipa: { uk: '/ɡet/', us: '/ɡet/' },
          nuance: '「今の様子から、別の様子へ移っていく」って感じ',
          scene: {
            emoji: '🌆',
            diagram: 'get-change',
            text: '公園で遊んでいたら、空がだんだん暗くなってきた。',
          },
          meaning: '（ある状態に）なる',
          roleText:
            '「変化」を表す動きの言葉です（動詞）。後ろに dark（暗い）や hungry（お腹がすいた）など、「どんな様子か」を表す言葉が来ます。',
          examples: [
            { en: "It's [getting] dark.", ja: '暗くなってきた。' },
            { en: 'I [got] hungry after school.', ja: '放課後、お腹がすいてきた。' },
          ],
          contrasts: [
            { word: 'become', text: '少しかための「〜になる」。日常会話の「〜になってきた」は get がよく使われる。' },
          ],
          note: '',
        },
      ],
    },

    {
      id: 'w-break',
      headword: 'break',
      status: 'verified',
      check: check(),
      sources: [
        { label: "Oxford Learner's Dictionaries: break（動詞）", url: OXF + 'break_1' },
        { label: "Oxford Learner's Dictionaries: break（名詞）", url: OXF + 'break_2' },
      ],
      groups: {
        A: '「続いているもの・ひとまとまりのものを、パキッと断ち切る」と考えるとつながる break。（理解を助けるための見方です）',
      },
      senses: [
        {
          id: 's-break-verb',
          group: 'A',
          pos: 'verb',
          role: 'action',
          cue: 'break a cup',
          ipa: { uk: '/breɪk/', us: '/breɪk/' },
          nuance: '「力が加わって、パキッと割れる・壊れる」って感じ',
          scene: {
            emoji: '💥',
            diagram: 'break-snap',
            text: '手がすべって、マグカップを床に落として割ってしまった。',
          },
          meaning: '割る、壊す、折る',
          roleText: '「動き」を表す言葉です（動詞）。「何を」壊すかを後ろに置きます。過去形は broke。',
          examples: [
            { en: 'I [broke] my favorite cup.', ja: 'お気に入りのカップを割ってしまった。' },
            { en: "Be careful not to [break] it.", ja: '壊さないように気をつけて。' },
          ],
          contrasts: [
            { word: 'destroy', text: '「跡形もなく破壊する」。break はカップ・骨・機械など、日常の「割る・壊す」。' },
          ],
          note: '',
        },
        {
          id: 's-break-noun',
          group: 'A',
          pos: 'noun',
          role: 'thing',
          cue: 'take a break',
          ipa: { uk: '/breɪk/', us: '/breɪk/' },
          nuance: '「続けている作業を、いったん区切ってひと休み」って感じ',
          scene: {
            emoji: '🍵',
            diagram: 'break-gap',
            text: '2時間勉強したあと、手を止めてお茶を飲んでひと休み。',
          },
          meaning: '休憩、ひと休み',
          roleText: '「こと」を表す言葉です（名詞）。take a break（休憩する）の形でよく使います。',
          examples: [
            { en: "Let's take a [break].", ja: 'ひと休みしよう。' },
            { en: 'I had a ten-minute [break].', ja: '10分休憩した。' },
          ],
          contrasts: [
            { word: 'rest', text: '「体を休めること」そのもの。break は「作業の合間の休み時間」。' },
          ],
          note: '作業の流れを「パキッと区切る」と考えると、「割る」の break とつながります。覚えるための見方です。',
        },
      ],
    },

    {
      id: 'w-take',
      headword: 'take',
      status: 'verified',
      check: check(),
      sources: [
        { label: "Oxford Learner's Dictionaries: take（動詞）", url: OXF + 'take_1' },
      ],
      groups: {
        A: '「手に取って、別の場所へ持っていく」と考えるとつながる take。（理解を助けるための見方です）',
      },
      senses: [
        {
          id: 's-take-carry',
          test: { en: "Don't forget to [take] your lunch.", ja: 'お弁当を持っていくのを忘れないで。', alts: [] },
          group: 'A',
          pos: 'verb',
          role: 'action',
          cue: 'take an umbrella',
          ipa: { uk: '/teɪk/', us: '/teɪk/' },
          nuance: '「手に取って、いっしょに持っていく」って感じ',
          scene: {
            emoji: '☔',
            diagram: 'take-carry',
            text: '空がくもっているので、玄関の傘を手に取って出かける。',
          },
          meaning: '持っていく、連れていく',
          roleText:
            '「動き」を表す言葉です（動詞）。「何を」持っていくかを後ろに置き、「どこへ」は to で表します（take him to the park）。過去形は took。',
          examples: [
            { en: '[Take] an umbrella with you.', ja: '傘を持っていきなさい。' },
            { en: "I'll [take] you to the station.", ja: '駅まで送っていくよ。' },
          ],
          contrasts: [
            { word: 'bring', text: '「（こちらへ）持ってくる」。take は「ここから別の場所へ持っていく」。' },
          ],
          note: '',
        },
        {
          id: 's-take-time',
          test: { en: 'It [takes] an hour to clean the room.', ja: '部屋のそうじには1時間かかる。', alts: [] },
          group: 'A',
          pos: 'verb',
          role: 'action',
          cue: 'It takes ten minutes.',
          ipa: { uk: '/teɪk/', us: '/teɪk/' },
          nuance: '「そのことに、それだけの時間が必要」って感じ',
          scene: {
            emoji: '🚌',
            diagram: 'take-time',
            text: '家から学校まで、バスで10分かかる。',
          },
          meaning: '（時間が）かかる',
          roleText: '「動き」を表す言葉です（動詞）。It takes ＋ 時間 ＋ to ～（～するのに〇〇かかる）の形でよく使います。',
          examples: [
            { en: 'It [takes] ten minutes to get to school.', ja: '学校まで10分かかる。' },
            { en: 'How long does it [take]?', ja: 'どのくらい時間がかかる？' },
          ],
          contrasts: [
            { word: 'spend', text: '「人が時間を使う・費やす」（I spent an hour.）。take は「その事に時間が必要」。' },
          ],
          note: 'その事が時間を「持っていく」と考えると、「持っていく」の take とつながります。覚えるための見方です。',
        },
      ],
    },

    {
      id: 'w-on',
      headword: 'on',
      status: 'verified',
      check: check(),
      sources: [
        { label: "Oxford Learner's Dictionaries: on（前置詞）", url: OXF + 'on_1' },
      ],
      groups: {
        A: '「何かの面にくっついている」の on。',
      },
      senses: [
        {
          id: 's-on-contact',
          group: 'A',
          pos: 'preposition',
          role: 'relation',
          cue: 'on the wall',
          ipa: { uk: '/ɒn/', us: '/ɑːn/' },
          nuance: '「何かの面に、ぴたっとくっついている」って感じ',
          scene: {
            emoji: '🖼️',
            diagram: 'on-contact',
            text: '壁に絵がかかっている。テーブルにはカップ。どちらも「面にくっついている」。',
          },
          meaning: '〜の上に、〜に（くっついて）',
          roleText:
            '「位置・関係」を表すつなぎの言葉です（前置詞）。the table（テーブル）などの「もの」の前に置いて、どこにあるかを表します。',
          examples: [
            { en: "There's a picture [on] the wall.", ja: '壁に絵がかかっている。' },
            { en: 'Your phone is [on] the table.', ja: '携帯はテーブルの上にあるよ。' },
          ],
          contrasts: [
            { word: 'above', text: '「離れて上のほうに」。on はくっついているので、壁でも天井でも on。' },
            { word: 'in', text: '「中に入っている」（in the box）。' },
          ],
          note: '「上」とは限りません。壁（on the wall）や天井（on the ceiling）でも、くっついていれば on です。',
        },
      ],
    },

    {
      id: 'w-look',
      headword: 'look',
      status: 'verified',
      check: check(),
      sources: [
        { label: "Oxford Learner's Dictionaries: look（動詞）", url: OXF + 'look_1' },
      ],
      groups: {
        A: '「意識して目を向ける」の look。',
      },
      senses: [
        {
          id: 's-look-at',
          test: { en: 'Please [look] at the board.', ja: '黒板を見てください。', alts: [] },
          group: 'A',
          pos: 'verb',
          role: 'action',
          cue: 'look at the moon',
          ipa: { uk: '/lʊk/', us: '/lʊk/' },
          nuance: '「意識して、そっちに目を向ける」って感じ',
          scene: {
            emoji: '🌙',
            diagram: 'look-see-watch',
            text: '「見て！」と言われて、夜空の月のほうへ顔を向ける。',
          },
          meaning: '（意識して）見る、目を向ける',
          roleText: '「動き」を表す言葉です（動詞）。見る相手は at で示します（look at the moon）。',
          examples: [
            { en: '[Look] at the moon!', ja: '月を見て！' },
            { en: 'She [looked] at me and smiled.', ja: '彼女は私を見てほほえんだ。' },
          ],
          contrasts: [
            { word: 'see', text: '「自然と目に入る・見える」（I can see the sea.）。' },
            { word: 'watch', text: '「動いているものを、しばらく見続ける」（watch TV）。' },
          ],
          note: '',
        },
      ],
    },
  ];

  // 手書きの単語リスト（資料）の単語を先に、そのあとに最初から入っていた見本の単語を並べる。
  // version を上げると、すでに使っている人にも新しい単語だけが追加される（storage.js）。
  const fromNotebook = (notebook && notebook.words) || [];
  // 回（第1回・第2回…）。単語のまとまりで、テストもこの単位で行う。
  const rounds = (notebook && notebook.rounds) || [];
  return { version: 3, words: fromNotebook.concat(words), rounds, sample: words.map((w) => w.id) };
});
