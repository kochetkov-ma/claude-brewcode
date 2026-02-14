---
name: brewcode:secrets-scan
description: Scans all git-tracked files for leaked secrets and credentials. Use when - scanning for secrets, security audit, finding leaked credentials. Trigger keywords - secrets scan, find credentials, security scan, leaked keys, security audit.
user-invocable: true
allowed-tools: [Read, Task, Write, Bash, AskUserQuestion]
argument-hint: "[--fix] — no args = scan only, --fix = interactive remediation"
model: sonnet
---

# Secrets Scan

<phase name="1-setup">

## Phase 1: Setup

**EXECUTE** using Bash tool:
```bash
git rev-parse --is-inside-work-tree 2>/dev/null || { echo "ERROR: Not git repo"; exit 1; }
REPO=$(git rev-parse --show-toplevel) && cd "$REPO"
TS=$(date +%Y%m%d-%H%M%S)
DIR="$REPO/.claude/reports/${TS}_secrets-scan" && mkdir -p "$DIR"
git ls-files > "$DIR/files.txt"
echo "DIR=$DIR|REPO=$REPO|TS=$TS|TOTAL=$(wc -l < "$DIR/files.txt" | tr -d ' ')"
cat "$DIR/files.txt"
```

> **STOP if ERROR** — must run in git repository.

</phase>

<phase name="2-parallel-scan">

## Phase 2: Split & Launch 10 Agents

1. Parse file list → split into 10 chunks (`ceil(total/10)`)
2. Send 10 Task calls in parallel (single message)

Config: `Task(subagent_type="general-purpose", model="haiku", description="Agent N/10 scan")`

<agent-prompt>
Agent {N}/10 secrets scanner.

FILES: {FILES}

Read each file → detect secrets → return JSON.

PATTERNS:
| Category | Match |
|----------|-------|
| Passwords | `password/passwd/secret/pwd` + `=` or `:` |
| API Keys | `api_key`, `access_key`, `apikey`, `api_secret` |
| Tokens | `token`, `bearer`, `auth_token`, `access_token` |
| AWS | `AKIA[0-9A-Z]{16}`, `aws_secret`, `aws_access_key` |
| DB URLs | `jdbc/mongodb/mysql/postgres` with credentials |
| Keys | `-----BEGIN.*PRIVATE KEY-----`, `client_secret`, `encryption_key` |

CRITICALITY:
| Level | Criteria |
|-------|----------|
| CRITICAL | Real credentials, private keys, DB connection strings |
| HIGH | Real API keys/tokens, AWS creds |
| MEDIUM | Suspicious hardcoded values |
| LOW | Placeholders: `changeme`, `YOUR_KEY`, `xxx`, `dummy` |

SKIP: env refs (`process.env.*`, `${VAR}`, `os.getenv()`), placeholders, docs/comments.

OUTPUT (JSON):
```json
{"agent":{N},"scanned":["f1","f2"],"skipped":[{"path":"x","reason":"binary"}],"findings":[{"path":"f","line":1,"content":"pwd=x","desc":"Hardcoded pwd","crit":"HIGH"}]}
```
No findings: `"findings":[]`
</agent-prompt>

</phase>

<phase name="3-merge">

## Phase 3: Merge Results

1. Collect 10 JSON responses
2. Parse each (handle errors gracefully)
3. Merge `scanned[]`, `skipped[]`, `findings[]`
4. Dedupe by `path+line`
5. Sort: CRITICAL → HIGH → MEDIUM → LOW

</phase>

<phase name="4-report">

## Phase 4: Generate Report

Write `{DIR}/report.md`:

<report-template>
# Secrets Scan Report

**Scan:** {TS} | **Repo:** {REPO} | **Files:** {TOTAL} | **Agents:** 10

## Summary

| Metric | Count |
|--------|-------|
| Scanned | {N} |
| Skipped | {N} |
| CRITICAL | {N} |
| HIGH | {N} |
| MEDIUM | {N} |
| LOW | {N} |

## Findings

### CRITICAL ({N})
| # | File | Line | Content | Description |
|---|------|------|---------|-------------|
{ROWS}

### HIGH / MEDIUM / LOW
(same table format)

## Agent Stats

| Agent | Assigned | Scanned | Findings |
|-------|----------|---------|----------|
| 1-10 | ... | ... | ... |
| **Total** | {N} | {N} | {N} |

## File Inventory

### Scanned ({N})
| # | Path | Agent |
|---|------|-------|
{ALL}

### Skipped ({N})
| # | Path | Reason |
|---|------|--------|
{SKIP}
</report-template>

</phase>

<phase name="5-summary">

## Phase 5: Display Summary

```
## Secrets Scan Complete

| Metric | Value |
|--------|-------|
| Files | {N} |
| CRITICAL | {N} |
| HIGH | {N} |
| MEDIUM | {N} |
| LOW | {N} |

Report: {DIR}/report.md
```

</phase>

<phase name="6-fix">

## Phase 6: Fix Mode

Trigger: `--fix` arg OR CRITICAL/HIGH findings exist → AskUserQuestion

| Option | Action |
|--------|--------|
| Fix interactively | Review each: delete, move to env var, add to .gitignore, skip, mark false positive |
| Add to .gitignore | Append paths |
| Skip | Done |

</phase>
