# Research-integrity policy sources — verified record

**Retrieved:** 2026-09-18 · **Retrieved by:** Claude (Opus 5) at Reza Farivar's request · **Checked by a human:** *not yet — Reza to spot-check*

## How these were verified

Each source was downloaded from its official site and its text read **directly**: PDF text extraction, or HTML with the tags stripped. None of it went through an AI summarizer. Quotes below are copied character-for-character from those files, and archived copies sit in [`sources/`](sources/) so anyone can re-check them. One earlier attempt, fetching through a tool that summarizes pages with a small AI model, is **not** relied on anywhere here.

**Status labels.**
- **VERIFIED**: exact text confirmed against the archived primary source.
- **PARAPHRASE**: checked against the source, but reworded.
- **UNVERIFIED**: not yet checked against the source; must not be relied on.

**A note on my earlier memory.** Before this check I described these policies from memory, and parts were wrong. I said the Tri-Agency list included "inaccurate citation" and "mismanagement of data". In fact it lists *destruction* of data or records as a breach, and treats *accurate referencing* as a researcher responsibility, not a named breach. I also didn't know McGill had research-specific guidance on generative AI (it does, dated Nov 2024). This is why nothing gets quoted from memory.

---

## 1. McGill — *Regulation on the Conduct of Research* — VERIFIED

Approved by Senate and the Board of Governors in 2010; last reviewed 14 Feb 2019. McGill's Research Integrity page still links this 2019 version as current (checked 2026-09-18), even though its stated next-review date (14 Feb 2024) has passed.
Source: <https://www.mcgill.ca/secretariat/files/secretariat/regulation_on_the_conduct_of_research_2019.pdf>

| § | Verbatim text | Why it matters to us |
|---|---|---|
| 1.14 | "'Research Misconduct' includes, but is not limited to, a breach of any Agency policy related to the conduct of research, for example: fabrication, falsification, Plagiarism, …" | Brings the Tri-Agency definitions (§2 below) into McGill policy |
| 1.14(i) | Research misconduct does not include "differences of interpretation or judgment relating to Data or results that are reasonable in light of the circumstances in which they are made or reached" | Parameter choices are protected **if documented and reasonable**. Undocumented tuning is the risk |
| 3.6 | "Researchers shall ensure that publications do not misrepresent data or images and that the nature and purpose of any image manipulation is explained." | Our 3-D projection plots (UMAP/t-SNE) must be described honestly |
| 4.4 | "Researchers shall not use or publish Data which they know to be, or have reasonable grounds to believe are, false or of unknown provenance unless it is so identified." | The THINGS meshes are AI-generated from single photos and must be labelled as such |
| 4.5 | "Researchers shall organize Data in a manner that allows for its verification by third parties." | Requires version control, a locked software environment, and data provenance |
| 4.6.1(ii) | Data retained "a period of at least, seven (7) years from first publication of the Data" (absent an Agency rule) | Keep raw meshes, code and outputs |
| 5.1.1 | Once Plagiarism is shown, "it shall be presumed that the Researcher did so knowingly" | Code taken from others must be attributed |

*Related, **not yet read**: McGill's* Regulations Concerning the Investigation of Research Misconduct.

## 2. Tri-Agency (CIHR/NSERC/SSHRC) — *Framework: Responsible Conduct of Research (2021)* — VERIFIED

Binds anyone applying for or holding federal funding.
Source: <https://rcr.ethics.gc.ca/eng/documents/framework-cadre-2021-en.pdf>

**§2.1.2 — minimum researcher responsibilities (verbatim):**
- "a. Rigour: Scholarly and scientific rigour in proposing and performing research; in recording, analyzing, and interpreting data; and in reporting and publishing data and findings."
- "b. Record keeping: Keeping complete and accurate records of data, methodologies and findings, including graphs and images, … in a manner that will allow verification or replication of the work by others."
- "c. Accurate referencing: Referencing and, where applicable, obtaining permission for the use of all published and unpublished work, including theories, concepts, data, source material, methodologies, findings, graphs and images."

**§3.1 — the sentence most relevant to your worry (verbatim):**
> "In determining whether an individual has breached an Agency policy, it is not relevant to consider whether a breach was intentional or a result of honest error. However, intent is a consideration in deciding on the severity of the recourse that may be imposed."

**§3.1.1 — breaches (excerpts, verbatim):**
- "a. Fabrication: Making up data, source material, methodologies or findings, including graphs and images."
- "b. Falsification: Manipulating, changing, or omitting data, source material, methodologies or findings, including graphs and images, without appropriate acknowledgement, such that the research record is not accurately represented."
- Also listed: destruction of research data or records, plagiarism, redundant publication, invalid authorship, inadequate acknowledgement, mismanagement of conflict of interest. The list is explicitly "non-exhaustive".

**Implication.** A silent coding error does **not** stop being a breach because it was honest. An example is the keep-largest bug we found earlier, which dropped about 90% of the geometry on 381 objects. Had it been published unacknowledged, it could fit the definition of falsification ("omitting data … without appropriate acknowledgement"). Honest error lowers the sanction; it doesn't cancel the breach. **Validation is a compliance requirement, not polish.**

*The Framework's footnotes cite the **Singapore Statement on Research Integrity (2010)** as one of its sources. That is verified as a citation only; the Singapore Statement's own text is **UNVERIFIED** here.*

## 3. COPE — *Authorship and AI tools* (position statement, 13 Feb 2023) — VERIFIED

Source: <https://publicationethics.org/guidance/cope-position/authorship-and-ai-tools>
- "AI tools cannot meet the requirements for authorship as they cannot take responsibility for the submitted work."
- "Authors who use AI tools in the writing of a manuscript, production of images or graphical elements of the paper, or in the collection and analysis of data, must be transparent in disclosing in the Materials and Methods (or similar section) of the paper how the AI tool was used and which tool was used."
- "Authors are fully responsible for the content of their manuscript, even those parts produced by an AI tool, and are thus liable for any breach of publication ethics."

## 4. ICMJE — *Recommendations*, §V.A "Use of AI by Authors" — VERIFIED

Source: <https://www.icmje.org/recommendations/browse/artificial-intelligence/ai-use-by-authors.html> (page © 2026)
- AI tools "should not be listed as authors because they cannot be responsible for the accuracy, integrity, and originality of the work".
- "Authors should carefully review and edit the AI-generated content as the output can be incorrect, incomplete, or biased."
- "Humans must ensure there is appropriate attribution of all quoted material, including full citations. Referencing AI-generated material as the primary source is not acceptable."
- "Nondisclosure of AI use may require corrective action and may be construed as misconduct in some circumstances".

## 5. McGill GPS — *Using AI in research writing — guidelines for graduate students* (Nov 2024) — VERIFIED

Source: <https://www.mcgill.ca/gps/files/gps/using_generative_ai_in_research_gps_guidelines_november_2024.pdf>
**Scope:** written for **graduate students**. It is not binding on faculty, but it is McGill's clearest statement of its norms, and it applies to any trainee who touches this project. GPS separately announced a thesis GenAI disclosure framework effective 1 May 2026; that framework is **not yet read**.

The guideline sorts AI uses into three risk levels.

**"Very high risk"** (defined as "using generative AI to generate content and presenting it as one's own work"). Examples include, verbatim:
- "Programming: Sharing entire programs or large amounts of code produced by generative AI without proper attribution"
- "Research design/writing: Conducting full analyses on a data set"
- "Research writing: Generating research quotations"

**"Moderate-to-high risk"** example:
- "Programming: Writing programs or generating code for one's own use that will not be distributed widely"

It also warns that AI "can even generate falsified research references, that is, plausible citations with reasonable title, author, and journal combinations for papers that do not exist".

**Implication for this project, stated plainly.** Claude wrote essentially all of the Lab_3d code and ran full analyses. We have already packaged some of it for sharing (`gso_shape_explorer.zip`, `shape_forge.zip`). Their READMEs credit "Reza Farivar's Lab_3d project" but **do not state that the code was AI-generated**. Under McGill's own framing, sharing code this way needs explicit AI attribution. **Those READMEs should be corrected before the packages are shared.**

## 6. Tri-Agency — *Guidance on the use of AI in the development and review of research grant proposals* — VERIFIED

Last modified 2026-01-06; retrieved 2026-09-18.
Source: <https://science.gc.ca/site/science/en/interagency-research-funding/policies-and-guidelines/guidance-use-artificial-intelligence-development-and-review-research-grant-proposals>
- "The named applicant is ultimately accountable for the complete contents of their application."
- "The agencies recognize that generative AI may be a valuable tool to applicants in the preparation of grant applications …"
- "… applicants are responsible for ensuring that information included in their grant applications is true, accurate and complete and that all sources are appropriately acknowledged and referenced. Applicants should be aware that using generative AI may lead to the presentation of information without proper recognition of authorship or acknowledgement."
- **The current text contains no requirement for applicants to disclose AI use.** The only outright prohibition is on *reviewers* uploading applications to online tools.

**CIHR Project Grant application instructions** (last modified 2026-06-30), <https://cihr-irsc.gc.ca/e/49560.html>. Verbatim: "Applicants using generative artificial intelligence tools (such as ChatGPT) in the preparation of grant applications should refer to the Tri-agency guidance …". The instructions add no separate AI-disclosure requirement.

**Related, from §2 above (Tri-Agency Framework §2.2a, verbatim):** applicants "shall provide true, complete and accurate information in their funding applications and related documents and represent themselves, their research and their accomplishments in a manner consistent with the norms of the relevant field."

## 7. McGill — *Regulations Concerning the Investigation of Research Misconduct* — VERIFIED

Approved by Senate on 2008-01-23; last reviewed 2021-03-25.
Source: <https://www.mcgill.ca/secretariat/files/secretariat/regulations_concerning_the_investigation_of_research_misconduct.pdf>
- §1.12: "'Honest Error' means an accidental or inadvertent mistake made in good faith while using a normal degree of care and attention."
- The investigating committee's report must include "an assessment of whether the Research Misconduct was the result of an Honest Error". At sanction, the Disciplinary Officer "shall take into account" that assessment (§11.4).

**Consistent with Tri-Agency §3.1 [V§2]:** honest error bears on the *sanction*.
**Interpretation (ours, not policy text):** the definition requires "a normal degree of care and attention". Documented validation is how we show that care was taken.

## 8. McGill GPS — *GenAI Research Statement and Disclosure Guidelines for Theses* (1 May 2026) — VERIFIED

Source: <https://www.mcgill.ca/gps/files/gps/generative_ai_statement_for_thesis_students_may_1_2026.pdf>
- Status, verbatim: "recommended, but not yet mandatory". After consultations in Fall 2026, "the statement and disclosure frameworks may become mandatory".
- "Failure to disclose the use of generative AI tools in a submitted thesis may compromise and/or delay assessment of the thesis, as examiners have been actively identifying and flagging potential generative AI use."
- **The five-part disclosure framework** (a useful template well beyond theses):
  1. Tools Used
  2. Purpose of Use
  3. Extent of Use
  4. Human Oversight and Verification ("Explain how outputs were reviewed, validated, and revised. Confirm responsibility for accuracy.")
  5. Impact on the Research

## 9. ALLEA — *European Code of Conduct for Research Integrity*, revised edition 2023 — VERIFIED

Source: <https://allea.org/wp-content/uploads/2023/06/European-Code-of-Conduct-Revised-Edition-2023.pdf>
- **Four principles:** "Reliability in ensuring the quality of research …"; "Honesty in developing, undertaking, reviewing, reporting, and communicating research in a transparent, fair, full, and unbiased way"; "Respect for …"; "Accountability for the research from idea to publication …".
- "Researchers report their results and methods, including the use of external services or AI and automated tools, in a way that is compatible with the accepted norms of the discipline and facilitates verification or replication, where applicable."
- Unacceptable practices include: "Hiding the use of AI or automated tools in the creation of content or drafting of publications" and "Misusing statistics".
- "Falsification is manipulating research materials, equipment, images, or processes, or changing, omitting, or suppressing data or results without justification."

## 10. Singapore Statement on Research Integrity (2010) — PARTLY VERIFIED

Verified from the official background page (wcrif.org/guidance/singapore-statement): finalized "for release and global use on 22 September 2010". It "is not a regulatory document". Re-usable under CC BY 4.0.
**The statement's own text (its principles and 14 responsibilities) is UNVERIFIED.** The English file is loaded by JavaScript and couldn't be retrieved by script. Low priority: the Tri-Agency Framework explicitly draws on it **[V§2]**.

## 11. Copyright Act (Canada), R.S.C. 1985, c. C-42, s. 29 and 29.1 — VERIFIED

Source: <https://laws-lois.justice.gc.ca/eng/acts/c-42/page-6.html>
- §29: "Fair dealing for the purpose of research, private study, education, parody or satire does not infringe copyright."
- §29.1: "Fair dealing for the purpose of criticism or review does not infringe copyright if the following are mentioned: (a) the source; and (b) if given in the source, the name of the … author".

**Implication:** brief, attributed quotations for research are covered. Whether a particular dealing is *fair* is judged case by case, and that test is not spelled out in these sections. Hence our rule of short quotes with full attribution.

---

## Not yet verified

- Singapore Statement full text (see §10)
- umap-learn and scikit-learn default parameter values (needed for registry entries tagged CONV)
- Scientific sources for the descriptor parameters (Reuter 2006; Sun et al. 2009; Aubry et al. 2011; Rustamov 2007; Andreux et al. 2014). These are listed as UNVERIFIED in `PARAMETER_REGISTRY.xlsx`.
