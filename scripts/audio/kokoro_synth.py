"""
kokoro_synth.py — Kokoro-82M（ONNX, Apache-2.0）で音声を作る
入力は g2p.py の発音記号。出力は 24kHz の float32 波形。
"""
import json
import numpy as np
import onnxruntime as ort

SAMPLE_RATE = 24000


class Kokoro:
    def __init__(self, model_path, vocab_path, voice_path):
        opts = ort.SessionOptions()
        opts.intra_op_num_threads = 4
        self.sess = ort.InferenceSession(model_path, sess_options=opts, providers=['CPUExecutionProvider'])
        self.vocab = json.load(open(vocab_path, encoding='utf-8'))['vocab']
        self.voice = np.fromfile(voice_path, dtype=np.float32).reshape(-1, 256)

    def tokens(self, phonemes):
        missing = sorted({c for c in phonemes if c not in self.vocab})
        if missing:
            raise ValueError('対応表にない記号: ' + ''.join(missing))
        return [self.vocab[c] for c in phonemes]

    def __call__(self, phonemes, speed=1.0):
        ids = self.tokens(phonemes)
        if len(ids) > 510:
            raise ValueError('発音記号が長すぎる')
        style = self.voice[len(ids)][None, :]
        out = self.sess.run(None, {
            'input_ids': np.array([[0] + ids + [0]], dtype=np.int64),
            'style': style.astype(np.float32),
            'speed': np.array([speed], dtype=np.float32),
        })[0]
        return out.reshape(-1)
