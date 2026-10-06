#!/bin/bash
# Fine-tune Kraken from the BiblIA Hebrew model on the silver line pairs.
#   train_round.sh <name> <train list> [epochs] [start model]
set -e
cd "$(dirname "$0")"
M=${4:-$(ls /root/.local/share/htrmopo/*/BiblIA_01.mlmodel)}
ketos -d cpu --workers 4 --threads 4 train -f path -t "$2" -i "$M" --resize union --base-dir R \
  -N "${3:-12}" -q early --lag 3 -B 16 -p 0.9 -o "$1/ckpt" > "$1.log" 2>&1
