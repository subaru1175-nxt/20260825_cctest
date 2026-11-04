"""
check_signal.py — AI音声の簡単な検査（区間の範囲・無音・音割れ・声の途中での切れ・音量・ゆっくりの長さ）

  python scripts/audio/check_signal.py        （numpy と ffmpeg が必要）
"""
import json, re, subprocess, sys, statistics
import numpy as np
import os
ROOT = sys.argv[1] if len(sys.argv) > 1 else os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..'))
src = open(ROOT + '/js/audio-pack.js', encoding='utf-8').read()
pack = json.loads(re.search(r'audioPack = (\{.*\});', src, re.S).group(1))
clips = pack['clips']
files = {}
def load(wid):
    if wid not in files:
        raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', ROOT + '/audio/' + wid + '.mp3', '-f', 'f32le', '-ac', '1', '-ar', '24000', 'pipe:1'], capture_output=True, check=True).stdout
        files[wid] = np.frombuffer(raw, dtype=np.float32)
    return files[wid]
SR = 24000
rows = []
bad = []
for key, (wid, a, b) in clips.items():
    x = load(wid)
    if b * SR > len(x) + SR * 0.05 or a >= b:
        bad.append(('range', key, a, b, len(x) / SR)); continue
    seg = x[int(a * SR):int(b * SR)]
    env = np.convolve(np.abs(seg), np.ones(240) / 240, mode='same')
    voiced = np.where(env > 0.01)[0]
    if not len(voiced):
        bad.append(('silent', key)); continue
    lead = voiced[0] / SR; tail = (len(seg) - voiced[-1]) / SR
    peak = float(np.abs(seg).max())
    rms = float(np.sqrt(np.mean(seg[env > 0.02] ** 2))) if (env > 0.02).any() else 0
    # 区間の端で声が切れていないか（端の 20ms の音量）
    edge = float(np.abs(seg[-int(0.02 * SR):]).max())
    rows.append((key, b - a, lead, tail, peak, rms, edge))
    if lead < 0.04 or tail < 0.08: bad.append(('tight', key, round(lead, 3), round(tail, 3)))
    if peak > 0.99: bad.append(('clip', key, peak))
    if edge > 0.05: bad.append(('edge', key, edge))
# 通常とゆっくりの比（前後の無音を除いた、声の長さ）
ratios = {'word': [], 'phrase': [], 'sentence': []}
def voiced_len(key):
    wid, a, b = clips[key]
    seg = load(wid)[int(a * SR):int(b * SR)]
    env = np.convolve(np.abs(seg), np.ones(240) / 240, mode='same')
    v = np.where(env > 0.01)[0]
    return (v[-1] - v[0]) / SR
for key in clips:
    if not key.startswith('n|'): continue
    t = key[2:]
    n = voiced_len(key); s = voiced_len('s|' + t)
    kind = 'word' if len(t.split()) == 1 else 'phrase' if len(t.split()) <= 4 and not re.search(r'[.!?]$', t) else 'sentence'
    ratios[kind].append(s / n)
    # 文字数あたりの長さが極端なもの（崩れの目安）
    if n / max(1, len(t)) > 0.25 or n / max(1, len(t)) < 0.035: bad.append(('speed?', t, round(n, 2), len(t)))
print('clips', len(clips), 'files', len(files), 'total min', round(sum(len(v) for v in files.values()) / SR / 60, 1))
for k, v in ratios.items():
    if v: print(k, 'n=%d' % len(v), 'slow/normal median %.2f min %.2f max %.2f' % (statistics.median(v), min(v), max(v)))
rms = [r[5] for r in rows]
print('voiced RMS median %.3f min %.3f max %.3f' % (statistics.median(rms), min(rms), max(rms)))
print('peak max %.3f' % max(r[4] for r in rows))
print('issues', len(bad))
for b in bad[:40]: print(' ', b)
