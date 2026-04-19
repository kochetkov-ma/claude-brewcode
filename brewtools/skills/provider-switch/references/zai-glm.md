---
auto-sync: enabled
auto-sync-date: 2026-04-12
auto-sync-type: doc
auto-sync-override: |
  sources: https://docs.z.ai/guides/overview/pricing, https://open.bigmodel.cn/en/dev/api
  focus: model IDs, pricing per 1M tokens, context window, endpoint URL
  preserve: ## Alias, ## Dashboard
---

# Z.ai / ZhipuAI (GLM)

## Connection
| Field | Value |
|-------|-------|
| Endpoint | `https://api.z.ai/api/anthropic` |
| Auth env var | `ANTHROPIC_AUTH_TOKEN` |
| Key source env | `ZAI_API_KEY` |
| Pay model | Pay-per-token, no subscription needed |

## Auth Note
Z.ai supports both `x-api-key` and Bearer token auth. Uses `ANTHROPIC_AUTH_TOKEN` (unified with other providers). Must set `ANTHROPIC_API_KEY=""` to prevent OAuth fallback.

## Model
| Field | Value |
|-------|-------|
| Model ID | `glm-5.1` |
| Context | 200K |
| Input $/1M | $1.40 |
| Output $/1M | $4.40 |
| SWE-bench Pro | 58.4% (#1) |

Same model for all three Claude Code roles (opus/sonnet/haiku).

## Compatibility Flags (REQUIRED)
- `CLAUDE_ENABLE_BYTE_WATCHDOG=0` — disables byte-level streaming watchdog
- `CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS=1` — strips beta headers that Z.ai rejects with error 1210

## Alias
```bash
alias claudeglm='export ANTHROPIC_BASE_URL=https://api.z.ai/api/anthropic; export ANTHROPIC_AUTH_TOKEN=$ZAI_API_KEY; export ANTHROPIC_API_KEY=""; export ANTHROPIC_DEFAULT_OPUS_MODEL=glm-5.1; export ANTHROPIC_DEFAULT_SONNET_MODEL=glm-5.1; export ANTHROPIC_DEFAULT_HAIKU_MODEL=glm-5.1; export CLAUDE_ENABLE_BYTE_WATCHDOG=0; export CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS=1; claude'
```

## Dashboard
https://z.ai/subscribe (English console, API keys, billing)
