# 12 -- P5: verify + report

Run after P4 on a fresh init (never in PU/PE/PR). `TARGET` = the absolute path resolved in P0; shell
state does not survive between calls, so each block sets it.

**EXECUTE** using shell:
```bash
TARGET="<absolute path resolved in P0>"
test -n "$TARGET" && test -d "$TARGET" || { echo "MISS TARGET unresolved -- re-resolve per P0"; exit 1; }
for p in .codex/agents/task-tracker.toml .codex/skills/task-board/SKILL.md .codex/rules/tasks.md \
  .codex/features/board.md .codex/features/PROGRESS.md .codex/features/TRACKER.md \
  .codex/features/METHODOLOGY.md .codex/features/ANTI-DRIFT.md .codex/features/task-graph.md \
  .codex/features/TASK_TEMPLATE.md .codex/features/INDEX.md .codex/features/backlog/README.md; do
  test -f "$TARGET/$p" && echo "OK  $p" || echo "MISS $p"
done
for d in backlog todo progress closed specs; do
  test -d "$TARGET/.codex/features/$d" && echo "OK  folder $d" || echo "MISS folder $d"
done
```

**If `SPEC_MODE=on`**, also **EXECUTE** using shell:
```bash
TARGET="<absolute path resolved in P0>"
test -n "$TARGET" && test -d "$TARGET" || { echo "MISS TARGET unresolved -- re-resolve per P0"; exit 1; }
for p in .codex/skills/task-spec/SKILL.md \
  .codex/features/specs/SPEC_TEMPLATE.md .codex/features/specs/DESIGN_TEMPLATE.md; do
  test -f "$TARGET/$p" && echo "OK  $p" || echo "MISS $p"
done
```
> If `SPEC_MODE=off`, skip that loop -- and assert the inverse: none of those three paths may exist.

**Leftover-placeholder gate**, both brace families (double `{{...}}` and the four single-brace metadata tokens), in both modes over every emitted path: every hit is an unresolved placeholder. `|| true` keeps a clean run's rc=1 from aborting, so the `TARGET` assert comes first (gate rule in P0). **EXECUTE** using shell:
```bash
TARGET="<absolute path resolved in P0>"
test -n "$TARGET" && test -d "$TARGET" || { echo "MISS TARGET unresolved -- re-resolve per P0"; exit 1; }
test -d "$TARGET/.codex/features" || { echo "MISS nothing emitted -- gate did not run"; exit 1; }
LEFT="$(grep -rnE '\{\{|\{(PLUGIN_VERSION|CONTENT_VERSION|GENERATED_BY|LAST_UPDATED)\}' \
  "$TARGET/.codex/features" "$TARGET/.codex/rules/tasks.md" \
  "$TARGET/.codex/agents/task-tracker.toml" "$TARGET/.codex/skills/task-board" \
  "$TARGET/.codex/skills/task-spec" 2>/dev/null || true)"
test -z "$LEFT" && echo "OK  no leftover placeholders" || { echo "MISS leftover placeholders:"; echo "$LEFT"; }
```
> A clean run PRINTS `OK  no leftover placeholders`. No output at all = the block did not run, !=PASS -- fix the block and re-run.

**Prompt-contract gate.** Every emitted skill must carry the workspace prompt contract: the
`argument-hint` starts with `[prompt]` and the body contains a `PLAN — ` block. **EXECUTE** using shell:
```bash
TARGET="<absolute path resolved in P0>"
test -n "$TARGET" && test -d "$TARGET" || { echo "MISS TARGET unresolved -- re-resolve per P0"; exit 1; }
FAIL=0
for f in "$TARGET/.codex/skills/task-board/SKILL.md" "$TARGET/.codex/skills/task-spec/SKILL.md"; do
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
- **`AGENT_GAPS`** -- every domain with NO owning agent, which therefore falls back to the built-in `Plan`. Always print this, even when empty (`AGENT_GAPS: none`). A hidden gap is a silently weaker design phase. Non-empty -> suggest `$brewcode:agents` to author the missing domain agents, then re-run `$brewtools:task-board-setup upgrade <path>`
- the sweep manifest counts: docs migrated (by status) / docs trashed / board rows authored -- so a silent no-op sweep is visible
- next step: `/task-board` to view, or just start a task (the new rule runs `task-tracker` at task start). `SPEC_MODE=on` -> also `/task-spec <ID>` for any non-trivial task
- if P5.5 ran: AGENTS.md lines before->after (vs ~200 optimal / 300 over), local-only items moved to AGENTS.local.md, modules split into nested AGENTS.md, rules deduped, the `$brewtools:text-optimize` run (or the commands listed when skipped)

> Do not commit: committing is the user's action.
