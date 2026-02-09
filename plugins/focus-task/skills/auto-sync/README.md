# Auto-Sync

Tracks and updates Claude Code documents by comparing against codebase.

## Quick Start

```sh
/focus-task:auto-sync              # Sync project docs
/focus-task:auto-sync status       # Show INDEX state
/focus-task:auto-sync init <path>  # Tag file for tracking
/focus-task:auto-sync global       # Sync ~/.claude docs
/focus-task:auto-sync -o           # Sync + optimize
```

## How It Works

| Step | Action |
|------|--------|
| Discover | Find `.md` with `auto-sync: enabled` frontmatter |
| Queue | Compare `u` (last sync) vs `intervalDays` config |
| Process | Launch `ft-auto-sync-processor` agents (max 5 parallel) |
| Update | Read doc, research changes, apply edits bottom-up |

## Execution Flow

```
/focus-task:auto-sync [args]
│  context: session → runs in main conversation (has Task + Skill)
│
├─ 1. Resolve $FT_PLUGIN path (Bash)
├─ 2. detect-mode.sh → MODE|ARG|FLAGS
│     ├─ STATUS → read INDEX, report, EXIT
│     ├─ INIT   → tag file, add to INDEX, EXIT
│     └─ SYNC   → continue ▼
│
├─ Phase 1: Setup INDEX (mkdir + touch)
├─ Phase 1.5: Load config (intervalDays, parallelAgents, optimize)
├─ Phase 2: Discover + Queue
│     discover.sh → TYPE|PATH per line
│     index-ops.sh stale → stale entries
│     Queue = new + stale
│
└─ Phase 3: Process (batches of max parallelAgents)
      │
      │  ONE message with N Task calls (parallel)
      ▼
   ┌─────────────────────────────────────────┐
   │ ft-auto-sync-processor (subagent)       │
   │ Tools: Read, Write, Edit, Glob,         │
   │        Grep, WebFetch (NO Task)         │
   │                                         │
   │ 1. Read document                        │
   │ 2. Load instructions/sync-{type}.md     │
   │    + parse <auto-sync-override>         │
   │ 3. Build verification plan              │
   │ 4. Research (direct tool calls):        │
   │    ├─ Glob+Read → verify file paths     │
   │    ├─ Grep → verify code patterns       │
   │    ├─ WebFetch → check URLs             │
   │    └─ Read → cross-check KNOWLEDGE      │
   │ 5. Aggregate (code > docs > web)        │
   │ 6. Apply edits bottom-up (Edit)         │
   │ 7. Write report, return result          │
   └─────────────────┬───────────────────────┘
                     │
                     ▼
   post-task.mjs → systemMessage to main:
   "⛔ DONE → 1. WRITE report 2. CALL ft-coordinator"
                     │
                     ▼
   Main conversation:
   ├─ Update INDEX (index-ops.sh update)
   ├─ If OPTIMIZE: Skill("text-optimize", path)
   └─ Output summary report
```

**Key:** Processor uses Glob/Grep/Read/WebFetch directly (no nested subagents). Coordinator call handled by main conversation via post-task.mjs hook.

## INDEX Format

```jsonl
{"p":"skills/auth/SKILL.md","t":"skill","u":"2026-02-05","pr":"default"}
```

| Field | Description | Values |
|-------|-------------|--------|
| `p` | Relative path | File path from root |
| `t` | Document type | `skill`, `agent`, `rule`, `config`, `doc` |
| `u` | Last sync date | `YYYY-MM-DD` |
| `pr` | Protocol | `default` or `override` |

## Document Frontmatter

```yaml
---
auto-sync: enabled
auto-sync-date: 2026-02-05
auto-sync-type: skill
---
```

## Override Block

Add in document body to customize sync behavior:

```markdown
<auto-sync-override>
sources: src/**/*.ts, .claude/agents/*.md
focus: API endpoints, error handling
preserve: ## User Notes, ## Custom Config
</auto-sync-override>
```

| Field | Purpose |
|-------|---------|
| `sources` | Glob patterns for context files |
| `focus` | Areas to research |
| `preserve` | Sections to never modify |

## Type Detection (path-based)

| Path pattern | Type |
|-------------|------|
| `*/skills/**` | `skill` |
| `*/agents/**` | `agent` |
| `*/rules/**` | `rule` |
| `**/CLAUDE.md` | `config` |
| Other `.md` | `doc` |

## Config

In `focus-task.config.json`:

```json
"autoSync": {
  "intervalDays": 7,
  "retention": { "maxEntries": 200 },
  "optimize": false,
  "parallelAgents": 5
}
```

## Scripts

| Script | Purpose |
|--------|---------|
| `detect-mode.sh` | Parse arguments → `MODE\|ARG\|FLAGS` |
| `discover.sh` | Find tagged files → `paths\|json\|typed` |
| `index-ops.sh` | INDEX CRUD: `read\|add\|update\|remove\|stale` |

## Per-Type Instructions

Processor loads `instructions/sync-{type}.md`:

| Type | Verifies |
|------|----------|
| skill | name, tools, scripts, examples |
| agent | tools, model, workflow, callers |
| rule | patterns, KNOWLEDGE alignment |
| doc | paths, URLs, structure |
| config | paths, commands, versions |

## Files

```
skills/auto-sync/
├── SKILL.md              # Skill definition (3 phases)
├── README.md             # This file
├── scripts/
│   ├── detect-mode.sh    # Argument parser
│   ├── discover.sh       # File discovery + type detection
│   └── index-ops.sh      # INDEX operations (4-field)
└── instructions/
    ├── sync-skill.md
    ├── sync-agent.md
    ├── sync-rule.md
    ├── sync-doc.md
    └── sync-config.md
```
