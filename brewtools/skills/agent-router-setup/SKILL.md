---
name: agent-router-setup
description: "Installs, configures or removes the agent-router hook (routes a generic Agent spawn to the real project/plugin expert). Triggers: agent-router, wrong agent, route to expert, роутер агентов, не тот агент."
user-invocable: true
disable-model-invocation: true
argument-hint: "[prompt] [status|install|upgrade|enable|disable|uninstall|purge] [level fast|strict]"
allowed-tools: [Read, Bash, AskUserQuestion, Agent]
model: sonnet
---

# Agent Router

> **EXPERIMENTAL.** Installer/configurator skill. It wires ONE self-contained PreToolUse hook (matcher `Agent`) that checks whether the main loop picked the RIGHT agent for a spawn and redirects it to the real expert — a project agent from `.claude/agents/`, or a brewcode specialist — when it reached for a generic one. All runtime behavior lives in the hook file and in a JSON config; this skill only decides **mode** and **level**, then delegates the file work to the `brewcode:hook-creator` agent following the runbook.

The main loop picks `general-purpose` out of habit while the repo carries a hand-written domain expert that would have done it properly. Tier 1 catches that deterministically, for zero tokens. A deny is returned to the model as a tool error it can act on: the human is never prompted, the turn is not interrupted, and a retry always gets through.

## Prompt contract

Position 1 of `$ARGUMENTS` is a **free-form prompt** (RU/EN) — modes and flags are optional and may
follow in any order. Nobody types keys: resolve mode + scope FROM the prompt.

1. Strip flags. An explicit mode token anywhere wins outright, no scoring.
2. Else score modes by distinct whole-word keyword hits (table in Step 2). Highest unique score
   wins. Tie with a destructive mode (`purge`) -> `AskUserQuestion`; tie with `status` -> `status`;
   tie of two mutating modes -> the keyword appearing first; all zero -> `status`.
3. Empty arguments -> `status`; ask ONE scoping `AskUserQuestion` only when the answer changes
   what gets written. A read-only run asks nothing.
4. Outcome-changing ambiguity -> ONE `AskUserQuestion` (max 4 questions) BEFORE any work.
5. Prose that is not a mode/id/path is still input: extract the id, path or target from it.

Then print this block ONCE, before the first action:

```
PLAN — brewtools:agent-router-setup
INPUT:  <arguments verbatim, or "(empty)">
MODE:   <resolved> — <explicit | matched keyword: X | default>
SCOPE:  <resolved paths / target / level / flags>
DO:     <2-5 imperative bullets>
RESULT: <what the user ends up holding>
```

Labels are literal; values follow the conversation language.

## What the hook does (informational — skill does NOT implement)

| Tier | Registration | Behavior |
|------|--------------|----------|
| **1 — always on** | `{"type":"command","command":"node","args":["${CLAUDE_PROJECT_DIR}/.claude/hooks/agent-router.mjs"],"timeout":5}` (SECONDS — Claude Code has no ms hook field), PreToolUse matcher `Agent` | deterministic, <100 ms incl. node startup, **zero tokens** |
| **2 — OPT-IN (`level strict`)** | `{"type":"agent","prompt":"<inlined judge-prompt.md>","model":"claude-haiku-4-5-20251001","timeout":30,"statusMessage":"agent-router: checking agent fit"}` | an LLM adjudicates the ambiguous picks |

Tier 1 decision order — it allows as early as it can:

| # | Check | Result |
|---|-------|--------|
| 1 | tool is not `Agent` | allow |
| 2 | `agent_id` present — a SUBAGENT issued this spawn | allow; only the main loop is policed |
| 3 | `enabled:false`, or a config file that exists but does not parse | allow |
| 4 | the picked type IS a project agent (`.claude/agents/*.md`) | allow |
| 5 | the picked type is not on `genericTypes` — a specialist or a built-in | allow. An OMITTED `subagent_type` is first normalized to `general-purpose` (the Agent-tool default), so a type-less spawn IS policed; it escapes here only when `general-purpose` was taken off `genericTypes` |
| 6 | `agent-router: override` (also `allow` / `skip`) anywhere in the description or prompt | allow, silently. The user's escape hatch: matched on the UNTRUNCATED text, before any rule runs, and advertised in every deny message |
| 7 | **STRONG** intent rule — an authoring verb aimed at the artifact (skill -> `brewcode:skill-creator`, agent -> `brewcode:agent-creator`, hooks -> `brewcode:hook-creator`, bash/sh -> `brewcode:bash-expert`), and not preceded by `do not` / `never` / `how to` / `instead of` | deny, naming the expert: the first ranked project agent that BOTH scores and **covers** the intent (its own frontmatter matches that rule's `domain` regex), else the plugin specialist. A project agent that outranks everyone but does not cover the intent is **not** the expert — it just had its name in the prompt |
| 8 | score the task against every `.claude/agents/*.md` frontmatter (`name` + `Triggers:`) — each agent scored EXACTLY ONCE, on the text with its OWN NAME struck out, unless it publishes that name among its own `Triggers:` (a declared keyword is earned evidence; a name quoted in the prompt as a config value is not) | one clear winner (`minScore` + `margin` over the runner-up) -> deny naming it; several plausible -> `additionalContext` nudge listing the top 3; nothing -> silent allow. That single ranking decides everything: a lead built only on a quoted name neither denies nor reaches the nudge list, and a quoted name can no longer inflate the RUNNER-UP into suppressing a legitimate deny |
| 9 | **WEAK** intent signal — a bare artifact mention (`SKILL.md`, `.claude/agents/`, `hooks.json`, an event name, a shebang) | **never denies.** If step 8 also nudged, the two are MERGED into ONE message naming both the specialist and the project candidates; otherwise it nudges alone |
| 10 | anti-loop guard | a given (session, project root, task) is denied at most ONCE; the retry is allowed with a nudge instead. `task` is the DESCRIPTION (the prompt's first 300 normalized chars only when there is none), so a retry that rewrites the prompt is no longer denied twice. Trade-off: two descriptionless tasks behind the same boilerplate prompt header share one marker — the guard errs toward allowing |
| 11 | any error | fail open |

`neverFlag` defaults to EIGHT entries — `Explore`, `Plan`, `statusline-setup`, `output-style-setup`, plus the four intent experts from step 7 (`brewcode:agent-creator`, `brewcode:skill-creator`, `brewcode:hook-creator`, `brewcode:bash-expert`) — and they are never flagged: `Explore` is the right tool for search, `Plan` for planning, and a route's own target can never be flagged by the router that routes to it. `normalizeConfig()` also unions `neverFlag` with every configured `intents[].expert` at load time, so a custom `intents` table auto-exempts its own experts.

Config and roster are read from the **owning project root** — `CLAUDE_PROJECT_DIR`, else the nearest ancestor of `cwd` holding `.claude/brewtools/agent-router.json`, else the nearest holding `.git`, else the nearest holding a `.claude` dir, else `cwd` (16 levels per step) — not from `cwd` itself, and fresh on every call. A nested bare `.claude` cannot mask the root that owns the router. A missing `.claude/agents/` is an EMPTY roster, not a failure: the intent rules (step 7) still fire and still redirect to the plugin specialist — only the step-8 scoring goes silent. There is no nudge-threshold config key; the nudge floor is derived as `max(1, ceil(minScore/2))`.

## Honest limits (state these to the user, do not oversell)

| Fact | Consequence |
|------|-------------|
| Claude Code runs ALL hooks matching an event in parallel; no hook can skip another | Tier 2, once installed, fires a small model call on **EVERY** `Agent` spawn. Its own Step-1 fast exit is the only cost control that exists — tier 1 cannot gate it. This is exactly why `level fast` (tier 1 only) is the default and the recommendation. |
| There is no supported signal for "this tool call came from inside a Skill" | Tier 2 can only guess from `transcript_path`, which is written asynchronously and may lag. Tier 1 does not attempt it at all. |
| Tier 1 matches on trigger WORDS, not meaning | It deliberately errs toward allowing: an ambiguous case becomes a nudge, never a block. Intent regexes are English trigger words, split STRONG (authoring wording — may deny) vs WEAK (a bare artifact mention — nudge only). |
| Every failure mode — bad config, unreadable roster, timeout, malformed output | Fails **OPEN**. The spawn goes through; the session never breaks. A config that exists but does not PARSE turns the feature fully off — not a fall-back to defaults. |
| The anti-loop marker lives in `os.tmpdir()` | If that dir is unusable (read-only tmp, foreign-owned `brewtools-agent-router/`, sandbox), **EVERY deny degrades to a non-blocking notice** — a deny that cannot be recorded could repeat forever. The hook keeps advising, it just stops blocking. Tell the user this when they report "it never blocks anything". |
| A deny is not a wall | It is returned to the model as a tool error, the human is never prompted, the anti-loop guard lets the retry through, and every deny text ends with the escape hatch: put `agent-router: override` in the description or prompt and the spawn passes silently. |
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
claude_project_root() {
  if [ -n "$CLAUDE_PROJECT_DIR" ] && [ -d "$CLAUDE_PROJECT_DIR" ]; then
    printf '%s\n' "$CLAUDE_PROJECT_DIR"; return 0
  fi
  d=$PWD
  while [ "$d" != "/" ]; do
    if [ -f "$d/.claude/brewtools/agent-router.json" ]; then printf '%s\n' "$d"; return 0; fi
    d=$(dirname "$d")
  done
  if r=$(git rev-parse --show-toplevel 2>/dev/null) && [ -n "$r" ]; then
    printf '%s\n' "$r"; return 0
  fi
  d=$PWD
  while [ "$d" != "/" ]; do
    if [ -d "$d/.claude" ]; then printf '%s\n' "$d"; return 0; fi
    d=$(dirname "$d")
  done
  printf '%s\n' "$PWD"; return 1
}
if ROOT=$(claude_project_root); then ROOT_OK=yes; else ROOT_OK=no; fi
echo "project_root=$ROOT root_resolved=$ROOT_OK"
D="$ROOT/.claude"
H=no; [ -f "$D/hooks/agent-router.mjs" ] && H=yes
REFS=$(SETTINGS="$D/settings.json" JUDGE="$A/judge-prompt.md" node <<'NODE'
const fs=require("fs");
const f=process.env.SETTINGS, judge=process.env.JUDGE, portable="${CLAUDE_PROJECT_DIR}/.claude/hooks/agent-router.mjs";
let s={};
let settingsValid=true;
try{
  if(fs.existsSync(f)&&fs.readFileSync(f,"utf8").trim()) s=JSON.parse(fs.readFileSync(f,"utf8"));
  if(s===null||typeof s!=="object"||Array.isArray(s)) settingsValid=false;
}catch{ settingsValid=false; s={}; }
const SM="agent-router: checking agent fit", MODEL="claude-haiku-4-5-20251001";
const currentPrompt=fs.readFileSync(judge,"utf8");
const argsOf=h=>Array.isArray(h&&h.args)?h.args.filter(a=>typeof a==="string"):[];
const bodyOf=h=>{ try{return JSON.stringify(h)||"";}catch{return "";} };
const ownsT1=h=>bodyOf(h&&h.args).includes("agent-router.mjs");
const ownsT2=h=>h&&typeof h==="object"&&!Array.isArray(h)&&(h.statusMessage===SM||h.prompt===currentPrompt||(h.model===MODEL&&typeof h.statusMessage==="string"&&h.statusMessage.startsWith("agent-router:")));
const keysAre=(h,keys)=>h&&typeof h==="object"&&!Array.isArray(h)&&Object.keys(h).sort().join(",")===keys;
let tier1=0, legacy=0, tier2=0;
for(const [event,entries] of Object.entries((s&&s.hooks)||{})){
  if(!Array.isArray(entries)) continue;
  for(const entry of entries){
    if(!entry||typeof entry!=="object"||!Array.isArray(entry.hooks)) continue;
    for(const handler of entry.hooks){
      if(ownsT1(handler)){
        const exact=settingsValid&&event==="PreToolUse"&&entry.matcher==="Agent"&&keysAre(handler,"args,command,timeout,type")&&handler.type==="command"&&handler.command==="node"&&argsOf(handler).length===1&&argsOf(handler)[0]===portable&&handler.timeout===5;
        if(exact) tier1+=1; else legacy+=1;
        continue;
      }
      if(ownsT2(handler)){
        const exact=settingsValid&&event==="PreToolUse"&&entry.matcher==="Agent"&&keysAre(handler,"model,prompt,statusMessage,timeout,type")&&handler.type==="agent"&&typeof handler.prompt==="string"&&handler.prompt.trim().length>0&&handler.prompt===currentPrompt&&handler.model===MODEL&&handler.timeout===30&&handler.statusMessage===SM;
        if(exact) tier2+=1; else legacy+=1;
      }
    }
  }
}
console.log(tier1+"|"+legacy+"|"+tier2+"|"+(settingsValid?"yes":"no"));
NODE
)
T1=${REFS%%|*}; REST=${REFS#*|}; LEGACY_T1=${REST%%|*}; REST=${REST#*|}; T2=${REST%%|*}; VALID=${REFS##*|}
CFG=none; [ -s "$D/brewtools/agent-router.json" ] && CFG=$(tr -d '\n ' < "$D/brewtools/agent-router.json"); CFG=${CFG:-none}
EN=n/a; case "$CFG" in *'"enabled":true'*) EN=true;; *'"enabled":false'*) EN=false;; esac
LV=n/a; case "$CFG" in *'"level":"strict"'*) LV=strict;; *'"level":"fast"'*) LV=fast;; esac
CV=$({ jq -r '.version // empty' "$D/brewtools/agent-router.json" 2>/dev/null || true; }); CV=${CV:-n/a}
PV=$({ jq -r '.version // empty' "$BT_ROOT/.claude-plugin/plugin.json" 2>/dev/null || true; }); PV=${PV:-n/a}
cv_of(){ { sed -n '1,3p' "$1" 2>/dev/null || true; } | sed -n 's/.*content_version=\([0-9][0-9]*\.[0-9][0-9]*\.[0-9][0-9]*\).*/\1/p' | head -1; }
HCV=$(cv_of "$D/hooks/agent-router.mjs"); HCV=${HCV:-n/a}          # INSTALLED hook body
TCV=$(cv_of "$A/agent-router.mjs"); TCV=${TCV:-n/a}                # template it was copied from
GCV=$({ jq -r '.content_version // empty' "$D/brewtools/agent-router.json" 2>/dev/null || true; }); GCV=${GCV:-n/a}
RCV=$(cv_of "$A/INSTALL.md"); RCV=${RCV:-n/a}                      # generator logic behind the config
STALE=n/a
if [ "$HCV" != n/a ] && [ "$TCV" != n/a ]; then [ "$HCV" = "$TCV" ] && STALE=no || STALE=yes; fi
if [ "$STALE" != yes ] && [ "$GCV" != n/a ] && [ "$RCV" != n/a ] && [ "$GCV" != "$RCV" ]; then STALE=yes; fi
R=$({ ls "$D/agents/"*.md 2>/dev/null || true; } | wc -l | tr -d ' ')
echo "project: hook_file=$H tier1_refs=$T1 legacy_refs=$LEGACY_T1 tier2_refs=$T2 settings_valid=$VALID enabled=$EN level_recorded=$LV roster=$R"
echo "content_version: hook=$HCV template=$TCV config=$GCV runbook=$RCV stale=$STALE"
echo "version: config=$CV plugin=$PV"
echo "config=$CFG"
echo "✅ status"
```

> **STOP if ❌** — plugin cache incomplete; reinstall/update brewtools first.

Field meanings — do not paraphrase them into something stronger:

| Field | Value |
|-------|-------|
| `project_root` / `root_resolved` | status resolves `CLAUDE_PROJECT_DIR`, then the nearest router ownership marker, then git toplevel, then an owning `.claude` ancestor; `root_resolved=no` means read-only fallback to `$PWD` |
| `hook_file` | `yes`/`no` — `agent-router.mjs` present in `<repo>/.claude/hooks/` |
| `tier1_refs` | exact `PreToolUse` / `Agent` / command / `node` / sole portable `${CLAUDE_PROJECT_DIR}/.claude/hooks/agent-router.mjs` arg / timeout `5` handler count; `1` = wired |
| `legacy_refs` | owned tier-1 or tier-2 handlers that differ from a complete desired tuple, including absolute paths, wrong events/matchers/types/commands/timeouts, extra args/keys, a stale/empty tier-2 prompt, wrong model, or wrong status message; any nonzero value requires `install`/`upgrade` migration |
| `tier2_refs` | exact `PreToolUse` / `Agent` / agent handler / current nonempty inlined `judge-prompt.md` / model `claude-haiku-4-5-20251001` / timeout `30` / exact status message count; `0` = tier 2 off, `1` = tier 2 wired |
| `settings_valid` | `yes` only when settings are absent/empty or parse as a JSON object; malformed JSON/shape is non-effective |
| `enabled` | parsed from the config; `n/a` = no config or no such key |
| `level_recorded` | the `level` VALUE stored in the config. It is a RECORD of an install-time choice, **not** proof of what is wired — nothing keeps it honest. `tier2_refs` is the authority on whether the LLM judge actually fires |
| `content_version` (`hook` / `template` / `config` / `runbook`) | the PRIMARY staleness signal, read from the artifacts themselves: `hook` = the `brewcode-meta:` header of the INSTALLED `.claude/hooks/agent-router.mjs`, `template` = the same header in the plugin's asset copy, `config` = the config's `content_version` key, `runbook` = the header of `assets/INSTALL.md` (the generator behind that config). A difference on either pair -> `stale=yes` -> offer `upgrade`. `n/a` on a side (pre-5.6 artifact, or not installed) = unknown, NOT "current" |
| `version` / `plugin` | the config's `version` key vs the installed brewtools version. INFORMATIONAL only — it names the release that last WROTE the config, bumps on every release even when nothing changed, and any config write (`enable`/`disable` included) re-stamps it to the current plugin while the hook file on disk stays old. Never decide staleness from it |
| `roster` | number of `.claude/agents/*.md` files — **`0` means the hook has nothing to route TO**; say so before installing |

The status probe parses JSON and validates both complete handler shapes. Exact duplicate tier-1 or tier-2 handlers remain visible as counts above `1`; malformed owned handlers increment `legacy_refs`. Both states are non-effective.

Read the output into a state table and PRINT it to the user:

| Hook file | portable tier1 | legacy refs | tier2 wired | settings valid | enabled | level (recorded) | hook cv | template cv | stale | roster |
|-----------|----------------|-------------|-------------|----------------|---------|------------------|---------|-------------|-------|--------|

Effective = `hook_file=yes tier1_refs=1 legacy_refs=0 settings_valid=yes tier2_refs=0|1` and `enabled` is anything but `false` — a MISSING config leaves tier 1 ON with the built-in defaults (`enabled=n/a` is therefore effective, not broken), only exactly `false` turns it off. A count above `1`, a malformed owned handler, or invalid settings is NOT effective. `stale=yes` is still effective, just running OLD logic: say "installed, stale — run `upgrade`".

> **Never print `level` alone as if it were the truth.** Put `tier2_refs` next to it: `level_recorded=strict` with `tier2_refs=0` means the judge is NOT wired, and the config is lying. Report that mismatch explicitly and offer `level strict` (or `level fast`) to reconcile — the config value alone adds and removes nothing.

### Config metadata (the four standard JSON keys)

Every mode that WRITES `agent-router.json` — `install`, `upgrade`, `enable`, `disable` and both `level` operations — writes these four keys alongside the behavior keys. `doc_type` is a `.md`-frontmatter field only and never appears in a JSON carrier:

```json
{ "version": "{PLUGIN_VERSION}", "content_version": "<INSTALL.md header>", "generated_by": "brewtools:agent-router-setup", "last_updated": "{LAST_UPDATED}" }
```

`content_version` is NOT passed in: the runbook's own node blocks read it from the `brewcode-meta:` header of `INSTALL.md` (via `$RUNBOOK`) and ABORT if it is unreadable. Resolve only `version` and `last_updated` here — never hardcode either. **EXECUTE** using Bash tool:

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
| `disable`/`enable` refresh `last_updated` too | Any write to the config is a write; the stamp records when the file was last written, not when it was first installed. It also re-stamps `version` to the CURRENT plugin while copying no files — which is exactly why staleness is judged on the hook file's `content_version`, never on the config's `version` |

### Early exit

If it is already installed the way the user could want it and **the intent is not explicit** (no argument, or vague like "роутер агентов"), PRINT the status, list the operations available (`upgrade`, `enable`, `disable`, `uninstall`, `purge`, `level fast|strict`) and **STOP**. Do not re-install, do not ask a chain of questions.

## Step 2 — Decide MODE

Read `$ARGUMENTS`. Default when there are NO arguments at all = **status**.

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

Ambiguous between install and a removal verb → `AskUserQuestion`. Use `AskUserQuestion` ONLY for genuinely destructive ambiguity — never to guess a mode, and never to ask about scope (there is only one).

## Step 3 — State the plan BEFORE asking anything

Plain text, before any question:

> Current state: agent-router not installed; `.claude/agents/` holds 4 project agents. Plan: copy `agent-router.mjs` into `<repo>/.claude/hooks/`, write `<repo>/.claude/brewtools/agent-router.json` with `level: "fast"`, merge one PreToolUse (`Agent`) entry into `<repo>/.claude/settings.json`. Project scope only. One question first: level.

If `roster=0`, say it before anything else: with no `.claude/agents/*.md` the hook can only ever apply the 4 intent rules — they DO still fire — and step 8's scoring has nothing to score. Offer to stop.

## Step 4 — Ask ONLY what is missing (`AskUserQuestion`)

Skip any question already answered by `$ARGUMENTS` or settled by the status table.

| # | Question | Options | Default |
|---|----------|---------|---------|
| 1 | Level? | **fast — tier 1 only, deterministic, zero tokens (Recommended)** / strict — adds an LLM judge on every Agent spawn | `fast` |

The `strict` option description MUST carry the cost verbatim: *Claude Code runs all matching hooks in parallel and tier 1 cannot gate tier 2, so strict fires a haiku call on EVERY `Agent` spawn — its own fast exit is the only cost control.*

No scope question. No other questions. `disable`/`enable`/`uninstall`/`purge` ask nothing.

## Step 5 — Print the PLAN block, then act

Print the `## Prompt contract` PLAN block, filled with the resolved MODE/SCOPE (exact paths,
exact `level`, the exact settings.json entry) — then proceed. For `uninstall`/`purge` list
exactly which files are deleted and confirm once. Status (early exit or explicit `status` mode)
prints the SAME block, `DO:` reduced to "read state, report", immediately before the table.

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
  ENABLE', 'UNINSTALL', 'PURGE'. Merge = strip owned handlers individually while preserving foreign
  co-handlers, then append exactly one `${CLAUDE_PROJECT_DIR}/.claude/hooks/agent-router.mjs`
  tier-1 handler (idempotent); legacy absolute checkout args are removed, and
  the tier-2 entry is re-derived from LEVEL by inlining ASSETS_DIR/judge-prompt.md.
  Uninstall = strip owned handlers (tier-1 by basename, tier-2 by statusMessage), drop only empty
  entries/event arrays, delete agent-router.mjs, KEEP the config. Purge = uninstall + delete the config +
  delete the tmp markers.
  METADATA: every mode that WRITES the config (install, upgrade, enable, disable, level) must
  leave these four keys in agent-router.json:
  version=\$PLUGIN_VERSION, content_version=<read by the runbook block from the brewcode-meta
  header of \$RUNBOOK — never passed in, never hardcoded>, generated_by=\"brewtools:agent-router-setup\",
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
  and version = \$PLUGIN_VERSION plus a non-empty content_version. For install/upgrade also
  report the content_version of the hook file you COPIED (head -2 of the installed
  .claude/hooks/agent-router.mjs) — status keys staleness on it. Prove the config still
  parses: jq . <config path>.
")
```

## Step 6 — Final status

Re-run the Step 1 status block and print the refreshed table, plus:

- what changed (file, settings.json, config values),
- **a NEW session is required for hook WIRING changes** (install / upgrade / level / uninstall / purge — the tier-2 entry is part of the wiring) — `/reload-plugins` is not needed, this is a plain settings.json hook;
- **config VALUE changes** (`enabled`, `genericTypes`, `neverFlag`, `minScore`, `margin`, `intents`) are read live — no restart. `level` in the config is only a record of what is wired; changing it by hand does NOT add or remove the tier-2 entry, run `level strict` / `level fast` for that. Report it as `level (recorded)` next to `tier2_refs`, never as the wiring itself;
- the `content_version` now on the INSTALLED hook file and in the config, and whether `stale` flipped to `no` — a `version` bump alone proves nothing, only a re-copied hook file clears staleness;
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

Re-install is idempotent, NOT inert: the settings.json merge converges to the same single entry, but the copy runs unconditionally and overwrites `agent-router.mjs` with the current asset — that copy is precisely what repairs a `stale=yes` install, so never talk a user out of it. Scope is PROJECT only — the roster is per-project, so there is nothing to install globally and no scope question to ask.

## Guards

| Condition | Response |
|-----------|----------|
| `BT_ROOT` resolves but `$BT_ROOT/skills/agent-router-setup/assets` missing | ERROR: `agent-router: assets not found under $BT_ROOT — plugin cache incomplete.` STOP. |
| Neither the skill dir nor any cached plugin dir yields `.claude-plugin/plugin.json` | ERROR: `agent-router: cannot locate plugin root — install/update brewtools first.` STOP. |
| Status shows installed + vague intent | Print status, list available operations, STOP. Do not re-install. |
| `stale=yes` (hook `content_version` != template, or config != runbook) | Report it in the SAME breath as "installed": the project is running an OLD hook body. Recommend `upgrade` — it re-copies the file and re-stamps the config. Do NOT read the config's `version` as reassurance; an `enable`/`disable` after a plugin update sets it to the current release without touching the hook file. |
| User asks for a global install | Refuse and explain: the roster is per-project, `~/.claude/*` is protected, and a global hook would route every repo against one repo's agents. Offer the project install. |
| `strict` requested (or asked about) | BEFORE writing anything, state the cost: all matching hooks run in parallel and tier 1 cannot gate tier 2, so a haiku call fires on EVERY `Agent` spawn. Say it in the question or the plan, never only in the final report. |
| `roster=0` (no `.claude/agents/*.md`) | Say it before installing: only the 4 intent rules can ever fire; the scoring step has nothing to score. Offer to stop. |
| Mode ambiguous between install and removal | AskUserQuestion. Never guess a destructive mode. |
| Install/level delegated | The spawn prompt MUST contain the literal `export RUNBOOK='<path>' LEVEL='<chosen>'` line. Values described only in prose never reach the runbook's `process.env`; the blocks then ABORT instead of writing a wrong level. Check the agent's reported config for the chosen level. |
| User wants to add or change an intent route | Warn FIRST: a config `intents` array REPLACES the built-in four wholesale, it does not merge, and the hook gives no warning when three routes vanish. Tell them to copy `DEFAULT_INTENTS` out of `agent-router.mjs` and append. An entry needs `label` + `expert` + `match` (STRONG, may deny) and MAY carry `weakMatch` (bare mentions — nudge only) and `domain` (the noun-only regex deciding which project agent COVERS the intent); omit them and the entry behaves as before, `domain` falling back to `match`\|`weakMatch`. An entry whose `match` does not compile is skipped entirely, weak side included — the rest of the table still runs. Install never writes the key. |
| Existing config is malformed JSON | Report it: the runbook ABORTS rather than overwriting it blind, and the hook fails open (every spawn allowed) until it is fixed. Offer to rewrite. |
| `uninstall`/`purge` requested | Restate exactly what gets deleted, confirm once, then delegate. |
| User reports a spawn being blocked repeatedly | The anti-loop guard denies a given (session, project, task DESCRIPTION) at most once, and the retry passes even when the prompt is rewritten — so a repeat means a DIFFERENT description each time, or tier 2. Collect the deny text and check `tier2_refs`. Immediate unblock: add `agent-router: override` (or `allow` / `skip`) to the task description or prompt — checked before every rule, allows silently. |
| User says a wrong expert was named | Two rules can only fire on coverage, not on score: a STRONG intent deny picks a project agent only if that agent's own frontmatter matches the intent `domain`, and roster scoring strikes each agent's own name out of the text before scoring it (kept only when the agent lists that name in its `Triggers:`). A wrong name therefore means the agent really does describe the domain — fix its `description`/`Triggers:`, or add `domain` to a custom `intents` entry. `agent-router: override` unblocks the spawn meanwhile. |

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
