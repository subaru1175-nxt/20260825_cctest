"""
check_asr.py — AI音声の聞き取り検査（音声認識で、ねらった英語に聞こえるかを調べる）

  python -m venv .venv-asr && .venv-asr/bin/pip install pocketsphinx
  .venv-asr/bin/python scripts/audio/check_asr.py

PocketSphinx（米国英語のモデル。インターネット不要）に、アプリのすべての英語を候補として与え、
各クリップがどの英語として認識されるかを調べる（閉じた候補の中から選ばせる）。
1語の単語は、短すぎて文の候補と取り違えやすいので、単語どうしの候補でも調べる。
認識の精度そのものは高くないので、絶対的な点数ではなく「ふつう」と「ゆっくり」の差や、作り方の比較に使う。
"""
import json
import os
import re
import subprocess
import sys
from multiprocessing import Pool

from pocketsphinx import Decoder, get_model_path

ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..'))
WORK = os.path.join(ROOT, 'scripts', 'audio', '.asr')

src = open(os.path.join(ROOT, 'js', 'audio-pack.js'), encoding='utf-8').read()
CLIPS = json.loads(re.search(r'audioPack = (\{.*\});', src, re.S).group(1))['clips']
MP = get_model_path()
DIC = set(re.sub(r'\(\d+\)$', '', line.split()[0]) for line in open(os.path.join(MP, 'en-us', 'cmudict-en-us.dict'), encoding='utf-8'))


def norm(t):
    t = t.lower().replace('’', "'")
    t = re.sub(r"[^a-z' \-]", ' ', t).replace('-', ' ')
    return ' '.join(w if w in DIC else w.strip("'") for w in t.split())


def kind(t):
    n = len(t.split())
    return '1語' if n == 1 else '2〜4語' if n <= 4 else '5語以上'


_dec = {}
_pcm = {}


def decode(gram, wid, a, b):
    if gram not in _dec:
        _dec[gram] = Decoder(jsgf=gram, lm=None, samprate=16000, logfn=os.devnull)
    if wid not in _pcm:
        _pcm[wid] = subprocess.run(['ffmpeg', '-v', 'error', '-i', os.path.join(ROOT, 'audio', wid + '.mp3'),
                                    '-f', 's16le', '-ac', '1', '-ar', '16000', 'pipe:1'], capture_output=True, check=True).stdout
    raw = _pcm[wid][int(a * 16000) * 2:int(b * 16000) * 2]
    d = _dec[gram]
    d.start_utt()
    d.process_raw(raw, full_utt=True)
    d.end_utt()
    return d.hyp().hypstr if d.hyp() else ''


def job(args):
    label, gram, key, want = args
    wid, a, b = CLIPS[key]
    return label, key, want, decode(gram, wid, a, b)


def main():
    os.makedirs(WORK, exist_ok=True)
    texts = sorted({k[2:] for k in CLIPS})
    ok_texts = [t for t in texts if norm(t) and all(w in DIC for w in norm(t).split())]
    skipped = sorted(set(texts) - set(ok_texts))
    all_gram = os.path.join(WORK, 'all.gram')
    open(all_gram, 'w').write('#JSGF V1.0;\ngrammar g;\npublic <s> = ' + ' | '.join('( ' + c + ' )' for c in sorted({norm(t) for t in ok_texts})) + ';\n')
    words = [t for t in ok_texts if len(t.split()) == 1]
    word_gram = os.path.join(WORK, 'words.gram')
    open(word_gram, 'w').write('#JSGF V1.0;\ngrammar w;\npublic <s> = ' + ' | '.join(sorted({norm(w) for w in words})) + ';\n')

    jobs = [('全候補', all_gram, v + '|' + t, norm(t)) for t in ok_texts for v in 'ns']
    jobs += [('単語どうし', word_gram, v + '|' + w, norm(w)) for w in words for v in 'ns']
    stat = {}
    miss = []
    with Pool(max(1, (os.cpu_count() or 2) - 1)) as pool:
        for label, key, want, got in pool.imap_unordered(job, jobs, chunksize=8):
            row = (label, kind(key[2:]), 'ふつう' if key[0] == 'n' else 'ゆっくり')
            s = stat.setdefault(row, [0, 0])
            s[1] += 1
            s[0] += got == want
            if got != want:
                miss.append([*row, key[2:], got])
    print('候補にできなかった英語（辞書にない語を含む）:', skipped)
    for row in sorted(stat):
        c, n = stat[row]
        print('%s・%s・%s: %d / %d = %.0f%%' % (row + (c, n, 100 * c / n)))
    json.dump({'stat': {' '.join(k): v for k, v in stat.items()}, 'miss': miss}, open(os.path.join(WORK, 'result.json'), 'w'), ensure_ascii=False, indent=1)


if __name__ == '__main__':
    sys.exit(main())
