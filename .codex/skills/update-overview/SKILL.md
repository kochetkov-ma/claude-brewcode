---
name: update-overview
description: Inventory project Codex instructions, skills, agents, rules, and configuration key names, and update a local overview without accessing runtime or account state.
---

# Project Codex overview

Parse the RU/EN prompt for mode and target. A single literal `status`, `show`, or `update` wins; otherwise show/list/check and покажи/список/проверь resolve to read-only `status`, update/refresh and обнови/освежи resolve to `update`. Empty input defaults to `update`. Extract paths from prose; clarify outcome-changing ambiguity. Emit one English plan with mode, project scope, output path, and result before work.

Inventory only the current project's `AGENTS.md`, `.codex/rules/`, `.codex/skills/`, `.codex/agents/`, `.agents/skills/`, and explicitly named project Codex config files. Discover via focused `rg --files`; record path, format, purpose, symlink target, and missing references. Follow links only to tracked repository instruction/reference sources; record external targets without reading them. Rules require explicit instruction references; discovery aliases do not imply plugin activation.

For JSON/TOML configuration, report structural key names only, never values. Do not dump config contents or parser diagnostics containing source lines. Do not read `.env`, credentials, auth, sessions, histories, databases, caches, shell snapshots, secret environment values, or global runtime directories. Do not scan or measure excluded directories.

`status` returns findings without writes. `update` writes the requested project-local document, or `.codex/reports/<YYYYMMDD-HHMMSS_codex-overview>/overview.md` if none was named. Preserve unrelated content when updating an existing overview. Include instruction/rule relationships, skills and agents, config key inventory, source paths, inspection date, and gaps; use a compact tree only for allowed paths. Summarize changed inventory and written paths. Never synchronize to global profiles or `.claude/`.

Use the current tracked inventory as evidence; distinguish missing references from unavailable external sources. Do not import Claude runtime scans, config dumps, plugin commands, or global synchronization into this workflow.
