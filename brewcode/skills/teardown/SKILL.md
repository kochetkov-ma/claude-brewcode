---
name: brewcode:teardown
description: "Removes brewcode project files (templates, configs, logs); --full wipes all state. Triggers: teardown, cleanup."
disable-model-invocation: true
argument-hint: "[--dry-run] [--full]"
allowed-tools: Bash, Read, AskUserQuestion
context: fork
model: haiku
---

<instructions>

## Execution

**Skill arguments received:** `$ARGUMENTS`

### Argument Parsing

Detect flags in `$ARGUMENTS`:
- `--dry-run` present -> dry-run mode (no deletion)
- `--full` present -> FULL PURGE mode (see below)
- Neither -> default teardown

> If `--full` is NOT present, behavior is identical to previous versions. Skip to "Default Teardown".

### Full Purge Mode (`--full`)

> WARNING: DESTRUCTIVE (PARTIALLY recoverable). `claude project purge` (Claude Code 2.1.115+) wipes ALL per-project state including `.claude/`, project memory, and session data. The automatic backup captures ONLY the project `.claude/` directory — Claude Code session history and auto-memory under `~/.claude/projects/<projectHash>/` are NOT backed up and CANNOT be recovered after purge. You must restore the `.claude/` backup MANUALLY.

**Step 1 — Typed confirmation (INLINE PROMPT, NOT AskUserQuestion).**

Output literally this prompt to the user as plain text in the conversation:

> ⚠️ DESTRUCTIVE — `claude project purge` will wipe ALL per-project state including `.claude/`, project memory, and session data. A backup will be created at `.claude.backup.<timestamp>/` BUT it captures ONLY the project `.claude/` directory. Claude Code session history and auto-memory under `~/.claude/projects/<projectHash>/` are NOT in the backup and are NOT recoverable. You must restore the `.claude/` backup MANUALLY.
>
> Reply with the exact word **PURGE** (uppercase, no surrounding text) to proceed. Anything else aborts.

Then STOP and wait for the user's next message. Inspect that message:
- If the trimmed message equals exactly `PURGE` (case-sensitive) -> proceed to Step 2.
- Otherwise -> output "Aborted — confirmation token mismatch. No changes made." and STOP.

Do NOT use AskUserQuestion (option-button form does not accept free-text typing).

**Step 2 — Version probe.** Verify `claude project purge` is supported on this Claude Code version BEFORE creating any backup.

**EXECUTE** using Bash tool:
```bash
claude project --help 2>&1 | grep -q '\bpurge\b' && echo "OK purge supported" || { echo "FAILED: claude project purge unsupported on this CC version. Aborting --full."; exit 1; }
```

> **STOP if FAILED** — `--full` mode requires Claude Code 2.1.115+. Use default teardown instead.

**Step 3 — Backup `.claude/` BEFORE purge.**

**EXECUTE** using Bash tool:
```bash
TS=$(date +%s); BACKUP=".claude.backup.${TS}"; cp -r .claude "${BACKUP}" && echo "OK backup created: ${BACKUP}" || echo "FAILED backup — aborting, no purge run"
```

> **STOP if FAILED** — do NOT run purge. Likely disk space or permission issue. Investigate and retry.

**Step 4 — Run `claude project purge`.**

**EXECUTE** using Bash tool:
```bash
claude project purge 2>&1 && echo "OK purge complete" || echo "FAILED purge command"
```

**Step 5 — Report backup path and recovery scope** to user so manual restore is possible:
```
Backup location: .claude.backup.<TS>/  (project .claude/ ONLY)
Restore manually with: rm -rf .claude && mv .claude.backup.<TS> .claude

NOT in backup, NOT recoverable: ~/.claude/projects/<projectHash>/
  (Claude Code session JSONL + auto-memory — wiped by `claude project purge`)
```

### Default Teardown

**If NOT `--dry-run` and NOT `--full`:** Use AskUserQuestion to confirm before executing:
> "This will delete brewcode project files (templates, configs, logs, plans). Task directories are preserved. Proceed?"

**EXECUTE** using Bash tool — run teardown script:
```bash
bash "${CLAUDE_SKILL_DIR}/scripts/teardown.sh" ARGS_HERE && echo "✅ done" || echo "❌ FAILED"
```
**IMPORTANT:** Replace `ARGS_HERE` with the actual value from "Skill arguments received" above. If empty, omit the argument. Strip `--full` from args before passing to teardown.sh (script does not know about it).

> **STOP if ❌** — check script path exists and teardown.sh has execute permissions.

## Options

| Option | Behavior |
|--------|----------|
| `--dry-run` | List files to delete without removing them |
| `--full` | DESTRUCTIVE (PARTIALLY recoverable — backup covers `.claude/` only, NOT `~/.claude/projects/<hash>/` session+memory): backup `.claude/` then run `claude project purge` after typed `PURGE` confirmation |
| (none) | Full removal after user confirmation |

## Preserved

Task directories (`.claude/tasks/*_task/`) and user rules (`.claude/rules/`) are always preserved in default mode. `--full` mode preserves NOTHING (except the backup directory).

## Warning — `--full` mode

> DESTRUCTIVE (PARTIALLY recoverable). Backup at `.claude.backup.<timestamp>/` captures ONLY the project `.claude/` directory. Claude Code session history and auto-memory under `~/.claude/projects/<projectHash>/` are ALSO wiped by `claude project purge` but are NOT in the backup and are NOT recoverable. Use only when you intend to fully reset the project.

</instructions>

## Output

```markdown
# Brewcode Teardown

## Detection

| Field | Value |
|-------|-------|
| Arguments | `{received args or empty}` |
| Mode | `{full or dry-run}` |

## Result

Removed:
  ✅ .claude/tasks/templates/
  ✅ .claude/tasks/cfg/
  ✅ .claude/logs/
  ✅ .claude/plans/
  ✅ .grepai/
  ✅ .claude/skills/brewcode-review/

Preserved:
  ⏭️  .claude/tasks/*_task/ (task directories)
  ⏭️  .claude/rules/ (user rules)
```
