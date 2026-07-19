---
name: convention
description: "Extracts etalon classes, patterns, architecture into convention docs. Triggers: extract conventions, etalon classes."
---

# Extract conventions

Inspect representative production code and tests, identify repeated architectural and implementation patterns, and write concise convention documents to the user-selected Codex-owned path. Cite concrete repository files, distinguish enforced rules from observations, and avoid changing application code unless the user explicitly asks.

## Workflow

1. Read the applicable `AGENTS.md` files and repository architecture documentation before analysis.
2. Resolve the requested scope: full repository, convention documents only, rule extraction from existing convention documents, or explicit paths.
3. Inventory languages, frameworks, module boundaries, build files, tests, migrations, and existing convention material with focused `rg` searches.
4. Select representative production and test files for each relevant layer. Prefer repeated current patterns over isolated legacy examples.
5. Record evidence for architecture boundaries, dependency direction, naming, data models, error handling, persistence, external integrations, testing, and deployment constraints.
6. For each candidate convention, cite concrete paths, state whether it is enforced or observed, identify exceptions, and name the preferred reference implementation.
7. Write compact English convention documents under the requested project `.codex/` path. Preserve unrelated content and do not duplicate full rule bodies in `AGENTS.md`.
8. If the user requests durable rules, extract accepted candidates, deduplicate them against all `.codex/rules/*.md` files and applicable `AGENTS.md` instructions, and apply them directly without a dedicated organizer agent.
9. Update the root `AGENTS.md` rule-index table so every project rule appears exactly once with columns `Rule`, `Load when`, and `Purpose`.
10. Invoke `$brewtools:text-optimize -l` for every changed convention, rule, and index file. Compare semantics before accepting optimized text.
11. Re-run the file inventory, validate every cited path, and report documents changed, rules added or merged, duplicates skipped, and unresolved conflicts.

Use Codex collaboration only when the user or active repository instructions explicitly require delegation. When delegation is allowed, prefer project-specific agents and keep one bounded evidence-gathering surface per agent.
