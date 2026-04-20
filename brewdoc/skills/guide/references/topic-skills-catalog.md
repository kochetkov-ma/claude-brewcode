# Topic 5: All Skills Catalog

Domain: Core Workflow

## Section 1: Brewcode Skills (13)

The main plugin. Task execution, code quality, project management.

| Skill | Purpose |
|-------|---------|
| `/brewcode:setup` | Analyze project, create templates, check prerequisites |
| `/brewcode:spec "desc"` | Create SPEC through research + user interaction |
| `/brewcode:plan` | Create PLAN.md from SPEC with phases and dependencies |
| `/brewcode:start` | Execute plan with infinite context handoff |
| `/brewcode:teams` | Create and manage dynamic agent teams |
| `/brewcode:convention` | Extract code conventions, patterns, architecture |
| `/brewcode:rules` | Convert KNOWLEDGE.jsonl to `.claude/rules/` files |
| `/brewcode:grepai` | Setup grepai semantic code search |
| `/brewcode:standards-review` | Review code against project standards |
| `/brewcode:teardown` | Cleanup task files (keeps task directory) |
| `/brewcode:e2e` | Full-cycle E2E test orchestration |
| `/brewcode:skills` | Skill management utilities |
| `/brewcode:agents` | Agent management utilities |

Note: `/brewcode:setup` also generates a local `/brewcode:review` skill for quorum code review (3 reviewers, 2/3 consensus). It is project-specific, not shipped with the plugin.

Typical flow: `setup` (once) -> `spec` -> `plan` -> `start` -> `standards-review`

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

## Section 3: Brewtools Skills (11)

Universal utilities. Work in any project, no setup needed.

| Skill | Purpose |
|-------|---------|
| `/brewtools:text-optimize` | Optimize text for LLM token efficiency (~30% savings) |
| `/brewtools:text-human` | Remove AI artifacts, humanize code and docs |
| `/brewtools:secrets-scan` | Scan for leaked secrets, credentials, API keys |
| `/brewtools:ssh` | SSH server management — connect, configure, deploy, administer remote servers |
| `/brewtools:deploy` | GitHub Actions deployment — workflows, releases, GHCR, CI/CD with safety gates |
| `/brewtools:debate` | Evidence-based multi-agent debate with Discovery phase and 3 modes |
| `/brewtools:plugin-update` | Check, install, or update brewcode suite plugins from the marketplace |
| `/brewtools:provider-switch` | Configure alternative API providers — Z.ai/GLM, Qwen, MiniMax, OpenRouter |
| `/brewtools:skill-toggle` | Disable/enable individual plugin skills, survives plugin updates |
| `/brewtools:agent-toggle` | Disable/enable individual plugin agents, survives plugin updates |
| `/brewtools:think-short` | Toggle terse-output mode (light/medium/aggressive) to cut token bloat |

These are standalone — no project configuration required. Run them anywhere.

## Section 3b: Brewui Skills (2)

UI/visual/creative tools. AI image generation and design-to-code conversion.

| Skill | Purpose |
|-------|---------|
| `/brewui:image-gen` | AI image generation via 5 providers with anti-slop controls |
| `/brewui:glm-design-to-code` | GLM vision design-to-code: image/text/HTML/URL to multi-framework code |

## Section 4: Common Patterns

**Arguments:** Most skills accept inline arguments.
```
/brewcode:spec "add user authentication with OAuth2"
/brewcode:teams create backend-team
/brewcode:convention extract
/brewcode:review -q 3-5
```

**Recommended order for new projects:**

| Step | Skill | Why |
|------|-------|-----|
| 1 | `/brewcode:setup` | Initialize project, detect stack |
| 2 | `/brewcode:grepai` | Enable semantic search |
| 3 | `/brewcode:convention` | Learn existing patterns |
| 4 | `/brewcode:spec "task"` | Define what to build |
| 5 | `/brewcode:plan` | Create execution plan |
| 6 | `/brewcode:start` | Execute the plan |
| 7 | `/brewcode:standards-review` | Review the result |
| 8 | `/brewcode:rules` | Save learnings as rules |

**Tips:**
- Skills that modify files always confirm before writing
- Use `/brewcode:setup` first in any new project — it detects your stack and creates templates
- `/brewcode:teardown` removes task artifacts but keeps the task directory for reference
