# Common — Provider Switch

## Environment Variables

Claude Code 2.1.296 (`env-vars`, `model-config` docs):

| Variable | Purpose |
|----------|---------|
| `ANTHROPIC_BASE_URL` | API endpoint (replaces api.anthropic.com) |
| `ANTHROPIC_API_KEY` | Sent as `X-Api-Key`; when set it overrides a logged-in subscription |
| `ANTHROPIC_AUTH_TOKEN` | Sent as `Authorization: Bearer <value>` |
| `ANTHROPIC_DEFAULT_OPUS_MODEL`, `ANTHROPIC_DEFAULT_SONNET_MODEL`, `ANTHROPIC_DEFAULT_HAIKU_MODEL`, `ANTHROPIC_DEFAULT_FABLE_MODEL` | Model each alias (`opus`, `sonnet`, `haiku`, `fable`) resolves to; haiku also runs background tasks |

## Unified Alias Template

Every alias shares this auth/model core; the provider's compatibility flags (its reference) go before `claude`.

```text
alias claude<name>='export ANTHROPIC_BASE_URL=<endpoint>; export ANTHROPIC_AUTH_TOKEN="$<KEY_VAR>"; export ANTHROPIC_API_KEY=""; export ANTHROPIC_DEFAULT_OPUS_MODEL=<model>; export ANTHROPIC_DEFAULT_SONNET_MODEL=<model>; export ANTHROPIC_DEFAULT_HAIKU_MODEL=<model>; export ANTHROPIC_DEFAULT_FABLE_MODEL=<model>; <provider flags if required>; claude'
```

| Part | Value | Why |
|------|-------|-----|
| `ANTHROPIC_AUTH_TOKEN` | `"$KEY_VAR"` | Bearer auth; the key stays one value |
| `ANTHROPIC_API_KEY` | `""` | Empty, not `unset`: an exported Anthropic key never reaches the provider |
| Model vars | Same top model for all 4 | No role splitting; a subagent pinned to any alias stays on the provider |

Model ids/keys are data, never interpolated into shell/Python source: aliases come only from the main skill's writer. Preserve configured models on reference refresh.

## Returning to Anthropic Subscription

Alias exports persist in that shell only. New terminal + plain `claude` = ordinary Anthropic login; never infer a subscription tier or billing state.

## .zshrc Structure

```bash
# ========== Claude Code Provider Aliases ==========
# Managed by brewtools:provider-switch — do not edit manually

# API Keys
export DEEPSEEK_API_KEY="sk-..."
export ZAI_API_KEY="..."
export DASHSCOPE_API_KEY="..."
export MINIMAX_API_KEY="..."
export OPENROUTER_API_KEY="sk-or-v1-..."

# Provider Aliases (auth/model core + provider compatibility flags)
alias claudeds='export ANTHROPIC_BASE_URL=https://api.deepseek.com/anthropic; export ANTHROPIC_AUTH_TOKEN="$DEEPSEEK_API_KEY"; export ANTHROPIC_API_KEY=""; export ANTHROPIC_DEFAULT_OPUS_MODEL=deepseek-v4-pro; export ANTHROPIC_DEFAULT_SONNET_MODEL=deepseek-v4-pro; export ANTHROPIC_DEFAULT_HAIKU_MODEL=deepseek-v4-pro; export ANTHROPIC_DEFAULT_FABLE_MODEL=deepseek-v4-pro; claude'
alias claudeglm='export ANTHROPIC_BASE_URL=https://api.z.ai/api/anthropic; export ANTHROPIC_AUTH_TOKEN="$ZAI_API_KEY"; export ANTHROPIC_API_KEY=""; export ANTHROPIC_DEFAULT_OPUS_MODEL=glm-5.2; export ANTHROPIC_DEFAULT_SONNET_MODEL=glm-5.2; export ANTHROPIC_DEFAULT_HAIKU_MODEL=glm-5.2; export ANTHROPIC_DEFAULT_FABLE_MODEL=glm-5.2; export CLAUDE_ENABLE_BYTE_WATCHDOG=0; export CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS=1; claude'
alias claudeqwen='export ANTHROPIC_BASE_URL=https://dashscope-intl.aliyuncs.com/apps/anthropic; export ANTHROPIC_AUTH_TOKEN="$DASHSCOPE_API_KEY"; export ANTHROPIC_API_KEY=""; export ANTHROPIC_DEFAULT_OPUS_MODEL="qwen3.7-plus[1m]"; export ANTHROPIC_DEFAULT_SONNET_MODEL="qwen3.7-plus[1m]"; export ANTHROPIC_DEFAULT_HAIKU_MODEL="qwen3.7-plus[1m]"; export ANTHROPIC_DEFAULT_FABLE_MODEL="qwen3.7-plus[1m]"; export CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS=1; claude'
# Remaining providers use their own reference; DashScope example retains the legacy endpoint.

# ========== End Claude Code Provider Aliases ==========
```

