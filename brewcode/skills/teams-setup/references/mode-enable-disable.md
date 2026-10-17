# Modes: ENABLE and DISABLE

Read from SKILL.md `## Mode: ENABLE` / `## Mode: DISABLE`; execute only the requested mode's section.

## Mode: ENABLE

Un-parks a `disable`d team: a rename, the exact inverse of DISABLE. Nothing is generated or analyzed.

1. Team not found -> report and **STOP**.
2. Show what will move (no writes):
   ```bash
   bash "${CLAUDE_SKILL_DIR}/scripts/toggle-team.sh" "TEAM_NAME_HERE" enable --dry-run && echo "OK" || echo "FAILED"
   ```
3. Every member already live (`NOOP:` on all rows) -> say "team already enabled" and **STOP**: no
   question, no rename.
4. Apply:
   ```bash
   bash "${CLAUDE_SKILL_DIR}/scripts/toggle-team.sh" "TEAM_NAME_HERE" enable && echo "OK" || echo "FAILED"
   ```
5. `Edit` `team.md`: set each restored member's `Status` cell back to `active` (blank again on a row
   whose other three cells are blank). Then restamp the header with the U1c fence of
   `${CLAUDE_SKILL_DIR}/references/mode-upgrade.md`, `{STEP}` = `write`, values from the Phase 1
   lines; never hand-edit the header. It rewrites the four header rows (the version of the last
   `team.md` write) and the cells `verify-team.sh` pins to them (`Agent defaults`, the `intent-guard`
   `Updated` / `Version`). Explicit per-agent `Version` cells stay (no agent body was rewritten); blank
   rows follow the header. `HEADER legacy` -> nothing written, suggest `upgrade`; any other `❌` -> STOP.
6. Re-verify and report:
   ```bash
   bash "${CLAUDE_SKILL_DIR}/scripts/verify-team.sh" "TEAM_NAME_HERE" && echo "PASS" || echo "FAIL"
   ```
   `DISABLED_AGENTS:0` is the success signal. Tell the user the roster is visible to the next session:
   agent discovery is read at session start.

---

## Mode: DISABLE

Parks the team, deleting nothing. Claude Code discovers a project agent only through
`.claude/agents/<name>.md`, so each member is renamed to `<name>.md.disabled` and ENABLE renames it
back; file body, `team.md`, `trace.jsonl`, `trace-archive.jsonl` and the cursor stay untouched. Under
`required`, `intent-guard` is never parked (shared with `/brewcode:superreview-setup`, as in UNINSTALL
and PURGE); under `legacy-absent` no guard file or roster row is introduced. A file another generator
owns is never moved either way (`SKIP:{name} (owned by ...)`).

1. Team not found -> report and **STOP**.
2. Show what will move (no writes):
   ```bash
   bash "${CLAUDE_SKILL_DIR}/scripts/toggle-team.sh" "TEAM_NAME_HERE" disable --dry-run && echo "OK" || echo "FAILED"
   ```
3. **ASK** using AskUserQuestion: "Disable team {TEAM_NAME}? {N} domain-agent files are parked as
   `.md.disabled` — nothing is deleted, `enable` restores them. A required intent-guard stays live;
   legacy-absent adds nothing."
   Options: "Yes, disable" | "Uninstall instead (deletes agents, keeps archive)" | "Cancel"
   - anything but "Yes, disable" -> switch to UNINSTALL or **STOP**
4. Apply:
   ```bash
   bash "${CLAUDE_SKILL_DIR}/scripts/toggle-team.sh" "TEAM_NAME_HERE" disable && echo "OK" || echo "FAILED"
   ```
5. `Edit` `team.md`: set each parked member's `Status` cell to `disabled` (on a blank row only that
   cell), then restamp the header as in ENABLE step 5. Roster rows are never removed — `enable`
   reads the full roster back.
6. Re-verify and report: `verify-team.sh` prints `DISABLED` per parked member, `DISABLED_AGENTS:{N}`
   and still exits PASS (a parked member is a state, not a missing file). Tell the user the agents
   leave the roster on the next session.
