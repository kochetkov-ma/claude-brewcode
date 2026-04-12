---
name: brewtools:provider-switch
description: "Configure Claude Code alternative API providers — Z.ai/GLM, Qwen, MiniMax, OpenRouter. Creates shell aliases, manages API tokens, checks status. Triggers: 'provider', 'switch provider', 'alternative api', 'configure provider', 'claude-glm', 'claude-qwen', 'openrouter setup'."
argument-hint: "[status|setup|help|<provider-name>] — no args = interactive status check"
allowed-tools: Read, Write, Edit, Bash, AskUserQuestion, Glob, Grep
model: opus
user-invocable: true
---

# Provider Switch

> **Configure and switch between Claude Code alternative API providers** — Z.ai/GLM, Qwen/DashScope, MiniMax, OpenRouter. Creates isolated shell aliases in ~/.zshrc.

<instructions>

## Robustness Rules (MANDATORY)

| Rule | Applies to |
|------|-----------|
| Every Bash call MUST end with `&& echo "OK ..." \|\| echo "FAILED ..."` | ALL commands |
| On `FAILED` — stop current phase, report error, DO NOT retry blindly | ALL phases |
| Max **3 AskUserQuestion** per phase | ALL phases |
| NEVER write secrets to any file other than ~/.zshrc | ALL phases |
| NEVER commit ~/.zshrc changes | ALL phases |
| All comments in ~/.zshrc MUST be in ENGLISH | ALL writes |

### Error Reporting

On ANY failure — before stopping — output:

```
SCRIPT_ERROR: <script-name or command>
PHASE: <current phase>
ACTION: <what was attempted>
SUGGESTION: <what user can try>
```

---

## Phase 0: Language Selection

**First interaction:** Use AskUserQuestion:

Question: "Select language for this session / Выберите язык"
Options:
- "English (Recommended)"
- "Russian / Русский"

Remember choice — all subsequent messages in selected language.
Default if skipped: English.

---

## Phase 1: Mode Detection

**Skill arguments received:** `$ARGUMENTS`

**EXECUTE** using Bash tool:
```bash
bash "${CLAUDE_SKILL_DIR}/scripts/detect-mode.sh" "$ARGUMENTS" && echo "OK detect" || echo "FAILED detect"
```

> **STOP if FAILED** — parse $ARGUMENTS manually as fallback (keyword matching).

Output format:
```
ARGS: [arguments received]
MODE: [detected mode]
```

### Mode Reference

| Keyword in args | MODE |
|-----------------|------|
| status, check | status |
| setup, configure | setup |
| help, how | help |
| glm, zai, z.ai | provider-glm |
| qwen, dashscope | provider-qwen |
| minimax, mini | provider-minimax |
| openrouter, router | provider-openrouter |
| (empty) | status |

---

## Phase 2: Status Check (ALL modes)

**EXECUTE** using Bash tool:
```bash
bash "${CLAUDE_SKILL_DIR}/scripts/check-status.sh" && echo "OK status" || echo "FAILED status"
```

> **STOP if FAILED** — check ~/.zshrc manually with grep.

Parse output key=value pairs. Determine status per provider:
- `configured` = ALIAS + KEY both true
- `partial` = ALIAS true, KEY false
- `not configured` = ALIAS false
- `active` = ACTIVE_PROVIDER matches

Render status table to user:

```
# Provider Switch — [MODE]

## Current Status

| Provider | Alias | API Key | Models (opus/sonnet/haiku) | Status |
|----------|-------|---------|---------------------------|--------|
| Anthropic Max | claude-max | OAuth | claude-opus-4-6 | ... |
| Z.ai / GLM | claude-glm | ZAI_API_KEY | glm-5.1 | ... |
| Qwen | claude-qwen | DASHSCOPE_API_KEY | qwen3.6-plus[1m] | ... |
| MiniMax | claude-minimax | MINIMAX_API_KEY | minimax-m2.7 | ... |
| OpenRouter | claude-openrouter | OPENROUTER_API_KEY | (user-selected) | ... |

## How to Switch
Run `claude-glm` then start `claude` as usual.
To return: `claude-max` then `claude`.
```

### Auto-setup Logic (MODE = status only)

After rendering the status table, count configured providers (status = `configured` or `active`):
- **Zero configured** → automatically proceed to Phase 3 (setup). Tell the user: "No providers configured yet. Starting setup..."
- **At least one configured** → STOP here with status table. User will re-run with specific mode if needed.

**If MODE = help** — GOTO Phase 6.

---

## Phase 3: Provider Selection

**If MODE = setup** (no specific provider):

Use AskUserQuestion:

Question: "Which providers do you want to configure?"
Options:
- "Z.ai / GLM (glm-5.1, free models available)"
- "Qwen / DashScope (qwen3.6-plus, 1M context)"
- "MiniMax (minimax-m2.7, cheapest)"
- "OpenRouter (aggregator, any model)"
- "All providers"

**If MODE = provider-\<name\>** — skip to Phase 4 for that provider only.

---

## Phase 4: Provider Configuration

For each selected provider, execute this sequence:

### Step 1: Load Reference

Read the provider reference file using Read tool:
- Z.ai/GLM: `references/zai-glm.md`
- Qwen: `references/qwen-dashscope.md`
- MiniMax: `references/minimax.md`
- OpenRouter: `references/openrouter.md`

Also read `references/common.md` for shared alias structure (first time only).

### Step 2: Initialize Section

Ensure the provider aliases section exists in ~/.zshrc:

**EXECUTE** using Bash tool:
```bash
bash "${CLAUDE_SKILL_DIR}/scripts/write-alias.sh" init && echo "OK init" || echo "FAILED init"
```

> **STOP if FAILED** — cannot write to ~/.zshrc.

### Step 3: API Key

Check if key already set (from Phase 2 status output: KEY_ZAI, KEY_DASHSCOPE, KEY_MINIMAX, KEY_OPENROUTER).

If missing — Use AskUserQuestion:

Question: "Enter your <PROVIDER_NAME> API key (from <dashboard-url>):"

Then write:

**EXECUTE** using Bash tool:
```bash
bash "${CLAUDE_SKILL_DIR}/scripts/write-alias.sh" set-key "KEY_VAR_NAME" "KEY_VALUE" && echo "OK set-key" || echo "FAILED set-key"
```

Replace KEY_VAR_NAME with: `ZAI_API_KEY`, `DASHSCOPE_API_KEY`, `MINIMAX_API_KEY`, or `OPENROUTER_API_KEY`.

> **STOP if FAILED** — report error.

### Step 4: Model Selection (OpenRouter only)

If provider is OpenRouter, read `references/openrouter-models.md` for available models.

Use AskUserQuestion — pick ONE model (same model for all three roles):

Question: "Select model for OpenRouter:"
Options:
- "qwen/qwen3.6-plus[1m] — 1M context, top coding (Recommended)"
- "z-ai/glm-5.1 — #1 SWE-bench Pro, 200K"
- "qwen/qwen3.6-plus-preview:free — free, rate-limited, 1M"
- "Custom (I will specify model ID)"

The selected model is set as OPUS, SONNET, and HAIKU simultaneously.

### Step 5: Write Alias

Construct alias body from reference file. The alias body is a single string of chained export/unset commands.

**EXECUTE** using Bash tool:
```bash
bash "${CLAUDE_SKILL_DIR}/scripts/write-alias.sh" set-alias "claude-PROVIDER" "ALIAS_BODY" && echo "OK set-alias" || echo "FAILED set-alias"
```

Replace:
- PROVIDER: glm, qwen, minimax, openrouter
- ALIAS_BODY: exact alias body from provider reference (the string inside single quotes after `alias claude-xxx=`)

> **STOP if FAILED** — report error, do not continue to next provider.

### Step 6: Verify

**EXECUTE** using Bash tool:
```bash
source ~/.zshrc 2>/dev/null && type claude-PROVIDER 2>/dev/null && echo "OK verify" || echo "FAILED verify"
```

> **STOP if FAILED** — alias was not written correctly.

### Step 7: claude-max alias (ALWAYS)

After configuring any provider, ensure `claude-max` exists:

**EXECUTE** using Bash tool:
```bash
grep -q "^alias claude-max=" ~/.zshrc && echo "OK claude-max exists" || bash "${CLAUDE_SKILL_DIR}/scripts/write-alias.sh" set-alias "claude-max" 'unset ANTHROPIC_BASE_URL ANTHROPIC_API_KEY ANTHROPIC_AUTH_TOKEN ANTHROPIC_DEFAULT_OPUS_MODEL ANTHROPIC_DEFAULT_SONNET_MODEL ANTHROPIC_DEFAULT_HAIKU_MODEL DISABLE_PROMPT_CACHING CLAUDE_CODE_USE_BEDROCK' && echo "OK claude-max added" || echo "FAILED claude-max"
```

---

## Phase 5: Verification & Final Status

Re-run status check:

**EXECUTE** using Bash tool:
```bash
bash "${CLAUDE_SKILL_DIR}/scripts/check-status.sh" && echo "OK final-status" || echo "FAILED final-status"
```

Render updated status table (same format as Phase 2).

Add activation instructions:

```
## Activation

To use a configured provider:
1. Run the alias: `claude-glm` (or claude-qwen, claude-minimax, claude-openrouter)
2. Start Claude Code: `claude`
3. To return to subscription: `claude-max` then `claude`

Changes take effect in NEW terminal sessions. To apply now: `source ~/.zshrc`
```

---

## Phase 6: Help Mode

Read `references/common.md` for help content and explain:

| Topic | Explanation |
|-------|-------------|
| How aliases work | Each alias sets ANTHROPIC_BASE_URL + auth + 3 model vars. Isolated — one provider at a time |
| How to switch | Run alias (e.g., `claude-glm`) then start `claude`. Env vars override subscription |
| How to return | `claude-max` unsets all provider vars, returns to Anthropic subscription |
| Context [1m] hack | `[1m]` suffix in model name forces Claude Code to use 1M context window |
| Z.ai auth | Uses ANTHROPIC_API_KEY (native protocol). Others use ANTHROPIC_AUTH_TOKEN |
| OpenRouter note | Must set ANTHROPIC_API_KEY="" (empty, not unset) to prevent OAuth fallback |
| Provider dashboards | Z.ai: open.bigmodel.cn, Qwen: alibabacloud.com/product/dashscope, MiniMax: platform.minimax.io, OpenRouter: openrouter.ai |

---

## Phase 7: Update (hidden, maintainer-only)

> **Not user-facing.** Triggered by MODE=update. Not shown in help or output format. Not documented externally.

**If MODE != update** — skip entirely.

### Step 1: Load Protocol

Read `references/update-protocol.md` for per-provider sources and update flow.

### Step 2: Spawn Provider Research Agents

Spawn 4 Explore agents **in ONE message** via Task:

| Agent | Provider | Sources |
|-------|----------|---------|
| 1 | Z.ai/GLM | docs.z.ai, open.bigmodel.cn — models, pricing |
| 2 | Qwen/DashScope | alibabacloud.com/help, qwenlm.github.io — models, pricing |
| 3 | MiniMax | platform.minimax.io — models, pricing |
| 4 | OpenRouter | openrouter.ai/api/v1/models — top coding/free models |

Each agent: WebFetch/WebSearch sources from protocol, extract current model list + pricing + any endpoint changes.

### Step 3: Aggregate & Diff

For each provider, compare fetched data vs current reference file content:
- Model IDs changed?
- Pricing changed?
- New models added?
- Endpoint URL changed?
- Context windows changed?

### Step 4: Present Changes

Show diff table to maintainer:

```
## Update Results

| Provider | Field | Current | Fetched | Action |
|----------|-------|---------|---------|--------|
| Z.ai | opus model | glm-5.1 | glm-6.0 | UPDATE |
| Qwen | pricing | ~$0.50 | $0.40 | UPDATE |
| MiniMax | (no changes) | — | — | SKIP |
```

### Step 5: Apply Updates

For each confirmed change, use Edit tool to update the corresponding reference file. Follow the field-to-line mapping in `references/update-protocol.md`.

Also update:
- Alias bodies in reference files if model IDs changed
- `openrouter-models.md` if recommended models changed
- `common.md` if env var patterns changed (rare)

### Step 6: Live Test (optional)

If API keys are available in environment, run endpoint health check per provider:

**EXECUTE** using Bash tool:
```bash
curl -s -o /dev/null -w "%{http_code}" -X POST "https://api.z.ai/api/anthropic/v1/messages" -H "x-api-key: ${ZAI_API_KEY:-missing}" -H "content-type: application/json" -H "anthropic-version: 2023-06-01" -d '{"model":"glm-5.1","max_tokens":5,"messages":[{"role":"user","content":"ping"}]}' && echo " OK" || echo " FAILED"
```

### Step 7: Report

```
## Provider Update Complete

| Provider | Changes | Status |
|----------|---------|--------|
| Z.ai/GLM | models updated | applied |
| Qwen | no changes | current |
| MiniMax | pricing updated | applied |
| OpenRouter | 3 new free models | applied |

Files modified: [list]
```

---

## Output Format

Final output after every mode:

```markdown
# Provider Switch — [MODE]

## Current Status

| Provider | Alias | API Key | Model | Status |
|----------|-------|---------|-------|--------|
| Anthropic Max | claude-max | OAuth | claude-opus-4-6 | active |
| Z.ai / GLM | claude-glm | ZAI_API_KEY | glm-5.1 | configured |
| Qwen | claude-qwen | DASHSCOPE_API_KEY | — | not configured |
| MiniMax | claude-minimax | MINIMAX_API_KEY | — | not configured |
| OpenRouter | claude-openrouter | OPENROUTER_API_KEY | — | not configured |

## How to Switch
Run `claude-glm` then start `claude` as usual.
To return: `claude-max` then `claude`.
```

</instructions>
