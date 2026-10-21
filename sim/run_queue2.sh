#!/bin/sh
# Provenance: written with Claude Code (Anthropic AI coding assistant) under the direction of
# Reza Farivar (McGill University), who is accountable for it. See README 'Provenance and AI-use statement'.
# Queue 2 (2026-10-21): cases not affected by the open pair-case decision (DECISIONS 2026-10-21). Run from repo root.
PY="${KC_PYTHON_EM:-C:/Users/reza/.venvs/kc_em/Scripts/python.exe}"
LOG=sim/out/run_queue2.log
echo "queue2 start $(date)" >> $LOG
run() { c=$1; shift; echo "=== $c $* $(date +%T)" >> $LOG
  "$PY" sim/run_openems.py "sim/cases/$c.json" "$@" >> $LOG 2>&1 || echo "RUN FAILED $c" >> $LOG; }
cos() { "$PY" sim/cosim.py "$1" >> $LOG 2>&1 || echo "COSIM FAILED $1" >> $LOG; }
run trefoil_head_7T;                           cos trefoil_head_7T      # V18 (7T)
run trefoil_air_7T;                            cos trefoil_air_7T
run trefoil_air_3T --res 0.5 --tag res0.5;     cos trefoil_air_3T_res0.5   # audit M2 mesh sensitivity
echo "queue2 done $(date)" >> $LOG
