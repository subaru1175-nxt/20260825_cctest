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
import sys
from multiprocessing import Pool

from pocketsphinx import Decoder, get_model_path

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from packio import ROOT, load_pack, clip_bytes, decode, kind  # noqa: E402

WORK = os.path.join(ROOT, 'scripts', 'audio', '.asr')
CLIPS = load_pack()['clips']
MP = get_model_path()
DIC = set(re.sub(r'\(\d+\)$', '', line.split()[0]) for line in open(os.path.join(MP, 'en-us', 'cmudict-en-us.dict'), encoding='utf-8'))


def norm(t):
    t = t.lower().replace('’', "'")
    t = re.sub(r"[^a-z' \-]", ' ', t).replace('-', ' ')
    return ' '.join(w if w in DIC else w.strip("'") for w in t.split())


_dec = {}


def recognize(gram, key):
    if gram not in _dec:
        _dec[gram] = Decoder(jsgf=gram, lm=None, samprate=16000, logfn=os.devnull)
    raw = decode(clip_bytes(CLIPS[key]), rate=16000, fmt='s16le')
    d = _dec[gram]
    d.start_utt()
    d.process_raw(raw, full_utt=True)
    d.end_utt()
    return d.hyp().hypstr if d.hyp() else ''


def job(args):
    label, gram, key, want = args
    return label, key, want, recognize(gram, key)


def main():
    os.makedirs(WORK, exist_ok=True)
    # キーごとの英語（単語は "#用法ID" のキーで、英語は見出し語）
    keys = sorted({k[2:] for k in CLIPS})
    text_of = {k: CLIPS['n|' + k][4] for k in keys}
    ok_keys = [k for k in keys if norm(text_of[k]) and all(w in DIC for w in norm(text_of[k]).split())]
    skipped = sorted({text_of[k] for k in keys} - {text_of[k] for k in ok_keys})
    all_gram = os.path.join(WORK, 'all.gram')
    open(all_gram, 'w').write('#JSGF V1.0;\ngrammar g;\npublic <s> = ' + ' | '.join('( ' + c + ' )' for c in sorted({norm(text_of[k]) for k in ok_keys})) + ';\n')
    words = [k for k in ok_keys if len(text_of[k].split()) == 1]
    word_gram = os.path.join(WORK, 'words.gram')
    open(word_gram, 'w').write('#JSGF V1.0;\ngrammar w;\npublic <s> = ' + ' | '.join(sorted({norm(text_of[k]) for k in words})) + ';\n')

    jobs = [('全候補', all_gram, v + '|' + k, norm(text_of[k])) for k in ok_keys for v in 'ns']
    jobs += [('単語どうし', word_gram, v + '|' + k, norm(text_of[k])) for k in words for v in 'ns']
    stat = {}
    miss = []
    with Pool(max(1, (os.cpu_count() or 2) - 1)) as pool:
        for label, key, want, got in pool.imap_unordered(job, jobs, chunksize=8):
            row = (label, kind(CLIPS[key][4]), 'ふつう' if key[0] == 'n' else 'ゆっくり')
            s = stat.setdefault(row, [0, 0])
            s[1] += 1
            s[0] += got == want
            if got != want:
                miss.append([*row, key[2:], CLIPS[key][4], got])
    print('候補にできなかった英語（辞書にない語を含む）:', skipped)
    for row in sorted(stat):
        c, n = stat[row]
        print('%s・%s・%s: %d / %d = %.0f%%' % (row + (c, n, 100 * c / n)))
    json.dump({'stat': {' '.join(k): v for k, v in stat.items()}, 'miss': miss}, open(os.path.join(WORK, 'result.json'), 'w'), ensure_ascii=False, indent=1)


if __name__ == '__main__':
    sys.exit(main())
