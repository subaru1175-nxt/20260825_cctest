# AI音声（音声パック）の作り方

アプリの英語の音声は、あらかじめ作った **AI音声（アメリカ英語）** のファイルです。
端末の読み上げ機能より自然で、端末ごとに声が変わることもありません。

- 声：Kokoro-82M の `af_heart`（アメリカ英語・女性。やわらかく聞き取りやすい声）
- 発音：misaki のアメリカ英語の発音辞書（Kokoro の学習に使われたもの）で、英文を発音記号にしてから合成
- 速さ：ふつうは Kokoro の speed 0.92（自然な速さのまま、少しだけ聞き取りやすく）
- ゆっくり：ふつうの音声を、音の高さを変えずに引き伸ばす。**1語 2.2倍（Praat の PSOLA）・2〜4語 1.8倍・5語以上 1.6倍（WSOLA = ffmpeg の atempo）**
  - Kokoro 自体に遅く話させる方法（speed 0.5〜0.65）と Rubber Band での引き伸ばしは、音がくずれやすいので使わない（下の「確認したこと」）
- 音量：声の部分の平均音量をそろえ、前後に短い無音を入れる
- 日本語は作らない（英語だけ）

## できるもの

| ファイル | 中身 |
| --- | --- |
| `audio/<単語ID>.mp3` | 単語ごとに、その単語の英語（単語・フレーズ・例文・テスト用の例文）を「ふつう」「ゆっくり」の順に1本につないだもの（MP3・48kbps・モノラル） |
| `js/audio-pack.js` | 目録。`"n|英語"`（ふつう）・`"s|英語"`（ゆっくり）ごとに `[ファイル名, 開始秒, 終了秒]` |
| `data/audio-report.md` | 英語ごとの発音記号と長さの一覧（品詞で読みが変わる語の確認にも使う） |

アプリは目録を見て、ファイルの必要な部分だけを Web Audio で鳴らします（iPhone ではマナーモードでも鳴るようにしています）。
目録にない英語（自分で追加した単語など）は、端末の読み上げで読みます。画面には音声の種類（AI音声・録音・端末の読み上げ）を表示します。

## 作り直す手順

```sh
# 1) 素材をそろえる（下の表）。置き場所は任意のフォルダ（例: ~/kokoro）
# 2) Python 3.10 以上で
python -m venv .venv && .venv/bin/pip install onnxruntime numpy praat-parselmouth
# 3) 生成（ffmpeg と node が必要。586件で約14分・4コア。2回目からは合成結果を使い回すので約1分）
.venv/bin/python scripts/audio/build_audio.py --res ~/kokoro
```

| 素材ファイル | 入手元 | ライセンス | sha256 |
| --- | --- | --- | --- |
| `model_quantized.onnx` | Kokoro-82M v1.0 の ONNX（onnx-community 版の q8）。npm `kokoro-q8-shards@1.0.0` の分割ファイルをつないだもの | Apache-2.0 | `fbae9257e1e05ffc727e951ef9b9c98418e6d79f1c9b6b13bd59f5c9028a1478` |
| `af_heart.bin` | npm `kokoro-js@1.2.1` の `voices/af_heart.bin` | Apache-2.0 | `d583ccff3cdca2f7fae535cb998ac07e9fcb90f09737b9a41fa2734ec44a8f0b` |
| `config.json` | PyPI `kokoro-onnx==0.6.1` 同梱（発音記号 → 番号の表） | MIT | `5abb01e2403b072bf03d04fde160443e209d7a0dad49a423be15196b9b43c17f` |
| `us_gold.json`, `us_silver.json` | PyPI `misaki==0.7.4` 同梱（アメリカ英語の発音辞書） | Apache-2.0 | `3636738…a242d` / `01e066a…a8859` |

## スクリプト

| ファイル | 役割 |
| --- | --- |
| `collect-texts.js` | アプリで読み上げる英語を集める（要確認の語は除く） |
| `g2p.py` | 英文 → 発音記号。辞書にない語はエラーにする（推測で読ませない）。a / the / to などの弱い形、-s / -ed / -ing、品詞で読みが変わる語（record・live・excuse・read など）を処理 |
| `kokoro_synth.py` | Kokoro（ONNX）で発音記号から音声を作る |
| `build_audio.py` | 全体の流れ（合成 → 前後の無音を整える → 音量をそろえる → ゆっくりを作る → MP3 と目録を書き出す） |
| `check_signal.py` | できた音声の検査（区間・無音・音割れ・切れ・音量・ゆっくりの長さ）。numpy と ffmpeg が必要 |
| `check_asr.py` | 聞き取り検査（音声認識 PocketSphinx で、ねらった英語に聞こえるか）。`pip install pocketsphinx` が必要 |
| `check_quality.py` | 音質の予測（DNSMOS。人が聞いたときの自然さ・きれいさを1〜5で予測）。`pip install speechmos onnxruntime librosa numpy` が必要 |

## 確認したこと（2026-11-04 の生成分）

- 1,172 区間（586件 × ふつう・ゆっくり）すべてで、無音・音割れ・声の途中での切れがない（`check_signal.py`）
- 声の部分の音量がそろっている（RMS 0.078〜0.092）
- ゆっくりの長さ（声の部分）：1語 2.19倍・2〜4語 1.82倍・5語以上 1.61倍（中央値）
- 品詞で読みが変わる語：`a record` /ˈrekərd/・`to record` /rɪˈkɔːrd/、`to live` /lɪv/・`live music` /laɪv/、`Excuse me.` /z/・`an excuse` /s/、`We read a poem in class.` の read は過去形 /red/（`tests/unit.test.js` で発音記号を確認）

### 聞き取り（`check_asr.py`）と音質（`check_quality.py`）

| 英語の長さ | 聞き取り ふつう | 聞き取り ゆっくり | 音質 ふつう | 音質 ゆっくり |
| --- | --- | --- | --- | --- |
| 5語以上 | 100% | 100% | 3.29 | 3.19 |
| 2〜4語 | 97% | 89% | 3.20 | 3.02 |
| 1語（単語どうしの候補） | 85% | 71% | 3.02 | 2.70 |

- 聞き取り：音声認識に、アプリのすべての英語（1語は単語どうし）を候補として与え、ねらった英語として認識された割合。認識ソフト自体の精度は高くないので、短い単語ほど低く出る（café を含む3件は、認識ソフトの辞書にないため除外）
- 音質：DNSMOS の OVRL（1〜5）。点数そのものより、ふつうとの差や、作り方どうしの比較に使っている

### ゆっくりの作り方を決めたときの比較（1語・94語）

| 作り方 | 長さ | 聞き取り | 音質 |
| --- | --- | --- | --- |
| ふつうの速さ（参考） | 1倍 | 84% | 3.02 |
| **Praat の PSOLA で引き伸ばす ← 採用** | **2.2倍** | **74%** | **2.59** |
| Praat の PSOLA で引き伸ばす | 2倍 | 74% | 2.68 |
| WSOLA（ffmpeg atempo）で引き伸ばす | 2倍 | 69% | 2.78 |
| Rubber Band で引き伸ばす（前の版） | 2倍 | 70% | 2.03 |
| Kokoro に遅く話させる（speed 0.5・最初の版） | 2.35倍 | 21% | 2.64 |
| Kokoro に遅く話させる（speed 0.75） | 1.35倍 | 74% | 2.90 |

2〜4語（1.8倍）では WSOLA 91%・3.02、PSOLA 89%・2.75、Rubber Band 88%・2.17、
5語以上（1.6倍）では WSOLA 100%・3.18、PSOLA 100%・3.10、Rubber Band 99%・2.34 だったので、2語以上は WSOLA にした。
