#!/bin/bash
# Reading pod: every sicha PDF of the given volumes through the whole chain
# (readsicha.py: layout, lines on the GPU, stars, faces, assembly) with several
# workers sharing the GPU; each volume's results go to R2 as a tar when its last
# sicha is done, so a lost pod costs one volume. Progress every minute, FAILED on
# error, DONE only after everything is in R2.
D=${TDIR:-/root/r}; mkdir -p "$D/out"; cd "$D"
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
    { date -u +%FT%TZ; nvidia-smi --query-gpu=utilization.gpu,memory.used --format=csv,noheader 2>/dev/null
      echo "sichos done: $(cat out/w*.log 2>/dev/null | grep -c ' pages ') failed: $(cat out/w*.log 2>/dev/null | grep -c FAILED)"
      tail -q -n 1 out/w*.log 2>/dev/null; } > out/progress 2>/dev/null
    put out/progress progress; put out/run.log run.log
  done ) &
fail() { echo "failed: $1"; put out/run.log run.log; echo > out/FAILED; put out/FAILED FAILED; sleep ${HOLD:-600}; exit 1; }
trap 'fail "line $LINENO"' ERR
set -eEuo pipefail
nvidia-smi
echo "pod ${RUNPOD_POD_ID:-?} start $(date -u +%FT%TZ)"
pip show kraken 2>/dev/null | grep -q "^Version: 7.1.1$" || pip install -q "kraken==7.1.1"
pip show scikit-image > /dev/null 2>&1 || pip install -q scikit-image pymupdf scipy
python3 -c "import torch, kraken, pymupdf, skimage; print('torch', torch.__version__, 'cuda', torch.cuda.is_available()); assert torch.cuda.is_available()"
get code code.tar && mkdir -p code && tar -xf code.tar -C code && rm code.tar
get reader models/reader.safetensors
get facenet2 models/facenet2.pt
get pdfs pdfs.tar && mkdir -p pdf && tar -xf pdfs.tar -C pdf && rm pdfs.tar
ls pdf | wc -l | xargs echo "sicha pdfs:"
export FACENET2=$D/models/facenet2.pt
# workers share the GPU: the reader is small (64 MB), the page work is CPU; one worker per 2 CPUs
cpus=$(nproc); W=${WORKERS:-$(( cpus / 2 > 12 ? 12 : (cpus / 2 < 2 ? 2 : cpus / 2) ))}
echo "workers: $W of $cpus cpus"
ls pdf/*.pdf | sort > out/all.txt
pids=()
for w in $(seq 0 $((W - 1))); do
  ( trap - ERR; set +eE +o pipefail
    awk -v w=$w -v W=$W 'NR % W == w' out/all.txt | xargs -r python3 code/readsicha.py models/reader.safetensors --out read --device cuda:0 --threads 2 > out/w$w.log 2>&1
    echo "worker $w: exit $?" >> out/w$w.log ) &
  pids+=($!)
done
# a volume's tar goes up as soon as all its sichos are read (or failed)
( trap - ERR; set +eE +o pipefail
  for v in $(ls pdf | cut -d_ -f1 | sort -u); do :; done
  while true; do
    for v in $(ls pdf | cut -d_ -f1 | sort -u); do
      [ -f out/.sent_$v ] && continue
      n=$(ls pdf/${v}_*.pdf | wc -l); d=$(cat out/w*.log 2>/dev/null | grep -E "^${v}_[0-9]+\.pdf .*(pages|FAILED)" | wc -l)
      if [ "$d" -ge "$n" ]; then
        tar -cf out/read_$v.tar -C read $(cd read && ls ${v}_*.json 2>/dev/null) $(cd read && ls lay/${v}_*.json 2>/dev/null | sed 's#^#./#') 2>/dev/null
        put out/read_$v.tar "read:$v" && touch out/.sent_$v && echo "volume $v: $d sichos put to R2 $(date -u +%H:%M)"
      fi
    done
    sleep 30
    [ -f out/.workers_done ] && break
  done ) &
sender=$!
wait "${pids[@]}" || true
touch out/.workers_done
wait $sender || true
cat out/w*.log > out/workers.log; put out/workers.log workers
echo "done $(date -u +%FT%TZ): $(grep -c ' pages ' out/workers.log) sichos, $(grep -c FAILED out/workers.log) failed"
put out/run.log run.log; echo > out/DONE; put out/DONE DONE
sleep ${HOLD:-300}
