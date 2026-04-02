# Framework Files Reference

Templates for `.claude/teams/{TEAM_NAME}/` directory. All placeholders (`{TEAM_NAME}`, `{DATE}`, `{N}`, `{CWD}`) replaced at creation time. DATE format: `YYYY-MM-DD`.

All files are **append-only** -- agents add rows via Edit tool, never overwrite.

---

## 1. team.md

```markdown
# Team: {TEAM_NAME}

| Field | Value |
|-------|-------|
| Created | {DATE} |
| Last update | {DATE} |
| Agents | {N} |
| Project | {CWD} |

## Agents

| Agent | Domain | Mission | Status | Updated |
|-------|--------|---------|--------|---------|
```

Status values: `active`, `inactive`, `updating`, `removed`

---

## 2. tracking.md

```markdown
# Tracking: {TEAM_NAME}

| Date | Agent | Task | Status | Comment |
|------|-------|------|--------|---------|
```

Status values: `took`, `refused`, `completed`, `failed`

---

## 3. issues.md

```markdown
# Issues: {TEAM_NAME}

| Date | Agent | Description | Severity |
|------|-------|-------------|----------|
```

Severity values: `low`, `medium`, `high`, `critical`

---

## 4. insights.md

```markdown
# Insights: {TEAM_NAME}

| Date | Agent | Insight | Category |
|------|-------|---------|----------|
```

Category values: `pattern`, `architecture`, `performance`, `security`, `convention`, `debt`
