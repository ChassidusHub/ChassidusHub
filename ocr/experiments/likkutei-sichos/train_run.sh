#!/bin/bash
# One training run that survives crashes: kraken saves and scores every quarter
# round; every save is copied to the shared project folder; if ketos stops
# before finishing, it is started again from the newest save.
#   train_run.sh <name> <train list> <dev list> [start model; empty = from scratch]
cd /home/user/lsdata
NAME=$1; TRAIN=$2; DEV=$3; START=$4
OUT=models/$NAME; SHARE=/mnt/project-files/ls-ocr/checkpoints/$NAME
mkdir -p $OUT $SHARE
sync_out() { cp -u $OUT/*.ckpt $OUT/*.safetensors $SHARE/ 2>/dev/null; }
for try in $(seq 1 20); do
  [ -f $OUT/DONE ] && break
  LAST=$(ls -t $OUT/*.ckpt $SHARE/*.ckpt 2>/dev/null | head -1)
  if [ -n "$LAST" ]; then FROM="--resume $LAST"; elif [ -n "$START" ]; then FROM="-i $START"; else FROM=""; fi
  echo "=== start $try $(date -u +%FT%TZ) $FROM"
  ( while sleep 120; do sync_out; done ) & SYNC=$!
  ketos -d cpu --workers 2 --threads 4 train -f path -t $TRAIN -e $DEV $FROM --resize union --base-dir R \
    -o $OUT -q early --lag 12 --min-epochs 3 -N 20 -F 0.25 -B 16
  CODE=$?
  kill $SYNC; sync_out
  if [ $CODE -eq 0 ]; then touch $OUT/DONE; echo "=== done $(date -u +%FT%TZ)"; break; fi
  echo "=== stopped with $CODE, restarting"; sleep 30
done
