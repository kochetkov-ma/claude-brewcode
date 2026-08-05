# claude-brewcode

[![macOS](https://img.shields.io/badge/macOS-support-000000?logo=apple&logoColor=white)](https://www.apple.com/macos/)
[![Claude](https://img.shields.io/badge/Claude-Anthropic-orange?logo=anthropic&logoColor=white)](https://claude.ai)
[![Claude Code](https://img.shields.io/badge/Claude_Code-Plugin-blueviolet?logo=anthropic&logoColor=white)](https://code.claude.com)

[![Release](https://github.com/kochetkov-ma/claude-brewcode/actions/workflows/release.yml/badge.svg)](https://github.com/kochetkov-ma/claude-brewcode/actions/workflows/release.yml)
[![Latest Release](https://img.shields.io/github/v/release/kochetkov-ma/claude-brewcode?label=latest&color=blue)](https://github.com/kochetkov-ma/claude-brewcode/releases/latest)
[![Documentation](https://img.shields.io/badge/Docs-doc--claude.brewcode.app-4A90D9?logo=bookstack&logoColor=white)](https://doc-claude.brewcode.app/getting-started/)

**Claude Code plugin suite** -- four plugins for development, documentation, text utility, and visual workflows.

A regular Claude Code session hands a big task to one agent and loses sight of it. Brewcode splits work into bounded units, gives every spawn a six-field brief, and re-states the delegation rule on every prompt. Four plugins. 27 skills. 8 agents. 4 lifecycle hooks.

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
| [brewdoc](brewdoc/README.md) | Documentation tools: docsync, memory sync, PDF conversion, publishing | 6 | `claude plugin install brewdoc@claude-brewcode` |
| [brewtools](brewtools/README.md) | Universal text utilities: token optimization, humanization, secrets scanning, plugin updates | 12 | `claude plugin install brewtools@claude-brewcode` |
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
/brewcode:spec "Implement JWT authorization"  # 1. Research codebase + create specification
/brewcode:superreview                         # 2. Generate a project-tailored deep-review skill
```

Skills orchestrate, agents execute. Each spawn is a bounded unit with a six-field brief, and the `forced-eval` hook re-states the manager role and the split rule on every prompt, so work stays observable across compaction cycles.

### brewdoc -- documentation tools

```bash
/brewdoc:docsync                      # Track and sync stale project docs
/brewdoc:my-claude                    # Generate Claude Code installation docs
/brewdoc:memory                       # Memory sync: memory + CLAUDE.md (incl. nested) + rules + conventions
/brewdoc:md-to-pdf ./docs/report.md   # Convert markdown to PDF
/brewdoc:publish "Hello world"        # Publish to brewpage.app -- returns public URL
/brewdoc:guide                        # Interactive tutorial for the plugin suite
```

### brewtools -- text utilities

```bash
/brewtools:text-optimize CLAUDE.md         # Token-efficient optimization (52 rules)
/brewtools:text-human 3be67487             # Remove AI artifacts from a commit
/brewtools:secrets-scan                    # Scan for leaked credentials
/brewtools:plugin-update                   # Install or update the plugin suite
```

### brewui -- visual tools

Placeholder plugin, currently empty. No commands yet -- coming soon.

## How It Works

```
  /brewcode:spec "..." --> 5-10 parallel research agents + user Q&A --> SPEC.md
        │
        v
  project agents from .claude/agents/ --> bounded units, fanned out in ONE message
        │
        v
  /brewcode:superreview --> project-tailored deep-review skill

  every prompt: forced-eval (UserPromptSubmit) injects 3 lines --
    [ROLE]   scan agents, project .claude/agents/ first; domain expert exists -> delegate
    [SPLIT]  one agent for an hour = drift you cannot observe -> split and fan out
    [BRANCH] no branch chosen -> main; no explicit branch/PR -> take over the whole workspace
```

### Delegation contract

Every skill that spawns subagents carries a `## Delegation` section; every shipped agent carries a `## Scope guard`. Both encode the same rule: one subagent = ONE bounded unit -- one deliverable, ~5 files, ~10 steps. Anything bigger is split into N tasks spawned in a single message.

Every spawn prompt carries six fields:

| Field | Content |
|-------|---------|
| GOAL | the overall task and why it exists -- the point beyond the file edit |
| ROLE | what this agent owns; what it must NOT touch |
| SCOPE | exact paths and commands in bounds, plus explicit out-of-bounds |
| CONTEXT | what is already done, by whom, what runs in parallel |
| CONSUMER | who or what uses the result next, and the shape it must fit |
| DONE | acceptance criteria plus the exact report shape expected back |

## Skills Reference

### Brewcode (9 skills)

| Skill | Purpose |
|-------|---------|
| `/brewcode:spec` | Research codebase + user dialog -> SPEC.md |
| `/brewcode:superreview` | Generate a project-tailored deep-review skill: domain-expert routing + scope discipline + mechanical gates + adversarial validation |
| `/brewcode:teams` | Create and manage dynamic teams of domain-specific agents |
| `/brewcode:convention` | Extract etalon classes, patterns, architecture into convention docs |
| `/brewcode:rules` | Prompt-driven rules management: status, create, improve, review |
| `/brewcode:skills` | Prompt-driven skill management: status, create, improve, sync, review |
| `/brewcode:agents` | Prompt-driven agent management: status, create, improve, sync, review |
| `/brewcode:e2e` | E2E testing orchestration with BDD scenarios and quorum review |
| `/brewcode:semble` | Semantic code search setup: installs the pinned semble_code MCP, isolated cache, semble-first rule + hooks, agent migration |

### Brewdoc (6 skills)

| Skill | Purpose |
|-------|---------|
| `/brewdoc:docsync` | Track & sync stale project docs via hooks |
| `/brewdoc:my-claude` | Generate Claude Code installation docs |
| `/brewdoc:memory` | Memory sync: memory + CLAUDE.md (incl. nested) + rules + conventions; `full` adds agent/skill rosters |
| `/brewdoc:md-to-pdf` | Convert markdown to professional PDF |
| `/brewdoc:publish` | Publish to brewpage.app -- returns public URL |
| `/brewdoc:guide` | Interactive tutorial for the plugin suite |

### Brewtools (12 skills)

| Skill | Purpose |
|-------|---------|
| `/brewtools:text-optimize` | LLM token efficiency optimization (52 rules, smart dedup + aggressive lossy) |
| `/brewtools:text-human` | Remove AI artifacts, humanize code |
| `/brewtools:think-short` | Install/remove terse-mode hooks (SessionStart + every-10th UserPromptSubmit + subagent Task) that inject brevity directives; project or global |
| `/brewtools:agent-deadline` | Install/remove a soft wall-clock budget for subagents -- 80% warns "wrap up", 100% blocks all but finalization tools; project or global, opt-in |
| `/brewtools:agent-router` | EXPERIMENTAL -- install/remove a PreToolUse hook that denies a generic subagent spawn in favor of the real project/plugin expert, or nudges when the fit is only uncertain; project scope only, opt-in |
| `/brewtools:secrets-scan` | Scan git-tracked files for leaked secrets |
| `/brewtools:ssh` | SSH server management -- connect, configure, deploy |
| `/brewtools:deploy` | GitHub Actions deployment -- workflows, releases, GHCR, CI/CD |
| `/brewtools:plugin-update` | Install and update the full plugin suite |
| `/brewtools:provider-switch` | Configure alternative API providers (DeepSeek, Z.ai/GLM, Qwen, MiniMax, OpenRouter) |
| `/brewtools:manager` | Manager mode -- hook-driven codewords `++m` (delegate-everything, plan-aware), `++a` (architecture-first), `++rr` (anti-regression review), `++r` (two-phase double-check); the opt-in HARD wall (`on`/`off`/`uninstall`/`status`/`level`/`edit`/`reset`) installs a project PreToolUse guard that blocks main-session writes while subagents stay free |
| `/brewtools:task-board-init` | Deploy a file-based Kanban into ANY repo via multi-agent analysis -- task-tracker agent, task-board skill, tasks rule, .claude/features |

### Brewui (0 skills)

No skills yet -- placeholder for future UI/visual/creative tools.

### Portable skills (standalone)

Self-contained `SKILL.md` folders that ship outside the four plugins -- drop them into any compatible agent runtime. Both publish content to [brewpage.app](https://brewpage.app) (text, markdown, files, multi-file sites) and return a public URL.

| Skill | Runtime | Path |
|-------|---------|------|
| `brewpage-publish` | Claude Code | [`skills/brewpage-publish`](skills/brewpage-publish/) |
| `brewpage-publish` | OpenClaw / AgentSkills | [`openclaw/brewpage-publish`](openclaw/brewpage-publish/) |

## Agents (8 total)

| Agent | Plugin | Model | Purpose |
|-------|--------|-------|---------|
| skill-creator | brewcode | inherit | Create and improve Claude Code skills |
| agent-creator | brewcode | inherit | Create and improve Claude Code agents |
| hook-creator | brewcode | inherit | Create and debug Claude Code hooks |
| bash-expert | brewcode | inherit | Create professional shell scripts |
| bc-rules-organizer | brewcode | haiku | Internal: spawned by /brewcode:rules |
| text-optimizer | brewtools | sonnet | Optimize text and docs for LLM efficiency |
| ssh-admin | brewtools | inherit | Linux server administration via SSH |
| deploy-admin | brewtools | inherit | GitHub Actions deployment and CI/CD |

> **Scope guard:** every shipped agent carries a `## Scope guard` -- a task larger than one bounded unit (one deliverable, ~5 files, ~10 steps) makes the agent stop before starting and return a split proposal instead of grinding for an hour. `ssh-admin` and `deploy-admin` additionally split per host, repo, and environment.

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
