# Brewui

> UI/visual/creative tools plugin for Claude Code -- AI image generation, design-to-code conversion.

| Field | Value |
|-------|-------|
| Version | 3.4.42 |
| Skills | 1 |

## Install

Paste this into a Claude Code session:

```
Execute these commands in this session, one by one, show full output for each, do not skip any:

1. claude plugin marketplace add https://github.com/kochetkov-ma/claude-brewcode
2. claude plugin install brewui@claude-brewcode

After install, run `/reload-plugins` (or `exit` + `claude`).
```

<details>
<summary>Or install the whole suite</summary>

```
Execute these commands in this Claude Code session, one by one, show full output for each, do not skip any, do not summarize:

1. claude plugin marketplace add https://github.com/kochetkov-ma/claude-brewcode
2. claude plugin install brewcode@claude-brewcode
3. claude plugin install brewdoc@claude-brewcode
4. claude plugin install brewtools@claude-brewcode
5. claude plugin install brewui@claude-brewcode

After all commands succeed, run `/reload-plugins`. If `/reload-plugins` is unavailable, tell me to type `exit` and run `claude` again. Run the commands now.
```
</details>

Update anytime with `/brewtools:plugin-update`.

## Overview

Brewui provides visual and creative tools for Claude Code: AI image generation via multiple providers (Gemini Imagen 4, OpenRouter, Z.ai CogView-4, OpenAI DALL-E 3) with anti-AI-slop controls, and future design-to-code conversion tools. Each skill is self-contained.

## Installation

```bash
# Marketplace (recommended)
claude plugin marketplace add https://github.com/kochetkov-ma/claude-brewcode
claude plugin install brewui@claude-brewcode

# Already installed? Update
claude plugin marketplace update claude-brewcode
claude plugin update brewui@claude-brewcode

# Dev mode (no install)
claude --plugin-dir ./brewui
```

## Quick Start

```bash
/brewui:image-gen "a cozy coffee shop at sunset"          # Generate (default)
/brewui:image-gen --edit photo.png "add warm lighting"    # Edit existing
/brewui:image-gen --config                                 # Configure API keys
/brewui:image-gen --style illustration "tech blog header" # Illustration style
/brewui:image-gen --service openrouter "mountain lake"    # Specific provider
```

## Skills

| Skill | Purpose | Model | Arguments |
|-------|---------|-------|-----------|
| [`/brewui:image-gen`](skills/image-gen/SKILL.md) | AI image generation via 5 providers | haiku | `[prompt] [--edit] [--config] [--update] [--service] [--style] [--count] [--output] [--size]` |

## Architecture

```
brewui/
├── .claude-plugin/
│   └── plugin.json              # Plugin manifest
├── hooks/
│   ├── hooks.json               # Hook registry
│   ├── session-start.mjs        # BU_PLUGIN_ROOT injection
│   └── lib/utils.mjs            # I/O utilities
├── skills/
│   └── image-gen/               # AI image generation
│       ├── SKILL.md
│       ├── references/          # Provider specs, anti-slop, modes
│       ├── scripts/             # API request, parsing, saving
│       └── tests/               # Integration tests
└── README.md
```

## Documentation

Full docs: [doc-claude.brewcode.app/brewui/overview](https://doc-claude.brewcode.app/brewui/overview/)

| Resource | Link |
|----------|------|
| Image Gen | [image-gen](https://doc-claude.brewcode.app/brewui/skills/image-gen/) |
| Release Notes | [RELEASE-NOTES.md](../RELEASE-NOTES.md) |

Author: Maksim Kochetkov | License: MIT
