---
name: plugin-update
description: Updates every installed brewcode plugin and mod in one run; shows versions before -> after, what changed and the next steps. Triggers - update plugins, check versions, обнови плагины.
user-invocable: true
disable-model-invocation: true
argument-hint: "[prompt] [update|check|all]"
allowed-tools: [Read, Bash, AskUserQuestion]
model: sonnet
license: MIT
---

# Brewcode Plugin Update

**First output:** the PLAN block below, as plain text, before any tool call.

> Updates every installed claude-brewcode plugin and mod at its own scope without asking what to update,
> offers what is missing in one question, then prints one report: versions before -> after, what changed
> for you, numbered next steps. `/reload-plugins` and the `/plugin` UI are user handoffs, never tool actions.

## Prompt contract

`$ARGUMENTS` is one free-form RU/EN prompt; the mode token may sit anywhere in it.

1. Mode: an explicit mode token wins outright; else the most distinct whole-word keyword hits
   (table below). Tie with `check` -> `check`; `update` vs `all` -> the keyword that comes first.
   No hit or empty -> `update`.
2. Scope: always every installed claude-brewcode plugin and mod, in every scope; the prompt never
   narrows the update (user ruling: updating is automatic). A missing plugin or mod named in the
   prompt is still only an offer: the Phase 3 question (`update`) or `all`.
3. Ask: at most ONE `AskUserQuestion` per run, at most 2 questions, only in `update` and only when
   Phase 2 lists offers; after the PLAN block, before the first change. The update itself is never
   asked about. `check` asks nothing; `all` takes every offer without asking (the word is consent).

Your reply starts with this block, filled from the prompt alone, then Phase 0 runs. Print it once, in
every mode, `check` included (labels and plan values English, INPUT verbatim). A block only in your
thinking or only inside a tool call does not count:

```
PLAN — brewtools:plugin-update
INPUT:  <arguments verbatim, or "(empty)">
MODE:   <resolved> — <explicit | matched keyword: X | default>
SCOPE:  every installed claude-brewcode plugin and mod, every scope; missing ones <update: one question | all: installed | check: listed>
DO:     <2-5 imperative bullets, in phase order>
RESULT: <what the user ends up holding>
```

## Modes

| Mode | EN keywords | RU keywords | Mutates? | Behavior |
|------|-------------|-------------|----------|----------|
| `update` | *(empty)*, `update`, `upgrade` | `обнови`, `обновление` | yes | Phases 0-6: updates every outdated installed row; asks once, only when offers exist |
| `check` | `check`, `status` | `проверь`, `статус` | no | Phases 0-2, then the Phase 6 check report; no question, no marketplace refresh |
| `all` | `all`, `everything`, `full` | `всё`, `полностью` | yes | `update` + every offer installed without asking + other marketplaces' rows + prune |

## Critical Rules

- Run every `claude plugin ...` command via the Bash tool, one plugin name per call; show the full
  output of every update and install.
- Never suggest `--plugin-dir` to end users: it is a dev-only flag.
- Scratch: Phase 0 makes ONE private `mktemp -d` dir and prints `SCRATCH <path>`; every later `<dir>`
  is that literal path (shell variables do not survive between Bash calls). Never pick a dir by glob.
  Phase 6 removes it after the report.
- `scripts/update-flow.mjs` builds the plan and the report from `references/update-flow.md` (data:
  §3, strings: §5). Print the report verbatim; never re-word it, re-order it or add a table of your own.
- Markers in anything you print: 🟢 done, 🔵 info, offer or next step, 🔴 failed, ⚪ unchanged or not
  installed. Fence marker lines (`✅ … OK`, `❌ … degraded`, `❌ … FAILED`, `SCRATCH <dir>`) are for you
  only: never copy one into a message.
- Mods need Claude Code 2.1.301 or newer: below that, `plan` offers no mod and the report prints
  its update-Claude-Code-first line. Never install a mod outside `offers`.
- The report's Next steps start with `/reload-plugins` on every `update`/`all` run, no-op runs
  included; never print a separate reload notice.
- AskUserQuestion: option lists only, no free-text fields.

## Phase 0 — Inventory

The PLAN block is already above in your reply, as plain text; not yet -> print it now, before this first tool call.

**EXECUTE** using Bash tool:
```bash
D="$(mktemp -d "${TMPDIR:-/tmp}/plugin-update.XXXXXX")" && echo "SCRATCH $D" && echo "✅ scratch OK" || echo "❌ scratch FAILED"
```

> **STOP if ❌** — report the error; nothing has changed.

**PRIMARY** (CC 2.1.163+) — **EXECUTE** using Bash tool, `<dir>` = the SCRATCH path:
```bash
unset CLAUDECODE && claude --version > "<dir>/cc.txt"
claude plugin list --json > "<dir>/before.json" && echo "✅ list OK" || echo "❌ list FAILED"
```

A valid JSON array, empty included, is the authoritative inventory; `plan` reads each row's `id`, `version`
(may be `"unknown"`), `scope`, `enabled`, `projectPath` (`project`/`local` rows; other projects too).
Ids ending `@inline`, `@skills-dir` or `@synced` are not marketplace installs and never update.

**FALLBACK** (CC < 2.1.163: ❌ above, or Phase 2 reports `"error":"no-inventory"`) — **EXECUTE** using Bash tool:
```bash
bash "${CLAUDE_SKILL_DIR}/scripts/discover-plugins.sh" > "<dir>/before.json" && echo "✅ discover OK" || echo "❌ discover FAILED"
```

Both fail -> inventory unknown (!=missing plugins): Phase 2 offers nothing and updates nothing.
Details: [references/discovery.md](references/discovery.md).

## Phase 1 — Latest Versions

`update` / `all` — **EXECUTE** using Bash tool, marketplace refresh first:
```bash
claude plugin marketplace update claude-brewcode && echo "✅ marketplace update OK" || echo "❌ marketplace update FAILED"
```

Then read the refreshed clone: versions, auto-update flag, release notes path; no network:
```bash
node "${CLAUDE_PLUGIN_ROOT}/skills/plugin-update/scripts/update-flow.mjs" latest > "<dir>/latest.json" && echo "✅ latest OK" || echo "❌ latest FAILED"
```

`check`, or either ❌ above — **EXECUTE** using Bash tool (read-only web fetch, replaces `latest.json`):
```bash
bash "${CLAUDE_SKILL_DIR}/scripts/fetch-latest-versions.sh" > "<dir>/latest.json" && echo "✅ fetch OK" || echo "❌ fetch FAILED"
```

Fetch ❌, or ✅ with every version `unknown` (offline) -> latest unknown: Phase 2 reports
`"error":"no-latest"`; never infer missing or outdated plugins from it. The report never calls a row
with an unknown latest current: its cell is `⚪ latest unknown` and, with no failed row, the title is
`## ⚪ brewcode: latest versions unknown (offline?)` (`check`: `## 🔵 brewcode check: latest versions unknown`).

## Phase 2 — Plan

**EXECUTE** using Bash tool, `<mode>` = the resolved mode:
```bash
node "${CLAUDE_PLUGIN_ROOT}/skills/plugin-update/scripts/update-flow.mjs" plan "<dir>" --mode "<mode>" && echo "✅ plan OK" || echo "❌ plan degraded"
```

One JSON line (`references/update-flow.md` §4):

| Key | Use |
|---|---|
| `update[]` | rows Phase 4 updates, in this order (mods first, placeholders first): `id`, `scope`, `projectPath`, `before`, `latest`; `orphan: true` = a `project`/`local` row whose directory is gone |
| `offers.mods[]` | missing mods, `name` + `value`; empty below Claude Code `offers.ccMin`; `migration` set = the codewords moved to this mod |
| `offers.plugins[]` | missing suite plugins, `name` + `value` |
| `scopes[]` | each distinct installed `scope` + `projectPath`, any marketplace, `user` first: the Phase 5 prune entries |
| `error` | `no-inventory` -> Phase 0 FALLBACK, then this phase again; still `no-inventory` -> Phase 6. `no-latest` -> `update[]` holds every claude-brewcode row; each update is a no-op when current |

rc 2 = a placeholder left unsubstituted: fix the command and re-run. `check` -> Phase 6.

## Phase 3 — One Question

The PLAN block is already printed (your first output): never repeat it. Only in `update` with a non-empty
`offers.mods` or `offers.plugins` -> ONE `AskUserQuestion`, `multiSelect: true`, one question per non-empty
list, in this order:

| Question | Header | Options |
|---|---|---|
| `Install the missing mods?` | `Mods` | per `offers.mods[]`, in order: label `<name>`, description `<value>`; `migration` set -> description `<value> - replaces the codewords you used`; then `Skip` |
| `Install the missing plugins?` | `Plugins` | up to 3 `offers.plugins[]`: label `<name>`, description `<value>`; more than 3 -> one option `Install all N`, description the names; then `Skip` |

Install set = the chosen options. `Skip`, alone or with others, or no answer (declined, headless) ->
nothing from that question; the report then prints each open offer's install command. `all` -> every
offer, no question. No offers -> no question.

## Phase 4 — Update, Then Install

Updates first: one command per Phase 2 `update[]` row, in order; an empty `update[]` runs none. Rows keep
their `id`, `scope` (`user | project | local | managed`) and `projectPath`. `user` / `managed` rows:
```bash
claude plugin update "<id>" --scope "<scope>" && echo "✅ update <id> OK" || echo "❌ update <id> FAILED"
```

`project` / `local` rows resolve from the cwd, so each runs from its own `projectPath`, never the
session cwd (the subshell keeps the session cwd):
```bash
(cd "<projectPath>" && claude plugin update "<id>" --scope "<scope>") && echo "✅ update <id> (<scope> <projectPath>) OK" || echo "❌ update <id> (<scope> <projectPath>) FAILED"
```

`projectPath` absent or not a directory: run nothing for that row; report `orphan <scope> install: <id> at <projectPath>` with the removal command `mkdir -p "<projectPath>" && cd "<projectPath>" && claude plugin uninstall "<id>" --scope "<scope>"`.

Always pass the discovered `--scope`: CLIs before 2.1.281 read omission as `user`. On failure: report the exact error and continue. Reference: [references/update-commands.md](references/update-commands.md), [references/update-prompt.md](references/update-prompt.md).

Then installs: the Phase 3 install set (`all`: every offer), in `offers` order, mods first, one name
per call. Phase 1 marketplace update ❌ -> add the marketplace first:
```bash
claude plugin marketplace add https://github.com/kochetkov-ma/claude-brewcode && echo "✅ marketplace add OK" || echo "❌ marketplace add FAILED"
```

Per name:
```bash
claude plugin install <plugin>@claude-brewcode && echo "✅ install <plugin> OK" || echo "❌ install <plugin> FAILED"
```

Manual install prompt for a fresh machine: [references/install-prompt.md](references/install-prompt.md).

## Phase 5 — Prune, Then the After Snapshot

Prune: `all` only; `update` goes straight to the snapshot. Prune removes only auto-installed
dependencies nothing still requires. Run it once per Phase 2 `scopes[]` entry, in order: `user` from the
session cwd (`<projectPath>` = `.`), `project` / `local` from the entry's own `projectPath` (the scope
resolves from the cwd, as in Phase 4). `projectPath` not a directory -> skip the entry (Phase 4 reports
the orphan). Any other scope (`managed`, `session`, ...) -> report it unsupported, run nothing.

**EXECUTE** using Bash tool per entry, substituting `<scope>` and `<projectPath>`:
```bash
(cd "<projectPath>" && if claude plugin prune --help >/dev/null 2>&1; then claude plugin prune --dry-run --scope "<scope>" || echo "❌ prune --dry-run (<scope> <projectPath>) FAILED"; else echo "skipped: claude plugin prune unavailable"; fi)
```

Show the listed orphans. Empty list or `Nothing to prune` -> the next entry. Otherwise prune that exact
list (typing `all` was the consent):

```bash
(cd "<projectPath>" && claude plugin prune --scope "<scope>" -y) && echo "✅ prune (<scope> <projectPath>) OK" || echo "❌ prune (<scope> <projectPath>) FAILED"
```

Keep `-y`: without a TTY, bare prune removes nothing yet exits 0 - never count that as pruned. No
`prune` in the CLI: skip notice. After the last entry: the snapshot.

`update` / `all` — **EXECUTE** using Bash tool (Phase 0 used the FALLBACK -> run that fence into
`<dir>/after.json` instead):
```bash
unset CLAUDECODE && claude plugin list --json > "<dir>/after.json" && echo "✅ list OK" || echo "❌ list FAILED"
```

A ❌ keeps the file: the report then opens with a 🔴 line that the after list could not be read, is
titled `## 🔴 brewcode: update result unknown (plugin list unreadable)` and shows the versions from
before: After `—`, an outdated row `🔴 not verified, latest Y`.

## Phase 6 — Report

**EXECUTE** using Bash tool, from the project root (the report reads its `.claude/` and the guide INDEX):
```bash
(cd "${CLAUDE_PROJECT_DIR}" && node "${CLAUDE_PLUGIN_ROOT}/skills/plugin-update/scripts/update-flow.mjs" report "<dir>") && echo "✅ report OK" || echo "❌ report degraded"
```

Then remove the scratch dir (the report is already in the tool output), `<dir>` = the SCRATCH path:
```bash
case "<dir>" in */plugin-update.*) rm -rf -- "<dir>" && echo "✅ scratch removed OK" || echo "❌ scratch removed FAILED" ;; *) echo "❌ scratch removed FAILED: not a SCRATCH path" ;; esac
```

Your final message starts with the report text, character for character: no preamble, no re-worded bullet.
Report text, every mode (`check` included) = the report fence output above its `✅ report OK`/`❌ report
degraded` line; that line, the scratch-removed line and `SCRATCH <dir>` are never printed, not even last.
Print the report text verbatim as the answer: title, table (before -> after), lines
for missing mods and plugins (the Claude Code 2.1.301 line, the codewords **Moved** line, install
commands), **What changed for you** between the versions, **Next steps** (1 `/reload-plugins`;
2 `/brewcode:setup-status upgrade`, then in each other project listed; 3 `/brewdoc:my-claude refresh`
when an installation guide is stale) and the auto-update hint. Below it add only `🔴 <command>: <first
error line>` per ❌ of the Phase 1 marketplace update, of a Phase 4 command and of a Phase 5 prune or
its preview, and each orphan's Phase 4 report line with its removal command (its table cell is
`⚪ orphan install`, never a failure).

`❌ report degraded` with markdown above it (rc 1: a latest version unknown, or the after list
unreadable) is still the complete report: print that markdown verbatim, without the `❌` line, then the
🔴 lines; never replace it with a generic failure message.

Auto-update stays a user switch (`/plugin` -> Marketplaces -> claude-brewcode): never patch
`settings.json` or `known_marketplaces.json`. Details: [references/autoupdate-research.md](references/autoupdate-research.md).
