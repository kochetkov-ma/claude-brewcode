# Z.ai / ZhipuAI (GLM)

## Connection
| Field | Value |
|-------|-------|
| Endpoint | `https://api.z.ai/api/anthropic` |
| Auth env var | `ANTHROPIC_AUTH_TOKEN` |
| Key source env | `ZAI_API_KEY` |
| Pay model | Pay-per-token, no subscription |

## Auth Note
Bearer `ANTHROPIC_AUTH_TOKEN`, empty `ANTHROPIC_API_KEY`; x-api-key also works. [Claude integration](https://docs.z.ai/devpack/tool/claude), checked 2026-10-12: same base/Bearer setup; its example maps roles to `glm-5.3[1m]` / `glm-5.3-flash[1m]`. Keep `glm-5.2`; GLM-5.3 is a maintainer `update` decision.

## Configured Model / Direct Snapshot — 2026-10-12
| Field | Value |
|-------|-------|
| Model ID | `glm-5.2` |
| Context | 1M |
| Input $/1M | $1.40 |
| Output $/1M | $4.40 |
| Cached input $/1M | $0.26 |
| SWE-bench Pro | 62.1% (self-reported, as of 2026-09-30; not re-verified) |

USD/1M: [direct pricing](https://docs.z.ai/guides/overview/pricing) (GLM-5.3: same rates). Context/benchmark: provider's [GLM-5.2 announcement](https://z.ai/blog/glm-5.2). OpenRouter prices differ.

## Compatibility Flags (REQUIRED)
- `CLAUDE_ENABLE_BYTE_WATCHDOG=0` — disables byte-level streaming watchdog
- `CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS=1` — strips beta headers that Z.ai rejects with error 1210

## Alias
```bash
alias claudeglm='export ANTHROPIC_BASE_URL=https://api.z.ai/api/anthropic; export ANTHROPIC_AUTH_TOKEN="$ZAI_API_KEY"; export ANTHROPIC_API_KEY=""; export ANTHROPIC_DEFAULT_OPUS_MODEL=glm-5.2; export ANTHROPIC_DEFAULT_SONNET_MODEL=glm-5.2; export ANTHROPIC_DEFAULT_HAIKU_MODEL=glm-5.2; export ANTHROPIC_DEFAULT_FABLE_MODEL=glm-5.2; export CLAUDE_ENABLE_BYTE_WATCHDOG=0; export CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS=1; claude'
```

## Dashboard
https://z.ai/subscribe (English console, API keys, billing)
