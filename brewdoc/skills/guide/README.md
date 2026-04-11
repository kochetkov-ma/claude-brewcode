# Guide

> Interactive tutorial for the brewcode/brewdoc/brewtools/brewui plugin suite -- 9 topics, 3 domains, progress tracking.

| Field | Value |
|-------|-------|
| Command | `/brewdoc:guide` |
| Model | haiku |
| Arguments | `[topic]` |

## Overview

Guide walks you through every feature of the plugin suite across three progressive domains: Getting Started (overview, installation), Core Workflow (spec/plan/start, teams, skills catalog), and Mastery (agents, custom creation, power features). It tracks your progress, supports multiple languages (EN/RU/PT), and adapts to your level. Read-only -- never modifies project files.

## Quick Start

```bash
/brewdoc:guide                  # Interactive menu
/brewdoc:guide overview         # Jump to a specific topic
/brewdoc:guide killer-flow      # Spec/Plan/Start pipeline
/brewdoc:guide agents-catalog   # All 18 agents
```

## Topics

| Domain | Topic | Description |
|--------|-------|-------------|
| A: Getting Started | overview | Four plugins philosophy and what makes the suite unique |
| A: Getting Started | installation | Marketplace setup, installing plugins, verifying versions |
| B: Core Workflow | killer-flow | The infinite task pipeline: spec, plan, start |
| B: Core Workflow | teams | Dynamic agent teams with self-selection and tracking |
| B: Core Workflow | skills-catalog | All 28 skills with trigger examples |
| C: Mastery | agents-catalog | All 18 agents with roles and model selection |
| C: Mastery | customization | Create custom skills, agents, and hooks |
| C: Mastery | integration | CLAUDE.md, rules, memory, teams directory |
| C: Mastery | advanced | Grepai, convention, quorum review, secrets scanning |

## Progress Tracking

Progress is saved to `.claude/brewdoc/guide-progress.json` (project-relative) and persists across sessions. If the project directory is not writable, the script falls back to `${BD_PLUGIN_DATA}/guide-progress.json` for interactive sessions. Returning users see completion status and a recommendation for the next topic. Partial matching works for topic names.

## Documentation

Full docs: [guide](https://doc-claude.brewcode.app/brewdoc/guide/)
