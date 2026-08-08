---
description: Detailed description of all brewdoc plugin commands
---

# Brewdoc Plugin Commands

> **Version:** 4.10.0 | **Author:** Maksim Kochetkov | **License:** MIT

## Quick Reference

| # | Command | Purpose | Model | Args |
|---|---------|---------|-------|------|
| 1 | `/brewdoc:my-claude` | Generate docs about Claude Code installation and environment | opus | `[ext [context]] \| [r <query>]` |
| 2 | `/brewdoc:memory-sync-init` | Generate a project-tailored `/memory-sync` skill into the target repo | opus | `[status\|init\|upgrade] [fine-tune-prompt]` |
| 3 | `/brewdoc:docsync` | Install project-local doc-staleness tracking hooks; report/force sync | sonnet | `[status] \| [sync [--all]] \| [reread] \| [frontmatter] \| [uninstall] \| free-text` |
| 4 | `/brewdoc:guide` | Interactive tutorial for the brewcode/brewdoc/brewtools/brewui plugin suite | haiku | `[topic]` (no args = menu) |
| 5 | `/brewdoc:md-to-pdf` | Convert Markdown to PDF via reportlab or weasyprint | sonnet | `<file.md> [--engine name] ["prompt"] \| styles \| test` |
| 6 | `/brewdoc:publish` | Publish text/markdown/file/site to brewpage.app, returns URL | haiku | `<text\|file_path\|directory_path\|zip_path> [--ttl N] [--entry filename]` |

---

## 1. `/brewdoc:my-claude`

**Purpose:** Generates docs about your Claude Code installation and environment. Three modes: INTERNAL (local setup inventory), EXTERNAL (hook/context/agent architecture from official sources), RESEARCH (query-driven investigation from multiple web sources). Output goes to `~/.claude/brewdoc/` with INDEX tracking.

| Parameter | Value |
|-----------|-------|
| **Arguments** | `[ext [context]] \| [r <query>]` |
| **Model** | `opus` |
| **Dependencies** | None |
| **Allowed tools** | `Read`, `Write`, `Edit`, `Glob`, `Grep`, `Bash`, `Task`, `WebFetch`, `WebSearch`, `Skill` |

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

## 2. `/brewdoc:memory-sync-init`

**Purpose:** GENERATOR. It analyzes the target project and writes a self-contained, project-local `.claude/skills/memory-sync/` into that repo -- it never syncs memory itself. The emitted skill keeps everything that gets AUTO-LOADED into context truthful against the code; documentation is explicitly out of scope.

| Parameter | Value |
|-----------|-------|
| **Arguments** | `[status\|init\|upgrade] [fine-tune-prompt]` |
| **Model** | `opus` |
| **Dependencies** | None |
| **Allowed tools** | `Read`, `Edit`, `Glob`, `Grep`, `Bash`, `Agent`, `AskUserQuestion` |

### Modes

| Mode | Writes | Runs |
|------|--------|------|
| `status` | nothing | Is `memory-sync` installed, its provenance stamp, how stale its surface tables are vs the live repo. Verdict `IN SYNC` / `STALE (n drifts)` / `NOT INSTALLED` |
| `init` (**default**) | the 4 emitted files (`SKILL.md` + `references/memory-guide.md`, `agent-audit.md`, `hard-sync.md`) | Full analysis + emit. Refuses an existing installation |
| `upgrade` | targeted edits | Re-scan and refresh an existing installation; hand-edits preserved, never blind-overwritten |

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
## memory-sync-init [status|init|upgrade]

### Surface / Batches / Exclusions
| Batch | Files | Paths |

### Emitted files / Ambiguities resolved / How to run it
```

### Examples

```
/brewdoc:memory-sync-init
/brewdoc:memory-sync-init "weight stale-fact removal over compression"
/brewdoc:memory-sync-init status
/brewdoc:memory-sync-init upgrade
```

Then, inside that project: `/memory-sync`, `/memory-sync branch`, `/memory-sync all hard "only rules"`.

---

## 3. `/brewdoc:docsync`

**Purpose:** Installs three project-local hooks that watch which `.md` docs are touched, then nag once per turn when a touched doc is stale by date. Source of truth is each doc's own frontmatter (`last_updated`) -- date only, local time, no hash, no deps. Runs in the main conversation (uses `AskUserQuestion`), no `context: fork`.

| Parameter | Value |
|-----------|-------|
| **Arguments** | `[status] \| [sync [--all]] \| [reread] \| [frontmatter] \| [uninstall] \| free-text` |
| **Model** | `sonnet` |
| **Dependencies** | None |
| **Allowed tools** | `Read`, `Write`, `Edit`, `Bash`, `Glob`, `Grep`, `AskUserQuestion` |

### Modes

| Mode | Writes | Description |
|------|--------|-------------|
| `init` (empty + not installed) | hooks + `.claude/docsync/{config,state}.json` | Ask threshold (7/14/30/other days) + exclude globs; copy `docsync-{track,watch,gate}.mjs` into `.claude/hooks/`; merge `settings.json` (never clobbers foreign hooks, `.bak` backup first) |
| `status` (empty + installed) | nothing | Report tracked docs, staleness, current session touched-set |
| `sync [--all]` | frontmatter `last_updated` | Refresh stale docs (or every in-scope doc with `--all`) WITH confirmation; follows each doc's `sync_procedure` if present; compression by `doc_type` (`llm` = deep, `user` = light) |
| `reread` | nothing | Force re-read of tracked docs to refresh in-context understanding |
| `frontmatter` | frontmatter block | Opt-in retro-add of `doc_type`/`last_updated` to docs missing it; never runs automatically at `init` |
| `uninstall` | removes hooks + settings.json entries | Inverse-merge removes only the 3 docsync hook entries; asks whether to also delete `.claude/docsync/` |

### Frontmatter schema

```yaml
---
doc_type:      llm            # optional; absent => user. values: llm | user | skip
last_updated:  2026-07-19     # sole staleness input (YYYY-MM-DD)
sync_procedure:"what to check / where to look when syncing"   # optional, prose
---
```

`doc_type: skip` excludes a file from tracking entirely. Staleness: `today - last_updated > threshold_days`.

```
/brewdoc:docsync
/brewdoc:docsync status
/brewdoc:docsync sync --all
/brewdoc:docsync frontmatter
/brewdoc:docsync uninstall
```

---

## 4. `/brewdoc:guide`

**Purpose:** Read-only interactive tutorial for the brewcode/brewdoc/brewtools/brewui plugin suite. Tracks per-user progress across 9 topics, offers language selection (English/Русский/Português), checks plugin freshness before starting, and never modifies project files -- only its own progress JSON.

| Parameter | Value |
|-----------|-------|
| **Arguments** | `[topic]` -- no args = interactive menu |
| **Model** | `haiku` |
| **Dependencies** | None |
| **Allowed tools** | `Read`, `Glob`, `Grep`, `Bash`, `WebSearch`, `AskUserQuestion` |
| **Model invocation** | `disable-model-invocation: true` -- user-invoked only |

### Topic Map

| ID | Topic |
|----|-------|
| `overview` | Four Plugins Overview |
| `installation` | Installation & Updates |
| `killer-flow` | Board -> Spec -> Review |
| `teams` | Dynamic Teams |
| `skills-catalog` | All Skills Catalog |
| `agents-catalog` | All Agents Catalog |
| `customization` | Build Your Own |
| `integration` | Project Configuration |
| `advanced` | Power Features |

### Workflow

1. Validate environment (`scripts/validate.sh`); skip silently if unavailable
2. Check plugin freshness via `brewtools:plugin-update`; offer update if stale
3. Load progress (`scripts/progress.sh read`); ask language on first run
4. Route: exact/fuzzy topic match from `$ARGUMENTS`, else show menu with recommended next topic
5. Deliver topic section-by-section (translated per `$PROGRESS.lang`), offering continue/example/go-deeper/skip/exit at each step
6. Mark topic complete (`scripts/progress.sh complete`), recommend the next incomplete topic

```
/brewdoc:guide
/brewdoc:guide killer-flow
/brewdoc:guide agents-catalog
```

---

## 5. `/brewdoc:md-to-pdf`

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

## 6. `/brewdoc:publish`

**Purpose:** Publishes text, Markdown, a file, a directory, or a ZIP to brewpage.app, returning a URL. No sign-up required. Auto-detects content type, asks for namespace (public/private) and optional password, then publishes and saves the owner token to `.claude/brewpage-history.md`.

| Parameter | Value |
|-----------|-------|
| **Arguments** | `<text\|file_path\|directory_path\|zip_path> [--ttl N] [--entry filename]` |
| **Model** | `haiku` |
| **Dependencies** | None |
| **Allowed tools** | `Read`, `Bash`, `AskUserQuestion`, `Glob` |

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
| `memory-sync` already installed | memory-sync-init | `init` refuses; use `upgrade` (or `MEMORY_SYNC_FORCE=1` to destroy hand-edits) |
| Surviving `{PLACEHOLDER}` after emit | memory-sync-init | `generate.sh validate` fails; fill the slot before reporting |
| Emitted agent name does not resolve | memory-sync-init | Fall back to `general-purpose`, report the substitution |
| File not found | my-claude | Skip, add to errors |
| `settings.json` invalid JSON | docsync | Abort merge/clean, restore `.bak`, report |
| No `.md` in target directory (SITE) | publish | Fail with explicit error, never guess an entry file |
| Dependency install fails | md-to-pdf | Report `INSTALL_FAILED` and stop |
| Conversion fails | md-to-pdf | Read error, attempt one fix + retry, else report error |

## Plugin Variable

brewdoc has no hooks. Skills resolve their own resources natively via `${CLAUDE_SKILL_DIR}` -- substituted by Claude Code itself. No hook injection is needed.
