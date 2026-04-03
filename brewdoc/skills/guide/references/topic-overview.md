# Topic: Three Plugins Overview

Domain: Getting Started

Deliver section by section. Pause after each section with AskUserQuestion.

## Section 1: What is Brewcode?

Brewcode is a plugin suite for Claude Code. It ships as 3 plugins in a single marketplace package.

Key ideas:
- Few powerful workflows that handle real-world complexity
- Extend yourself: create your own skills, agents, and hooks
- Not a framework. A set of tools that work together without locking you in.

One marketplace, three plugins, one version number. Install what you need.

## Section 2: The Three Plugins

| Plugin | Purpose | Key Skills |
|--------|---------|------------|
| brewcode | Infinite task execution, agent teams, project automation | setup, spec, plan, start, teams, review, convention, e2e |
| brewdoc | Documentation tools: sync, generate, optimize, publish | auto-sync, my-claude, memory, md-to-pdf, guide, publish |
| brewtools | Universal utilities: text optimization, security scanning | text-optimize, text-human, secrets-scan |

**brewcode** is the core. It runs tasks that survive context limits through automatic handoff. It manages agents, hooks, and knowledge persistence.

**brewdoc** handles documentation. Auto-sync keeps docs updated. My-claude generates Claude Code setup docs for any project. Memory optimizes memory files. Publish shares content via brewpage.app.

**brewtools** provides standalone utilities. Text-optimize reduces token usage in prompts. Secrets-scan catches leaked credentials. These work in any project.

## Section 3: How They Work Together

The plugins complement each other:

- **brewcode** handles the heavy lifting: task execution, planning, code review, convention extraction
- **brewdoc** keeps documentation in sync with your codebase as it evolves
- **brewtools** provides utility skills you can call from anywhere

All three share the same version number. They update together from the same marketplace. No version mismatches.

Example workflow:
1. `/brewcode:setup` initializes a project
2. `/brewcode:spec` + `/brewcode:plan` + `/brewcode:start` executes a feature
3. `/brewdoc:auto-sync` updates affected documentation
4. `/brewtools:secrets-scan` checks nothing was leaked

## Section 4: What Makes It Unique

Five capabilities that set brewcode apart:

1. **Infinite context via handoff** — tasks automatically hand off to fresh sessions when context fills up. No progress lost. KNOWLEDGE.jsonl carries learnings forward.

2. **KNOWLEDGE.jsonl persistence** — every insight, mistake, and decision is captured. Future sessions start smarter than the last one ended.

3. **Dynamic teams** — create domain-specific agents on the fly. Need a database expert? A UI specialist? Generate them from your codebase conventions.

4. **Convention extraction** — analyze existing code to extract patterns, naming conventions, architecture rules. New code follows established patterns automatically.

5. **Quorum code review** — multiple reviewer perspectives (security, performance, architecture) in a single review pass. Configurable reviewer count.

Reference: see "Diagram: Plugin Suite Architecture" in ascii-diagrams.md
