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

ALL provider aliases MUST follow this exact pattern — no exceptions:

```bash
alias claude<name>='export ANTHROPIC_BASE_URL=<endpoint>; export ANTHROPIC_AUTH_TOKEN=$<KEY_VAR>; export ANTHROPIC_API_KEY=""; export ANTHROPIC_DEFAULT_OPUS_MODEL=<model>; export ANTHROPIC_DEFAULT_SONNET_MODEL=<model>; export ANTHROPIC_DEFAULT_HAIKU_MODEL=<model>; claude'
```

| Part | Value | Why |
|------|-------|-----|
| `ANTHROPIC_AUTH_TOKEN` | `$KEY_VAR` | Bearer auth — works with ALL providers |
| `ANTHROPIC_API_KEY` | `""` (empty string) | Prevents OAuth fallback. NOT `unset` — empty string is deterministic |
| Model vars | Same model for all 3 | One model per provider, no role splitting |

## Returning to Anthropic Subscription

No special alias needed. Env vars set by provider aliases only persist in the current shell session. To return to Anthropic:

**Open a new terminal and run `claude` normally** — it will use your Max subscription via OAuth.

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

# Provider Aliases (unified: AUTH_TOKEN + API_KEY="" + 3 model vars + claude)
alias claudeds='export ANTHROPIC_BASE_URL=https://api.deepseek.com/anthropic; export ANTHROPIC_AUTH_TOKEN=$DEEPSEEK_API_KEY; export ANTHROPIC_API_KEY=""; export ANTHROPIC_DEFAULT_OPUS_MODEL=deepseek-v4-pro; export ANTHROPIC_DEFAULT_SONNET_MODEL=deepseek-v4-pro; export ANTHROPIC_DEFAULT_HAIKU_MODEL=deepseek-v4-pro; claude'
alias claudeglm='export ANTHROPIC_BASE_URL=https://api.z.ai/api/anthropic; export ANTHROPIC_AUTH_TOKEN=$ZAI_API_KEY; export ANTHROPIC_API_KEY=""; export ANTHROPIC_DEFAULT_OPUS_MODEL=glm-5.1; export ANTHROPIC_DEFAULT_SONNET_MODEL=glm-5.1; export ANTHROPIC_DEFAULT_HAIKU_MODEL=glm-5.1; claude'
alias claudeqwen='export ANTHROPIC_BASE_URL=https://dashscope-intl.aliyuncs.com/apps/anthropic; export ANTHROPIC_AUTH_TOKEN=$DASHSCOPE_API_KEY; export ANTHROPIC_API_KEY=""; export ANTHROPIC_DEFAULT_OPUS_MODEL="qwen3.6-plus[1m]"; export ANTHROPIC_DEFAULT_SONNET_MODEL="qwen3.6-plus[1m]"; export ANTHROPIC_DEFAULT_HAIKU_MODEL="qwen3.6-plus[1m]"; claude'
# ... etc (same pattern for all providers)

# ========== End Claude Code Provider Aliases ==========
```

## Usage Pattern
1. Run provider alias: `claudeglm` — sets env vars and launches Claude in one command
2. When done, close the terminal
3. Next time: run `claude` normally = Anthropic subscription, or run alias = provider
