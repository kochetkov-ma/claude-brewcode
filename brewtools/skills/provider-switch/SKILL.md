---
name: provider-switch
description: "Configure alt API providers: DeepSeek, Z.ai/GLM, Qwen, MiniMax, OpenRouter. Triggers: switch provider, openrouter."
user-invocable: true
disable-model-invocation: true
argument-hint: "[prompt] [status|install|verify|model-check|help|<provider-name>] — no args/empty prompt = read-only status, never an install"
allowed-tools: [Read, Write, Edit, Bash, Agent, AskUserQuestion, Glob, Grep]
model: opus
---

[DICT: P=Phase, PRV=provider, EXEC=EXECUTE using Bash tool, AUQ=AskUserQuestion, REF=references, ALIAS=shell alias, CFG=configured, BASE=ANTHROPIC_BASE_URL, MOD=ANTHROPIC_DEFAULT_OPUS_MODEL]

# Provider Switch

> Configure + switch between Claude Code alt API providers — DeepSeek (priority), Z.ai/GLM, Qwen/DashScope, MiniMax, OpenRouter. Creates isolated ALIAS in ~/.zshrc.
> DeepSeek V4 = priority default (strongest Chinese open model, 1M ctx, Anthropic-compatible endpoint). Recommend first.

## Prompt contract

Position 1 of `$ARGUMENTS` is a **free-form prompt** (RU/EN) — modes and flags are optional and may
follow in any order. Nobody types keys: resolve mode + scope FROM the prompt.

1. Strip flags. An explicit mode token anywhere wins outright, no scoring.
2. Else score modes by distinct whole-word keyword hits (mode table in P1 below). Highest unique
   score wins. Tie with a destructive mode -> `AskUserQuestion`; tie with `status` -> `status`;
   tie of two mutating modes -> the keyword appearing first; all zero -> `status`.
3. Empty arguments -> `status`; ask ONE scoping `AskUserQuestion` only when the answer changes
   what gets written. `status` itself is read-only and asks nothing.
4. Outcome-changing ambiguity -> ONE `AskUserQuestion` (max 4 questions) BEFORE any work.
5. Prose that is not a mode/provider name is still input: extract the provider or scope from it.

Then print this block ONCE, before the first action:

```
PLAN — brewtools:provider-switch
INPUT:  <arguments verbatim, or "(empty)">
MODE:   <resolved> — <explicit | matched keyword: X | default>
SCOPE:  <resolved paths / target / level / flags>
DO:     <2-5 imperative bullets>
RESULT: <what the user ends up holding>
```

Labels are literal; values follow the conversation language.

<instructions>

## Robustness Rules (MANDATORY)

| Rule | Scope |
|------|-------|
| Every Bash call: `&& echo "OK ..." \|\| echo "FAILED ..."` | ALL |
| On FAILED: stop phase, report error, !=retry blindly | ALL |
| Max 3 AUQ per phase | ALL |
| !=write secrets anywhere except ~/.zshrc | ALL |
| !=ask for, receive, repeat or compose a key value — no AUQ, no prompt, no Bash line containing it. The user places it out of band, `scripts/read-secret.sh` moves it. CC 2.1.233 has NO masked runtime input | ALL |
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

| Mode | EN keywords | RU keywords | Mutates? |
|------|-------------|-------------|----------|
| `status` | *(empty)*, status, check | статус, проверь | no |
| `install` | install, configure | настрой, установи, поставь | yes |
| `help` | help, how | помощь, как | no |
| `provider-deepseek` | deepseek, ds, dpsk | дипсик | yes |
| `provider-glm` | glm, zai, z.ai | глм, зай | yes |
| `provider-qwen` | qwen, dashscope | квен, дашскоуп | yes |
| `provider-minimax` | minimax, mini | минимакс | yes |
| `provider-openrouter` | openrouter, router | опенроутер, роутер | yes |
| `verify` | verify, test, token | проверка, тест, токен | no |
| `model-check` | model-check, identify | проверь модель, идентифицируй | no |

Typos (`model-cehck`, `cehck`, `hlpe`, `instal`, ...) fuzzy-match to the closest row above.

Prompt contract PLAN block: read-only modes (`status`, `help`, `verify`, `model-check`) print it
right before their report (P2/P6/P7/P8). `install` prints it once P3 provider selection is
finalized; `provider-<name>` prints it immediately (scope already known) — both before P4 Step 2's
first write.

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

If MODE=status: print the Prompt contract PLAN block now, before the table below.

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

`status` is TERMINAL — it never writes and never falls through to install, whatever it finds.
Zero CFG → render the table with every row `not configured`, then print exactly:

```
No providers configured yet. To configure one, run:
  /brewtools:provider-switch install
```

and STOP. >=1 CFG → STOP here too. Installing takes an explicit `install` or `provider-<name>` mode,
because an empty prompt and every unparseable prompt both resolve to `status` (see P1) and neither is
a request to mutate ~/.zshrc.

If MODE=help → GOTO P6.

---

## P3: PRV Selection

If MODE=install (no specific PRV): AUQ options:
- "DeepSeek V4 (deepseek-v4-pro, 1M ctx, priority - Recommended)"
- "Z.ai / GLM (glm-5.2, free models available)"
- "Qwen / DashScope (qwen3.7-plus, 1M ctx)"
- "MiniMax (MiniMax-M3, cheapest)"
- "OpenRouter (aggregator, any model)"
- "All providers"

If MODE=provider-\<name\> → skip to P4 for that PRV only.

Print the Prompt contract PLAN block now — scope (selected PRV(s)) is finalized either way,
before P4 Step 2's first write.

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

### Step 3: API Key — out of band, NEVER through the conversation
Check if key set (from P2: KEY_DEEPSEEK, KEY_ZAI, KEY_DASHSCOPE, KEY_MINIMAX, KEY_OPENROUTER).
If already `true` for this PRV → SKIP this step, !=re-ask, !=rewrite the key.

If missing: **do NOT ask for it.** No AUQ, no "paste your key", no Bash line carrying the value.
Claude Code 2.1.233 has no masked runtime input — `AskUserQuestion` returns plain text straight into
the transcript, and plugin `userConfig` `sensitive: true` is enable-time only and is deliberately NOT
substituted into skill content. Anything the user types at the model is a leaked credential.

Print the two options VERBATIM, placeholder intact, and STOP until the user confirms the value is in
place. !=substitute a real value into either line, !=run a command containing one:

```
Option A (recommended) — write it to a private file, then tell me "done":
  umask 077; printf '%s' '<your-key>' > ~/.claude-PRV.key

Option B — export it, then RESTART Claude Code from that same shell:
  export KEY_VAR_NAME='<your-key>'
  # then: exit Claude Code and relaunch it from this shell
```

Option A works immediately. Option B does NOT: every Bash tool call spawns a fresh shell from your
profile, so an `export` typed in some other terminal — or in this one after Claude Code started — is
invisible to it. The variable is only visible if it was exported BEFORE the session launched, which is
why B requires a relaunch. Put it in `~/.zshrc` if you want it to survive. Prefer A when in doubt.

KEY_VAR_NAME: `DEEPSEEK_API_KEY` | `ZAI_API_KEY` | `DASHSCOPE_API_KEY` | `MINIMAX_API_KEY` | `OPENROUTER_API_KEY`

Qwen-specific: read `REF/qwen-dashscope.md` ## How to Get API Key first and show the steps. Warn: key
MUST be from the Singapore region — other regions return 403. Valid fmt: `sk-...` (~40 chars). The
model never sees the key, so it cannot validate the format itself — state the rule and let
`read-secret.sh` report `BYTES` for a sanity check (`sk-ws-` prefix or >100 chars = wrong region).

Then EXEC exactly one, matching the option the user chose — A first:
```bash
bash "${CLAUDE_SKILL_DIR}/scripts/read-secret.sh" "file:$HOME/.claude-PRV.key" "KEY_VAR_NAME" && echo "OK set-key" || echo "FAILED set-key"
```
```bash
bash "${CLAUDE_SKILL_DIR}/scripts/read-secret.sh" "env:KEY_VAR_NAME" "KEY_VAR_NAME" && echo "OK set-key" || echo "FAILED set-key"
```
If the `env:` form reports the variable unset, the session predates the export: tell the user to
relaunch Claude Code from that shell, or switch to Option A. !=ask them to paste the value.
`read-secret.sh` reads the value, pipes it to `write-alias.sh set-key` on stdin and prints only
`SOURCE=/DEST=/BYTES=/FINGERPRINT=` — the value itself never reaches stdout, stderr or your context.
It refuses a file that is group/world readable and leaves `~/.zshrc` mode 600.
> STOP if FAILED — report the script's own message; it is already secret-free.

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

Print the Prompt contract PLAN block now, before explaining.

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

Print the Prompt contract PLAN block now, before the report below.

EXEC:
```bash
bash "${CLAUDE_SKILL_DIR}/scripts/verify-providers.sh" all && echo "OK verify" || echo "FAILED verify"
```
Parse: KEY_SET, HTTP_CODE, RESPONSE, STATUS per PRV.

`pass` requires BOTH: HTTP 200 AND a `.content[].type=="text"` block whose text contains a whole-word
`OK`. A bare 200 is NOT a pass — an HTML error page, `{}` or a 200-wrapped provider error all return
200. `jq` is required; without it every provider reports `fail` with `RESPONSE=jq not installed`.

`MODEL=` reports the id the provider echoed. If it differs from the one requested the script emits a
`WARNING=model mismatch: requested X, answered Y` and STILL passes — aggregators and providers that
normalise model ids would otherwise fail a perfectly working key. Surface the warning in the table,
never as a failure.

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
| 200 + `no assistant text block` | proxy/HTML page or empty JSON, not a real completion | check BASE URL in the PRV REF file |
| pass + `WARNING=model mismatch` | PRV normalised or substituted the model id — not a failure | confirm with `model-check`; update the REF file (P9) only if the PRV really changed the id |

---

## P8: Model Check Mode

Print the Prompt contract PLAN block now, before the verdict below.

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

#### Delegation

A big task handed to one agent = an agent gone for an hour: you cannot observe it, cannot correct it, and it usually drifts off-target. One subagent = ONE bounded unit — ONE provider, ~<=5 files, ~<=10 steps. !=hand all five providers to one agent; bigger MUST be split into N tasks, all spawned in ONE message.

Every spawn prompt MUST carry:

| Field | Content |
|-------|---------|
| GOAL | the overall task and why it exists — the point beyond the file edit |
| ROLE | what this agent owns; what it must NOT touch |
| SCOPE | exact paths/commands in bounds + explicit out-of-bounds |
| CONTEXT | what is already done, by whom, what runs in parallel — trimmed to what THIS agent needs |
| CONSUMER | who or what uses the result next, and the shape it must fit |
| DONE | acceptance criteria + the exact report shape you want back |

Shape for agent 2, verbatim pattern for the other four:
```
Task(subagent_type="general-purpose", prompt="
GOAL: refreshing this skill's provider reference files so users get current model ids,
  pricing and endpoints; you cover Z.ai/GLM only, four sibling agents cover the others.
ROLE: research + report. Do NOT edit any file — the skill applies changes in Step 5.
SCOPE: in — docs.z.ai, open.bigmodel.cn/en via WebFetch/WebSearch. Out — other providers,
  ~/.zshrc, any reference file on disk.
CONTEXT: references/zai-glm.md on disk currently records model glm-5.2, alias claudeglm,
  Anthropic-compatible endpoint https://api.z.ai/api/anthropic — that is your baseline to
  diff against. Four sibling agents fetch DeepSeek, Qwen, MiniMax and OpenRouter right now;
  nothing has been written to disk yet.
CONSUMER: Step 3 diffs your table against the reference file and Step 4 shows the diff to
  the user, who approves each UPDATE before Step 5 writes it. An omitted field reads as
  'unknown' and blocks the whole provider's update.
DONE: table | Field | Current | Fetched | Source URL | for model ids, pricing, endpoint,
  context window. Say 'no change' explicitly per field rather than omitting it.
")
```

A bare one-line task is never enough. Each agent: WebFetch/WebSearch sources from protocol, extract current model list + pricing + endpoint changes.

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
The key goes to curl through a `-K` config on STDIN, exactly as `scripts/verify-providers.sh` does it —
argv is world-readable via `ps`, stdin is not. `\` and `"` inside the value are escaped for curl's own
config parser. EXEC:
```bash
printf 'header = "x-api-key: %s"\n' "$(printf '%s' "${ZAI_API_KEY:-missing}" | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g')" \
  | curl -s -K - -o /dev/null -w "%{http_code}" -X POST "https://api.z.ai/api/anthropic/v1/messages" -H "content-type: application/json" -H "anthropic-version: 2023-06-01" -d '{"model":"glm-5.2","max_tokens":5,"messages":[{"role":"user","content":"ping"}]}' && echo " OK" || echo " FAILED"
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
