# Audit, step 3, area B: layout and decoupling optimiser

**Auditor:** an independent agent (model: Fable), read-only, with scratch test scripts. HEAD 2734546. **No critical or high-severity bug found.** Fix status is in `DECISIONS.md` ("Audit actions").

| ID | Severity | Status | Finding | Evidence |
|---|---|---|---|---|
| B1 | Medium | CONFIRMED | In ring mode, `tableZero` is null, so every pair gets `ring1: false` and `kind: 'next'`. "Beyond nearest ring" then equals the adjacent set, `decoupledRing1` is always false, and the pair table labels adjacent pairs "next" | N=16 ring: 33 adjacent pairs labelled 'next'; next.max = adjacent.max |
| B2 | Medium | CONFIRMED | Ring-mode `element` panel, `coreRadius` and `h` describe ring 0 only; `elements[]` has no `h` | N=24 ring: panel Rf 33.5 vs ring Rfs 33.5 / 37.0 / 38.5 |
| B3 | Low | CONFIRMED | Comment says a top ring of 1–2 becomes a cap; the code only treats n = 1 that way | N=6 → [2,4] with no cap |
| B4 | Low | CONFIRMED | User `ringCounts` whose sum ≠ N silently replaces N | N=16 with [2,6,10] → N=18 |
| B5 | Low | LIKELY | `liftFeasible` set false permanently by any rejected trial; never re-evaluated for the final rings | Code reading |
| B6 | Low | LIKELY | Free mode: shared Rf unbounded; lift solved once at Rf₀; clearance not re-checked at the final Rf | Benign in tests (lift saturates at c/2) |
| B7 | Low | POSSIBLE | Ring-mode cost over a Voronoi set recomputed per trial, so the objective is discontinuous | No escape observed; adjacency stable at 0.5–2× tolerance |
| B8 | Low | CONFIRMED (docs) | Design §5.1 "not yet implemented" is stale; §5.2 says "spherical spiral" (code: farthest-point sampling + Lloyd); duplicated zCut rows | grep |
| B9 | Low | POSSIBLE | C2: free arm is best of 4 starts on the primary metric, ring arm a single start, so selection favours free (pre-registered that way) | Protocol |
| B10 | Low | POSSIBLE | Two different pair-null estimators (free: tableZero; ring: last pairScan zero) | They agree to 3 decimals for 4 knots |

## Verified correct

- **Lookup angle convention:** worst error 1.0 nH on |M| up to 123 nH; the alternative convention would be off by up to 19 nH.
- **Index handling:** lookup wrapping and indices; ring twin indices and mirror flags for N = 2 to 64; count allocation always sums to N.
- **Caches:** keys are sufficient (no stale reuse).
- **Sample sets:** adjacency and coverage use consistent samples; adjacency is robust to tolerance ×0.5 and ×2.
- **Search moves:** zone-first acceptance, rescue jumps, size steps and locked-rotation steps are sound.
- **Multi-start:** reproducible; the chosen start re-runs exactly.
- **Verdict logic:** "decoupled" ⇔ all |k| < 0.01; verdicts are false, not vacuously true, when a category is empty.
