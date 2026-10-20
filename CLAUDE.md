# Instructions for AI assistants working on this project

Read these first: `DEVELOPER_GUIDE.md`, `Design.md` (frozen spec + changelog), `DECISIONS.md`, `PARAMETERS.md`, and `docs/REQUEST_LOG.md`.

## Hard rules
- **Design.md is frozen.** Any change to geometry, the EM model or validation criteria needs:
  - the owner's explicit approval;
  - a version bump;
  - a dated changelog entry: who asked (quoted), why, and what it affects.
- **Pre-register before testing.**
  - Write the pass criterion into Design.md §7 or a protocol file, and commit it before running.
  - Apply it mechanically and report failures as failures; keep failing runs in git history.
  - Never edit a criterion after seeing results. Log test-harness fixes as such, and keep the criterion unchanged.
- **Never fabricate** values, citations or results.
  - Cite only sources whose primary text you have read; archive them in `sources/`.
  - Otherwise label the source UNVERIFIED.
  - Formulas you derive yourself are tagged DERIVED, never LIT.
- **Tag every parameter** inline (`// JUDG: …`, `// DERIVED: …`, `// LIT: …`, `// CONV: …`, `// TUNED: …`, plus `PLACEHOLDER` where relevant) and add a row to `PARAMETERS.md`.
- **Provenance header** at the top of every source file (AI-assisted authorship; accountable person: Reza Farivar).
- **Label all EM output exploratory.** It is a quasi-static thin-wire model: coupling and B1 only. Do not add E-field maps; direct users to full-wave simulation.
- **Surface your own mistakes immediately** and log them in DECISIONS.md, for example the unimplemented cost term found at v1.1.

## Code conventions
- Plain JavaScript; no build step; no new dependencies without approval. Three.js is vendored and pinned.
- Every `core/*.js` uses the factory wrapper (see any core file). Workers are built from `KC_FACTORIES`, so keep modules self-contained and keep the load order.
- Units: mm, nH, µT/A, radians.
- Keep heavy maths off the page thread: use the worker commands in `app/index.html`.
- Comments explain *why*, at the density of the surrounding code.

## Deliverables
- Every Markdown document gets an `.html` rendering, and a `.pdf` where tooling allows.
- Define jargon on first use in anything written for the owner. His background is vision science and neuroscience, not software or RF engineering.
