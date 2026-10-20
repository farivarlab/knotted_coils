# Knotted-Loop Receive Array Designer — Design Document

**Status:** FROZEN v1.1 (v1.0 approved by Reza Farivar 2026-10-20; v1.1 change to §5 approved by Reza 2026-10-20, see §12) · **Date:** 2026-10-20 · **Owner:** Reza Farivar · **Drafted with:** Claude (Anthropic), AI-assisted

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
| **Bloom (β)** | Lobe-amplitude parameter. β→0 collapses the strands toward one circle (overlapping but still knotted); larger β opens the lobes |
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
r(φ) = R · (1 + β · cos(q·φ))
x(φ) = r(φ) · cos(p·φ + θ)
y(φ) = r(φ) · sin(p·φ + θ)
z(φ) = h · sin(q·φ)          ← over/under at crossings only
```

- **q** = number of lobes; **p** = number of windings; **gcd(p, q) = 1** is required, otherwise the curve is a link of several separate loops rather than one knot.
- **R** = core radius, which sets element size; **θ** = in-plane rotation.
- **h** = crossing lift. It must be at least one wire diameter plus insulation. Its job is to keep the over/under topology; it is not 3D shape.
- Number of crossings in this projection = **q·(p−1)**.
- Footprint radius = R·(1+β).

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

- β ∈ [β_min, β_max], with **β_min > 0** (default 0.02) and β_max < 1 (default 0.9). At β = 0 the strands meet and the topology is lost; at β = 1 the lobes touch the centre.
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

**Neighbours (v1.1):** the *nearest ring* — pairs whose centres are closer than 1.35 × the pair-null spacing (the spacing at which two flat elements have k = 0). In a hexagonal layout the second ring sits at about 1.73 × that spacing, so it is excluded. *(v1.0 defined neighbours as pairs whose footprints overlap or touch, d < 2 Rf. Knots null only at heavy overlap, about 1.14 Rf for a trefoil at β = 0.4, so under the v1.0 rule second-ring pairs also counted as neighbours and could not be nulled at the same time. The v1.0 rule stays selectable, and its verdict is always reported alongside.)* The max term is there so one bad pair can't hide behind a good average. **Not yet implemented — see §12, v1.1.**

### 5.2 Solver strategy (two stages, so it stays interactive)

1. **Flat lookup stage.** For the chosen (p, q, β, wire), precompute k between two coplanar elements as a function of centre distance d and both rotations, k(d, θ₁, θ₂). Elements of the same type share the table. The initial layout is a near-uniform spread of N centres over the region (a spherical spiral). The optimiser then adjusts positions, rotations and R using the table, which takes milliseconds per evaluation.
2. **Full 3D refinement.** Starting from stage 1, recompute k with the exact Neumann integral on the curved, projected wire paths and refine locally. This runs in a background worker so the page stays responsive.

### 5.3 What "decoupled" can and cannot mean

- A single pair of knots can usually be nulled (k = 0) at one or more spacings. Knots can have **several zero-coupling spacings**. The tool reports all of them, with their sensitivity (dk/dd). A shallow zero tolerates fabrication error; a steep one does not.
- On a curved helmet, elements have **irregular neighbour counts** (5, 6 or 7 neighbours, like the panels of a geodesic dome). A knot with q-fold symmetry generally **cannot null every neighbour at once**. The tool will:
  - show a per-pair residual |k_ij|, colour-coded, plus the worst pair and the median;
  - report **next-nearest-neighbour coupling**, which geometry cannot null even for circular loops and which is normally handled by preamplifier decoupling;
  - never present the array as "fully decoupled" unless every neighbour pair (nearest ring, v1.1) meets the threshold. Always report the v1.0 verdict (all overlapping footprints) next to it. The default threshold is |k| < 0.01; that value is a placeholder, decision D6.
- **N is unlimited in principle.** The performance target is interactive optimisation up to N = 64 and batch (slower) optimisation up to N = 128.

## 6. EM model

- **Mutual inductance:** the Neumann double integral, computed numerically over polyline wire paths. The default is 400 points per element, adaptive by convergence (§7, V4).
- **Self-inductance:** Neumann with a finite-wire-radius correction, so the formula does not blow up where the wire meets itself. The method will be the standard thin-wire approach, with the reference verified before implementation.
- **Singular points:** where wires of different elements cross, the true 3D separation (lift plus wire radius) is used, never zero. The sensitivity of k to the lift value is reported.

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
  tests/           Node.js unit tests + validation checks V1–V6
  validation/      generated validation reports
  PARAMETERS.md    parameter registry with origin tags
  Design.md / .html / .pdf
```

- The app opens straight from OneDrive by double-clicking `index.html`, with no server and no install. The optimiser runs in a background worker created from inline code.
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
