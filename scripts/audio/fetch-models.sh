#!/usr/bin/env bash
# AI音声を作るための素材（Kokoro のモデル・声・発音辞書）を、公開の配布元（npm・PyPI）から取ってきて、
# 中身が README の表の sha256 と同じかを確かめる。
#
#   bash scripts/audio/fetch-models.sh ~/kokoro
#   → その後 .venv/bin/python scripts/audio/build_audio.py --res ~/kokoro
set -euo pipefail

dest="${1:-$HOME/kokoro}"
mkdir -p "$dest"
dest="$(cd "$dest" && pwd)"
work="$(mktemp -d)"
trap 'rm -r "$work"' EXIT
cd "$work"

# Kokoro-82M（ONNX・q8）を分けて配っている npm パッケージ → つなげて1つのモデルに
npm pack --silent kokoro-q8-shards@1.0.0 kokoro-js@1.2.1 >/dev/null
mkdir shards js
tar xzf kokoro-q8-shards-1.0.0.tgz -C shards
tar xzf kokoro-js-1.2.1.tgz -C js
cat shards/package/kokoro-q8.part0.bin shards/package/kokoro-q8.part1.bin shards/package/kokoro-q8.part2.bin \
  shards/package/kokoro-q8.part3.bin shards/package/kokoro-q8.part4.bin shards/package/kokoro-q8.part5.bin > "$dest/model_quantized.onnx"
cp js/package/voices/af_heart.bin "$dest/af_heart.bin"

# 発音記号 → 番号の表（kokoro-onnx）と、アメリカ英語の発音辞書（misaki）
python3 -m pip download --quiet --no-deps --only-binary=:all: -d wheels kokoro-onnx==0.6.1 misaki==0.7.4
python3 - "$dest" <<'PY'
import glob, os, sys, zipfile
dest = sys.argv[1]
want = {'kokoro_onnx/config.json': 'config.json', 'misaki/data/us_gold.json': 'us_gold.json', 'misaki/data/us_silver.json': 'us_silver.json'}
found = set()
for whl in glob.glob('wheels/*.whl'):
    with zipfile.ZipFile(whl) as z:
        for name in z.namelist():
            if name in want:
                with open(os.path.join(dest, want[name]), 'wb') as f:
                    f.write(z.read(name))
                found.add(name)
missing = set(want) - found
if missing:
    sys.exit('見つからない素材: ' + ', '.join(sorted(missing)))
PY

cd "$dest"
sha256sum -c - <<'SUM'
fbae9257e1e05ffc727e951ef9b9c98418e6d79f1c9b6b13bd59f5c9028a1478  model_quantized.onnx
d583ccff3cdca2f7fae535cb998ac07e9fcb90f09737b9a41fa2734ec44a8f0b  af_heart.bin
5abb01e2403b072bf03d04fde160443e209d7a0dad49a423be15196b9b43c17f  config.json
363673890e892285fb12c66fc10591a520db4c427943ec14f18df5e5976a242d  us_gold.json
01e066a4af73c60b96178cd1c81862b812b811d1dac72d26a37b420597aa8859  us_silver.json
SUM
echo "素材をそろえました: $dest"
