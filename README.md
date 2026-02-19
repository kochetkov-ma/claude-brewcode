# Brewcode

**Full-featured development platform for Claude Code** - infinite focus tasks with automatic context handoff, prompt optimization, skill/agent creation, quorum code reviews, project rules management, and knowledge persistence.

`16` skills. `14` specialized agents. `7` lifecycle hooks.

---

## Installation

**Option A** - install from GitHub (persistent across sessions):

1. **Add marketplace** - registers the plugin source in Claude Code
   ```bash
   claude plugin marketplace add https://github.com/kochetkov-ma/claude-brewcode
   ```
2. **Install plugin** - copies the plugin to local cache
   ```bash
   claude plugin install brewcode@claude-brewcode
   ```
3. **Restart Claude Code** - the plugin loads automatically on every session

**Option B** - run from local directory (for development or one-time use):

```bash
claude --plugin-dir ./brewcode
```

After installation, run `/brewcode:install` inside Claude Code to check and install prerequisites (brew, jq, coreutils) and optionally semantic search (ollama, grepai).

---

## Quick Start

1. **Setup** - analyzes your project structure and generates adapted templates, config, and review skill
   ```bash
   /brewcode:setup
   ```
   Output: `.claude/tasks/cfg/` with config, templates tailored to your tech stack

2. **Spec** - spawns 5-10 parallel research agents, asks clarifying questions, produces a structured specification
   ```bash
   /brewcode:spec "Implement JWT authorization"
   /brewcode:spec -n "Implement JWT authorization"   # --noask: no questions to user
   ```
   Output: `SPEC.md` with requirements, constraints, risks, and codebase analysis

3. **Plan** - converts SPEC into a phased execution plan with verification criteria
   ```bash
   /brewcode:plan
   /brewcode:plan -n                                  # --noask: no questions to user
   ```
   Output: `PLAN.md` with phases, iterations, and checkboxes for each deliverable

4. **Start** - executes the plan phase by phase with automatic context handoff
   ```bash
   /brewcode:start
   ```
   Output: working code, tests, artifacts. Survives unlimited context compactions.

After `/brewcode:setup` runs once, each task follows the cycle: `spec` -> `plan` -> `start`.

---

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

### 6. Documentation sync

```bash
/brewcode:auto-sync                    # Sync all project docs
/brewcode:auto-sync init ./docs/api.md # Add file to auto-sync tracking
/brewcode:auto-sync status             # Show stale/fresh document status
```

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

### Hook lifecycle

| Hook | Event | Purpose |
|------|-------|---------|
| `session-start` | SessionStart | Initialize session, inject plugin path |
| `grepai-session` | SessionStart | Auto-start grepai watch process |
| `pre-task` | PreToolUse:Task | Inject grepai + KNOWLEDGE into agent prompts |
| `grepai-reminder` | PreToolUse:Glob/Grep | Remind to prefer semantic search |
| `post-task` | PostToolUse:Task | Bind session, enforce 2-step protocol |
| `pre-compact` | PreCompact | Compact KNOWLEDGE, write handoff entry |
| `stop` | Stop | Block if task incomplete, clean lock |

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

## Skills (16)

| Skill | Purpose |
|-------|---------|
| `/brewcode:install` | Install prerequisites (brew, jq, grepai) |
| `/brewcode:setup` | Analyze project, generate adapted templates and config |
| `/brewcode:spec` | Research codebase + user dialog -> SPEC.md |
| `/brewcode:plan` | Generate phased PLAN.md from SPEC or Plan Mode |
| `/brewcode:start` | Execute task with infinite context handoff |
| `/brewcode:review` | Multi-agent code review with quorum (created by setup) |
| `/brewcode:rules` | Extract rules from KNOWLEDGE to `.claude/rules/` |
| `/brewcode:auto-sync` | Universal document sync (status, init, global, project, path) |
| `/brewcode:grepai` | Semantic code search (setup, status, start, stop, reindex) |
| `/brewcode:text-optimize` | Optimize text/prompts for LLM token efficiency |
| `/brewcode:text-human` | Remove AI artifacts, clean comments, simplify docs |
| `/brewcode:standards-review` | Review code for project standards compliance |
| `/brewcode:secrets-scan` | Scan for leaked secrets and credentials |
| `/brewcode:skillsup` | List, create, and upgrade skills with forced evaluation |
| `/brewcode:mcp-config` | Manage MCP server configurations |
| `/brewcode:teardown` | Remove plugin configuration (keeps task data) |

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
| `bc-auto-sync-processor` | sonnet | Process documents for auto-sync |
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
| [Plugin README](brewcode/README.md) | Detailed plugin documentation |
| [Installation Guide](brewcode/INSTALL.md) | All installation methods |
| [Commands Reference](brewcode/docs/commands.md) | Detailed skills descriptions with examples |
| [Flow Diagrams](brewcode/docs/flow.md) | Execution flow diagrams (spec, plan, start) |
| [Hooks Reference](brewcode/docs/hooks.md) | Hook behavior and configuration |
| [File Structure](brewcode/docs/file-tree.md) | Complete file tree of plugin and project |
| [Release Notes](brewcode/RELEASE-NOTES.md) | Version history |

---

## Development

```bash
# Run with debug output
CLAUDE_DEBUG=1 claude --plugin-dir ./brewcode

# Update plugin in marketplace
bash .claude/scripts/update-plugin.sh
```

### Version Sync

When bumping version, update BOTH files:
- `brewcode/.claude-plugin/plugin.json` (source of truth)
- `.claude-plugin/marketplace.json` (must match)

---

## License

MIT - see [LICENSE](LICENSE)
