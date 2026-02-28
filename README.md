# claude-brewcode

[![macOS](https://img.shields.io/badge/macOS-support-000000?logo=apple&logoColor=white)](https://www.apple.com/macos/)
[![Claude](https://img.shields.io/badge/Claude-Anthropic-orange?logo=anthropic&logoColor=white)](https://claude.ai)
[![Claude Code](https://img.shields.io/badge/Claude_Code-Plugin-blueviolet?logo=anthropic&logoColor=white)](https://code.claude.com)

[![Release](https://github.com/kochetkov-ma/claude-brewcode/actions/workflows/release.yml/badge.svg)](https://github.com/kochetkov-ma/claude-brewcode/actions/workflows/release.yml)
[![Latest Release](https://img.shields.io/github/v/release/kochetkov-ma/claude-brewcode?label=latest&color=blue)](https://github.com/kochetkov-ma/claude-brewcode/releases/latest)

**Claude Code plugin suite** - two plugins for development and documentation workflows.

## Plugin Suite

| Plugin | Version | Purpose | Install |
|--------|---------|---------|---------|
| brewcode | 3.1.0 | Infinite task execution, prompt optimization, skill/agent creation, quorum reviews | `claude plugin install brewcode@claude-brewcode` |
| brewdoc | 3.1.0 | Documentation tools: auto-sync, my-claude docs, memory optimization | `claude plugin install brewdoc@claude-brewcode` |

---

## Brewcode

**Full-featured development platform for Claude Code** - infinite focus tasks with automatic context handoff, prompt optimization, skill/agent creation, quorum code reviews, project rules management, and knowledge persistence.

`16` skills. `14` specialized agents. `7` lifecycle hooks.

> 🔒 **Code is scanned on every commit.** No personal data is collected or transmitted
>
> [![Gitleaks](https://github.com/kochetkov-ma/claude-brewcode/actions/workflows/gitleaks.yml/badge.svg)](https://github.com/kochetkov-ma/claude-brewcode/actions/workflows/gitleaks.yml?query=branch%3Amain)
> [![CodeQL](https://github.com/kochetkov-ma/claude-brewcode/actions/workflows/codeql.yml/badge.svg)](https://github.com/kochetkov-ma/claude-brewcode/actions/workflows/codeql.yml?query=branch%3Amain)
> [![Semgrep](https://github.com/kochetkov-ma/claude-brewcode/actions/workflows/semgrep.yml/badge.svg)](https://github.com/kochetkov-ma/claude-brewcode/actions/workflows/semgrep.yml?query=branch%3Amain)
> [![Skills.sh Security](https://img.shields.io/badge/Security_Audit-skills.sh-brightgreen?logo=vercel)](https://skills.sh/kochetkov-ma/claude-brewcode/text-optimizer)

---

## Installation

**Option A** - install from GitHub (persistent across sessions):

1. **Add marketplace** - registers the plugin source in Claude Code
   ```bash
   claude plugin marketplace add https://github.com/kochetkov-ma/claude-brewcode
   ```
2. **Install plugins** - copies both plugins to local cache
   ```bash
   claude plugin install brewcode@claude-brewcode
   claude plugin install brewdoc@claude-brewcode
   ```
3. **Restart Claude Code** - plugins load automatically on every session

**Option B** - run from local directory (for development or one-time use):

```bash
# Both plugins
claude --plugin-dir ./brewcode --plugin-dir ./brewdoc

# Single plugin
claude --plugin-dir ./brewcode
claude --plugin-dir ./brewdoc
```

After installation, run `/brewcode:install` inside Claude Code to check and install prerequisites (brew, jq, coreutils) and optionally semantic search (ollama, grepai).

---

## Quick Start

### brewcode — task execution

```bash
/brewcode:setup                              # 1. Adapt templates for your project (one-time)
/brewcode:spec "Implement JWT authorization"  # 2. Research + specification
/brewcode:plan                                # 3. Generate phased plan
/brewcode:start                               # 4. Execute with infinite context
```

After `/brewcode:setup`, each task follows the cycle: `spec` -> `plan` -> `start`.

### brewdoc — documentation tools

```bash
/brewdoc:auto-sync                    # Sync all project docs with codebase
/brewdoc:auto-sync init ./docs/api.md # Add file to auto-sync tracking
/brewdoc:my-claude                    # Generate Claude Code installation docs
/brewdoc:memory                       # Optimize memory files interactively
/brewdoc:md-to-pdf ./docs/report.md   # Convert markdown to PDF
```

---

> ⚠️ **macOS only.** Windows and Linux support is planned for future releases.

## Examples

### 1. Infinite focus task

```bash
# From text description - plugin researches codebase itself
/brewcode:spec "Add role-based access control with admin panel"

# From file - use existing requirements document as input
/brewcode:spec ./docs/requirements/rbac.md

# No questions mode - fully autonomous, no user interaction
/brewcode:spec -n "Add role-based access control with admin panel"
```

The plugin spawns 5-10 research agents in parallel, asks clarifying questions (use `-n`/`--noask` to skip), analyzes codebase patterns, and produces a structured SPEC. Then:

```bash
/brewcode:plan        # Creates phased PLAN.md from SPEC (may ask questions)
/brewcode:plan -n     # Same but fully autonomous
/brewcode:start       # Executes across unlimited context compactions
```

During execution, the plugin automatically compacts knowledge at ~90% context, writes handoff state, and continues without interruption.

### 2. Multi-agent code review

```bash
/brewcode:review              # Review staged/recent changes
/brewcode:review -q 3-5       # Quorum of 3 to 5 parallel reviewers
/brewcode:review -c            # Enable Devil's Advocate (critic) mode
```

Each reviewer works independently. Results are merged via quorum algorithm (2/3 agreement required). Findings are deduplicated and ranked by severity.

### 3. Prompt and text optimization

```bash
/brewcode:text-optimize ./prompts/system.md          # Single file, medium mode
/brewcode:text-optimize ./prompts/system.md -d        # Deep mode with rule-based analysis
/brewcode:text-optimize .claude/agents/               # Directory - optimizes all .md files inside
/brewcode:text-optimize                               # No args - optimizes ALL: CLAUDE.md, agents, skills
/brewcode:text-human ./src/utils/helper.ts            # Remove AI artifacts from code
```

### 4. Project rules management

```bash
/brewcode:rules                           # Extract rules from session context
/brewcode:rules .claude/tasks/**/K*.jsonl  # Extract from KNOWLEDGE file
/brewcode:rules .claude/rules "add SQL anti-patterns"  # Targeted rule update
```

### 5. Semantic code search

```bash
/brewcode:grepai setup    # Configure and start grepai for your project
/brewcode:grepai status   # Check index health
```

Once configured, `grepai_search` is automatically injected into all agent prompts for AI-powered code exploration.

### Security audit

```bash
/brewcode:secrets-scan    # Scan all git-tracked files for leaked credentials
```

---

## How It Works

### Core flow: infinite context execution

```
  /brewcode:spec ──► 5-10 research agents + user Q&A (*) ──► SPEC.md
                                                                 │
  /brewcode:plan ◄───────────────────────────────────────────────┘
        │
        └──► phased plan + user Q&A (*) ──────────────────► PLAN.md
                                            (*) skip with -n/--noask
                                                                 │
  /brewcode:start ◄──────────────────────────────────────────────┘
        │
        ▼
  ┌─ Execute phases with agents ──────────────────────────────────┐
  │                                                               │
  │   Phase 1 ──► Phase 2 ──► ... ──► Phase N                    │
  │       │                                                       │
  │       ▼  (context ~90%)                                       │
  │   PreCompact: compact KNOWLEDGE + write handoff               │
  │       │                                                       │
  │       ▼                                                       │
  │   [auto-compact] ──► same session resumes ──► next phase ─┐   │
  │                                                            │   │
  │   ◄────────────────────────────────────────────────────────┘   │
  └───────────────────────────────────────────────────────────────┘
```

### Knowledge lifecycle

1. Agents accumulate knowledge entries during execution (KNOWLEDGE.jsonl)
2. PreCompact hook compacts and deduplicates before context handoff
3. Pre-task hook injects knowledge into every agent prompt
4. Knowledge accumulates across phases, converted to permanent rules at task end

### Hook lifecycle

| Hook | Event | Purpose |
|------|-------|---------|
| `session-start` | SessionStart | Initialize session, inject plugin path |
| `grepai-session` | SessionStart | Auto-start grepai watch process |
| `pre-task` | PreToolUse:Task | Inject grepai + KNOWLEDGE into agent prompts |
| `grepai-reminder` | PreToolUse:Glob/Grep | Remind to prefer semantic search |
| `post-task` | PostToolUse:Task | Bind session, enforce 2-step protocol (success/failure branching) |
| `pre-compact` | PreCompact | Compact KNOWLEDGE, write handoff entry |
| `stop` | Stop | Block if not terminal (finished/failed/cancelled/error), clean lock |

---

## Key Features

| Feature | Description |
|---------|-------------|
| **Infinite focus tasks** | Automatic context handoff at ~90% - same session continues seamlessly |
| **Parallel research** | 5-10 agents analyze codebase before spec/plan creation |
| **Quorum code review** | Multi-agent review with consensus filtering and critic mode |
| **Knowledge persistence** | KNOWLEDGE.jsonl survives compactions, injects into all agent prompts |
| **Prompt optimization** | Deep token optimization with 31 verified rules |
| **Skill/agent creation** | Tools for building and upgrading custom skills and agents |
| **Project rules** | Extract reusable patterns and anti-patterns into `.claude/rules/` |
| **Semantic search** | Optional grepai integration for AI-powered code exploration |
| **Documentation sync** | Auto-detect stale docs, parallel update with research agents |
| **Security scanning** | 10 parallel agents scan for leaked secrets and credentials |
| **Standards review** | Check code against project standards, find duplicates |
| **Role-based constraints** | DEV/TEST/REVIEW constraints auto-injected into agent prompts |

---

## Brewcode Skills (15)

| Skill | Purpose |
|-------|---------|
| `/brewcode:install` | Install prerequisites (brew, jq, grepai) |
| `/brewcode:setup` | Analyze project, generate adapted templates and config |
| `/brewcode:spec` | Research codebase + user dialog -> SPEC.md |
| `/brewcode:plan` | Generate phased PLAN.md from SPEC or Plan Mode |
| `/brewcode:start` | Execute task with infinite context handoff |
| `/brewcode:review` | Multi-agent code review with quorum (created by setup) |
| `/brewcode:rules` | Extract rules from KNOWLEDGE to `.claude/rules/` |
| `/brewcode:grepai` | Semantic code search (setup, status, start, stop, reindex) |
| `/brewcode:text-optimize` | Optimize text/prompts for LLM token efficiency |
| `/brewcode:text-human` | Remove AI artifacts, clean comments, simplify docs |
| `/brewcode:standards-review` | Review code for project standards compliance |
| `/brewcode:secrets-scan` | Scan for leaked secrets and credentials |
| `/brewcode:skills` | List, create, and upgrade skills with forced evaluation |
| `/brewcode:agents` | Interactive agent creation and improvement |
| `/brewcode:teardown` | Remove plugin configuration (keeps task data) |

## Brewdoc Skills (4)

| Skill | Purpose |
|-------|---------|
| `/brewdoc:auto-sync` | Universal document sync with codebase |
| `/brewdoc:my-claude` | Generate Claude Code installation docs |
| `/brewdoc:memory` | Optimize memory files interactively |
| `/brewdoc:md-to-pdf` | Convert markdown to professional PDF |

## Agents (14)

### User-facing agents

| Agent | Model | Purpose |
|-------|-------|---------|
| `developer` | opus | Implement features, write code, fix bugs |
| `tester` | sonnet | Run tests, analyze failures, debug flaky tests |
| `reviewer` | opus | Code review, architecture, security, performance |
| `architect` | opus | Architecture analysis, patterns, trade-offs, scaling |
| `skill-creator` | opus | Create and improve Claude Code skills |
| `agent-creator` | opus | Create and improve Claude Code agents |
| `hook-creator` | opus | Create and debug Claude Code hooks |
| `bash-expert` | opus | Create professional shell scripts |
| `text-optimizer` | sonnet | Optimize text and docs for LLM efficiency |

### Internal agents

| Agent | Model | Purpose |
|-------|-------|---------|
| `bc-coordinator` | haiku | Task coordination, artifact management |
| `bc-knowledge-manager` | haiku | KNOWLEDGE.jsonl compaction and deduplication |
| `bc-grepai-configurator` | opus | Generate grepai config.yaml |
| `bd-auto-sync-processor` | sonnet | Process documents for auto-sync |
| `bc-rules-organizer` | sonnet | Create and optimize `.claude/rules/` files |

---

## Task Structure

After task creation:

```
.claude/tasks/{TS}_{NAME}_task/
  SPEC.md             # Specification (research results)
  PLAN.md             # Phased execution plan
  KNOWLEDGE.jsonl     # Accumulated knowledge (survives compactions)
  .lock               # Execution lock
  artifacts/          # Reports and outputs by phase
  backup/             # Backups
```

---

## Documentation

| Document | Description |
|----------|-------------|
| [Brewcode README](brewcode/README.md) | Detailed brewcode plugin documentation |
| [Brewdoc README](brewdoc/README.md) | Brewdoc plugin documentation |
| [Installation Guide](brewcode/INSTALL.md) | All installation methods |
| [Commands Reference](brewcode/docs/commands.md) | Detailed skills descriptions with examples |
| [Flow Diagrams](brewcode/docs/flow.md) | Execution flow diagrams (spec, plan, start) |
| [Hooks Reference](brewcode/docs/hooks.md) | Hook behavior and configuration |
| [File Structure](brewcode/docs/file-tree.md) | Complete file tree of plugin and project |
| [Release Notes](RELEASE-NOTES.md) | Version history |

---

## Development

```bash
# Run with debug output
CLAUDE_DEBUG=1 claude --plugin-dir ./brewcode

# Update plugin in marketplace
bash .claude/scripts/update-plugin.sh
```

### Version Sync

When bumping version, update ALL 4 files with SAME version:
- `brewcode/.claude-plugin/plugin.json`
- `brewdoc/.claude-plugin/plugin.json`
- `.claude-plugin/marketplace.json` (all 3 version fields)
- `brewcode/package.json` (both version fields)

---

## License

MIT - see [LICENSE](LICENSE)
