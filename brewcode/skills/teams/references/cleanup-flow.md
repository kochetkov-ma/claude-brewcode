# Cleanup Flow

## Overview

Interactive cleanup of team framework files. Every destructive action requires user confirmation via AskUserQuestion.

## Order of Operations

1. Overview scan — show sizes
2. Tracking cleanup (if selected)
3. Issues cleanup (if selected)
4. Insights cleanup (if selected)
5. Agents review (if selected)
6. Summary report

## Step 1: Overview Scan

Read all 4 files, calculate entry counts and approximate sizes.

```
AskUserQuestion:
  question: |
    Cleanup for team {TEAM_NAME}:
    
    | File | Entries | Size |
    | tracking.md | {N} entries | {KB} |
    | issues.md | {N} entries | {KB} |
    | insights.md | {N} entries | {KB} |
    | Agents | {N} agents | — |
    
    What to clean?
  options:
    - "All — full cleanup"
    - "Tracking only"
    - "Issues + Insights only"
    - "Agents review"
    - "Let me choose step by step"
```

## Step 2: Tracking Cleanup

```
AskUserQuestion:
  question: |
    tracking.md: {N} entries
    Oldest: {date}, Newest: {date}
    
    Options:
  options:
    - "Archive all → tracking-archive.md, start fresh"
    - "Keep last 30 days, archive rest"
    - "Keep last 50 entries, archive rest"
    - "Skip"
```

**Archive logic:**

- Read current tracking.md
- Split into keep/archive based on selection
- Append archived entries to `tracking-archive.md` (create if not exists) with date header
- Rewrite tracking.md with header + kept entries
- Archive files are append-only; add date separator: `## Archived: {DATE}`

## Step 3: Issues Cleanup

Same pattern as tracking. Options:

- "Archive all resolved -> issues-archive.md"
- "Keep last 30 days"
- "Keep only high/critical"
- "Skip"

## Step 4: Insights Cleanup

Options:

- "Archive all -> insights-archive.md, start fresh"
- "Keep last 30 days"
- "Keep actionable only (architecture, security, performance)"
- "Skip"

## Step 5: Agents Review

Show inactive/problematic agents:

```
AskUserQuestion:
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

If "per agent" -- loop AskUserQuestion for each:

```
AskUserQuestion:
  question: "Agent {name}: {domain}, last active {date}, {N} tasks total. Delete?"
  options: ["Delete", "Keep"]
```

On delete:

1. Remove `.claude/agents/{name}.md`
2. Update team.md: set status to `removed`
3. Record in tracking.md: `| date | system | removed {name} | completed | cleanup |`

## Step 6: Summary

Output report:

```
# Cleanup Summary: {TEAM_NAME}

| Action | Details |
|--------|---------|
| Tracking | Archived {N} entries |
| Issues | Archived {N} entries |
| Insights | Archived {N} entries |
| Agents removed | {list or "none"} |
| Archive files | {list of created archives} |
```

## Archive File Format

Archive files live in `.claude/teams/{TEAM_NAME}/` alongside originals.

```markdown
## Archived: YYYY-MM-DD

| ... original table headers ... |
| ... archived rows ... |
```

Multiple archives append with new date headers -- never overwrite.
