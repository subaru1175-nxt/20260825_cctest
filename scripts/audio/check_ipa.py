"""
check_ipa.py — カードに出している発音記号（辞書）と、AI音声の発音（Kokoro の発音記号）が合っているかを調べる

  python scripts/audio/check_ipa.py        （node が必要。先に build_audio.py で data/audio-report.md を作っておく）

単語の音声（キー "#用法ID"）ごとに、子音の並びと、強く読む母音を比べる。
発音記号に「/ɑːn, ɔːn/」のように2つ書いてあるときは、どちらかと合えばよい。
"""
import json
import os
import subprocess
import sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..'))
CONS = set('bdfhjklmnpstvwzðŋɡɹʃʒʧʤθ')
VOW = 'AIOWYaeiouæɑɒɔəɛɜɪʊʌ'


def simple_ipa(x):
    x = x.strip().strip('/')
    for a, b in [('ː', ''), ('.', ''), (' ', ''), ('(', ''), (')', ''), ('eɪ', 'A'), ('aɪ', 'I'), ('ɔɪ', 'Y'), ('oʊ', 'O'), ('əʊ', 'O'), ('aʊ', 'W'),
                 ('ɚ', 'əɹ'), ('ɝ', 'ɜɹ'), ('tʃ', 'ʧ'), ('dʒ', 'ʤ'), ('g', 'ɡ'), ('r', 'ɹ'), ('e', 'ɛ'), ('ɒ', 'ɑ'), ('ɫ', 'l'), ('ɾ', 't')]:
        x = x.replace(a, b)
    return x


def simple_kokoro(x):
    for a, b in [('ɾ', 't'), ('ᵻ', 'ɪ'), ('ᵊ', 'ə'), ('ɐ', 'ə'), ('ʔ', 't'), (' ', '')]:
        x = x.replace(a, b)
    return x


def skeleton(x):
    return ''.join(c for c in x.replace('ˈ', '').replace('ˌ', '') if c in CONS)


def stressed(x):
    i = x.find('ˈ')
    for c in (x[i + 1:] if i >= 0 else x):
        if c in VOW:
            return c
    return ''


def main():
    senses = json.loads(subprocess.check_output(['node', '-e', """
const seed = require('./js/data-seed.js');
const out = [];
seed.words.forEach((w) => { if (w.status === 'needs_review') return; w.senses.forEach((s) => {
  if (s.status === 'needs_review') return; out.push({ key: '#' + s.id, head: w.headword, ipa: (s.ipa && s.ipa.us) || '' }); }); });
process.stdout.write(JSON.stringify(out));
"""], cwd=ROOT))
    ph = {}
    for line in open(os.path.join(ROOT, 'data', 'audio-report.md'), encoding='utf-8'):
        if line.startswith('| #'):
            c = [x.strip() for x in line.split('|')]
            ph[c[1]] = c[3]
    bad = []
    for r in senses:
        k = ph.get(r['key'])
        if k is None:
            bad.append((r['head'], r['key'], '音声がない'))
            continue
        if not r['ipa']:
            continue
        b = simple_kokoro(k)
        ok = False
        for variant in r['ipa'].strip('/').split(','):
            a = simple_ipa(variant)
            if skeleton(a) == skeleton(b) and (not stressed(a) or not stressed(b) or stressed(a) == stressed(b)):
                ok = True
        if not ok:
            bad.append((r['head'], r['key'], r['ipa'], k))
    print('比べた用法', len(senses), '・食い違い', len(bad))
    for x in bad:
        print('  ', x)
    return 1 if bad else 0


if __name__ == '__main__':
    sys.exit(main())
