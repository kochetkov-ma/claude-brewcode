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
Uses `ANTHROPIC_AUTH_TOKEN` (bearer-style). Must set `ANTHROPIC_API_KEY=""` (empty string, NOT unset) to prevent Anthropic OAuth fallback.

## Region Requirement
**CRITICAL:** The Anthropic-compatible endpoint (`dashscope-intl.aliyuncs.com/apps/anthropic`) works ONLY with API keys created in the **Singapore** region. Keys from Frankfurt (eu-central-1), US Virginia, or other regions return 403. When asking user for API key, warn: select **Singapore** region in Model Studio console first. Standard key format: `sk-...` (~40 chars). If key starts with `sk-ws-` or is >100 chars — likely wrong region.

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

## Compatibility Flags
- `CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS=1` — strips beta headers that DashScope may reject

## Alias
```bash
alias claudeqwen='export ANTHROPIC_BASE_URL=https://dashscope-intl.aliyuncs.com/apps/anthropic; export ANTHROPIC_AUTH_TOKEN=$DASHSCOPE_API_KEY; export ANTHROPIC_API_KEY=""; export ANTHROPIC_DEFAULT_OPUS_MODEL="qwen3.6-plus[1m]"; export ANTHROPIC_DEFAULT_SONNET_MODEL="qwen3.6-plus[1m]"; export ANTHROPIC_DEFAULT_HAIKU_MODEL="qwen3.6-plus[1m]"; export CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS=1; claude'
```

## How to Get API Key

1. Open https://modelstudio.console.alibabacloud.com/ap-southeast-1?tab=dashboard#/api-key (direct link to Singapore region)
2. Verify region is **Singapore (ap-southeast-1)** in top-right corner — other regions (Frankfurt, Virginia) do NOT support the Anthropic endpoint
3. Click **Create API Key** → select Owner Account → OK
4. Copy the key immediately (shown only once)

Valid key: starts with `sk-`, ~36 characters (e.g., `sk-1e88...80df`). If you see `sk-ws-` or a 200+ char key — wrong region.

## Dashboard
https://modelstudio.console.alibabacloud.com/ap-southeast-1?tab=dashboard#/api-key (Singapore region — API keys, billing)
