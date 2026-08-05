---
name: brewtools:agent-deadline
description: "Installs, configures or removes the agent-deadline hooks (soft wall-clock budget for subagents). Triggers: agent-deadline, subagent timeout, agent time limit, дедлайн агента, таймаут саб-агента."
argument-hint: "[status|install|disable|enable|uninstall|purge] [project|global] [minutes] | free-text intent"
allowed-tools: Read, Bash, AskUserQuestion, Task
model: sonnet
user-invocable: true
disable-model-invocation: true
---

# Agent Deadline

> Installer/configurator skill. It wires two self-contained hooks (PreToolUse guard + SubagentStop cleanup) that put a SOFT wall-clock budget on every subagent — or configures/removes them. All runtime behavior lives in the hook files and in a JSON config; this skill only decides **mode**, **scope** and **budget**, then delegates the file work to the `brewcode:hook-creator` agent following the runbook.

Claude Code has NO wall-clock timeout for subagents, and `maxTurns` kills the agent and discards its final report. These hooks kill nothing — at 80% of the budget the agent gets one non-blocking "wrap up" directive, and past 100% every tool except the finalization set is denied, so the agent is FORCED to write its report instead of losing it.

## What the hooks do (informational — skill does NOT implement)

| Hook | Event | Behavior |
|------|-------|----------|
| `agent-deadline-guard.mjs` | PreToolUse (`.*`) | tracks elapsed per `agent_id`; 80% -> one `additionalContext` warning; 100% -> `permissionDecision:"deny"` for everything outside the finalization set; `hardStopRatio`x budget (default 2x) -> allowance shrinks to `Write, Edit` |
| `agent-deadline-cleanup.mjs` | SubagentStop | deletes the finished agent's state file |

Finalization set — advertised in the guard's directives: `Read, Write, Edit, MultiEdit, NotebookEdit, TodoWrite, TaskUpdate`.

Actually allowed past 100%: those 7 **plus** `TaskCreate`, `BashOutput`, `TaskOutput`. The 3 extras are deliberately NOT named in the directive text — naming `BashOutput` invites a poll loop, while an agent that genuinely needs to harvest an in-flight job still gets through. Declared list ⊂ real list is by design, not a bug.

`AskUserQuestion` is DENIED on purpose: a subagent parked on a human answer is unbounded wall-clock time, exactly the failure this guard exists to stop.

**Hard stop.** Past `hardStopRatio` x budget (config key, default `2`, must be `>1`) the allow-set shrinks from the finalize set to `Write, Edit` only, and the deny reason changes to `AGENT DEADLINE HARD STOP`. This catches the agent that loops *inside* the finalize set (re-reading files, rewriting todos) instead of finishing.

## Honest limits (verified on CC 2.1.220 — state these to the user, do not oversell)

| Fact | Consequence |
|------|-------------|
| Time is sampled ONLY at tool-call boundaries | An agent stuck inside one 25-min `Bash` call is not observed in between. This is a soft deadline, NOT a timeout — cap long commands with `BASH_MAX_TIMEOUT_MS`. |
| Clock starts at the agent's FIRST tool call, not at spawn | Pre-tool thinking time is free. |
| The subagent-spawn tool is named `Agent` in the payload, not `Task` | Matters when matching payloads / writing sibling hooks. |
| Main session vs subagent is discriminated by absence of `agent_id`/`agent_type` | Main session = no-op, always. |
| `agent_type` for plugin agents (`brewtools:text-optimizer` vs `text-optimizer`) was NOT observed live | A `byAgentType` key that does not match the real payload value silently falls back to `defaultMinutes`. Verify against a real payload before relying on an override. |
| Hook is fail-open | Any error = the call passes through; the session never breaks. |
| Cost per tool call: median **58.3 ms**, p90 **62.5 ms** (measured: Apple M-series, Node v24.1.0, 30 runs) | Node startup dominates; on top of it the guard does up to 19 `readFileSync` — stdin payload, up to 16 project-config probes (walk from `cwd` to the filesystem root), global config, state file. |
| The PreToolUse matcher is `.*` | The tax is paid by EVERY tool call, not only subagent ones. The main-session no-op path measured **61.5 ms**. A **global** install therefore charges ~60 ms to every tool call of every session in every repo, including sessions that never spawn a subagent. State this before installing globally, not after. |

<instructions>

## BT_ROOT Resolver (use in EVERY bash block)

`$CLAUDE_PLUGIN_ROOT` is NOT inherited by the Bash tool in main-conversation slash invocations. Resolve dynamically:

```bash
BT_ROOT="${CLAUDE_PLUGIN_ROOT:-$(ls -d ~/.claude/plugins/cache/claude-brewcode/brewtools/*/ 2>/dev/null | sort -V | tail -1 | sed 's:/*$::')}"
test -d "$BT_ROOT/skills/agent-deadline/assets" || { echo "❌ FAILED — BT_ROOT invalid: $BT_ROOT"; exit 1; }
```

Asset paths (all under `$BT_ROOT/skills/agent-deadline/assets/`):
- `INSTALL.md` — the runbook: install project/global, config shape, disable/enable, uninstall, purge, verify. **Single source of truth — follow it, never re-derive its commands here.**
- `agent-deadline-guard.mjs`, `agent-deadline-cleanup.mjs` — the two hook files that travel together

> Never use `Write`/`Edit` on `~/.claude/*` — protected path, blocked in ALL modes. Global operations run through the Bash tool only (`cp`/`node`/`rm`). The hook-creator agent handles this per the runbook.

> Opt-in by design: these hooks are NOT registered in `brewtools/hooks/hooks.json`, so installing the plugin does nothing until this skill runs.

---

## Step 1 — STATUS FIRST, always

Run this before anything else, in EVERY mode. Never install, re-install or remove blind.

**EXECUTE** using Bash tool:

```bash
BT_ROOT="${CLAUDE_PLUGIN_ROOT:-$(ls -d ~/.claude/plugins/cache/claude-brewcode/brewtools/*/ 2>/dev/null | sort -V | tail -1 | sed 's:/*$::')}"
A="$BT_ROOT/skills/agent-deadline/assets"
test -f "$A/INSTALL.md" && test -f "$A/agent-deadline-guard.mjs" && test -f "$A/agent-deadline-cleanup.mjs" || { echo "❌ FAILED — assets incomplete under BT_ROOT=$BT_ROOT"; exit 1; }
echo "ASSETS_DIR=$A"
echo "RUNBOOK=$A/INSTALL.md"
for S in "$PWD/.claude:project" "$HOME/.claude:global"; do
  D="${S%%:*}"; N="${S##*:}"
  G=no; [ -f "$D/hooks/agent-deadline-guard.mjs" ] && G=yes
  C=no; [ -f "$D/hooks/agent-deadline-cleanup.mjs" ] && C=yes
  W=$({ grep -o 'agent-deadline-[a-z]*\.mjs' "$D/settings.json" 2>/dev/null || true; } | sort -u | wc -l | tr -d ' '); W=${W:-0}
  CFG=none; [ -s "$D/agent-deadline.json" ] && CFG=$(tr -d '\n ' < "$D/agent-deadline.json"); CFG=${CFG:-none}
  EN=n/a; case "$CFG" in *'"enabled":true'*) EN=true;; *'"enabled":false'*) EN=false;; esac
  echo "$N: guard=$G cleanup=$C settings_refs=$W enabled=$EN config=$CFG"
done
echo "✅ status"
```

> **STOP if ❌** — plugin cache incomplete; reinstall/update brewtools first.

Field meanings — do not paraphrase them into something stronger:

| Field | Value |
|-------|-------|
| `guard` / `cleanup` | `yes`/`no` — hook FILE present in that scope's `hooks/` |
| `settings_refs` | count of DISTINCT `agent-deadline-*.mjs` scripts referenced in that scope's `settings.json`; `0` = not wired, `2` = fully wired, `1` = half-wired → repair |
| `enabled` | `true`/`false` parsed from the config; `n/a` = no config or no `enabled` key |
| `config` | whitespace-stripped config contents, or literal `none` |

`settings_refs` is a textual count, not a JSON validation — it does not prove the entries are well-formed or attached to the right events.

Read the output into a state table and PRINT it to the user:

| Scope | Hook files | settings.json wired | Config | Effective |
|-------|-----------|---------------------|--------|-----------|

Effective = `guard=yes cleanup=yes settings_refs=2 enabled=true`. Anything else is NOT effective — say so plainly instead of reporting a half-state as installed. Project config wins over global; a broken project config is skipped and global is used.

### Early exit

If everything the user could want is already installed and **the intent is not explicit** (no argument, or vague like "агент-дедлайн"), PRINT the status, list the operations available (`disable`, `enable`, change budget, `uninstall`, `purge`, install for the other scope) and **STOP**. Do not re-install, do not ask a chain of questions.

## Step 2 — Decide MODE

Read `$ARGUMENTS`. Default when there are NO arguments at all = **status**.

| Mode | Trigger words |
|------|---------------|
| `status` | no args; `status`, `статус`, `проверь`, `что стоит` |
| `install` | `install`, `set up`, `поставь`, `установи`, `включи дедлайн`, or a bare number of minutes |
| `disable` | `disable`, `off`, `выключи`, `отключи`, `паузу` |
| `enable` | `enable`, `on`, `включи обратно`, `верни` |
| `uninstall` | `uninstall`, `remove`, `убери`, `сними`, `удали хук` |
| `purge` | `purge`, `wipe`, `вычисти всё`, `удали полностью`, `убери совсем`, `снеси`, `remove everything` |

Ambiguous between install and a removal verb → `AskUserQuestion`. Never guess a destructive mode.

## Step 3 — State the plan BEFORE asking anything

Plain text, before any question:

> Current state: agent-deadline not installed anywhere. Plan: copy the 2 hook files into `<repo>/.claude/hooks/`, write `<repo>/.claude/agent-deadline.json`, merge two entries (PreToolUse + SubagentStop) into `<repo>/.claude/settings.json`. I need 2 answers first: scope and budget.

## Step 4 — Ask ONLY what is missing (`AskUserQuestion`)

Skip any question already answered by `$ARGUMENTS` or settled by the status table.

| # | Question | Options | Default |
|---|----------|---------|---------|
| 1 | Scope — this project or all projects? | **Project** (`<repo>/.claude`) / **Global** (`~/.claude`) / **Both** | none — NEVER guess, always ask unless explicit |
| 2 | Deadline budget per subagent? | **20 min (Recommended)** / 30 min / 45 min / 10 min | 20 |
| 3 | Per-agent-type overrides? | **Uniform limit for all agents (Recommended)** / Define overrides | uniform, `byAgentType: {}` |

When question 1 is asked, the **Global** option description MUST carry the cost: `.*` matcher = ~58 ms median added to every tool call of every session, main sessions included.

Question 3 is asked ONLY if the user brought up per-type limits themselves; otherwise install uniform and mention in the final report that overrides exist. If overrides ARE requested, warn verbatim: *`agent_type` for plugin agents (e.g. `brewtools:text-optimizer` vs `text-optimizer`) has not been observed live — a key that does not match the real payload silently falls back to `defaultMinutes`. Verify against a real payload first.*

For `disable`/`enable`/`uninstall`/`purge` only question 1 applies, and only when the status table shows the feature present in more than one scope.

## Step 5 — State the FINAL plan, then act

Restate concretely what will be written and where — exact paths, exact `defaultMinutes`, exact settings.json entries — then proceed. For `uninstall`/`purge` list exactly which files are deleted and confirm once.

### Delegation

A big task handed to one agent = an agent gone for an hour: unobservable, uncorrectable, drifting. One mode × one scope is ONE bounded unit (2 asset files + one settings.json + one config) — a single `hook-creator` spawn. "Both scopes" = TWO tasks, spawned in ONE message.

Every spawn prompt MUST carry:

| Field | Content |
|-------|---------|
| GOAL | the overall task and why it exists |
| ROLE | what this agent owns; what it must NOT touch |
| SCOPE | exact paths/commands in bounds + explicit out-of-bounds |
| CONTEXT | what is already done, what runs in parallel — trimmed to what THIS agent needs |
| CONSUMER | who uses the result next and the shape it must fit |
| DONE | acceptance criteria + the exact report shape |

> **The budget only survives if it reaches the SHELL.** `MINUTES`/`OVERRIDES`/`RUNBOOK` written as prose in the prompt are just text — the runbook's node blocks read them from `process.env`, and an un-exported `MINUTES` now ABORTS the config write (no built-in `20` fallback) instead of silently losing the user's choice. The spawn prompt below therefore carries the literal `export` line the agent must run FIRST, in the same Bash invocation as every runbook block. Substitute the chosen values into that `export` line, not only into the CONTEXT table.

Spawn (substitute `MODE`, `SCOPE`, `MINUTES`, `OVERRIDES`, `HARD_STOP_RATIO`, `RUNBOOK`, `ASSETS_DIR` from Steps 1-4 — into BOTH the CONTEXT block and the `export` line):

```
Task(subagent_type="brewcode:hook-creator", prompt="
GOAL: the user wants the agent-deadline hooks MODE-ed for SCOPE. Two hooks (PreToolUse
guard + SubagentStop cleanup) impose a soft wall-clock budget on subagents: warn at 80%,
deny non-finalization tools past 100%. Runtime behavior lives entirely in the hook files
and in agent-deadline.json, so this task is pure file + settings + config wiring.
ROLE: you own the file copy/removal, the settings.json merge/strip and the config write.
Do NOT edit hook logic, do NOT touch unrelated hooks or settings keys, do NOT act on the
other scope, do NOT register anything in the plugin's own hooks.json.
SCOPE: in — the 2 assets under ASSETS_DIR, the target .claude/ dir, its settings.json,
its agent-deadline.json. Out — everything else. Project scope: Write/Edit are fine.
Global scope (~/.claude/*): BASH ONLY (cp + node + rm), never Write/Edit — protected path.
CONTEXT:
  Status was already collected and every path below resolved; nothing has been written yet.
  MODE = MODE (install|disable|enable|uninstall|purge)
  SCOPE = SCOPE (project|global)
  MINUTES = MINUTES (defaultMinutes for the config; install only)
  OVERRIDES = OVERRIDES (byAgentType JSON object, {} unless the user asked otherwise)
  HARD_STOP_RATIO = HARD_STOP_RATIO (multiple of the budget after which the allowance
    shrinks to Write/Edit; omit entirely to keep the hook default of 2, must be > 1)
  RUNBOOK = RUNBOOK (absolute path to assets/INSTALL.md)
  ASSETS_DIR = ASSETS_DIR (absolute path to the assets source dir — copy the 2 hook files FROM here)
  MANDATORY FIRST BASH COMMAND — the runbook's node blocks read these from the ENVIRONMENT,
  not from this prompt. Run this VERBATIM as the first line of EVERY Bash call that executes
  a runbook block (a new Bash call does NOT inherit exports from the previous one):
    export RUNBOOK='RUNBOOK' MINUTES='MINUTES' OVERRIDES='OVERRIDES' HARD_STOP_RATIO='HARD_STOP_RATIO'
  Then verify before writing anything:
    echo \"MINUTES=\$MINUTES OVERRIDES=\$OVERRIDES HARD_STOP_RATIO=\$HARD_STOP_RATIO RUNBOOK=\$RUNBOOK\"
  If MINUTES prints empty, STOP and report — the config block ABORTS on an empty MINUTES
  by design; re-export it rather than hardcoding a number.
  Drop HARD_STOP_RATIO from the export line when the user did not set it.
  Follow the runbook at RUNBOOK exactly and use ITS commands — it self-locates its source via
  SRC=\$(dirname \"\$RUNBOOK\"). Sections map 1:1
  to MODE: 'PROJECT target'/'GLOBAL target' for install, 'DISABLE / ENABLE', 'UNINSTALL',
  'PURGE'. Merge = append + dedupe by agent-deadline-*.mjs script path (idempotent).
  Uninstall = strip entries by those two basenames, drop empty event arrays, delete the 2
  files, KEEP the config. Purge = uninstall + delete config + tmp state.
CONSUMER: Step 6 reports your result to the user; the settings.json you write is loaded by
  the NEXT Claude Code session, so a malformed merge breaks that session instead of failing
  here — report the exact paths you touched so they can be checked.
DONE: report the settings.json path, the hooks dir, the config path with its final contents,
  and the runbook 'Verify' output if you ran it. The reported config MUST show
  defaultMinutes = MINUTES — a 20 where the user asked for something else is a FAILURE,
  not a detail.
")
```

## Step 6 — Final status

Re-run the Step 1 status block and print the refreshed table, plus:

- what changed (files, settings.json, config values),
- **a NEW session is required for hook WIRING changes** (install/uninstall/purge) — `/reload-plugins` is not needed, these are plain settings.json hooks;
- **config VALUE changes** (`enabled`, `defaultMinutes`, `byAgentType`, `hardStopRatio`) are read live — no restart;
- the soft-deadline caveat: time is sampled at tool-call boundaries only; pair with `BASH_MAX_TIMEOUT_MS` for long single commands.

---

## Modes

| Mode | Effect | Files | settings.json | Config | State |
|------|--------|-------|---------------|--------|-------|
| `status` | report only | — | — | — | — |
| `install` | wire + configure | copied | entries merged | written | — |
| `disable` | `enabled:false` | kept | kept | edited | kept |
| `enable` | `enabled:true` | kept | kept | edited | kept |
| `uninstall` | unwire | deleted | entries stripped | **kept** | kept |
| `purge` | full wipe | deleted | entries stripped | deleted | deleted |

## Guards

| Condition | Response |
|-----------|----------|
| `BT_ROOT` resolves but `$BT_ROOT/skills/agent-deadline/assets` missing | ERROR: `agent-deadline: assets not found under $BT_ROOT — plugin cache incomplete.` STOP. |
| Neither `$CLAUDE_PLUGIN_ROOT` set nor any cached plugin dir found | ERROR: `agent-deadline: cannot locate plugin root — install/update brewtools first.` STOP. |
| Status shows fully installed + vague intent | Print status, list available operations, STOP. Do not re-install. |
| Scope unspecified | AskUserQuestion: Project / Global / Both. Never guess. |
| Global scope chosen (or asked about) | BEFORE writing anything, state the cost: matcher is `.*`, so ~58 ms median (p90 62.5 ms) is added to EVERY tool call of EVERY session in EVERY repo, main sessions included. Say it in the question or the plan, never only in the final report. |
| Mode ambiguous between install and removal | AskUserQuestion. Never guess a destructive mode. |
| Install delegated with a non-default budget | The spawn prompt MUST contain the literal `export MINUTES='<chosen>' OVERRIDES='<chosen>' RUNBOOK='<path>'` line. Values described only in prose never reach the runbook's `process.env`; the config block then ABORTS on an empty `MINUTES` instead of writing `20`. Check the agent's reported config for the chosen number. |
| `uninstall`/`purge` requested | Restate exactly what gets deleted, confirm once, then delegate. |
| Global scope | hook-creator MUST use Bash only — `~/.claude/*` is protected. |
| Project config exists but is malformed JSON | Report it: the guard skips it and silently falls back to the GLOBAL config. Offer to rewrite. |
| User asks for `byAgentType` overrides | Warn that plugin-scoped `agent_type` values are unverified and a mismatch falls back to `defaultMinutes`. |

---

## Smoke Test

Verify the 3 assets exist and the hooks parse before delegating.

**EXECUTE** using Bash tool:

```bash
BT_ROOT="${CLAUDE_PLUGIN_ROOT:-$(ls -d ~/.claude/plugins/cache/claude-brewcode/brewtools/*/ 2>/dev/null | sort -V | tail -1 | sed 's:/*$::')}"
A="$BT_ROOT/skills/agent-deadline/assets"
test -d "$A" || { echo "❌ smoke FAILED — assets dir missing: $A"; exit 1; }
for f in agent-deadline-guard.mjs agent-deadline-cleanup.mjs INSTALL.md; do
  test -f "$A/$f" || { echo "❌ smoke FAILED — missing $f"; exit 1; }
done
node --check "$A/agent-deadline-guard.mjs" && \
node --check "$A/agent-deadline-cleanup.mjs" && \
echo "✅ smoke" || echo "❌ smoke FAILED — syntax error in a hook file"
```

> **STOP if ❌** — do NOT delegate; reinstall/update brewtools first.

`node --check` proves the files parse, nothing more. Behavioral verification (synthetic payloads, forced deadline) is in the runbook's **Verify** section and is NOT run here.

</instructions>
