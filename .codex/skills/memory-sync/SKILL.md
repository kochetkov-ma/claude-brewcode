---
name: memory-sync
description: Verify, deduplicate, and compact an explicitly inventoried set of project Codex instructions against current source facts; honors narrowed scope and excludes persistent personal memory unless directly requested.
---

# Memory sync

Sync project Codex instructions using [references/sync-contract.md](references/sync-contract.md). Inventory concrete authorized paths before editing: applicable `AGENTS.md`, explicitly referenced `.codex/rules/` or conventions, native agent TOML, and native skills/supporting instruction Markdown. Presence in a directory, git tracking, or being Markdown does not make a file authorized. User scope narrowing always wins, including "only rules" or an explicit file list.

Resolve the change-fact source from the request: session by default; explicit branch, commit/range, recent commits, or all facts. NORMAL verifies facts, deduplicates, and compacts; HARD additionally audits rule activation and removes generic guidance without losing project decisions. Depth never expands edit scope. Announce the source, depth, concrete inventory/exclusions, and verification in English.

Source code, distributed templates/product skill sources, public docs, config, reports, task/runtime state, caches, secrets, and personal/global instruction layers are evidence or excluded, never edit targets. Claude instructions and shared symlink targets are verify-only. Resolve real paths before editing; do not write through a symlink into another product or shared/global layer. Persistent Codex memory requires an explicit direct user request and the active memory policy; invoking this skill alone is insufficient authorization.

Snapshot the actual authorized files, then verify facts -> choose canonical homes/deduplicate -> compact with `apply_patch`. Preserve decisions, prohibitions, exceptions, ownership, provenance, numbered rule IDs, and supported native metadata. Re-audit included agents/skills for current roles, paths, tools, contracts, and references; parse TOML as TOML. Do not change operational behavior or permissions to make stale claims true.

Use bounded disjoint owners and an independent read-only post-sync check when authorized/available; otherwise disclose the verification limit. Verify every edit and deletion against the snapshot and live evidence, including the full text after large reductions. Keep the root rule index (`Rule`, `Load when`, `Purpose`) consistent with authorized rule edits: `.codex/rules/` and `paths:` do not autoload. If the root index is outside the user's narrowed scope, report the required index correction rather than silently widening writes.

Report edited paths, verified facts, removed duplicates/stale claims, before/after size, uncertain facts, verify-only drift, checks, and deferred proposals. No automatic self-sync: this skill is editable only if explicitly included in the authorized inventory.
