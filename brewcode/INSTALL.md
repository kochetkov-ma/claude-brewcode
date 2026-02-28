# Brewcode Plugin - Installation Guide

## Quick Installation

```bash
claude plugin marketplace add /path/to/claude-brewcode/plugins
claude plugin install brewcode@claude-brewcode
```

## Quick Reference

| Action | Command |
|--------|---------|
| **Install** | `claude plugin install brewcode@claude-brewcode` |
| **Uninstall** | `claude plugin uninstall brewcode` |
| **Update** | `claude plugin update brewcode` |
| **Session only** | `claude --plugin-dir ./brewcode` |
| Add marketplace | `claude plugin marketplace add <repo-path>` |
| List plugins | `claude plugin list` |

---

## 1. Local Development (without installation)

Run the plugin directly from source.

```bash
# From project root
claude --plugin-dir ./brewcode

# Absolute path
claude --plugin-dir /path/to/claude-brewcode/brewcode

# Multiple plugins
claude --plugin-dir ./brewcode --plugin-dir ./plugins/other
```

**Pros:** changes apply instantly, no rebuild needed for skills/agents
**Cons:** path must be specified each time

---

## 2. Runtime Build

Required step before any installation.

```bash
cd brewcode/runtime
npm install
npm run build
```

**Verification:**
```bash
ls dist/
# Should contain: index.js, config.js, context-monitor.js, etc.
```

---

## 3. Installation via Local Marketplace

Claude Code requires plugin installation through a marketplace. Create a local marketplace for development.

### 3.1 Marketplace Manifest

Create `.claude-plugin/marketplace.json` in the repository root:

```json
{
  "$schema": "https://anthropic.com/claude-code/marketplace.schema.json",
  "name": "my-local-plugins",
  "description": "Local plugins for development",
  "owner": {
    "name": "Your Name"
  },
  "plugins": [
    {
      "name": "brewcode",
      "description": "Infinite task execution with automatic handoff",
      "author": { "name": "Your Name" },
      "source": "./brewcode",
      "category": "productivity"
    }
  ]
}
```

### 3.2 Adding the Marketplace

```bash
# Add local marketplace (absolute path)
claude plugin marketplace add /path/to/your/repo

# Verify
claude plugin marketplace list
```

### 3.3 Installing the Plugin

```bash
# Install from marketplace
claude plugin install brewcode@my-local-plugins

# Verify
claude plugin list
```

### 3.4 Updating After Changes

```bash
# Update marketplace index
claude plugin marketplace update my-local-plugins

# Update plugin
claude plugin update brewcode@my-local-plugins
```

### 3.5 Uninstallation

```bash
claude plugin uninstall brewcode@my-local-plugins

# Remove marketplace
claude plugin marketplace remove my-local-plugins
```

---

## 4. Embedding in a Project

Plugin inside a specific project.

### 4.1 Structure

```
my-project/
├── .claude/
│   └── plugins/
│       └── brewcode/    # Plugin here
└── src/
```

### 4.2 settings.json

```json
{
  "plugins": [
    { "type": "local", "path": "brewcode" }
  ]
}
```

### 4.3 Auto-loading

The plugin loads automatically when opening the project in Claude Code.

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| Plugin not found | Check path and presence of `.claude-plugin/plugin.json` |
| Skills not showing | Run `/help`, verify `user-invocable: true` |
| Runtime error | Rebuild: `cd runtime && npm run build` |
| Permission denied | Check permissions: `chmod -R 755 plugins/` |
| SDK not found | Run `npm install` in runtime directory |
| Invalid input | Run `claude plugin validate <path>` |

**Validation before installation:**
```bash
claude plugin validate ./brewcode
```

**Debug mode:**
```bash
CLAUDE_DEBUG=1 claude --plugin-dir ./brewcode
```

**Common plugin.json errors:**
- `repository: Invalid input` — must be a string, not an object
- `agents: Invalid input` — agents field not supported (use skills)
- `Unrecognized key` — remove unsupported fields

---

## See Also

| Document | Description |
|----------|-------------|
| [README.md](README.md) | Plugin overview and commands |
| [grepai.md](docs/grepai.md) | Semantic search integration |
| [/brewcode:install](skills/install/SKILL.md) | Prerequisites installation skill |
