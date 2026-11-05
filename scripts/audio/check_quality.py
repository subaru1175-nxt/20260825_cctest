"""
check_quality.py — AI音声の音質の予測（DNSMOS。人が聞いたときの自然さ・きれいさを 1〜5 で予測するモデル）

  python -m venv .venv-mos && .venv-mos/bin/pip install speechmos onnxruntime librosa numpy
  .venv-mos/bin/python scripts/audio/check_quality.py

実際の音声ファイル（audio/*.mp3）から各区間を取り出し、「ふつう」と「ゆっくり」を英語の長さごとに比べる。
ゆっくりの音質が、ふつうより大きく落ちていないか（引き伸ばしで音がくずれていないか）を見るためのもの。
"""
import collections
import os
import sys

import numpy as np
from speechmos import dnsmos

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from packio import load_pack, clip_bytes, decode, kind  # noqa: E402

CLIPS = load_pack()['clips']


def main():
    res = collections.defaultdict(list)
    for key, entry in sorted(CLIPS.items()):
        x = decode(clip_bytes(entry), rate=16000)
        r = dnsmos.run(x.astype(np.float32), sr=16000)
        res[(kind(entry[4]), 'ふつう' if key[0] == 'n' else 'ゆっくり')].append((r['sig_mos'], r['ovrl_mos'], r['p808_mos']))
    print('英語の長さ・速さ: 件数  声のきれいさ(SIG)  全体(OVRL)  P.808')
    for k in sorted(res):
        m = np.array(res[k]).mean(axis=0)
        print('%s・%s: %d件  %.2f  %.2f  %.2f' % (k[0], k[1], len(res[k]), m[0], m[1], m[2]))


if __name__ == '__main__':
    main()
