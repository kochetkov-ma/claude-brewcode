# Brewtools

> Claude Code utilities -- text optimization and humanization, secrets scanning, SSH and GitHub Actions deploy, manager hard wall, subagent deadline/return-size/routing guards, task board, context slimming, plugin updates, and alternative API providers.

| Field | Value |
|-------|-------|
| Version | 6.9.4 |
| Skills | 13 |
| Agents | 3 |
| Hooks | 1 |

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

Update anytime with `/brewtools:plugin-update`, or by hand:

```bash
claude plugin marketplace update claude-brewcode
claude plugin update brewtools@claude-brewcode
```

Dev mode, no install: `claude --plugin-dir ./brewtools`.

## Overview

Utilities for text, ops and subagent control: token-efficient text optimization, AI-artifact removal, secrets scanning, SSH management, GitHub Actions deployment with safety gates, plugin updates, and five opt-in `-setup` skills that install a mechanism into a project or profile. The utility skills work without setup.

## Quick Start

```bash
/brewtools:text-optimize CLAUDE.md              # auto-detect mode
/brewtools:text-optimize -x CLAUDE.md           # max mode, 2 verification rounds
/brewtools:text-human 3be67487                  # clean all files from a commit
/brewtools:text-human "humanize this blog post: <text>"
/brewtools:secrets-scan --fix                   # scan and fix interactively
/brewtools:context-slim                         # measure the permanent context surface
/brewtools:plugin-update check                  # status table only
```

`-setup` skills share one verb set:

```bash
/brewtools:manager-setup                        # no arguments = read-only status
/brewtools:manager-setup install                # install the HARD delegation wall
/brewtools:agent-deadline-setup install project 20   # 20-minute subagent budget
/brewtools:agent-return-setup install global 800 2000  # size budget on subagent returns
/brewtools:task-board-setup install ~/repos/api      # Kanban into another repo
/brewcode:setup-status                          # what is installed / stale / missing
```

## Skills

A `-setup` suffix marks a skill that installs a mechanism; recurring tools keep bare names. Setup skills share `status | install | upgrade | enable | disable | uninstall | purge`; manager, agent-deadline, agent-return and agent-router default to read-only `status`, task-board to `status` when deployed and `install` when absent. Run `upgrade` in projects with an existing setup: a plugin update does not reach copied files (`/brewtools:manager-setup upgrade` backfills `manager-state.mjs`, the wall's off-switch CLI). `text-optimize` and `text-human` are model-invocable; the rest run only when typed ([FAQ](https://doc-claude.brewcode.app/faq/#auto-invoke)).

| Skill | Purpose | Model |
|-------|---------|-------|
| [`text-optimize`](skills/text-optimize/README.md) | Optimize text for LLM token efficiency (`-l\|-s\|-d\|-x\|--max`) | sonnet |
| [`text-human`](skills/text-human/README.md) | Strip AI artifacts, fix unicode, fit register | sonnet |
| [`secrets-scan`](skills/secrets-scan/README.md) | Scan git-tracked files for leaked secrets (`--fix`) | sonnet |
| [`ssh`](skills/ssh/README.md) | SSH server management and configuration | opus |
| [`deploy`](skills/deploy/README.md) | GitHub Actions deployment with safety gates | opus |
| [`manager-setup`](skills/manager-setup/README.md) | Opt-in per-project hard delegation wall (`level strict\|balanced`); `status` also reports the task-tools key and legacy codeword override files | sonnet |
| [`plugin-update`](skills/plugin-update/README.md) | Check/install/update brewcode plugins (`check\|update\|all`) | sonnet |
| [`provider-switch`](skills/provider-switch/README.md) | Alternative API providers: DeepSeek, Z.ai/GLM, Qwen, MiniMax, OpenRouter | opus |
| [`agent-deadline-setup`](skills/agent-deadline-setup/README.md) | Soft wall-clock budget for subagents: warns at 80%, blocks non-finalizing tools at 100% | sonnet |
| [`agent-return-setup`](skills/agent-return-setup/README.md) | Size budget on every subagent return (`passTokens` 2500, `fileTokens` 6000, `chars/4`); blocks at most once | sonnet |
| [`agent-router-setup`](skills/agent-router-setup/README.md) | EXPERIMENTAL. PreToolUse hook that denies a generic subagent spawn in favor of the real expert (`level fast\|strict`) | sonnet |
| [`task-board-setup`](skills/task-board-setup/README.md) | File-based Kanban with methodology, task graph and session anti-drift timers | opus |
| [`context-slim`](skills/context-slim/README.md) | Compress the permanent LLM-context surface, lossless by default | opus |

Arguments for every command: [Brewtools overview](https://doc-claude.brewcode.app/brewtools/overview/#commands). The codewords `++m`, `++a`, `++rr`, `++r` and `+++` come from the [`brewmod-placeholders`](../brewmod-placeholders/README.md) mod, not this plugin. Task methodology and anti-drift: [Task Board Setup](https://doc-claude.brewcode.app/brewtools/skills/task-board-setup/).

## Agents

| Agent | Model | Purpose |
|-------|-------|---------|
| [text-optimizer](agents/text-optimizer.md) | sonnet | Optimizes text/docs for LLM token efficiency |
| [ssh-admin](agents/ssh-admin.md) | inherit | Linux server admin: SSH, Docker, systemd, Nginx, SSL |
| [deploy-admin](agents/deploy-admin.md) | inherit | GitHub Actions deployment: workflows, releases, GHCR, CI/CD |

Each agent stops and proposes a split when a task exceeds one bounded unit (one deliverable, ~5 files): [scope guard](https://doc-claude.brewcode.app/brewtools/agents/#scope-guard).

## Architecture

```
brewtools/
+-- .claude-plugin/plugin.json
+-- hooks/        # hooks.json, session-start.mjs, hardmode-guard.mjs (template), lib/
+-- skills/       # 13 skills, one directory each
+-- agents/       # text-optimizer, ssh-admin, deploy-admin
```

Brewtools provides text, ops and subagent-control utilities; [Brewcode](../brewcode/README.md) is the authoring toolkit. Both install from the same marketplace and operate independently.

## Hooks

| Hook | Event | Purpose |
|------|-------|---------|
| `session-start.mjs` | SessionStart | Manager HARD-wall awareness: when the wall is armed, a notice with the mechanism and the exit (`/brewtools:manager-setup disable`); silent otherwise |

Artifact metadata stamped by `-setup` skills: [Brewcode overview](https://doc-claude.brewcode.app/brewcode/overview/#artifact-metadata).

## Documentation

Full docs: [doc-claude.brewcode.app/brewtools/overview](https://doc-claude.brewcode.app/brewtools/overview/). Per-skill pages live at `https://doc-claude.brewcode.app/brewtools/skills/<skill>/` and per-agent pages at `https://doc-claude.brewcode.app/brewtools/agents/<agent>/` ([skills index](https://doc-claude.brewcode.app/brewtools/skills/), [agents index](https://doc-claude.brewcode.app/brewtools/agents/)). Dashboard: [setup-status](https://doc-claude.brewcode.app/brewcode/skills/setup-status/). Release notes: [RELEASE-NOTES.md](../RELEASE-NOTES.md).

## Claude Code mods

Optional add-ons from the same marketplace: [overview](https://doc-claude.brewcode.app/mods/overview/), [plan-effort](https://doc-claude.brewcode.app/mods/plan-effort/), [placeholders](https://doc-claude.brewcode.app/mods/placeholders/). `brewmod-placeholders` provides the prompt codewords `++m`, `++a`, `++rr`, `++r` and `+++` (Claude Code 2.1.292+).

```bash
claude plugin install brewmod-plan-effort@claude-brewcode
claude plugin install brewmod-placeholders@claude-brewcode
```

Author: Maksim Kochetkov | License: MIT
