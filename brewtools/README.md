# Brewtools

> Universal text utilities plugin for Claude Code -- token optimization, AI artifact removal, secrets scanning, SSH management, GitHub Actions deployment, and plugin updates.

| Field | Value |
|-------|-------|
| Version | 4.2.4 |
| Skills | 10 |
| Agents | 3 |

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

## Skills

| Skill | Purpose | Model | Arguments |
|-------|---------|-------|-----------|
| [`/brewtools:text-optimize`](skills/text-optimize/README.md) | Optimize text for LLM token efficiency | sonnet | `[-l\|-s\|-d\|-x] [file\|folder\|path1,path2]` |
| [`/brewtools:text-human`](skills/text-human/README.md) | Humanizes code, docs, articles, reddit/chat, javadoc -- strips AI artifacts, fixes unicode, fits register | sonnet | `[path\|commit\|folder\|text] [custom instructions]` |
| [`/brewtools:secrets-scan`](skills/secrets-scan/README.md) | Scan for leaked secrets and credentials | sonnet | `[--fix]` |
| [`/brewtools:ssh`](skills/ssh/SKILL.md) | SSH server management and configuration | opus | `[connect\|deploy\|configure\|...]` |
| [`/brewtools:deploy`](skills/deploy/SKILL.md) | GitHub Actions deployment with safety gates | opus | `[release\|workflow\|...]` |
| [`/brewtools:manager`](skills/manager/README.md) | Manager mode: installs a hard delegation wall into this project -- on, off, uninstall, status, level, edit, reset -- and explains/customizes codewords `++m` (delegate-everything, plan-aware), `++a` (architecture-first), `++rr` (anti-regression review), `++r` (two-phase double-check). Codewords are hook-driven and always fire; the wall is opt-in, per-project, and blocks main-session writes while subagents stay free | sonnet | `[on\|off\|uninstall\|status\|level <strict\|balanced>\|edit\|reset] \| <task в хард режиме> \| <task от роли менеджера> \| <prompt>` |
| [`/brewtools:plugin-update`](skills/plugin-update/README.md) | Check/install/update brewcode plugins | sonnet | `[check\|update\|all]` |
| [`/brewtools:provider-switch`](skills/provider-switch/README.md) | Configure alt API providers: DeepSeek, Z.ai/GLM, Qwen, MiniMax, OpenRouter | opus | `[status\|setup\|verify\|model-check\|help\|<provider-name>]` -- no args = interactive status check |
| [`/brewtools:think-short`](skills/think-short/README.md) | Install/remove terse-mode hooks (SessionStart + every-10th UserPromptSubmit + subagent Task) that inject brevity directives; project or global | sonnet | `[<free-text prompt>] [Project\|Global]` |
| [`/brewtools:agent-deadline`](skills/agent-deadline/SKILL.md) | Install/remove a soft wall-clock budget for subagents: 80% -- non-blocking "wrap up" warning, 100% -- deny all tools except the finalization set; project or global, opt-in | sonnet | `[status\|install\|disable\|enable\|uninstall\|purge] [project\|global] [minutes] \| free-text intent` |
| [`/brewtools:task-board-init`](skills/task-board-init/README.md) | Generator: deploys a file-based Kanban into any repo via multi-agent analysis, plus an optional gated CLAUDE.md-optimization pass | opus | `[target repo path \| empty = cwd] [free-text directive, e.g. 'also dedupe rules', 'skip module split']` |

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
|   +-- lib/utils.mjs                 # I/O utilities
+-- skills/
|   +-- text-optimize/                # Token optimization
|   +-- text-human/                   # AI artifact removal
|   +-- secrets-scan/                 # Secrets scanning
|   +-- ssh/                          # SSH server management
|   +-- deploy/                       # GitHub Actions deployment
|   +-- plugin-update/                # Plugin check / install / update
|   +-- provider-switch/               # Alternative API provider management
|   +-- think-short/                   # Terse-mode hooks install/remove
|   +-- agent-deadline/                # Subagent soft wall-clock budget hooks install/remove
|   +-- manager/                       # Codeword-triggered Manager mode + HARD delegation wall
|   +-- task-board-init/                # File-based Kanban generator (multi-agent)
+-- agents/
    +-- text-optimizer.md             # Text optimization agent
    +-- ssh-admin.md                  # SSH and server administration
    +-- deploy-admin.md               # Deployment and CI/CD
```

> **Brewtools vs Brewcode:** Brewtools provides standalone text utilities with no lifecycle dependencies. Brewcode is a task execution engine with infinite context and session handoff. Both install from the same `claude-brewcode` marketplace but operate independently.

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
| Manager | [manager](https://doc-claude.brewcode.app/brewtools/skills/manager/) |
| Plugin Update | [plugin-update](https://doc-claude.brewcode.app/brewtools/skills/plugin-update/) |
| Provider Switch | [provider-switch](https://doc-claude.brewcode.app/brewtools/skills/provider-switch/) |
| Think Short | [think-short](https://doc-claude.brewcode.app/brewtools/skills/think-short/) |
| Agent Deadline | [agent-deadline](https://doc-claude.brewcode.app/brewtools/skills/agent-deadline/) |
| Text Optimizer (agent) | [text-optimizer](https://doc-claude.brewcode.app/brewtools/agents/text-optimizer/) |
| SSH Admin (agent) | [ssh-admin](https://doc-claude.brewcode.app/brewtools/agents/ssh-admin/) |
| Deploy Admin (agent) | [deploy-admin](https://doc-claude.brewcode.app/brewtools/agents/deploy-admin/) |
| Release Notes | [RELEASE-NOTES.md](../RELEASE-NOTES.md) |

Author: Maksim Kochetkov | License: MIT
