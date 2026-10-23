# Decision Log — Knotted Coil Designer

Dated entries: what was decided, why, who decided it, and what the alternatives were. Newest first.

---

### 2026-10-23 — Design v1.11 PROPOSED: COMSOL link in the app (collaborator request; pending Reza's approval; EXPLORATORY)
- **Request and choices (collaborator, quoted in Design §12):**
  - Export designs to COMSOL, run them in the background, and compare B1 maps and decoupling graphs in the app.
  - Ports only for arrays; tuning and matching inside COMSOL for one or two coils.
  - The app's ellipsoid head only.
  - **No pass/fail criteria:** everything is exploratory.
  - Insulation at the crossings.
- **Ownership:** the code stays under Reza's accountability (provenance headers unchanged). Design v1.11 is written as a proposal: the frozen design is still v1.10 until Reza approves.
- **Built on the collaborator's verified COMSOL work rather than on this repo's v1.10 builder:**
  - The v1.10 `sim/comsol_build_mph.py` was written without COMSOL and has never run.
  - The collaborator's `coils8_import.py` and `head_2coil_sphere_optimized.py` had been checked in COMSOL 6.4.
  - Their construction is reused: parametric-surface PEC tubes, gap bands, spherical PML, the split feed with an in-model shunt Cp, and EM-in-the-loop tuning. Their Fourier-series centreline was later replaced (below).
  - The v1.10 script and V25 are left untouched.
- **Design choices:**
  1. Stage 1 puts a port in every gap, so capacitors, matching and tuned B1 follow by exact circuit algebra. Stage 2 (1–2 coils) then puts the capacitors in the model and refines them.
  2. The coupling for the app's k is taken at f0 with the gaps shorted. It includes wave effects (see below).
  3. The B1 maps use the app's own slice grid, so the comparison is point by point.
- **Problems found and fixed while building it (all before any result was shown):**
  - **COMSOL's lumped-port convention:** the driven port carries a 1 V incident wave, so S_kp = V_k − δ_kp. This reproduces COMSOL's S11 to 1e-6. Deriving S from the port currents was off by about 1e-3, because the current is a surface integral.
  - **Mesh before study:** building the physics-controlled mesh before the study existed gave a mesh that was rebuilt, and failed, once the 128 MHz study was added. Mesh sizes depend on the frequency, so the study is now created first.
  - **Insulation beads at the real thickness fail to mesh:**
    - A 0.25 mm bead meets the tube at a grazing angle.
    - On the trefoil, padding of 0.6, 2 and 3 mm meshes at every level tried; 1.0 mm does not.
    - The script tries 0.6, then 2, then 3 mm, and records which it used. The bead therefore holds more dielectric than real insulation would (PLACEHOLDER εr 3).
  - **Stale partial mesh (implementation error):** a failed mesh attempt leaves a stale partial mesh. The first retry logic accepted it: 34k elements with one domain empty, which then failed at the solve. Fixed by clearing the mesh before every try and accepting a mesh only if every domain holds 3D elements.
    - The first version of that check counted only tetrahedra, so it rejected the swept PML (prisms). Fixed.
  - **Job runner, two bugs found by driving the page:**
    - The page treated the short "unknown" status between launch and Python's first status write as finished, and stopped watching. The server now writes "starting" at launch.
    - After a server restart, the server would have started a second COMSOL job beside a running one. It now checks the job folders for a live job first.
  - **Touching wires:** the script refuses to build when wires come within the wire diameter + 0.1 mm, because COMSOL would fuse them. App pair sweeps keep ≥ 1.65 mm centre to centre, even where the bump search reports "capped".
- **Geometry rewritten after a failed array test (implementation error, found before any array result was shown):**
  - The first version drew each tube from a Fourier series of the wire, as Will's script does.
  - On a 4-coil array, whose wires carry sharp crossover bumps and only 300 points, the series missed the wire by up to **9.8 mm**. The fit routine reported the error but still accepted the fit at its harmonic limit, instead of refusing. Geometry building also took over 10 minutes.
  - **Fix:** the tube now follows cubic-spline interpolation functions through every wire point, in arc length. There is no fitting error to accept.
  - **Results with the spline tubes:**
    - The two-coil case that had failed to mesh with its insulation beads now meshes at the first bead size.
    - The single trefoil builds in 30 s instead of 19 s, but solves faster.
    - The trefoil's circuit Ct moved from 9.62 to 9.41 pF (−2%) between the two representations of the same wire, with a different mesh (131k vs 119k elements). This is an indication of the mesh/representation uncertainty, not yet separated.
  - The array job was cancelled; the array path was parked until the collaborator asked for it (below).
- **Insulation beads that nearly touch each other (pair sweep, 69 mm spacing):** a coil's own crossing and a crossover between the coils fell 4–7 mm apart, and their beads overlapped or left a thin sliver of air; the mesh failed at every bead size.
  - **Fix:** beads that could come within 1.5 mm of each other at the largest bead size are merged into one bead covering both places. The merged beads hold more dielectric than real insulation (up to about 10 mm radius where three crossings cluster).
  - If a case still cannot be meshed with beads, it runs without them and the result records that (`insulation.dropped`).
  - One failed case no longer stops the remaining cases of a job.
  - The 69 mm case then meshed with 2 mm beads.
- **Two coils, Pair-explorer geometry at the app's zero-coupling spacing (65 mm, 3 T, head):**
  - **Matching:** both coils matched in COMSOL on the first in-model iteration (S11 −40 dB each), 13 min in all.
  - **Coupling:** the coupling with gaps shorted nearly vanishes, k 0.0007 (the app's k for the same wrapped wires is 0.0069). The matched S21 is −9.8 dB.
  - **Interpretation (information, not a verdict):** the inductive coupling is nulled as the app predicts, and the remaining coupling passes through the lossy head. The collaborator's own two-loop COMSOL study found the same kind of tissue floor (−16 dB) at its overlap optimum.
- **First results (exploratory, head-loaded single trefoil, 3 T):**
  - **Case `trefoil_head_3T`:**
    - COMSOL tuning Ct is 9.57 pF in the model and 9.62 pF by circuit.
    - openEMS gave 9.10 pF for the same case: within 5%, two independent solvers.
    - The quasi-static first pass was 12.4 pF.
    - Matched to −37 dB in 4 COMSOL iterations, about 4 min in all.
    - B1 rebuilt from stage 1 agrees with stage 2 to 2.5%.
  - **App default trefoil (R 30 mm, footprint 54 mm):**
    - Matched to −32.9 dB.
    - Peak B1⁻ per ampere: app 17.9 vs COMSOL 17.3 µT/A (axial plane).
    - After normalising, 44–79% of points agree within 20% depending on the plane. COMSOL is relatively stronger deeper in the head (tissue and wave effects), as openEMS found for V18.
  - **"Apparent L" at f0 with all gaps shorted** is 1093 nH against the app's 620 nH. The 56 cm shorted wire is near its own resonance at 128 MHz, so this is not an inductance error and is labelled as such in the app.
- **Whole arrays, B1 only (collaborator, later the same day: "so for complete array and b1 field (only port is needed) no tuning and matcing only the port"):**
  - Each coil's feed gap is a 50 Ω port; the other gaps are plain wire. One solve per coil (8 solves for 8 coils instead of 32 with a port in every gap).
  - Insulation beads are left out for arrays: on the 8-coil array every bead size failed to mesh at one crossing, at about 1 min per try. They hardly change B1.
  - Domains (air, PML, head layers) are now selected by the geometry object that made them, not by probe balls. A ball selection needs a display mesh of every face and failed on one face of the 8-coil array.
  - **Result, 8 coils T(2,3) β 0.8, T = 15 mm, 3 T, head (run from the page):** 431k mesh elements; geometry and mesh 7 min, then about 1 min per coil; 16 min in all.
    - Whole-array maps (root-sum-square of the coils, each map normalised to its peak): 75% (axial), 57% (coronal) and 91% (sagittal) of points within 20% of the app.
    - Single coils: 8–88% of points within 20%; COMSOL's peak per ampere is 2.5–5× the app's, and its coupling |k| 2.6–4× the app's (six largest pairs).
    - **Interpretation (information, not a verdict):** without capacitors each 0.8 m wire carries a standing wave at 128 MHz, while the app assumes a uniform current. The whole-array pattern compares fairly; single-coil maps and absolute levels do not.
  - **Tried and removed: first-pass capacitors in the non-feed gaps.** This would have made single-coil maps comparable. On the 8-coil array the geometry with all 32 gaps did not mesh ("intersecting edge elements" on two or three faces).
    - Cause found: each tube is ~45 separately fitted surface patches. Where two patches meet, COMSOL's fit leaves their corner points up to ~0.06–0.2 mm apart, and the union keeps tiny edges there. Which joins fail depends on where the gaps put the patch boundaries.
    - Not fixed by mesh level (6, 5, 4, 3, 2), union repair tolerance (to 0.25 mm), surface-fit knots (8–80), COMSOL "Remove Details", or composite faces. The fix would be one swept tube per coil (a rewrite), so the mode was removed at the collaborator's direction (ports only).
- **Pre-flight check ("make sure to bolster the size check so we don't simulate weird stuff in COMSOL"):**
  - **Found while testing: a coil too large for the helmet wraps badly.** A 4-coil array (footprint radius 94 mm) wrapped with wire points jumping 56–62 mm, because the radial-snap fallback in wrapping is not flagged (open item A7 below). COMSOL then failed after 10 minutes with a geometry error. The app's own coupling and B1 for such an array are also unreliable; the app solver is unchanged.
  - The app now refuses to make a case, and `sim/comsol_run.py` refuses to build one, when a coil is stretched > 15% by wrapping, any wire is inside the head, a port or capacitor gap is < 1.5 mm from another coil, or two wires are closer than the wire diameter + 0.1 mm. The script also refuses wire points that jump.
  - On four test arrays (T(2,3) β 0.8, N 8 and 12, T 0 and 15 mm) the app and the script agree: N 12 at T = 0 is refused (coils 11 and 12 pass 0.12 mm apart; the crossover bumps could not separate them, see V24); the other three pass.

### 2026-10-23 — Housekeeping on a shared copy (no design change; no verdict affected)
- **Request:** a collaborator reproducing the package on Linux asked for it to be cleaned up ("clean it up a bit").
- **Portability (tooling only):** default paths no longer hard-code the development machine.
  - `tests/run.js`: the Magpylib Python (`KC_PYTHON`) now defaults to `~/.venvs/knotted_coils/`, using `Scripts/python.exe` on Windows and `bin/python` elsewhere.
  - `sim/run_openems.py`: `KC_OPENEMS_DIR` and `KC_SIM_WORK` now default to `~/.solvers/openEMS` and `~/.solvers/work`.
  - On the development machine these resolve to the same paths as before. On Linux the old work-folder default created a folder literally named `C:\Users\reza\.solvers\work` inside the current directory.
- **Stale text fixed:**
  - DEVELOPER_GUIDE: the runner covers V1–V25 (it said V1–V20); the limitations section is dated 2026-10-21.
  - README: the validation suite takes about 5–15 minutes, as the guide says (README said 2). A full reproduction run on Linux (Node 18, Magpylib 6.0.0) took 7 min 43 s and gave verdicts identical to the official report for every check.
  - PARAMETERS: the B1 wire-thinning row still described the midpoint rule, which was replaced in v1.6.
  - `core/optimise.js`: a header comment gave the crossover taper as W = 6 mm, but the value is the TUNED 10 mm. An unused variable was also removed; a 16-element ring-mode solve gives bit-identical results before and after.
- **App 0.5.1 (UI only; collaborator: "fix the graphics issue"):**
  - **No WebGL:** where the browser cannot start WebGL (3D graphics), the 3D renderer threw an error that stopped the whole page script, so even the Element tab stayed blank. Seen in VS Code's built-in browser on a laptop with hybrid NVIDIA graphics, and reproduced in Chrome with WebGL disabled.
  - Now only the 3D view is lost. It shows a note instead, and the "B1 on head surface" option is disabled. Solving, tables, the coupling matrix, B1 slices and exports work, and elements are selected from the coupling matrix.
  - **Canvases growing on high-resolution screens (bug present since the first app version):**
    - `sizeCanvas` read each canvas's layout height from its `height` attribute, then overwrote that attribute in device pixels.
    - On a 2× display every redraw therefore doubled the canvas: 520 → 1040 → 2080 px, and so on. The knot drawing slid down the page, and after a few slider moves Chrome showed a broken-canvas icon instead.
    - Found by the collaborator on a 4K screen; reproduced and fixed. The layout height is now read once. Displays at 1× were never affected.
  - **Coupling-matrix picture:** it had a fixed 360 px width that spilled out of its card in narrower windows and made the page scroll sideways. It now shrinks to fit.
  - **Controls column:** its height assumed a one-line, 52 px header. It now sticks to the top of the window with a floor of 480 px, because VS Code's built-in browser squeezed it to a sliver.
  - **Checked by driving the page in Chrome** and Firefox, with WebGL and without, on 1x and 2x screens at 1920 and 1100 px wide: Element tab with extreme shapes, Pair explorer, fast and full 16-element solves, B1 slices. There were no page errors, no growing canvases and nothing outside the page.
- **Not changed:** Design.md (frozen), every criterion and every committed result.
- **Line endings:** the shared copy had Windows (CRLF) line endings, so git showed 73 files as modified.
  - They had no content changes, which was checked file by file.
  - They were converted to LF, matching the repository. On Linux the `sim/run_queue*.sh` scripts need LF to run.

### 2026-10-21 — Design v1.10 COMSOL interface (Reza), and a process slip during it
- **Request:** Reza asked whether the output was ready for COMSOL; on hearing it was not, chose "add the COMSOL export first", then package.
- **What was built:** export files plus an MPh build script, labelled UNVALIDATED. COMSOL is **not installed** on this machine, so the script was tested only in `--dry-run`, which checks the files and records the API calls.
- **Verified:** MPh's own entry points (`mph.start`, `client.create`, `model.java`, `model.save`, `model.evaluate`) against the MPh 1.4.0 wheel source, and MPh's MIT licence and JPype dependency from its metadata.
- **Not verified:** all COMSOL feature and property names, which are marked UNVERIFIED in the code. Check V25 was pre-registered first (e2763ae).
- **Design choices (Claude):**
  1. Both solvers cut wires with the same code, now `sim/wirecut.py`, moved unchanged out of `run_openems.py` (grid verified identical: same line counts and smallest cells).
  2. S is assembled from lumped-port V and I with the openEMS wave convention, rather than relying on COMSOL's own S variables.
  3. Wires are modelled as PEC edges, so the COMSOL loop case calibrates its own thin-wire correction, as openEMS's does.
- **Process slip (Claude):**
  - While testing V25 with a KC_ONLY run, Claude restored `validation/` with `git checkout` **while the clean full validation run was still in progress**.
  - That reverted the freshly regenerated C2 comparison file mid-run, so V12 would have read stale arrays.
  - Caught at once: the run was killed and restarted from C2 on the committed code (bc374d0).
  - Lesson: never touch `validation/` while a full run is going.
- **Timing:** each pair port run takes about 29 min on the refined 8.2-million-cell grid, so about 3.8 h per case. The four pair cases are expected to finish around 05:30 on 2026-10-22.

### 2026-10-21 — Design v1.9 crossover bumps: development findings and fixes (before the official V24 run)
- **Pre-registered:** 8fa1bf7.
- **Development checks of the V24 criteria, which found problems and drove fixes:**
  1. **First version:**
     - **Pair cases:** coils separated (≥ 1.66 mm), but the bumped coil's *own* clearance fell to 1.07 mm and its tightest bend to 1.38 mm. Cause: one of its own crossings sat on a bump's taper, so its two strands rose by different amounts.
     - **16-element array:** bumps cascaded to A_max and wires still nearly touched (0.013 mm). Cause: a bump's taper rose into a lower coil that was itself raised over a third coil.
  2. **Fixes (Claude):**
     - **r0 grows** until any remaining clash, and both strands of any own crossing of the bumped coil, lie on the plateau rather than the taper.
     - **Taper W TUNED from 6 to 10 mm** (pre-registered value 6, JUDG). W = 6 still broke the 2 mm bend limit on pair d−4 (1.32 mm); W = 10 gives ≥ 2.37 mm. **Tuned on the pair cases, which V24 also tests.**
  3. **Result after the fixes:**
     - **Pair cases (development):** inter-coil ≥ 1.66 mm, own clearance 1.50 mm, bends ≥ 2.37 mm, max bump 3.15 mm, nothing capped; 24–34% of the upper coil's wire is raised.
     - **16-element array:** still **fails** — bumps capped at 10 mm, own clearance down to 0.58 mm. Local bumps are not local in heavily overlapping knot arrays, so a better array algorithm is needed (open item). The official V24 run will report this as a FAIL.
- **Grid gate (v1.9 pre-run gate (3)):**
  - With the coils 1.66 mm apart on the 1 mm grid, 1–3 spots per case had the two coils on edge-adjacent grid nodes, which fails the gate (none shared a node).
  - The gate was **not relaxed**. Instead, the grid is refined locally: lines every 0.4 mm within ±3 mm of each crossover centre (REFINE, JUDG). All four pair cases now pass all three gate parts.
  - Caveat: the thin-wire calibration assumed a uniform 1 mm grid.
- **Quasi-static effect of the bumps (information):**
  - Pair d₀: k 0.0058 → 0.0061.
  - The upper coil's L rises 500 → 509 nH (longer wire).
- **Later development fixes (harness and report, no design change):**
  - The pre-bump k matrix used the bumped L for far pairs, which broke V9 (k mirror error 2e-4). Fixed: V9 PASS again.
  - export_case's output-folder line was swallowed by a comment. Fixed.
- **Development run of V24 (KC_ONLY, 2026-10-21): FAIL.**
  - **All 4 pair simulation cases pass** every criterion: max bump 3.2 mm, 7–8 bumps.
  - **All 4 arrays fail:**
    - ring T(2,3) N16: wires 0.47 mm apart, own clearance 0.93 mm, bend 1.71 mm, capped;
    - ring T(2,5) N24: 0.23 mm, 0.93 mm, bend 1.31 mm, capped;
    - free N16: own clearance 0.58 mm, bend 1.56 mm, capped;
    - free N16 with T = 15 mm: capped only, and just 32 bumps — thicker knots interleave far more easily.
  - Bumps change adjacent k by up to 0.029.
  - **Conclusion:** local bumps work for a pair but not for dense knot arrays, so array crossovers are an open design problem (Reza).
  - The app now marks such arrays "NOT BUILDABLE AS DRAWN" in the report (app 0.5.0).
- **Aborted run (14:00, about 3 min): the refined grid had sliver cells.**
  - The first queue-4 pair run showed a 1.1e-14 s timestep, about 30× smaller than before. The excitation needed more than MAX_TS steps, so it would have been truncated. The run was killed at once.
  - **Causes** (0.002–0.1 mm cells):
    1. refinement lines next to existing lines;
    2. terminals of *different* ports within 0.005 mm of each other on one axis;
    3. phantom-box edge lines next to refinement lines.
  - **Fixes:**
    1. refinement lines are kept only ≥ MIN_GAP = 0.2 mm (JUDG) from every other line;
    2. `cut_all`: port terminals within MIN_GAP on an axis snap to one shared coordinate (terminals and wire ends move < 0.2 mm; shared by `run_openems.py` and `check_crossings.py`);
    3. phantom-box lines within MIN_GAP of an existing line are skipped;
    4. **new guard MIN_CELL = 0.15 mm (JUDG):** a case whose smallest cell is below it aborts at setup, which the preflight catches. It caught (3) on `pair_head_3T_d-4` before any run.
  - All four pair cases and `trefoil_head_3T` now pass the gate and preflight.
  - The single-coil results already obtained used the earlier mesh code; the snapping and phantom-line changes would alter their grids by < 0.2 mm at most (not re-run).

### 2026-10-21 — INVALID RUN: pair cases had the two coils touching (no separation at inter-element crossings)
- **Found:** Claude, reviewing the first pair result (`pair_head_3T_d+0`, finished about 13:10). Mirror-twin elements gave different inductances (399 vs 596 nH, where 500 is expected). Also R_loop 916 Ω (expected about 8 Ω), S21 −3.6 dB, and M_eff −118 nH against +2.9 nH quasi-static.
- **Cause:**
  - The two coils' wires pass within 0.03–0.05 mm of each other in every pair case, at the midline where the mirrored coils cross.
  - Design §4 says that "where wires from neighbouring overlapping elements cross, they need a lift too", but this was **never implemented**: neither the array solver nor the case export separates crossings between different elements.
  - `check_crossings.py` checked only crossings within each coil, plus port clearance.
  - The quasi-static model was not visibly affected, because the kernel is softened near contact (DECISIONS "Kernel softening"). FDTD shorts the coils together.
- **Same gap in app arrays:** a 16-element free array (seed 1) has 32 of 48 overlapping pairs with wires closer than 1.5 mm (wire plus insulation); the closest is 0.3 mm.
- **Actions:**
  - Pair queue killed; `pair_head_3T_d-4` was mid-run.
  - The d+0 output was moved to `sim/out/_invalid/` so the validation runner ignores it. It was included in the 13:37 full-validation V16 line (1.0025); that report is not committed and will be regenerated.
  - No pair runs until the separation is designed (Reza's decision: how coils cross each other).
- **Process lesson:** pre-run geometry checks must include wire-to-wire clearance between **all** wires, not only within each element.

### 2026-10-21 — Design v1.8: knot thickness T (Reza), and a self-inductance correction found on the way
- **Request:** Reza: one parameter for the total thickness of the knot. Reza chose "outward only" over "straddle the helmet surface".
- **Design (Claude):**
  - h = max(h_min, T/2), and the whole knot is raised by z₀ = h − h_min.
  - Consequences: T = 0 is bit-identical to v1.7, and the lowest wire never goes deeper than in v1.7.
  - The alternative, offsetting by h (lowest point on the surface), would have moved every existing design by about 0.75 mm.
- **Correction found while planning (Claude):**
  - Self-inductance pairs the wire with a copy offset by the wire radius. Up to v1.7 the offset was along z or the helmet normal, which is perpendicular to the wire only when the wire is flat.
  - For thick knots this would overestimate L. V23 information column: the v1.7 method gives +11% on a circle tilted 80°.
  - Fixed by removing the tangent component of the offset direction.
  - Effect on v1.7 shapes is small; V2 and V11 (circles) are unchanged.
- **Checks:** V21–V23 were pre-registered in 979b1fa before the code. Development run (KC_ONLY, 2026-10-21):
  - **V21 PASS:** 32/126/160/2 evaluations of (a)/(b)/(c)/(d).
  - **V22 PASS:** worst difference < 0.0001%.
  - **V23 PASS:** tilt changes L by ≤ 0.001%; 0.37% from Rosa & Grover.
  - V1, V2, V4, V5, V8 and V11 re-run: still PASS.
  - The official report is regenerated in the next full validation run.
- **First look (information, not a check):** trefoil β 0.8, core 30 mm, 0.5 mm wire, as T goes 0 → 10 → 20 → 40 → 60 mm, L goes 623 → 602 → 591 → 600 → 634 nH. Separating the strands first lowers the inter-winding mutual inductance; then the longer wire raises L. Bends tighten above about 40 mm.
- **Not affected:** the overnight and queued openEMS cases. They were exported with v1.7 geometry, which is identical at T = 0. Their quasi-static L values in the case files used the v1.7 offset; the difference is small for these nearly flat knots and will be stated when V15b is reported.

### 2026-10-21 — Pair cases: capacitor breaks shifted so every port clears the other coil (logged BEFORE any pair run)
- **Decision:** Reza, 2026-10-21: "shift the capacitor breaks by the same amount in all three pair cases (and the air pair) so every port is clear of the other coil; log it before running".
- **What V19 keeps, and what changes:**
  - V19's criterion and spacings {d₀ − 4, d₀, d₀ + 4} are unchanged.
  - Only the break positions in the pair test setup change.
  - No pair result existed at the time of this entry: the only pair run so far was the dropped-port run, which produced no signal.
- **Selection rule (Claude, fixed before scanning):**
  - One shift for all four pair cases. The mirrored element is shifted the opposite way, so the pair stays mirror-symmetric.
  - Maximise the worst-case distance from any port gap to the other coil's wire.
  - Constraint: every break stays ≥ 5 mm from a crossing (the V10 rule).
  - Segment lengths stay equal, because the whole set of 4 breaks moves together.
- **Scan:**
  - Shifts 0 to 0.25 of the wire length in steps of 1/60, then refined by 0.004 around the best.
  - Shifts that are multiples of 1/12 keep crossing clearance exactly (3-fold symmetry), but reach at most 2.1 mm, so they were not enough.
  - **Chosen: 0.100 → 7.3 mm** (was 1.4 mm). Crossing clearance 5.03 mm.
  - Shifts above 0.100 up to 0.112 violate the 5 mm rule.
- **Checks on the final cases:**
  - Crossings: none at risk.
  - Port clearance: no port at risk in any of the four cases (grid-snapping check).
  - openEMS preflight passes (all ports on the grid).
  - Mirror-symmetry error of the break sets: 0.
- **Side observation:** regenerating the cases with today's code gives the same trefoil as the single-coil runs to 0.2 µm in position (L differs by 0.001 nH, floating-point noise in the lift solve). The single-coil case files were left as committed.
- **Caveat for interpretation:** the pair's capacitors are no longer at the same positions along the wire as the single-trefoil runs. Cross-comparisons of tuned capacitor values between single and pair runs carry that difference.

### 2026-10-21 — FAILED RUN: pair_head_3T_d+0 ran 13.7 h with no signal (feed port silently dropped)
- **What happened:**
  - The first pair run (started 19:51) never injected energy: openEMS reported energy ~0 for 5.66 million timesteps.
  - openEMS had printed "Unused primitive … port_excite_1" at setup, then carried on. Nothing in the pipeline read that warning.
  - The openEMS timestep cap was its default of 10⁹, so nothing stopped the run.
  - Found by Claude at 09:35 and killed. The queue had already started `pair_head_3T_d-4`, which had the same defect; it was killed too.
  - No pair, 7T or 0.5 mm results exist yet.
- **Cause, found by elimination:**
  - Not crossing shorts, not the phantom, not the other coil's metal, not its ports, not mirror symmetry.
  - openEMS's Python interface writes box corners to XML with **7 significant digits**, but grid lines at full precision. A port is a zero-width box (a line between two grid nodes), so it sits 1–2 nm off its own grid line after export.
  - Whether openEMS then snaps such a box to an edge or drops it depends on the surrounding grid. In the two-coil grid it dropped 4 of 8 ports.
  - In the single-coil cases (loop, trefoil air, trefoil head) the logs show no such warning, so those results stand.
- **Fix, applied before any new run:**
  1. Port terminals rounded to 1 µm (`PORT_ROUND`), so the exported box lies exactly on its grid line. Geometry change ≤ 0.5 µm, against a 1 mm cell.
  2. **Preflight:** before the long runs, the model is set up once with every port excited for 5 timesteps. Any "Unused primitive" warning aborts the case.
     - Negative control: with the old coordinates, preflight aborts and names ports 1, 3, 4 and 7.
     - With the fix it passes.
  3. Timestep cap `MAX_TS` 2×10⁶ (JUDG).
- **Separate finding (geometry, not software):**
  - In `pair_head_3T_d+4`, the other coil's wire passes 1.4 mm from each feed gap and snaps onto or next to the gap nodes. The two coils would be joined through the port.
  - `check_crossings.py` now also checks port clearance against other elements. d+0, d−4 and the air pair are clear.
  - V19 needs all three spacings. Whether to move the capacitor breaks in the pair cases is a decision for Reza, because it changes the setup of a pre-registered check (though not its criterion).
  - The same issue would arise in real arrays. The app places breaks without regard to neighbouring elements' wires (open item).

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
