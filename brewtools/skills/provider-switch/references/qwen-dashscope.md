---
auto-sync: enabled
auto-sync-date: 2026-04-12
auto-sync-type: doc
auto-sync-override: |
  sources: https://www.alibabacloud.com/help/en/model-studio/claude-code, https://help.aliyun.com/zh/model-studio/getting-started/models
  focus: model IDs, pricing, context window, [1m] suffix applicability
  preserve: ## Alias, ## Dashboard, ## Auth Note
---

# Qwen / Alibaba DashScope

## Connection
| Field | Value |
|-------|-------|
| Endpoint | `https://dashscope-intl.aliyuncs.com/apps/anthropic` |
| Auth env var | `ANTHROPIC_AUTH_TOKEN` |
| Key source env | `DASHSCOPE_API_KEY` |
| Pay model | Pay-per-token |

## Auth Note
Uses `ANTHROPIC_AUTH_TOKEN` (bearer-style). Must unset `ANTHROPIC_API_KEY` to prevent Anthropic fallback.

## Models
| Role | Model ID | Context | Input $/1M | Output $/1M |
|------|----------|---------|-----------|------------|
| opus | qwen3.6-plus[1m] | 1M | ~$0.50 | ~$2.00 |
| sonnet | qwen3-coder-plus | 256K | $0.12 | $0.75 |
| haiku | qwen3-coder-next | 262K | cheap | cheap |

Note: `[1m]` suffix on qwen3.6-plus is REQUIRED — Claude Code defaults to 200K context otherwise. This is a workaround (GitHub issue #40753).

## Alias
```bash
alias claude-qwen='export ANTHROPIC_BASE_URL=https://dashscope-intl.aliyuncs.com/apps/anthropic && export ANTHROPIC_AUTH_TOKEN=$DASHSCOPE_API_KEY && unset ANTHROPIC_API_KEY && export ANTHROPIC_DEFAULT_OPUS_MODEL="qwen3.6-plus[1m]" && export ANTHROPIC_DEFAULT_SONNET_MODEL=qwen3-coder-plus && export ANTHROPIC_DEFAULT_HAIKU_MODEL=qwen3-coder-next'
```

## Dashboard
https://www.alibabacloud.com/product/dashscope (international)
