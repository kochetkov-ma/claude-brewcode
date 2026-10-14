# Mode: UPGRADE, phases U1-U4

Read from SKILL.md `## Mode: UPGRADE` after the scope snapshot; its final scope gate follows U4.
"The C3 DONE bullets" (U4) are `mode-install.md` C3 step 2: read that step before tuning an agent.

### U1: Load & Parse

```bash
UPGRADE_CUTOFF=$(date -u +%Y-%m-%dT%H:%M:%SZ)
CURSOR=$(bash "${CLAUDE_SKILL_DIR}/scripts/trace-ops.sh" cursor ".claude/teams/{TEAM_NAME}")
bash "${CLAUDE_SKILL_DIR}/scripts/trace-ops.sh" read ".claude/teams/{TEAM_NAME}" --since "$CURSOR" && echo "OK" || echo "FAILED"
```

If cursor empty: all entries returned. If team not found -> **STOP**. If cursor exists and <10 post-cursor entries: expand to last 30 days.
Capture `UPGRADE_CUTOFF` before the initial cursor/trace read and keep it unchanged throughout U1-U4. Entries
created after that cutoff may be analyzed twice, but must never be skipped by advancing the cursor past them.

**Refuse to upgrade a parked member.** `{AGENT_NAMES}` below excludes members `verify-team.sh` reports
`FOREIGN` (U1b drops their rows). U4 writes `.claude/agents/{name}.md`; while the member sits at
`{name}.md.disabled` that creates the live+parked dual copy `toggle-team.sh` refuses (`CONFLICT:`) and
`verify-team.sh` fails on. Probe every roster member before U2, from the project root:

```bash
for m in {AGENT_NAMES}; do
  [ -f ".claude/agents/$m.md" ] || { [ -f ".claude/agents/$m.md.disabled" ] && echo "PARKED $m"; }
done; echo "OK"
```

- any `PARKED` row -> **STOP the whole mode**: no tuning, regeneration, deletion or `team.md` write.
  Report the parked members and the single remedy: `/brewcode:teams-setup enable {TEAM_NAME}`, then
  re-run `upgrade`. Never "upgrade the live ones only": the guards exist to prevent a half-upgraded roster.
- all members live -> continue.

### U1b: Shared Contract Migration Gate

Before U2 analysis or any U4 agent write, read
`${CLAUDE_SKILL_DIR}/references/framework-files.md` and upgrade `team.md` to the current shared contract.
For a legacy file with no `## Shared Agent Contract`, insert the canonical block before `## Agents`,
substituting `{TEAM_NAME}`, the current validated `REPORT_ROOT`, and policy-conditional guard wording while
preserving Created, roster rows, statuses, and history. Re-resolve `REPORT_ROOT` from current applicable
project guidance; do not preserve a stale plugin-default report path. Resolve and
write the explicit `Intent guard` field first: an existing intent-guard roster row -> `required`; no row
-> `legacy-absent`. Substitute the exact review-only guard sentence only for `required`; for `legacy-absent`
substitute an empty string so the shared contract never names a phantom role. Never synthesize the row on
the latter path. If a shared block exists but is
incomplete, replace that block from the canonical reference before proceeding. Re-copy `trace-ops.sh`,
then run `verify-team.sh`. Every `CHECK: agent {name} ... FOREIGN` row is another generator's agent
(e.g. `task-tracker`): delete that roster row, decrement `Agents`, and never read, tune, restamp, park
or delete its file.

Legacy agent bodies remain byte-identical during this gate. **No agent may be tuned, regenerated, stripped,
deleted, or spawned until the shared contract passes.** A legacy-profile warning is safe; a shared-contract
failure stops the whole upgrade. Thus U4 can relocate repeated rules only after their destination exists.

### U2: Analyze Performance

Filter post-cursor trace: `k=track` for task stats, `k=issue` for problems, `k=insight` for patterns.

| Status | Criteria | Action |
|--------|----------|--------|
| Healthy | >70% success, active | No changes |
| Needs tuning | 30-70% success or many refusals | Update instructions |
| Underperforming | <30% success | AskUser: update or delete+create new |
| Inactive | 0 records | AskUser: delete or keep |

> Under `required`, `intent-guard` is excluded from this table: it does not trace and runs only during
> review, so 0 records never grounds deletion or tuning (UNINSTALL: same exclusion,
> `references/cleanup-flow.md` Step 3). Under `legacy-absent` there is no member to analyze.

### U3: Present & Confirm

**ASK** using AskUserQuestion with analysis table and proposed actions (Update/Delete/No changes per agent).
Options: "Apply all" | "Let me choose" | "Show detailed analysis"

If "Let me choose" -> AskUserQuestion per agent. If "Show detailed" -> output full stats, then re-ask.

### U4: Apply Changes

| Agent Status | Action |
|--------------|--------|
| Needs tuning | `Agent(subagent_type="brewcode:agent-creator")` update mode with tracking/issues/insights data |
| Underperforming (update) | Same as tuning |
| Underperforming (replace) | Delete agent file + create new via agent-creator |
| Inactive (delete) | Remove `.claude/agents/{name}.md` + update team.md status to `removed` |

> **Both delete rows run the ownership check first** — `cleanup-flow.md` Step 3 step 0c, same script,
> same exit-code table: `bash "${CLAUDE_SKILL_DIR}/scripts/agent-owners.sh" "{name}"`. More than one owner
> line, or exit 1 (owners unknown) -> **SKIP the delete**, keep the file, report it as shared/unknown and
> leave the roster row alone. `intent-guard` is never a candidate here (U2 note).

Immutable traits (Name, Base Role) -> delete + create new. Mutable traits (Character, Instructions) -> update during tuning.

Update `team.md`: the four header rows (`Version` / `Content version` / `Generated by` / `Last update`,
that order) from the Phase 1 lines, and the `Updated` and `Version` cells of each agent row you touched;
untouched rows keep their version. A pre-5.0 `team.md` lacks the `Version` / `Generated by` header rows
and the trailing `Version` column: add them (column at the end of the roster table, never before
`Agent`), not an error.

Each domain agent you regenerate or tune gets `version` / `last_updated` refreshed to the same values
(`generated_by` stays `brewcode:teams-setup`) and migrates to the current compact template (C3 DONE
bullets): relocate repeated acceptance/tracing/routing/return/colleague/scope-fit rules to `team.md`,
preserve every unique fact. Untouched legacy agents keep their bodies (verifier warnings name the next
migration set). `intent-guard.md` and every `FOREIGN` file (another generator owns it) are
byte-untouchable: never tune or restamp them.

Set cursor:
```bash
bash "${CLAUDE_SKILL_DIR}/scripts/trace-ops.sh" cursor ".claude/teams/{TEAM_NAME}" set "$UPGRADE_CUTOFF" && echo "✅" || echo "❌ FAILED"
```
