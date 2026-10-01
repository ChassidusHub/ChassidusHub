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
D=${S2DIR:-/root/s2}; cd $D; mkdir -p out; exec >> out/run.log 2>&1
# @URLS@ (a script sent by remote control may carry a fresh urls.json here)
url() { python3 -c "import json,sys; print(json.load(open(sys.argv[2] + '/urls.json'))[sys.argv[1]])" "$1" "$D"; }
put() { curl -sSf --retry 3 -X PUT -T "$1" "$(url "$2")" > /dev/null; }
get() { curl -sSfL --retry 3 -o "$2" "$(url "get:$1")"; }
( trap - ERR; set +eE; while sleep ${LOG_EVERY:-60}; do put out/run.log run.log; done ) & S0=$!
fail() { echo "failed: $1"; put out/run.log run.log; echo > out/FAILED; put out/FAILED FAILED; sleep ${HOLD:-3600}; }
trap 'fail "line $LINENO"' ERR
set -eEuo pipefail
nvidia-smi
pip show kraken 2>/dev/null | grep -q "^Version: 7.1.1$" || pip install -q "kraken==7.1.1"
python3 -c "import rapidfuzz" 2>/dev/null || pip install -q rapidfuzz  # for the error reports
[ -f s2_train.txt ] || { get s2.tar s2.tar; tar -xf s2.tar; rm s2.tar; }
[ -f ppm.safetensors ] || get ppm ppm.safetensors
get evalx evalx.py  # newer than the copy in the bundle
# Width groups (patch/sitecustomize.py): batches of lines of like width, each
# padded only to its own width, instead of every line to 4,080 px.
mkdir -p patch; get patch patch/sitecustomize.py
# Set when a new pod takes over a run; a switch-over's own choice (written by
# the watcher before it hands over) wins over the pod's start setting.
[ -n "${RESUME_MODE:-}" ] && [ ! -f out/RESUME_MODE ] && echo "$RESUME_MODE" > out/RESUME_MODE
export PYTHONPATH=$D/patch
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
# PP-OCRv6 medium at 128 px high and up to 4,080 px wide: a 24 GB card ran
# out at 16 lines, a 48 GB card used 20 GB at 12; width groups keep most
# batches far narrower, and a batch that still runs out is halved. The batch is
# what fits, and gradients are summed over steps to an effective 32 lines,
# so every card trains the same way at the base model's learning rate.
B=$(( GMEM / 1800 / 4 * 4 )); if (( B < 4 )); then B=4; fi; if (( B > 32 )); then B=32; fi
ACC=$(( (32 + B - 1) / B ))
LR=3e-4
echo "machine: $NCPU cpus, $MEM GB memory, $GMEM MiB GPU -> $WORK loaders, batch $B x $ACC steps, lr $LR"
# One lane with the whole GPU: the new PP-OCRv6 medium base model fine-tuned.
cat > lanes.txt <<L
ppm|--precision bf16-mixed --threads 4 --workers $WORK train --arch ppocrv6 -i ppm.safetensors --resize new -u NFD --max-width 4080 --optimizer AdamW+Muon -r $LR --warmup 300 --schedule cosine --cos-max 3 --cos-min-lr 1e-6 -q fixed -N 3 -F 0.25 -B $B --accumulate-grad-batches $ACC --augment
L
export PYTORCH_CUDA_ALLOC_CONF=expandable_segments:True
# The typed text of the real lines was matched to the printed lines by text
# alone, and in two ways it is wrong where the scan is clear: a word broken at
# a makaf typed whole on one line, and footnote marks typed that the line
# doesn't print. Once a model is good enough (99.5% on dev), it reads every
# real line and relabel.py takes from its reading only those kinds of
# differences, where it is sure; the old labels stay as .gt.orig.txt. Done
# once per pod (out/RELABELED_v2), before the lines are compiled.
relabel() {
  curl -sSfL -o out/reader.ckpt "$(url get:ppm:ckpt)" || { echo "relabel: no saved model, skipped"; return 0; }
  ketos convert -o out/reader.safetensors out/reader.ckpt > /dev/null
  { grep '^pairs/' s2_train.txt; cat dev39.txt test39.txt; } | sort -u > out/real.txt
  local k=$(( WORK / 2 )); if (( k > 8 )); then k=8; fi; if (( k < 1 )); then k=1; fi
  echo "relabel: $k readers over $(wc -l < out/real.txt) real lines"
  local rp=() sum; sum=$(md5sum < out/reader.ckpt | cut -c1-32)
  # The same model read every line before (only the rules changed): reuse its readings.
  if [ "$(cat out/reader.md5 2>/dev/null)" = "$sum" ] && (( $(cat out/read_*.jsonl 2>/dev/null | wc -l) >= $(wc -l < out/real.txt) )); then
    echo "relabel: same model as last time, reusing its readings"; k=0
  else rm -f out/read_*.jsonl out/read_*.log; fi
  for i in $(seq 0 $((k - 1))); do
    python3 relabel/relabel_read.py out/reader.safetensors out/real.txt out/read_$i.jsonl --shard $i/$k --device ${RELABEL_DEVICE:-cuda:0} > out/read_$i.log 2>&1 & rp+=($!)
  done
  (( ${#rp[@]} )) && wait "${rp[@]}"; echo "$sum" > out/reader.md5
  local got; got=$(cat out/read_*.jsonl | wc -l)
  # Only a full reading is used: a reader that died leaves its lines unread.
  (( got * 100 >= $(wc -l < out/real.txt) * 99 )) || { echo "relabel: only $got lines read, labels left as they are"; return 1; }
  python3 relabel/relabel.py 'out/read_*.jsonl' out/relabel.tsv --write | tee -a out/relabel.log
  gzip -kf out/relabel.tsv; put out/relabel.tsv.gz relabel
  rm -f train.arrow dev.arrow; touch out/RELABELED_v2
}
# The label fixer and the error report code (relabel/: relabel.py,
# relabel_read.py, errlog.py, score.py, dev300.txt).
url get:relabel > /dev/null 2>&1 && get relabel relabel.tar && tar -xf relabel.tar || true
LANES=$(cut -d'|' -f1 lanes.txt)

# The helpers below run beside the training and must never stop the run: a
# check that finds nothing yet (no save, no progress line) is not an error.
saver() {  # every 10 minutes: each lane's newest save to R2, for resuming
  trap - ERR; set +eE +o pipefail
  local sent=""
  while sleep ${SAVE_EVERY:-600}; do
    for n in $LANES; do
      last=$(ls -t out/$n/*.ckpt 2>/dev/null | head -1)
      [ -n "$last" ] && [[ " $sent " != *" $last "* ]] || continue  # each save goes up once
      put "$last" "$n:ckpt" && echo "saved $n $(basename $last)" && sent="$sent $last"
    done
  done
}
progress() {  # every 2 minutes: each lane's progress bar and saves, and the GPU
  trap - ERR; set +eE +o pipefail
  while sleep ${PROG_EVERY:-120}; do
    { date -u +%FT%TZ; nvidia-smi --query-gpu=utilization.gpu,memory.used --format=csv,noheader
      ls out/read_*.log > /dev/null 2>&1 && [ ! -f out/RELABELED_v2 ] && tail -qn1 out/read_*.log
      for n in $LANES; do
        echo "== $n"; [ -f out/$n.log ] && tr '\r' '\n' < out/$n.log | sed 's/\x1b\[[0-9;]*[A-Za-z]//g' | grep -a "stage" | tail -1 | cut -c1-200
        ls out/$n 2>/dev/null | grep -E "ckpt|safetensors" | sort | tail -6 | tr '\n' ' '; echo
      done; } > out/progress.txt
    put out/progress.txt progress
  done
}
reporter() {  # each new save of the first lane: its error report on 300 dev lines, to R2 at once
  trap - ERR; set +eE +o pipefail
  [ -f relabel/errlog.py ] || return 0
  local n=${LANES%% *} done=""
  mkdir -p out/errors
  while sleep ${REPORT_EVERY:-30}; do
    last=$(ls -t out/$n/checkpoint_*.ckpt 2>/dev/null | head -1)
    [ -n "$last" ] && [ "$last" != "$done" ] && [ "$last" -nt out/$n.started ] || continue
    sleep 5  # let the save finish writing
    name=$(basename "$last" .ckpt | sed 's/^checkpoint_/s2-/')
    ketos convert -o out/rep.safetensors "$last" > /dev/null 2>&1 &&
      python3 evalx.py out/rep.safetensors relabel/dev300.txt out/rep.npz --device ${REPORT_DEVICE:-cuda:0} > out/rep.log 2>&1 &&
      (cd out && python3 ../relabel/errlog.py rep.npz "$name" --dir errors) >> out/rep.log 2>&1 &&
      put out/errors/$name.txt errors && put out/errors/history.jsonl history && echo "report $name: $(tail -1 out/errors/history.jsonl | cut -c1-150)"
    done=$last
  done
}
lane() {  # name, args; a lane's failure is reported, not fatal to the others
  set +eE; trap - ERR
  local n=$1 args=$2 res=""
  [ -f out/RESTARTING ] && return  # a switch-over came before training began
  mkdir -p out/$n
  if curl -sSfL -o out/$n/resume.ckpt "$(url "get:$n:ckpt")" 2>/dev/null; then
    if [ "$(cat out/RESUME_MODE 2>/dev/null)" = weights ]; then
      # A changed recipe keeps the learned weights but starts its own schedule.
      local st=out/$n/start.safetensors
      ketos convert -o $st out/$n/resume.ckpt && args=${args/-i ppm.safetensors/-i $st}
      echo "$n starts from the saved weights with the new recipe"
    else res="--resume out/$n/resume.ckpt"; echo "$n resumes"; fi
  fi
  local env="KRAKEN_WIDTH_GROUPS=1" b=$B acc=$ACC
  for try in 1 2 3 4 5 6 7 8 9; do
    touch out/$n.started
    script -qfec "echo \$\$ > out/$n.pid; exec env $env ketos -d cuda:0 $args -t tr_list.txt -e dev_list.txt -f binary --base-dir R -o out/$n $res" out/$n.log > /dev/null 2>&1
    rc=$?; echo "$n try $try ended with $rc"; put out/$n.log "$n:log"
    [ $rc = 0 ] && break
    [ -f out/RESTARTING ] && return  # stopped on purpose for a switch-over
    cp out/$n.log out/$n.try$try.log
    if grep -aqE "OutOfMemoryError|CUDA out of memory" out/$n.log && (( b > 4 )); then
      # Too big a batch for this card: 4 lines fewer (a small step, so little
      # speed is lost), with the steps summed to about the same 48 lines.
      local nb=$((b - 4)); local na=$(( (48 + nb - 1) / nb ))
      args=${args/-B $b --accumulate-grad-batches $acc /-B $nb --accumulate-grad-batches $na }
      b=$nb; acc=$na; echo "$n: out of GPU memory, retrying at batch $b x $acc"
    elif [[ "$env" != *TORCHDYNAMO* ]]; then
      # Kraken compiles the PP-OCRv6 network (torch.compile); if that is what
      # broke, train without compiling, slower but safe.
      echo "$n: failed, retrying without torch.compile"; env="$env TORCHDYNAMO_DISABLE=1"
    elif [[ "$env" == *KRAKEN_WIDTH_GROUPS=1* ]]; then
      echo "$n: failed again, retrying without width groups"; env="KRAKEN_WIDTH_GROUPS=0 TORCHDYNAMO_DISABLE=1"
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
# Remote control: control.json in R2 ({"v": N, "action": "update", "mode":
# "resume"|"weights"}). A higher v than the pod has seen makes it stop the
# training (Kraken saves an abort checkpoint), copy the newest save to R2,
# fetch the newest run_s2.sh and run it in place, which picks up from that
# save. "resume" keeps the schedule; "weights" keeps only what was learned.
control_v() { curl -sSfL -o out/control.json "$(url get:control)" 2>/dev/null && python3 -c "import json; d=json.load(open('out/control.json')); print(d.get('v', 0), d.get('action', ''), d.get('mode', 'resume'))" || echo "0 none resume"; }
watcher() {
  trap - ERR; set +eE +o pipefail
  local seen; seen=$(control_v | cut -d' ' -f1)
  while sleep ${CONTROL_EVERY:-60}; do
    read -r v action mode <<< "$(control_v)"
    (( v > seen )) || continue
    seen=$v; echo "control $v: $action ($mode)"
    [ "$action" = update ] || continue
    get script run_s2.sh.new || { echo "control: no new script, staying"; continue; }
    echo "$mode" > out/RESUME_MODE; touch out/RESTARTING
    for n in $LANES; do
      pid=$(cat out/$n.pid 2>/dev/null); [ -n "$pid" ] && kill -INT "$pid"
      for i in $(seq 1 180); do kill -0 "$pid" 2>/dev/null || break; sleep 1; done
      last=$(ls -t out/$n/*.ckpt 2>/dev/null | head -1)
      [ -n "$last" ] && put "$last" "$n:ckpt" && echo "saved $n $(basename $last) for the switch-over"
    done
    touch out/SWITCH_READY
  done
}
saver & S1=$!; progress & S2=$!; watcher & S3=$!; reporter & S4=$!
# Long steps come after the helpers, so the run is never blind or deaf to remote control.
# A failed relabel never stops the run: training goes on with the labels as they are.
if [ ! -f out/RELABELED_v2 ] && [ -f relabel/relabel.py ]; then
  ( trap - ERR; set +eE +o pipefail; relabel ) || echo "relabel failed; training on the old labels"
fi
# Lines compiled once into arrow files, so the loaders keep the GPU fed.
[ -f train.arrow ] || ketos --workers $WORK compile -f path -o train.arrow -F s2_train.txt > out/compile.log 2>&1
[ -f dev.arrow ] || ketos --workers $WORK compile -f path -o dev.arrow -F dev39.txt >> out/compile.log 2>&1
[ -s out/compile.log ] && put out/compile.log compile
echo train.arrow > tr_list.txt; echo dev.arrow > dev_list.txt
pids=()
while IFS='|' read -r n args; do lane "$n" "$args" & pids+=($!); done < lanes.txt
wait "${pids[@]}" || true
if [ -f out/RESTARTING ]; then
  for i in $(seq 1 300); do [ -f out/SWITCH_READY ] && break; sleep 1; done  # the save must reach R2 first
  rm -f out/SWITCH_READY
  kill $S0 $S1 $S2 $S3 $S4 2>/dev/null; rm -f out/RESTARTING out/$(echo $LANES | cut -d' ' -f1)/resume.ckpt
  echo "switching to the new script"; trap - ERR; exec bash run_s2.sh.new
fi
rm -f out/RESUME_MODE
ls out/*_best.safetensors > /dev/null 2>&1 || fail 'no model'
echo done; put out/run.log run.log
echo > out/DONE; put out/DONE DONE
sleep ${HOLD:-3600}
