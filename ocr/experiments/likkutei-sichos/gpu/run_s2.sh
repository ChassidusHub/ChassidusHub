#!/bin/bash
# Stage 2 of the Likkutei Sichos line model (the maftechos start is dropped): the real vols 30-38 lines (132k,
# labels aligned from the Chabad Library's typed text) plus the stage-1 fake
# lines (23% of the mix), on one rented GPU with no network volume. The bundle
# comes from R2 and results go back through presigned links, so no key is on
# the pod. Lanes (lanes.txt: name|ketos args) train side by side on the one GPU, each with a cosine schedule over a fixed number of rounds, scored on
# dev39; each lane's newest save is copied to R2 every 10 minutes and a
# restarted pod resumes from it. At the end each lane's best model reads the
# 3,000 test39 lines and the reading (with the letter probabilities, for the
# word model) goes back to R2 to be scored.
cd /root/s2; mkdir -p out; exec > out/run.log 2>&1
url() { python3 -c "import json,sys; print(json.load(open('/root/s2/urls.json'))[sys.argv[1]])" "$1"; }
put() { curl -sSf --retry 3 -X PUT -T "$1" "$(url "$2")" > /dev/null; }
get() { curl -sSfL --retry 3 -o "$2" "$(url "get:$1")"; }
( while sleep 60; do put out/run.log run.log; done ) &
fail() { echo "failed: $1"; put out/run.log run.log; echo > out/FAILED; put out/FAILED FAILED; sleep 3600; }
trap 'fail "line $LINENO"' ERR
set -eEuo pipefail
nvidia-smi
pip install -q "kraken==7.1.1"
get s2.tar s2.tar; tar -xf s2.tar; rm s2.tar
get ppm ppm.safetensors
# Everything is sized to the machine it lands on: CPUs from the container's
# own limit (nproc can show the whole host), the batch from the GPU's memory
# (32 lines per 24 GB), and the learning rate grown with the square root of
# the batch so a bigger card trains the same way, only faster.
cpus() {  # the container's real CPU share: cgroup v2, cgroup v1, RunPod's variable, then nproc
  local q p
  if [ -r /sys/fs/cgroup/cpu.max ] && read -r q p < /sys/fs/cgroup/cpu.max && [ "$q" != max ]; then echo $((q / p)); return; fi
  if [ -r /sys/fs/cgroup/cpu/cpu.cfs_quota_us ] && q=$(cat /sys/fs/cgroup/cpu/cpu.cfs_quota_us) && [ "$q" -gt 0 ]; then
    echo $((q / $(cat /sys/fs/cgroup/cpu/cpu.cfs_period_us))); return; fi
  [ -n "${RUNPOD_CPU_COUNT:-}" ] && { echo "$RUNPOD_CPU_COUNT"; return; }
  nproc
}
memgb() {  # the container's memory limit in GB, else the machine's
  local m
  for f in /sys/fs/cgroup/memory.max /sys/fs/cgroup/memory/memory.limit_in_bytes; do
    [ -r $f ] && m=$(cat $f) && [ "$m" != max ] && [ "$m" -lt 4000000000000 ] && { echo $((m / 1073741824)); return; }
  done
  awk '/MemTotal/ {print int($2 / 1048576)}' /proc/meminfo
}
NCPU=$(cpus); MEM=$(memgb); GMEM=$(nvidia-smi --query-gpu=memory.total --format=csv,noheader,nounits | head -1)
# Loaders: all CPUs but two, at most one per 2 GB of memory (each loads its
# own copy of torch), and at most 16, which already outruns one GPU.
WORK=$(( NCPU - 2 ))
if (( WORK > MEM / 2 )); then WORK=$(( MEM / 2 )); fi
if (( WORK > 16 )); then WORK=16; fi
if (( WORK < 2 )); then WORK=2; fi
# PP-OCRv6 medium pads every line to 4080 px at 128 px high: about 3 GB of
# GPU memory per line in a batch (a 24 GB card ran out at 16). The batch is
# what fits, and gradients are summed over steps to an effective 32 lines,
# so every card trains the same way at the base model's learning rate.
B=$(( GMEM / 3072 / 4 * 4 )); if (( B < 4 )); then B=4; fi; if (( B > 32 )); then B=32; fi
ACC=$(( (32 + B - 1) / B ))
LR=3e-4
echo "machine: $NCPU cpus, $MEM GB memory, $GMEM MiB GPU -> $WORK loaders, batch $B x $ACC steps, lr $LR"
# One lane with the whole GPU: the new PP-OCRv6 medium base model fine-tuned.
cat > lanes.txt <<L
ppm|--precision bf16-mixed --threads 4 --workers $WORK train --arch ppocrv6 -i ppm.safetensors --resize new -u NFD --max-width 4080 --optimizer AdamW+Muon -r $LR --warmup 1000 --schedule cosine --cos-max 10 --cos-min-lr 1e-6 -q fixed -N 10 -F 0.5 -B $B --accumulate-grad-batches $ACC --augment
L
export PYTORCH_CUDA_ALLOC_CONF=expandable_segments:True
# Lines compiled once into arrow files, so the loaders keep the GPU fed.
[ -f train.arrow ] || ketos --workers $WORK compile -f path -o train.arrow -F s2_train.txt > out/compile.log 2>&1
[ -f dev.arrow ] || ketos --workers $WORK compile -f path -o dev.arrow -F dev39.txt >> out/compile.log 2>&1
put out/compile.log compile
echo train.arrow > tr_list.txt; echo dev.arrow > dev_list.txt
LANES=$(cut -d'|' -f1 lanes.txt)

saver() {  # every 10 minutes: each lane's newest save to R2, for resuming
  while sleep 600; do
    for n in $LANES; do
      last=$(ls -t out/$n/*.ckpt 2>/dev/null | head -1)
      [ -n "$last" ] && put "$last" "$n:ckpt" && echo "saved $n $(basename $last)"
    done
  done
}
progress() {  # every 2 minutes: each lane's progress bar and saves, and the GPU
  while sleep 120; do
    { date -u +%FT%TZ; nvidia-smi --query-gpu=utilization.gpu,memory.used --format=csv,noheader
      for n in $LANES; do
        echo "== $n"; [ -f out/$n.log ] && tr '\r' '\n' < out/$n.log | sed 's/\x1b\[[0-9;]*[A-Za-z]//g' | grep -a "stage" | tail -1 | cut -c1-200
        ls out/$n 2>/dev/null | grep -E "ckpt|safetensors" | sort | tail -6 | tr '\n' ' '; echo
      done; } > out/progress.txt
    put out/progress.txt progress
  done
}
lane() {  # name, args; a lane's failure is reported, not fatal to the others
  set +eE; trap - ERR
  local n=$1 args=$2 res=""
  mkdir -p out/$n
  if curl -sSfL -o out/$n/resume.ckpt "$(url "get:$n:ckpt")" 2>/dev/null; then res="--resume out/$n/resume.ckpt"; echo "$n resumes"; fi
  local pre="" b=$B acc=$ACC
  for try in 1 2 3 4 5; do
    script -qfec "$pre ketos -d cuda:0 $args -t tr_list.txt -e dev_list.txt -f binary --base-dir R -o out/$n $res" out/$n.log > /dev/null 2>&1
    rc=$?; echo "$n try $try ended with $rc"; put out/$n.log "$n:log"
    [ $rc = 0 ] && break
    cp out/$n.log out/$n.try$try.log
    if grep -aqE "OutOfMemoryError|CUDA out of memory" out/$n.log && (( b > 2 )); then
      # Too big a batch for this card: half the batch, twice the steps summed.
      args=${args/-B $b --accumulate-grad-batches $acc /-B $((b / 2)) --accumulate-grad-batches $((acc * 2)) }
      b=$((b / 2)); acc=$((acc * 2)); echo "$n: out of GPU memory, retrying at batch $b x $acc"
    elif [ -z "$pre" ] && ! grep -aqE "OutOfMemoryError|CUDA out of memory" out/$n.log; then
      # Kraken compiles the PP-OCRv6 network (torch.compile); if that is what
      # broke, train without compiling, slower but safe.
      echo "$n: failed, retrying without torch.compile"; pre="TORCHDYNAMO_DISABLE=1"
    else break; fi
    res=""; rm -f out/$n/*.ckpt
  done
  best=$(ls -t out/$n/best_*.safetensors 2>/dev/null | head -1)
  if [ -n "$best" ]; then
    cp "$best" out/${n}_best.safetensors; put out/${n}_best.safetensors "$n:model"
    python3 evalx.py out/${n}_best.safetensors test39.txt out/${n}_test.npz --device cuda:0 > out/${n}_eval.log 2>&1
    put out/${n}_test.npz "$n:test"; put out/${n}_eval.log "$n:eval"
  else echo "$n: no best model"; fi
}
saver & progress &
pids=()
while IFS='|' read -r n args; do lane "$n" "$args" & pids+=($!); done < lanes.txt
wait "${pids[@]}" || true
ls out/*_best.safetensors > /dev/null 2>&1 || fail 'no model'
echo done; put out/run.log run.log
echo > out/DONE; put out/DONE DONE
sleep 3600
