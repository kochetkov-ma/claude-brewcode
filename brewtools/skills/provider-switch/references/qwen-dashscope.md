# Qwen / Alibaba DashScope

## Connection
| Field | Value |
|-------|-------|
| Repository legacy endpoint | `https://dashscope-intl.aliyuncs.com/apps/anthropic` — retained, not revalidated with credentials |
| Auth env var | `ANTHROPIC_AUTH_TOKEN` |
| Key source env | `DASHSCOPE_API_KEY` |
| Pay model | Pay-per-token |

## Auth Note
Repository alias uses Bearer `ANTHROPIC_AUTH_TOKEN` and explicit `ANTHROPIC_API_KEY=""`, not unset. Preserve existing aliases; reference refresh does not authorize endpoint/key/model migration.

## Region Requirement
[Official Claude guide](https://www.alibabacloud.com/help/en/model-studio/claude-code), checked 2026-10-12: pay-as-you-go keys must match endpoint region and workspace; never claim Singapore-only support or infer region from key prefix/length.

| Pay-as-you-go region | Current documented endpoint shape |
|---------------------|-----------------------------------|
| Beijing | `https://{WorkspaceId}.cn-beijing.maas.aliyuncs.com/apps/anthropic` |
| Singapore | `https://{WorkspaceId}.ap-southeast-1.maas.aliyuncs.com/apps/anthropic` |
| Virginia | `https://{WorkspaceId}.us-east-1.maas.aliyuncs.com/apps/anthropic` |

Plan-specific endpoints/keys differ: Coding Plan `https://coding-intl.dashscope.aliyuncs.com/apps/anthropic` (accepted by the writer); Token Plan `https://token-plan.ap-southeast-1.maas.aliyuncs.com/apps/anthropic` (not accepted). Ask for region, workspace and billing product before proposing a change; never silently rewrite the legacy alias.

## Model
| Field | Value |
|-------|-------|
| Model ID | `qwen3.7-plus[1m]` |
| Context | 1M |
| Direct International list input/output, <=256K | $0.40 / $1.60 per 1M |
| Direct International list input/output, >256K to 1M | $1.20 / $4.80 per 1M |
| Historical benchmark claim | 56.6% SWE-bench Pro, provider-reported in the previous reference; not reverified 2026-09-30 |

[Direct pricing](https://www.alibabacloud.com/help/en/model-studio/model-pricing), checked 2026-10-12: `qwen3.7-plus` = `qwen3.7-plus-2026-05-26`; rates depend on deployment scope and input tier, currently with a limited-time 20% discount. List rates, not OpenRouter prices or account-specific billing.

1M context: the guide documents `[1m]` or `CLAUDE_CODE_MAX_CONTEXT_TOKENS=1000000` (default 200K). Preserve configured `qwen3.7-plus[1m]`; verify runtime support before proposing a context change.

## Compatibility Flags
- `CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS=1` — strips beta headers that DashScope may reject

## Alias
```bash
alias claudeqwen='export ANTHROPIC_BASE_URL=https://dashscope-intl.aliyuncs.com/apps/anthropic; export ANTHROPIC_AUTH_TOKEN="$DASHSCOPE_API_KEY"; export ANTHROPIC_API_KEY=""; export ANTHROPIC_DEFAULT_OPUS_MODEL="qwen3.7-plus[1m]"; export ANTHROPIC_DEFAULT_SONNET_MODEL="qwen3.7-plus[1m]"; export ANTHROPIC_DEFAULT_HAIKU_MODEL="qwen3.7-plus[1m]"; export ANTHROPIC_DEFAULT_FABLE_MODEL="qwen3.7-plus[1m]"; export CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS=1; claude'
```

## How to Get API Key

Open the Model Studio console for the selected region; Singapore console link below. Confirm region/workspace/product, create the correct product's API key under its owner account and securely copy it when shown. Never infer region from key shape or expose keys in source/argv/reports.

## Dashboard
https://modelstudio.console.alibabacloud.com/ap-southeast-1?tab=dashboard#/api-key (Singapore region — API keys, billing)
