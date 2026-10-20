# Knotted Coil Designer

A browser tool for designing MRI receive phased arrays made of **knotted wire loops** (torus knots T(p,q), with 1–8 lobes) on a helmet former. It generates single elements, "blooms" them, and **automatically arranges N elements to reduce coupling between neighbours (geometric decoupling)**. It exports wire paths, coupling matrices and meshes.

> **Status: exploratory research software.** Every electromagnetic output is a *quasi-static geometric estimate*: it assumes low frequency and models the wires as thin current paths. It ignores capacitors, the head/body load and wave effects. Confirm any design with a full electromagnetic (full-wave) simulation or with bench S21, the coupling between two coils measured on a network analyser, before building.

## How to run

- **Easiest:** double-click `app/index.html`. It needs no install and no internet; the Three.js 3D library is stored in `vendor/`.
  - *Not yet tested:* opening by double-click. It was tested served from a local web server.
  - If the array solver doesn't respond when opened by double-click, use the built-in local server (tested). Run `node tools/serve.js` in this folder, then open http://localhost:8765/app/index.html.
- **Validation suite** (needs Node.js; takes about 2 minutes):

```bash
node tests/run.js
```

This writes `validation/validation_report.html`. The app's header shows the latest verdicts.

## What's where

| Path | Contents |
|---|---|
| `Design.md` | Frozen design v1.1 (v1.0 pre-registered validation criteria V1–V6; v1.1 changed the neighbour definition only) |
| `DECISIONS.md` | Dated decision log, including validation failures and open questions for Reza |
| `PARAMETERS.md` | Every parameter with its origin tag (LIT / CONV / JUDG / TUNED / DERIVED) |
| `core/` | Geometry and EM package: `knot.js`, `inductance.js`, `surface.js`, `layout.js`, `optimise.js` |
| `app/index.html` | Browser UI: Element, Pair explorer, Array on helmet |
| `tests/run.js` | Pre-registered validation checks plus labelled post-hoc checks |
| `validation/` | Generated validation reports |
| `vendor/` | Three.js 0.149.0 (MIT licence, `vendor/three-LICENSE.txt`) |

## Validation status (run 2, 2026-10-20)

| Check | Verdict |
|---|---|
| V1 Maxwell coaxial mutual inductance | PASS (worst error 0.005%) |
| V2 Loop self-inductance | PASS (worst error 0.66%) |
| V3 Coplanar-circle null spacing | NOT EVALUABLE (reference unverified; computed 0.760 × diameter) |
| V4 Convergence | PASS |
| V5 Symmetry | PASS |
| V6 Topology across bloom | **FAIL** at β = 0.02 only (below the physical floor for the placeholder wire; see DECISIONS.md) |

**B1 quick look (Array tab):** shows the quasi-static Biot–Savart field of the solved wires.
- **Views:** on a placeholder head surface, or as an axial, coronal or sagittal slice.
- **Elements:** combined as root-sum-of-squares, or a single element (click its wire).
- **Use it for:** comparing coverage and depth fall-off between designs. It is not an absolute sensitivity prediction, because tissue and wave effects are not modelled.
- **E-fields are not shown:** this model can't produce them reliably. Use a full-wave simulator with the exported wire paths.

**Solver comparison (pre-registered):** `validation/compare_worstpair.html`. The worst-pair term is on by default. It lowers the worst pair but raises the typical (median) coupling; set "Worst-pair weight" to 0 to turn it off.

## References

- **Rosa, E. B. & Grover, F. W. (1912).** Formulas and tables for the calculation of mutual and self-inductance (revised). *Bulletin of the Bureau of Standards* 8(1):1–237, Scientific Paper 169. https://nvlpubs.nist.gov/nistpubs/bulletin/08/nbsbulletinv8n1p1_A2b.pdf
  - p. 6, eq. [1]: Maxwell's coaxial formula, modulus convention. **VERIFIED**.
  - p. 111, eq. [62]: ring self-inductance with surface current. **VERIFIED**.
  - pp. 20–21: Example 1, used for post-hoc check PH1. **VERIFIED**.
- **Roemer, P. B., Edelstein, W. A., Hayes, C. E., Souza, S. P. & Mueller, O. M. (1990).** The NMR phased array. *Magn Reson Med* 16:192–225. doi:10.1002/mrm.1910160203. **UNVERIFIED** (not read).
- **Roemer, P. B. & Edelstein, W. A., US Patent 4,825,162 (1989).** Read via Google Patents OCR text: circular-coil spacing "D approximately equal to 0.75d". **PARAPHRASE-ONLY.**

## Provenance and AI-use statement

This software was written with **Claude Code** (Anthropic's AI coding assistant, model Claude Opus 5.5) under the direction of **Reza Farivar** (McGill University), who is accountable for it.

- Every source file carries a provenance header.
- Reference formulas were verified against the primary text listed above.
- Validation criteria were pre-registered in `Design.md` (git 39a4e83) before any code was written.
- Failures are recorded in `DECISIONS.md` and in the git history.
- Any use of results in publications must disclose AI assistance as the venue requires (COPE/ICMJE for journals; current Tri-Agency guidance for grants).

**Third-party code:** Three.js 0.149.0, © three.js authors, MIT licence.
