#!/bin/bash
# Font stage v2 training pod: fetches the word samples (facedata.py shards) and
# facenet2.py, trains on the GPU, and puts the model and log in R2 as each epoch
# ends, so a lost pod costs one epoch. Progress every minute; FAILED on error,
# never a silent DONE: DONE is written only after the model is in R2.
D=${TDIR:-/root/f}; mkdir -p "$D/out"; cd "$D"
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
    { date -u +%FT%TZ; nvidia-smi --query-gpu=utilization.gpu,memory.used --format=csv,noheader 2>/dev/null; tail -n 3 out/train.log 2>/dev/null; } > out/progress 2>/dev/null
    put out/progress progress; put out/run.log run.log
    # the newest model, when an epoch has saved one since the last minute
    [ out/facenet2.pt -nt out/.sent ] 2>/dev/null && { put out/facenet2.pt model && touch out/.sent; }
  done ) &
fail() { echo "failed: $1"; put out/run.log run.log; put out/train.log trainlog 2>/dev/null; echo > out/FAILED; put out/FAILED FAILED; sleep ${HOLD:-600}; exit 1; }
trap 'fail "line $LINENO"' ERR
set -eEuo pipefail
nvidia-smi
echo "pod ${RUNPOD_POD_ID:-?} start $(date -u +%FT%TZ)"
python3 -c "import torch, os; print('torch', torch.__version__, 'cuda', torch.cuda.is_available()); assert torch.cuda.is_available() or os.environ.get('DRY')"
pip show scikit-image > /dev/null 2>&1 || pip install -q scikit-image
get facenet2 facenet2.py
shards=()
for s in ${SHARDS:-face23_a face23_b face1 real39}; do
  url "get:$s" > /dev/null 2>&1 || { echo "shard $s: no url, skipped"; continue; }
  get "$s" "$s.npz"; shards+=("$s.npz"); echo "shard $s: $(stat -c %s "$s.npz") bytes"
done
[ ${#shards[@]} -gt 0 ] || fail "no shards"
# Several trainings share the one GPU (the net is small): VARIANTS names them, each
# "<name>:<shards it uses, comma-separated>" ("all" = every shard fetched).
pids=()
for v in ${VARIANTS:-all:all}; do
  name=${v%%:*}; use=${v#*:}
  if [ "$use" = all ]; then sel=("${shards[@]}"); else IFS=, read -ra sel <<< "$use"; sel=("${sel[@]/%/.npz}"); fi
  ( trap - ERR; set +eE +o pipefail
    python3 facenet2.py train out/$name.pt "${sel[@]}" --epochs ${EPOCHS:-6} > out/$name.train.log 2>&1
    echo "variant $name: exit $?" ) &
  pids+=($!)
done
wait "${pids[@]}" || true
cat out/*.train.log > out/train.log
ok=0
for v in ${VARIANTS:-all:all}; do
  name=${v%%:*}
  [ -f out/$name.pt ] || { echo "variant $name: no model"; continue; }
  put out/$name.pt "model:$name"; put out/$name.train.log "trainlog:$name"; ok=$((ok + 1))
done
[ $ok -gt 0 ] || fail "no model written"
put out/run.log run.log
echo "done $(date -u +%FT%TZ)"; echo > out/DONE; put out/DONE DONE
sleep ${HOLD:-300}
