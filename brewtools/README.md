# Brewtools

> Universal text utilities plugin for Claude Code -- token optimization, AI artifact removal, secrets scanning, SSH management, GitHub Actions deployment, and plugin updates.

| Field | Value |
|-------|-------|
| Version | 6.3.0 |
| Skills | 13 |
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

**v6 hardening.** The HARD delegation wall (`manager-setup`) moved from a denylist to a strict per-binary allowlist that fails closed on any unrecognized flag, and closed four further bypasses: `git diff --output=`, `git branch -D`, `gh issue comment --body`, `find -fprint0`. Ordinary subagents cannot use `AskUserQuestion`; destructive or privileged steps return a `## APPROVAL REQUIRED` envelope to the caller instead. Conversation forks retain the parent tool pool. `ssh-admin` no longer places secrets on `curl` argv.

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
/brewtools:context-slim                         # Measure token weight of the permanent context surface
/brewtools:plugin-update                        # Interactive check + update
/brewtools:plugin-update check                  # Status table only
```

Setup skills all speak the same verbs:

```bash
/brewtools:manager-setup                        # No arguments = read-only status, even when absent
/brewtools:manager-setup install                # Install the HARD delegation wall into this project
/brewtools:manager-setup disable                # Disarm it, keep the files
/brewtools:agent-deadline-setup install project 20   # 20-minute subagent budget
/brewtools:agent-return-setup install global 800 2000  # size budget on subagent returns
/brewtools:task-board-setup install ~/repos/api      # Kanban into another repo
/brewcode:setup-status                          # What is installed / stale / missing, everywhere
```

## Skills

> **Naming rule.** A `-setup` suffix marks a skill that *installs a mechanism* -- after running it you use the installed hooks, guard or generated skill, not the setup skill itself. Recurring tools you invoke every time (`text-optimize`, `secrets-scan`, `ssh`, ...) keep bare names.

> **Canonical modes.** Setup skills share `status | install | upgrade | enable | disable | uninstall | purge`; their no-argument defaults differ. Manager, agent-deadline, agent-return and agent-router default to read-only `status`, even when absent. Task-board defaults to `status` when deployed and `install` when absent. Use explicit `install` to request setup; scope, level, minutes and path follow each skill's prompt contract.

> **Run `upgrade` in projects with an existing setup.** A `-setup` skill copies files INTO the project; a plugin update does not reach those copies.
> - `/brewtools:manager-setup upgrade` — backfills `manager-state.mjs` (the wall's off-switch CLI) into projects installed before it existed. Without it the documented disarm command has no script to run.

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
| [`/brewtools:agent-deadline-setup`](skills/agent-deadline-setup/README.md) | Install/remove a soft wall-clock budget for subagents: 80% -- non-blocking "wrap up" warning, 100% -- deny all tools except the finalization set; project or global, opt-in | sonnet | `[status\|install\|upgrade\|enable\|disable\|uninstall\|purge] [project\|global] [minutes] \| free-text intent` |
| [`/brewtools:agent-return-setup`](skills/agent-return-setup/README.md) | Install/remove a size budget on every subagent's final return message: a SubagentStart hook injects the contract, a SubagentStop hook sizes the return (`chars/4`) and blocks at most once -- above `passTokens` (default 1000) it orders a compress, above `fileTokens` (default 2500) a write-to-file plus the path. No LLM judge; project or global, opt-in | sonnet | `[status\|install\|upgrade\|enable\|disable\|uninstall\|purge] [project\|global] [pass] [file] \| free-text intent` |
| [`/brewtools:agent-router-setup`](skills/agent-router-setup/README.md) | EXPERIMENTAL. Install/remove a PreToolUse hook that denies a generic subagent spawn in favor of the real project/plugin expert, or nudges when the fit is only uncertain; tier 1 free and deterministic, tier 2 opt-in LLM judge not yet behaviorally verified; project scope only | sonnet | `[status\|install\|upgrade\|enable\|disable\|uninstall\|purge] [level fast\|strict] \| free-text intent` |
| [`/brewtools:task-board-setup`](skills/task-board-setup/README.md) | Deploy a file-based Kanban with shared domain/task methodology, a derived task graph and unique session anti-drift timers; optional spec + design layer (`task-spec`), existing-board upgrade and CLAUDE.md optimization | opus | `[prompt] [status\|install\|upgrade\|enable\|disable\|uninstall\|purge] [target repo path \| empty = cwd] [free-text directive]` |
| [`/brewtools:context-slim`](skills/context-slim/README.md) | Compresses the permanent LLM-context surface (CLAUDE.md, rules, agent descriptions, hooks, memory) via cross-layer dedup, default-knowledge removal and per-file compression, lossless by default | opus | `[prompt] [measure\|preview\|slim\|hard\|bodies\|restore] [--target=N%] [--global] [--memory] [--noask] [ts]` |

## Task methodology and anti-drift

Task-board setup writes shared domain methodology for review and reliable tests. Each task adds its goal, acceptance evidence, review/test strategy and bounded base work units. Queued tasks have prepared methodology and a complete task-specific cron prompt; the main session's `/task-board` creates the timer when a top-level task becomes active.

Each active top-level task gets a unique hourly session anti-drift cron. The user can select another cadence or opt out. Task-board announces the confirmed schedule and session limits; unavailable scheduling tools are reported. Each delivered tick rereads methodology, anti-drift rules and the goal, collects active-agent updates, reconciles statuses and dependencies, and rebuilds the graph with all unfinished entries plus the latest 10 completed entries. Older completion evidence remains in task records. The report uses at most five short lines: local time/timezone, tick number and elapsed time; achievements; remaining work and next action; blockers or questions when present; drift verdict. Completion, cancellation or parking stops the timer and verifies removal.

Bare `+++` adds these steps to a plan only in Plan mode. File changes and timer creation wait until execution. Timers depend on the active session and runtime limits. See [Task Board Setup](https://doc-claude.brewcode.app/brewtools/skills/task-board-setup/) and [Manager Setup](https://doc-claude.brewcode.app/brewtools/skills/manager-setup/).

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
|   +-- manager-prompt.mjs           # ++m / ++a / ++rr / ++r; +++ only in Plan mode
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
|   +-- agent-deadline-setup/          # Subagent soft wall-clock budget hooks install/remove
|   +-- agent-return-setup/            # Size budget on subagent return messages (SubagentStart + SubagentStop)
|   +-- agent-router-setup/            # EXPERIMENTAL: route generic subagent spawns to the real expert
|   +-- manager-setup/                 # Codeword-triggered Manager mode + HARD delegation wall
|   +-- task-board-setup/              # Kanban, methodology, task graph and session anti-drift
|   +-- context-slim/                  # Permanent-context compression
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
| `manager-prompt.mjs` | UserPromptSubmit | Injects `++m` (manager, plan-aware), `++a` (architecture-first), `++rr` / `++r` review blocks; bare `+++` adds anti-drift cron planning only in Plan mode |

## Regression suites

Run each suite from the repository root. Its output gives the current pass/fail totals.

| Skill | Command |
|-------|--------|
| [agent-return-setup](skills/agent-return-setup/README.md) | `bash brewtools/skills/agent-return-setup/tests/run.sh` |
| [agent-deadline-setup](skills/agent-deadline-setup/README.md) | `bash brewtools/skills/agent-deadline-setup/tests/run.sh` |
| [agent-router-setup](skills/agent-router-setup/README.md) | `bash brewtools/skills/agent-router-setup/tests/run.sh` |
| [deploy](skills/deploy/README.md) | `bash brewtools/skills/deploy/tests/run.sh` |
| [ssh](skills/ssh/README.md) | `bash brewtools/skills/ssh/tests/run.sh` |
| [secrets-scan](skills/secrets-scan/README.md) | `bash brewtools/skills/secrets-scan/tests/run.sh` |
| [text-optimize](skills/text-optimize/README.md) | `bash brewtools/skills/text-optimize/tests/run.sh` |
| [manager-setup](skills/manager-setup/README.md) | `node brewtools/skills/manager-setup/tests/suite.mjs` |

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
| Agent Deadline Setup | [agent-deadline-setup](https://doc-claude.brewcode.app/brewtools/skills/agent-deadline-setup/) |
| Agent Return Setup | [agent-return-setup](https://doc-claude.brewcode.app/brewtools/skills/agent-return-setup/) |
| Agent Router Setup | [agent-router-setup](https://doc-claude.brewcode.app/brewtools/skills/agent-router-setup/) |
| Task Board Setup | [task-board-setup](https://doc-claude.brewcode.app/brewtools/skills/task-board-setup/) |
| Context Slim | [context-slim](https://doc-claude.brewcode.app/brewtools/skills/context-slim/) |
| Setup Status (brewcode) | [setup-status](https://doc-claude.brewcode.app/brewcode/skills/setup-status/) |
| Text Optimizer (agent) | [text-optimizer](https://doc-claude.brewcode.app/brewtools/agents/text-optimizer/) |
| SSH Admin (agent) | [ssh-admin](https://doc-claude.brewcode.app/brewtools/agents/ssh-admin/) |
| Deploy Admin (agent) | [deploy-admin](https://doc-claude.brewcode.app/brewtools/agents/deploy-admin/) |
| Release Notes | [RELEASE-NOTES.md](../RELEASE-NOTES.md) |

Author: Maksim Kochetkov | License: MIT
