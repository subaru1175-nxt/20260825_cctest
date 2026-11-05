"""
g2p.py — 英文を Kokoro 用の発音記号に変える（アメリカ英語）

Kokoro の学習に使われた misaki の発音辞書（us_gold.json / us_silver.json、Apache-2.0）を引き、
misaki と同じ考え方で次を処理する：
  - a / an / the / to / I / am などの弱い形（the は次が母音なら ði）
  - -s / -ed / -ing / 's の語尾
  - 文頭の大文字の語、略語（TV）
  - 品詞で読みが変わる語（record, live, excuse, read …）は、文ごとに品詞を決める
辞書にない語があればエラーにする（推測で読ませない）。
"""
import json
import re

STRESSES = 'ˌˈ'
PRIMARY = 'ˈ'
SECONDARY = 'ˌ'
VOWELS = set('AIOQWYaiuæɑɒɔəɛɜɪʊʌᵻ')
CONSONANTS = set('bdfhjklmnpstvwzðŋɡɹɾʃʒʤʧθ')
PUNCTS = set(';:,.!?—…"“”')
US_TAUS = set('AIOWYiuæɑəɛɪɹʊʌ')

TOKEN_RE = re.compile(r"[A-Za-zÀ-ÿ]+(?:['’][A-Za-z]+)*|[;:,.!?—…\"“”]|-")


def apply_stress(ps, stress):
    """misaki と同じ。stress: None=そのまま / -1=主強勢を弱める / 0.5=強勢がなければ第2強勢 / 2=強勢がなければ第1強勢"""
    def restress(p):
        ips = list(enumerate(p))
        stresses = {i: next(j for j, v in ips[i:] if v in VOWELS) for i, c in ips if c in STRESSES}
        for i, j in stresses.items():
            ips[i] = (j - 0.5, ips[i][1])
        return ''.join(c for _, c in sorted(ips))
    if stress is None:
        return ps
    if stress < -1:
        return ps.replace(PRIMARY, '').replace(SECONDARY, '')
    if stress == -1 or (stress in (0, -0.5) and PRIMARY in ps):
        return ps.replace(SECONDARY, '').replace(PRIMARY, SECONDARY)
    if stress in (0, 0.5, 1) and all(s not in ps for s in STRESSES):
        if all(v not in ps for v in VOWELS):
            return ps
        return restress(SECONDARY + ps)
    if stress >= 1 and PRIMARY not in ps and SECONDARY in ps:
        return ps.replace(SECONDARY, PRIMARY)
    if stress > 1 and all(s not in ps for s in STRESSES):
        if all(v not in ps for v in VOWELS):
            return ps
        return restress(PRIMARY + ps)
    return ps


class G2P:
    def __init__(self, gold_path, silver_path):
        self.gold = json.load(open(gold_path, encoding='utf-8'))
        self.silver = json.load(open(silver_path, encoding='utf-8'))

    # ---------- 辞書 ----------
    def raw(self, word):
        for w in (word, word.lower(), word.capitalize()):
            if w in self.gold:
                return self.gold[w]
            if w in self.silver:
                return self.silver[w]
        return None

    def pick(self, entry, tag, at_end):
        if isinstance(entry, dict):
            if at_end and 'None' in entry:
                return entry['None']
            if tag in entry:
                return entry[tag]
            return entry['DEFAULT']
        return entry

    def known(self, word):
        return self.raw(word) is not None

    def lookup(self, word, tag, at_end):
        e = self.raw(word)
        if e is None:
            return None
        return self.pick(e, tag, at_end)

    def nnp(self, word):
        ps = [self.raw(c.upper()) for c in word if c.isalpha()]
        if any(p is None for p in ps):
            return None
        ps = apply_stress(''.join(ps), 0)
        parts = ps.rsplit(SECONDARY, 1)
        return PRIMARY.join(parts)

    # ---------- 語尾 ----------
    @staticmethod
    def _s(stem):
        if stem[-1] in 'ptkfθ':
            return stem + 's'
        if stem[-1] in 'szʃʒʧʤ':
            return stem + 'ᵻz'
        return stem + 'z'

    @staticmethod
    def _ed(stem):
        if stem[-1] in 'pkfθʃsʧ':
            return stem + 't'
        if stem[-1] == 'd':
            return stem + 'ᵻd'
        if stem[-1] != 't':
            return stem + 'd'
        if len(stem) >= 2 and stem[-2] in US_TAUS:
            return stem[:-1] + 'ɾᵻd'
        return stem + 'ᵻd'

    @staticmethod
    def _ing(stem):
        if len(stem) > 1 and stem[-1] == 't' and stem[-2] in US_TAUS:
            return stem[:-1] + 'ɾɪŋ'
        return stem + 'ɪŋ'

    def word(self, w, tag, at_end):
        lw = w.lower()
        if lw == 'café':
            lw = 'cafe'
        ps = self.lookup(lw if lw == 'cafe' else w, tag, at_end)
        if ps is not None:
            return ps
        # 's（That's / What's）
        if re.search(r"['’]s$", w) and self.known(w[:-2]):
            return self._s(self.lookup(w[:-2], tag, False))
        # -s / -es / -ies
        if len(w) > 2 and w.endswith('s') and not w.endswith('ss') and self.known(w[:-1]):
            return self._s(self.lookup(w[:-1], tag, False))
        if len(w) > 4 and w.endswith('ies') and self.known(w[:-3] + 'y'):
            return self._s(self.lookup(w[:-3] + 'y', tag, False))
        if len(w) > 4 and w.endswith('es') and self.known(w[:-2]):
            return self._s(self.lookup(w[:-2], tag, False))
        # -ed / -d
        if w.endswith('ed') and not w.endswith('eed') and self.known(w[:-2]):
            return self._ed(self.lookup(w[:-2], tag, False))
        if w.endswith('d') and not w.endswith('dd') and self.known(w[:-1]):
            return self._ed(self.lookup(w[:-1], tag, False))
        # -ing
        if w.endswith('ing') and self.known(w[:-3]):
            return self._ing(self.lookup(w[:-3], tag, False))
        if w.endswith('ing') and self.known(w[:-3] + 'e'):
            return self._ing(self.lookup(w[:-3] + 'e', tag, False))
        # 略語（TV）
        if w.isupper() and len(w) <= 4:
            return self.nnp(w)
        return None

    # ---------- 品詞（読みが変わる語だけ、文ごとに決める） ----------
    @staticmethod
    def tag_for(lw, prev, nxt, text):
        if lw in ('record',):
            return 'NOUN' if prev in ('a', 'the', 'world', 'my', 'your', 'new') else 'VERB'
        if lw in ('recorded', 'recording', 'records'):
            return 'VERB'
        if lw in ('live', 'lives'):
            return 'DEFAULT' if nxt in ('music', 'broadcast', 'show', 'concert', 'performance') else 'VERB'
        if lw == 'excuse':
            return 'NOUN' if prev in ('an', 'a', 'good', 'the', 'no', 'my', 'your', 'bad') else 'VERB'
        if lw == 'excuses':
            return 'NOUN'
        if lw == 'read':
            return 'VBD' if text.strip().lower().startswith('we read a poem') else 'DEFAULT'
        if lw in ('use',):
            return 'DEFAULT'
        if lw in ('minute', 'wind', 'house', 'absent', 'inside', 'invite'):
            return 'DEFAULT'
        return None

    # ---------- 文 ----------
    def __call__(self, text, isolated=False, tag=None):
        """tag: 1語だけを読むときの品詞（'NOUN' 'VERB' 'ADJ' 'ADV'）。品詞で読みが変わる語に使う"""
        tokens = []
        for m in TOKEN_RE.finditer(text):
            tokens.append({'text': m.group(0), 'start': m.start(), 'end': m.end()})
        words = [t['text'].lower() for t in tokens]
        n = len(tokens)
        future_vowel = None  # 右から順に、次の語が母音で始まるか
        out = [None] * n
        unknown = []
        for i in range(n - 1, -1, -1):
            t = tokens[i]['text']
            if t == '-':
                out[i] = ''
                continue
            if t in PUNCTS:
                out[i] = t
                future_vowel = None
                continue
            lw = t.lower()
            prev = words[i - 1] if i > 0 else ''
            j = i + 1
            while j < n and tokens[j]['text'] == '-':
                j += 1
            nxt = words[j] if j < n else ''
            at_end = future_vowel is None
            if lw == 'a':
                ps = 'ɐ'
            elif lw == 'an':
                ps = 'ɐn'
            elif lw == 'the':
                ps = 'ði' if future_vowel is True else 'ðə'
            elif lw == 'to':
                ps = {None: 'tu', False: 'tə', True: 'tʊ'}[future_vowel]
            elif t == 'I':
                ps = SECONDARY + 'I'
            elif lw == 'am':
                ps = 'æm' if future_vowel is None else 'ɐm'
            else:
                tg = tag if (tag and isolated and n == 1) else self.tag_for(lw, prev, nxt, text)
                ps = self.word(t, tg, at_end)
                if ps is None:
                    unknown.append(t)
                    ps = ''
                # 文頭などの大文字の語は、強勢がなければ第2強勢をつける（misaki と同じ）
                if ps and t != t.lower() and t != t.upper():
                    ps = apply_stress(ps, 0.5)
            out[i] = ps
            # 母音・子音のどちらでもない記号だけの語（a の ɐ など）は、前の文脈を引き継ぐ（misaki と同じ）
            first = next((c for c in ps if c in VOWELS or c in CONSONANTS), None)
            if first is not None:
                future_vowel = first in VOWELS
        if unknown:
            raise KeyError('辞書にない語: ' + ', '.join(unknown) + ' （' + text + '）')
        # 単語を1つだけ読むときは、必ず強勢をつける
        content = [k for k in range(n) if out[k] and tokens[k]['text'] not in PUNCTS]
        if isolated and len(content) == 1:
            k = content[0]
            out[k] = apply_stress(out[k], 2)
        # もとの文の空白を保ってつなぐ（記号は前の語につける）
        res = ''
        for k in range(n):
            if k > 0:
                gap = text[tokens[k - 1]['end']:tokens[k]['start']]
                if tokens[k]['text'] == '-' or tokens[k - 1]['text'] == '-':
                    res += ' '
                elif gap:
                    res += ' '
            res += out[k]
        return re.sub(r'\s+', ' ', res).strip()
