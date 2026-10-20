# Decision Log — Knotted Coil Designer

Dated entries: what was decided, why, who decided it, and what the alternatives were. Newest first.

---

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
