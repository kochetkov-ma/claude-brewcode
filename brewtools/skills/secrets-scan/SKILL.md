---
name: secrets-scan
description: Scans git-tracked files for leaked secrets. Triggers - secrets scan, find credentials, leaked keys, security audit.
user-invocable: true
disable-model-invocation: true
argument-hint: "[prompt] [--fix] — no args = scan only, --fix = interactive remediation"
allowed-tools: [Read, Agent, Write, Bash, AskUserQuestion]
model: sonnet
license: MIT
---

# Secrets Scan

## Prompt contract

`$ARGUMENTS` is one free-form RU/EN prompt; mode tokens and flags may sit anywhere in it.

| Mode | EN keywords | RU keywords | Mutates? |
|------|-------------|-------------|----------|
| `scan` | *(empty)*, scan, check, audit, find | скан, проверь, аудит, найди | no |
| `fix` | fix, remediate, clean up, `--fix` | почини, исправь, зафикси | yes |

1. Mode: explicit `--fix` resolves to `fix`; an explicit mode token wins outright; else the most
   distinct whole-word keyword hits (table above), tie -> `scan` (read-only wins). No hit or empty ->
   `scan`.
2. Scope: prose that is not a mode/flag is still input: treat it as scope narrowing (e.g. "scan the api
   folder") if the skill supports it, otherwise ignore for routing and scan the full repo.
3. Ask: no routing question. `fix` is also auto-offered (not auto-run) whenever CRITICAL/HIGH findings
   exist, per Phase 6 — that findings-triage offer is the outcome-changing `AskUserQuestion`, not a
   second resolution pass, and it requires approval before any remediation.

Print once, before Phase 1's first action (labels literal, values in the conversation language);
fill scope from the requested repository, then use the returned file list without repeating the PLAN:

```
PLAN — brewtools:secrets-scan
INPUT:  <arguments verbatim, or "(empty)">
MODE:   <resolved> — <explicit | matched keyword: X | default>
SCOPE:  <resolved paths / target / level / flags>
DO:     <2-5 imperative bullets>
RESULT: <what the user ends up holding>
```

<phase name="1-setup">

## Phase 1: Setup

**EXECUTE** using Bash tool:
```bash
bash "${CLAUDE_SKILL_DIR}/scripts/scan-init.sh" && echo "OK init" || echo "FAILED init"
```

> **STOP if `FAILED init`** — must run in a git repository.

It creates the report dir (`umask 077` + `chmod 700`) and the git-tracked list `{DIR}/files.txt`
(`chmod 600`), appends `.claude/reports/` to `.gitignore` when nothing ignores it, and prints
`DIR=..|REPO=..|TS=..|TOTAL=..|GITIGNORE=appended|already-ignored`. Tell the user the `GITIGNORE=`
value: the report maps where credentials live and must never be committable.

Each Bash call starts a fresh shell: substitute the printed `DIR` value into every later command.

**EXECUTE** using Bash tool:
```bash
cat "{DIR}/files.txt"
```

</phase>

<phase name="2-parallel-scan">

## Phase 2: Split & Launch 10 Agents

Split the file list into chunks of `ceil(total/10)` paths; send one Agent call per chunk, all in ONE message:
`Agent(subagent_type="general-purpose", model="haiku", description="Agent N/10 scan")`

### Delegation

Every spawn brief carries six labeled fields, since a subagent starts with an empty context: GOAL (task + why), ROLE (owns, must not touch), SCOPE (paths/commands in and out), CONTEXT (done, by whom, in parallel), CONSUMER (who uses the result + its shape), DONE (acceptance + return: verdict first, evidence, bounded; long output to a file, path returned).

The prompt below is that brief; reuse it verbatim per chunk, filling `{N}`, `{FILES}`, `{REPO}`, `{DIR}`.

<agent-prompt>
Agent {N}/10 secrets scanner.

GOAL: find leaked credentials before they reach a remote. You own chunk {N} of the git-tracked
file list; the merged report depends on your JSON.

ROLE: read + classify only. Edit, delete, redact or rewrite no repo file; scan nothing outside your chunk.

SCOPE: exactly these files — not git history, not .git/, no other path.
FILES: {FILES}

CONTEXT: repo root {REPO}. The list is already filtered (binary/media files, vendor + build dirs,
lock files dropped) — do not re-discover or re-filter it. `git ls-files` returns files that are tracked AND
`.gitignore`d: every path in your chunk is live. Sibling agents scan the other chunks. Patterns,
criticality ladder and skip rules below are final.

CONSUMER: the skill merges all chunks into one report the user triages before pushing. Every path
in FILES must appear exactly once across `scanned[]` + `skipped[]`; a chunk that breaks this, or
returns malformed JSON or prose around it, is re-spawned once, then marked UNSCANNED, which blocks
the clean verdict for the whole repo.

REDACTION (mandatory): never quote, echo, paste or summarise a matched secret value — not in
the JSON, not in prose, not in a thought. For each hit run
`node "${CLAUDE_SKILL_DIR}/scripts/redact.mjs" "<path>" <line>` and copy its `match_len`, `sha256_12` and
`preview` fields verbatim into the finding. `status:"SKIP_ENV_REF"` or `status:"NO_MATCH"`: drop the
finding; the file counts as scanned. Any other status is a wrong path or line: fix the call, never
quote the value instead.

DONE: return only the JSON under OUTPUT — no prose, no fence. If a return-size guard bounces it,
write the same JSON to `{DIR}/agent-{N}.json` and reply only `FILE {DIR}/agent-{N}.json`.

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
{"agent":{N},"scanned":["f1","f2"],"skipped":[{"path":"x","reason":"binary"}],"findings":[{"path":"f","line":1,"category":"Passwords","match_len":12,"sha256_12":"a1b2c3d4e5f6","preview":"hunt***","desc":"Hardcoded pwd","crit":"HIGH"}]}
```
No findings: `"findings":[]`.
</agent-prompt>

</phase>

<phase name="3-reconcile">

## Phase 3: Reconcile & Merge

Account for every chunk before merging: a vanished chunk leaves ~10% of the repo unread while Summary still claims `Files: {TOTAL}`.

1. Write each agent's JSON to `{DIR}/agent-{N}.json` (a `FILE` reply already did) and its chunk
   to `{DIR}/assigned-{N}.txt`, one path per line.
2. **EXECUTE** using Bash tool, per agent:
   ```bash
   node "${CLAUDE_SKILL_DIR}/scripts/reconcile.mjs" "{DIR}/assigned-{N}.txt" "{DIR}/agent-{N}.json"; echo "rc=$?"
   ```
   `rc=0` `OK` → accept. `rc=1` `MISMATCH` (`missing[]`/`extra[]`) or `rc=2` `MALFORMED` → step 3.
3. Re-spawn that ONE chunk once, with the identical prompt; reconcile again.
4. Still not `OK` → record the chunk as `UNSCANNED` with its `missing[]` paths.
5. Merge `scanned[]`, `skipped[]`, `findings[]` of reconciled chunks only; dedupe by `path+line`;
   sort CRITICAL → HIGH → MEDIUM → LOW.

> Any `UNSCANNED` chunk makes the whole scan `INCOMPLETE`, never `clean` (Phase 4 + Phase 5).

</phase>

<phase name="4-report">

## Phase 4: Generate Report

Write `{DIR}/report.md`, then restrict it, since it maps where credentials live:

**EXECUTE** using Bash tool:
```bash
chmod 600 "{DIR}/report.md" && echo "OK perms" || echo "FAILED perms"
```

<report-template>
# Secrets Scan Report

**Scan:** {TS} | **Repo:** {REPO} | **Files:** {TOTAL} | **Agents:** 10
**Verdict:** {CLEAN | FINDINGS | INCOMPLETE}

> Values are redacted by construction: `Fingerprint` is `sha256(value)[:12]`, `Preview` reveals at
> most 4 leading characters, `Len` is the character count. The raw value is never stored here.

## Summary

| Metric | Count |
|--------|-------|
| Scanned | {N} |
| Skipped | {N} |
| Unscanned | {N} |
| CRITICAL | {N} |
| HIGH | {N} |
| MEDIUM | {N} |
| LOW | {N} |

## Findings

### CRITICAL ({N})
| # | File | Line | Category | Len | Fingerprint | Preview | Description |
|---|------|------|----------|-----|-------------|---------|-------------|
{ROWS}

### HIGH / MEDIUM / LOW
(same table format)

## Agent Stats

| Agent | Assigned | Accounted | Reconciled | Findings |
|-------|----------|-----------|------------|----------|
| 1-10 | ... | ... | OK / UNSCANNED | ... |
| **Total** | {N} | {N} | {N} | {N} |

## Unscanned ({N})

Only when a chunk failed reconciliation twice. These paths were never read, so the scan is
INCOMPLETE and is no pre-push clearance.

| # | Path | Agent | Reason |
|---|------|-------|--------|
{UNSCANNED}

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
## Secrets Scan Complete — {CLEAN | FINDINGS | INCOMPLETE}

| Metric | Value |
|--------|-------|
| Files | {N} |
| Unscanned | {N} |
| CRITICAL | {N} |
| HIGH | {N} |
| MEDIUM | {N} |
| LOW | {N} |

Report: {DIR}/report.md (mode 600)
```

Verdict rule: any UNSCANNED chunk → `INCOMPLETE`; else any finding → `FINDINGS`; else `CLEAN`.
`CLEAN` means no pattern matched in the current tracked worktree, not that the repo is safe.
Never call a scan with UNSCANNED chunks clean, and never restate a redacted value in the chat summary.

</phase>

<phase name="6-fix">

## Phase 6: Fix Mode

Trigger: `--fix` arg OR CRITICAL/HIGH findings exist → AskUserQuestion

| Option | Action |
|--------|--------|
| Fix interactively | Review each: delete, move to env var, add to .gitignore, skip, mark false positive |
| Add to .gitignore | Append paths, then `git rm --cached <path>`: ignoring alone leaves a tracked file tracked |
| Skip | Done |

A value that was ever committed stays in git history: tell the user to rotate it.

</phase>
