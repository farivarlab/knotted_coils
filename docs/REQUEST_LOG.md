# Request Log — how this design came about

Reza Farivar's instructions during the build session of 2026-10-20, quoted, with what each one produced. All of this was built in one session with Claude Code. The git history has the exact commits.

| # | Reza's instruction (quoted) | What it produced |
|---|---|---|
| 1 | "help me build a package that generates knotted loop geometries with parameters that could shape the knotted loops … Ultimately, I want to build arrays of knotted loops, where each serves as a receiver loop in an MRI phased array. I want to be able to also 'bloom' the knots … Before you do it, tell me the design you understand here and then we'll freeze it in a Design.md file" | Design proposal: torus knots, bloom, arrays, exports, scope boundary (geometry only) |
| 2 | "by 'bloom into a loop' I mean with the topological overlap, not an actual loop." | Bloom collapses strands onto one loop-like footprint while keeping crossings |
| 3 | "can you also implement a feature that automatically calculates the optimal overlap between the coils for minimal mutual inductance, given the geometry? … our knots are pretty much flat, while respecting the topology" | Neumann-based automatic decoupling; flat knots with crossing lift |
| 4 | "I'd like to be able to put as many loops as I want, and the software decouples them given the bloom" · "Substrate is not PCB. We'll be using wire loops" · "I'd like to try up to 8 lobes" · "target array: helmet" · "new folder" | Unlimited N; wire loops; lobe catalogue 1–8; helmet former; `knotted_coils/` |
| 5 | "Freeze Design.md as v1.0 with the proposed defaults; I'll send wire and helmet specs separately. Start building." | Design v1.0 frozen (git 39a4e83, which pre-registers V1–V6); core, solver, validation, app |
| 6 | "we should be able to rotate the coils in-plane to help with decoupling. I think that should be one of the parameters" | Rotation exposed: free / locked / fixed |
| 7 | "Would I be able to visualize the e-fields in the UI via a toggle?" | Assessment: a quasi-static model gives only part of E. Deferred |
| 8 | "Make nearest-ring the default definition of decoupled (log it as a Design v1.1 change), and keep reporting the footprint verdict too." | Design v1.1. Disclosed that the worst-pair cost term had not been implemented |
| 9 | "Implement the worst-pair term as a smooth stand-in (soft-max or sum of k^4), compare against the current solver on the same seeds, and report both." | k⁴ term; pre-registered 35-run paired comparison; adopted by rule; trade-off documented |
| 10 | "can I use the UI?" · "it seems frozen" · "why is it so clunky if I change a feature of the lobe?" | Local server; element checks moved to a worker; hidden-canvas freeze and slider bug fixed |
| 11 | "currently, 'bloom' is just pinching a portion of the loop. I want 'bloom' to make the lobes more extended, such that each lobe's aspect ratio would increase as I increase 'bloom'." | Design v1.2: lobes extend outward from a fixed base circle |
| 12 | "Add a petal-sharpness control that narrows each lobe, with the same topology checks." | Design v1.3 (power law). V7 FAILED → v1.4 (angle warp) |
| 13 | "can you plot the decoupling graph in the 'Pair explorer' tab in dB?" | dB view, 20·log₁₀\|k\|, labelled "not bench S21" |
| 14 | "is there a fast and effective way to visualize the e-fields of a solved array?" · "how do I visualize the B1 field?" · "I just want a quick visualization that's reasonable. We will do simulations later" | Design v1.5: quick B1 view (Biot–Savart; head surface and slices). E-fields left to full-wave simulation |
| 15 | "package the whole thing so I can share it" · "include all the instructions you gathered here (the design files, etc.) so that others can expand on the work" | This package: developer guide, request log, project CLAUDE.md, integrity rules, sources |

| 16 | "what else should this package do? … the array should be symmetric with regards to the head … placement … could be more optimized … the bloom parameter and size of the loop could also be controlled?" | `docs/PROPOSAL_v2.md` (WP1–WP10) |
| 17 | "how does openEMS compare with COMSOL …?" · "how would things look if we modelled capacitor breaks …? … can you link our app to COMSOL?" · "is openEMS the only system …?" · "I'd want something we could link to programmatically." | Verified solver survey → `docs/SOLVER_OPTIONS.md` (MARIE 3.0 for coil + head; NEC-2 WebAssembly for coils in air) |
| 18 | "have a helmet and a sort of head in there, and then mark-off the eyes and mouth …" · "we need a way of ensuring that your B1 estimates aren't BS—ideally calculations with a separate package" | WP11 face exclusion zones; WP12 three-tier B1 validation (V14 vs Magpylib) |
| 19 | "Okay, let's do the major update!" | Design v1.6: zones, symmetric ring layouts, per-ring size/bloom/sharpness, multi-start, capacitor breaks, save/load, exact-segment B1, V9–V14, C2 |

## Standing instructions that shaped the work

These come from Reza's workspace instructions (his global `CLAUDE.md`). The ones relevant to this project:
- Render a styled `.html`, and a `.pdf` where possible, alongside every Markdown file.
- Define jargon on first use; Reza's background is vision science and neuroscience, not software or engineering.
- Follow the research-integrity framework (copied in `docs/research_integrity/`):
  - never fabricate;
  - cite only verified sources;
  - tag parameter origins;
  - pre-register checks and report failures;
  - label unvalidated results exploratory;
  - attribute AI-written code.
