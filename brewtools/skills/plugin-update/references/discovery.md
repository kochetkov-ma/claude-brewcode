# Plugin Discovery

## Primary — `claude plugin list` (CC 2.1.163+)

**EXECUTE**:
```bash
unset CLAUDECODE && claude plugin list --json
```

### JSON fields (one object per installation)

| Field | Type | Notes |
|-------|------|-------|
| `id` | string | `<plugin>@<marketplace>`; `@inline` session-only, `@skills-dir`, `@synced` (claude.ai) |
| `version` | string | `"unknown"` only for a non-marketplace plugin whose manifest declares none |
| `scope` | string | `user`, `project`, `local`, `managed`; `session` / `synced` for non-marketplace origins |
| `enabled` | boolean | Enabled in merged settings |
| `installPath` | string | Directory the plugin loads from (`<plugins root>/cache/...` for a copied install) |
| `installedAt` | string | ISO 8601 timestamp; marketplace installs only |
| `lastUpdated` | string | ISO 8601 timestamp; marketplace installs only |
| `projectPath` | string | `project` / `local` scope only |
| `mcpServers` | object | Optional — present only if plugin registers MCP servers |
| `errors` / `notes` | string[] | Load errors / warnings, when present |

Fall back to `scripts/discover-plugins.sh` when `claude plugin list` is not recognized (CC < 2.1.163),
exits non-zero, or prints invalid JSON. A valid empty array `[]` is an empty inventory, not a failure.

## Fallback — `scripts/discover-plugins.sh` (filesystem scan)

| Source | Path | Parser |
|--------|------|--------|
| Global settings | `<config dir>/settings.json` -> `enabledPlugins` | `jq` |
| Project settings | `./.claude/settings.json` -> `enabledPlugins` (if exists) | `jq` |
| Plugin cache | `<plugins root>/cache/<marketplace>/<plugin>/<version>/.claude-plugin/plugin.json` | walk + parse `version` field |
| Marketplaces | top-level dirs of `<plugins root>/cache` | dir names |

`<config dir>` = `CLAUDE_CONFIG_DIR`, unset = `~/.claude`. `<plugins root>` = `CLAUDE_CODE_PLUGIN_CACHE_DIR`
(it names the plugins root, not the cache), else `<config dir>/plugins`.

### enabledPlugins Format

```json
{
  "enabledPlugins": {
    "brewcode@claude-brewcode": true,
    "brewdoc@claude-brewcode": true
  }
}
```

Keys are `<plugin>@<marketplace>`. Truthy value means enabled.

### Cache Walk

The highest `<version>` directory per plugin under `<plugins root>/cache/<marketplace>/<plugin>/` is taken as installed; the cache can still hold older versions.

### Output JSON

```json
{
  "marketplaces": ["claude-brewcode"],
  "enabledPlugins": ["brewcode@claude-brewcode", "brewdoc@claude-brewcode"],
  "installed": {
    "brewcode": {"version": "3.4.51", "marketplace": "claude-brewcode"},
    "brewdoc":  {"version": "3.4.51", "marketplace": "claude-brewcode"}
  },
  "cache_dir": "/Users/x/.claude/plugins/cache"
}
```
