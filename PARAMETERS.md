# Parameter Registry — Knotted Coil Designer

Every number that shapes a result, with its true origin. Tags follow the research-integrity code standard:
**LIT** (from verified literature) · **CONV** (convention/library default) · **JUDG** (our judgement) · **TUNED** (searched) · **DERIVED** (computed from others).
**PLACEHOLDER** marks a JUDG value awaiting Reza's real specification.

Last updated 2026-10-20.

## Physical inputs (placeholders until Reza supplies them)

| Parameter | Value | Tag | Rationale / source | Where |
|---|---|---|---|---|
| Wire diameter d_w | 1.0 mm | JUDG PLACEHOLDER | Round number for magnet-wire-scale loops. Awaiting spec (Design D5) | app, tests |
| Insulation thickness t_i | 0.25 mm | JUDG PLACEHOLDER | Awaiting spec (D5) | app, tests |
| Minimum bend radius | 2 mm | JUDG PLACEHOLDER | Awaiting spec (D5) | app, tests |
| Helmet semi-axes a, b, c | 85, 105, 110 mm | JUDG PLACEHOLDER | Rough adult head plus clearance, not measured. Awaiting former dimensions (D4) | `core/surface.js` |
| Lowest covered height zCut | ~~0 mm~~ **superseded: −20 mm since v1.6** (see v1.6 table) | JUDG PLACEHOLDER | Ellipsoid equator (v1.0–v1.5) | `core/surface.js` |
| Face opening half-angle / top | 40° / 60 mm | JUDG PLACEHOLDER | Visual guess | `core/surface.js` |

## Design defaults (Design.md v1.0)

| Parameter | Value | Tag | Rationale / source | Where |
|---|---|---|---|---|
| Bloom shape | outward (lobes extend from a fixed base circle) | JUDG | Design v1.2 (Reza 2026-10-20); 'symmetric' (v1.0) selectable | knot, app |
| Petal sharpness m | 1 (range 1–16) | JUDG | Design v1.3 (Reza 2026-10-20). Profile exponent; 1 = v1.2 shape. Range upper bound is judgement: bends tighten quickly beyond about 10 | knot, app |
| Lobe aspect-ratio definition | length ÷ width at half length | DERIVED | Claude's definition; formula in `core/knot.js` `lobeAspect` | knot, app |
| Bloom range β | 0.02–3.0 outward, 0.02–0.9 symmetric (UI allows 0.005–3) | JUDG | Design §3.3. **Validation run 1 showed 0.02 is below the buildable floor for the placeholder wire**. See DECISIONS.md | knot, app |
| Decoupling threshold \|k\| | 0.01 | JUDG PLACEHOLDER | Design D6; not yet justified from literature | `core/optimise.js` |
| Neighbour definition | nearest ring (d < 1.35 × pair-null spacing) | JUDG | Design v1.1 §5.1 (Reza, 2026-10-20). The v1.0 rule (footprints overlap, d < 2 Rf) is selectable and always reported | `core/optimise.js` |
| Bloom mode | constant core | JUDG | Design D2 | app |
| Rotation mode | free per element | JUDG | Reza 2026-10-20: rotation as a decoupling lever | `core/optimise.js` |

## Design v1.7: full-wave co-simulation (`sim/`)

| Parameter | Value | Tag | Rationale / source | Where |
|---|---|---|---|---|
| Solver | openEMS 0.37.0 (FDTD), Python 3.14 wheels | CONV | Verified install 2026-10-20; docs.openems.de | `sim/run_openems.py` |
| Wire primitive | `AddCurve` (thin PEC curve) | JUDG | `AddWire` with radius 0.5 mm **disconnected** on a 2 mm grid (see DECISIONS) | `sim/run_openems.py` |
| Grid near wires | 1.0 mm | JUDG | Sensitivity runs at 0.5 / 1.0 / 2.0 mm | `sim/run_openems.py` |
| Grid in phantom | 3.0 mm | JUDG | openEMS MRI tutorial uses 2 mm | `sim/run_openems.py` |
| Port / capacitor gap | 2.0 mm | JUDG | | `sim/run_openems.py` |
| Air spacer | 200 mm | CONV | openEMS MRI_Loop_Coil tutorial | `sim/run_openems.py` |
| End criterion | 1e-4 | CONV | openEMS MRI_Loop_Coil tutorial | `sim/run_openems.py` |
| Excitation half-band | 0.5 × f0 | JUDG | | `sim/run_openems.py` |
| Boundary | MUR (all sides) | CONV | openEMS MRI_Loop_Coil tutorial | `sim/run_openems.py` |
| Thin-wire effective radius a_eff | calibrated per grid on the R = 40 mm loop | DERIVED | Inverts Rosa & Grover eq. [62]; validated by V15b on the trefoil | `sim/cosim.py` |
| Copper conductivity | 5.8e7 S/m | CONV | Standard handbook value, **not cited** | `sim/cosim.py` |
| Capacitor Q | 1000 | JUDG PLACEHOLDER | Until components are chosen | `sim/cosim.py` |
| Matching-inductor Q | 100 | JUDG PLACEHOLDER | | `sim/cosim.py` |
| Preamp input impedance | 2 Ω | JUDG PLACEHOLDER | | `sim/cosim.py` |
| Tuning passes (arrays) | 3 | JUDG | | `sim/cosim.py` |
| Tissue 7T (brain / skull / skin εr, σ) | 52.7, 0.95 / 11.4, 0.29 / 38.9, 0.84 | CONV (secondary) | openEMS bundled phantom, attributed to IT'IS/Gabriel; **not independently verified** | `tests/export_case.js`, app |
| Tissue 3T | 62.8, 0.66 / 12.5, 0.13 / 46.8, 0.58 | **APPROXIMATION** | openEMS 128 MHz *body* phantom values mapped to head layers | same |
| Phantom layers | skin 4 mm, skull 7 mm | JUDG PLACEHOLDER | | `tests/export_case.js` |
| Test element | T(2,3), β 0.8, Rf 45 mm, 4 breaks, posterior midline at 20° elevation | JUDG | | `tests/export_case.js` |
| V18 depth | along the ray from the head centre | JUDG | Not the true normal distance | `sim/cosim.py` |

## Design v1.6 additions

| Parameter | Value | Tag | Rationale / source | Where |
|---|---|---|---|---|
| Face zones: eyes | az ±17°, el +5°, half-widths 13° × 10° | JUDG PLACEHOLDER | Rough adult proportions. Replace with measured landmarks or the ICBM152 eye mask | `core/surface.js` |
| Face zone: mouth | az 0°, el −30°, half-widths 20° × 9° | JUDG PLACEHOLDER | Same | `core/surface.js` |
| Zone margin for wires | 5 mm | JUDG PLACEHOLDER | Proposal default | `core/surface.js` |
| Lowest covered height zCut | −20 mm (was 0) | JUDG PLACEHOLDER | Lowered once zones protect the face | `core/surface.js` |
| Face wedge | off (was on) | JUDG | Replaced by zones | `core/surface.js` |
| lambdaZone | 1 (was 0.05 in development) | JUDG | Wires entered zones at 0.05 | `core/optimise.js` |
| Coverage buffer around zones | 0.5 × footprint radius | JUDG | Stops the coverage term pulling wires into zones | `core/optimise.js` |
| Footprint zone check | 97 points, 1.1 × Rf | JUDG | 37 points at 1.0 × Rf missed zones; wrapped wires reach ~5% past Rf | `core/optimise.js` |
| Multi-start jitter | 0.25 × spacing | JUDG | | `core/optimise.js` |
| Adjacency tolerance | 2 × sample spacing | DERIVED | Voronoi border detection | `core/optimise.js` |
| Ring count heuristic | round(√(N/2.5)) rings | JUDG | | `core/optimise.js` |
| Ring elevation range | covered edge to 1.5 rad (start top at 1.3 rad) | JUDG | | `core/optimise.js` |
| Ring search points per element | 96 | JUDG | Speed; final report uses 300 | `core/optimise.js` |
| γ/2π (proton) | 42.577478461 MHz/T | **LIT** | CODATA 2022 via NIST; VERIFIED 2026-10-20, archived in `sources/` | `core/knot.js` |
| Capacitor clearance from crossings | 5 mm | JUDG PLACEHOLDER | Until the capacitor package size is known | app |
| Segment-length warning | λ/10 (free space) | JUDG | Rule of thumb, not a cited value | `core/knot.js` |
| Break placement | 200 trial offsets; nudges up to ¼ segment | JUDG | | `core/knot.js` |

## B1 quick look (Design v1.5)

| Parameter | Value | Tag | Rationale / source | Where |
|---|---|---|---|---|
| Head surface | helmet semi-axes − 10 mm | JUDG PLACEHOLDER | Stand-in for a head; replace with a real head model when simulating | `core/field.js` |
| B1 units factor | 100 µT/A per (1/mm) | DERIVED | μ0/4π with mm units; header of `core/field.js`; checked by V8 | `core/field.js` |
| Wire thinning for B1 | ≤ 200 points per element | JUDG | Speed. Field points are ≥ 10 mm from wires, so the midpoint rule is adequate (not separately tested) | `core/field.js` |
| Colour scale | −30 to 0 dB relative to the maximum shown, viridis | CONV | Viridis is a standard perceptually uniform colour map | app |
| Array combination | √Σ\|B1ᵢ\|² (1 A per element) | CONV | Common quick stand-in for combined array sensitivity; ignores noise correlation | app |

## Numerical choices

| Parameter | Value | Tag | Rationale / check | Where |
|---|---|---|---|---|
| μ0/4π | 1e-7 H/m = 0.1 nH/mm | DERIVED | SI definition | `core/inductance.js` |
| Near-field refinement distance | 3 segment lengths | JUDG | Checked indirectly by V1, V2, V4 | `core/inductance.js` |
| Max sub-pieces per segment | 12 | JUDG | Same | `core/inductance.js` |
| Kernel softening between elements | ε = d_w + 2 t_i | JUDG | Wires crossing between elements are separated by at least this. Sensitivity not yet tested | `core/optimise.js` |
| Self-inductance method | centreline vs copy offset by wire radius | LIT (method) | High-frequency surface-current formula, Rosa & Grover 1912 eq. [62], VERIFIED. Checked by V2 | `core/inductance.js` |
| Element points (element view) | adaptive: 100·p·q (min 400), doubled until crossing count is stable | JUDG | Added after validation run 1 | `core/knot.js` |
| Stage-1 table | 128 pts; d = 0.3–3.0 Rf in 55 steps; 12 rotation steps per 2π/q | JUDG / DERIVED | Speed. Stage 2 corrects table error | `core/optimise.js` |
| Stage-2 / final points | 160 / 300 per element | JUDG | V4: k converged to < 0.001 at 300 | `core/optimise.js` |
| Self-L points | 300 (solver); ≤ 800 (Element tab, thinned from the adaptive point count) | JUDG | | `core/optimise.js` |
| Worst-pair weight λ_max | 1 (cost term λ_max·k⁴/thr²) | JUDG | Chosen before testing, not tuned. Made default by the pre-registered comparison, `validation/compare_worstpair.html` | `core/optimise.js` |
| Coverage weight λ | 1 | JUDG | Makes gaps dominate k² terms | `core/optimise.js` |
| Neighbour weight taper | 2.0 → 2.4 Rf (footprint); 1.35 → 1.55 × null spacing (ring1) | JUDG | Stops pairs escaping by stepping just past the cut-off | `core/optimise.js` |
| Coverage samples | 2400 on full ellipsoid | JUDG | | `core/optimise.js` |
| Search sweeps | ≤ 300 (stage 1), ≤ 12 (stage 2) | JUDG | Speed vs quality; not tuned | `core/optimise.js` |
| Random seed | 1 | JUDG | Reproducibility; stored in every export | `core/optimise.js` |
| Bloom floor formula | c / (R sin(π/p)) outward; c / (2 R sin(π/p)) symmetric | DERIVED | Claude's geometric argument; agrees with the numerical lift solver (see DECISIONS.md) | `core/knot.js` |
