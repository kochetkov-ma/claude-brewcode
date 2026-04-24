# Brewtools

> Universal text utilities plugin for Claude Code -- token optimization, AI artifact removal, secrets scanning, SSH management, GitHub Actions deployment, evidence-based debate, and plugin updates.

| Field | Value |
|-------|-------|
| Version | 3.6.0 |
| Skills | 11 |
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

Brewtools provides standalone utilities: token-efficient optimization with 30+ validated rules, AI-artifact removal from code and docs, security scanning for leaked credentials, SSH server management, GitHub Actions deployment with safety gates, evidence-based multi-agent debate, and plugin check/install/update. Each skill is self-contained and requires no prior setup.

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
/brewtools:text-human 3be67487                  # Remove AI artifacts from a commit
/brewtools:text-human src/main/java/services/   # Process an entire folder
/brewtools:secrets-scan                         # Scan for leaked credentials
/brewtools:secrets-scan --fix                   # Scan and fix interactively
/brewtools:plugin-update                        # Interactive check + update
/brewtools:plugin-update check                  # Status table only
```

## Skills

| Skill | Purpose | Model | Arguments |
|-------|---------|-------|-----------|
| [`/brewtools:text-optimize`](skills/text-optimize/README.md) | Optimize text for LLM token efficiency | sonnet | `[-l\|-d] [file\|folder\|path1,path2]` |
| [`/brewtools:text-human`](skills/text-human/README.md) | Remove AI artifacts from code and docs | sonnet | `<commit-hash\|path> [custom instructions]` |
| [`/brewtools:secrets-scan`](skills/secrets-scan/README.md) | Scan for leaked secrets and credentials | sonnet | `[--fix]` |
| [`/brewtools:ssh`](skills/ssh/SKILL.md) | SSH server management and configuration | opus | `[connect\|deploy\|configure\|...]` |
| [`/brewtools:deploy`](skills/deploy/SKILL.md) | GitHub Actions deployment with safety gates | opus | `[release\|workflow\|...]` |
| [`/brewtools:debate`](skills/debate/README.md) | Evidence-based multi-agent debate | sonnet | `[challenge\|strategy\|critic]` |
| [`/brewtools:plugin-update`](skills/plugin-update/README.md) | Check/install/update brewcode plugins | sonnet | `[check\|update\|all]` |
| [`/brewtools:provider-switch`](skills/provider-switch/README.md) | Configure alternative API providers (DeepSeek V4 [priority], Z.ai/GLM, Qwen, MiniMax, OpenRouter) | opus | `[status\|setup\|help\|<provider>]` |
| [`/brewtools:skill-toggle`](skills/skill-toggle/README.md) | Disable/enable individual plugin skills (survives plugin updates) | sonnet | `<op> [plugin:name] [--scope=global\|project]` |
| [`/brewtools:agent-toggle`](skills/agent-toggle/README.md) | Disable/enable individual plugin agents (survives plugin updates) | sonnet | `<op> [plugin:name] [--scope=global\|project]` |
| [`/brewtools:think-short`](skills/think-short/README.md) | Toggle terse-output mode — cut preamble/filler via SessionStart + PreToolUse:Task injection | sonnet | `[on\|off\|profile <light\|medium\|aggressive>\|status\|blacklist add\|remove <agent>]` |

## Agents

| Agent | Model | Purpose |
|-------|-------|---------|
| [text-optimizer](agents/text-optimizer.md) | sonnet | Lean execution engine for text optimization with rule-based validation |
| [ssh-admin](agents/ssh-admin.md) | opus | Linux server administration -- SSH, Docker, firewalls, VPN, systemd, Caddy/Nginx |
| [deploy-admin](agents/deploy-admin.md) | opus | GitHub Actions, releases, GHCR, CI/CD, semver, deployment tracking |

## Architecture

```
brewtools/
+-- .claude-plugin/plugin.json        # Plugin manifest
+-- hooks/
|   +-- hooks.json                    # Hook registry
|   +-- session-start.mjs            # BT_PLUGIN_ROOT injection
|   +-- pre-task.mjs                  # BT_PLUGIN_ROOT into subagents
|   +-- lib/utils.mjs                 # I/O utilities
+-- skills/
|   +-- text-optimize/                # Token optimization
|   +-- text-human/                   # AI artifact removal
|   +-- secrets-scan/                 # Secrets scanning
|   +-- ssh/                          # SSH server management
|   +-- deploy/                       # GitHub Actions deployment
|   +-- debate/                       # Evidence-based multi-agent debate
|   +-- plugin-update/                # Plugin check / install / update
|   +-- provider-switch/               # Alternative API provider management
|   +-- skill-toggle/                  # Disable/enable individual plugin skills
|   +-- agent-toggle/                  # Disable/enable individual plugin agents
|   +-- think-short/                   # Terse-output mode toggle
+-- agents/
    +-- text-optimizer.md             # Text optimization agent
    +-- ssh-admin.md                  # SSH and server administration
    +-- deploy-admin.md               # Deployment and CI/CD
```

> **Brewtools vs Brewcode:** Brewtools provides standalone text utilities with no lifecycle dependencies. Brewcode is a task execution engine with infinite context and session handoff. Both install from the same `claude-brewcode` marketplace but operate independently.

## Hooks

| Hook | Event | Purpose |
|------|-------|---------|
| `session-start.mjs` | SessionStart | Inject `BT_PLUGIN_ROOT` into session context |
| `reapply-disables.mjs` | SessionStart | Re-apply disabled skills/agents after plugin update |
| `pre-task.mjs` | PreToolUse: Task\|Agent | Inject `BT_PLUGIN_ROOT` into subagent prompts |

## Documentation

Full docs: [doc-claude.brewcode.app/brewtools/overview](https://doc-claude.brewcode.app/brewtools/overview/)

| Resource | Link |
|----------|------|
| Text Optimize | [text-optimize](https://doc-claude.brewcode.app/brewtools/skills/text-optimize/) |
| Text Human | [text-human](https://doc-claude.brewcode.app/brewtools/skills/text-human/) |
| Secrets Scan | [secrets-scan](https://doc-claude.brewcode.app/brewtools/skills/secrets-scan/) |
| SSH | [ssh](https://doc-claude.brewcode.app/brewtools/skills/ssh/) |
| Deploy | [deploy](https://doc-claude.brewcode.app/brewtools/skills/deploy/) |
| Debate | [debate](https://doc-claude.brewcode.app/brewtools/skills/debate/) |
| Plugin Update | [plugin-update](https://doc-claude.brewcode.app/brewtools/skills/plugin-update/) |
| Provider Switch | [provider-switch](https://doc-claude.brewcode.app/brewtools/skills/provider-switch/) |
| Skill Toggle | [skill-toggle](https://doc-claude.brewcode.app/brewtools/skills/skill-toggle/) |
| Agent Toggle | [agent-toggle](https://doc-claude.brewcode.app/brewtools/skills/agent-toggle/) |
| Think Short | [think-short](https://doc-claude.brewcode.app/brewtools/skills/think-short/) |
| Release Notes | [RELEASE-NOTES.md](../RELEASE-NOTES.md) |

Author: Maksim Kochetkov | License: MIT
