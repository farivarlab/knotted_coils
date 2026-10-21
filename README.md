# Knotted Coil Designer

A browser tool for designing MRI receive phased arrays made of **knotted wire loops** (torus knots T(p,q), with 1–8 lobes) on a helmet former. It generates single elements, "blooms" them, and **automatically arranges N elements to reduce coupling between neighbours (geometric decoupling)**. It exports wire paths, coupling matrices and meshes.

> **Status: exploratory research software.** Every electromagnetic output is a *quasi-static geometric estimate*: it assumes low frequency and models the wires as thin current paths. It ignores capacitors, the head/body load and wave effects. Confirm any design with a full electromagnetic (full-wave) simulation or with bench S21, the coupling between two coils measured on a network analyser, before building.

## How to run

- **Easiest:** double-click `app/index.html`. It needs no install and no internet; the Three.js 3D library is stored in `vendor/`.
  - *Not yet tested:* opening by double-click. It was tested served from a local web server.
  - If the array solver doesn't respond when opened by double-click, use the built-in local server (tested). Run `node tools/serve.js` in this folder, then open http://localhost:8765/app/index.html.
- **Validation suite** (needs Node.js; takes about 2 minutes):

```bash
node tests/run.js
```

This writes `validation/validation_report.html`. The app's header shows the latest verdicts.

## What's where

| Path | Contents |
|---|---|
| `DEVELOPER_GUIDE.md` | **Start here if you want to extend the tool:** architecture, how to add knot families, rules |
| `CLAUDE.md` | Instructions for AI coding assistants working on this project |
| `docs/REQUEST_LOG.md` | The owner's design requests, quoted, and what each produced |
| `docs/research_integrity/` | The research-integrity rules this project follows (Reza Farivar's framework, DRAFT v1.0) |
| `sources/` | Archived primary sources for verified citations |
| `NOTICE.txt` | Copyright, sharing terms, status |
| `Design.md` | Frozen design v1.10 (v1.8 = knot thickness T; v1.9 = crossover bumps between overlapping coils; v1.10 = COMSOL interface). The changelog records every version; checks V1–V25 were each pre-registered before their code ran |
| `DESIGN_HISTORY.md` | One-page history of every version, trigger, check and outcome |
| `sim/` | Full-wave capacitor co-simulation (Python + openEMS), v1.7; pre-run geometry gate `sim/check_crossings.py` (v1.9) |
| `docs/AUDIT_*.md` | The night-of-2026-10-20 audit: brainstorm, independent review, four area audits |
| `DECISIONS.md` | Dated decision log, including validation failures and open questions for Reza |
| `PARAMETERS.md` | Every parameter with its origin tag (LIT / CONV / JUDG / TUNED / DERIVED) |
| `core/` | Geometry and EM package: `knot.js`, `inductance.js`, `surface.js`, `layout.js`, `optimise.js` |
| `app/index.html` | Browser UI: Element, Pair explorer, Array on helmet |
| `tests/run.js` | Pre-registered validation checks plus labelled post-hoc checks |
| `tests/compare_worstpair.js` | Pre-registered solver comparison |
| `tools/serve.js`, `tools/build_dist.js` | Local server; builds `dist/` (a flat, hostable copy of the app) |
| `validation/` | Generated validation reports |
| `vendor/` | Three.js 0.149.0 (MIT licence, `vendor/three-LICENSE.txt`) |

## Validation status (full run 2026-10-21 16:07, code bc374d0, Design v1.10)

Pre-registered checks, applied mechanically. Full report: `validation/validation_report.html`.

| Check | Verdict |
|---|---|
| V1 Maxwell coaxial mutual inductance | PASS (worst error 0.005%) |
| V2 Loop self-inductance | PASS (worst error 0.66%) |
| V3 Coplanar-circle null spacing | NOT EVALUABLE (reference unverified; computed 0.760 × diameter) |
| V4 Convergence · V5 Symmetry | PASS |
| V6 Topology across bloom (β 0.02–3.0) | **FAIL** only below the wire-dependent bloom floor (β = 0.02, 0.05), a physical limit shown in the app |
| V7 Topology across petal sharpness | PASS |
| V8 B1 on-axis loop field | PASS (0.002%) |
| V9 Ring-layout symmetry (pre-bump layout) · V10 Capacitor breaks · V11 Capacitor value · V12 Face zones · V13 Reproducibility | PASS |
| V14 B1 vs Magpylib (independent library) | PASS (< 0.0001%) |
| V15 Full-wave loop resonance with first-pass capacitors | **FAIL** (−10.3%; thin-wire effective radius) |
| V15b Thin-wire correction carries over (trefoil) | **FAIL** (+6.7% vs 5% limit) |
| V16 S-matrices passive and reciprocal | **FAIL** on loop_air_3T (1.0011) and trefoil_air_7T (1.0013); other cases pass |
| V17 Tuning and matching | PASS |
| V18 Quick B1 map vs full-wave near the surface (3T, 7T) | **FAIL** at both (typical point 7–24% off; worst points at near-zero field) |
| V19 Pair null survives capacitors and load | NOT RUN (pair simulations in progress; the first attempt was invalid, see DECISIONS.md) |
| V20 Second solver (mariepy) | NOT EVALUABLE (not run) |
| V21 Thickness control · V22 Thick-knot B1 vs Magpylib · V23 Tilted-circle self-inductance | PASS |
| V24 Crossover bumps | **FAIL**: all 4 pair cases pass; all 4 test arrays fail (dense knot arrays cannot all be separated) |
| V25 COMSOL vs openEMS | NOT EVALUABLE (COMSOL not installed on the development machine) |

Ring vs free layouts (C2, pre-registered): the ring layout met none of its 3 criteria, so free layouts stay the default.

Every failing run is kept in the git history; see DECISIONS.md.

**New in v1.10 (COMSOL interface, 2026-10-21) — UNVALIDATED:**
- `python sim/export_comsol.py sim/cases/<case>.json` writes plain files for COMSOL into `sim/comsol/<case>/`: wire segments between capacitor gaps (x y z, mm), a ports table, the head phantom and metadata. It needs numpy only.
- `python sim/comsol_build_mph.py <case>` builds, solves and extracts the model through MPh (Python ↔ COMSOL). It needs a licensed COMSOL with the RF Module.
  - Then `python sim/cosim.py <case> --solver comsol` chooses the capacitors exactly as for openEMS.
  - `--dry-run` checks the files and writes the planned COMSOL calls without COMSOL.
- **Written without access to COMSOL.** The COMSOL API names in the build script are marked UNVERIFIED. Check the first build in the COMSOL GUI, then run check V25 (COMSOL vs openEMS).

**New in v1.9 (crossover bumps, 2026-10-21):**
- Where two coils cross, the higher-numbered coil now hops outward over the other, by wire + insulation plus a 10% margin, over a short smooth bump. Coupling and B1 are computed on the bumped wires.
- Before v1.9 the wires of overlapping coils could pass through each other. This was found when a full-wave pair simulation shorted the two coils (DECISIONS.md).
- **Known limitation:** this works for pairs, but in dense knot arrays bumps stack up and some crossings cannot be separated (check V24 fails on arrays). The app then flags the array **"NOT BUILDABLE AS DRAWN"**.

**New in v1.8 (knot thickness, 2026-10-21):**
- A "Total thickness T" slider lets the knot rise out of its plane like a 3D torus knot, with a side view. Extra height goes outward only.
- T = 0 is identical to earlier versions.
- Self-inductance is now correct for non-flat wires (V23).

**New in v1.7 (full-wave capacitor co-simulation):**
- Python scripts run openEMS (FDTD) with ports in every capacitor break and a three-layer head phantom.
- A circuit co-simulation then chooses tuning capacitors and a matching network with preamp decoupling.
- It reports how the capacitors change coupling (S21, mutual inductance) and B1, compared with the quasi-static model.
- Workflow: DEVELOPER_GUIDE "v1.7".
- Every result is **exploratory**: one solver (plus a mariepy cross-check), placeholder phantom and component values, no bench data.
- The current validation verdicts are shown in the app banner and in `validation/validation_report.html`. Failures are listed there, including V15 (raw FDTD loop resonance −10%, explained by the thin-wire effective radius and handled by the V15b correction).

**New in v1.6:**
- **Head and face zones:** a head model with editable eye and mouth exclusion zones. No wire is allowed inside them.
- **Symmetric rings:** a ring layout mode, mirror-symmetric left–right, with per-ring size, bloom and sharpness.
- **Multi-start solving.**
- **Capacitor breaks:** placed away from crossings, with first-pass values at 1.5, 3 or 7 T, and port export.
- **Save and load** designs.
- **B1:** exact-segment field, cross-checked against Magpylib (V14).

Solver options for the next step (simulation) are in `docs/SOLVER_OPTIONS.md`.

**B1 quick look (Array tab):** shows the quasi-static Biot–Savart field of the solved wires.
- **Views:** on a placeholder head surface, or as an axial, coronal or sagittal slice.
- **Elements:** combined as root-sum-of-squares, or a single element (click its wire).
- **Use it for:** comparing coverage and depth fall-off between designs. It is not an absolute sensitivity prediction, because tissue and wave effects are not modelled.
- **E-fields are not shown:** this model can't produce them reliably. Use a full-wave simulator with the exported wire paths.

**Solver comparison (pre-registered):** `validation/compare_worstpair.html`. The worst-pair term is on by default. It lowers the worst pair but raises the typical (median) coupling; set "Worst-pair weight" to 0 to turn it off.

## References

- **Rosa, E. B. & Grover, F. W. (1912).** Formulas and tables for the calculation of mutual and self-inductance (revised). *Bulletin of the Bureau of Standards* 8(1):1–237, Scientific Paper 169. https://nvlpubs.nist.gov/nistpubs/bulletin/08/nbsbulletinv8n1p1_A2b.pdf
  - p. 6, eq. [1]: Maxwell's coaxial formula, modulus convention. **VERIFIED**.
  - p. 111, eq. [62]: ring self-inductance with surface current. **VERIFIED**.
  - pp. 20–21: Example 1, used for post-hoc check PH1. **VERIFIED**.
- **Roemer, P. B., Edelstein, W. A., Hayes, C. E., Souza, S. P. & Mueller, O. M. (1990).** The NMR phased array. *Magn Reson Med* 16:192–225. doi:10.1002/mrm.1910160203. **UNVERIFIED** (not read).
- **Roemer, P. B. & Edelstein, W. A., US Patent 4,825,162 (1989).** Read via Google Patents OCR text: circular-coil spacing "D approximately equal to 0.75d". **PARAPHRASE-ONLY.**

## Provenance and AI-use statement

This software was written with **Claude Code** (Anthropic's AI coding assistant, model Claude Opus 5.5) under the direction of **Reza Farivar** (McGill University), who is accountable for it.

- Every source file carries a provenance header.
- Reference formulas were verified against the primary text listed above.
- Validation criteria were pre-registered in `Design.md` (git 39a4e83) before any code was written.
- Failures are recorded in `DECISIONS.md` and in the git history.
- Any use of results in publications must disclose AI assistance as the venue requires (COPE/ICMJE for journals; current Tri-Agency guidance for grants).

**Third-party code:** Three.js 0.149.0 (MIT) is bundled. Used by scripts but not bundled: openEMS 0.37.0 (GPL-3.0) / CSXCAD (LGPL-3.0), mariepy (GPL-3.0+), Magpylib 6.0.0 (BSD-2), numpy/scipy/h5py/matplotlib, PyTorch. See NOTICE.txt.
