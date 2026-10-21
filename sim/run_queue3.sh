#!/bin/sh
# Provenance: written with Claude Code (Anthropic AI coding assistant) under the direction of
# Reza Farivar (McGill University), who is accountable for it. See README 'Provenance and AI-use statement'.
# Queue 3 (2026-10-21): V19 pair cases with shifted breaks (DECISIONS 2026-10-21) + audit M5 air pair.
# Waits for queue 2 to finish so runs do not compete for the CPU. Run from the repository root.
PY="${KC_PYTHON_EM:-C:/Users/reza/.venvs/kc_em/Scripts/python.exe}"
LOG=sim/out/run_queue3.log
i=0; while ! grep -q "queue2 done" sim/out/run_queue2.log 2>/dev/null && [ $i -lt 4320 ]; do sleep 10; i=$((i+1)); done
echo "queue3 start $(date)" >> $LOG
run() { c=$1; shift; echo "=== $c $* $(date +%T)" >> $LOG
  "$PY" sim/run_openems.py "sim/cases/$c.json" "$@" >> $LOG 2>&1 || echo "RUN FAILED $c" >> $LOG; }
cos() { "$PY" sim/cosim.py "$1" >> $LOG 2>&1 || echo "COSIM FAILED $1" >> $LOG; }
run pair_head_3T_d+0;   cos pair_head_3T_d+0     # V19
run pair_head_3T_d-4;   cos pair_head_3T_d-4
run pair_head_3T_d+4;   cos pair_head_3T_d+4
run pair_air_3T_d+0;    cos pair_air_3T_d+0      # audit M5
echo "queue3 done $(date)" >> $LOG
