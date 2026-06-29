# Framework Files Reference

Templates for `.claude/teams/{TEAM_NAME}/` directory. All placeholders (`{TEAM_NAME}`, `{DATE}`, `{N}`, `{CWD}`) replaced at creation time. DATE format: `YYYY-MM-DD`.

team.md uses Edit tool. trace.jsonl is **append-only** via Bash (`trace-ops.sh add`).

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

## 2. trace.jsonl

Empty file at creation. Agents append via `trace-ops.sh add`.

Format: JSONL — one JSON object per line:

| Field | Required | Description |
|-------|----------|-------------|
| `ts` | auto | ISO8601 UTC timestamp |
| `sid` | yes | Session ID, 8 chars |
| `src` | yes | Agent name |
| `k` | yes | `track` / `issue` / `insight` |
| `s` | track | `took` / `refused` / `completed` / `failed` |
| `sev` | issue | `low` / `medium` / `high` / `critical` |
| `cat` | insight | `pattern` / `architecture` / `performance` / `security` / `convention` / `debt` |
| `txt` | yes | Text, max 100 chars (auto-truncated by trace-ops.sh) |
