# Brewui

> UI/visual/creative tools plugin for Claude Code -- placeholder, currently empty but installable.

| Field | Value |
|-------|-------|
| Version | 6.9.5 |
| Skills | 0 |

## Install

Paste this into a Claude Code session:

```
Execute these commands in this session, one by one, show full output for each, do not skip any:

1. claude plugin marketplace add https://github.com/kochetkov-ma/claude-brewcode
2. claude plugin install brewui@claude-brewcode

After install, run `/reload-plugins` (or `exit` + `claude`).
```

Update anytime with `/brewtools:plugin-update`, or by hand:

```bash
claude plugin marketplace update claude-brewcode
claude plugin update brewui@claude-brewcode
claude --plugin-dir ./brewui   # dev mode, no install
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

## Overview

Placeholder for future UI/visual/creative tools: no skills, agents, or hooks yet. The `/brewui:*` namespace is reserved. Layout: `.claude-plugin/plugin.json`, empty `skills/`, `README.md`.

## Claude Code mods

Brewcode mods live in separate plugins: [overview](https://doc-claude.brewcode.app/mods/overview/), [placeholders](https://doc-claude.brewcode.app/mods/placeholders/), [plan-effort](https://doc-claude.brewcode.app/mods/plan-effort/).

```bash
claude plugin install brewmod-placeholders@claude-brewcode
```

## Documentation

[doc-claude.brewcode.app/brewui/overview](https://doc-claude.brewcode.app/brewui/overview/) | [RELEASE-NOTES.md](../RELEASE-NOTES.md)

Author: Maksim Kochetkov | License: MIT
