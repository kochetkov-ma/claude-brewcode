# Row notes

Read by `setup-status` Phase 3 for a roster row whose probes are not all clean, and by Phase 4 before
it prescribes a mode. `$BC` / `$BT` / `$BD` = the plugin roots from Phase 0.

## What `upgrade` clears

| Row | `upgrade` rewrites | Left as it was |
|-----|--------------------|----------------|
| 1 teams | the three header rows of `team.md` (version, content version, last update); re-copies `trace-ops.sh` | per-agent `Version` cells of agents the run did not touch |
| 2 semble | re-runs `semble-guidance.sh install --part all`: the rule's stamp, the three live hooks (no user-modified guard), the settings entries (absolute <= 6.5.0 hook args rewritten in place to the portable form); deletes retired hooks, their markers and registrations | a prose hand-edit of `semble-first.md` |
| 3 superreview | restamps `SKILL.md`, `references/{agent-prompt,report-template,scope}.md` and the per-stack ref, printing `RESTAMP:` per file even when the delta report says `IDENTICAL` | `.template-baseline/`: `upgrade` only stages the new templates and prints the promote command (`rm -rf <baseline> && mv <staging>/.template <baseline> && rm -rf <staging>`) |
| 4 task-board | step `U5b` restamps every emitted carrier, also when every content row is `SKIP`; withheld (`partial`, stamps stay behind) while any content row is declined or unasked | - |
| 6 agent-deadline | replays the install at the same budget (`defaultMinutes` / `byAgentType` / `hardStopRatio` read back from the config): both hooks, registrations, JSON stamps | the `enabled` value: a disabled setup stays disabled |
| 7 agent-router | replays the install at the recorded `level`: fresh `agent-router.mjs`, registrations, restamped JSON, no question | behaviour values in the config |
| 8 manager | `writeState('project', {}, cwd)` restamps `state.json`; guard and helper are overwritten (`install` does the same) | `hard`, `level`, `mode` and unknown keys |
| 9 memory-sync | `restamp`, the last step of `upgrade`: the anchor's stamp, then `refresh_refs` (table below) | a reference whose content differs |
| 10 docsync | replays the install with `MODE=upgrade`: hooks, registrations, restamped `config.json` | `threshold_days`, `exclude` |
| 11 agent-return | reads `passTokens` / `fileTokens` back and replays the install for that scope: three files, three registrations, JSON stamps | the `enabled` value |
| 12 convention | regenerates the documents from current evidence, refreshes the loading rule's metadata | disabled state, local wording |

## Findings no mode clears

Report each as a finding with what to diff and port by hand, never dressed in a command.

| Finding | Why |
|---------|-----|
| row 9: `.claude/skills/memory-sync/references/hard-sync.md` differs from the plugin source | The healthy state. Its BLOCK placeholders `{PATHS_PRECISION_TABLE}` and `{OBVIOUS_VS_DOMAIN_TABLE}` are filled per project and `generate.sh validate` fails while they are not; its stamp stays frozen because `refresh_refs` refuses to overwrite filled content. Never compared, never stamp-read, never named in a remedy |
| row 9: `REF DIFFERS:` on `memory-guide.md`, `agent-audit.md` or `prompting-guide.md` after `upgrade` | A genuine local edit, left untouched by design: `modified`. Diff against `$BD/skills/memory-sync-setup/references/<name>` |
| row 2: prose hand-edit of `semble-first.md` | `install_managed` re-syncs the rule only when the sole delta is the metadata block; a prose edit is skipped as `user_modified` and its old stamp stays. Report only, for the USER to decide: the stale fact, `diff -u <project>/.claude/rules/semble-first.md $BC/skills/semble-setup/assets/semble-first.md.template` to review, and the one replacement `/brewcode:semble-setup upgrade --force` (backs up `<rule>.bak.<epoch>` first, discards the edits). Never plain `upgrade`; never edit, merge or restamp the rule on the user's behalf |
| row 3: a `.template-baseline/` pair `DIFFERS` | The plugin's templates moved since this project was tailored. `upgrade` stages them; the user ports the delta, then runs the promote command |

`.sembleignore` is not on this list: it is never compared, so there is no byte verdict for it.
`--force` on it backs up and overwrites the user's own uncommented exclusions: never print it.

## Disabled rows with drifted assets

Read by Phase 3's shared disabled-row rule. `keeps` = the owner's `upgrade` refreshes the files and
leaves the off-switch thrown; `refused` = the owner stops `upgrade` on a parked install, so the
line re-parks after it (`enable`/`disable` there are renames, not generators: one session is fine).
Fill `<what drifted>` with the drifted files; `enable` stays the user's optional follow-up.

| Row | `upgrade` while disabled | Command for a drifted disabled row | Owner evidence |
|-----|--------------------------|------------------------------------|----------------|
| 1 teams | refused | `/brewcode:teams-setup enable <team>`, then `/brewcode:teams-setup upgrade <team>`, then `/brewcode:teams-setup disable <team>` | `$BC/skills/teams-setup/SKILL.md`: "Refuse to upgrade a parked member" |
| 2 semble | keeps | `/brewcode:semble-setup upgrade "<what drifted>; keep it disabled"` | `$BC/skills/semble-setup/SKILL.md`: "`enabled`, `phase` and `completed` are never reset as a side effect" |
| 3 superreview | refused | `/brewcode:superreview-setup enable`, then `/brewcode:superreview-setup upgrade "<what drifted>"`, then `/brewcode:superreview-setup disable` | `$BC/skills/superreview-setup/scripts/generate.sh`: "Run 'generate.sh enable' first, then upgrade." |
| 4 task-board | refused | `/brewtools:task-board-setup enable`, then `/brewtools:task-board-setup upgrade "<what drifted>, keep every task id"`, then `/brewtools:task-board-setup disable` | `$BT/skills/task-board-setup/SKILL.md`: "tell the user to run `enable` first, then `upgrade`" |
| 6 agent-deadline | keeps | `/brewtools:agent-deadline-setup upgrade <project\|global> "<what drifted>; keep it disabled"` | `$BT/skills/agent-deadline-setup/SKILL.md`: "keeps `defaultMinutes`, `byAgentType`, `hardStopRatio` and a disabled state" |
| 7 agent-router | keeps | `/brewtools:agent-router-setup upgrade "<what drifted>; keep it disabled"` | `$BT/skills/agent-router-setup/assets/INSTALL.md`: "reinstall must NOT silently re-enable a disabled setup" |
| 8 manager | keeps | `/brewtools:manager-setup upgrade "<what drifted>; keep the wall disarmed"` | `$BT/skills/manager-setup/SKILL.md`: "re-copy the guard + re-register from the CURRENT plugin version; `hard`/`level` preserved" |
| 9 memory-sync | refused | `/brewdoc:memory-sync-setup enable`, then `/brewdoc:memory-sync-setup upgrade "<what drifted>"`, then `/brewdoc:memory-sync-setup disable` | `$BD/skills/memory-sync-setup/scripts/generate.sh`: "run 'generate.sh enable' first, then restamp" |
| 10 docsync | keeps | `/brewdoc:docsync-setup upgrade "<what drifted>; keep it disabled"` | `$BD/skills/docsync-setup/SKILL.md`: "`threshold_days` + `enabled` unchanged" |
| 11 agent-return | keeps | `/brewtools:agent-return-setup upgrade <project\|global> "<what drifted>; keep it disabled"` | `$BT/skills/agent-return-setup/SKILL.md`: "thresholds + `enabled` preserved" |
| 12 convention | keeps | `/brewcode:convention-setup upgrade "<what drifted>; keep the rule parked"` | `$BC/skills/convention-setup/SKILL.md`: "P0-P8, preserve disabled state" |

## Row 1 teams

- Headline = the `Content Version` row of `team.md`'s header table. No such row = a pre-5.6 install: `stale (legacy stamp)`.
- The Agents table has a per-agent `Version` column and a mixed roster is legitimate: header `CURRENT` with lagging agents is `current`; name the lagging agents in *Found*.
- A complete team with no `trace-ops.sh` is a pre-standard install whose agents cannot trace: `stale`.

## Row 2 semble

- Retired for good: `semble-explore.mjs` (superseded by `semble-subagent.mjs`), `semble-reminder.mjs`, `semble-prefetch.mjs`. No plugin asset, no byte pair: never `modified` or `version unknown`. A leftover file is in `guidance.retired`, a leftover registration in `guidance.retiredWired`: `partial`, *Found* `retired: <names> - stale (remove via upgrade)`, Command `upgrade`, matching `semble-setup status` (`partial`, `nextStep` `upgrade`).
- Absolute-path hook rows (<= 6.5.0 args `<root>/.claude/hooks/semble-*.mjs`, break every other clone): `guidance.absoluteCount` above 0, each also counted in `staleEntries` and missing from `wiredCount`. When they are the whole wiring signal (`staleEntries` == `absoluteCount` and `wiredCount` + `absoluteCount` == `wantCount`), *Found* `portable: <N> absolute-path hook entries`, Command `upgrade` (rewrites them in place), matching `semble-setup status` (`partial`, `nextStep` `upgrade`); any other stale, missing or drifted row keeps `install`.
- The repo-root `.sembleignore` is absent from installs predating it: report presence in *Found*. `install_candidates` appends a `# --- brewcode:semble measured candidates ---` block measured from this repo after the template copy, so a healthy file differs from `assets/sembleignore.template` by construction, and the installer's `ignore: up to date` does not mean byte-equal.
- `semble-setup status` compares the same stamp pair (`guidance.content_version` vs `guidance.templateContentVersion`; an absent installed stamp counts as older) into `guidance.ruleStampStale` and on a mismatch drops `ready` to `partial`: `nextStep` `upgrade` for an unedited rule, the report-only diff/`upgrade --force` route for a `user_modified` one. Phase 2c's `semble-row.mjs` reads the same fields (`ROW2 stale stamp-stale` / `ROW2 partial edited-stale`); a disagreement with `semble-setup status` is a finding to name.
- Hand-edited rule (`guidance.rule` = `user_modified`, Phase 2b pair `DIFFERS`): `ROW2 partial edited-stale` when `guidance.ruleStampStale` is true: its `content_version` differs from the template's or is absent (an unstamped pre-5.5 edit included, whatever Phase 2a's `version` fallback reads): *Found* and Command from `FOUND`/`COMMAND`, the report-only route of the row 2 finding above, as `semble-setup status`' `nextStep`; `upgrade` leaves the file and its stamp, so prescribing it loops. `ROW2 current edited-current` when it matches: a supported state, `current`, never `modified`. A `partial` in `semble-setup status` whose `nextStep` is `resume` means warm/smoke unproven (an offline `install`/`enable` exits 3 with `"status":"skipped"`), not a version signal.
- A rule with no stamp at all (pre-5.0) reads `LEGACY-NONE` here; edited, `ROW2 partial edited-stale` decides first (Phase 3 rule 4).
- Permissions: `guidance.permissionsWired` is `semble-setup`'s verdict over every settings layer Claude Code reads (`settings.local.json`, `settings.json`, user scope). `false` = `ROW2 partial install`, as `semble-setup status` (`partial`, `nextStep` `install`); never re-read a settings file to override it.

## Row 3 superreview

- Emitted `SKILL.md` without `content_version:` = a pre-5.6 install: `stale (legacy stamp)`. A placeholder in the emitted file = `partial`. The baseline holds unresolved tokens by design, which is why `upgrade` reports `IDENTICAL` across a version bump.
- Baseline dir absent = a pre-baseline install: say so in *Found*, it is not a version.
- `<stack>` = the one per-stack reference the install picked (`go.md`, `java-kotlin.md`, `python.md`, `typescript-react.md`). Absent from an install predating it: report the other four and say the per-stack ref is missing, never `DIFFERS`.

## Row 4 task-board

- Twelve stamped carriers with the spec layer on (the anchor + eleven secondaries), eleven with it off. `TASK_TEMPLATE.md` is deliberately unstamped, because its frontmatter is copied into every task card.
- A control file without frontmatter (a pre-generator `board.md`, `TRACKER.md`, `INDEX.md`, `backlog/README.md`) is stamped by `upgrade` (`10-upgrade.md` U5b) with one `<!-- brewcode-meta: version=... content_version=... generated_by=brewtools:task-board-setup -->` line, read here through the marker carrier. `LEGACY-NONE` on such a file means no `upgrade` ran since 6.5.6, so one `upgrade` clears it; `LEGACY-NONE` again right after an upgrade is a defect to name, never a second `upgrade`.
- Absent `task-spec` under `TASK_SPEC_MODE` `on` or `unknown` keeps its missing-artifact signal; `upgrade` retrofits the spec + design layer and keeps every task id.

## Rows 6 and 11 agent-deadline, agent-return

- Two carriers per scope: the JSON config (headline; rewritten by `install`, `upgrade`, `enable`, `disable`) and the guard's `// brewcode-meta:` line.
- With `CLAUDE_CONFIG_DIR` set, the hooks still fall back to a config in `~/.claude`. Phase 1b finds it there and the row is installed, not `partial`; Phase 2a does not read that file, so `MISSING` on `GLOBAL/<name>.json` is no finding and the guard's line is the headline.
- Orphan config: the `GOVERNING` line names the project file while the project has no hook files and no `REG project`/`REG local` line for the row, and `REG global` has them. A project `uninstall` kept it by design and the global hooks obey it, so its stamp often reads `BEHIND`. Keep the Phase 3 state; *Found* `<file> GOVERNING: orphaned project config shadows the global one`. Command: `/brewtools:<setup> purge project "delete the orphaned project config so the global one governs"`, or keep it on purpose (the setup's own `status` prints `orphan_config=yes`). Never `upgrade`: it re-wires the project hooks and undoes the uninstall.
- Row 11 with 1 or 2 of its three `.mjs` is `partial`, never `stale`: ESM resolves imports before evaluating, so a missing `agent-return-budget.mjs` makes both registered hooks exit 1 with a hook-error banner on every subagent spawn and return. Offer `install` for that scope.

## Row 7 agent-router

- Headline = `.claude/brewtools/agent-router.json`, rewritten by `install`, `upgrade`, `enable`, `disable` and `level`; the hook's `// brewcode-meta:` line is the second carrier.
- `level` in the config records what is wired; only the `level` mode adds or removes the two strict registrations.

## Row 8 manager

- Precedence: `content_version` in the raw `state.json`, then its raw `version`, then the copied guard's `// brewcode-meta:` line. Read the file, never `resolveState`'s merged view: a defaulted key would let an old state file inherit the current version.
- `writeState` omits a version it cannot resolve instead of stamping `unknown`, so `LEGACY-NONE` on `state.json` beside a `CURRENT` guard line is `current`, and re-running a mode will not put the key back.
- No state file = `missing`: `DEFAULT_STATE` carries no version on purpose.
- The registration carries `onFailure: "block"` (honoured from Claude Code 2.1.295): a `REG` line whose `hardmode-guard.mjs` is a MISS blocks every tool call, armed or not. Say so first; the fix is deleting the `brewtools-manager-guard` entry from `.claude/settings.local.json` by hand, then `install`.
- `DIFFERS` on the guard or the helper means only that `install`/`upgrade` was not re-run since the plugin update; the wall still works. `hard: false` is a different finding: `disabled`.

## Row 9 memory-sync

- Fallback headline on a pre-5.6 anchor: the quoted `version:` (the brewdoc plugin version). Empty `version:` + a last line starting `<!-- memory-sync template v` = `stale (legacy stamp)`; empty with no tail stamp = `stale (legacy, unstamped)`. A trailing `surface_files:` key is skill-specific: ignore it.
- `prompting-guide.md` absent = an install predating it: `stale`; `upgrade` restores it.
- `refresh_refs` re-copies a reference only when that is provably lossless and prints which case fired:

| Line | Condition | Clears `DIFFERS`? |
|------|-----------|-------------------|
| `REF OK:` | already byte-identical | n/a |
| `REF RESTORED:` | the file was absent | yes |
| `REF RECOPIED:` | the only difference is the `brewcode-meta:` stamp line | yes: the plugin-update case |
| `REF DIFFERS:` | real content differs | no: the file is left untouched |

- For a per-file drift count offer, never run, `bash "$BD/skills/memory-sync-setup/scripts/generate.sh" status`: it is read-only but re-scans the whole memory surface, exits 1 outside a repo root, and speaks its own verdict vocabulary.

## Row 10 docsync

- `config.json` without `content_version` falls back to `"version"`; without both it is `stale (legacy, unstamped)`, never `missing`.
- The `// brewcode-meta:` line of `.claude/hooks/docsync-track.mjs` only corroborates: it catches a hook set never re-copied.
- A user fork (project-dusk shape): track and gate registered through the project's launcher (`REG ... wrapped=toolchain_preflight.py`), one `Write|Edit|MultiEdit` track handler without `if=`, no watch hook, edited hook bytes. Rule 3b: `current (custom)` with a CURRENT config stamp, never `partial` or `stale`; *Found* names the launcher, the absent watch and each `DIFFERS` hook; Command `/brewdoc:docsync-setup status`. `upgrade` keeps the wrapped handlers but re-copies track/gate over the fork and adds an unwrapped watch: the user's call only.

## Row 12 convention

- Every carrier must be owned by `brewcode:convention-setup`. Documents stamped `brewcode:convention` are pre-rename evidence: prescribe `upgrade`, never delete them.
- Generated documents (a `generated_by: "brewcode:convention(-setup)"` stamp) present with the loading rule missing = `partial`: prescribe `install`.
- Only hand-written documents (Phase 1 `CONV ... rule=absent owned=0`, any names, any count) = rule 3c `missing (hand-written docs present)`: report-only, never `stale`/`partial`, never `upgrade`. Count every `.claude/convention/*.md` from the `CONV` line, not the three roster names (a `design-system.md` beside them counts).
- Accepted rules and manual CLAUDE.md references are user-owned and stay active while the loading rule is parked.
