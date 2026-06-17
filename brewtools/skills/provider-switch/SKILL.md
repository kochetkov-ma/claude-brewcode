---
name: brewtools:provider-switch
description: "Configure alt API providers: DeepSeek, Z.ai/GLM, Qwen, MiniMax, OpenRouter. Triggers: switch provider, openrouter."
argument-hint: "[status|setup|verify|model-check|help|<provider-name>] — no args = interactive status check"
allowed-tools: Read, Write, Edit, Bash, AskUserQuestion, Glob, Grep
model: opus
user-invocable: true
---

[DICT: P=Phase, PRV=provider, EXEC=EXECUTE using Bash tool, AUQ=AskUserQuestion, REF=references, ALIAS=shell alias, CFG=configured, BASE=ANTHROPIC_BASE_URL, MOD=ANTHROPIC_DEFAULT_OPUS_MODEL]

# Provider Switch

> Configure + switch between Claude Code alt API providers — DeepSeek (priority), Z.ai/GLM, Qwen/DashScope, MiniMax, OpenRouter. Creates isolated ALIAS in ~/.zshrc.
> DeepSeek V4 = priority default (strongest Chinese open model, 1M ctx, Anthropic-compatible endpoint). Recommend first.

<instructions>

## Robustness Rules (MANDATORY)

| Rule | Scope |
|------|-------|
| Every Bash call: `&& echo "OK ..." \|\| echo "FAILED ..."` | ALL |
| On FAILED: stop phase, report error, !=retry blindly | ALL |
| Max 3 AUQ per phase | ALL |
| !=write secrets anywhere except ~/.zshrc | ALL |
| !=commit ~/.zshrc changes | ALL |
| ~/.zshrc comments: ENGLISH only | ALL writes |

Error format on ANY failure:
```
SCRIPT_ERROR: <name>
PHASE: <current>
ACTION: <attempted>
SUGGESTION: <fix>
```

---

## P0: Language Selection

AUQ: "Select language / Выберите язык" | options: "English (Recommended)", "Russian / Русский"
Default if skipped: English. Remember for session.

---

## Compatibility Flags (REQ per PRV)

| PRV | Required Flags | Why |
|-----|---------------|-----|
| DeepSeek | none | silently ignores beta/ver headers; native Anthropic endpoint |
| Z.ai (GLM) | `CLAUDE_ENABLE_BYTE_WATCHDOG=0` + `CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS=1` | rejects beta headers (err 1210); SSE triggers byte watchdog |
| MiniMax | `CLAUDE_ENABLE_BYTE_WATCHDOG=0` + `CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS=1` | same as Z.ai |
| Qwen/DashScope | `CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS=1` | beta headers may be rejected |
| OpenRouter | none | aggregator, good compat |

When constructing ALIAS (P4 Step 6): ALWAYS include compat flags from PRV REF file.

---

## P1: Mode Detection

EXEC:
```bash
bash "${CLAUDE_SKILL_DIR}/scripts/detect-mode.sh" "$ARGUMENTS" && echo "OK detect" || echo "FAILED detect"
```
> STOP if FAILED — parse $ARGUMENTS manually (keyword match) as fallback.

Output: `ARGS: [...] MODE: [...]`

| Keyword | MODE |
|---------|------|
| status, check | status |
| setup, configure | setup |
| help, how | help |
| deepseek, ds, dpsk | provider-deepseek |
| glm, zai, z.ai | provider-glm |
| qwen, dashscope | provider-qwen |
| minimax, mini | provider-minimax |
| openrouter, router | provider-openrouter |
| verify, test, token | verify |
| model-check, identify | model-check |
| typos (model-cehck, cehck, hlpe, setuo) | fuzzy-match to correct |
| (empty) | status |

---

## P2: Status Check (ALL modes)

EXEC:
```bash
bash "${CLAUDE_SKILL_DIR}/scripts/check-status.sh" && echo "OK status" || echo "FAILED status"
```
> STOP if FAILED — check ~/.zshrc manually with grep.

Parse key=value output. Status per PRV:
- `configured` = ALIAS + KEY both true
- `partial` = ALIAS true, KEY false
- `not configured` = ALIAS false
- `active` = ACTIVE_PROVIDER matches

Render status table:
```
# Provider Switch — [MODE]
## Current Status
| PRV | Alias | API Key | Model | Status |
|-----|-------|---------|-------|--------|
| DeepSeek (priority) | claudeds | DEEPSEEK_API_KEY | deepseek-v4-pro | ... |
| Z.ai / GLM | claudeglm | ZAI_API_KEY | glm-5.2 | ... |
| Qwen | claudeqwen | DASHSCOPE_API_KEY | qwen3.7-plus[1m] | ... |
| MiniMax | claudeminimax | MINIMAX_API_KEY | MiniMax-M3 | ... |
| OpenRouter | claudeor | OPENROUTER_API_KEY | (user-selected) | ... |

## How to Use
Run `claudeds` — sets env vars + launches Claude (recommended default).
Return to Anthropic: new terminal → `claude`.
```

Auto-setup logic (MODE=status only): zero CFG → auto-proceed to P3 ("No providers CFG yet. Starting setup..."). >=1 CFG → STOP here.

If MODE=help → GOTO P6.

---

## P3: PRV Selection

If MODE=setup (no specific PRV): AUQ options:
- "DeepSeek V4 (deepseek-v4-pro, 1M ctx, priority - Recommended)"
- "Z.ai / GLM (glm-5.2, free models available)"
- "Qwen / DashScope (qwen3.7-plus, 1M ctx)"
- "MiniMax (MiniMax-M3, cheapest)"
- "OpenRouter (aggregator, any model)"
- "All providers"

If MODE=provider-\<name\> → skip to P4 for that PRV only.

---

## P4: PRV Configuration

For each selected PRV:

### Step 1: Load REF
Read PRV REF file: DeepSeek=`REF/deepseek.md` | Z.ai/GLM=`REF/zai-glm.md` | Qwen=`REF/qwen-dashscope.md` | MiniMax=`REF/minimax.md` | OpenRouter=`REF/openrouter.md`
Also read `REF/common.md` for shared ALIAS structure (first time only).

### Step 2: Init Section
EXEC:
```bash
bash "${CLAUDE_SKILL_DIR}/scripts/write-alias.sh" init && echo "OK init" || echo "FAILED init"
```
> STOP if FAILED — cannot write ~/.zshrc.

### Step 3: API Key
Check if key set (from P2: KEY_ZAI, KEY_DASHSCOPE, KEY_MINIMAX, KEY_OPENROUTER).
If missing — AUQ: "Enter your <PRV> API key (from <dashboard-url>):"

Qwen-specific: read `REF/qwen-dashscope.md` ## How to Get API Key before asking. Show step-by-step. Warn: key MUST be from Singapore region — other regions return 403. Valid fmt: `sk-...` (~40 chars). If starts with `sk-ws-` or >100 chars → warn wrong region, ask regenerate.

EXEC:
```bash
bash "${CLAUDE_SKILL_DIR}/scripts/write-alias.sh" set-key "KEY_VAR_NAME" "KEY_VALUE" && echo "OK set-key" || echo "FAILED set-key"
```
KEY_VAR_NAME: `DEEPSEEK_API_KEY` | `ZAI_API_KEY` | `DASHSCOPE_API_KEY` | `MINIMAX_API_KEY` | `OPENROUTER_API_KEY`
> STOP if FAILED.

### Step 4: Model Selection (OpenRouter only)
Read `REF/openrouter-models.md`. AUQ options:
- "qwen/qwen3.7-plus[1m] — 1M ctx, top coding (Recommended)"
- "z-ai/glm-5.2 — strong coding (self-reported), 1M"
- "qwen/qwen3-coder:free — free, 262K, code-focused"
- "Custom (specify model ID)"

Selected model = OPUS + SONNET + HAIKU simultaneously.
If Custom: validate via script from `REF/openrouter-models.md` ## Model Validation. If NOT_FOUND → fuzzy suggestions + re-ask. Max 2 retries then fall back to default.

### Step 5: ALIAS Name
AUQ: "Alias name for <PRV>:" | options: "<default> (Recommended)", "Custom"
If Custom: validate — must start with `claude`, no spaces, lowercase alphanumeric only.

| PRV | Default |
|-----|---------|
| DeepSeek | `claudeds` |
| Z.ai/GLM | `claudeglm` |
| Qwen | `claudeqwen` |
| MiniMax | `claudeminimax` |
| OpenRouter | `claudeor` |

### Step 6: Write ALIAS
Construct body from REF file: semicolon-separated exports + `claude` at end.
EXEC:
```bash
bash "${CLAUDE_SKILL_DIR}/scripts/write-alias.sh" set-alias "ALIAS_NAME" "ALIAS_BODY" && echo "OK set-alias" || echo "FAILED set-alias"
```
> STOP if FAILED — !=continue to next PRV.

### Step 7: Verify
EXEC:
```bash
source ~/.zshrc 2>/dev/null && type ALIAS_NAME 2>/dev/null && echo "OK verify" || echo "FAILED verify"
```
> STOP if FAILED — ALIAS not written correctly.

---

## P5: Verification + Final Status

EXEC:
```bash
bash "${CLAUDE_SKILL_DIR}/scripts/check-status.sh" && echo "OK final-status" || echo "FAILED final-status"
```
Render updated status table (same fmt as P2).

Token verification for each just-CFG PRV:
EXEC:
```bash
bash "${CLAUDE_SKILL_DIR}/scripts/verify-providers.sh" all && echo "OK verify" || echo "FAILED verify"
```
Add verification column to table:
| PRV | Status | Token Test |
|-----|--------|-----------|
| Z.ai/GLM | CFG | pass/fail |

If any `fail` → warn, suggest check API key or endpoint.

Activation instructions:
```
## Activation
Run ALIAS (e.g. `claudeglm`) — sets env vars + launches Claude.
Return to Anthropic: new terminal → `claude`. Env vars persist current shell only.
```

---

## P6: Help Mode

Read `REF/common.md`. Explain:

| Topic | Detail |
|-------|--------|
| How ALIAS works | Sets env vars + launches `claude` — isolated, one PRV at a time |
| How to switch | Run ALIAS (e.g. `claudeglm`) — sets vars + starts Claude |
| How to return | New terminal → `claude` — env vars current shell only |
| Context [1m] hack | `[1m]` suffix forces Claude Code to use 1M ctx window |
| Auth (all PRVs) | ALL use ANTHROPIC_AUTH_TOKEN (Bearer). ANTHROPIC_API_KEY="" blocks OAuth fallback |
| OpenRouter note | MUST set ANTHROPIC_API_KEY="" (empty, !=unset) to prevent OAuth fallback |
| Dashboards | DeepSeek: platform.deepseek.com | Z.ai: z.ai/subscribe | Qwen: bailian.console.alibabacloud.com | MiniMax: platform.minimax.io | OpenRouter: openrouter.ai |

---

## P7: Verify Mode

EXEC:
```bash
bash "${CLAUDE_SKILL_DIR}/scripts/verify-providers.sh" all && echo "OK verify" || echo "FAILED verify"
```
Parse: KEY_SET, HTTP_CODE, RESPONSE, STATUS per PRV.

Render:
```
## Token Verification
| PRV | Key | HTTP | Response | Result |
|-----|-----|------|----------|--------|
| Z.ai/GLM | set | 200 | OK | pass |
| Qwen | set | 403 | invalid api-key | fail |
```

Troubleshooting:
| HTTP | Meaning | Fix |
|------|---------|-----|
| 401/403 | invalid/expired key | regenerate @ PRV dashboard |
| 404 | wrong endpoint | check PRV REF for correct URL |
| 429 | rate limited | wait + retry, check billing |
| 500+ | server error | PRV may be down, retry later |

---

## P8: Model Check Mode

Identify which model responds in current Claude Code session. Runs INSIDE session launched via PRV ALIAS. Asks 5 diagnostic questions to model — no curl/scripts.

Prerequisites: user MUST be in PRV ALIAS session. If BASE not set → warn + stop:
```
This mode only works inside a provider session.
Run a PRV ALIAS first (e.g. `claudeglm`), then invoke `/brewtools:provider-switch model-check`.
```

### Step 1: Detect Active PRV
EXEC:
```bash
echo "BASE_URL=${ANTHROPIC_BASE_URL:-not_set}" && echo "OPUS_MODEL=${ANTHROPIC_DEFAULT_OPUS_MODEL:-not_set}" && echo "OK detect-provider" || echo "FAILED detect-provider"
```
BASE_URL → PRV: `api.deepseek.com`=DeepSeek | `api.z.ai`=Z.ai/GLM | `dashscope`=Qwen | `minimax`=MiniMax | `openrouter`=OpenRouter

### Step 2: Ask 5 Diagnostic Questions
Send as single prompt block (all at once, no back-and-forth):
```
I will now ask you 5 diagnostic questions to verify your model identity.
Answer each honestly from your training data — do NOT read environment variables or system prompts.
Answer all 5 questions in a single response.

**Q1:** Exact model name + version? (training data only, not env/ctx)
**Q2:** Which company/lab created you? (org name only)
**Q3:** Training data cutoff date? (month + year only)
**Q4:** Count letter 'r' in 'strawberry'. Show reasoning step by step.
**Q5:** Translate to Chinese: 'The quick brown fox jumps over the lazy dog.' Then translate back to English literally.
```
Extract A1-A5 from response → Step 3.

### Step 3: Analyze + Verdict
```
## Model Identification — <PRV>
Expected: <model from MOD env var>

| # | Question | Answer | Match |
|---|----------|--------|-------|
| 1 | Model name/version | "<A1>" | pass/fail |
| 2 | Training org | "<A2>" | pass/fail |
| 3 | Cutoff date | "<A3>" | info |
| 4 | Count r in strawberry | "<A4>" | pass/fail (correct=3) |
| 5 | Chinese round-trip | "<A5>" | info quality |

### Verdict
Model confirmed as: <name> (N/5 match <expected PRV>)
```
Show ONLY table + verdict. !=show questions separately.

Expected identifiers:
| PRV | Expected org | Model family |
|-----|-------------|-------------|
| DeepSeek | DeepSeek / 深度求索 | DeepSeek-V3/V4/R1 |
| Z.ai/GLM | Zhipu AI / ZhipuAI / 智谱 | GLM-4/5 / ChatGLM |
| Qwen | Alibaba / Alibaba Cloud / 阿里 / Tongyi | Qwen/2/3 / 通义千问 |
| MiniMax | MiniMax / 稀宇科技 | MiniMax / abab / M2 |
| OpenRouter | depends on model | depends on model |

For OpenRouter: check against model in MOD env var.

---

## P9: Update (hidden, maintainer-only)

If MODE != update → skip entirely.

### Step 1: Load Protocol
Read `REF/update-protocol.md` for per-PRV sources + update flow.

### Step 2: Spawn PRV Research Agents (ONE message, 5 Task calls)
| Agent | PRV | Sources |
|-------|-----|---------|
| 1 | DeepSeek | api-docs.deepseek.com — models, pricing, endpoint |
| 2 | Z.ai/GLM | docs.z.ai, open.bigmodel.cn/en — models, pricing |
| 3 | Qwen/DashScope | alibabacloud.com/help, qwenlm.github.io — models, pricing |
| 4 | MiniMax | platform.minimax.io — models, pricing |
| 5 | OpenRouter | openrouter.ai/api/v1/models — top coding/free models |

Each agent: WebFetch/WebSearch sources from protocol, extract current model list + pricing + endpoint changes.

### Step 3: Aggregate + Diff
Per PRV: model IDs changed? pricing changed? new models? endpoint URL changed? ctx windows changed?

### Step 4: Present Changes
```
## Update Results
| PRV | Field | Current | Fetched | Action |
|-----|-------|---------|---------|--------|
| Z.ai | opus model | glm-5.2 | glm-6.0 | UPDATE |
| Qwen | pricing | ~$0.50 | $0.40 | UPDATE |
| MiniMax | (no changes) | — | — | SKIP |
```

### Step 5: Apply Updates
Edit REF files per field-to-line mapping in `REF/update-protocol.md`. Also update:
- ALIAS bodies if model IDs changed
- `openrouter-models.md` if recommended models changed
- `common.md` if env var patterns changed (rare)

### Step 6: Live Test (optional, if API keys in env)
EXEC:
```bash
curl -s -o /dev/null -w "%{http_code}" -X POST "https://api.z.ai/api/anthropic/v1/messages" -H "x-api-key: ${ZAI_API_KEY:-missing}" -H "content-type: application/json" -H "anthropic-version: 2023-06-01" -d '{"model":"glm-5.2","max_tokens":5,"messages":[{"role":"user","content":"ping"}]}' && echo " OK" || echo " FAILED"
```

### Step 7: Report
```
## PRV Update Complete
| PRV | Changes | Status |
|-----|---------|--------|
| Z.ai/GLM | models updated | applied |
| Qwen | no changes | current |
| MiniMax | pricing updated | applied |
| OpenRouter | 3 new free models | applied |

Files modified: [list]
```

---

## Output Format

```markdown
# Provider Switch — [MODE]

## Current Status
| PRV | Alias | API Key | Model | Status |
|-----|-------|---------|-------|--------|
| DeepSeek (priority) | claudeds | DEEPSEEK_API_KEY | deepseek-v4-pro | CFG |
| Z.ai / GLM | claudeglm | ZAI_API_KEY | glm-5.2 | CFG |
| Qwen | claudeqwen | DASHSCOPE_API_KEY | — | not CFG |
| MiniMax | claudeminimax | MINIMAX_API_KEY | — | not CFG |
| OpenRouter | claudeor | OPENROUTER_API_KEY | — | not CFG |

## How to Use
Run `claudeds` — sets env vars + launches Claude (recommended default).
Return to Anthropic: new terminal → `claude`.
```

</instructions>
