# Audit, step 2: independent review of the brainstorm

**Reviewer:** a fresh agent (model: Fable), read-only, 2026-10-20 (night). It did not write the code. Below is its report in full, followed by the actions taken in response.

## Verified correct by the reviewer (no finding)

- **Matching derivation:** Z_in = X_m² / (Z_c − jX_m), so X = √(Z₀R), C_m = 1/(ωX), L_m = X/ω.
- **Network maths:** `s2z`; `reduce()` (Schur complement); the shunt-C / series-L network in `external()`.
- **Quasi-static maths:** the AGM elliptic integrals and Maxwell's formula; the μ₀/4π unit constants.
- **openEMS interfaces:**
  - the phantom HDF5 layout matches openEMS's own writer;
  - the incident wave `uf_inc = 0.5(U + I·Z_ref)` matches the co-simulation's a = (V + Z₀I)/2;
  - port direction and wire order are consistent;
  - the feed is the same break in `K.breaks` and `cut_wire`.
- **Thin-wire correction:** sign and a_eff inversion are arithmetically consistent (a_eff 0.17 mm from L_raw 278.6 nH).

## Missed failure modes (M1–M17)

| ID | Failure mode | Why it matters | Detect / test |
|---|---|---|---|
| M1 | V15–V20 are not in the test suite; the app banner and `validation_status.js` say "all pass" while **V15 failed** | False validation status; integrity claim untrue | Aggregate `sim/out/*/cosim.json` into the report |
| M2 | Stair-stepped `AddCurve` strands can short at crossings (1.5 mm apart on a 1 mm grid) | Knot topology destroyed in FDTD; V15b would fail with the wrong diagnosis | Trefoil at 0.5 vs 1.0 mm; crossing connectivity |
| M3 | Frequency-domain dump vs port-probe normalisation across runs | Every B1 superposition (V18) | Compare a time-domain dump transformed in Python with the FD dump, or a superposed field with a direct run |
| M4 | V19's d₀ is the *flat, unmirrored* null; the case is wrapped and mirrored | V19 tests a different configuration than registered | Report on-helmet k_qs; bracket the on-helmet null |
| M5 | No air pair case; the sign of M_eff vs M_qs is never checked | Tissue, wrapping and capacitor effects cannot be separated | Add `pair_air_3T_d+0`; check the signs |
| M6 | V17 evaluated with neighbours on 50 Ω; tuning used preamp terminations | V17 can fail for reasons unrelated to tuning | Report S11 under both terminations |
| M7 | V18 normalises to the in-plane maximum (the noisiest point) | One voxel sets the comparison | Report a robust normalisation alongside |
| M8 | V10 and V12 are self-reported (circular) | A reporting bug passes its own test | Recompute independently in the test |
| M9 | V14 compares thinned wires with thinned wires | Thinning error untested | Compare thinned vs full-wire field |
| M10 | Calibration file untracked, keyed only by grid; sim outputs carry no git hash; outputs came from uncommitted code | Not reproducible | Record hash and options; track the calibration |
| M11 | `dist/` is stale | The shared package runs older code | Rebuild; check builder consistency |
| M12 | Design §6b says `AddWire`; the code uses `AddCurve` | Documentation and code disagree | Update the document |
| M13 | The coronal plane is "15 mm inside the head" measured from the helmet, so only about 5 mm into the skin | V18 near-surface points are the worst stair-stepped ones | Define the plane from the head surface |
| M14 | The phantom's neck cut is ignored in the depth calculation | Points misclassified near zMin | depth = min(ellipsoid depth, z − zMin) |
| M15 | In air, Re(Z) of a PEC loop is at noise level | Air C_m and L_m reported with false precision | Flag when R_loop is tiny |
| M16 | `sources/` PDFs and the GPL imports in a package meant for sharing; NOTICE lists Three.js only | Licence and copyright exposure | Licence inventory |
| M17 | `tests/run.js` header says "V1–V6, git 39a4e83" | Readers can't trace registrations | Add a per-check `registered_in` |

## Mis-rated brainstorm items

| Item | Reviewer's correction |
|---|---|
| C5 | Should be *Partial* (rests on the solver's own self-report) |
| C3 | V9 has limited coverage: no cap, odd-N or midline-heavy case |
| B12 | The singular branch is untested |
| C12 | Low risk |
| D1 | Understated: V15b is non-circular only through its transfer to the trefoil |
| A14 | V18 compares a circularly polarised component with a linear magnitude; this is a physics difference the check will count against the quasi-static model |
| E4 | Should be *Open* |
| B8 | The `z.imag > 0` filter is vacuous |

## Reviewer's top 10

1. M1
2. M2
3. M3
4. A7 / V15
5. M4 / M5
6. A9 / A10
7. M10 / C14
8. M8
9. M6 / M7
10. M11 / M12

## Actions (filled in as they are done)

See DECISIONS.md, "Audit actions".
