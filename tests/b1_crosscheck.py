# Provenance: written with Claude Code (Anthropic AI coding assistant) under the direction of
# Reza Farivar (McGill University), who is accountable for it. See README 'Provenance and AI-use statement'.
"""V14 — B1 implementation cross-check (Tier 1, Design.md v1.6), pre-registered before this code was written.

WHAT IT DOES (plain language):
  Our JavaScript code computes the magnetic field of the coil wires. This script recomputes the same field with an
  independent, published library (Magpylib 6.0.0; Ortner & Coliado Bandeira 2020, SoftwareX 11:100466) on the
  IDENTICAL wire paths and points, and compares. Magpylib uses SI units (metres, tesla; verified from its
  `current.Polyline` docstring), so we convert mm -> m and T -> microtesla.

INPUT : validation/b1_crosscheck_input.json  (written by tests/run.js)
OUTPUT: validation/b1_crosscheck_result.json
CRITERION (copied from Design.md §7, V14): relative difference < 0.5% at every point >= 10 mm from any wire.
  Points 5-10 mm from a wire are reported for information only.

MATLAB EQUIVALENT: not applicable (the point is an independent third-party implementation).
"""
import json
import sys
from pathlib import Path

import numpy as np
import magpylib as magpy

root = Path(__file__).resolve().parent.parent
inp = json.loads((root / "validation" / "b1_crosscheck_input.json").read_text())
out = {"magpylib_version": magpy.__version__, "numpy_version": np.__version__, "cases": []}
all_pass = True
for case in inp["cases"]:
    pts_m = np.asarray(case["points"], dtype=float) / 1000.0          # mm -> m
    B = np.zeros_like(pts_m)
    for wire in case["wires"]:
        verts = np.asarray(wire, dtype=float) / 1000.0
        verts = np.vstack([verts, verts[:1]])                             # close the loop explicitly
        src = magpy.current.Polyline(vertices=verts, current=1.0)
        B += src.getB(pts_m)                                              # tesla
    mag_uT = np.linalg.norm(B, axis=1) * 1e6                              # T -> microtesla (per ampere)
    ours = np.asarray(case["ours_uT"], dtype=float)
    dist = np.asarray(case["dist_mm"], dtype=float)
    rel = np.abs(ours - mag_uT) / np.maximum(mag_uT, 1e-30)
    crit = dist >= 10.0
    info = (dist >= 5.0) & (dist < 10.0)
    worst = float(rel[crit].max()) if crit.any() else float("nan")
    ok = bool(crit.any() and worst < 0.005)
    all_pass = all_pass and ok
    out["cases"].append({
        "name": case["name"], "n_points": int(len(ours)), "n_criterion_points": int(crit.sum()),
        "worst_rel_diff_ge10mm": worst, "median_rel_diff_ge10mm": float(np.median(rel[crit])) if crit.any() else float("nan"),
        "worst_rel_diff_5to10mm_info": float(rel[info].max()) if info.any() else None, "n_5to10mm": int(info.sum()),
        "pass": ok,
    })
out["verdict"] = "PASS" if all_pass else "FAIL"
(root / "validation" / "b1_crosscheck_result.json").write_text(json.dumps(out, indent=1))
print(json.dumps(out, indent=1))
sys.exit(0)
