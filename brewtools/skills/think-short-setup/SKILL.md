---
name: brewtools:think-short-setup
description: "Installs or removes the think-short terse-mode hooks. Triggers: think-short, be terse, terse mode, инжект терс-режим."
user-invocable: true
disable-model-invocation: true
argument-hint: "[status|install|upgrade|enable|disable|uninstall|purge] [project|global] | free-text intent"
allowed-tools: [Read, Bash, AskUserQuestion, Agent]
model: sonnet
---

# Think-Short

> Installer/configurator skill. It wires three self-contained hooks (SessionStart, UserPromptSubmit, PreToolUse:Task) that inject a terse-output prompt — or configures/removes them. No profiles and no project-level config: the only state is the copied `think-short-prompt.md` plus an ephemeral per-session counter in the OS temp dir (`os.tmpdir()/brewtools-think-short/<session_id>.think-short-counter`), auto-pruned. The hooks own all runtime behavior. This skill only decides **mode** and **project vs global**, then delegates the file work to the `brewcode:hook-creator` agent following the runbook.

## What the hooks do (informational — skill does NOT implement)

| Hook | Behavior |
|------|----------|
| SessionStart | inject the full terse prompt + reset the per-session counter |
| UserPromptSubmit | inject the full prompt every 10th user prompt (10/20/30…, not the 1st) |
| PreToolUse:`Task\|Agent` | inject the full terse prompt into spawned subagents (coexistence-safe with other Task hooks) |

All three read `think-short-prompt.md` from their OWN directory and emit `{}` when it cannot be read. There is no `enabled` flag and no config file to add one to — so **`disable` renames the copied prompt to `think-short-prompt.md.disabled`**: the hooks stay wired, find no prompt, and every event becomes a genuine no-op. `enable` renames it back. This is the hooks' existing fail-open path, not new machinery.

> `think-short-prompt.md` is **copied** into the target at install — an existing install keeps its old text forever. After the prompt changes (incl. a brewtools update), run **`upgrade`** on that target to pick it up.

<instructions>

## BT_ROOT Resolver (use in EVERY bash block)

`$CLAUDE_PLUGIN_ROOT` is NOT inherited by the Bash tool in main-conversation slash invocations. Resolve dynamically:

```bash
BT_ROOT="${CLAUDE_PLUGIN_ROOT:-$(ls -d ~/.claude/plugins/cache/claude-brewcode/brewtools/*/ 2>/dev/null | sort -V | tail -1 | sed 's:/*$::')}"
test -d "$BT_ROOT/skills/think-short-setup/assets" || { echo "❌ BT_ROOT invalid: $BT_ROOT"; exit 1; }
```

Asset paths (all under `$BT_ROOT/skills/think-short-setup/assets/`):
- `INSTALL.md` — the runbook: install project/global, upgrade, disable/enable, uninstall, purge. **Single source of truth — follow it, never re-derive its commands here.**
- `think-short-session.mjs`, `think-short-prompt-counter.mjs`, `think-short-task.mjs`, `think-short-prompt.md` — the hook files that travel together

> Never use `Write`/`Edit` on `~/.claude/*` — protected path, blocked in ALL modes. Global operations run through the Bash tool only (`cp` + `node` + `mv` + `rm`). The hook-creator agent handles this per the runbook.

---

## Step 1 — STATUS FIRST, always

Run this before anything else, in EVERY mode. Never install, re-install or remove blind.

**EXECUTE** using Bash tool:

```bash
BT_ROOT="${CLAUDE_PLUGIN_ROOT:-$(ls -d ~/.claude/plugins/cache/claude-brewcode/brewtools/*/ 2>/dev/null | sort -V | tail -1 | sed 's:/*$::')}"
A="$BT_ROOT/skills/think-short-setup/assets"
for f in INSTALL.md think-short-session.mjs think-short-prompt-counter.mjs think-short-task.mjs think-short-prompt.md; do
  test -f "$A/$f" || { echo "❌ FAILED — assets incomplete under BT_ROOT=$BT_ROOT (missing $f)"; exit 1; }
done
echo "ASSETS_DIR=$A"
echo "RUNBOOK=$A/INSTALL.md"
for S in "$PWD/.claude:project" "$HOME/.claude:global"; do
  D="${S%%:*}"; N="${S##*:}"
  F=0
  for f in think-short-session.mjs think-short-prompt-counter.mjs think-short-task.mjs; do
    [ -f "$D/hooks/$f" ] && F=$((F+1))
  done
  W=$({ grep -o 'think-short-[a-z-]*\.mjs' "$D/settings.json" 2>/dev/null || true; } | sort -u | wc -l | tr -d ' '); W=${W:-0}
  P=none
  [ -f "$D/hooks/think-short-prompt.md.disabled" ] && P=disabled
  [ -f "$D/hooks/think-short-prompt.md" ] && P=enabled
  I=n/a
  if [ -f "$D/hooks/think-short-task.mjs" ]; then
    C=$(node "$D/hooks/think-short-task.mjs" --check "$PWD" </dev/null 2>/dev/null || true)
    case "$C" in *'"injects":true'*) I=yes ;; *'"injects":false'*) I=no ;; *) I=unknown ;; esac
  fi
  echo "$N: hook_files=$F/3 settings_refs=$W/3 prompt=$P injects=$I"
done
Y=$({ node "$A/think-short-task.mjs" --check "$PWD" </dev/null 2>/dev/null || true; } | grep -o '"source":"[^"]*"' | sed 's/"source":"//;s/"$//' | paste -sd';' -)
echo "yielded_to=${Y:-none}"
M="${TMPDIR:-/tmp}/brewtools-think-short"
echo "markers=$({ ls "$M" 2>/dev/null || true; } | wc -l | tr -d ' ') dir=$M"
echo "✅ status"
```

> **STOP if ❌** — plugin cache incomplete; reinstall/update brewtools first.

Field meanings — do not paraphrase them into something stronger:

| Field | Value |
|-------|-------|
| `hook_files` | how many of the 3 scripts are present in that scope's `hooks/`; `3/3` = complete, `1/3`-`2/3` = half-installed → repair |
| `settings_refs` | count of DISTINCT `think-short-*.mjs` scripts referenced in that scope's `settings.json`; `0/3` = not wired, `3/3` = fully wired |
| `prompt` | `enabled` = `think-short-prompt.md` present, `disabled` = only the `.disabled` rename is there, `none` = neither (the hooks would no-op even though they are wired) |
| `injects` | `node <that scope's copy>/think-short-task.mjs --check "$PWD"` → `injects`. `yes` = the subagent hook would really prepend the directive. `no` = it is wired and has a prompt but YIELDS. `n/a` = no task hook in that scope. `unknown` = the installed copy answered nothing parseable — it predates `--check`, so run `upgrade` on that scope |
| `yielded_to` | the `yielded_to[].source` paths from the same `--check`, `;`-separated, or `none`. Each is a settings/hooks file registering a FOREIGN `PreToolUse` `Task`/`Agent` hook. Scope-independent — the probe scans project settings, user settings and every plugin `hooks.json` at once |
| `markers` | number of tmp counter files; state only, never affects behavior |

`settings_refs` is a textual count, not a JSON validation — it does not prove the entries are well-formed or attached to the right events.

`injects` covers ONLY `think-short-task.mjs` (the subagent injection). SessionStart and the every-10th-prompt injection never yield and are not measured by it — `injects=no` means subagents get nothing while the main session still gets the directive.

Read the output into a state table and PRINT it to the user:

| Scope | Hook files | settings.json wired | Prompt | Injects | Effective |
|-------|-----------|---------------------|--------|---------|-----------|

Effective = `hook_files=3/3 settings_refs=3/3 prompt=enabled injects=yes`. Anything else is NOT effective — say so plainly instead of reporting a half-state as installed. In particular: `prompt=enabled injects=no` is a **yielding install** — fully wired, injecting nothing into subagents. Name the file(s) from `yielded_to` and offer the options below; do not report it as installed.

### Yield — what to say when `injects=no`

`think-short-task.mjs` rewrites the subagent prompt via `updatedInput`. When ANOTHER `PreToolUse` hook is registered on a matcher that also hits `Task`/`Agent`, and it is not a brewcode-family hook, think-short cannot know what that hook does to the same field — so it emits `{}` and lets the other hook win. This is deliberate, not a bug, and it is announced once per session as a `systemMessage`.

Common causes and the honest answer:

| `yielded_to` names | Say |
|--------------------|-----|
| a project/global `settings.json` | that hook owns `Task`/`Agent`; think-short will not inject into subagents while it is registered. Remove/re-matcher it, or accept subagent injection is off |
| any brewcode/brewtools/brewdoc hook | should NOT happen — family hooks are recognized and coexisted with. Report it as a bug in the family-hook list |
| `none` but `injects=no` | the prompt file is missing or empty in that scope → `upgrade` |

### Early exit

If it is already installed the way the user could want it and **the intent is not explicit** (no argument, or vague like "терс-режим"), PRINT the status, list the operations available (`upgrade`, `enable`, `disable`, `uninstall`, `purge`, install for the other scope) and **STOP**. Do not re-install, do not ask a chain of questions.

## Step 2 — Decide MODE

Read `$ARGUMENTS`. Default when there are NO arguments at all = **status** if anything is installed, **install** if nothing is.

| Mode | Trigger words |
|------|---------------|
| `status` | no args + installed; `status`, `статус`, `проверь`, `что стоит` |
| `install` | no args + nothing installed; `install`, `set up`, `поставь`, `установи` |
| `upgrade` | `upgrade`, `update`, `refresh`, `обнови`, `перевыстави`, `подхвати новый промпт`, `после обновления плагина` |
| `enable` | `enable`, `включи обратно`, `верни` |
| `disable` | `disable`, `выключи`, `отключи`, `паузу` |
| `uninstall` | `uninstall`, `убери`, `сними`, `удали хуки` |
| `purge` | `purge`, `wipe`, `вычисти всё`, `удали полностью`, `снеси`, `remove everything` |

Ambiguous between install and a removal verb → `AskUserQuestion`. Use `AskUserQuestion` ONLY for genuinely destructive ambiguity, never to guess a mode.

## Step 3 — Decide TARGET (project | global)

- Explicit global → `global`: `global`, `глобально`, `for all projects`, `всех проектах`.
- Explicit project → `project`: `project`, `this repo`, `локально`, `здесь`, `этот проект`.
- NOT specified → `AskUserQuestion`: "think-short for this Project or Globally?" (options: **Project** / **Global**). Do not auto-guess.
- Settled by the status table when only ONE scope is installed and the mode is not `install` — do not ask then.

For `uninstall`/`purge` with an unspecified target, ask the same Project/Global question (or offer to clean both if the user says "everywhere").

## Step 4 — State the plan, then delegate

Tell the user plainly what will happen, e.g.:

> Installing think-short hooks (SessionStart + UserPromptSubmit + PreToolUse:Task) into `<repo>/.claude/` and merging `<repo>/.claude/settings.json`.

For `uninstall`/`purge` list exactly which files are deleted and confirm once.

### Delegation

A big task handed to one agent = an agent gone for an hour: you cannot observe it, cannot correct it, and it usually drifts off-target. One mode for ONE target is ONE bounded unit (4 asset files + one settings.json, well under 10 steps) — a single `hook-creator` spawn. A wider request ("install here AND globally AND clean three other repos") MUST be split into N tasks, one per target, all spawned in ONE message.

Every spawn prompt MUST carry:

| Field | Content |
|-------|---------|
| GOAL | the overall task and why it exists — the point beyond the file edit |
| ROLE | what this agent owns; what it must NOT touch |
| SCOPE | exact paths/commands in bounds + explicit out-of-bounds |
| CONTEXT | what is already done, by whom, what runs in parallel — trimmed to what THIS agent needs |
| CONSUMER | who or what uses the result next, and the shape it must fit |
| DONE | acceptance criteria + the exact report shape you want back |

A bare one-line task is never enough. The prompt below is that shape.

> **The runbook path only survives if it reaches the SHELL.** `RUNBOOK` written as prose in the prompt is just text — the runbook's blocks derive their source dir from `$RUNBOOK`, so an un-exported value copies from nowhere. The spawn prompt below therefore carries the literal `export` line the agent must run FIRST, in the same Bash invocation as every runbook block.

Spawn the agent (substitute `MODE`, `TARGET`, `RUNBOOK`, `ASSETS_DIR` from Steps 1-3 — into BOTH the CONTEXT block and the `export` line):

```
Task(subagent_type="brewcode:hook-creator", prompt="
GOAL: the user wants think-short terse-mode hooks MODE-ed for TARGET. Three hooks
(SessionStart, UserPromptSubmit, PreToolUse:Task) inject a terse-output prompt; runtime
behavior lives entirely in the hook files, so this task is pure file + settings wiring.
ROLE: you own the file copy/rename/strip and the settings.json merge. Do NOT edit hook
logic, do NOT touch unrelated hooks or settings keys, do NOT act on the other target.
SCOPE: in — the 4 assets under ASSETS_DIR, the target .claude/ dir, its settings.json.
Out — everything else. Project target: Write/Edit settings.json freely. Global target
(~/.claude/*): BASH ONLY (cp + node merge + mv + rm), never Write/Edit — protected path.
CONTEXT:
  Step 1 already verified the plugin cache and resolved every path below; nothing has been
  copied or merged yet, and no sibling agent is running — you are the only writer.
  MODE = MODE (install|upgrade|enable|disable|uninstall|purge)
  TARGET = TARGET (project|global)
  RUNBOOK = RUNBOOK (absolute path to assets/INSTALL.md)
  ASSETS_DIR = ASSETS_DIR (absolute path to the assets source dir — copy the 4 hook files FROM here)
  MANDATORY FIRST BASH COMMAND — the runbook's blocks read this from the ENVIRONMENT,
  not from this prompt. Run this VERBATIM as the first line of EVERY Bash call that executes
  a runbook block (a new Bash call does NOT inherit exports from the previous one):
    export RUNBOOK='RUNBOOK'
  Then verify before writing anything:
    echo \"RUNBOOK=\$RUNBOOK\"
  Follow the runbook at RUNBOOK exactly — it self-locates its source via SRC=\$(dirname \"\$RUNBOOK\").
  Sections map 1:1 to MODE: 'PROJECT target'/'GLOBAL target' for install, 'UPGRADE',
  'DISABLE / ENABLE', 'UNINSTALL', 'PURGE'.
  Merge = append + dedupe by think-short-*.mjs script path (idempotent).
  Upgrade = re-copy the 4 files + re-merge, PRESERVING a disabled prompt as .disabled.
  Disable/enable = rename think-short-prompt.md <-> think-short-prompt.md.disabled ONLY;
  never touch settings.json or the 3 scripts.
  Uninstall = strip entries by the 3 basenames, drop empty event arrays, delete the 4 files,
  KEEP the tmp markers. Purge = uninstall + delete the tmp marker dir.
CONSUMER: Step 5 reports your result to the user; the settings.json you write is then loaded
  by the NEXT Claude Code session, so a malformed merge breaks that session instead of
  failing here — report the exact path you touched so it can be checked.
DONE: report which hooks were installed/removed/renamed, the exact settings.json path, and
  the final state of think-short-prompt.md (present | .disabled | absent).
")
```

## Step 5 — Final status

Re-run the Step 1 status block and print the refreshed table, plus:

- what changed (files, settings.json, prompt state),
- **a NEW session is required for hook WIRING changes** (install / upgrade / uninstall / purge) — `/reload-plugins` is NOT needed, these are plain settings.json hooks; SessionStart fires on the next `claude` start / `--resume`;
- **`enable`/`disable` take effect immediately** — the hooks re-read the prompt file on every call, no restart;
- for `upgrade`: that the prompt text is what actually changed, since the 3 scripts are usually identical between versions,
- `injects` for the touched scope — if it is still `no`, say plainly that the wiring succeeded and the subagent injection is still yielding to the hook(s) in `yielded_to`.

---

## Modes

| Mode | Effect | Hook files | settings.json | Prompt file | tmp markers |
|------|--------|-----------|---------------|-------------|-------------|
| `status` | report only | — | — | — | — |
| `install` | wire the 3 hooks | copied | entries merged | copied | — |
| `upgrade` | re-emit from the current plugin version | re-copied | entries re-merged | re-copied, disabled state kept | kept |
| `enable` | `.disabled` → `think-short-prompt.md` | kept | kept | renamed back | kept |
| `disable` | `think-short-prompt.md` → `.disabled`; hooks stay wired, become no-ops | kept | kept | renamed away | kept |
| `uninstall` | unwire | deleted | entries stripped | deleted | **kept** |
| `purge` | full wipe | deleted | entries stripped | deleted | deleted |

Re-install is a no-op. One target per run; "both" is two runs.

## Guards

| Condition | Response |
|-----------|----------|
| `BT_ROOT` resolves but `$BT_ROOT/skills/think-short-setup/assets` missing | ERROR: `think-short: assets not found under $BT_ROOT — plugin cache incomplete.` STOP. |
| Neither `$CLAUDE_PLUGIN_ROOT` set nor any cached plugin dir found | ERROR: `think-short: cannot locate plugin root — install/update brewtools first.` STOP. |
| Status shows installed + vague intent | Print status, list available operations, STOP. Do not re-install. |
| Target unspecified | AskUserQuestion: Project / Global. Never guess. |
| Mode ambiguous between install and removal | AskUserQuestion. Never guess a destructive mode. |
| Global target | Hook-creator MUST use Bash only (`cp`/`node`/`mv`/`rm`) — `~/.claude/*` is protected. |
| `enable` asked for but no `.disabled` file exists | Not disabled — say so and stop. If `prompt=none` the install is BROKEN, not disabled: offer `upgrade` to re-copy the prompt. |
| `disable` asked for but `hook_files` is not `3/3` | Nothing effective to disable; report the half-state and offer `upgrade` or `uninstall`. |
| Status shows `injects=no` | Yielding install — wired and enabled, but subagents get nothing. Name every `yielded_to` source and stop; `install`/`upgrade` will NOT fix it, only removing/re-matchering the foreign hook will. |
| Status shows `injects=unknown` | The installed `think-short-task.mjs` is older than the `--check` diagnostic. Offer `upgrade` for that scope, then re-run `status`. |
| User expects `disable` to stop the hooks from RUNNING | It does not: the 3 processes still spawn per event and exit with `{}`. It removes the injection, not the ~50 ms. Say this; offer `uninstall` if the cost is the complaint. |
| `uninstall`/`purge` requested | Restate exactly what gets deleted, confirm once, then delegate. |
| `settings.json` exists but is malformed JSON | Report it: every runbook block ABORTS rather than overwriting it blind, and the `rm` is skipped too so files and settings stay consistent. Offer to fix. |

---

## Smoke Test

Verify the 5 assets exist and the scripts parse before delegating.

**EXECUTE** using Bash tool:

```bash
BT_ROOT="${CLAUDE_PLUGIN_ROOT:-$(ls -d ~/.claude/plugins/cache/claude-brewcode/brewtools/*/ 2>/dev/null | sort -V | tail -1 | sed 's:/*$::')}"
A="$BT_ROOT/skills/think-short-setup/assets"
test -d "$A" || { echo "❌ assets dir missing"; exit 1; }
for f in think-short-session.mjs think-short-prompt-counter.mjs think-short-task.mjs think-short-prompt.md INSTALL.md; do
  test -f "$A/$f" || { echo "❌ missing $f"; exit 1; }
done
test -s "$A/think-short-prompt.md" || { echo "❌ smoke FAILED — think-short-prompt.md is empty (all 3 hooks would no-op)"; exit 1; }
node --check "$A/think-short-session.mjs" && \
node --check "$A/think-short-prompt-counter.mjs" && \
node --check "$A/think-short-task.mjs" && \
echo "✅ smoke" || echo "❌ smoke FAILED"
```

> **STOP if ❌** — do NOT delegate; reinstall/update brewtools first.

`node --check` proves the files parse, nothing more. The full behavioral suite is `tests/run.sh` in the skill dir and is NOT run here.

</instructions>
