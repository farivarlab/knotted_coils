#!/bin/sh
# Provenance: written with Claude Code (Anthropic AI coding assistant) under the direction of
# Reza Farivar (McGill University), who is accountable for it. See README 'Provenance and AI-use statement'.
# Overnight v1.7 run queue (Design.md §6b, §7): official cases on the default model (thin curves, 1 mm grid),
# each followed by the co-simulation. Run from the repository root:  sh sim/run_queue.sh
PY="${KC_PYTHON_EM:-C:/Users/reza/.venvs/kc_em/Scripts/python.exe}"
LOG=sim/out/run_queue.log
# wait (max 2 h) for the 0.5 mm loop calibration started earlier, so runs do not compete for the CPU
i=0; while [ ! -f sim/out/loop_air_3T_curve_res0.5/cosim.json ] && [ $i -lt 720 ]; do sleep 10; i=$((i+1)); done
echo "queue start $(date)" >> $LOG
run() {  # case [extra args...]
  c=$1; shift
  echo "=== $c $* $(date +%T)" >> $LOG
  "$PY" sim/run_openems.py "sim/cases/$c.json" "$@" >> $LOG 2>&1 || echo "RUN FAILED $c" >> $LOG
}
cos() { "$PY" sim/cosim.py "$1" >> $LOG 2>&1 || echo "COSIM FAILED $1" >> $LOG; }
run loop_air_3T;                               cos loop_air_3T          # official V15 + calibration (res1.0_curve)
run trefoil_air_3T --superpose_check;          cos trefoil_air_3T       # V15b, V16, V17, M3
run trefoil_head_3T --superpose_check;         cos trefoil_head_3T      # V16-V18 (3T), M3 loaded
run pair_head_3T_d+0;                          cos pair_head_3T_d+0     # V19
run pair_head_3T_d-4;                          cos pair_head_3T_d-4
run pair_head_3T_d+4;                          cos pair_head_3T_d+4
run pair_air_3T_d+0;                           cos pair_air_3T_d+0      # audit M5
run trefoil_head_7T;                           cos trefoil_head_7T      # V18 (7T)
run trefoil_air_7T;                            cos trefoil_air_7T
run trefoil_air_3T --res 0.5 --tag res0.5;     cos trefoil_air_3T_res0.5   # audit M2 (crossing shorts) mesh sensitivity
echo "queue done $(date)" >> $LOG
