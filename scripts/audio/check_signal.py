"""
check_signal.py — AI音声の検査（すべての区間）

  python scripts/audio/check_signal.py        （numpy と ffmpeg が必要）

調べること
  - 区間がファイルの中にあり、それだけで MP3 として読めること
  - 読んだ長さが目録の長さと合うこと（ずれは MP3 の前後の小さな無音だけ）
  - 無音でないこと・音割れしていないこと・声の途中で切れていないこと・前後に少し無音があること
  - 単語のキー（#用法ID）は1語の長さで、文やフレーズになっていないこと
  - ゆっくりが、ふつうよりはっきり長いこと
  - 声の部分の音量がそろっていること
"""
import os
import statistics
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from packio import load_pack, clip_bytes, decode, kind  # noqa: E402

SR = 24000


def voiced(x):
    env = np.convolve(np.abs(x), np.ones(240) / 240, mode='same')
    v = np.where(env > 0.01)[0]
    return (v[0] / SR, v[-1] / SR) if len(v) else None


def main():
    pack = load_pack()
    clips = pack['clips']
    bad = []
    stats = {}
    rms_all = []
    peak_all = []
    for key, entry in sorted(clips.items()):
        try:
            x = decode(clip_bytes(entry))
        except Exception as e:  # noqa: BLE001
            bad.append(('読めない', key, str(e)[:80]))
            continue
        dur = len(x) / SR
        if abs(dur - entry[3]) > 0.12:
            bad.append(('長さが目録と違う', key, round(dur, 3), entry[3]))
        vv = voiced(x)
        if not vv:
            bad.append(('無音', key))
            continue
        lead, end = vv
        tail = dur - end
        if lead < 0.04 or tail < 0.08:
            bad.append(('前後の無音が短い', key, round(lead, 3), round(tail, 3)))
        peak = float(np.abs(x).max())
        if peak > 0.99:
            bad.append(('音割れ', key, peak))
        if float(np.abs(x[-int(0.02 * SR):]).max()) > 0.05:
            bad.append(('終わりで切れている', key))
        env = np.convolve(np.abs(x), np.ones(480) / 480, mode='same')
        rms_all.append(float(np.sqrt(np.mean(x[env > 0.02] ** 2))) if (env > 0.02).any() else 0)
        peak_all.append(peak)
        text = entry[4]
        if key[2:].startswith('#') and len(text.split()) == 1 and key[0] == 'n' and end - lead > 1.3:
            bad.append(('単語なのに長すぎる（文になっていないか）', key, text, round(end - lead, 2)))
        stats[key] = end - lead
    ratios = {}
    for key in clips:
        if key[0] != 'n' or ('s' + key[1:]) not in stats or key not in stats:
            continue
        r = stats['s' + key[1:]] / stats[key]
        ratios.setdefault(kind(clips[key][4]), []).append(r)
        if r < 1.35:
            bad.append(('ゆっくりが遅くない', key, round(r, 2)))
    print('区間', len(clips), '・ファイル', len({e[0] for e in clips.values()}))
    for k, v in sorted(ratios.items()):
        print('%s ゆっくり/ふつう 中央値 %.2f（最小 %.2f・最大 %.2f）' % (k, statistics.median(v), min(v), max(v)))
    print('声の音量 RMS 中央値 %.3f（%.3f〜%.3f）・ピーク最大 %.3f' % (statistics.median(rms_all), min(rms_all), max(rms_all), max(peak_all)))
    print('問題', len(bad))
    for b in bad[:60]:
        print('  ', b)
    return 1 if bad else 0


if __name__ == '__main__':
    sys.exit(main())
