# Audit, step 3, area A: core geometry and quasi-static electromagnetics

**Auditor:** an independent agent (model: Fable), read-only, with scratch test scripts. HEAD 2734546. Fix status is in `DECISIONS.md` ("Audit actions").

| ID | Severity | Status | Where | Finding | Evidence |
|---|---|---|---|---|---|
| **A1** | **High** | CONFIRMED | `core/knot.js` minSelfClearance and solveLift; callers in `core/optimise.js` (n = 200) | Self-clearance is measured **point-to-point**, so a coarse polyline overestimates it and the lift solver under-lifts. Solver, pair explorer and ring mode solve the lift at n = 200 and never re-check the final wires. Hidden for T(2,q), whose crossings fall on sampled extremes; real for p ≥ 3 | T(3,4) β = 0.8: h from n = 200/400/1600/6400 = 0.436 / 0.789 / 0.862 / 0.866 mm. With h = 0.436 the true clearance is **0.757 mm vs 1.5 mm required** |
| A2 | Medium | CONFIRMED | `core/surface.js` zones | The mouth zone (el −21…−39°) lies below the coverage floor (zCut = −20 mm, el −10.5°), so it is inert and V12 is vacuous for it | 0 of 11,818 covered samples hit the mouth zone |
| A3 | Medium | CONFIRMED (test design) | V11 | Circular: the "closed form" is the same expression as `K.capacitor`, so V11 can only fail if V2 fails | Code reading |
| A4 | Low | CONFIRMED | `knot.report` | minClearance is capped at 2 × the required clearance, so the UI shows ≤ 3 mm even when the true clearance is larger | p = 1 rosette: true 5.58, shown 3 |
| A5 | Low | CONFIRMED | `adaptiveN` | Cannot satisfy its own "three equal counts" rule when the start exceeds 25,600, so it always falls through to the untested 102,400 | T(5,6) m = 16 |
| A6 | Low | CONFIRMED | `selfL` | Converges as O(1/n): about 0.4–0.6% low at 300 points (within V2's 2%) | Circle and trefoil convergence series |
| A7 | Low | POSSIBLE | `surface.alongNormal` | Silently falls back to radial snapping when the normal line misses the ellipsoid; unflagged | Beyond current footprints |
| A8 | Low | LIKELY | V8, V14 | The direction (sign) of the B1 vector is never tested; only magnitudes are. Verified correct by hand | Hand check |
| A9 | Low | CONFIRMED | Comments | knot.js and field.js "MATLAB EQUIVALENT" sections outdated; Design §6 "400 points" stale | Reading |

## Verified correct

- **Crossings:** match brute force for 7 knots up to 102,400 points; vertex crossings counted once.
- **Mirror:** exact.
- **Lift bisection:** monotone, so bisection is valid.
- **Bloom floor:** `betaMinPhysical` matches the numerical floor.
- **Capped clearance:** equals the exact value below the cap.
- **Breaks:** recomputed independently, 64/64.
- **Elliptic integrals and Maxwell:** to 1e-15.
- **Units:** all constants.
- **B1 singular branch:** safe.
- **Neumann near-field:** converges (0.1% at 300 points).
- **Wrap:** on the ellipsoid to 7e-16.
- **Non-circular checks:** V1, V4, V5, V6, V7, V8 are non-circular; V9's mapping is right.
