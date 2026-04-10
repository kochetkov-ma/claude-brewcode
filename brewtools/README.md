# Brewtools

> Universal text utilities plugin for Claude Code -- token optimization, AI artifact removal, secrets scanning.

| Field | Value |
|-------|-------|
| Version | 3.4.29 |
| Skills | 3 |
| Agents | 1 |

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

Brewtools provides standalone text utilities: token-efficient optimization with 30+ validated rules, AI-artifact removal from code and docs, and security scanning for leaked credentials. Each skill is self-contained and requires no prior setup.

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
```

## Skills

| Skill | Purpose | Model | Arguments |
|-------|---------|-------|-----------|
| [`/brewtools:text-optimize`](skills/text-optimize/README.md) | Optimize text for LLM token efficiency | sonnet | `[-l\|-d] [file\|folder\|path1,path2]` |
| [`/brewtools:text-human`](skills/text-human/README.md) | Remove AI artifacts from code and docs | sonnet | `<commit-hash\|path> [custom instructions]` |
| [`/brewtools:secrets-scan`](skills/secrets-scan/README.md) | Scan for leaked secrets and credentials | sonnet | `[--fix]` |

## Agent

| Agent | Model | Purpose |
|-------|-------|---------|
| [text-optimizer](agents/text-optimizer.md) | sonnet | Lean execution engine for text optimization with rule-based validation |

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
+-- agents/
    +-- text-optimizer.md             # Text optimization agent
```

> **Brewtools vs Brewcode:** Brewtools provides standalone text utilities with no lifecycle dependencies. Brewcode is a task execution engine with infinite context and session handoff. Both install from the same `claude-brewcode` marketplace but operate independently.

## Documentation

Full docs: [doc-claude.brewcode.app/brewtools/overview](https://doc-claude.brewcode.app/brewtools/overview/)

| Resource | Link |
|----------|------|
| Text Optimize | [text-optimize](https://doc-claude.brewcode.app/brewtools/skills/text-optimize/) |
| Text Human | [text-human](https://doc-claude.brewcode.app/brewtools/skills/text-human/) |
| Secrets Scan | [secrets-scan](https://doc-claude.brewcode.app/brewtools/skills/secrets-scan/) |
| Release Notes | [RELEASE-NOTES.md](../RELEASE-NOTES.md) |

Author: Maksim Kochetkov | License: MIT
