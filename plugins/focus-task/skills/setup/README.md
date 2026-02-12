# Setup Skill

## What It Does

Analyzes your project structure, tech stack, testing framework, and existing agents to generate a customized `PLAN.md.template` in `.claude/tasks/templates/`. This template is used by the focus-task plugin to execute multi-phase tasks tailored to your specific project.

## How to Invoke

```
/focus-task:setup
```

Optionally provide a path to a universal template to adapt:

```
/focus-task:setup ~/.claude/templates/PLAN.md.template
```

## What It Creates

| File | Purpose |
|------|---------|
| `.claude/tasks/templates/PLAN.md.template` | Customized task plan template |
| `.claude/tasks/templates/SPEC.md.template` | Spec template for focus-task |
| `.claude/tasks/templates/KNOWLEDGE.jsonl.template` | Knowledge base template |
| `.claude/tasks/cfg/focus-task.config.json` | Runtime configuration |
| `.claude/skills/focus-task-review/SKILL.md` | Project-specific review skill |

## Example

Run setup in a Java/Spring Boot project:

```bash
/focus-task:setup
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

Use focus-task to create and execute multi-phase tasks:

```
/focus-task:spec "Implement user authentication"
/focus-task:plan
/focus-task:start
```

## Re-run

Re-run setup anytime your project structure changes:
- New agents added
- Test framework updated
- Database or ORM changed
