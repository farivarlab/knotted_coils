#!/bin/sh
# Provenance: written with Claude Code (Anthropic AI coding assistant) under the direction of
# Reza Farivar (McGill University), who is accountable for it. See README 'Provenance and AI-use statement'.
# Queue 4 (2026-10-21): V19 pair cases with Design v1.9 crossover bumps + audit M5 air pair. Every case must pass the
# v1.9 pre-run gate (sim/check_crossings.py: zero risks of any kind) before it runs. Run from the repository root.
PY="${KC_PYTHON_EM:-C:/Users/reza/.venvs/kc_em/Scripts/python.exe}"
LOG=sim/out/run_queue4.log
echo "queue4 start $(date)" >> $LOG
run() { c=$1; shift; echo "=== $c $* $(date +%T)" >> $LOG
  risks=$("$PY" sim/check_crossings.py "sim/cases/$c.json" 2>&1 | grep "at risk" | awk -F': ' '{s+=$NF} END {print s+0}')
  if [ "$risks" != "0" ]; then echo "GATE FAILED $c ($risks risks): not run" >> $LOG; return; fi
  echo "gate OK" >> $LOG
  "$PY" sim/run_openems.py "sim/cases/$c.json" "$@" >> $LOG 2>&1 || echo "RUN FAILED $c" >> $LOG; }
cos() { [ -f "sim/out/$1/openems.npz" ] && { "$PY" sim/cosim.py "$1" >> $LOG 2>&1 || echo "COSIM FAILED $1" >> $LOG; }; }
run pair_head_3T_d+0;   cos pair_head_3T_d+0     # V19
run pair_head_3T_d-4;   cos pair_head_3T_d-4
run pair_head_3T_d+4;   cos pair_head_3T_d+4
run pair_air_3T_d+0;    cos pair_air_3T_d+0      # audit M5
echo "queue4 done $(date)" >> $LOG
