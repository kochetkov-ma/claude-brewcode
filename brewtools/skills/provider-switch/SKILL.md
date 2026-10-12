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

> Claude Code alt API providers, each an isolated ALIAS in ~/.zshrc: DeepSeek V4 (priority default, 1M ctx, native Anthropic endpoint; recommend first), Z.ai/GLM, Qwen/DashScope, MiniMax, OpenRouter.

## Prompt contract

`$ARGUMENTS` is one free-form RU/EN prompt; mode tokens and flags may sit anywhere in it.

1. Mode: an explicit mode token wins outright; else the most distinct whole-word keyword hits
   (mode table in P1 below). Tie with a destructive mode -> `AskUserQuestion`; with `status` ->
   `status`; of two mutating modes -> the keyword that comes first. No hit or empty -> `status`.
2. Scope: prose that is not a mode/provider name is still input: take the provider or scope from it.
3. Ask: at most ONE `AskUserQuestion` (max 4 questions) to resolve mode and scope, before any work, only when the answer
   changes what gets written. `status` itself is read-only and asks nothing.

Print once, before the first action (labels literal, values in the conversation language):

```
PLAN — brewtools:provider-switch
INPUT:  <arguments verbatim, or "(empty)">
MODE:   <resolved> — <explicit | matched keyword: X | default>
SCOPE:  <resolved paths / target / level / flags>
DO:     <2-5 imperative bullets>
RESULT: <what the user ends up holding>
```

<instructions>

## Robustness Rules (MANDATORY)

| Rule | Scope |
|------|-------|
| Every Bash call: `&& echo "OK ..." \|\| echo "FAILED ..."` | ALL |
| On FAILED: stop phase, report error, !=retry blindly | ALL |
| Max 3 AUQ per phase | ALL |
| !=write secrets anywhere except ~/.zshrc | ALL |
| !=ask for, receive, repeat or compose a key value (no AUQ, prompt or Bash line with it): the user places it out of band, `scripts/read-secret.sh` moves it. CC 2.1.296 has no masked input: AUQ answers land in the transcript; `sensitive` `userConfig` never reaches skill content | ALL |
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

Read-only modes: conversation language, no question. Mutating modes, language unresolved only: "Select language / Выберите язык" | "English (Recommended)", "Russian / Русский"; skipped → English for the session.

---

## P1: Mode Detection

EXEC (quoted heredoc: quotes, backticks and `$(` in the prompt stay inert text):
```bash
IFS= read -r -d '' ARGS <<'__SKILL_ARGS__' || true
$ARGUMENTS
__SKILL_ARGS__
ARGS=${ARGS%$'\n'}
bash "${CLAUDE_SKILL_DIR}/scripts/detect-mode.sh" "$ARGS" && echo "OK detect" || echo "FAILED detect"
```
> FAILED → report it and match the prompt against the table by hand; never retry blindly.

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

PLAN goes before any P0 question or P1/P2 call; DO for read-only modes = "probe state, report"; install names the intended PRV scope, resolved in P3 before P4's first write.

---

## P2: Status Check (ALL modes)

EXEC:
```bash
bash "${CLAUDE_SKILL_DIR}/scripts/check-status.sh" && echo "OK status" || echo "FAILED status"
```
> STOP if FAILED — report the secret-free error; never print raw ~/.zshrc/key assignments into context.

Per PRV: `configured` = ALIAS + KEY true; `partial` = ALIAS true, KEY false;
`not configured` = ALIAS false; `active` = ACTIVE_PROVIDER matches. Render:
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

`status` is TERMINAL — it never writes and never falls through to install, whatever it finds: an empty or
unparseable prompt resolves to `status` and is no request to mutate ~/.zshrc. Zero CFG → every row
`not configured`, then print exactly:

```
No providers configured yet. To configure one, run:
  /brewtools:provider-switch install
```

and STOP; >=1 CFG → STOP too.

Routes: `help` → P6, `verify` → P7, `model-check` → P8, `update` → P9; only `install`/`provider-<name>` → P3.

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

---

## P4: PRV Configuration

For each selected PRV:

### Step 1: Load REF
Read PRV REF file: DeepSeek=`REF/deepseek.md` | Z.ai/GLM=`REF/zai-glm.md` | Qwen=`REF/qwen-dashscope.md` | MiniMax=`REF/minimax.md` | OpenRouter=`REF/openrouter.md`; first PRV also `REF/common.md`.

### Step 2: Init Section
EXEC:
```bash
bash "${CLAUDE_SKILL_DIR}/scripts/write-alias.sh" init && echo "OK init" || echo "FAILED init"
```
> STOP if FAILED — cannot write ~/.zshrc.

### Step 3: API Key — out of band, NEVER through the conversation
P2 `KEY_DEEPSEEK`/`KEY_ZAI`/`KEY_DASHSCOPE`/`KEY_MINIMAX`/`KEY_OPENROUTER` already `true` for this PRV → skip; !=re-ask, !=rewrite the key.
Missing → never ask for it (Robustness Rules). Print the two options VERBATIM, placeholder intact, and STOP
until the user confirms the value is in place; !=substitute a real value or run a command containing one:

```
Option A (recommended) — write it to a private file, then tell me "done":
  umask 077; printf '%s' '<your-key>' > ~/.claude-PRV.key

Option B — export it, then RESTART Claude Code from that same shell:
  export KEY_VAR_NAME='<your-key>'
  # then: exit Claude Code and relaunch it from this shell
```

Option B works only if exported BEFORE the session launched: each Bash call spawns a fresh shell from the
profile, so a later `export` is invisible. Prefer A.

KEY_VAR_NAME: `DEEPSEEK_API_KEY` | `ZAI_API_KEY` | `DASHSCOPE_API_KEY` | `MINIMAX_API_KEY` | `OPENROUTER_API_KEY`

Qwen: first `REF/qwen-dashscope.md` ## How to Get API Key (key matches region, workspace, billing product).
Never infer region/validity from prefix or length; `BYTES` is only a transport sanity check.

Then EXEC exactly one, matching the user's option:
```bash
bash "${CLAUDE_SKILL_DIR}/scripts/read-secret.sh" "file:$HOME/.claude-PRV.key" "KEY_VAR_NAME" && echo "OK set-key" || echo "FAILED set-key"
```
```bash
bash "${CLAUDE_SKILL_DIR}/scripts/read-secret.sh" "env:KEY_VAR_NAME" "KEY_VAR_NAME" && echo "OK set-key" || echo "FAILED set-key"
```
`env:` reports unset → the session predates the export: relaunch from that shell or use Option A; !=ask for the value.
Output is only `SOURCE=/DEST=/BYTES=/FINGERPRINT=` (value goes to `write-alias.sh set-key` on stdin).
> STOP if FAILED — report the script's own message; it is already secret-free.

### Step 4: Model Selection (OpenRouter only)
Read `REF/openrouter-models.md` and follow its Model Validation + Selection Flow on a fresh catalog.
Validate EVERY selection (menu/default/custom); `NOT_FOUND` → suggestions + re-ask, max 2 retries, then stop with
no model write. Keep existing models unless the user selects a change; never append `[1m]` automatically.

### Step 5: ALIAS Name
AUQ: "Alias name for <PRV>:" | options: "<default> (Recommended)", "Custom". Custom must start with `claude`,
lowercase alphanumeric only. Defaults: DeepSeek `claudeds`, Z.ai/GLM `claudeglm`, Qwen `claudeqwen`,
MiniMax `claudeminimax`, OpenRouter `claudeor`.

### Step 6: Write ALIAS
User text travels only as JSON (structured Write) read by fixed scripts, never in Bash source, not even quoted.
Needs Python 3; stop if absent.
```bash
(umask 077; mkdir -p .claude/provider-switch) && echo "OK request-dir" || echo "FAILED request-dir"
```
> STOP if FAILED.
Existing alias: Write `.claude/provider-switch/selection-request.json` (`alias_name`, `provider`), then run the
read-only inspector (no keys in its output):
```bash
python3 "${CLAUDE_SKILL_DIR}/scripts/provider-alias.py" --inspect .claude/provider-switch/selection-request.json && echo "OK inspect-alias" || echo "FAILED inspect-alias"
```
> STOP if FAILED; the alias stays unchanged. FOUND → carry `model_id` and `base_url` forward unless the user
> selects changes. ABSENT → reference defaults, new install only.
Write `.claude/provider-switch/alias-request.json`: `alias_name`, `provider` (`deepseek|glm|qwen|minimax|openrouter`),
`model_id` (explicit selection or current config), `base_url` (existing endpoint on update; omit for a new alias
to take the reference default; change only on explicit selection of a documented Qwen region/product). No keys,
no raw alias body. The writer rejects shell metacharacters/control characters and adds auth, all role vars and
compatibility flags. EXEC:
```bash
bash "${CLAUDE_SKILL_DIR}/scripts/write-alias.sh" set-alias --request .claude/provider-switch/alias-request.json && echo "OK set-alias" || echo "FAILED set-alias"
```
> STOP if FAILED — !=continue to next PRV.
Then Write the same validated, secret-free request to `.claude/provider-switch/requests/<provider>.json` (fixed
enum above; one record per selected provider, never overwrite another's). Recording fails → report the alias
write and the verification gap, stop; never claim the configured endpoint/model was verified.

### Step 7: Verify
EXEC (zsh parses the file, so a Linux Bash tool shell is no false failure):
```bash
zsh -fc 'source ~/.zshrc >/dev/null 2>&1; whence -w ALIAS_NAME' && echo "OK verify" || echo "FAILED verify"
```
> STOP if FAILED — ALIAS not written correctly.

---

## P5: Verification + Final Status

EXEC:
```bash
bash "${CLAUDE_SKILL_DIR}/scripts/check-status.sh" && echo "OK final-status" || echo "FAILED final-status"
```
Render the P2 table, then token-test each just-CFG PRV from its retained request record. EXEC:
```bash
bash "${CLAUDE_SKILL_DIR}/scripts/verify-providers.sh" all --requests .claude/provider-switch/requests && echo "OK verify" || echo "FAILED verify"
```
Add a `Token Test` (pass/fail) column; any `fail` → warn, suggest checking API key or endpoint. Read output as
in P7; `PROBE_SOURCE=selected-request` = selected endpoint/model probed (`[1m]` kept as `REQUESTED_CLIENT_MODEL`,
stripped only from the API model id).

---

## P6: Help Mode

Read `REF/common.md`, then explain:

| Topic | Detail |
|-------|--------|
| Switch / return | Run ALIAS (e.g. `claudeglm`): sets env vars + launches `claude`, one PRV at a time; new terminal → plain `claude` (env vars live in that shell only) |
| Context [1m] hack | `[1m]` makes Claude Code assume 1M for an unrecognized model id (alternative: `CLAUDE_CODE_MAX_CONTEXT_TOKENS`) |
| Auth (all PRVs) | ANTHROPIC_AUTH_TOKEN (Bearer). ANTHROPIC_API_KEY="" (empty, !=unset) so an exported Anthropic key never reaches the PRV; OpenRouter's guide requires it |
| Roles | One model for opus/sonnet/haiku/fable: subagents pinned to any alias stay on the PRV |
| Compat flags | per PRV REF `## Compatibility Flags` (Z.ai, MiniMax, Qwen); the writer adds them |
| Dashboards | DeepSeek: platform.deepseek.com; Z.ai: z.ai/subscribe; Qwen: bailian.console.alibabacloud.com; MiniMax: platform.minimax.io; OpenRouter: openrouter.ai |

---

## P7: Verify Mode

EXEC:
```bash
bash "${CLAUDE_SKILL_DIR}/scripts/verify-providers.sh" all && echo "OK verify" || echo "FAILED verify"
```
Per PRV parse KEY_SET, HTTP_CODE, RESPONSE, STATUS, `PROBE_SOURCE`, `PROBE_URL`, `PROBE_MODEL`; surface `PROBE_NOTE` and model-mismatch warnings separately. An invalid request record = `fail`, no fallback.

| Script output | Meaning |
|---|---|
| `pass` | HTTP 200 AND a `.content[].type=="text"` block with a whole-word `OK`; a bare 200 (HTML page, `{}`, wrapped error) is not |
| `RESPONSE=jq not installed` | `jq` missing: every provider reports `fail` |
| `PROBE_SOURCE=legacy-default` | default token probe only, never configured-alias verification |
| `MODEL=` + `WARNING=model mismatch: requested X, answered Y` | echoed another id; still `pass` (aggregators normalise ids): a warning, never a failure |

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
| 200 + `no assistant text block` | proxy/HTML page or empty JSON, not a real completion | check BASE URL in the PRV REF file |
| pass + `WARNING=model mismatch` | PRV normalised or substituted the model id — not a failure | confirm with `model-check`; update the REF file (P9) only if the PRV really changed the id |
| 400 naming `output_config.format` / structured outputs | gateway rejects structured outputs | add `CLAUDE_CODE_DISABLE_STRUCTURED_OUTPUTS=1` (CC >= 2.1.288), narrower than `CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS=1` |

---

## P8: Model Check Mode

Identifies the model answering this ALIAS-launched session via 5 questions, no curl/scripts. BASE not set → print and stop:
```
This mode only works inside a provider session.
Run a PRV ALIAS first (e.g. `claudeglm`), then invoke `/brewtools:provider-switch model-check`.
```

### Step 1: Detect Active PRV
EXEC:
```bash
echo "BASE_URL=${ANTHROPIC_BASE_URL:-not_set}" && echo "OPUS_MODEL=${ANTHROPIC_DEFAULT_OPUS_MODEL:-not_set}" && echo "OK detect-provider" || echo "FAILED detect-provider"
```
BASE_URL → PRV: `api.deepseek.com`=DeepSeek | `api.z.ai`=Z.ai/GLM | documented DashScope or regional `maas.aliyuncs.com/apps/anthropic` endpoint=Qwen | `minimax`=MiniMax | `openrouter`=OpenRouter

### Step 2: Ask 5 Diagnostic Questions
Send as one block:
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
Show only table + verdict, not the questions.

Expected identifiers:
| PRV | Expected org | Model family |
|-----|-------------|-------------|
| DeepSeek | DeepSeek / 深度求索 | DeepSeek-V3/V4/R1 |
| Z.ai/GLM | Zhipu AI / ZhipuAI / 智谱 | GLM-4/5 / ChatGLM |
| Qwen | Alibaba / Alibaba Cloud / 阿里 / Tongyi | Qwen/2/3 / 通义千问 |
| MiniMax | MiniMax / 稀宇科技 | MiniMax / abab / M2 / M3 |
| OpenRouter | per the model in MOD env var | per the model in MOD env var |

---

## P9: Update (hidden, maintainer-only)

Runs only for MODE=update.

### Step 1: Load Protocol
Read `REF/update-protocol.md`: per-PRV official sources + update flow.

### Step 2: Spawn PRV Research Agents (ONE message, 5 Agent calls)
One agent per PRV (DeepSeek, Z.ai/GLM, Qwen/DashScope, MiniMax, OpenRouter), protocol's Official Sources; ~<=5 files, ~<=10 steps each; !=hand all five to one agent (serial fetches, blurred evidence).

Every spawn brief carries six labeled fields, since a subagent starts with an empty context: GOAL (task + why), ROLE (owns, must not touch), SCOPE (paths/commands in and out), CONTEXT (done, by whom, in parallel), CONSUMER (who uses the result + its shape), DONE (acceptance + return: verdict first, evidence, bounded; long output to a file, path returned).

Shape for agent 2, verbatim pattern for the other four:
```
Agent(subagent_type="general-purpose", prompt="
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

### Step 3: Aggregate + Diff
Per PRV: model IDs, pricing, new models, endpoint URL, ctx windows.

### Step 4: Present Changes
```
## Update Results
| PRV | Field | Current | Fetched | Action |
|-----|-------|---------|---------|--------|
| Z.ai | opus model | glm-5.2 | glm-6.0 | UPDATE |
| MiniMax | (no changes) | — | — | SKIP |
```

### Step 5: Apply Updates
Only maintainer-approved rows: edit REF files per the field mapping in `REF/update-protocol.md` (ALIAS bodies on a model change, `openrouter-models.md` on a recommendation change, `common.md` on an env var change).

### Step 6: Live Test (optional, if API keys in env)
Key travels as a curl `-K` config on stdin, never argv (world-readable via `ps`), as in `scripts/verify-providers.sh`. EXEC:
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

</instructions>
