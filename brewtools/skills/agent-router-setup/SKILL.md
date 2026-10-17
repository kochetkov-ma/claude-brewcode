---
name: agent-router-setup
description: "Installs, configures or removes the agent-router hook (routes a generic Agent spawn to the real project/plugin expert). Triggers: agent-router, wrong agent, route to expert, роутер агентов, не тот агент."
user-invocable: true
disable-model-invocation: true
argument-hint: "[prompt] [status|install|upgrade|enable|disable|uninstall|purge] [level fast|strict] [--unattended]"
allowed-tools: [Read, Bash, AskUserQuestion, Agent]
model: sonnet
license: MIT
---

# Agent Router

> **EXPERIMENTAL.** Installs one self-contained PreToolUse hook on the `Agent` tool. When the main loop spawns a generic agent although a real expert owns the task — a project agent from `.claude/agents/`, or an installed brewcode specialist — the hook denies the spawn and names the expert; an uncertain fit is only a nudge. Runtime behavior lives in the hook file and a JSON config; this skill resolves mode and level, then delegates the file work to the `brewcode:hook-creator` agent, which follows the runbook.

## Prompt contract

`$ARGUMENTS` is one free-form RU/EN prompt; mode tokens and flags (`--unattended`) may sit anywhere in it.

1. Mode: strip `--unattended` first: a flag, never a mode, level or name (Modes, **Unattended**).
   Then an explicit mode token wins outright; else the most distinct whole-word keyword hits
   (table in Step 2). Tie with a destructive mode (`purge`) or of `install` with a removal mode
   (`uninstall`) -> `AskUserQuestion`; with `status` -> `status`; of two other mutating modes -> the
   keyword that comes first. No hit or empty -> `status`.
2. Scope: prose that is not a mode/id/path is still input: take the id, path or target from it.
3. Ask: at most ONE `AskUserQuestion` (max 4 questions) to resolve mode and scope, before any work, only when the answer
   changes what gets written. A read-only run asks nothing. `--unattended` asks nothing: an open
   question there ends in `RESULT skipped` (Modes, **Unattended**).

Print once, before the first action (labels literal, values in the conversation language):

```
PLAN — brewtools:agent-router-setup
INPUT:  <arguments verbatim, or "(empty)">
MODE:   <resolved> — <explicit | matched keyword: X | default>
SCOPE:  <resolved paths / target / level / flags>
DO:     <2-5 imperative bullets>
RESULT: <what the user ends up holding>
```

## What the hook does (informational — skill does NOT implement)

| Tier | `hooks.PreToolUse` entry (timeouts in seconds) | Behavior |
|------|--------------|----------|
| 1 — always on | matcher `Agent`: `{"type":"command","command":"node","args":["<PD>/.claude/hooks/agent-router.mjs"],"timeout":5}`, where `<PD>` is the dollar-brace `CLAUDE_PROJECT_DIR` token, stored unexpanded (written out here it would be replaced by a path at load) | deterministic, <100 ms incl. node startup, zero tokens |
| 2 — opt-in (`level strict`) | matcher `Agent`: `{"type":"agent","prompt":"<inlined judge-prompt.md>","timeout":30,"statusMessage":"agent-router: checking agent fit"}`. No `model` key: Claude Code then runs its default small model (`claude-haiku-5-5` on 2.1.296), and any explicit `model` is reported as drift | an LLM judges a generic spawn against the project roster |
| heartbeat — with tier 2 | matcher `StructuredOutput`: the tier-1 command handler again | counts the judge's verdicts for `--judge-health` |

Tier 1 decision order — it allows as early as it can:

| # | Check | Result |
|---|-------|--------|
| 1 | tool is not `Agent` | allow |
| 2 | `agent_id` present: a subagent's spawn, or a hook verifier (`hook-agent-*`) | allow; only the main loop is policed |
| 3 | `enabled:false`, or a config file that exists but does not parse | allow |
| 4 | the picked type is a project agent (`.claude/agents/**/*.md`, by frontmatter `name`) | allow |
| 5 | the picked type is not on `genericTypes` | allow. An omitted `subagent_type` counts as `general-purpose` (the Agent-tool default) and is policed |
| 6 | `agent-router: override` (also `allow` / `skip`) in the description or prompt | allow, silently: the escape hatch, matched on the untruncated text before any rule and named in every deny message |
| 7 | STRONG intent: an authoring verb aimed at the artifact (skill -> `brewcode:skill-creator`, agent -> `brewcode:agent-creator`, hooks -> `brewcode:hook-creator`, bash/sh -> `brewcode:bash-expert`), not behind `do not` / `never` / `how to` / `instead of` | deny naming the expert: the first ranked project agent that scores and covers the intent (its frontmatter matches the rule's `domain` regex), else the plugin specialist, and that one only when found on disk (project agents, user agents, plugin cache). Not found -> a notice, never a deny |
| 8 | roster scoring: every `.claude/agents/**/*.md` frontmatter (`name` + `Triggers:`), each agent's own name struck from the text unless it lists that name in `Triggers:` | one clear winner (`minScore` + `margin` over the runner-up) -> deny naming it; several plausible -> `additionalContext` nudge with the top 3; nothing -> silent allow |
| 9 | WEAK intent: a bare artifact mention (`SKILL.md`, `.claude/agents/`, `hooks.json`, an event name, a shebang) | never denies; nudges, merged with a step-8 nudge into one message |
| 10 | anti-loop guard | a (session, project root, task) is denied at most once; the retry passes with a nudge. `task` = the description, or the prompt's first 300 normalized chars when there is none |
| 11 | any error | fail open |

`neverFlag` (types never flagged) defaults to eight entries: `Explore`, `Plan`, `statusline-setup`, `output-style-setup` and the four step-7 experts; `normalizeConfig()` adds every configured `intents[].expert` at load. There is no nudge-threshold key: the nudge floor is `max(1, ceil(minScore/2))`. Every condition and config key is in the runbook (`## What it does`, `## Config`): read them before explaining a specific deny.

## Honest limits (state these to the user, do not oversell)

| Fact | Consequence |
|------|-------------|
| Claude Code runs all hooks matching an event in parallel; no hook can skip another | Tier 2 makes a model call on every `Agent` spawn; its own step-1 fast exit is the only cost control, tier 1 cannot gate it. Hence `level fast` is the default and recommendation. |
| Tier 2 cannot be made fail-closed | A judge that times out or hits a model error silently allows the spawn; tier 1 still decides every spawn independently. `--judge-health` (printed by status at `strict`) shows that the judge stopped answering. |
| Tier 2 is narrower than tier 1 | It judges `general-purpose` and `worker` only, redirects to project agents only, keeps no state, reads neither `genericTypes` nor `neverFlag`. It honors the escape hatch and `enabled:false`, and does not read the transcript. |
| No supported signal for "this tool call came from inside a Skill" | Neither tier attempts it. |
| Tier 1 matches English trigger words, not meaning | It errs toward allowing: an ambiguous case becomes a nudge, never a block. |
| Tier 1 denies for an expert only when it is found on disk | A `--plugin-dir` plugin is not in the plugin cache, so its specialists get a notice; a cached but disabled plugin still gets the deny. |
| Every failure mode — bad config, unreadable roster, timeout, malformed output | Fails open. A config that exists but does not parse turns the feature fully off, not back to defaults. |
| State (anti-loop markers; at `strict` the heartbeat) lives in `<os.tmpdir()>/brewtools-agent-router/p-<sha1(real root)[0..16]>/` | Tmp unusable (read-only, foreign-owned `brewtools-agent-router/`, sandbox) -> every deny degrades to a notice (an unrecorded deny could repeat forever). Say so when a user reports "it never blocks anything". |
| A deny is not a wall | It is a tool error the model can act on: the human is never prompted, the retry passes, and every deny text ends with the escape hatch `agent-router: override`. |
| EXPERIMENTAL | Opt-in (not registered in `brewtools/hooks/hooks.json`, so installing the plugin does nothing until this skill runs) and project scope only: the roster is per-project, so there is no global install and no scope question. |

<instructions>

## BT_ROOT Resolver (use in EVERY bash block)

> `CLAUDE_SKILL_DIR` and `CLAUDE_PLUGIN_ROOT` are text substitutions Claude Code applies to this file before the model reads it, in the dollar-brace form only; they are not Bash-tool env vars, and an unbraced or `:-fallback` spelling reaches the shell unsubstituted.

```bash
BT_ROOT="${CLAUDE_PLUGIN_ROOT}"
test -d "$BT_ROOT/skills/agent-router-setup/assets" || { echo "❌ FAILED — BT_ROOT invalid: $BT_ROOT"; exit 1; }
```

Assets, all under `$BT_ROOT/skills/agent-router-setup/assets/`:
- `INSTALL.md` — the runbook: install, level, config shape, disable/enable, uninstall, purge, verify. Single source of truth: follow its commands, never re-derive them here.
- `agent-router.mjs` — the hook (tier 1 and the heartbeat), the only file copied into the project. The plugin's copy is also the installer CLI (`--probe <settings.json>`, `--judge-health <root>`, `--purge-state <root>`); `--probe` works only there, beside `judge-prompt.md`.
- `judge-prompt.md` — the tier-2 judge prompt, inlined into settings.json, never copied

> Never write to `~/.claude/*`: a protected path, blocked in all modes, and a global roster does not exist.

---

## Step 1 — STATUS FIRST, always

After the initial PLAN, probe status in every mode, before any installation, reinstallation or removal.

**EXECUTE** using Bash tool:

```bash
BT_ROOT="${CLAUDE_PLUGIN_ROOT}"
A="$BT_ROOT/skills/agent-router-setup/assets"
test -f "$A/INSTALL.md" && test -f "$A/agent-router.mjs" && test -f "$A/judge-prompt.md" || { echo "❌ FAILED — assets incomplete under BT_ROOT=$BT_ROOT"; exit 1; }
echo "ASSETS_DIR=$A"
echo "RUNBOOK=$A/INSTALL.md"
# rc 0: the dir is HOME or the active config dir's parent - its .claude is a profile, never a project root.
is_profile_parent() {
  _pp=$(cd "${1}" 2>/dev/null && pwd -P) || return 1
  [ -n "${HOME:-}" ] && [ "$_pp" = "$(cd "$HOME" 2>/dev/null && pwd -P)" ] && return 0
  [ -n "${CLAUDE_CONFIG_DIR:-}" ] && [ "$_pp/.claude" = "$(cd "$CLAUDE_CONFIG_DIR" 2>/dev/null && pwd -P)" ]
}
claude_project_root() {
  PD="${CLAUDE_PROJECT_DIR}"   # substituted at load: the session start dir, as hooks get it
  if [ -n "$PD" ] && [ -d "$PD" ]; then
    printf '%s\n' "$PD"; return 0
  fi
  d=$PWD
  while [ "$d" != "/" ]; do
    if [ -f "$d/.claude/brewtools/agent-router.json" ] && ! is_profile_parent "$d"; then printf '%s\n' "$d"; return 0; fi
    d=$(dirname "$d")
  done
  if r=$(git rev-parse --show-toplevel 2>/dev/null) && [ -n "$r" ]; then
    printf '%s\n' "$r"; return 0
  fi
  d=$PWD
  while [ "$d" != "/" ]; do
    if [ -d "$d/.claude" ] && ! is_profile_parent "$d"; then printf '%s\n' "$d"; return 0; fi
    d=$(dirname "$d")
  done
  printf '%s\n' "$PWD"; return 1
}
if ROOT=$(claude_project_root); then ROOT_OK=yes; else ROOT_OK=no; fi
echo "project_root=$ROOT root_resolved=$ROOT_OK"
D="$ROOT/.claude"
H=no; [ -f "$D/hooks/agent-router.mjs" ] && H=yes
REFS=$(node "$A/agent-router.mjs" --probe "$D/settings.json") || { echo "❌ FAILED — settings probe did not run"; exit 1; }
T1=${REFS%%|*}; REST=${REFS#*|}; LEGACY_T1=${REST%%|*}; REST=${REST#*|}; T2=${REST%%|*}; REST=${REST#*|}; HB=${REST%%|*}; REST=${REST#*|}; VALID=${REST%%|*}; WR=${REFS##*|}
CFG=none; [ -s "$D/brewtools/agent-router.json" ] && CFG=$(tr -d '\n ' < "$D/brewtools/agent-router.json"); CFG=${CFG:-none}
EN=n/a; case "$CFG" in *'"enabled":true'*) EN=true;; *'"enabled":false'*) EN=false;; esac
LV=n/a; case "$CFG" in *'"level":"strict"'*) LV=strict;; *'"level":"fast"'*) LV=fast;; esac
CV=$({ jq -r '.version // empty' "$D/brewtools/agent-router.json" 2>/dev/null || true; }); CV=${CV:-n/a}
PV=$({ jq -r '.version // empty' "$BT_ROOT/.claude-plugin/plugin.json" 2>/dev/null || true; }); PV=${PV:-n/a}
cv_of(){ { sed -n '1,3p' "${1}" 2>/dev/null || true; } | sed -n 's/.*content_version=\([0-9][0-9]*\.[0-9][0-9]*\.[0-9][0-9]*\).*/\1/p' | head -1; }
HCV=$(cv_of "$D/hooks/agent-router.mjs"); HCV=${HCV:-n/a}          # INSTALLED hook body
TCV=$(cv_of "$A/agent-router.mjs"); TCV=${TCV:-n/a}                # template it was copied from
GCV=$({ jq -r '.content_version // empty' "$D/brewtools/agent-router.json" 2>/dev/null || true; }); GCV=${GCV:-n/a}
KCV=$TCV                                                           # config contract = the hook asset that parses it
RCV=$(cv_of "$A/INSTALL.md"); RCV=${RCV:-n/a}                      # informational: runbook prose never stales a config
STALE=n/a
if [ "$HCV" != n/a ] && [ "$TCV" != n/a ]; then [ "$HCV" = "$TCV" ] && STALE=no || STALE=yes; fi
if [ "$STALE" != yes ] && [ "$GCV" != n/a ] && [ "$KCV" != n/a ] && [ "$GCV" != "$KCV" ]; then STALE=yes; fi
R=$(node "$A/agent-router.mjs" --roster "$ROOT" 2>/dev/null) || R=n/a
echo "project: hook_file=$H tier1_refs=$T1 legacy_refs=$LEGACY_T1 tier2_refs=$T2 settings_valid=$VALID heartbeat_refs=$HB wrapped_refs=$WR enabled=$EN level_recorded=$LV roster=$R"
echo "content_version: hook=$HCV template=$TCV config=$GCV contract=$KCV runbook=$RCV stale=$STALE"
echo "version: config=$CV plugin=$PV"
echo "config=$CFG"
[ "$T2" = 0 ] || node "$A/agent-router.mjs" --judge-health "$ROOT" || true
echo "✅ status"
```

> **STOP if ❌** — plugin cache incomplete; reinstall/update brewtools first.

`*_refs` and `settings_valid` come from the plugin copy's `agent-router.mjs --probe <settings.json>` (`tier1|legacy|tier2|heartbeat|valid|wrapped`), the installer's own identity check. Do not paraphrase a field into something stronger:

| Field | Value |
|-------|-------|
| `project_root` / `root_resolved` | the hook's own ladder (16 levels per step there): `CLAUDE_PROJECT_DIR` (substituted at load: the session start dir, the same value the hook gets), else the nearest ancestor holding `.claude/brewtools/agent-router.json`, else git toplevel, else the nearest holding a `.claude` dir, so a nested bare `.claude` cannot mask the owning root. `root_resolved=no` = read-only fallback to `$PWD` |
| `hook_file` | `yes`/`no` — `agent-router.mjs` present in `<repo>/.claude/hooks/` |
| `tier1_refs` | handlers exactly matching the tier-1 entry above; `1` = wired |
| `tier2_refs` | handlers exactly matching the tier-2 entry above, prompt byte-equal to the current `judge-prompt.md` with its stamp line stripped on both sides (a meta-only bump stays current), no `model` key; `0` = tier 2 off, `1` = wired |
| `heartbeat_refs` | handlers exactly matching the heartbeat entry; must equal `tier2_refs` |
| `legacy_refs` | owned handlers off their exact shape: absolute path, wrong event/matcher/type/command/timeout, extra args/keys, stale or empty judge prompt, wrong status message, any explicit tier-2 `model` (installs up to 6.4.0 pinned one). Nonzero -> `install`/`upgrade` migrates |
| `settings_valid` | `yes` only when settings are absent/empty or parse as a JSON object |
| `wrapped_refs` | handlers naming `agent-router.mjs` (in `command` or `args`) launched by something other than `node`: the project's own launcher, e.g. `"$CLAUDE_PROJECT_DIR/.claude/scripts/preflight.py" exec node -- ".../agent-router.mjs"`. Custom, user-owned, report-only: never `legacy`, never rewritten, and `install`/`upgrade` then add no command handler of their own (no unwrapped duplicate) |
| `judge_expected` / `judge_answered` / `judge_overdue` | printed when `tier2_refs` is not `0`: `Agent` calls seen at `level strict` / verdicts returned / verdicts expected over 90 s ago that never came (silent allows). `judge_overdue>0`, or `judge_answered=0` with `judge_expected>0` = registered but not answering. Counters cover ~24 h and include every `type:"agent"` hook verdict in the project |
| `enabled` | from the config; `n/a` = no config or no such key |
| `level_recorded` | the config's `level`: an install-time record, not proof of wiring; `tier2_refs` is the authority |
| `content_version` (`hook` / `template` / `config` / `contract` / `runbook`) | the staleness signal: `hook` = the `brewcode-meta:` header of the installed `.claude/hooks/agent-router.mjs`, `template` = that header in the plugin's asset copy, `config` = the config's `content_version` key, `contract` = the config contract, the `template` CV (the hook is the one file that parses the config), `runbook` = the header of `assets/INSTALL.md`, informational only: a runbook-only change never stales a config. A difference on `hook`/`template` or `config`/`contract` -> `stale=yes` -> offer `upgrade`. `n/a` on a side (pre-5.6 artifact, or not installed) = unknown, not "current" |
| `version` / `plugin` | the config's `version` key vs the installed brewtools version. Informational: every config write (`enable`/`disable` included) re-stamps it while the hook file stays old, so never decide staleness from it |
| `roster` | number of project agents the hook loads (its own walk via `--roster`: recursive, up to the git root, files Claude Code skips excluded); `0` = roster scoring has no candidates, the four intent routes still work |

Print the status in this table; when `tier2_refs` is not `0`, add one sentence giving the three judge counters and what they mean:

| Hook file | portable tier1 | legacy refs | tier2 wired | heartbeat | wrapped | settings valid | enabled | level (recorded) | hook cv | template cv | stale | roster |
|-----------|----------------|-------------|-------------|-----------|---------|----------------|---------|------------------|---------|-------------|-------|--------|

Custom = `hook_file=yes tier1_refs=0 legacy_refs=0 wrapped_refs>=1 settings_valid=yes`: the project wraps the hook in its own launcher. Say "registered through a custom launcher (report-only)", never offer `install`/`upgrade` for the registration: the launcher cannot be verified from here, and a reinstall adds no unwrapped copy beside it anyway.

Effective = `hook_file=yes tier1_refs=1 legacy_refs=0 settings_valid=yes`, tier 2 either off (`tier2_refs=0 heartbeat_refs=0`) or complete (`tier2_refs=1 heartbeat_refs=1`), and `enabled` anything but `false`: a missing config leaves tier 1 on with the built-in defaults, so `enabled=n/a` is effective. Not effective: a count above `1`, any `legacy_refs`, invalid settings, or a judge without its heartbeat (its silent failures cannot be seen). `stale=yes` is effective but runs old logic: say "installed, stale — run `upgrade`".

`level_recorded=strict` with `tier2_refs=0` = judge not wired: report the mismatch, offer `level strict` or `level fast`. Editing the config value wires nothing.

### Config metadata (the four standard JSON keys)

Every mode that writes `agent-router.json` (`install`, `upgrade`, `enable`, `disable`, both `level` operations) writes these four keys beside the behavior keys; `doc_type` is a `.md`-frontmatter field and never appears in JSON:

```json
{ "version": "{PLUGIN_VERSION}", "content_version": "<agent-router.mjs header>", "generated_by": "brewtools:agent-router-setup", "last_updated": "{LAST_UPDATED}" }
```

`content_version` is not passed in: the runbook's node blocks read it from the `brewcode-meta:` header of `agent-router.mjs` beside `$RUNBOOK` (the config contract, so a runbook-only change never stales a config) and abort if unreadable. Resolve only `version` and `last_updated` here, never hardcode. **EXECUTE** using Bash tool:

```bash
BT_ROOT="${CLAUDE_PLUGIN_ROOT}"
[ -f "$BT_ROOT/.claude-plugin/plugin.json" ] || { echo "ERROR: brewtools plugin root not resolved: '$BT_ROOT'"; exit 1; }
PV=$(jq -r '.version // empty' "$BT_ROOT/.claude-plugin/plugin.json" 2>/dev/null || true)
PV=${PV:-$(basename "$BT_ROOT")}
echo "PLUGIN_VERSION=$PV LAST_UPDATED=$(date +%F)"
```

The hook reads only the config keys it names, so these four cannot change routing.

### Early exit

Already installed and the intent is not explicit (no argument, or vague like "роутер агентов"): print the status, list the operations (`upgrade`, `enable`, `disable`, `uninstall`, `purge`, `level fast|strict`) and stop: no re-install, no questions.

## Step 2 — Decide MODE

| Mode | EN keywords | RU keywords | Mutates? |
|------|-------------|--------------|----------|
| `status` | *(empty)*, `status` | `статус`, `проверь`, `что стоит` | no |
| `install` | `install`, `set up` | `поставь`, `установи`, `включи роутер` | yes |
| `upgrade` | `upgrade`, `update`, `refresh` | `обнови`, `перевыстави`, `после обновления плагина` | yes |
| `enable` | `enable` | `включи обратно`, `верни` | yes |
| `disable` | `disable` | `выключи`, `отключи`, `паузу` | yes |
| `uninstall` | `uninstall` | `убери`, `сними`, `удали хук` | yes |
| `purge` | `purge`, `wipe`, `remove everything` | `вычисти всё`, `удали полностью`, `снеси` | yes, destructive |
| `level fast` \| `level strict` (extra) | `level`, `fast`, `strict` | `дешёвый`, `строгий`, `с LLM`, `без LLM` | yes |

Ties resolve per Prompt contract rule 1. Never ask scope (project only). Step 4 asks a missing level.

## Step 3 — Explain pending changes before questions

Add concrete state/action details to the initial PLAN without repeating its block. Example:

> Current state: agent-router not installed; `.claude/agents/` holds 4 project agents. Plan: copy `agent-router.mjs` into `<repo>/.claude/hooks/`, write `<repo>/.claude/brewtools/agent-router.json` with `level: "fast"`, merge one PreToolUse (`Agent`) entry into `<repo>/.claude/settings.json`. Project scope only. One question first: level.

If `roster=0`, say so first: only the 4 intent rules can fire, step 8 has nothing to score. Offer to stop.

## Step 4 — Ask ONLY what is missing (`AskUserQuestion`)

Skip any question already answered by the prompt or settled by the status table.

| # | Question | Options | Default |
|---|----------|---------|---------|
| 1 | Level? | **fast — tier 1 only, deterministic, zero tokens (Recommended)** / strict — adds an LLM judge on every Agent spawn | `fast` |

When `strict` is requested or asked about, state its cost and limit before writing anything (option description or plan, not only the final report): *Claude Code runs all matching hooks in parallel, so tier 1 cannot gate tier 2. Strict makes a model call on every `Agent` spawn, and the judge's own fast exit is the only cost control. A judge that times out or hits a model error allows the spawn silently.*

Nothing else is asked: `disable`/`enable` ask nothing, `uninstall`/`purge` only the deletion confirmation of Step 5.

## Step 5 — Act on the resolved PLAN

Use the PLAN printed before Step 1; do not print it twice. Resolve MODE/SCOPE, exact paths, `level` and settings.json entries before mutating. `uninstall`/`purge`: list the exact deletions and confirm once. Status and early exit report the table and stop; `DO:` is "read state, report".

### Delegation

One mode is one bounded unit (1 asset file + one settings.json + one config): one `hook-creator` spawn per mode.

Every spawn brief carries six labeled fields, since a subagent starts with an empty context: GOAL (task + why), ROLE (owns, must not touch), SCOPE (paths/commands in and out), CONTEXT (done, by whom, in parallel), CONSUMER (who uses the result + its shape), DONE (acceptance + return: verdict first, evidence, bounded; long output to a file, path returned).

Spawn: substitute `MODE`, `LEVEL`, `RUNBOOK`, `ASSETS_DIR`, `PROJECT_ROOT`, `PLUGIN_VERSION`, `LAST_UPDATED` from Steps 1-4 and the Config-metadata block into both the CONTEXT block and the literal `export` line. The runbook reads `LEVEL`/`RUNBOOK` from `process.env`, which prose cannot set; an empty `LEVEL` aborts config and merge (no silent `fast` fallback). `PROJECT_ROOT` = Step 1 `project_root`: the runbook's root block takes `CLAUDE_PROJECT_DIR` first and the Bash tool does not have it; with `root_resolved=no`, drop it from the export line. Afterwards check the reported config for the chosen level.

```
Agent(subagent_type="brewcode:hook-creator", prompt="
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
    export RUNBOOK='RUNBOOK' LEVEL='LEVEL' PLUGIN_VERSION='PLUGIN_VERSION' LAST_UPDATED='LAST_UPDATED' CLAUDE_PROJECT_DIR='PROJECT_ROOT'
  Then verify before writing anything:
    echo \"LEVEL=\$LEVEL RUNBOOK=\$RUNBOOK PV=\$PLUGIN_VERSION LU=\$LAST_UPDATED PD=\$CLAUDE_PROJECT_DIR\"
  If LEVEL prints empty, STOP and report — the config and merge blocks ABORT on an empty
  LEVEL by design; re-export it rather than hardcoding a value.
  Follow the runbook at RUNBOOK exactly and use ITS commands — it self-locates its source via
  SRC=\$(dirname \"\$RUNBOOK\"). Sections map 1:1 to MODE: 'INSTALL', 'UPGRADE', 'LEVEL', 'DISABLE /
  ENABLE', 'UNINSTALL', 'PURGE'. Merge = strip owned handlers individually while preserving foreign
  co-handlers, then append exactly one portable tier-1 handler whose arg is the unexpanded
  dollar-brace CLAUDE_PROJECT_DIR token + /.claude/hooks/agent-router.mjs, exactly as the runbook
  block writes it (idempotent); legacy absolute checkout args are removed, and
  the tier-2 entry (ASSETS_DIR/judge-prompt.md inlined, no model key) plus its StructuredOutput
  heartbeat entry are re-derived from LEVEL: both at strict, neither at fast.
  Uninstall = strip owned handlers (tier-1 and heartbeat by basename, tier-2 by statusMessage), drop
  only empty entries/event arrays, delete agent-router.mjs, KEEP the config. Purge = uninstall +
  delete the config + the runbook's --purge-state call, which removes this project's tmp state only.
  METADATA: every mode that WRITES the config (install, upgrade, enable, disable, level) must
  leave these four keys in agent-router.json:
  version=\$PLUGIN_VERSION, content_version=<read by the runbook block from the brewcode-meta
  header of agent-router.mjs beside \$RUNBOOK — never passed in, never hardcoded>, generated_by=\"brewtools:agent-router-setup\",
  last_updated=\$LAST_UPDATED. No doc_type — it is a .md-frontmatter field and never belongs
  in a JSON carrier. Set them INSIDE the runbook's node block that re-serializes the
  object with JSON.stringify — never by appending text to the file. An unparseable config
  silently disables the whole feature, so a hand-edited append is a defect, not a shortcut.
  Do NOT touch enabled or level while doing it: enabled is off only when exactly false, and
  level is a record of what is wired.
CONSUMER: Step 6 reports your result to the user; Claude Code watches settings.json and
  applies your write to the running session, so a malformed merge breaks hooks there instead
  of failing here — report the exact paths you touched so they can be checked.
DONE: report the settings.json path, the hooks dir, the config path with its final contents,
  and the runbook 'Verify' output if you ran it. The reported config MUST show
  level = LEVEL — a 'fast' where the user asked for 'strict' is a FAILURE, not a detail —
  and version = \$PLUGIN_VERSION plus a non-empty content_version. For install/upgrade also
  report the content_version of the hook file you COPIED (head -2 of the installed
  .claude/hooks/agent-router.mjs) — status keys staleness on it. Prove the config still
  parses: jq . <config path>.
")
```

## Step 6 — Final status

Re-run the Step 1 status block and print the refreshed table, plus:

- what changed (file, settings.json, config values);
- hook wiring changes (install / upgrade / level / uninstall / purge; the tier-2 and heartbeat entries are wiring) apply to the running session, no restart: Claude Code watches settings files; `/hooks` confirms. `/reload-plugins` does not apply: this is a plain settings.json hook;
- config value changes (`enabled`, `genericTypes`, `neverFlag`, `minScore`, `margin`, `intents`) are read live, no restart. `level` is the exception: it is only the record Step 1 describes;
- whether `stale` flipped to `no`: only a re-copied hook file clears it, a `version` bump proves nothing;
- the honest limits, at minimum: tier 2 costs a model call per `Agent` spawn and allows silently on judge timeout/error, tier 1 matches words not meaning, everything fails open.

---

## Modes

| Mode | Effect | Hook file | settings.json | Config | tmp state |
|------|--------|-----------|---------------|--------|-----------|
| `status` | report only | — | — | — | — |
| `install` | wire tier 1 (+ tier 2 and its heartbeat if `strict`) | copied | entries merged | written | — |
| `upgrade` | re-emit from the current plugin version at the already-configured level | re-copied | entries re-merged | behavior values preserved, metadata re-stamped | kept |
| `enable` | `enabled:true` | kept | kept | edited | kept |
| `disable` | `enabled:false` — hook stays wired, becomes a no-op | kept | kept | edited | kept |
| `uninstall` | unwire | deleted | entries stripped | **kept** | kept |
| `purge` | full wipe of this project | deleted | entries stripped | deleted | this project's dir deleted (`--purge-state <root>`); other projects' state stays |
| `level fast` (extra) | drop the tier-2 and heartbeat entries | kept | both stripped | `level:"fast"` | kept |
| `level strict` (extra) | add the tier-2 entry (judge prompt inlined) and the heartbeat entry | kept | both appended | `level:"strict"` | kept |

`upgrade` asks nothing: it reads `level` from the existing config and replays the install (fresh `agent-router.mjs`, freshly inlined judge prompt). Not installed -> it is an `install`, so ask the level question.

**Unattended (`--unattended` anywhere in the prompt; set by `/brewcode:setup-status upgrade`).**
1. A flag, never a mode or name: strip it first. Any resolved mode other than `upgrade` -> no write, `RESULT skipped <id> cv=?->? pending=0 note="not-upgrade"`.
2. No `AskUserQuestion` at all. Every gate in this section takes its decline branch; a declined gate is pending, never applied.
3. A precondition this section would ask about (not installed, parked, custom/wrapped registration, orphan config,
   user-modified managed file, missing tokenizer) -> no write, `RESULT skipped <id> cv=?->? pending=0 note="<reason>"`.
4. Write only what this section already writes. No git commit, push, stash or reset; scratch only in a private `mktemp -d`.
5. Last line, exactly once: `RESULT <ok|partial|skipped|failed> <id> cv=<before>-><after> pending=<n> note="<one line>"`,
   `<id>` = `<plugin>:<skill>` [` scope=<project|global>`|` team=<name>`], `?` = unknown version.

Here `<id>` = `brewtools:agent-router-setup` (project only: no scope part, a passed scope token is ignored):
- Step 1 decides, first hit wins, before the Smoke Test: `config=none`, or `hook_file=no` with every `*_refs` count `0` (`uninstall` keeps the config; the replay would undo it) -> skipped, note `not installed`; `wrapped_refs` not `0` (Custom above included) -> skipped, note `custom launcher`; `settings_valid=no` -> skipped, note `settings.json invalid`; `level_recorded=strict` with `tier2_refs=0` -> skipped, note `level mismatch: strict recorded, judge not wired` (the replay would wire a paid judge that status asks about).
- Otherwise Steps 3-4 are skipped: Smoke Test, then the one `hook-creator` spawn with `MODE=upgrade`. The read-back `ABORT:` (UPGRADE step 1, nothing written yet) -> skipped, its text as note; an `ABORT:` from a later block (the hook copy already ran), a `❌` in Step 1 or the Smoke Test, or a failed spawn -> `failed`.
- Step 6 status: `stale=no` -> `ok`, else `failed`. `cv` = `content_version` `config=` before -> after (`n/a` -> `?`); `pending=0` (this upgrade has no gate); a kept `enabled=false` is named in `note`.

Upgrading an install from brewtools 6.4.0 or older changes `settings.json` at `level strict`: the tier-2 handler loses its `model` key (a pinned ID ages out, an omitted one cannot) and the heartbeat entry appears. At `level fast` only the hook file changes. Old anti-loop markers are not migrated: one already-denied task per live session can be denied once more.

Re-install is idempotent, not inert: the merge converges to the same entries, but the copy always overwrites `agent-router.mjs` with the current asset, which repairs a `stale=yes` install. Never talk a user out of it.

## Guards

| Condition | Response |
|-----------|----------|
| `$BT_ROOT/skills/agent-router-setup/assets` missing | ERROR: `agent-router: assets not found under $BT_ROOT — plugin cache incomplete.` STOP. |
| `BT_ROOT` empty or without `.claude-plugin/plugin.json` | ERROR: `agent-router: cannot locate plugin root — install/update brewtools first.` STOP. |
| `stale=yes` (hook `content_version` != template, or config != contract) | Report it together with "installed": the project runs an old hook body. Recommend `upgrade` (re-copies the file, re-stamps the config). |
| User asks for a global install | Refuse and explain: the roster is per-project, `~/.claude/*` is protected, and a global hook would route every repo against one repo's agents. Offer the project install. |
| User wants to add or change an intent route | Warn first: a config `intents` array replaces the built-in four wholesale (no merge, no warning when three routes vanish), so copy `DEFAULT_INTENTS` out of `agent-router.mjs` and append. An entry needs `label` + `expert` + `match` (STRONG, may deny) and may carry `weakMatch` (nudge only) and `domain` (noun-only regex deciding which project agent covers the intent; falls back to `match`\|`weakMatch`). An entry whose `match` does not compile is skipped entirely, weak side included. Install never writes the key. |
| Existing config is malformed JSON | Report it: the runbook aborts rather than overwriting it blind, and the hook fails open (every spawn allowed) until it is fixed. Offer to rewrite. |
| User reports a spawn being blocked repeatedly | Tier 1 denies a (session, project, task description) at most once, even when the retry rewrites the prompt — so a repeat means a different description each time, or tier 2 (no state, can deny the same task again). Collect the deny text, check `tier2_refs`. Immediate unblock: `agent-router: override` (or `allow` / `skip`); both tiers honor it. |
| User says a wrong expert was named | Both deny rules fire on coverage, not score (steps 7-8): that agent really describes the domain. Fix its `description`/`Triggers:`, or add `domain` to a custom `intents` entry; `agent-router: override` unblocks meanwhile. |

---

## Smoke Test

Verify the 3 assets exist and the hook parses before delegating.

**EXECUTE** using Bash tool:

```bash
BT_ROOT="${CLAUDE_PLUGIN_ROOT}"
A="$BT_ROOT/skills/agent-router-setup/assets"
test -d "$A" || { echo "❌ smoke FAILED — assets dir missing: $A"; exit 1; }
for f in agent-router.mjs judge-prompt.md INSTALL.md; do
  test -f "$A/$f" || { echo "❌ smoke FAILED — missing $f"; exit 1; }
done
test -s "$A/judge-prompt.md" || { echo "❌ smoke FAILED — judge-prompt.md is empty (it is inlined into settings.json)"; exit 1; }
node --check "$A/agent-router.mjs" && echo "✅ smoke" || echo "❌ smoke FAILED — syntax error in the hook file"
```

> **STOP if ❌** — do NOT delegate; reinstall/update brewtools first.

`node --check` proves only that the file parses. Behavioral verification is the runbook's **Verify** section; `tests/run.sh` is not run here.

</instructions>
