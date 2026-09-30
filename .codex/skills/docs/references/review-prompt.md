# Independent documentation review

Input: absolute FILES, target source, mode/scope, applicable rules, and one focus: quality, structural, or efficiency. Read the same supplied file set independently; do not consult other reviewer results or change files. Apply [acceptance checklist](checklist.md), respecting mode and the actual documented product.

| Focus | Emphasis |
|---|---|
| quality | User-first ordering, concrete examples, correct commands, metadata, cross-links, English prose without filler |
| structural | Applicable five-level coverage, missing surfaces, navigation groups/slugs, source/content consistency, MDX import depth, Steps and Cards |
| efficiency | Redundancy, useful structured tables, unused imports, concise text with preserved triggers/scope/negation |

Critical: build/layout breakage, invalid metadata, broken required links/navigation, misleading command or behavior, unsafe workflow instructions. Important: missing applicable level/example/cross-link, wrong user-first order, material inconsistency. Minor: wording/redundancy/format polish. Provide evidence, not stylistic guesses. Native Codex instructions/reports are exempt from the public-doc workflow; never require Claude frontmatter, `<instructions>`, tool names, or runtime substitutions in Codex files. For actual Claude source, check its own schema and substitutions only when relevant.

Return one block per finding:

```text
FILE: <absolute path>
LINES: <range or section heading>
SEVERITY: critical | important | minor
CATEGORY: <stable identifier, e.g. mdx.steps, nav.registration, source.command>
ISSUE: <one sentence with concrete evidence>
FIX: <one sentence>
```

No issues: `NO FINDINGS`. Include missing expected surfaces as structural findings with the expected path. Do not dismiss a demonstrated defect as pre-existing. Quorum is computed by the orchestrator: same file + section (same heading or ±5 lines) + category, ≥2/3. Severe singleton findings require independent evidence verification; minority status cannot make a demonstrated severe defect safe.
