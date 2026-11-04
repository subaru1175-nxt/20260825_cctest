# AI音声（音声パック）の作り方

アプリの英語の音声は、あらかじめ作った **AI音声（アメリカ英語）** のファイルです。
端末の読み上げ機能より自然で、端末ごとに声が変わることもありません。

- 声：Kokoro-82M の `af_heart`（アメリカ英語・女性。やわらかく聞き取りやすい声）
- 発音：misaki のアメリカ英語の発音辞書（Kokoro の学習に使われたもの）で、英文を発音記号にしてから合成
- 速さ：ふつう 0.92（自然な速さのまま少しだけ聞き取りやすく）／ゆっくり 単語 0.5・2〜4語のフレーズ 0.6・文 0.65
  - 声の部分の長さで、ゆっくりは **単語で約2.35倍、フレーズで約1.8倍、文で約1.6倍**（中央値）
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
python -m venv .venv && .venv/bin/pip install onnxruntime numpy
# 3) 生成（ffmpeg と node が必要。586件で約14分・4コア）
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
| `build_audio.py` | 全体の流れ（合成 → 前後の無音を整える → 音量をそろえる → MP3 と目録を書き出す） |

## 確認したこと（2026-11-04 の生成分）

- 1,172 区間（586件 × ふつう・ゆっくり）すべてで、無音・音割れ・声の途中での切れがない
- 声の部分の音量がそろっている（RMS 0.076〜0.091）
- 品詞で読みが変わる語：`a record` /ˈrekərd/・`to record` /rɪˈkɔːrd/、`to live` /lɪv/・`live music` /laɪv/、`Excuse me.` /z/・`an excuse` /s/、`We read a poem in class.` の read は過去形 /red/（`tests/unit.test.js` で発音記号を確認）
