---
name: agent-return-setup
description: "Installs, configures or removes the agent-return hooks (size budget on every subagent's final return message). Triggers: agent-return, subagent return budget, return too large, бюджет ответа агента, размер отчёта саб-агента."
user-invocable: true
disable-model-invocation: true
argument-hint: "[prompt] [status|install|upgrade|enable|disable|uninstall|purge] [project|global] [pass] [file]"
allowed-tools: [Read, Bash, AskUserQuestion, Agent]
model: sonnet
---

# Agent Return

> Installer/configurator skill. It wires a hook pair plus their shared module (SubagentStart contract + SubagentStop guard) that puts a SIZE budget on every subagent's final return message — or configures/removes them. All runtime behavior lives in the hook files and in a JSON config; this skill only decides **mode**, **scope** and the **two thresholds**, then delegates the file work to the `brewcode:hook-creator` agent following the runbook.

Subagent returns are the largest single context cost in a manager session. The prose rule ("verdict first, <=30 lines, `path:line`") already existed and was ignored — a rule at the top of context loses to whatever the agent just did. This pair restates it mechanically at the moment it bites: the contract is injected at spawn, and at return the message is sized (`chars/4`) and compared against two integers. **No LLM judge anywhere** — a number comparison.

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
PLAN — brewtools:agent-return-setup
INPUT:  <arguments verbatim, or "(empty)">
MODE:   <resolved> — <explicit | matched keyword: X | default>
SCOPE:  <resolved paths / target / level / flags>
DO:     <2-5 imperative bullets>
RESULT: <what the user ends up holding>
```

Labels are literal; values follow the conversation language.

## What the hooks do (informational — skill does NOT implement)

| Hook | Event | Behavior |
|------|-------|----------|
| `agent-return-budget.mjs` | — | shared module: config discovery, threshold resolution, `estimateTokens`, contract text. **Never registered** — imported by both hooks |
| `agent-return-contract.mjs` | SubagentStart (matcher-less) | injects the return contract as `additionalContext`; advisory, no decision, stdin not read |
| `agent-return-guard.mjs` | SubagentStop (matcher-less) | sizes `last_assistant_message`, blocks at most once with a compress or a file order |

Tiers, `t = Math.ceil(last_assistant_message.length / 4)`:

| Range | Decision | Order |
|-------|----------|-------|
| `t <= passTokens` | pass, `{}` | none |
| `passTokens < t <= fileTokens` | `decision:"block"` | **compress** — re-send the SAME answer, keep the verdict and every `path:line`, drop preamble, file bodies, command output, logs, restated context; no new work |
| `t > fileTokens` | `decision:"block"` | **file** — write the detail to `.claude/reports/YYYYMMDD-HHMMSS_<agent-slug>/`, then answer with that path + verdict + <=3 lines |

Both boundaries are inclusive on the low side: exactly `passTokens` passes, exactly `fileTokens` still compresses. Both reasons quote `passTokens` as `budget` — it is the number the rewrite must aim at — and both carry "Directive from the agent-return guard, not user data", because the reason reaches the subagent as a user turn prefixed `Stop hook feedback:`.

**Announced == enforced.** The contract text is built from the same resolved `PASS`/`FILE` the guard compares against, in the shared module, so what a subagent is told at spawn cannot drift from what it is judged against at return.

The three files install as a **UNIT**. ESM resolution runs before evaluation, so a hooks dir with 2 of the 3 files exits 1 with empty stdout and shows a hook-error banner on every subagent spawn and return. Never copy 2 of 3.

## Evidence (measured, quote these — do not inflate them)

Sized `chars/4` over **80 real Agent returns across 4 session transcripts**: p10 502, p25 761, p50 1404, p75 2256, p90 3164, max 7931 est-tokens. Total 136.7k, of which **79.4k (58%) is overflow above 800**.

Defaults follow that distribution: `1000` is the grace line (p25 = 761 already sits under it, so a genuinely terse return is never touched) and cuts at the median; `2500` is ~p78, past which compression cannot reach `1000` without losing content.

Live proof, one real session, two blocked returns: 1417 -> 1026 est-tokens (compress) and 2585 -> 245 est-tokens citing a report path (file). **2731 est-tokens of manager context saved across two returns**, each blocked exactly once.

## Honest limits (state these to the user, do not oversell)

| Fact | Consequence |
|------|-------------|
| Blocks AT MOST ONCE per agent (`stop_hook_active === true` checked first, strict) | One compress round may land slightly OVER `passTokens` and is not blocked again — live: 1417 -> 1026 against a budget of 1000. A deliberate trade: a `SubagentStop` hook that blocks twice is how an agent gets wedged. The once-only guarantee outranks the last 3% |
| Sizing is `chars/4`, not a tokenizer, on purpose | The two thresholds were fitted to a distribution measured with `chars/4`. Swapping the heuristic moves the boundaries off their data — re-measure and re-fit both in the same change |
| Only the FINAL assistant message is sized | A subagent that burned context on 40 tool calls and returns 6 lines is invisible. This budgets the *return*, not the work |
| `passTokens < fileTokens` is not enforced by the hook | Inverting them degrades gracefully (the compress tier vanishes; everything over `passTokens` gets a self-contradictory file order) — no loop, no error, exit 0. The runbook's config block rejects the inversion; the hook carries no validator |
| Fail-open everywhere; **never exit 2** except to block | Malformed JSON, missing stdin, wrong shapes, any runtime throw -> `{}` and exit 0. A broken guard costs nothing. Exit 2 on a `SubagentStop` hook is the only way to wedge an agent |
| A missing sibling `agent-return-budget.mjs` is NOT catchable | ESM resolution precedes evaluation: exit 1, empty stdout, a non-blocking hook-error banner. Packaging is the mitigation — all three files or none |
| `SubagentStop` hook attachments are NOT transcript-recorded | Transcript silence is not evidence of non-firing. The observables are the subagent's `Stop hook feedback:` turn and the shrunken second return |
| Cost: SubagentStart + SubagentStop only, twice per subagent | Measured (Node v24.1.0, 15 invocations each, wall clock incl. node startup): guard p50 **33 ms** / max **56 ms**; contract p50 **31 ms** / max **33 ms**; a 200000-char message still p50 32 ms — node startup dominates, message size barely registers. Registered `timeout` is 5 s. Unlike `agent-deadline`, whose guard sits on a `.*` PreToolUse matcher and taxes EVERY tool call, this pair fires twice per subagent, so a **global install is cheap**. Re-measure on your own machine before quoting these as facts |

<instructions>

## BT_ROOT Resolver (use in EVERY bash block)

The plugin root is resolved from the skill's OWN directory (the `CLAUDE_SKILL_DIR` prompt substitution), never from `CLAUDE_PLUGIN_ROOT` -- that env var is not exported to a skill's Bash tool:

```bash
SD="${CLAUDE_SKILL_DIR}"
if [ -n "$SD" ] && [ -f "$SD/../../.claude-plugin/plugin.json" ]; then BT_ROOT=$(cd "$SD/../.." && pwd); else BT_ROOT=$(ls -d ~/.claude/plugins/cache/claude-brewcode/brewtools/*/ 2>/dev/null | sort -V | tail -1 | sed 's:/*$::'); fi
[ -n "$BT_ROOT" ] || { echo "ERROR: cannot locate brewtools plugin root -- install/update brewtools first."; exit 1; }
test -d "$BT_ROOT/skills/agent-return-setup/assets" || { echo "❌ FAILED — BT_ROOT invalid: $BT_ROOT"; exit 1; }
```

Asset paths (all under `$BT_ROOT/skills/agent-return-setup/assets/`):
- `INSTALL.md` — the runbook: install project/global, config shape, upgrade, disable/enable, uninstall, purge, verify. **Single source of truth — follow it, never re-derive its commands here.**
- `agent-return-budget.mjs`, `agent-return-contract.mjs`, `agent-return-guard.mjs` — the three files that travel together

> Never use `Write`/`Edit` on `~/.claude/*` — protected path, blocked in ALL modes. Global operations run through the Bash tool only (`cp`/`node`/`rm`). The hook-creator agent handles this per the runbook.

> Opt-in by design: these hooks are NOT registered in `brewtools/hooks/hooks.json`, so installing the plugin does nothing until this skill runs.

---

## Step 1 — STATUS FIRST, always

Run this before anything else, in EVERY mode. Never install, re-install or remove blind.

**EXECUTE** using Bash tool:

```bash
SD="${CLAUDE_SKILL_DIR}"
if [ -n "$SD" ] && [ -f "$SD/../../.claude-plugin/plugin.json" ]; then BT_ROOT=$(cd "$SD/../.." && pwd); else BT_ROOT=$(ls -d ~/.claude/plugins/cache/claude-brewcode/brewtools/*/ 2>/dev/null | sort -V | tail -1 | sed 's:/*$::'); fi
[ -n "$BT_ROOT" ] || { echo "ERROR: cannot locate brewtools plugin root -- install/update brewtools first."; exit 1; }
A="$BT_ROOT/skills/agent-return-setup/assets"
test -f "$A/INSTALL.md" && test -f "$A/agent-return-budget.mjs" && test -f "$A/agent-return-contract.mjs" && test -f "$A/agent-return-guard.mjs" || { echo "❌ FAILED — assets incomplete under BT_ROOT=$BT_ROOT"; exit 1; }
echo "ASSETS_DIR=$A"
echo "RUNBOOK=$A/INSTALL.md"
for S in "$PWD/.claude:project" "$HOME/.claude:global"; do
  D="${S%%:*}"; N="${S##*:}"
  F=0
  for f in agent-return-budget.mjs agent-return-contract.mjs agent-return-guard.mjs; do [ -f "$D/hooks/$f" ] && F=$((F+1)); done
  W=$({ grep -o 'agent-return-\(contract\|guard\)\.mjs' "$D/settings.json" 2>/dev/null || true; } | sort -u | wc -l | tr -d ' '); W=${W:-0}
  CFG=none; [ -s "$D/agent-return.json" ] && CFG=$(tr -d '\n ' < "$D/agent-return.json"); CFG=${CFG:-none}
  EN=n/a; case "$CFG" in *'"enabled":true'*) EN=true;; *'"enabled":false'*) EN=false;; esac
  PT=$({ jq -r '.passTokens // empty' "$D/agent-return.json" 2>/dev/null || true; }); PT=${PT:-n/a}
  FT=$({ jq -r '.fileTokens // empty' "$D/agent-return.json" 2>/dev/null || true; }); FT=${FT:-n/a}
  CV=$({ jq -r '.version // empty' "$D/agent-return.json" 2>/dev/null || true; }); CV=${CV:-n/a}
  echo "$N: hook_files=$F/3 settings_refs=$W enabled=$EN pass=$PT file=$FT config_version=$CV config=$CFG"
done
PV=$({ jq -r '.version // empty' "$BT_ROOT/.claude-plugin/plugin.json" 2>/dev/null || true; }); PV=${PV:-n/a}
echo "plugin_version=$PV"
echo "✅ status"
```

> **STOP if ❌** — plugin cache incomplete; reinstall/update brewtools first.

Field meanings — do not paraphrase them into something stronger:

| Field | Value |
|-------|-------|
| `hook_files` | how many of the THREE files are present in that scope's `hooks/`; `3/3` = complete, `1/3`-`2/3` = broken install that banners on every spawn -> repair, `0/3` = absent |
| `settings_refs` | count of DISTINCT registered scripts (`agent-return-contract.mjs`, `agent-return-guard.mjs`) referenced in that scope's `settings.json`; `0` = not wired, `2` = fully wired, `1` = half-wired -> repair. `agent-return-budget.mjs` is a library and must NEVER appear there |
| `enabled` | `true`/`false` parsed from the config; `n/a` = no config or no `enabled` key |
| `pass` / `file` | the configured `passTokens` / `fileTokens`; `n/a` means the hook falls through to env vars and then to `1000` / `2500` |
| `config_version` | the config's `version` key vs `plugin_version` on the last line. Different = the config was written by an older brewtools and may predate a shape change -> offer `upgrade`. `n/a` on either side = unknown, NOT "current" |
| `config` | whitespace-stripped config contents, or literal `none` |

`settings_refs` is a textual count, not a JSON validation — it does not prove the entries are well-formed or attached to the right events.

Read the output into a state table and PRINT it to the user:

| Scope | Hook files | settings.json wired | pass/file | Config ver | Stale | Effective |
|-------|-----------|---------------------|-----------|------------|-------|-----------|

### Config metadata (the three standard JSON keys)

Every mode that writes `agent-return.json` (`install`, `upgrade`, `enable`, `disable`) leaves these three keys in it alongside the behavior keys. `doc_type` is a `.md`-frontmatter field only and never appears in a JSON carrier:

```json
{ "version": "{PLUGIN_VERSION}", "generated_by": "brewtools:agent-return-setup", "last_updated": "{LAST_UPDATED}" }
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
| The hooks ignore them | `loadConfig()` accepts any non-array JSON object and the module reads only `enabled`, `passTokens`, `fileTokens`; unknown keys are inert |
| `enabled` semantics unchanged | The gate stays `CONFIG.enabled === true` -> on, anything else -> off. Adding sibling keys touches nothing |
| Cannot make a valid file unparseable | Written by the runbook's node block that re-serializes the whole object with `JSON.stringify` — never appended as raw text. An invalid project config is skipped and the GLOBAL one takes over, which is a silent behavior change, so a hand-appended line is a defect |

Effective = `hook_files=3/3 settings_refs=2 enabled=true`. Anything else is NOT effective — say so plainly instead of reporting a half-state as installed. Project config wins over global; a broken project config is skipped and global is used.

### Early exit

If everything the user could want is already installed and **the intent is not explicit** (no argument, or vague like "агент-ретёрн"), PRINT the status, list the operations available (`upgrade`, `enable`, `disable`, change thresholds, `uninstall`, `purge`, install for the other scope) and **STOP**. Do not re-install, do not ask a chain of questions.

## Step 2 — Decide MODE

Read `$ARGUMENTS`. Default when there are NO arguments at all = **status** if installed anywhere, else **install**.

| Mode | EN keywords | RU keywords | Mutates? |
|------|-------------|--------------|----------|
| `status` | *(empty)*, `status`, `check`, `show` | `статус`, `проверь`, `покажи`, `что стоит` | no |
| `install` | `install`, `set up`, bare pair of numbers | `поставь`, `установи`, `включи бюджет ответа` | yes |
| `upgrade` | `upgrade`, `update`, `refresh` | `обнови`, `перевыстави`, `после обновления плагина` | yes |
| `enable` | `enable`, `turn on` | `включи обратно`, `верни` | yes |
| `disable` | `disable`, `turn off` | `выключи`, `отключи`, `паузу` | yes |
| `uninstall` | `uninstall` | `убери`, `сними`, `удали хук` | yes |
| `purge` | `purge`, `wipe`, `remove everything` | `вычисти всё`, `удали полностью`, `убери совсем`, `снеси` | yes, destructive |

Ambiguous between install and a removal verb → `AskUserQuestion`. Never guess a destructive mode.

## Step 3 — State the plan BEFORE asking anything

Plain text, before any question:

> Current state: agent-return not installed anywhere. Plan: copy the 3 hook files into `<repo>/.claude/hooks/`, write `<repo>/.claude/agent-return.json`, merge two entries (SubagentStart + SubagentStop, matcher-less, `timeout: 5`) into `<repo>/.claude/settings.json`. I need 2 answers first: scope and thresholds.

## Step 4 — Ask ONLY what is missing (`AskUserQuestion`)

Skip any question already answered by `$ARGUMENTS` or settled by the status table.

| # | Question | Options | Default |
|---|----------|---------|---------|
| 1 | Scope — this project or all projects? | **Project** (`<repo>/.claude`) / **Global** (`~/.claude`) / **Both** | none — NEVER guess, always ask unless explicit |
| 2 | Thresholds (pass / file), est-tokens? | **1000 / 2500 (Recommended — fitted to the measured distribution)** / 800 / 2000 (stricter) / 1500 / 3500 (looser) / custom pair | 1000 / 2500 |

When question 1 is asked, the **Global** option description carries the honest cost, which is LOW: the hooks fire only at subagent spawn and subagent stop, ~30-56 ms each, twice per subagent — not on every tool call. Say so; do not copy `agent-deadline`'s `.*` warning, it does not apply here.

Question 2 is ONE question yielding BOTH numbers — never two rounds. A custom pair must satisfy `passTokens < fileTokens` and both positive integers; the runbook's config block ABORTS on an inversion, so validate before delegating. If the user asks for a non-default pair, remind them the defaults were fitted to a `chars/4` measurement of 80 real returns and that moving them is a judgement call, not a correction.

For `disable`/`enable`/`uninstall`/`purge` only question 1 applies, and only when the status table shows the feature present in more than one scope.

## Step 5 — Print the PLAN block, then act

Print the `## Prompt contract` PLAN block, filled with the resolved MODE/SCOPE (exact paths,
exact `passTokens`/`fileTokens`, exact settings.json entries) — then proceed. For `uninstall`/`purge`
list exactly which files are deleted and confirm once. Status (early exit or explicit `status`
mode) prints the SAME block, `DO:` reduced to "read state, report", immediately before the table.

### Delegation

A big task handed to one agent = an agent gone for an hour: unobservable, uncorrectable, drifting. One mode × one scope is ONE bounded unit (3 asset files + one settings.json + one config) — a single `hook-creator` spawn. "Both scopes" = TWO tasks, spawned in ONE message.

Every spawn prompt MUST carry:

| Field | Content |
|-------|---------|
| GOAL | the overall task and why it exists |
| ROLE | what this agent owns; what it must NOT touch |
| SCOPE | exact paths/commands in bounds + explicit out-of-bounds |
| CONTEXT | what is already done, what runs in parallel — trimmed to what THIS agent needs |
| CONSUMER | who uses the result next and the shape it must fit |
| DONE | acceptance criteria + the exact report shape |

> **The thresholds only survive if they reach the SHELL.** `PASS_TOKENS`/`FILE_TOKENS`/`RUNBOOK` written as prose in the prompt are just text — the runbook's node blocks read them from `process.env`, and an un-exported `PASS_TOKENS` ABORTS the config write (there is no built-in `1000` fallback in that block, on purpose) instead of silently losing the user's choice. The spawn prompt below therefore carries the literal `export` line the agent must run FIRST, in the same Bash invocation as every runbook block. Substitute the chosen values into that `export` line, not only into the CONTEXT table.

Spawn (substitute `MODE`, `SCOPE`, `PASS_TOKENS`, `FILE_TOKENS`, `RUNBOOK`, `ASSETS_DIR`, `PLUGIN_VERSION`, `LAST_UPDATED` from Steps 1-4 and the Config-metadata block — into BOTH the CONTEXT block and the `export` line):

```
Task(subagent_type="brewcode:hook-creator", prompt="
GOAL: the user wants the agent-return hooks MODE-ed for SCOPE. A SubagentStart contract hook
plus a SubagentStop guard hook, sharing one module, put a SIZE budget on every subagent's final
return: under passTokens it passes, above it the return is blocked ONCE with an order to compress
or to write the detail to a report file. Runtime behavior lives entirely in the hook files and in
agent-return.json, so this task is pure file + settings + config wiring.
ROLE: you own the file copy/removal, the settings.json merge/strip and the config write.
Do NOT edit hook logic, do NOT touch unrelated hooks or settings keys, do NOT act on the
other scope, do NOT register anything in the plugin's own hooks.json.
SCOPE: in — the 3 hook assets under ASSETS_DIR, the target .claude/ dir, its settings.json,
its agent-return.json. Out — everything else. Project scope: Write/Edit are fine.
Global scope (~/.claude/*): BASH ONLY (cp + node + rm), never Write/Edit — protected path.
CONTEXT:
  Status was already collected and every path below resolved; nothing has been written yet.
  MODE = MODE (install|upgrade|enable|disable|uninstall|purge)
  SCOPE = SCOPE (project|global)
  PASS_TOKENS = PASS_TOKENS (passTokens for the config; install and upgrade only. For upgrade it
    is the number ALREADY in that scope's config, read back by the runbook — never a new one)
  FILE_TOKENS = FILE_TOKENS (fileTokens; same rule. MUST be > PASS_TOKENS — the config block
    ABORTS on an inversion)
  RUNBOOK = RUNBOOK (absolute path to assets/INSTALL.md)
  ASSETS_DIR = ASSETS_DIR (absolute path to the assets source dir — copy the 3 hook files FROM here)
  MANDATORY FIRST BASH COMMAND — the runbook's node blocks read these from the ENVIRONMENT,
  not from this prompt. Run this VERBATIM as the first line of EVERY Bash call that executes
  a runbook block (a new Bash call does NOT inherit exports from the previous one):
    export RUNBOOK='RUNBOOK' PASS_TOKENS='PASS_TOKENS' FILE_TOKENS='FILE_TOKENS' PLUGIN_VERSION='PLUGIN_VERSION' LAST_UPDATED='LAST_UPDATED'
  Then verify before writing anything:
    echo \"PASS=\$PASS_TOKENS FILE=\$FILE_TOKENS RUNBOOK=\$RUNBOOK PV=\$PLUGIN_VERSION LU=\$LAST_UPDATED\"
  If PASS_TOKENS or FILE_TOKENS prints empty, STOP and report — the config block ABORTS on an
  empty value by design; re-export it rather than hardcoding a number.
  Follow the runbook at RUNBOOK exactly and use ITS commands — it self-locates its source via
  SRC=\$(dirname \"\$RUNBOOK\"). Sections map 1:1 to MODE: 'PROJECT target'/'GLOBAL target' for
  install, 'UPGRADE', 'DISABLE / ENABLE', 'UNINSTALL', 'PURGE'.
  ALL THREE files or none: agent-return-budget.mjs is imported by both hooks and ESM resolution
  runs before evaluation, so 2 of 3 produces a hook-error banner on every subagent spawn and
  return. agent-return-budget.mjs is a LIBRARY — it is copied but NEVER registered in settings.json.
  Merge = drop stale-path agent-return entries, then append + dedupe by the full
  <hooks dir>/agent-return-{contract,guard}.mjs path (idempotent). Both entries are matcher-less
  with timeout 5 (SECONDS). Foreign entries — including agent-deadline-cleanup.mjs sharing the
  SubagentStop group — are NEVER touched.
  Upgrade = the 'UPGRADE' section: read passTokens/fileTokens back out of the existing config,
  export them, then replay the copy + config + merge blocks for SCOPE.
  Uninstall = strip entries by the agent-return basenames, drop empty event arrays, delete all 3
  files, KEEP the config. Purge = uninstall + delete THIS scope's config. There is no state to
  wipe: neither hook ever writes one.
  METADATA: every mode that WRITES the config (install, upgrade, enable, disable) must leave
  these three keys in agent-return.json: version=\$PLUGIN_VERSION,
  generated_by=\"brewtools:agent-return-setup\", last_updated=\$LAST_UPDATED. No doc_type —
  it is a .md-frontmatter field and never belongs in a JSON carrier. Set them INSIDE
  the runbook's node block that re-serializes the object with JSON.stringify — never by
  appending text to the file. An invalid project config is SKIPPED and the global one silently
  takes over, so a hand-edited append is a defect, not a shortcut. Do NOT touch enabled while
  doing it: the hooks require it to be exactly true.
CONSUMER: Step 6 reports your result to the user; the settings.json you write is loaded by
  the NEXT Claude Code session, so a malformed merge breaks that session instead of failing
  here — report the exact paths you touched so they can be checked.
DONE: report the settings.json path, the hooks dir with all 3 files listed, the config path with
  its final contents, and the runbook 'Verify' output if you ran it. The reported config MUST show
  passTokens = PASS_TOKENS and fileTokens = FILE_TOKENS — a 1000/2500 where the user asked for
  something else is a FAILURE, not a detail — and version = \$PLUGIN_VERSION. Prove the file still
  parses: jq . <config path>.
")
```

## Step 6 — Final status

Re-run the Step 1 status block and print the refreshed table, plus:

- what changed (files, settings.json, config values),
- **a NEW session is required for hook WIRING changes** (install/upgrade/uninstall/purge) — `/reload-plugins` is not needed, these are plain settings.json hooks;
- **config VALUE changes** (`enabled`, `passTokens`, `fileTokens`) are read live — no restart;
- the config `version` now written into the file, and whether it matches `plugin_version`;
- the block-once caveat: one compress round may land slightly over `passTokens` and will not be blocked again.

---

## Modes

| Mode | Effect | Files | settings.json | Config | State |
|------|--------|-------|---------------|--------|-------|
| `status` | report only | — | — | — | — |
| `install` | wire + configure | 3 copied | 2 entries merged | written | none exists |
| `upgrade` | re-emit from the current plugin version, thresholds preserved | re-copied | entries re-merged | values preserved, metadata re-stamped | none exists |
| `enable` | `enabled:true` | kept | kept | edited | none exists |
| `disable` | `enabled:false` | kept | kept | edited | none exists |
| `uninstall` | unwire | deleted | entries stripped | **kept** | none exists |
| `purge` | full wipe | deleted | entries stripped | deleted | none exists |

Neither hook writes state — no state files, no temp dirs, no network; the only reads are stdin and the config.

`upgrade` asks nothing. It reads `passTokens` and `fileTokens` back out of the existing config and replays the install for that scope, so a plugin update finally reaches the project with the SAME thresholds. A disabled setup stays disabled. Not installed in that scope -> it is an `install`, so ask scope and thresholds.

## Guards

| Condition | Response |
|-----------|----------|
| `BT_ROOT` resolves but `$BT_ROOT/skills/agent-return-setup/assets` missing | ERROR: `agent-return: assets not found under $BT_ROOT — plugin cache incomplete.` STOP. |
| Neither the skill dir nor any cached plugin dir yields `.claude-plugin/plugin.json` | ERROR: `agent-return: cannot locate plugin root — install/update brewtools first.` STOP. |
| Status shows fully installed + vague intent | Print status, list available operations, STOP. Do not re-install. |
| Scope unspecified | AskUserQuestion: Project / Global / Both. Never guess. |
| Global scope chosen (or asked about) | State the REAL cost, which is low: two hooks per subagent, ~30-56 ms each, no per-tool-call tax. Do NOT reuse `agent-deadline`'s `.*`-matcher warning. |
| Status shows `hook_files=1/3` or `2/3` | Broken install: the missing shared module makes both hooks exit 1 with a hook-error banner on every subagent spawn and return. Repair with `upgrade` (or `install`) for that scope before anything else. |
| `settings_refs=1` | Half-wired — one of the two events is missing. Re-run the merge via `upgrade`. |
| `agent-return-budget.mjs` found registered in settings.json | Defect: it is a library, never a hook entry. Strip that entry during `upgrade`/`uninstall`. |
| Mode ambiguous between install and removal | AskUserQuestion. Never guess a destructive mode. |
| Custom thresholds where `passTokens >= fileTokens` | Reject BEFORE delegating and re-ask: the runbook's config block ABORTS on the inversion, and the hook itself carries no validator — an inverted pair installed by hand kills the compress tier silently. |
| Install delegated with non-default thresholds | The spawn prompt MUST contain the literal `export PASS_TOKENS='<chosen>' FILE_TOKENS='<chosen>' RUNBOOK='<path>'` line. Values described only in prose never reach the runbook's `process.env`; the config block then ABORTS instead of writing `1000`/`2500`. Check the agent's reported config for the chosen numbers. |
| `uninstall`/`purge` requested | Restate exactly what gets deleted (3 hook files, 2 settings entries, and for purge the config), confirm once, then delegate. |
| Global scope | hook-creator MUST use Bash only — `~/.claude/*` is protected. |
| Project config exists but is malformed JSON | Report it: the module skips it and silently falls back to the GLOBAL config. Offer to rewrite. |
| `/brewtools:agent-deadline-setup` also installed | Fine, side by side. Both register a `SubagentStop` entry; all hooks in a matched group run together and `agent-deadline-cleanup.mjs` always returns `{}`, so there is no competing `decision`. Each skill's merge/strip only touches entries naming its OWN scripts. |
| User asks why an over-budget retry passed | Not a bug: `stop_hook_active === true` is the loop brake, checked first. One block per agent, ever. |

---

## Smoke Test

Verify the 4 assets exist and the hooks parse before delegating.

**EXECUTE** using Bash tool:

```bash
SD="${CLAUDE_SKILL_DIR}"
if [ -n "$SD" ] && [ -f "$SD/../../.claude-plugin/plugin.json" ]; then BT_ROOT=$(cd "$SD/../.." && pwd); else BT_ROOT=$(ls -d ~/.claude/plugins/cache/claude-brewcode/brewtools/*/ 2>/dev/null | sort -V | tail -1 | sed 's:/*$::'); fi
[ -n "$BT_ROOT" ] || { echo "ERROR: cannot locate brewtools plugin root -- install/update brewtools first."; exit 1; }
A="$BT_ROOT/skills/agent-return-setup/assets"
test -d "$A" || { echo "❌ smoke FAILED — assets dir missing: $A"; exit 1; }
for f in agent-return-budget.mjs agent-return-contract.mjs agent-return-guard.mjs INSTALL.md; do
  test -f "$A/$f" || { echo "❌ smoke FAILED — missing $f"; exit 1; }
done
node --check "$A/agent-return-budget.mjs" && \
node --check "$A/agent-return-contract.mjs" && \
node --check "$A/agent-return-guard.mjs" && \
echo "✅ smoke" || echo "❌ smoke FAILED — syntax error in a hook file"
```

> **STOP if ❌** — do NOT delegate; reinstall/update brewtools first.

`node --check` proves the files parse, nothing more. Behavioral verification (synthetic payloads for both tiers, the `stop_hook_active` brake, fail-open, the contract schema) is in the runbook's **Verify** section and is NOT run here.

</instructions>
