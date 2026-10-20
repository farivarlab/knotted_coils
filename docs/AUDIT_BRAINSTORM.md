# Audit, step 1: brainstorm of everything that could go wrong

**Author:** Claude (the same model that wrote the code; that's why step 2 is an independent review). **Date:** 2026-10-20 (night). **Scope:** Knotted Coil Designer v1.7: geometry, quasi-static EM, solvers, full-wave co-simulation, app, validation, documentation, integrity, packaging.

**Legend.** *Covered* = an existing check would catch it. *Partial* = some protection. *Open* = nothing would catch it today.

## A. Physics and modelling assumptions

| # | Failure mode | Consequence | Detection | Status |
|---|---|---|---|---|
| A1 | Quasi-static coupling k ignores capacitors, tissue load, wave effects | Decoupling nulls in the wrong place on a real coil | V19 (full-wave pair), bench S21 | Partial (V19 tonight; no bench) |
| A2 | Uniform-current B1 assumption | B1 maps wrong, especially at 7T and at depth | V18 (Tier 2) | Partial |
| A3 | Self-inductance formula assumes skin-effect surface current, a ≪ R | L error for thick wire or tight bends | V2 (circle only) | Partial: no check on tight knot bends |
| A4 | Crossing lift modelled as a sinusoid in z, while real wire lifts only locally | Small L and M error; clearance check may pass for a shape that cannot be wound | Clearance check | Open: fabrication realism not validated |
| A5 | Kernel softening ε between elements | Biases M for heavily overlapping elements | none | Open: sensitivity untested (logged) |
| A6 | Wrapping a flat knot onto the helmet distorts it | Topology could change on high-curvature helmets; distortion only reported as a length change | Wrap distortion % | Open: crossings not re-checked after wrapping |
| A7 | FDTD staircasing; thin wire has an effective radius ≠ real radius | Inductance and resonance off (**seen: V15 −9.5%**) | V15, mesh sensitivity | Being investigated |
| A8 | Lumped port along one mesh axis, while the wire tangent is oblique | Gap geometry and parasitic capacitance wrong | none | Open |
| A9 | Phantom tissue values: 7T secondary source; 3T an approximation from body-phantom values | Loaded Q, capacitor values and B1 at depth off | Labelled | Open: unverified values |
| A10 | Phantom geometry (ellipsoid, layer thicknesses) is a placeholder | Loading and B1 depth off | none | Open |
| A11 | Preamp modelled as a fixed 2 Ω; matching topology assumed | Decoupling estimates differ from real preamps | none | Open (placeholder) |
| A12 | Capacitor ESR and inductor Q placeholders | Q and noise estimates off | none | Open |
| A13 | Copper σ, skin depth; no proximity effect at crossings | Loss underestimated | none | Open |
| A14 | B0 assumed along z; B1⁻ uses the (Hx − iHy) convention | B1⁺/B1⁻ swapped if the sign convention differs from openEMS's | Same convention as openEMS tutorial | Partial |
| A15 | The voxel phantom and our analytic head use different "inside" tests | V18 near-surface points misclassified | none | Open |
| A16 | Coverage and regularity metrics are proxies for image quality (SNR, g-factor) | Optimising the wrong objective | none | Open (by design; disclosed) |

## B. Numerics

| # | Failure mode | Consequence | Detection | Status |
|---|---|---|---|---|
| B1 | Neumann near-field refinement insufficient when wires cross between elements | M error for overlapping elements | V4 (one case) | Partial |
| B2 | Self-L with too few points per wire radius on tight bends | L error | V2 at 400 points (circle) | Partial |
| B3 | Adaptive point count capped at 102,400; stable-count rule fooled again | Spurious crossings → wrong topology verdict | V7 history | Partial |
| B4 | Crossing detection: segments parallel or overlapping (den ≈ 0) skipped | Missed crossings in degenerate cases | none | Open |
| B5 | Lift bisection assumes clearance is monotone in h | Wrong h, or "infeasible" reported wrongly | none | Open |
| B6 | Elliptic-integral AGM precision near k → 1 | V1 error at small separations | V1 (d ≥ 5 mm) | Partial |
| B7 | Stage-1 table interpolation error; table eps tied to the initial Rf | Wrong optimum in fast mode | Stage 2, final exact report | Partial |
| B8 | Co-sim root search: multiple roots; picking "nearest first-pass" may choose a non-physical branch | Wrong capacitor values | V17 (S11 only) | Partial: a matched but wrong branch would pass |
| B9 | FDTD end criterion and ring-down; port de-embedding | S errors near resonance | V16 (passivity/reciprocity) | Partial |
| B10 | Frequency interpolation of S (linear) between FDTD samples | Small errors | none | Open |
| B11 | Field superposition normalisation (uf_inc at f0 interpolated) | B1 amplitude and phase errors between ports | none | Open: could test that superposed fields reproduce a direct run |
| B12 | Exact-segment B1 formula singular on the line extension (den → 0 skipped) | Missing contributions at special points | V14 | Covered for test points |

## C. Code correctness (bugs)

| # | Failure mode | Consequence | Detection | Status |
|---|---|---|---|---|
| C1 | Unit mix-ups (mm/m, nH/H, pF/F, µT/T), especially at the Python ↔ JS boundary | Wrong values everywhere | V8, V11, V14, V15 | Partial |
| C2 | Sign and direction conventions (current direction, mirror reversal, port direction) | Wrong coupling sign or superposition | V9 | Partial (geometry only) |
| C3 | Ring layout index bookkeeping (twins, midline) | Asymmetric arrays | V9 | Covered |
| C4 | Multi-start selection compares runs with different definitions | Wrong "best" | none | Open |
| C5 | Free-mode zone penalty uses a 1.1·Rf disc; wires reaching beyond it | Zone violations | V12 | Covered (final report counts real wires) |
| C6 | App: stale worker results overwriting newer ones; races between element, pair, solve and B1 workers | Wrong numbers displayed | none | Open: no UI tests |
| C7 | App: loading a JSON from an older version (missing fields) | Crashes or silent defaults | none | Open |
| C8 | Exports: port CSV mapping flat → wrapped index assumes identical sampling | Ports at wrong positions | none | Open: could cross-check against the exported case |
| C9 | export_case.js wraps at 600 points while the solver uses 300 | Inconsistent geometry between quasi-static and full-wave | none | Open |
| C10 | cut_wire: breaks near the polyline seam, or two breaks closer than the gap | Malformed wires or overlapping ports | none | Open |
| C11 | Lumped port terminals not on mesh lines (edges2grid) | Port geometry altered silently | none | Open |
| C12 | `reduce()` ill-conditioned (huge "open" termination 1e9 Ω) | Numerical noise | none | Open |
| C13 | Hidden global state in KC modules shared across workers | Inconsistent defaults | none | Partial |
| C14 | `validation_status.js` and the reports go stale relative to the code (partial `KC_ONLY` runs overwrite the full report) | App shows wrong validation status | git hash in report | **Open: happened** (a partial run was committed in 5f60ace) |

## D. Validation design (are the checks themselves right?)

| # | Failure mode | Consequence | Status |
|---|---|---|---|
| D1 | Checks testing implementation against itself (circular) | False confidence | Partial: V14 fixed this for B1; V15 calibration risk |
| D2 | Thresholds JUDG, not justified (0.5%, 20%, −15 dB…) | Pass/fail arbitrary | Open (disclosed) |
| D3 | Harness changes after seeing results | Moving goalposts | Logged each time; criteria unchanged; still a risk |
| D4 | Test cases unrepresentative (circles, single trefoil) of arrays actually used | Bugs in other regimes hidden | Open |
| D5 | Tuning parameters on C2 configurations (development overlap) | Biased comparison | Partially avoided, disclosed |
| D6 | V3 permanently NOT EVALUABLE | The classic overlap reference is never checked | Open (needs the paper) |
| D7 | No bench validation at all | Everything stays exploratory | Open |
| D8 | Pre-registration commit order not verifiable by readers | Integrity claim weaker | Git history present |

## E. Research integrity, provenance, documentation

| # | Failure mode | Status |
|---|---|---|
| E1 | Unverified values creeping in as "facts" (σ_Cu, tissue values, λ/10, phantom layers) | Labelled; σ_Cu CONV without a cited source |
| E2 | Documents disagree with code (e.g. Design §10 architecture outdated; README validation table stale) | **Open: §10 is outdated** |
| E3 | AI-authorship headers missing on new files | To check |
| E4 | Third-party licences (openEMS GPL, mariepy GPL, Magpylib BSD, Three.js MIT) not listed | Partial: README lists Three.js only |
| E5 | Personal data in the package (email in git) | Disclosed |
| E6 | IP: sharing before an OIP disclosure | Disclosed; Reza's decision |
| E7 | Decisions taken without Reza (field strength, matching, installs) | Logged; need confirmation |

## F. Environment, reproducibility, packaging

| # | Failure mode | Status |
|---|---|---|
| F1 | Solver paths hard-coded to this machine | Overridable by environment variable; documented? |
| F2 | Library versions not pinned in a requirements file | Open |
| F3 | openEMS Windows performance warning (their docs mention MSVC slowdowns) | Noted |
| F4 | Large simulation outputs in OneDrive | Work files kept outside; outputs in `sim/out` could grow |
| F5 | `file://` launch untested | Open |
| F6 | Browser memory or time with large N (wires, tubes, STL) | Open |
| F7 | Python 3.14-only openEMS wheels | Documented? |
| F8 | mariepy pulls in a heavy dependency (PyTorch); immature | Noted |

## G. Human factors and misuse

| # | Failure mode | Status |
|---|---|---|
| G1 | Users read exploratory numbers (capacitor values, k) as build-ready | Labels present; the fabrication sheet must repeat them |
| G2 | Placeholders forgotten (wire, helmet, zones, tissue) | Shown in UI headings; easy to miss |
| G3 | "Decoupled" verdict misunderstood (which definition?) | Three verdicts shown; could confuse |
