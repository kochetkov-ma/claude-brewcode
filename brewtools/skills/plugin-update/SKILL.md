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

> Check/install/update brewcode, brewdoc, brewtools, brewui. Run shell commands here; user-only
> `/plugin` UI/reload and marketplace-command acceptance are explicit handoffs, never invented tool actions.

## Prompt contract

Position 1 of `$ARGUMENTS` is a **free-form prompt** (RU/EN) — the mode is optional and may
follow in any order. Nobody types keys: resolve the mode FROM the prompt.

1. Strip flags. An explicit mode token anywhere wins outright, no scoring.
2. Else score modes by distinct whole-word keyword hits (table below). Highest unique score wins.
   All zero -> `interactive`.
3. Empty arguments -> `interactive`; `check` asks nothing (read-only). `interactive` asks its
   own per-phase `AskUserQuestion` gates — that IS the mode, not an extra clarifying question.
4. Outcome-changing ambiguity between `update` and `all` -> ONE `AskUserQuestion` BEFORE any work.
5. Prose that is not a mode is still input: read it for which plugins/scope it names.

Then print this block ONCE, before Phase 3 (the first phase that can mutate). `check` prints it
immediately before its Phase 2 report instead:

```
PLAN — brewtools:plugin-update
INPUT:  <arguments verbatim, or "(empty)">
MODE:   <resolved> — <explicit | matched keyword: X | default>
SCOPE:  <resolved plugins / flags>
DO:     <2-5 imperative bullets>
RESULT: <what the user ends up holding>
```

Labels/plan values are English; INPUT remains verbatim.

## Argument Handling

**Skill arguments received:** `$ARGUMENTS`

| Mode | EN keywords | RU keywords | Mutates? | Behavior |
|------|-------------|--------------|----------|----------|
| `interactive` | *(empty)* | *(empty)* | yes (asks first) | all 6 phases with AskUserQuestion gates |
| `check` | `check`, `status` | `проверь`, `статус` | no | Phases 0-2 only (status table), no prompts |
| `update` | `update`, `upgrade` | `обнови`, `обновление` | yes | Phases 0-4, non-interactive "Update all" |
| `all` | `all`, `everything`, `full` | `всё`, `полностью` | yes | Phases 0-6 non-interactive |

Resolve the whole prompt using the Prompt contract; never parse sentence-first words as mode
or plugin ids. Unknown/empty -> interactive; preserve named plugins and scopes.

## Critical Rules

- EXECUTE every `claude plugin ...` command via Bash tool. Show full output.
- NEVER suggest `--plugin-dir` for end users (dev-only).
- ALWAYS print the reload notice at the end, even on no-op runs.
- AskUserQuestion: options lists only, no free-text fields.

## Phase 0 — Discover Installed Plugins

**PRIMARY** (CC 2.1.163+) — **EXECUTE** using Bash tool:
```bash
unset CLAUDECODE && claude plugin list --json && echo "✅ list OK" || echo "❌ list FAILED"
```

Success + valid JSON array (including empty) -> authoritative inventory. Required object fields:
`id`, `version` (may be `"unknown"`), `scope`, `enabled`, `installPath`; `installedAt`/`lastUpdated`
are marketplace-only. Optional `projectPath`, `mcpServers`, load `errors`/`notes` and details.
Ids may use marketplace, `inline`, `skills-dir` or `synced`; scope also includes session/synced.

**FALLBACK** (CC < 2.1.163, unsupported/error/invalid JSON; valid empty is not failure) — **EXECUTE** using Bash tool:
```bash
bash "${CLAUDE_SKILL_DIR}/scripts/discover-plugins.sh" && echo "✅ discover OK" || echo "❌ discover FAILED"
```

> Both fail -> report inventory unknown; continue read-only version/status reporting and reload
> notice, skip install/update/prune. Unknown inventory !=missing plugins.

Partition results into: `suite = {brewcode, brewdoc, brewtools, brewui}`, `other = everything else`.

Read [references/discovery.md](references/discovery.md) for details on both discovery paths.

## Phase 1 — Fetch Latest Versions

**EXECUTE** using Bash tool:
```bash
bash "${CLAUDE_SKILL_DIR}/scripts/fetch-latest-versions.sh" && echo "✅ fetch OK" || echo "❌ fetch FAILED"
```

> Fetch failure -> report network issue, mark latest unknown, continue read-only status; do not
> infer missing/outdated versions or write from that unavailable data.

Merge with Phase 0 data.

## Phase 2 — Status Table

Render markdown table to the user:

| Plugin | Installed | Latest | Status |
|--------|-----------|--------|--------|
| brewcode | 3.4.51 | 3.4.52 | ⬇️ update |
| brewdoc | 3.4.51 | 3.4.51 | ✅ current |
| brewtools | — | 3.4.51 | ❌ missing |
| brewui | 3.4.51 | 3.4.51 | ✅ current |

Status legend: ✅ current, ⬇️ update available, ❌ missing, ❓ unknown.

Also list `other` plugins below with their versions (informational).

For `check`, print PLAN before this table (`DO:` read installed/latest versions, render status),
then jump to Phase 6 for reload notice/summary; skip 2b and all mutation phases.

## Phase 2b — Token-Cost Table (Optional)

Precheck:
```bash
claude plugin details --help >/dev/null 2>&1 && echo "available" || echo "skip"
```

If unavailable → SKIP (proceed to Phase 3).

If available, for each installed suite plugin run `claude plugin details <plugin>@claude-brewcode` and render:

| Plugin | Base Tokens | With Skills | Hooks | Total |
|--------|-------------|-------------|-------|-------|
| brewcode | ... | ... | ... | ... |
| brewdoc | ... | ... | ... | ... |
| brewtools | ... | ... | ... | ... |
| brewui | ... | ... | ... | ... |

Adapt column names to actual output fields. Missing field → `—`. Command failure for a plugin → `❓` for that row, continue.

Phase is informational only; do not block on errors.

## Phase 3 — Install Missing

Print the `## Prompt contract` PLAN block here — this is the first phase that can mutate — with
SCOPE naming the missing/outdated plugins found in Phases 0-2, before asking or installing.

For each missing suite plugin, ask via AskUserQuestion (unless arg ∈ {`update`, `all`} — `all` auto-installs, `update` skips install).

**AskUserQuestion** (interactive only, if missing plugins exist):

Question: "Install missing brewcode plugins?"
Options: "Install all missing" / "Install selected" / "Skip install"

If "Install selected" — ask per plugin with options `["Install", "Skip"]`.

**EXECUTE** (idempotent):
```bash
claude plugin marketplace add https://github.com/kochetkov-ma/claude-brewcode && echo "✅ marketplace add OK" || echo "⚠️ marketplace add warning (may already exist)"
```

Then per plugin:
```bash
claude plugin install <plugin>@claude-brewcode && echo "✅ install <plugin> OK" || echo "❌ install <plugin> FAILED"
```

Show full output of each command.

Reference: [references/install-prompt.md](references/install-prompt.md).

## Phase 4 — Update Outdated

**AskUserQuestion** (interactive only; `update` and `all` auto-pick "Update all"):

Question: "Update brewcode plugin suite?"
Options: "Update all" / "Update suite only" / "Update selected" / "Skip updates"

If "Update selected" — ask per outdated plugin with options `["Update", "Skip"]`.

Build the update set from that answer, never from a fixed list: "Update all" = every outdated
plugin incl. `other`, "Update suite only" = outdated suite rows, "Update selected" = the rows
answered `Update`, "Skip updates" = empty → go to Phase 5. Each row carries its Phase 0 `id` and
`scope` (`user | project | local | managed`; missing → `user`). Only marketplace installations
are CLI-update targets; session/synced/skills-directory origins are reported separately, not
converted to a user installation or passed as update rows.

**EXECUTE** marketplace refresh first:
```bash
claude plugin marketplace update claude-brewcode && echo "✅ marketplace update OK" || echo "❌ marketplace update FAILED"
```

Then ONE command per row of the update set, substituting its `<id>` and discovered `<scope>`:
```bash
claude plugin update <id> --scope <scope> && echo "✅ update <id> OK" || echo "❌ update <id> FAILED"
```

House rule: explicit discovered `--scope` is mandatory. Before 2.1.281 omission defaulted to
`user`; current CLI auto-detects local -> project -> user -> managed. Explicit scope keeps the
selected installation exact across versions; update accepts managed, install/prune do not.

On failure: report exact error and continue. Reference: [references/update-commands.md](references/update-commands.md), [references/update-prompt.md](references/update-prompt.md).

## Phase 5 — Auto-Update Toggle (Optional)

**Skip for arg ∈ {`check`, `update`}.** Interactive or `all` only.

Historical third-party default: OFF; current default/settings.json key remain unverified as of
2026-09-30. Inspect/toggle through `/plugin` UI -> Marketplaces -> claude-brewcode; never patch
a guessed key. See [references/autoupdate-research.md](references/autoupdate-research.md).

**AskUserQuestion** (interactive only):

Question: "Enable auto-update for claude-brewcode marketplace?"
Options: "Enable via /plugin UI" / "Skip"

Do NOT patch settings.json blindly. Instruct user to toggle via `/plugin` UI.

## Phase 5b — Prune Orphaned Plugin Dependencies

Prune removes only auto-installed dependencies no installed plugin still requires — plugins
installed directly are never touched. Preview once per distinct supported Phase 0 scope
(`user|project|local`); skip managed/session/synced and report unsupported scopes.

**EXECUTE** using Bash tool, substituting `<scope>`:
```bash
claude plugin prune --help >/dev/null 2>&1 && claude plugin prune --dry-run --scope <scope> || echo "skipped: claude plugin prune unavailable"
```

Show the listed orphans. Empty list → nothing to remove, go to Phase 6. Otherwise ask ONCE on that
exact list (AskUserQuestion, options `["Prune listed", "Skip"]`; `all` auto-picks "Prune listed",
`update` skips), then:

```bash
claude plugin prune --scope <scope> -y && echo "✅ prune OK" || echo "❌ prune FAILED"
```

`-y` is mandatory when stdin/stdout lacks a TTY. Current bare prune only prints the list and
"Not a TTY — run `claude plugin prune -y` to remove.", removes nothing, exits 0; never count it pruned.

Non-fatal: if CLI lacks `prune`, prints skip notice and continues.

## Phase 6 — Reload Notice & Final Report

**ALWAYS print** the contents of [references/reload-notice.md](references/reload-notice.md):

> ⚠️ **Reload plugins to activate updates.**
> Preferred: run `/reload-plugins` in this session.
> Fallback: type `exit`, then run `claude` again.

Final summary:
- Plugins installed this run: [...]
- Plugins updated this run: [...]
- Plugins skipped: [...]
- Errors encountered: [...]
