---
auto-sync: enabled
auto-sync-date: 2026-04-12
auto-sync-type: doc
auto-sync-override: |
  sources: https://docs.z.ai/guides/overview/pricing, https://open.bigmodel.cn/dev/api
  focus: model IDs, pricing per 1M tokens, context window, endpoint URL
  preserve: ## Alias, ## Dashboard
---

# Z.ai / ZhipuAI (GLM)

## Connection
| Field | Value |
|-------|-------|
| Endpoint | `https://api.z.ai/api/anthropic` |
| Auth env var | `ANTHROPIC_API_KEY` (NOT AUTH_TOKEN) |
| Key source env | `ZAI_API_KEY` |
| Pay model | Pay-per-token, no subscription needed |

## Auth Note
Z.ai uses `x-api-key` header. Claude Code sends this when `ANTHROPIC_API_KEY` is set. Do NOT use `ANTHROPIC_AUTH_TOKEN`.

## Models
| Role | Model ID | Context | Input $/1M | Output $/1M |
|------|----------|---------|-----------|------------|
| opus | glm-5.1 | 200K | $1.40 | $4.40 |
| sonnet | glm-4.7 | 200K | $0.60 | $2.20 |
| haiku | glm-4.5-air | 200K | $0.14 | $1.10 |

Free models (testing): glm-4.7-flash, glm-4.5-flash

## Alias
```bash
alias claude-glm='export ANTHROPIC_BASE_URL=https://api.z.ai/api/anthropic && export ANTHROPIC_API_KEY=$ZAI_API_KEY && unset ANTHROPIC_AUTH_TOKEN && export ANTHROPIC_DEFAULT_OPUS_MODEL=glm-5.1 && export ANTHROPIC_DEFAULT_SONNET_MODEL=glm-4.7 && export ANTHROPIC_DEFAULT_HAIKU_MODEL=glm-4.5-air'
```

## Dashboard
https://open.bigmodel.cn/ (account, billing, API keys)
