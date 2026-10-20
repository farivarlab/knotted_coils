# Proposal: Knotted Coil Designer, next updates (v1.6 → v2)

**Status:** DRAFT for Reza's decision pass, 2026-10-20. Nothing here is built yet. Approved items become Design.md changes, each with pre-registered checks, following the usual rules.

**Why these updates:**
- Reza's feedback: arrays should be **symmetric about the head**; placement "still doesn't look great"; **bloom and loop size** should be controllable in the array.
- Next phase: **simulation**, through a solver we can drive programmatically.
- Fabrication: wire coils need **capacitor breaks**.

---

## Work packages

Effort: S = under half a day of work in session; M = about a day; L = several days.

### WP1. Symmetric ring layouts (the main fix for "doesn't look great")
- **What:**
  - A new solver mode. Elements sit in **rings** at chosen heights, plus a **top cap**, mirrored **left–right** about the mid-sagittal plane (x = 0).
  - Each ring has: element count, elevation, rotation offset, size, bloom, sharpness.
  - Only one half is optimised; the other half is its mirror image, so symmetry is exact by construction.
- **Handedness:** knots have a handedness. The mirror image of a right-handed trefoil is left-handed, with every crossing's over/under swapped.
  - Mirrored elements get the mirrored knot.
  - Elements on the midline are symmetric in layout but keep one handedness. The effect on coupling and B1 is negligible in this model (the lift is about 1 mm).
- **Why:** far fewer unknowns (5–8 per ring rather than 3 per element), so results are less seed-sensitive, more regular, and look like a coil someone would build.
- **Pre-registered checks (proposed):**
  - **V9:** mirror elements coincide to 1e-9 mm, and the coupling matrix is unchanged under the mirror swap, to 1e-9.
  - **C2 comparison, ring vs current free layout, same N and element:**
    - worst nearest-ring |k|;
    - **regularity score** = coefficient of variation of nearest-neighbour spacings (lower = more even);
    - coverage.
    - Decision rule written before running.
- **Effort:** L. **Depends on:** WP2 (per-ring shapes).

### WP2. Bloom, size and sharpness controllable in the array
- **What:** in the array solver, each of size, bloom and sharpness can be **fixed by you**, **shared and optimised**, or **optimised per ring** (in ring mode) within bounds you set.
- **Why:** bloom moves the pair-null spacing (seen in the Pair explorer), so it's a real decoupling lever between rings of different spacing. Fixing size lets you match a former or a channel budget.
- **Technical note:** the fast stage-1 table currently assumes one element shape. It needs one table per *pair* of distinct shapes; ring mode keeps that number small.
- **Effort:** M.

### WP3. Multi-start solving (quick win)
- **What:** run K seeds (default 8), keep the best, and **report the spread across seeds** so you can see how much a single run should be trusted.
- **Why:** the solver is strongly seed-sensitive (same design: worst |k| 0.010–0.042 across seeds).
- **Check:** pre-registered paired comparison, best-of-8 vs single seed, same protocol style as the worst-pair test.
- **Effort:** S.

### WP4. Save and load designs
- **What:** load an exported JSON back into the app.
  - The loaded file regenerates exactly, from its configuration and seed.
  - Version-checked: it warns if the file came from a different design version.
- **Why:** needed for comparing layouts and handing designs to collaborators.
- **Effort:** S.

### WP5. Capacitor breaks
- **What:**
  - Place N breaks per element evenly by wire length, **keeping a clearance from every crossing** (default 5 mm, JUDG).
  - Show them on the element drawing and in 3D.
  - **First-pass capacitor values** from the element's self-inductance and the field strength.
  - **Segment-length warning** against the wavelength.
  - Export break positions as **port locations** for simulators.
- **Physics used:**
  - Larmor frequency f = (γ/2π)·B₀, with γ/2π = 42.577 MHz/T for ¹H. A standard constant; I'll verify it against a primary source (CODATA) before citing.
  - C = 1/(ω²L), lumped, ignoring parasitics: a first-pass estimate only.
  - "Segment < λ/10" is a rule of thumb. It stays **UNVERIFIED** unless we find a source; otherwise it's labelled JUDG.
- **Why:** knots carry more wire than a loop of the same footprint, so they need more breaks, and crossings limit where breaks can go. That's worth seeing early.
- **Proposed checks:**
  - **V10:** no break within the set clearance of a crossing, and segment lengths equal to within a tolerance.
  - **V11:** capacitor value for a circular loop matches the closed form.
- **Effort:** M.

### WP6. Programmatic link to a field solver
- **What:** a **neutral simulation package** exported from the app, plus one adapter script per solver. The package (JSON + CSV) holds wire paths, breaks and ports, frequency, phantom choice and units. The adapter is a MATLAB or Python script that builds and runs the model and writes S-parameters and fields back to files.
- **Which solver:** decided from the verified comparison (`docs/SOLVER_OPTIONS.md`, in progress).
- **First job is a two-element validation case**, pre-registered three ways:
  - our tool's predicted null spacing;
  - the simulator's S21 null;
  - a bench S21 measurement.
- **Effort:** M–L, depending on the solver.

### WP7. (Optional) In-app thin-wire solver for coils in air
- **What:** a method-of-moments solver for wires, which solves for the current on the wires directly. It would include capacitors, true frequency dependence, self-resonance and S21 between elements, all in the app. No tissue.
- **Validate against:** published NEC-2 results, or the linked solver from WP6.
- **Decision:** worth it only if WP6's solver is slow or awkward for coils in air.
- **Effort:** L.

### WP8. Real former and wire spec
- **What:** import an STL scan of the helmet former, and enter the real wire spec.
- **Status:** blocked until you send them. Every physical number is still a placeholder.
- **Effort:** M.

### WP9. Fabrication sheet per element
- **What:**
  - wire length;
  - crossings, with lift heights;
  - capacitor positions and values;
  - bend radii;
  - **handedness**, for mirrored elements.
- **Format:** printable HTML or PDF.
- **Later:** an STL former with routing grooves.
- **Effort:** S–M.

### WP11. Head model with face exclusion zones (Reza, 2026-10-20)
- **What:**
  - A head inside the helmet, with **exclusion zones** for the eyes and mouth (optional: nose, ears).
  - Zones are editable: drag them, resize them.
  - The coverage region and the solver both treat zones as no-go. **No wire point may lie inside a zone**, not just no element centre. This replaces the current face wedge.
- **Why:** comfort, and for vision studies, an unobstructed view for stimuli and eye tracking.
- **Head geometry:**
  - v1: a parametric head (ellipsoid, plus landmarks placed by facial proportions), all placeholders.
  - Later: import a real head mesh (STL), together with WP8.
  - The head model must be openly licensed; options are being checked (`docs/SOLVER_OPTIONS.md`).
- **Check (proposed) — V12:** across all exported test arrays, zero wire points inside any exclusion zone. Exact, by construction plus a check.
- **Effort:** M.

### WP12. B1 validation in three tiers (Reza: "ensure the B1 estimates aren't BS")
- **Tier 1, implementation.** Is the code computing Biot–Savart correctly?
  - Compare our JavaScript field values with an **independent third-party library** (candidate: Magpylib, Python; verification in progress) on the *identical* wire paths, at about 1,000 points per test array: inside the head, near the wires, and far away.
  - Add an exact *off-axis* closed form for a circular loop, taken from a verified textbook source.
  - Tolerances pre-registered: e.g. relative error < 0.5% at points ≥ 5 mm from any wire.
  - Why third-party: a second implementation by the same author (Claude) could repeat the same misunderstanding.
- **Tier 2, physics.** Is quasi-static good enough?
  - Compare our maps with the full-wave solver from WP6: in air, then with a phantom, at 3T and 7T.
  - Report where they diverge and by how much, e.g. normalised difference maps and the depth at which the error exceeds 20%. Thresholds pre-registered.
  - Expected: good agreement near the coils and at 3T; substantial divergence deep in a head at 7T. The point is to measure it.
- **Tier 3, reality.** Bench or scanner B1 mapping of a prototype pair, when one exists.
- **App change:** each B1 map is labelled with the highest tier it has actually passed for that configuration (field strength, with or without phantom), instead of a blanket "exploratory".
- **Effort:** Tier 1, S–M (Python 3.12 is already installed). Tier 2 depends on WP6.

### WP10. Housekeeping
- **Automated app smoke test:** load the app, solve, export, checked by a script.
- **Resolve V3:** read Roemer et al. 1990 through McGill library access.
- **Choose a licence:** after the OIP conversation.

---

## Suggested order

1. **WP3** multi-start, small and immediately useful.
2. **WP12 tier 1** independent B1 cross-check: cheap, and it removes the main credibility question about the B1 view.
3. **WP11 + WP1 + WP2** head with face exclusion zones, then symmetric rings with per-ring bloom and size, built on that head. The core of your feedback.
3. **WP4** save and load.
4. **WP5** capacitor breaks.
5. **WP6** solver link, once the solver is chosen.
6. **WP9** fabrication sheet.
7. **WP7** only if needed. **WP8** when the data arrive.

## Decisions for Reza

| # | Decision | Proposed default |
|---|---|---|
| 1 | Approve WP1–WP5 as Design v1.6 scope? | Yes |
| 2 | Symmetry: left–right only, or also front–back? | Left–right only (the face opening breaks front–back symmetry) |
| 3 | Mirrored elements use the mirror-image knot? | Yes, and the fabrication sheet labels the handedness |
| 4 | Ring mode: how many rings by default? | Solver chooses 2–4 rings plus a top cap; you can override |
| 5 | Should "looks good" be judged by the regularity score in C2? | Yes: coefficient of variation of nearest-neighbour spacing |
| 6 | Capacitor clearance from crossings | 5 mm (placeholder until the real capacitor package size is known) |
| 7 | Field strength for capacitor values | **Needed from you:** 3T, 7T, or both |
| 8 | Solver for WP6 | Pending the verified comparison |
| 9 | Face exclusion zones | Eyes and mouth by default; nose and ears optional. Zone sizes are placeholders until measured on your head model or volunteers |
| 10 | Independent B1 library for Tier 1 | Magpylib, if verification checks out |
| 11 | Python for Tier 1 | Already installed (3.12). Only the library needs installing, into an isolated environment outside OneDrive |
