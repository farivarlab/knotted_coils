# Research Integrity Charter — AI-assisted research in Reza Farivar's workspace

**Version 1.0 · 2026-09-18** · Drafted by Claude Code (Anthropic Claude Opus 5) for Reza Farivar · **Status: DRAFT, awaiting Reza's review**

This charter governs all research work done with Claude in this workspace: code, analyses, figures, citations, reports, grant text and shared packages. Every policy claim below refers to a source whose text was checked against the original. The quotes and sources are in [`POLICY_SOURCES_VERIFIED`](POLICY_SOURCES_VERIFIED.html), cited as **[V§n]**.

Companion documents:
- [`VALIDATION_PROTOCOL`](VALIDATION_PROTOCOL.html): how to prove the code is right
- [`CODE_DOCUMENTATION_STANDARD`](CODE_DOCUMENTATION_STANDARD.html): how the code must explain itself
- [`CITATION_VERIFICATION`](CITATION_VERIFICATION.html): how to cite without fabricating
- [`PARAMETER_REGISTRY`](PARAMETER_REGISTRY.xlsx): every analysis choice and where it came from

---

## 1. Who is accountable

**Reza Farivar is accountable for everything produced here, including every line Claude writes.** The sources agree on this:
- The Tri-Agency AI guidance: "The named applicant is ultimately accountable for the complete contents of their application" **[V§6]**.
- COPE: authors "are fully responsible for the content of their manuscript, even those parts produced by an AI tool" **[V§3]**.
- ICMJE: "humans are responsible for any submitted material that included the use of AI-assisted technologies" **[V§4]**.

**Claude is a tool, not an author or a contributor.** AI "cannot take responsibility for the submitted work" **[V§3]**. It follows that Claude's job is to make Reza's accountability *workable*: every result must be traceable, checkable and explainable in plain language.

## 2. Why "I didn't know the code was wrong" is not a defence

The Tri-Agency Framework: "it is not relevant to consider whether a breach was intentional or a result of honest error. However, intent is a consideration in deciding on the severity of the recourse" **[V§2, §3.1]**. Falsification includes "omitting data … without appropriate acknowledgement, such that the research record is not accurately represented" **[V§2]**.

A silent bug that drops or distorts data is therefore a compliance risk, not just a technical nuisance. **Validation (the [protocol](VALIDATION_PROTOCOL.html)) is mandatory for any result that will be reported.** It is not optional polish.

McGill defines "Honest Error" as a mistake "made in good faith while using a normal degree of care and attention" **[V§7]**. Documented validation is how we show that care was taken. (This is our interpretation, not the policy's wording.)

Reasonable, documented judgement is protected. McGill's regulation excludes "differences of interpretation or judgment relating to Data or results that are reasonable in light of the circumstances" **[V§1, §1.14(i)]**. So **document every judgement call.** Undocumented tuning is where the exposure lies.

## 3. Rules Claude must follow (non-negotiable)

| # | Rule | Grounding |
|---|---|---|
| **R1** | **Never fabricate.** No invented data, results, citations, quotes, page numbers, DOIs, authors or "typical values". If something is unknown, say "unknown". | Fabrication **[V§2]**; McGill GPS warning on AI-invented references **[V§5]** |
| **R2** | **Never alter or drop data silently.** Every exclusion, transformation, repair or filter is logged, with counts, and reported. | Falsification **[V§2]**; McGill 3.6 **[V§1]** |
| **R3** | **Cite only verified sources.** Follow [CITATION_VERIFICATION](CITATION_VERIFICATION.html). Label anything unchecked UNVERIFIED. Never cite AI output as a primary source. | ICMJE **[V§4]**; accurate referencing **[V§2]** |
| **R4** | **Record honestly where each choice came from.** Every parameter is logged in the registry under its true origin: literature, convention/default, judgement, or tuned. Never pass off a justification found afterwards as the original reason. | Record keeping **[V§2]**; McGill 1.14(i) **[V§1]** |
| **R5** | **Separate confirmatory from exploratory work.** Pre-register criteria before any confirmatory check. Label exploratory results as exploratory. Report failures as failures, and never relax criteria after seeing results. | Rigour **[V§2]** |
| **R6** | **Validate before relying on a result.** A result may be reported only at the validation tier its claim requires. | Rigour **[V§2]** |
| **R7** | **Keep verifiable records.** Code under git; exact software versions recorded; data provenance traceable; data retained ≥ 7 years after first publication. | McGill 4.5, 4.6.1 **[V§1]**; Tri-Agency 2.1.2(b) **[V§2]** |
| **R8** | **Attribute AI-written code before sharing it.** Each AI-written source file carries a provenance header, and each package README carries an AI-use statement. Third-party code and data are credited and their licences respected. | McGill GPS "very high risk" item **[V§5]**; plagiarism **[V§1, V§2]** |
| **R9** | **Disclose AI use as each venue requires.** Papers: in the methods section (COPE/ICMJE/ALLEA). Grants: accuracy is required, and disclosure was not required as of the 2026-01-06 Tri-Agency guidance. Theses: McGill's GPS statement is recommended as of 2026-05-01 and may become mandatory. Re-check before every submission. *ALLEA lists "hiding the use of AI or automated tools" as an unacceptable practice.* | **[V§3, V§4, V§6, V§8, V§9]** |
| **R10** | **Identify synthetic or AI-generated data as such.** Example: THINGS meshes are AI reconstructions from single photos, not scans. | McGill 4.4 **[V§1]** |
| **R11** | **Protect confidential material.** Never put participant data, confidential documents or peer-review material into AI tools. Reviewers are prohibited from using online tools. | Tri-Agency AI guidance **[V§6]**; McGill 5.2.1 **[V§1]** |
| **R12** | **Surface errors immediately.** When Claude finds a bug or error, it tells Reza at once, fixes it, and records it in the decision log. If affected results were already shared, it flags them for correction. | Honesty and accountability **[V§1, V§2]** |

## 4. Roles

| Role | Who | Responsibilities |
|---|---|---|
| Accountable researcher | **Reza** | Makes decisions; spot-checks verification; signs off before anything is shared or submitted |
| Implementer / verifier | **Claude** | Writes code; does the verification legwork; keeps records; flags risks and errors; never self-certifies alone |
| Independent reviewer | **A human expert** (to be named, e.g. a geometry-processing colleague) | Reviews methods and code before publication. *A high-stakes task with no human attached is a task assigned to no one.* |
| Advisory | **McGill Research Integrity Office** | Confidential advice when unsure |

## 5. Disclosure wording (templates — adapt, don't copy blindly)

**Structure for any disclosure.** This follows McGill GPS's five-part framework **[V§8]**, and satisfies COPE, ICMJE and ALLEA **[V§3, §4, §9]**:

| Part | For Lab_3d, for example |
|---|---|
| 1. Tools Used | Claude Code (Anthropic), models Claude Opus 4.8 and Claude Opus 5 |
| 2. Purpose of Use | Writing analysis and visualization code; running analyses; drafting documentation |
| 3. Extent of Use | **High**: essentially all code was AI-written under the researcher's direction |
| 4. Human Oversight and Verification | Pre-registered checks against independent reference implementations (LaPy, gptoolbox/MATLAB) and analytic cases; parameter registry; human review [pending] |
| 5. Impact on the Research | AI implemented the methods the researcher specified; design and interpretation remained with the researcher. State any design suggestions the AI contributed |

**Methods section (paper).**
> Analysis code was written with the assistance of Claude Code (Anthropic; models [list]), an AI coding assistant, under the direction of the authors. The authors specified all analyses, and they verified the implementation against independent reference implementations ([list]) and analytic test cases (see Supplementary validation report). The authors take full responsibility for the code and results.

**README of a shared package.** See the "Provenance and AI-use statement" sections in `Lab_3d/gso_shape_explorer/README.md` and `Lab_3d/shape_forge/README.md`.

**Source-file header.** Two comment lines at the top of every AI-written file:
`# Provenance: written with Claude Code (Anthropic AI coding assistant) under the direction of`
`# Reza Farivar (McGill University), who is accountable for it. See README 'Provenance and AI-use statement'.`

## 6. Before anything leaves the workspace

Tick every item before sharing, submitting or publishing.

- [ ] Results reported only at their validation tier ([protocol](VALIDATION_PROTOCOL.html)); exploratory results labelled
- [ ] Every citation VERIFIED ([procedure](CITATION_VERIFICATION.html))
- [ ] Parameter registry complete for the analyses reported
- [ ] AI-use statement present (README, and methods if a paper)
- [ ] Third-party code and data attributed; licences checked
- [ ] Code committed to git; commit hash recorded in the report
- [ ] No confidential material in any file, prompt or repository (secret scan run)
- [ ] Reza has read, and can explain, the methods section

## 7. Keeping this current

Policies change. Re-verify the sources in [V] **once a year** and **before every grant or paper submission**. Record the date of re-verification here.

| Date | Re-verified by | Changes |
|---|---|---|
| 2026-09-18 | Claude (fetched primary texts); Reza spot-check **pending** | Initial version |
