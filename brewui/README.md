# Brewui

> UI/visual/creative tools plugin for Claude Code -- placeholder, currently empty but installable.

| Field | Value |
|-------|-------|
| Version | 3.18.0 |
| Skills | 0 |

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

Brewui is a placeholder plugin for future UI/visual/creative tools. It currently ships no skills or agents, but installs cleanly and registers its hooks so it can be wired into your suite ahead of time. Content will be added in a future release.

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

## Skills

No skills yet -- coming soon. Brewui is an empty placeholder; the `/brewui:*` command namespace is reserved for future tools.

## Architecture

```
brewui/
├── .claude-plugin/
│   └── plugin.json              # Plugin manifest
├── hooks/
│   ├── hooks.json               # Hook registry
│   ├── session-start.mjs        # BU_PLUGIN_ROOT injection
│   ├── pre-task.mjs             # BU_PLUGIN_ROOT into subagents
│   └── lib/utils.mjs            # I/O utilities
├── skills/                      # Empty -- placeholder for future tools
└── README.md
```

## Documentation

Full docs: [doc-claude.brewcode.app/brewui/overview](https://doc-claude.brewcode.app/brewui/overview/)

| Resource | Link |
|----------|------|
| Release Notes | [RELEASE-NOTES.md](../RELEASE-NOTES.md) |

Author: Maksim Kochetkov | License: MIT
