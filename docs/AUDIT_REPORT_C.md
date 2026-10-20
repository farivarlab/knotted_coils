# Audit, step 3, area C: full-wave capacitor co-simulation

**Auditor:** an independent agent (model: Fable), read-only, with synthetic numeric checks; no simulations run. HEAD 2734546. Fix status is in `DECISIONS.md` ("Audit actions").

| ID | Severity | Status | Where | Finding |
|---|---|---|---|---|
| C1 | Medium | CONFIRMED | `sim/cosim.py` | The quasi-static map is evaluated at the nominal plane position, but openEMS's H dump sits half a cell away (0.5 mm here, up to 1.5 mm in the phantom grid): a few percent of systematic bias in V18 |
| C2 | Medium (provenance) | CONFIRMED | DECISIONS | The official V15 run repeats the tagged thin-curve run (−10.3%), so V15 will FAIL; that was not recorded beforehand |
| C3 | Medium (check design) | LIKELY | V18 | The maximum is taken over every near-surface point, including the far side of the head where both maps are about 1% of their peak, so noise dominates. A registration weakness, not a code bug |
| C4 | Low | CONFIRMED | Design §6b | Still says `AddWire` |
| C5 | Low | LIKELY | `sim/run_queue.sh` | If an openEMS run fails, `cosim.py` still runs on a stale earlier `openems.npz` |
| C6 | Low | POSSIBLE | `sim/cosim.py` | The root search has no residual check (a pole could be accepted); the reference value is the previous pass's root, not the first-pass value as documented |
| C7 | Low | POSSIBLE | `cosim.py` L extraction | Gap and port parasitic capacitance is absorbed into L_raw and hence into a_eff; the gap fraction differs between the loop and the trefoil |
| C8 | Low | POSSIBLE | export vs app | V19's d₀ uses `zeros[last]`, while the app uses `zeros[0]` (identical here) |
| C9 | Low | POSSIBLE | `cosim.py` | `inside` uses the analytic ellipsoid, while the phantom is 3 mm voxels; depth is measured along the ray, not as the nearest surface distance |

## Verified correct

- **Network maths on a synthetic loop:**
  - capacitor values reproduced to 12 digits;
  - S11 −50.7 dB;
  - the preamp-decoupled load and the 1 W source convention behave as expected;
  - the wave round trip closes to 1e-15.
- **Sign and orientation conventions:** intra-element results don't depend on port orientation; the M_eff sign check is meaningful.
- **Thevenin source.**
- **`cut_wire`** on all exported cases.
- **Frequency handling:** f0 falls exactly on a sample.
- **M3 superposition-check logic.**
- **Thin-wire correction:** the trefoil's correction is 100.5 nH against a 25 nH tolerance, so V15b has real power as a transfer test.
- **Units, B1⁻ convention, phantom writer.**
- **Verdict logic in `tests/run.js`.**
