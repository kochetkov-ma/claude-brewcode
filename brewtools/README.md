# Brewtools

> Universal text utilities plugin for Claude Code -- token optimization, AI artifact removal, secrets scanning, SSH management, GitHub Actions deployment, and plugin updates.

| Field | Value |
|-------|-------|
| Version | 5.2.2 |
| Skills | 12 |
| Agents | 3 |
| Hooks | 2 |

## Install

Paste this into a Claude Code session:

```
Execute these commands in this session, one by one, show full output for each, do not skip any:

1. claude plugin marketplace add https://github.com/kochetkov-ma/claude-brewcode
2. claude plugin install brewtools@claude-brewcode

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

Brewtools provides standalone utilities: token-efficient optimization with 52 validated rules, universal AI-artifact removal with greedy flow detection across code/docs/articles/reddit/chat (five domain flows, two-pass strip+inject model), security scanning for leaked credentials, SSH server management, GitHub Actions deployment with safety gates, and plugin check/install/update. Each skill is self-contained and requires no prior setup.

## Installation

```bash
# Marketplace (recommended)
claude plugin marketplace add https://github.com/kochetkov-ma/claude-brewcode
claude plugin install brewtools@claude-brewcode

# Already installed? Update
claude plugin marketplace update claude-brewcode
claude plugin update brewtools@claude-brewcode

# Dev mode (no install)
claude --plugin-dir ./brewtools
```

## Quick Start

```bash
/brewtools:text-optimize CLAUDE.md              # Medium mode (default)
/brewtools:text-optimize -l agents/reviewer.md  # Light mode -- safe, minimal changes
/brewtools:text-optimize -d prompts/            # Deep mode -- aggressive compression
/brewtools:text-optimize -s README.md           # Standard mode -- 30-50%, human-readable, verified
/brewtools:text-optimize -x CLAUDE.md           # Max mode -- 3-4x, opt-in, 2 verification rounds
/brewtools:text-human 3be67487                              # mixed flow: clean all files from a commit
/brewtools:text-human src/main/java/services/               # mixed flow: entire folder, parallel blocks
/brewtools:text-human "humanize this blog post: <text>"     # article flow: burstiness + stance injection
/brewtools:text-human src/ only strip AI artifacts, no inject  # custom prompt overrides defaults
/brewtools:secrets-scan                         # Scan for leaked credentials
/brewtools:secrets-scan --fix                   # Scan and fix interactively
/brewtools:plugin-update                        # Interactive check + update
/brewtools:plugin-update check                  # Status table only
```

Setup skills all speak the same verbs:

```bash
/brewtools:manager-setup                        # No verb = status if installed, install if not
/brewtools:manager-setup install                # Install the HARD delegation wall into this project
/brewtools:manager-setup disable                # Disarm it, keep the files
/brewtools:think-short-setup install global     # Terse-mode hooks, global scope
/brewtools:agent-deadline-setup install project 20   # 20-minute subagent budget
/brewtools:task-board-setup install ~/repos/api      # Kanban into another repo
/brewcode:setup-status                          # What is installed / stale / missing, everywhere
```

## Skills

> **Naming rule.** A `-setup` suffix marks a skill that *installs a mechanism* -- after running it you use the installed hooks, guard or generated skill, not the setup skill itself. Recurring tools you invoke every time (`text-optimize`, `secrets-scan`, `ssh`, ...) keep bare names.

> **Canonical modes.** Every `-setup` skill answers the same verbs, in this order: `status | install | upgrade | enable | disable | uninstall | purge`. No argument = `status` if installed, `install` if not. Skill-specific extras (scope, level, minutes, path) come *after* the canonical verb. The v4 aliases `init`, `on`, `off`, `setup`, `remove` and `reset` are gone -- v5.0.0 is a deliberate breaking change with no back-compat. Not every skill implements all seven; the Arguments column below is authoritative per skill.

> **Run `upgrade` in every project that already has one of these installed.** A `-setup` skill copies files INTO the project; a plugin update does not reach those copies. Two of them matter right now:
> - `/brewtools:manager-setup upgrade` — backfills `manager-state.mjs` (the wall's off-switch CLI) into projects installed before it existed. Without it the documented disarm command has no script to run.
> - `/brewtools:think-short-setup upgrade` — installs the `think-short-task.mjs` that actually detects a foreign `Task`/`Agent` hook. Older copies report `injects=unknown` in `status`.

> Run [`/brewcode:setup-status`](../brewcode/skills/setup-status/README.md) to see which setup skills are installed, stale or missing in the current project, with the exact command to run for each.

| Skill | Purpose | Model | Arguments |
|-------|---------|-------|-----------|
| [`/brewtools:text-optimize`](skills/text-optimize/README.md) | Optimize text for LLM token efficiency | sonnet | `[-l\|-s\|-d\|-x\|--max] [file\|folder\|path1,path2]` |
| [`/brewtools:text-human`](skills/text-human/README.md) | Humanizes code, docs, articles, reddit/chat, javadoc -- strips AI artifacts, fixes unicode, fits register | sonnet | `[path\|commit\|folder\|text] [custom instructions]` |
| [`/brewtools:secrets-scan`](skills/secrets-scan/README.md) | Scan for leaked secrets and credentials | sonnet | `[--fix]` |
| [`/brewtools:ssh`](skills/ssh/SKILL.md) | SSH server management and configuration | opus | `<prompt describing what to do>` |
| [`/brewtools:deploy`](skills/deploy/SKILL.md) | GitHub Actions deployment with safety gates | opus | `<prompt describing what to do>` |
| [`/brewtools:manager-setup`](skills/manager-setup/README.md) | Manager mode: installs a hard delegation wall into this project and explains/customizes codewords `++m` (delegate-everything, plan-aware), `++a` (architecture-first), `++rr` (anti-regression review), `++r` (two-phase double-check). The codewords are hook-driven and fire whether or not the wall is installed; the wall itself is opt-in, per-project, and blocks main-session writes while subagents stay free | sonnet | `[status\|install\|upgrade\|enable\|disable\|uninstall\|purge] [level strict\|balanced] [edit] \| <task в хард режиме> \| <task от роли менеджера> \| <prompt>` |
| [`/brewtools:plugin-update`](skills/plugin-update/README.md) | Check/install/update brewcode plugins | sonnet | `[check\|update\|all]` |
| [`/brewtools:provider-switch`](skills/provider-switch/README.md) | Configure alt API providers: DeepSeek, Z.ai/GLM, Qwen, MiniMax, OpenRouter | opus | `[status\|install\|verify\|model-check\|help\|<provider-name>]` -- no args = interactive status check |
| [`/brewtools:think-short-setup`](skills/think-short-setup/README.md) | Install/remove terse-mode hooks (SessionStart + every-10th UserPromptSubmit + subagent Task) that inject brevity directives; project or global. `disable` flips a flag and leaves the files in place; `purge` deletes files and state | sonnet | `[status\|install\|upgrade\|enable\|disable\|uninstall\|purge] [project\|global] \| free-text intent` |
| [`/brewtools:agent-deadline-setup`](skills/agent-deadline-setup/README.md) | Install/remove a soft wall-clock budget for subagents: 80% -- non-blocking "wrap up" warning, 100% -- deny all tools except the finalization set; project or global, opt-in | sonnet | `[status\|install\|upgrade\|enable\|disable\|uninstall\|purge] [project\|global] [minutes] \| free-text intent` |
| [`/brewtools:agent-router-setup`](skills/agent-router-setup/README.md) | EXPERIMENTAL. Install/remove a PreToolUse hook that denies a generic subagent spawn in favor of the real project/plugin expert, or nudges when the fit is only uncertain; tier 1 free and deterministic, tier 2 opt-in LLM judge not yet behaviorally verified; project scope only | sonnet | `[status\|install\|upgrade\|enable\|disable\|uninstall\|purge] [level fast\|strict] \| free-text intent` |
| [`/brewtools:task-board-setup`](skills/task-board-setup/README.md) | Generator: deploys a file-based Kanban into any repo via multi-agent analysis, with an optional spec + design layer (`task-spec` skill) and an `upgrade` mode to retrofit it onto an existing board, plus an optional gated CLAUDE.md-optimization pass | opus | `[status\|install\|upgrade\|uninstall\|purge] [target repo path \| empty = cwd] [free-text directive, e.g. 'also dedupe rules', 'skip module split']` |

## Agents

| Agent | Model | Purpose |
|-------|-------|---------|
| [text-optimizer](agents/text-optimizer.md) | sonnet | Optimizes text/docs for LLM token efficiency |
| [ssh-admin](agents/ssh-admin.md) | inherit | Linux server admin: SSH, Docker, systemd, Nginx, SSL |
| [deploy-admin](agents/deploy-admin.md) | inherit | GitHub Actions deployment: workflows, releases, GHCR, CI/CD |

> **Scope guard:** every agent stops and proposes a split when a task exceeds one bounded unit (one deliverable, ~5 files). `ssh-admin` splits per host, `deploy-admin` per repo and per environment.

## Architecture

```
brewtools/
+-- .claude-plugin/plugin.json        # Plugin manifest
+-- hooks/
|   +-- hooks.json                    # Hook registry
|   +-- session-start.mjs            # Manager HARD-wall awareness
|   +-- manager-prompt.mjs           # ++m / ++a / ++rr / ++r codeword injection
|   +-- hardmode-guard.mjs            # HARD-wall guard template (not registered; copied per project by manager-setup)
|   +-- lib/utils.mjs                 # I/O utilities
+-- skills/
|   +-- text-optimize/                # Token optimization
|   +-- text-human/                   # AI artifact removal
|   +-- secrets-scan/                 # Secrets scanning
|   +-- ssh/                          # SSH server management
|   +-- deploy/                       # GitHub Actions deployment
|   +-- plugin-update/                # Plugin check / install / update
|   +-- provider-switch/               # Alternative API provider management
|   +-- think-short-setup/             # Terse-mode hooks install/remove
|   +-- agent-deadline-setup/          # Subagent soft wall-clock budget hooks install/remove
|   +-- agent-router-setup/            # EXPERIMENTAL: route generic subagent spawns to the real expert
|   +-- manager-setup/                 # Codeword-triggered Manager mode + HARD delegation wall
|   +-- task-board-setup/              # File-based Kanban generator (multi-agent)
+-- agents/
    +-- text-optimizer.md             # Text optimization agent
    +-- ssh-admin.md                  # SSH and server administration
    +-- deploy-admin.md               # Deployment and CI/CD
```

> **Brewtools vs Brewcode:** Brewtools provides standalone text utilities with no lifecycle dependencies. Brewcode is a task execution engine with infinite context and session handoff. Both install from the same `claude-brewcode` marketplace but operate independently.

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
`doc_type`) in every writing mode. Five carriers exist: JSON keys, `.md` frontmatter, a
`// brewcode-meta:` / `# brewcode-meta:` one-liner on line 2 of a byte-copied `.mjs`/`.sh`, a header
table in `team.md`, and `<!-- brewcode-meta: ... -->` on line 1 of a byte-copied `.md`. Versions
always come from `.claude-plugin/plugin.json`, never hardcoded.
`/brewcode:setup-status` reads these back across every setup skill installed here.

## Hooks

| Hook | Event | Purpose |
|------|-------|---------|
| `session-start.mjs` | SessionStart | Manager HARD-wall awareness -- injects guard tag plus the bounded-unit delegation brief (goal + scope + what is already done + who consumes the result + acceptance) into systemMessage and additionalContext |
| `manager-prompt.mjs` | UserPromptSubmit | Injects `++m` (manager, plan-aware) / `++a` (architecture-first) / `++rr` / `++r` codeword blocks |

## Documentation

Full docs: [doc-claude.brewcode.app/brewtools/overview](https://doc-claude.brewcode.app/brewtools/overview/)

| Resource | Link |
|----------|------|
| Text Optimize | [text-optimize](https://doc-claude.brewcode.app/brewtools/skills/text-optimize/) |
| Text Human | [text-human](https://doc-claude.brewcode.app/brewtools/skills/text-human/) |
| Secrets Scan | [secrets-scan](https://doc-claude.brewcode.app/brewtools/skills/secrets-scan/) |
| SSH | [ssh](https://doc-claude.brewcode.app/brewtools/skills/ssh/) |
| Deploy | [deploy](https://doc-claude.brewcode.app/brewtools/skills/deploy/) |
| Manager Setup | [manager-setup](https://doc-claude.brewcode.app/brewtools/skills/manager-setup/) |
| Plugin Update | [plugin-update](https://doc-claude.brewcode.app/brewtools/skills/plugin-update/) |
| Provider Switch | [provider-switch](https://doc-claude.brewcode.app/brewtools/skills/provider-switch/) |
| Think Short Setup | [think-short-setup](https://doc-claude.brewcode.app/brewtools/skills/think-short-setup/) |
| Agent Deadline Setup | [agent-deadline-setup](https://doc-claude.brewcode.app/brewtools/skills/agent-deadline-setup/) |
| Agent Router Setup | [agent-router-setup](https://doc-claude.brewcode.app/brewtools/skills/agent-router-setup/) |
| Task Board Setup | [task-board-setup](https://doc-claude.brewcode.app/brewtools/skills/task-board-setup/) |
| Setup Status (brewcode) | [setup-status](https://doc-claude.brewcode.app/brewcode/skills/setup-status/) |
| Text Optimizer (agent) | [text-optimizer](https://doc-claude.brewcode.app/brewtools/agents/text-optimizer/) |
| SSH Admin (agent) | [ssh-admin](https://doc-claude.brewcode.app/brewtools/agents/ssh-admin/) |
| Deploy Admin (agent) | [deploy-admin](https://doc-claude.brewcode.app/brewtools/agents/deploy-admin/) |
| Release Notes | [RELEASE-NOTES.md](../RELEASE-NOTES.md) |

Author: Maksim Kochetkov | License: MIT
