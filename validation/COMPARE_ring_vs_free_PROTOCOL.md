# Pre-registered comparison C2: ring layout vs free layout

**Written 2026-10-20, before the ring-mode code exists, and committed to git before any run.** Context: Reza said placement "still doesn't look great" and asked for head-symmetric arrays (Design v1.6).

## Arms
- **Free:** the current solver (fast mode, target = nearest ring per v1.1, worst-pair term on), **multi-start best of 4** (WP3).
- **Ring:** ring mode, mirror-symmetric.
  - Ring counts are allocated automatically from N.
  - Per-ring elevation, spacing, rotation and **size** are optimised.
  - Bloom and sharpness are fixed at the same values as the free arm, so only the layout differs.

Both arms use the same defaults: helmet, face exclusion zones, placeholder wire, threshold 0.01.

## Configurations (4)

| # | Knot | β | m | N |
|---|---|---|---|---|
| 1 | T(2,3) | 0.8 | 1 | 16 |
| 2 | T(2,3) | 0.8 | 1 | 24 |
| 3 | T(2,3) | 0.8 | 1 | 32 |
| 4 | T(2,5) | 0.8 | 2 | 24 |

## Outcomes
All outcomes come from the common exact final report, so both arms are scored identically:
- **worst adjacent |k|**, the worst coupling among Voronoi-adjacent pairs (the v1.6 definition);
- **regularity CV**, the coefficient of variation of nearest-neighbour centre distances (lower = more even);
- **coverage**;
- **zone violations.**

Reported for information: median adjacent |k|, second-ring worst |k|, runtime.

## Decision rule (applied mechanically)
Ring becomes the **default layout mode** only if **all three** hold:
1. Ring regularity CV is lower than free in **≥ 3 of 4** configurations.
2. The median over configurations of (ring worst adjacent |k|) ÷ (free worst adjacent |k|) is **≤ 1.10**, meaning ring is not more than 10% worse.
3. Ring coverage is **≥ 0.97** in all four configurations, with **zero zone violations.**

Otherwise free stays the default, and ring mode stays available as an option.

## Status
Exploratory: placeholder helmet, zones and wire; these configurations only.
