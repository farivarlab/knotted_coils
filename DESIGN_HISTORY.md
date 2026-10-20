# Design History — Knotted Coil Designer

One place to see how the design evolved: every version, who asked for it and why, what changed, which checks were added, and what the checks found, failures included. Detailed rationale is in `DECISIONS.md`; Reza's requests, quoted, are in `docs/REQUEST_LOG.md`; the current specification is `Design.md`. Git hashes refer to this repository.

All work was done on 2026-10-20 unless a date is shown.

| Version | Trigger | Main change | Checks added (pre-registered) | Outcome |
|---|---|---|---|---|
| **v1.0** (git 39a4e83) | Reza: knotted receive loops, bloom, automatic decoupling, helmet, wire loops, up to 8 lobes | Torus-knot elements T(p,q); bloom = lobe amplitude (symmetric shape); Neumann-formula M and L; two-stage decoupling solver; browser app | V1 Maxwell coaxial M; V2 ring self-L; V3 coplanar-circle null; V4 convergence; V5 symmetry; V6 topology under bloom | Run 1: V1, V2, V4, V5 PASS; V3 NOT EVALUABLE (Roemer 1990 unread); **V6 FAIL** (bloom floor below 0.02, a point-count error, and a test-harness bug). Run 2: V6 FAIL only below the physical floor |
| *(no version)* | Reza: in-plane rotation as a lever | Rotation modes (free / locked / fixed) exposed | — | Free rotation lowered the worst nearest-ring \|k\| (one test) |
| **v1.1** (git ea9f761) | Reza: "Make nearest-ring the default definition of decoupled" | "Decoupled" = nearest ring; footprint verdict still reported. **Disclosed:** the λ_max worst-pair cost term had never been implemented | — | — |
| v1.1 addendum (git 6ce049e) | Reza: implement the worst-pair term and compare | Smooth k⁴ worst-pair term | Paired comparison (35 runs) | All 3 criteria met, so it became the default. Trade-off: the median \|k\| rose |
| **v1.2** (git 738072d) | Reza: bloom should lengthen lobes, not pinch | "Outward" bloom: fixed base circle, lobes extend; β up to 3 | V6 re-run over 0.02–3.0 | V6 FAIL only below the (doubled) bloom floor |
| **v1.3** (git 30d6fa1) | Reza: petal sharpness, with the same topology checks | Power-law lobe profile | **V7** topology under sharpness | **V7 FAIL** (run 4): extra paired crossings in the flat drawing |
| **v1.4** (git 7d7b6bf) | Fix after the V7 failure | Angle-warp sharpness (keeps q(p−1) crossings); grid crossing and clearance search; stricter point-count rule | — | Run 5: V7 FAIL at 1 of 360 points (resolution); run 6 with a higher point ceiling: **V7 PASS** |
| **v1.5** (git ff1a40e) | Reza: "a quick visualization that's reasonable" | Quick B1 view (Biot–Savart; head surface and slices); dB coupling plot | **V8** on-axis loop B1 | V8 PASS |
| **v1.6** (git 91c4df5 pre-registration; 5f60ace implementation; f120e53 results) | Reza: symmetric arrays, better placement, controllable bloom and size, face zones, independent B1 check, "let's do the major update" | Face exclusion zones (eyes, mouth); ring mode (mirror-symmetric, per-ring size/bloom/sharpness); multi-start; Voronoi adjacency; regularity score; capacitor breaks and first-pass values; save/load; **exact-segment B1** | **V9** symmetry, **V10** break placement, **V11** capacitor value, **V12** zones, **V13** reproducibility, **V14** B1 vs Magpylib; comparison **C2** ring vs free | Development runs: **V14 FAIL** (midpoint rule, about 1%), fixed with exact segments; **V9 FAIL** (current-direction sign convention), fixed. Official: V7–V14 PASS. **C2: ring failed all 3 criteria, so free stays the default** |
| **v1.7** (this version) | Reza: "implement the full capacitance modelling, including choosing the capacitors and also evaluating the effect of the capacitor in the decoupling and the B1 field" (head-loaded, Python, no MATLAB) | Full-wave co-simulation pipeline: openEMS (Python), lumped ports at the capacitor breaks, three-layer head phantom, circuit co-simulation that picks capacitor values with preamp decoupling, then capacitor effects on coupling and B1 | V15–V20 and V15b (Design.md §7) | V15 FAIL (raw FDTD resonance −10%: thin-wire effective radius ≈ 0.17 × grid cell, confirmed across 3 grids); other results in the validation report |
| v1.7 audit (night) | Reza: full audit in 4 steps | Brainstorm → independent review (Fable) → 4 area audits (Fable) → fixes. Main fixes: A1 clearance bug (lift too small for p ≥ 3 knots); M1 V15–V20 now in the report; C1 B1 plane offset; D2 pair-worker race; B1/B2 ring-mode report; licences; docs | PH3 (signed B1, post-hoc) | See `DECISIONS.md` "Audit actions" |

## Persistent open items (all versions)

- **Placeholders:** wire spec, helmet dimensions, face-zone positions, decoupling threshold, and the tissue properties at 3T.
- **V3:** cannot be evaluated until Roemer et al. 1990 is read.
- **V6:** fails below the wire-dependent bloom floor, a physical limit shown in the app.
- **No bench validation of anything yet:** every EM result is exploratory.
