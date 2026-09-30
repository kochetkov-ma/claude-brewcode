---
name: convention-setup
description: "Installs project conventions and reversible loading guidance; extracts representative implementations, patterns, architecture, and accepted rules. Triggers: convention setup, extract conventions, etalon classes."
---

# Convention setup

<!-- brewcode-meta: version=6.3.0 content_version=6.3.0 generated_by=brewcode:convention-setup -->

Inspect representative production code and tests, identify repeated architectural and implementation patterns, and write concise convention documents to the user-selected Codex-owned path. Cite concrete repository files, distinguish enforced rules from observations, and avoid changing application code unless the user explicitly asks.

## Modes and lifecycle

Resolve one mode from `status`, `install` (default, the original full extraction), `upgrade`, `enable`, `disable`, `uninstall`, `purge`; extras: `full`, `conventions`, `rules`, `paths <p1,p2>`. Explicit tokens win; otherwise resolve RU/EN intent, choose install on empty/no-match input, and ask at most one outcome-changing question. Read-only status asks nothing.
Before the first action print `PLAN — brewcode:convention-setup` with literal `INPUT:`, `MODE:`, `SCOPE:`, `DO:`, `RESULT:`. Run `sh <skill-directory>/scripts/convention.sh status` first; stop on ownership/collision errors.

| Mode | Behavior |
|------|----------|
| `status` | Read-only document/loading inventory; parked guidance is disabled, never missing. |
| `install` / `full` | Run the extraction workflow below; validate docs, then run the script's install command. |
| `upgrade` | Refresh evidence and metadata using the workflow; run the script's upgrade command, preserving parked state and local guidance wording. |
| `enable` / `disable` | Run that script command to restore/park `.codex/rules/convention.md` as `.md.disabled`, byte-identically. |
| `uninstall` | Remove only owned loading guidance and its generated AGENTS index row; preserve docs and accepted rules. |
| `purge` | Confirm the three owned document paths unless deletion is already explicit; remove them and loading guidance, preserve accepted rules and unrelated files. |
| `conventions` | Extract only documents, validate and install loading guidance; leave other rules untouched. |
| `rules` | Extract accepted rules from existing stamped evidence without regenerating documents. |
| `paths` | Refresh named source layers, preserving other evidence. |

For generation, obtain `version`, `content_version`, `generated_by`, `last_updated` from the script's `setup` JSON; stamp each of `.codex/convention/{reference-patterns,testing-conventions,project-architecture}.md` with those exact values and `doc_type: llm`. Validate before installing loading guidance. Never ship unresolved placeholders.
Codex does not auto-load `.codex/rules/`. After install/upgrade/enable, add or update exactly one root `AGENTS.md` rule-index row with columns `Rule`, `Load when`, `Purpose`: require reading the live convention rule before implementation/review. For a disabled install, index the parked path with `disabled; do not load`; disable updates that row likewise. Uninstall/purge remove only this generated index row. Preserve accepted coding rules and manual convention references; they remain active. Report this boundary after disable/removal. Validate the complete rule index after every mutation, then run script status as evidence.

## Workflow

1. Read the applicable `AGENTS.md` files and repository architecture documentation before analysis.
2. Resolve the requested scope: full repository, convention documents only, rule extraction from existing convention documents, or explicit paths.
3. Inventory languages, frameworks, module boundaries, build files, tests, migrations, and existing convention material with focused `rg` searches.
4. Select representative production and test files for each relevant layer. Prefer repeated current patterns over isolated legacy examples.
5. Record evidence for architecture boundaries, dependency direction, naming, data models, error handling, persistence, external integrations, testing, and deployment constraints.
6. For each candidate convention, cite concrete paths, state whether it is enforced or observed, identify exceptions, and name the preferred reference implementation.
7. Write compact English convention documents under `.codex/convention/`. Preserve unrelated content and do not duplicate full rule bodies in `AGENTS.md`.
8. If the user requests durable rules, extract accepted candidates, deduplicate them against all `.codex/rules/*.md` files and applicable `AGENTS.md` instructions, and apply them directly without a dedicated organizer agent.
9. Update the root `AGENTS.md` rule-index table so every project rule appears exactly once with columns `Rule`, `Load when`, and `Purpose`.
10. Invoke `$brewtools:text-optimize -l` for every changed convention, rule, and index file. Compare semantics before accepting optimized text.
11. Re-run the file inventory, validate every cited path, and report documents changed, rules added or merged, duplicates skipped, and unresolved conflicts.

Use Codex collaboration only when the user or active repository instructions explicitly require delegation. When delegation is allowed, prefer project-specific agents and keep one bounded evidence-gathering surface per agent.

## Native user gates

Required approval: main presents a concrete, reviewable proposal in chat and waits for an actual user reply before dependent action. Existing authorization for the same scope remains valid; do not ask again. Optional clarification: use `request_user_input_async` only if exposed, or `request_user_input` only if available in the current runtime/mode, for optional choices and never approval. Otherwise ask in main chat. Delegated agents return unresolved questions to main. Silence, elapsed time and tool errors are not approval.
