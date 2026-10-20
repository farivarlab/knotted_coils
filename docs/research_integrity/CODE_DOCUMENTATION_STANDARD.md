# Code Documentation Standard — code that explains and defends itself

**Version 1.0 · 2026-09-18 · DRAFT for Reza's review.** Part of the [Research Integrity Charter](RESEARCH_INTEGRITY.html) (rules R3, R4, R8).

**Goal:** someone with no Python background (Reza is fluent in MATLAB) can read a script's comments and answer four questions:
1. What does this do?
2. Why this method?
3. Where did each number come from?
4. How do we know it's right?

## 1. File header (every analysis script)

```python
# Provenance: written with Claude Code (Anthropic AI coding assistant) under the direction of
# Reza Farivar (McGill University), who is accountable for it. See README 'Provenance and AI-use statement'.
r"""<One-line purpose, in plain language.>

WHAT IT DOES (plain language, no jargon — or define every term the first time it appears):
  ...

METHOD + SOURCES (each with a status label per CITATION_VERIFICATION):
  [Reuter 2006] Laplace-Beltrami spectra as 'Shape-DNA'... DOI ...  Status: VERIFIED (§3.2)
  Reference implementation: LaPy (github.com/Deep-MI/LaPy), function lapy.Solver.eigs

MATLAB EQUIVALENT (where feasible):
  L = -cotmatrix(V,F); M = massmatrix(V,F,'voronoi'); ev = eigs(L,M,K,-1e-3);   % gptoolbox

INPUTS / OUTPUTS: exact paths and file formats.

VALIDATED BY: validation/REPORT_<name>.html (git <hash>)  -- or --  NOT YET VALIDATED
"""
```

## 2. Every parameter carries a provenance tag

Put the tag in an inline comment. Each tag has a matching row in the [parameter registry](PARAMETER_REGISTRY.xlsx).

| Tag | Meaning | Required alongside |
|---|---|---|
| `LIT` | Value taken from the literature | A citation with a VERIFIED or PARAPHRASE status, pointing to the exact passage |
| `CONV` | Library default or community convention | The library name, version and documentation link |
| `JUDG` | Our judgement call | A one-line rationale, plus alternatives considered |
| `TUNED` | Chosen by searching over options | What was searched, the objective used, and a held-out result (Tier 3) |
| `DERIVED` | Computed from other values | The formula |

Example:
```python
K_MODES = 300   # JUDG: HKS/WKS dominated by low frequencies; 300 of ~25k modes. Alt: 100, 500. Sensitivity: not yet tested.
UMAP_NN = 15    # CONV: umap-learn 0.5 default n_neighbors (https://umap-learn.readthedocs.io). Not tuned.
SIGMA_WKS = 7   # LIT (claimed): Aubry et al. 2011 wavelet width 7x increment. Status: UNVERIFIED -> must verify before publication.
```

**Never** tag a value `LIT` because a paper was found *after* the value was chosen. Tag it with its true origin, and add "later found consistent with [ref]".

## 3. Comments explain *why*, not *what*

- Good: `# weld first: GSO files duplicate seam vertices; without welding, keep-largest discards real geometry (bug found 2026-07, see decision log)`
- Bad: `# weld the mesh`

## 4. Every data-changing step logs counts

Any step that drops, repairs, filters, or transforms data writes out what it changed, with numbers: objects in and out, faces kept (%), and reasons. This prevents *falsification by omission* (Tri-Agency §3.1.1b, [V§2](POLICY_SOURCES_VERIFIED.html)).

## 5. Decision log

Every project keeps a `DECISIONS.md`: dated entries of the form *what was decided, why, who decided, what alternatives existed*. Entries like *"switched because it looked cleaner"* are written down exactly that way. Honest records are what make exploration defensible.

## 6. Shared packages

- The README carries a "Provenance and AI-use statement" (see the [charter §5](RESEARCH_INTEGRITY.html)).
- Third-party code and data are listed with their licences.
- Code of uncertain authorship is labelled as such until it is resolved.
