"""
build_audio.py — 高品質な音声パック（アメリカ英語・Kokoro af_heart）を作る

  python scripts/audio/build_audio.py --res <素材フォルダ> [--voice af_heart]

素材フォルダに置くもの（入手方法は scripts/audio/README.md）
  model_quantized.onnx … Kokoro-82M（onnx-community 版 q8, sha256 fbae9257…a1478）
  config.json          … 発音記号の対応表（kokoro-onnx 同梱）
  us_gold.json, us_silver.json … misaki のアメリカ英語の発音辞書
  af_heart.bin         … 声（kokoro-js 同梱）

ゆっくりの作り方
  ふつうの速さの音声を、音の高さを変えずに引き伸ばす。
    1語     … Praat の PSOLA（声の周期に合わせて引き伸ばす。単語でいちばん聞き取りやすかった）で 2.2倍
    2〜4語  … WSOLA（ffmpeg の atempo）で 1.8倍
    5語以上 … WSOLA で 1.6倍
  方法は、音声認識での聞き取り（check_asr.py）と、音質の予測（DNSMOS）で比べて決めた（README.md）。
  Kokoro 自体に遅く話させる方法（speed 0.5）と Rubber Band での引き伸ばしは、音がくずれやすいので使わない。

出力
  audio/<単語ID>.<版>.mp3 … 単語ごとのファイル。中身は「1つの英語 × ふつう／ゆっくり」ごとに別々に作った MP3 を
                             つないだもの。アプリはバイトの範囲で1つを取り出して、それだけを再生する
                             （時間の位置を使わないので、ブラウザによる MP3 の読み方の違いで、となりの音が鳴ることがない）。
                             版はファイルの中身から作るので、作り直すと名前が変わり、古い音声がキャッシュから鳴らない。
  js/audio-pack.js     … 目録 { "n|キー": [ファイル名, 開始バイト, 終了バイト, 長さ（秒）, 英語] }
  data/audio-report.md … 発音記号と長さの一覧
"""
import argparse
import hashlib
import json
import os
import subprocess
import sys
import time

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
sys.path.insert(0, HERE)
from g2p import G2P  # noqa: E402
from kokoro_synth import Kokoro, SAMPLE_RATE  # noqa: E402

# 速さ
SPEED_NORMAL = 0.92        # Kokoro の speed。自然な速さのまま、少しだけ聞き取りやすく
# ゆっくり：ふつうの音声を引き伸ばす倍率
SLOW_WORD = 2.2      # 1語（PSOLA）
SLOW_PHRASE = 1.8    # 2〜4語（WSOLA）
SLOW_SENTENCE = 1.6  # 5語以上（WSOLA）
LEAD = 0.12                # 音の前の無音（秒）
TAIL = 0.22                # 音の後の無音

TARGET_RMS = 0.085         # 音量をそろえる（声のある部分の平均）
PEAK = 0.89


def slow_factor(text):
    """短いほど、ゆっくりにする（1語 2.2倍・2〜4語 1.8倍・5語以上 1.6倍）"""
    n = len(text.split())
    if n == 1:
        return SLOW_WORD
    if n <= 4:
        return SLOW_PHRASE
    return SLOW_SENTENCE


def psola(x, factor):
    """声の周期に合わせて引き伸ばす（Praat の Lengthen (overlap-add)）"""
    import parselmouth
    from parselmouth.praat import call
    snd = parselmouth.Sound(x.astype(np.float64), sampling_frequency=SAMPLE_RATE)
    return call(snd, 'Lengthen (overlap-add)', 75, 600, factor).values[0].astype(np.float32)


def wsola(x, factor):
    """波形を少しずつ重ねて引き伸ばす（ffmpeg の atempo）"""
    pcm = np.clip(x, -1, 1).astype(np.float32).tobytes()
    out = subprocess.run([
        'ffmpeg', '-hide_banner', '-loglevel', 'error',
        '-f', 'f32le', '-ar', str(SAMPLE_RATE), '-ac', '1', '-i', 'pipe:0',
        '-af', 'atempo=%.6f' % (1 / factor),
        '-f', 'f32le', '-ar', str(SAMPLE_RATE), '-ac', '1', 'pipe:1',
    ], input=pcm, capture_output=True, check=True).stdout
    return np.frombuffer(out, dtype=np.float32).copy()


def make_slow(normal, text):
    """ふつうの音声から、ゆっくりを作る。始まりの子音がぼやけないよう、前後に無音を足してから引き伸ばす"""
    factor = slow_factor(text)
    x = np.concatenate([silence(0.15), normal, silence(0.15)])
    return psola(x, factor) if len(text.split()) == 1 else wsola(x, factor)


def trim(x, thr=0.006, margin=0.04):
    """前後の無音を切る（声の始まり・終わりの少し外側まで残す）"""
    env = np.convolve(np.abs(x), np.ones(240) / 240, mode='same')
    idx = np.where(env > thr)[0]
    if not len(idx):
        return x
    m = int(margin * SAMPLE_RATE)
    return x[max(0, idx[0] - m): min(len(x), idx[-1] + m)]


def level(x):
    env = np.convolve(np.abs(x), np.ones(480) / 480, mode='same')
    voiced = x[env > 0.02]
    rms = float(np.sqrt(np.mean(voiced ** 2))) if len(voiced) else float(np.sqrt(np.mean(x ** 2)))
    gain = TARGET_RMS / max(rms, 1e-6)
    peak = float(np.abs(x).max()) * gain
    if peak > PEAK:
        gain *= PEAK / peak
    # 始まりと終わりを 8ms でなめらかに
    y = x * gain
    f = int(0.008 * SAMPLE_RATE)
    if len(y) > 2 * f:
        ramp = np.linspace(0, 1, f)
        y[:f] *= ramp
        y[-f:] *= ramp[::-1]
    return y


def silence(sec):
    return np.zeros(int(round(sec * SAMPLE_RATE)), dtype=np.float32)


def mp3_bytes(samples):
    """1つの区間を、それだけで再生できる MP3（バイト列）にする"""
    pcm = np.clip(samples, -1, 1).astype(np.float32).tobytes()
    return subprocess.run([
        'ffmpeg', '-hide_banner', '-loglevel', 'error',
        '-f', 'f32le', '-ar', str(SAMPLE_RATE), '-ac', '1', '-i', 'pipe:0',
        '-codec:a', 'libmp3lame', '-b:a', '48k', '-ar', str(SAMPLE_RATE), '-ac', '1',
        '-map_metadata', '-1', '-id3v2_version', '0', '-write_id3v1', '0',
        '-f', 'mp3', 'pipe:1',
    ], input=pcm, capture_output=True, check=True).stdout


def encode_mp3(samples, path):
    pcm = np.clip(samples, -1, 1).astype(np.float32).tobytes()
    subprocess.run([
        'ffmpeg', '-hide_banner', '-loglevel', 'error', '-y',
        '-f', 'f32le', '-ar', str(SAMPLE_RATE), '-ac', '1', '-i', 'pipe:0',
        '-codec:a', 'libmp3lame', '-b:a', '48k', '-ar', str(SAMPLE_RATE), '-ac', '1', path,
    ], input=pcm, check=True)


POS_TAG = {'noun': 'NOUN', 'verb': 'VERB', 'adjective': 'ADJ', 'adverb': 'ADV'}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--res', required=True, help='素材フォルダ')
    ap.add_argument('--voice', default='af_heart')
    ap.add_argument('--cache', default=None, help='合成結果のキャッシュ（作り直しを速くする）')
    args = ap.parse_args()
    res = args.res
    cache = args.cache or os.path.join(res, 'cache-' + args.voice)
    os.makedirs(cache, exist_ok=True)

    texts = json.loads(subprocess.check_output(['node', os.path.join(HERE, 'collect-texts.js')], cwd=ROOT))
    g2p = G2P(os.path.join(res, 'us_gold.json'), os.path.join(res, 'us_silver.json'))
    tts = Kokoro(os.path.join(res, 'model_quantized.onnx'), os.path.join(res, 'config.json'), os.path.join(res, args.voice + '.bin'))

    def synth(ph, speed):
        key = hashlib.sha1((args.voice + '|' + str(speed) + '|' + ph).encode('utf-8')).hexdigest()
        f = os.path.join(cache, key + '.npy')
        if os.path.exists(f):
            return np.load(f)
        w = tts(ph, speed=speed).astype(np.float32)
        np.save(f, w)
        return w

    made = {}      # (英語, 発音記号) → {'n': (MP3, 秒), 's': (MP3, 秒)}（同じ音は1回だけ作る）
    groups = {}    # 単語ID → [(キー, 英語, 発音記号)]
    report = []
    t0 = time.time()
    for n, t in enumerate(texts):
        word = t['kind'] == 'word'
        ph = g2p(t['text'], isolated=word, tag=POS_TAG.get(t['pos']) if word else None)
        if (t['text'], ph) not in made:
            normal = level(trim(synth(ph, SPEED_NORMAL)))
            slow = level(trim(make_slow(normal, t['text'])))
            made[(t['text'], ph)] = {
                v: (mp3_bytes(np.concatenate([silence(LEAD), w, silence(TAIL)])), (len(w) / SAMPLE_RATE) + LEAD + TAIL)
                for v, w in (('n', normal), ('s', slow))
            }
        groups.setdefault(t['wordId'], []).append((t['key'], t['text'], ph))
        c = made[(t['text'], ph)]
        report.append((t['key'], t['text'], ph, c['n'][1], c['s'][1]))
        if (n + 1) % 50 == 0:
            print(f'{n + 1}/{len(texts)} … {time.time() - t0:.0f}s', flush=True)

    audio_dir = os.path.join(ROOT, 'audio')
    os.makedirs(audio_dir, exist_ok=True)
    index = {}
    names = set()
    total = 0
    for wid, items in groups.items():
        blob = bytearray()
        where = {}  # (英語, 発音記号, 速さ) → (開始, 終了)。同じ音は1か所にまとめる
        plan = []
        for key, text, ph in items:
            for v in ('n', 's'):
                if (text, ph, v) not in where:
                    data, dur = made[(text, ph)][v]
                    where[(text, ph, v)] = (len(blob), len(blob) + len(data))
                    blob += data
                plan.append((v + '|' + key, (text, ph, v), text))
        name = wid + '.' + hashlib.sha1(bytes(blob)).hexdigest()[:8] + '.mp3'
        with open(os.path.join(audio_dir, name), 'wb') as f:
            f.write(blob)
        names.add(name)
        total += len(blob)
        for k, ref, text in plan:
            a, b = where[ref]
            index[k] = [name, a, b, round(made[(ref[0], ref[1])][ref[2]][1], 3), text]
    # 前の版のファイル（もう使わない名前）を片づける
    for fn in os.listdir(audio_dir):
        if fn.endswith('.mp3') and fn not in names:
            os.remove(os.path.join(audio_dir, fn))

    pack = {
        'engine': 'Kokoro-82M',
        'voice': args.voice,
        'accent': 'en-US',
        'base': 'audio/',
        'pad': [LEAD, TAIL],
        'slow': {'1': SLOW_WORD, '2-4': SLOW_PHRASE, '5+': SLOW_SENTENCE},
        'clips': index,
    }
    with open(os.path.join(ROOT, 'js', 'audio-pack.js'), 'w', encoding='utf-8') as f:
        f.write('/*\n * audio-pack.js — AI音声の目録\n'
                ' * scripts/audio/build_audio.py で自動生成。直接は編集しないでください。\n'
                ' * clips: { "n|キー": [ファイル名, 開始バイト, 終了バイト, 長さ（秒）, 英語] }（n=ふつう, s=ゆっくり）\n'
                ' *   キー：単語は "#用法ID"（見出し語だけを、その用法の発音で読む）、フレーズと文は英語そのもの\n */\n'
                '(function (root) {\n  root.CIF = root.CIF || {};\n  root.CIF.audioPack = ' +
                json.dumps(pack, ensure_ascii=False, separators=(',', ':')) + ';\n})(this);\n')

    os.makedirs(os.path.join(ROOT, 'data'), exist_ok=True)
    with open(os.path.join(ROOT, 'data', 'audio-report.md'), 'w', encoding='utf-8') as f:
        f.write('# 音声パックの一覧\n\n自動生成：`scripts/audio/build_audio.py`\n\n')
        f.write(f'- 声：Kokoro-82M / {args.voice}（アメリカ英語）\n- 英語 {len(texts)}件 × ふつう・ゆっくり（単語は用法ごとに、見出し語だけを読む）\n')
        f.write(f'- 速さ：ふつう Kokoro speed {SPEED_NORMAL}。ゆっくりは、ふつうの音声を音の高さを変えずに引き伸ばしたもの'
                f'（1語 {SLOW_WORD}倍 PSOLA・2〜4語 {SLOW_PHRASE}倍 WSOLA・5語以上 {SLOW_SENTENCE}倍 WSOLA）\n')
        f.write(f'- ファイル：{len(groups)}本・合計 {total / 1e6:.1f} MB（区間ごとに別々の MP3）\n\n')
        f.write('| キー | 英語 | 発音記号（Kokoro） | ふつう（秒） | ゆっくり（秒） |\n| --- | --- | --- | --- | --- |\n')
        for key, text, ph, dn, ds in report:
            f.write(f'| {key} | {text} | {ph} | {dn:.2f} | {ds:.2f} |\n')
    print(f'done: {len(texts)} texts, {len(made)} unique clips x2, {len(groups)} files, {total / 1e6:.1f} MB, {time.time() - t0:.0f}s')


if __name__ == '__main__':
    main()
