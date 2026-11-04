"""
build_audio.py — 高品質な音声パック（アメリカ英語・Kokoro af_heart）を作る

  python scripts/audio/build_audio.py --res <素材フォルダ> [--voice af_heart]

素材フォルダに置くもの（入手方法は scripts/audio/README.md）
  model_quantized.onnx … Kokoro-82M（onnx-community 版 q8, sha256 fbae9257…a1478）
  config.json          … 発音記号の対応表（kokoro-onnx 同梱）
  us_gold.json, us_silver.json … misaki のアメリカ英語の発音辞書
  af_heart.bin         … 声（kokoro-js 同梱）

出力
  audio/<単語ID>.mp3   … 単語ごとに、読み上げる英語（通常・ゆっくり）を1本につないだファイル
  js/audio-pack.js     … 「どの英語が、どのファイルの何秒から何秒か」の目録
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

# 速さ（Kokoro の speed。小さいほどゆっくり）
SPEED_NORMAL = 0.92        # 自然な速さのまま、少しだけ聞き取りやすく
SPEED_SLOW_WORD = 0.5      # 単語のゆっくり（通常の約2.4倍の長さ）
SPEED_SLOW_PHRASE = 0.6    # 2〜4語のフレーズ
SPEED_SLOW_SENTENCE = 0.65 # 文
LEAD = 0.12                # 音の前の無音（秒）
TAIL = 0.22                # 音の後の無音
GAP = 0.35                 # ファイルの中で、次の音までの無音
TARGET_RMS = 0.085         # 音量をそろえる（声のある部分の平均）
PEAK = 0.89


def slow_speed(kind, text):
    if kind == 'word' and len(text.split()) == 1:
        return SPEED_SLOW_WORD
    if len(text.split()) <= 4:
        return SPEED_SLOW_PHRASE
    return SPEED_SLOW_SENTENCE


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


def encode_mp3(samples, path):
    pcm = np.clip(samples, -1, 1).astype(np.float32).tobytes()
    subprocess.run([
        'ffmpeg', '-hide_banner', '-loglevel', 'error', '-y',
        '-f', 'f32le', '-ar', str(SAMPLE_RATE), '-ac', '1', '-i', 'pipe:0',
        '-codec:a', 'libmp3lame', '-b:a', '48k', '-ar', str(SAMPLE_RATE), '-ac', '1', path,
    ], input=pcm, check=True)


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

    groups = {}
    report = []
    t0 = time.time()
    for n, t in enumerate(texts):
        ph = g2p(t['text'], isolated=(t['kind'] == 'word'))
        clips = {}
        for variant, speed in (('n', SPEED_NORMAL), ('s', slow_speed(t['kind'], t['text']))):
            w = level(trim(synth(ph, speed)))
            clips[variant] = np.concatenate([silence(LEAD), w, silence(TAIL)])
        groups.setdefault(t['wordId'], []).append((t['text'], clips))
        report.append((t['text'], ph, len(clips['n']) / SAMPLE_RATE, len(clips['s']) / SAMPLE_RATE))
        if (n + 1) % 50 == 0:
            print(f'{n + 1}/{len(texts)} … {time.time() - t0:.0f}s', flush=True)

    os.makedirs(os.path.join(ROOT, 'audio'), exist_ok=True)
    index = {}
    total = 0
    for wid, items in groups.items():
        parts = []
        pos = 0.0
        for text, clips in items:
            for variant in ('n', 's'):
                c = clips[variant]
                start = pos
                parts.append(c)
                pos += len(c) / SAMPLE_RATE
                index[variant + '|' + text] = [wid, round(start, 3), round(pos, 3)]
                parts.append(silence(GAP))
                pos += GAP
        path = os.path.join(ROOT, 'audio', wid + '.mp3')
        encode_mp3(np.concatenate(parts), path)
        total += os.path.getsize(path)

    pack = {
        'engine': 'Kokoro-82M',
        'voice': args.voice,
        'accent': 'en-US',
        'base': 'audio/',
        'ext': '.mp3',
        'clips': index,
    }
    with open(os.path.join(ROOT, 'js', 'audio-pack.js'), 'w', encoding='utf-8') as f:
        f.write('/*\n * audio-pack.js — 高品質な音声（音声パック）の目録\n'
                ' * scripts/audio/build_audio.py で自動生成。直接は編集しないでください。\n'
                ' * clips: { "n|英語": [ファイル名, 開始秒, 終了秒] }（n=通常, s=ゆっくり）\n */\n'
                '(function (root) {\n  root.CIF = root.CIF || {};\n  root.CIF.audioPack = ' +
                json.dumps(pack, ensure_ascii=False, separators=(',', ':')) + ';\n})(this);\n')

    os.makedirs(os.path.join(ROOT, 'data'), exist_ok=True)
    with open(os.path.join(ROOT, 'data', 'audio-report.md'), 'w', encoding='utf-8') as f:
        f.write('# 音声パックの一覧\n\n自動生成：`scripts/audio/build_audio.py`\n\n')
        f.write(f'- 声：Kokoro-82M / {args.voice}（アメリカ英語）\n- 英語 {len(texts)}件 × 通常・ゆっくり\n')
        f.write(f'- 速さ：通常 {SPEED_NORMAL}、ゆっくり 単語 {SPEED_SLOW_WORD}・フレーズ {SPEED_SLOW_PHRASE}・文 {SPEED_SLOW_SENTENCE}\n')
        f.write(f'- ファイル：{len(groups)}本・合計 {total / 1e6:.1f} MB\n\n')
        f.write('| 英語 | 発音記号（Kokoro） | 通常（秒） | ゆっくり（秒） |\n| --- | --- | --- | --- |\n')
        for text, ph, dn, ds in report:
            f.write(f'| {text} | {ph} | {dn:.2f} | {ds:.2f} |\n')
    print(f'done: {len(texts)} texts, {len(groups)} files, {total / 1e6:.1f} MB, {time.time() - t0:.0f}s')


if __name__ == '__main__':
    main()
