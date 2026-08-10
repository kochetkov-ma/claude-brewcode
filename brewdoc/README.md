# Brewdoc

> Documentation toolkit plugin for Claude Code -- sync, generation, memory-sync generation, PDF conversion, publishing.

| Field | Value |
|-------|-------|
| Version | 5.5.0 |
| Skills | 5 |
| Agents | 0 |
| Hooks | 0 |

## Install

Paste this into a Claude Code session:

```
Execute these commands in this session, one by one, show full output for each, do not skip any:

1. claude plugin marketplace add https://github.com/kochetkov-ma/claude-brewcode
2. claude plugin install brewdoc@claude-brewcode

After install, run `/reload-plugins` (or `exit` + `claude`).
```

<details>
<summary>Or install the whole suite</summary>

```
Execute these commands in this Claude Code session, one by one, show full output for each, do not skip any, do not summarize:

1. claude plugin marketplace add https://github.com/kochetkov-ma/claude-brewcode
2. claude plugin install brewcode@claude-brewcode
3. claude plugin install brewdoc@claude-brewcode
4. claude plugin install brewtools@claude-brewcode
5. claude plugin install brewui@claude-brewcode

After all commands succeed, run `/reload-plugins`. If `/reload-plugins` is unavailable, tell me to type `exit` and run `claude` again. Run the commands now.
```
</details>

Update anytime with `/brewtools:plugin-update`.

## Overview

Brewdoc keeps documentation in sync with the codebase, optimizes content for LLM consumption, and exports documents to ready-made formats. Each skill is self-contained and independent of the others.

## Installation

```bash
# Marketplace (recommended)
claude plugin marketplace add https://github.com/kochetkov-ma/claude-brewcode
claude plugin install brewdoc@claude-brewcode

# Already installed? Update
claude plugin marketplace update claude-brewcode
claude plugin update brewdoc@claude-brewcode

# Dev mode (no install)
claude --plugin-dir ./brewdoc
```

## Quick Start

```bash
/brewdoc:docsync-setup                # No verb -> status if installed, install if not
/brewdoc:docsync-setup install        # Install project-local doc-staleness tracking hooks
/brewdoc:docsync-setup status         # What is tracked and what is stale
/brewdoc:docsync-setup sync           # Sync stale docs (with confirmation)
/brewdoc:my-claude                    # Document your local Claude setup
/brewdoc:my-claude ext                # Document Claude Code architecture
/brewdoc:my-claude r "how do hooks work"  # Research any Claude topic
/brewdoc:memory-sync-setup install    # Emit a project-tailored /memory-sync skill into this repo
/brewdoc:memory-sync-setup status     # Is it installed, and how stale are its surface tables
/brewdoc:md-to-pdf README.md          # Convert markdown to PDF
/brewdoc:publish "Hello world"        # Publish to brewpage.app -- returns URL
```

## Skills

> **Naming rule.** A `-setup` suffix marks a skill that *installs a mechanism* -- after running it you use the installed hooks or the generated skill, not the setup skill itself. Recurring tools you invoke every time (`my-claude`, `md-to-pdf`, `publish`) keep bare names.

> **Canonical modes.** Setup skills answer the same verbs, in this order: `status | install | upgrade | enable | disable | uninstall | purge`. No argument = `status` if installed, `install` if not. Extras (`sync`, `reread`, `frontmatter`, a fine-tune prompt) come *after* the canonical verb. The v4 aliases `init`, `on`, `off`, `setup`, `remove` and `reset` are gone -- v5.0.0 is a deliberate breaking change with no back-compat. Both brewdoc setup skills implement `enable`/`disable` -- `docsync-setup` flips the `enabled` key in `.claude/docsync/config.json`, `memory-sync-setup` renames `SKILL.md` <-> `SKILL.md.disabled` -- and both implement `purge`; the Arguments column below is authoritative.

> Every brewdoc skill is `user-invocable: true` **and** `disable-model-invocation: true` -- and so is every one of the 27 skills across the suite. Claude never sees their descriptions and never fires one on its own; you type the command. That is a deliberate trade: 27 model-visible descriptions would cost tokens in every request forever, and none of these skills wants to be auto-triggered. Run [`/brewcode:setup-status`](../brewcode/skills/setup-status/README.md) to see what is installed, stale, disabled or missing across every plugin.

| Skill | Purpose | Model | Arguments |
|-------|---------|-------|-----------|
| [`/brewdoc:docsync-setup`](skills/docsync-setup/README.md) | Installs project-local doc-staleness tracking (hooks) and reports/forces doc sync | sonnet | `[status\|install\|upgrade\|enable\|disable\|uninstall\|purge] [sync [--all]\|reread\|frontmatter] \| free-text` |
| [`/brewdoc:my-claude`](skills/my-claude/README.md) | Document your Claude Code installation -- setup, architecture, web research | opus | `[ext [context]] \| [r <query>]` -- no args = internal installation docs |
| [`/brewdoc:memory-sync-setup`](skills/memory-sync-setup/README.md) | Generator -- analyzes a target project and emits a project-tailored `.claude/skills/memory-sync/` (batches, fact catalogue, non-growth sync, independent verify) | opus | `[status\|install\|upgrade\|enable\|disable\|uninstall\|purge] [fine-tune-prompt]` |
| [`/brewdoc:md-to-pdf`](skills/md-to-pdf/README.md) | Convert Markdown to PDF via reportlab or weasyprint engines | sonnet | `<file.md> [--engine name] ["prompt"] \| styles \| test` |
| [`/brewdoc:publish`](skills/publish/README.md) | Publish text/markdown/file/site to brewpage.app, returns URL | haiku | `<text\|file_path\|directory_path\|zip_path> [--ttl N] [--entry filename]` |

> Need a portable, plugin-free version? See the standalone [`brewpage-publish`](../skills/brewpage-publish/) (Claude Code) and [`openclaw/brewpage-publish`](../openclaw/brewpage-publish/) (OpenClaw / AgentSkills) skills.

### Requirements per skill

| Skill | Needs |
|-------|-------|
| `publish` | `jq` on `PATH`; `zip` as well when publishing a directory as a site. Each upload block gates on both and aborts rather than half-publishing |
| `md-to-pdf` | a Python engine -- `reportlab` or `weasyprint` |
| `my-claude` | nothing extra; writes only to `.claude/brewdoc/my-claude/` in the current project |

### Fixed in 5.0.0

- **`publish` published password-protected pages without the password.** The upload blocks referenced a `PASS_H` array built from a `$PASSWORD` variable that nothing ever assigned, and each Bash call is a fresh shell -- so the header vanished while the skill still reported a password. The blocks now carry a `{password_header}` placeholder that must be substituted before running, and the skill states the consequence of skipping it. Pages published protected by an earlier version are public; delete and republish them.
- **`my-claude` spawned a `reviewer` agent that does not exist** in any plugin, project or built-in set, so its validation step -- the one that guaranteed no invented file names -- silently never ran. It now uses `Explore` for read-only path checks and `general-purpose` where `WebFetch`/`WebSearch` are needed. Its plugin-data output directory, dead since v4.0.0, is gone; `.claude/brewdoc/my-claude/` is the only target.

## Architecture

```
brewdoc/
+-- .claude-plugin/plugin.json        # Plugin manifest
+-- hooks/
|   +-- hooks.json                    # no hooks ({"hooks":{}})
+-- skills/
    +-- docsync-setup/                # Doc-staleness tracker
    +-- my-claude/                    # Installation documentation
    +-- memory-sync-setup/            # Memory-sync generator (references/: SKILL.md.template, memory-guide, agent-audit, hard-sync)
    +-- md-to-pdf/                    # PDF conversion
    +-- publish/                      # brewpage.app publishing
```

> **Brewdoc vs Brewcode:** Brewdoc is a set of documentation utilities and each skill is self-contained. Brewcode covers the project's own engineering surface -- conventions, rules, agent teams, semantic search and deep review -- with 9 skills, 5 agents and 2 hooks. Both install from the same `claude-brewcode` marketplace and operate independently.

## Artifact metadata

Every artifact a `-setup` skill installs into your project carries the same four fields, so you can
tell at a glance what wrote a file and which plugin version it was written at.

| Field | Values | Where |
|-------|--------|-------|
| `doc_type` | `llm` \| `user` \| `skip` -- unquoted | `.md` frontmatter only, never JSON |
| `version` | `"X.Y.Z"` -- plugin version at install time | all carriers |
| `generated_by` | `"<plugin>:<skill>"` | all carriers |
| `last_updated` | `"YYYY-MM-DD"` | all carriers except a byte-copied `.mjs`/`.sh`/`.md` |

A byte-copied asset omits `last_updated`: the value would be the release date,
identical in the plugin file and the copy, so rewriting it on every build would churn bytes and
defeat the `cmp` drift check that mechanism exists for. The four keys always sit after the file's
own keys, in that order. JSON artifacts carry the same three snake_case keys at top level (no
`doc_type`) in every writing mode. `docsync-setup` and `memory-sync-setup` each stamp their own
emitted files this way; versions always come from `.claude-plugin/plugin.json`, never hardcoded. `/brewcode:setup-status` reads these back to tell you
when a setup here is running on an older version than the installed plugin.

## Documentation

Full docs: [doc-claude.brewcode.app/brewdoc/overview](https://doc-claude.brewcode.app/brewdoc/overview/)

| Resource | Link |
|----------|------|
| Docsync Setup | [docsync-setup](https://doc-claude.brewcode.app/brewdoc/skills/docsync-setup/) |
| My-Claude | [my-claude](https://doc-claude.brewcode.app/brewdoc/skills/my-claude/) |
| Memory-Sync Setup | [memory-sync-setup](https://doc-claude.brewcode.app/brewdoc/skills/memory-sync-setup/) |
| MD to PDF | [md-to-pdf](https://doc-claude.brewcode.app/brewdoc/skills/md-to-pdf/) |
| Publish | [publish](https://doc-claude.brewcode.app/brewdoc/skills/publish/) |
| Setup Status (brewcode) | [setup-status](https://doc-claude.brewcode.app/brewcode/skills/setup-status/) |
| Release Notes | [RELEASE-NOTES.md](../RELEASE-NOTES.md) |

Author: Maksim Kochetkov | License: MIT
