#!/bin/bash
# Test pod: every kept save of run 3 reads the 4,500 vol 39 scoring lines on the
# GPU; each reading (npz) goes to R2 as it lands. Progress every minute, the log
# on failure, DONE at the end. Nothing is trained here.
D=${TDIR:-/root/t}; mkdir -p "$D/out"; cd "$D"
url() { python3 -c "import json,sys; print(json.load(open(sys.argv[2] + '/urls.json'))[sys.argv[1]])" "$1" "$D"; }
put() { curl -sSf --retry 3 -X PUT -T "$1" "$(url "$2")" > /dev/null; }
get() {
  local tries=0 rc u want have
  u=$(url "get:$1")
  until curl -sSfL --retry 3 -C - -o "$2" "$u"; do
    rc=$?
    want=$(curl -sSL -r 0-0 -o /dev/null -D - "$u" 2>/dev/null | tr -d '\r' | awk 'tolower($1)=="content-range:" {split($2, a, "/"); n=a[2]} END {print n}')
    have=$(stat -c %s "$2" 2>/dev/null || echo 0)
    [ -n "$want" ] && [ "$have" = "$want" ] && return 0
    tries=$((tries + 1)); (( tries >= 8 )) && { echo "get $1: gave up after $tries tries (curl $rc, $have of $want bytes)"; return 1; }
    [ $rc = 33 ] && rm -f "$2"
    echo "get $1: curl $rc at $have of $want bytes, trying again ($tries)"; sleep 10
  done
}
exec > >(tee -a out/run.log) 2>&1
( trap - ERR; set +eE; while sleep ${LOG_EVERY:-60}; do
    { date -u +%FT%TZ; nvidia-smi --query-gpu=utilization.gpu,memory.used --format=csv,noheader 2>/dev/null; cat out/saves.txt 2>/dev/null; tail -n 2 out/*.evlog 2>/dev/null; } > out/progress 2>/dev/null
    put out/progress progress; put out/run.log run.log
  done ) &
fail() { echo "failed: $1"; put out/run.log run.log; echo > out/FAILED; put out/FAILED FAILED; sleep ${HOLD:-600}; exit 1; }
trap 'fail "line $LINENO"' ERR
set -eEuo pipefail
nvidia-smi
echo "pod ${RUNPOD_POD_ID:-?} start $(date -u +%FT%TZ)"
pip show kraken 2>/dev/null | grep -q "^Version: 7.1.1$" || pip install -q "kraken==7.1.1"
python3 -c "import torch, kraken; print('torch', torch.__version__, 'cuda', torch.cuda.is_available())"
get evalx evalx.py
[ -f dev39.txt ] || { get test39.tar test39.tar; tar -xf test39.tar; rm test39.tar; }
cat dev39.txt test39.txt > out/full.txt
echo "$(wc -l < out/full.txt) scoring lines"
: > out/saves.txt
one() {  # one save: GPU read, CPU fallback, result to R2
  local j=$1 m=out/keep_$1.safetensors
  trap - ERR; set +eE +o pipefail
  get "keep:$j" $m || { echo "save $j: not in R2, skipped"; return 0; }
  echo "$j $(md5sum < $m | cut -c1-8) start $(date -u +%H:%M)" >> out/saves.txt
  if ! python3 evalx.py $m out/full.txt out/t$j.npz --device cuda:0 --probs ${PROBS:-top5} > out/$j.evlog 2>&1; then
    echo "save $j: GPU read failed, see log"; put out/$j.evlog "log:$j"; tail -n 5 out/$j.evlog
    python3 evalx.py $m out/full.txt out/t$j.npz --threads 4 --probs ${PROBS:-top5} >> out/$j.evlog 2>&1 || { put out/$j.evlog "log:$j"; echo "save $j: failed on CPU too"; return 0; }
  fi
  put out/t$j.npz "test:$j"; put out/$j.evlog "log:$j"
  echo "$j done $(date -u +%H:%M)" >> out/saves.txt; put out/saves.txt saves
  rm -f $m
}
# all the saves at once: the GPU holds nine 64 MB models easily, the lines are small
pids=()
for j in $(seq 0 ${NSAVES:-8}); do
  url "get:keep:$j" > /dev/null 2>&1 || continue
  one $j & pids+=($!)
done
wait "${pids[@]}" || true
put out/saves.txt saves; put out/run.log run.log
echo "done $(date -u +%FT%TZ)"; echo > out/DONE; put out/DONE DONE
sleep ${HOLD:-300}
