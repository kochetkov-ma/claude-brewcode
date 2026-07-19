# Cleanup Flow

## Overview

Interactive cleanup of team trace data and agents. Every destructive action requires user confirmation via request_user_input.

## Order of Operations

1. Overview scan — show sizes
2. Trace cleanup (if selected)
3. Agents review (if selected)
4. Summary report

## Step 1: Overview Scan

Read `trace.jsonl` via `trace-ops.sh read`, calculate entry counts by kind.

```
request_user_input:
  question: |
    Cleanup for team {TEAM_NAME}:
    
    | Data | Entries | Size |
    | trace.jsonl (track) | {N} entries | — |
    | trace.jsonl (issue) | {N} entries | — |
    | trace.jsonl (insight) | {N} entries | — |
    | Total | {N} entries | {KB} |
    | Agents | {N} agents | — |
    
    What to clean?
  options:
    - "All — full cleanup"
    - "Trace data only"
    - "Agents review only"
    - "Let me choose step by step"
```

## Step 2: Trace Cleanup

```
request_user_input:
  question: |
    trace.jsonl: {N} entries
    Oldest: {date}, Newest: {date}
    By kind: track={N}, issue={N}, insight={N}
    
    Options:
  options:
    - "Archive all → trace-archive.jsonl, start fresh"
    - "Keep last 30 days, archive rest"
    - "Keep last 50 entries, archive rest"
    - "Keep only issues + insights, archive track entries"
    - "Skip"
```

**Archive logic:**

- Read current `trace.jsonl`
- Split into keep/archive based on selection
- Append archived entries to `trace-archive.jsonl` (create if not exists)
- Rewrite `trace.jsonl` with kept entries only
- Reset `trace.cursor` via `trace-ops.sh cursor <dir> set ""`

**EXECUTE** using shell:
```bash
# Example: archive all, start fresh
cat ".codex/teams/{TEAM}/trace.jsonl" >> ".codex/teams/{TEAM}/trace-archive.jsonl" && \
printf '' > ".codex/teams/{TEAM}/trace.jsonl" && \
bash "$<plugin-root>/skills/teams/scripts/trace-ops.sh" cursor ".codex/teams/{TEAM}" set "" && \
echo "✅ Archived" || echo "❌ FAILED"
```

## Step 3: Agents Review

Show inactive/problematic agents:

```
request_user_input:
  question: |
    Inactive agents (0 tasks or last activity >30 days):
    | Agent | Last activity | Tasks total |
    | ... | ... | ... |
    
    Action?
  options:
    - "Delete all inactive"
    - "Let me choose per agent"
    - "Keep all"
```

If "per agent" — loop request_user_input for each:

```
request_user_input:
  question: "Agent {name}: {domain}, last active {date}, {N} tasks total. Delete?"
  options: ["Delete", "Keep"]
```

On delete:

1. Remove `.codex/agents/{name}.toml`
2. Update team.md: set status to `removed`
3. Record via trace-ops.sh: `bash "$<plugin-root>/skills/teams/scripts/trace-ops.sh" add ".codex/teams/{TEAM}" "$SID" "system" "track" "completed" "removed {name}: cleanup"`

## Step 4: Summary

Output report:

```
# Cleanup Summary: {TEAM_NAME}

| Action | Details |
|--------|---------|
| Trace entries archived | {N} |
| Trace entries kept | {N} |
| Agents removed | {list or "none"} |
| Archive file | trace-archive.jsonl |
| Cursor | reset |
```

## Archive File Format

Archive files live in `.codex/teams/{TEAM_NAME}/` alongside `trace.jsonl`.

`trace-archive.jsonl` — same JSONL format as `trace.jsonl`. Entries appended on each cleanup. Multiple cleanups accumulate in the same archive file.
