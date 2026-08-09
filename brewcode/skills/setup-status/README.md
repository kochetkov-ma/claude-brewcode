# Setup Status

A read-only dashboard over every **setup skill** in the brewcode suite (brewcode, brewtools, brewdoc).
It probes the current project, reports what is installed, stale, half-installed or missing, and hands
back the exact command to run for each row.

```
/brewcode:setup-status                 # full cross-plugin report
/brewcode:setup-status brewtools       # only brewtools rows
/brewcode:setup-status semble-setup    # one row, with its detection rule spelled out
/brewcode:setup-status что установлено  # free text works (RU + EN); answers in your language
```

## It never runs a setup

Every setup skill is an interactive generator: it fans out subagents, analyses the repo and asks real
questions. Two of them in one session degrade each other — the second answers against the first one's
stale analysis. So this skill reports and stops, and **you** run each setup by hand, one per fresh
session.

`allowed-tools` is `[Read, Bash, Glob, Grep]`. No `Write`, no `Edit`, no `Agent`. Not a policy — a
capability. There is no `--run`, no `--fix`, no auto mode.

## What it covers

Ten setups. Everything else in the suite (`text-optimize`, `secrets-scan`, `agents`, `rules`,
`md-to-pdf`, …) is a recurring tool with no installed state and never appears in the report.

| Setup | Anchor it looks for | Where its version stamp lives |
|-------|---------------------|-------------------------------|
| `/brewcode:teams-setup` | `.claude/teams/*/team.md` | the `\| Version \|` row of `team.md`'s header table |
| `/brewcode:semble-setup` | `.claude/rules/semble-first.md` | frontmatter `version:` of that rule |
| `/brewcode:superreview-setup` | `.claude/skills/superreview/SKILL.md` | frontmatter `version:` of the **emitted** skill — never `.template-baseline/` |
| `/brewtools:task-board-setup` | `.claude/features/board.md` | frontmatter `version:` of the anchor itself — `board.md` opens with the four-key block |
| `/brewtools:think-short-setup` | `.claude/hooks/think-short-session.mjs` (or the `~/.claude` twin) | `// brewcode-meta:` line after the shebang |
| `/brewtools:agent-deadline-setup` | `.claude/hooks/agent-deadline-guard.mjs` (or the twin) | `// brewcode-meta:` line after the shebang |
| `/brewtools:agent-router-setup` | `.claude/hooks/agent-router.mjs` | `// brewcode-meta:` line after the shebang |
| `/brewtools:manager-setup` | `.claude/brewtools/manager/state.json` | top-level `"version"`, falling back to the copied guard's meta line |
| `/brewdoc:memory-sync-setup` | `.claude/skills/memory-sync/SKILL.md` | frontmatter `version:` of the emitted skill |
| `/brewdoc:docsync-setup` | `.claude/docsync/config.json` | top-level `"version"` |

## States

| State | Means |
|-------|-------|
| `missing` | anchor and every secondary artifact absent — never installed here. The anchor is decisive: a shared file such as a stray `.claude/agents/*.md` never counts as evidence |
| `disabled` | installed, then switched off on purpose (`disable`) — a config flag flipped, or the entry file parked as `<name>.disabled`. Reported as inactive with its real version, never as broken and never as missing, and never queued in the run-list |
| `partial` | some artifacts present, some gone — or a version stamp left as an unresolved `{PLACEHOLDER}`, meaning the generator never finished substituting |
| `installed` | stamp equals the installed plugin version, and every byte-copied file still matches its asset |
| `stale (X.Y.Z -> A.B.C)` | the stamp is a plugin version behind |
| `stale (legacy stamp)` | the artifact predates the metadata standard and carries no `version` at all |
| `stale (bytes drifted)` | right version, wrong bytes — a copied file was hand-edited or never re-copied |
| `n/a` | that plugin is not installed |

## How staleness is decided

Two signals, answering two different questions. No mtime heuristics, no guessing.

| Signal | Question | How |
|--------|----------|-----|
| **version stamp** (headline) | which plugin version produced what is installed here? | every artifact a setup writes carries `version` and `generated_by`, plus `last_updated` everywhere except `.mjs`/`.sh` stamps and `doc_type` in `.md` frontmatter only — never in JSON. The field contract lives in `references/artifact-metadata.md`. Carriers: YAML frontmatter for `.md`, top-level keys for `.json`, a `brewcode-meta:` comment after the shebang for `.mjs` / `.sh`, a `\| Version \|` header row for `team.md` |
| **owner stamp** | did the setup that owns this path actually write it? | `generated_by` vs the row's own `<plugin>:<skill>`. A mismatch is `partial` and names both skills; a missing `generated_by` beside a real `version` is `stale (legacy stamp)` |
| **`cmp` vs the plugin asset** (corroborating) | was this file actually re-copied after the plugin update? | byte equality on the copied files — semble's rule + its 3 hooks (**not** `.sembleignore`), think-short's 4, agent-deadline's 2, agent-router's 1, the manager guard, docsync's 3, **two** of memory-sync's 3 references, and `trace-ops.sh` |

Of the contract's four fields this skill reads exactly two. `last_updated` is not read: it is a date,
and no state in the vocabulary below is defined by one — an old date on an old stamp is the `stale`
the version already reports, and on a current stamp it only means the release did not touch the file.
`doc_type` is not read either: it is user-owned, and a re-install deliberately preserves whatever the
repo chose, so a difference is the spec working.

No signal replaces another. A hand-edited hook still carries the stamp it was copied with, so the
stamp cannot see body drift. `cmp` is meaningless for generated artifacts — an emitted `SKILL.md` or
`team.md` is AI-authored per project and never byte-equal to anything — so only the stamp reaches
those. And a file written by the wrong setup can be at the current version AND byte-perfect; only
`generated_by` catches it.

Stamps land at two different moments, which is why both signals stay honest: byte-copied assets are
stamped **at release** by `bump-version.sh`, so the installed copy stays byte-identical to the plugin
asset; generated artifacts are stamped **at install**, when the generator substitutes the version it
is running as. `.template-baseline/` is stamped at neither — it is the raw template, placeholders
unresolved by design, and no version is ever read from it.

Two byte-copied files are nevertheless never byte-STABLE, because the install writes to them again
after the copy — so `cmp` is wrong for both, and a healthy project is the case that proves it.

| File | Written after the copy by | Signals it keeps |
|------|---------------------------|------------------|
| `memory-sync`'s `references/hard-sync.md` | the generator's Phase 3 fills two project-specific tables | **neither** — its stamp is never refreshed either, so the row's version comes from the emitted `SKILL.md` alone |
| the repo-root `.sembleignore` | `install_candidates` appends a measured-candidates block (commented-out proposals, per repo) | the `# brewcode-meta:` stamp only — the installer strips that line AND the block before deciding, so the stamp still moves on a template update |

`cmp` `DIFFERS` on either is the healthy state, and reporting it as drift is exactly the false alarm
this dashboard exists to avoid. For `.sembleignore` the alarm was also dangerous: the remedy the row
used to prescribe, `semble-guidance.sh --force`, backs up and overwrites the user's own uncommented
exclusions. Neither file may appear in a `cmp` pair.

Two absence signals survive as extra `stale` triggers: a deployed board with no
`.claude/skills/task-spec/` predates the spec+design layer, and a complete team with no
`trace-ops.sh` is a pre-standard install whose agents cannot trace.

## Two rules that stop false alarms

**Anchor MISS is decisive, and every secondary must be EXCLUSIVE to its row.** A shared file — any
hand-written `.claude/agents/*.md`, or `intent-guard.md`, which both `superreview-setup` and
`teams-setup` can emit — is not evidence that this setup ran. Listing one made `teams-setup` report a
broken `partial` install in every project that merely had an agent file, and jump to the top of the
run-list. `teams-setup` therefore claims `.claude/teams/*/trace.jsonl` and `trace-ops.sh`;
`superreview-setup` claims none of the shared agent. A setup with no exclusive secondary is decided
by its anchor alone.

**`disabled` is evaluated first — ahead of `missing`, `partial` and `stale`.** All ten setups leave a
real off-switch on disk, each probed directly, in one of two mechanisms:

| Setup | Mechanism | Off-switch | Disabled when |
|-------|-----------|-----------|---------------|
| teams | entry-file parking | `.claude/agents/<member>.md.disabled` | every roster member of `team.md` is parked. `intent-guard` is never parked — it is shared with `superreview-setup` |
| semble | config flag | `.claude/semble/state.json` | `.enabled` is `false` |
| superreview | entry-file parking | `.claude/skills/superreview/SKILL.md.disabled` | present, `SKILL.md` gone. `references/` stays readable |
| task-board | entry-file parking | any of `task-tracker.md`, `task-board/SKILL.md`, `task-spec/SKILL.md`, `rules/tasks.md` as `.disabled` | every deployed one of the four is parked; `.claude/features/**` untouched |
| think-short | entry-file parking | hooks dir (project or `~/.claude`) | `think-short-prompt.md.disabled` present, `think-short-prompt.md` gone |
| manager | config flag | `.claude/brewtools/manager/state.json` | `.hard` is not `true` — disarmed wall, not a broken one |
| agent-deadline | config flag | `.claude/agent-deadline.json` (or the `~/.claude` twin) | `"enabled": false` **or the key absent** — the guard reads `cfg.enabled !== true`, so a key-less config is inert. Opt-in, the inverse of the two rows below |
| agent-router | config flag | `.claude/brewtools/agent-router.json` | `"enabled": false`. An **absent** key means enabled — the hook defaults `enabled: true` and only a literal `false` flips it |
| memory-sync | entry-file parking | `.claude/skills/memory-sync/SKILL.md.disabled` | present, `SKILL.md` gone. The 3 references and every self-synced hand-edit stay |
| docsync | config flag | `.claude/docsync/config.json` | `"enabled": false`. An **absent** key means enabled — all three hooks read `c.enabled !== false`, for back-compat |

Parking works because Claude Code discovers a project agent only as `.claude/agents/<n>.md`, a
project skill only as `<dir>/SKILL.md`, and auto-loads a rule only as `.claude/rules/*.md`.
Withholding that one filename is the whole switch; the body is byte-identical and nothing is deleted.

That is exactly why the order matters. On a parked install the **anchor itself** is renamed away, so
`missing` ("never installed here") would fire first and `partial` ("repair this") second — for
something you switched off on purpose. Both probes and the stamp reader treat a `.disabled` twin as
present: the stamp is read out of the parked file, so a disabled row reports its real version, not
`--`. Inversely, semble or docsync at `enabled:false` has every file byte-identical and must not be
called `installed` — the mechanism is inert.

A row-1 or row-4 toggle caught halfway (some artifacts live, some parked) is `partial`, named as
such; re-running the same verb finishes it. And `upgrade` is never the offer for a disabled row —
`task-board-setup`, `memory-sync` and `superreview` all refuse to operate on a parked install and
say `enable` first.

## Output

A headline count first — how many setups are behind the installed plugin:

```
4 of 10 setups are behind the installed plugin (2 stale by version, 1 legacy stamp, 1 drifted bytes).
```

Then one table (skill, state, version, what was found, command), then an ordered run-list. Writing
`X.Y.Z` for the artifact's own stamp and `A.B.C` for the installed plugin, the version column reads
`A.B.C` when current, `X.Y.Z -> A.B.C` when behind, `legacy -> A.B.C` when unstamped, and
`A.B.C = A.B.C` on a bytes-drifted row so nobody hunts for a version difference that does not exist.
No literal version number is ever carried in from this file — the report prints what Phase 0
resolved.

Every command must be able to CLEAR the verdict it follows. Each roster row records the code that
proves its `upgrade` restamps — the failure this guards against is an `upgrade` that refreshes
content and leaves the stamp alone, so `status` says `stale`, `upgrade` says success, and the next
`status` says `stale` again. A mode is never offered as the fix for its own failure, and where no
mode can clear a finding (a hand-edited `semble-first.md`, a hand-edited memory-sync reference) the
report says so and hands back the diff to port by hand.

The command is ready to paste, and for `stale` / `partial` it carries a concrete fine-tune prompt:

```
/brewtools:task-board-setup upgrade "retrofit the spec + design layer onto the deployed board, keep every task id"
```

A bare `upgrade` with no prompt is not acceptable output. Commands use the canonical modes:
`status` · `install` · `upgrade` · `enable` · `disable` · `uninstall` · `purge`.

Run order: `partial` first (broken installs), then `stale`, then `missing`. `disabled`, `installed`
and `n/a` rows stay out of the list — a switched-off mechanism is a choice, not a defect. The
run-list always closes with the reason nothing was run for you, so the stance is visible in the
report and not just in the source.

## Roster self-check

The roster is ONE table in `SKILL.md` — adding a future setup is one row, nothing else. On every run
the skill lists the `*-setup` dirs actually present in the installed plugins and compares. A setup it
does not know about produces a **warning above the table**, never a silent edit:

```
WARNING: brewtools:foo-setup is installed but not in this skill's roster — its state was NOT checked.
```

## Files

| Path | What |
|------|------|
| `SKILL.md` | the roster table (single source of truth), the probe blocks, classification and output contract |
| `references/artifact-metadata.md` | the artifact metadata + versioning standard — the field contract this skill consumes and never restates |
| `README.md` | this file |

No scripts and no assets: every probe is a generic inline block fed from the roster, so a new row
never needs a code change. The stamp reader dispatches on file extension, so a new carrier of an
existing type costs nothing either.

The one thing a new row DOES cost is two literals. The stamp reader's `STAMPS` heredoc enumerates
all 17 carrier lines for all ten rows — it is never a sample the model expands, because an expansion
that stops short reports nothing about the rows it skipped and cannot go red. Two `exit 1` assertions
hold it to the roster: total lines must be 17, and the scanned plugin's group must be 3 / 11 / 3.
Adding a row means adding its lines and raising both counts in the same edit.

## Documentation

Full docs: [setup-status](https://doc-claude.brewcode.app/brewcode/skills/setup-status/)
