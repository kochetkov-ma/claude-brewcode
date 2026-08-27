# Cleanup Flow

## Overview

Interactive cleanup of team trace data and agents. Every destructive action requires user confirmation via AskUserQuestion.

## Order of Operations

1. Overview scan — show sizes
2. Trace cleanup (if selected)
3. Agents review (if selected)
4. Summary report

## Step 1: Overview Scan

Read `trace.jsonl` via `trace-ops.sh read`, calculate entry counts by kind.

```
AskUserQuestion:
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
AskUserQuestion:
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

**EXECUTE** using Bash tool:
```bash
# Example: archive all, start fresh.
# Truncation is LAST on purpose: if an earlier link fails the chain aborts with trace.jsonl intact.
cat ".claude/teams/{TEAM}/trace.jsonl" >> ".claude/teams/{TEAM}/trace-archive.jsonl" && \
bash "${CLAUDE_SKILL_DIR}/scripts/trace-ops.sh" cursor ".claude/teams/{TEAM}" set "" && \
printf '' > ".claude/teams/{TEAM}/trace.jsonl" && \
echo "✅ Archived" || echo "❌ FAILED"
```

## Step 3: Agents Review

Read logical `intent_guard_policy=required|legacy-absent` from the single `Intent guard` field in
`team.md` before building the table. Under `required`,
the roster has exactly one review-only `intent-guard`; exclude it from this step, never list/offer/delete
it, and preserve its row. It writes no trace entries, so 0 tasks is normal. Under `legacy-absent`, the
roster has zero such rows and cleanup must not create a profile or row. Upgrade never changes that policy.

Show inactive/problematic agents (domain agents only):

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

If "per agent" — loop AskUserQuestion for each:

```
AskUserQuestion:
  question: "Agent {name}: {domain}, last active {date}, {N} tasks total. Delete?"
  options: ["Delete", "Keep"]
```

On delete:

0. If `{name}` is `intent-guard` under `required` -> **STOP, do not delete.** Report it as protected and move on. Under `legacy-absent`, seeing that name is a policy violation: delete nothing and report the inconsistent roster.
0b. **Validate `{name}` as an agent id BEFORE any `rm`.** Roster values are interpolated into the delete
   path, so a row like `../../../outside/README` deletes a file outside the project. Same guard
   `toggle-team.sh`/`verify-team.sh` apply — run it, and on a non-zero exit report the row as a corrupt
   roster entry and delete NOTHING:

```bash
printf '%s' "{name}" | grep -qE '^[a-z0-9][a-z0-9-]*$' || { echo "SKIP:invalid agent id"; exit 1; }
```

0c. **Check ownership BEFORE any `rm`.** Same shape as the `intent-guard` exemption above, generalised:
   an agent listed by more than one team is SHARED, and this team's cleanup must not remove it.
   Run from the project root:

```bash
bash "${CLAUDE_SKILL_DIR}/scripts/agent-owners.sh" "{name}"
```

   | Exit | stdout | Do |
   |------|--------|----|
   | 0, 1 line | this team | delete (step 1) |
   | 0, >1 line | several teams | **SKIP** — report `kept: shared with {other teams}`, delete NOTHING |
   | 2 | empty | orphan, no owner — delete (step 1) |
   | 1 | empty, reason on stderr | owners UNKNOWN — **SKIP**, report the stderr reason, delete NOTHING |

1. Remove `.claude/agents/{name}.md` **and** `.claude/agents/{name}.md.disabled` — a member parked by
   `/brewcode:teams-setup disable` lives under the second name, and deleting only the first would
   silently leave the agent behind:

```bash
rm -f ".claude/agents/{name}.md" ".claude/agents/{name}.md.disabled"
```

2. Update team.md: set status to `removed`
3. Record via trace-ops.sh: `bash "${CLAUDE_SKILL_DIR}/scripts/trace-ops.sh" add ".claude/teams/{TEAM}" "$SID" "system" "track" "completed" "removed {name}: cleanup"`

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

## Step P: Purge (mode `purge` only)

Total removal, run ONLY after the explicit "Yes, purge" confirmation in SKILL.md Mode: PURGE.
Nothing is archived — the archive itself is part of what goes.

1. Enumerate first, so the confirmation names real files:

```bash
ls -la ".claude/teams/{TEAM}" 2>/dev/null; du -sh ".claude/teams/{TEAM}" 2>/dev/null
```

2. Delete each domain agent listed in `team.md` (`## Agents` table, `Kind` != `review-only`). Under
   `required`, **`intent-guard` is skipped** because it is shared with `/brewcode:superreview-setup`;
   report it as kept. Under `legacy-absent`, there is no row or profile to skip and purge must not add
   one. **Every other `{name}` passes the Step 3 id guard first** —
   a roster value that is not `^[a-z0-9][a-z0-9-]*$` is a path, and purge would delete outside
   `.claude/agents/`; report such a row as corrupt and delete nothing for it. **Every `{name}` also passes
   the Step 3 ownership check (step 0c)** — purge is not a licence to take another team's agent with it:

```bash
printf '%s' "{name}" | grep -qE '^[a-z0-9][a-z0-9-]*$' || { echo "SKIP:invalid agent id"; exit 1; }
owners=$(bash "${CLAUDE_SKILL_DIR}/scripts/agent-owners.sh" "{name}"); rc=$?
[ "$rc" = 1 ] && { echo "SKIP:owners unknown"; exit 1; }
[ "$(printf '%s\n' "$owners" | grep -c .)" -gt 1 ] && { echo "SKIP:shared agent"; exit 1; }
rm -f ".claude/agents/{name}.md" ".claude/agents/{name}.md.disabled"
```

> A skipped member is reported in the purge summary as `kept: shared` / `kept: owners unknown`; the team
> dir still goes in step 3. Purge is total for THIS team's data, never for another team's roster.

> Both names, always. A team purged while DISABLED has every member sitting at `{name}.md.disabled`;
> removing only `{name}.md` would report a successful purge and leave the whole roster on disk.

3. Remove the framework dir, trace, archive, cursor and the copied tracer in one go:

```bash
rm -rf ".claude/teams/{TEAM}" && echo "✅ Purged" || echo "❌ FAILED"
```

4. If `.claude/teams/` is now empty, remove it too: `rmdir ".claude/teams" 2>/dev/null || true`
5. Drop the `## Teams` section from CLAUDE.md / CLAUDE.local.md (Epilogue E1).

## Archive File Format

Archive files live in `.claude/teams/{TEAM_NAME}/` alongside `trace.jsonl`.

`trace-archive.jsonl` — same JSONL format as `trace.jsonl`. Entries appended on each cleanup. Multiple cleanups accumulate in the same archive file.
