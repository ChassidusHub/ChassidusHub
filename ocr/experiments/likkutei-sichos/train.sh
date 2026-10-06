#!/bin/bash
# Fine-tune the index model (RebbeHub-kraken-V1) on the silver body-text pairs.
#   train.sh <name> <train list> <validation list> [epochs] [start model]
set -e
cd "$(dirname "$0")/.."
M=${5:-/mnt/project-files/maftechos/model/kraken-maftechos-r4.safetensors}
mkdir -p "models/$1"
ketos -d cpu --workers 4 --threads 4 train -f path -t "$2" -e "$3" -i "$M" --resize union --base-dir R \
  -N "${4:-4}" -q early --lag 2 -B 16 -o "models/$1/ckpt" > "models/$1.log" 2>&1
