---
name: brewtools:think-short
description: "Installs or removes the think-short terse-mode hooks. Triggers: think-short, be terse, terse mode, инжект терс-режим."
argument-hint: "[install|remove] [project|global] | free-text intent"
allowed-tools: Read, Bash, AskUserQuestion, Task
model: sonnet
user-invocable: true
---

# Think-Short

> Install-only skill. It wires three self-contained hooks (SessionStart, UserPromptSubmit, PreToolUse:Task) that inject a terse-output prompt — or removes them. No on/off toggle, no profiles, no project-level config — only an ephemeral per-session counter in the OS temp dir (`os.tmpdir()/brewtools-think-short/<session_id>.think-short-counter`), auto-pruned. The hooks own all runtime behavior. This skill only decides **install vs remove** and **project vs global**, then delegates the file work to the `brewcode:hook-creator` agent following the runbook.

## What the hooks do (informational — skill does NOT implement)

| Hook | Behavior |
|------|----------|
| SessionStart | inject the full terse prompt + reset the per-session counter |
| UserPromptSubmit | inject the full prompt every 10th user prompt (10/20/30…, not the 1st) |
| PreToolUse:`Task\|Agent` | inject the full terse prompt into spawned subagents (coexistence-safe with other Task hooks) |

<instructions>

## BT_ROOT Resolver (use in EVERY bash block)

`$CLAUDE_PLUGIN_ROOT` is NOT inherited by the Bash tool in main-conversation slash invocations. Resolve dynamically:

```bash
BT_ROOT="${CLAUDE_PLUGIN_ROOT:-$(ls -d ~/.claude/plugins/cache/claude-brewcode/brewtools/*/ 2>/dev/null | sort -V | tail -1 | sed 's:/*$::')}"
test -d "$BT_ROOT/skills/think-short/assets" || { echo "❌ BT_ROOT invalid: $BT_ROOT"; exit 1; }
```

Asset paths (all under `$BT_ROOT/skills/think-short/assets/`):
- `INSTALL.md` — full install/remove runbook (project + global + remove)
- `think-short-session.mjs`, `think-short-prompt-counter.mjs`, `think-short-task.mjs`, `family-roots.mjs`, `think-short-prompt.md` — the hook files that travel together (`family-roots.mjs` is imported by `think-short-task.mjs` and MUST be copied alongside it)

> Never use `Write`/`Edit` on `~/.claude/*` — protected path, blocked in ALL modes. Global install/remove runs through the Bash tool only (`cp` + `node` merge). The hook-creator agent handles this per the runbook.

---

## Step 1 — Decide INTENT (install | remove)

Read `$ARGUMENTS`.

- Default = **install**.
- **remove** only if the prompt clearly says so: `remove`, `uninstall`, `delete`, `убери`, `удали`, `выключи`, `сними`, `off`, `disable`.
- Genuinely ambiguous → `AskUserQuestion` (options: **Install** / **Remove**).

## Step 2 — Decide TARGET (project | global)

- Explicit global → `global`: `global`, `глобально`, `for all projects`, `всех проектах`.
- Explicit project → `project`: `project`, `this repo`, `локально`, `здесь`, `этот проект`.
- NOT specified → `AskUserQuestion`: "Install think-short for this Project or Globally?" (options: **Project** / **Global**). Do not auto-guess.

For **remove** with unspecified target, ask the same Project/Global question (or offer to clean both if the user says "everywhere").

## Step 3 — State the plan, then delegate

Tell the user plainly what will happen, e.g.:

> Installing think-short hooks (SessionStart + UserPromptSubmit + PreToolUse:Task) into `<repo>/.claude/` and merging `<repo>/.claude/settings.json`.

Then verify assets and delegate to `brewcode:hook-creator` via the Task tool. Pass it: the chosen **action** (install|remove), the chosen **target** (project|global), the absolute **runbook path**, and the absolute **assets source dir**.

**EXECUTE** using Bash tool (resolve + print the absolute runbook and assets-dir paths to hand off):

```bash
BT_ROOT="${CLAUDE_PLUGIN_ROOT:-$(ls -d ~/.claude/plugins/cache/claude-brewcode/brewtools/*/ 2>/dev/null | sort -V | tail -1 | sed 's:/*$::')}"
test -d "$BT_ROOT/skills/think-short/assets" || { echo "❌ BT_ROOT invalid: $BT_ROOT"; exit 1; }
echo "ASSETS_DIR=$BT_ROOT/skills/think-short/assets"
echo "RUNBOOK=$BT_ROOT/skills/think-short/assets/INSTALL.md" && echo "✅ assets ok" || echo "❌ FAILED"
```

> **STOP if ❌** — plugin cache incomplete; reinstall/update brewtools first.

Spawn the agent (substitute `ACTION`, `TARGET`, `RUNBOOK`, `ASSETS_DIR` from above):

```
Task(subagent_type="brewcode:hook-creator", prompt="
Follow the runbook at RUNBOOK exactly — it self-locates its source via SRC=\$(dirname \"\$RUNBOOK\").
ACTION = ACTION (install|remove)
TARGET = TARGET (project|global)
RUNBOOK = RUNBOOK (absolute path to assets/INSTALL.md)
ASSETS_DIR = ASSETS_DIR (absolute path to the assets source dir — copy the 4 hook files FROM here)
Copy/merge or strip the 4 think-short hook assets per the runbook's marker convention, copying from ASSETS_DIR.
Project target: Write/Edit settings.json freely. Global target (~/.claude/*): BASH ONLY (cp + node merge), never Write/Edit — protected path.
Merge = append + dedupe by think-short-*.mjs script path. Remove = strip entries by those markers, drop empty event arrays, delete the 4 files.
Report which hooks were installed/removed and the exact settings.json path.
")
```

## Step 4 — Report

After hook-creator returns, report:
- which hooks were installed/removed,
- the exact `settings.json` that changed (project or global path),
- reminder: **a new session picks them up automatically — no `/reload` needed** (plain settings.json hooks; SessionStart fires on next `claude` start / `--resume`).

---

## Guards

| Condition | Response |
|-----------|----------|
| `BT_ROOT` resolves but `$BT_ROOT/skills/think-short/assets` missing | ERROR: `think-short: assets not found under $BT_ROOT — plugin cache incomplete.` STOP. |
| Neither `$CLAUDE_PLUGIN_ROOT` set nor any cached plugin dir found | ERROR: `think-short: cannot locate plugin root — install/update brewtools first.` STOP. |
| Intent ambiguous | AskUserQuestion: Install / Remove. |
| Target unspecified | AskUserQuestion: Project / Global. |
| Global target | Hook-creator MUST use Bash only (`cp` + `node` merge) — `~/.claude/*` is protected. |

---

## Smoke Test

Verify the 4 assets exist and the scripts parse before delegating:

```bash
BT_ROOT="${CLAUDE_PLUGIN_ROOT:-$(ls -d ~/.claude/plugins/cache/claude-brewcode/brewtools/*/ 2>/dev/null | sort -V | tail -1 | sed 's:/*$::')}"
A="$BT_ROOT/skills/think-short/assets"
test -d "$A" || { echo "❌ assets dir missing"; exit 1; }
for f in think-short-session.mjs think-short-prompt-counter.mjs think-short-task.mjs family-roots.mjs think-short-prompt.md INSTALL.md; do
  test -f "$A/$f" || { echo "❌ missing $f"; exit 1; }
done
node --check "$A/think-short-session.mjs" && \
node --check "$A/think-short-prompt-counter.mjs" && \
node --check "$A/think-short-task.mjs" && \
node --check "$A/family-roots.mjs" && \
echo "✅ smoke" || echo "❌ smoke FAILED"
```

Expected: `✅ smoke`.

</instructions>
