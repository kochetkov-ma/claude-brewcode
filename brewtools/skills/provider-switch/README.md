---
auto-sync: enabled
auto-sync-date: 2026-04-12
auto-sync-type: doc
---

# Provider Switch

Switch Claude Code from Anthropic Max to a pay-per-token API provider — Z.ai/GLM, Qwen/DashScope, MiniMax, or OpenRouter — without touching any config files manually. The skill creates isolated shell aliases in `~/.zshrc`, backs up existing content before any write, and guides key entry interactively.

## Quick Start

```bash
# Check which providers are configured
/brewtools:provider-switch

# Set up Z.ai/GLM interactively
/brewtools:provider-switch glm

# Set up all providers in one run
/brewtools:provider-switch setup

# See how switching works
/brewtools:provider-switch help
```

After setup, run `claudeglm` — it sets env vars and starts Claude in one command. To return to Anthropic, open a new terminal.

## Features

- Interactive language selection (English / Russian) at session start
- Reads current `~/.zshrc` state before any write — shows what is already configured
- Auto-starts setup when no provider is configured yet
- OpenRouter: pick one model for all roles, with validated custom ID input
- All writes go into a clearly marked section in `~/.zshrc`; backup created before first write
- Error reporting with `SCRIPT_ERROR / PHASE / ACTION / SUGGESTION` block on any failure

## Providers

| Provider | Alias | Model (all roles) | Auth var | Notes |
|----------|-------|-------------------|----------|-------|
| Z.ai / GLM | `claudeglm` | glm-5.1 | `ANTHROPIC_API_KEY` | #1 SWE-bench Pro, $1.40/$4.40 per 1M |
| Qwen / DashScope | `claudeqwen` | qwen3.6-plus[1m] | `ANTHROPIC_AUTH_TOKEN` | 1M context, ~$0.50/$2.00 per 1M |
| MiniMax | `claudeminimax` | minimax-m2.7 | `ANTHROPIC_AUTH_TOKEN` | Cheapest: $0.30/$1.20 per 1M |
| OpenRouter | `claudeor` | user-selected | `ANTHROPIC_AUTH_TOKEN` | Default: qwen/qwen3.6-plus[1m]. Custom IDs validated via API |

## Usage Modes

| Argument | Mode | What it does |
|----------|------|-------------|
| (none) | status | Shows provider table; auto-starts setup if nothing is configured |
| `setup` | setup | Interactive selection of one or more providers to configure |
| `glm` / `zai` / `z.ai` | provider-glm | Configure Z.ai/GLM only |
| `qwen` / `dashscope` | provider-qwen | Configure Qwen/DashScope only |
| `minimax` / `mini` | provider-minimax | Configure MiniMax only |
| `openrouter` / `router` | provider-openrouter | Configure OpenRouter + model selection |
| `help` / `how` | help | Explains how aliases work, env vars, and dashboards |

## How Switching Works

Each alias sets six environment variables and launches `claude` — one command, no separate steps. Env vars only persist in the current shell session. To return to Anthropic, open a new terminal and run `claude` normally.

| Variable | Purpose |
|----------|---------|
| `ANTHROPIC_BASE_URL` | Points to the provider's API endpoint |
| `ANTHROPIC_API_KEY` | API key (Z.ai) or `""` (OpenRouter) |
| `ANTHROPIC_AUTH_TOKEN` | Bearer token (Qwen, MiniMax, OpenRouter) |
| `ANTHROPIC_DEFAULT_OPUS_MODEL` | Model ID for opus-class tasks |
| `ANTHROPIC_DEFAULT_SONNET_MODEL` | Model ID for sonnet-class tasks |
| `ANTHROPIC_DEFAULT_HAIKU_MODEL` | Model ID for haiku-class tasks |

## Files

```
brewtools/skills/provider-switch/
├── SKILL.md                         # Skill definition and phases
├── scripts/
│   ├── detect-mode.sh               # Parses $ARGUMENTS → MODE
│   ├── check-status.sh              # Reads ~/.zshrc, outputs key=value status
│   └── write-alias.sh               # init / set-key / set-alias subcommands
└── references/
    ├── common.md                    # Env var reference, ~/.zshrc structure
    ├── zai-glm.md                   # Z.ai alias body and dashboard URL
    ├── qwen-dashscope.md            # Qwen alias body and dashboard URL
    ├── minimax.md                   # MiniMax alias body and dashboard URL
    ├── openrouter.md                # OpenRouter alias body and dashboard URL
    └── openrouter-models.md         # Model presets for OpenRouter picker
```

## Provider Dashboards

| Provider | Dashboard |
|----------|-----------|
| Z.ai / GLM | https://z.ai/subscribe |
| Qwen / DashScope | https://bailian.console.alibabacloud.com |
| MiniMax | https://platform.minimax.io |
| OpenRouter | https://openrouter.ai |

## Documentation

Full docs: [provider-switch](https://doc-claude.brewcode.app/brewtools/skills/provider-switch/)

---

Author: Maksim Kochetkov | License: MIT
