---
description: Detailed description of all brewdoc plugin commands
---

# Brewdoc Plugin Commands

> **Version:** 6.1.4 | **Author:** Maksim Kochetkov | **License:** MIT

## Quick Reference

All 5 brewdoc skills are documented below, one section each.

| # | Command | Purpose | Model | Args |
|---|---------|---------|-------|------|
| 1 | `/brewdoc:my-claude` | Generate docs about Claude Code installation and environment | opus | `[ext [context]] \| [r <query>]` |
| 2 | `/brewdoc:memory-sync-setup` | Generate a project-tailored `/memory-sync` skill into the target repo | opus | `[status\|install\|upgrade\|enable\|disable\|uninstall\|purge] [fine-tune-prompt]` |
| 3 | `/brewdoc:docsync-setup` | Install project-local doc-staleness tracking hooks; report/force sync | sonnet | `[status\|install\|upgrade\|enable\|disable\|uninstall\|purge] [sync [--all]\|reread\|frontmatter] \| free-text` |
| 4 | `/brewdoc:md-to-pdf` | Convert Markdown to PDF via reportlab or weasyprint | sonnet | `<file.md> [--engine name] ["prompt"] \| styles \| test` |
| 5 | `/brewdoc:publish` | Publish text/markdown/file/site to brewpage.app, returns URL | haiku | `<text\|file_path\|directory_path\|zip_path> [--ttl N] [--entry filename]` |

### Naming and modes

A `-setup` suffix marks a skill that installs a mechanism -- afterwards you use the installed hooks or the generated skill, not the setup skill. Recurring tools keep bare names.

Setup skills share one verb vocabulary, in this order: `status | install | upgrade | enable | disable | uninstall | purge`. No argument = `status` if installed, `install` if not. Skill-specific extras come after the canonical verb. v5.0.0 dropped the aliases `init`, `on`, `off`, `setup`, `remove` and `reset` with no back-compat shims. Both brewdoc setup skills implement `enable`/`disable` -- `docsync-setup` flips the `enabled` key in `.claude/docsync/config.json` (and refreshes its provenance stamp on that write), `memory-sync-setup` renames `SKILL.md` <-> `SKILL.md.disabled` -- and both implement `purge`; the per-command Args column is authoritative.

Every brewdoc skill carries `disable-model-invocation: true`: Claude never fires any of them on its own, you type the command. `/brewcode:setup-status` reports what is installed, stale or missing across all plugins.

---

## 1. `/brewdoc:my-claude`

**Purpose:** Generates docs about your Claude Code installation and environment. Three modes: INTERNAL (local setup inventory), EXTERNAL (hook/context/agent architecture from official sources), RESEARCH (query-driven investigation from multiple web sources). Output goes to `~/.claude/brewdoc/` with INDEX tracking.

| Parameter | Value |
|-----------|-------|
| **Arguments** | `[ext [context]] \| [r <query>]` |
| **Model** | `opus` |
| **Dependencies** | None |
| **Allowed tools** | `Read`, `Write`, `Edit`, `Glob`, `Grep`, `Bash`, `Agent`, `Task`, `WebFetch`, `WebSearch`, `AskUserQuestion` |

### Arguments

| Arguments | Mode | Sub-mode | Output File |
|-----------|------|----------|-------------|
| *(empty)* | INTERNAL | -- | `~/.claude/brewdoc/YYYYMMDD_my-claude-internal.md` |
| `ext` or `external` | EXTERNAL | default | `~/.claude/brewdoc/YYYYMMDD_my-claude-external.md` |
| `ext context` or `external context` | EXTERNAL | context-schema | `~/.claude/brewdoc/external/YYYYMMDD_context-schema.md` |
| `r <query>` or `research <query>` | RESEARCH | query = rest of args | `~/.claude/brewdoc/YYYYMMDD_research-{slug}.md` |

### Modes

| Mode | Goal | Sources |
|------|------|---------|
| INTERNAL | Document local Claude Code setup | `~/.claude/CLAUDE.md`, `~/.claude/rules/*.md`, `~/.claude/agents/*.md`, `~/.claude/skills/`, project `CLAUDE.md`, `.claude/rules/*.md`, memory files |
| EXTERNAL (default) | Document hook/context/agent architecture | Local hook files, WebSearch (releases, CHANGELOG), official docs, GitHub, community forums |
| EXTERNAL (context-schema) | Document context injection schema | `additionalContext`, `updatedInput`, and related patterns |
| RESEARCH | Research specific Claude Code query | Official docs, GitHub, Reddit, forums, marketplaces (2-5 source groups) |

### INDEX Tracking

All entries tracked in `~/.claude/brewdoc/INDEX.jsonl`:

```jsonl
{"ts":"2026-02-28T10:00:00","mode":"internal","path":"~/.claude/brewdoc/20260228_my-claude-internal.md","title":"Internal Claude Setup Overview","version":"1.0"}
```

If an existing entry for the same mode exists, the skill offers to update (version bump).

### Workflow

**INTERNAL mode:**
1. Load `references/internal-mode.md`
2. Spawn 3 parallel `Explore` agents: (1) global `~/.claude` config, (2) project `.claude` config, (3) memory files
3. Aggregate findings into structured document
4. Write to `~/.claude/brewdoc/YYYYMMDD_my-claude-internal.md`
5. Spawn independent `reviewer` agent to validate facts (file paths exist, content accurate)
6. Apply reviewer fixes; add INDEX entry

**EXTERNAL mode (default):**
1. Load `references/external-mode.md`
2. Analyze local hook files for event model patterns
3. WebSearch for recent Claude Code releases and CHANGELOG
4. Spawn `general-purpose` agents for: official docs, GitHub releases, community forums
5. Generate `~/.claude/brewdoc/YYYYMMDD_my-claude-external.md`; add INDEX entry

**EXTERNAL mode (context-schema):**
1. Focus on context injection schema (`additionalContext`, `updatedInput`, etc.)
2. Output to `~/.claude/brewdoc/external/YYYYMMDD_context-schema.md`; add INDEX entry

**RESEARCH mode:**
1. Analyze query -- divide into 2-5 source groups (official docs, GitHub, Reddit, forums, marketplaces)
2. Spawn `general-purpose` agents per source group in parallel
3. Aggregate with citation tracking (source URL per fact)
4. Spawn independent `reviewer` agent to validate facts and source reliability
5. Output to `~/.claude/brewdoc/YYYYMMDD_research-{slug}.md`; add INDEX entry

### Output

| Mode | Created Files |
|------|---------------|
| INTERNAL | `~/.claude/brewdoc/YYYYMMDD_my-claude-internal.md`, INDEX entry |
| EXTERNAL (default) | `~/.claude/brewdoc/YYYYMMDD_my-claude-external.md`, INDEX entry |
| EXTERNAL (context) | `~/.claude/brewdoc/external/YYYYMMDD_context-schema.md`, INDEX entry |
| RESEARCH | `~/.claude/brewdoc/YYYYMMDD_research-{slug}.md`, INDEX entry |

### Output Document Structure

**INTERNAL:**
```markdown
# Claude Code Internal Setup -- {date}
## Global Configuration
### Instructions (CLAUDE.md)
### Rules ({N} rules)
### Agents ({N} agents)
### Skills ({N} skills)
## Project Configuration
### Project Instructions
### Project Rules
## Memory
### Active Memories ({N} entries)
## Summary
| Component | Count | Location |
```

**RESEARCH:**
```markdown
# Research: {query} -- {date}
## Findings
### {Source Group 1}
...
## Sources
| Fact | Source | Reliability |
## Review Verdict
```

### Examples

```
/brewdoc:my-claude
/brewdoc:my-claude ext
/brewdoc:my-claude ext context
/brewdoc:my-claude r "how do PreToolUse hooks modify agent prompts"
/brewdoc:my-claude research "Claude Code plugin marketplace submission process"
```

---

## 2. `/brewdoc:memory-sync-setup`

**Purpose:** GENERATOR. It analyzes the target project and writes a self-contained, project-local `.claude/skills/memory-sync/` into that repo -- it never syncs memory itself. The emitted skill keeps everything that gets AUTO-LOADED into context truthful against the code; documentation is explicitly out of scope.

| Parameter | Value |
|-----------|-------|
| **Arguments** | `[status\|install\|upgrade\|enable\|disable\|uninstall\|purge] [fine-tune-prompt]` |
| **Model** | `opus` |
| **Dependencies** | None |
| **Allowed tools** | `Read`, `Edit`, `Glob`, `Grep`, `Bash`, `Agent`, `AskUserQuestion` |
| **Model invocation** | `disable-model-invocation: true` -- user-invoked only |

### Modes

| Mode | Writes | Runs |
|------|--------|------|
| `status` (**default when installed**) | nothing | Is `memory-sync` installed, what its provenance frontmatter says (`doc_type`/`version`/`generated_by`/`last_updated`/`surface_files`), how stale its surface tables are vs the live repo. Verdict `IN SYNC` / `STALE (n drifts)` / `STALE-LEGACY (n drifts)` (pre-5.0 tail stamp -- run `upgrade`) / `NOT INSTALLED`, each prefixed `PARKED - ` when disabled |
| `install` (**default when not installed**) | the 4 emitted files (`SKILL.md` + `references/memory-guide.md`, `agent-audit.md`, `hard-sync.md`) | Full analysis + emit. Refuses an existing installation |
| `upgrade` | targeted edits + provenance restamp | Re-scan and refresh an existing installation; hand-edits preserved, never blind-overwritten |
| `enable` | renames `SKILL.md.disabled` -> `SKILL.md` | Brings `/memory-sync` back; nothing regenerated |
| `disable` | renames `SKILL.md` -> `SKILL.md.disabled` | Withdraws `/memory-sync` from the roster; the 3 references and every hand-edit stay byte-identical. Reversible by `enable` |
| `uninstall` | deletes exactly what `emit` wrote (`SKILL.md`/parked form + the 3 references) | Removes the emitted skill after confirmation. Files the user added to that dir are kept and listed |
| `purge` | deletes `<target>/.claude/skills/memory-sync/` outright | Removes everything including user-added files. Confirmation first |

### Emitted surface (every run of `/memory-sync`)

| Layer | Path |
|-------|------|
| Root CLAUDE.md | `./CLAUDE.md`, `./.claude/CLAUDE.md`, `CLAUDE.local.md` |
| Nested CLAUDE.md | every `**/CLAUDE.md` at any depth |
| Rules | `.claude/rules/*.md` |
| Conventions | `CONVENTIONS.md`, `CONTRIBUTING.md`, `@path` imports |
| AGENTS.md family | `AGENTS.md` at any depth |
| Agents / Skills | `.claude/agents/*.md`, `.claude/skills/*/SKILL.md` + their `references/*.md` |
| Memory dir | `$MEMORY_DIR/*.md` (`autoMemoryDirectory`, else `~/.claude/projects/<hash>/memory/`) |

Excluded with reasons: `docs/**` (a separate doc flow owns it), all source code (read-only evidence), secrets, task-board state, build output.

### Emitted behaviour

1. **Scopes:** `session` (default) / `branch` / `commit <sha>` / `recent[:N]` / `all`, plus a `hard` depth. Free-form focus text steers emphasis and never narrows the sweep.
2. **`hard` depth:** two extra aggressive passes -- a rules `paths:` PRECISION audit (a broad glob loads the rule into every context and burns tokens everywhere) and an OBVIOUS-KNOWLEDGE PURGE (delete what a competent model already knows; keep only project decisions and domain facts).
3. **GATHER -> SYNC -> VERIFY:** parallel read-only gather, one bounded agent per disjoint batch (all spawned in ONE message), then independent checkers, never the agent that wrote the batch.
4. **Agent re-audit:** agents are re-audited against current best practice every run, not merely fact-checked.
5. **Non-growth:** facts first, then dedup, then compression; each file `<=` its original line count, total delta `<= 0`.
6. **SELF-SYNC:** the emitted skill refreshes its own surface tables and adds sections for memory layers the project gained.

### Output

```markdown
## memory-sync-setup [status|install|upgrade|uninstall]

### Surface / Batches / Exclusions
| Batch | Files | Paths |

### Emitted files / Ambiguities resolved / How to run it
```

### Examples

```
/brewdoc:memory-sync-setup
/brewdoc:memory-sync-setup install "weight stale-fact removal over compression"
/brewdoc:memory-sync-setup status
/brewdoc:memory-sync-setup upgrade
/brewdoc:memory-sync-setup disable
/brewdoc:memory-sync-setup enable
/brewdoc:memory-sync-setup uninstall
/brewdoc:memory-sync-setup purge
```

Then, inside that project: `/memory-sync`, `/memory-sync branch`, `/memory-sync all hard "only rules"`.

---

## 3. `/brewdoc:docsync-setup`

**Purpose:** Installs three project-local hooks that watch which `.md` docs are touched, then nag once per turn when a touched doc is stale by date. Source of truth is each doc's own frontmatter (`last_updated`) -- date only, local time, no hash, no deps. Runs in the main conversation (uses `AskUserQuestion`), no `context: fork`.

| Parameter | Value |
|-----------|-------|
| **Arguments** | `[status\|install\|upgrade\|enable\|disable\|uninstall\|purge] [sync [--all]\|reread\|frontmatter] \| free-text` |
| **Model** | `sonnet` |
| **Dependencies** | None |
| **Allowed tools** | `Read`, `Write`, `Edit`, `Bash`, `Glob`, `Grep`, `AskUserQuestion` |
| **Model invocation** | `disable-model-invocation: true` -- user-invoked only |

### Modes

| Mode | Writes | Description |
|------|--------|-------------|
| `status` (**default when installed**) | nothing | Report tracked docs, staleness, current session touched-set |
| `install` (**default when not installed**) | hooks + `.claude/docsync/{config,state}.json` | Ask threshold (7/14/30/other days) + exclude globs; copy `docsync-{track,watch,gate}.mjs` into `.claude/hooks/`; write `config.json` with `version` (the plugin version, by skill self-location), `generated_by` (`brewdoc:docsync-setup`), `last_updated` (`date +%F`), `threshold_days` and `exclude`; merge `settings.json` (never clobbers foreign hooks, `.bak` backup first) |
| `upgrade` | hook files + settings entries + `config.json` provenance keys | Re-copy the 3 hooks from the current plugin version, re-register any that went missing, and refresh ONLY `config.json`'s `version` / `generated_by` / `last_updated`; `threshold_days` and `exclude` are preserved verbatim |
| `enable` | `config.json`: `enabled: true` + provenance refresh | Flips docsync back to live; hooks stay registered throughout, effective immediately, no session restart. Provenance keys are backfilled if missing or stale, not required to already match |
| `disable` | `config.json`: `enabled: false` + provenance refresh | Flips docsync inert without unwiring it; hooks stay registered but all three no-op (absent `enabled` key still counts as `true`, so this is the only way to pause). Reversible by `enable` |
| `uninstall` | removes hooks + settings.json entries | Inverse-merge removes only the 3 docsync hook entries; foreign hooks preserved; then ASKS whether to delete `.claude/docsync/` (config + state) -- Yes deletes it, Keep leaves it for a later `install` to reuse |
| `purge` | `uninstall` + deletes `.claude/docsync/` | The destructive one: hooks, registration, config and state all go |

**Extras** -- run after install, no canonical verb needed:

| Extra | Writes | Description |
|-------|--------|-------------|
| `sync [--all]` | frontmatter `last_updated` | Refresh stale docs (or every in-scope doc with `--all`) WITH confirmation; Claude reads each doc's `sync_procedure` and follows it (prose hint -- no hook parses it); compression by `doc_type` (`llm` = deep, `user` = light, absent = `user`) |
| `reread` | nothing | Force re-read of tracked docs to refresh in-context understanding |
| `frontmatter` | frontmatter block | Opt-in retro-add of `doc_type`/`last_updated`/`sync_procedure` to docs missing them; never runs automatically at `install` |

### Frontmatter schema

```yaml
---
doc_type: llm                  # optional, UNQUOTED; absent or unrecognized => user. values: llm | user | skip
last_updated: "2026-07-19"     # sole staleness input (YYYY-MM-DD, LOCAL time)
sync_procedure: "what to check / where to look when syncing"   # optional, prose
---
```

`doc_type: skip` excludes a file from tracking entirely -- enforced by all three hooks, the Stop gate
included. Absent or unrecognized `doc_type` is normalized to `user` in code, not just in docs.
`sync_procedure` is a model-only hint: no hook reads it. `last_updated` and `sync_procedure` are quoted,
`doc_type` is bare -- the hooks' parser strips quotes either way, but a real YAML consumer types an
unquoted `2026-07-19` as a Date, and `doc_type` is an enum matched literally as `^doc_type: llm$`.
Staleness: `today - last_updated > threshold_days`, whole days in LOCAL time.

```
/brewdoc:docsync-setup
/brewdoc:docsync-setup install
/brewdoc:docsync-setup status
/brewdoc:docsync-setup upgrade
/brewdoc:docsync-setup disable
/brewdoc:docsync-setup enable
/brewdoc:docsync-setup sync --all
/brewdoc:docsync-setup frontmatter
/brewdoc:docsync-setup uninstall
/brewdoc:docsync-setup purge
```

---

## 4. `/brewdoc:md-to-pdf`

**Purpose:** Converts a Markdown file to PDF using one of two rendering engines. Detects missing dependencies and offers to install them; saves the chosen engine/style as project or global config; supports optional LLM preprocessing of the source Markdown before conversion.

| Parameter | Value |
|-----------|-------|
| **Arguments** | `<file.md> [--engine name] ["prompt"] \| styles \| test \| (no args = help)` |
| **Model** | `sonnet` |
| **Dependencies** | None |
| **Allowed tools** | `Read`, `Write`, `Edit`, `Bash`, `Glob`, `Grep`, `AskUserQuestion` |

### Modes

| Mode | Trigger | Description |
|------|---------|-------------|
| HELP | empty or `help` | Print usage and exit |
| STYLES | `styles` or `config` | Interactive `AskUserQuestion` config: page size, color scheme, code theme, footer format; saved to `.claude/md-to-pdf.config.json` |
| TEST | `test` | Convert the bundled `test/test-all-elements.md` sample |
| CONVERT | `<file.md>` | Convert with saved/flagged engine |
| CONVERT+PROMPT | `<file.md> "prompt"` | Apply LLM transformations to a temp copy, then convert, then delete the temp file |

### Engines

| Feature | reportlab | weasyprint |
|---------|-----------|------------|
| Install | pip only | pip + brew |
| Quality | Good | Excellent |
| CSS Styling | No | Yes |
| Code highlight | No | Yes (Pygments) |

```
/brewdoc:md-to-pdf report.md
/brewdoc:md-to-pdf report.md --engine weasyprint
/brewdoc:md-to-pdf report.md "remove section 3"
/brewdoc:md-to-pdf styles
/brewdoc:md-to-pdf test
```

---

## 5. `/brewdoc:publish`

**Purpose:** Publishes text, Markdown, a file, a directory, or a ZIP to brewpage.app, returning a URL. No sign-up required. Auto-detects content type, asks for namespace (public/private) and optional password, then publishes and saves the owner token to `.claude/brewpage-history.md`.

| Parameter | Value |
|-----------|-------|
| **Arguments** | `<text\|file_path\|directory_path\|zip_path> [--ttl N] [--entry filename]` |
| **Model** | `haiku` |
| **Dependencies** | None |
| **Allowed tools** | `Read`, `Write`, `Bash`, `AskUserQuestion`, `Glob` |

### Content Type Detection

| Input | Type | API |
|-------|------|-----|
| Directory | SITE | `POST /api/sites` (ZIP built from dir) |
| `.zip` file | SITE | `POST /api/sites` (archive upload) |
| `.md`/`.markdown` file | MARKDOWN | `POST /api/html?format=markdown` |
| Any other existing file | FILE | `POST /api/files` (multipart) |
| Starts with `{` or `[` | JSON | `POST /api/json` |
| Anything else | HTML | `POST /api/html` (format=markdown) |

### Flags

| Flag | Default | Description |
|------|---------|-------------|
| `--ttl N` | `15` days | Time to live |
| `--entry filename` | auto-detect | Entry file for SITE uploads: flag > `index.html` > first `.html` alphabetically |

Namespace: `public` (listed in gallery, indexed) or an auto-suggested/custom private slug (unlisted, link-only). Password protection is optional and hides the page from the gallery.

```
/brewdoc:publish report.md
/brewdoc:publish ./dist --entry index.html
/brewdoc:publish "hello world" --ttl 30
```

---

## Error Handling

| Error | Applies To | Action |
|-------|-----------|--------|
| `memory-sync` already installed | memory-sync-setup | `install` refuses; use `upgrade` (or `MEMORY_SYNC_FORCE=1` to destroy hand-edits) |
| Surviving `{PLACEHOLDER}` after emit | memory-sync-setup | `generate.sh validate` fails; fill the slot before reporting |
| Emitted agent name does not resolve | memory-sync-setup | Fall back to `general-purpose`, report the substitution |
| `upgrade` but nothing installed | memory-sync-setup, docsync-setup | Stop; point at `install` |
| File not found | my-claude | Skip, add to errors |
| `settings.json` invalid JSON | docsync-setup | Abort merge/clean, restore `.bak`, report |
| No `.md` in target directory (SITE) | publish | Fail with explicit error, never guess an entry file |
| Dependency install fails | md-to-pdf | Report `INSTALL_FAILED` and stop |
| Conversion fails | md-to-pdf | Read error, attempt one fix + retry, else report error |

## Plugin Variable

brewdoc has no hooks. Skills resolve their own resources natively via `${CLAUDE_SKILL_DIR}` -- substituted by Claude Code itself. No hook injection is needed.
