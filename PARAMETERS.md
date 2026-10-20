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
| Lowest covered height zCut | 0 mm | JUDG PLACEHOLDER | Ellipsoid equator | `core/surface.js` |
| Face opening half-angle / top | 40° / 60 mm | JUDG PLACEHOLDER | Visual guess | `core/surface.js` |

## Design defaults (Design.md v1.0)

| Parameter | Value | Tag | Rationale / source | Where |
|---|---|---|---|---|
| Bloom shape | outward (lobes extend from a fixed base circle) | JUDG | Design v1.2 (Reza 2026-10-20); 'symmetric' (v1.0) selectable | knot, app |
| Bloom range β | 0.02–3.0 outward, 0.02–0.9 symmetric (UI allows 0.005–3) | JUDG | Design §3.3. **Validation run 1 showed 0.02 is below the buildable floor for the placeholder wire**. See DECISIONS.md | knot, app |
| Decoupling threshold \|k\| | 0.01 | JUDG PLACEHOLDER | Design D6; not yet justified from literature | `core/optimise.js` |
| Neighbour definition | nearest ring (d < 1.35 × pair-null spacing) | JUDG | Design v1.1 §5.1 (Reza, 2026-10-20). The v1.0 rule (footprints overlap, d < 2 Rf) is selectable and always reported | `core/optimise.js` |
| Bloom mode | constant core | JUDG | Design D2 | app |
| Rotation mode | free per element | JUDG | Reza 2026-10-20: rotation as a decoupling lever | `core/optimise.js` |

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
| Self-L points | 300 | JUDG | | `core/optimise.js` |
| Worst-pair weight λ_max | 1 (cost term λ_max·k⁴/thr²) | JUDG | Chosen before testing, not tuned. Made default by the pre-registered comparison, `validation/compare_worstpair.html` | `core/optimise.js` |
| Coverage weight λ | 1 | JUDG | Makes gaps dominate k² terms | `core/optimise.js` |
| Neighbour weight taper | 2.0 → 2.4 Rf (footprint); 1.35 → 1.55 × null spacing (ring1) | JUDG | Stops pairs escaping by stepping just past the cut-off | `core/optimise.js` |
| Coverage samples | 2400 on full ellipsoid | JUDG | | `core/optimise.js` |
| Search sweeps | ≤ 300 (stage 1), ≤ 12 (stage 2) | JUDG | Speed vs quality; not tuned | `core/optimise.js` |
| Random seed | 1 | JUDG | Reproducibility; stored in every export | `core/optimise.js` |
| Bloom floor formula | c / (R sin(π/p)) outward; c / (2 R sin(π/p)) symmetric | DERIVED | Claude's geometric argument; agrees with the numerical lift solver (see DECISIONS.md) | `core/knot.js` |
