# Row notes

Read by `setup-status` Phase 3 for a roster row whose probes are not all clean, and by Phase 4 before
it prescribes a mode. `$BC` / `$BT` / `$BD` = the plugin roots from Phase 0.

## What `upgrade` clears

| Row | `upgrade` rewrites | Left as it was |
|-----|--------------------|----------------|
| 1 teams | the three header rows of `team.md` (version, content version, last update); re-copies `trace-ops.sh` | per-agent `Version` cells of agents the run did not touch |
| 2 semble | re-runs `semble-guidance.sh install --part all`: the rule's stamp, all five hooks (no user-modified guard), the settings entries | a prose hand-edit of `semble-first.md` |
| 3 superreview | restamps `SKILL.md`, `references/{agent-prompt,report-template,scope}.md` and the per-stack ref, printing `RESTAMP:` per file even when the delta report says `IDENTICAL` | `.template-baseline/`: `upgrade` only stages the new templates and prints the promote command (`rm -rf <baseline> && mv <staging>/.template <baseline> && rm -rf <staging>`) |
| 4 task-board | step `U5b` restamps every emitted carrier, also when every content row is `SKIP` | - |
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
| row 2: prose hand-edit of `semble-first.md` | `install_managed` re-syncs the rule only when the sole delta is the metadata block; a prose edit is skipped as `user_modified` with a `diff -u` on stderr. Only `--force` overwrites it, and that is not a skill mode |
| row 3: a `.template-baseline/` pair `DIFFERS` | The plugin's templates moved since this project was tailored. `upgrade` stages them; the user ports the delta, then runs the promote command |

`.sembleignore` is not on this list: it is never compared, so there is no byte verdict for it.
`--force` on it backs up and overwrites the user's own uncommented exclusions: never print it.

## Row 1 teams

- Headline = the `Content Version` row of `team.md`'s header table. No such row = a pre-5.6 install: `stale (legacy stamp)`.
- The Agents table has a per-agent `Version` column and a mixed roster is legitimate: header `CURRENT` with lagging agents is `current`; name the lagging agents in *Found*.
- A complete team with no `trace-ops.sh` is a pre-standard install whose agents cannot trace: `stale`.

## Row 2 semble

- `semble-explore.mjs` is retired for good (superseded by `semble-subagent.mjs`). Still in `.claude/hooks/`, it appears in `guidance.retired`: the install predates the migration.
- The repo-root `.sembleignore` is absent from installs predating it: report presence in *Found*. `install_candidates` appends a `# --- brewcode:semble measured candidates ---` block measured from this repo after the template copy, so a healthy file differs from `assets/sembleignore.template` by construction, and the installer's `ignore: up to date` does not mean byte-equal.
- `semble-setup status` compares the same stamp pair (`guidance.content_version` vs `guidance.templateContentVersion`) and on a mismatch drops `ready` to `partial` with `nextStep: Run /brewcode:semble-setup upgrade`; a disagreement with this dashboard is a finding to name. A `partial` there whose `nextStep` is `resume` means warm/smoke unproven (an offline `install`/`enable` exits 3 with `"status":"skipped"`), not a version signal.
- A rule with no stamp at all (pre-5.0) reads `LEGACY-NONE` here.

## Row 3 superreview

- Emitted `SKILL.md` without `content_version:` = a pre-5.6 install: `stale (legacy stamp)`. A placeholder in the emitted file = `partial`. The baseline holds unresolved tokens by design, which is why `upgrade` reports `IDENTICAL` across a version bump.
- Baseline dir absent = a pre-baseline install: say so in *Found*, it is not a version.
- `<stack>` = the one per-stack reference the install picked (`go.md`, `java-kotlin.md`, `python.md`, `typescript-react.md`). Absent from an install predating it: report the other four and say the per-stack ref is missing, never `DIFFERS`.

## Row 4 task-board

- Twelve stamped carriers with the spec layer on (the anchor + eleven secondaries), eleven with it off. `TASK_TEMPLATE.md` is deliberately unstamped, because its frontmatter is copied into every task card.
- Absent `task-spec` under `TASK_SPEC_MODE` `on` or `unknown` keeps its missing-artifact signal; `upgrade` retrofits the spec + design layer and keeps every task id.

## Rows 6 and 11 agent-deadline, agent-return

- Two carriers per scope: the JSON config (headline; rewritten by `install`, `upgrade`, `enable`, `disable`) and the guard's `// brewcode-meta:` line.
- With `CLAUDE_CONFIG_DIR` set, the hooks still fall back to a config in `~/.claude`. Phase 1b finds it there and the row is installed, not `partial`; Phase 2a does not read that file, so `MISSING` on `GLOBAL/<name>.json` is no finding and the guard's line is the headline.
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

## Row 12 convention

- Every carrier must be owned by `brewcode:convention-setup`. Documents stamped `brewcode:convention` are pre-rename evidence: prescribe `upgrade`, never delete them.
- Documents present with the loading rule missing = `partial`: prescribe `install`.
- Accepted rules and manual CLAUDE.md references are user-owned and stay active while the loading rule is parked.
