# Citation verification procedure

**Why this exists.** AI can "generate falsified research references, that is, plausible citations with reasonable title, author, and journal combinations for papers that do not exist" (McGill GPS, 2024; [V§5](POLICY_SOURCES_VERIFIED.html)). ICMJE requires humans to "ensure there is appropriate attribution of all quoted material, including full citations" ([V§4](POLICY_SOURCES_VERIFIED.html)). **Claude's memory is not a source.**

## The procedure (every citation, every time)

1. **Retrieve the primary source itself.** That means the actual paper, policy or documentation page, not a summary, secondary blog or search-result snippet.
   - *Doesn't count as verification:* search-engine summaries; web-fetch tools that answer questions about a page through an AI model (they paraphrase and truncate); anything recalled from memory.
   - *Does count:* the downloaded PDF or HTML whose text is read directly; a publisher page; a DOI that resolves.
2. **Confirm the identity.** Authors, year, title and venue match. The DOI resolves (open `https://doi.org/<doi>`).
3. **For a quote**, copy the text **character-for-character** from the retrieved document. Record the section or page. Keep quotes brief (a sentence or two); longer passages get paraphrased and marked PARAPHRASE.
4. **For a claim about a number or method** (for example "Aubry et al. set σ = 7× the energy increment"), locate the exact passage or equation that supports it. If the claim can't be located, it stays UNVERIFIED.
5. **Archive** a copy (or the relevant excerpt) in the project's `sources/` folder. Record the URL and the retrieval date.
6. **Label** the citation wherever it is used:

| Label | Meaning | May appear in a publication? |
|---|---|---|
| `VERIFIED` | Exact text or claim confirmed against the archived primary source | Yes |
| `PARAPHRASE` | Checked against the source; reworded | Yes |
| `UNVERIFIED` | Not yet checked against the source | **No.** Verify it or remove it |
| `SECONDARY` | Known only through another work that cites it | Only as "as cited in …" |

7. **Human spot-check.** Before submission, Reza (or a delegate) re-checks a random ~20% of VERIFIED items against the archived copies. Record who checked, and when.

## Rules

- **No citation to justify a choice after the fact while passing it off as the original reason.** If a parameter was a library default or a judgement call, the registry says so. A paper found later is recorded as "later found consistent with".
- **Code comments follow the same rules as papers.** A reference in a code comment carries a status label.
- **Never cite AI output as a primary source** (ICMJE, [V§4](POLICY_SOURCES_VERIFIED.html)).

## Citation record format (for code comments and the registry)

```
[AUTHOR YEAR] Title. Venue. DOI/URL.  Status: VERIFIED (retrieved 2026-09-18; §4.2, p.7)
  Quote: "…exact words…"
  Archived: research_integrity/sources/<file>
```
