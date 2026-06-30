---
name: brewcode:grepai
description: Manages grepai semantic search (setup, status, start, stop, reindex, optimize, upgrade).
disable-model-invocation: true
argument-hint: "[setup|status|start|stop|reindex|optimize|upgrade]"
allowed-tools: Read, Write, Edit, Bash, Task, AskUserQuestion
model: sonnet
---

# grepai Skill

> **Environment:** Ollama + bge-m3 | GOB storage | Java/Kotlin/JS/TS

<instructions>

## Mode Detection

### Step 1: Detect Mode (MANDATORY FIRST STEP)

**EXECUTE** using Bash tool — detect mode from skill arguments:
```bash
bash "${CLAUDE_SKILL_DIR}/scripts/detect-mode.sh" "$ARGUMENTS"
```

Use `$ARGUMENTS` directly - it contains the skill invocation arguments.

Output format:
```
ARGS: [arguments received]
MODE: [detected mode]
```

**Use the MODE value and GOTO that section below.**

### Mode Reference

| Keyword in args | MODE |
|-----------------|------|
| upgrade, апгрейд | upgrade |
| optimize, update, улучши, обнови | optimize |
| stop, halt, kill | stop |
| start, watch | start |
| status, doctor, check, health | status |
| setup, configure, init | setup |
| reindex, rebuild, refresh | reindex |
| (empty) + .grepai/ exists | start |
| (empty) + no .grepai/ | setup |
| (unrecognized text) | prompt |

> **Prerequisites:** Homebrew, Ollama, the bge-m3 model, and the grepai CLI. The `setup` mode below runs `infra-check.sh` to verify them and, if anything is missing, offers to auto-install everything via `scripts/install.sh` (after confirmation).

---

## Mode: setup

Full grepai installation and project setup.

### Phase 1: Infrastructure Check & Auto-Install

**EXECUTE** using Bash tool:
```bash
bash "${CLAUDE_SKILL_DIR}/scripts/infra-check.sh" && echo "✅ infra-check" || echo "⚠️ infra-check: prerequisites missing"
```

- Printed `✅ infra-check` (all present) -> skip to Phase 2.
- Printed `⚠️ infra-check: prerequisites missing` -> continue to auto-install below.

#### Offer Auto-Install

> `scripts/install.sh` installs every missing prerequisite via Homebrew: brew, coreutils + `timeout` symlink, jq, ollama (+ service start), the bge-m3 embedding model, and the grepai CLI. It is idempotent — already-installed components are skipped.

**ASK** (AskUserQuestion): "grepai prerequisites are missing. Auto-install them now? This creates a `timeout` symlink (coreutils) and downloads the grepai CLI + bge-m3 model (~1.5GB)."
Options: "Yes, install" | "Cancel"

> **If Cancel** -> STOP: "grepai setup cancelled. Install prerequisites manually, then re-run `/brewcode:grepai setup`."

**EXECUTE** using Bash tool:
```bash
bash "${CLAUDE_SKILL_DIR}/scripts/install.sh" && echo "✅ install" || echo "❌ install FAILED"
```

> **STOP if ❌** — check the install output for the failed component and install it manually.

#### Re-verify

**EXECUTE** using Bash tool:
```bash
bash "${CLAUDE_SKILL_DIR}/scripts/infra-check.sh" && echo "✅ infra-check" || echo "❌ infra-check FAILED"
```

> **STOP if ❌** — prerequisites still missing after install; inspect the install output above.

### Phase 2: MCP Configuration & Permissions

**EXECUTE** using Bash tool:
```bash
bash "${CLAUDE_SKILL_DIR}/scripts/mcp-check.sh" && echo "✅ mcp-check" || echo "❌ mcp-check FAILED"
```

This script configures MCP server and allowedTools permissions.

> **STOP if ❌** — fix MCP configuration before continuing.

### Phase 3: Generate Config

**SPAWN** the `bc-grepai-configurator` agent using Task tool:

| Parameter | Value |
|-----------|-------|
| `subagent_type` | `brewcode:bc-grepai-configurator` |
| `prompt` | `Configure grepai for this project. Analyze all build files, test patterns, source structure. Generate optimal .grepai/config.yaml.` |
| `model` | `opus` |

> **Context:** the agent resolves its plugin root natively via `${CLAUDE_PLUGIN_ROOT}` (substituted in its .md at Task spawn).

> **WAIT** for agent to complete before proceeding.

### Phase 4: Initialize Index

**EXECUTE** using Bash tool:
```bash
bash "${CLAUDE_SKILL_DIR}/scripts/init-index.sh" && echo "✅ init-index" || echo "❌ init-index FAILED"
```

> **STOP if ❌** — check `.grepai/logs/grepai-watch.log` for errors.

> ⏳ **Synchronous — Large projects (5k+ files) take 10-30+ min.** Monitor: `tail -f .grepai/logs/grepai-watch.log`

### Phase 5: Create Rule

**EXECUTE** using Bash tool:
```bash
bash "${CLAUDE_SKILL_DIR}/scripts/create-rule.sh" && echo "✅ create-rule" || echo "❌ create-rule FAILED"
```

> **STOP if ❌** — manually create rule in `.claude/rules/`.

### Phase 6: Install grepai Hooks (self-install)

> grepai ships two self-contained hooks that travel into the user's project (NOT
> the plugin): `grepai-session.mjs` (SessionStart — auto-starts `grepai watch` and
> injects "USE grepai_search FIRST" when the index is live) and
> `grepai-reminder.mjs` (PreToolUse:Bash — nudges toward `grepai_search` when a
> `grep/find/rg` command runs). Self-install is idempotent. Runbook + jq/python3
> merge details: `${CLAUDE_SKILL_DIR}/assets/INSTALL.md`.

#### Step 1: Detect (idempotent — skip if already installed)

**EXECUTE** using Bash tool:
```bash
SETTINGS="$PWD/.claude/settings.json"
if [ -f "$SETTINGS" ] && grep -q 'grepai-session.mjs' "$SETTINGS" 2>/dev/null; then
  echo "✅ hooks already installed — skip Phase 6"
else
  echo "⚠️ hooks not installed — continue"
fi
```

- Printed `✅ hooks already installed` -> SKIP to Phase 7. Do NOT re-copy/re-merge.
- Printed `⚠️ hooks not installed` -> continue.

#### Step 2: Choose scope

Scope is PROJECT by default. grepai setup always runs against THIS repo, so the
scope is unambiguous — **default to PROJECT and SKIP the questions**.

Ask via `AskUserQuestion` ONLY when scope is genuinely ambiguous (e.g. the user
explicitly says "for all my projects" / "globally", or there is no obvious single
project root):
- "Install grepai hooks for this Project or Globally?" (options: **Project** / **Global**)
- Confirm hook creation: "grepai will copy two SessionStart + PreToolUse:Bash hooks into `<scope>/.claude/grepai/hooks/` and merge them into `settings.json`. Proceed?" (options: **Yes, install** / **Skip hooks**)

> Skip hooks -> note it and GOTO Phase 7 (search config still works via MCP; only
> the auto-watch + reminder are skipped).

#### Step 3: Copy + merge (no clobber)

Follow the runbook. `SRC` = this skill's assets dir; `DST`/`SETTINGS` by scope.
PROJECT writes freely; GLOBAL (`~/.claude/*`) MUST go through the Bash tool only
(protected path — Bash `cp`/`jq`/`python3`/`mv` are allowed, Write/Edit are not).

**EXECUTE** using Bash tool (PROJECT scope shown; for GLOBAL set the two GLOBAL
paths from the comments):
```bash
SRC="${CLAUDE_SKILL_DIR}/assets"
# PROJECT: DST="$PWD/.claude/grepai/hooks";   SETTINGS="$PWD/.claude/settings.json"
# GLOBAL:  DST="$HOME/.claude/grepai/hooks";  SETTINGS="$HOME/.claude/settings.json"
DST="$PWD/.claude/grepai/hooks"
SETTINGS="$PWD/.claude/settings.json"

mkdir -p "$DST" && cp "$SRC/grepai-session.mjs" "$SRC/grepai-reminder.mjs" "$DST/" \
  && echo "✅ copied to $DST" || { echo "❌ copy FAILED"; exit 1; }

mkdir -p "$(dirname "$SETTINGS")"
[ -f "$SETTINGS" ] || echo '{}' > "$SETTINGS"
S_CMD="node $DST/grepai-session.mjs"
R_CMD="node $DST/grepai-reminder.mjs"

if command -v jq >/dev/null 2>&1; then
  TMP="$(mktemp)"
  jq --arg scmd "$S_CMD" --arg rcmd "$R_CMD" '
    .hooks = (.hooks // {})
    | .hooks.SessionStart = (.hooks.SessionStart // [])
    | (if (.hooks.SessionStart | map(.hooks // [] | map(.command // "") | any(test("grepai-session\\.mjs"))) | any)
       then .
       else (if (.hooks.SessionStart | length) > 0
             then .hooks.SessionStart[0].hooks += [{"type":"command","command":$scmd}]
             else .hooks.SessionStart += [{"hooks":[{"type":"command","command":$scmd}]}] end)
       end)
    | .hooks.PreToolUse = (.hooks.PreToolUse // [])
    | (if (.hooks.PreToolUse | map(.hooks // [] | map(.command // "") | any(test("grepai-reminder\\.mjs"))) | any)
       then .
       else (.hooks.PreToolUse | map((.matcher // "") == "Bash") | index(true)) as $i
            | (if $i != null
               then .hooks.PreToolUse[$i].hooks += [{"type":"command","command":$rcmd}]
               else .hooks.PreToolUse += [{"matcher":"Bash","hooks":[{"type":"command","command":$rcmd}]}] end)
       end)
  ' "$SETTINGS" > "$TMP" && mv "$TMP" "$SETTINGS" \
    && jq empty "$SETTINGS" >/dev/null 2>&1 && echo "✅ merged $SETTINGS (jq)" || echo "❌ merge FAILED"
elif command -v python3 >/dev/null 2>&1; then
  SETTINGS="$SETTINGS" S_CMD="$S_CMD" R_CMD="$R_CMD" python3 - <<'PY'
import json, os
f = os.environ["SETTINGS"]; scmd = os.environ["S_CMD"]; rcmd = os.environ["R_CMD"]
try: data = json.load(open(f))
except Exception: data = {}
hooks = data.setdefault("hooks", {})
def has(groups, basename):
    return any(basename in (h.get("command") or "") for g in groups for h in g.get("hooks", []))
ss = hooks.setdefault("SessionStart", [])
if not has(ss, "grepai-session.mjs"):
    (ss[0].setdefault("hooks", []).append({"type":"command","command":scmd}) if ss
     else ss.append({"hooks":[{"type":"command","command":scmd}]}))
pt = hooks.setdefault("PreToolUse", [])
if not has(pt, "grepai-reminder.mjs"):
    bg = next((g for g in pt if g.get("matcher") == "Bash"), None)
    (bg.setdefault("hooks", []).append({"type":"command","command":rcmd}) if bg is not None
     else pt.append({"matcher":"Bash","hooks":[{"type":"command","command":rcmd}]}))
json.dump(data, open(f,"w"), indent=2)
print("OK")
PY
  echo "✅ merged $SETTINGS (python3)"
else
  echo "❌ neither jq nor python3 — add the two entries from assets/INSTALL.md manually"
fi
```

> **STOP if ❌** — see `${CLAUDE_SKILL_DIR}/assets/INSTALL.md` for the manual entries.

#### Step 4: Report what was created

After install, tell the user EXACTLY what changed:
- Hook files copied: `<scope>/.claude/grepai/hooks/grepai-session.mjs`, `<scope>/.claude/grepai/hooks/grepai-reminder.mjs`
- `settings.json` entries merged: `SessionStart -> node .../grepai-session.mjs`, `PreToolUse(matcher "Bash") -> node .../grepai-reminder.mjs`
- Reminder: a NEW session picks them up (SessionStart fires on next `claude` start / `--resume`); no `/reload-plugins` needed.

### Phase 7: Verification

**EXECUTE** using Bash tool:
```bash
bash "${CLAUDE_SKILL_DIR}/scripts/verify.sh" && echo "✅ verify" || echo "❌ verify FAILED"
```

---

## Mode: status

**EXECUTE** using Bash tool:
```bash
bash "${CLAUDE_SKILL_DIR}/scripts/status.sh" && echo "✅ status" || echo "❌ status FAILED"
```

---

## Mode: start

**EXECUTE** using Bash tool:
```bash
bash "${CLAUDE_SKILL_DIR}/scripts/start.sh" && echo "✅ start" || echo "❌ start FAILED"
```

---

## Mode: stop

**EXECUTE** using Bash tool:
```bash
bash "${CLAUDE_SKILL_DIR}/scripts/stop.sh" && echo "✅ stop" || echo "❌ stop FAILED"
```

---

## Mode: reindex

Full index rebuild: stop watch → clean → rebuild → restart.

**EXECUTE** using Bash tool:
```bash
bash "${CLAUDE_SKILL_DIR}/scripts/reindex.sh" && echo "✅ reindex" || echo "❌ reindex FAILED"
```

> ⏳ **Synchronous — Monitor: `tail -f .grepai/logs/grepai-watch.log`**

---

## Mode: optimize

Re-analyze project and regenerate config with backup.

### Step 1: Backup current config

**EXECUTE** using Bash tool:
```bash
bash "${CLAUDE_SKILL_DIR}/scripts/optimize.sh" && echo "✅ optimize-backup" || echo "❌ optimize-backup FAILED"
```

> **STOP if ❌** — check if .grepai/config.yaml exists.

### Step 2: Regenerate config

**SPAWN** the `bc-grepai-configurator` agent using Task tool:

| Parameter | Value |
|-----------|-------|
| `subagent_type` | `brewcode:bc-grepai-configurator` |
| `prompt` | `Re-analyze project and regenerate .grepai/config.yaml. Compare with existing config, optimize boost patterns, update trace languages.` |
| `model` | `opus` |

> **Context:** the agent resolves its plugin root natively via `${CLAUDE_PLUGIN_ROOT}` (substituted in its .md at Task spawn).

> **WAIT** for agent to complete.

### Step 3: Reindex with new config

**EXECUTE** using Bash tool:
```bash
bash "${CLAUDE_SKILL_DIR}/scripts/reindex.sh" && echo "✅ reindex" || echo "❌ reindex FAILED"
```

---

## Mode: upgrade

Update grepai CLI via Homebrew.

**EXECUTE** using Bash tool:
```bash
bash "${CLAUDE_SKILL_DIR}/scripts/upgrade.sh" && echo "✅ upgrade" || echo "❌ upgrade FAILED"
```

---

## Mode: prompt

Use AskUserQuestion to ask which operation to run:

```
header: "grepai"
question: "Which grepai operation do you want to run?"
options:
  - label: "setup"
    description: "Initialize and configure semantic search for this project"
  - label: "status"
    description: "Check health, index stats, doctor"
  - label: "start / watch"
    description: "Start watch mode (auto-index on file changes)"
  - label: "optimize"
    description: "Update and rebuild the search index"
```

For stop, reindex, upgrade — user types via Other. After answer, GOTO that mode section.

</instructions>

---

## Output Format

```markdown
# grepai [MODE]

## Detection

| Field | Value |
|-------|-------|
| Arguments | `$ARGUMENTS` |
| Mode | `[detected mode]` |

## Status

| Component | Status |
|-----------|--------|
| grepai CLI | [✅/❌] |
| ollama | [✅/❌] |
| bge-m3 model | [✅/❌] |
| MCP | [✅/❌] |
| Permissions | [✅/❌] allowedTools |
| .grepai/ | [✅/❌] |
| index | [size/indexing] |
| watch | [running/stopped] |
| rule | [✅/⚠️] |

## Actions Taken

- [action 1]
- [action 2]

## Next Steps

- [if any issues, list resolution steps]
```
