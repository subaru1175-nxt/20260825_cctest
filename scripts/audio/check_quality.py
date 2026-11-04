"""
check_quality.py — AI音声の音質の予測（DNSMOS。人が聞いたときの自然さ・きれいさを 1〜5 で予測するモデル）

  python -m venv .venv-mos && .venv-mos/bin/pip install speechmos onnxruntime librosa numpy
  .venv-mos/bin/python scripts/audio/check_quality.py

実際の音声ファイル（audio/*.mp3）から各区間を取り出し、「ふつう」と「ゆっくり」を英語の長さごとに比べる。
ゆっくりの音質が、ふつうより大きく落ちていないか（引き伸ばしで音がくずれていないか）を見るためのもの。
"""
import collections
import json
import os
import re
import subprocess

import numpy as np
from speechmos import dnsmos

ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..'))
src = open(os.path.join(ROOT, 'js', 'audio-pack.js'), encoding='utf-8').read()
CLIPS = json.loads(re.search(r'audioPack = (\{.*\});', src, re.S).group(1))['clips']


def kind(t):
    n = len(t.split())
    return '1語' if n == 1 else '2〜4語' if n <= 4 else '5語以上'


def main():
    pcm = {}
    res = collections.defaultdict(list)
    for key, (wid, a, b) in sorted(CLIPS.items()):
        if wid not in pcm:
            raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', os.path.join(ROOT, 'audio', wid + '.mp3'),
                                  '-f', 'f32le', '-ac', '1', '-ar', '16000', 'pipe:1'], capture_output=True, check=True).stdout
            pcm[wid] = np.frombuffer(raw, dtype=np.float32)
        x = pcm[wid][int(a * 16000):int(b * 16000)]
        r = dnsmos.run(x.astype(np.float32), sr=16000)
        res[(kind(key[2:]), 'ふつう' if key[0] == 'n' else 'ゆっくり')].append((r['sig_mos'], r['ovrl_mos'], r['p808_mos']))
    print('英語の長さ・速さ: 件数  声のきれいさ(SIG)  全体(OVRL)  P.808')
    for k in sorted(res):
        m = np.array(res[k]).mean(axis=0)
        print('%s・%s: %d件  %.2f  %.2f  %.2f' % (k[0], k[1], len(res[k]), m[0], m[1], m[2]))


if __name__ == '__main__':
    main()
