# How the emitted skill behaves (brewcode:superreview-setup)

Read on demand from `SKILL.md`; generator-only, never emitted.

Recap of the shape the emitted SKILL.md implements (full text in `references/SKILL.md.template`):

| Phase | Behavior |
|-------|----------|
| Mode detection | Deterministic `FULL_PROJECT \| EXPLICIT \| UNCOMMITTED \| LAST_COMMITS`, computed not guessed; corpus = git-tracked-or-will-be (ignored = OUT) |
| Depth detection | Semantic, from the prompt, after the mode: `QUICK` (default — no depth word, or a speed word) \| `EXTENDED` (depth/completeness/expertise asked, any language). Depth words are stripped before the rest becomes `{FOCUS}`; both axes are announced, with how to escalate |
| Mechanical gates | Real build/lint/type/test first, both depths; output = `CONFIRMED-BY-EXECUTION`, passed to every agent so nobody re-runs it |
| Intent pass | `intent-guard`, both depths, unconditional, never via the roster procedure; the entire review at `QUICK`. Rows are `CONFIRMED-BY-EVIDENCE` (verbatim ASKED quote + source tier + delivered path/count) and bypass the adversarial validator by design; category `intent`, rules `intent#<class>` |
| Scope baseline | `EXTENDED` only (at `QUICK` intent-guard resolves its own tiers). Task + issue + recorded decisions, read-only; none -> `UNKNOWN` and a permanent P2 cap on scope findings |
| Routing | `EXTENDED` only. Experts picked at runtime from the live roster; non-empty groups only; recon agents excluded; no owner -> `Explore` + DEGRADED marker; `{0,1,2}` general agents by judgement |
| Fan-out | One parallel message. `QUICK`: `intent-guard` alone. `EXTENDED`: + domain experts + scope pass A (diff side, creep shapes 1-6 minus the NOT-creep exclusion list) + scope pass B (baseline side, delivery D1-D5 with proof of absence + closeout C1-C4); shared JSON finding contract; search-first before a reuse/duplication finding (rank 3, 90/70/50% reuse matrix) |
| Validation | `EXTENDED` only. A non-owning validator reverse-validates every verdictless candidate (per finding, batched <=40), merges + de-dups + prioritizes P0-P3; unvalidatable -> `UNVALIDATED` and the run is `INCOMPLETE`. `QUICK` rows are all self-verdicted: the coordinator merges + ranks in-session and the run is never `INCOMPLETE` |
| Scope gate (Phase 3b) | `EXTENDED` only. `main-chat user gate` on unsanctioned expansion / unproven absence; rewrites priorities only — adds no finding, never lifts the UNKNOWN cap; intent rows never enter it |
| Self-sync (Phase 4b) | `EXTENDED` only, coordinator only, after the report: corrects the emitted SKILL.md + `references/scope.md` in place from data already in context (routing table vs live roster, a gate `not run` because its command is missing, an `UNKNOWN`/mismatched scope baseline, a shared surface a scope finding named). Line delta `<= 0`, facts only; decisions, missing experts and `intent-guard.toml` are proposals in the summary, never writes |
| Report | One merged report at `.codex/reports/{TIMESTAMP}_superreview/REPORT.md`, sorted P0->P3, a verdict on every row, plus a Scope Discipline / Blast Radius section; read-only: recommends `/simplify` + a Manager-mode fix session, never edits code |


## Native user gates

Required approval: main presents a concrete, reviewable proposal in chat and waits for an actual user reply before dependent action. Existing authorization for the same scope remains valid; do not ask again. Optional clarification: use `request_user_input_async` only if exposed, or `request_user_input` only if available in the current runtime/mode, for optional choices and never approval. Otherwise ask in main chat. Delegated agents return unresolved questions to main. Silence, elapsed time and tool errors are not approval.
