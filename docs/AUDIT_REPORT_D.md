# Audit, step 3, area D: app, documentation, integrity, packaging

**Auditor:** an independent agent (model: Fable), read-only. HEAD 2734546, 2026-10-20 (night). Its findings are below, with the fix status recorded in `DECISIONS.md` ("Audit actions").

| ID | Severity | Status | Location | Finding |
|---|---|---|---|---|
| D1 | High | CONFIRMED | `validation/*`, `tests/run.js` | Committed report and status never regenerated after the V15–V20 aggregation (still V1–V14, git 5f60ace). The aggregation reads `sim/out/loop_air_3T/`, which did not exist yet, so V15 would read NOT RUN rather than FAIL |
| D2 | High | CONFIRMED | `app/index.html` | The Pair explorer and the array solver share one worker. A solve or Cancel during a pair scan kills it silently, and `pairBusy` stays true for the session |
| D3 | Medium | CONFIRMED | `Design.md` §6, §6b, §7, §10 | Stale against the code: AddWire vs AddCurve; promised `report.html` not written; §10 outdated (V1–V6, no field.js or sim/, double-click claim); 400 vs 300 points; §7 "UNVALIDATED" label not implemented |
| D4 | Medium | CONFIRMED | README, DEVELOPER_GUIDE, REQUEST_LOG, DESIGN_HISTORY, PROPOSAL_v2, AUDIT_BRAINSTORM_REVIEW, DECISIONS | Stale or missing: README says v1.5, has an old validation table and no v1.7 section; REQUEST_LOG has no v1.7 or audit entries; DESIGN_HISTORY says V15–V19; PROPOSAL says "nothing built"; the "Audit actions" section is missing; the second V15 run and a_eff are undocumented |
| D5 | Medium | CONFIRMED | docs | `.html` missing or older than its `.md` for several documents; PDFs missing |
| D6 | Medium | CONFIRMED | `dist/`, builder | `dist/` is v1.5; the builder omits newer docs; `dist/` is gitignored and unversioned |
| D7 | Medium | CONFIRMED | NOTICE, README, SOURCES | Licence inventory lists Three.js only (missing Magpylib BSD-2, openEMS GPL-3 / CSXCAD LGPL-3, mariepy GPL, numpy/scipy/h5py/torch); the NIST archive is missing from SOURCES.md |
| D8 | Medium | CONFIRMED | `sim/v20_mariepy.py`, `tests/run.js` | V20 script untracked; run.js copies its verdict instead of applying the 10% criterion itself |
| D9 | Medium | CONFIRMED | app, `tests/export_case.js`, PARAMETERS | Tissue and phantom constants duplicated; zMin untagged and absent from PARAMETERS; the app export always attaches a phantom |
| D10 | Low | CONFIRMED | app | APP_VERSION says v1.6; the co-sim card omits warnings, git hash, V-verdicts; no check that results match the current design |
| D11 | Low | LIKELY | app load and exports | Schema validated too late; missing fields become `undefined`; partial state on error; no try/catch in exports |
| D12 | Low | CONFIRMED | paths, `.gitignore` | Hard-coded user paths (overridable); npz policy undocumented; pre-M10 cosim outputs have no git hash |
| D13 | Low | CONFIRMED | app | Accessibility: missing tab roles and labels; colour-only status; mouse-only 3D view |
| D14 | Low | CONFIRMED | PARAMETERS | Contradictory zCut rows; self-L points 300 vs ≤ 800 |
| D15 | Low | CONFIRMED | Design §7, DECISIONS | Post-registration harness clarifications (M6, M13, M14) not logged in the project's own records |
| D16 | Info | POSSIBLE | `docs/research_integrity/VALIDATION_PROTOCOL.md` | Cites hashes from another repository (Lab_3d) |

## Verified correct

- **Provenance headers** on all tracked source files.
- **Commit hashes:** all 14 cited hashes resolve, and the pre-registration commits contain what they claim.
- **Schemas:** the app's case export matches `tests/export_case.js` and every field the sim scripts read; tissue numbers are identical everywhere, with 3T labelled as an approximation.
- **Index mapping:** flat → wrapped mapping is sound (`S.wrap` keeps the point count).
- **Co-sim loader:** its keys match `cosim.py`.
- **Banner:** honest; any non-PASS is listed, and missing results read NOT RUN.
- **Workers:** the element worker guards stale results; the B1 worker restarts.
- **Labels:** exports carry exploratory labels.
- **Parameter tags:** γ/2π is LIT with an archived source; placeholders are tagged; the calibration file is tracked.
