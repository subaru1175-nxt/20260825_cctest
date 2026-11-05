"""
packio.py — 検査スクリプト共通：AI音声の目録（js/audio-pack.js）と、区間の取り出し

目録： clips = { "n|キー": [ファイル名, 開始バイト, 終了バイト, 長さ（秒）, 英語] }
各区間は、それだけで再生できる MP3 なので、バイトで取り出してそのまま読む。
"""
import json
import os
import re
import subprocess

import numpy as np

ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..'))


def load_pack(root=ROOT):
    src = open(os.path.join(root, 'js', 'audio-pack.js'), encoding='utf-8').read()
    return json.loads(re.search(r'audioPack = (\{.*\});', src, re.S).group(1))


_files = {}


def clip_bytes(entry, root=ROOT, base='audio/'):
    name, a, b = entry[0], entry[1], entry[2]
    if name not in _files:
        with open(os.path.join(root, base, name), 'rb') as f:
            _files[name] = f.read()
    data = _files[name]
    if not (0 <= a < b <= len(data)):
        raise ValueError('範囲がファイルの外: %s %s-%s (%d)' % (name, a, b, len(data)))
    return data[a:b]


def decode(mp3, rate=24000, fmt='f32le'):
    """MP3（バイト列）→ 波形（float32）または 16bit の生データ"""
    out = subprocess.run(['ffmpeg', '-v', 'error', '-f', 'mp3', '-i', 'pipe:0', '-f', fmt, '-ac', '1', '-ar', str(rate), 'pipe:1'],
                         input=mp3, capture_output=True, check=True).stdout
    return np.frombuffer(out, dtype=np.float32) if fmt == 'f32le' else out


def kind(text):
    n = len(text.split())
    return '1語' if n == 1 else '2〜4語' if n <= 4 else '5語以上'
