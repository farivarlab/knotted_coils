# Knotted-Loop Receive Array Designer — Design Document

**Status:** FROZEN v1.7 (v1.7 = full-wave capacitor co-simulation, requested by Reza 2026-10-20 evening; v1.6 = major update approved by Reza: ring layouts, face zones, capacitor breaks, multi-start, save/load, B1 Tier 1; v1.5 adds a quick B1 view, requested by Reza; v1.0 approved by Reza Farivar 2026-10-20; v1.1 (§5), v1.2–v1.3 (§3, §7 V7) requested by Reza; v1.4 = fix of v1.3 after V7 failed; see §12) · **Date:** 2026-10-20 · **Owner:** Reza Farivar · **Drafted with:** Claude (Anthropic), AI-assisted

> **Freezing rule.** Once Reza approves this document it becomes v1.0. After that, any change to the geometry definitions, the electromagnetic (EM) model or the validation criteria needs a dated changelog entry (§12). The validation criteria in §7 are pre-registered: they are fixed before any code exists, and failures will be reported as failures.

---

## 1. Purpose

This is a browser-based tool, backed by a JavaScript geometry package, for designing **MRI receive phased arrays built from knotted wire loops** on a **helmet former**. A former is the rigid shell the coil wires are mounted on.

It must:

1. Generate a single knotted loop with **1 to 8 lobes**, controlled by a small set of shape parameters.
2. **Bloom** each knot. Bloom continuously opens the lobes outward or collapses them toward a loop-like footprint whose strands overlap, without changing the knot's topology.
3. Place **any number N of elements** on a helmet and **automatically decouple them geometrically**. For a chosen knot and bloom, it finds element size, positions and rotations that drive the mutual inductance between neighbouring elements toward zero.
4. Report honestly where decoupling cannot be achieved, and export everything needed to build the array and to simulate it.

**Scope boundary.** All EM outputs are *quasi-static geometric estimates*: low-frequency results computed from wire geometry alone. They are not predictions of SNR (signal-to-noise ratio), B1 sensitivity, or coupling as measured on the bench. See §8.

## 2. Glossary

| Term | Meaning here |
|---|---|
| **Knot** | A closed curve in 3D that cannot be untangled into a plain circle without cutting it |
| **Projection / flat knot** | The knot drawn in a plane, with each crossing marked over/under. Our elements are flat knots: the wire lies on the former, and it only lifts by about one wire diameter where it crosses itself |
| **Torus knot T(p,q)** | A knot that winds *p* times around a central axis and *q* times through it. Viewed from above it is a rosette with *q* lobes |
| **Lobe** | One outward petal of the rosette |
| **Crossing** | A point where the wire passes over itself |
| **Bloom (β)** | Lobe-length parameter (v1.2). The base circle stays fixed and each lobe extends outward by β × base radius, so lobe aspect ratio rises with β. β→0 collapses the strands onto the base circle (overlapping but still knotted) |
| **Mutual inductance (M)** | How much magnetic flux from a current in one coil threads another coil. M≈0 means the two coils are geometrically decoupled |
| **Self-inductance (L)** | Flux from a coil threading itself |
| **Coupling coefficient (k)** | k = M / √(L₁L₂). A dimensionless measure of coupling in the range −1 to 1, comparable across coils of different sizes |
| **Neumann formula** | M = (μ₀/4π) ∮∮ dl₁·dl₂ / \|r₁−r₂\|, a double line integral over both wire paths (μ₀ = permeability of free space) |
| **Quasi-static** | Assumes uniform current along the wire and ignores wave effects, capacitance and the body (patient load) |
| **Full-wave simulation / bench S21** | The methods that give the real answer. Full-wave simulation is a complete EM solver; bench S21 is coupling measured between two coils on a network analyser |
| **Former** | The physical helmet shell that the wires are mounted on |

## 3. Element geometry

### 3.1 Knot family (v1): planar torus knots

Each element is a torus knot laid flat in a local plane, with coordinates in that plane (x, y) and a small out-of-plane offset (z) for crossings, for φ ∈ [0, 2π):

```
r(φ) = R · (1 + β · (1 + cos(q·φ)) / 2)     ← v1.2 "outward" (default)
r(φ) = R · (1 + β · cos(q·φ))               ← v1.0 "symmetric" (kept as an option)
x(φ) = r(φ) · cos(p·φ + θ)
y(φ) = r(φ) · sin(p·φ + θ)
z(φ) = h · sin(q·φ)          ← over/under at crossings only
```

- **q** = number of lobes; **p** = number of windings; **gcd(p, q) = 1** is required, otherwise the curve is a link of several separate loops rather than one knot.
- **R** = core radius, which sets element size; **θ** = in-plane rotation.
- **h** = crossing lift. It must be at least one wire diameter plus insulation. Its job is to keep the over/under topology; it is not 3D shape.
- Number of crossings in this projection = **q·(p−1)**.
- Footprint radius = R·(1+β) for both shapes. With the outward shape the innermost radius stays R, so lobes only grow outward.

### 3.2 Catalogue: 1 to 8 lobes

For each lobe count, the simplest valid choice (smallest p ≥ 2 coprime to q):

| Lobes q | Windings p | Knot | Crossings in this drawing | Notes |
|---|---|---|---|---|
| 1 | 2 | T(2,1) = unknot | 1 | Topologically trivial: an off-centre 2-turn coil. Useful as a control |
| 2 | 3 | T(3,2) = trefoil | 4 | Same knot as row 3, drawn with 2 lobes |
| 3 | 2 | T(2,3) = trefoil | 3 | Simplest true knot |
| 4 | 3 | T(3,4) | 8 | |
| 5 | 2 | T(2,5) = cinquefoil | 5 | |
| 6 | 5 | T(5,6) | 24 | 5 windings means a lot of wire. Even lobe counts are expensive for torus knots |
| 7 | 2 | T(2,7) | 7 | |
| 8 | 3 | T(3,8) | 16 | |

Higher p for the same q is also allowed, e.g. T(3,5) or T(3,7), giving more windings and more crossings.

**Control element:** p = 1 gives a simple q-petal rosette loop with no crossings. It is not a knot. It's included so knots can be compared against a non-knotted loop with the same footprint.

**How many knot families exist?** There are infinitely many knots. Tables list about 35 distinct prime knots with up to 8 crossings (UNVERIFIED count, from memory; to be checked against the KnotInfo database before it is cited anywhere). For coils, the useful question is which *families have a clean parametric form*:

- **Torus knots**: rosettes with exact q-fold symmetry. These are v1.
- **Lissajous knots**: more irregular, with no rotational symmetry. They give even lobe counts more cheaply. Deferred to v2.
- **Fourier knots**: a general form that can represent any knot from the tables. Deferred to v2.

### 3.3 Bloom

- β ∈ [β_min, β_max], with **β_min > 0** (default 0.02) and **β_max = 3.0** (v1.2, outward shape). At β = 0 the strands meet and the topology is lost.
- *(v1.0 symmetric shape: β_max < 1, default 0.9. At β = 1 the lobes touch the centre.)*
- **Bloom mode** (open decision D2): either *constant core* (R fixed, footprint grows with β) or *constant extent* (footprint radius fixed, R shrinks as β grows).
- β can be set globally or per element.

### 3.4 Wire

| Parameter | Meaning |
|---|---|
| Wire diameter d_w | Conductor diameter |
| Insulation thickness t_i | Sets the minimum crossing lift h ≥ d_w + 2·t_i |
| Minimum bend radius | Fabrication limit. Violations are flagged, never silently smoothed |

**Geometry checks, always reported:** total wire length, minimum 3D self-clearance (must be ≥ d_w + 2·t_i), minimum bend radius, and crossing count.

## 4. Helmet surface

- **v1:** a parametric hemi-ellipsoid (semi-axes a, b, c) with a coverage boundary, i.e. the lowest elevation the array reaches and a face opening. The default dimensions are **placeholders**, tagged as such in the parameter registry until Reza supplies real former dimensions.
- **v2:** import the real former as an STL file (a 3D mesh format).
- **Placing an element on the surface:** the flat knot is defined in the tangent plane at the element's centre, then projected onto the surface along the surface normal. Crossing lift is applied along the normal. This deforms the knot slightly; the deformation is measured and reported.
- **Crossings between elements:** where wires from neighbouring overlapping elements cross, they need a lift too. The tool assigns over/under at these crossings and checks clearance.

## 5. Array layout and automatic decoupling

### 5.1 The problem

Given **N, the knot T(p,q), β, the wire, and the helmet coverage region**, find:

- element size R (shared by all elements by default; per-element sizes allowed within bounds, decision D3),
- each element's centre on the surface (2 degrees of freedom each),
- each element's in-plane rotation θᵢ,

that **minimise neighbour coupling** while **covering** the region:

```
minimise   Σ_(i,j neighbours) k_ij²   +   λ_cov · (uncovered area)   +   λ_max · max |k_ij|
subject to wire-clearance constraints
```

**Neighbours (v1.1):** the *nearest ring* — pairs whose centres are closer than 1.35 × the pair-null spacing (the spacing at which two flat elements have k = 0). In a hexagonal layout the second ring sits at about 1.73 × that spacing, so it is excluded. *(v1.0 defined neighbours as pairs whose footprints overlap or touch, d < 2 Rf. Knots null only at heavy overlap, about 1.14 Rf for a trefoil at β = 0.4, so under the v1.0 rule second-ring pairs also counted as neighbours and could not be nulled at the same time. The v1.0 rule stays selectable, and its verdict is always reported alongside.)* The max term is there so one bad pair can't hide behind a good average. It was implemented after v1.1 as a smooth λ_max·k⁴/thr² term (v1.1 addendum, §12).

### 5.2 Solver strategy (two stages, so it stays interactive)

1. **Flat lookup stage.** For the chosen (p, q, β, wire), precompute k between two coplanar elements as a function of centre distance d and both rotations, k(d, θ₁, θ₂). Elements of the same type share the table. The initial layout is a near-uniform spread of N centres over the region (farthest-point sampling followed by 20 Lloyd relaxation steps; `core/layout.js`). The optimiser then adjusts positions, rotations and R using the table, which takes milliseconds per evaluation.
2. **Full 3D refinement.** Starting from stage 1, recompute k with the exact Neumann integral on the curved, projected wire paths and refine locally. This runs in a background worker so the page stays responsive.

### 5.3 What "decoupled" can and cannot mean

- A single pair of knots can usually be nulled (k = 0) at one or more spacings. Knots can have **several zero-coupling spacings**. The tool reports all of them, with their sensitivity (dk/dd). A shallow zero tolerates fabrication error; a steep one does not.
- On a curved helmet, elements have **irregular neighbour counts** (5, 6 or 7 neighbours, like the panels of a geodesic dome). A knot with q-fold symmetry generally **cannot null every neighbour at once**. The tool will:
  - show a per-pair residual |k_ij|, colour-coded, plus the worst pair and the median;
  - report **next-nearest-neighbour coupling**, which geometry cannot null even for circular loops and which is normally handled by preamplifier decoupling;
  - never present the array as "fully decoupled" unless every neighbour pair (nearest ring, v1.1) meets the threshold. Always report the v1.0 verdict (all overlapping footprints) next to it. The default threshold is |k| < 0.01; that value is a placeholder, decision D6.
- **N is unlimited in principle.** The performance target is interactive optimisation up to N = 64 and batch (slower) optimisation up to N = 128.

## 6. EM model

- **Mutual inductance:** the Neumann double integral, computed numerically over polyline wire paths. Points per element: 300 in the final report (V4 checks convergence there), 160 during the exact search stage, 128 in the lookup table, 96 in ring-mode search.
- **Self-inductance:** Neumann with a finite-wire-radius correction, so the formula does not blow up where the wire meets itself. The method will be the standard thin-wire approach, with the reference verified before implementation.
- **Singular points:** where wires of different elements cross, the true 3D separation (lift plus wire radius) is used, never zero. The sensitivity of k to the lift value is reported.

## 6b. Full-wave capacitor co-simulation (v1.7)

**Purpose (Reza):** choose capacitor values for a **head-loaded** coil, and measure how the capacitors change **decoupling** and **B1**. Python only, no MATLAB.

**Pipeline**
1. **Case export** (`tests/export_case.js`, or the app's "Export simulation case"). A JSON file with:
   - wire polylines in world mm;
   - wire radius;
   - capacitor breaks from `KC.knot.breaks` (position, tangent; the first break per element is the **feed**);
   - B0 and Larmor frequency;
   - phantom choice.
2. **Full-wave solve** (`sim/run_openems.py`, openEMS 0.37.0 Python, FDTD).
   - **Model contents:**
     - wires as thin PEC curves (`AddCurve`) on the grid. `AddWire` with the real radius disconnected on coarse grids; the real radius enters through the thin-wire correction (V15b);
     - a 50 Ω lumped port in every break gap, aligned to the mesh axis closest to the wire tangent;
     - a three-layer ellipsoidal head phantom (skin, skull, brain) shaped like our head model.
   - **Runs:** one per port (that port excited, all others 50 Ω), giving the multiport S-matrix over a band around f0 and frequency-domain H-field planes at f0.
3. **Circuit co-simulation** (`sim/cosim.py`, numpy/scipy). The capacitors are applied to the solved port matrix; no re-simulation is needed.
   - **Tuning:** every non-feed break gets the same tuning capacitor C_t (per element).
   - **Feed network:** a shunt C_m across the feed gap, then a series inductor L_m to the receiver.
   - **Matching and preamp decoupling, solved together:** the feed-gap impedance Z_c = R + jX of the loop (all other gaps terminated) must satisfy **X = √(50·R)**. That fixes C_t by a 1-D root search, then **C_m = 1/(ωX)** and **L_m = X/ω**. With this choice the network matches 50 Ω, and **L_m resonates with C_m**, so a low-impedance preamp presents a high impedance in the loop (preamp decoupling). Derivation in `sim/cosim.py` (DERIVED, Claude).
   - **Arrays:** elements are tuned in turn, the others terminated by their preamp-decoupling networks; repeat 3 passes.
   - **Losses:**
     - copper skin-effect wire resistance, σ_Cu = 5.8e7 S/m (CONV, standard handbook value; not cited);
     - capacitor ESR from Q_C = 1000 (JUDG PLACEHOLDER);
     - inductor Q_L = 100 (JUDG PLACEHOLDER);
     - preamp input impedance 2 Ω (JUDG PLACEHOLDER).
4. **Evaluation (the "effect of the capacitors")**
   - **Capacitor values** (C_t, C_m, L_m), loaded and unloaded, per element and per field strength.
   - **S11** of each tuned element.
   - **Coupling:**
     - S21 between receiver ports with 50 Ω terminations (what a bench would measure);
     - the coupling that remains with preamp decoupling;
     - effective mutual inductance M_eff = Im(Z_ij)/ω between element feed gaps with the tuning capacitors in place, compared with our quasi-static M.
   - **B1⁻ per element:** fields from the port runs, superposed with the network solution (reciprocity: the element's receiver port is driven, the others are preamp-terminated). Compared with our quasi-static uniform-current B1 on the same planes.
5. **Outputs:** `sim/out/<case>/cosim.json`, plus PNG plots (S-parameters, B1 maps). The validation runner (`tests/run.js`) aggregates the V15–V20 verdicts. The app can load `cosim.json` (capacitor table, S21, coupling, B1 metrics).

**Phantom tissue properties:**
- **7T (298 MHz):** values from openEMS's bundled `phantom_head_298MHz.h5`, which openEMS attributes to the IT'IS database (Gabriel model): brain εr 52.7, σ 0.95 S/m; skull 11.4, 0.29; skin 38.9, 0.84. **Secondary source; not independently verified.**
- **3T (128 MHz):** an **approximation**. openEMS's 128 MHz *body* phantom values are mapped onto the head layers ("Tissue" → brain 62.8 / 0.66, bone → skull 12.5 / 0.13, skin 46.8 / 0.58). Verified 128 MHz head tissue values are an open item.
- **Layers:** skin 4 mm, skull 7 mm (JUDG PLACEHOLDER), inside the head ellipsoid (helmet − 10 mm).

**Scope tonight:** a circular loop (validation), a single trefoil element (air and head, 3T and 7T), and a trefoil pair in the head at 3T across 3 spacings. Full arrays are expensive in FDTD (one run per port) and are left for later, via mariepy if it proves usable, or long openEMS runs.

## 7. Validation plan (pre-registered)

Each check runs automatically in the test suite and appears in a validation report. **Pass criteria are fixed now.**

| ID | Check | Reference | Pass criterion |
|---|---|---|---|
| V1 | Mutual inductance of two coaxial circular loops | Maxwell's closed-form result (elliptic integrals). Source to be verified against a primary or textbook text | Relative error < 0.5% across 5 separations |
| V2 | Self-inductance of a circular wire loop | Standard thin-wire formula, L ≈ μ₀R(ln(8R/a) − 2) for high-frequency (skin-effect) current. UNVERIFIED, to be checked against Grover or an equivalent primary source | Relative error < 2% for R/a ≥ 50 |
| V3 | Zero-coupling spacing for two coplanar equal circles | Numerically known overlap; recalled as centre spacing ≈ 0.75 × diameter, Roemer et al. 1990, *Magn Reson Med* "The NMR phased array". UNVERIFIED, to be verified against the paper | Our zero within 1% of the verified value |
| V4 | Convergence | Internal | k changes < 0.001 when the point count doubles |
| V5 | Symmetry | Internal | M_ij = M_ji to machine precision; k invariant under rotating both elements by 2π/q |
| V6 | Topology preserved under bloom | Internal | Crossing count and over/under pattern unchanged across β ∈ [β_min, β_max]; minimum self-clearance ≥ d_w + 2·t_i |
| V9 *(v1.6, pre-registered)* | Exact left–right symmetry of ring layouts | Internal | Ring-mode arrays T(2,3) β=0.8 N=16 and T(2,5) β=0.8 m=2 N=24:<br>• every mirror pair's wires coincide with the mirror image to < 1e-9 mm;<br>• k is unchanged under the mirror swap to < 1e-9, for pairs without a midline element;<br>• < 1e-3 for pairs that include a midline element (its crossing lift is not mirror-symmetric) |
| V10 *(v1.6, pre-registered)* | Capacitor break placement | Internal | All catalogue knots × β ∈ {0.4, 1.5} × m ∈ {1, 4} × breaks ∈ {4, 8} (core R = 30 mm, clearance 5 mm). Whenever the placer reports success:<br>• every break is ≥ 5 mm along the wire from every crossing pass;<br>• longest ÷ shortest segment ≤ 1.5.<br>Cases reported as infeasible are counted, not failed |
| V11 *(v1.6, pre-registered)* | Capacitor value | Closed form C = n / (ω²L), using the verified ring self-inductance (Rosa & Grover eq. [62]) | Circular loop R = 50 mm, wire radius 0.5 mm, n = 4 and 8, at 3T and 7T: our per-capacitor value within 1% of the closed form |
| V12 *(v1.6, pre-registered)* | Face exclusion zones respected | Internal | Arrays from every V9 and C2 configuration: zero final-report wire points inside any exclusion zone (zone boundary itself, margin excluded) |
| V13 *(v1.6, pre-registered)* | Reproducibility | Internal | The same configuration and seed solved twice (free fast; ring) gives identical centres, rotations and k matrix (difference = 0) |
| V14 *(v1.6, pre-registered)* | B1 implementation, Tier 1 | Independent library: Magpylib 6.x `current.Polyline` (Ortner & Coliado Bandeira 2020, SoftwareX 11:100466; licence and API verified 2026-10-20) | Three cases, the identical thinned wire paths the app uses, about 1,000 points each:<br>(a) one flat trefoil;<br>(b) one T(2,5) element at β = 1.5, m = 4;<br>(c) a solved 16-element array.<br>\|B_ours − B_magpylib\| / \|B_magpylib\| < 0.5% at every point ≥ 10 mm from any wire (the head gap). Points 5–10 mm away are reported for information only |
| V15 *(v1.7, pre-registered)* | Full-wave model sanity: resonance | Prediction from our validated L (V2) and first-pass C | Circular loop R = 40 mm, wire radius 0.5 mm, 4 breaks, in air. Capacitors from `KC.knot.capacitor(L_ours, 4, 3 T)` applied to the openEMS port matrix give a resonance within ±5% of 127.73 MHz |
| V15b *(v1.7, pre-registered after V15's first run and BEFORE any trefoil run)* | Thin-wire correction carries over to a different geometry | Our quasi-static L (Neumann; V1, V2, V4) | openEMS models wires as thin curves on the grid (an effective radius set by the grid). The effective radius a_eff is calibrated on the circular loop by inverting Rosa & Grover eq. [62]. Each element's loop inductance is then corrected by ΔL = (μ₀/2π)·ℓ·ln(a/a_eff), where ℓ is the wire length (DERIVED, the thin-wire dependence of L on radius). For the single trefoil in air at 3T (same grid), the corrected full-wave L is within 5% of our quasi-static L |
| V16 *(v1.7, pre-registered)* | Extracted S-matrix is physical | Internal | Every openEMS case, every frequency in the band: largest singular value of S ≤ 1.001 (passive), and \|S_ij − S_ji\| ≤ 0.02 (reciprocal) |
| V17 *(v1.7, pre-registered)* | Co-simulation achieves tuning and matching | Internal | Every tuned element in every case: \|S11(f0)\| ≤ −20 dB; all chosen C_t, C_m, L_m are positive and finite |
| V18 *(v1.7, pre-registered)* | B1 Tier 2: is the quasi-static map valid near the surface? | openEMS full-wave with capacitors and phantom (exploratory; one solver) | Single trefoil, head-loaded, per field strength: normalised \|B1⁻\| (each map scaled to its own maximum in the plane) agrees with the quasi-static map within 20% at every phantom point within 20 mm of the head surface, on the axial and coronal planes. **Classification:** PASS = the quasi-static map is valid near the surface for that case. The depth at which disagreement first exceeds 20% is reported either way |
| V19 *(v1.7, pre-registered)* | Does the quasi-static null survive capacitors and load? | openEMS + co-simulation | Trefoil pair, head-loaded at 3T, centre spacings {d₀ − 4, d₀, d₀ + 4} mm, where d₀ is the quasi-static null (Pair explorer, rotations 0/0). PASS if \|S21(f0)\| with 50 Ω terminations ≤ −15 dB at d₀, **and** the smallest \|S21\| of the three is at d₀ (null bracketed) |
| V20 *(v1.7, pre-registered)* | Second solver | mariepy (MARIE port; immature) | Single trefoil, head-loaded: capacitor values within 10% of openEMS's. NOT EVALUABLE if mariepy cannot be installed or run on this machine |
| V8 *(added v1.5, pre-registered before running)* | B1 (Biot–Savart) field of a circular loop on its axis | Closed form B = μ₀IR² / (2(R² + z²)^{3/2}), DERIVED from Biot–Savart (derivation in `core/field.js`) | Relative error < 0.5% at z = 0, 10, 20, 40, 80 mm for R = 50 mm, 400 points |
| V7 *(added v1.3, pre-registered before running)* | Topology preserved under petal sharpness | Internal | Every catalogue knot (core R = 30 mm, placeholder wire), every m ∈ {1, 1.5, 2, 3, 4, 6, 8, 12, 16} × β ∈ {0.1, 0.4, 0.8, 1.5, 3.0}: crossing count = q(p−1); over/under pattern equals the pattern at m = 1, β = 0.4 (up to the starting point); lift solvable with minimum self-clearance ≥ d_w + 2·t_i |

If a check fails, the app shows a banner and every EM output is labelled "UNVALIDATED".

## 8. Known limitations (shown in the app, not hidden)

- The quasi-static filament model ignores capacitive coupling, the sample/body load, non-uniform current near self-resonance, and coupling through the preamplifiers.
- **Results are "geometric decoupling estimates, exploratory".** Confirm with full-wave simulation or bench S21 before building anything that depends on them.
- The knot geometry is not optimised for SNR, only for coupling and coverage.

## 9. Outputs

- **Views:** 3D helmet with the array; flat view of a single element; coupling-matrix heatmap (k_ij); per-pair table; plot of k against spacing for one pair.
- **Exports:**
  - JSON: every parameter plus the software version, so any design can be regenerated exactly;
  - CSV: 3D wire path per element (for EM simulators) and the k matrix;
  - OBJ/STL: wire tubes and, in v2, a former with routing grooves;
  - validation report (HTML).

## 10. Architecture

```
knotted_coils/
  core/          geometry + EM package (plain JavaScript, no build step)
    knot.js        torus-knot generation, bloom, wire checks
    surface.js     helmet surface, tangent-plane projection
    inductance.js  Neumann M and self-L
    layout.js      initial placement, neighbour detection
    optimise.js    two-stage decoupling solver
  app/index.html   browser UI (3D view via Three.js, a pinned copy stored locally so it works offline)
  core/field.js    exact-segment Biot–Savart B1; core/phantom.js  head phantom constants (v1.7)
  sim/             full-wave pipeline (Python/openEMS): run_openems.py, cosim.py, v20_mariepy.py, run_queue.sh
  tests/           validation suite V1–V20 + comparisons; export_case.js; b1_crosscheck.py
  validation/      generated validation reports
  PARAMETERS.md    parameter registry with origin tags
  Design.md / .html / .pdf
```

- The app is designed to open from OneDrive by double-clicking `index.html`. That is **untested**; serving it with `node tools/serve.js` is tested. Heavy maths runs in background workers created from inline code.
- Every source file carries an AI-authorship header, as required by the research-integrity framework.

## 11. Open decisions (to settle before freezing)

| ID | Decision | Proposed default |
|---|---|---|
| D1 | Knot families in v1 | Torus knots T(p,q), q = 1–8, plus the p = 1 rosette control. Lissajous in v2 |
| D2 | Bloom mode | Offer both; default *constant core* |
| D3 | Element size | Shared R for all elements; per-element R as an option |
| D4 | Helmet geometry source | Parametric hemi-ellipsoid now; STL import in v2. **Reza to supply former dimensions** |
| D5 | Wire spec | **Reza to supply** diameter, insulation and minimum bend radius |
| D6 | Decoupling threshold | \|k\| < 0.01 (placeholder until justified) |
| D7 | Mixed knots in one array | No for v1 (all elements the same knot); yes for v2 |

## 12. Changelog

- **2026-10-20 (night), v1.7 audit corrections (documentation only; no design change).** Fixed after the independent audit (`docs/AUDIT_REPORT_*.md`):
  - §5.1: the λ_max term *is* implemented.
  - §5.2: initial layout method described correctly.
  - §6: point counts.
  - §6b: thin curves plus thin-wire correction (not `AddWire`); outputs are `cosim.json` and PNGs.
  - §10: architecture.
  - The double-click launch is untested.
  - The §7 promise that every EM output is labelled "UNVALIDATED" when a check fails is now **implemented** in the app.
- **2026-10-20 (evening), v1.7 (Reza: "implement the full capacitance modelling, including choosing the capacitors and also evaluating the effect of the capacitor in the decoupling and the B1 field"; earlier: head-loaded values, Python not MATLAB).**
  - **New:** §6b pipeline: openEMS full-wave model with ports at the capacitor breaks; Python circuit co-simulation that chooses C_t, C_m and L_m with preamp decoupling; evaluation of capacitor effects on coupling and B1.
  - **Checks V15–V20** pre-registered before their code.
  - **Defaults taken because Reza was unavailable** (logged in DECISIONS.md):
    - both 3T and 7T;
    - matching = shunt-C, series-L with preamp decoupling;
    - installing openEMS 0.37.0 (Windows package and its Python 3.14 wheels) and mariepy, outside OneDrive.
  - **Results from earlier versions** (v1.6 official: C2 → free stays default; V7–V14 PASS) are in DESIGN_HISTORY.md.

- **2026-10-20, v1.6 (Reza: "Okay, let's do the major update!" — approving `docs/PROPOSAL_v2.md` with its proposed defaults).**
  - **Field strength:** Reza did not choose one, so capacitor values are selectable (1.5 / 3 / 7 T), default 3T.
  - **WP6 solver link:** deferred; the solver survey is in `docs/SOLVER_OPTIONS.md`.
  - **Scope:**
    - **WP3 multi-start:** K starts; seed 1 keeps v1.5 behaviour; seeds ≥ 2 jitter the start positions; the best is chosen by worst adjacent |k| in the exact final report, and the spread is reported. Selection cannot be worse than seed 1 on that metric, so there is no comparison test.
    - **WP11 head and zones:** a parametric head (helmet − 10 mm) with elliptical exclusion zones for the eyes and mouth (angular, centred on the helmet), with a 5 mm wire margin.
      - Default coverage changes: the face wedge is off and zCut is −20 mm. All zone values are placeholders (JUDG).
      - Zones are respected both in coverage and in the solver: footprint samples are tested in the fast stage, exact wire points in the exact stage and the final report.
    - **WP1/WP2 ring mode:**
      - Elements sit in rings (plus an optional top cap), mirror-symmetric about x = 0 by construction.
      - Per-ring parameters: elevation, spacing, rotation, and size / bloom / sharpness, each either fixed or optimised per ring.
      - Mirrored elements use the mirror-image knot. Midline elements are restricted to mirror-compatible rotations.
      - Ring mode evaluates exact Neumann coupling on wrapped wires directly, with no lookup table, because element shapes differ.
    - **New neighbour definition, "adjacent":** pairs whose regions touch, judged from which two elements are nearest to each helmet sample point (Voronoi adjacency, i.e. pairs whose zones of closest helmet points share a border).
      - It is reported for every mode and is the optimisation target in ring mode, because the v1.1 rule (1.35 × pair-null spacing) assumes one shared shape.
      - Free mode keeps the v1.1 rule as its target and reports both.
    - **Regularity score:** coefficient of variation of nearest-neighbour centre distances.
    - **WP4:** load a saved design.
    - **WP5:** capacitor breaks, placed by wire length with a crossing clearance; first-pass values C = n/(ω²L); Larmor frequency from γ/2π = 42.577 MHz/T (to verify against CODATA before citing); segment-length warning against λ/10, a rule of thumb (JUDG, not a cited value).
    - **WP12 Tier 1:** check V14.
  - **New checks:** V9–V14, plus comparison C2 (`validation/COMPARE_ring_vs_free_PROTOCOL.md`), all committed before the code that they test.
- **2026-10-20, v1.5 (requested by Reza): quick B1 visualisation.**
  - **Request (Reza):** "I just want a quick visualization that's reasonable. We will do simulations later."
  - **What it shows:** the quasi-static magnetic field per unit current (Biot–Savart) of the solved wires, either per element or combined as root-sum-of-squares √Σ|B1ᵢ|².
  - **Where:** on a placeholder head ellipsoid (helmet semi-axes minus 10 mm) and on axial, coronal or sagittal slices.
  - **What it ignores:** wave effects and tissue, which matter at 3T and 7T. Maps are labelled exploratory, for comparing coverage and depth fall-off between designs only.
  - **Scope:** this narrows the §1 and §8 exclusion of B1 maps. **E-fields remain excluded.**
  - **New check:** V8 (§7), pre-registered.
- **2026-10-20, v1.4: sharpness redefined after V7 FAILED (run 4, git 2188ab0).**
  - **Why v1.3 failed:** its power-law profile ((1+cos qφ)/2)^m added paired crossings to the flat drawing.
  - **New definition:** sharpness warps the lobe angle, ψ = qφ + a·sin(qφ) with a = 1 − 1/m. The same ψ drives both radius and lift, r = R(1 + β(1 + cos ψ)/2) and z = h·sin ψ.
  - **Why this keeps the diagram:** ψ is monotone in φ, so every crossing condition has the same number of solutions as at m = 1. The drawing therefore keeps exactly q(p−1) crossings with the same over/under pattern. This is Claude's argument; V7 tests it.
  - **Numerical fix, same commit:**
    - crossing and clearance searches use a spatial grid (checked identical to brute force: 0 of 108 crossing-count mismatches, 0 clearance difference);
    - the point-count rule requires a stable count across two doublings, max 25,600 points;
    - reason: one doubling stopped on a spurious count.
  - **V7 criterion and grid unchanged;** re-run on v1.4.
- **2026-10-20, v1.3 (requested by Reza): petal sharpness.**
  - **Request (Reza):** "Add a petal-sharpness control that narrows each lobe, with the same topology checks."
  - **§3.1 outward shape becomes** r = R(1 + β·((1 + cos qφ)/2)^m), with sharpness m ≥ 1.
    - m = 1 is exactly the v1.2 shape. Larger m narrows each lobe while keeping its tip and base radius fixed.
    - Range 1–16 (JUDG). It does not apply to the symmetric v1.0 shape.
  - **Lobe aspect ratio** (length ÷ width at half length) is now reported.
  - **The bloom-floor formula assumes m = 1.** For m > 1, buildability is judged by the clearance check alone.
  - **New check V7 (§7):** pre-registered and committed before it was run.
- **2026-10-20, v1.2 (requested by Reza): bloom extends the lobes instead of pinching.**
  - **Request (Reza):** "currently, 'bloom' is just pinching a portion of the loop. I want 'bloom' to make the lobes more extended, such that each lobe's aspect ratio would increase as I increase 'bloom'."
  - **New default §3.1 shape ("outward"):** r = R(1 + β(1 + cos qφ)/2).
    - The base circle R is fixed and each lobe grows outward by βR, so lobe length = β × R at a fixed base width.
    - It is still a torus knot, on a torus with centre radius R(1+β/2) and in-plane tube radius βR/2.
  - **§3.3:** β_max raised to 3.0.
  - **The v1.0 "symmetric" shape remains selectable,** so earlier results can be reproduced.
  - **Consequence:** the buildable bloom floor doubles to c / (R sin(π/p)), because strands separate half as fast with β.
  - **V6:** re-run over β = 0.02–3.0 with the same criterion.
  - **Earlier results used the symmetric shape:** validation run 2 and the worst-pair comparison were both done before v1.2.
- **2026-10-20, v1.1 addendum: worst-pair term implemented.**
  - The λ_max·max|k| term of §5.1 is now implemented as a smooth stand-in: λ_max·k⁴/thr² per neighbour pair, with λ_max = 1.
  - It was made the default by a pre-registered paired comparison (`validation/COMPARE_worstpair_PROTOCOL.md`, git 6d96721): all three criteria were met.
  - Trade-off: the worst pair gets lower, but the median |k| gets higher. Details are in DECISIONS.md.
  - The validation criteria V1–V6 are unchanged.
- **2026-10-20, v1.1 (approved by Reza).**
  - **§5.1 / §5.3, definition of "decoupled":** now means the *nearest ring* of neighbours (closer than 1.35 × the pair-null spacing). The v1.0 footprint-overlap rule remains a selectable option, and its verdict is always reported alongside.
  - **Reason:** knotted elements null only at heavy overlap, so under the v1.0 rule second-ring pairs counted as neighbours, and they cannot be nulled together with the first ring. Evidence is in DECISIONS.md: on a 16-element trefoil test, nearest-ring |k| reached about 0.01 while second-ring |k| reached about 0.08.
  - **Validation criteria V1–V6:** unchanged.
  - **Implementation deviation, disclosed at the same time (found by Claude while making this change):** the λ_max·max|k| term of the §5.1 cost function was **not implemented** in the solver as built (git b21c784). The solver minimises Σ w·k² + λ_cov·gaps only. The worst pair is reported but not targeted. This is still open; whether to implement it is Reza's call.
- **2026-10-20, v1.0 — FROZEN.** Reza approved all proposed defaults in §11 (D1–D7). Wire spec (D5) and helmet dimensions (D4) to follow from Reza; placeholders are used and labelled until then. Parameter tags follow the research-integrity code standard (LIT / CONV / JUDG / TUNED / DERIVED); "placeholder" values are tagged JUDG with the word PLACEHOLDER. The project also keeps `DECISIONS.md` and a README with a provenance and AI-use statement.
- **2026-10-20, v0.1:** first draft from design conversation. Bloom = lobe amplitude with knot topology preserved; flat knots; wire loops (not PCB); helmet former; unlimited N with automatic decoupling.
