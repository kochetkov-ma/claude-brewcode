# 13 -- Gated placeholders: the convention + inventory

Read from `SKILL.md` Placeholder map before any emit; generator-only, never emitted.

Gated blocks sit inside otherwise-unchanged templates. Every gated placeholder has exactly one of two kinds -- `line` or `inline` -- declared with its expansion in the header of its owning reference file. That header is the source of truth for the expansion text and the whitespace handling; the inventory below is the complete name / kind / gate index.

| Rule | Detail |
|------|--------|
| Every gate is per-token | A gated placeholder carries its own gate condition -- `SPEC_MODE=on`, `SPEC_MODE=off`, or `CMD_DECOMPOSED=true`; "emitted" always means that condition is true. Two gate variables, one with an `off` arm: !=assume the condition is `SPEC_MODE=on`, !=key any removal off `SPEC_MODE` alone |
| Kind `line` | the token is the only reason its line exists. Condition true -> replace the whole line with the expansion; false -> remove the whole line: no blank line left behind, no orphan heading, no trailing separator |
| `_ON` / `_OFF` arms | an `_ON`/`_OFF` pair is one gate written as two adjacent `line` placeholders: `_ON` emits when the gate is `on`, `_OFF` when it is `off`, and the other arm's line is removed. Exactly one arm survives every run, in both modes -- !=both, !=neither, !=a third kind. The `_OFF` arm is how a `line` placeholder rewrites a baseline line back to its byte-identical original |
| Kind `inline` | the token sits inside a line that exists in both modes. Condition true -> replace the token with the expansion; false -> delete the token only, the line stays |
| inline whitespace | declared per site by its own reference file; both forms are legal, do not unify them: some sites carry a single space BEFORE the token, deleted together with it (`02`); others carry no leading space and the expansion supplies its own (`03`, `05`). Follow the reference header, never a global rule |
| `SPEC_MODE=off` result | the emitted artifact is byte-identical to the pre-spec-layer output. This holds only if every token was resolved against its own condition -- an `_OFF` arm dropped as if it were an `on` token breaks byte-identity |
| Verification | any `{{...}}` or single-brace metadata token surviving in a written file is an unresolved placeholder and a defect; P5's leftover-placeholder gate greps every emitted path |

#### Gated placeholder inventory (complete)

| Owner ref | Kind | Emitted when | Placeholders |
|-----------|------|--------------|--------------|
| 02 | line | `CMD_DECOMPOSED=true` | `{{CMD_DECOMPOSED_NOTE}}`, `{{CMD_DECOMPOSED_INVARIANT}}` |
| 02 | inline | `SPEC_MODE=on` | `{{SPEC_TRIGGERS}}`, `{{SPEC_BRD_COL}}` |
| 02 | line | `SPEC_MODE=on` | `{{SPEC_TRIAGE_BLOCK}}`, `{{SPEC_CHECKLIST}}`, `{{SPEC_BRD_FEATURES_ON}}` |
| 02 | line | `SPEC_MODE=off` | `{{SPEC_BRD_FEATURES_OFF}}` |
| 03 | inline | `SPEC_MODE=on` | `{{SPEC_DESC_TRIGGERS}}`, `{{SPEC_ADD_ROW_COL}}` |
| 03 | line | `SPEC_MODE=on` | `{{SPEC_INVARIANTS}}`, `{{SPEC_ADD_STEP}}`, `{{SPEC_MOVE_STEPS}}`, `{{SPEC_VIEW_FLOW}}` |
| 04 | inline | `SPEC_MODE=on` | `{{SPEC_FM_FIELD}}` |
| 04 | line | `SPEC_MODE=on` | `{{SPEC_RULES}}` |
| 05 | inline | `SPEC_MODE=on` | `{{SPEC_COL_H}}`, `{{SPEC_COL_S}}`, `{{SPEC_LC_CLOSE}}` |
| 05 | line | `SPEC_MODE=on` | `{{SPEC_FEATURE_TABLE_HEAD_ON}}`, `{{SPEC_FM_LINE}}`, `{{SPEC_SCOPE_BLOCK}}`, `{{SPEC_BOARD_COL_NOTE}}`, `{{SPEC_TRACKER_SECTION}}`, `{{SPEC_INDEX_ROWS}}` |
| 05 | line | `SPEC_MODE=off` | `{{SPEC_FEATURE_TABLE_HEAD_OFF}}` |

Two `_ON`/`_OFF` pairs exist: `{{SPEC_BRD_FEATURES_*}}` (02, board section-6 line) and `{{SPEC_FEATURE_TABLE_HEAD_*}}` (05, `board.md` `## Feature specs` header + separator).

> Names are file-scoped: resolve every gated token against its owner's header, never across files (`{{SPEC_INVARIANTS}}` lives in `03` only).
> Refs 01, 06, 07, 08, 09, 10, 11 declare no gated placeholders. `08` and `09` are gated at whole-file granularity (emitted only when `SPEC_MODE=on`); ref 11 is always emitted. A `{{TOKEN}}` in `10` is prose, not a placeholder.
