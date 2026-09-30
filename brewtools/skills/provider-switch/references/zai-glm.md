# Z.ai / ZhipuAI (GLM)

## Connection
| Field | Value |
|-------|-------|
| Endpoint | `https://api.z.ai/api/anthropic` |
| Auth env var | `ANTHROPIC_AUTH_TOKEN` |
| Key source env | `ZAI_API_KEY` |
| Pay model | Pay-per-token, no subscription needed |

## Auth Note
Bearer `ANTHROPIC_AUTH_TOKEN`, explicit empty `ANTHROPIC_API_KEY`; x-api-key also supported. [Claude integration](https://docs.z.ai/devpack/tool/claude), checked 2026-09-30, confirms base/Bearer setup. Preserve `glm-5.2`; newer-model docs do not authorize migration.

## Configured Model / Direct Snapshot — 2026-09-30
| Field | Value |
|-------|-------|
| Model ID | `glm-5.2` |
| Context | 1M |
| Input $/1M | $1.40 |
| Output $/1M | $4.40 |
| Cached input $/1M | $0.26 |
| SWE-bench Pro | 62.1% (self-reported) |

USD per 1M from [direct pricing](https://docs.z.ai/guides/overview/pricing), checked 2026-09-30. Context/benchmark are the provider's [GLM-5.2 announcement](https://z.ai/blog/glm-5.2) claims, not a local benchmark. OpenRouter route prices differ.

Same model for all three Claude Code roles (opus/sonnet/haiku).

## Compatibility Flags (REQUIRED)
- `CLAUDE_ENABLE_BYTE_WATCHDOG=0` — disables byte-level streaming watchdog
- `CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS=1` — strips beta headers that Z.ai rejects with error 1210

## Alias
```bash
alias claudeglm='export ANTHROPIC_BASE_URL=https://api.z.ai/api/anthropic; export ANTHROPIC_AUTH_TOKEN="$ZAI_API_KEY"; export ANTHROPIC_API_KEY=""; export ANTHROPIC_DEFAULT_OPUS_MODEL=glm-5.2; export ANTHROPIC_DEFAULT_SONNET_MODEL=glm-5.2; export ANTHROPIC_DEFAULT_HAIKU_MODEL=glm-5.2; export CLAUDE_ENABLE_BYTE_WATCHDOG=0; export CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS=1; claude'
```

## Dashboard
https://z.ai/subscribe (English console, API keys, billing)
