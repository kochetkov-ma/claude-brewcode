# Topic 5: All Skills Catalog

Domain: Core Workflow

## Section 1: Brewcode Skills (9)

The main plugin. Spec authoring, semantic search, code quality.

| Skill | Purpose |
|-------|---------|
| `/brewcode:spec "desc"` | Create SPEC through research + user interaction |
| `/brewcode:grepai` | Setup grepai semantic code search |
| `/brewcode:superreview` | Deep multi-perspective quorum code review |
| `/brewcode:convention` | Extract code conventions, patterns, architecture |
| `/brewcode:rules` | Prompt-driven rules management: status, create, improve, review |
| `/brewcode:teams` | Create and manage dynamic agent teams |
| `/brewcode:e2e` | Full-cycle E2E test orchestration |
| `/brewcode:skills` | Prompt-driven skill management: status, create, improve, review |
| `/brewcode:agents` | Prompt-driven agent management: status, create, improve, review |

Typical flow: `spec` -> implement -> `superreview` (use `grepai` for search)

## Section 2: Brewdoc Skills (6)

Documentation tools. Sync, generate, optimize, export, publish.

| Skill | Purpose |
|-------|---------|
| `/brewdoc:auto-sync` | Sync documentation with code changes automatically |
| `/brewdoc:my-claude` | Generate docs about your Claude Code setup |
| `/brewdoc:memory` | Interactive 4-step memory file optimization |
| `/brewdoc:md-to-pdf` | Convert markdown to PDF (reportlab/weasyprint) |
| `/brewdoc:guide` | Interactive teaching for the plugin suite (this guide) |
| `/brewdoc:publish` | Publish content to brewpage.app — text, markdown, or files |

## Section 3: Brewtools Skills (10)

Universal utilities. Work in any project, no setup needed.

| Skill | Purpose |
|-------|---------|
| `/brewtools:text-optimize` | Optimize text for LLM token efficiency (~30% savings) |
| `/brewtools:text-human` | Remove AI artifacts, humanize code and docs |
| `/brewtools:secrets-scan` | Scan for leaked secrets, credentials, API keys |
| `/brewtools:ssh` | SSH server management — connect, configure, deploy, administer remote servers |
| `/brewtools:deploy` | GitHub Actions deployment — workflows, releases, GHCR, CI/CD with safety gates |
| `/brewtools:plugin-update` | Check, install, or update brewcode suite plugins from the marketplace |
| `/brewtools:provider-switch` | Configure alternative API providers — DeepSeek V4 (priority), Z.ai/GLM, Qwen, MiniMax, OpenRouter |
| `/brewtools:think-short` | Install terse-mode hooks (project or global) that inject brevity directives to cut token bloat |
| `/brewtools:manager` | Codeword (++m, plan-aware) Manager prompt + opt-in HARD wall blocking mutating tools (RU+EN) |
| `/brewtools:task-board-init` | Deploy a file-based Kanban into any repo via multi-agent analysis |

These are standalone — no project configuration required. Run them anywhere.

## Section 3b: Brewui Skills (0)

Brewui currently ships no skills -- placeholder for future UI/visual/creative tools.

## Section 4: Common Patterns

**Arguments:** Most skills accept inline arguments.
```
/brewcode:spec "add user authentication with OAuth2"
/brewcode:teams create backend-team
/brewcode:convention extract
/brewcode:superreview
```

**Recommended order for new projects:**

| Step | Skill | Why |
|------|-------|-----|
| 1 | `/brewcode:grepai` | Enable semantic search |
| 2 | `/brewcode:convention` | Learn existing patterns |
| 3 | `/brewcode:spec "task"` | Define what to build |
| 4 | `/brewcode:superreview` | Review the result |
| 5 | `/brewcode:rules` | Save learnings as rules |

**Tips:**
- Skills that modify files always confirm before writing
- Use `/brewcode:grepai` first in any new project — it indexes your code for semantic search
- `/brewcode:convention` extracts patterns so new code matches your existing style
