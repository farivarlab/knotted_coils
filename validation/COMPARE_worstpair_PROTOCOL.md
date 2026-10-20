# Pre-registered comparison: worst-pair term on vs off

**Written 2026-10-20, before any comparison run, and committed to git before running.** Requested by Reza: "Implement the worst-pair term as a smooth stand-in (soft-max or sum of k^4), compare against the current solver on the same seeds, and report both."

## Arms

- **A (current solver):** `lambdaMax = 0`. Cost per neighbour pair = w·k². This is the solver as built up to git ea9f761.
- **B (with worst-pair term):** `lambdaMax = 1`. Cost per neighbour pair = w·(k² + k⁴/thr²), with thr = 0.01.

**Why this form:** Design §5.1 asks for a max|k| term. A hard maximum does not split into per-element pieces, and the solver's local search moves one element at a time, so I used Σk⁴ (one of the two stand-ins Reza named). It equals k² at |k| = thr and dominates above it.

**λ_max = 1 is a single judgement value (JUDG) chosen before running.** It is not tuned on these runs.

## Runs (paired: same configuration and same seed in both arms)

Everything not listed here stays at its default: target = nearest ring, rotation = free, threshold 0.01, placeholder wire and helmet.

| Set | Knots (β) | N | Seeds | Solver | Paired runs |
|---|---|---|---|---|---|
| Fast | T(2,3) β=0.4 · T(2,5) β=0.4 · T(3,4) β=0.3 | 16, 32 | 1–5 | fast (table) | 30 |
| Full | T(2,3) β=0.4 | 16 | 1–5 | full (table + exact) | 5 |

## Outcomes

**Primary:** worst nearest-ring |k| in the final exact report (`ring1.max`).

**Secondary (reported, no decision attached):**
- number of nearest-ring pairs ≥ threshold;
- median nearest-ring |k|;
- worst footprint-pair |k|;
- worst |k| beyond the nearest ring;
- coverage;
- solved footprint radius;
- runtime.

## Decision rule (applied mechanically)

B becomes the default (`lambdaMax = 1`) only if **all three** hold across the 35 paired runs:

1. B's primary outcome is lower than A's in **≥ 70%** of paired runs (≥ 25 of 35).
2. The **median of paired ratios** B/A of the primary outcome is **≤ 0.90**.
3. **No paired run** has B's coverage below 0.99 where A's is ≥ 0.99.

Otherwise the default stays `lambdaMax = 0`, and the result goes to Reza to decide between dropping the term from the Design (v1.2) and trying another form.

**Status of any adoption:** this comparison covers only these configurations, so it is **exploratory**. It is not a general claim about the optimiser.
