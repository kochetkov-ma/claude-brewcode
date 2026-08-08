---
name: brewcode:setup-status
description: "Reports which brewcode setup skills are installed, stale, partial or missing in this project, and prints the exact command to run for each. Triggers: setup status, what is installed, что установлено."
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

## The Roster — SINGLE SOURCE OF TRUTH

Every fact this skill knows about a setup lives in this ONE table. Adding a future setup = adding
ONE row. Nothing else in this file, and no script, encodes the roster.

| # | Skill (command) | Plugin | Anchor artifact | Secondary artifacts | Version signal |
|---|-----------------|--------|-----------------|---------------------|----------------|
| 1 | `/brewcode:teams-setup` | brewcode | `.claude/teams/*/team.md` | `.claude/teams/*/trace.jsonl`, `.claude/teams/*/trace-ops.sh` | **none** — files are AI-authored per project, no stamp. Report `version unknown`. Missing `trace-ops.sh` on an otherwise complete team = pre-5.0 install whose agents cannot trace -> `stale` |
| 2 | `/brewcode:semble-setup` | brewcode | `.claude/rules/semble-first.md` | `.claude/hooks/semble-session.mjs`, `.claude/hooks/semble-reminder.mjs`, `.claude/hooks/semble-explore.mjs`, `.claude/semble/state.json` | `cmp` the 3 hooks vs `$BC/skills/semble-setup/assets/*.mjs` and the rule vs `assets/semble-first.md.template` (all copied verbatim) |
| 3 | `/brewcode:superreview-setup` | brewcode | `.claude/skills/superreview/SKILL.md` | `.claude/skills/superreview/references/agent-prompt.md`, `.../report-template.md`, `.../scope.md`, `.claude/skills/superreview/.template-baseline/` | `cmp` the 4 pristine baseline copies vs the plugin templates (mapping below). Baseline dir absent -> `version unknown (pre-baseline install)` |
| 4 | `/brewtools:task-board-setup` | brewtools | `.claude/features/board.md` | `.claude/agents/task-tracker.md`, `.claude/skills/task-board/SKILL.md`, `.claude/skills/task-spec/SKILL.md`, `.claude/rules/tasks.md`, `.claude/features/PROGRESS.md` | **absence signal**: board present but `.claude/skills/task-spec/SKILL.md` missing = install predates the spec+design layer -> `stale`, the documented upgrade path has not been run |
| 5 | `/brewtools:think-short-setup` | brewtools | `.claude/hooks/think-short-session.mjs` (project) or `~/.claude/hooks/think-short-session.mjs` (global) | in the same dir: `think-short-prompt-counter.mjs`, `think-short-task.mjs`, `think-short-prompt.md`; plus a `think-short` reference in the matching `settings.json` | `cmp` all 4 vs `$BT/skills/think-short-setup/assets/` |
| 6 | `/brewtools:agent-deadline-setup` | brewtools | `.claude/hooks/agent-deadline-guard.mjs` (or the `~/.claude` twin) | `agent-deadline-cleanup.mjs` beside it, `.claude/agent-deadline.json`, `agent-deadline` in `settings.json` | `cmp` both `.mjs` vs `$BT/skills/agent-deadline-setup/assets/` |
| 7 | `/brewtools:agent-router-setup` | brewtools | `.claude/hooks/agent-router.mjs` | `.claude/brewtools/agent-router.json`, `agent-router.mjs` referenced in `.claude/settings.json` | `cmp` the hook vs `$BT/skills/agent-router-setup/assets/agent-router.mjs` |
| 8 | `/brewtools:manager-setup` | brewtools | `.claude/brewtools/manager/state.json` | `.claude/brewtools/manager/hardmode-guard.mjs`, a `hardmode-guard.mjs` PreToolUse entry in `.claude/settings.local.json` | `cmp` the copied guard vs `$BT/hooks/hardmode-guard.mjs` — `on` overwrites it every run, so `DIFFERS` means exactly "the wall was not re-armed since the plugin update" |
| 9 | `/brewdoc:memory-sync-setup` | brewdoc | `.claude/skills/memory-sync/SKILL.md` | `references/memory-guide.md`, `references/agent-audit.md`, `references/hard-sync.md` under it | **provenance stamp** — last line of the emitted `SKILL.md` starts `<!-- memory-sync template v`. Compare its version against `VERSION=` in `$BD/skills/memory-sync-setup/scripts/generate.sh`. No stamp -> `version unknown (UNSTAMPED)` |
| 10 | `/brewdoc:docsync-setup` | brewdoc | `.claude/docsync/config.json` | `.claude/docsync/state.json`, `.claude/hooks/docsync-track.mjs`, `docsync-watch.mjs`, `docsync-gate.mjs`, `docsync` in `.claude/settings.json` | `cmp` the 3 hooks vs `$BD/skills/docsync-setup/assets/` |

`$BC` / `$BT` / `$BD` = the resolved plugin roots from Phase 0.

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

### NOT setups — never appear in the report

Recurring tools, not one-time installs. They are correct to run repeatedly and have no installed
state to report: `brewcode:agents`, `skills`, `rules`, `convention`, `e2e`;
`brewtools:text-optimize`, `text-human`, `secrets-scan`, `ssh`, `deploy`, `plugin-update`,
`provider-switch`; `brewdoc:md-to-pdf`, `my-claude`, `publish`.

---

## Phase 0 — Resolve plugin roots

A plugin that is not installed makes every one of its rows `n/a` — never `missing`. Do not assume
all four are present.

**EXECUTE** using Bash tool:

```bash
for p in brewcode brewdoc brewtools brewui; do
  r=$(ls -d "$HOME/.claude/plugins/cache/claude-brewcode/$p"/*/ 2>/dev/null | sort -V | tail -1 | sed 's:/*$::')
  if [ -n "$r" ] && [ -d "$r" ]; then echo "$p ROOT=$r VERSION=$(basename "$r")"; else echo "$p ROOT=none VERSION=none"; fi
done
echo "PROJECT=$PWD"
test -d "$PWD/.claude" && echo "DOTCLAUDE=yes" || echo "DOTCLAUDE=no"
echo "OK"
```

> **STOP if FAILED** — cannot resolve the cache; report it and stop rather than calling everything
> `missing`. All four roots `none` also means stop: nothing installed, nothing to report.

Bind `$BC`, `$BT`, `$BD` from the output. `DOTCLAUDE=no` is a legitimate answer — every row is
`missing`, print the table anyway.

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
    *"*"*) n=$(find . -path "./$rel" 2>/dev/null | wc -l | tr -d ' '); [ "${n:-0}" -gt 0 ] && echo "GLOB $rel ($n)" || echo "MISS $rel" ;;
    *)     [ -f "$rel" ] && echo "FILE $rel" || echo "MISS $rel" ;;
  esac
done <<'PATHS'
.claude/teams/*/team.md
.claude/teams/*/trace-ops.sh
.claude/rules/semble-first.md
PATHS
echo "OK"
```

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

`disable` is a canonical verb, and a deliberately disabled setup is neither broken nor stale. Five
setups leave a probeable off-switch; the rest have none, so they can never be `disabled`.

| Row | Setup | Off-switch | Disabled when |
|-----|-------|-----------|---------------|
| 2 | semble | `.claude/semble/state.json` | `.enabled` is `false` (phase `disabled`); every file stays in place |
| 5 | think-short | prompt file renamed | `think-short-prompt.md.disabled` present in the hooks dir and `think-short-prompt.md` absent — the hooks stay wired and no-op |
| 6 | agent-deadline | `.claude/agent-deadline.json` (or the `~/.claude` twin) | `"enabled": false` |
| 7 | agent-router | `.claude/brewtools/agent-router.json` | `"enabled": false` |
| 8 | manager wall | `.claude/brewtools/manager/state.json` | `.hard` is not `true` — registration stays, the guard no-ops. This is the disarmed wall, not a broken one |

**EXECUTE** using Bash tool:

```bash
for d in "$PWD/.claude" "$HOME/.claude"; do
  [ -f "$d/hooks/think-short-prompt.md.disabled" ] && echo "think-short DISABLED ($d)"
  [ -f "$d/agent-deadline.json" ] && echo "agent-deadline $d/agent-deadline.json: $(tr -d ' \n' < "$d/agent-deadline.json" | grep -o '"enabled":[a-z]*' || echo 'no-key')"
done
for f in .claude/semble/state.json .claude/brewtools/agent-router.json .claude/brewtools/manager/state.json; do
  [ -f "$f" ] && echo "$f: $(tr -d ' \n' < "$f" | grep -o '"\(enabled\|hard\|phase\)":[^,}]*' | tr '\n' ' ')" || echo "$f absent"
done
echo "OK"
```

## Phase 2 — Version signals

Only for rows whose anchor exists AND whose roster cell defines a signal. Feed `project|plugin`
pairs built from the roster (absolute plugin paths from Phase 0).

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

Row 9's stamp is not a `cmp` — read it directly:

**EXECUTE** using Bash tool:

```bash
f=.claude/skills/memory-sync/SKILL.md
[ -f "$f" ] && tail -1 "$f" | grep -o 'memory-sync template v[0-9.]*' || echo "UNSTAMPED"
echo "OK"
```

Compare that against `VERSION=` in `$BD/skills/memory-sync-setup/scripts/generate.sh` (read it with
the Read tool, do not re-derive it).

## Phase 3 — Classify

Exactly one state per row, in this order:

| # | Condition | State |
|---|-----------|-------|
| 1 | The row's plugin has `ROOT=none` | `n/a` |
| 2 | Anchor MISS and every secondary MISS | `missing` |
| 3 | Phase 1b shows this row's off-switch thrown (`enabled:false`, `.hard != true`, or the `.disabled` prompt rename) | `disabled` |
| 4 | Anchor MISS but some secondary present, or anchor present with any secondary MISS | `partial` |
| 5 | All present, version signal says `DIFFERS` (any pair), or the stamp version != the plugin's, or the roster's absence signal fires | `stale` |
| 6 | All present, signal says `SAME` on every pair (or stamp matches) | `installed` |
| 7 | All present, roster cell says the signal does not exist | `installed (version unknown)` |

Rules 2 and 3 are the two that stop false alarms:

- **Anchor MISS is decisive.** The anchor is the artifact only that setup writes. No anchor = not
  installed, whatever else the project happens to contain. Never call a row `partial` on the strength
  of a shared file (see the exclusivity note in the roster).
- **`disabled` outranks `partial` and `stale`.** think-short's `disable` renames its prompt away, so
  the roster secondary `think-short-prompt.md` legitimately MISSes — reporting that as `partial` tells
  the user to repair something they switched off on purpose. Inversely, a semble with
  `enabled:false` or a manager wall with `hard:false` has every file in place and must NOT be
  reported `installed`: the mechanism is inert. A `disabled` row's Command column offers `enable`,
  never `upgrade`, and it never enters the run-list.

`installed (version unknown)` is the honest answer, not a defect to paper over. Never guess a
version, never infer staleness from a file's mtime, and never report a signal the roster does not
define. Rows 1 (`teams-setup`) and 4 (`task-board-setup`, apart from its absence signal) genuinely
have no version stamp — say so in the *found* column.

Two facts that look like staleness and are not:

- `DIFFERS` on row 8's guard means only that `manager-setup install` has not been re-run since the
  last brewtools update — the wall still works. Report `stale`, and say that in one clause. That is
  a different finding from `hard: false`, which is rule 3's `disabled` and outranks it.
- A hook copied under `~/.claude` while the project also has one is a **scope** answer, not a
  conflict. Report the scope; row 5 and 6 are legitimately global.

## Phase 4 — Output

ONE table, rows in roster order, filtered by `$ARGUMENTS`. Answer in the language the user wrote in
(RU or EN) — translate the prose, never the paths or the commands.

| Skill | State | Found | Command |
|-------|-------|-------|---------|
| `/brewcode:semble-setup` | stale | rule + 3 hooks present; `semble-reminder.mjs` DIFFERS vs brewcode 4.10.1 | `/brewcode:semble-setup upgrade "re-copy the hooks, the reminder hook drifted from the 4.10.1 asset"` |
| `/brewtools:task-board-setup` | stale | `board.md` + tracker present, `.claude/skills/task-spec/` absent | `/brewtools:task-board-setup upgrade "retrofit the spec + design layer onto the deployed board, keep every task id"` |
| `/brewdoc:docsync-setup` | missing | nothing under `.claude/docsync/` | `/brewdoc:docsync-setup install` |
| `/brewcode:teams-setup` | installed (version unknown) | `team.md` + `trace.jsonl` + `trace-ops.sh`; no version stamp exists for this setup | `/brewcode:teams-setup status` |
| `/brewtools:think-short-setup` | disabled | 4 hooks wired, prompt renamed to `think-short-prompt.md.disabled` — switched off on purpose | `/brewtools:think-short-setup enable` |
| `/brewtools:manager-setup` | n/a | brewtools not installed | `claude plugin install brewtools@claude-brewcode` |

The **Command** column is a ready-to-paste line. For `stale` and `partial` it MUST carry a concrete
fine-tune prompt naming what to refresh — the drifted file, the missing artifact, the layer that was
never retrofitted. A bare `upgrade` with no prompt is not acceptable output.

Use the canonical modes ONLY: `status` · `install` · `upgrade` · `enable` · `disable` · `uninstall` ·
`purge`. The pre-5.0 verbs (`create`, `update`, `cleanup`, `init`, `on`, `off`, `setup`, `remove`,
`reset`) were removed — `teams-setup` in particular now parses anything unknown as a TEAM NAME, so
emitting `/brewcode:teams-setup cleanup "..."` would install a team called `cleanup`. Never print one.

Two setups add extra verbs AFTER the canonical set, and those are live: `semble-setup` has
`reindex | optimize | resume`, `agent-router-setup` and `manager-setup` take `level <...>`. Use an
extra verb only when the roster row's finding is exactly what it fixes; otherwise the canonical verb
plus a free-text prompt.

Then the ordered run-list:

```
Run in this order, ONE PER SESSION:
  1. /brewtools:task-board-setup upgrade "..."   <- broken/partial first
  2. /brewcode:semble-setup upgrade "..."        <- stale next
  3. /brewdoc:docsync-setup install              <- new installs last

Each of these spawns several subagents and will ask you questions. Running two in one
session degrades both: the second one answers against the first one's stale analysis.
Start a fresh session per command.
```

Order: `partial` (broken install) -> `stale` -> `missing`. Within a tier, keep roster order.
`disabled`, `installed` and `n/a` rows never appear in the run-list — a switched-off mechanism is a
choice, not a defect. Mention a `disabled` row once, below the list, with its `enable` command.

## Phase 5 — Roster self-check

The self-updating property, as a WARNING. It never writes.

**EXECUTE** using Bash tool:

```bash
for p in brewcode brewdoc brewtools brewui; do
  r=$(ls -d "$HOME/.claude/plugins/cache/claude-brewcode/$p"/*/ 2>/dev/null | sort -V | tail -1 | sed 's:/*$::')
  [ -n "$r" ] || continue
  find "$r/skills" -maxdepth 1 -type d -name '*-setup' 2>/dev/null | sed "s|.*/|$p:|"
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
| A `cmp` source path is `NOSRC` | The plugin cache is incomplete for that asset. Report `version unknown (plugin asset missing)`, never `stale`. |
| User asks "which of these should I install?" | Answer from the table only. Recommending a setup the project has no use for is noise — say when a row is legitimately skippable. |

</instructions>
