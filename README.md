# claude-brewcode

[![macOS](https://img.shields.io/badge/macOS-support-000000?logo=apple&logoColor=white)](https://www.apple.com/macos/)
[![Claude](https://img.shields.io/badge/Claude-Anthropic-orange?logo=anthropic&logoColor=white)](https://claude.ai)
[![Claude Code](https://img.shields.io/badge/Claude_Code-Plugin-blueviolet?logo=anthropic&logoColor=white)](https://code.claude.com)

[![Release](https://github.com/kochetkov-ma/claude-brewcode/actions/workflows/release.yml/badge.svg)](https://github.com/kochetkov-ma/claude-brewcode/actions/workflows/release.yml)
[![Latest Release](https://img.shields.io/github/v/release/kochetkov-ma/claude-brewcode?label=latest&color=blue)](https://github.com/kochetkov-ma/claude-brewcode/releases/latest)
[![Documentation](https://img.shields.io/badge/Docs-doc--claude.brewcode.app-4A90D9?logo=bookstack&logoColor=white)](https://doc-claude.brewcode.app/getting-started/)

**Claude Code plugin suite** -- four plugins for development, documentation, text utility, and visual workflows.

A regular Claude Code session loses context during compaction. Brewcode automatically saves knowledge, passes state between compaction cycles, and continues work without restarting. Four plugins. 25 skills. 14 agents. 9 lifecycle hooks.

[**Full Documentation**](https://doc-claude.brewcode.app/getting-started/)

> **Security:** Code is scanned on every commit. No personal data is collected or transmitted.
>
> [![Gitleaks](https://github.com/kochetkov-ma/claude-brewcode/actions/workflows/gitleaks.yml/badge.svg)](https://github.com/kochetkov-ma/claude-brewcode/actions/workflows/gitleaks.yml?query=branch%3Amain)
> [![CodeQL](https://github.com/kochetkov-ma/claude-brewcode/actions/workflows/codeql.yml/badge.svg)](https://github.com/kochetkov-ma/claude-brewcode/actions/workflows/codeql.yml?query=branch%3Amain)
> [![Semgrep](https://github.com/kochetkov-ma/claude-brewcode/actions/workflows/semgrep.yml/badge.svg)](https://github.com/kochetkov-ma/claude-brewcode/actions/workflows/semgrep.yml?query=branch%3Amain)

## 🚀 Install in 30 seconds

Paste this prompt into any Claude Code session -- Claude will run the full install for you:

```
Execute these commands in this Claude Code session, one by one, show full output for each, do not skip any, do not summarize:

1. claude plugin marketplace add https://github.com/kochetkov-ma/claude-brewcode
2. claude plugin install brewcode@claude-brewcode
3. claude plugin install brewdoc@claude-brewcode
4. claude plugin install brewtools@claude-brewcode
5. claude plugin install brewui@claude-brewcode

After all commands succeed, run `/reload-plugins`. If `/reload-plugins` is unavailable, tell me to type `exit` and run `claude` again. Run the commands now.
```

Already installed? Update with this prompt:

```
Execute these commands in this Claude Code session, one by one, show full output for each, do not skip any, do not summarize:

1. claude plugin marketplace update claude-brewcode
2. claude plugin update brewcode@claude-brewcode
3. claude plugin update brewdoc@claude-brewcode
4. claude plugin update brewtools@claude-brewcode
5. claude plugin update brewui@claude-brewcode

After all commands succeed, run `/reload-plugins`. If `/reload-plugins` is unavailable, tell me to type `exit` and run `claude` again. Run the commands now.
```

> After install/update, run `/reload-plugins` (or `exit` + `claude` to restart). For manual install steps see [Installation](#installation) below.

## Plugin Suite

| Plugin | Purpose | Skills | Install |
|--------|---------|--------|---------|
| [brewcode](brewcode/README.md) | Infinite task execution, quorum reviews, skill/agent creation, semantic search | 9 | `claude plugin install brewcode@claude-brewcode` |
| [brewdoc](brewdoc/README.md) | Documentation tools: auto-sync, memory optimization, PDF conversion, publishing | 6 | `claude plugin install brewdoc@claude-brewcode` |
| [brewtools](brewtools/README.md) | Universal text utilities: token optimization, humanization, secrets scanning, plugin updates | 10 | `claude plugin install brewtools@claude-brewcode` |
| [brewui](brewui/README.md) | UI/visual/creative tools (placeholder, currently empty) | 0 | `claude plugin install brewui@claude-brewcode` |

## Installation

### Marketplace (recommended)

Permanent installation through the Claude Code plugin system. Plugins load automatically with every session.

1. **Add marketplace** -- registers the plugin source:

```bash
claude plugin marketplace add https://github.com/kochetkov-ma/claude-brewcode
```

2. **Install plugins** -- copies plugins to local cache:

```bash
claude plugin install brewcode@claude-brewcode
claude plugin install brewdoc@claude-brewcode
claude plugin install brewtools@claude-brewcode
claude plugin install brewui@claude-brewcode
```

3. **Reload plugins** -- run `/reload-plugins` in Claude Code, or `exit` + `claude` to restart.

### Already installed? Update

Use `/brewtools:plugin-update` inside Claude Code for the easiest path -- it runs all update commands and reloads automatically.

Or run manually:

```bash
claude plugin marketplace update claude-brewcode
claude plugin update brewcode@claude-brewcode
claude plugin update brewdoc@claude-brewcode
claude plugin update brewtools@claude-brewcode
claude plugin update brewui@claude-brewcode
```

After updating, run `/reload-plugins` (preferred) or `exit` + `claude` to restart.

### Local directory (for development)

```bash
claude --plugin-dir ./brewcode --plugin-dir ./brewdoc --plugin-dir ./brewtools --plugin-dir ./brewui
```

### Requirements

| Component | Version | Purpose |
|-----------|---------|---------|
| Claude Code CLI | latest | Plugin runtime |
| Node.js | 20+ | Hook runtime |
| macOS | 13+ | Supported OS |

> **macOS only.** Linux and Windows support is planned for future releases.

## Quick Start

### brewcode -- infinite task execution

```bash
/brewcode:setup                              # 1. Analyze project, generate templates (one-time)
/brewcode:spec "Implement JWT authorization"  # 2. Research codebase + create specification
/brewcode:plan                                # 3. Generate phased execution plan
/brewcode:start                               # 4. Execute with infinite context handoff
```

After `/brewcode:setup`, each task follows the cycle: `spec` -> `plan` -> `start`. During execution, the plugin automatically compacts knowledge at ~90% context, writes handoff state, and continues without interruption.

### brewdoc -- documentation tools

```bash
/brewdoc:auto-sync                    # Sync all project docs with codebase
/brewdoc:my-claude                    # Generate Claude Code installation docs
/brewdoc:memory                       # Optimize memory files interactively
/brewdoc:md-to-pdf ./docs/report.md   # Convert markdown to PDF
/brewdoc:publish "Hello world"        # Publish to brewpage.app -- returns public URL
/brewdoc:guide                        # Interactive tutorial for the plugin suite
```

### brewtools -- text utilities

```bash
/brewtools:text-optimize CLAUDE.md         # Token-efficient optimization (30+ rules)
/brewtools:text-human 3be67487             # Remove AI artifacts from a commit
/brewtools:secrets-scan                    # Scan for leaked credentials
/brewtools:plugin-update                   # Install or update the plugin suite
```

### brewui -- visual tools

Placeholder plugin, currently empty. No commands yet -- coming soon.

## How It Works

```
  /brewcode:spec --> 5-10 research agents + user Q&A (*) --> SPEC.md
                                                                │
  /brewcode:plan <──────────────────────────────────────────────┘
        │
        └──> phased plan + user Q&A (*) ──────────────────> PLAN.md
                                            (*) skip with -n/--noask
                                                                │
  /brewcode:start <─────────────────────────────────────────────┘
        │
        v
  ┌─ Execute phases with agents ──────────────────────────────────┐
  │   Phase 1 --> Phase 2 --> ... --> Phase N                      │
  │       │  (context ~90%)                                        │
  │   PreCompact: compact KNOWLEDGE + write handoff                │
  │       │                                                        │
  │   [auto-compact] --> same session resumes --> next phase        │
  └────────────────────────────────────────────────────────────────┘
```

### Knowledge lifecycle

1. Agents accumulate knowledge entries during execution (KNOWLEDGE.jsonl)
2. PreCompact hook compacts and deduplicates before context handoff
3. Pre-task hook injects knowledge into every agent prompt
4. Knowledge accumulates across phases, converted to permanent rules at task end

## Skills Reference

### Brewcode (9 skills)

| Skill | Purpose |
|-------|---------|
| `/brewcode:setup` | Analyze project, check prerequisites, generate adapted templates |
| `/brewcode:spec` | Research codebase + user dialog -> SPEC.md |
| `/brewcode:plan` | Generate phased PLAN.md from SPEC or Plan Mode |
| `/brewcode:start` | Execute task with infinite context handoff |
| `/brewcode:teams` | Create and manage dynamic teams of domain-specific agents |
| `/brewcode:standards-review` | Review code for project standards compliance |
| `/brewcode:convention` | Extract etalon classes, patterns, architecture into convention docs |
| `/brewcode:rules` | Prompt-driven rules management: status, create, improve, review |
| `/brewcode:grepai` | Semantic code search (setup, status, start, stop, reindex) |
| `/brewcode:skills` | Prompt-driven skill management: status, create, improve, review |
| `/brewcode:agents` | Prompt-driven agent management: status, create, improve, review |
| `/brewcode:e2e` | E2E testing orchestration with BDD scenarios |
| `/brewcode:teardown` | Remove plugin configuration (keeps task data) |

### Brewdoc (6 skills)

| Skill | Purpose |
|-------|---------|
| `/brewdoc:auto-sync` | Universal document sync with codebase |
| `/brewdoc:my-claude` | Generate Claude Code installation docs |
| `/brewdoc:memory` | Optimize memory files interactively |
| `/brewdoc:md-to-pdf` | Convert markdown to professional PDF |
| `/brewdoc:publish` | Publish to brewpage.app -- returns public URL |
| `/brewdoc:guide` | Interactive tutorial for the plugin suite |

### Brewtools (10 skills)

| Skill | Purpose |
|-------|---------|
| `/brewtools:text-optimize` | LLM token efficiency optimization (30+ rules) |
| `/brewtools:text-human` | Remove AI artifacts, humanize code |
| `/brewtools:think-short` | Install/remove terse-mode hooks (SessionStart + every-10th UserPromptSubmit + subagent Task) that inject brevity directives; project or global |
| `/brewtools:secrets-scan` | Scan git-tracked files for leaked secrets |
| `/brewtools:ssh` | SSH server management -- connect, configure, deploy |
| `/brewtools:deploy` | GitHub Actions deployment -- workflows, releases, GHCR, CI/CD |
| `/brewtools:plugin-update` | Install and update the full plugin suite |
| `/brewtools:provider-switch` | Configure alternative API providers (DeepSeek, Z.ai/GLM, Qwen, MiniMax, OpenRouter) |
| `/brewtools:manager` | Manager mode -- codeword ++m injects a delegate-everything prompt (plan-aware); HARD wall (on/off/uninstall) installs a project PreToolUse guard that blocks main-session edits, forcing delegation |
| `/brewtools:task-board-init` | Deploy a file-based Kanban into ANY repo via multi-agent analysis -- task-tracker agent, task-board skill, tasks rule, .claude/features |

### Brewui (0 skills)

No skills yet -- placeholder for future UI/visual/creative tools.

### Portable skills (standalone)

Self-contained `SKILL.md` folders that ship outside the four plugins -- drop them into any compatible agent runtime. Both publish content to [brewpage.app](https://brewpage.app) (text, markdown, files, multi-file sites) and return a public URL.

| Skill | Runtime | Path |
|-------|---------|------|
| `brewpage-publish` | Claude Code | [`skills/brewpage-publish`](skills/brewpage-publish/) |
| `brewpage-publish` | OpenClaw / AgentSkills | [`openclaw/brewpage-publish`](openclaw/brewpage-publish/) |

## Agents (16 total)

| Agent | Model | Purpose |
|-------|-------|---------|
| developer | opus | Implement features, write code, fix bugs |
| tester | sonnet | Run tests, analyze failures, debug flaky tests |
| reviewer | opus | Code review, architecture, security, performance |
| architect | opus | Architecture analysis, patterns, trade-offs, scaling |
| skill-creator | opus | Create and improve Claude Code skills |
| agent-creator | opus | Create and improve Claude Code agents |
| hook-creator | opus | Create and debug Claude Code hooks |
| bash-expert | opus | Create professional shell scripts |
| text-optimizer | sonnet | Optimize text and docs for LLM efficiency |
| ssh-admin | opus | Linux server administration via SSH |
| deploy-admin | opus | GitHub Actions deployment and CI/CD |
| bc-coordinator | haiku | Internal: spawned by /brewcode:start + post-task hook |
| bc-knowledge-manager | haiku | Internal: spawned by /brewcode:start |
| bc-grepai-configurator | opus | Internal: spawned by /brewcode:grepai |
| bd-auto-sync-processor | sonnet | Internal: spawned by /brewdoc:auto-sync |
| bc-rules-organizer | sonnet | Internal: spawned by /brewcode:rules |

## Documentation

| Resource | Link |
|----------|------|
| Full documentation | [doc-claude.brewcode.app](https://doc-claude.brewcode.app/getting-started/) |
| Quick Start guide | [Quickstart](https://doc-claude.brewcode.app/quickstart/) |
| Brewcode overview | [Brewcode](https://doc-claude.brewcode.app/brewcode/overview/) |
| Brewdoc overview | [Brewdoc](https://doc-claude.brewcode.app/brewdoc/overview/) |
| Brewtools overview | [Brewtools](https://doc-claude.brewcode.app/brewtools/overview/) |
| Brewui overview | [Brewui](https://doc-claude.brewcode.app/brewui/overview/) |
| Release Notes | [RELEASE-NOTES.md](RELEASE-NOTES.md) |

## Development

```bash
CLAUDE_DEBUG=1 claude --plugin-dir ./brewcode   # Debug mode
bash .claude/scripts/update-plugin.sh           # Update all plugins
bash .claude/scripts/bump-version.sh X.Y.Z      # Bump version everywhere
```

## License

MIT -- see [LICENSE](LICENSE)
