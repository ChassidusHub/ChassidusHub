#!/bin/bash
# Round 3 (2026-10-02): one reader that masters Hebrew and Yiddish both, no kind of
# mistake worse than the keeper's (gate.py; Shmuly: "reduce error rate of every
# type ... the best base model"). Yiddish rounds 1 and 2 read Yiddish far better
# but dropped Hebrew line-opening dashes, because their Hebrew lines kept the typed
# text's gaps: the label fixer (relabel/: relabel.py, inkfix.py, mine.py) never ran,
# as no relabel.tar was sent. Here it runs over every real line first, the keeper's
# drill lines (focus/fk: dashes, look-alike letters) go back in, and the Yiddish
# lines are joined by fakes set from the Chabad Library's own Yiddish (yidtext.py).
# Two lanes share the GPU: the keeper at its own 96 px, and at 128 px (setheight.py),
# which reads small note letters and look-alikes better; the gate picks.
#
# What follows was the Yiddish round's, run_s2.sh with Yiddish lines added. Most
# sichos of vols 15-25 are Yiddish but only ~5% of the stage-2 lines were, and
# the reader was twice as unsure on Yiddish body text (weakspots.py). The keeper
# (focus-1217) trains further on a mix: a random share of the real Hebrew lines
# of vols 30-38 (so nothing is forgotten), the lines of vols 15-25 it read sure
# (yidpairs.py), and fake Yiddish lines from the Whisper transcripts in LS
# spelling (yidtext.py + gen.py). It is scored on dev39 plus held-out Yiddish
# lines, so the best save is the best on both. Everything below is run_s2.sh's.
#
# Stage 2 of the Likkutei Sichos line model (the maftechos start is dropped): the real vols 30-38 lines (132k,
# labels aligned from the Chabad Library's typed text) plus the stage-1 fake
# lines (23% of the mix), on one rented GPU with no network volume. The bundle
# comes from R2 and results go back through presigned links, so no key is on
# the pod. Lanes (lanes.txt: name|ketos args) train side by side on the one GPU, each with a cosine schedule over a fixed number of rounds, scored on
# dev39; each lane's newest save is copied to R2 every 10 minutes and a
# restarted pod resumes from it. At the end each lane's best model reads the
# 3,000 test39 lines and the reading (with the letter probabilities, for the
# word model) goes back to R2 to be scored.
# Only the pod this run was started on may run the script: a pod left over
# from a failed start that RunPod restarts must not write into the same out/.
[ -z "${RUNPOD_POD_ID:-}" ] || [ "$RUNPOD_POD_ID" = "${RUN_POD:-none}" ] || { echo "pod $RUNPOD_POD_ID is not this run's pod, nothing to do"; exit 0; }
D=${S2DIR:-/root/s2}; cd $D; mkdir -p out; exec >> out/run.log 2>&1
# @URLS@ (a script sent by remote control may carry a fresh urls.json here)
url() { python3 -c "import json,sys; print(json.load(open(sys.argv[2] + '/urls.json'))[sys.argv[1]])" "$1" "$D"; }
put() { curl -sSf --retry 3 -X PUT -T "$1" "$(url "$2")" > /dev/null; }
# A download that breaks off midway (curl 18, "transfer closed", on a 900 MB
# bundle 2026-10-01) is picked up where it stopped, up to eight times; a file
# counts as complete only when its size is the size the server states.
get() {
  local tries=0 rc u want have
  u=$(url "get:$1")
  until curl -sSfL --retry 3 -C - -o "$2" "$u"; do
    rc=$?
    # the size from a one-byte range request (a HEAD is not allowed on a signed GET link)
    want=$(curl -sSL -r 0-0 -o /dev/null -D - "$u" 2>/dev/null | tr -d '\r' | awk 'tolower($1)=="content-range:" {split($2, a, "/"); n=a[2]} END {print n}')
    have=$(stat -c %s "$2" 2>/dev/null || echo 0)
    [ -n "$want" ] && [ "$have" = "$want" ] && return 0
    tries=$((tries + 1)); (( tries >= 8 )) && { echo "get $1: gave up after $tries tries (curl $rc, $have of $want bytes)"; return 1; }
    [ $rc = 33 ] && rm -f "$2"  # the server will not resume: start this one afresh
    echo "get $1: curl $rc at $have of $want bytes, trying again ($tries)"; sleep 10
  done
}
( trap - ERR; set +eE; while sleep ${LOG_EVERY:-60}; do
    put out/run.log run.log
    [ -f out/relabel.log ] && put out/relabel.log relabel:log
    [ -f out/ink_unclear.txt ] && put out/ink_unclear.txt ink:unclear
    [ -f out/compile.log ] && put out/compile.log compile
  done ) & S0=$!
fail() { echo "failed: $1"; put out/run.log run.log; echo > out/FAILED; put out/FAILED FAILED; sleep ${HOLD:-3600}; }
trap 'fail "line $LINENO"' ERR
set -eEuo pipefail
nvidia-smi
pip show kraken 2>/dev/null | grep -q "^Version: 7.1.1$" || pip install -q "kraken==7.1.1"
python3 -c "import rapidfuzz" 2>/dev/null || pip install -q rapidfuzz  # for the error reports
[ -f s2_train.txt ] || { get s2.tar s2.tar; tar -xf s2.tar; rm s2.tar; }
[ -f yid/train.txt ] || { get yid.tar yid.tar; tar -xf yid.tar; rm yid.tar; }
echo "yiddish lines: $(wc -l < yid/train.txt) to train, $(wc -l < yid/dev.txt) to score"
# the mix: HEB real Hebrew lines (all by default: with only 60k of them, round 1
# lost line-opening dashes and note numbers on Hebrew), then every Yiddish line
[ -f dev_mix.txt ] || cat dev39.txt yid/dev.txt > dev_mix.txt
[ -f ppm.safetensors ] || get ppm ppm.safetensors
[ -f ppm128.safetensors ] || get ppm128 ppm128.safetensors
[ -d focus/fk ] || { get focus focus.tar && tar -xf focus.tar && rm focus.tar; }
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
# A taller line (the base model's own height, 96 or 128 px) needs that much
# more memory per line, so the batch shrinks with it.
HEIGHT=$(python3 -c "import json,sys; from safetensors import safe_open; m=json.loads(safe_open('ppm.safetensors','pt').metadata()['kraken_meta']); print(list(m.values())[0].get('height', 96))" 2>/dev/null || echo 96)
B=$(( B * 96 / HEIGHT / 4 * 4 )); if (( B < 4 )); then B=4; fi
ACC=$(( (32 + B - 1) / B ))
LR=${LR:-5e-5}; ROUNDS=${ROUNDS:-2}
echo "machine: $NCPU cpus, $MEM GB memory, $GMEM MiB GPU -> $WORK loaders, line height $HEIGHT, batch $B x $ACC steps, lr $LR, $ROUNDS rounds"
# One lane with the whole GPU: the new PP-OCRv6 medium base model fine-tuned.
# Two lanes share the card: each gets half the memory, so half the batch, and
# the 128 px lane a third less again; steps are summed to about 32 lines.
W2=$(( WORK / 2 > 2 ? WORK / 2 : 2 ))
B1=$(( B / 2 / 4 * 4 )); (( B1 < 4 )) && B1=4; A1=$(( (32 + B1 - 1) / B1 ))
B2=$(( B1 * 96 / 128 / 4 * 4 )); (( B2 < 4 )) && B2=4; A2=$(( (32 + B2 - 1) / B2 ))
echo "lanes: 96 px at batch $B1 x $A1, 128 px at $B2 x $A2, $W2 loaders each"
cat > lanes.txt <<L
ppm|--precision bf16-mixed --threads 4 --workers $W2 train --arch ppocrv6 -i ppm.safetensors --resize new -u NFD --max-width 4080 --optimizer AdamW+Muon -r $LR --warmup 300 --schedule cosine --cos-max $ROUNDS --cos-min-lr 1e-6 -q fixed -N $ROUNDS -F 0.25 -B $B1 --accumulate-grad-batches $A1 --augment
h128|--precision bf16-mixed --threads 4 --workers $W2 train --arch ppocrv6 -i ppm128.safetensors --resize new -u NFD --max-width 4080 --optimizer AdamW+Muon -r $LR --warmup 300 --schedule cosine --cos-max $ROUNDS --cos-min-lr 1e-6 -q fixed -N $ROUNDS -F 0.25 -B $B2 --accumulate-grad-batches $A2 --augment
L
export PYTORCH_CUDA_ALLOC_CONF=expandable_segments:True
# The typed text of the real lines was matched to the printed lines by text
# alone, and in two ways it is wrong where the scan is clear: a word broken at
# a makaf typed whole on one line, and footnote marks typed that the line
# doesn't print. Once a model is good enough (99.5% on dev), it reads every
# real line and relabel.py takes from its reading only those kinds of
# differences, where it is sure; the old labels stay as .gt.orig.txt. Done
# once per pod (out/RELABELED_v3), before the lines are compiled.
relabel() {
  # The reader is this run's newest save, or, on a fresh run, the base model
  # itself (from run 3 on, the base is the previous run's best model).
  if curl -sSfL -o out/reader.ckpt "$(url get:ppm:ckpt)"; then
    ketos convert -o out/reader.safetensors out/reader.ckpt > /dev/null
  else
    echo "relabel: no saved model, the base model reads"; cp ppm.safetensors out/reader.safetensors; cp ppm.safetensors out/reader.ckpt
  fi
  grep '^pairs/' s2_train.txt | sort -u > out/real.txt  # the test lines keep their labels: gate.py scores against checked ones
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
  # Marks the typed text left out (a line-start dash, ". . ."), found as ink no
  # read letter accounts for: added to every real line's label; lines with
  # other unexplained ink are listed and kept out of training.
  if [ -f relabel/inkfix.py ]; then
    local ip=()
    for i in $(seq 0 $((k - 1))); do
      python3 relabel/inkfix.py out/reader.safetensors out/real.txt out/ink_$i.jsonl --shard $i/$k --device ${RELABEL_DEVICE:-cuda:0} > out/ink_$i.log 2>&1 & ip+=($!)
    done
    wait "${ip[@]}" || true
    cat out/ink_*.jsonl > out/ink.jsonl
    python3 relabel/inkfix.py --apply out/ink.jsonl --write --unclear out/ink_unclear.txt | tee -a out/relabel.log
    gzip -kf out/ink.jsonl; put out/ink.jsonl.gz ink || true
  fi
  # Real lines the model was unsure of a look-alike letter in go in three times.
  if [ -f relabel/mine.py ]; then
    python3 relabel/mine.py 'out/read_*.jsonl' s2_train.txt out/train_mined.txt --times ${MINE_TIMES:-3} | tee -a out/relabel.log
    [ -s out/ink_unclear.txt ] && { grep -vxFf out/ink_unclear.txt out/train_mined.txt > out/train_list.txt || cp out/train_mined.txt out/train_list.txt; } || cp out/train_mined.txt out/train_list.txt
  fi
  rm -f train.arrow dev.arrow; touch out/RELABELED_v3
}
# The label fixer and the error report code (relabel/: relabel.py,
# relabel_read.py, errlog.py, score.py, dev300.txt).
url get:relabel > /dev/null 2>&1 && get relabel relabel.tar && tar -xf relabel.tar || true
LANES=$(cut -d'|' -f1 lanes.txt | tr '\n' ' ')  # on one line: the reporter takes the first word as the lead lane

# The helpers below run beside the training and must never stop the run: a
# check that finds nothing yet (no save, no progress line) is not an error.
# The copy in R2 is what every restart continues from, so a worse save never
# replaces it: a scored save must be within 0.2 points of the best one sent,
# and a stop-time save goes up only from a run that started from the learned
# weights (2026-10-01 one that had fallen back to the base model replaced it).
safe_put() {  # file lane
  local f=$1 n=$2 sc best
  sc=$(basename "$f" .ckpt | sed -nE 's/^checkpoint_[0-9]+-([0-9.]+)$/\1/p')
  best=$(cat out/$n.bestsent 2>/dev/null || echo 0)
  if [ -n "$sc" ]; then
    python3 -c "import sys; sys.exit(0 if float('$sc') >= float('$best') - 0.002 else 1)" || { echo "kept the better save in R2 (not $(basename $f))"; return 1; }
  elif [ "$(cat out/$n.from 2>/dev/null)" = base ]; then
    echo "kept the save in R2 (this run started from the base model)"; return 1
  fi
  put "$f" "$n:ckpt" && echo "saved $n $(basename $f)" || return 1
  [ -n "$sc" ] && python3 -c "import sys; sys.exit(0 if float('$sc') > float('$best') else 1)" && echo "$sc" > out/$n.bestsent
  return 0
}
saver() {  # every 10 minutes: each lane's newest save to R2, for resuming
  trap - ERR; set +eE +o pipefail
  local sent=""
  while sleep ${SAVE_EVERY:-600}; do
    for n in $LANES; do
      last=$(ls -t out/$n/*.ckpt 2>/dev/null | grep -v resume.ckpt | head -1)
      [ -n "$last" ] && [[ " $sent " != *" $last "* ]] || continue  # each save goes up once
      safe_put "$last" $n && sent="$sent $last"
    done
  done
}
progress() {  # every 2 minutes: each lane's progress bar and saves, and the GPU
  trap - ERR; set +eE +o pipefail
  while sleep ${PROG_EVERY:-120}; do
    { date -u +%FT%TZ; nvidia-smi --query-gpu=utilization.gpu,memory.used --format=csv,noheader
      ls out/read_*.log > /dev/null 2>&1 && [ ! -f out/RELABELED_v3 ] && tail -qn1 out/read_*.log out/ink_*.log 2>/dev/null
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
  local n done=""
  mkdir -p out/errors
  while sleep ${REPORT_EVERY:-30}; do
    n=${LANES%% *}; [ -f out/focus.started ] && n=focus
    last=$(ls -t out/$n/checkpoint_*.ckpt 2>/dev/null | head -1)
    # a save is known by its name and its time: Kraken reuses names after a restart
    [ -n "$last" ] && [ "$last@$(stat -c %Y "$last")" != "$done" ] && [ "$last" -nt out/$n.started ] || continue
    sleep 5  # let the save finish writing
    name=$(basename "$last" .ckpt | sed "s/^checkpoint_/$([ $n = focus ] && echo focus || echo s2)-/")-$(date -u -r "$last" +%H%M)
    ketos convert -o out/rep.safetensors "$last" > /dev/null 2>&1 &&
      python3 evalx.py out/rep.safetensors relabel/dev300.txt out/rep.npz --device ${REPORT_DEVICE:-cuda:0} > out/rep.log 2>&1 &&
      (cd out && python3 ../relabel/errlog.py rep.npz "$name" --dir errors) >> out/rep.log 2>&1 &&
      put out/errors/$name.txt errors && put out/errors/history.jsonl history && echo "report $name: $(tail -1 out/errors/history.jsonl | cut -c1-150)"
    # every scored save is kept in R2 under its own number (out/kept.txt says which)
    local k=0; [ -f out/kept.txt ] && k=$(wc -l < out/kept.txt)
    if [ -f out/rep.safetensors ] && url keep:$k > /dev/null 2>&1 && put out/rep.safetensors keep:$k; then
      echo "$k $name" >> out/kept.txt; put out/kept.txt kept
    fi
    done="$last@$(stat -c %Y "$last")"
  done
}
lane() {  # name, args; a lane's failure is reported, not fatal to the others
  set +eE; trap - ERR
  local n=$1 args=$2 res=""
  [ -f out/RESTARTING ] && return  # a switch-over came before training began
  mkdir -p out/$n
  if [ "$(cat out/RESUME_MODE 2>/dev/null)" = recover ] && [ -f out/rep.safetensors ]; then
    # The saved checkpoint is bad: start again from the newest model the error
    # reporter scored (out/rep.safetensors), kept in R2 first, on a fresh 2-round schedule.
    cp out/rep.safetensors out/$n/start.safetensors; put out/$n/start.safetensors "$n:model"
    args=$(sed -E "s# -i ppm(128)?\.safetensors # -i out/$n/start.safetensors #" <<< "$args"); args=${args/--cos-max $ROUNDS/--cos-max 2}; args=${args/-N $ROUNDS/-N 2}
    echo "$n recovers from the last scored model ($(tail -1 out/errors/history.jsonl | cut -c1-60))"
  elif curl -sSfL -o out/$n/resume.ckpt "$(url "get:$n:ckpt")" 2>/dev/null; then
    if [ "$(cat out/RESUME_MODE 2>/dev/null)" = weights ]; then
      # A changed recipe keeps the learned weights but starts its own schedule.
      local st=out/$n/start.safetensors
      ketos convert -o $st out/$n/resume.ckpt && args=$(sed -E "s# -i ppm(128)?\.safetensors # -i $st #" <<< "$args")
      echo "$n starts from the saved weights with the new recipe"
    else
      # Kraken takes either a start model (-i) or a checkpoint to resume, not both.
      res="--resume out/$n/resume.ckpt"; args=$(sed -E 's/ -i [^ ]+ / /' <<< " $args "); echo "$n resumes"
    fi
  fi
  local env="KRAKEN_WIDTH_GROUPS=1" b acc
  b=$(sed -nE 's/.* -B ([0-9]+) .*/\1/p' <<< "$args"); acc=$(sed -nE 's/.* --accumulate-grad-batches ([0-9]+) .*/\1/p' <<< "$args")
  for try in 1 2 3 4 5 6 7 8 9; do
    touch out/$n.started
    if [ -n "$res" ]; then echo resume; elif [[ "$args" =~ -i\ ppm(128)?\.safetensors ]]; then echo base; else echo weights; fi > out/$n.from
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
    # A retry starts over only when this lane was not resuming: dropping the
    # checkpoint would silently restart from the base model (2026-10-01).
    if [ -n "$res" ]; then rm -f $(ls out/$n/*.ckpt 2>/dev/null | grep -v resume.ckpt); else rm -f out/$n/*.ckpt; fi
  done
  best=$(ls -t out/$n/best_*.safetensors 2>/dev/null | head -1)
  if [ -n "$best" ]; then
    cp "$best" out/${n}_best.safetensors; put out/${n}_best.safetensors "$n:model"
    cat dev39.txt test39.txt yid/dev.txt > out/test_mix.txt
    python3 evalx.py out/${n}_best.safetensors out/test_mix.txt out/${n}_test.npz --device cuda:0 --probs none > out/${n}_eval.log 2>&1
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
    get script run_r3.sh.new || { echo "control: no new script, staying"; continue; }
    echo "$mode" > out/RESUME_MODE; touch out/RESTARTING
    for n in $LANES; do
      pid=$(cat out/$n.pid 2>/dev/null); [ -n "$pid" ] && kill -INT "$pid"
      for i in $(seq 1 180); do kill -0 "$pid" 2>/dev/null || break; sleep 1; done
      last=$(ls -t out/$n/*.ckpt 2>/dev/null | head -1)
      [ -n "$last" ] && safe_put "$last" $n && echo "(for the switch-over)"
    done
    touch out/SWITCH_READY
  done
}
saver & S1=$!; progress & S2=$!; watcher & S3=$!; reporter & S4=$!
# Long steps come after the helpers, so the run is never blind or deaf to remote control.
# A failed relabel never stops the run: training goes on with the labels as they are.
if [ ! -f out/RELABELED_v3 ] && [ -f relabel/relabel.py ]; then
  ( trap - ERR; set +eE +o pipefail; relabel ) || echo "relabel failed; training on the old labels"
fi
# The mix: every line the label fix kept (real vols 30-38 with the hard, dash and
# star lines repeated, and the stage-1 fakes), the keeper's drill fakes, and the
# Yiddish lines and fakes.
[ -f out/train_list.txt ] || cp s2_train.txt out/train_list.txt
if [ ! -f out/MIXED ]; then
  { cat out/train_list.txt yid/train.txt; ls focus/fk/*.png; } | shuf --random-source=<(yes) > out/mix.txt
  mv out/mix.txt out/train_list.txt; touch out/MIXED
  echo "mix: $(wc -l < out/train_list.txt) lines ($(wc -l < yid/train.txt) Yiddish, $(ls focus/fk/*.png | wc -l) drill fakes)"
fi
# Lines compiled once into arrow files, so the loaders keep the GPU fed.
[ -f train.arrow ] || ketos --workers $WORK compile -f path -o train.arrow -F out/train_list.txt > out/compile.log 2>&1
[ -f dev.arrow ] || ketos --workers $WORK compile -f path -o dev.arrow -F dev_mix.txt >> out/compile.log 2>&1
[ -s out/compile.log ] && put out/compile.log compile
echo train.arrow > tr_list.txt; echo dev.arrow > dev_list.txt
# A run that already finished is not trained again when a new script takes
# over (remote control after DONE, to change only the focus session).
if [ -f out/DONE ]; then echo "training already done; going on to the focus session"; else
pids=()
while IFS='|' read -r n args; do lane "$n" "$args" & pids+=($!); done < lanes.txt
wait "${pids[@]}" || true
fi
switch_over() {
  [ -f out/RESTARTING ] || return 0
  for i in $(seq 1 300); do [ -f out/SWITCH_READY ] && break; sleep 1; done  # the save must reach R2 first
  rm -f out/SWITCH_READY
  kill $S0 $S1 $S2 $S3 $S4 2>/dev/null; rm -f out/RESTARTING out/$(echo $LANES | cut -d' ' -f1)/resume.ckpt
  echo "switching to the new script"; trap - ERR; exec bash run_r3.sh.new
}
switch_over
# A short focused session after the main run, when control.json asks for it
# ("focus": 1): the best model trained a little more, at a low learning rate,
# on fake lines packed with the letters it still confuses (focus/fk: ת/ח, ב/כ,
# ז/ו/ן) mixed into real lines (a random 60k, plus the real lines richest in
# those letters), so it drills them without forgetting the rest. Both models
# then read all 4,500 dev and test lines, and the better one is chosen off the pod.
focus() {
  python3 -c "import json,sys; sys.exit(0 if json.load(open('out/control.json')).get('focus') else 1)" 2>/dev/null || return 0
  [ -f out/FOCUS_DONE ] && return 0
  get focus focus.tar && tar -xf focus.tar || { echo "focus: no data"; return 0; }
  { grep '^pairs/' s2_train.txt | shuf -n 60000 --random-source=<(yes); cat focus/hard_real.txt; } | sort -u > focus_real.txt
  cat dev39.txt test39.txt > out/full.txt
  # Marks the typed text left out (a dash or ". . ." at the start of a printed
  # line): ink no read letter accounts for (focus/inkfix.py). Clear cases get
  # the mark added to the label, here and in the 4,500 scoring lines (their
  # old labels are kept in out/ink.jsonl, so both scores can be given); lines
  # with other unexplained ink stay out of the drill.
  if [ -f focus/inkfix.py ] && [ ! -f out/INKED ]; then
    cat focus_real.txt out/full.txt > ink_list.txt
    local k=$(( WORK / 2 )); (( k > 8 )) && k=8; (( k < 1 )) && k=1; local ip=()
    for i in $(seq 0 $((k - 1))); do
      python3 focus/inkfix.py out/ppm_best.safetensors ink_list.txt out/ink_$i.jsonl --shard $i/$k --device cuda:0 > out/ink_$i.log 2>&1 & ip+=($!)
    done
    wait "${ip[@]}" || true
    cat out/ink_*.jsonl > out/ink.jsonl
    python3 focus/inkfix.py --apply out/ink.jsonl --write --unclear out/ink_unclear.txt && touch out/INKED
    gzip -kf out/ink.jsonl; put out/ink.jsonl.gz ink || true
  fi
  { grep -vxFf out/ink_unclear.txt focus_real.txt 2>/dev/null || cat focus_real.txt; ls focus/fk/*.png; } > focus_train.txt
  echo "focus: $(wc -l < focus_train.txt) lines, $(ls focus/fk/*.png | wc -l) of them fake"
  ketos --workers $WORK compile -f path -o focus.arrow -F focus_train.txt > out/focus_compile.log 2>&1
  echo focus.arrow > focus_list.txt; mkdir -p out/focus; touch out/focus.started
  script -qfec "exec env KRAKEN_WIDTH_GROUPS=1 ketos -d cuda:0 --precision bf16-mixed --threads 4 --workers $WORK train --arch ppocrv6 -i out/ppm_best.safetensors --resize new -u NFD --max-width 4080 --optimizer AdamW+Muon -r 1e-4 --warmup 100 --schedule cosine --cos-max 1 --cos-min-lr 1e-6 -q fixed -N 1 -F 0.5 -B $B --accumulate-grad-batches $ACC --augment -t focus_list.txt -e dev_list.txt -f binary --base-dir R -o out/focus" out/focus.log > /dev/null 2>&1
  put out/focus.log focus:log
  local fb; fb=$(ls -t out/focus/best_*.safetensors 2>/dev/null | head -1)
  python3 evalx.py out/ppm_best.safetensors out/full.txt out/ppm_full.npz --device ${REPORT_DEVICE:-cuda:0} > out/full_eval.log 2>&1 && put out/ppm_full.npz ppm:full
  if [ -n "$fb" ]; then
    cp "$fb" out/focus_best.safetensors; put out/focus_best.safetensors focus:model
    python3 evalx.py out/focus_best.safetensors out/full.txt out/focus_full.npz --device ${REPORT_DEVICE:-cuda:0} >> out/full_eval.log 2>&1 && put out/focus_full.npz focus:test
  fi
  touch out/FOCUS_DONE; echo "focus: done"
}
( trap - ERR; set +eE +o pipefail; focus ) || echo "focus failed"
test_saves() {
  trap - ERR; set +eE +o pipefail
  # Every save still on the pod reads the 4,500 scoring lines, four at a time
  # (save names repeat across restarts, so each is named by its file time and
  # listed in out/saves.txt), so the keeper is picked on 4,500 lines, not 300.
  cat dev39.txt test39.txt yid/dev.txt > out/full.txt
  if [ ! -f out/SAVES_DONE ]; then
    mkdir -p out/saves; : > out/saves.txt; local j=0 sp=()
    for c in $(ls -tr out/ppm/checkpoint_*.ckpt out/h128/checkpoint_*.ckpt 2>/dev/null) out/*_best.safetensors; do
      url save:$j > /dev/null 2>&1 || break
      local m=out/saves/$j.safetensors
      if [[ $c == *.ckpt ]]; then ketos convert -o $m "$c" > /dev/null 2>&1 || continue; else cp "$c" $m; fi
      echo "$j $(dirname $c | xargs basename)/$(basename $c) $(date -u -r $c +%H:%M) $(md5sum < $m | cut -c1-8)" >> out/saves.txt
      ( python3 evalx.py $m out/full.txt out/saves/$j.npz --device cuda:0 --probs none > out/saves/$j.log 2>&1 && put out/saves/$j.npz save:$j ) & sp+=($!)
      j=$((j + 1)); if (( ${#sp[@]} >= 4 )); then wait "${sp[@]}" || true; sp=(); fi
    done
    wait "${sp[@]}" 2>/dev/null || true
    put out/saves.txt saves; touch out/SAVES_DONE
  fi
}
( test_saves ) || echo "testing the saves failed"
# Each lane's best reads both tests again keeping the five likeliest letters per
# frame, which the word check (confix.py) and the two-reader vote need.
top5() {
  trap - ERR; set +eE +o pipefail
  cat dev39.txt test39.txt yid/dev.txt > out/test_mix.txt
  for n in $LANES; do
    [ -f out/${n}_best.safetensors ] && [ ! -f out/$n.top5 ] || continue
    python3 evalx.py out/${n}_best.safetensors out/test_mix.txt out/${n}_top5.npz --device cuda:0 --probs top5 > out/${n}_top5.log 2>&1 &&
      put out/${n}_top5.npz "$n:test" && touch out/$n.top5 && echo "$n: top-5 readings sent"
  done
}
( top5 ) || echo "top-5 readings failed"
rm -f out/RESUME_MODE
ls out/*_best.safetensors > /dev/null 2>&1 || fail 'no model'
echo done; put out/run.log run.log
echo > out/DONE; put out/DONE DONE
# Kept up for an hour in case remote control sends more work (the focus session).
# The focus session can also be asked for here, after looking at the final report.
for i in $(seq 1 $(( ${HOLD:-3600} / 5 ))); do
  sleep 5; switch_over
  if [ ! -f out/FOCUS_DONE ] && [ $((i % 12)) = 0 ]; then ( trap - ERR; set +eE +o pipefail; focus ) || true; fi
done
