#!/bin/bash
# Stage 1 of the Likkutei Sichos line model on one rented GPU pod with no
# network volume: the bundle comes from R2 and the results go back through
# the presigned links in urls.json, so no key is on the pod. Two starts side by
# side on the one GPU (the model is small; one run alone leaves it half idle):
# from the maftechos model (RebbeHub-kraken-V1) and from scratch. Each picks its best save on dev39 (1,500 vol 39 lines, other sichos
# than the test); then today's model and both bests are scored on test39.
cd /root/s1; mkdir -p out; exec > out/run.log 2>&1
url() { python3 -c "import json,sys; print(json.load(open('/root/s1/urls.json'))[sys.argv[1]])" "$1"; }
put() { curl -sSf --retry 3 -X PUT -T "$1" "$(url "$2")" > /dev/null; }
( while sleep 60; do put out/run.log run.log; done ) &
fail() { echo "failed: $1"; for n in maft scratch; do [ -f out/$n.log ] && put out/$n.log $n:log; done; put out/run.log run.log; echo > out/FAILED; put out/FAILED FAILED; sleep 3600; }
trap 'fail "line $LINENO"' ERR
set -eEuo pipefail
nvidia-smi
pip install -q "kraken==7.1.1"
curl -sSfL --retry 3 -o s1.tar "$(url get:s1.tar)"
curl -sSfL --retry 3 -o maft.safetensors "$(url get:maft)"
tar -xf s1.tar
train() {  # name, start option; its own errors are reported, not fatal to the other run
  set +e
  # run under a pseudo-terminal so kraken prints its progress bar into the log
  script -qfec "ketos -d cuda:0 --workers 6 --threads 2 train -f path -t s1_train.txt -e dev39.txt $2 --resize union --base-dir R \
    -o out/$1 -q early --lag 12 --min-epochs 3 -F 0.25 -B 32" out/$1.log > /dev/null 2>&1
  echo "$1 ended with $?"; ls -la out/$1
  put out/$1.log $1:log
  best=$(ls -t out/$1/best_*.safetensors 2>/dev/null | head -1)
  if [ -n "$best" ]; then cp "$best" out/$1_best.safetensors; put out/$1_best.safetensors $1:model; else echo "$1: no best model"; fi
}
export PYTORCH_CUDA_ALLOC_CONF=expandable_segments:True
progress() {  # every 2 minutes: each run's progress bar and its saves (round-score), and the GPU
  while sleep 120; do
    { date -u +%FT%TZ; nvidia-smi --query-gpu=utilization.gpu,memory.used --format=csv,noheader
      for n in maft scratch; do
        echo "== $n"; [ -f out/$n.log ] && tr '\r' '\n' < out/$n.log | sed 's/\x1b\[[0-9;]*[A-Za-z]//g' | grep -a "stage" | tail -1 | cut -c1-200
        ls out/$n 2>/dev/null | grep -E "ckpt|safetensors" | sort | tr '\n' ' '; echo
      done; } > out/progress.txt
    put out/progress.txt progress
  done
}
progress &
[ -n "${SKIP_BASE:-}" ] || { ketos -d cuda:0 test -f path --base-dir R -m maft.safetensors -e test39.txt > out/test_base.log 2>&1; put out/test_base.log test_base; }
train maft "-i maft.safetensors" & A=$!
train scratch "" & B=$!
wait $A $B || true
for n in maft scratch; do
  [ -f out/${n}_best.safetensors ] || continue
  ketos -d cuda:0 test -f path --base-dir R -m out/${n}_best.safetensors -e test39.txt > out/test_$n.log 2>&1 || true
  put out/test_$n.log test_$n
done
[ -f out/maft_best.safetensors ] || [ -f out/scratch_best.safetensors ] || fail 'no model'
echo done; put out/run.log run.log
echo > out/DONE; put out/DONE DONE
sleep 3600
