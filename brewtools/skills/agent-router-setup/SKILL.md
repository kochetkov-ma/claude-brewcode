---
name: brewtools:agent-router-setup
description: "Installs, configures or removes the agent-router hook (routes a generic Agent spawn to the real project/plugin expert). Triggers: agent-router, wrong agent, route to expert, роутер агентов, не тот агент."
user-invocable: true
disable-model-invocation: true
argument-hint: "[status|install|upgrade|enable|disable|uninstall|purge] [level fast|strict] | free-text intent"
allowed-tools: [Read, Bash, AskUserQuestion, Agent]
model: sonnet
---

# Agent Router

> **EXPERIMENTAL.** Installer/configurator skill. It wires ONE self-contained PreToolUse hook (matcher `Agent`) that checks whether the main loop picked the RIGHT agent for a spawn and redirects it to the real expert — a project agent from `.claude/agents/`, or a brewcode specialist — when it reached for a generic one. All runtime behavior lives in the hook file and in a JSON config; this skill only decides **mode** and **level**, then delegates the file work to the `brewcode:hook-creator` agent following the runbook.

The main loop picks `general-purpose` out of habit while the repo carries a hand-written domain expert that would have done it properly. Tier 1 catches that deterministically, for zero tokens. A deny is returned to the model as a tool error it can act on: the human is never prompted, the turn is not interrupted, and a retry always gets through.

## What the hook does (informational — skill does NOT implement)

| Tier | Registration | Behavior |
|------|--------------|----------|
| **1 — always on** | `{"type":"command","command":"node","args":["<abs>/.claude/hooks/agent-router.mjs"],"timeout":5}` (SECONDS — Claude Code has no ms hook field), PreToolUse matcher `Agent` | deterministic, <100 ms incl. node startup, **zero tokens** |
| **2 — OPT-IN (`level strict`)** | `{"type":"agent","prompt":"<inlined judge-prompt.md>","model":"claude-haiku-4-5-20251001","timeout":30,"statusMessage":"agent-router: checking agent fit"}` | an LLM adjudicates the ambiguous picks |

Tier 1 decision order — it allows as early as it can:

| # | Check | Result |
|---|-------|--------|
| 1 | tool is not `Agent` | allow |
| 2 | `agent_id` present — a SUBAGENT issued this spawn | allow; only the main loop is policed |
| 3 | `enabled:false`, or a config file that exists but does not parse | allow |
| 4 | the picked type IS a project agent (`.claude/agents/*.md`) | allow |
| 5 | the picked type is a specialist / built-in not on `genericTypes` | allow |
| 6 | intent rules — deterministic regex over the task text: skill authoring -> `brewcode:skill-creator`, agent authoring -> `brewcode:agent-creator`, hooks -> `brewcode:hook-creator`, bash/sh scripts -> `brewcode:bash-expert` | deny, naming the expert. A **project agent covering the same intent OUTRANKS** the plugin specialist |
| 7 | score the task against every `.claude/agents/*.md` frontmatter (`name` + `Triggers:`) | one clear winner (`minScore` + `margin`) -> deny naming it; several plausible -> **no deny**, just an `additionalContext` nudge listing the top 3; nothing -> silent allow |
| 8 | anti-loop guard | the same task in the same project is denied at most ONCE per session; a retry passes |
| 9 | any error | fail open |

`neverFlag` defaults to EIGHT entries — `Explore`, `Plan`, `statusline-setup`, `output-style-setup`, plus the four intent experts from step 6 (`brewcode:agent-creator`, `brewcode:skill-creator`, `brewcode:hook-creator`, `brewcode:bash-expert`) — and they are never flagged: `Explore` is the right tool for search, `Plan` for planning, and a route's own target can never be flagged by the router that routes to it. `normalizeConfig()` also unions `neverFlag` with every configured `intents[].expert` at load time, so a custom `intents` table auto-exempts its own experts.

Config and roster are read from the **nearest ancestor of `cwd` holding a `.claude` dir** (up to 16 levels up), not from `cwd` itself, and fresh on every call. A missing `.claude/agents/` is an EMPTY roster, not a failure: the intent rules (step 6) still fire and still redirect to the plugin specialist — only the step-7 scoring goes silent. There is no nudge-threshold config key; the nudge floor is derived as `max(1, ceil(minScore/2))`.

## Honest limits (state these to the user, do not oversell)

| Fact | Consequence |
|------|-------------|
| Claude Code runs ALL hooks matching an event in parallel; no hook can skip another | Tier 2, once installed, fires a small model call on **EVERY** `Agent` spawn. Its own Step-1 fast exit is the only cost control that exists — tier 1 cannot gate it. This is exactly why `level fast` (tier 1 only) is the default and the recommendation. |
| There is no supported signal for "this tool call came from inside a Skill" | Tier 2 can only guess from `transcript_path`, which is written asynchronously and may lag. Tier 1 does not attempt it at all. |
| Tier 1 matches on trigger WORDS, not meaning | It deliberately errs toward allowing: an ambiguous case becomes a nudge, never a block. Intent regexes are English trigger words. |
| Every failure mode — bad config, unreadable roster, timeout, malformed output | Fails **OPEN**. The spawn goes through; the session never breaks. A config that exists but does not PARSE turns the feature fully off — not a fall-back to defaults. |
| The anti-loop marker lives in `os.tmpdir()` | If that dir is unusable (read-only tmp, foreign-owned `brewtools-agent-router/`, sandbox), **EVERY deny degrades to a non-blocking notice** — a deny that cannot be recorded could repeat forever. The hook keeps advising, it just stops blocking. Tell the user this when they report "it never blocks anything". |
| A deny is not a wall | It is returned to the model as a tool error, the human is never prompted, and the anti-loop guard lets an identical retry through. |
| EXPERIMENTAL | Ships opt-in, **project scope only**. The agent roster is inherently per-project, so there is no global install and no scope question. |

<instructions>

## BT_ROOT Resolver (use in EVERY bash block)

The plugin root is resolved from the skill's OWN directory (the `CLAUDE_SKILL_DIR` prompt substitution), never from `CLAUDE_PLUGIN_ROOT` -- that env var is not exported to a skill's Bash tool:

```bash
SD="${CLAUDE_SKILL_DIR}"
if [ -n "$SD" ] && [ -f "$SD/../../.claude-plugin/plugin.json" ]; then BT_ROOT=$(cd "$SD/../.." && pwd); else BT_ROOT=$(ls -d ~/.claude/plugins/cache/claude-brewcode/brewtools/*/ 2>/dev/null | sort -V | tail -1 | sed 's:/*$::'); fi
[ -n "$BT_ROOT" ] || { echo "ERROR: cannot locate brewtools plugin root -- install/update brewtools first."; exit 1; }
test -d "$BT_ROOT/skills/agent-router-setup/assets" || { echo "❌ FAILED — BT_ROOT invalid: $BT_ROOT"; exit 1; }
```

Asset paths (all under `$BT_ROOT/skills/agent-router-setup/assets/`):
- `INSTALL.md` — the runbook: install, level, config shape, disable/enable, uninstall, purge, verify. **Single source of truth — follow it, never re-derive its commands here.**
- `agent-router.mjs` — the tier-1 hook, the only file copied into the project
- `judge-prompt.md` — the tier-2 judge prompt; **inlined into settings.json**, never copied

> Scope is PROJECT only. Never write to `~/.claude/*` — protected path, blocked in ALL modes, and a global roster does not exist.

> Opt-in by design: this hook is NOT registered in `brewtools/hooks/hooks.json`, so installing the plugin does nothing until this skill runs.

---

## Step 1 — STATUS FIRST, always

Run this before anything else, in EVERY mode. Never install, re-install or remove blind.

**EXECUTE** using Bash tool:

```bash
SD="${CLAUDE_SKILL_DIR}"
if [ -n "$SD" ] && [ -f "$SD/../../.claude-plugin/plugin.json" ]; then BT_ROOT=$(cd "$SD/../.." && pwd); else BT_ROOT=$(ls -d ~/.claude/plugins/cache/claude-brewcode/brewtools/*/ 2>/dev/null | sort -V | tail -1 | sed 's:/*$::'); fi
[ -n "$BT_ROOT" ] || { echo "ERROR: cannot locate brewtools plugin root -- install/update brewtools first."; exit 1; }
A="$BT_ROOT/skills/agent-router-setup/assets"
test -f "$A/INSTALL.md" && test -f "$A/agent-router.mjs" && test -f "$A/judge-prompt.md" || { echo "❌ FAILED — assets incomplete under BT_ROOT=$BT_ROOT"; exit 1; }
echo "ASSETS_DIR=$A"
echo "RUNBOOK=$A/INSTALL.md"
D="$PWD/.claude"
H=no; [ -f "$D/hooks/agent-router.mjs" ] && H=yes
T1=$({ grep -c 'agent-router\.mjs' "$D/settings.json" 2>/dev/null || true; } | tr -d ' '); T1=${T1:-0}
T2=$({ grep -c 'agent-router: checking agent fit' "$D/settings.json" 2>/dev/null || true; } | tr -d ' '); T2=${T2:-0}
CFG=none; [ -s "$D/brewtools/agent-router.json" ] && CFG=$(tr -d '\n ' < "$D/brewtools/agent-router.json"); CFG=${CFG:-none}
EN=n/a; case "$CFG" in *'"enabled":true'*) EN=true;; *'"enabled":false'*) EN=false;; esac
LV=n/a; case "$CFG" in *'"level":"strict"'*) LV=strict;; *'"level":"fast"'*) LV=fast;; esac
CV=$({ jq -r '.version // empty' "$D/brewtools/agent-router.json" 2>/dev/null || true; }); CV=${CV:-n/a}
PV=$({ jq -r '.version // empty' "$BT_ROOT/.claude-plugin/plugin.json" 2>/dev/null || true; }); PV=${PV:-n/a}
STALE=n/a; [ "$CV" != "n/a" ] && [ "$PV" != "n/a" ] && { [ "$CV" = "$PV" ] && STALE=no || STALE=yes; }
R=$({ ls "$D/agents/"*.md 2>/dev/null || true; } | wc -l | tr -d ' ')
echo "project: hook_file=$H tier1_refs=$T1 tier2_refs=$T2 enabled=$EN level_recorded=$LV roster=$R"
echo "version: config=$CV plugin=$PV stale=$STALE"
echo "config=$CFG"
echo "✅ status"
```

> **STOP if ❌** — plugin cache incomplete; reinstall/update brewtools first.

Field meanings — do not paraphrase them into something stronger:

| Field | Value |
|-------|-------|
| `hook_file` | `yes`/`no` — `agent-router.mjs` present in `<repo>/.claude/hooks/` |
| `tier1_refs` | textual count of `agent-router.mjs` mentions in `settings.json`; `0` = not wired, `1` = wired, `>1` = duplicate -> repair |
| `tier2_refs` | count of the tier-2 `statusMessage` marker; `0` = tier 2 off, `1` = tier 2 wired |
| `enabled` | parsed from the config; `n/a` = no config or no such key |
| `level_recorded` | the `level` VALUE stored in the config. It is a RECORD of an install-time choice, **not** proof of what is wired — nothing keeps it honest. `tier2_refs` is the authority on whether the LLM judge actually fires |
| `version` / `plugin` / `stale` | the config's `version` key vs the installed brewtools version. `stale=yes` = the config was written by an older plugin and may predate a shape change -> offer `upgrade`. `n/a` on either side (pre-metadata config, or no config) = unknown, NOT "current" |
| `roster` | number of `.claude/agents/*.md` files — **`0` means the hook has nothing to route TO**; say so before installing |

These are textual counts, not JSON validation — they do not prove the entries are well-formed or attached to the right event.

Read the output into a state table and PRINT it to the user:

| Hook file | tier1 wired | tier2 wired | enabled | level (recorded) | tier2 actual | config ver | stale | roster |
|-----------|-------------|-------------|---------|------------------|--------------|------------|-------|--------|

Effective = `hook_file=yes tier1_refs=1 enabled=true`. Anything else is NOT effective — say so plainly instead of reporting a half-state as installed.

> **Never print `level` alone as if it were the truth.** Put `tier2_refs` next to it: `level_recorded=strict` with `tier2_refs=0` means the judge is NOT wired, and the config is lying. Report that mismatch explicitly and offer `level strict` (or `level fast`) to reconcile — the config value alone adds and removes nothing.

### Config metadata (the three standard JSON keys)

Every mode that WRITES `agent-router.json` — `install`, `upgrade`, `enable`, `disable` and both `level` operations — writes these three keys alongside the behavior keys. `doc_type` is a `.md`-frontmatter field only and never appears in a JSON carrier:

```json
{ "version": "{PLUGIN_VERSION}", "generated_by": "brewtools:agent-router-setup", "last_updated": "{LAST_UPDATED}" }
```

Resolve `version` and `last_updated` — never hardcode either. **EXECUTE** using Bash tool:

```bash
SD="${CLAUDE_SKILL_DIR}"
if [ -n "$SD" ] && [ -f "$SD/../../.claude-plugin/plugin.json" ]; then BT_ROOT=$(cd "$SD/../.." && pwd); else BT_ROOT=$(ls -d ~/.claude/plugins/cache/claude-brewcode/brewtools/*/ 2>/dev/null | sort -V | tail -1 | sed 's:/*$::'); fi
[ -n "$BT_ROOT" ] || { echo "ERROR: cannot locate brewtools plugin root -- install/update brewtools first."; exit 1; }
PV=$(jq -r '.version // empty' "$BT_ROOT/.claude-plugin/plugin.json" 2>/dev/null || true)
PV=${PV:-$(basename "$BT_ROOT")}
echo "PLUGIN_VERSION=$PV LAST_UPDATED=$(date +%F)"
```

> **Why the bare form.** `CLAUDE_SKILL_DIR` is a TEXT SUBSTITUTION on the skill prompt, not an env var: CC 2.1.226 rewrites only the EXACT dollar-brace literal `{CLAUDE_SKILL_DIR}` (`replace(/\$\{CLAUDE_SKILL_DIR\}/g, dirname(skillPath))` and a string-pattern `replaceAll`). A brace-modifier form such as `:-fallback` inside the braces is therefore NOT matched, reaches the shell verbatim, and its fallback ALWAYS wins. `CLAUDE_PLUGIN_ROOT` is a real env var but is exported only to hook processes and MCP servers -- never to a skill's Bash tool -- so it is ALWAYS empty here. The skill dir is correct in a cache install AND in a `--plugin-dir` dev run; the cache glob below it is a last-resort fallback only, and it would name the INSTALLED plugin.

| Guarantee | Why it holds |
|-----------|--------------|
| The hook ignores them | Config keys the hook does not name are ignored (`INSTALL.md` Config: *"Any key not listed above is ignored"*), so metadata cannot change routing |
| `enabled` semantics unchanged | Only exactly `false` disables; adding sibling keys touches nothing |
| Cannot make a valid file unparseable | They are written by the runbook's node block that re-serializes the whole object with `JSON.stringify` — never appended as raw text. A hand-appended line could break the file, and an unparseable config silently disables the whole feature |
| `disable`/`enable` refresh `last_updated` too | Any write to the config is a write; the stamp records when the file was last written, not when it was first installed |

### Early exit

If it is already installed the way the user could want it and **the intent is not explicit** (no argument, or vague like "роутер агентов"), PRINT the status, list the operations available (`upgrade`, `enable`, `disable`, `uninstall`, `purge`, `level fast|strict`) and **STOP**. Do not re-install, do not ask a chain of questions.

## Step 2 — Decide MODE

Read `$ARGUMENTS`. Default when there are NO arguments at all = **status**.

| Mode | Trigger words |
|------|---------------|
| `status` | no args; `status`, `статус`, `проверь`, `что стоит` |
| `install` | `install`, `set up`, `поставь`, `установи`, `включи роутер` |
| `upgrade` | `upgrade`, `update`, `refresh`, `обнови`, `перевыстави`, `после обновления плагина` |
| `enable` | `enable`, `включи обратно`, `верни` |
| `disable` | `disable`, `выключи`, `отключи`, `паузу` |
| `uninstall` | `uninstall`, `убери`, `сними`, `удали хук` |
| `purge` | `purge`, `wipe`, `вычисти всё`, `удали полностью`, `снеси`, `remove everything` |
| `level fast` \| `level strict` (extra) | `level`, `fast`, `strict`, `дешёвый`, `строгий`, `с LLM`, `без LLM` |

Ambiguous between install and a removal verb → `AskUserQuestion`. Use `AskUserQuestion` ONLY for genuinely destructive ambiguity — never to guess a mode, and never to ask about scope (there is only one).

## Step 3 — State the plan BEFORE asking anything

Plain text, before any question:

> Current state: agent-router not installed; `.claude/agents/` holds 4 project agents. Plan: copy `agent-router.mjs` into `<repo>/.claude/hooks/`, write `<repo>/.claude/brewtools/agent-router.json` with `level: "fast"`, merge one PreToolUse (`Agent`) entry into `<repo>/.claude/settings.json`. Project scope only. One question first: level.

If `roster=0`, say it before anything else: with no `.claude/agents/*.md` the hook can only ever apply the 4 intent rules — they DO still fire — and step 7's scoring has nothing to score. Offer to stop.

## Step 4 — Ask ONLY what is missing (`AskUserQuestion`)

Skip any question already answered by `$ARGUMENTS` or settled by the status table.

| # | Question | Options | Default |
|---|----------|---------|---------|
| 1 | Level? | **fast — tier 1 only, deterministic, zero tokens (Recommended)** / strict — adds an LLM judge on every Agent spawn | `fast` |

The `strict` option description MUST carry the cost verbatim: *Claude Code runs all matching hooks in parallel and tier 1 cannot gate tier 2, so strict fires a haiku call on EVERY `Agent` spawn — its own fast exit is the only cost control.*

No scope question. No other questions. `disable`/`enable`/`uninstall`/`purge` ask nothing.

## Step 5 — State the FINAL plan, then act

Restate concretely what will be written and where — exact paths, exact `level`, the exact settings.json entry — then proceed. For `uninstall`/`purge` list exactly which files are deleted and confirm once.

### Delegation

A big task handed to one agent = an agent gone for an hour: unobservable, uncorrectable, drifting. One mode is ONE bounded unit (1 asset file + one settings.json + one config) — a single `hook-creator` spawn, one spawn per mode.

Every spawn prompt MUST carry:

| Field | Content |
|-------|---------|
| GOAL | the overall task and why it exists |
| ROLE | what this agent owns; what it must NOT touch |
| SCOPE | exact paths/commands in bounds + explicit out-of-bounds |
| CONTEXT | what is already done, what runs in parallel — trimmed to what THIS agent needs |
| CONSUMER | who uses the result next and the shape it must fit |
| DONE | acceptance criteria + the exact report shape |

> **The level only survives if it reaches the SHELL.** `LEVEL`/`RUNBOOK` written as prose in the prompt are just text — the runbook's node blocks read them from `process.env`, and an empty `LEVEL` ABORTS the config and merge blocks (no silent `fast` fallback) instead of losing the user's choice. The spawn prompt below therefore carries the literal `export` line the agent must run FIRST, in the same Bash invocation as every runbook block. Substitute the chosen values into that `export` line, not only into the CONTEXT table.

Spawn (substitute `MODE`, `LEVEL`, `RUNBOOK`, `ASSETS_DIR`, `PLUGIN_VERSION`, `LAST_UPDATED` from Steps 1-4 and the Config-metadata block — into BOTH the CONTEXT block and the `export` line):

```
Task(subagent_type="brewcode:hook-creator", prompt="
GOAL: the user wants the agent-router hook MODE-ed for THIS project. One PreToolUse hook
(matcher Agent) checks whether the main loop picked the right agent for a spawn and denies
with the name of the real expert when it reached for a generic one. Runtime behavior lives
entirely in agent-router.mjs and agent-router.json, so this task is pure file + settings +
config wiring.
ROLE: you own the file copy/removal, the settings.json merge/strip and the config write.
Do NOT edit hook logic, do NOT touch judge-prompt.md, do NOT touch unrelated hooks or
settings keys, do NOT touch ~/.claude (this skill is project-scope only), do NOT register
anything in the plugin's own hooks.json.
SCOPE: in — the assets under ASSETS_DIR, <repo>/.claude/hooks/, <repo>/.claude/settings.json,
<repo>/.claude/brewtools/agent-router.json. Out — everything else. Project paths: Write/Edit
are fine, but use the runbook's node blocks for settings.json and the config, never a hand Edit.
CONTEXT:
  Status was already collected and every path below resolved; nothing has been written yet.
  MODE = MODE (install|upgrade|enable|disable|uninstall|purge|level)
  LEVEL = LEVEL (fast|strict — required for install, upgrade and level; ignored by the rest.
    For upgrade it is the level ALREADY in the config, never a new choice)
  RUNBOOK = RUNBOOK (absolute path to assets/INSTALL.md)
  ASSETS_DIR = ASSETS_DIR (absolute path to the assets source dir — copy agent-router.mjs FROM here)
  MANDATORY FIRST BASH COMMAND — the runbook's node blocks read these from the ENVIRONMENT,
  not from this prompt. Run this VERBATIM as the first line of EVERY Bash call that executes
  a runbook block (a new Bash call does NOT inherit exports from the previous one).
  MODE=upgrade runs the 'UPGRADE' section, which is the INSTALL blocks replayed with the
  level read back from the existing config — never a level the user did not pick:
    export RUNBOOK='RUNBOOK' LEVEL='LEVEL' PLUGIN_VERSION='PLUGIN_VERSION' LAST_UPDATED='LAST_UPDATED'
  Then verify before writing anything:
    echo \"LEVEL=\$LEVEL RUNBOOK=\$RUNBOOK PV=\$PLUGIN_VERSION LU=\$LAST_UPDATED\"
  If LEVEL prints empty, STOP and report — the config and merge blocks ABORT on an empty
  LEVEL by design; re-export it rather than hardcoding a value.
  Follow the runbook at RUNBOOK exactly and use ITS commands — it self-locates its source via
  SRC=\$(dirname \"\$RUNBOOK\"). Sections map 1:1 to MODE: 'INSTALL', 'UPGRADE', 'LEVEL', 'DISABLE /
  ENABLE', 'UNINSTALL', 'PURGE'. Merge = strip own stale/tier2 entries, then append; the tier-1
  entry is added only if the exact <absdir>/agent-router.mjs path is absent (idempotent), and
  the tier-2 entry is re-derived from LEVEL by inlining ASSETS_DIR/judge-prompt.md.
  Uninstall = strip own entries (tier-1 by basename, tier-2 by statusMessage), drop empty event
  arrays, delete agent-router.mjs, KEEP the config. Purge = uninstall + delete the config +
  delete the tmp markers.
  METADATA: every mode that WRITES the config (install, upgrade, enable, disable, level) must
  leave these three keys in agent-router.json:
  version=\$PLUGIN_VERSION, generated_by=\"brewtools:agent-router-setup\",
  last_updated=\$LAST_UPDATED. No doc_type — it is a .md-frontmatter field and never belongs
  in a JSON carrier. Set them INSIDE the runbook's node block that re-serializes the
  object with JSON.stringify — never by appending text to the file. An unparseable config
  silently disables the whole feature, so a hand-edited append is a defect, not a shortcut.
  Do NOT touch enabled or level while doing it: enabled is off only when exactly false, and
  level is a record of what is wired.
CONSUMER: Step 6 reports your result to the user; the settings.json you write is loaded by
  the NEXT Claude Code session, so a malformed merge breaks that session instead of failing
  here — report the exact paths you touched so they can be checked.
DONE: report the settings.json path, the hooks dir, the config path with its final contents,
  and the runbook 'Verify' output if you ran it. The reported config MUST show
  level = LEVEL — a 'fast' where the user asked for 'strict' is a FAILURE, not a detail —
  and version = \$PLUGIN_VERSION. Prove the file still parses: jq . <config path>.
")
```

## Step 6 — Final status

Re-run the Step 1 status block and print the refreshed table, plus:

- what changed (file, settings.json, config values),
- **a NEW session is required for hook WIRING changes** (install / upgrade / level / uninstall / purge — the tier-2 entry is part of the wiring) — `/reload-plugins` is not needed, this is a plain settings.json hook;
- **config VALUE changes** (`enabled`, `genericTypes`, `neverFlag`, `minScore`, `margin`, `intents`) are read live — no restart. `level` in the config is only a record of what is wired; changing it by hand does NOT add or remove the tier-2 entry, run `level strict` / `level fast` for that. Report it as `level (recorded)` next to `tier2_refs`, never as the wiring itself;
- the config `version` now written into the file, and whether `stale` flipped to `no`;
- the honest limits, at minimum: tier 2 costs a model call on every `Agent` spawn, tier 1 matches words not meaning, everything fails open.

---

## Modes

| Mode | Effect | Hook file | settings.json | Config | tmp markers |
|------|--------|-----------|---------------|--------|-------------|
| `status` | report only | — | — | — | — |
| `install` | wire tier 1 (+ tier 2 if `strict`) | copied | entry merged | written | — |
| `upgrade` | re-emit from the current plugin version at the ALREADY-configured level | re-copied | entries re-merged | behavior values preserved, metadata re-stamped | kept |
| `enable` | `enabled:true` | kept | kept | edited | kept |
| `disable` | `enabled:false` — hook stays wired, becomes a no-op | kept | kept | edited | kept |
| `uninstall` | unwire | deleted | entries stripped | **kept** | kept |
| `purge` | full wipe | deleted | entries stripped | deleted | deleted |
| `level fast` (extra) | drop the tier-2 entry | kept | tier-2 stripped | `level:"fast"` | kept |
| `level strict` (extra) | add the tier-2 entry (judge prompt inlined) | kept | tier-2 appended | `level:"strict"` | kept |

`upgrade` never asks a question and never changes a setting: it reads `level` out of the existing config and replays the install so a plugin update reaches the project (fresh `agent-router.mjs`, freshly inlined judge prompt). Not installed -> it is an `install`, so ask the level question.

Re-install is a no-op. Scope is PROJECT only — the roster is per-project, so there is nothing to install globally and no scope question to ask.

## Guards

| Condition | Response |
|-----------|----------|
| `BT_ROOT` resolves but `$BT_ROOT/skills/agent-router-setup/assets` missing | ERROR: `agent-router: assets not found under $BT_ROOT — plugin cache incomplete.` STOP. |
| Neither the skill dir nor any cached plugin dir yields `.claude-plugin/plugin.json` | ERROR: `agent-router: cannot locate plugin root — install/update brewtools first.` STOP. |
| Status shows installed + vague intent | Print status, list available operations, STOP. Do not re-install. |
| User asks for a global install | Refuse and explain: the roster is per-project, `~/.claude/*` is protected, and a global hook would route every repo against one repo's agents. Offer the project install. |
| `strict` requested (or asked about) | BEFORE writing anything, state the cost: all matching hooks run in parallel and tier 1 cannot gate tier 2, so a haiku call fires on EVERY `Agent` spawn. Say it in the question or the plan, never only in the final report. |
| `roster=0` (no `.claude/agents/*.md`) | Say it before installing: only the 4 intent rules can ever fire; the scoring step has nothing to score. Offer to stop. |
| Mode ambiguous between install and removal | AskUserQuestion. Never guess a destructive mode. |
| Install/level delegated | The spawn prompt MUST contain the literal `export RUNBOOK='<path>' LEVEL='<chosen>'` line. Values described only in prose never reach the runbook's `process.env`; the blocks then ABORT instead of writing a wrong level. Check the agent's reported config for the chosen level. |
| User wants to add or change an intent route | Warn FIRST: a config `intents` array REPLACES the built-in four wholesale, it does not merge, and the hook gives no warning when three routes vanish. Tell them to copy `DEFAULT_INTENTS` out of `agent-router.mjs` and append. Install never writes the key. |
| Existing config is malformed JSON | Report it: the runbook ABORTS rather than overwriting it blind, and the hook fails open (every spawn allowed) until it is fixed. Offer to rewrite. |
| `uninstall`/`purge` requested | Restate exactly what gets deleted, confirm once, then delegate. |
| User reports a spawn being blocked repeatedly | Not possible by design — the anti-loop guard denies a given task in a given project at most once per session. Collect the deny text and check `tier2_refs` before believing it. |

---

## Smoke Test

Verify the 3 assets exist and the hook parses before delegating.

**EXECUTE** using Bash tool:

```bash
SD="${CLAUDE_SKILL_DIR}"
if [ -n "$SD" ] && [ -f "$SD/../../.claude-plugin/plugin.json" ]; then BT_ROOT=$(cd "$SD/../.." && pwd); else BT_ROOT=$(ls -d ~/.claude/plugins/cache/claude-brewcode/brewtools/*/ 2>/dev/null | sort -V | tail -1 | sed 's:/*$::'); fi
[ -n "$BT_ROOT" ] || { echo "ERROR: cannot locate brewtools plugin root -- install/update brewtools first."; exit 1; }
A="$BT_ROOT/skills/agent-router-setup/assets"
test -d "$A" || { echo "❌ smoke FAILED — assets dir missing: $A"; exit 1; }
for f in agent-router.mjs judge-prompt.md INSTALL.md; do
  test -f "$A/$f" || { echo "❌ smoke FAILED — missing $f"; exit 1; }
done
test -s "$A/judge-prompt.md" || { echo "❌ smoke FAILED — judge-prompt.md is empty (it is inlined into settings.json)"; exit 1; }
node --check "$A/agent-router.mjs" && echo "✅ smoke" || echo "❌ smoke FAILED — syntax error in the hook file"
```

> **STOP if ❌** — do NOT delegate; reinstall/update brewtools first.

`node --check` proves the file parses, nothing more. Behavioral verification (synthetic payloads) is in the runbook's **Verify** section; the full suite is `tests/run.sh` in the skill dir and is NOT run here.

</instructions>
