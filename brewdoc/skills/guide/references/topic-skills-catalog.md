# Topic 5: All Skills Catalog

Domain: Core Workflow

## Section 1: Brewcode Skills (8)

The main plugin. Semantic search, deep review, conventions, agent teams, code quality.

| Skill | Purpose |
|-------|---------|
| `/brewcode:superreview` | Deep multi-perspective quorum code review |
| `/brewcode:convention` | Extract code conventions, patterns, architecture |
| `/brewcode:rules` | Prompt-driven rules management: status, create, improve, review |
| `/brewcode:teams` | Create and manage dynamic agent teams |
| `/brewcode:e2e` | Full-cycle E2E test orchestration |
| `/brewcode:skills` | Prompt-driven skill management: status, create, improve, review, sync |
| `/brewcode:agents` | Prompt-driven agent management: status, create, improve, review, sync |
| `/brewcode:semble` | Semantic code-search MCP: install, audit, reindex, remove |

Typical flow: `convention` -> `/task-spec` (from `/brewtools:task-board-init`) -> implement -> `superreview`

## Section 2: Brewdoc Skills (6)

Documentation tools. Sync, generate, optimize, export, publish.

| Skill | Purpose |
|-------|---------|
| `/brewdoc:docsync` | Track & sync stale project docs via session hooks |
| `/brewdoc:my-claude` | Generate docs about your Claude Code setup |
| `/brewdoc:memory-sync-init` | Generate a project-local `/memory-sync` skill: keeps CLAUDE.md, rules, agents, skills true to the code |
| `/brewdoc:md-to-pdf` | Convert markdown to PDF (reportlab/weasyprint) |
| `/brewdoc:guide` | Interactive teaching for the plugin suite (this guide) |
| `/brewdoc:publish` | Publish content to brewpage.app — text, markdown, or files |

## Section 3: Brewtools Skills (12)

Universal utilities. Work in any project, no setup needed.

| Skill | Purpose |
|-------|---------|
| `/brewtools:text-optimize` | Optimizes text for LLM tokens — 5 modes, smart dedup, up to 4x |
| `/brewtools:text-human` | Remove AI artifacts, humanize code and docs |
| `/brewtools:secrets-scan` | Scan for leaked secrets, credentials, API keys |
| `/brewtools:ssh` | SSH server management — connect, configure, deploy, administer remote servers |
| `/brewtools:deploy` | GitHub Actions deployment — workflows, releases, GHCR, CI/CD with safety gates |
| `/brewtools:plugin-update` | Check, install, or update brewcode suite plugins from the marketplace |
| `/brewtools:provider-switch` | Configure alternative API providers — DeepSeek V4 (priority), Z.ai/GLM, Qwen, MiniMax, OpenRouter |
| `/brewtools:think-short` | Install terse-mode hooks (project or global) that inject brevity directives to cut token bloat |
| `/brewtools:manager` | Codeword (++m, plan-aware) Manager prompt + opt-in HARD wall blocking mutating tools (RU+EN) |
| `/brewtools:task-board-init` | Deploy a file-based Kanban into any repo via multi-agent analysis |
| `/brewtools:agent-deadline` | Install a soft wall-clock budget for subagents — warn at 80%, block at 100% |
| `/brewtools:agent-router` | EXPERIMENTAL: deny a generic subagent spawn in favor of the real project/plugin expert |

These are standalone — no project configuration required. Run them anywhere.

## Section 3b: Brewui Skills (0)

Brewui currently ships no skills -- placeholder for future UI/visual/creative tools.

## Section 4: Common Patterns

**Arguments:** Most skills accept inline arguments.
```
/task-spec TASK-42 full
/brewcode:teams create backend-team
/brewcode:convention extract
/brewcode:superreview
```

**Recommended order for new projects:**

| Step | Skill | Why |
|------|-------|-----|
| 1 | `/brewcode:convention` | Learn existing patterns |
| 2 | `/brewtools:task-board-init` then `/task-spec` | Track tasks and define what to build |
| 3 | `/brewcode:superreview` | Review the result |
| 4 | `/brewcode:rules` | Save learnings as rules |

**Tips:**
- Skills that modify files always confirm before writing
- `/brewcode:convention` extracts patterns so new code matches your existing style
