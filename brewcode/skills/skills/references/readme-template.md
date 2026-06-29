# README Template for Claude Code Skills

> **Instructions for skill-creator agent:**
> - Replace all `{PLACEHOLDERS}` with actual values from the skill being documented
> - Remove sections that don't apply (e.g., Modes for single-mode skills, Arguments if none)
> - Keep README under 100 lines
> - Use actual examples from the skill, not generic ones
> - Files section: only list directories/files that actually exist in the skill
> - After generation, remove this instructions block entirely

---

## Template

```markdown
---
auto-sync: enabled
auto-sync-date: {TODAY}
auto-sync-type: skill
---

# {SKILL_NAME}

> {ONE_LINE_DESCRIPTION}

## Quick Start

`/{SKILL_NAME} {ARGUMENT_HINT}`

## Modes

| Mode | Usage | Description |
|------|-------|-------------|
| {MODE} | `/{SKILL_NAME} {MODE} {ARGS}` | {DESCRIPTION} |

> Omit this section if single-mode skill.

## Arguments

| Argument | Required | Description |
|----------|----------|-------------|
| {ARG} | {YES/NO} | {ARG_DESCRIPTION} |

## Examples

### {EXAMPLE_TITLE}

```
/{SKILL_NAME} {EXAMPLE_ARGS}
```

### {EXAMPLE_TITLE_2}

```
/{SKILL_NAME} {EXAMPLE_ARGS_2}
```

## Workflow

1. {STEP_1}
2. {STEP_2}
3. {STEP_3}

## Output

{DESCRIBE_WHAT_THE_SKILL_PRODUCES — files, reports, artifacts, console output}

## Files

| File | Purpose |
|------|---------|
| SKILL.md | Main skill definition |
| references/ | {REFERENCE_DESC} |
| scripts/ | {SCRIPTS_DESC} |
| tests/ | {TESTS_DESC} |
```
