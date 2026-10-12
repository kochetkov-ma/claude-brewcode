# Brewcode Plugin - Installation Guide

## Quick Installation

```bash
claude plugin marketplace add https://github.com/kochetkov-ma/claude-brewcode
claude plugin install brewcode@claude-brewcode
```

In a running session: `/reload-plugins`.

## Quick Reference

| Action | Command |
|--------|---------|
| **Install** | `claude plugin install brewcode@claude-brewcode` |
| **Uninstall** | `claude plugin uninstall brewcode@claude-brewcode` |
| **Update** | `claude plugin marketplace update claude-brewcode && claude plugin update brewcode@claude-brewcode` |
| **Session only** | `claude --plugin-dir ./brewcode` |
| Add marketplace | `claude plugin marketplace add <GitHub URL or local clone root>` |
| List plugins / verify install | `claude plugin list` (add `--json` for machine-readable output) |

---

## 1. Local Development (without installation)

Run the plugin directly from source.

```bash
# From project root
claude --plugin-dir ./brewcode

# Absolute path
claude --plugin-dir /path/to/claude-brewcode/brewcode

# Multiple plugins
claude --plugin-dir ./brewcode --plugin-dir ./brewtools
```

**Pros:** loads in place, no build step; edits apply on `/reload-plugins`
**Cons:** path must be specified each time

---

## 2. Installation from a Local Clone

The repository root already holds `.claude-plugin/marketplace.json` (marketplace `claude-brewcode`, plugin source `./brewcode`). A marketplace added from a local path loads relative-path plugins in place, no cache copy.

```bash
claude plugin marketplace add /path/to/claude-brewcode
claude plugin install brewcode@claude-brewcode
claude plugin list

# After a pull
claude plugin marketplace update claude-brewcode

# Remove
claude plugin uninstall brewcode@claude-brewcode
claude plugin marketplace remove claude-brewcode
```

---

## 3. Enabling for a Project

Commit to the project's `.claude/settings.json` to register the marketplace and enable the plugin for everyone who clones the repository:

```json
{
  "extraKnownMarketplaces": {
    "claude-brewcode": { "source": { "source": "github", "repo": "kochetkov-ma/claude-brewcode" } }
  },
  "enabledPlugins": { "brewcode@claude-brewcode": true }
}
```

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| Plugin not found | Check path and presence of `.claude-plugin/plugin.json` |
| Skills not showing | Type `/brewcode:` to list them; run `/reload-plugins` after an install or update |
| Invalid input | Run `claude plugin validate <path>` |

**Validation before installation:**
```bash
claude plugin validate ./brewcode
```

**Debug mode:**
```bash
claude --debug --plugin-dir ./brewcode   # log: ~/.claude/debug/<session-id>.txt
```

**Common plugin.json errors:**
- `repository: Invalid input` — must be a string, not an object
- `agents: Invalid input` — list `.md` files, not a directory (`agents/` is auto-discovered)
- `Unrecognized key` — remove unsupported fields

---

## See Also

| Document | Description |
|----------|-------------|
| [README.md](README.md) | Plugin overview and commands |
| [commands.md](docs/commands.md) | Skills and agents reference |
