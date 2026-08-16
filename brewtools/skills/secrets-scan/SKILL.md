---
name: secrets-scan
description: Scans git-tracked files for leaked secrets. Triggers - secrets scan, find credentials, leaked keys, security audit.
user-invocable: true
disable-model-invocation: true
argument-hint: "[prompt] [--fix] — no args = scan only, --fix = interactive remediation"
allowed-tools: [Read, Agent, Write, Bash, AskUserQuestion]
model: sonnet
---

# Secrets Scan

## Prompt contract

Position 1 of `$ARGUMENTS` is a **free-form prompt** (RU/EN) — modes and flags are optional and may
follow in any order. Nobody types keys: resolve mode + scope FROM the prompt.

| Mode | EN keywords | RU keywords | Mutates? |
|------|-------------|-------------|----------|
| `scan` | *(empty)*, scan, check, audit, find | скан, проверь, аудит, найди | no |
| `fix` | fix, remediate, clean up, `--fix` | почини, исправь, зафикси | yes |

1. Strip flags (`--fix` is a flag, not free text). An explicit mode token anywhere wins outright.
2. Else score modes by distinct whole-word keyword hits (table above). Highest unique score wins;
   tie -> `scan` (read-only wins). All zero -> `scan`.
3. Empty arguments -> `scan`; it is read-only and asks nothing.
4. `fix` is also auto-offered (not auto-run) whenever CRITICAL/HIGH findings exist, per Phase 6 —
   that offer is the outcome-changing `AskUserQuestion`, not a second resolution pass.
5. Prose that is not a mode/flag is still input: treat it as scope narrowing (e.g. "scan the api
   folder") if the skill supports it, otherwise ignore for routing and scan the full repo.

Then print this block ONCE, before the first action:

```
PLAN — brewtools:secrets-scan
INPUT:  <arguments verbatim, or "(empty)">
MODE:   <resolved> — <explicit | matched keyword: X | default>
SCOPE:  <resolved paths / target / level / flags>
DO:     <2-5 imperative bullets>
RESULT: <what the user ends up holding>
```

Labels are literal; values follow the conversation language. Print it at the end of Phase 1,
once the file list is known, before Phase 2 spawns the scan agents.

<phase name="1-setup">

## Phase 1: Setup

**EXECUTE** using Bash tool:
```bash
bash "${CLAUDE_SKILL_DIR}/scripts/scan-init.sh" && echo "OK init" || echo "FAILED init"
```

The script resolves the repo root, creates the report dir under `umask 077` + `chmod 700`, appends
`.claude/reports/` to `.gitignore` when nothing already ignores it, and writes the git-tracked file
list to `{DIR}/files.txt` (`chmod 600`). It prints one line:
`DIR=..|REPO=..|TS=..|TOTAL=..|GITIGNORE=appended|already-ignored`.

> **Why the `.gitignore` line.** The report names where credentials live. `.claude/` is ignored in
> some repos only by a personal global excludes file — in a consumer repo `.claude/reports/` is
> committable, so the scan would publish its own findings. Report the `GITIGNORE=` value to the user.

Substitute the printed `DIR` value into every later command — the Bash tool starts a fresh shell
each call, so nothing set by this script survives into the next block.

**EXECUTE** using Bash tool to read the chunk source:
```bash
cat "{DIR}/files.txt"
```

> **STOP if `FAILED init`** — must run in a git repository.

</phase>

<phase name="2-parallel-scan">

## Phase 2: Split & Launch 10 Agents

1. Parse file list → split into 10 chunks (`ceil(total/10)`)
2. Send 10 Task calls in parallel (single message)

Config: `Task(subagent_type="general-purpose", model="haiku", description="Agent N/10 scan")`

### Delegation

A big task handed to one agent = an agent gone for an hour: you cannot observe it, cannot correct it, and it usually drifts off-target. The 10-way split IS the sizing rule: one subagent = ONE bounded unit — ONE chunk, ~<=10 steps. A repo big enough that a chunk still exceeds that gets more chunks, not bigger ones; all Task calls go out in ONE message.

Every spawn prompt MUST carry:

| Field | Content |
|-------|---------|
| GOAL | the overall task and why it exists — the point beyond the file edit |
| ROLE | what this agent owns; what it must NOT touch |
| SCOPE | exact paths/commands in bounds + explicit out-of-bounds |
| CONTEXT | what is already done, by whom, what runs in parallel — trimmed to what THIS agent needs |
| CONSUMER | who or what uses the result next, and the shape it must fit |
| DONE | acceptance criteria + the exact report shape you want back |

A bare one-line task is never enough. The prompt below is that shape; reuse it verbatim per chunk.

<agent-prompt>
Agent {N}/10 secrets scanner.

GOAL: auditing this repo for leaked credentials before they reach a remote. Ten agents split
the git-tracked file list; you own chunk {N} and the merged report depends on your JSON.

ROLE: read + classify only. Do NOT edit, delete, redact, or rewrite any file. Do NOT scan
files outside your chunk.

SCOPE: in — exactly these files. Out — every other path in the repo, git history, .git/.
FILES: {FILES}

CONTEXT: repo root {REPO}. The file list was already produced from git-tracked files and
filtered in Phase 1 (binary/media extensions, vendor + build dirs, lock files dropped) — do
not re-discover or re-filter it. `git ls-files` still returns files that are tracked AND
`.gitignore`d, so treat every path in your chunk as live.
Nine sibling agents are scanning chunks 1..10 of that same list in parallel right now.
Patterns, criticality ladder and skip rules below are final — do not invent extra categories.

CONSUMER: the skill merges the ten JSON objects into one Secrets Report the user triages
before pushing. Every path in FILES must appear exactly once across `scanned[]` + `skipped[]`;
the skill checks that invariant and re-spawns a chunk that fails it. Malformed JSON, or any
prose around it, makes your chunk UNSCANNED and blocks the clean verdict for the whole repo.

REDACTION (mandatory): never quote, echo, paste or summarise a matched secret value — not in
the JSON, not in prose, not in a thought. For each hit run
`node ${CLAUDE_SKILL_DIR}/scripts/redact.mjs <path> <line>` and copy its `match_len`, `sha256_12` and
`preview` fields verbatim into your finding. `status:"SKIP_ENV_REF"` means it is an env
reference — drop the finding. `status:"NO_MATCH"` means no pattern fired on that line — drop
it too, and count the file as scanned.

DONE: the JSON object specified under OUTPUT, nothing else. No prose, no markdown fence.

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
No findings: `"findings":[]`. There is no field for the raw value — a finding carrying one is a
defect, not a better report.
</agent-prompt>

</phase>

<phase name="3-reconcile">

## Phase 3: Reconcile & Merge

Every chunk is accounted for before anything is merged. A chunk that silently vanishes is the
failure this phase exists to prevent: the Summary would still print `Files: {TOTAL}` while ~10% of
the repo was never read.

1. Write each agent's raw JSON to `{DIR}/agent-{N}.json` and its assigned chunk to
   `{DIR}/assigned-{N}.txt` (one path per line).
2. **EXECUTE** using Bash tool, per agent:
   ```bash
   node "${CLAUDE_SKILL_DIR}/scripts/reconcile.mjs" "{DIR}/assigned-{N}.txt" "{DIR}/agent-{N}.json"; echo "rc=$?"
   ```
   `rc=0` `OK` → accept. `rc=1` `MISMATCH` (paths in `missing[]`/`extra[]`) or `rc=2` `MALFORMED`
   (unparsable JSON, missing `scanned[]`/`skipped[]`) → step 3.
3. Re-spawn that ONE chunk once, with the identical prompt. Reconcile the new response the same way.
4. Still not `OK` after the re-spawn → record the chunk as `UNSCANNED` with its `missing[]` paths,
   and **refuse the clean verdict** for the whole scan (Phase 4 + Phase 5).
5. Merge `scanned[]`, `skipped[]`, `findings[]` from the reconciled chunks only.
6. Dedupe by `path+line`
7. Sort: CRITICAL → HIGH → MEDIUM → LOW

> A scan with any `UNSCANNED` chunk is `INCOMPLETE`, never `clean` — regardless of how many
> findings the reconciled chunks returned.

</phase>

<phase name="4-report">

## Phase 4: Generate Report

Write `{DIR}/report.md`, then restrict it — the report is a map of where credentials live:

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

Present only when a chunk failed reconciliation twice. Every path here was NEVER read — the scan
is INCOMPLETE and cannot be used as a pre-push clearance.

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
`CLEAN` means "no pattern matched in the current tracked worktree" — not that the repo is safe.
Never report a scan with UNSCANNED chunks as clean, and never restate a redacted value in the chat
summary either.

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
