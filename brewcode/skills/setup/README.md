---
auto-sync: enabled
auto-sync-date: 2026-02-12
auto-sync-type: doc
---

# Setup Skill

## What It Does

Analyzes your project structure, tech stack, testing framework, and existing agents to generate a customized `PLAN.md.template` in `.claude/tasks/templates/`. This template is used by the brewcode plugin to execute multi-phase tasks tailored to your specific project.

## How to Invoke

```
/brewcode:setup
```

Optionally provide a path to a universal template to adapt:

```
/brewcode:setup ~/.claude/templates/PLAN.md.template
```

## What It Creates

| File | Purpose |
|------|---------|
| `.claude/tasks/templates/PLAN.md.template` | Customized task plan template |
| `.claude/tasks/templates/SPEC.md.template` | Spec template for brewcode |
| `.claude/tasks/templates/KNOWLEDGE.jsonl.template` | Knowledge base template |
| `.claude/tasks/cfg/brewcode.config.json` | Runtime configuration |

## Example

Run setup in a Java/Spring Boot project:

```bash
/brewcode:setup
```

The skill detects:
- Language: Java
- Framework: Spring Boot
- Testing: JUnit 5, AssertJ
- Database: PostgreSQL with JPA
- Project agents: db-expert, security-reviewer

It generates templates with:
- Spring Boot-specific verification phases
- JPA/Hibernate best practices
- AssertJ assertion patterns
- Your project's custom agents

## After Setup

Use brewcode to create and execute multi-phase tasks:

```
/brewcode:spec "Implement user authentication"
/brewcode:plan
/brewcode:start
```

## Re-run

Re-run setup anytime your project structure changes:
- New agents added
- Test framework updated
- Database or ORM changed
