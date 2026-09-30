# Common — Provider Switch

## Environment Variables

Claude Code uses these env vars to connect to alternative providers:

| Variable | Purpose |
|----------|---------|
| `ANTHROPIC_BASE_URL` | API endpoint (replaces api.anthropic.com) |
| `ANTHROPIC_API_KEY` | API key sent as x-api-key header |
| `ANTHROPIC_AUTH_TOKEN` | Bearer token (alternative to API key) |
| `ANTHROPIC_DEFAULT_OPUS_MODEL` | Model ID for opus role |
| `ANTHROPIC_DEFAULT_SONNET_MODEL` | Model ID for sonnet role |
| `ANTHROPIC_DEFAULT_HAIKU_MODEL` | Model ID for haiku role |

## Unified Alias Template

All provider aliases share this auth/model core; append the provider-specific compatibility flags from its reference before `claude`. Those flags are required exceptions to a byte-identical alias body, not exceptions to the auth/model rules.

```bash
alias claude<name>='export ANTHROPIC_BASE_URL=<endpoint>; export ANTHROPIC_AUTH_TOKEN="$<KEY_VAR>"; export ANTHROPIC_API_KEY=""; export ANTHROPIC_DEFAULT_OPUS_MODEL=<model>; export ANTHROPIC_DEFAULT_SONNET_MODEL=<model>; export ANTHROPIC_DEFAULT_HAIKU_MODEL=<model>; <provider flags if required>; claude'
```

| Part | Value | Why |
|------|-------|-----|
| `ANTHROPIC_AUTH_TOKEN` | `"$KEY_VAR"` | Repository Bearer-auth convention; preserve the key as one value |
| `ANTHROPIC_API_KEY` | `""` | Explicit empty override; do not substitute `unset` |
| Model vars | Same model for all 3 | One model per provider, no role splitting |

Raw model ids/keys are data, never interpolated into shell/Python source. Use the main skill's safe input/write flow; these templates document controlled values, not a user-text substitution mechanism. Preserve configured models on reference refresh.

## Returning to Anthropic Subscription

Provider alias exports persist in that shell session. Open a new terminal and run `claude` normally to use its ordinary Anthropic configuration/login; do not infer a subscription tier or billing state.

## .zshrc Structure

All provider config goes in a clearly marked section:

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
alias claudeds='export ANTHROPIC_BASE_URL=https://api.deepseek.com/anthropic; export ANTHROPIC_AUTH_TOKEN="$DEEPSEEK_API_KEY"; export ANTHROPIC_API_KEY=""; export ANTHROPIC_DEFAULT_OPUS_MODEL=deepseek-v4-pro; export ANTHROPIC_DEFAULT_SONNET_MODEL=deepseek-v4-pro; export ANTHROPIC_DEFAULT_HAIKU_MODEL=deepseek-v4-pro; claude'
alias claudeglm='export ANTHROPIC_BASE_URL=https://api.z.ai/api/anthropic; export ANTHROPIC_AUTH_TOKEN="$ZAI_API_KEY"; export ANTHROPIC_API_KEY=""; export ANTHROPIC_DEFAULT_OPUS_MODEL=glm-5.2; export ANTHROPIC_DEFAULT_SONNET_MODEL=glm-5.2; export ANTHROPIC_DEFAULT_HAIKU_MODEL=glm-5.2; export CLAUDE_ENABLE_BYTE_WATCHDOG=0; export CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS=1; claude'
alias claudeqwen='export ANTHROPIC_BASE_URL=https://dashscope-intl.aliyuncs.com/apps/anthropic; export ANTHROPIC_AUTH_TOKEN="$DASHSCOPE_API_KEY"; export ANTHROPIC_API_KEY=""; export ANTHROPIC_DEFAULT_OPUS_MODEL="qwen3.7-plus[1m]"; export ANTHROPIC_DEFAULT_SONNET_MODEL="qwen3.7-plus[1m]"; export ANTHROPIC_DEFAULT_HAIKU_MODEL="qwen3.7-plus[1m]"; export CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS=1; claude'
# Remaining providers use their own reference; DashScope example retains the legacy endpoint.

# ========== End Claude Code Provider Aliases ==========
```

Run a provider alias (e.g. `claudeglm`) to set its env and launch Claude. Close that terminal when done; next session, use ordinary `claude` or a provider alias.
