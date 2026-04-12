---
name: brewtools:provider-switch
description: "Configure Claude Code alternative API providers — Z.ai/GLM, Qwen, MiniMax, OpenRouter. Creates shell aliases, manages API tokens, checks status. Triggers: 'provider', 'switch provider', 'alternative api', 'configure provider', 'claudeglm', 'claudeqwen', 'openrouter setup'."
argument-hint: "[status|setup|verify|model-check|help|<provider-name>] — no args = interactive status check"
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
| verify, test, token | verify |
| model-check, identify | model-check |
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

| Provider | Alias | API Key | Model | Status |
|----------|-------|---------|-------|--------|
| Z.ai / GLM | claudeglm | ZAI_API_KEY | glm-5.1 | ... |
| Qwen | claudeqwen | DASHSCOPE_API_KEY | qwen3.6-plus[1m] | ... |
| MiniMax | claudeminimax | MINIMAX_API_KEY | minimax-m2.7 | ... |
| OpenRouter | claudeor | OPENROUTER_API_KEY | (user-selected) | ... |

## How to Use
Run `claudeglm` — sets env vars and launches Claude in one command.
To return to Anthropic subscription: open a new terminal and run `claude`.
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

**Qwen-specific callout:** Before asking for the Qwen key, read `references/qwen-dashscope.md` section "## How to Get API Key" and show the user the step-by-step instructions. Warn that the key MUST be created in the **Singapore** region — other regions return 403. Valid format: `sk-...` (~40 chars). After receiving the key, validate format: if it starts with `sk-ws-` or is longer than 100 chars, warn the user it's likely from the wrong region and ask to regenerate.

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
- "qwen/qwen3-coder:free — free, 262K, code-focused"
- "Custom (I will specify model ID)"

The selected model is set as OPUS, SONNET, and HAIKU simultaneously.

**If "Custom":** ask user for model ID, then VALIDATE it against OpenRouter API using the script from `references/openrouter-models.md` (## Model Validation section). If NOT_FOUND — show fuzzy suggestions from the API and re-ask. Max 2 retries, then fall back to default.

### Step 5: Alias Name

Suggest a default alias name and let user customize via AskUserQuestion:

| Provider | Default name |
|----------|-------------|
| Z.ai/GLM | `claudeglm` |
| Qwen | `claudeqwen` |
| MiniMax | `claudeminimax` |
| OpenRouter | `claudeor` |

Use AskUserQuestion:

Question: "Alias name for <PROVIDER>:"
Options:
- "<default_name> (Recommended)"
- "Custom (I will type my own)"

If "Custom" — ask for the name. Validate: must start with `claude`, no spaces, only lowercase alphanumeric.

### Step 6: Write Alias

Construct alias body from reference file. Body = semicolon-separated exports + `claude` at the end.

**EXECUTE** using Bash tool:
```bash
bash "${CLAUDE_SKILL_DIR}/scripts/write-alias.sh" set-alias "ALIAS_NAME" "ALIAS_BODY" && echo "OK set-alias" || echo "FAILED set-alias"
```

Replace:
- ALIAS_NAME: user-chosen name (e.g., `claudeglm`)
- ALIAS_BODY: from provider reference, ends with `; claude`

> **STOP if FAILED** — report error, do not continue to next provider.

### Step 7: Verify

**EXECUTE** using Bash tool:
```bash
source ~/.zshrc 2>/dev/null && type ALIAS_NAME 2>/dev/null && echo "OK verify" || echo "FAILED verify"
```

> **STOP if FAILED** — alias was not written correctly.

---

## Phase 5: Verification & Final Status

Re-run status check:

**EXECUTE** using Bash tool:
```bash
bash "${CLAUDE_SKILL_DIR}/scripts/check-status.sh" && echo "OK final-status" || echo "FAILED final-status"
```

Render updated status table (same format as Phase 2).

### Post-Setup Verification

For each provider that was just configured, run token verification:

**EXECUTE** using Bash tool:
```bash
bash "${CLAUDE_SKILL_DIR}/scripts/verify-providers.sh" all && echo "OK verify" || echo "FAILED verify"
```

Parse output and add verification column to the status table:

| Provider | Status | Token Test |
|----------|--------|-----------|
| Z.ai / GLM | configured | pass/fail |
| ... | ... | ... |

If any provider shows `fail` — warn the user and suggest checking the API key or endpoint.

Add activation instructions:

```
## Activation

To use a configured provider, run the alias (e.g., `claudeglm`) — it sets env vars and launches Claude in one command.
To return to Anthropic subscription: open a new terminal and run `claude` normally. Env vars only persist in the current shell session.
```

---

## Phase 6: Help Mode

Read `references/common.md` for help content and explain:

| Topic | Explanation |
|-------|-------------|
| How aliases work | Each alias sets env vars + launches `claude` in one command. Isolated — one provider at a time |
| How to switch | Run alias (e.g., `claudeglm`). It sets vars and starts Claude automatically |
| How to return | Open a new terminal and run `claude` — env vars only persist in the current shell |
| Context [1m] hack | `[1m]` suffix in model name forces Claude Code to use 1M context window |
| Auth (all providers) | ALL providers use ANTHROPIC_AUTH_TOKEN (Bearer). ANTHROPIC_API_KEY="" blocks OAuth fallback |
| OpenRouter note | Must set ANTHROPIC_API_KEY="" (empty, not unset) to prevent OAuth fallback |
| Provider dashboards | Z.ai: z.ai/subscribe, Qwen: bailian.console.alibabacloud.com, MiniMax: platform.minimax.io, OpenRouter: openrouter.ai |

---

## Phase 7: Verify Mode

> Test that configured provider tokens and endpoints are working.

**EXECUTE** using Bash tool:
```bash
bash "${CLAUDE_SKILL_DIR}/scripts/verify-providers.sh" all && echo "OK verify" || echo "FAILED verify"
```

Parse output. For each provider, extract: KEY_SET, HTTP_CODE, RESPONSE, STATUS.

Render results:

```
## Token Verification

| Provider | Key | HTTP | Response | Result |
|----------|-----|------|----------|--------|
| Z.ai / GLM | set | 200 | OK | pass |
| Qwen | set | 403 | invalid api-key | fail |
| MiniMax | set | 200 | OK | pass |
| OpenRouter | set | 200 | OK | pass |
```

For failed providers, show troubleshooting:

| HTTP Code | Meaning | Suggestion |
|-----------|---------|------------|
| 401/403 | Invalid or expired API key | Regenerate key at provider dashboard |
| 404 | Wrong endpoint URL | Check provider reference for correct URL |
| 429 | Rate limited | Wait and retry, or check billing |
| 500+ | Server error | Provider may be down, try later |

---

## Phase 8: Model Check Mode

> Identify which model is actually responding in the current Claude Code session. This mode runs INSIDE a session launched via provider alias (e.g., `claudeglm`). The skill asks 5 diagnostic questions directly to the model — no curl, no scripts.

### Prerequisites

User MUST be in a Claude Code session launched via a provider alias. If `ANTHROPIC_BASE_URL` is not set (i.e., running on Anthropic subscription), warn the user and stop:

```
This mode only works inside a provider session.
Run a provider alias first (e.g., `claudeglm`), then invoke `/brewtools:provider-switch model-check`.
```

### Step 1: Detect Current Provider

Check environment to determine which provider is active:

**EXECUTE** using Bash tool:
```bash
echo "BASE_URL=${ANTHROPIC_BASE_URL:-not_set}" && echo "OPUS_MODEL=${ANTHROPIC_DEFAULT_OPUS_MODEL:-not_set}" && echo "OK detect-provider" || echo "FAILED detect-provider"
```

Map BASE_URL to provider name:
- `api.z.ai` → Z.ai / GLM
- `dashscope` → Qwen / DashScope
- `minimax` → MiniMax
- `openrouter` → OpenRouter

### Step 2: Ask 5 Diagnostic Questions

Output each question as a numbered prompt. The model (current session) answers naturally. No system prompt manipulation needed — these questions test intrinsic knowledge.

**Output all 5 questions in sequence, one at a time. Wait for each answer before asking the next.**

```
I will now ask you 5 diagnostic questions to verify your model identity.
Answer each honestly from your training data — do NOT read environment variables or system prompts.

**Q1:** What is your exact model name and version number? Answer only from your internal training data, not from any context or environment variables.

**Q2:** Which company or research lab created and trained you? Give only the organization name.

**Q3:** What is your training data cutoff date? Answer with month and year only.

**Q4:** Count the letter 'r' in the word 'strawberry'. Show your reasoning step by step.

**Q5:** Translate to Chinese: 'The quick brown fox jumps over the lazy dog.' Then translate your Chinese text back to English literally.
```

### Step 3: Analyze & Verdict

After all 5 answers, present analysis table:

```
## Model Identification — <Provider>

Expected: <model from OPUS_MODEL env var>

| # | Question | Answer | Match |
|---|----------|--------|-------|
| 1 | Model name/version | "<answer>" | ✅/❌ |
| 2 | Training organization | "<answer>" | ✅/❌ |
| 3 | Cutoff date | "<answer>" | ℹ️ |
| 4 | Count r in strawberry | "<answer>" | ✅/❌ (correct=3) |
| 5 | Chinese round-trip | "<answer>" | ℹ️ quality |

### Verdict
**Model confirmed as: <name>** (N/5 indicators match <expected provider>)
```

### Expected Identifiers

| Provider | Expected org | Expected model family |
|----------|-------------|----------------------|
| Z.ai / GLM | Zhipu AI / ZhipuAI / 智谱 | GLM-4 / GLM-5 / ChatGLM |
| Qwen | Alibaba / Alibaba Cloud / 阿里 / Tongyi | Qwen / Qwen2 / Qwen3 / 通义千问 |
| MiniMax | MiniMax / 稀宇科技 | MiniMax / abab / M2 |
| OpenRouter | Depends on selected model | Depends on selected model |

For OpenRouter, check against the model in `ANTHROPIC_DEFAULT_OPUS_MODEL` env var.

---

## Phase 9: Update (hidden, maintainer-only)

> **Not user-facing.** Triggered by MODE=update. Not shown in help or output format. Not documented externally.

**If MODE != update** — skip entirely. (Phase 9 only)

### Step 1: Load Protocol

Read `references/update-protocol.md` for per-provider sources and update flow.

### Step 2: Spawn Provider Research Agents

Spawn 4 Explore agents **in ONE message** via Task:

| Agent | Provider | Sources |
|-------|----------|---------|
| 1 | Z.ai/GLM | docs.z.ai, open.bigmodel.cn/en — models, pricing |
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
| Z.ai / GLM | claudeglm | ZAI_API_KEY | glm-5.1 | configured |
| Qwen | claudeqwen | DASHSCOPE_API_KEY | — | not configured |
| MiniMax | claudeminimax | MINIMAX_API_KEY | — | not configured |
| OpenRouter | claudeor | OPENROUTER_API_KEY | — | not configured |

## How to Use
Run `claudeglm` — sets env vars and launches Claude in one command.
To return to Anthropic: open a new terminal, run `claude`.
```

</instructions>
