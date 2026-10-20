# Decision Log — Knotted Coil Designer

Dated entries: what was decided, why, who decided it, and what the alternatives were. Newest first.

---

### 2026-10-20 (night) — Audit M2 (crossing shorts on the grid): checked, no short found
- **Trigger:** the `trefoil_air_3T` run hovered between −8 and −17 dB for roughly 60,000 timesteps. Energy that never decays is the signature of a closed metal loop with no port in it, which a shorted crossing would create.
- **Check:** `sim/check_crossings.py` rebuilds the openEMS grid exactly as the run does, without running FDTD, and snaps both strands at every crossing to grid nodes.
- **Result:**
  - Separation at the crossings is 1.57–1.69 mm on the 1 mm grid.
  - No crossing shares a node, or sits one grid edge apart, in `trefoil_air_3T` or any of the three `pair_head_3T` cases.
  - In `trefoil_air_3T`, one crossing has its two strands at diagonally neighbouring nodes, offset (0, 1, −1). No single grid edge joins those, so they cannot short.
- **Outcome:** the run then decayed past the −40 dB stop criterion (−45.9 dB at about 70,000 timesteps). This is a slow-ringing, high-Q (low-loss) coil in air, not a short.
- **Decision (Claude, overnight):**
  - No mesh change mid-queue, so all cases keep the same mesh code.
  - Margin is thin: half a cell (0.5 mm) less lift would put strands one edge apart. Any new case or grid must pass `check_crossings.py` before it is run.
  - Adding a timestep cap stays an open item.

### 2026-10-20 (night) — Audit actions (steps 2–4)
- **Step 1:** brainstorm, `docs/AUDIT_BRAINSTORM.md`.
- **Step 2:** independent review (Fable), `docs/AUDIT_BRAINSTORM_REVIEW.md`. It added M1–M17.
- **Step 3:** four independent area audits (Fable), `docs/AUDIT_REPORT_A.md` to `D.md`.
- **Fixed before any main simulation result existed** (commit 4d67469):
  - M3: superposition check run;
  - M5: air pair case;
  - M6: S11 in both termination states. The V17 verdict uses the operating state (neighbours preamp-terminated). This is a harness clarification, chosen before any pair result existed; the criterion's numbers are unchanged;
  - M7: robust B1 normalisation, information only;
  - M10: git hash and options recorded in every output;
  - M13: coronal plane measured from the head surface. A harness clarification of V18's plane, made before any V18 result;
  - M14: depth also measured from the neck cut. A harness clarification of V18, made before any V18 result;
  - M15: air-resistance warning.
- **Fixed afterwards:**
  - M1: V15–V20 aggregated into the report (commit 2734546);
  - M17: registration pointers;
  - D2: separate pair worker;
  - D7: licence inventory;
  - D8: V20 verdict computed in run.js; script tracked;
  - D9: single `core/phantom.js`;
  - D10: app version 0.3.0;
  - D14: PARAMETERS rows.
- **Audit A (core) fixes:**
  - **A1 (high):** clearance is now segment-to-segment. On the auditor's repro, T(3,4): the lift from 200 points is now 0.868 mm, true clearance 1.503 mm (was 0.436 → 0.757 mm, under the 1.5 mm required). The report re-checks every final element shape (`liftFeasibleFinal`).
    - Tonight's simulation cases (all p = 2) were unaffected, because their crossings fall on sampled points.
    - **Arrays of p ≥ 3 knots designed before this fix may have had too little crossing lift.**
  - **A3:** V11 labelled a consistency check (circular with respect to V2). Its verdict is unchanged.
  - **A4:** the capped clearance is shown as "≥".
  - **A5:** the point-count rule accepts two equal counts at the ceiling.
  - **A8:** post-hoc PH3 checks the B1 vector direction (AGREES).
  - **A9:** comments updated.
  - **A2 (documented, not changed):** with zCut = −20 mm the mouth zone sits below the covered region, so it is inert, and V12 is vacuous for it. It becomes active if zCut is lowered. Whether coverage should reach the lower face is Reza's call.
  - **A6 (documented):** self-inductance is about 0.4–0.6% low at 300 points (within V2's 2%).
  - **A7 (open, low):** the radial-snap fallback in wrapping is not flagged.
- **Audit B (optimiser) fixes:**
  - **B1:** in ring mode `ring1` and `decoupledRing1` are null; adjacent pairs are labelled "adjacent".
  - **B2/B5/B6:** every distinct final element shape is re-checked; the panel shows the worst; `elements[]` carries `h`; `liftFeasible` comes from the final shapes.
  - **B3:** comment corrected.
  - **B4:** a warning when ringCounts don't sum to N.
  - **B7, B10:** noted, not changed.
  - **B9 (interpretation of C2):** the free arm was best-of-4 on the primary metric, the ring arm a single start. That was pre-registered, but it favours free. C2's "ring fails" should be read with this in mind.
  - **B8:** documentation, see the docs pass.
- **Audit C (full-wave) fixes:**
  - **C1:** the quasi-static B1 map is evaluated on the plane where openEMS actually stores its dump (half a cell off).
  - **C3:** a footprint-restricted V18 metric and the worst-point location, information only; the registered verdict is unchanged.
  - **C5:** `cosim.py` refuses incomplete or stale openEMS outputs.
  - **C6:** roots must have a small residual, and the reference is the first-pass value.
  - **C2:** recorded. The official loop run repeats the thin-curve run: V15 = −10.3%, FAIL. V15b is the transfer test of the correction.
  - **C7:** gap parasitics are absorbed into a_eff; the gap fraction differs between loop and trefoil. Stated as a V15b limitation.
  - **C8, C9:** noted.
  - **All official co-simulations are re-run with the final `cosim.py` after the queue**, so every verdict comes from one code version. FDTD outputs are unchanged.
- **Official loop with the final code:** V15 −10.3% (FAIL); **V16 1.0011 > 1.001 (FAIL on this case**, a 0.1% passivity excess); V17 −48.6 dB (pass).
- **Docs and app:**
  - Design §5.1, §5.2, §6, §6b and §10 corrected (see changelog);
  - the §7 "UNVALIDATED" label is implemented in the app;
  - README, REQUEST_LOG (#20, #21), DESIGN_HISTORY, PROPOSAL status, NOTICE and DEVELOPER_GUIDE brought up to v1.7;
  - D11 load validation; D13 tab roles.
- **More fixes:** listed below as they are made.
- **D16:** the hashes `39ae3d4`/`ccfb5f5` in `docs/research_integrity/VALIDATION_PROTOCOL.md` belong to the Lab_3d repository. The path is shown there, and the file is a copy of Reza's framework, so it is left unchanged.

### 2026-10-20 (night) — Thin-wire evidence: V15 runs on three grids
- **Second V15 run:** 1 mm grid, `AddCurve` thin curve. Resonance 114.6 MHz, **−10.3% (FAIL)**. Calibrated effective radius a_eff = 0.170 mm.
- **Third run:** 0.5 mm grid. Resonance 108.0 MHz, **−15.4%**; a_eff = 0.084 mm.
- **What the scaling shows:**
  - a_eff ≈ 0.17 × the grid cell, so refining the grid makes the raw model *worse*.
  - The thin-wire relation predicts ΔL = (μ₀/2π)·ℓ·ln(0.170/0.084) = 35.4 nH between the two grids; openEMS gave 35.2 nH. This is independent evidence that the error is the effective-radius effect V15b corrects. It is not part of any pre-registered verdict.
- **Side note:** at 0.5 mm, V16 (passivity) was 1.0023, above its 1.001 limit, on a tagged sensitivity run (not official).
- **Official V15 verdict:** comes from the untagged official loop run in the overnight queue.

### 2026-10-20 (night) — v1.7 full-wave pipeline: first findings
- **Defaults taken while Reza was away:**
  - field strengths 3T and 7T;
  - matching = shunt C_m, series L_m, with preamp decoupling;
  - installed openEMS 0.37.0 (Windows package, Python 3.14 wheels) in `C:\Users\reza\.solvers\openEMS`, plus an isolated Python 3.14 environment `C:\Users\reza\.venvs\kc_em` (numpy, scipy, h5py, matplotlib, magpylib 6.0.0, openEMS, mariepy);
  - no permanent environment variables (no `setx`).
- **mariepy:** installed (0.0.0.dev106; pulled in PyTorch). Its repository contains AGENTS.md, CLAUDE.md and GEMINI.md, so it is probably at least partly AI-written. Cross-check only.
- **Tissue values:**
  - 7T: openEMS's bundled head phantom (attributed to IT'IS/Gabriel; secondary source).
  - 3T: openEMS's 128 MHz *body* values mapped to head layers, an APPROXIMATION.
  - IT'IS's own site serves values through a backend query and IFAC's calculator is an interactive app, so neither could be read quickly. Verified values remain an open item.
- **V15 FAILED (first run, 1 mm grid, `AddWire` with radius 0.5 mm):** resonance at 115.6 MHz, −9.5% from the predicted 127.7 MHz (limit ±5%). The full-wave loop L was 274.6 nH against 223.8 nH quasi-static (+23%).
- **Root-cause finding:** on a 2 mm grid, the radius-aware `AddWire` primitive **disconnected the wire** (port-to-port Z₀₁ ≈ 9 Ω vs 1,259 Ω at 1 mm). Only grid edges within the radius become metal, so a 0.5 mm wire on a coarse or oblique grid can break silently.
- **Change:** wires now use `AddCurve` (a connected stair-step thin wire on the grid). Its effective radius depends on the grid and is corrected with the pre-registered V15b procedure: calibrated on the loop, validated on the trefoil.
- **Also fixed:** openEMS changes the working directory during `Run()`, so the case path is now resolved before any run.

### 2026-10-20 — Design v1.6 development: failures found by the new checks (logged before the official run)
Development runs of the pre-registered v1.6 checks (`KC_ONLY=…`; not official runs) found two real problems. Both were fixed, and the criteria were not changed.
- **V14 FAILED (B1 vs Magpylib).** Worst relative difference at points ≥ 10 mm from the wires:
  - (a) single trefoil: 0.29%;
  - **(b) sharp T(2,5): 1.05%;**
  - **(c) 16-element array: 0.60%.**
  - **Cause:** the midpoint rule on wires thinned to 200 points.
  - **Fix:** `core/field.js` now sums the exact closed-form field of each straight segment. After the fix: 0.0000% in all three cases.
  - **What this means:** the v1.5 B1 view had errors of up to about 1% near the wires. Deeper in the head the error was smaller (not separately quantified).
- **V9 FAILED (symmetry).** Pairs that include a midline element had k of equal size but **opposite sign** (difference 0.12).
  - **Cause:** mirroring a loop point by point also reverses the direction its current circulates, so mirrored elements followed a different sign convention.
  - **Fix:** mirrored elements run their points in reverse order, so every element circulates the same way as seen from outside the head.
  - The V9 harness now compares twins in reversed point order. That is the same curve, as the criterion describes, and the criterion itself is unchanged.
  - After the fix: wires agree to 4e-14 mm; k to 6e-16 (non-midline pairs) and 5.8e-4 (midline pairs, from the crossing-lift handedness).
- **Other development changes before any C2 run, prompted by wires entering exclusion zones:**
  - lambdaZone raised from 0.05 to 1;
  - the coverage target excludes a buffer around each zone;
  - zones are now the first priority in free-mode moves;
  - "rescue" jumps for elements trapped between the eyes;
  - footprint check denser and 10% wider;
  - lowest ring elevation bound relaxed.
- **Tuning was kept off the C2 configurations** where possible: 20 elements were used for development. One early ring test used 16 elements, which is also C2 configuration 1.

### 2026-10-20 — Validation run 6 (Design v1.5, point ceiling 102,400)
- **Passed:**
  - V1, V2, V4, V5;
  - **V7, all 360 points** (v1.4 warp sharpness);
  - **V8**, worst error 0.0051%.
- **V3:** NOT EVALUABLE (reference unverified).
- **V6:** FAIL only below the physical bloom floor (β = 0.02, 0.05). This is a known limit, shown in the app.
- **Earlier V7 failures stay on record:** run 4 (v1.3) and run 5 (resolution).

### 2026-10-20 — Design v1.5: quick B1 view
- **Request (Reza):** "I just want a quick visualization that's reasonable. We will do simulations later."
- **What was built:**
  - quasi-static Biot–Savart field of the solved wires;
  - a placeholder head surface (helmet − 10 mm) and axial, coronal or sagittal slices;
  - elements combined as √Σ|B1ᵢ|², or a single element;
  - colour in dB relative to the maximum shown.
- **Check:** V8 pre-registered (git ff1a40e). Its closed form is DERIVED, not cited.
- **Speed:** about 0.3 s for the surface view (16 elements).
- **E-fields:** still excluded. A partial (inductive-only) E map would mislead. Recommendation: export the wire paths to a full-wave simulator.

### 2026-10-20 — Validation run 5 (v1.4): V7 FAIL at 1 of 360 points
- **Failing point:** T(2,5), m = 16, β = 1.5. The drawing showed 6 crossings instead of 5 at 25,600 points.
- **Cause:** a duplicate hit at the 54° crossing, where the strands meet at a grazing angle. The count is exactly 5, in the right positions, at 51,200, 102,400 and 204,800 points.
- **Fix:** point-count ceiling raised from 25,600 to 102,400. Criterion unchanged. Re-run as run 6.

### 2026-10-20 — Design v1.3: petal sharpness
- **Request (Reza):** "Add a petal-sharpness control that narrows each lobe, with the same topology checks."
- **Implementation:** outward lobe profile raised to a power m, r = R(1 + β((1 + cos qφ)/2)^m). Tips and base are unchanged; the lobes narrow.
- **Range:** 1–16. Not applied to the symmetric v1.0 shape.
- **Lobe aspect ratio:** length ÷ width at half length is now reported.
  - Example, cinquefoil at β = 1.5: 0.68 (m = 1), 1.31 (m = 4), 2.05 (m = 10).
- **Topology check V7:** pre-registered in Design §7 (git 30d6fa1) before it was run.
- **V7 RESULT (validation run 4): FAIL.**
  - **Passed across the whole grid:** the trefoil T(2,3).
  - **Failed at m ≥ 12:** T(2,5) and T(2,7).
  - **Failed from m ≈ 3–6:** the 3- and 5-winding knots.
  - **Mechanism:** extra crossings in the flat drawing, in pairs (e.g. 10 instead of 8). The power law flattens the base between petals, so neighbouring strands run almost on top of each other and cross back and forth.
  - **Knot type:** Claude argues it is probably unchanged, because the 3D curve still lies on an embedded torus. **Not verified computationally.** The diagram is still not clean: it has extra wire crossings and long stacked runs.
  - **Response:** v1.4 replaces the power law with an angle warp.
- **v1.4 (git 7d7b6bf):** sharpness warps the lobe angle, ψ = qφ + (1 − 1/m)·sin(qφ), and the same ψ drives both radius and lift.
  - Claude's argument: crossings stay exactly q(p−1), with the same pattern.
  - Probes showed residual mismatches only at m = 16, β = 0.1. They were confirmed as discretisation artefacts: they vanish at 2,000 points for T(3,2) and 16,000 for T(5,6).
  - **Numerical changes:**
    - a grid-accelerated crossing and clearance search (identical to brute force on 108 crossing cases and 6 clearance cases);
    - a point-count rule requiring stability over two doublings (max 25,600 points).
  - **Trade-offs seen in probes (not validated):**
    - Aspect ratio gains are larger for 2-winding knots (T(2,5) at β = 1.5: 0.68 → 1.25 from m = 1 to 16) than for 3–5-winding knots (T(3,4): 0.36 → 0.66).
    - The crossing lift needed grows with m, up to about 9.8 mm for T(5,6) at m = 16. That is likely impractical.
- **Bend radius:** tightens with m, e.g. 3.9 mm at m = 10 for that cinquefoil. The app flags this against the wire's minimum bend radius.

### 2026-10-20 — Design v1.2: bloom extends lobes (outward shape)
- **Request (Reza):** bloom should lengthen the lobes, with aspect ratio rising with bloom, rather than pinch part of the loop.
- **Cause of the pinch:** the v1.0 formula R(1 + β cos qφ) moves the lobe tips out *and* the waist between lobes in by the same amount. At high β the waist collapses toward the centre.
- **Change:**
  - New default: R(1 + β(1 + cos qφ)/2). The base circle stays fixed and the lobes extend outward only (lobe length = βR).
  - β_max raised to 3.0.
  - The v1.0 "symmetric" shape is kept as an option.
- **Alternative considered:** an extra "petal sharpness" exponent to narrow each lobe as well. Not built; the length change alone makes aspect ratio rise with β.
- **Side effect:** the bloom floor doubles to c / (R sin(π/p)). At R = 30 mm with the placeholder wire, that is 0.05 for p = 2 and 0.058 for p = 3.
- **Pre-v1.2 results:** validation run 2 and the worst-pair comparison used the symmetric shape. Their conclusions do not automatically carry over.

### 2026-10-20 — DECIDED: "decoupled" = nearest ring (Design v1.1)
- **Decided by:** Reza, choosing between the frozen footprint-overlap rule and the nearest-ring rule.
- **What changed:**
  - Solver default is now `target = 'ring1'`.
  - The app lists the nearest-ring verdict first.
  - The footprint verdict (v1.0 rule) is still computed and shown for every result.
  - Design.md changelog updated.
- **Alternatives:** keep the footprint rule, with its ill-posed objective; or a Voronoi-adjacency definition (not built).

### 2026-10-20 — Worst-pair term implemented; made default by pre-registered rule
- **Requested by:** Reza: "Implement the worst-pair term as a smooth stand-in (soft-max or sum of k^4), compare against the current solver on the same seeds, and report both."
- **Implementation:** per-pair cost w·(k² + λ_max·k⁴/thr²), with λ_max = 1 (JUDG, set before testing, not tuned).
- **Protocol:** `validation/COMPARE_worstpair_PROTOCOL.md`, committed before running (git 6d96721). 35 paired runs:
  - T(2,3), T(2,5), T(3,4) at N = 16 and 32, seeds 1–5, fast solver;
  - plus T(2,3) at N = 16, seeds 1–5, full solver.
- **Result:** all three criteria met.
  - B (with the term) had the lower worst nearest-ring |k| in 26 of 35 runs.
  - Median paired ratio B/A = 0.84.
  - Coverage violations: 0.
- **Applied mechanically:** default is now `lambdaMax = 1`.
- **Trade-off shown by the secondary outcomes (reported, not part of the rule):**
  - median nearest-ring |k| rose from 0.0052 to 0.0119;
  - median count of pairs ≥ threshold rose from 17 to 22.
  - In short, the term lowers the single worst pair by spreading moderate coupling over more pairs.
  - Second-ring worst |k| was essentially unchanged (0.066 vs 0.067).
- **Also seen in both arms:**
  - No N = 32 run met the threshold for all nearest-ring pairs.
  - Results vary strongly with the random seed (same configuration, A's worst |k| ranged 0.010–0.042).
  - The solver is a weak link. Restarting from several seeds and keeping the best would be a cheap improvement (not built).
- **Open for Reza:** which matters more for his array, the worst pair or the typical pair. If the typical pair matters more, set the weight to 0; the app exposes it.

### 2026-10-20 — Deviation found: λ_max term not implemented (resolved by the entry above)
- **What happened:** Design §5.1's cost includes λ_max·max|k|. The solver as built (git b21c784) omits it. Claude found this while editing §5.1 for v1.1 and disclosed it the same day.
- **Effect:** the solver can trade one bad pair for many good ones. The worst pair is always reported but not specifically targeted.
- **Options:**
  - implement it, e.g. as a smooth stand-in such as Σk⁴ or a soft-max, because a hard max is awkward for an element-by-element local search;
  - or amend the Design to drop it.
- **Status:** awaiting Reza.

### 2026-10-20 — Field maps (B1 / E) requested; not built yet
- **Request (Reza):** a UI toggle to visualise E-fields.
- **Claude's assessment:** a quasi-static wire model can compute the **magnetic field** properly, using Biot–Savart, and that can be checked against the analytic on-axis field of a loop. It can only give the **inductive part of E** (−∂A/∂t). The charge-driven part from capacitors and gaps, and the effect of the head, are missing, so an E map would be incomplete in a misleading way.
- **Status:** outside frozen Design v1.0 scope (§1, §8). **Awaiting Reza's decision.**

### 2026-10-20 — In-plane rotation as a solver option
- **Decided by:** Reza, who asked for rotation as a decoupling lever.
- **What changed:** rotation was already a free variable per element. It is now exposed as `rotation` = free / locked (one shared angle) / fixed.
- **Exploratory observation, one seed, N = 16, trefoil β = 0.4, nearest-ring target:** worst nearest-ring |k| was 0.010 with free rotation, 0.040 locked and 0.045 fixed.

### 2026-10-20 — Neighbour definition: frozen rule kept as default, 'ring1' added (superseded by the v1.1 entry above)
- **Finding:** a trefoil at β = 0.4 nulls only at a centre spacing of about 1.14 Rf, which is heavy overlap. At that spacing, second-ring elements (about 1.97 Rf in a hexagonal layout) still overlap.
- **Consequence:** under the frozen Design §5.1 definition (footprints overlap), the solver must null pairs that cannot be nulled together, and the problem is badly posed.
- **Option added:** `target = 'ring1'` decouples only the nearest ring (closer than 1.35 × the pair-null spacing).
- **Results (16 elements, exploratory):**
  - nearest ring: worst |k| ≈ 0.008–0.010;
  - second ring: |k| up to about 0.08.
- **Default is unchanged** (frozen definition). Every result reports **both** verdicts.
- **Decision needed from Reza:** which definition should be the default, i.e. which one "decoupled" should mean.

### 2026-10-20 — Validation runs 1 and 2: V6 FAIL (recorded), causes and fixes
- **Run 1** (git 9f89d91): V6 failed for three separate reasons.
  1. **Physics:** the bloom floor is above β = 0.02 for the placeholder wire (1 mm + 2 × 0.25 mm insulation) at R = 30 mm. Near the knot, the strands sit on a thin tube of in-plane radius βR. The p strands can be at most 2βR·sin(π/p) apart, so with c = d_w + 2t_i the minimum buildable bloom is β ≥ c / (2R sin(π/p)). That gives 0.025 for p = 2, 0.029 for p = 3 and 0.043 for p = 5. This is Claude's derivation; the numerical lift solver agreed (feasible at 0.03, 0.03 and 0.045).
  2. **Discretisation:** 300 points missed one crossing of T(2,5) at β = 0.9 (600 or more resolve it). That shape also has a 0.08 mm bend radius, so it cannot be built.
  3. **Harness bug:** the reference over/under pattern was taken at β = 0.02, which was itself the degenerate case.
- **Fixes:**
  - adaptive point count (`knot.adaptiveN`);
  - reference pattern taken at β = 0.4;
  - bloom floor shown in the UI.
  - The **criterion is unchanged.**
- **Run 2:** V6 still FAILS, now *only* at β = 0.02, for every knot. That is the physical floor.
- **Post-hoc check PH2 (informational, not a verdict):** topology is preserved from the floor upward for all catalogue knots.
- **Decision needed from Reza:** whether to change the β_min default to the wire-dependent physical floor. That is a Design change.

### 2026-10-20 — V3 reference is UNVERIFIED
- **Status:** Roemer et al. 1990 is paywalled; a subagent tried the Wiley PDF, Semantic Scholar, OpenAlex, Europe PMC and the Internet Archive.
- **Closest primary text read:** Roemer & Edelstein, US 4,825,162 (1989), "D approximately equal to 0.75d". This is PARAPHRASE-ONLY, read from Google Patents OCR text.
- **V3 verdict:** NOT EVALUABLE. Our computed value is 0.7604 × diameter (exploratory comparison: +1.4% from the patent's approximate value).
- **To resolve:** Reza retrieves the paper through McGill library access.

### 2026-10-20 — Kernel softening between elements
- **Choice:** wires of *different* elements use a 1/√(r² + ε²) kernel with ε = d_w + 2t_i, so crossings between elements are treated as separated by the real centreline gap. This avoids having to model which wire goes over at each crossing.
- **Alternative:** explicit over/under layers per crossing.
- **Status:** sensitivity to ε not yet tested.

### 2026-10-20 — Design.md v1.0 frozen
- **Decided by:** Reza approved all §11 defaults.
- **Commit:** git 39a4e83; this commit pre-registers V1–V6.
