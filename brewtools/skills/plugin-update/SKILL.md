---
name: plugin-update
description: Checks, installs, updates Claude Code plugins. Triggers - update plugins, check versions, обнови плагины.
user-invocable: true
disable-model-invocation: true
argument-hint: "[prompt] [check|update|all]"
allowed-tools: [Read, Bash, AskUserQuestion, Write, WebFetch]
model: sonnet
---

# Brewcode Plugin Update

> Check/install/update brewcode, brewdoc, brewtools, brewui. The `/plugin` UI, reload and
> marketplace-command acceptance are user handoffs, never invented tool actions.

## Prompt contract

`$ARGUMENTS` is one free-form RU/EN prompt; the mode token may sit anywhere in it.

1. Mode: an explicit mode token wins outright; else the most distinct whole-word keyword hits
   (table below). No hit or empty -> `interactive`.
2. Scope: prose that is not a mode is still input: read it for which plugins/scope it names.
3. Ask: outcome-changing ambiguity between `update` and `all` -> ONE `AskUserQuestion` before any
   work. `check` asks nothing (read-only). `interactive` asks its own per-phase `AskUserQuestion`
   gates — that IS the mode, not an extra clarifying question.

Print once, before Phase 3 (the first phase that can mutate); `check` prints it immediately before
its Phase 2 report instead (labels and plan values English, INPUT verbatim):

```
PLAN — brewtools:plugin-update
INPUT:  <arguments verbatim, or "(empty)">
MODE:   <resolved> — <explicit | matched keyword: X | default>
SCOPE:  <resolved plugins / flags>
DO:     <2-5 imperative bullets>
RESULT: <what the user ends up holding>
```

## Argument Handling

| Mode | EN keywords | RU keywords | Mutates? | Behavior |
|------|-------------|--------------|----------|----------|
| `interactive` | *(empty)* | *(empty)* | yes (asks first) | all 6 phases with AskUserQuestion gates |
| `check` | `check`, `status` | `проверь`, `статус` | no | Phases 0-2 + 6 (status table, reload notice), no prompts |
| `update` | `update`, `upgrade` | `обнови`, `обновление` | yes | Phases 0-4 + 6, non-interactive "Update all" |
| `all` | `all`, `everything`, `full` | `всё`, `полностью` | yes | Phases 0-6 non-interactive |

Never read the first word of a sentence as a mode or plugin id.

## Critical Rules

- Run every `claude plugin ...` command via the Bash tool and show its full output.
- Never suggest `--plugin-dir` to end users: it is a dev-only flag.
- Print the reload notice at the end of every run, no-op runs included.
- AskUserQuestion: option lists only, no free-text fields.

## Phase 0 — Discover Installed Plugins

**PRIMARY** (CC 2.1.163+) — **EXECUTE** using Bash tool:
```bash
unset CLAUDECODE && claude plugin list --json && echo "✅ list OK" || echo "❌ list FAILED"
```

A valid JSON array, empty included, is the authoritative inventory; use each row's `id`, `version`
(may be `"unknown"`), `scope`, `enabled`, `projectPath` (`project`/`local` rows; other projects too).
Ids ending `@inline`, `@skills-dir` or `@synced` are not marketplace installs.

**FALLBACK** (CC < 2.1.163, error or invalid JSON) — **EXECUTE** using Bash tool:
```bash
bash "${CLAUDE_SKILL_DIR}/scripts/discover-plugins.sh" && echo "✅ discover OK" || echo "❌ discover FAILED"
```

Both fail -> inventory unknown (!=missing plugins): report versions/status and the reload notice,
skip install/update/prune. Partition: `suite = {brewcode, brewdoc, brewtools, brewui}`, `other` =
the rest. Details: [references/discovery.md](references/discovery.md).

## Phase 1 — Fetch Latest Versions

**EXECUTE** using Bash tool:
```bash
bash "${CLAUDE_SKILL_DIR}/scripts/fetch-latest-versions.sh" && echo "✅ fetch OK" || echo "❌ fetch FAILED"
```

Merge with Phase 0. Fetch failure -> report it, mark latest unknown, stay read-only; never infer
missing/outdated.

## Phase 2 — Status Table

Render `| Plugin | Installed | Latest | Status |`, one row per suite plugin (missing installed
version `—`); status ✅ current, ⬇️ update available, ❌ missing, ❓ unknown. List `other` plugins
below it with versions.

`check`: PLAN goes before this table; then jump to Phase 6.

## Phase 2b — Token-Cost Table (Optional)

Precheck:
```bash
claude plugin details --help >/dev/null 2>&1 && echo "available" || echo "skip"
```

`skip` → Phase 3. Else run `claude plugin details <plugin>@claude-brewcode` per installed suite
plugin; render `| Plugin | Skills | Agents | Hooks | Always-on tokens |` from its
`Component inventory` counts and `Projected token cost` `Always-on`. Missing field `—`; failure →
`❓` row. Never blocks.

## Phase 3 — Install Missing

PLAN block first (SCOPE = missing/outdated plugins). Missing suite plugins: `all` installs them,
`update` skips install.

**AskUserQuestion** (interactive, missing plugins only):

Question: "Install missing brewcode plugins?"
Options: "Install all missing" / "Install selected" / "Skip install"

"Install selected" asks per plugin, options `["Install", "Skip"]`.

**EXECUTE** (idempotent):
```bash
claude plugin marketplace add https://github.com/kochetkov-ma/claude-brewcode && echo "✅ marketplace add OK" || echo "⚠️ marketplace add warning (may already exist)"
```

Then per plugin:
```bash
claude plugin install <plugin>@claude-brewcode && echo "✅ install <plugin> OK" || echo "❌ install <plugin> FAILED"
```

Reference: [references/install-prompt.md](references/install-prompt.md).

## Phase 4 — Update Outdated

**AskUserQuestion** (interactive only; `update` and `all` auto-pick "Update all"):

Question: "Update brewcode plugin suite?"
Options: "Update all" / "Update suite only" / "Update selected" / "Skip updates"

"Update selected" asks per outdated plugin, options `["Update", "Skip"]`.

Update set from that answer only: "Update all" = outdated suite + every `other` marketplace row
(latest unknown; update is a no-op when current); "Update suite only" = outdated suite; "Update
selected" = rows answered `Update`; "Skip updates" = empty → Phase 5. Rows keep their Phase 0 `id`,
`scope` (`user | project | local | managed`; missing → `user`) and `projectPath`; non-marketplace rows
are reported, never updated.

**EXECUTE** marketplace refresh first:
```bash
claude plugin marketplace update claude-brewcode && echo "✅ marketplace update OK" || echo "❌ marketplace update FAILED"
```

Then one command per update-set row. `user` / `managed` rows:
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

## Phase 5 — Auto-Update Toggle (Optional)

Interactive and `all` only. Default OFF for a third-party marketplace like claude-brewcode. Only
switch: `/plugin` -> Marketplaces -> claude-brewcode -> **Enable auto-update**; no CLI sets it, so
never patch `settings.json` or `known_marketplaces.json` - instruct the user. Details: [references/autoupdate-research.md](references/autoupdate-research.md).

**AskUserQuestion** (interactive only):

Question: "Enable auto-update for claude-brewcode marketplace?"
Options: "Enable via /plugin UI" / "Skip"

## Phase 5b — Prune Orphaned Plugin Dependencies

Interactive and `all` only; `check` and `update` skip it (mode table).

Prune removes only auto-installed dependencies nothing still requires. Preview once per distinct
Phase 0 scope in `user|project|local`; report managed/session/synced as unsupported.

**EXECUTE** using Bash tool, substituting `<scope>`:
```bash
claude plugin prune --help >/dev/null 2>&1 && claude plugin prune --dry-run --scope "<scope>" || echo "skipped: claude plugin prune unavailable"
```

Show the listed orphans. Empty list or `Nothing to prune` → Phase 6. Otherwise ask ONCE on that
exact list (AskUserQuestion, options `["Prune listed", "Skip"]`; `all` auto-picks "Prune listed"),
then:

```bash
claude plugin prune --scope "<scope>" -y && echo "✅ prune OK" || echo "❌ prune FAILED"
```

Keep `-y`: without a TTY, bare prune removes nothing yet exits 0 - never count that as pruned. No
`prune` in the CLI: skip notice.

## Phase 6 — Reload Notice & Final Report

Print this notice ([references/reload-notice.md](references/reload-notice.md)):

> ⚠️ **Reload plugins to activate updates.**
> Preferred: run `/reload-plugins` in this session.
> Fallback: type `exit`, then run `claude` again.

Then a final summary listing the plugins installed, updated and skipped this run, and every error.
