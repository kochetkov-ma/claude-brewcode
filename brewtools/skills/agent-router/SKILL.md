---
name: brewtools:agent-router
description: "Installs, configures or removes the agent-router hook (routes a generic Agent spawn to the real project/plugin expert). Triggers: agent-router, wrong agent, route to expert, роутер агентов, не тот агент."
argument-hint: "[status|install|level fast|level strict|disable|enable|uninstall|purge] | free-text intent"
allowed-tools: Read, Bash, AskUserQuestion, Task
model: sonnet
user-invocable: true
disable-model-invocation: true
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

`$CLAUDE_PLUGIN_ROOT` is NOT inherited by the Bash tool in main-conversation slash invocations. Resolve dynamically:

```bash
BT_ROOT="${CLAUDE_PLUGIN_ROOT:-$(ls -d ~/.claude/plugins/cache/claude-brewcode/brewtools/*/ 2>/dev/null | sort -V | tail -1 | sed 's:/*$::')}"
test -d "$BT_ROOT/skills/agent-router/assets" || { echo "❌ FAILED — BT_ROOT invalid: $BT_ROOT"; exit 1; }
```

Asset paths (all under `$BT_ROOT/skills/agent-router/assets/`):
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
BT_ROOT="${CLAUDE_PLUGIN_ROOT:-$(ls -d ~/.claude/plugins/cache/claude-brewcode/brewtools/*/ 2>/dev/null | sort -V | tail -1 | sed 's:/*$::')}"
A="$BT_ROOT/skills/agent-router/assets"
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
R=$({ ls "$D/agents/"*.md 2>/dev/null || true; } | wc -l | tr -d ' ')
echo "project: hook_file=$H tier1_refs=$T1 tier2_refs=$T2 enabled=$EN level=$LV roster=$R"
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
| `enabled` / `level` | parsed from the config; `n/a` = no config or no such key |
| `roster` | number of `.claude/agents/*.md` files — **`0` means the hook has nothing to route TO**; say so before installing |

These are textual counts, not JSON validation — they do not prove the entries are well-formed or attached to the right event.

Read the output into a state table and PRINT it to the user:

| Hook file | tier1 wired | tier2 wired | enabled | level | roster |
|-----------|-------------|-------------|---------|-------|--------|

Effective = `hook_file=yes tier1_refs=1 enabled=true`. Anything else is NOT effective — say so plainly instead of reporting a half-state as installed.

### Early exit

If it is already installed the way the user could want it and **the intent is not explicit** (no argument, or vague like "роутер агентов"), PRINT the status, list the operations available (`level fast|strict`, `disable`, `enable`, `uninstall`, `purge`) and **STOP**. Do not re-install, do not ask a chain of questions.

## Step 2 — Decide MODE

Read `$ARGUMENTS`. Default when there are NO arguments at all = **status**.

| Mode | Trigger words |
|------|---------------|
| `status` | no args; `status`, `статус`, `проверь`, `что стоит` |
| `install` | `install`, `set up`, `поставь`, `установи`, `включи роутер` |
| `level fast` \| `level strict` | `level`, `fast`, `strict`, `дешёвый`, `строгий`, `с LLM`, `без LLM` |
| `disable` | `disable`, `off`, `выключи`, `отключи`, `паузу` |
| `enable` | `enable`, `on`, `включи обратно`, `верни` |
| `uninstall` | `uninstall`, `remove`, `убери`, `сними`, `удали хук` |
| `purge` | `purge`, `wipe`, `вычисти всё`, `удали полностью`, `снеси`, `remove everything` |

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

Spawn (substitute `MODE`, `LEVEL`, `RUNBOOK`, `ASSETS_DIR` from Steps 1-4 — into BOTH the CONTEXT block and the `export` line):

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
  MODE = MODE (install|level|disable|enable|uninstall|purge)
  LEVEL = LEVEL (fast|strict — required for install and level; ignored by the rest)
  RUNBOOK = RUNBOOK (absolute path to assets/INSTALL.md)
  ASSETS_DIR = ASSETS_DIR (absolute path to the assets source dir — copy agent-router.mjs FROM here)
  MANDATORY FIRST BASH COMMAND — the runbook's node blocks read these from the ENVIRONMENT,
  not from this prompt. Run this VERBATIM as the first line of EVERY Bash call that executes
  a runbook block (a new Bash call does NOT inherit exports from the previous one):
    export RUNBOOK='RUNBOOK' LEVEL='LEVEL'
  Then verify before writing anything:
    echo \"LEVEL=\$LEVEL RUNBOOK=\$RUNBOOK\"
  If LEVEL prints empty, STOP and report — the config and merge blocks ABORT on an empty
  LEVEL by design; re-export it rather than hardcoding a value.
  Follow the runbook at RUNBOOK exactly and use ITS commands — it self-locates its source via
  SRC=\$(dirname \"\$RUNBOOK\"). Sections map 1:1 to MODE: 'INSTALL' , 'LEVEL', 'DISABLE /
  ENABLE', 'UNINSTALL', 'PURGE'. Merge = strip own stale/tier2 entries, then append; the tier-1
  entry is added only if the exact <absdir>/agent-router.mjs path is absent (idempotent), and
  the tier-2 entry is re-derived from LEVEL by inlining ASSETS_DIR/judge-prompt.md.
  Uninstall = strip own entries (tier-1 by basename, tier-2 by statusMessage), drop empty event
  arrays, delete agent-router.mjs, KEEP the config. Purge = uninstall + delete the config +
  delete the tmp markers.
CONSUMER: Step 6 reports your result to the user; the settings.json you write is loaded by
  the NEXT Claude Code session, so a malformed merge breaks that session instead of failing
  here — report the exact paths you touched so they can be checked.
DONE: report the settings.json path, the hooks dir, the config path with its final contents,
  and the runbook 'Verify' output if you ran it. The reported config MUST show
  level = LEVEL — a 'fast' where the user asked for 'strict' is a FAILURE, not a detail.
")
```

## Step 6 — Final status

Re-run the Step 1 status block and print the refreshed table, plus:

- what changed (file, settings.json, config values),
- **a NEW session is required for hook WIRING changes** (install / level / uninstall / purge — the tier-2 entry is part of the wiring) — `/reload-plugins` is not needed, this is a plain settings.json hook;
- **config VALUE changes** (`enabled`, `genericTypes`, `neverFlag`, `minScore`, `margin`, `intents`) are read live — no restart. `level` in the config is only a record of what is wired; changing it by hand does NOT add or remove the tier-2 entry, run `level strict` / `level fast` for that;
- the honest limits, at minimum: tier 2 costs a model call on every `Agent` spawn, tier 1 matches words not meaning, everything fails open.

---

## Modes

| Mode | Effect | Hook file | settings.json | Config | tmp markers |
|------|--------|-----------|---------------|--------|-------------|
| `status` | report only | — | — | — | — |
| `install` | wire tier 1 (+ tier 2 if `strict`) | copied | entry merged | written | — |
| `level fast` | drop the tier-2 entry | kept | tier-2 stripped | `level:"fast"` | kept |
| `level strict` | add the tier-2 entry (judge prompt inlined) | kept | tier-2 appended | `level:"strict"` | kept |
| `disable` | `enabled:false` — hook stays wired, becomes a no-op | kept | kept | edited | kept |
| `enable` | `enabled:true` | kept | kept | edited | kept |
| `uninstall` | unwire | deleted | entries stripped | **kept** | kept |
| `purge` | full wipe | deleted | entries stripped | deleted | deleted |

Re-install is a no-op. Scope is PROJECT only — the roster is per-project, so there is nothing to install globally and no scope question to ask.

## Guards

| Condition | Response |
|-----------|----------|
| `BT_ROOT` resolves but `$BT_ROOT/skills/agent-router/assets` missing | ERROR: `agent-router: assets not found under $BT_ROOT — plugin cache incomplete.` STOP. |
| Neither `$CLAUDE_PLUGIN_ROOT` set nor any cached plugin dir found | ERROR: `agent-router: cannot locate plugin root — install/update brewtools first.` STOP. |
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
BT_ROOT="${CLAUDE_PLUGIN_ROOT:-$(ls -d ~/.claude/plugins/cache/claude-brewcode/brewtools/*/ 2>/dev/null | sort -V | tail -1 | sed 's:/*$::')}"
A="$BT_ROOT/skills/agent-router/assets"
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
