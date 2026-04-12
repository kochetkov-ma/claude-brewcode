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

## Model
| Field | Value |
|-------|-------|
| Model ID | `qwen3.6-plus[1m]` |
| Context | 1M |
| Input $/1M | ~$0.50 |
| Output $/1M | ~$2.00 |
| SWE-bench Pro | 56.6% |

Same model for all three Claude Code roles (opus/sonnet/haiku).

Note: `[1m]` suffix is REQUIRED — Claude Code defaults to 200K context otherwise (GitHub issue #40753).

## Alias
```bash
alias claudeqwen='export ANTHROPIC_BASE_URL=https://dashscope-intl.aliyuncs.com/apps/anthropic; export ANTHROPIC_AUTH_TOKEN=$DASHSCOPE_API_KEY; unset ANTHROPIC_API_KEY; export ANTHROPIC_DEFAULT_OPUS_MODEL="qwen3.6-plus[1m]"; export ANTHROPIC_DEFAULT_SONNET_MODEL="qwen3.6-plus[1m]"; export ANTHROPIC_DEFAULT_HAIKU_MODEL="qwen3.6-plus[1m]"; claude'
```

## Dashboard
https://bailian.console.alibabacloud.com (international console, API keys, billing)
