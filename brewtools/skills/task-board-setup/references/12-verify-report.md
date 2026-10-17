# 12 -- P5: verify + report

Run after P4 on a fresh init (never in PU/PE/PR). `TARGET` = the absolute path resolved in P0; shell
state does not survive between calls, so each block sets it.

**EXECUTE** using Bash tool:
```bash
TARGET="<absolute path resolved in P0>"
test -n "$TARGET" && test -d "$TARGET" || { echo "MISS TARGET unresolved -- re-resolve per P0"; exit 1; }
for p in .claude/agents/task-tracker.md .claude/skills/task-board/SKILL.md .claude/rules/tasks.md \
  .claude/features/board.md .claude/features/PROGRESS.md .claude/features/TRACKER.md \
  .claude/features/METHODOLOGY.md .claude/features/ANTI-DRIFT.md .claude/features/task-graph.md \
  .claude/features/TASK_TEMPLATE.md .claude/features/INDEX.md .claude/features/backlog/README.md; do
  test -f "$TARGET/$p" && echo "OK  $p" || echo "MISS $p"
done
for d in backlog todo progress closed specs; do
  test -d "$TARGET/.claude/features/$d" && echo "OK  folder $d" || echo "MISS folder $d"
done
```

**If `SPEC_MODE=on`**, also **EXECUTE** using Bash tool:
```bash
TARGET="<absolute path resolved in P0>"
test -n "$TARGET" && test -d "$TARGET" || { echo "MISS TARGET unresolved -- re-resolve per P0"; exit 1; }
for p in .claude/skills/task-spec/SKILL.md \
  .claude/features/specs/SPEC_TEMPLATE.md .claude/features/specs/DESIGN_TEMPLATE.md; do
  test -f "$TARGET/$p" && echo "OK  $p" || echo "MISS $p"
done
```
> If `SPEC_MODE=off`, skip that loop -- and assert the inverse: none of those three paths may exist.

**Leftover-placeholder gate**, both brace families (the generator's `{{` + uppercase-name tokens and the four single-brace metadata tokens), in both modes. It scans the 15 files P2-P4b emit (absent ones skipped, so `SPEC_MODE=off` needs no branch), never the 4c sweep's migrated docs under `backlog/`, `todo/`, `progress/`, `closed/`: user content that may quote `${{ secrets.X }}`. A grep error or zero files scanned is a `MISS`, never a pass. Byte-identical to `10-upgrade.md` U6's block (lockstep: `brewcode/skills/setup-status/tests/task-board-leftover-gate.mjs`). **EXECUTE** using Bash tool:
```bash
TARGET="<absolute path resolved in P0>"
test -n "$TARGET" && test -d "$TARGET" || { echo "MISS TARGET unresolved -- re-resolve per P0"; exit 1; }
gen=()
for rel in .claude/features/board.md .claude/features/TRACKER.md .claude/features/INDEX.md \
           .claude/features/PROGRESS.md .claude/features/backlog/README.md \
           .claude/features/METHODOLOGY.md .claude/features/ANTI-DRIFT.md .claude/features/task-graph.md \
           .claude/agents/task-tracker.md .claude/rules/tasks.md \
           .claude/skills/task-board/SKILL.md .claude/skills/task-spec/SKILL.md \
           .claude/features/TASK_TEMPLATE.md .claude/features/specs/SPEC_TEMPLATE.md .claude/features/specs/DESIGN_TEMPLATE.md; do
  if test -f "$TARGET/$rel"; then gen+=("$TARGET/$rel"); fi
done
test "${#gen[@]}" -gt 0 || { echo "MISS no generated file found -- gate did NOT run"; exit 1; }
LEFT="$(LC_ALL=C grep -nHE '\{\{[A-Z]|\{(PLUGIN_VERSION|CONTENT_VERSION|GENERATED_BY|LAST_UPDATED)\}' "${gen[@]}")"; rc=$?
test "$rc" -le 1 || { echo "MISS grep rc=$rc -- gate did NOT run"; exit 1; }
test -z "$LEFT" && echo "OK  no leftover placeholders" \
  || { echo "MISS leftover placeholders:"; echo "$LEFT"; }
```
> A clean run PRINTS `OK  no leftover placeholders`. No output at all = the block did not run, !=PASS -- fix the block and re-run. Every `MISS` hit names a generated file: re-substitute that line, never touch a migrated card.

**Prompt-contract gate.** Every emitted skill must carry the workspace prompt contract: the
`argument-hint` starts with `[prompt]` and the body contains a `PLAN — ` block. **EXECUTE** using Bash tool:
```bash
TARGET="<absolute path resolved in P0>"
test -n "$TARGET" && test -d "$TARGET" || { echo "MISS TARGET unresolved -- re-resolve per P0"; exit 1; }
FAIL=0
for f in "$TARGET/.claude/skills/task-board/SKILL.md" "$TARGET/.claude/skills/task-spec/SKILL.md"; do
  test -f "$f" || continue
  grep -qE '^argument-hint: "\[prompt\]' "$f" && echo "OK  hint $f" || { echo "MISS hint $f"; FAIL=1; }
  grep -q '^PLAN — ' "$f" && echo "OK  PLAN $f" || { echo "MISS PLAN block $f"; FAIL=1; }
done
test "$FAIL" -eq 0 && echo "OK prompt contract" || echo "FAIL prompt contract"
```

> Any `MISS` (from any gate above -- existence, leftover-placeholder, prompt-contract) -> re-emit the missing artifact, re-substitute the leftover placeholder, or fix the offending hint/PLAN block, before finishing.

Report to the user:
- the 12 baseline paths created (+ 5 folders); `SPEC_MODE=on` adds 3 more
- DOMAINS, EXCLUSIONS, REL_STYLE, LANG used
- **`SPEC_MODE`** (`on`/`off`) and, when `on`, the `{{DOMAIN_AGENTS}}` table actually baked into the emitted `task-spec` skill (agent | domains | specialty) plus `ARCHITECT_AGENT`
- **`AGENT_GAPS`** -- every domain with NO owning agent, which therefore falls back to the built-in `Plan`. Always print this, even when empty (`AGENT_GAPS: none`). A hidden gap is a silently weaker design phase. Non-empty -> suggest `/brewcode:agents` to author the missing domain agents, then re-run `/brewtools:task-board-setup upgrade <path>`
- the sweep manifest counts: docs migrated (by status) / docs trashed / board rows authored -- so a silent no-op sweep is visible
- next step: `/task-board` to view, or just start a task (the new rule runs `task-tracker` at task start). `SPEC_MODE=on` -> also `/task-spec <ID>` for any non-trivial task
- if P5.5 ran: CLAUDE.md lines before->after (vs ~200 optimal / 300 over), local-only items moved to CLAUDE.local.md, modules split into nested CLAUDE.md, rules deduped, the `/brewtools:text-optimize` run (or the commands listed when skipped)

> Do not commit: committing is the user's action.
