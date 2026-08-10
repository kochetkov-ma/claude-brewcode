---
name: setup-status
description: "Reports which brewcode setup skills are installed, stale, partial or missing in this project, compares the version each installed artifact was generated under against the installed plugin, and prints the exact command to run for each. Triggers: setup status, what is installed, what version is installed, что установлено."
user-invocable: true
disable-model-invocation: true
argument-hint: "[<plugin>|<skill>] - no args = full cross-plugin report"
allowed-tools: [Read, Bash, Glob, Grep]
model: sonnet
---

<instructions>

# Setup Status

Read-only cross-analysis over every **setup skill** in the brewcode suite. It answers one question:
*what is already set up in this project, what drifted, what was never installed* — and hands back the
exact command to run for each row.

**This skill writes nothing.** No file is created, edited or deleted; `allowed-tools` carries no
`Write`, no `Edit`, no `Agent`. Every probe is an existence check, a `cmp`, or a one-line grep.

## Why it does not run the setups

Each setup skill is an interactive generator: it fans out subagents, analyses the repo and asks the
user real questions. Running two of them back-to-back in one session degrades both — the context
fills with the first one's analysis, and the second one's questions get answered against stale
findings. So the correct flow is:

> **This skill reports. The user runs each setup by hand, ideally one per fresh session.**

There is no `--run`, no `--fix`, no auto mode, and no plan to add one. If the user asks for one, say
this paragraph and print the run-list instead.

**Arguments:** `$ARGUMENTS` — empty = full report. A plugin name (`brewcode`, `brewtools`, `brewdoc`)
filters to that plugin's rows. A skill name (`semble-setup`, `docsync`, `task board`) filters to
that one row and prints its detection rule in full. Unrecognised text = full report.

---

## Two questions, two signals

Every setup artifact in a project carries a `version` — the plugin version that produced it. The
field contract (`version`, `generated_by`, `last_updated`, `doc_type`, and which carrier each file
type uses) lives in ONE place: [`references/artifact-metadata.md`](references/artifact-metadata.md).
This skill consumes it and never restates it.

| Signal | The question it answers | Read from |
|--------|------------------------|-----------|
| **version stamp** — the headline | *which plugin version produced what is installed here?* | the artifact's own `version` field |
| **owner stamp** — the third signal | *did the setup that OWNS this path actually write it?* | the artifact's own `generated_by`, compared against the roster row's `<plugin>:<skill>` |
| **`cmp` vs the plugin asset** — corroborating | *was this file actually re-copied after the plugin update?* | byte equality against `$BC` / `$BT` / `$BD` |

None answers another's question. A hand-edited installed hook still carries the `X.Y.Z` stamp it was
copied with, so the stamp cannot see body drift — `cmp` can. And `cmp` is meaningless for a generated
artifact, which is AI-authored per project and never byte-equal to any asset — only the stamp reaches
those. The owner is orthogonal to both: a file written by the WRONG setup can be at the current
version and byte-perfect, and nothing but `generated_by` will say so. Report the version first, the
owner when it disagrees, the byte verdict last.

Of the four fields in the contract, this skill reads exactly two — `version` and `generated_by`. Why
`last_updated` and `doc_type` are deliberately unread is argued once, in Phase 2a; do not add a
reader for them without an actionable verdict to attach.

Two stamping moments, and the difference matters when reading a row:

| Artifact kind | Stamped | Consequence |
|---------------|---------|-------------|
| byte-copied asset (`.mjs`, `.sh`, `semble-first.md`) | **baked at release** by `bump-version.sh` | the installed copy stays byte-identical to the plugin asset, so `cmp` keeps working alongside the stamp |
| generated artifact (emitted `SKILL.md`, `team.md`, `config.json`) | **substituted at install** | no `cmp` partner exists; the stamp is the only version signal |
| byte-copied asset the install then FILLS (`memory-sync`'s `references/hard-sync.md`) | **baked at release**, then frozen | it ships as mechanism `a` and is `cp`d verbatim, but the generator's own Phase 3 writes project-specific tables into it afterwards, so the installed copy is legitimately never byte-equal and its stamp is never refreshed. **Neither signal reaches it** — no `cmp`, no stamp read |
| pristine template baseline (`.template-baseline/`) | **not stamped at all** | it holds the raw template, placeholders unresolved, on purpose — never read a version out of it |

---

## The Roster — SINGLE SOURCE OF TRUTH

Every fact this skill knows about a setup lives in this ONE table. Adding a future setup = adding
ONE row. Nothing else in this file, and no script, encodes the roster.

| # | Skill (command) | Plugin | Anchor artifact | Secondary artifacts | Version stamp — carrier & how to read | `cmp` corroboration |
|---|-----------------|--------|-----------------|---------------------|--------------------------------------|---------------------|
| 1 | `/brewcode:teams-setup` | brewcode | `.claude/teams/*/team.md` | `.claude/teams/*/trace.jsonl`, `.claude/teams/*/trace-ops.sh` | `team.md` header table: the `\| Version \| X.Y.Z \|` row of the `Field/Value` block, beside `\| Generated by \|` and `\| Last update \|`. Generated, substituted at install. **The Agents table also carries a per-agent trailing `Version` column** — `upgrade` rewrites only the rows it touches, so a roster may legitimately mix versions. The header row is the headline (version of the last write to `team.md`); if any agent row is behind it, say so in *found* | `trace-ops.sh` vs `$BC/skills/teams-setup/scripts/trace-ops.sh` (byte-copied, meta line baked at release). **Absence signal kept:** complete team with no `trace-ops.sh` = pre-standard install whose agents cannot trace -> `stale`. **Remedy check:** `upgrade`'s U4 rewrites the three header rows from the Phase 1 scalars, and C4 directs `upgrade` to re-`cp` the tracer ("Re-copy it in UPGRADE too (`cp` is idempotent) so a team created by an older version gains it") — so both the stamp and this absence clear. Per-agent `Version` cells move only for agents the run actually touched, which is why a mixed roster stays `installed` |
| 2 | `/brewcode:semble-setup` | brewcode | `.claude/rules/semble-first.md` | `.claude/hooks/semble-session.mjs`, `semble-prefetch.mjs`, `semble-stats.mjs`, `semble-reminder.mjs`, `semble-subagent.mjs`, `.claude/semble/state.json` | frontmatter `version:` of `.claude/rules/semble-first.md`. It is a **pure byte-copy**: the template carries baked `doc_type: llm` + `version` + `generated_by` and deliberately no `last_updated`, and the installer does NOT restamp on copy — so the installed rule stays byte-identical to the template and `cmp` must read `SAME`. `DIFFERS` here means a hand-edit or a rule never re-copied after the plugin update, never a stamping artefact | **all FIVE live hooks** vs `$BC/skills/semble-setup/assets/*.mjs` (`semble-explore.mjs` is retired for good, superseded by `semble-subagent.mjs`; if that file is still in `.claude/hooks/` the install predates the migration - report it in *found* and prescribe `upgrade`, never `DIFFERS`), plus the rule vs `assets/semble-first.md.template` — and NOTHING else. **The repo-root `.sembleignore` is byte-copied but never byte-STABLE: it is carved out of the `cmp` set** (its `# brewcode-meta:` stamp IS still read — see the row-2 carve-out below). `.sembleignore` sits at the REPO ROOT, not under `.claude/`, and is absent from installs predating it: report that presence check in *found*, never as a `cmp` verdict. `.claude/semble/state.json` is runtime state — never a stamp source, and its `approvedVersion` is the semble **package** version, not ours. **Wiring is a separate signal from bytes, and it is the one that catches a v1-shaped repo:** `.claude/settings.json` can list a hook that no longer exists, or list five of the six the current version wants, while every file on disk is byte-current. `semble-status.sh` reads it (`guidance.hooks`: `retired[]`, `staleEntries`, `wiredCount`/`wantCount`) and downgrades its own `ready` to `partial` for any of the three; report the same way — retired hooks on disk, stale settings entries, or `wiredCount < wantCount` is `stale`, prescribing `install`, no matter how current the stamps are. `wantCount: 0` means the counts were not reported at all and is never a defect. **This row's setup now carries its OWN version signal, and it agrees with ours:** `semble-status.sh` emits `guidance.version` (the installed rule's frontmatter `version:`) beside `guidance.pluginVersion` (what the plugin on this machine would install) at `:550-556`, and when both are non-empty and unequal it drops `ready` to `partial` with `reason: artifacts at X.Y.Z, plugin at A.B.C` (`:632-641`) and `nextStep: Run /brewcode:semble-setup upgrade` (`:657-658`). So row 2 is NOT a row where only the dashboard can see staleness — if the user already ran `semble-setup status`, quote its `nextStep` rather than inventing a different one. Both stamps empty (a pre-5.0 unstamped rule) is deliberately NOT stale there; this dashboard's `LEGACY-NONE` still covers it. **Remedy check:** `upgrade` unconditionally re-runs `semble-guidance.sh install --part all` (SKILL.md `### upgrade`), which is the ONLY writer of the rule's stamp — so it does clear `BEHIND`. It also `cp`s the five hooks with no user_modified guard (`install_hook_files`), so hook `DIFFERS` always clears. **`semble-first.md` is the exception:** `install_managed` re-syncs it only when the sole delta is the metadata block, and a real prose hand-edit is SKIPPED with a `diff -u` to stderr. Say so in *found* — that one needs `--force`, which is not a skill mode. `.sembleignore` takes the same skip branch inside the installer, but this dashboard never reaches that verdict for it: it is not `cmp`d at all, so **never prescribe `--force` on `.sembleignore`** — see the carve-out |
| 3 | `/brewcode:superreview-setup` | brewcode | `.claude/skills/superreview/SKILL.md` | `.claude/skills/superreview/references/agent-prompt.md`, `.../report-template.md`, `.../scope.md`, `.claude/skills/superreview/.template-baseline/` | frontmatter `version:` of the **emitted** `.claude/skills/superreview/SKILL.md`, substituted at install from `{PLUGIN_VERSION}`. **Never read the version out of `.template-baseline/`** — that dir is the pristine template and its `version` is the unresolved `{PLUGIN_VERSION}` token by design, which is precisely why `upgrade` reports IDENTICAL across a version bump instead of a phantom diff. A placeholder in the *emitted* file means substitution never completed -> `partial`. **Remedy check:** `upgrade` restamps FIVE live files unconditionally — `SKILL.md` + `references/{agent-prompt,report-template,scope}.md` + the per-stack ref (`generate.sh` `_restamp_meta` loop) — and prints a `RESTAMP:` line for each even when the delta report says `IDENTICAL`, which is the normal outcome of a plain version bump. So `BEHIND` clears | the 4 baseline copies vs the plugin templates (mapping below) — answers "did the plugin's templates move since this project was tailored", which the emitted stamp cannot. Baseline dir absent -> pre-baseline install, report it in *found*, do not call it a version. **A baseline `DIFFERS` is NOT cleared by `upgrade` alone:** `upgrade` only stages the new templates and prints the promote command (`rm -rf <baseline> && mv <staging>/.template <baseline> && rm -rf <staging>`), which the user runs after porting the delta. Name both halves in the remedy |
| 4 | `/brewtools:task-board-setup` | brewtools | `.claude/features/board.md` | `.claude/agents/task-tracker.md`, `.claude/skills/task-board/SKILL.md`, `.claude/skills/task-spec/SKILL.md`, `.claude/rules/tasks.md`, `.claude/features/PROGRESS.md` | frontmatter `version:` of the anchor itself — `board.md` now opens with the four-key block, substituted at install from `{PLUGIN_VERSION}` in the template. Nine artifacts are stamped: the anchor + the 5 secondaries above, plus `TRACKER.md`, `INDEX.md`, `backlog/README.md`. `TASK_TEMPLATE.md` is deliberately UNSTAMPED — its frontmatter is copied into every task card — so its lack of a stamp is never a defect. **Remedy check:** `upgrade` step `U5b` (`references/10-upgrade.md:282`) restamps all nine unconditionally, and `:109`/`:111` make it run even on the commonest path, where every content row is `SKIP` and the version stamp is the only thing out of date. So `BEHIND` clears | none copied verbatim. **Absence signal kept:** board present but `.claude/skills/task-spec/SKILL.md` missing = install predates the spec+design layer -> `stale`, the documented upgrade path was never run |
| 5 | `/brewtools:think-short-setup` | brewtools | `.claude/hooks/think-short-session.mjs` (project) or `~/.claude/hooks/think-short-session.mjs` (global) | in the same dir: `think-short-prompt-counter.mjs`, `think-short-task.mjs`, `think-short-prompt.md`; plus a `think-short` reference in the matching `settings.json` | the `// brewcode-meta:` line right after the shebang of `think-short-session.mjs` (baked at release). `think-short-prompt.md` carries the same marker as an HTML comment on line 1, not frontmatter. There is no JSON carrier on this row. **Remedy check:** `upgrade` re-emits all four assets from the current plugin version, keeping the disabled state (SKILL.md mode table), so both the stamp and any `DIFFERS` clear | all 4 vs `$BT/skills/think-short-setup/assets/` |
| 6 | `/brewtools:agent-deadline-setup` | brewtools | `.claude/hooks/agent-deadline-guard.mjs` (or the `~/.claude` twin) | `agent-deadline-cleanup.mjs` beside it, `.claude/agent-deadline.json`, `agent-deadline` in `settings.json` | the `// brewcode-meta:` line of `agent-deadline-guard.mjs` (baked at release) is the headline. `.claude/agent-deadline.json` carries the JSON trio (`version`, `generated_by`, `last_updated`) written at install by every mode that touches it — read it too, it is the only stamp that moves when the user runs `enable`/`disable`. **Remedy check:** `upgrade` replays the install at the SAME budget (`defaultMinutes`/`byAgentType`/`hardStopRatio` read back out of the config), re-copying both hooks and rewriting the JSON trio; a disabled setup stays disabled | both `.mjs` vs `$BT/skills/agent-deadline-setup/assets/` |
| 7 | `/brewtools:agent-router-setup` | brewtools | `.claude/hooks/agent-router.mjs` | `.claude/brewtools/agent-router.json`, `agent-router.mjs` referenced in `.claude/settings.json` | the `// brewcode-meta:` line of `agent-router.mjs` (baked at release) is the headline; `.claude/brewtools/agent-router.json` carries the JSON trio (`version`, `generated_by`, `last_updated`), rewritten by `install`/`upgrade`/`enable`/`disable`/`level`. **Remedy check:** `upgrade` reads `level` back out of the config and replays the install at that level — fresh `agent-router.mjs`, behavior values preserved, metadata re-stamped — so it never asks a question and never changes a setting | the hook vs `$BT/skills/agent-router-setup/assets/agent-router.mjs` |
| 8 | `/brewtools:manager-setup` | brewtools | `.claude/brewtools/manager/state.json` | `.claude/brewtools/manager/hardmode-guard.mjs`, a `hardmode-guard.mjs` PreToolUse entry in `.claude/settings.local.json` | top-level `"version"` in the RAW `state.json` — read the file, never `resolveState`'s merged view, or a defaulted key would let an old state file inherit the current version and hide the staleness. Stamped by `writeState()` in `$BT/hooks/lib/manager-state.mjs`, which resolves the version from `brewtools/.claude-plugin/plugin.json` and falls back to that module's OWN baked `brewcode-meta` line (`pluginVersion()`, `:69-81`), never a literal. `DEFAULT_STATE` deliberately carries no version — it is the answer to "no state file exists", and a version there would be a fake stamp; a project with no state file therefore resolves with no version key at all, which is the `missing` signal, not a version. Second precedence, only when the key is absent: the `// brewcode-meta:` line of the copied `hardmode-guard.mjs`. **The precedence holds because the primary carrier now MOVES:** `upgrade` calls `writeState('project', {}, cwd)` with an EMPTY partial, and `writeState` (`manager-state.mjs:222-253`) stamps `version`/`generated_by`/`last_updated` on every write while `hard`, `level`, `mode` and every unknown key merge through from the existing file. Reading the guard's meta line first would answer a question the state file already answers more precisely. **A second, rarer way the key goes absent, and the reason the fallback is load-bearing rather than historical:** when `pluginVersion()` cannot resolve, `writeState` DELETES `version` rather than stamping `unknown` (`:242-252`) — including a `version` inherited from the older file it is merging over. So an absent key on a freshly written state file is a resolver failure on a current install, NOT a legacy one; the guard's line beneath it is the answer, and re-running `enable`/`disable`/`upgrade` will not put it back. `references/artifact-metadata.md` records why this one writer omits instead of aborting | the copied guard vs `$BT/hooks/hardmode-guard.mjs` — `install` AND `upgrade` both overwrite it every run, so `DIFFERS` means exactly "neither was re-run since the plugin update", and `upgrade` clears it together with the stamp |
| 9 | `/brewdoc:memory-sync-setup` | brewdoc | `.claude/skills/memory-sync/SKILL.md` | `references/memory-guide.md`, `references/agent-audit.md`, `references/hard-sync.md` under it | frontmatter `version:` of the emitted `SKILL.md` (quoted), carrying the **brewdoc plugin version** that `generate.sh` resolves by script self-location from `brewdoc/.claude-plugin/plugin.json`. Empty `version:` + a last line starting `<!-- memory-sync template v` = a **legacy stamp**; empty with no tail stamp = **unstamped**. `generate.sh` still has a `VERSION=` variable and it is what writes the stamp — but it is now `VERSION=$(resolve_plugin_version)`, reading `brewdoc/.claude-plugin/plugin.json`. What was retired is the hardcoded per-template counter (`VERSION=1.0.0`), not the variable; a literal there would be the defect. A skill-specific `surface_files:` key TRAILS the four standard ones; ignore it | **the anchor is generated and has no `cmp` partner; TWO of the three references have one and `hard-sync.md` does NOT.** `generate.sh:398` `cp`s all three verbatim (`EMITTED_REFS`, `:38`) and they are mechanism-`a` byte copies stamped at release with a line-1 HTML-comment `brewcode-meta:`, so exactly two pair up: `.claude/skills/memory-sync/references/memory-guide.md` and `agent-audit.md` vs `$BD/skills/memory-sync-setup/references/<same name>`. `DIFFERS` there = a SELF-SYNC hand-edit or references never re-copied after the plugin update. **`hard-sync.md` is byte-copied but never byte-STABLE — carved out of the `cmp` set and out of the `STAMPS` heredoc alike**; see the carve-out note below. For a deeper diff of the generated anchor, OFFER (never run) `generate.sh status`, see below |
| 10 | `/brewdoc:docsync-setup` | brewdoc | `.claude/docsync/config.json` | `.claude/docsync/state.json`, `.claude/hooks/docsync-track.mjs`, `docsync-watch.mjs`, `docsync-gate.mjs`, `docsync` in `.claude/settings.json` | top-level `"version"` of `.claude/docsync/config.json`, substituted at install from the brewdoc `plugin.json` the skill resolves — the install writes the JSON trio (`version`, `generated_by`, `last_updated`) alongside `threshold_days` and `exclude`; `upgrade` refreshes all three provenance keys — `version`, `generated_by` AND `last_updated` — and leaves `threshold_days`/`exclude` verbatim. **`config.json` present but carrying no `version` key = a pre-standard install = `stale (legacy, unstamped)`**, never `missing`. Corroborating only: the `// brewcode-meta:` line of `.claude/hooks/docsync-track.mjs` (baked at release), which catches a hook set that was never re-copied. `state.json` is runtime state and never carries a stamp | the 3 hooks vs `$BD/skills/docsync-setup/assets/` |

`$BC` / `$BT` / `$BD` = the resolved plugin roots from Phase 0.

> **Rows 8 and 10 share one precedence rule:** the setup's own generated JSON is the preferred
> carrier, and the byte-copied companion's `brewcode-meta:` line is the documented fallback for as
> long as that JSON goes unstamped. Read the JSON first; fall through silently; never report `LEGACY`
> on a row whose fallback carrier answered.

> **Row 2 — the `.sembleignore` carve-out.** Like `hard-sync.md` it is shipped as mechanism `a`
> (`STAMPED_FILES`, kind `marker`) and copied verbatim by `install_managed`, so it LOOKS like a `cmp`
> partner. It is not one. `install_ignore_apply` (`semble-guidance.sh:564-585`, reached through the
> `install_ignore` dispatcher at `:618-620`) runs `install_candidates` **after** `install_managed`
> has copied the template, and that function appends a `# --- brewcode:semble measured candidates
> ---` block measured from THIS repo (`:500-555`) — every line commented out, proposals only. So a
> HEALTHY, freshly-installed `.sembleignore` differs from `assets/sembleignore.template` **by
> construction**, exactly like row 9. Fed to Phase 2b it prints `DIFFERS` beside a `CURRENT` stamp,
> which Phase 3 rule 9 turns into `stale (bytes drifted)` — and row 2's only two readings of that
> (`metadata-only re-sync` or `prose hand-edit needing --force`) are both wrong. **`--force` there
> takes a backup and overwrites the user's own uncommented exclusions.** Never `cmp` it, never
> prescribe `--force` for it, never name it in a remedy for byte drift.
>
> **Unlike row 9, its STAMP is still read.** The installer's comparison strips both the
> `# brewcode-meta:` line and the whole candidates block from both sides (`sg_strip_metaline`,
> `:401-411`), so a template update still writes through on the metadata-only branch and the stamp
> genuinely moves. Phase 2a on `.sembleignore` is valid; Phase 2b on it is not. The two carve-outs
> differ exactly there: `hard-sync.md` loses BOTH signals, `.sembleignore` loses only `cmp`.
>
> **`unchanged` from the installer does NOT mean byte-equal to the template.** `install_ignore_apply`
> snapshots the file around both halves and collapses a clean net-zero run — re-sync then a
> byte-identical re-append — back to `ignore: up to date` (`:576-584`; the dry-run path predicts the
> same verdict by simulating into a temp dir, `install_ignore_dry:591-616`). So a back-to-back re-run
> over an unchanged repo reports `ignore: up to date` — while the file on disk still differs from
> `assets/sembleignore.template` by the whole candidates block. Do not read the installer's
> `unchanged` as licence to `cmp` the pair; the two answer different questions.
>
> A re-run over a repo whose FILE SET moved does report `changed`, because the scan re-measures and
> the block genuinely changes. That is real byte movement, still not a drift signal, and still not
> something `cmp` against the template can express.

> **Row 9 — why the dashboard parses instead of executing.** `bash "$BD/skills/memory-sync-setup/scripts/generate.sh" status`
> prints a richer verdict (`STAMP_FORMAT`, `META_*`, `DRIFTS`, `VERDICT`) and is genuinely read-only —
> its `status_report` only reads and echoes, and `resolve_root` only `cd`s. It is still the wrong
> default here: it re-scans the whole memory surface (real work, not a probe), it `exit 1`s when the
> cwd is not a repo root, and it returns a private verdict vocabulary that would have to be
> translated into this skill's states — which puts roster knowledge inside a foreign script and
> breaks "no script encodes the roster". So: read the frontmatter with the Phase 2a block like every
> other row, and put `generate.sh status` in the **Command** column as something the USER may run
> when row 9 is not green.

> **Row 9 — the `hard-sync.md` carve-out.** It is shipped as mechanism `a` (`STAMPED_FILES` row,
> kind `md`) and `cp`d verbatim, so it LOOKS like a `cmp` partner. It is not one, and listing it as
> one made this dashboard report drift on every correctly-installed project. The emitted
> `references/hard-sync.md` carries two of the generator's twelve BLOCK placeholders —
> `{PATHS_PRECISION_TABLE}` and `{OBVIOUS_VS_DOMAIN_TABLE}` — which the generator's own Phase 3
> fills with project-specific tables via `Edit`, and `generate.sh validate` FAILS while either is
> unfilled. So a HEALTHY install differs from the plugin source by construction: `cmp` `DIFFERS` is
> the success state, not drift, and no mode can ever clear it without destroying the user's tables.
> Its baked stamp is frozen at the release that emitted it for the same reason — `refresh_refs`
> refuses to re-copy a file whose content differs — so feeding it to Phase 2a would print a
> permanent `BEHIND`. **Never `cmp` it, never stamp-read it, never name it in a remedy.** The row's
> version signal is the anchor's frontmatter and nothing else.
>
> The two references that DO pair up are cleared by `upgrade`, and only by it.
> `generate.sh:514 refresh_refs()` (reached from `restamp`, which is the mandatory last step of
> `upgrade` — `memory-sync-setup/SKILL.md` mode `upgrade` step 3) re-copies a reference **only when
> that is provably lossless**, and prints which case fired:
>
> | Line | Condition | Clears a `cmp` `DIFFERS`? |
> |------|-----------|---------------------------|
> | `REF OK:` | already byte-identical | n/a — the row was `SAME` |
> | `REF RESTORED:` | the file was absent; nothing local to lose | yes |
> | `REF RECOPIED:` | the ONLY difference is the `brewcode-meta:` release-stamp line | yes — this is the plugin-update case |
> | `REF DIFFERS:` | real content differs (hand-edit, filled BLOCKs, prose moved in a newer release) | **no — the file is left untouched, by design** |
>
> A `REF DIFFERS:` on `memory-guide.md` or `agent-audit.md` after an `upgrade` therefore means a
> genuine local edit: report `stale (bytes drifted)`, say `upgrade` will NOT overwrite it, and tell
> the user to diff against `$BD/skills/memory-sync-setup/references/<name>` and port by hand. Do not
> prescribe a mode that would silently discard their edit — there is none.

> **Every secondary must be EXCLUSIVE to its row.** A shared artifact — `.claude/agents/*.md`,
> `.claude/agents/intent-guard.md` (superreview *and* teams both emit it), any hand-written agent —
> is not evidence that THIS setup ran, and listing one makes Phase 3 rule 3 report a `partial`
> install in every project that merely has an agent file. If a setup owns no exclusive secondary,
> leave the cell empty and let the anchor decide.

**Row 3 baseline mapping** (the only non-obvious `cmp` pairing):

| Project baseline copy | Plugin template |
|-----------------------|-----------------|
| `.claude/skills/superreview/.template-baseline/SKILL.md` | `$BC/skills/superreview-setup/references/SKILL.md.template` |
| `.../.template-baseline/references/agent-prompt.md` | `$BC/skills/superreview-setup/references/agent-prompt.md` |
| `.../.template-baseline/references/report-template.md` | `$BC/skills/superreview-setup/references/report-template.md` |
| `.../.template-baseline/references/scope.md` | `$BC/skills/superreview-setup/references/scope.md.template` |
| `.../.template-baseline/references/<stack>.md` | `$BC/skills/superreview-setup/references/<stack>.md` |

`<stack>` is the one per-stack reference the install picked — `go.md`, `java-kotlin.md`,
`python.md` or `typescript-react.md`. It is substituted and baseline-copied exactly like the
other four; only its filename varies. Absent from an install that predates it: report the other
four and say the per-stack ref is missing, never `DIFFERS`.

### NOT setups — never appear in the report

Recurring tools, not one-time installs. They are correct to run repeatedly and have no installed
state to report: `brewcode:agents`, `skills`, `rules`, `convention`, `e2e`;
`brewtools:text-optimize`, `text-human`, `secrets-scan`, `ssh`, `deploy`, `plugin-update`,
`provider-switch`; `brewdoc:md-to-pdf`, `my-claude`, `publish`.

---

## Phase 0 — Resolve plugin roots

A plugin that is not installed makes every one of its rows `n/a` — never `missing`. Do not assume
all four are present.

The plugin version is the number every stamp is compared against, so resolve it with the SAME
precedence the brewcode SessionStart hook uses (`brewcode/hooks/session-start.mjs`, `parseVersion`):
**the cache directory basename first, `.claude-plugin/plugin.json` `.version` second.** One
precedence, two consumers — do not invent a third.

**EXECUTE** using Bash tool:

```bash
for p in brewcode brewdoc brewtools brewui; do
  r=$({ ls -d "$HOME/.claude/plugins/cache/claude-brewcode/$p"/*/ 2>/dev/null || true; } | sort -V | tail -1 | sed 's:/*$::')
  if [ -n "$r" ] && [ -d "$r" ]; then
    v=$(basename "$r")
    case "$v" in
      [0-9]*.[0-9]*.[0-9]*) : ;;
      *) v=$(grep -o '"version"[[:space:]]*:[[:space:]]*"[^"]*"' "$r/.claude-plugin/plugin.json" 2>/dev/null | head -1 | sed 's/.*:[[:space:]]*"//; s/"$//' || true) ;;
    esac
    echo "$p ROOT=$r VERSION=${v:-unknown}"
  else echo "$p ROOT=none VERSION=none"; fi
done
echo "PROJECT=$PWD"
test -d "$PWD/.claude" && echo "DOTCLAUDE=yes" || echo "DOTCLAUDE=no"
echo "OK"
```

> **STOP if FAILED** — cannot resolve the cache; report it and stop rather than calling everything
> `missing`. All four roots `none` also means stop: nothing installed, nothing to report.

Bind `$BC`, `$BT`, `$BD` and their versions from the output. `DOTCLAUDE=no` is a legitimate answer —
every row is `missing`, print the table anyway. `VERSION=unknown` on a plugin that IS installed means
no comparison is possible for its rows: report `installed (plugin version unresolved)` and say why.

## Phase 1 — Probe artifacts

One generic block, fed from the roster. Paste the anchor + secondary paths of the rows in scope
(after the `$ARGUMENTS` filter) into the heredoc — relative to the project root, one per line, a
trailing `/` for a directory, globs allowed.

**EXECUTE** using Bash tool:

```bash
cd "$PWD" || exit 1
while IFS= read -r rel; do
  [ -z "$rel" ] && continue
  case "$rel" in
    */)    [ -d "$rel" ] && echo "DIR  $rel" || echo "MISS $rel" ;;
    *"*"*) n=$({ find . -path "./$rel" 2>/dev/null || true; } | wc -l | tr -d ' '); n=${n:-0}; [ "$n" -gt 0 ] && echo "GLOB $rel ($n)" || echo "MISS $rel" ;;
    *)     if [ -f "$rel" ]; then echo "FILE $rel"
           elif [ -f "$rel.disabled" ]; then echo "PARK $rel.disabled"
           else echo "MISS $rel"; fi ;;
  esac
done <<'PATHS'
.claude/teams/*/team.md
.claude/teams/*/trace-ops.sh
.claude/rules/semble-first.md
PATHS
echo "OK"
```

`PARK` is **present**, not missing. Five setups `disable` by renaming their entry file to
`<name>.disabled` (Phase 1b), and the body stays byte-identical — so a `PARK` line never feeds
Phase 3's `missing` or `partial` rules, and the file it names is still a readable version stamp.

Then the `settings.json` wiring greps — textual counts only, they do not prove the entries are
well-formed or attached to the right event:

**EXECUTE** using Bash tool:

```bash
for f in .claude/settings.json .claude/settings.local.json; do
  [ -f "$f" ] || { echo "$f absent"; continue; }
  for k in think-short agent-deadline agent-router hardmode-guard docsync; do
    echo "$f $k=$({ grep -c "$k" "$f" 2>/dev/null || true; } | tr -d ' ')"
  done
done
echo "OK"
```

Global-scope twins for rows 5 and 6 (`think-short-setup` and `agent-deadline-setup` install to
project **or** `~/.claude`) — read-only, never written:

**EXECUTE** using Bash tool:

```bash
for f in "$HOME/.claude/hooks/think-short-session.mjs" "$HOME/.claude/hooks/agent-deadline-guard.mjs" "$HOME/.claude/agent-deadline.json"; do
  [ -f "$f" ] && echo "FILE $f" || echo "MISS $f"
done
echo "OK"
```

### Phase 1b — Disable switches

`disable` is a canonical verb on **all ten** setups, and a deliberately disabled setup is neither
broken nor stale. Every row therefore leaves a probeable off-switch, in one of two mechanisms:

| Mechanism | What `disable` does | Why it is probeable |
|-----------|---------------------|---------------------|
| **live config flag** | flips one key in the setup's own JSON; every file stays on disk, byte-identical | the reader (a hook, or the guard) re-reads the key on every invocation, so the flag IS the state |
| **entry-file parking** | renames the ONE filename discovery keys on to `<name>.disabled`; the body is byte-identical and nothing is deleted | Claude Code discovers a project agent only as `.claude/agents/<n>.md`, a project skill only as `<dir>/SKILL.md`, and auto-loads a rule only as `.claude/rules/*.md` — withholding that exact filename is the whole switch |

| Row | Setup | Mechanism | Off-switch | Disabled when |
|-----|-------|-----------|-----------|---------------|
| 1 | teams | parking | `.claude/agents/<member>.md.disabled` | every roster member named in `team.md`'s `## Agents` table is parked. **`intent-guard` is NEVER parked** (`scripts/toggle-team.sh`: it is shared with `superreview-setup`) — exclude it before deciding. `disable` also flips each member's `Status` cell to `disabled`, but the FILENAME is the authority: the cell is a hand `Edit` step and can lag. `team.md`, `trace.jsonl`, `trace-archive.jsonl` and the cursor are untouched, so the anchor stays present |
| 2 | semble | config flag | `.claude/semble/state.json` | `.enabled` is `false` (phase `disabled`); every file stays in place |
| 3 | superreview | parking | `.claude/skills/superreview/SKILL.md.disabled` | present and `SKILL.md` absent. `references/` and `.template-baseline/` stay live and readable — that is the point of parking `SKILL.md` and not the directory |
| 4 | task-board | parking | any of the FOUR: `.claude/agents/task-tracker.md`, `.claude/skills/task-board/SKILL.md`, `.claude/skills/task-spec/SKILL.md`, `.claude/rules/tasks.md` — each as `<name>.disabled` | every DEPLOYED one of the four is parked. `.claude/features/**` is untouched, so the anchor `board.md` stays present. `task-spec` legitimately never existed on a board installed with `SPEC_MODE=off` — absent is not parked |
| 5 | think-short | parking | `.claude/hooks/think-short-prompt.md.disabled` (or the `~/.claude` twin) | present and `think-short-prompt.md` absent — the hooks stay wired and no-op |
| 6 | agent-deadline | config flag | `.claude/agent-deadline.json` (or the `~/.claude` twin) | `"enabled": false` **or the key absent**. The guard reads `if (!cfg \|\| cfg.enabled !== true) return;` (`agent-deadline-guard.mjs:354`), so an unparsable, absent or key-less config is INERT — nothing is ever enforced. This is the INVERSE of rows 7 and 10; see the note below the table |
| 7 | agent-router | config flag | `.claude/brewtools/agent-router.json` | `"enabled": false`. **An absent key means ENABLED** — `agent-router.mjs:117` defaults `enabled: true` and `:228` only ever flips it on a literal `raw.enabled === false`, so `:535` (`cfg.enabled === false` -> return) never fires on a key-less config |
| 8 | manager wall | config flag | `.claude/brewtools/manager/state.json` | `.hard` is not `true` — registration stays, the guard no-ops. This is the disarmed wall, not a broken one |
| 9 | memory-sync | parking | `.claude/skills/memory-sync/SKILL.md.disabled` | present and `SKILL.md` absent. The 3 `references/` and every SELF-SYNC hand-edit stay byte-identical |
| 10 | docsync | config flag | `.claude/docsync/config.json` | `"enabled": false`. **An ABSENT `enabled` key means ENABLED** — all three hooks read `c.enabled !== false` (`docsync-track.mjs:45`, `docsync-watch.mjs:41`, `docsync-gate.mjs:50`), so back-compat installs written before the key existed are live. Never read a missing key as off |

> **An absent `enabled` key does NOT mean the same thing on every row — read the writer, never the
> key name.** Two opposite defaults ship side by side, and conflating them inverts a whole row:
>
> | Row | Reader's test | Absent key means | Consequence for this skill |
> |-----|---------------|------------------|----------------------------|
> | 6 agent-deadline | `cfg.enabled !== true` -> return (`agent-deadline-guard.mjs:354`) | **INERT** | a key-less config is `disabled`, never `installed` — reporting it live claims a deadline is enforced when none is |
> | 7 agent-router | default `enabled: true`, flipped only on `raw.enabled === false` (`agent-router.mjs:117`, `:228`, `:535`) | **ENABLED** | a key-less config is live; reporting it off would tell the user to `enable` an already-armed hook |
> | 10 docsync | `c.enabled !== false` in all three hooks (`docsync-track.mjs:45`, `docsync-watch.mjs:41`, `docsync-gate.mjs:50`) | **ENABLED** | same as row 7 — back-compat installs predating the key are live |
>
> Rows 7 and 10 are opt-out, row 6 is opt-in. The probe below therefore emits a THIRD token,
> `no-key`, instead of guessing — and Phase 3 rule 2 maps it per row, not globally.

**EXECUTE** using Bash tool — config flags. Every arm prints a line: a row that produces no output at
all is indistinguishable from a row the block forgot, so `ABSENT` is stated, never implied:

```bash
for d in "$PWD/.claude" "$HOME/.claude"; do
  j="$d/agent-deadline.json"
  if [ -f "$j" ]; then
    e=$({ tr -d ' \n' < "$j" | grep -o '"enabled":[a-z]*' || true; } | head -1)
    echo "agent-deadline $j: ${e:-no-key} (absent/no-key = INERT)"
  else echo "agent-deadline ABSENT $j"; fi
done
for f in .claude/semble/state.json .claude/brewtools/agent-router.json .claude/brewtools/manager/state.json; do
  if [ -f "$f" ]; then
    echo "$f: $({ tr -d ' \n' < "$f" | grep -o '"\(enabled\|hard\|phase\)":[^,}]*' || true; } | tr '\n' ' ')"
  else echo "$f absent"; fi
done
c=.claude/docsync/config.json
if [ -f "$c" ]; then
  case "$(tr -d ' \n' < "$c")" in
    *'"enabled":false'*) echo "docsync PARKED $c (enabled:false)" ;;
    *)                   echo "docsync LIVE   $c (enabled:true or key absent — absent means enabled)" ;;
  esac
else echo "docsync ABSENT $c"; fi
echo "OK"
```

| Row 6 output | Reading |
|--------------|---------|
| `"enabled":true` | live — fall through to the rest of Phase 3 |
| `"enabled":false` | `disabled` |
| `no-key` | `disabled` — the guard returns before doing anything. Say *config carries no `enabled` key, the guard treats that as off* in *found*; the fix is `enable`, not `upgrade` |
| `ABSENT` on both scopes while the hook files exist | `partial` — the guard is wired but has no config to read, so it can never arm |

Row 7's `agent-router.json` and row 10's `config.json` take the opposite default: no `enabled` token in
the output line is `ENABLED`, and neither ever yields `disabled` on a missing key.

**EXECUTE** using Bash tool — entry-file parking. **Row 5 (think-short) parks; it belongs here, not in
the config-flag block above.** `LIVE` / `PARKED` / `ABSENT` are three distinct answers and the block
never collapses them: `ABSENT` means never deployed, `PARKED` means deployed and switched off:

```bash
for f in .claude/skills/superreview/SKILL.md .claude/skills/memory-sync/SKILL.md \
         .claude/agents/task-tracker.md .claude/skills/task-board/SKILL.md \
         .claude/skills/task-spec/SKILL.md .claude/rules/tasks.md; do
  if   [ -f "$f" ];          then echo "LIVE   $f"
  elif [ -f "$f.disabled" ]; then echo "PARKED $f.disabled"
  else                            echo "ABSENT $f"; fi
done
for d in "$PWD/.claude" "$HOME/.claude"; do
  p="$d/hooks/think-short-prompt.md"
  if   [ -f "$p" ];           then echo "LIVE   $p"
  elif [ -f "$p.disabled" ];  then echo "PARKED $p.disabled"
  else                             echo "ABSENT $p"; fi
done
for t in .claude/teams/*/team.md; do
  [ -f "$t" ] || continue
  n=$(basename "$(dirname "$t")")
  awk '/^## Agents/{a=1;next} a&&/^## /{exit} a&&/^\|/{split($0,c,"|");gsub(/[`[:space:]]/,"",c[2]);if(c[2]!=""&&c[2]!~/^-+$/&&c[2]!="Agent")print c[2]}' "$t" |
  while IFS= read -r m; do
    [ "$m" = "intent-guard" ] && continue
    if   [ -f ".claude/agents/$m.md" ];          then echo "LIVE   team:$n $m"
    elif [ -f ".claude/agents/$m.md.disabled" ]; then echo "PARKED team:$n $m"
    else                                              echo "ABSENT team:$n $m"; fi
  done
done
echo "OK"
```

Row 5 prints one line per scope, and only the scope whose `think-short-session.mjs` Phase 1 found is
the answer — `ABSENT` on the other scope is not a finding. `ABSENT` on the *installed* scope while its
four hooks are wired is `partial`, not `disabled`: the hooks fire and inject nothing, which is a
broken install, and the whole reason this row cannot be probed by presence of the hooks alone.

Reading the two multi-artifact rows (1 and 4), where a toggle can land halfway:

| Pattern | Row state |
|---------|-----------|
| every deployed artifact `PARKED` | `disabled` — the intended state |
| every deployed artifact `LIVE` | not disabled; fall through to the rest of Phase 3 |
| some `LIVE`, some `PARKED` | `partial` — a `disable`/`enable` that did not finish. Name the halves; the fix is re-running the same verb, which is a documented no-op on the artifacts already in the requested state |
| `ABSENT` on row 4's `task-spec` alone, everything else `LIVE` | not a disable signal at all — that is the roster's `SPEC_MODE=off` / pre-spec-layer absence signal, already handled as `stale` |

## Phase 2a — Read the version stamps (the headline)

ONE generic block for all ten rows: it dispatches on file extension, so the roster's carrier column
is the only thing that decides which path goes in. Paste into `PLUGIN_ROOT` the `ROOT=` Phase 0
printed for the plugin whose rows you are scanning and set `PLUGIN` to that plugin's name — **run it
three times, once per plugin**, since brewcode / brewtools / brewdoc can sit at different versions.
Nothing else changes between the three runs.

**The heredoc is the complete set, enumerated — never a sample to expand.** It carries all seventeen
carrier lines for all ten rows on every run and filters by the `PLUGIN` tag, so a row cannot be
silently dropped by an operator who expands two exemplars and stops. Two assertions make drift LOUD
rather than silent: `TOTAL` must be 17 (a line deleted anywhere aborts, even in a plugin group this
run is not scanning) and `SEEN` must equal the group's `WANT` (3 / 11 / 3). Both are `exit 1`, not a
warning. **Adding a roster row means adding its carrier lines here AND raising both counts in the
same edit** — that is the whole cost, and the assertion is what charges it.

**Never type the plugin version into this block.** It is re-derived from `PLUGIN_ROOT` with the same
precedence Phase 0 used — cache-directory basename first, `.claude-plugin/plugin.json` `.version`
second — so the comparison can never be pinned to a number that was current when this file was
written. The authority for that precedence is `brewcode/hooks/session-start.mjs` `parseVersion`, which
matches `/\/(\d+\.\d+\.\d+)\/?$/` on the root and falls back to `plugin.json`: one precedence, two
consumers.

> **This is NOT the §4 idiom, and citing §4 here would be wrong.** `references/artifact-metadata.md`
> §4 rank 3 calls the cache glob *"forbidden as the primary path"* — and it is right, **for a
> writer**. A generator that stamps an artifact must record the version it is RUNNING AS, which under
> `claude --plugin-dir ./brewcode` is the checkout, not the cache; resolving from the cache there
> bakes a number the run never used. This skill writes nothing and stamps nothing. Its question is the
> opposite one — *which installed plugin is the artifact on disk being compared against* — and the
> installed plugin IS the cache leaf that Phase 0 already resolved and printed. Re-deriving it from
> `PLUGIN_ROOT`'s basename is reading back the answer, not guessing at one; the `plugin.json` fallback
> covers a root that is not a version-named leaf. §4's own guard against "picks a stale leaf when
> several versions are cached" is discharged by Phase 0's `sort -V | tail -1`, and the `--plugin-dir`
> hazard is discharged by the Guards table, which STOPs when no cache root exists rather than
> substituting the checkout.

**EXECUTE** using Bash tool:

```bash
PLUGIN_ROOT=/abs/root/printed/by/phase0
PLUGIN=brewcode          # brewcode | brewtools | brewdoc - selects which STAMPS lines run
PLUGIN_VER=$(basename "$PLUGIN_ROOT")
case "$PLUGIN_VER" in
  [0-9]*.[0-9]*.[0-9]*) : ;;
  *) PLUGIN_VER=$(grep -o '"version"[[:space:]]*:[[:space:]]*"[^"]*"' "$PLUGIN_ROOT/.claude-plugin/plugin.json" 2>/dev/null | head -1 | sed 's/.*:[[:space:]]*"//; s/"$//' || true) ;;
esac
case "$PLUGIN_VER" in
  [0-9]*.[0-9]*.[0-9]*) : ;;
  *) echo "ABORT: plugin version unresolved for $PLUGIN_ROOT (got '${PLUGIN_VER:-}') - no comparison is possible, do not feed it to sort -V"; exit 1 ;;
esac
echo "PLUGIN_VER=$PLUGIN_VER"
stamp_one() {
  sf=$1; so=$2
  case "$sf" in "~/"*) sf="$HOME/${sf#\~/}" ;; esac
  if [ ! -f "$sf" ] && [ -f "$sf.disabled" ]; then sf="$sf.disabled"; fi
  if [ ! -f "$sf" ]; then echo "MISSING   $sf"; return; fi
  v=""; sg=""
  case "${sf%.disabled}" in
    *.json)
      v=$({ grep -o '"version"[[:space:]]*:[[:space:]]*"[^"]*"' "$sf" 2>/dev/null || true; } | head -1 | sed 's/.*:[[:space:]]*"//; s/"$//')
      sg=$({ grep -o '"generated_by"[[:space:]]*:[[:space:]]*"[^"]*"' "$sf" 2>/dev/null || true; } | head -1 | sed 's/.*:[[:space:]]*"//; s/"$//') ;;
    *.mjs|*.js|*.sh|*.bash)
      m=$({ sed -n '1,5p' "$sf" | grep -o 'brewcode-meta:.*' || true; } | head -1)
      v=$({ printf '%s\n' "$m" | grep -o 'version=[^ ]*' || true; } | sed 's/version=//')
      sg=$({ printf '%s\n' "$m" | grep -o 'generated_by=[^ ]*' || true; } | sed 's/generated_by=//; s/-->$//') ;;
    *)
      h=$(sed -n '1,40p' "$sf")
      v=$({ printf '%s\n' "$h" | grep -o '^version:[[:space:]]*.*' || true; } | head -1 | sed 's/^version:[[:space:]]*//; s/^"//; s/"$//; s/[[:space:]]*$//')
      [ -n "$v" ] || v=$({ printf '%s\n' "$h" | grep -oE '^\|[[:space:]]*Version[[:space:]]*\|[^|]*\|' || true; } | head -1 | sed 's/^.*Version[[:space:]]*|[[:space:]]*//; s/[[:space:]]*|$//')
      [ -n "$v" ] || v=$({ sed -n '1,5p' "$sf" | grep -o 'brewcode-meta:.*' || true; } | head -1 | { grep -o 'version=[^ ]*' || true; } | sed 's/version=//')
      sg=$({ printf '%s\n' "$h" | grep -o '^generated_by:[[:space:]]*.*' || true; } | head -1 | sed 's/^generated_by:[[:space:]]*//; s/^"//; s/"$//; s/[[:space:]]*$//')
      [ -n "$sg" ] || sg=$({ printf '%s\n' "$h" | grep -oE '^\|[[:space:]]*Generated by[[:space:]]*\|[^|]*\|' || true; } | head -1 | sed 's/^.*Generated by[[:space:]]*|[[:space:]]*//; s/[[:space:]]*|$//; s/^`//; s/`$//')
      [ -n "$sg" ] || sg=$({ sed -n '1,5p' "$sf" | grep -o 'brewcode-meta:.*' || true; } | head -1 | { grep -o 'generated_by=[^ ]*' || true; } | sed 's/generated_by=//; s/-->$//') ;;
  esac
  v=${v:-}; sg=${sg:-}
  if [ -n "$so" ]; then
    if   [ -z "$sg" ];        then echo "OWNER-NONE  $sf (expected $so)"
    elif [ "$sg" != "$so" ];  then echo "OWNER-WRONG $sf ($sg, expected $so)"; fi
  fi
  if [ -z "$v" ]; then
    r=$(grep -cE 'memory-sync template v|intent-guard template v|SKILL METADATA[^A-Za-z]*generated|<!-- last-updated:|\*\*Last Updated:\*\*|"?(updatedAt|updated_at|lastUpdated|lastSetup|lastVerifiedAt|checkedAt)"?[[:space:]]*:' "$sf" 2>/dev/null || true); r=${r:-0}
    [ "$r" -gt 0 ] && echo "LEGACY-FMT  $sf (retired stamp format)" || echo "LEGACY-NONE $sf (no stamp at all)"
    return
  fi
  case "$v" in *'{'*|*'}'*|*'<'*|*'>'*) echo "PLACEHLD  $sf ($v)"; return ;; esac
  if [ "$v" = "$PLUGIN_VER" ]; then echo "CURRENT   $sf ($v)"; return; fi
  older=$(printf '%s\n%s\n' "$v" "$PLUGIN_VER" | sort -V | head -1 || true)
  if [ "$older" = "$v" ]; then echo "BEHIND    $sf ($v -> $PLUGIN_VER)"; else echo "AHEAD     $sf ($v > $PLUGIN_VER)"; fi
}
SEEN=0; TOTAL=0
while IFS='|' read -r pl pat owner; do
  [ -z "$pl" ] && continue
  TOTAL=$((TOTAL+1))
  [ "$pl" = "$PLUGIN" ] || continue
  SEEN=$((SEEN+1))
  case "$pat" in
    *'*'*)
      n=0
      for gm in $pat; do [ -e "$gm" ] || continue; n=$((n+1)); stamp_one "$gm" "$owner"; done
      [ "$n" -gt 0 ] || echo "MISSING   $pat (glob matched nothing)" ;;
    *) stamp_one "$pat" "$owner" ;;
  esac
done <<'STAMPS'
brewcode|.claude/teams/*/team.md|brewcode:teams-setup
brewcode|.claude/rules/semble-first.md|brewcode:semble-setup
brewcode|.claude/skills/superreview/SKILL.md|brewcode:superreview-setup
brewtools|.claude/features/board.md|brewtools:task-board-setup
brewtools|.claude/hooks/think-short-session.mjs|brewtools:think-short-setup
brewtools|~/.claude/hooks/think-short-session.mjs|brewtools:think-short-setup
brewtools|.claude/hooks/agent-deadline-guard.mjs|brewtools:agent-deadline-setup
brewtools|~/.claude/hooks/agent-deadline-guard.mjs|brewtools:agent-deadline-setup
brewtools|.claude/agent-deadline.json|brewtools:agent-deadline-setup
brewtools|~/.claude/agent-deadline.json|brewtools:agent-deadline-setup
brewtools|.claude/hooks/agent-router.mjs|brewtools:agent-router-setup
brewtools|.claude/brewtools/agent-router.json|brewtools:agent-router-setup
brewtools|.claude/brewtools/manager/state.json|brewtools:manager-setup
brewtools|.claude/brewtools/manager/hardmode-guard.mjs|brewtools:manager-setup
brewdoc|.claude/skills/memory-sync/SKILL.md|brewdoc:memory-sync-setup
brewdoc|.claude/docsync/config.json|brewdoc:docsync-setup
brewdoc|.claude/hooks/docsync-track.mjs|brewdoc:docsync-setup
STAMPS
case "$PLUGIN" in
  brewcode)  WANT=3 ;;
  brewtools) WANT=11 ;;
  brewdoc)   WANT=3 ;;
  *)         echo "ABORT: PLUGIN must be brewcode, brewtools or brewdoc (got '$PLUGIN')"; exit 1 ;;
esac
[ "$TOTAL" = 17 ] || { echo "ABORT: STAMPS holds $TOTAL carrier lines, the roster's ten rows need 17 - the set drifted from the roster"; exit 1; }
[ "$SEEN" = "$WANT" ] || { echo "ABORT: $SEEN of $WANT $PLUGIN carrier lines reached the loop"; exit 1; }
echo "ROWS $SEEN/$WANT for $PLUGIN (17 carrier lines over 10 roster rows)"
echo "OK"
```

Each heredoc line is `plugin|path|expected-owner`. The owner is the row's own `<plugin>:<skill>` —
the roster's Skill column with the leading `/` dropped — so it needs no new roster column and cannot
drift from it. Leave the trailing `|owner` off a line to skip the owner check for that file.

How the seventeen lines map onto the ten rows — the mapping the two assertions enforce:

| Rows | Lines | Carriers |
|------|-------|----------|
| 1, 2, 3 (`PLUGIN=brewcode`, `WANT=3`) | 3 | `team.md` (glob, see below), `semble-first.md`, the EMITTED `superreview/SKILL.md` |
| 4 (`PLUGIN=brewtools`, `WANT=11`) | 1 | `board.md` |
| 5 | 2 | `think-short-session.mjs` in BOTH scopes |
| 6 | 4 | `agent-deadline-guard.mjs` + `agent-deadline.json`, in BOTH scopes |
| 7 | 2 | `agent-router.mjs` + `agent-router.json` (project-only setup, one scope) |
| 8 | 2 | `state.json` (primary) + the copied `hardmode-guard.mjs` (documented fallback) |
| 9, 10 (`PLUGIN=brewdoc`, `WANT=3`) | 3 | the emitted `memory-sync/SKILL.md`, `docsync/config.json`, `docsync-track.mjs` |

Three things the enumeration made the block responsible for, rather than the operator:

- **Row 1's glob is expanded by the block**, one verdict per team, so a repo with several teams at
  several versions prints them all. A glob that matches nothing prints one `MISSING` for the pattern.
  Never hand-resolve it — hand-resolution is how a second team goes unread.
- **`~/` is expanded against `$HOME`** so the global-scope twins of rows 5 and 6 are real paths. Both
  scopes are always scanned and **`MISSING` on the scope that is not installed is not a finding** —
  the same rule Phase 1b states for row 5. Only the scope Phase 1 found is the answer.
- **Rows 6, 7, 8 and 10 print two lines each, and the roster's precedence decides which is the
  headline** — the JSON first on 6, 7 and 10; on row 8 the `state.json` first and the guard's
  `brewcode-meta` line only when `state.json` carries no `version` key. The second line is never a
  contradiction to reconcile; it is the fallback answering.

> **Row 8 can print `LEGACY-NONE` on a perfectly current install, and that is the documented path,
> not a legacy finding.** `writeState` OMITS `version` when it cannot resolve the plugin version
> rather than stamping `unknown` (`brewtools/hooks/lib/manager-state.mjs:242-252`) — see
> `references/artifact-metadata.md`, "A writer that cannot resolve the version ABORTS". An absent key
> is exactly the `missing` signal the roster's row 8 defines, so read the guard's line beneath it and
> report from that. `LEGACY-NONE` on `state.json` **with** a `CURRENT` guard line is `installed`, not
> `stale (legacy, unstamped)`.

| Verdict | Means | Feeds Phase 3 as |
|---------|-------|------------------|
| `CURRENT` | stamp == installed plugin version | `installed` (if the row's `cmp` pairs agree) |
| `BEHIND` | stamp < plugin version | `stale (X.Y.Z -> A.B.C)` |
| `AHEAD` | stamp > plugin version | `stale` — a dev/`--plugin-dir` install newer than the cache; say so, do not tell the user to upgrade the project |
| `LEGACY-FMT` | no current stamp, but a **retired** spelling is present (`memory-sync template vX.Y.Z`, `intent-guard template v2`, `SKILL METADATA - generated <ts>`, `<!-- last-updated: -->`, `updatedAt` / `lastUpdated` / `checkedAt` …) | `stale (legacy stamp)` — the migration case, one `upgrade` restamps it |
| `LEGACY-NONE` | file exists and carries no stamp in any carrier or any retired spelling | `stale (legacy, unstamped)` |
| `PLACEHLD` | the stamp is still an unresolved token — `{...}` (sanctioned `{PLUGIN_VERSION}` or retired `{{PLUGIN_VERSION}}`) or a retired angle form (`<plugin X.Y.Z>`, `<date +%F>`, `<YYYY-MM-DD>`) | `partial` — substitution never finished. On row 3 this is only ever read from the EMITTED file, never from `.template-baseline/` |
| `MISSING` | no such file **and no `.disabled` twin** | the row's anchor decides: `missing` or `partial` |

The owner check prints an EXTRA line beside the version verdict, never instead of it — a file can be
`CURRENT` and owner-wrong at once, and that pair is the whole point:

| Verdict | Means | Feeds Phase 3 as |
|---------|-------|------------------|
| `OWNER-WRONG` | `generated_by` names a different skill than the row that owns the artifact | `partial` — some other generator wrote this path. Name both skills; the fix is re-running the OWNING setup, and the user must be told the other one may overwrite it again |
| `OWNER-NONE` | the version stamp is present but `generated_by` is not | `stale (legacy stamp)` — a pre-standard or partial stamp. `references/artifact-metadata.md` §1 requires the field in every artifact and every carrier, so its absence beside a real `version` is an incomplete write, not a variant |
| (no line) | `generated_by` equals the expected owner | nothing — silence is the pass |

**Why `generated_by` gets a reader and the other two fields do not.** Four fields are written; the
question for each is whether a reader can turn it into an ACTIONABLE verdict:

| Field | Read here? | Why |
|-------|-----------|-----|
| `version` | yes — the headline | the only field that answers *is this behind the plugin*, and it maps to five of the six states |
| `generated_by` | yes | it is the ONE field whose wrong value is otherwise undetectable. Two setups can write the same path (`intent-guard.md` is emitted by both `superreview-setup` and `teams-setup`), a hand-copied artifact carries its source's owner, and a template pasted between skills carries the wrong one forever — none of which any other signal sees, because the version and the bytes can both be perfectly right. The action is concrete: re-run the owning setup |
| `last_updated` | **no** | it is a date, and no state in this skill's vocabulary is defined by one. It cannot disagree with `version` in any way `version` does not already report: a stale date on a current stamp means only that the release did not change the file, and an old date on an old stamp is the `BEHIND` the row already prints. Reading it would emit a verdict whose only fix is the `upgrade` already prescribed — noise on every row. It is also absent by design from every `.mjs`/`.sh` stamp and from `semble-first.md` (§1), so a reader would have to special-case half the roster to say nothing new. Never infer staleness from it, exactly as this skill never infers it from an mtime |
| `doc_type` | **no** | it is docsync's field and it is USER-OWNED: §1 says a repo that chose `user` or `skip` chose deliberately, and `semble-guidance.sh` preserves the destination's value even under `--force`. A value that differs from the template is the spec working, so there is no mismatch to report |

**The `.disabled` fallback is what keeps a disabled install from reading as an unstamped one.** A
parked entry file (Phase 1b) is byte-identical to the live one, stamp included, so the block retries
`$f.disabled` before giving up and dispatches the carrier on the name with `.disabled` stripped. The
printed path keeps the suffix, so the row's version is real and its parked state is visible in the
same line. Without this a `disable` would turn every affected row into `MISSING` -> `missing`, i.e.
"never installed" — the exact misreading a reversible off-switch must not produce.

The carriers the block understands are exactly the ones in `references/artifact-metadata.md` §2, and
`version` and `generated_by` are read out of the SAME carrier on every branch — never one from the
frontmatter and the other from a comment:

| Carrier | `version` | `generated_by` |
|---------|-----------|----------------|
| `.json` | top-level `"version"` key | top-level `"generated_by"` key |
| `.mjs` / `.sh` | `version=` in the `brewcode-meta:` comment right after the shebang (only the first 5 lines are scanned, so a `version=` in the body cannot be mistaken for a stamp) | `generated_by=` in that same one line — both are pulled from the single `brewcode-meta:` match, so a second marker deeper in the file cannot supply half a stamp |
| anything else | frontmatter `version:` in the first 40 lines, then a `\| Version \| X.Y.Z \|` header-table row, then a `brewcode-meta:` marker in the first 5 lines | frontmatter `generated_by:`, then a `\| Generated by \| … \|` header-table row, then `generated_by=` in the `brewcode-meta:` marker |

The `brewcode-meta:` fallback on the third row exists because `think-short-prompt.md` and the three
`memory-sync` references carry their stamp as an HTML comment — those bodies are injected into a
prompt or cited verbatim, so frontmatter would leak into the text. The `generated_by=` extraction
strips a trailing `-->` for exactly that reason: in `<!-- brewcode-meta: version=X.Y.Z generated_by=brewdoc:memory-sync-setup -->`
the owner is the last token before the comment close.

Values are quoted in YAML and JSON (`version: "X.Y.Z"`, `generated_by: "brewcode:teams-setup"`) and
bare in the header table (`| Version | X.Y.Z |`); the block strips quotes either way, and backticks
off a header-table owner cell.

**The `PLACEHLD` test is deliberately generic — never a list of known tokens.** The sanctioned
spelling is single-brace `{PLUGIN_VERSION}` (`references/artifact-metadata.md` §4), but retired
angle-bracket forms (`<plugin X.Y.Z>`, `<date +%F>`, `<YYYY-MM-DD>`) and the retired double-brace
`{{PLUGIN_VERSION}}` still reach artifacts installed by older releases. So the test matches ANY
`{`, `}`, `<` or `>` in the value. A real version is `X.Y.Z` and can hold none of them, so this
never false-positives — and an unsubstituted token can never be fed to `sort -V`, which would
otherwise turn "substitution never ran" into a confident `BEHIND`/`AHEAD`. Never hardcode how many
placeholder spellings exist; the character test outlives the list.

The `LEGACY-FMT` grep is the mirror image — it names the exact retired strings of
`references/artifact-metadata.md` §8. `SKILL METADATA` matches only when followed by `generated`
(`SKILL METADATA - generated <ts>`, dash spelling irrelevant): live skills use the bare words in
other sentences, and a bare-substring match would report a current artifact as legacy.

**And its reach is the heredoc, which carries ARTIFACTS only.** The retired spellings of §8 are
*provenance* keys, so the grep is only ever meaningful on a file whose version is a staleness
signal. `references/artifact-metadata.md` §9 puts ephemeral runtime state out of scope entirely —
epoch-ms markers, TTL caches, `.claude/semble/state.json`, `.claude/docsync/state.json` — and none
of those may be added to the `STAMPS` heredoc even when a row lists them as secondaries. Feeding one
in is the only way this grep can false-positive: a `checkedAt`-style key inside a runtime cache is
correct code, not a legacy stamp. `brewcode/hooks/session-start.mjs` was the tree's last such
collision and now spells its TTL marker `fetchedAtMs`, so no shipped file trips the detector today —
but the scope rule, not the rename, is what keeps that true.

> `last_updated` is deliberately ABSENT from `.mjs`/`.sh` stamps and from the byte-copied
> `semble-first.md` — a date there would churn the file on every release and break `cmp`. Missing
> `last_updated` on a mechanism-`a` asset is the spec working as designed, never a legacy stamp. Only
> `version` decides this skill's verdict.

> **`|| true` on every no-match-tolerant command is MANDATORY in every fence in this file, not just
> this one.** `grep` exits 1 on no-match, `find` and `ls` exit non-zero on an absent path or an
> unmatched glob — and all three of those are the NORMAL case for a read-only probe that expects
> most things to be absent. Under `set -euo pipefail` the failure propagates out of the pipeline
> (`pipefail` carries it past `wc`, `sed`, `tr`, `head`) and out of the command substitution, and the
> block aborts before printing anything at all: the emptier the project, the less the dashboard says.
> The idiom is `x=$({ cmd || true; } | rest)` — the `|| true` goes on the command that legitimately
> fails, INSIDE the pipeline, so a genuine failure downstream still surfaces. `grep -c` needs
> `x=${x:-0}` after it as well: it prints `0` and exits 1 on no match, so `|| true` alone leaves the
> `0` but a bare `$(grep -c …)` on a missing file leaves the variable empty and `[ "$x" -gt 0 ]`
> then fails on an empty operand.
>
> Hardened here for the same reason: Phase 0's and Phase 5's `ls -d …/*/` (an uninstalled plugin is
> an unmatched glob — under `zsh` it is a hard `no matches found`), and Phase 1's `find -path` on a
> glob row.

## Phase 2b — `cmp` the byte-copied files (corroboration)

Only for rows whose roster cell names a `cmp` pair, and only when the anchor exists. Feed
`project|plugin` pairs built from the roster (absolute plugin paths from Phase 0).

**EXECUTE** using Bash tool:

```bash
while IFS='|' read -r a b; do
  [ -z "$a" ] && continue
  if   [ ! -f "$a" ]; then echo "ABSENT  $a"
  elif [ ! -f "$b" ]; then echo "NOSRC   $b"
  elif cmp -s "$a" "$b"; then echo "SAME    $a"
  else echo "DIFFERS $a"; fi
done <<'PAIRS'
.claude/hooks/semble-session.mjs|/abs/BC/skills/semble-setup/assets/semble-session.mjs
PAIRS
echo "OK"
```

`DIFFERS` on a file whose stamp reads `CURRENT` is the case the stamp alone cannot see: the copy came
from this plugin version but its bytes no longer match — a hand-edit, or an install that was never
re-run after a same-version rebuild. Report `stale (bytes drifted)` and name the file.

**Only a byte-STABLE copy belongs in `PAIRS`.** A file the install fills or appends to after copying
it — `memory-sync`'s `references/hard-sync.md` (BLOCKs filled by the generator's Phase 3) and the
repo-root `.sembleignore` (measured-candidates block appended by `install_candidates`) — differs on
every healthy project and must never be fed in; see the row-2 and row-9 carve-outs. Before adding a
pair, check the writer: if any mode writes that path after the `cp`, `cmp` answers a question nobody
asked, and the remedy the dashboard then prescribes destroys the content the installer put there.

Both violations were found by RUNNING the loop against a healthy fixture, never by reading the
roster. Re-verify a pair the same way: install into a throwaway repo and check the loop prints
`SAME` on a fresh install.

## Phase 3 — Classify

Exactly one state per row, in this order:

| # | Condition | State |
|---|-----------|-------|
| 1 | The row's plugin has `ROOT=none` | `n/a` |
| 2 | Phase 1b shows this row's off-switch thrown — a config flag at `enabled:false`, row 6's `no-key`, `.hard != true`, or every deployed entry file `PARKED` | `disabled` |
| 3 | Anchor MISS and every secondary MISS, **in both spellings** — no `<name>.disabled` twin anywhere on the row | `missing` |
| 4 | Anchor MISS but some secondary present, or anchor present with any secondary MISS, or a row-1/row-4 toggle left half `LIVE` half `PARKED`, or the stamp reads `PLACEHLD`, or Phase 2a printed `OWNER-WRONG` | `partial` |
| 5 | Stamp reads `BEHIND` or `AHEAD` | `stale (X.Y.Z -> A.B.C)` — print both versions |
| 6 | Stamp reads `LEGACY-FMT`, or `OWNER-NONE` beside a real version | `stale (legacy stamp)` |
| 7 | Stamp reads `LEGACY-NONE` | `stale (legacy, unstamped)` |
| 8 | The roster's absence signal fires (rows 1 and 4), or row 2's wiring signal fires (`retired[]`, `staleEntries`, or `wiredCount < wantCount`) | `stale` — name the artifact that is missing, or the wiring gap |
| 9 | Stamp `CURRENT`, but any `cmp` pair `DIFFERS` | `stale (bytes drifted)` — name the file |
| 10 | Stamp `CURRENT`, every `cmp` pair `SAME` (or the row defines none) | `installed` |
| 11 | Stamp `CURRENT` but a `cmp` source is `NOSRC` | `version unknown (plugin asset missing)` — the cache is incomplete, never `stale` |

State vocabulary is unchanged — `n/a` · `missing` · `disabled` · `partial` · `stale` · `installed`.
`stale` takes one of four qualifiers when a stamp or byte signal fired — rules 5-7 and 9, matching
`references/artifact-metadata.md` §6: `(X -> Y)` a version behind or ahead, `(legacy stamp)` a
retired stamp format, `(legacy, unstamped)` no stamp at all, `(bytes drifted)` right version wrong
bytes. Rule 8's absence and wiring signals print a bare `stale` with no qualifier, naming the missing
artifact (or the wiring gap) in *found* instead. Nothing else is a state.

Rules 2 and 3 are the two that stop false alarms:

- **`disabled` is evaluated FIRST, ahead of `missing`, `partial` and `stale`.** Five setups
  `disable` by parking their entry file, so on a disabled install the anchor itself is renamed away
  and every later rule would misfire — `missing` ("never installed"), or `partial` ("repair this")
  for something the user switched off on purpose. Inversely, a semble at `enabled:false`, a manager
  wall at `hard:false` or a docsync at `enabled:false` has every file in place and must NOT be
  reported `installed`: the mechanism is inert. A `disabled` row's Command column offers `enable`,
  never `upgrade`, and it never enters the run-list.
- **A missing `enabled` key is resolved per row, from the reader, never by a house default.** Row 6
  (agent-deadline) is opt-in — `cfg.enabled !== true` — so `no-key` is `disabled`. Rows 7 and 10 are
  opt-out, so a missing key is live and never reaches this rule. Applying one default to all three
  inverts one of them, and an inverted row 6 is the worst of the two directions: it reports a
  deadline as enforced when the guard returns on its first line.
- **Anchor MISS is decisive — but a `.disabled` twin is not a MISS.** The anchor is the artifact only
  that setup writes. No anchor in EITHER spelling = not installed, whatever else the project happens
  to contain. Never call a row `partial` on the strength of a shared file (see the exclusivity note
  in the roster), and never call a parked artifact absent.

**The verdict for a disabled install is `disabled` plus its real version.** Print the stamp Phase 2a
read out of the parked file (or out of the untouched config), not `--`: the install has a version, it
is simply not active. `disabled` is never combined with a `stale` qualifier — if a switched-off row
is also behind, say so in the *found* column and still offer `enable`, because `upgrade` on a parked
install is what the owning setups explicitly refuse (`task-board-setup` STOPs, `memory-sync`'s
`validate` FAILs, `superreview`'s `validate` FAILs — all three tell the user to `enable` first).

**Read the stamp; never guess a version.** The `version` field is now real data on every row, and
reading it is the job — rows 1 (`teams-setup`) and 4 (`task-board-setup`) used to be forced into
`version unknown` and now carry a stamp like the rest. What stays forbidden is unchanged in spirit:
never invent a version an artifact does not carry, never infer staleness from a file's mtime, never
derive a version from a directory name inside the project, and never report a signal this roster does
not define. An artifact with no stamp is `stale (legacy stamp)` — that is a fact about the install,
not licence to estimate what produced it.

Two facts that look like staleness and are not:

- `DIFFERS` on row 8's guard means only that `manager-setup install` has not been re-run since the
  last brewtools update — the wall still works. Report `stale`, and say that in one clause. That is
  a different finding from `hard: false`, which is rule 3's `disabled` and outranks it.
- A hook copied under `~/.claude` while the project also has one is a **scope** answer, not a
  conflict. Report the scope; row 5 and 6 are legitimately global.

## Phase 4 — Output

Lead with ONE line, before anything else — how many rows are behind the installed plugin:

```
4 of 10 setups are behind the installed plugin (2 stale by version, 1 legacy stamp, 1 drifted bytes).
```

Count only rows whose stamp is not `CURRENT` plus `stale (bytes drifted)`. `missing`, `disabled` and
`n/a` are not "behind" — they are not installed, switched off, or not applicable. If the number is 0,
say `all 10 setups are at <the resolved plugin version>` and still print the table.

Then ONE table, rows in roster order, filtered by `$ARGUMENTS`. Answer in the language the user wrote
in (RU or EN) — translate the prose, never the paths or the commands.

| Skill | State | Version | Found | Command |
|-------|-------|---------|-------|---------|
| `/brewcode:semble-setup` | stale (bytes drifted) | A.B.C = A.B.C | stamp current, but `semble-prefetch.mjs` DIFFERS from the A.B.C asset — the copy was hand-edited or never re-run | `/brewcode:semble-setup upgrade "re-copy the hooks, semble-prefetch.mjs drifted from the installed asset"` |
| `/brewtools:task-board-setup` | stale | X.Y.Z -> A.B.C | `board.md` + tracker present, `.claude/skills/task-spec/` absent | `/brewtools:task-board-setup upgrade "retrofit the spec + design layer onto the deployed board, keep every task id"` |
| `/brewdoc:memory-sync-setup` | stale (legacy stamp) | legacy -> A.B.C | emitted skill present, carries the retired `<!-- memory-sync template v1.0.0 -->` line and no frontmatter `version:`. For the per-file drift count: `bash "$BD/skills/memory-sync-setup/scripts/generate.sh" status` (read-only, run it yourself) | `/brewdoc:memory-sync-setup upgrade "migrate the pre-5.0 tail stamp to provenance frontmatter — its restamp step rewrites version/last_updated/surface_files in place and drops the tail line, hand-edits untouched"` |
| `/brewcode:superreview-setup` | partial | `{PLUGIN_VERSION}` | emitted `SKILL.md` still holds an unresolved placeholder — substitution never finished | `/brewcode:superreview-setup install "re-emit, the previous run left {PLUGIN_VERSION} unsubstituted"` |
| `/brewdoc:docsync-setup` | missing | -- | nothing under `.claude/docsync/` | `/brewdoc:docsync-setup install` |
| `/brewcode:teams-setup` | installed | A.B.C | `team.md` (Version A.B.C) + `trace.jsonl` + `trace-ops.sh`, all bytes match | `/brewcode:teams-setup status` |
| `/brewtools:think-short-setup` | disabled | A.B.C | 4 hooks wired, prompt renamed to `think-short-prompt.md.disabled` — switched off on purpose | `/brewtools:think-short-setup enable` |
| `/brewtools:manager-setup` | n/a | -- | brewtools not installed | `claude plugin install brewtools@claude-brewcode` |

In the sample above `A.B.C` stands for the installed plugin version and `X.Y.Z` for the artifact's
own stamp — the real report prints real numbers, and no literal version is ever carried in from this
file.

**Version column format:** `X.Y.Z` when current, `X.Y.Z -> A.B.C` when behind (stamp then plugin),
`legacy -> A.B.C` for a retired stamp format, `unstamped -> A.B.C` when there is no stamp at all, the
raw token when a placeholder survived, `--` for `missing` and `n/a`. `X.Y.Z = X.Y.Z` reads "stamp matches, the problem is elsewhere" — use it on
`stale (bytes drifted)` so the reader is not left hunting for a version difference that does not exist.

The **Command** column is a ready-to-paste line. For `stale` and `partial` it MUST carry a concrete
fine-tune prompt naming what to refresh — the drifted file, the missing artifact, the layer that was
never retrofitted, the placeholder that never resolved. A bare `upgrade` with no prompt is not
acceptable output.

> **A remedy MUST be able to clear the verdict it follows.** `upgrade` was for a long time the mode
> nobody owned: it refreshed content and left the stamp where it was, so `status` said `stale`,
> `upgrade` said success, and the next `status` said `stale` again. Every roster row now carries a
> **Remedy check** clause naming the code that proves its `upgrade` restamps. Two consequences bind
> this column:
>
> | Never emit | Because |
> |------------|---------|
> | the mode that JUST failed, as the fix for its own failure | that is the closed loop above. If a mode cannot clear its own verdict, name the one that can, or say plainly that no mode can and the user must act by hand |
> | `upgrade` on a row whose roster cell does not carry a Remedy check | an unverified remedy is a guess. Print the finding without a command rather than a command that does nothing |
>
> Three findings in this roster genuinely have NO mode that clears them, and each must be reported
> as such instead of dressed in a command: row 9's `hard-sync.md` (`DIFFERS` is the healthy state),
> a `REF DIFFERS:` hand-edit on row 9's other two references, and a prose hand-edit of row 2's
> `semble-first.md` (skipped as `user_modified`; only `--force` overwrites, and it is not a skill
> mode). Say what the user must diff and port by hand.
>
> `.sembleignore` is NOT a fourth: it is carved out of the `cmp` set, so this dashboard produces no
> byte verdict for it at all. `--force` on it overwrites the user's own uncommented exclusions —
> never print it.

Use the canonical modes ONLY: `status` · `install` · `upgrade` · `enable` · `disable` · `uninstall` ·
`purge`. The retired verbs (`create`, `update`, `cleanup`, `init`, `on`, `off`, `setup`, `remove`,
`reset`) were removed — `teams-setup` in particular now parses anything unknown as a TEAM NAME, so
emitting `/brewcode:teams-setup cleanup "..."` would install a team called `cleanup`. Never print one.

Two setups add extra verbs AFTER the canonical set, and those are live: `semble-setup` has
`reindex | optimize | resume`, `agent-router-setup` and `manager-setup` take `level <...>`. Use an
extra verb only when the roster row's finding is exactly what it fixes; otherwise the canonical verb
plus a free-text prompt.

Then the ordered run-list. **The closing paragraph is not optional** — it is the one place the user
sees why this dashboard hands back commands instead of running them. Print it every time, even when
the list has one entry:

```
Run in this order, ONE PER SESSION:
  1. /brewcode:superreview-setup install "..."   <- broken/partial first
  2. /brewtools:task-board-setup upgrade "..."   <- stale next
  3. /brewdoc:docsync-setup install              <- new installs last

Nothing above was run for you, by design. Each of these is an interactive generator: it
fans out several subagents, analyses the repo and asks you real questions. Two in one
session degrade each other — the context fills with the first one's analysis and the
second one's questions get answered against stale findings. Start a fresh session per
command.
```

Order: `partial` (broken install) -> `stale` -> `missing`. Within a tier, keep roster order.
`disabled`, `installed` and `n/a` rows never appear in the run-list — a switched-off mechanism is a
choice, not a defect. Mention a `disabled` row once, below the list, with its `enable` command.

## Phase 5 — Roster self-check

The self-updating property, as a WARNING. It never writes.

**EXECUTE** using Bash tool:

```bash
for p in brewcode brewdoc brewtools brewui; do
  r=$({ ls -d "$HOME/.claude/plugins/cache/claude-brewcode/$p"/*/ 2>/dev/null || true; } | sort -V | tail -1 | sed 's:/*$::')
  [ -n "$r" ] || continue
  { find "$r/skills" -maxdepth 1 -type d -name '*-setup' 2>/dev/null || true; } | sed "s|.*/|$p:|"
done
echo "OK"
```

Compare that list against the roster's 10 commands.

| Finding | Report |
|---------|--------|
| A `*-setup` skill on disk that the roster does not know | `WARNING: <plugin>:<name> is installed but not in this skill's roster — its state was NOT checked. Add a row to setup-status/SKILL.md.` |
| A roster row whose skill dir is gone from an installed plugin | `WARNING: <row> is in the roster but no longer ships in <plugin> <version> — the row may be obsolete.` |
| Match | one line: `roster: 10/10 in sync` |

Print warnings **above** the table so they are not lost under it. Never edit the roster to fix a
warning — that is the user's call, in this repo, in a separate change.

## Guards

| Condition | Response |
|-----------|----------|
| User asks this skill to run a setup, "install everything", "fix them all" | Refuse once, plainly: setups are interactive multi-agent generators and batching them degrades every one. Print the run-list. Do not offer a compromise mode. |
| User asks for a `--fix` / auto flag | Same answer. It does not exist by design, not by omission. |
| All four plugin roots `none` | Report "no brewcode plugins installed" + `claude plugin install <p>@claude-brewcode`. Do not print an all-`missing` table. |
| Running with `--plugin-dir` (dev mode, no cache dir) | Phase 0 finds no root. Say so: the report needs the installed cache to compare against; the repo checkout is not a substitute. |
| Project has no `.claude/` | Every row `missing`. Print the table and the install run-list. |
| A `cmp` source path is `NOSRC` | The plugin cache is incomplete for that asset. Report `version unknown (plugin asset missing)` and say the byte check could not run — never `stale` on a missing source. |
| An artifact's stamp is `AHEAD` of the plugin | A dev checkout or `--plugin-dir` install newer than the cache. Report it as `stale` with the direction spelled out; do NOT tell the user to upgrade the project, tell them the cache is behind. |
| A mechanism-`a` asset has `version` but no `last_updated` | Correct by design — a date would churn the file every release and break `cmp`. Not a legacy stamp, not a finding. |
| `TASK_TEMPLATE.md` has no stamp (row 4) | Deliberate: its frontmatter is copied into every task card. Never report it. |
| `.claude/skills/memory-sync/references/hard-sync.md` differs from the plugin source (row 9) | **The healthy state, not a finding.** Its two BLOCK placeholders are filled per project by the generator's Phase 3 and `validate` fails while they are not. Never `cmp` it, never stamp-read it, never name it in a remedy. Its frozen stamp is likewise correct — `refresh_refs` refuses to overwrite filled content. |
| `generate.sh restamp` printed `REF DIFFERS:` for row 9's `memory-guide.md` or `agent-audit.md` | A genuine local edit; the file was left untouched on purpose. Report `stale (bytes drifted)`, say `upgrade` will not overwrite it, and tell the user to diff against `$BD/skills/memory-sync-setup/references/<name>` and port by hand. There is no mode that clears it. |
| Row 2's `semble-first.md` is `DIFFERS` | Read *found* before prescribing. A metadata-only delta is re-synced by `upgrade` with no `--force`; a real prose hand-edit is SKIPPED as `user_modified` and only `--force` overwrites it — which is not a skill mode. Say which case it is, and hand back the `diff -u` route for the second. |
| The repo-root `.sembleignore` differs from `assets/sembleignore.template` (row 2) | **The healthy state, not a finding.** `install_candidates` appends a measured-candidates block after the copy, so a correct install differs by construction. Never `cmp` it, never report `stale (bytes drifted)` for it, and above all never prescribe `--force` — that backs up and overwrites the user's own uncommented exclusions. Its `# brewcode-meta:` stamp stays readable and IS the row's signal for it. |
| A `team.md` header row is `CURRENT` but an agent row's `Version` is behind (row 1) | A mixed roster from a partial `upgrade`, which is legitimate. Report the row `installed` and name the lagging agents in *found* — do not downgrade the whole row. |
| A version appears in `.template-baseline/` | Ignore it. That dir is raw template with placeholders unresolved by design; only the emitted artifact has a version. |
| An artifact exists only as `<name>.disabled` | PARKED, never missing and never a `partial` trigger. The body is byte-identical, so read its stamp (Phase 2a retries `$f.disabled`) and report the row `disabled` at that version. |
| `.claude/docsync/config.json` carries no `enabled` key | ENABLED. All three docsync hooks read `c.enabled !== false`, so back-compat installs written before the key existed are live. A missing key is never `disabled` and never `partial`. Same for `.claude/brewtools/agent-router.json`. |
| `.claude/agent-deadline.json` carries no `enabled` key | **INERT — the opposite answer to docsync's.** `agent-deadline-guard.mjs:354` reads `cfg.enabled !== true`, so a key-less (or unparsable) config makes the guard return before touching anything. Report `disabled` and offer `enable`. Never carry docsync's default across to this row. |
| Phase 2a printed `OWNER-WRONG` on a file that is otherwise `CURRENT` | `partial`. The right version and the right bytes prove nothing about who wrote the file. Name both skills in *found* and offer the OWNING setup's `install`; warn that the other generator may claim the path again. |
| Phase 2a printed `OWNER-NONE` beside a real version | `stale (legacy stamp)` — an incomplete stamp, not a variant. §1 requires `generated_by` in every artifact and every carrier. One `upgrade` restamps it. |
| An artifact's `last_updated` or `doc_type` differs from the plugin's | Not a finding, and not read. `last_updated` is a date and no state is defined by one; `doc_type` is user-owned and deliberately preserved across re-installs. Report neither. |
| A team has some members live and some `.md.disabled` | Half-applied toggle -> `partial`, naming both halves. `intent-guard` parked or live is NEVER part of that count — `toggle-team.sh` skips it because it is shared with `superreview-setup`. |
| `upgrade` looks like the fix for a `disabled` row that is also behind | It is not. `task-board-setup upgrade`, `memory-sync validate` and `superreview validate` all fail on a parked install by design. Offer `enable`; the version gap is a *found*-column note. |
| Two carriers on one row disagree (row 8: `state.json` vs the guard's meta line) | The roster names the precedence — `state.json` first. Report the headline from it and mention the second value once. |
| User asks "which of these should I install?" | Answer from the table only. Recommending a setup the project has no use for is noise — say when a row is legitimately skippable. |

</instructions>
