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
| 20 | "we need the capacitor values for a head-loaded coil" · "isn't there a python code you could use so we could avoid Matlab?" · "update the design and implement the full capacitance modelling, including choosing the capacitors and also evaluating the effect of the capacitor in the decoupling and the B1 field … Update all design files. Make sure you have a design history file." | Design v1.7: openEMS + Python co-simulation, V15–V20; DESIGN_HISTORY.md |
| 21 | "once you're done the design, I want you to do a full audit. 1. first, brainstorm on all the things that could go wrong. 2. Then, re-check your own brainstorm with a fresh agent … 3. Then run the full updated audit. You can switch to Fable if you think it would be better. 4. Based on the results of the audit, update the code. Keep design history files." | docs/AUDIT_BRAINSTORM.md, AUDIT_BRAINSTORM_REVIEW.md (Fable), AUDIT_REPORT_A–D.md (Fable); fixes logged in DECISIONS.md "Audit actions" |

| 22 | (2026-10-21) "yes: shift the capacitor breaks by the same amount in all three pair cases (and the air pair) so every port is clear of the other coil; log it before running, then queue the pair runs." | Pair cases re-exported with breaks shifted ±0.100 of wire length; DECISIONS 2026-10-21; queue 3 |
| 23 | (2026-10-21) "I now want to add the height dimension to these knots, such that with one parameter, I could allow the knots to rise higher (total thickness of the whole knot). Can you do that while still calculating their B1 fields etc?" · chose "Outward only" | Design v1.8: thickness T, side view, V21–V23; self-L offset correction |

| 24 | (2026-10-21) "Use local bumps: at each crossing between two coils, one wire lifts outward over the other by at least wire + insulation over a short stretch; coils otherwise stay on the helmet. Make it a v1.9 design change with pre-registered checks, then rerun the pairs." | Design v1.9: crossover bumps, V24, pre-run gate; pair queue 4 |
| 25 | (2026-10-21) "package it for sharing right now." | Zip with code, docs (HTML/PDF), validation report and simulation summaries; still subject to the OIP check before sharing outside McGill (Reza, 2026-10-20) |

| 26 | (2026-10-21) "Is the output ready for input and validation in COMSOL? How easy is that to add?" · "add the COMSOL export first" | Design v1.10: export_comsol.py, comsol_build_mph.py (MPh, UNVALIDATED), V25 |

## Requests from a collaborator working on a shared copy (2026-10-23)

Reza remains the owner; these changes are proposals for his approval (Design v1.11).

| # | Instruction (quoted) | What it produced |
|---|---|---|
| C1 | "try to clean it up a bit too" | Housekeeping: portable default paths, stale text, line endings (DECISIONS 2026-10-23) |
| C2 | "fix the graphics issue" · "make everything stay within the page limit" · "can i run it with firefox" | App 0.5.1: page survives a browser without WebGL; canvases no longer grow on high-resolution screens; coupling matrix fits narrow windows |
| C3 | "generate a COMSOL simulation out of the array or singular (or just two knotted coil, anything) … simulate the COMSOL simulation under the hood … bring back the COMSOL results back into the web app … validate basically b1 maps and decoupling graphs using COMSOL" · ports only for arrays, "the ports and the required impedance matching (gap and shunt capacitor, complete)" for one or two coils · app's ellipsoid head · no pass/fail | Design v1.11 PROPOSED: `core/simcase.js`, `sim/comsol_run.py`, COMSOL job runner in `tools/serve.js`, comparison views (app 0.6.0) |
| C4 | "maybe put some insulation in those areas (the crossings)" | Dielectric beads at every crossing and crossover (placeholder εr) |
| C5 | "make sure Reza remains the sole owner of this code" · "the web app will also remain compatible with Windows" | Provenance unchanged, v1.11 written as a proposal; Windows-aware Python discovery, job start and cancel |
| C6 | "remove all the added texts … it should be a very minimal addition very suble, a button and one or two senteces of explanation and a new graph" · "change check in COMSOL to verify in COMSOL" · "show some progress also of the COMSOL run in the GUI" · "keep the settings … so it doest reset to default when i refresh the page" · "verify in comsol should be greyed out if there is a comsol app alreay running" | App 0.6.0: minimal COMSOL card, progress bar, settings remembered in the browser, one run at a time, Cancel stops COMSOL |
| C7 | "implementing the estimating of B1 field of the whole array using COMSOL and transferring reulsts back to the web app" · "so for complete array and b1 field (only port is needed) no tuning and matcing only the port" · "make sure to bolster the size check so we don't simulate weird stuff in COMSOL" | Arrays: one port per coil, B1 maps and coupling in the app; pre-flight check in the app and the script (DECISIONS 2026-10-23) |

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
